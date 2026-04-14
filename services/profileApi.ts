import { getApiBaseUrl } from '@/lib/devApiConfig';
import { getAuthSession } from '@/lib/authSession';

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
}

export interface UpdateProfileBody {
  display_name?: string;
  bio?: string;
  tags?: string[];
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
  const json = await res.json() as { user: UserProfile };
  return json.user;
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
  const json = await res.json() as { user: UserProfile };
  return json.user;
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
  const json = await res.json() as { user: UserProfile };
  return json.user;
}

/** 防止 OSS 缓存旧头像，URL 末尾追加时间戳 */
export function bustAvatarCache(url: string): string {
  if (!url) return url;
  return `${url}?t=${Date.now()}`;
}
