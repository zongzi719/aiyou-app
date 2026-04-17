import AsyncStorage from '@react-native-async-storage/async-storage';

import type { UserProfile } from '@/services/profileApi';

const PROFILE_CACHE_KEY = 'luna_user_profile_cache_v1';

let memory: UserProfile | null = null;

export function peekProfileCache(): UserProfile | null {
  return memory;
}

/** 从本地恢复资料到内存（用于侧栏等首屏避免缺省闪屏） */
export async function hydrateProfileCache(): Promise<void> {
  if (memory != null) return;
  try {
    const raw = await AsyncStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as UserProfile;
    if (parsed && typeof parsed.user_id === 'string') {
      memory = parsed;
    }
  } catch {
    /* ignore */
  }
}

export function putProfileCache(profile: UserProfile): void {
  memory = profile;
  void AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile)).catch(() => {});
}

export async function clearProfileCache(): Promise<void> {
  memory = null;
  await AsyncStorage.removeItem(PROFILE_CACHE_KEY);
}
