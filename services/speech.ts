import { AudioModule, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import * as FileSystem from 'expo-file-system';

type AudioRecorderType = InstanceType<typeof AudioModule.AudioRecorder>;
let recorder: AudioRecorderType | null = null;

export async function startRecording(): Promise<void> {
    try {
        // Request permissions
        const { granted } = await requestRecordingPermissionsAsync();
        if (!granted) {
            throw new Error('Microphone permission not granted');
        }

        // Configure audio mode for recording
        await setAudioModeAsync({
            allowsRecording: true,
            playsInSilentMode: true,
        });

        // Create recorder
        recorder = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY);

        // Prepare the recorder before starting (if method exists)
        if (typeof (recorder as any).prepareToRecordAsync === 'function') {
            await (recorder as any).prepareToRecordAsync();
        }

        // Start recording
        recorder.record();

        // Wait a moment to ensure recording has started
        await new Promise(resolve => setTimeout(resolve, 100));

        console.log('Recording started, isRecording:', recorder.isRecording);
    } catch (error) {
        console.error('Failed to start recording:', error);
        throw error;
    }
}

export async function stopRecording(): Promise<string | null> {
    if (!recorder) {
        console.log('No recorder found');
        return null;
    }

    try {
        console.log('Stopping recording, isRecording:', recorder.isRecording);

        // Check if recording was actually happening
        if (!recorder.isRecording) {
            throw new Error('Recording was not active. Please hold the button longer.');
        }

        await recorder.stop();

        // Wait for file to be written
        await new Promise(resolve => setTimeout(resolve, 500));

        const uri = recorder.uri;
        console.log('Recording URI:', uri);

        // Reset audio mode
        await setAudioModeAsync({
            allowsRecording: false,
        });

        recorder = null;

        if (!uri) {
            throw new Error('Recording failed - no audio file created. Please try again.');
        }

        return uri;
    } catch (error) {
        console.error('Failed to stop recording:', error);
        recorder = null;
        throw error;
    }
}

export async function transcribeAudio(audioUri: string): Promise<string> {
    const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
    if (!apiKey || apiKey === 'your-openai-key-here') {
        throw new Error('OpenAI API key not configured. Add EXPO_PUBLIC_OPENAI_API_KEY to your .env file.');
    }

    console.log('Transcribing audio from:', audioUri);

    // Create form data with the audio file
    const formData = new FormData();

    formData.append('file', {
        uri: audioUri,
        type: 'audio/m4a',
        name: 'recording.m4a',
    } as any);
    formData.append('model', 'whisper-1');

    // Send to Whisper API
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
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
