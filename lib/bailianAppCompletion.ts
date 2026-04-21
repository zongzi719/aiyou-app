/**
 * 百炼工作流应用 HTTP 调用（调试页）。
 *
 * 开始节点自定义变量名（与控制台一致，勿改）→ 经 input.biz_params 传递：
 * - user_text
 * - voice_id
 *
 * @see https://help.aliyun.com/zh/model-studio/invoke-workflow-application/
 */

export const BAILIAN_WORKFLOW_START_PARAMS = {
  userText: 'user_text',
  voiceId: 'voice_id',
} as const;

const DEFAULT_BASE = 'https://dashscope.aliyuncs.com/api/v1';
const COMPLETION_TIMEOUT_MS = 120_000;

export type BailianAppConfig = {
  appId: string;
  apiKey: string;
  baseUrl: string;
};

export function getBailianAppConfig(): BailianAppConfig {
  const appId = process.env.EXPO_PUBLIC_BAILIAN_APP_ID?.trim();
  const apiKey =
    process.env.EXPO_PUBLIC_BAILIAN_API_KEY?.trim() ||
    process.env.EXPO_PUBLIC_ALIYUN_DASHSCOPE_API_KEY?.trim() ||
    '';
  const baseUrl = process.env.EXPO_PUBLIC_BAILIAN_BASE_URL?.trim() || DEFAULT_BASE;
  if (!appId) {
    throw new Error('未配置 EXPO_PUBLIC_BAILIAN_APP_ID（百炼应用 ID）');
  }
  if (!apiKey || apiKey.includes('your-')) {
    throw new Error(
      '请配置 EXPO_PUBLIC_BAILIAN_API_KEY 或 EXPO_PUBLIC_ALIYUN_DASHSCOPE_API_KEY（sk- 开头）'
    );
  }
  if (!apiKey.startsWith('sk-')) {
    throw new Error('百炼 API Key 格式须为 sk- 开头');
  }
  return { appId, apiKey, baseUrl: baseUrl.replace(/\/+$/, '') };
}

/**
 * 与请求体 `parameters.incremental_output` 一致。
 * 非流式工作流请在 .env 设 `EXPO_PUBLIC_BAILIAN_WORKFLOW_INCREMENTAL_OUTPUT=false`，
 * 调试页将跳过 SSE，只发同步 completion，通常比「假流式」等整包更快。
 */
export function isBailianWorkflowIncrementalOutputEnabled(): boolean {
  return process.env.EXPO_PUBLIC_BAILIAN_WORKFLOW_INCREMENTAL_OUTPUT?.trim() !== 'false';
}

export function buildWorkflowCompletionBody(
  userText: string,
  voiceId: string
): Record<string, unknown> {
  const ut = userText.trim();
  return {
    input: {
      prompt: ut || ' ',
      biz_params: {
        [BAILIAN_WORKFLOW_START_PARAMS.userText]: ut,
        [BAILIAN_WORKFLOW_START_PARAMS.voiceId]: voiceId.trim(),
      },
    },
    parameters: {
      incremental_output: isBailianWorkflowIncrementalOutputEnabled(),
    },
    debug: {},
  };
}

function normalizeErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const rec = payload as Record<string, unknown>;
  const msgRaw = rec.message;
  let message = '';
  if (typeof msgRaw === 'string') {
    message = msgRaw.trim();
  } else if (msgRaw != null && typeof msgRaw === 'object') {
    try {
      message = JSON.stringify(msgRaw).trim();
    } catch {
      message = String(msgRaw);
    }
  }
  const code =
    typeof rec.code === 'string'
      ? rec.code.trim()
      : rec.code != null
        ? String(rec.code).trim()
        : '';
  if (code && message) return `${code}: ${message}`;
  if (message) return message;
  if (code) return code;
  return fallback;
}

function tryReplyTextFromJsonString(s: string): string | null {
  const trimmed = s.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const rt =
      parsed.reply_text ??
      parsed.replyText ??
      parsed.answer ??
      (typeof parsed.text === 'string' ? parsed.text : undefined) ??
      (typeof parsed.content === 'string' ? parsed.content : undefined);
    if (typeof rt === 'string' && rt.trim()) return rt.trim();
  } catch {
    /* not JSON */
  }
  return null;
}

