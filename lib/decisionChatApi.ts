import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

import type { SelectedFile } from '@/components/ChatInput';
import { getAuthSession, getPrivateChatAuthHeaders } from '@/lib/authSession';
import { getApiBaseUrl } from '@/lib/devApiConfig';
import { uploadFilesToThreadFromSelection, type UploadedFileInfo } from '@/lib/privateChatApi';
import {
  parseDecisionReplySections,
  type DecisionReplySections,
} from '@/utils/decisionReplyParser';

export type DecisionCoachProfile = {
  id: string;
  name: string;
  roleLabel: string;
  tagline: string;
  systemPrompt: string;
};

export const DECISION_COACHES: DecisionCoachProfile[] = [
  {
    id: 'strategy',
    name: 'Sarah Chen',
    roleLabel: '默认教练',
    tagline: '拥有 GPT、DEEPSEEK 大模型推理能力\n最强大脑',
    systemPrompt:
      '你是一位战略教练。请从商业战略、市场空间、竞争格局、差异化与资源匹配的角度，给出结构化输出：先给“决策建议”，再给“关键问题”，最后给“风险提示”。要求简洁、可执行、中文输出。',
  },
  {
    id: 'risk',
    name: 'Marcus Johnson',
    roleLabel: '风险',
    tagline: '拥有顶级风险评估模型，帮助您排雷\n一切潜在风险',
    systemPrompt:
      '你是一位风险教练。请优先识别不确定性、合规/法律风险、财务与执行风险，给出结构化输出：先“决策建议”，再“关键问题”，最后“风险提示”。要求中文输出、列点清晰。',
  },
  {
    id: 'product',
    name: 'Yuki Tanaka',
    roleLabel: '产品',
    tagline: '产品分析一流，懂用户行为、懂市场',
    systemPrompt:
      '你是一位产品教练。请从用户价值、需求验证、产品定位、体验与增长的角度分析，按“决策建议 / 关键问题 / 风险提示”三段式输出，中文、可落地。',
  },
  {
    id: 'growth',
    name: 'Elena Rodriguez',
    roleLabel: '增长',
    tagline: '帮您提供快速增长的建议',
    systemPrompt:
      '你是一位增长教练。请从获客、转化、留存、定价、渠道与增长模型角度分析，按“决策建议 / 关键问题 / 风险提示”三段式输出，中文、可执行。',
  },
  {
    id: 'data',
    name: 'David Park',
    roleLabel: '数据',
    tagline: '1000w+ 用户数据',
    systemPrompt:
      '你是一位数据教练。请从指标体系、假设验证、数据口径、实验设计与量化评估角度分析，按“决策建议 / 关键问题 / 风险提示”三段式输出，中文、尽量给出可测量指标。',
  },
  {
    id: 'ops',
    name: 'David Kim',
    roleLabel: '运营',
    tagline: '帮您把策略落到可执行的路径',
    systemPrompt:
      '你是一位运营教练。请从资源安排、执行节奏、协作机制、关键里程碑与落地风险角度分析，按“决策建议 / 关键问题 / 风险提示”三段式输出，中文，突出可执行步骤。',
  },
];

const STORAGE_KEY = 'luna_decision_coach_thread_map_v1';
const PAGE_THREAD_STORAGE_KEY = 'luna_decision_page_thread_id_v1';
const DECISION_REQUEST_TIMEOUT_MS = 120_000;
const DECISION_TIMEOUT_RETRY_COUNT = 1;

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  return undefined;
}

async function loadThreadMap(): Promise<Record<string, string>> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    const json = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(json)) {
      if (typeof v === 'string' && v.trim()) out[k] = v.trim();
    }
    return out;
  } catch {
    return {};
  }
}

async function saveThreadMap(map: Record<string, string>): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

async function loadPageThreadId(): Promise<string | null> {
  const raw = await AsyncStorage.getItem(PAGE_THREAD_STORAGE_KEY);
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

async function savePageThreadId(threadId: string): Promise<void> {
  await AsyncStorage.setItem(PAGE_THREAD_STORAGE_KEY, threadId);
}

async function requestJson(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown
): Promise<{ status: number; json: unknown; text: string }> {
  const base = await getApiBaseUrl();
  const headers = await getPrivateChatAuthHeaders();
  const url = joinUrl(base, path);
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= DECISION_TIMEOUT_RETRY_COUNT; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DECISION_REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method,
        headers: { ...headers, Accept: 'application/json' },
        body: body == null ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await res.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      return { status: res.status, json, text };
    } catch (err) {
      lastError = err;
      const isTimeout = (err as { name?: string })?.name === 'AbortError';
      if (!isTimeout || attempt >= DECISION_TIMEOUT_RETRY_COUNT) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 800));
    } finally {
      clearTimeout(timeout);
    }
  }

  if ((lastError as { name?: string } | null)?.name === 'AbortError') {
    throw new Error('请求超时，请稍后重试');
  }
  throw lastError;
}

