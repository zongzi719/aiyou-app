/**
 * 从环境变量合并 StartTranscription 的可选参数，用于提升中文等场景识别效果。
 * @see https://help.aliyun.com/zh/isi/developer-reference/websocket
 *
 * 语种/基础模型须在阿里云「智能语音交互」控制台的项目功能配置中选择，客户端无法指定。
 */

export function nlsStartTranscriptionPayloadFromEnv(): Record<string, unknown> {
  const extra: Record<string, unknown> = {};

  const semantic = process.env.EXPO_PUBLIC_NLS_ENABLE_SEMANTIC_SENTENCE?.trim();
  if (semantic !== 'false') {
    extra.enable_semantic_sentence_detection = true;
  }

  const vid = process.env.EXPO_PUBLIC_NLS_VOCABULARY_ID?.trim();
  if (vid) extra.vocabulary_id = vid;

  const cid = process.env.EXPO_PUBLIC_NLS_CUSTOMIZATION_ID?.trim();
  if (cid) extra.customization_id = cid;

  const mss = process.env.EXPO_PUBLIC_NLS_MAX_SENTENCE_SILENCE?.trim();
  if (mss) {
    const n = parseInt(mss, 10);
    if (!Number.isNaN(n) && n >= 200 && n <= 2000) {
      extra.max_sentence_silence = n;
    }
  }

  const snt = process.env.EXPO_PUBLIC_NLS_SPEECH_NOISE_THRESHOLD?.trim();
  if (snt) {
    const f = Number(snt);
    if (!Number.isNaN(f) && f >= -1 && f <= 1) {
      extra.speech_noise_threshold = f;
    }
  }

  return extra;
}
