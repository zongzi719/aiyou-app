import * as CryptoJS from 'crypto-js';
import * as FileSystem from 'expo-file-system/legacy';

const TENCENT_VRS_HOST = 'vrs.tencentcloudapi.com';
const TENCENT_VRS_ENDPOINT = `https://${TENCENT_VRS_HOST}`;
const TENCENT_VRS_SERVICE = 'vrs';
const TENCENT_VRS_VERSION = '2020-08-24';
const DEFAULT_REGION = 'ap-guangzhou';

type DetectAudioResponse = {
  Response?: {
    Data?: {
      AudioId?: string;
      DetectionCode?: number;
      DetectionMsg?: string;
    };
    RequestId?: string;
    Error?: { Code?: string; Message?: string };
  };
};

type TrainingTextItem = {
  TextId?: string;
  Text?: string;
};

type GetTrainingTextResponse = {
  Response?: {
    Data?: {
      TrainingTextList?: TrainingTextItem[];
    };
    RequestId?: string;
    Error?: { Code?: string; Message?: string };
  };
};

type CreateVRSTaskResponse = {
  Response?: {
    Data?: {
      TaskId?: string;
    };
    RequestId?: string;
    Error?: { Code?: string; Message?: string };
  };
};

export type DescribeVRSTaskStatusData = {
  TaskId?: string;
  Status?: number;
  StatusStr?: string;
  VoiceType?: number;
  FastVoiceType?: string;
  ErrorMsg?: string;
};

export function getVoiceCloneStatusLabel(status: number, statusText?: string): string {
  const normalized = statusText?.trim();
  switch (status) {
    case 0:
      return normalized || '排队中';
    case 1:
      return normalized || '训练中';
    case 2:
      return normalized || '训练成功';
    case 3:
      return normalized || '训练失败';
    default:
      return normalized || `未知状态(${status})`;
  }
}

type DescribeVRSTaskStatusResponse = {
  Response?: {
    Data?: DescribeVRSTaskStatusData;
    RequestId?: string;
    Error?: { Code?: string; Message?: string };
  };
};

export class VoiceCloneDetectError extends Error {
  rawMessage?: string;
  requestId?: string;
  detectionCode?: number;

  constructor(
    message: string,
    options?: { rawMessage?: string; requestId?: string; detectionCode?: number }
  ) {
    super(message);
    this.name = 'VoiceCloneDetectError';
    this.rawMessage = options?.rawMessage;
    this.requestId = options?.requestId;
    this.detectionCode = options?.detectionCode;
  }
}

function getTencentVoiceConfig() {
  const secretId = process.env.EXPO_PUBLIC_TENCENT_VOICE_SECRET_ID?.trim();
  const secretKey = process.env.EXPO_PUBLIC_TENCENT_VOICE_SECRET_KEY?.trim();
  const region = process.env.EXPO_PUBLIC_TENCENT_VOICE_REGION?.trim() || DEFAULT_REGION;
  const textId = process.env.EXPO_PUBLIC_TENCENT_VOICE_TEXT_ID?.trim();
  if (!secretId || !secretKey) {
    throw new Error(
      '未配置腾讯云声音复刻密钥，请在 .env 设置 EXPO_PUBLIC_TENCENT_VOICE_SECRET_ID 和 EXPO_PUBLIC_TENCENT_VOICE_SECRET_KEY'
    );
  }
  return { secretId, secretKey, region, textId };
}

function normalizeTencentApiError(rawMessage: string): string {
  const msg = rawMessage?.trim() || '腾讯云接口调用失败';
  const lower = msg.toLowerCase();
  if (
    lower.includes('vrs service is not open') ||
    lower.includes('no quota remains') ||
    lower.includes('quota')
  ) {
    return '腾讯云声音复刻服务未开通，或配额已耗尽。请在腾讯云控制台开通 VRS 服务并检查可用配额后重试。';
  }
  const isAuthDenied =
    lower.includes('not authorized to perform operation') ||
    lower.includes('cam policies') ||
    lower.includes('has no permission');
  if (!isAuthDenied) return msg;

  if (msg.includes('vrs:DetectEnvAndSoundQuality')) {
    return '腾讯云权限不足：缺少 vrs:DetectEnvAndSoundQuality（音质检测）权限，请在 CAM 中为当前密钥授权。';
  }
  if (msg.includes('vrs:CreateVRSTask')) {
    return '腾讯云权限不足：缺少 vrs:CreateVRSTask（创建复刻任务）权限，请在 CAM 中为当前密钥授权。';
  }
  if (msg.includes('vrs:DescribeVRSTaskStatus')) {
    return '腾讯云权限不足：缺少 vrs:DescribeVRSTaskStatus（查询任务结果）权限，请在 CAM 中为当前密钥授权。';
  }
  return '腾讯云权限不足：当前密钥无权调用声音复刻接口，请在 CAM 中补充 VRS 相关权限。';
}

