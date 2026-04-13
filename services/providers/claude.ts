import { AIMessage, AIProvider, StreamCallback } from '../ai';

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

export const claudeProvider: AIProvider = {
    name: 'claude',

    async sendMessage(messages: AIMessage[]): Promise<string> {
        const apiKey = process.env.EXPO_PUBLIC_CLAUDE_API_KEY;
        if (!apiKey || apiKey === 'your-claude-key-here') {
            throw new Error('Claude API key not configured. Add EXPO_PUBLIC_CLAUDE_API_KEY to your .env file.');
        }

        const response = await fetch(CLAUDE_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true',
            },
            body: JSON.stringify({
                model: 'claude-3-haiku-20240307',
                max_tokens: 1024,
                messages: messages.map(m => ({
                    role: m.role,
                    content: m.content,
                })),
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Claude API error');
        }

        const data = await response.json();
        return data.content[0].text;
    },

    async streamMessage(messages: AIMessage[], onChunk: StreamCallback): Promise<string> {
        // React Native doesn't support streaming, use regular request and simulate streaming
        const content = await this.sendMessage(messages);

        // Simulate streaming by sending chunks
        const words = content.split(' ');
        for (let i = 0; i < words.length; i++) {
            const chunk = i === 0 ? words[i] : ' ' + words[i];
            onChunk(chunk);
            await new Promise(resolve => setTimeout(resolve, 30));
        }

        return content;
    },
};
