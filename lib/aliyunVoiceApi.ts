const ALIYUN_CUSTOMIZATION_PATH = '/services/audio/tts/customization';
const ALIYUN_SPEECH_SYNTHESIZER_PATH = '/services/audio/tts/SpeechSynthesizer';
const DEFAULT_BEIJING_BASE_URL = 'https://dashscope.aliyuncs.com/api/v1';
const DEFAULT_TARGET_MODEL = 'cosyvoice-v3.5-plus';

const DEFAULT_PREVIEW_LINE = '你好，这是复刻音色的试听效果。';

type CreateVoiceResponse = {
  output?: {
    voice_id?: string;
    voiceID?: string;
    status?: string;
    target_model?: string;
    resource_link?: string;
    gmt_create?: string;
    gmt_modified?: string;
  };
  request_id?: string;
  code?: string;
  message?: string;
};

type QueryVoiceResponse = {
  output?: {
    voice_id?: string;
    voiceID?: string;
    status?: string;
    target_model?: string;
    resource_link?: string;
    gmt_create?: string;
    gmt_modified?: string;
  };
  request_id?: string;
  code?: string;
  message?: string;
};

type UpdateVoiceResponse = {
  output?: Record<string, unknown>;
  request_id?: string;
  code?: string;
  message?: string;
};

type SpeechSynthResponse = {
  output?: {
    finish_reason?: string;
    audio?: {
      url?: string;
      data?: string;
    };
  };
  request_id?: string;
  code?: string;
  message?: string;
};

export type AliyunVoiceStatus = 'OK' | 'DEPLOYING' | 'UNDEPLOYED' | string;

export type AliyunVoiceDetails = {
  voiceId: string;
  status: AliyunVoiceStatus;
  targetModel?: string;
  resourceLink?: string;
  gmtCreate?: string;
  gmtModified?: string;
  requestId?: string;
};

function getAliyunVoiceConfig() {
  const apiKey = process.env.EXPO_PUBLIC_ALIYUN_DASHSCOPE_API_KEY?.trim();
  const baseUrl =
    process.env.EXPO_PUBLIC_ALIYUN_DASHSCOPE_BASE_URL?.trim() || DEFAULT_BEIJING_BASE_URL;
  const targetModel =
    process.env.EXPO_PUBLIC_ALIYUN_TTS_TARGET_MODEL?.trim() || DEFAULT_TARGET_MODEL;

  if (!apiKey || apiKey.includes('your-aliyun-dashscope-api-key')) {
    throw new Error(
      '阿里云 API Key 未配置，请在 .env 设置 EXPO_PUBLIC_ALIYUN_DASHSCOPE_API_KEY=sk-...'
    );
  }
  if (!apiKey.startsWith('sk-')) {
    throw new Error('阿里云 API Key 格式不正确，必须以 sk- 开头。');
  }
  return { apiKey, baseUrl: baseUrl.replace(/\/+$/, ''), targetModel };
}

function normalizeAliyunError(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const rec = payload as Record<string, unknown>;
  const message = typeof rec.message === 'string' ? rec.message.trim() : '';
  const code = typeof rec.code === 'string' ? rec.code.trim() : '';
  if (code && message) return `${code}: ${message}`;
  if (message) return message;
  return fallback;
}