async function postJson(
  path: string,
  body: unknown
): Promise<{ status: number; json: unknown; text: string }> {
  return requestJson('POST', path, body);
}

async function getJson(path: string): Promise<{ status: number; json: unknown; text: string }> {
  return requestJson('GET', path);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeAiContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    const o = content as Record<string, unknown>;
    if (typeof o.text === 'string') return o.text;
    if (typeof o.text === 'object' && o.text && typeof (o.text as Record<string, unknown>).value === 'string') {
      return ((o.text as Record<string, unknown>).value as string) ?? '';
    }
    if (typeof o.content === 'string') return o.content;
    if (
      typeof o.content === 'object' &&
      o.content &&
      typeof (o.content as Record<string, unknown>).value === 'string'
    ) {
      return ((o.content as Record<string, unknown>).value as string) ?? '';
    }
    if ((o.type === 'text' || o.type === 'output_text') && typeof o.text === 'string') return o.text;
  }
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object') {
        const p = part as { type?: string; text?: string; content?: string };
        if (typeof p.text === 'string') return p.text;
        if (typeof p.content === 'string') return p.content;
        if (
          typeof (part as Record<string, unknown>).text === 'object' &&
          (part as Record<string, unknown>).text &&
          typeof ((part as Record<string, unknown>).text as Record<string, unknown>).value === 'string'
        ) {
          return (((part as Record<string, unknown>).text as Record<string, unknown>).value as string) ?? '';
        }
        if (
          typeof (part as Record<string, unknown>).content === 'object' &&
          (part as Record<string, unknown>).content &&
          typeof ((part as Record<string, unknown>).content as Record<string, unknown>).value === 'string'
        ) {
          return (((part as Record<string, unknown>).content as Record<string, unknown>).value as string) ?? '';
        }
        if ((p.type === 'text' || p.type === 'output_text') && typeof p.text === 'string') {
          return p.text;
        }
      }
      return '';
    })
    .join('');
}

function formatDecisionHttpError(status: number, json: unknown, text: string): string {
  const detail =
    (asRecord(json)?.detail as string | undefined) ??
    (asRecord(json)?.message as string | undefined) ??
    '';
  const combined = `${detail}\n${text}`.trim();
  const lower = combined.toLowerCase();
  const isHtmlError = lower.includes('<html') || lower.includes('<!doctype html');
  const isGatewayTimeout =
    status === 504 ||
    lower.includes('504 gateway time-out') ||
    lower.includes('gateway timeout') ||
    lower.includes('upstream timed out');
  const isGatewayUnavailable = status === 502 || status === 503;

  if (isGatewayTimeout) {
    return '网关超时，服务暂时不可用，请稍后重试。';
  }
  if (isGatewayUnavailable) {
    return '网关异常，服务暂时不可用，请稍后重试。';
  }
  if (isHtmlError) {
    return `服务异常（HTTP ${status}），请稍后重试。`;
  }
  if (detail.trim()) return detail.trim().slice(0, 240);
  if (text.trim()) return text.trim().slice(0, 240);
  return `HTTP ${status}`;
}

function extractLastAiTextFromMessages(messages: unknown): string {
  if (!Array.isArray(messages)) return '';
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = asRecord(messages[i]);
    if (!m) continue;
    const kwargs = asRecord(m.kwargs);
    const src = kwargs ?? m;
    const type = typeof src.type === 'string' ? src.type : '';
    const role = typeof src.role === 'string' ? src.role : '';
    const isAi = type === 'ai' || type === 'assistant' || role === 'assistant' || role === 'ai';
    if (!isAi) continue;
    const contentSrc = (src as Record<string, unknown>).content;
    const text = normalizeAiContent(contentSrc).trim();
    if (text) return text;
  }
  return '';
}

