import { getAuthSession } from '@/lib/authSession';
import { getApiBaseUrl } from '@/lib/devApiConfig';

export interface UserProfile {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  bio: string;
  tags: string[];
  role: string;
  tenant_id: string;
  workspace_id: string;
  voice_id?: string;
}

/** 接口可能返回 camelCase 的 voiceId，统一归一到 voice_id */
type UserProfileWire = UserProfile & { voiceId?: string };

function normalizeProfileUser(user: UserProfileWire): UserProfile {
  const merged = user.voice_id?.trim() || user.voiceId?.trim() || undefined;
  const { voiceId: _omitVoiceId, ...rest } = user;
  return merged != null ? { ...rest, voice_id: merged } : rest;
}

export interface UpdateProfileBody {
  display_name?: string;
  avatar_url?: string;
  bio?: string;
  tags?: string[];
  voice_id?: string;
}

/** 「我的」与 AI CEO 顶部标签：与资料页一致的两枚胶囊文案默认值 */
export const DEFAULT_PROFILE_DISPLAY_TAGS: [string, string] = [
  '创始人 · 科技创业者',
  'AI · 互联网 · SaaS',
];

export function resolveProfileDisplayTagPills(tags: string[] | undefined | null): string[] {
  const fromApi = tags?.filter(Boolean) ?? [];
  if (fromApi.length >= 2) return fromApi.slice(0, 2);
  if (fromApi.length === 1) return [fromApi[0], DEFAULT_PROFILE_DISPLAY_TAGS[1]];
  return [...DEFAULT_PROFILE_DISPLAY_TAGS];
}

export function formatAiLearningDataLine(docCount: number, conversationCount: number): string {
  return `AI学习数据 - ${docCount}份资料 - ${conversationCount}次访谈对话`;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { token } = await getAuthSession();
  if (!token) throw new Error('未登录');
  return {
    Authorization: `Bearer ${token}`,
    'x-auth-token': token,
    'Content-Type': 'application/json',
  };
}

async function getBaseUrl(): Promise<string> {
  return (await getApiBaseUrl()).replace(/\/$/, '');
}

/** GET /api/auth/profile */
export async function fetchProfile(): Promise<UserProfile> {
  const [base, headers] = await Promise.all([getBaseUrl(), getAuthHeaders()]);
  const res = await fetch(`${base}/api/auth/profile`, { headers });
  if (!res.ok) throw new Error(`获取资料失败 (${res.status})`);
  const json = (await res.json()) as { user: UserProfileWire };
  return normalizeProfileUser(json.user);
}

/** PATCH /api/auth/profile */
export async function updateProfile(body: UpdateProfileBody): Promise<UserProfile> {
  const [base, headers] = await Promise.all([getBaseUrl(), getAuthHeaders()]);
  const res = await fetch(`${base}/api/auth/profile`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`保存失败 (${res.status})`);
  const json = (await res.json()) as { user: UserProfileWire };
  return normalizeProfileUser(json.user);
}

/** POST /api/auth/avatar — multipart/form-data */
export async function uploadAvatar(uri: string, mimeType = 'image/jpeg'): Promise<UserProfile> {
  const [base, session] = await Promise.all([getBaseUrl(), getAuthSession()]);
  if (!session.token) throw new Error('未登录');

  const filename = `avatar_${Date.now()}.jpg`;
  const formData = new FormData();
  formData.append('file', { uri, name: filename, type: mimeType } as unknown as Blob);

  const res = await fetch(`${base}/api/auth/avatar`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.token}`,
      'x-auth-token': session.token,
    },
    body: formData,
  });
  if (!res.ok) throw new Error(`头像上传失败 (${res.status})`);
  const json = (await res.json()) as { user: UserProfileWire };
  return normalizeProfileUser(json.user);
}

/** 防止 OSS 缓存旧头像，URL 末尾追加时间戳 */
export function bustAvatarCache(url: string): string {
  if (!url) return url;
  return `${url}?t=${Date.now()}`;
}
