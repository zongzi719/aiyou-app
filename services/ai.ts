import { claudeProvider } from './providers/claude';
import { geminiProvider } from './providers/gemini';
import { openaiProvider } from './providers/openai';

export type AIMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type StreamCallback = (chunk: string) => void;

export type AIProvider = {
  name: string;
  sendMessage: (messages: AIMessage[]) => Promise<string>;
  streamMessage: (messages: AIMessage[], onChunk: StreamCallback) => Promise<string>;
};

const providers: Record<string, AIProvider> = {
  openai: openaiProvider,
  gemini: geminiProvider,
  claude: claudeProvider,
};

/** 无直连大模型时请在 .env 中设为 none（经已登录私聊等网关，不校验本机 API Key） */
const DIRECT_AI_OFF = new Set(['none', 'gateway', 'off']);

export function getProvider(): AIProvider {
  const providerName = process.env.EXPO_PUBLIC_AI_PROVIDER || 'openai';
  if (DIRECT_AI_OFF.has(providerName)) {
    throw new Error(
      '直连大模型已关闭（EXPO_PUBLIC_AI_PROVIDER=none 等）。仅可经私聊/网关等路径使用；若需本机调模型请改为 openai/gemini/claude 并配置 Key。'
    );
  }
  const provider = providers[providerName];

  if (!provider) {
    throw new Error(
      `Unknown AI provider: ${providerName}. Use: openai, gemini, claude, or none (gateway only)`
    );
  }

  return provider;
}

export function isConfigured(): boolean {
  const providerName = process.env.EXPO_PUBLIC_AI_PROVIDER || 'openai';

  switch (providerName) {
    case 'openai':
      return (
        !!process.env.EXPO_PUBLIC_OPENAI_API_KEY &&
        process.env.EXPO_PUBLIC_OPENAI_API_KEY !== 'your-openai-key-here'
      );
    case 'gemini':
      return (
        !!process.env.EXPO_PUBLIC_GEMINI_API_KEY &&
        process.env.EXPO_PUBLIC_GEMINI_API_KEY !== 'your-gemini-key-here'
      );
    case 'claude':
      return (
        !!process.env.EXPO_PUBLIC_CLAUDE_API_KEY &&
        process.env.EXPO_PUBLIC_CLAUDE_API_KEY !== 'your-claude-key-here'
      );
    default:
      return false;
  }
}

export async function sendMessage(messages: AIMessage[]): Promise<string> {
  const provider = getProvider();
  return provider.sendMessage(messages);
}

export async function streamMessage(
  messages: AIMessage[],
  onChunk: StreamCallback
): Promise<string> {
  const provider = getProvider();
  return provider.streamMessage(messages, onChunk);
}