function extractAiTextFromRunPayload(json: unknown): string {
  const root = asRecord(json);
  if (!root) return '';
  const threadData = asRecord(root.thread_data);
  const candidates: unknown[] = [
    root.messages,
    threadData?.messages,
    asRecord(threadData?.values)?.messages,
    asRecord(root.output)?.messages,
    asRecord(root.values)?.messages,
    asRecord(asRecord(root.state)?.values)?.messages,
    asRecord(asRecord(root.data)?.output)?.messages,
  ];
  for (const c of candidates) {
    const text = extractLastAiTextFromMessages(c).trim();
    if (text) return text;
  }
  const outputText = (root.output_text ?? asRecord(root.output)?.text) as string | undefined;
  if (typeof outputText === 'string' && outputText.trim()) return outputText.trim();
  const artifactText = extractTextFromArtifacts(root.artifacts);
  if (artifactText) return artifactText;
  const deepText = extractAiTextFromAnyNestedMessages(root);
  if (deepText) return deepText;
  return '';
}

function extractClarificationFromRunPayload(json: unknown): string {
  const root = asRecord(json);
  if (!root) return '';
  const threadData = asRecord(root.thread_data);
  const candidates: unknown[] = [
    root.messages,
    threadData?.messages,
    asRecord(threadData?.values)?.messages,
    asRecord(root.output)?.messages,
    asRecord(root.values)?.messages,
    asRecord(asRecord(root.state)?.values)?.messages,
    asRecord(asRecord(root.data)?.output)?.messages,
  ];
  for (const c of candidates) {
    const text = extractAskClarificationText(c).trim();
    if (text) return text;
  }
  if (root) {
    const deep = extractClarificationFromAnyNestedMessages(root);
    if (deep) return deep;
  }
  return '';
}

function extractAiTextFromAnyNestedMessages(root: Record<string, unknown>): string {
  const seen = new Set<unknown>();
  const stack: unknown[] = [root];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (!cur || seen.has(cur)) continue;
    seen.add(cur);
    if (Array.isArray(cur)) {
      const text = extractLastAiTextFromMessages(cur).trim();
      if (text) return text;
      for (let i = cur.length - 1; i >= 0; i -= 1) stack.push(cur[i]);
      continue;
    }
    const rec = asRecord(cur);
    if (!rec) continue;
    const directMessages = rec.messages;
    if (Array.isArray(directMessages)) {
      const text = extractLastAiTextFromMessages(directMessages).trim();
      if (text) return text;
    }
    for (const value of Object.values(rec)) stack.push(value);
  }
  return '';
}

function extractClarificationFromAnyNestedMessages(root: Record<string, unknown>): string {
  const seen = new Set<unknown>();
  const stack: unknown[] = [root];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (!cur || seen.has(cur)) continue;
    seen.add(cur);
    if (Array.isArray(cur)) {
      const text = extractAskClarificationText(cur).trim();
      if (text) return text;
      for (let i = cur.length - 1; i >= 0; i -= 1) stack.push(cur[i]);
      continue;
    }
    const rec = asRecord(cur);
    if (!rec) continue;
    const directMessages = rec.messages;
    if (Array.isArray(directMessages)) {
      const text = extractAskClarificationText(directMessages).trim();
      if (text) return text;
    }
    for (const value of Object.values(rec)) stack.push(value);
  }
  return '';
}

function extractRunErrorHint(json: unknown): string {
  const root = asRecord(json);
  if (!root) return '';
  const threadData = asRecord(root.thread_data);
  const candidates: unknown[] = [
    root.error,
    root.detail,
    root.message,
    threadData?.error,
    threadData?.detail,
    threadData?.message,
    asRecord(threadData?.last_error)?.message,
    asRecord(root.last_error)?.message,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim().slice(0, 120);
  }
  return '';
}

function extractTextFromArtifacts(artifacts: unknown): string {
  const seen = new Set<unknown>();
  const stack: unknown[] = [artifacts];
  const candidates: string[] = [];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (!cur || seen.has(cur)) continue;
    seen.add(cur);
    if (typeof cur === 'string') {
      const t = cur.trim();
      if (t.length >= 12) candidates.push(t);
      continue;
    }
    if (Array.isArray(cur)) {
      for (let i = cur.length - 1; i >= 0; i -= 1) stack.push(cur[i]);
      continue;
    }
    const rec = asRecord(cur);
    if (!rec) continue;
    const favoredKeys = ['content', 'text', 'markdown', 'answer', 'final', 'output', 'report', 'summary'];
    for (const k of favoredKeys) {
      if (k in rec) stack.push(rec[k]);
    }
    for (const v of Object.values(rec)) stack.push(v);
  }
  if (candidates.length === 0) return '';
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0] ?? '';
}

