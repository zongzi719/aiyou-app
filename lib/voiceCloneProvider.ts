export type VoiceCloneProvider = 'aliyun' | 'tencent';

/**
 * 声音复刻通道：默认 aliyun（OSS + CosyVoice）；设为 tencent 时使用腾讯云 VRS。
 * .env: EXPO_PUBLIC_VOICE_CLONE_PROVIDER=aliyun | tencent
 */
export function getVoiceCloneProvider(): VoiceCloneProvider {
  const raw = process.env.EXPO_PUBLIC_VOICE_CLONE_PROVIDER?.trim().toLowerCase();
  if (raw === 'tencent') return 'tencent';
  return 'aliyun';
}