function sha256Hex(content: string): string {
  return CryptoJS.SHA256(content).toString(CryptoJS.enc.Hex);
}

function hmacSha256(content: string, key: CryptoJS.lib.WordArray | string): CryptoJS.lib.WordArray {
  return CryptoJS.HmacSHA256(content, key);
}

function toUnixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function getDateFromTimestamp(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

function buildAuthorization(
  action: string,
  bodyJson: string,
  timestamp: number,
  secretId: string,
  secretKey: string
): string {
  const date = getDateFromTimestamp(timestamp);
  const canonicalHeaders =
    `content-type:application/json; charset=utf-8\nhost:${TENCENT_VRS_HOST}\n` +
    `x-tc-action:${action.toLowerCase()}\n`;
  const signedHeaders = 'content-type;host;x-tc-action';
  const canonicalRequest = [
    'POST',
    '/',
    '',
    canonicalHeaders,
    signedHeaders,
    sha256Hex(bodyJson),
  ].join('\n');
  const credentialScope = `${date}/${TENCENT_VRS_SERVICE}/tc3_request`;
  const stringToSign = [
    'TC3-HMAC-SHA256',
    String(timestamp),
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const secretDate = hmacSha256(date, `TC3${secretKey}`);
  const secretService = hmacSha256(TENCENT_VRS_SERVICE, secretDate);
  const secretSigning = hmacSha256('tc3_request', secretService);
  const signature = hmacSha256(stringToSign, secretSigning).toString(CryptoJS.enc.Hex);

  return [
    `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(', ');
}

async function requestTencentApi<T extends { Response?: { Error?: { Message?: string } } }>(
  action:
    | 'GetTrainingText'
    | 'DetectEnvAndSoundQuality'
    | 'CreateVRSTask'
    | 'DescribeVRSTaskStatus',
  body: Record<string, unknown>
): Promise<T> {
  const { secretId, secretKey, region } = getTencentVoiceConfig();
  const timestamp = toUnixSeconds();
  const bodyJson = JSON.stringify(body);
  const authorization = buildAuthorization(action, bodyJson, timestamp, secretId, secretKey);

  const response = await fetch(TENCENT_VRS_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json; charset=utf-8',
      Host: TENCENT_VRS_HOST,
      'X-TC-Action': action,
      'X-TC-Version': TENCENT_VRS_VERSION,
      'X-TC-Region': region,
      'X-TC-Timestamp': String(timestamp),
    },
    body: bodyJson,
  });

  const text = await response.text();
  let parsed: T;
  try {
    parsed = JSON.parse(text) as T;
  } catch {
    throw new Error(`腾讯云响应解析失败：${text.slice(0, 300)}`);
  }

  if (!response.ok) {
    throw new Error(`腾讯云请求失败 (${response.status})：${text.slice(0, 300)}`);
  }
  const err = parsed.Response?.Error;
  if (err?.Message) {
    throw new Error(normalizeTencentApiError(err.Message));
  }
  return parsed;
}

function getCodecFromUri(audioUri: string): 'wav' | 'mp3' | 'aac' | 'm4a' {
  const ext = audioUri.split('.').pop()?.toLowerCase();
  if (ext === 'wav' || ext === 'mp3' || ext === 'aac') return ext;
  return 'm4a';
}

let cachedTrainingText:
  | {
      textId: string;
      text: string;
      fetchedAt: number;
    }
  | null = null;
const TRAINING_TEXT_CACHE_MS = 5 * 60 * 1000;

export function clearVoiceCloneTrainingTextCache(): void {
  cachedTrainingText = null;
}

function shouldRetryForTextId(error: unknown): boolean {
  const msg = error instanceof Error ? error.message.toLowerCase() : '';
  return (
    msg.includes('textid') &&
    (msg.includes('expires') || msg.includes('invalid') || msg.includes('used once'))
  );
}

function isTextIdMessage(message?: string): boolean {
  const msg = message?.toLowerCase() || '';
  return (
    msg.includes('textid') &&
    (msg.includes('expires') || msg.includes('invalid') || msg.includes('used once'))
  );
}

function normalizeDetectionMessage(message?: string): string {
  const raw = message?.trim();
  if (!raw) return '音频质量未通过检测，请重新录制后再试';
  const lower = raw.toLowerCase();
  if (isTextIdMessage(raw)) {
    return '语音文本凭证已失效，系统已自动刷新，请重试。';
  }
  if (
    lower.includes('audio duration exceeds the maximum limit') ||
    (lower.includes('duration') && lower.includes('maximum'))
  ) {
    return '录音时长超过上限，请缩短后重试（建议 10 秒内）。';
  }
  if (
    lower.includes('voice detection failed') ||
    lower.includes('quality score') ||
    lower.includes('machine read') ||
    lower.includes('fast read') ||
    lower.includes('normal read')
  ) {
    return '音频质量检测未通过：请用自然语速、清晰发音朗读，避免过快、机械式朗读或环境噪音后重试。';
  }
  if (lower.includes('voicenotqualified') || lower.includes('音频质量差')) {
    return '音频质量不达标：请在安静环境中重录，保持麦克风距离稳定并使用自然语速。';
  }
  return raw;
}

function extractAudioIdFromDetectResult(detect: DetectAudioResponse): string {
  const data = detect.Response?.Data;
  const requestId = detect.Response?.RequestId?.trim();
  if (typeof data?.DetectionCode === 'number' && data.DetectionCode !== 0) {
    throw new VoiceCloneDetectError(normalizeDetectionMessage(data.DetectionMsg), {
      rawMessage: data.DetectionMsg?.trim(),
      requestId,
      detectionCode: data.DetectionCode,
    });
  }
  const audioId = data?.AudioId?.trim();
  if (!audioId) {
    throw new VoiceCloneDetectError(normalizeDetectionMessage(data?.DetectionMsg || '音频检测未返回 AudioId'), {
      rawMessage: data?.DetectionMsg?.trim(),
      requestId,
      detectionCode: data?.DetectionCode,
    });
  }
  return audioId;
}

async function detectEnvAndSoundQualityWithTextId(params: {
  textId: string;
  audioData: string;
  codec: 'wav' | 'mp3' | 'aac' | 'm4a';
  taskType: number;
}): Promise<DetectAudioResponse> {
  return requestTencentApi<DetectAudioResponse>('DetectEnvAndSoundQuality', {
    TextId: params.textId,
    AudioData: params.audioData,
    TypeId: 2,
    Codec: params.codec,
    SampleRate: 48000,
    TaskType: params.taskType,
  });
}

async function getTrainingText(params?: {
  taskType?: number;
  domain?: number;
  textLanguage?: number;
}): Promise<{ textId: string; text: string }> {
  const now = Date.now();
  if (cachedTrainingText && now - cachedTrainingText.fetchedAt < TRAINING_TEXT_CACHE_MS) {
    return { textId: cachedTrainingText.textId, text: cachedTrainingText.text };
  }

  const result = await requestTencentApi<GetTrainingTextResponse>('GetTrainingText', {
    TaskType: params?.taskType ?? 5,
    Domain: params?.domain ?? 0,
    TextLanguage: params?.textLanguage ?? 1,
  });
  const list = result.Response?.Data?.TrainingTextList || [];
  const first = list.find((item) => item?.TextId?.trim());
  const textId = first?.TextId?.trim();
  if (!textId) {
    throw new Error('获取训练文本失败：未返回可用 TextId');
  }
  const text = first?.Text?.trim() || '';
  cachedTrainingText = { textId, text, fetchedAt: now };
  return { textId, text };
}

export async function fetchVoiceCloneTrainingText(params?: {
  taskType?: number;
  domain?: number;
  textLanguage?: number;
}): Promise<{ textId: string; text: string }> {
  return getTrainingText(params);
}

async function detectAudioQualityToAudioId(params: {
  audioUri: string;
  textId?: string;
  taskType?: number;
}): Promise<string> {
  const { textId: configuredTextId } = getTencentVoiceConfig();
  const audioData = await FileSystem.readAsStringAsync(params.audioUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const codec = getCodecFromUri(params.audioUri);
  let initialTextId = params.textId?.trim() || configuredTextId || '';
  if (!initialTextId) {
    const trainingText = await getTrainingText({ taskType: params.taskType ?? 5 });
    initialTextId = trainingText.textId;
  }
  let detect: DetectAudioResponse;
  try {
    detect = await detectEnvAndSoundQualityWithTextId({
      textId: initialTextId,
      audioData,
      codec,
      taskType: params.taskType ?? 5,
    });
  } catch (error) {
    if (!shouldRetryForTextId(error)) {
      throw error;
    }
    if (params.textId?.trim()) {
      throw new Error('当前朗读文本已失效，请刷新文本后重新录音。');
    }
    cachedTrainingText = null;
    const trainingText = await getTrainingText({ taskType: params.taskType ?? 5 });
    detect = await detectEnvAndSoundQualityWithTextId({
      textId: trainingText.textId,
      audioData,
      codec,
      taskType: params.taskType ?? 5,
    });
  }
  try {
    return extractAudioIdFromDetectResult(detect);
  } catch (error) {
    if (!shouldRetryForTextId(error) && !isTextIdMessage(detect.Response?.Data?.DetectionMsg)) {
      throw error;
    }
    if (params.textId?.trim()) {
      throw new Error('当前朗读文本已失效，请刷新文本后重新录音。');
    }
    cachedTrainingText = null;
    const trainingText = await getTrainingText({ taskType: params.taskType ?? 5 });
    const retryDetect = await detectEnvAndSoundQualityWithTextId({
      textId: trainingText.textId,
      audioData,
      codec,
      taskType: params.taskType ?? 5,
    });
    return extractAudioIdFromDetectResult(retryDetect);
  }
}

function buildSessionId(): string {
  return `luna-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

export async function createVoiceCloneTaskFromRecording(params: {
  audioUri: string;
  voiceName: string;
  voiceGender: 1 | 2;
  voiceLanguage?: number;
  taskType?: number;
  textId?: string;
}): Promise<{ taskId: string }> {
  const audioId = await detectAudioQualityToAudioId({
    audioUri: params.audioUri,
    taskType: params.taskType ?? 5,
    textId: params.textId,
  });
  const codec = getCodecFromUri(params.audioUri);

  const created = await requestTencentApi<CreateVRSTaskResponse>('CreateVRSTask', {
    SessionId: buildSessionId(),
    VoiceName: params.voiceName,
    VoiceGender: params.voiceGender,
    VoiceLanguage: params.voiceLanguage ?? 1,
    Codec: codec,
    AudioIdList: [audioId],
    TaskType: params.taskType ?? 5,
    EnableVoiceEnhance: 1,
  });

  const taskId = created.Response?.Data?.TaskId?.trim();
  if (!taskId) {
    throw new Error('创建声音复刻任务失败：未返回 TaskId');
  }
  return { taskId };
}

export async function queryVoiceCloneTask(
  taskId: string
): Promise<{ status: number; statusText: string; voiceId?: string; errorMsg?: string }> {
  const result = await requestTencentApi<DescribeVRSTaskStatusResponse>('DescribeVRSTaskStatus', {
    TaskId: taskId,
  });
  const data = result.Response?.Data;
  return {
    status: data?.Status ?? -1,
    statusText: data?.StatusStr ?? '',
    voiceId: data?.FastVoiceType?.trim() || String(data?.VoiceType ?? '').trim() || undefined,
    errorMsg: data?.ErrorMsg?.trim(),
  };
}

export async function waitForVoiceCloneResult(
  taskId: string,
  options?: {
    timeoutMs?: number;
    intervalMs?: number;
    onProgress?: (status: number, statusText: string) => void;
  }
): Promise<{ voiceId: string; statusText: string }> {
  const timeoutMs = options?.timeoutMs ?? 180_000;
  const intervalMs = options?.intervalMs ?? 2_500;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const result = await queryVoiceCloneTask(taskId);
    options?.onProgress?.(result.status, result.statusText);
    if (result.status === 0 || result.status === 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      continue;
    }
    if (result.status === 2) {
      if (!result.voiceId) {
        throw new Error('任务成功但未返回 voice_id');
      }
      return { voiceId: result.voiceId, statusText: result.statusText };
    }
    throw new Error(result.errorMsg || result.statusText || '声音复刻任务失败');
  }

  throw new Error('声音复刻任务超时，请稍后重试');
}