function extractAskClarificationText(messages: unknown): string {
  if (!Array.isArray(messages)) return '';
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = asRecord(messages[i]);
    if (!m) continue;
    const kwargs = asRecord(m.kwargs);
    const src = kwargs ?? m;
    const type = typeof src.type === 'string' ? src.type : '';
    const role = typeof src.role === 'string' ? src.role : '';
    const isAi = type === 'ai' || type === 'assistant' || role === 'assistant' || role === 'ai';
    if (!isAi) continue;
    const additional = asRecord((src as Record<string, unknown>).additional_kwargs);
    const toolCalls = (additional?.tool_calls ?? (src as Record<string, unknown>).tool_calls) as
      | unknown[]
      | undefined;
    if (!Array.isArray(toolCalls)) continue;
    for (const tc of toolCalls) {
      const call = asRecord(tc);
      const fn = asRecord(call?.function);
      const name = (fn?.name ?? call?.name) as string | undefined;
      if (name !== 'ask_clarification') continue;
      const argsRaw = (fn?.arguments ?? call?.arguments) as string | undefined;
      if (!argsRaw) continue;
      try {
        const args = JSON.parse(argsRaw) as Record<string, unknown>;
        const q = typeof args.question === 'string' ? args.question.trim() : '';
        const options = Array.isArray(args.options)
          ? args.options.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
          : [];
        if (q && options.length > 0) return `${q}\n可选项：${options.join(' / ')}`;
        if (q) return q;
      } catch {
        // ignore parse errors
      }
    }
  }
  return '';
}

async function imageUriToDataUrl(uri: string): Promise<string> {
  const compressed = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1024 } }], {
    compress: 0.65,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  const base64 = await FileSystem.readAsStringAsync(compressed.uri, { encoding: 'base64' });
  return `data:image/jpeg;base64,${base64}`;
}

async function createDecisionCoachThread(coachId: string): Promise<string> {
  const session = await getAuthSession();
  if (!session.userId) throw new Error('缺少 user_id');
  const { status, json, text } = await postJson('/api/threads', {
    metadata: {
      user_id: session.userId,
      is_decision_coach: 'true',
      coach_id: coachId,
    },
  });
  if (status < 200 || status >= 300) {
    const detail =
      (asRecord(json)?.detail as string | undefined) ??
      (asRecord(json)?.message as string | undefined) ??
      text.slice(0, 200) ??
      `HTTP ${status}`;
    throw new Error(`创建教练线程失败：${detail}`);
  }
  const tid = (asRecord(json)?.thread_id as string | undefined) ?? '';
  if (!tid) throw new Error('创建教练线程失败：响应无 thread_id');
  return tid;
}

export async function ensureDecisionCoachThreads(
  coachIds: string[]
): Promise<Record<string, string>> {
  const map = await loadThreadMap();
  const next = { ...map };
  const missingCoachIds = coachIds.filter((coachId) => !next[coachId]);
  if (missingCoachIds.length > 0) {
    const created = await Promise.all(
      missingCoachIds.map(async (coachId) => {
        const tid = await createDecisionCoachThread(coachId);
        return [coachId, tid] as const;
      })
    );
    for (const [coachId, tid] of created) {
      next[coachId] = tid;
    }
  }
  if (JSON.stringify(next) !== JSON.stringify(map)) {
    await saveThreadMap(next);
  }
  return next;
}

async function replaceDecisionCoachThread(coachId: string): Promise<string> {
  const map = await loadThreadMap();
  const tid = await createDecisionCoachThread(coachId);
  map[coachId] = tid;
  await saveThreadMap(map);
  return tid;
}

export type DecisionPageStateValues = {
  decision_turns?: unknown;
  decision_coach_thread_ids?: Record<string, string>;
  decision_selected_coach_ids?: string[];
};

async function createDecisionPageThread(threadId: string): Promise<string> {
  const session = await getAuthSession();
  if (!session.userId) throw new Error('缺少 user_id');
  const { status, json, text } = await postJson('/api/threads', {
    thread_id: threadId,
    metadata: {
      is_decision_page: 'true',
      user_id: session.userId,
    },
  });
  if (status < 200 || status >= 300) {
    const detail =
      (asRecord(json)?.detail as string | undefined) ??
      (asRecord(json)?.message as string | undefined) ??
      text.slice(0, 200) ??
      `HTTP ${status}`;
    throw new Error(`创建决策页面线程失败：${detail}`);
  }
  const tid = (asRecord(json)?.thread_id as string | undefined) ?? threadId;
  return tid;
}

