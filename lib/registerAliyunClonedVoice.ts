import { uploadRegisterVoiceRecording } from '@/lib/aliyunOssUpload';
import { createAliyunVoiceFromUrl, waitForAliyunVoiceReady } from '@/lib/aliyunVoiceApi';
import { putProfileCache } from '@/lib/profileCache';
import { updateProfile } from '@/services/profileApi';

/** CosyVoice：prefix 仅数字+小写字母，长度 < 10 */
function buildVoicePrefix(): string {
  const raw = `v${Date.now().toString(36)}`.toLowerCase().replace(/[^a-z0-9]/g, 'x');
  return raw.slice(0, 9);
}

export type CloneAliyunVoiceOptions = {
  localUri: string;
  userId: string;
  onStatus?: (text: string) => void;
};

/** 录音 → OSS → CosyVoice → 轮询 OK（不写资料，便于与 persistVoiceIdAndContinue 统一落库） */
export async function cloneAliyunVoiceFromLocalRecording(
  options: CloneAliyunVoiceOptions
): Promise<{ voiceId: string; publicUrl: string; objectKey: string }> {
  const { localUri, userId, onStatus } = options;

  onStatus?.('正在上传录音到 OSS…');
  const { publicUrl, objectKey } = await uploadRegisterVoiceRecording({
    localUri,
    userId,
    publicReadAcl: true,
  });

  onStatus?.('正在提交声音复刻任务…');
  const created = await createAliyunVoiceFromUrl({
    audioUrl: publicUrl,
    prefix: buildVoicePrefix(),
  });

  onStatus?.(`音色处理中：${created.voiceId}…`);
  const ready = await waitForAliyunVoiceReady(created.voiceId, {
    timeoutMs: 6 * 60 * 1000,
    intervalMs: 8_000,
    onProgress: (status) => onStatus?.(`音色处理中：${status}`),
  });

  return { voiceId: ready.voiceId, publicUrl, objectKey };
}

export type RegisterAliyunClonedVoiceOptions = CloneAliyunVoiceOptions;

/**
 * 录音 → OSS（regesiter_voice/{userId}/…）→ 公网 URL → CosyVoice 创建音色 → 轮询 OK → PATCH 资料 voice_id
 */
export async function registerAliyunClonedVoiceFromRecording(
  options: RegisterAliyunClonedVoiceOptions
): Promise<{ voiceId: string; publicUrl: string; objectKey: string }> {
  const { voiceId, publicUrl, objectKey } = await cloneAliyunVoiceFromLocalRecording(options);

  options.onStatus?.('正在保存 voice_id 到个人资料…');
  const profile = await updateProfile({ voice_id: voiceId });
  putProfileCache(profile);

  return { voiceId, publicUrl, objectKey };
}
