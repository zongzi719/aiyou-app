import { AIMessage, AIProvider, StreamCallback } from '../ai';

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export const geminiProvider: AIProvider = {
    name: 'gemini',

    async sendMessage(messages: AIMessage[]): Promise<string> {
        const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
        if (!apiKey || apiKey === 'your-gemini-key-here') {
            throw new Error('Gemini API key not configured. Add EXPO_PUBLIC_GEMINI_API_KEY to your .env file.');
        }

        // Convert messages to Gemini format
        const contents = messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
        }));

        const response = await fetch(`${GEMINI_BASE_URL}/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ contents }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Gemini API error');
        }

        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
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
