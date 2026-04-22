type RequirementContext = {
  /** 仅 .env 显式设置 EXPO_PUBLIC_AI_PROVIDER 时为小写名；未设为 ''（与 services/ai 默认 openai 无关，避免误报缺 Key） */
  directAiProvider: string;
  voiceCloneProvider: string;
};

type EnvCheckItem = {
  name: string;
  required: (ctx: RequirementContext) => boolean;
  reason: string;
};

export type EnvHealthReport = {
  missingRequired: Array<{ name: string; reason: string }>;
  optionalMissing: string[];
  snapshot: {
    aiProvider: string;
    voiceCloneProvider: string;
  };
};

const CHECK_ITEMS: EnvCheckItem[] = [
  {
    name: 'EXPO_PUBLIC_DEV_API_BASE_URL',
    required: () => true,
    reason: '登录、资料、私聊等主 API 网关',
  },
  {
    name: 'EXPO_PUBLIC_AI_PROVIDER',
    required: () => false,
    reason: '仅在使用直连模型时设为 openai/gemini/claude；不设则不校验第三方 Key（私聊可走已登录网关）',
  },
  {
    name: 'EXPO_PUBLIC_OPENAI_API_KEY',
    required: (ctx) => ctx.directAiProvider === 'openai',
    reason: '已指定 EXPO_PUBLIC_AI_PROVIDER=openai',
  },
  {
    name: 'EXPO_PUBLIC_GEMINI_API_KEY',
    required: (ctx) => ctx.directAiProvider === 'gemini',
    reason: '已指定 EXPO_PUBLIC_AI_PROVIDER=gemini',
  },
  {
    name: 'EXPO_PUBLIC_CLAUDE_API_KEY',
    required: (ctx) => ctx.directAiProvider === 'claude',
    reason: '已指定 EXPO_PUBLIC_AI_PROVIDER=claude',
  },
  {
    name: 'EXPO_PUBLIC_TENCENT_MAAS_API_KEY',
    required: () => true,
    reason: '初始化模型图像生成（TokenHub）',
  },
  {
    name: 'EXPO_PUBLIC_VOICE_CLONE_PROVIDER',
    required: () => false,
    reason: '声音复刻通道选择（默认 aliyun）',
  },
  {
    name: 'EXPO_PUBLIC_ALIYUN_DASHSCOPE_API_KEY',
    required: (ctx) => ctx.voiceCloneProvider === 'aliyun',
    reason: '阿里云声音复刻（CosyVoice）',
  },
  {
    name: 'EXPO_PUBLIC_ALIYUN_DASHSCOPE_BASE_URL',
    required: (ctx) => ctx.voiceCloneProvider === 'aliyun',
    reason: '阿里云 DashScope 网关地址',
  },
  {
    name: 'EXPO_PUBLIC_ALIYUN_OSS_ACCESS_KEY_ID',
    required: (ctx) => ctx.voiceCloneProvider === 'aliyun',
    reason: '上传录音到 OSS',
  },
  {
    name: 'EXPO_PUBLIC_ALIYUN_OSS_ACCESS_KEY_SECRET',
    required: (ctx) => ctx.voiceCloneProvider === 'aliyun',
    reason: '上传录音到 OSS',
  },
  {
    name: 'EXPO_PUBLIC_ALIYUN_OSS_BUCKET',
    required: (ctx) => ctx.voiceCloneProvider === 'aliyun',
    reason: '上传录音到 OSS',
  },
  {
    name: 'EXPO_PUBLIC_ALIYUN_OSS_ENDPOINT',
    required: (ctx) => ctx.voiceCloneProvider === 'aliyun',
    reason: '上传录音到 OSS（默认可回退杭州节点）',
  },
  {
    name: 'EXPO_PUBLIC_TENCENT_VOICE_SECRET_ID',
    required: (ctx) => ctx.voiceCloneProvider === 'tencent',
    reason: '腾讯声音复刻 VRS',
  },
  {
    name: 'EXPO_PUBLIC_TENCENT_VOICE_SECRET_KEY',
    required: (ctx) => ctx.voiceCloneProvider === 'tencent',
    reason: '腾讯声音复刻 VRS',
  },
  {
    name: 'EXPO_PUBLIC_ALIYUN_NLS_APPKEY',
    required: () => false,
    reason: '实时语音识别（NLS）调试',
  },
  {
    name: 'EXPO_PUBLIC_NLS_TOKEN_URL',
    required: () => false,
    reason: '实时语音识别（NLS）调试',
  },
  {
    name: 'EXPO_PUBLIC_BAILIAN_APP_ID',
    required: () => false,
    reason: '专家通话工作流调试',
  },
  {
    name: 'EXPO_PUBLIC_BAILIAN_API_KEY',
    required: () => false,
    reason: '专家通话工作流调试',
  },
  {
    name: 'EXPO_PUBLIC_BAILIAN_BASE_URL',
    required: () => false,
    reason: '专家通话工作流调试',
  },
];

function readEnv(name: string): string {
  const envRecord = process.env as Record<string, string | undefined>;
  return envRecord[name]?.trim() ?? '';
}

function isPlaceholderValue(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return true;
  return (
    v.includes('your-') ||
    v.includes('your_') ||
    v.includes('your ') ||
    v.includes('placeholder') ||
    v.includes('changeme') ||
    v.startsWith('sk-your-')
  );
}

export function buildEnvHealthReport(): EnvHealthReport {
  const directAiProvider = readEnv('EXPO_PUBLIC_AI_PROVIDER').toLowerCase();
  const voiceCloneProvider = readEnv('EXPO_PUBLIC_VOICE_CLONE_PROVIDER').toLowerCase() || 'aliyun';
  const ctx: RequirementContext = { directAiProvider, voiceCloneProvider };
  const aiProvider = directAiProvider || 'unset';

  const missingRequired: Array<{ name: string; reason: string }> = [];
  const optionalMissing: string[] = [];

  for (const item of CHECK_ITEMS) {
    const value = readEnv(item.name);
    const missing = isPlaceholderValue(value);
    if (item.required(ctx)) {
      if (missing) {
        missingRequired.push({ name: item.name, reason: item.reason });
      }
      continue;
    }
    if (missing) {
      optionalMissing.push(item.name);
    }
  }

  return {
    missingRequired,
    optionalMissing,
    snapshot: { aiProvider, voiceCloneProvider },
  };
}

