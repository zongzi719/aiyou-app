import { useState, useCallback } from 'react';
import { useAudioRecorder, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';

export function useRecording() {
    const [isTranscribing, setIsTranscribing] = useState(false);

    const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY, (status) => {
        console.log('Recording status:', status);
    });

    const startRecording = useCallback(async () => {
        try {
            const { granted } = await requestRecordingPermissionsAsync();
            if (!granted) {
                throw new Error('Microphone permission not granted');
            }

            await setAudioModeAsync({
                allowsRecording: true,
                playsInSilentMode: true,
            });

            // Prepare the recorder first
            await (recorder as any).prepareToRecordAsync();

            // Start recording
            recorder.record();

            // Wait a moment to ensure recording starts
            await new Promise(resolve => setTimeout(resolve, 100));

            console.log('Recording started, isRecording:', recorder.isRecording);
        } catch (error) {
            console.error('Failed to start recording:', error);
            throw error;
        }
    }, [recorder]);

    const stopRecording = useCallback(async (): Promise<string | null> => {
        // Show transcribing state immediately
        setIsTranscribing(true);

        try {
            console.log('Stopping, isRecording:', recorder.isRecording);

            if (!recorder.isRecording) {
                console.log('Recording was not active, checking for uri anyway...');
            }

            await recorder.stop();

            // Wait for file to be written
            await new Promise(resolve => setTimeout(resolve, 500));

            const uri = recorder.uri;
            console.log('Recording URI:', uri, 'Type:', typeof uri);

            await setAudioModeAsync({
                allowsRecording: false,
            });

            // Check if uri is valid (not null, not "null" string, not empty)
            if (!uri || uri === 'null' || uri === '') {
                throw new Error('Recording failed - no audio file created. Make sure microphone is working.');
            }

            return uri;
        } catch (error) {
            console.error('Failed to stop recording:', error);
            setIsTranscribing(false);
            throw error;
        }
    }, [recorder]);

    const transcribeAudio = useCallback(async (audioUri: string): Promise<string> => {
        const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;

        // Return mock transcription for demo when no API key
        if (!apiKey || apiKey === 'your-openai-key-here') {
            setIsTranscribing(true);
            // Simulate transcription delay
            await new Promise(resolve => setTimeout(resolve, 1500));
            setIsTranscribing(false);
            return "This is a demo transcription. Add your OpenAI API key to enable real speech-to-text.";
        }

        setIsTranscribing(true);

        try {
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
        } finally {
            setIsTranscribing(false);
        }
    }, []);

    return {
        isRecording: recorder.isRecording,
        isTranscribing,
        startRecording,
        stopRecording,
        transcribeAudio,
    };
}
