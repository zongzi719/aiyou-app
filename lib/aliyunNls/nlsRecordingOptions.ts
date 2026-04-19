import { AudioQuality, IOSOutputFormat, RecordingPresets, type RecordingOptions } from 'expo-audio';
import { Platform } from 'react-native';

/**
 * 阿里云实时语音识别调试：16kHz、单声道；iOS 使用线性 PCM WAV，便于增量读 PCM。
 * Android 当前为 AAC（m4a），本页会提示优先使用 iOS 做实时推流。
 */
export const NLS_REALTIME_RECORDING_OPTIONS: RecordingOptions =
  Platform.OS === 'ios'
    ? {
        extension: '.wav',
        sampleRate: 16000,
        numberOfChannels: 1,
        bitRate: 256000,
        isMeteringEnabled: true,
        ios: {
          outputFormat: IOSOutputFormat.LINEARPCM,
          audioQuality: AudioQuality.HIGH,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
          sampleRate: 16000,
        },
        android: {
          outputFormat: 'mpeg4',
          audioEncoder: 'aac',
        },
        web: {
          mimeType: 'audio/webm',
          bitsPerSecond: 128000,
        },
      }
    : Platform.OS === 'android'
      ? {
          extension: '.m4a',
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 64000,
          isMeteringEnabled: true,
          android: {
            extension: '.m4a',
            outputFormat: 'mpeg4',
            audioEncoder: 'aac',
            sampleRate: 16000,
          },
          ios: {
            outputFormat: IOSOutputFormat.MPEG4AAC,
            audioQuality: AudioQuality.HIGH,
          },
          web: {
            mimeType: 'audio/webm',
            bitsPerSecond: 128000,
          },
        }
      : RecordingPresets.HIGH_QUALITY;
