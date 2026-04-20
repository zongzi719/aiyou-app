import {
  addErrorListener,
  addFrameListener,
  requestPermission,
  start as streamAudioStart,
  stop as streamAudioStop,
} from 'expo-stream-audio';
import { useCallback, useRef, useState, type MutableRefObject } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';

import {
  AliyunNlsRealtimeTranscriber,
  createCachedNlsTokenGetter,
  getAliyunNlsAppkeyForStreaming,
  getNlsGatewayWssForStreaming,
  getStreamingAsrBackend,
  nlsStartTranscriptionPayloadFromEnv,
  validateAliyunNlsConfigForStreaming,
  type StreamingAsrBackend,
} from '@/lib/aliyunNls';
import { PcmInt16FrameAccumulator } from '@/lib/asrPcmAccumulate';
import { int16ArrayToLeUint8, resampleInt16MonoTo16k } from '@/lib/asrResample';
import type { AsrServerMessage } from '@/lib/asrWebSocketSession';
import { connectAsrWebSocket, wsSendBinary, wsSendJson } from '@/lib/asrWebSocketSession';
import type { AsrWsMode } from '@/lib/asrWsUrl';
import { getGlobalMock } from '@/lib/devApiConfig';

/** 避免同一片段被多次 final 重复拼到 accumulated（如「今天去」连发三遍） */
function shouldSkipDuplicateFinalAppend(accumulated: string, piece: string): boolean {
  const p = piece.trim();
  if (p.length < 2) return false;
  return accumulated.endsWith(p);
}

/**
 * partial 常为「当前整句假设」；若服务端把已定稿的 accumulated 又拼进 partial，去掉重复前缀避免「今天去今天去…」
 */
function stripAccumulatedPrefixFromPartial(accumulated: string, partial: string): string {
  const a = accumulated;
  const p = partial;
  if (!a || !p) return p;
  if (p.startsWith(a)) {
    return p.slice(a.length).replace(/^\s+/, '');
  }
  return p;
}

