import { getApiBaseUrl } from '@/lib/devApiConfig';

export interface UserLoginBody {
  username: string;
  password: string;
}

export interface UserLoginSuccess {
  token: string;
  user_id?: string;
  tenant_id?: string;
  workspace_id?: string;
}

function asObject(v: unknown): Record<string, unknown> | undefined {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  return undefined;
}

function coalesceString(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

function pickToken(parsed: Record<string, unknown>): string | undefined {
  const t = parsed.token ?? parsed.access_token;
  return typeof t === 'string' && t.length > 0 ? t : undefined;
}

function pickErrorMessage(parsed: Record<string, unknown>, fallback: string): string {
  const detail = parsed.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  const message = parsed.message;
  if (typeof message === 'string' && message.trim()) return message;
  const msg = parsed.msg;
  if (typeof msg === 'string' && msg.trim()) return msg;
  return fallback;
}

/** 与 figma-vision-artist /网关常见形态对齐：user、tenancy、session、data 包装等 */
function extractLoginSuccess(parsed: Record<string, unknown>): UserLoginSuccess | null {
  const root = (() => {
    const d = asObject(parsed.data);
    if (d && (pickToken(d) || asObject(d.user))) return d;
    const r = asObject(parsed.result);
    if (r && (pickToken(r) || asObject(r.user))) return r;
    return parsed;
  })();

  const token = pickToken(root);
  if (!token) return null;

  const session = asObject(root.session);
  const tenancy = asObject(root.tenancy);
  const u = asObject(root.user) ?? root;

  let user_id = coalesceString(
    u.user_id,
    u.userId,
    session?.user_id,
    session?.userId,
    root.user_id,
    root.userId
  );

  let tenant_id = coalesceString(
    tenancy?.tenant_id,
    tenancy?.tenantId,
    u.tenant_id,
    u.tenantId,
    root.tenant_id,
    root.tenantId
  );

  let workspace_id = coalesceString(
    tenancy?.workspace_id,
    tenancy?.workspaceId,
    u.workspace_id,
    u.workspaceId,
    root.workspace_id,
    root.workspaceId
  );

  const fromJwt = tryClaimsFromJwt(token);
  user_id = user_id || fromJwt.user_id;
  tenant_id = tenant_id || fromJwt.tenant_id;
  workspace_id = workspace_id || fromJwt.workspace_id;

  return { token, user_id, tenant_id, workspace_id };
}

async function enrichSessionFromAuthMe(
  base: string,
  session: UserLoginSuccess
): Promise<UserLoginSuccess> {
  const { token, user_id, tenant_id, workspace_id } = session;
  if (user_id && tenant_id && workspace_id) return session;

  const url = `${base.replace(/\/$/, '')}/api/auth/me`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    const text = await res.text();
    if (!res.ok || !text) return session;
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const root = asObject(parsed.data) ?? parsed;
    const tenancy = asObject(root.tenancy);
    const u = asObject(root.user) ?? root;

    return {
      token,
      user_id: user_id || coalesceString(u.user_id, u.userId, root.user_id, root.userId),
      tenant_id:
        tenant_id ||
        coalesceString(
          tenancy?.tenant_id,
          tenancy?.tenantId,
          u.tenant_id,
          u.tenantId,
          root.tenant_id
        ),
      workspace_id:
        workspace_id ||
        coalesceString(
          tenancy?.workspace_id,
          tenancy?.workspaceId,
          u.workspace_id,
          u.workspaceId,
          root.workspace_id
        ),
    };
  } catch {
    return session;
  }
}

function sessionComplete(s: UserLoginSuccess): boolean {
  return !!(s.user_id && s.tenant_id && s.workspace_id);
}

