import { openaiProvider } from './providers/openai';
import { geminiProvider } from './providers/gemini';
import { claudeProvider } from './providers/claude';

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

export function getProvider(): AIProvider {
    const providerName = process.env.EXPO_PUBLIC_AI_PROVIDER || 'openai';
    const provider = providers[providerName];

    if (!provider) {
        throw new Error(`Unknown AI provider: ${providerName}. Use: openai, gemini, or claude`);
    }

    return provider;
}

export function isConfigured(): boolean {
    const providerName = process.env.EXPO_PUBLIC_AI_PROVIDER || 'openai';

    switch (providerName) {
        case 'openai':
            return !!process.env.EXPO_PUBLIC_OPENAI_API_KEY &&
                process.env.EXPO_PUBLIC_OPENAI_API_KEY !== 'your-openai-key-here';
        case 'gemini':
            return !!process.env.EXPO_PUBLIC_GEMINI_API_KEY &&
                process.env.EXPO_PUBLIC_GEMINI_API_KEY !== 'your-gemini-key-here';
        case 'claude':
            return !!process.env.EXPO_PUBLIC_CLAUDE_API_KEY &&
                process.env.EXPO_PUBLIC_CLAUDE_API_KEY !== 'your-claude-key-here';
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