function base64ToUint8Array(b64: string): Uint8Array {
  const atobFn = globalThis.atob;
  if (typeof atobFn !== 'function') {
    throw new Error('atob 不可用');
  }
  const binary = atobFn(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** 客户端噪声门：低音量帧改发静音，减轻远场声进入 ASR；需 openThreshold > closeThreshold */
export type StreamingAsrNoiseGate = {
  openThreshold: number;
  closeThreshold: number;
};

function applyNoiseGateToPcm16k(
  pcm16k: Int16Array,
  level: number | undefined,
  gate: StreamingAsrNoiseGate | undefined,
  gateOpenRef: MutableRefObject<boolean>
): void {
  if (!gate) return;
  if (typeof level !== 'number') return;
  if (gateOpenRef.current) {
    if (level < gate.closeThreshold) gateOpenRef.current = false;
  } else {
    if (level > gate.openThreshold) gateOpenRef.current = true;
  }
  if (!gateOpenRef.current) {
    pcm16k.fill(0);
  }
}

export type StreamingAsrOptions = {
  mode: AsrWsMode;
  /** 覆盖 EXPO_PUBLIC_ASR_BACKEND；分身优化等场景可强制走阿里云实时识别 */
  backend?: StreamingAsrBackend;
  /** 低 meter 帧发静音；仅对需要抑制远场的场景开启 */
  noiseGate?: StreamingAsrNoiseGate;
  /** 句内/句末实时展示：accumulated + partial */
  onPartialTranscript: (displayText: string) => void;
  /** 会话落定（chat：close 兜底；notes：done 或 close 兜底） */
  onTranscript: (text: string, audioUrl?: string | null) => void;
  onError?: (message: string) => void;
};

type SessionTextState = {
  accumulated: string;
  lastPartial: string;
  endSent: boolean;
  doneReceived: boolean;
  completedEmitted: boolean;
  cancelled: boolean;
};

export function useStreamingAsr(options: StreamingAsrOptions) {
  const optsRef = useRef(options);
  optsRef.current = options;

  const [isStreaming, setIsStreaming] = useState(false);
  const [meterLevel, setMeterLevel] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const nlsTranscriberRef = useRef<AliyunNlsRealtimeTranscriber | null>(null);
  const nlsTokenGetterRef = useRef<ReturnType<typeof createCachedNlsTokenGetter> | null>(null);
  const nlsCleanupOnceRef = useRef(false);

  const pcmAccRef = useRef<PcmInt16FrameAccumulator | null>(null);
  const frameSubRef = useRef<{ remove: () => void } | null>(null);
  const errorSubRef = useRef<{ remove: () => void } | null>(null);
  const sessionRef = useRef<SessionTextState>({
    accumulated: '',
    lastPartial: '',
    endSent: false,
    doneReceived: false,
    completedEmitted: false,
    cancelled: false,
  });
  const mockTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  /** 防止在异步连接完成前重复 start（useCallback [] 无法读到最新 isStreaming） */
  const sessionActiveRef = useRef(false);
  /** expo-stream-audio 每帧带实际采样率；与网关约定 16k 不一致时必须重采样 */
  const micSampleRateRef = useRef<number | null>(null);
  const noiseGateOpenRef = useRef(false);

  if (nlsTokenGetterRef.current === null) {
    nlsTokenGetterRef.current = createCachedNlsTokenGetter();
  }

  const resetSessionText = () => {
    sessionRef.current = {
      accumulated: '',
      lastPartial: '',
      endSent: false,
      doneReceived: false,
      completedEmitted: false,
      cancelled: false,
    };
  };

  const emitPartial = () => {
    const s = sessionRef.current;
    optsRef.current.onPartialTranscript(s.accumulated + s.lastPartial);
  };

  const applyMessage = (msg: AsrServerMessage) => {
    const s = sessionRef.current;
    if (s.cancelled) return;
    switch (msg.type) {
      case 'partial': {
        const raw = typeof msg.text === 'string' ? msg.text : '';
        s.lastPartial = stripAccumulatedPrefixFromPartial(s.accumulated, raw);
        emitPartial();
        break;
      }
      case 'final': {
        const t = typeof msg.text === 'string' ? msg.text.trim() : '';
        const committed = t.length > 0 ? t : s.lastPartial.trim();
        if (committed.length > 0) {
          if (!shouldSkipDuplicateFinalAppend(s.accumulated, committed)) {
            s.accumulated += committed;
          }
        }
        s.lastPartial = '';
        emitPartial();
        break;
      }
      case 'done': {
        s.doneReceived = true;
        const full = s.accumulated + s.lastPartial;
        s.lastPartial = '';
        s.accumulated = full;
        if (!s.completedEmitted) {
          s.completedEmitted = true;
          optsRef.current.onTranscript(full, msg.audio_url);
        }
        break;
      }
      case 'error':
        optsRef.current.onError?.(msg.message);
        break;
      default:
        break;
    }
  };

  const finalizeOnClose = () => {
    const s = sessionRef.current;
    if (s.cancelled) return;
    if (s.completedEmitted) return;
    const mode = optsRef.current.mode;
    if (mode === 'notes' && s.doneReceived) return;

    const fullText = s.accumulated + s.lastPartial;
    if (!fullText.trim()) return;

    s.completedEmitted = true;
    optsRef.current.onTranscript(fullText, null);
  };

  const cleanupNative = async () => {
    frameSubRef.current?.remove();
    frameSubRef.current = null;
    errorSubRef.current?.remove();
    errorSubRef.current = null;
    pcmAccRef.current?.clear();
    pcmAccRef.current = null;
    micSampleRateRef.current = null;
    await streamAudioStop().catch(() => {});
  };

  const cleanupWs = () => {
    try {
      wsRef.current?.close();
    } catch {
      /* noop */
    }
    wsRef.current = null;
  };

  const runAliyunCleanup = useCallback(async () => {
    if (nlsCleanupOnceRef.current) return;
    nlsCleanupOnceRef.current = true;
    try {
      await cleanupNative();
    } catch {
      /* noop */
    }
    try {
      nlsTranscriberRef.current?.close();
    } catch {
      /* noop */
    }
    nlsTranscriberRef.current = null;
    sessionActiveRef.current = false;
    setIsStreaming(false);
    setMeterLevel(0);
  }, []);

  const applyNlsPartial = (raw: string) => {
    const s = sessionRef.current;
    if (s.cancelled) return;
    s.lastPartial = stripAccumulatedPrefixFromPartial(s.accumulated, raw);
    emitPartial();
  };

  const applyNlsSentenceEnd = (text: string) => {
    const s = sessionRef.current;
    if (s.cancelled) return;
    const t = text.trim();
    const committed = t.length > 0 ? t : s.lastPartial.trim();
    if (committed.length > 0) {
      if (!shouldSkipDuplicateFinalAppend(s.accumulated, committed)) {
        s.accumulated += committed;
      }
    }
    s.lastPartial = '';
    emitPartial();
  };

  const applyNlsTranscriptionCompleted = () => {
    const s = sessionRef.current;
    if (s.cancelled) return;
    s.doneReceived = true;
    const full = s.accumulated + s.lastPartial;
    s.lastPartial = '';
    s.accumulated = full;
    if (!s.completedEmitted) {
      s.completedEmitted = true;
      optsRef.current.onTranscript(full, null);
    }
  };

  const runMockSession = () => {
    resetSessionText();
    mockTimersRef.current.forEach(clearTimeout);
    mockTimersRef.current = [];
    sessionActiveRef.current = true;
    setIsStreaming(true);
    setMeterLevel(0.3);
    const t1 = setTimeout(() => {
      sessionRef.current.lastPartial = '（Mock）';
      optsRef.current.onPartialTranscript('（Mock）');
    }, 120);
    const t2 = setTimeout(() => {
      sessionRef.current.accumulated =
        optsRef.current.mode === 'notes'
          ? '（Mock）灵感笔记语音识别占位'
          : '（Mock）对话语音识别占位';
      sessionRef.current.lastPartial = '';
      sessionRef.current.completedEmitted = true;
      optsRef.current.onPartialTranscript(sessionRef.current.accumulated);
      optsRef.current.onTranscript(
        sessionRef.current.accumulated,
        optsRef.current.mode === 'notes' ? 'https://example.com/mock-note.wav' : null
      );
      sessionActiveRef.current = false;
      setIsStreaming(false);
      setMeterLevel(0);
    }, 650);
    mockTimersRef.current = [t1, t2];
  };

  const ensureAndroidPermission = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    return r === PermissionsAndroid.RESULTS.GRANTED;
  };

  const startStreaming = useCallback(async () => {
    mockTimersRef.current.forEach(clearTimeout);
    mockTimersRef.current = [];
    if (await getGlobalMock()) {
      runMockSession();
      return;
    }

    if (Platform.OS === 'web') {
      optsRef.current.onError?.('语音输入仅在 iOS / Android 客户端可用');
      return;
    }

    if (sessionActiveRef.current) {
      optsRef.current.onError?.('请等待当前语音识别结束后再试');
      return;
    }

    sessionActiveRef.current = true;
    micSampleRateRef.current = null;
    noiseGateOpenRef.current = false;
    resetSessionText();
    nlsCleanupOnceRef.current = false;
    setIsStreaming(true);
    setMeterLevel(0);

    const okAndroid = await ensureAndroidPermission();
    if (!okAndroid) {
      sessionActiveRef.current = false;
      setIsStreaming(false);
      optsRef.current.onError?.('需要麦克风权限才能使用语音输入');
      return;
    }

    const perm = await requestPermission();
    if (perm !== 'granted') {
      sessionActiveRef.current = false;
      setIsStreaming(false);
      optsRef.current.onError?.('需要麦克风权限才能使用语音输入');
      return;
    }

    const mode = optsRef.current.mode;
    const pcmAcc = new PcmInt16FrameAccumulator();
    pcmAccRef.current = pcmAcc;

    const backend = optsRef.current.backend ?? getStreamingAsrBackend();

    if (backend === 'aliyun') {
      const cfgErr = validateAliyunNlsConfigForStreaming();
      if (cfgErr) {
        sessionActiveRef.current = false;
        setIsStreaming(false);
        pcmAccRef.current = null;
        optsRef.current.onError?.(cfgErr);
        return;
      }

      const gateway = getNlsGatewayWssForStreaming();
      const appkey = getAliyunNlsAppkeyForStreaming();
      const getToken = nlsTokenGetterRef.current!;

      const client = new AliyunNlsRealtimeTranscriber({
        gatewayWss: gateway,
        appkey,
        getToken,
        payload: nlsStartTranscriptionPayloadFromEnv(),
        onConnectionClosed: () => {
          if (!sessionRef.current.cancelled && !sessionRef.current.completedEmitted) {
            finalizeOnClose();
          }
          runAliyunCleanup().catch(() => {});
        },
        handlers: {
          onPartial: (text) => {
            applyNlsPartial(text);
          },
          onSentenceEnd: (text) => {
            applyNlsSentenceEnd(text);
          },
          onCompleted: () => {
            applyNlsTranscriptionCompleted();
            runAliyunCleanup().catch(() => {});
          },
          onTaskFailed: (msg) => {
            optsRef.current.onError?.(msg || '语音识别失败');
            runAliyunCleanup().catch(() => {});
          },
        },
      });

      nlsTranscriberRef.current = client;

      try {
        await client.connectAndStart();
      } catch {
        nlsTranscriberRef.current = null;
        sessionActiveRef.current = false;
        setIsStreaming(false);
        optsRef.current.onError?.('语音识别连接失败');
        try {
          client.close();
        } catch {
          /* noop */
        }
        return;
      }

      frameSubRef.current = addFrameListener((ev) => {
        try {
          if (!ev.pcmBase64?.trim()) return;
          const bytes = base64ToUint8Array(ev.pcmBase64);
          const byteLen = bytes.byteLength - (bytes.byteLength % 2);
          if (byteLen < 2) return;
          const view = new DataView(bytes.buffer, bytes.byteOffset, byteLen);
          const n = byteLen / 2;
          const pcm = new Int16Array(n);
          for (let i = 0; i < n; i++) {
            pcm[i] = view.getInt16(i * 2, true);
          }

          const rate =
            typeof ev.sampleRate === 'number' && ev.sampleRate > 0 ? ev.sampleRate : 16000;
          if (micSampleRateRef.current === null) {
            micSampleRateRef.current = rate;
            if (__DEV__ && Math.abs(rate - 16000) > 1) {
              console.info('[ASR] 麦克风实际采样率', rate, 'Hz，已重采样为 16000 Hz 再发往 NLS');
            }
          }
          const srcRate = micSampleRateRef.current ?? rate;
          const pcm16k = resampleInt16MonoTo16k(pcm, srcRate);
          applyNoiseGateToPcm16k(pcm16k, ev.level, optsRef.current.noiseGate, noiseGateOpenRef);
          const outBytes = int16ArrayToLeUint8(pcm16k);
          const chunks = pcmAcc.appendPcmInt16LE(outBytes);
          const tr = nlsTranscriberRef.current;
          for (const c of chunks) {
            tr?.sendPcmChunk(new Uint8Array(c));
          }
          if (typeof ev.level === 'number') {
            setMeterLevel(ev.level);
          }
        } catch (e) {
          optsRef.current.onError?.(e instanceof Error ? e.message : '音频帧处理失败');
        }
      });

      errorSubRef.current = addErrorListener((ev) => {
        optsRef.current.onError?.(ev.message || '录音流错误');
      });

      try {
        await streamAudioStart({
          sampleRate: 16000,
          channels: 1,
          enableLevelMeter: true,
          frameDurationMs: 20,
        });
      } catch (e) {
        sessionActiveRef.current = false;
        await cleanupNative();
        nlsTranscriberRef.current?.close();
        nlsTranscriberRef.current = null;
        setIsStreaming(false);
        optsRef.current.onError?.(e instanceof Error ? e.message : '无法开始录音');
      }
      return;
    }

    let ws: WebSocket;
    try {
      ws = await connectAsrWebSocket(mode, {
        onMessage: applyMessage,
        onClose: () => {
          sessionActiveRef.current = false;
          cleanupNative().catch(() => {});
          finalizeOnClose();
          setIsStreaming(false);
          setMeterLevel(0);
        },
        onError: () => {
          optsRef.current.onError?.('语音识别连接失败');
        },
      });
    } catch {
      sessionActiveRef.current = false;
      setIsStreaming(false);
      optsRef.current.onError?.('语音识别连接失败');
      return;
    }

    wsRef.current = ws;

    frameSubRef.current = addFrameListener((ev) => {
      try {
        if (!ev.pcmBase64?.trim()) return;
        const bytes = base64ToUint8Array(ev.pcmBase64);
        const byteLen = bytes.byteLength - (bytes.byteLength % 2);
        if (byteLen < 2) return;
        const view = new DataView(bytes.buffer, bytes.byteOffset, byteLen);
        const n = byteLen / 2;
        const pcm = new Int16Array(n);
        for (let i = 0; i < n; i++) {
          pcm[i] = view.getInt16(i * 2, true);
        }

        const rate = typeof ev.sampleRate === 'number' && ev.sampleRate > 0 ? ev.sampleRate : 16000;
        if (micSampleRateRef.current === null) {
          micSampleRateRef.current = rate;
          if (__DEV__ && Math.abs(rate - 16000) > 1) {
            console.info('[ASR] 麦克风实际采样率', rate, 'Hz，已重采样为 16000 Hz 再发往服务端');
          }
        }
        const srcRate = micSampleRateRef.current ?? rate;
        const pcm16k = resampleInt16MonoTo16k(pcm, srcRate);
        applyNoiseGateToPcm16k(pcm16k, ev.level, optsRef.current.noiseGate, noiseGateOpenRef);
        const outBytes = int16ArrayToLeUint8(pcm16k);
        const chunks = pcmAcc.appendPcmInt16LE(outBytes);
        for (const c of chunks) {
          wsSendBinary(ws, c);
        }
        if (typeof ev.level === 'number') {
          setMeterLevel(ev.level);
        }
      } catch (e) {
        optsRef.current.onError?.(e instanceof Error ? e.message : '音频帧处理失败');
      }
    });

    errorSubRef.current = addErrorListener((ev) => {
      optsRef.current.onError?.(ev.message || '录音流错误');
    });

    try {
      await streamAudioStart({
        sampleRate: 16000,
        channels: 1,
        enableLevelMeter: true,
        frameDurationMs: 20,
      });
    } catch (e) {
      sessionActiveRef.current = false;
      await cleanupNative();
      cleanupWs();
      setIsStreaming(false);
      optsRef.current.onError?.(e instanceof Error ? e.message : '无法开始录音');
    }
  }, [runAliyunCleanup]);

  const stopStreaming = useCallback(async () => {
    if (await getGlobalMock()) {
      mockTimersRef.current.forEach(clearTimeout);
      mockTimersRef.current = [];
      sessionActiveRef.current = false;
      setIsStreaming(false);
      setMeterLevel(0);
      return;
    }

    sessionRef.current.endSent = true;
    await streamAudioStop().catch(() => {});

    const pad = pcmAccRef.current?.flushPadWithZeros();

    if (nlsTranscriberRef.current) {
      const tr = nlsTranscriberRef.current;
      if (pad) {
        tr.sendPcmChunk(new Uint8Array(pad));
      }
      tr.stop();
      return;
    }

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      if (pad) {
        wsSendBinary(ws, pad);
      }
      wsSendJson(ws, { type: 'end' });
    } else {
      await cleanupNative();
      cleanupWs();
      sessionActiveRef.current = false;
      setIsStreaming(false);
      setMeterLevel(0);
    }
  }, []);

  const cancelStreaming = useCallback(async () => {
    mockTimersRef.current.forEach(clearTimeout);
    mockTimersRef.current = [];
    sessionRef.current.cancelled = true;
    sessionRef.current.completedEmitted = true;

    if (await getGlobalMock()) {
      sessionActiveRef.current = false;
      setIsStreaming(false);
      setMeterLevel(0);
      return;
    }

    await cleanupNative();
    cleanupWs();
    nlsCleanupOnceRef.current = false;
    try {
      nlsTranscriberRef.current?.close();
    } catch {
      /* noop */
    }
    nlsTranscriberRef.current = null;
    sessionActiveRef.current = false;
    setIsStreaming(false);
    setMeterLevel(0);
  }, []);

  return {
    isStreaming,
    meterLevel,
    startStreaming,
    stopStreaming,
    cancelStreaming,
  };
}
