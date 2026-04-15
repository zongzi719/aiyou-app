/**
 * Dev 工具页（仅 Web）的同步 localStorage 版 API 配置 + 直连请求。
 * 不要在 React Native 原生端使用此文件。
 */
import { PRODUCTION_API_BASE_URL } from '@/lib/devApiConfig';
import { addApiLog } from '@/src/dev/data/apiLogStore';

const KEY_BASE = 'dev_api_base_url';
const KEY_USER = 'dev_user_id';
const KEY_GLOBAL_MOCK = 'dev_global_mock';

function normalizeUrl(raw: string): string {
  const t = raw.trim().replace(/\/$/, '');
  if (!t) return t;
  if (!/^https?:\/\//i.test(t)) return `http://${t}`;
  return t;
}

export function getApiBaseUrlSync(): string {
  if (typeof localStorage === 'undefined') return PRODUCTION_API_BASE_URL;
  const v = localStorage.getItem(KEY_BASE);
  if (v?.trim()) return normalizeUrl(v);
  const e = process.env.EXPO_PUBLIC_DEV_API_BASE_URL;
  if (e?.trim()) return normalizeUrl(e);
  return PRODUCTION_API_BASE_URL;
}

export function getDevUserIdSync(): string {
  if (typeof localStorage === 'undefined') return 'a2556c1100a20b2cd93f42e6859907fd';
  return localStorage.getItem(KEY_USER)?.trim() || 'a2556c1100a20b2cd93f42e6859907fd';
}

export function getGlobalMockSync(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(KEY_GLOBAL_MOCK) === 'true';
}

export function saveDevSettings(baseUrl: string, userId: string, globalMock: boolean) {
  localStorage.setItem(KEY_BASE, baseUrl);
  localStorage.setItem(KEY_USER, userId);
  localStorage.setItem(KEY_GLOBAL_MOCK, String(globalMock));
}

export async function apiRelayWebRaw(opts: {
  path: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}): Promise<{ status: number; text: string; time: number }> {
  if (getGlobalMockSync()) {
    addApiLog({
      timestamp: Date.now(), method: opts.method || 'GET', path: opts.path,
      requestBody: opts.body, status: 200, duration: 0,
      responseBody: '{"mock":true,"message":"全局 Mock 已开启"}', success: true,
    });
    return { status: 200, text: '{"mock":true}', time: 0 };
  }

  const base = getApiBaseUrlSync();
  const path = opts.path.startsWith('/') ? opts.path : `/${opts.path}`;
  const url = `${base}${path}`;
  const method = (opts.method || 'GET').toUpperCase();
  const start = Date.now();
  const userId = getDevUserIdSync();
  const headers: Record<string, string> = { 'X-User-ID': userId, ...(opts.headers || {}) };

  let body: string | undefined;
  if (opts.body !== undefined && method !== 'GET' && method !== 'HEAD') {
    if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
    body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
  }

  try {
    const res = await fetch(url, { method, headers, body });
    const text = await res.text();
    const duration = Date.now() - start;
    addApiLog({
      timestamp: Date.now(), method, path: opts.path, requestBody: opts.body,
      status: res.status, duration,
      responseBody: text.length > 2000 ? `${text.slice(0, 2000)}…` : text,
      success: res.ok, error: res.ok ? undefined : `HTTP ${res.status}`,
    });
    return { status: res.status, text, time: duration };
  } catch (err: unknown) {
    const duration = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    addApiLog({
      timestamp: Date.now(), method, path: opts.path, requestBody: opts.body,
      status: 0, duration, success: false, error: message,
    });
    throw err;
  }
}
