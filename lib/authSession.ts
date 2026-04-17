import AsyncStorage from '@react-native-async-storage/async-storage';

import { clearAllListDataCaches } from '@/lib/listDataCache';
import { clearProfileCache } from '@/lib/profileCache';

const AUTH_TOKEN_KEY = 'luna_auth_token';
const AUTH_USER_ID_KEY = 'luna_auth_user_id';
const AUTH_TENANT_ID_KEY = 'luna_auth_tenant_id';
const AUTH_WORKSPACE_ID_KEY = 'luna_auth_workspace_id';
const REMEMBER_FLAG_KEY = 'luna_login_remember';
const REMEMBER_USERNAME_KEY = 'luna_login_saved_username';
const REMEMBER_PASSWORD_KEY = 'luna_login_saved_password';

export interface AuthSessionPayload {
  token: string;
  userId?: string;
  tenantId?: string;
  workspaceId?: string;
}

export async function persistAuthSession(payload: AuthSessionPayload): Promise<void> {
  await AsyncStorage.setItem(AUTH_TOKEN_KEY, payload.token);
  if (payload.userId?.trim()) {
    await AsyncStorage.setItem(AUTH_USER_ID_KEY, payload.userId.trim());
  } else {
    await AsyncStorage.removeItem(AUTH_USER_ID_KEY);
  }
  if (payload.tenantId?.trim()) {
    await AsyncStorage.setItem(AUTH_TENANT_ID_KEY, payload.tenantId.trim());
  } else {
    await AsyncStorage.removeItem(AUTH_TENANT_ID_KEY);
  }
  if (payload.workspaceId?.trim()) {
    await AsyncStorage.setItem(AUTH_WORKSPACE_ID_KEY, payload.workspaceId.trim());
  } else {
    await AsyncStorage.removeItem(AUTH_WORKSPACE_ID_KEY);
  }
}

export async function clearAuthSession(): Promise<void> {
  await clearProfileCache();
  clearAllListDataCaches();
  await Promise.all([
    AsyncStorage.removeItem(AUTH_TOKEN_KEY),
    AsyncStorage.removeItem(AUTH_USER_ID_KEY),
    AsyncStorage.removeItem(AUTH_TENANT_ID_KEY),
    AsyncStorage.removeItem(AUTH_WORKSPACE_ID_KEY),
  ]);
}

export async function getAuthSession(): Promise<{
  token: string | null;
  userId: string | null;
  tenantId: string | null;
  workspaceId: string | null;
}> {
  const [token, userId, tenantId, workspaceId] = await Promise.all([
    AsyncStorage.getItem(AUTH_TOKEN_KEY),
    AsyncStorage.getItem(AUTH_USER_ID_KEY),
    AsyncStorage.getItem(AUTH_TENANT_ID_KEY),
    AsyncStorage.getItem(AUTH_WORKSPACE_ID_KEY),
  ]);
  return {
    token,
    userId,
    tenantId,
    workspaceId,
  };
}

/** 私人模式后端（MOBILE_CHAT_API）要求 Header 齐全 */
export async function hasPrivateChatBackendSession(): Promise<boolean> {
  const s = await getAuthSession();
  return !!(s.token && s.userId && s.tenantId && s.workspaceId);
}

export async function getPrivateChatAuthHeaders(): Promise<Record<string, string>> {
  const s = await getAuthSession();
  if (!s.token || !s.userId || !s.tenantId || !s.workspaceId) {
    throw new Error('未登录或缺少租户/工作区信息，无法调用私人模式接口');
  }
  return {
    Authorization: `Bearer ${s.token}`,
    'X-User-ID': s.userId,
    'X-Tenant-ID': s.tenantId,
    'X-Workspace-ID': s.workspaceId,
    'Content-Type': 'application/json',
  };
}

export async function clearRememberedCredentials(): Promise<void> {
  await AsyncStorage.removeItem(REMEMBER_FLAG_KEY);
  await AsyncStorage.removeItem(REMEMBER_USERNAME_KEY);
  await AsyncStorage.removeItem(REMEMBER_PASSWORD_KEY);
}

export async function saveRememberedCredentials(username: string, password: string): Promise<void> {
  await AsyncStorage.setItem(REMEMBER_FLAG_KEY, 'true');
  await AsyncStorage.setItem(REMEMBER_USERNAME_KEY, username);
  await AsyncStorage.setItem(REMEMBER_PASSWORD_KEY, password);
}

export async function loadRememberedLogin(): Promise<{
  username: string;
  password: string;
  remember: boolean;
}> {
  const [flag, user, pass] = await Promise.all([
    AsyncStorage.getItem(REMEMBER_FLAG_KEY),
    AsyncStorage.getItem(REMEMBER_USERNAME_KEY),
    AsyncStorage.getItem(REMEMBER_PASSWORD_KEY),
  ]);
  const remember = flag === 'true';
  return {
    username: user?.trim() ?? '',
    password: pass ?? '',
    remember,
  };
}
