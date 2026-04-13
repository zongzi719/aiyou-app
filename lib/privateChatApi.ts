import type { Message } from '@/components/Conversation';
import { getApiBaseUrl } from '@/lib/devApiConfig';
import { getAuthSession, getPrivateChatAuthHeaders } from '@/lib/authSession';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

export interface PrivateStreamHandlers {
  onAssistantText: (fullText: string) => void;
  onTitleDetected?: (title: string) => void;
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

function extractLastAssistantFromMessageList(raw: unknown[]): string | undefined {
  let last = '';
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
    const isAssistant =
      type === 'ai' || type === 'assistant' || role === 'assistant' || role === 'ai';
    if (isAssistant) {
      last = normalizeAiContent(contentSrc);
    }
  }
  return last.length > 0 ? last : undefined;
}

/** 顶层或子图嵌套（如 lead_agent.messages）的 values 事件 */
function extractLastAiFromValuesPayloadDeep(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const root = payload as { messages?: unknown };
  if (Array.isArray(root.messages)) {
    const t = extractLastAssistantFromMessageList(root.messages);
    if (t) return t;
  }
  const buckets: unknown[][] = [];
  collectMessageArrays(payload, 0, buckets);
  if (buckets.length === 0) return undefined;
  const best = buckets.reduce((a, b) => (b.length > a.length ? b : a));
  return extractLastAssistantFromMessageList(best);
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
  handlers: PrivateStreamHandlers
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

  // 只有环境变量明确指定了模型名才下发，否则让服务端用其 config.yaml 默认模型
  const resolvedModel = modelName.trim();
  const envDefault = (
    process.env.EXPO_PUBLIC_PRIVATE_CHAT_MODEL_OPENAI?.trim() ||
    process.env.EXPO_PUBLIC_PRIVATE_CHAT_MODEL_CLAUDE?.trim() ||
    process.env.EXPO_PUBLIC_PRIVATE_CHAT_MODEL_GEMINI?.trim()
  );
  const sendModelName = envDefault ? resolvedModel : undefined;

  const baseContext: Record<string, unknown> = {
    user_id: s.userId,
    tenant_id: s.tenantId,
    workspace_id: s.workspaceId,
    thread_id: threadId,
    thinking_enabled: thinking,
    is_plan_mode: plan,
    subagent_enabled: sub,
  };
  if (sendModelName) {
    baseContext.model_name = sendModelName;
  }

  // 构建多模态 content：先图片后文字
  type ContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } };

  const contentParts: ContentPart[] = [];
  if (images && images.length > 0) {
    const dataUrls = await Promise.all(images.map((uri) => imageUriToDataUrl(uri)));
    for (const url of dataUrls) {
      contentParts.push({ type: 'image_url', image_url: { url } });
    }
  }
  if (userText.trim()) {
    contentParts.push({ type: 'text', text: userText });
  }

  const body = {
    input: {
      messages: [
        {
          type: 'human',
          content: contentParts,
        },
      ],
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
      const msg =
        typeof o?.message === 'string' ? o.message.trim().slice(0, 400) : JSON.stringify(parsed);
      handlers.onError?.(msg);
      return;
    }

    if (eventName === 'updates') {
      const t = extractNestedTitle(parsed);
      if (t) handlers.onTitleDetected?.(t);
      return;
    }

    if (eventName === 'values') {
      chunkAccum = '';
      const fromMessages = extractLastAiFromValuesPayloadDeep(parsed);
      const topTitle =
        extractNestedTitle(parsed) ||
        (parsed && typeof parsed === 'object' && typeof (parsed as { title?: string }).title === 'string'
          ? (parsed as { title: string }).title.trim()
          : undefined);
      if (topTitle) handlers.onTitleDetected?.(topTitle);
      if (fromMessages !== undefined) {
        handlers.onAssistantText(fromMessages);
      }
      return;
    }

    if (eventName === 'end') {
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