/** 工作流结束节点常见：output.text 为正文，或结构化字段 reply_text + audio_url，或 text 内嵌 JSON。 */
function pickOutputText(output: Record<string, unknown> | undefined, depth = 0): string {
  if (!output || depth > 5) return '';
  for (const key of [
    'reply_text',
    'replyText',
    'answer',
    'content',
    'message',
    'response',
    'final_text',
    'finalText',
  ] as const) {
    const v = output[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  const t = output.text;
  if (typeof t === 'string' && t.trim()) {
    const fromJson = tryReplyTextFromJsonString(t);
    if (fromJson) return fromJson;
    return t.trim();
  }
  for (const nestKey of ['result', 'data', 'output', 'payload', 'choices'] as const) {
    const nest = output[nestKey];
    if (nest && typeof nest === 'object') {
      if (Array.isArray(nest)) {
        for (const item of nest) {
          if (item && typeof item === 'object') {
            const got = pickOutputText(item as Record<string, unknown>, depth + 1);
            if (got) return got;
          }
        }
      } else {
        const got = pickOutputText(nest as Record<string, unknown>, depth + 1);
        if (got) return got;
      }
    }
  }
  return '';
}

function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s);
}

/** 从工作流 output 中提取可播放音频 URL（兼容多种结束节点字段） */
export function extractAudioUrlFromOutput(output: unknown): string | null {
  if (!output || typeof output !== 'object') return null;
  const o = output as Record<string, unknown>;
  for (const key of ['audio_url', 'audioUrl', 'audioURL', 'tts_url', 'ttsUrl'] as const) {
    const v = o[key];
    if (typeof v === 'string' && isHttpUrl(v)) return v;
  }
  const audio = o.audio;
  if (audio && typeof audio === 'object') {
    const url = (audio as { url?: string }).url;
    if (typeof url === 'string' && isHttpUrl(url)) return url;
  }
  const text = o.text;
  if (typeof text === 'string') {
    const fromText = extractUrlFromText(text);
    if (fromText) return fromText;
    try {
      const parsed = JSON.parse(text) as unknown;
      const nested = extractAudioUrlFromOutput(parsed);
      if (nested) return nested;
      return deepFindAudioHttpUrl(parsed, 0);
    } catch {
      return deepFindAudioHttpUrl(o, 0);
    }
  }
  return deepFindAudioHttpUrl(o, 0);
}

function extractUrlFromText(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s"'<>]+\.(?:wav|mp3|m4a|aac|opus)(?:\?[^\s"'<>]*)?/i);
  return m ? m[0] : null;
}

function deepFindAudioHttpUrl(obj: unknown, depth: number): string | null {
  if (depth > 10 || obj == null) return null;
  if (typeof obj === 'string') {
    if (isHttpUrl(obj) && /\.(wav|mp3|m4a|aac|opus)(\?|$)/i.test(obj)) return obj;
    return null;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const f = deepFindAudioHttpUrl(item, depth + 1);
      if (f) return f;
    }
    return null;
  }
  if (typeof obj === 'object') {
    for (const v of Object.values(obj)) {
      const f = deepFindAudioHttpUrl(v, depth + 1);
      if (f) return f;
    }
  }
  return null;
}

export type BailianWorkflowResult = {
  text: string;
  audioUrl: string | null;
  requestId?: string;
  raw: unknown;
};

function parseJsonResponse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** 非流式：一次性返回 text + audioUrl */
export async function completeBailianWorkflowSync(
  userText: string,
  voiceId: string,
  options?: { signal?: AbortSignal }
): Promise<BailianWorkflowResult> {
  const { appId, apiKey, baseUrl } = getBailianAppConfig();
  const url = `${baseUrl}/apps/${encodeURIComponent(appId)}/completion`;
  const body = buildWorkflowCompletionBody(userText, voiceId);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), COMPLETION_TIMEOUT_MS);
  const signal = options?.signal;
  if (signal) {
    if (signal.aborted) controller.abort();
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  const rawText = await res.text();
  const parsed = parseJsonResponse(rawText);

  if (!res.ok) {
    throw new Error(
      normalizeErrorMessage(parsed, `百炼请求失败 (${res.status})：${rawText.slice(0, 400)}`)
    );
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`百炼响应解析失败：${rawText.slice(0, 300)}`);
  }

  const root = parsed as Record<string, unknown>;
  if (root.code && root.message) {
    throw new Error(normalizeErrorMessage(root, '百炼返回错误'));
  }

  const output = root.output as Record<string, unknown> | undefined;
  const text = pickOutputText(output);
  const audioUrl = extractAudioUrlFromOutput(output);
  const requestId = typeof root.request_id === 'string' ? root.request_id : undefined;

  return { text, audioUrl, requestId, raw: parsed };
}

export type StreamHandlers = {
  onTextChunk: (fullText: string) => void;
  onAudioUrl?: (url: string) => void;
};

type SseAcc = {
  text: string;
  audioUrl: string | null;
  requestId?: string;
  raw: unknown;
  /** 无 output 的 data 行里解析到的错误（流式结束时若仍无正文/音频则抛出） */
  pendingError?: string;
};

