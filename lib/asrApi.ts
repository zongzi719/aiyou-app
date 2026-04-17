import { getAuthSession } from '@/lib/authSession';
import { getApiBaseUrl, getDevUserId, getGlobalMock } from '@/lib/devApiConfig';
import { addApiLog } from '@/src/dev/data/apiLogStore';

export class AsrApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AsrApiError';
    this.status = status;
  }
}

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

async function buildAsrHeaders(): Promise<Record<string, string>> {
  const session = await getAuthSession();
  const h: Record<string, string> = {
    Accept: 'application/json',
  };
  if (session.token?.trim()) {
    h.Authorization = `Bearer ${session.token.trim()}`;
  }
  if (session.userId?.trim()) {
    h['X-User-ID'] = session.userId.trim();
  } else {
    h['X-User-ID'] = await getDevUserId();
  }
  if (session.tenantId?.trim()) {
    h['X-Tenant-ID'] = session.tenantId.trim();
  }
  if (session.workspaceId?.trim()) {
    h['X-Workspace-ID'] = session.workspaceId.trim();
  }
  return h;
}

function parseJson(text: string): Record<string, unknown> | null {
  if (!text.trim()) return null;
  try {
    const v = JSON.parse(text) as unknown;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function errorMessageFromBody(
  status: number,
  text: string,
  json: Record<string, unknown> | null
): string {
  const err = json?.error;
  if (typeof err === 'string' && err.trim()) return err.trim();
  const detail = json?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail.trim();
  const t = text.trim();
  if (t && t.length < 400) return t;
  if (status === 400) return '请求无效，请检查录音文件';
  if (status === 401 || status === 403) return '需要登录后再使用语音识别';
  if (status >= 500) return '语音识别服务暂时不可用';
  return `语音识别失败（HTTP ${status}）`;
}

async function postAudioMultipart(
  path: '/api/asr' | '/api/asr-notes',
  audioUri: string
): Promise<{ status: number; text: string; duration: number }> {
  if (await getGlobalMock()) {
    const duration = 0;
    const bodyObj =
      path === '/api/asr-notes'
        ? {
            text: '（Mock）灵感笔记语音识别占位文本',
            audio_url: 'https://example.com/mock-note.m4a',
          }
        : { text: '（Mock）对话语音识别占位文本' };
    const responseBody = JSON.stringify(bodyObj);
    addApiLog({
      timestamp: Date.now(),
      method: 'POST',
      path,
      requestBody: '[multipart audio — mock]',
      status: 200,
      duration,
      responseBody,
      success: true,
    });
    return { status: 200, text: responseBody, duration };
  }

  const base = await getApiBaseUrl();
  const url = joinUrl(base, path);
  const headers = await buildAsrHeaders();
  const formData = new FormData();
  formData.append('audio', {
    uri: audioUri,
    type: 'audio/mp4',
    name: 'recording.m4a',
  } as any);

  const start = Date.now();
  const res = await fetch(url, { method: 'POST', headers, body: formData });
  const text = await res.text();
  const duration = Date.now() - start;

  addApiLog({
    timestamp: Date.now(),
    method: 'POST',
    path,
    requestBody: '[multipart audio]',
    status: res.status,
    duration,
    responseBody: text.length > 2000 ? `${text.slice(0, 2000)}…` : text,
    success: res.ok,
    error: res.ok ? undefined : `HTTP ${res.status}`,
  });

  return { status: res.status, text, duration };
}

/** 主对话输入：POST /api/asr → { text } */
export async function transcribeChatAudio(audioUri: string): Promise<string> {
  const { status, text } = await postAudioMultipart('/api/asr', audioUri);
  const json = parseJson(text);
  if (status >= 200 && status < 300) {
    const t = json?.text;
    return typeof t === 'string' ? t : '';
  }
  throw new AsrApiError(errorMessageFromBody(status, text, json), status);
}

export type NotesAsrResult = {
  text: string;
  audio_url: string | null;
};

/** 灵感笔记：POST /api/asr-notes → { text, audio_url } */
export async function transcribeNotesAudio(audioUri: string): Promise<NotesAsrResult> {
  const { status, text } = await postAudioMultipart('/api/asr-notes', audioUri);
  const json = parseJson(text);
  if (status >= 200 && status < 300) {
    const t = json?.text;
    const u = json?.audio_url;
    return {
      text: typeof t === 'string' ? t : '',
      audio_url: typeof u === 'string' && u.trim() ? u.trim() : null,
    };
  }
  throw new AsrApiError(errorMessageFromBody(status, text, json), status);
}
