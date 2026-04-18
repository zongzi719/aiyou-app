import { getAuthSession } from '@/lib/authSession';
import { getApiBaseUrl, getDevUserId } from '@/lib/devApiConfig';

export type AsrWsMode = 'chat' | 'notes';

/**
 * ws[s]://{host}/api/asr/ws?mode=chat|notes&token=…&user_id=…
 * Query 参数便于 RN WebSocket 在无法带 Header 时完成鉴权。
 */
export async function getAsrWebSocketUrl(mode: AsrWsMode): Promise<string> {
  const base = await getApiBaseUrl();
  const trimmed = base.replace(/\/$/, '');
  let origin: URL;
  try {
    origin = new URL(trimmed.startsWith('http') ? trimmed : `http://${trimmed}`);
  } catch {
    origin = new URL('http://localhost');
  }
  const wsProto = origin.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = new URL('/api/asr/ws', `${wsProto}//${origin.host}`);
  url.searchParams.set('mode', mode);

  const session = await getAuthSession();
  const token = session.token?.trim();
  if (token) {
    url.searchParams.set('token', token);
  }
  const userId = session.userId?.trim() || (await getDevUserId());
  url.searchParams.set('user_id', userId);
  if (session.tenantId?.trim()) {
    url.searchParams.set('tenant_id', session.tenantId.trim());
  }
  if (session.workspaceId?.trim()) {
    url.searchParams.set('workspace_id', session.workspaceId.trim());
  }

  return url.toString();
}
