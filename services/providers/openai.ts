import { AIMessage, AIProvider, StreamCallback } from '../ai';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

export const openaiProvider: AIProvider = {
    name: 'openai',

    async sendMessage(messages: AIMessage[]): Promise<string> {
        const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
        if (!apiKey || apiKey === 'your-openai-key-here') {
            throw new Error('OpenAI API key not configured. Add EXPO_PUBLIC_OPENAI_API_KEY to your .env file.');
        }

        const response = await fetch(OPENAI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: messages.map(m => ({
                    role: m.role,
                    content: m.content,
                })),
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'OpenAI API error');
        }

        const data = await response.json();
        return data.choices[0].message.content;
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
