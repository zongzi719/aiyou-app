import type { UserProfile } from '@/services/profileApi';

let memory: UserProfile | null = null;

export function peekProfileCache(): UserProfile | null {
  return memory;
}

export function putProfileCache(profile: UserProfile): void {
  memory = profile;
}

export function clearProfileCache(): void {
  memory = null;
}
