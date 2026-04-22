import { Audio } from 'expo-av';
import { BlurView } from 'expo-blur';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import useThemeColors from '@/app/contexts/ThemeColors';
import Icon from '@/components/Icon';
import ThemedText from '@/components/ThemedText';
import { useStreamingAsr } from '@/hooks/useStreamingAsr';
import {
  completeBailianWorkflowStream,
  completeBailianWorkflowSync,
  getBailianAppConfigStatus,
  isBailianWorkflowIncrementalOutputEnabled,
  runTypewriter,
} from '@/lib/bailianAppCompletion';
import { peekMemoryMemories, putMemoryMemories } from '@/lib/listDataCache';
import { preferHttpsMediaUrl } from '@/lib/preferHttpsMediaUrl';
import { translateCategory, type UserMemory, memoryApi } from '@/services/memoryApi';
import { fetchProfile } from '@/services/profileApi';

type TuneMessage = {
  id: string;
  role: 'clone' | 'user' | 'memory';
  text: string;
  memory?: {
    content: string;
    category: string;
    dimensionLabel: string;
  };
};

type Props = {
  visible: boolean;
  onRequestClose: () => void;
};

const cloneIntro = '学习你的语气、思维。和我说话，我会越来越像你。';

/** 专家通话：转写超过该时长无更新时，自动截断并发送（毫秒） */
const EXPERT_ASR_IDLE_MS = 1000;

function inferCategory(input: string): { category: string; dimensionLabel: string } {
  if (/决策|判断|取舍|选择|优先级/.test(input))
    return { category: 'style', dimensionLabel: '决策风格' };
  if (/目标|计划|长期|愿景|结果/.test(input))
    return { category: 'goal', dimensionLabel: '目标导向' };
  if (/习惯|每天|坚持|流程|复盘/.test(input))
    return { category: 'behavior', dimensionLabel: '行为模式' };
  if (/喜欢|偏好|不喜欢|倾向/.test(input))
    return { category: 'preference', dimensionLabel: '偏好倾向' };
  return { category: 'context', dimensionLabel: '个人背景' };
}

function buildCandidate(content: string): string {
  const text = content.replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= 40) return `我倾向于：${text}`;
  return `我倾向于：${text.slice(0, 40)}...`;
}

type ExpertCallLine = { id: string; role: 'user' | 'clone'; text: string };

function formatCallDuration(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')} : ${String(s).padStart(2, '0')}`;
}

function formatWorkflowError(e: unknown): string {
  if (e instanceof Error) return e.message || '未知错误';
  if (typeof e === 'string') return e || '未知错误';
  try {
    return JSON.stringify(e);
  } catch {
    return '工作流调用失败';
  }
}

function sanitizeWorkflowErrorMessage(message: string): string {
  const m = message.trim();
  if (!m) return '专家通话暂时不可用，请稍后再试。';
  if (
    m.includes('EXPO_PUBLIC_') ||
    m.includes('未配置') ||
    m.includes('API Key') ||
    m.includes('百炼应用 ID')
  ) {
    return '专家通话暂未配置完成，请联系管理员在构建环境中补齐配置后再试。';
  }
  return m;
}

