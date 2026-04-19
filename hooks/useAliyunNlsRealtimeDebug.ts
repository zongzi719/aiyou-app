import {
  useAudioRecorder,
  useAudioRecorderState,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import {
  AliyunNlsRealtimeTranscriber,
  createGrowingWavPcmReader,
  fetchNlsDevToken,
  nlsStartTranscriptionPayloadFromEnv,
  NLS_REALTIME_RECORDING_OPTIONS,
  type NlsRealtimeHandlers,
} from '@/lib/aliyunNls';

const GATEWAY =
  process.env.EXPO_PUBLIC_ALIYUN_NLS_GATEWAY_WSS ||
  'wss://nls-gateway-cn-shanghai.aliyuncs.com/ws/v1';

type CachedToken = { token: string; expiresAtMs: number };

function getEnvConfig() {
  const tokenBase = process.env.EXPO_PUBLIC_NLS_TOKEN_URL || '';
  const appkey = process.env.EXPO_PUBLIC_ALIYUN_NLS_APPKEY || '';
  return { tokenBase, appkey, gateway: GATEWAY };
}

export function useAliyunNlsRealtimeDebug() {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [statusLine, setStatusLine] = useState('未连接');
  const [partialText, setPartialText] = useState('');
  const [finalLines, setFinalLines] = useState<string[]>([]);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const transcriberRef = useRef<AliyunNlsRealtimeTranscriber | null>(null);
  const tokenCacheRef = useRef<CachedToken | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wavReaderRef = useRef<ReturnType<typeof createGrowingWavPcmReader> | null>(null);
  /** 须在访问 recorder 原生属性前为 true；避免 stop 后仍有已排队的 setInterval 回调读到已释放的 native 对象 */
  const iosPollActiveRef = useRef(false);

  const recorder = useAudioRecorder(NLS_REALTIME_RECORDING_OPTIONS, () => {});
  const recorderState = useAudioRecorderState(recorder, 120);

  const appendFinal = useCallback((line: string) => {
    setFinalLines((prev) => [...prev, line]);
  }, []);

  const getToken = useCallback(async (): Promise<string> => {
    const { tokenBase } = getEnvConfig();
    if (!tokenBase) {
      throw new Error('未配置 EXPO_PUBLIC_NLS_TOKEN_URL');
    }
    const now = Date.now();
    const c = tokenCacheRef.current;
    if (c && c.expiresAtMs > now + 60_000) {
      return c.token;
    }
    const res = await fetchNlsDevToken(tokenBase);
    const exp = typeof res.expireTime === 'number' ? res.expireTime * 1000 : now + 20 * 60_000;
    tokenCacheRef.current = { token: res.token, expiresAtMs: exp };
    return res.token;
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const stopSession = useCallback(async () => {
    iosPollActiveRef.current = false;
    setIsSessionActive(false);
    stopPolling();
    wavReaderRef.current = null;
    try {
      transcriberRef.current?.stop();
    } catch {
      /* ignore */
    }
    try {
      if (recorder.isRecording) {
        await recorder.stop();
      }
    } catch {
      /* ignore */
    }
    try {
      await setAudioModeAsync({ allowsRecording: false });
    } catch {
      /* ignore */
    }
    transcriberRef.current?.close();
    transcriberRef.current = null;
    setStatusLine('已停止');
  }, [recorder, stopPolling]);

  useEffect(() => {
    return () => {
      iosPollActiveRef.current = false;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  const startSession = useCallback(async () => {
    setIsSessionActive(true);
    setErrorText(null);
    setPartialText('');
    setFinalLines([]);
    setTaskId(null);

    const { tokenBase, appkey, gateway } = getEnvConfig();
    if (!tokenBase) {
      setErrorText('请配置 EXPO_PUBLIC_NLS_TOKEN_URL（开发机 Token 服务地址）');
      setIsSessionActive(false);
      return;
    }
    if (!appkey) {
      setErrorText('请配置 EXPO_PUBLIC_ALIYUN_NLS_APPKEY');
      setIsSessionActive(false);
      return;
    }

    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) {
      setErrorText('需要麦克风权限');
      setIsSessionActive(false);
      return;
    }

    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });

    const handlers: NlsRealtimeHandlers = {
      onTranscriptionStarted: (tid) => {
        setTaskId(tid);
        setStatusLine('已就绪，推流中…');
      },
      onPartial: (text) => {
        setPartialText(text);
      },
      onSentenceEnd: (text) => {
        if (text.trim()) appendFinal(text.trim());
      },
      onCompleted: () => {
        setStatusLine('识别结束');
      },
      onTaskFailed: (msg) => {
        setErrorText(msg);
        setStatusLine('出错');
      },
    };

    const client = new AliyunNlsRealtimeTranscriber({
      gatewayWss: gateway,
      appkey,
      getToken,
      handlers,
      payload: nlsStartTranscriptionPayloadFromEnv(),
    });
    transcriberRef.current = client;

    try {
      setStatusLine('连接中…');
      await client.connectAndStart();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setErrorText(m);
      setStatusLine('连接失败');
      setIsSessionActive(false);
      client.close();
      transcriberRef.current = null;
      return;
    }

    if (Platform.OS === 'ios') {
      wavReaderRef.current = createGrowingWavPcmReader();
      try {
        await (recorder as { prepareToRecordAsync?: () => Promise<void> }).prepareToRecordAsync?.();
        recorder.record();
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        setErrorText(m);
        setIsSessionActive(false);
        await stopSession();
        return;
      }

      iosPollActiveRef.current = true;
      pollRef.current = setInterval(async () => {
        if (!iosPollActiveRef.current) return;
        let uri: string;
        try {
          uri = recorder.uri;
        } catch {
          iosPollActiveRef.current = false;
          stopPolling();
          return;
        }
        const reader = wavReaderRef.current;
        const tr = transcriberRef.current;
        if (!reader || !tr) return;
        try {
          const pcm = await reader.pollNewPcm(uri);
          if (!iosPollActiveRef.current) return;
          if (pcm && pcm.length > 0) {
            tr.sendPcmChunk(pcm);
          }
        } catch {
          /* ignore single poll errors */
        }
      }, 120);
      setStatusLine('录音并推流（iOS）…');
      return;
    }

    if (Platform.OS === 'android') {
      setStatusLine('Android：发送静音 PCM 以测连通（约 3 秒）…');
      let n = 0;
      const silence = new Uint8Array(3200);
      pollRef.current = setInterval(() => {
        const tr = transcriberRef.current;
        if (!tr) return;
        tr.sendPcmChunk(silence);
        n += 1;
        if (n >= 30) {
          stopSession().catch(() => null);
        }
      }, 100);
      return;
    }

    setErrorText('当前平台不支持该调试流程');
    setIsSessionActive(false);
    await stopSession();
  }, [appendFinal, getToken, recorder, stopSession]);

  return {
    statusLine,
    partialText,
    finalLines,
    taskId,
    errorText,
    isRecording: recorderState.isRecording,
    isSessionActive,
    startSession,
    stopSession,
  };
}
