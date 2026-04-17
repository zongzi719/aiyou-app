// 注意：App 内录音能力统一收敛在 hooks/useRecording.ts（expo-audio 的 useAudioRecorder）。
// 这里保留兼容导出，避免旧调用点崩溃；如需录音请改用 useRecording。
export async function startRecording(): Promise<void> {
  throw new Error('请使用 hooks/useRecording.ts 提供的 useRecording() 进行录音');
}

export async function stopRecording(): Promise<string | null> {
  throw new Error('请使用 hooks/useRecording.ts 提供的 useRecording() 进行录音');
}

export async function transcribeAudio(audioUri: string): Promise<string> {
  const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (!apiKey || apiKey === 'your-openai-key-here') {
    throw new Error(
      'OpenAI API key not configured. Add EXPO_PUBLIC_OPENAI_API_KEY to your .env file.'
    );
  }

  const formData = new FormData();

  formData.append('file', {
    uri: audioUri,
    type: 'audio/m4a',
    name: 'recording.m4a',
  } as any);
  formData.append('model', 'whisper-1');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Transcription failed');
  }

  const data = await response.json();
  return data.text;
}