export async function ensureDecisionPageThread(preferredThreadId?: string): Promise<string> {
  const existing = preferredThreadId?.trim() || (await loadPageThreadId());
  if (existing) {
    await savePageThreadId(existing);
    return existing;
  }
  const generated = `decision_page_${Date.now()}`;
  const tid = await createDecisionPageThread(generated);
  await savePageThreadId(tid);
  return tid;
}

export async function loadDecisionPageState(pageThreadId: string): Promise<DecisionPageStateValues | null> {
  const { status, json } = await getJson(`/api/threads/${encodeURIComponent(pageThreadId)}/state`);
  if (status < 200 || status >= 300) return null;
  const root = asRecord(json);
  const values = asRecord(root?.values);
  if (!values) return null;
  return {
    decision_turns: values.decision_turns,
    decision_coach_thread_ids: asRecord(values.decision_coach_thread_ids) as Record<string, string> | undefined,
    decision_selected_coach_ids: Array.isArray(values.decision_selected_coach_ids)
      ? values.decision_selected_coach_ids.filter((x): x is string => typeof x === 'string')
      : undefined,
  };
}

export async function persistDecisionPageState(
  pageThreadId: string,
  values: DecisionPageStateValues
): Promise<void> {
  await postJson(`/api/threads/${encodeURIComponent(pageThreadId)}/state`, { values });
}

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

type RunDecisionCoachResult =
  | { ok: true; rawText: string; sections: DecisionReplySections }
  | { ok: false; errorText: string };

async function runDecisionCoachWait(args: {
  coachId: string;
  threadId: string;
  userText: string;
  modelName: string;
  images?: string[];
  files?: SelectedFile[];
}): Promise<RunDecisionCoachResult> {
  const coach = DECISION_COACHES.find((c) => c.id === args.coachId);
  if (!coach) return { ok: false, errorText: '未知教练' };

  const session = await getAuthSession();
  if (!session.userId || !session.tenantId || !session.workspaceId) {
    return { ok: false, errorText: '会话不完整，请先登录后重试' };
  }

  const hasImages = !!args.images && args.images.length > 0;
  const hasFiles = !!args.files && args.files.length > 0;

  let uploadedFileInfos: UploadedFileInfo[] | undefined;
  if (hasFiles) {
    uploadedFileInfos = await uploadFilesToThreadFromSelection(args.threadId, args.files!);
  }

  let messageContent: string | ContentPart[] = args.userText.trim();
  if (hasImages) {
    const parts: ContentPart[] = [];
    const dataUrls = await Promise.all(args.images!.map((u) => imageUriToDataUrl(u)));
    for (const url of dataUrls) {
      parts.push({ type: 'image_url', image_url: { url } });
    }
    if (args.userText.trim()) parts.push({ type: 'text', text: args.userText.trim() });
    messageContent = parts;
  }

  const humanMessage: Record<string, unknown> = {
    type: 'human',
    content: messageContent,
  };

  if (uploadedFileInfos && uploadedFileInfos.length > 0) {
    humanMessage.additional_kwargs = {
      files: uploadedFileInfos.map((f) => ({
        filename: f.filename,
        path: f.virtualPath,
        status: 'uploaded' as const,
      })),
    };
  }

  const body = {
    assistant_id: 'lead_agent',
    input: { messages: [humanMessage] },
    config: { recursion_limit: 100 },
    context: {
      user_id: session.userId,
      tenant_id: session.tenantId,
      workspace_id: session.workspaceId,
      thread_id: args.threadId,
      model_name: args.modelName,
      thinking_enabled: false,
      is_plan_mode: false,
      subagent_enabled: false,
      custom_system_prompt: coach.systemPrompt,
      output_guidelines: '请按“决策建议 / 关键问题 / 风险提示”三段式输出，中文，简洁可执行。',
      disable_auto_file_output: true,
    },
  };

  const { status, json, text } = await postJson(
    `/api/threads/${encodeURIComponent(args.threadId)}/runs/wait`,
    body
  );

  if (status < 200 || status >= 300) {
    if (status === 502 || status === 503 || status === 504) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (attempt > 0) await sleep(1200);
        const stateRes = await getJson(`/api/threads/${encodeURIComponent(args.threadId)}/state`);
        if (stateRes.status >= 200 && stateRes.status < 300) {
          const recovered =
            extractAiTextFromRunPayload(stateRes.json).trim() ||
            extractClarificationFromRunPayload(stateRes.json).trim();
          if (recovered) {
            const sections = parseDecisionReplySections(recovered);
            return { ok: true, rawText: recovered, sections };
          }
        }
      }
    }
    const detail = formatDecisionHttpError(status, json, text);
    return { ok: false, errorText: `请求失败：${detail}` };
  }

  let rawText = extractAiTextFromRunPayload(json).trim();
  if (!rawText) {
    for (let attempt = 0; attempt < 3 && !rawText; attempt += 1) {
      if (attempt > 0) await sleep(1200);
      const stateRes = await getJson(`/api/threads/${encodeURIComponent(args.threadId)}/state`);
      if (stateRes.status >= 200 && stateRes.status < 300) {
        rawText = extractAiTextFromRunPayload(stateRes.json).trim();
        if (!rawText) rawText = extractClarificationFromRunPayload(stateRes.json).trim();
      }
      if (__DEV__ && !rawText) {
        console.log('[decision] state poll no text', {
          coachId: args.coachId,
          threadId: args.threadId,
          attempt: attempt + 1,
        });
      }
    }
  }
  if (!rawText) rawText = extractClarificationFromRunPayload(json).trim();
  if (!rawText) {
    const runErrorHint = extractRunErrorHint(json);
    if (__DEV__) {
      console.warn('[decision] 无可用回复文本', {
        coachId: args.coachId,
        threadId: args.threadId,
        runErrorHint,
        runResponseKeys: Object.keys(asRecord(json) ?? {}),
      });
    }
    return {
      ok: false,
      errorText: runErrorHint
        ? `教练暂未返回有效内容：${runErrorHint}`
        : '未收到回复，请稍后重试（可补充更多上下文）',
    };
  }
  const sections = parseDecisionReplySections(rawText);
  return { ok: true, rawText, sections };
}

