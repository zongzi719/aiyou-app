import AsyncStorage from '@react-native-async-storage/async-storage';

import { addApiLog } from '@/src/dev/data/apiLogStore';

const KEY_BASE = 'dev_api_base_url';
const KEY_USER = 'dev_user_id';
const KEY_GLOBAL_MOCK = 'dev_global_mock';

const FALLBACK_BASE = 'http://47.242.248.240:2026';

/** 补全 `http(s)://`，避免仅保存 `host:port` 时 fetch 变成非法相对 URL导致 Network request failed */
export function normalizeApiBaseUrl(raw: string): string {
  const t = raw.trim().replace(/\/$/, '');
  if (!t) return t;
  if (!/^https?:\/\//i.test(t)) return `http://${t}`;
  return t;
}

export async function getApiBaseUrl(): Promise<string> {
  const v = await AsyncStorage.getItem(KEY_BASE);
  if (v?.trim()) return normalizeApiBaseUrl(v);
  const e = process.env.EXPO_PUBLIC_DEV_API_BASE_URL;
  if (e?.trim()) return normalizeApiBaseUrl(e);
  return FALLBACK_BASE;
}

export async function getDevUserId(): Promise<string> {
  const v = await AsyncStorage.getItem(KEY_USER);
  return v?.trim() ? v.trim() : 'a2556c1100a20b2cd93f42e6859907fd';
}

export async function getGlobalMock(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEY_GLOBAL_MOCK)) === 'true';
}

/**
 * RN 直连后端（无浏览器混合内容限制）。开发工具与联调时使用；请求写入 apiLogStore。
 */
export async function apiDirectRaw(opts: {
  path: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}): Promise<{ status: number; text: string; time: number }> {
  if (await getGlobalMock()) {
    const time = 0;
    addApiLog({
      timestamp: Date.now(),
      method: opts.method || 'GET',
      path: opts.path,
      requestBody: opts.body,
      status: 200,
      duration: time,
      responseBody: '{"mock":true,"message":"全局 Mock 已开启，未发起网络请求"}',
      success: true,
    });
    return { status: 200, text: '{"mock":true}', time };
  }

  const base = await getApiBaseUrl();
  const path = opts.path.startsWith('/') ? opts.path : `/${opts.path}`;
  const url = `${base.replace(/\/$/, '')}${path}`;
  const method = (opts.method || 'GET').toUpperCase();
  const start = Date.now();
  const userId = await getDevUserId();

  const headers: Record<string, string> = {
    'X-User-ID': userId,
    ...(opts.headers || {}),
  };

  let body: string | undefined;
  if (opts.body !== undefined && method !== 'GET' && method !== 'HEAD') {
    if (!headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }
    body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
  }

  try {
    const res = await fetch(url, { method, headers, body });
    const text = await res.text();
    const duration = Date.now() - start;

    addApiLog({
      timestamp: Date.now(),
      method,
      path: opts.path,
      requestBody: opts.body,
      status: res.status,
      duration,
      responseBody: text.length > 2000 ? `${text.slice(0, 2000)}…` : text,
      success: res.ok,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    });

    return { status: res.status, text, time: duration };
  } catch (err: unknown) {
    const duration = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    addApiLog({
      timestamp: Date.now(),
      method,
      path: opts.path,
      requestBody: opts.body,
      status: 0,
      duration,
      success: false,
      error: message,
    });
    throw err;
  }
}
