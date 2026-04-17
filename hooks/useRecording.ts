import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  type RecordingOptions,
} from 'expo-audio';
import { useState, useCallback } from 'react';

import { transcribeChatAudio, transcribeNotesAudio, type NotesAsrResult } from '@/lib/asrApi';

const recordingOptionsWithMetering: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
  // 尽量贴近腾讯声音复刻推荐：单声道 + 48k 采样率
  sampleRate: 48000,
  numberOfChannels: 1,
};

export function useRecording() {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const recorder = useAudioRecorder(recordingOptionsWithMetering, (status) => {
    console.log('Recording status:', status);
  });

  /** recorder.isRecording 不会触发重渲染，必须用官方 hook 订阅状态（见 expo-audio useAudioRecorderState） */
  const recorderState = useAudioRecorderState(recorder, 120);

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
      setIsPaused(false);

      // Wait a moment to ensure recording starts
      await new Promise((resolve) => setTimeout(resolve, 100));

      console.log('Recording started');
    } catch (error) {
      console.error('Failed to start recording:', error);
      throw error;
    }
  }, [recorder]);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    try {
      console.log('Stopping, isRecording:', recorder.isRecording);

      if (!recorder.isRecording) {
        console.log('Recording was not active, checking for uri anyway...');
      }

      await recorder.stop();
      setIsPaused(false);

      // Wait for file to be written
      await new Promise((resolve) => setTimeout(resolve, 500));

      const uri = recorder.uri;
      console.log('Recording URI:', uri, 'Type:', typeof uri);

      await setAudioModeAsync({
        allowsRecording: false,
      });

      // Check if uri is valid (not null, not "null" string, not empty)
      if (!uri || uri === 'null' || uri === '') {
        throw new Error(
          'Recording failed - no audio file created. Make sure microphone is working.'
        );
      }

      return uri;
    } catch (error) {
      console.error('Failed to stop recording:', error);
      setIsTranscribing(false);
      throw error;
    }
  }, [recorder]);

  const pauseRecording = useCallback(async () => {
    try {
      const pause = (recorder as any).pause;
      const pauseAsync = (recorder as any).pauseAsync;
      if (typeof pauseAsync === 'function') {
        await pauseAsync.call(recorder);
        setIsPaused(true);
        return;
      }
      if (typeof pause === 'function') {
        await pause.call(recorder);
        setIsPaused(true);
      }
    } catch (error) {
      console.error('Failed to pause recording:', error);
      throw error;
    }
  }, [recorder]);

  const resumeRecording = useCallback(async () => {
    try {
      const record = (recorder as any).record;
      const resume = (recorder as any).resume;
      const resumeAsync = (recorder as any).resumeAsync;
      if (typeof resumeAsync === 'function') {
        await resumeAsync.call(recorder);
        setIsPaused(false);
        return;
      }
      if (typeof resume === 'function') {
        await resume.call(recorder);
        setIsPaused(false);
        return;
      }
      if (typeof record === 'function') {
        await record.call(recorder);
        setIsPaused(false);
      }
    } catch (error) {
      console.error('Failed to resume recording:', error);
      throw error;
    }
  }, [recorder]);

  const transcribeAudio = useCallback(async (audioUri: string): Promise<string> => {
    setIsTranscribing(true);
    try {
      return await transcribeChatAudio(audioUri);
    } finally {
      setIsTranscribing(false);
    }
  }, []);

  const transcribeNotesAudioHook = useCallback(
    async (audioUri: string): Promise<NotesAsrResult> => {
      setIsTranscribing(true);
      try {
        return await transcribeNotesAudio(audioUri);
      } finally {
        setIsTranscribing(false);
      }
    },
    []
  );

  return {
    isRecording: recorderState.isRecording,
    isPaused,
    isTranscribing,
    /** dB 量级（与 expo-audio 一致），静音约 -160；需 isMeteringEnabled */
    metering: recorderState.metering,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    transcribeAudio,
    transcribeNotesAudio: transcribeNotesAudioHook,
  };
}