export default function MemoryTuneModal({ visible, onRequestClose }: Props) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { height: windowHeight } = useWindowDimensions();

  const submitMessageRef = useRef<(text: string) => void>(() => {});
  const expertCallOpenRef = useRef(false);
  const expertCallMutedRef = useRef(true);
  const expertVoiceIdRef = useRef('');
  const expertFlushResolversRef = useRef<((t: string) => void)[]>([]);
  const expertWorkflowAbortRef = useRef<AbortController | null>(null);
  const expertWorkflowLoadingRef = useRef(false);
  const expertCallScrollRef = useRef<ScrollView | null>(null);
  /** 防止上一轮工作流 abort 后 finally 与新一轮竞态，错误清空 loading / 抢重启 ASR */
  const expertSegmentGenRef = useRef(0);
  const handleExpertSegmentTextRef = useRef<(raw: string) => Promise<void>>(async () => {});
  const soundRef = useRef<Audio.Sound | null>(null);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [voicePanelVisible, setVoicePanelVisible] = useState(false);
  const [voiceWillCancel, setVoiceWillCancel] = useState(false);
  const [voiceStartY, setVoiceStartY] = useState<number | null>(null);
  const [holdAsrPreview, setHoldAsrPreview] = useState('');
  const [messages, setMessages] = useState<TuneMessage[]>([]);
  const [memories, setMemories] = useState<UserMemory[]>([]);
  const [pendingMemory, setPendingMemory] = useState<TuneMessage['memory'] | null>(null);
  const [inputMode, setInputMode] = useState<'text' | 'voice'>('text');
  const [attachMenuVisible, setAttachMenuVisible] = useState(false);
  const [expertCallOpen, setExpertCallOpen] = useState(false);
  const [expertCallMuted, setExpertCallMuted] = useState(true);
  const [expertCallSeconds, setExpertCallSeconds] = useState(0);
  const [expertCallLines, setExpertCallLines] = useState<ExpertCallLine[]>([]);
  const [expertVoiceId, setExpertVoiceId] = useState('');
  const [expertWorkflowLoading, setExpertWorkflowLoading] = useState(false);

  const expertLinesRef = useRef<ExpertCallLine[]>([]);
  const expertHasTranscriptThisRoundRef = useRef(false);
  const expertLastTranscriptAtRef = useRef<number | null>(null);
  const expertAutoTruncatingRef = useRef(false);
  const expertRestartAfterWorkflowRef = useRef(true);
  const pendingMemoryMessageIdRef = useRef<string | null>(null);

  const [editingPendingMemory, setEditingPendingMemory] = useState(false);
  const [memoryEditDraft, setMemoryEditDraft] = useState('');

  useEffect(() => {
    expertCallOpenRef.current = expertCallOpen;
  }, [expertCallOpen]);
  useEffect(() => {
    expertCallMutedRef.current = expertCallMuted;
  }, [expertCallMuted]);
  useEffect(() => {
    expertVoiceIdRef.current = expertVoiceId;
  }, [expertVoiceId]);
  useEffect(() => {
    expertWorkflowLoadingRef.current = expertWorkflowLoading;
  }, [expertWorkflowLoading]);

  const setExpertWorkflowLoadingSync = useCallback((v: boolean) => {
    expertWorkflowLoadingRef.current = v;
    setExpertWorkflowLoading(v);
  }, []);

  const scrollExpertCallToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      expertCallScrollRef.current?.scrollToEnd({ animated });
    });
  }, []);

  useEffect(() => {
    expertLinesRef.current = expertCallLines;
  }, [expertCallLines]);

  useEffect(() => {
    if (!expertCallOpen) {
      setExpertCallSeconds(0);
      return;
    }
    if (expertCallMuted) return;
    const id = setInterval(() => setExpertCallSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [expertCallMuted, expertCallOpen]);

  useEffect(() => {
    if (!visible) return;
    const cached = peekMemoryMemories() ?? [];
    setMemories(cached);
    setDraft('');
    setSending(false);
    setSaving(false);
    setVoicePanelVisible(false);
    setVoiceWillCancel(false);
    setVoiceStartY(null);
    setHoldAsrPreview('');
    setPendingMemory(null);
    setInputMode('text');
    setAttachMenuVisible(false);
    setExpertCallOpen(false);
    setExpertCallMuted(true);
    setExpertCallSeconds(0);
    setExpertCallLines([]);
    setExpertVoiceId('');
    expertWorkflowLoadingRef.current = false;
    setExpertWorkflowLoading(false);
    setEditingPendingMemory(false);
    setMemoryEditDraft('');
    pendingMemoryMessageIdRef.current = null;
    expertLinesRef.current = [];
    expertSegmentGenRef.current = 0;
    expertWorkflowAbortRef.current?.abort();
    expertWorkflowAbortRef.current = null;
    setMessages([{ id: 'intro', role: 'clone', text: cloneIntro }]);

    let cancelled = false;
    (async () => {
      try {
        const latest = await memoryApi.getMemories();
        if (cancelled) return;
        setMemories(latest);
        putMemoryMemories(latest);
      } catch {
        /* ignore */
      }
    })().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [visible]);

  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
    };
  }, []);

  const sheetHeight = useMemo(() => {
    const byRatio = Math.round(windowHeight * 0.82);
    return Math.max(560, byRatio);
  }, [windowHeight]);

  const submitMessage = useCallback(
    async (text: string) => {
      const normalized = text.trim();
      if (!normalized || sending || saving) return;
      const userMessage: TuneMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        text: normalized,
      };
      setDraft('');
      setSending(true);
      setMessages((prev) => [...prev, userMessage]);

      const inferred = inferCategory(normalized);
      const candidate = buildCandidate(normalized);

      await new Promise((resolve) => setTimeout(resolve, 420));

      const memoryMessage: TuneMessage = {
        id: `m-${Date.now()}`,
        role: 'memory',
        text: '记忆已生成',
        memory: {
          content: candidate,
          category: inferred.category,
          dimensionLabel: inferred.dimensionLabel,
        },
      };

      setMessages((prev) => [
        ...prev,
        memoryMessage,
        { id: `done-${Date.now()}`, role: 'clone', text: '记住啦。' },
      ]);
      setPendingMemory(memoryMessage.memory ?? null);
      setSending(false);
    },
    [saving, sending]
  );

  useEffect(() => {
    submitMessageRef.current = submitMessage;
  }, [submitMessage]);

  const playRemoteAudio = useCallback(async (uri: string) => {
    const playbackUri = preferHttpsMediaUrl(uri);
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      allowsRecordingIOS: false,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });
    try {
      await soundRef.current?.unloadAsync();
    } catch {
      /* ignore */
    }
    soundRef.current = null;
    const { sound, status } = await Audio.Sound.createAsync(
      { uri: playbackUri },
      { shouldPlay: true, volume: 1 }
    );
    if (!status.isLoaded) {
      const err =
        'error' in status && typeof status.error === 'string' ? status.error : '音频未能加载';
      await sound.unloadAsync().catch(() => {});
      throw new Error(err);
    }
    soundRef.current = sound;

    /** 播完再恢复录音，避免扬声器里的专家语音被 ASR 当成用户下一句 */
    await Promise.race([
      new Promise<void>((resolve, reject) => {
        sound.setOnPlaybackStatusUpdate((s) => {
          if (!s.isLoaded) {
            if ('error' in s && s.error) reject(new Error(String(s.error)));
            return;
          }
          if (s.didJustFinish) resolve();
        });
      }),
      new Promise<void>((resolve) => {
        setTimeout(() => resolve(), 120_000);
      }),
    ]).catch(() => {});

    try {
      await sound.unloadAsync();
    } catch {
      /* ignore */
    }
    soundRef.current = null;

    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      allowsRecordingIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    }).catch(() => {});
  }, []);

  const {
    isStreaming: holdIsStreaming,
    startStreaming: startHoldStreaming,
    stopStreaming: stopHoldStreaming,
    cancelStreaming: cancelHoldStreaming,
  } = useStreamingAsr({
    mode: 'chat',
    backend: 'aliyun',
    onPartialTranscript: (t) => {
      setHoldAsrPreview(t);
    },
    onTranscript: (text) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      Promise.resolve(submitMessageRef.current(trimmed)).catch(() => {});
    },
    onError: (msg) => {
      Alert.alert('语音识别', msg);
    },
  });

  const runExpertWorkflowForUserText = useCallback(
    async (userText: string, cloneLineId: string, ac: AbortController) => {
      const vid = expertVoiceIdRef.current;
      let replyText = '';
      let audioUrl: string | null = null;

      if (!isBailianWorkflowIncrementalOutputEnabled()) {
        const sync = await completeBailianWorkflowSync(userText, vid, { signal: ac.signal });
        replyText = sync.text.trim();
        audioUrl = sync.audioUrl;
        setExpertCallLines((prev) =>
          prev.map((l) =>
            l.id === cloneLineId ? { ...l, text: replyText || '（无文本回复）' } : l
          )
        );
      } else {
        const streamResult = await completeBailianWorkflowStream(
          userText,
          vid,
          {
            onTextChunk: (full) => {
              setExpertCallLines((prev) =>
                prev.map((l) => (l.id === cloneLineId ? { ...l, text: full } : l))
              );
            },
            onAudioUrl: (url) => {
              audioUrl = url;
            },
          },
          { signal: ac.signal }
        );

        replyText = streamResult.text.trim();
        audioUrl = streamResult.audioUrl;

        if (!replyText && !audioUrl) {
          const sync = await completeBailianWorkflowSync(userText, vid, { signal: ac.signal });
          replyText = sync.text.trim();
          audioUrl = sync.audioUrl;
          setExpertCallLines((prev) =>
            prev.map((l) => (l.id === cloneLineId ? { ...l, text: '' } : l))
          );
          const twSpeed = sync.text.length > 120 ? 12 : 6;
          await runTypewriter(
            sync.text,
            (typed) => {
              setExpertCallLines((prev) =>
                prev.map((l) => (l.id === cloneLineId ? { ...l, text: typed } : l))
              );
            },
            { signal: ac.signal, msPerChar: twSpeed }
          );
        }
      }

      if (audioUrl) {
        try {
          await playRemoteAudio(audioUrl);
        } catch (e) {
          console.warn('[MemoryTuneModal] expert TTS play failed', e);
        }
      }
      if (!replyText.trim() && audioUrl) {
        setExpertCallLines((prev) =>
          prev.map((l) => {
            if (l.id !== cloneLineId) return l;
            return { ...l, text: l.text.trim() || '（已生成语音回复，请收听）' };
          })
        );
      }
    },
    [playRemoteAudio]
  );

  const {
    isStreaming: expertIsStreaming,
    meterLevel: expertMeterLevel,
    startStreaming: startExpertStreaming,
    stopStreaming: stopExpertStreaming,
    cancelStreaming: cancelExpertStreaming,
  } = useStreamingAsr({
    mode: 'chat',
    backend: 'aliyun',
    onPartialTranscript: (text) => {
      if (!text.trim()) return;
      expertHasTranscriptThisRoundRef.current = true;
      expertLastTranscriptAtRef.current = Date.now();
    },
    onTranscript: (text) => {
      if (text.trim()) {
        expertHasTranscriptThisRoundRef.current = true;
        expertLastTranscriptAtRef.current = Date.now();
      }
      const flush = expertFlushResolversRef.current.shift();
      if (flush) {
        flush(text);
        return;
      }
      if (!expertCallOpenRef.current || expertWorkflowLoadingRef.current) {
        if (__DEV__) {
          console.warn('[MemoryTuneModal] expert onTranscript dropped', {
            callOpen: expertCallOpenRef.current,
            workflowLoading: expertWorkflowLoadingRef.current,
            preview: String(text).slice(0, 80),
          });
        }
        return;
      }
      Promise.resolve(handleExpertSegmentTextRef.current(text)).catch((err) => {
        if (__DEV__) console.warn('[MemoryTuneModal] handleExpertSegmentText', err);
      });
    },
    onError: (msg) => {
      Alert.alert('语音识别', msg);
    },
  });

  const handleExpertSegmentText = useCallback(
    async (raw: string) => {
      const t = raw.trim();
      expertRestartAfterWorkflowRef.current = true;

      if (!t) {
        if (__DEV__) {
          console.warn('[MemoryTuneModal] expert segment empty after ASR finalize');
        }
        if (
          expertCallOpenRef.current &&
          !expertCallMutedRef.current &&
          !expertWorkflowLoadingRef.current
        ) {
          try {
            await startExpertStreaming();
          } catch {
            /* ignore */
          }
        }
        return;
      }

      const myGen = ++expertSegmentGenRef.current;
      setExpertWorkflowLoadingSync(true);

      let ac: AbortController | null = null;
      let cloneLineId = '';
      try {
        const uid = `ec-u-${Date.now()}`;
        const userLine: ExpertCallLine = { id: uid, role: 'user', text: t };
        setExpertCallLines((prev) => {
          const next = [...prev, userLine];
          expertLinesRef.current = next;
          return next;
        });

        cloneLineId = `ec-a-${Date.now()}`;
        setExpertCallLines((prev) => {
          const next = [...prev, { id: cloneLineId, role: 'clone' as const, text: '' }];
          expertLinesRef.current = next;
          return next;
        });

        expertWorkflowAbortRef.current?.abort();
        ac = new AbortController();
        expertWorkflowAbortRef.current = ac;

        await runExpertWorkflowForUserText(t, cloneLineId, ac);
      } catch (e) {
        if (ac?.signal.aborted) {
          /* hangup / 新一轮已替换 */
        } else if (cloneLineId) {
          const msg = sanitizeWorkflowErrorMessage(formatWorkflowError(e));
          setExpertCallLines((prev) => {
            const next = prev.map((l) =>
              l.id === cloneLineId ? { ...l, text: `工作流失败：${msg.slice(0, 600)}` } : l
            );
            expertLinesRef.current = next;
            return next;
          });
        }
      } finally {
        if (expertSegmentGenRef.current === myGen) {
          setExpertWorkflowLoadingSync(false);
          if (
            expertRestartAfterWorkflowRef.current &&
            expertCallOpenRef.current &&
            !expertCallMutedRef.current
          ) {
            try {
              await startExpertStreaming();
            } catch {
              /* ignore */
            }
          }
        }
      }
    },
    [runExpertWorkflowForUserText, setExpertWorkflowLoadingSync, startExpertStreaming]
  );

  handleExpertSegmentTextRef.current = handleExpertSegmentText;

  useEffect(() => {
    if (visible) return;
    cancelHoldStreaming().catch(() => {});
    cancelExpertStreaming().catch(() => {});
  }, [visible, cancelHoldStreaming, cancelExpertStreaming]);

  const handleSend = useCallback(async () => {
    await submitMessage(draft);
  }, [draft, submitMessage]);

  const startVoicePress = useCallback(
    async (pageY?: number) => {
      if (sending || saving || !!pendingMemory || expertCallOpen) return;
      setVoiceWillCancel(false);
      setVoicePanelVisible(true);
      setVoiceStartY(pageY ?? null);
      setHoldAsrPreview('');
      try {
        await cancelHoldStreaming();
        await startHoldStreaming();
      } catch {
        setVoicePanelVisible(false);
      }
    },
    [cancelHoldStreaming, expertCallOpen, pendingMemory, saving, sending, startHoldStreaming]
  );

  const trackVoiceMove = useCallback(
    (pageY?: number) => {
      if (voiceStartY == null || pageY == null) return;
      setVoiceWillCancel(voiceStartY - pageY > 70);
    },
    [voiceStartY]
  );

  const endVoicePress = useCallback(async () => {
    if (!holdIsStreaming && !voicePanelVisible) return;
    setVoicePanelVisible(false);
    setVoiceStartY(null);
    try {
      if (voiceWillCancel) {
        await cancelHoldStreaming();
        setHoldAsrPreview('');
      } else {
        await stopHoldStreaming();
      }
    } catch {
      /* ignore */
    } finally {
      setVoiceWillCancel(false);
    }
  }, [cancelHoldStreaming, holdIsStreaming, stopHoldStreaming, voicePanelVisible, voiceWillCancel]);

  const pickAttachmentFile = useCallback(async () => {
    setAttachMenuVisible(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const name = result.assets[0]?.name ?? '文件';
      await submitMessage(`分享文件：${name}`);
    } catch {
      Alert.alert('无法打开文件', '请重试');
    }
  }, [submitMessage]);

  const pickAttachmentAlbum = useCallback(async () => {
    setAttachMenuVisible(false);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('需要相册权限', '请在系统设置中允许访问相册后重试。');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;
    await submitMessage('分享图片（相册）');
  }, [submitMessage]);

  const pickAttachmentCamera = useCallback(async () => {
    setAttachMenuVisible(false);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('需要相机权限', '请在系统设置中允许访问相机后重试。');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;
    await submitMessage('分享图片（拍照）');
  }, [submitMessage]);

  const openExpertCall = useCallback(async () => {
    if (pendingMemory || saving || sending || holdIsStreaming || expertWorkflowLoading) return;
    const workflowConfig = getBailianAppConfigStatus();
    if (!workflowConfig.ok) {
      if (__DEV__) {
        console.warn('[MemoryTuneModal] workflow config unavailable', workflowConfig.message);
      }
      Alert.alert('提示', '专家通话暂未配置完成，请稍后再试。');
      return;
    }
    Keyboard.dismiss();
    setAttachMenuVisible(false);
    expertSegmentGenRef.current = 0;
    setExpertCallLines([]);
    expertLinesRef.current = [];
    expertHasTranscriptThisRoundRef.current = false;
    expertLastTranscriptAtRef.current = null;
    expertFlushResolversRef.current = [];
    setExpertCallOpen(true);
    setExpertCallMuted(false);
    try {
      const p = await fetchProfile();
      const v = p.voice_id?.trim() ?? '';
      setExpertVoiceId(v);
      expertVoiceIdRef.current = v;
    } catch {
      setExpertVoiceId('');
      expertVoiceIdRef.current = '';
    }
    try {
      await startExpertStreaming();
    } catch {
      setExpertCallMuted(true);
      setExpertCallOpen(false);
      Alert.alert('无法开始识别', '请检查麦克风权限与 NLS 配置后重试。');
    }
  }, [
    expertWorkflowLoading,
    holdIsStreaming,
    pendingMemory,
    saving,
    sending,
    startExpertStreaming,
  ]);

  const toggleExpertMic = useCallback(async () => {
    if (!expertCallOpen) return;
    if (expertCallMuted) {
      if (expertWorkflowLoading) {
        Alert.alert('请稍候', '专家正在思考回答，请稍后再开麦。');
        return;
      }
      setExpertCallMuted(false);
      expertHasTranscriptThisRoundRef.current = false;
      expertLastTranscriptAtRef.current = null;
      try {
        await startExpertStreaming();
      } catch {
        setExpertCallMuted(true);
        Alert.alert('无法开麦', '请检查麦克风权限后重试。');
      }
    } else {
      expertCallMutedRef.current = true;
      setExpertCallMuted(true);
      expertHasTranscriptThisRoundRef.current = false;
      expertLastTranscriptAtRef.current = null;
      try {
        /** 优先 stop：向 NLS 发 StopTranscription，才能收到定稿并触发 onTranscript；cancel 会直接丢结果 */
        await stopExpertStreaming();
      } catch {
        await cancelExpertStreaming().catch(() => {});
      }
    }
  }, [
    cancelExpertStreaming,
    expertCallMuted,
    expertCallOpen,
    expertWorkflowLoading,
    startExpertStreaming,
    stopExpertStreaming,
  ]);

  useEffect(() => {
    if (!expertCallOpen || expertCallMuted || !expertIsStreaming || expertWorkflowLoading) {
      expertHasTranscriptThisRoundRef.current = false;
      expertLastTranscriptAtRef.current = null;
      return;
    }
    const timer = setInterval(() => {
      if (expertAutoTruncatingRef.current) return;
      if (!expertHasTranscriptThisRoundRef.current) return;
      const lastTs = expertLastTranscriptAtRef.current;
      if (lastTs == null) return;
      if (Date.now() - lastTs < EXPERT_ASR_IDLE_MS) return;
      expertAutoTruncatingRef.current = true;
      stopExpertStreaming()
        .catch(() => {})
        .finally(() => {
          expertAutoTruncatingRef.current = false;
        });
    }, 200);
    return () => clearInterval(timer);
  }, [
    expertCallMuted,
    expertCallOpen,
    expertIsStreaming,
    expertWorkflowLoading,
    stopExpertStreaming,
  ]);

  useEffect(() => {
    if (!expertCallOpen) return;
    scrollExpertCallToBottom(false);
  }, [expertCallOpen, scrollExpertCallToBottom]);

  const hangUpExpertCall = useCallback(async () => {
    expertRestartAfterWorkflowRef.current = false;
    expertSegmentGenRef.current += 1;
    setExpertWorkflowLoadingSync(false);
    expertWorkflowAbortRef.current?.abort();
    expertWorkflowAbortRef.current = null;

    let lines = [...expertLinesRef.current];

    if (expertIsStreaming) {
      const extra = await new Promise<string>((resolve) => {
        const t = setTimeout(() => resolve(''), 12_000);
        expertFlushResolversRef.current.push((txt) => {
          clearTimeout(t);
          resolve(txt);
        });
        stopExpertStreaming().catch(() => {});
      });
      const trimmed = extra.trim();
      if (trimmed) {
        lines = [...lines, { id: `ec-u-${Date.now()}`, role: 'user', text: trimmed }];
      }
    } else {
      await cancelExpertStreaming();
    }

    setExpertCallOpen(false);
    setExpertCallMuted(true);
    expertHasTranscriptThisRoundRef.current = false;
    expertLastTranscriptAtRef.current = null;
    expertFlushResolversRef.current = [];

    setExpertCallLines([]);
    expertLinesRef.current = [];

    const userParts = lines.filter((l) => l.role === 'user');
    if (userParts.length === 0) return;

    const merged: TuneMessage[] = lines.map((l) => ({
      id: l.id,
      role: l.role === 'user' ? 'user' : 'clone',
      text: l.text,
    }));

    const combined = userParts.map((l) => l.text).join('；');
    const inferred = inferCategory(combined);
    const candidate = buildCandidate(combined);

    setMessages((prev) => [...prev, ...merged]);

    await new Promise((r) => setTimeout(r, 360));

    const memoryPayload = {
      content: candidate,
      category: inferred.category,
      dimensionLabel: inferred.dimensionLabel,
    };
    const memMsgId = `m-${Date.now()}`;
    pendingMemoryMessageIdRef.current = memMsgId;
    const memoryBlock: TuneMessage = {
      id: memMsgId,
      role: 'memory',
      text: '记忆已生成',
      memory: memoryPayload,
    };

    setMessages((prev) => [
      ...prev,
      memoryBlock,
      { id: `done-${Date.now()}`, role: 'clone', text: '记住啦。' },
    ]);
    setPendingMemory(memoryPayload);
  }, [cancelExpertStreaming, expertIsStreaming, setExpertWorkflowLoadingSync, stopExpertStreaming]);

  const handleAccept = useCallback(async () => {
    if (!pendingMemory || saving) return;
    setSaving(true);
    try {
      const created = await memoryApi.addMemoryFact({
        content: pendingMemory.content,
        category: pendingMemory.category,
        confidence: 0.86,
      });
      const current = peekMemoryMemories() ?? memories;
      const inserted = created ?? {
        id: `local-${Date.now()}`,
        content: pendingMemory.content,
        category: pendingMemory.category,
        confidence: 0.86,
        updatedAt: new Date().toISOString(),
        deletable: true,
      };
      const next = [inserted, ...current.filter((m) => m.id !== inserted.id)];
      putMemoryMemories(next);
      setMemories(next);
      setPendingMemory(null);
      setEditingPendingMemory(false);
      setMessages((prev) => [
        ...prev,
        { id: `saved-${Date.now()}`, role: 'clone', text: '已存入记忆库。' },
      ]);
    } finally {
      setSaving(false);
    }
  }, [memories, pendingMemory, saving]);

  const handleSaveMemoryEdit = useCallback(() => {
    const t = memoryEditDraft.replace(/\s+/g, ' ').trim();
    if (!t) {
      Alert.alert('提示', '记忆内容不能为空');
      return;
    }
    setPendingMemory((p) => (p ? { ...p, content: t } : null));
    const mid = pendingMemoryMessageIdRef.current;
    if (mid) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === mid && m.role === 'memory' && m.memory
            ? { ...m, memory: { ...m.memory, content: t } }
            : m
        )
      );
    }
    setEditingPendingMemory(false);
  }, [memoryEditDraft]);

  const voiceInputBusy = holdIsStreaming || sending;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onRequestClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1">
        <View className="flex-1 bg-black/50">
          <Pressable className="flex-1" onPress={onRequestClose} />
          <View
            className="overflow-hidden rounded-t-[32px] bg-[#1E1F23]"
            style={{ height: sheetHeight, paddingTop: insets.top + 6 }}>
            <View className="relative items-center pb-4 pt-2">
              <ThemedText className="text-[16px] font-semibold text-white">分身优化</ThemedText>
              <Pressable
                onPress={onRequestClose}
                className="absolute right-4 top-0 h-10 w-10 items-center justify-center rounded-full bg-[#2A2E35]">
                <Icon name="X" size={18} color="#fff" />
              </Pressable>
            </View>

            <ScrollView
              className="px-4"
              contentContainerStyle={{ paddingBottom: 16 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              {messages.length === 1 ? (
                <View className="mb-6 mt-6 h-[360px] items-center justify-center overflow-hidden rounded-3xl">
                  <View className="absolute h-56 w-56 rounded-full bg-[#57D4FF]/20" />
                  <View className="absolute h-48 w-48 rounded-full bg-[#7C8CFF]/20" />
                  <View className="absolute h-44 w-44 rounded-full bg-[#5AF0B6]/20" />
                  <ThemedText className="px-6 text-center text-[15px] leading-7 text-[#E5E7EB]">
                    {cloneIntro}
                  </ThemedText>
                </View>
              ) : null}
              {messages.map((msg) => {
                if (messages.length === 1 && msg.role === 'clone') return null;
                if (msg.role === 'user') {
                  return (
                    <View key={msg.id} className="mb-4 items-end">
                      <View className="max-w-[78%] rounded-2xl bg-black px-4 py-2.5">
                        <ThemedText className="text-[15px] text-white">{msg.text}</ThemedText>
                      </View>
                    </View>
                  );
                }

                if (msg.role === 'memory' && msg.memory) {
                  const canEditPending =
                    pendingMemoryMessageIdRef.current === msg.id && !!pendingMemory;
                  return (
                    <View key={msg.id} className="mb-4 rounded-3xl bg-[#4A4A4D] p-4">
                      <View className="mb-1 flex-row items-center justify-between">
                        <ThemedText className="text-[14px] font-bold text-white">
                          {msg.text}
                        </ThemedText>
                        <View className="flex-row flex-wrap items-center justify-end gap-2">
                          {canEditPending && !editingPendingMemory ? (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel="编辑记忆内容"
                              onPress={() => {
                                setMemoryEditDraft(msg.memory!.content);
                                setEditingPendingMemory(true);
                              }}
                              hitSlop={8}>
                              <ThemedText className="text-[13px] text-[#21D4C6]">编辑</ThemedText>
                            </Pressable>
                          ) : null}
                          <View className="flex-row items-center">
                            <Icon name="Diamond" size={16} color="#21D4C6" />
                            <ThemedText className="ml-2 text-[14px] font-semibold text-[#21D4C6]">
                              {msg.memory.dimensionLabel}
                            </ThemedText>
                          </View>
                        </View>
                      </View>
                      {editingPendingMemory && canEditPending ? (
                        <TextInput
                          className="border-white/15 mt-2 min-h-[88px] rounded-xl border bg-black/20 px-3 py-2 text-[13px] text-[#E5E7EB]"
                          multiline
                          textAlignVertical="top"
                          value={memoryEditDraft}
                          onChangeText={setMemoryEditDraft}
                          placeholder="编辑记忆正文"
                          placeholderTextColor="#8A8F99"
                        />
                      ) : (
                        <ThemedText className="text-[13px] text-[#E5E7EB]">
                          {msg.memory.content}
                        </ThemedText>
                      )}
                      {editingPendingMemory && canEditPending ? (
                        <View className="mt-3 flex-row justify-end gap-5">
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => setEditingPendingMemory(false)}
                            hitSlop={8}>
                            <ThemedText className="text-white/55 text-[13px]">取消</ThemedText>
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            onPress={handleSaveMemoryEdit}
                            hitSlop={8}>
                            <ThemedText className="text-[13px] font-semibold text-[#21D4C6]">
                              保存
                            </ThemedText>
                          </Pressable>
                        </View>
                      ) : null}
                      <ThemedText className="mt-2 text-[12px] text-[#BFC3CB]">
                        分类：{translateCategory(msg.memory.category)}
                      </ThemedText>
                    </View>
                  );
                }

                return (
                  <View key={msg.id} className="mb-4">
                    <ThemedText className="text-[16px] leading-7 text-[#E5E7EB]">
                      {msg.text}
                    </ThemedText>
                  </View>
                );
              })}
              {sending ? (
                <View className="items-start py-2">
                  <ActivityIndicator color={colors.highlight} />
                </View>
              ) : null}
            </ScrollView>

            {pendingMemory && !expertCallOpen ? (
              <View className="mb-3 mt-1 flex-row gap-3 px-4">
                <Pressable
                  className="flex-1 items-center rounded-full bg-black py-4"
                  onPress={() => {
                    setPendingMemory(null);
                    setEditingPendingMemory(false);
                  }}>
                  <ThemedText className="text-[18px] font-semibold text-white">继续对话</ThemedText>
                </Pressable>
                <Pressable
                  className={`bg-white/12 flex-1 items-center rounded-full border border-white/30 py-4 ${saving ? 'opacity-60' : ''}`}
                  disabled={saving}
                  onPress={handleAccept}>
                  <ThemedText className="text-[18px] font-semibold text-white">
                    {saving ? '保存中...' : '接受'}
                  </ThemedText>
                </Pressable>
              </View>
            ) : null}

            {!expertCallOpen ? (
              <View
                className="mb-3 mt-2 flex-row items-center px-4"
                style={{ paddingBottom: Math.max(insets.bottom, 8) }}>
                <Pressable
                  className="mr-1.5 h-12 w-12 items-center justify-center rounded-full bg-[#29303B]"
                  disabled={saving || !!pendingMemory}
                  onPress={() => setAttachMenuVisible(true)}>
                  <Icon name="Plus" size={22} color="#fff" />
                </Pressable>
                <Pressable
                  className="mr-1.5 h-12 w-12 items-center justify-center rounded-full bg-[#29303B]"
                  disabled={saving || !!pendingMemory}
                  onPress={() => {
                    Keyboard.dismiss();
                    setInputMode((m) => (m === 'text' ? 'voice' : 'text'));
                  }}>
                  <Icon name={inputMode === 'text' ? 'Mic' : 'Keyboard'} size={22} color="#fff" />
                </Pressable>
                {inputMode === 'text' ? (
                  <View className="h-12 flex-1 flex-row items-center rounded-full border border-[#60626A] bg-[#2A2C33] px-4">
                    <TextInput
                      className="flex-1 text-base text-white"
                      placeholder="发消息..."
                      placeholderTextColor="#8A8F99"
                      value={draft}
                      onChangeText={setDraft}
                      editable={!saving && !holdIsStreaming && !voicePanelVisible && !pendingMemory}
                      onSubmitEditing={() => {
                        handleSend().catch(() => {});
                      }}
                      returnKeyType="send"
                    />
                  </View>
                ) : (
                  <Pressable
                    className="h-12 flex-1 items-center justify-center rounded-full border border-[#60626A] bg-[#2A2C33] px-4"
                    disabled={saving || voiceInputBusy || !!pendingMemory}
                    onPressIn={(event) => {
                      startVoicePress(event.nativeEvent.pageY).catch(() => {});
                    }}
                    onTouchMove={(event) => {
                      trackVoiceMove(event.nativeEvent.pageY);
                    }}
                    onPressOut={() => {
                      endVoicePress().catch(() => {});
                    }}>
                    <ThemedText
                      className={`text-base font-medium ${holdIsStreaming || voicePanelVisible ? 'text-[#8A8F99]' : 'text-white'}`}>
                      {sending
                        ? '发送中…'
                        : holdIsStreaming || voicePanelVisible
                          ? voiceWillCancel
                            ? '松开取消'
                            : '松开发送 · 上划取消'
                          : '按住说话'}
                    </ThemedText>
                  </Pressable>
                )}
                <Pressable
                  className="ml-2 h-12 w-12 overflow-hidden rounded-full bg-[#29303B]"
                  disabled={saving || !!pendingMemory || expertWorkflowLoading}
                  onPress={() => {
                    openExpertCall().catch(() => {});
                  }}>
                  <Image
                    source={require('@/assets/img/thomino.jpg')}
                    className="h-full w-full"
                    resizeMode="cover"
                  />
                </Pressable>
              </View>
            ) : null}

            {attachMenuVisible ? (
              <View className="absolute inset-0 z-40" pointerEvents="box-none">
                <Pressable
                  className="absolute inset-0 bg-black/50"
                  onPress={() => setAttachMenuVisible(false)}
                />
                <View
                  className="absolute left-4 right-4 z-50"
                  style={{ bottom: Math.max(insets.bottom, 8) + 72 }}
                  pointerEvents="box-none">
                  <View className="overflow-hidden rounded-2xl bg-[#2A2C33]">
                    <Pressable
                      className="flex-row items-center border-b border-white/10 px-5 py-4 active:bg-white/5"
                      onPress={() => {
                        pickAttachmentFile().catch(() => {});
                      }}>
                      <Icon name="FileText" size={22} color="#fff" />
                      <ThemedText className="ml-3 text-[16px] text-white">文件</ThemedText>
                    </Pressable>
                    <Pressable
                      className="flex-row items-center border-b border-white/10 px-5 py-4 active:bg-white/5"
                      onPress={() => {
                        pickAttachmentAlbum().catch(() => {});
                      }}>
                      <Icon name="Image" size={22} color="#fff" />
                      <ThemedText className="ml-3 text-[16px] text-white">相册</ThemedText>
                    </Pressable>
                    <Pressable
                      className="flex-row items-center px-5 py-4 active:bg-white/5"
                      onPress={() => {
                        pickAttachmentCamera().catch(() => {});
                      }}>
                      <Icon name="Camera" size={22} color="#fff" />
                      <ThemedText className="ml-3 text-[16px] text-white">拍照</ThemedText>
                    </Pressable>
                  </View>
                </View>
              </View>
            ) : null}

            {expertCallOpen ? (
              <View className="absolute inset-0 z-[60] rounded-t-[32px] bg-[#0c0d10]">
                <Image
                  source={require('@/assets/img/thomino.jpg')}
                  className="absolute inset-0 h-full w-full opacity-95"
                  resizeMode="cover"
                  blurRadius={Platform.OS === 'ios' ? 22 : 10}
                />
                <BlurView
                  intensity={Platform.OS === 'ios' ? 48 : 32}
                  tint="dark"
                  style={StyleSheet.absoluteFillObject}
                />
                <View className="flex-1" style={{ paddingTop: insets.top + 6 }}>
                  <View className="relative items-center pb-3 pt-2">
                    <ThemedText className="text-[16px] font-semibold text-white">
                      分身优化
                    </ThemedText>
                    <Pressable
                      onPress={() => {
                        hangUpExpertCall().catch(() => {});
                      }}
                      className="absolute right-4 top-0 h-10 w-10 items-center justify-center rounded-full bg-white/10">
                      <Icon name="X" size={18} color="#fff" />
                    </Pressable>
                  </View>
                  <ThemedText className="self-center text-[12px] text-white/40">
                    {new Date().toLocaleTimeString('zh-CN', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    })}
                  </ThemedText>

                  <ScrollView
                    ref={expertCallScrollRef}
                    className="mt-2 flex-1 px-4"
                    contentContainerStyle={{ paddingBottom: 24 }}
                    keyboardShouldPersistTaps="handled"
                    onContentSizeChange={() => {
                      scrollExpertCallToBottom(true);
                    }}
                    showsVerticalScrollIndicator={false}>
                    {expertCallLines.length === 0 ? (
                      <View className="mt-8 px-4">
                        <ThemedText className="text-center text-[14px] leading-6 text-white/60">
                          开麦后可直接说话；转写超过 {Math.round(EXPERT_ASR_IDLE_MS / 1000)}{' '}
                          秒无更新将自动发送并由百炼工作流生成回答。可点麦克风静音；挂断后为本轮对话生成记忆，确认后写入记忆库。
                        </ThemedText>
                      </View>
                    ) : null}
                    {expertCallLines.map((line) =>
                      line.role === 'user' ? (
                        <View key={line.id} className="mb-3 items-end">
                          <View className="bg-black/55 max-w-[82%] rounded-2xl px-3.5 py-2.5">
                            <ThemedText className="text-[15px] text-white">{line.text}</ThemedText>
                          </View>
                        </View>
                      ) : (
                        <View key={line.id} className="mb-3 items-start">
                          <View className="bg-white/12 max-w-[82%] rounded-2xl px-3.5 py-2.5">
                            <ThemedText className="text-[15px] text-white">
                              {line.text || (expertWorkflowLoading ? '思考中…' : '')}
                            </ThemedText>
                          </View>
                        </View>
                      )
                    )}
                  </ScrollView>

                  <View
                    className="bg-black/55 rounded-t-3xl px-6 pt-5"
                    style={{ paddingBottom: Math.max(insets.bottom, 16) }}>
                    <View className="mb-2 flex-row items-center justify-center gap-2">
                      <ThemedText className="text-center text-[20px] font-medium tracking-wide text-white">
                        {formatCallDuration(expertCallSeconds)}
                      </ThemedText>
                      {expertWorkflowLoading ? (
                        <ActivityIndicator size="small" color="#F5D34F" />
                      ) : null}
                    </View>
                    <View className="mb-5 flex-row items-center justify-around">
                      <Pressable
                        onPress={() => {
                          toggleExpertMic().catch(() => {});
                        }}
                        className={`h-16 w-16 items-center justify-center rounded-full border-2 ${expertCallMuted ? 'border-white/40 bg-white/5' : 'border-[#5AF0B6] bg-white/10'}`}>
                        <Icon name={expertCallMuted ? 'MicOff' : 'Mic'} size={26} color="#fff" />
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          hangUpExpertCall().catch(() => {});
                        }}
                        className="h-16 w-16 items-center justify-center rounded-full border-2 border-white/40 bg-white/5">
                        <Icon name="PhoneOff" size={26} color="#EF4444" />
                      </Pressable>
                    </View>
                    <View className="h-3 items-center justify-center overflow-hidden rounded-full">
                      <LinearGradient
                        colors={
                          expertIsStreaming && !expertCallMuted
                            ? [
                                'transparent',
                                `rgba(245,211,79,${0.35 + expertMeterLevel * 0.65})`,
                                'transparent',
                              ]
                            : ['transparent', 'rgba(245,211,79,0.85)', 'transparent']
                        }
                        start={{ x: 0, y: 0.5 }}
                        end={{ x: 1, y: 0.5 }}
                        style={{ height: 4, width: '70%', borderRadius: 999, alignSelf: 'center' }}
                      />
                    </View>
                  </View>
                </View>
              </View>
            ) : null}

            {!expertCallOpen && voicePanelVisible ? (
              <View className="bg-black/35 absolute inset-0 z-30 items-center justify-center">
                <View className="w-[85%] rounded-3xl bg-[#2A2C33] px-5 py-6">
                  <View className="items-center">
                    <View
                      className={`h-16 w-16 items-center justify-center rounded-full ${voiceWillCancel ? 'bg-[#7F1D1D]' : 'bg-[#3A414D]'}`}>
                      <Icon name={voiceWillCancel ? 'X' : 'Mic'} size={28} color="#fff" />
                    </View>
                    <ThemedText className="mt-4 text-lg font-semibold text-white">
                      {voiceWillCancel ? '松开手指，取消发送' : '正在聆听…'}
                    </ThemedText>
                    {holdAsrPreview.trim() && !voiceWillCancel ? (
                      <ThemedText
                        className="mt-3 max-h-28 text-center text-[15px] leading-6 text-[#E5E7EB]"
                        numberOfLines={6}>
                        {holdAsrPreview}
                      </ThemedText>
                    ) : (
                      <ThemedText className="mt-2 text-sm text-[#BFC3CB]">
                        {voiceWillCancel ? '已进入取消区域' : '上划可取消，松开发送'}
                      </ThemedText>
                    )}
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