async function postCustomization<T>(body: Record<string, unknown>): Promise<T> {
  const { apiKey, baseUrl } = getAliyunVoiceConfig();
  const url = `${baseUrl}${ALIYUN_CUSTOMIZATION_PATH}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await response.text().catch(() => '');
  let parsed: unknown = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    if (!response.ok) {
      throw new Error(`阿里云请求失败 (${response.status})：${text.slice(0, 300)}`);
    }
    throw new Error(`阿里云响应解析失败：${text.slice(0, 300)}`);
  }
  if (!response.ok) {
    throw new Error(
      normalizeAliyunError(parsed, `阿里云请求失败 (${response.status})：${text.slice(0, 300)}`)
    );
  }
  return parsed as T;
}

function buildSafePrefix(rawPrefix?: string): string {
  const normalized = (rawPrefix || 'luna')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 9);
  return normalized || 'luna';
}

function extractVoiceId(output: CreateVoiceResponse['output']): string {
  const voiceId = output?.voice_id?.trim() || output?.voiceID?.trim() || '';
  if (!voiceId) {
    throw new Error('创建音色成功但未返回 voice_id。');
  }
  return voiceId;
}

function extractQueryVoiceId(output: QueryVoiceResponse['output'], fallbackId: string): string {
  return output?.voice_id?.trim() || output?.voiceID?.trim() || fallbackId;
}

export async function createAliyunVoiceFromUrl(params: {
  audioUrl: string;
  prefix?: string;
  targetModel?: string;
  languageHints?: string[];
}): Promise<{ voiceId: string; requestId?: string; status?: string }> {
  const { targetModel: defaultTargetModel } = getAliyunVoiceConfig();
  const targetModel = params.targetModel?.trim() || defaultTargetModel;
  const audioUrl = params.audioUrl.trim();
  if (!audioUrl) {
    throw new Error('请输入公网可访问的录音 URL。');
  }
  if (!/^https?:\/\//i.test(audioUrl)) {
    throw new Error('录音 URL 格式不正确，请以 http:// 或 https:// 开头。');
  }

  const payload: Record<string, unknown> = {
    model: 'voice-enrollment',
    input: {
      action: 'create_voice',
      target_model: targetModel,
      prefix: buildSafePrefix(params.prefix),
      url: audioUrl,
      language_hints: params.languageHints?.length ? params.languageHints : ['zh'],
    },
  };
  const result = await postCustomization<CreateVoiceResponse>(payload);
  if (result.code || result.message) {
    throw new Error(normalizeAliyunError(result, '创建音色失败'));
  }
  const voiceId = extractVoiceId(result.output);
  return {
    voiceId,
    requestId: result.request_id,
    status: result.output?.status,
  };
}

/**
 * 声音复刻：用新音频更新已有音色（voice_id 不变）。声音设计类音色不支持。
 * @see https://help.aliyun.com/zh/model-studio/cosyvoice-clone-design-api
 */
export async function updateAliyunVoiceFromUrl(params: {
  voiceId: string;
  audioUrl: string;
}): Promise<{ requestId?: string }> {
  const voiceId = params.voiceId.trim();
  const audioUrl = params.audioUrl.trim();
  if (!voiceId) {
    throw new Error('音色 ID 不能为空。');
  }
  if (!audioUrl) {
    throw new Error('请输入公网可访问的录音 URL。');
  }
  if (!/^https?:\/\//i.test(audioUrl)) {
    throw new Error('录音 URL 格式不正确，请以 http:// 或 https:// 开头。');
  }
  const result = await postCustomization<UpdateVoiceResponse>({
    model: 'voice-enrollment',
    input: {
      action: 'update_voice',
      voice_id: voiceId,
      url: audioUrl,
    },
  });
  if (result.code || result.message) {
    throw new Error(normalizeAliyunError(result, '更新音色失败'));
  }
  return { requestId: result.request_id };
}

/**
 * CosyVoice 非流式 HTTP 合成，返回短期有效的音频 URL（约 24h）。
 * @see https://help.aliyun.com/zh/model-studio/non-realtime-cosyvoice-api
 */
export async function synthesizeAliyunCosyVoiceToAudioUrl(params: {
  voiceId: string;
  text?: string;
  targetModel?: string;
}): Promise<{ audioUrl: string; requestId?: string }> {
  const { apiKey, baseUrl, targetModel: defaultTargetModel } = getAliyunVoiceConfig();
  const model = params.targetModel?.trim() || defaultTargetModel;
  const voice = params.voiceId.trim();
  if (!voice) {
    throw new Error('音色 ID 不能为空。');
  }
  const text = (params.text?.trim() || DEFAULT_PREVIEW_LINE).slice(0, 600);
  const url = `${baseUrl}${ALIYUN_SPEECH_SYNTHESIZER_PATH}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: {
        text,
        voice,
        format: 'mp3',
        sample_rate: 24000,
      },
    }),
  });
  const raw = await response.text().catch(() => '');
  let parsed: unknown = {};
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    if (!response.ok) {
      throw new Error(`语音合成请求失败 (${response.status})：${raw.slice(0, 300)}`);
    }
    throw new Error(`语音合成响应解析失败：${raw.slice(0, 300)}`);
  }
  if (!response.ok) {
    throw new Error(
      normalizeAliyunError(parsed, `语音合成请求失败 (${response.status})：${raw.slice(0, 300)}`)
    );
  }
  const result = parsed as SpeechSynthResponse;
  if (result.code || result.message) {
    throw new Error(normalizeAliyunError(result, '语音合成失败'));
  }
  const audioUrl = result.output?.audio?.url?.trim() || '';
  if (!audioUrl) {
    throw new Error('语音合成成功但未返回音频 URL。');
  }
  return { audioUrl, requestId: result.request_id };
}

export async function queryAliyunVoice(voiceId: string): Promise<AliyunVoiceDetails> {
  const normalizedVoiceId = voiceId.trim();
  if (!normalizedVoiceId) {
    throw new Error('音色 ID 不能为空。');
  }
  const result = await postCustomization<QueryVoiceResponse>({
    model: 'voice-enrollment',
    input: {
      action: 'query_voice',
      voice_id: normalizedVoiceId,
    },
  });
  if (result.code || result.message) {
    throw new Error(normalizeAliyunError(result, '查询音色失败'));
  }
  const status = (result.output?.status?.trim() || 'UNKNOWN') as AliyunVoiceStatus;
  return {
    voiceId: extractQueryVoiceId(result.output, normalizedVoiceId),
    status,
    targetModel: result.output?.target_model?.trim(),
    resourceLink: result.output?.resource_link?.trim(),
    gmtCreate: result.output?.gmt_create?.trim(),
    gmtModified: result.output?.gmt_modified?.trim(),
    requestId: result.request_id,
  };
}

export async function waitForAliyunVoiceReady(
  voiceId: string,
  options?: {
    timeoutMs?: number;
    intervalMs?: number;
    onProgress?: (status: AliyunVoiceStatus) => void;
  }
): Promise<AliyunVoiceDetails> {
  const timeoutMs = options?.timeoutMs ?? 5 * 60 * 1000;
  const intervalMs = options?.intervalMs ?? 8_000;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const details = await queryAliyunVoice(voiceId);
    options?.onProgress?.(details.status);
    if (details.status === 'OK') {
      return details;
    }
    if (details.status === 'UNDEPLOYED') {
      throw new Error('音色创建失败（UNDEPLOYED），请检查录音质量后重试。');
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('音色创建超时，请稍后重试。');
}