export async function runDecisionTurn(args: {
  coachIds: string[];
  userText: string;
  modelName: string;
  images?: string[];
  files?: SelectedFile[];
  onCoachResult?: (payload: {
    coachId: string;
    threadId: string | null;
    result: RunDecisionCoachResult;
  }) => void;
}): Promise<Record<string, RunDecisionCoachResult>> {
  const map = await ensureDecisionCoachThreads(args.coachIds);
  const localThreadMap: Record<string, string> = { ...map };
  if (__DEV__) {
    console.log('[decision] runDecisionTurn start', {
      coachIds: args.coachIds,
      threadMap: map,
    });
  }
  const out: Record<string, RunDecisionCoachResult> = {};
  await Promise.all(
    args.coachIds.map(async (coachId) => {
      const threadId = localThreadMap[coachId];
      let res: RunDecisionCoachResult;
      if (!threadId) {
        res = { ok: false, errorText: '线程创建失败' };
      } else {
        res = await runDecisionCoachWait({
          coachId,
          threadId,
          userText: args.userText,
          modelName: args.modelName,
          images: args.images,
          files: args.files,
        });
        const shouldRetryWithFreshThread =
          !res.ok &&
          (res.errorText.includes('未收到回复') ||
            res.errorText.includes('网关超时') ||
            res.errorText.includes('服务暂时不可用'));
        if (shouldRetryWithFreshThread) {
          try {
            const freshThreadId = await replaceDecisionCoachThread(coachId);
            localThreadMap[coachId] = freshThreadId;
            if (__DEV__) {
              console.log('[decision] retry with fresh coach thread', {
                coachId,
                oldThreadId: threadId,
                freshThreadId,
              });
            }
            res = await runDecisionCoachWait({
              coachId,
              threadId: freshThreadId,
              userText: args.userText,
              modelName: args.modelName,
              images: args.images,
              files: args.files,
            });
          } catch (retryErr) {
            if (__DEV__) {
              console.warn('[decision] fresh thread retry failed', {
                coachId,
                error: retryErr instanceof Error ? retryErr.message : String(retryErr),
              });
            }
          }
        }
      }
      if (__DEV__) {
        console.log('[decision] coach result', {
          coachId,
          threadId: threadId ?? null,
          ok: res.ok,
          errorText: res.ok ? undefined : res.errorText,
        });
      }
      out[coachId] = res;
      args.onCoachResult?.({ coachId, threadId: threadId ?? null, result: res });
    })
  );
  return out;
}
