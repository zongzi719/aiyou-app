import type { Message } from '@/components/Conversation';
import { getApiBaseUrl } from '@/lib/devApiConfig';
import { getAuthSession, getPrivateChatAuthHeaders } from '@/lib/authSession';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

export interface PrivateStreamHandlers {
  onAssistantText: (fullText: string) => void;
  onTitleDetected?: (title: string) => void;
  /** 流式期间 AI 正在调用工具时触发，传入可读的步骤描述 */
  onThinkingStep?: (step: string) => void;
  onError?: (msg: string) => void;
}

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  return undefined;
}

function detailFromHttpBody(status: number, text: string, json: unknown): string {
  const o = asRecord(json);
  const detail = o?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail.trim().slice(0, 400);
  const message = o?.message;
  if (typeof message === 'string' && message.trim()) return message.trim().slice(0, 400);
  const t = text.trim();
  if (t && t.length < 500) return t;
  return `HTTP ${status}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function postJson(path: string, body: unknown): Promise<{ status: number; json: unknown; text: string }> {
  const base = await getApiBaseUrl();
  const headers = await getPrivateChatAuthHeaders();
  const url = joinUrl(base, path);
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...headers, Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

async function getJson(path: string): Promise<{ status: number; json: unknown; text: string }> {
  const base = await getApiBaseUrl();
  const headers = await getPrivateChatAuthHeaders();
  const url = joinUrl(base, path);
  const res = await fetch(url, {
    method: 'GET',
    headers: { ...headers, Accept: 'application/json' },
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

export type ThreadSummary = {
  thread_id: string;
  title: string;
  updated_at?: string;
};

function unwrapThreadSearchRows(json: unknown): unknown[] | null {
  if (Array.isArray(json)) return json;
  const o = asRecord(json);
  if (!o) return null;
  for (const key of ['threads', 'data', 'items', 'results'] as const) {
    const v = o[key];
    if (Array.isArray(v)) return v;
  }
  return null;
}

/** POST /api/threads/search — 私人模式历史列表（按 user_id 过滤） */
export async function searchPrivateThreads(opts?: { limit?: number; offset?: number }): Promise<ThreadSummary[]> {
  const session = await getAuthSession();
  if (!session.userId) return [];
  const { status, json } = await postJson('/api/threads/search', {
    metadata: { user_id: session.userId },
    limit: opts?.limit ?? 50,
    offset: opts?.offset ?? 0,
  });
  if (status < 200 || status >= 300) return [];
  const rows = unwrapThreadSearchRows(json);
  if (!rows) return [];
  const out: ThreadSummary[] = [];
  for (const row of rows) {
    const o = asRecord(row);
    if (!o) continue;
    const tid = typeof o.thread_id === 'string' ? o.thread_id : '';
    if (!tid) continue;
    const meta = asRecord(o.metadata);
    if (meta?.is_decision_coach === 'true') continue;

    const values = asRecord(o.values);
    const title =
      (typeof values?.title === 'string' && values.title.trim()) ||
      (typeof meta?.title === 'string' && meta.title.trim()) ||
      '新对话';
    const updated_at = typeof o.updated_at === 'string' ? o.updated_at : undefined;
    out.push({ thread_id: tid, title, updated_at });
  }
  return out;
}

export async function createPrivateThread(title: string): Promise<string> {
  const session = await getAuthSession();
  if (!session.userId) throw new Error('缺少 user_id');
  const payload = {
    metadata: { user_id: session.userId, title: title.trim() || '新对话' },
  };

  const maxAttempts = 2;
  let lastStatus = 0;
  let lastText = '';
  let lastJson: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) await sleep(450);
    const { status, json, text } = await postJson('/api/threads', payload);
    lastStatus = status;
    lastText = text;
    lastJson = json;

    if (status >= 200 && status < 300 && json && typeof json === 'object') {
      const tid = (json as { thread_id?: string }).thread_id;
      if (tid && typeof tid === 'string') return tid;
      throw new Error('创建线程失败：响应无 thread_id');
    }

    const retryable = status === 502 || status === 503 || status === 504;
    if (retryable && attempt < maxAttempts - 1) continue;

    const hint =
      status === 502 || status === 503 || status === 504
        ? '（多为网关或上游聊天服务暂时不可用，请稍后重试或检查服务端）'
        : '';
    throw new Error(`创建线程失败 ${detailFromHttpBody(status, text, json)}${hint}`);
  }

  throw new Error(`创建线程失败 ${detailFromHttpBody(lastStatus, lastText, lastJson)}`);
}

const sessionRegisteredThreads = new Set<string>();

/** 同一 thread 在应用存活期内只注册一次，避免每条用户消息重复 POST */
export function registerPrivateSessionFireForget(threadId: string): void {
  if (sessionRegisteredThreads.has(threadId)) return;
  sessionRegisteredThreads.add(threadId);
  void (async () => {
    try {
      const s = await getAuthSession();
      if (!s.userId || !s.tenantId || !s.workspaceId) return;
      const { status } = await postJson('/api/sessions', {
        thread_id: threadId,
        user_id: s.userId,
        tenant_id: s.tenantId,
        workspace_id: s.workspaceId,
      });
      if (status < 200 || status >= 300) {
        sessionRegisteredThreads.delete(threadId);
      }
    } catch {
      sessionRegisteredThreads.delete(threadId);
    }
  })();
}

export interface UploadedFileInfo {
  /** AI 应读取的路径：DOCX/PDF 优先用 markdown_virtual_path，否则用 virtual_path */
  readPath: string;
  /** 原始文件的 virtual_path */
  virtualPath: string;
  filename: string;
}

/** 将文件上传到指定 thread 的 uploads 目录，返回上传结果列表 */
export async function uploadFilesToThread(
  threadId: string,
  files: Array<{ uri: string; name: string; mimeType: string }>,
): Promise<UploadedFileInfo[]> {
  const [base, headers] = await Promise.all([getApiBaseUrl(), getPrivateChatAuthHeaders()]);
  const url = `${base.replace(/\/$/, '')}/api/threads/${encodeURIComponent(threadId)}/uploads`;

  const formData = new FormData();

  // React Native 标准文件上传方式：直接传 { uri, name, type }，由 RN 原生网络层读取文件内容
  // 注意：base64 → dataURL → Blob 这条路在 iOS 上 Blob 序列化为 0 字节，不能用
  for (const f of files) {
    formData.append('files', { uri: f.uri, name: f.name, type: f.mimeType } as unknown as Blob);
  }

  // 移除 Content-Type，让 fetch 自动设置 multipart boundary
  const uploadHeaders: Record<string, string> = { ...headers };
  delete uploadHeaders['Content-Type'];

  const res = await fetch(url, { method: 'POST', headers: uploadHeaders, body: formData });
  const rawText = await res.text().catch(() => '');

  if (__DEV__) {
    console.log('[uploadFilesToThread] status:', res.status, 'body:', rawText.slice(0, 500));
  }

  if (!res.ok) {
    throw new Error(`文件上传失败 HTTP ${res.status}: ${rawText.slice(0, 200)}`);
  }

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    throw new Error(`文件上传响应解析失败: ${rawText.slice(0, 200)}`);
  }

  type RawFileEntry = {
    filename?: string;
    virtual_path?: string;
    markdown_virtual_path?: string;
  };

  const rawFiles = (Array.isArray(json.files) ? json.files : []) as RawFileEntry[];

  const result = rawFiles
    .filter((f) => f.virtual_path)
    .map((f) => ({
      // DOCX/PDF 服务器会自动转 markdown，优先用 markdown 路径供 AI 读取
      readPath: f.markdown_virtual_path ?? f.virtual_path!,
      virtualPath: f.virtual_path!,
      filename: f.filename ?? '',
    }));

  if (__DEV__) {
    console.log('[uploadFilesToThread] parsed files:', JSON.stringify(result));
    result.forEach((f) => {
      if (f.readPath === f.virtualPath) {
        console.warn(
          `[uploadFilesToThread] ⚠️ 服务端未返回 markdown_virtual_path，文件将以原始路径发给 AI（可能无法读取）: ${f.filename} → ${f.readPath}`,
        );
      }
    });
  }

  return result;
}

export function persistThreadTitleFireForget(threadId: string, title: string): void {
  void (async () => {
    try {
      const { status } = await postJson(`/api/threads/${encodeURIComponent(threadId)}/state`, {
        values: { title: title.trim() },
      });
      if (status < 200 || status >= 300) {
        /* ignore */
      }
    } catch {
      /* ignore */
    }
  })();
}

function extractNestedTitle(obj: unknown): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const stack: unknown[] = [obj];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== 'object') continue;
    for (const [k, v] of Object.entries(cur)) {
      if (k === 'title' && typeof v === 'string' && v.trim()) return v.trim();
      if (v && typeof v === 'object') stack.push(v);
    }
  }
  return undefined;
}

function normalizeAiContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    const o = content as Record<string, unknown>;
    if (typeof o.text === 'string') return o.text;
    if (o.type === 'text' && typeof o.text === 'string') return o.text;
  }
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && 'type' in part) {
        const p = part as { type?: string; text?: string };
        if (p.type === 'text' && typeof p.text === 'string') return p.text;
      }
      return '';
    })
    .join('');
}

/** 从 AI 消息对象中提取模型的 thinking/reasoning 内容（doubao-seed 等推理模型会输出此字段） */
function extractAiThinkingContent(msg: Record<string, unknown>): string {
  const kwargs = asRecord(msg.kwargs);
  const src = kwargs ?? msg;
  const addKwargs = asRecord(src.additional_kwargs);
  const respMeta = asRecord(src.response_metadata);
  const raw =
    addKwargs?.thinking_content ??
    addKwargs?.reasoning_content ??
    respMeta?.thinking_content ??
    respMeta?.reasoning_content ??
    '';
  return typeof raw === 'string' ? raw.trim() : '';
}

/** 工具名称 → 用户可读描述 */
function toolNameToLabel(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('read') || n.includes('file')) return '读取文件';
  if (n.includes('write') || n.includes('save') || n.includes('create')) return '保存文件';
  if (n.includes('search') || n.includes('web') || n.includes('browse')) return '搜索信息';
  if (n.includes('code') || n.includes('execute') || n.includes('run')) return '执行代码';
  if (n.includes('memory') || n.includes('remember')) return '更新记忆';
  if (n.includes('report') || n.includes('answer')) return '整理回答';
  if (n.includes('think') || n.includes('reason') || n.includes('plan')) return '深度思考';
  return name;
}

/** 从 updates/values payload 中提取 AI 当前正在调用的工具名称列表 */
function extractToolCallNamesFromPayload(payload: unknown): string[] {
  const names: string[] = [];
  const stack: unknown[] = [payload];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== 'object') continue;
    const o = cur as Record<string, unknown>;
    if (Array.isArray(o.messages)) {
      for (const m of o.messages) {
        const msg = asRecord(m);
        if (!msg) continue;
        const kwargs = asRecord(msg.kwargs);
        const src = kwargs ?? msg;
        const type = typeof src.type === 'string' ? src.type : '';
        const role = typeof src.role === 'string' ? src.role : '';
        const isAi = type === 'ai' || type === 'assistant' || role === 'assistant';
        if (isAi && Array.isArray(src.tool_calls)) {
          for (const tc of src.tool_calls) {
            const t = asRecord(tc);
            if (t && typeof t.name === 'string' && t.name) names.push(t.name);
          }
        }
      }
    }
    for (const v of Object.values(o)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) stack.push(v);
    }
  }
  return [...new Set(names)];
}

function rawMessageLooksLikeChatEntry(m: unknown): boolean {
  const msg = asRecord(m);
  if (!msg) return false;
  if (typeof msg.role === 'string' || typeof msg.type === 'string') return true;
  const kwargs = asRecord(msg.kwargs);
  if (kwargs && (typeof kwargs.type === 'string' || typeof kwargs.role === 'string')) return true;
  return false;
}

/** 在 state / checkpoint JSON 中收集所有疑似 messages 数组，取条数最多的一段 */
function collectMessageArrays(node: unknown, depth: number, out: unknown[][]): void {
  if (depth > 10 || node == null) return;
  const o = asRecord(node);
  if (!o) return;
  const maybe = o.messages;
  if (Array.isArray(maybe) && maybe.length > 0 && maybe.some(rawMessageLooksLikeChatEntry)) {
    out.push(maybe);
  }
  for (const v of Object.values(o)) {
    if (v && typeof v === 'object') collectMessageArrays(v, depth + 1, out);
  }
}

function pickBestRawMessages(json: unknown): unknown[] {
  const buckets: unknown[][] = [];
  collectMessageArrays(json, 0, buckets);
  if (buckets.length === 0) return [];
  return buckets.reduce((a, b) => (b.length > a.length ? b : a));
}

function mapRawMessagesToUi(raw: unknown[]): Message[] {
  const out: Message[] = [];
  let i = 0;
  for (const m of raw) {
    const msg = asRecord(m);
    if (!msg) continue;

    const kwargs = asRecord(msg.kwargs);
    let type = typeof msg.type === 'string' ? msg.type : '';
    let role = typeof msg.role === 'string' ? msg.role : '';
    let contentSrc: unknown = msg.content;
    if (kwargs) {
      if (typeof kwargs.type === 'string') type = kwargs.type;
      if (typeof kwargs.role === 'string') role = kwargs.role;
      contentSrc = kwargs.content !== undefined ? kwargs.content : msg.content;
    }

    const content = normalizeAiContent(contentSrc);
    const isUser =
      type === 'human' || type === 'user' || role === 'human' || role === 'user';
    const isAssistant =
      type === 'ai' ||
      type === 'assistant' ||
      role === 'ai' ||
      role === 'assistant';
    if (!isUser && !isAssistant) continue;
    if (!content.trim()) continue;

    const side = isUser ? 'user' : 'assistant';
    out.push({
      id: side === 'user' ? `u-${i}` : `a-${i}`,
      type: side,
      content,
      timestamp: new Date(),
    });
    i += 1;
  }
  return out;
}

function messagesFromThreadStatePayload(json: unknown): Message[] {
  const best = pickBestRawMessages(json);
  if (best.length === 0) return [];
  return mapRawMessagesToUi(best);
}

/** 部分部署只在 checkpoint 里存消息：从最新一条有 messages 的检查点恢复 */
async function getPrivateThreadHistoryMessages(threadId: string): Promise<Message[]> {
  const { status, json } = await postJson(`/api/threads/${encodeURIComponent(threadId)}/history`, {
    limit: 80,
  });
  if (status < 200 || status >= 300 || !Array.isArray(json) || json.length === 0) return [];

  for (let idx = json.length - 1; idx >= 0; idx -= 1) {
    const row = asRecord(json[idx]);
    const values = asRecord(row?.values);
    if (!values) continue;
    const raw = values.messages;
    if (!Array.isArray(raw) || raw.length === 0) continue;
    const msgs = mapRawMessagesToUi(raw);
    if (msgs.length > 0) return msgs;
    const nested = messagesFromThreadStatePayload(values);
    if (nested.length > 0) return nested;
  }
  return [];
}

/** GET /api/threads/{id}/state → 转成聊天消息（必要时回退 POST history） */
export async function getPrivateThreadStateMessages(threadId: string): Promise<Message[]> {
  const { status, json, text } = await getJson(`/api/threads/${encodeURIComponent(threadId)}/state`);
  if (status < 200 || status >= 300) {
    throw new Error(text.slice(0, 300) || `HTTP ${status}`);
  }
  const fromState = messagesFromThreadStatePayload(json);
  if (fromState.length > 0) return fromState;
  return getPrivateThreadHistoryMessages(threadId);
}

/** 获取消息列表中最后一条 human 消息的下一个索引，使提取只针对当前轮次 */
function sliceAfterLastHuman(raw: unknown[]): unknown[] {
  for (let i = raw.length - 1; i >= 0; i--) {
    const msg = asRecord(raw[i]);
    if (!msg) continue;
    const kwargs = asRecord(msg.kwargs);
    const type = kwargs
      ? (typeof kwargs.type === 'string' ? kwargs.type : '')
      : (typeof msg.type === 'string' ? msg.type : '');
    const role = kwargs
      ? (typeof kwargs.role === 'string' ? kwargs.role : '')
      : (typeof msg.role === 'string' ? msg.role : '');
    if (type === 'human' || type === 'user' || role === 'human' || role === 'user') {
      return raw.slice(i + 1);
    }
  }
  return raw;
}

/**
 * 从消息列表中提取 AI 响应。
 *
 * includeToolContent=true  → 同时兼容 doubao-seed 等通过 report tool 返回最终回复的模式
 * includeToolContent=false → 流式中间态：只取 ai/assistant 文字，避免 tool 中间结果闪屏
 *
 * 注意：始终从最后一条 human 消息之后开始遍历，防止多轮对话时把上一轮答案显示给新一轮。
 */
function extractLastAssistantFromMessageList(
  raw: unknown[],
  includeToolContent = true,
): string | undefined {
  // 只看当前轮次（最后一条 human 消息之后）—— 修复问题2
  const slice = sliceAfterLastHuman(raw);

  let lastAi = '';
  let toolAfterAi = '';
  let seenAi = false;

  for (const m of slice) {
    const msg = asRecord(m);
    if (!msg) continue;
    const kwargs = asRecord(msg.kwargs);
    let type = typeof msg.type === 'string' ? msg.type : '';
    let role = typeof msg.role === 'string' ? msg.role : '';
    let contentSrc: unknown = msg.content;
    if (kwargs) {
      if (typeof kwargs.type === 'string') type = kwargs.type;
      if (typeof kwargs.role === 'string') role = kwargs.role;
      contentSrc = kwargs.content !== undefined ? kwargs.content : msg.content;
    }
    const isAssistant =
      type === 'ai' || type === 'assistant' || role === 'assistant' || role === 'ai';
    const isTool = type === 'tool';

    if (isAssistant) {
      seenAi = true;
      const c = normalizeAiContent(contentSrc);
      if (c) {
        // 附加模型的 reasoning/thinking 内容（doubao-seed 等推理模型）
        const thinking = extractAiThinkingContent(msg);
        lastAi = thinking ? `<thinking>${thinking}</thinking>\n${c}` : c;
        toolAfterAi = '';
      }
    } else if (isTool && seenAi && includeToolContent) {
      const c = normalizeAiContent(contentSrc);
      if (c) toolAfterAi = c;
    }
  }

  const result = (includeToolContent ? toolAfterAi : '') || lastAi;
  return result.length > 0 ? result : undefined;
}

/** 判断 values payload 中的最后一条消息是否来自 agent（ai / tool），
 *  若最后一条是 human 说明 AI 还未响应，应跳过此次 UI 更新 */
function valuesPayloadHasAgentResponse(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const root = payload as { messages?: unknown };
  const msgs = Array.isArray(root.messages) ? root.messages : null;
  if (!msgs || msgs.length === 0) return false;
  const last = asRecord(msgs[msgs.length - 1]);
  if (!last) return false;
  const kwargs = asRecord(last.kwargs);
  const type = kwargs
    ? (typeof kwargs.type === 'string' ? kwargs.type : '')
    : (typeof last.type === 'string' ? last.type : '');
  const role = kwargs
    ? (typeof kwargs.role === 'string' ? kwargs.role : '')
    : (typeof last.role === 'string' ? last.role : '');
  const isHuman = type === 'human' || type === 'user' || role === 'human' || role === 'user';
  return !isHuman;
}

/**
 * 顶层或子图嵌套（如 lead_agent.messages）的 values 事件提取。
 * streamingMode=true  → 只取纯 AI 文字，不显示 tool 中间结果（避免闪屏）
 * streamingMode=false → 允许 tool 内容兜底（给 end 事件最终提取用）
 */
function extractLastAiFromValuesPayloadDeep(
  payload: unknown,
  streamingMode = false,
): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const includeToolContent = !streamingMode;
  const root = payload as { messages?: unknown };
  if (Array.isArray(root.messages)) {
    const t = extractLastAssistantFromMessageList(root.messages, includeToolContent);
    if (t) return t;
  }
  const buckets: unknown[][] = [];
  collectMessageArrays(payload, 0, buckets);
  if (buckets.length === 0) return undefined;
  const best = buckets.reduce((a, b) => (b.length > a.length ? b : a));
  return extractLastAssistantFromMessageList(best, includeToolContent);
}

function parseSseBlocks(buffer: string): { blocks: string[]; rest: string } {
  const parts = buffer.split(/\r?\n\r?\n/);
  const rest = parts.pop() ?? '';
  return { blocks: parts.filter((b) => b.trim().length > 0), rest };
}

/**
 * React Native 的 fetch 通常没有可用的 response.body.getReader()，
 * 使用 XHR 在 LOADING 阶段增量读取 responseText 解析 SSE。
 */
function postSseStreamWithXHR(
  url: string,
  headers: Record<string, string>,
  body: string,
  feed: (chunk: string) => void,
  flushTail: () => void,
  onHeadersOk: () => void
): Promise<number> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let lastLen = 0;
    let headersNotified = false;

    xhr.open('POST', url, true);
    for (const [k, v] of Object.entries(headers)) {
      if (v != null && String(v).length > 0) {
        xhr.setRequestHeader(k, String(v));
      }
    }
    xhr.timeout = 0;

    const pump = () => {
      const t = xhr.responseText;
      if (t.length > lastLen) {
        if (!headersNotified && xhr.status >= 200 && xhr.status < 300) {
          headersNotified = true;
          onHeadersOk();
        }
        feed(t.slice(lastLen));
        lastLen = t.length;
      }
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
        if (xhr.status >= 200 && xhr.status < 300 && !headersNotified) {
          headersNotified = true;
          onHeadersOk();
        }
      }
      if (xhr.readyState === XMLHttpRequest.LOADING) {
        pump();
      }
    };
    xhr.onprogress = pump;

    xhr.onload = () => {
      pump();
      flushTail();
      resolve(xhr.status);
    };
    xhr.onerror = () => reject(new Error('网络错误（流式 XMLHttpRequest）'));
    xhr.ontimeout = () => reject(new Error('流式 XMLHttpRequest 超时'));

    xhr.send(body);
  });
}

/**
 * 私人模式：POST /api/threads/{id}/runs/stream，解析 metadata / updates / values / end。
 */
function privateSubmodeFromEnv(): { thinkingEnabled: boolean; isPlanMode: boolean; subagentEnabled: boolean } {
  const m = (process.env.EXPO_PUBLIC_PRIVATE_CHAT_SUBMODE || 'flash').toLowerCase();
  if (m === 'thinking') return { thinkingEnabled: true, isPlanMode: false, subagentEnabled: false };
  if (m === 'pro') return { thinkingEnabled: true, isPlanMode: true, subagentEnabled: false };
  if (m === 'ultra') return { thinkingEnabled: true, isPlanMode: true, subagentEnabled: true };
  return { thinkingEnabled: false, isPlanMode: false, subagentEnabled: false };
}

/** 压缩并转 base64 data URL，避免 413 Payload Too Large */
async function imageUriToDataUrl(uri: string): Promise<string> {
  // 先压缩：最大边 1024px + JPEG quality 0.65，base64 大约 100-200 KB
  const compressed = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1024 } }],
    { compress: 0.65, format: ImageManipulator.SaveFormat.JPEG }
  );
  const base64 = await FileSystem.readAsStringAsync(compressed.uri, {
    encoding: 'base64',
  });
  return `data:image/jpeg;base64,${base64}`;
}

export async function streamPrivateChatRun(
  threadId: string,
  userText: string,
  modelName: string,
  images: string[] | undefined,
  handlers: PrivateStreamHandlers,
  uploadedFiles?: UploadedFileInfo[],
): Promise<void> {
  const base = await getApiBaseUrl();
  const headers = await getPrivateChatAuthHeaders();
  const s = await getAuthSession();
  if (!s.userId || !s.tenantId || !s.workspaceId) {
    throw new Error('会话不完整');
  }

  const { thinkingEnabled: thinking, isPlanMode: plan, subagentEnabled: sub } = privateSubmodeFromEnv();

  const multitask =
    (process.env.EXPO_PUBLIC_PRIVATE_CHAT_MULTITASK_STRATEGY || 'reject').toLowerCase();
  const multitask_strategy =
    multitask === 'enqueue' || multitask === 'interrupt' || multitask === 'rollback'
      ? multitask
      : 'reject';

  const resolvedModel = modelName.trim();

  const baseContext: Record<string, unknown> = {
    user_id: s.userId,
    tenant_id: s.tenantId,
    workspace_id: s.workspaceId,
    thread_id: threadId,
    thinking_enabled: thinking,
    is_plan_mode: plan,
    subagent_enabled: sub,
    // 禁止 AI 在未被明确要求时自动调用文件保存工具；所有回复默认以文字格式直接展示
    output_guidelines: '除非用户明确要求，否则禁止调用文件保存工具，所有回答直接以 Markdown 文字在对话中输出。',
    disable_auto_file_output: true,
  };
  if (resolvedModel) {
    baseContext.model_name = resolvedModel;
  }

  // 构建消息 content：
  //   - 纯文字 → 直接发字符串（与 web 端保持一致，部分 LLM Provider 不接受数组格式）
  //   - 含图片或文件 → 发 multimodal 数组（API 文档 Step 4 要求）
  type ContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } };

  const hasImages = images && images.length > 0;
  const hasFiles = uploadedFiles && uploadedFiles.length > 0;
  let messageContent: string | ContentPart[];

  if (hasImages || hasFiles) {
    const contentParts: ContentPart[] = [];
    if (hasImages) {
      const dataUrls = await Promise.all(images!.map((uri) => imageUriToDataUrl(uri)));
      for (const url of dataUrls) {
        contentParts.push({ type: 'image_url', image_url: { url } });
      }
    }
    if (userText.trim()) {
      contentParts.push({ type: 'text', text: userText });
    }
    messageContent = contentParts;
  } else {
    messageContent = userText.trim();
  }

  // 按 API 文档 Step 4 规范：文件信息放在 additional_kwargs.files，不拼入文字
  type FileKwarg = { filename: string; path: string; status: 'uploaded' };
  const additionalKwargs: { files?: FileKwarg[] } | undefined = hasFiles
    ? {
        files: uploadedFiles!.map((f) => ({
          filename: f.filename,
          path: f.virtualPath,
          status: 'uploaded' as const,
        })),
      }
    : undefined;

  const humanMessage: Record<string, unknown> = {
    type: 'human',
    content: messageContent,
  };
  if (additionalKwargs) {
    humanMessage.additional_kwargs = additionalKwargs;
  }

  const body = {
    input: {
      messages: [humanMessage],
    },
    config: { recursion_limit: 1000 },
    context: baseContext,
    stream_mode: ['values', 'updates'],
    stream_subgraphs: true,
    stream_resumable: true,
    multitask_strategy,
    on_disconnect: 'cancel',
  };

  const url = joinUrl(base, `/api/threads/${encodeURIComponent(threadId)}/runs/stream`);
  const reqHeaders = {
    ...headers,
    Accept: 'text/event-stream',
  };
  const bodyStr = JSON.stringify(body);

  let carry = '';
  let chunkAccum = '';
  let lastValuesPayload: unknown = null; // 用于 end 事件后最终提取（兜底 doubao-seed tool 回复）

  const processBlock = (block: string) => {
    let eventName = 'message';
    const lines = block.split(/\r?\n/);
    let dataJoined = '';
    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim().toLowerCase();
      } else if (line.startsWith('data:')) {
        const piece = line.slice(5).trim();
        dataJoined = dataJoined ? `${dataJoined}\n${piece}` : piece;
      }
    }
    if (!dataJoined) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(dataJoined);
    } catch {
      return;
    }

    if (eventName === 'metadata') {
      return;
    }

    if (eventName === 'error') {
      const o = asRecord(parsed);
      // 优先取 message，然后 detail，最后 JSON 全文（便于排查）
      const msg =
        typeof o?.message === 'string' && o.message.trim()
          ? o.message.trim().slice(0, 400)
          : typeof o?.detail === 'string' && o.detail.trim()
          ? o.detail.trim().slice(0, 400)
          : JSON.stringify(parsed).slice(0, 400);
      if (__DEV__) {
        console.warn('[SSE error event]', JSON.stringify(parsed));
      }
      handlers.onError?.(msg);
      return;
    }

    if (eventName === 'updates') {
      const t = extractNestedTitle(parsed);
      if (t) handlers.onTitleDetected?.(t);
      // 提取 AI 正在调用的工具名称，告知前端"思考步骤"
      const toolNames = extractToolCallNamesFromPayload(parsed);
      if (toolNames.length > 0) {
        const labels = toolNames.map(toolNameToLabel);
        handlers.onThinkingStep?.(`正在${labels.join('、')}…`);
      }
      return;
    }

    if (eventName === 'values') {
      chunkAccum = '';
      lastValuesPayload = parsed;
      const topTitle =
        extractNestedTitle(parsed) ||
        (parsed && typeof parsed === 'object' && typeof (parsed as { title?: string }).title === 'string'
          ? (parsed as { title: string }).title.trim()
          : undefined);
      if (topTitle) handlers.onTitleDetected?.(topTitle);
      // 流式期间只取纯 AI 文字（streamingMode=true），不显示 tool 中间结果，避免闪屏（问题1）
      // 从最后一条 human 消息之后提取，避免把上一轮答案显示给新一轮（问题2）
      if (valuesPayloadHasAgentResponse(parsed)) {
        const fromMessages = extractLastAiFromValuesPayloadDeep(parsed, true);
        if (fromMessages !== undefined) {
          handlers.onAssistantText(fromMessages);
        }
      }
      return;
    }

    if (eventName === 'end') {
      // 流结束后用完整模式再提取一次（兜底 doubao-seed 等通过 tool 返回最终回复的模型）
      if (lastValuesPayload) {
        const finalText = extractLastAiFromValuesPayloadDeep(lastValuesPayload, false);
        if (finalText) {
          handlers.onAssistantText(finalText);
        }
      }
      return;
    }

    // 文档 3.1 备用：event: data + message_chunk 增量
    if (eventName === 'data' || eventName === 'message') {
      const o = asRecord(parsed);
      if (o) {
        if (o.type === 'end') return;
        if (o.type === 'message_chunk' && typeof o.content === 'string') {
          chunkAccum += o.content;
          handlers.onAssistantText(chunkAccum);
          return;
        }
      }
      const nested = extractLastAiFromValuesPayloadDeep(parsed);
      if (nested) {
        chunkAccum = '';
        handlers.onAssistantText(nested);
      }
      return;
    }
  };

  const feed = (delta: string) => {
    carry += delta;
    const { blocks, rest } = parseSseBlocks(carry);
    carry = rest;
    for (const b of blocks) {
      processBlock(b);
    }
  };

  const flushTail = () => {
    if (carry.trim()) {
      const { blocks } = parseSseBlocks(`${carry}\n\n`);
      carry = '';
      for (const b of blocks) {
        processBlock(b);
      }
    }
  };

  const notifyStreamOk = () => {
    registerPrivateSessionFireForget(threadId);
  };

  if (Platform.OS !== 'web') {
    const status = await postSseStreamWithXHR(url, reqHeaders, bodyStr, feed, flushTail, notifyStreamOk);
    if (status < 200 || status >= 300) {
      throw new Error(`流式请求失败 HTTP ${status}`);
    }
    return;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: reqHeaders,
    body: bodyStr,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText.slice(0, 400) || `流式请求失败 HTTP ${res.status}`);
  }

  const reader =
    res.body &&
    typeof (res.body as { getReader?: () => ReadableStreamDefaultReader<Uint8Array> }).getReader === 'function'
      ? (res.body as ReadableStream<Uint8Array>).getReader()
      : undefined;

  notifyStreamOk();

  if (!reader) {
    const text = await res.text();
    if (text) feed(text);
    flushTail();
    return;
  }

  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    feed(decoder.decode(value, { stream: true }));
  }
  flushTail();
}