function applySseJsonPayload(data: unknown, handlers: StreamHandlers, acc: SseAcc): void {
  acc.raw = data;
  if (!data || typeof data !== 'object') return;
  const rec = data as Record<string, unknown>;
  if (typeof rec.request_id === 'string') acc.requestId = rec.request_id;
  const output = rec.output;
  if (output == null || typeof output !== 'object') {
    const codeRaw = typeof rec.code === 'string' ? rec.code.trim() : '';
    if (codeRaw === '200' || codeRaw.toLowerCase() === 'success') return;
    const err = normalizeErrorMessage(rec, '').trim();
    if (err) acc.pendingError = err;
    return;
  }
  const out = output as Record<string, unknown>;
  const t = pickOutputText(out);
  if (t) {
    acc.text = t;
    acc.pendingError = undefined;
    handlers.onTextChunk(t);
  }
  const au = extractAudioUrlFromOutput(out);
  if (au && au !== acc.audioUrl) {
    acc.audioUrl = au;
    acc.pendingError = undefined;
    handlers.onAudioUrl?.(au);
  }
}

function throwIfStreamFailed(acc: SseAcc): void {
  if (acc.pendingError && !acc.text.trim() && !acc.audioUrl) {
    throw new Error(acc.pendingError);
  }
}

function consumeSseText(sseText: string, handlers: StreamHandlers): BailianWorkflowResult {
  const acc: SseAcc = { text: '', audioUrl: null, raw: null };
  for (const eventBlock of sseText.split('\n\n')) {
    for (const line of eventBlock.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const jsonStr = trimmed.slice(5).trim();
      if (!jsonStr || jsonStr === '[DONE]') continue;
      try {
        applySseJsonPayload(JSON.parse(jsonStr), handlers, acc);
      } catch {
        /* ignore non-JSON line */
      }
    }
  }
  throwIfStreamFailed(acc);
  return {
    text: acc.text,
    audioUrl: acc.audioUrl,
    requestId: acc.requestId,
    raw: acc.raw,
  };
}

/**
 * 流式（SSE）：解析 data: 行内 JSON 的 output.text；结束时返回最终结构与音频 URL。
 * 无 getReader 时将整包 body 按 SSE 文本解析。
 */
export async function completeBailianWorkflowStream(
  userText: string,
  voiceId: string,
  handlers: StreamHandlers,
  options?: { signal?: AbortSignal }
): Promise<BailianWorkflowResult> {
  const { appId, apiKey, baseUrl } = getBailianAppConfig();
  const url = `${baseUrl}/apps/${encodeURIComponent(appId)}/completion`;
  const body = buildWorkflowCompletionBody(userText, voiceId);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), COMPLETION_TIMEOUT_MS);
  const signal = options?.signal;
  if (signal) {
    if (signal.aborted) controller.abort();
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-SSE': 'enable',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const parsed = parseJsonResponse(errText);
    throw new Error(
      normalizeErrorMessage(parsed, `百炼流式请求失败 (${res.status})：${errText.slice(0, 400)}`)
    );
  }

  const reader = res.body?.getReader?.();
  if (!reader) {
    const full = await res.text();
    const out = consumeSseText(full, handlers);
    return out;
  }

  const acc: SseAcc = { text: '', audioUrl: null, raw: null };
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';
      for (const eventBlock of parts) {
        for (const line of eventBlock.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;
          try {
            applySseJsonPayload(JSON.parse(jsonStr), handlers, acc);
          } catch {
            /* ignore */
          }
        }
      }
    }
    if (buffer.trim()) {
      for (const eventBlock of buffer.split('\n\n')) {
        for (const line of eventBlock.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;
          try {
            applySseJsonPayload(JSON.parse(jsonStr), handlers, acc);
          } catch {
            /* ignore */
          }
        }
      }
    }
  } finally {
    reader.releaseLock?.();
  }

  throwIfStreamFailed(acc);
  return {
    text: acc.text,
    audioUrl: acc.audioUrl,
    requestId: acc.requestId,
    raw: acc.raw,
  };
}

/** 本地打字机：逐字显示 fullText */
export async function runTypewriter(
  fullText: string,
  onUpdate: (visible: string) => void,
  options?: { msPerChar?: number; signal?: AbortSignal }
): Promise<void> {
  const ms = options?.msPerChar ?? 18;
  const sig = options?.signal;
  let i = 0;
  const chars = [...fullText];
  return new Promise((resolve) => {
    const tick = () => {
      if (sig?.aborted) {
        resolve();
        return;
      }
      i += 1;
      onUpdate(chars.slice(0, i).join(''));
      if (i >= chars.length) {
        resolve();
        return;
      }
      setTimeout(tick, ms);
    };
    if (chars.length === 0) {
      resolve();
      return;
    }
    tick();
  });
}
