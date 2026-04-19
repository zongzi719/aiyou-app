export type NlsDevTokenResponse = {
  token: string;
  expireTime?: number;
  appkey?: string;
};

/**
 * 拉取开发机 Token 服务（dev-servers/aliyun-nls-token）返回的 JSON。
 */
export async function fetchNlsDevToken(baseUrl: string): Promise<NlsDevTokenResponse> {
  const url = `${baseUrl.replace(/\/$/, '')}/nls/token`;
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