/** 不校验签名，仅从 JWT payload 取常见 claim（部分网关只返回 token） */
function tryClaimsFromJwt(token: string): {
  user_id?: string;
  tenant_id?: string;
  workspace_id?: string;
} {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return {};
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    b64 += pad;
    const atobGlobal = globalThis.atob as ((s: string) => string) | undefined;
    if (!atobGlobal) return {};
    const json = atobGlobal(b64);
    const o = asObject(JSON.parse(json));
    if (!o) return {};
    return {
      user_id: coalesceString(o.sub, o.user_id, o.userId, o.uid),
      tenant_id: coalesceString(o.tenant_id, o.tenantId),
      workspace_id: coalesceString(o.workspace_id, o.workspaceId, o.ws_id),
    };
  } catch {
    return {};
  }
}

function serializeUnknownError(e: unknown): string {
  if (e instanceof Error) {
    const x = e as Error & { code?: string };
    return [x.name, x.message, x.code].filter(Boolean).join(' | ');
  }
  return String(e);
}

/** 走 RN 原生 Networking，与 Expo Winter fetch 不同栈；fetch 报 Network request failed 时常能救 */
function postLoginWithXHR(
  url: string,
  payload: { username: string; password: string }
): Promise<{ status: number; text: string }> {
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.timeout = 30000;
    xhr.onerror = () => reject(new Error('XMLHttpRequest 失败（onerror）'));
    xhr.ontimeout = () => reject(new Error('XMLHttpRequest 超时'));
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText ?? '' });
    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(body);
  });
}

/**
 * POST /api/auth/user-login — 直连后端，不附带 dev 联调的 X-User-ID。
 */
export async function postUserLogin(
  body: UserLoginBody
): Promise<{ ok: true; data: UserLoginSuccess } | { ok: false; message: string }> {
  const base = await getApiBaseUrl();
  const url = `${base}/api/auth/user-login`;
  const jsonBody = { username: body.username.trim(), password: body.password };

  let res: Response;
  let fetchErrorDetail = '';
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(jsonBody),
    });
  } catch (e) {
    fetchErrorDetail = serializeUnknownError(e);
    try {
      const xhrResult = await postLoginWithXHR(url, jsonBody);
      return await finalizeLogin(base, xhrResult.status, xhrResult.text);
    } catch (xhrErr) {
      const xhrDetail = serializeUnknownError(xhrErr);
      return {
        ok: false,
        message: [
          `无法连接登录服务器（${url}）。`,
          '说明：fetch 与 XMLHttpRequest 都失败，多半是模拟器/系统连不上该地址（网络、端口被拦、或当前 iOS 模拟器对外网 IP 异常）。',
          `方式① fetch：${fetchErrorDetail || '失败'}`,
          `方式② XMLHttpRequest：${xhrDetail}`,
          '',
          '【你在 Mac 上可先试】打开「终端」粘贴回车，看最后一行是否是 401（能通）还是报错/一直卡住：',
          `curl -sS -o /dev/null -w "%{http_code}\\n" -X POST "${url}" -H "Content-Type: application/json" -d '{"username":"test","password":"test"}'`,
          '',
          '【默认】根目录 .env 设置 EXPO_PUBLIC_DEV_API_BASE_URL=https://aiyou.ontuotu.com 后重新编译 App。',
          '【备选】若仅模拟器不通而 Mac 上 curl 能通，可试 npm run dev:api-proxy，并把 API 改为 Mac 局域网 IP:端口（勿用 127.0.0.1）。',
        ].join('\n'),
      };
    }
  }

  const text = await res.text();
  return await finalizeLogin(base, res.status, text);
}

async function finalizeLogin(
  base: string,
  status: number,
  text: string
): Promise<{ ok: true; data: UserLoginSuccess } | { ok: false; message: string }> {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return { ok: false, message: text.slice(0, 200) || `HTTP ${status}` };
  }

  if (status < 200 || status >= 300) {
    return { ok: false, message: pickErrorMessage(parsed, `HTTP ${status}`) };
  }

  let data = extractLoginSuccess(parsed);
  if (!data) {
    return { ok: false, message: 'Invalid response: missing token' };
  }

  if (!sessionComplete(data)) {
    data = await enrichSessionFromAuthMe(base, data);
  }

  return { ok: true, data };
}
