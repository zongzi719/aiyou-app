export type NlsDevTokenResponse = {
  token: string;
  expireTime?: number;
  appkey?: string;
};

/** 支持 `https://host` 或已带路径的 `https://host/nls/token`（避免重复拼接） */
function resolveNlsTokenEndpoint(baseOrFull: string): string {
  const s = baseOrFull.trim().replace(/\/$/, '');
  if (s.endsWith('/nls/token')) {
    return s;
  }
  return `${s}/nls/token`;
}

/**
 * 拉取 Token 服务（本地 dev-servers 或线上网关）返回的 JSON。
 */
export async function fetchNlsDevToken(baseUrl: string): Promise<NlsDevTokenResponse> {
  const url = resolveNlsTokenEndpoint(baseUrl);
  const r = await fetch(url);
  const text = await r.text();
  let j: unknown;
  try {
    j = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Token 响应非 JSON: ${text.slice(0, 200)}`);
  }
  const obj = j as { error?: string; token?: string; expireTime?: number; appkey?: string };
  if (!r.ok) {
    throw new Error(obj.error || `Token HTTP ${r.status}`);
  }
  if (obj.error) {
    throw new Error(obj.error);
  }
  if (!obj.token || typeof obj.token !== 'string') {
    throw new Error('响应缺少 token');
  }
  return {
    token: obj.token,
    expireTime: typeof obj.expireTime === 'number' ? obj.expireTime : undefined,
    appkey: typeof obj.appkey === 'string' ? obj.appkey : undefined,
  };
}
