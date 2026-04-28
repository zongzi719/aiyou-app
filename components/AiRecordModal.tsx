import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Image,
  ImageBackground,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  Animated,
  Easing,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/app/contexts/ThemeContext';
import Icon from '@/components/Icon';
import ThemedText from '@/components/ThemedText';
import { themes } from '@/utils/color-theme';
import { formatScheduleTimeForDisplay } from '@/utils/date';
import { useStreamingAsr } from '@/hooks/useStreamingAsr';
import {
  analyzeNoteInput,
  createInspirationNote,
  createSchedule,
  type AnalyzeInspirationResult,
  type AnalyzeScheduleResult,
  type NotesApiError,
  type SchedulePriority,
  type ScheduleTask,
} from '@/lib/notesApi';
import { setPendingHomeChatMessage } from '@/lib/pendingHomeChatMessage';

const GOLD = '#F5D34F';
/** 白底 / 金底按钮上的文字，避免与 ThemedText 默认 text-primary 冲突导致看不清 */
const SHEET_BG = '#1D1D1D';
const MIC_TALKING_ICON = require('@/assets/images/ai-record/mic-talking.png');
const MIC_PAUSE_ICON = require('@/assets/images/ai-record/mic-paused.png');
const CARD_OVERLAY_IMAGE = require('@/assets/images/ai-record/card-overlay.png');
const CARD_LISTENING_OVERLAY_IMAGE = require('@/assets/images/ai-record/card-listening-overlay.png');
const CARD_OVERLAY_ASPECT_RATIO = 1478 / 1098;

const SUGGESTION_ROUNDS: string[][] = [
  ['明天下午三点钟开会', '提醒我准备产品演讲'],
  ['记录：新功能三条用户痛点', '周五前整理本周复盘要点'],
  ['灵感：把决策过程做成可回放的时间线', '备忘：下周约设计对齐交互稿'],
];

type Phase = 'input' | 'analyzing' | 'result';
type ModalResult = ModalScheduleResult | ModalNoteResult;

type ModalScheduleResult = {
  kind: 'schedule';
  title: string;
  timeRange: string;
  todos: string[];
  actionPoints: string[];
  missingFields: string[];
  aiMessage: string;
  description: string | null;
  startTime: string | null;
  endTime: string | null;
  priority: SchedulePriority;
  tags: string[];
  tasks: ScheduleTask[];
};

type ModalNoteResult = {
  kind: 'note';
  sectionLabel: string;
  title: string;
  timeRange: string;
  coreIdea: string;
  todos: string[];
  conclusions: string[];
  missingFields: string[];
  aiMessage: string;
  aiContent: string | null;
  aiInsights: string | null;
  tags: string[];
};

type Props = {
  visible: boolean;
  onRequestClose: () => void;
};

function joinVoiceParts(...parts: string[]): string {
  return parts.filter((p) => p.trim().length > 0).join(' ');
}

export default function AiRecordModal({ visible, onRequestClose }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  /** 卡片容器直接使用素材形状，按宽度等比缩放 */
  const mainCardW = Math.min(366, windowWidth - 32);
  const mainCardH = Math.max(
    300,
    Math.min(mainCardW * CARD_OVERLAY_ASPECT_RATIO, windowHeight - insets.top - 210)
  );

  /** 首次语音前输入框原文；voiceAccumulated 非空后保持不变 */
  const preVoiceTextRef = useRef('');
  /** 历次流式 session 已落定文本之和 */
  const voiceAccumulatedRef = useRef('');
  const wasVoiceStreamingRef = useRef(false);
  const isVoiceStreamingRef = useRef(false);

  const [pendingAudioUrl, setPendingAudioUrl] = useState<string | null>(null);
  /** 区分采集中与已点结束、等待 done/OSS */
  const [voicePhase, setVoicePhase] = useState<'idle' | 'capturing' | 'finalizing'>('idle');
  /** 录音态页面锁定：暂停后仍停留在录音页 UI，不回到初始态 */
  const [recordingLayoutLocked, setRecordingLayoutLocked] = useState(false);

  const {
    isStreaming: isVoiceStreaming,
    startStreaming,
    stopStreaming,
    cancelStreaming,
  } = useStreamingAsr({
    mode: 'notes',
    onPartialTranscript: (sessionText) => {
      setDraft(joinVoiceParts(preVoiceTextRef.current, voiceAccumulatedRef.current, sessionText));
    },
    onTranscript: (t, url) => {
      voiceAccumulatedRef.current = joinVoiceParts(voiceAccumulatedRef.current, t);
      setDraft(joinVoiceParts(preVoiceTextRef.current, voiceAccumulatedRef.current));
      if (url?.trim()) {
        setPendingAudioUrl(url.trim());
      }
    },
    onError: (msg) => {
      Alert.alert('语音识别', msg);
    },
  });

  /** 略放大弹窗，避免输入区加高后底部麦克风被裁切 */
  const sheetMaxH = Math.round(windowHeight * 0.93);
  const sheetMinH = Math.round(
    Math.min(windowHeight * 0.76, windowHeight - insets.top - Math.max(insets.bottom, 8) - 12)
  );
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const [phase, setPhase] = useState<Phase>('input');
  const [draft, setDraft] = useState('');
  const [rawSubmitted, setRawSubmitted] = useState('');
  const [result, setResult] = useState<ModalResult | null>(null);
  const [suggestionRound, setSuggestionRound] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [savedTargetTab, setSavedTargetTab] = useState<'schedule' | 'inspiration' | null>(null);
  const textInputRef = useRef<TextInput | null>(null);
  const wave1 = useRef(new Animated.Value(0)).current;
  const wave2 = useRef(new Animated.Value(0.5)).current;

  const suggestions = useMemo(
    () => SUGGESTION_ROUNDS[suggestionRound % SUGGESTION_ROUNDS.length],
    [suggestionRound]
  );

  useEffect(() => {
    if (visible) {
      setPhase('input');
      setDraft('');
      setRawSubmitted('');
      setResult(null);
      setSuggestionRound(0);
      setIsSaving(false);
      setSavedTargetTab(null);
      preVoiceTextRef.current = '';
      voiceAccumulatedRef.current = '';
      setPendingAudioUrl(null);
      setVoicePhase('idle');
      setRecordingLayoutLocked(false);
      wasVoiceStreamingRef.current = false;
      wave1.stopAnimation();
      wave2.stopAnimation();
      wave1.setValue(0);
      wave2.setValue(0.5);
    }
  }, [visible, wave1, wave2]);

  /** 正在聆听时关闭弹窗：强制中断识别并清空输入与语音缓存 */
  const abortVoiceIfListeningAndClearDraft = useCallback(async () => {
    if (!isVoiceStreamingRef.current) return;
    await cancelStreaming().catch(() => {});
    preVoiceTextRef.current = '';
    voiceAccumulatedRef.current = '';
    setPendingAudioUrl(null);
    setVoicePhase('idle');
    wasVoiceStreamingRef.current = false;
    setDraft('');
  }, [cancelStreaming]);

  useEffect(() => {
    if (visible) return;
    abortVoiceIfListeningAndClearDraft().catch(() => {});
  }, [visible, abortVoiceIfListeningAndClearDraft]);

  const closeAll = useCallback(() => {
    abortVoiceIfListeningAndClearDraft()
      .catch(() => {})
      .finally(() => {
        onRequestClose();
      });
  }, [abortVoiceIfListeningAndClearDraft, onRequestClose]);

  const closeSavedDialogOnly = useCallback(() => {
    setSavedTargetTab(null);
  }, []);

  const closeSavedDialogAndSheet = useCallback(() => {
    setSavedTargetTab(null);
    closeAll();
  }, [closeAll]);

  const goToSavedResult = useCallback(() => {
    if (!savedTargetTab) return;
    const nextTab = savedTargetTab;
    setSavedTargetTab(null);
    closeAll();
    router.push(`/screens/memory?tab=inspiration&notesTab=${nextTab}`);
  }, [closeAll, savedTargetTab]);

  const handleMicPress = useCallback(async () => {
    try {
      if (!isVoiceStreaming) {
        if (!voiceAccumulatedRef.current.trim()) {
          preVoiceTextRef.current = draft;
        }
        setRecordingLayoutLocked(true);
        setVoicePhase('capturing');
        await startStreaming();
      } else {
        setVoicePhase('finalizing');
        await stopStreaming();
      }
    } catch (e) {
      setVoicePhase('idle');
      Alert.alert('录音失败', e instanceof Error ? e.message : '请检查麦克风权限后重试');
    }
  }, [isVoiceStreaming, draft, startStreaming, stopStreaming]);

  const handleClearDraftWhileRecording = useCallback(() => {
    preVoiceTextRef.current = '';
    voiceAccumulatedRef.current = '';
    setPendingAudioUrl(null);
    setDraft('');
  }, []);


  const handleSubmitInspirationFromRecording = useCallback(async () => {
    if (voicePhase === 'finalizing') return;
    const fallbackText = draft.trim();
    try {
      Keyboard.dismiss();
      if (isVoiceStreaming) {
        setVoicePhase('finalizing');
        await stopStreaming();
      }
      const recognized = joinVoiceParts(preVoiceTextRef.current, voiceAccumulatedRef.current).trim();
      const submitText = recognized || fallbackText;
      if (!submitText) {
        Alert.alert('提示', '请先说点内容再提交');
        return;
      }
      setRawSubmitted(submitText);
      setPhase('analyzing');
      const analysis = await analyzeNoteInput({ text: submitText });
      if (analysis.type === 'schedule') {
        setResult(mapScheduleToModal(analysis));
      } else {
        setResult(mapInspirationToModal(analysis, submitText));
      }
      setPhase('result');
    } catch (e) {
      setPhase('input');
      setVoicePhase('idle');
      Alert.alert('提交失败', e instanceof Error ? e.message : '请稍后重试');
    }
  }, [
    draft,
    isVoiceStreaming,
    mapInspirationToModal,
    mapScheduleToModal,
    stopStreaming,
    voicePhase,
  ]);

  const showRecordingLayout = isVoiceStreaming || recordingLayoutLocked;

  const isLikelyChatIntent = useCallback((text: string) => {
    const t = text.trim();
    if (!t) return false;
    const lower = t.toLowerCase();
    const scheduleHints =
      /明天|后天|今日|今天|周[一二三四五六日天]|几点|会议|开会|约会|提醒|日程|日历|预约|\d{1,2}[:：]\d{2}/.test(
        t
      );
    const questionHints =
      /^(什么|怎么|为什么|如何|能否|可以吗|吗[？?]?$|请问|谁|哪|几)/.test(t) ||
      /[？?]/.test(t) ||
      lower.includes('what ') ||
      lower.includes('how ');
    return questionHints && !scheduleHints;
  }, []);

  const mapInspirationToModal = useCallback(
    (analysis: AnalyzeInspirationResult, rawText: string): ModalNoteResult => ({
      kind: 'note',
      sectionLabel: '灵感笔记',
      title: analysis.title || '灵感记录',
      timeRange: '',
      coreIdea: analysis.ai_content || rawText,
      todos: [],
      conclusions: analysis.ai_insights ? [analysis.ai_insights] : [],
      missingFields: analysis.missing_fields,
      aiMessage: analysis.ai_message,
      aiContent: analysis.ai_content,
      aiInsights: analysis.ai_insights,
      tags: analysis.tags,
    }),
    []
  );

  const mapScheduleToModal = useCallback((analysis: AnalyzeScheduleResult): ModalScheduleResult => {
    const startShown = analysis.start_time
      ? formatScheduleTimeForDisplay(analysis.start_time)
      : '';
    const endShown = analysis.end_time ? formatScheduleTimeForDisplay(analysis.end_time) : '';
    const timeRange = startShown
      ? endShown
        ? `${startShown} - ${endShown}`
        : startShown
      : '待定';
    return {
      kind: 'schedule',
      title: analysis.title || '日程安排',
      timeRange,
      todos: analysis.tasks.map((task) => task.content),
      actionPoints: analysis.missing_fields.length > 0 ? ['补全缺失信息后安排更准确'] : [],
      missingFields: analysis.missing_fields,
      aiMessage: analysis.ai_message,
      description: analysis.description,
      startTime: analysis.start_time,
      endTime: analysis.end_time,
      priority: analysis.priority,
      tags: analysis.tags,
      tasks: analysis.tasks,
    };
  }, []);

  const runAnalyze = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t) {
        Alert.alert('提示', '请先输入内容，或使用语音录入');
        return;
      }
      setRawSubmitted(t);
      setPhase('analyzing');
      try {
        if (isLikelyChatIntent(t)) {
          setPendingHomeChatMessage(t);
          closeAll();
          router.replace('/?newChat=1');
          return;
        }
        const analysis = await analyzeNoteInput({ text: t });
        if (analysis.type === 'schedule') {
          setResult(mapScheduleToModal(analysis));
        } else {
          setResult(mapInspirationToModal(analysis, t));
        }
        setPhase('result');
      } catch (error) {
        setPhase('input');
        const apiError = error as NotesApiError;
        Alert.alert('分析失败', apiError?.message || '请检查网络或 API 配置后重试');
      }
    },
    [closeAll, isLikelyChatIntent, mapInspirationToModal, mapScheduleToModal]
  );

  useEffect(() => {
    if (wasVoiceStreamingRef.current && !isVoiceStreaming) {
      setVoicePhase('idle');
    }
    wasVoiceStreamingRef.current = isVoiceStreaming;
    isVoiceStreamingRef.current = isVoiceStreaming;
  }, [isVoiceStreaming]);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvt, (event) => {
      setKeyboardHeight(event.endCoordinates?.height ?? 0);
    });
    const onHide = Keyboard.addListener(hideEvt, () => {
      setKeyboardHeight(0);
    });
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  useEffect(() => {
    if (!visible || !isVoiceStreaming) {
      wave1.stopAnimation();
      wave2.stopAnimation();
      wave1.setValue(0);
      wave2.setValue(0.5);
      return;
    }

    const waveDuration = Platform.OS === 'ios' ? 1600 : 1750;
    const waveAnim1 = Animated.loop(
      Animated.timing(wave1, {
        toValue: 1,
        duration: waveDuration,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      })
    );
    const waveAnim2 = Animated.loop(
      Animated.timing(wave2, {
        toValue: 1.5,
        duration: waveDuration,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      })
    );
    waveAnim1.start();
    waveAnim2.start();

    return () => {
      waveAnim1.stop();
      waveAnim2.stop();
    };
  }, [isVoiceStreaming, visible, wave1, wave2]);

  const onSave = useCallback(async () => {
    if (!result || isSaving) return;
    setIsSaving(true);
    try {
      if (result.kind === 'schedule') {
        await createSchedule({
          title: result.title,
          description: result.description,
          start_time: result.startTime,
          end_time: result.endTime,
          priority: result.priority,
          tags: result.tags,
          tasks: result.tasks,
        });
      } else {
        await createInspirationNote({
          title: result.title,
          raw_content: rawSubmitted,
          ai_content: result.aiContent,
          ai_insights: result.aiInsights,
          tags: result.tags,
          audio_url: pendingAudioUrl,
        });
      }
      const tab = result.kind === 'schedule' ? 'schedule' : 'inspiration';
      setSavedTargetTab(tab);
    } catch (error) {
      const apiError = error as NotesApiError;
      Alert.alert('保存失败', apiError?.message || '请稍后重试');
    } finally {
      setIsSaving(false);
    }
  }, [closeAll, isSaving, rawSubmitted, result, pendingAudioUrl]);

  const renderInput = () => (
    <View
      className="flex-1 items-center pb-2"
      style={{ paddingHorizontal: 3, alignItems: 'center' }}>
      <ImageBackground
        source={showRecordingLayout ? CARD_LISTENING_OVERLAY_IMAGE : CARD_OVERLAY_IMAGE}
        resizeMode="stretch"
        style={[
          styles.figmaCard,
          {
            width: mainCardW,
            height: showRecordingLayout
              ? Math.max(170, mainCardH - Math.round(keyboardLift * 0.62))
              : mainCardH,
          },
        ]}>
        <View
          style={{
            flex: 1,
            zIndex: 1,
            paddingTop: showRecordingLayout ? 13 : 20,
            paddingBottom: showRecordingLayout ? 13 : 16,
            paddingHorizontal: showRecordingLayout ? 13 : 20,
            justifyContent: 'flex-start',
          }}>
          {showRecordingLayout ? (
            <>
              <View style={{ flex: 1, minHeight: 0, marginTop: 0 }}>
                <View style={styles.listeningInputCard}>
                  <View style={styles.listeningInputInner}>
                    <TextInput
                      ref={textInputRef}
                      value={draft}
                      onChangeText={setDraft}
                      placeholder="正在聆听…"
                      placeholderTextColor="rgba(255,255,255,0.5)"
                      multiline
                      style={styles.listeningInputField}
                      textAlignVertical="top"
                      scrollEnabled
                    />
                    <View style={{ height: 10 }} />
                  </View>
                </View>
              </View>
            </>
          ) : (
            <>
              <View style={{ marginTop: 50 }}>
                <ThemedText
                  className="text-white"
                  style={{ fontSize: 20, lineHeight: 28, fontWeight: '400' }}>
                  今天有什么灵感/安排事项？
                </ThemedText>
                <ThemedText
                  className="text-white"
                  style={{ fontSize: 20, lineHeight: 28, fontWeight: '400', marginTop: 2 }}>
                  告诉我，可以帮你生成
                </ThemedText>

                <View className="mt-4 flex-row flex-wrap" style={{ gap: 10 }}>
                  {suggestions.map((s) => (
                    <View
                      key={s}
                      className="rounded-full border px-3 py-2.5"
                      style={{ borderColor: 'rgba(255,255,255,0.28)' }}>
                      <ThemedText
                        style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, lineHeight: 18 }}
                        numberOfLines={2}>
                        {s}
                      </ThemedText>
                    </View>
                  ))}
                </View>

                <View className="mt-2 flex-row items-center gap-1.5 self-start" accessibilityLabel="换一批示例">
                  <ThemedText style={{ color: '#8a8a8a', fontSize: 10, lineHeight: 12 }}>
                    换一批
                  </ThemedText>
                  <Icon name="RefreshCw" size={12} color="#8a8a8a" />
                </View>
              </View>

              <View style={{ flex: 1, minHeight: 40, marginTop: 4 }} />
            </>
          )}
        </View>
      </ImageBackground>

      <View
        className="mt-4 items-center"
        style={{
          width: '100%',
          backgroundColor: SHEET_BG,
          paddingBottom: 22 + keyboardLift,
        }}>
        <View style={styles.recordingActionRow}>
          {showRecordingLayout ? (
            <Pressable
              onPress={handleClearDraftWhileRecording}
              style={styles.recordingSideButton}
              accessibilityRole="button"
              accessibilityLabel="清空输入">
              <Icon name="RefreshCw" size={21} color="white" />
            </Pressable>
          ) : (
            <View style={styles.recordingSideButtonPlaceholder} />
          )}

          <Pressable
            onPress={() => {
              handleMicPress().catch(() => {});
            }}
            accessibilityRole="button"
            accessibilityLabel="语音输入">
            <View style={styles.micOrbWrap}>
              {isVoiceStreaming ? (
                <>
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.waveRing,
                      {
                        opacity: wave1.interpolate({
                          inputRange: [0, 0.7, 1],
                          outputRange: [0.45, 0.22, 0],
                        }),
                        transform: [
                          {
                            scale: wave1.interpolate({
                              inputRange: [0, 1],
                              outputRange: [1, 1.72],
                            }),
                          },
                        ],
                      },
                    ]}
                  />
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.waveRing,
                      {
                        opacity: wave2.interpolate({
                          inputRange: [0.5, 1.2, 1.5],
                          outputRange: [0.38, 0.16, 0],
                        }),
                        transform: [
                          {
                            scale: wave2.interpolate({
                              inputRange: [0.5, 1.5],
                              outputRange: [1.1, 1.8],
                            }),
                          },
                        ],
                      },
                    ]}
                  />
                </>
              ) : null}
              <Image
                source={isVoiceStreaming ? MIC_PAUSE_ICON : MIC_TALKING_ICON}
                style={styles.micIconImage}
                resizeMode="contain"
              />
            </View>
          </Pressable>

          {showRecordingLayout ? (
            <Pressable
              onPress={() => {
                handleSubmitInspirationFromRecording().catch(() => {});
              }}
              style={styles.recordingSideButton}
              accessibilityRole="button"
              accessibilityLabel="提交灵感笔记">
              <Icon name="Check" size={22} color="white" />
            </Pressable>
          ) : (
            <View style={styles.recordingSideButtonPlaceholder} />
          )}
        </View>
        <ThemedText className="mt-3" style={{ color: '#A5A5A5', fontSize: 15, lineHeight: 18 }}>
          {voicePhase === 'finalizing'
            ? '正在识别语音…'
            : isVoiceStreaming
              ? '点击结束录音'
              : '点击录音'}
        </ThemedText>
      </View>
    </View>
  );

  const renderAnalyzing = () => (
    <View className="min-h-[200px] items-center justify-center px-6 py-16">
      <ActivityIndicator size="large" color={GOLD} />
      <ThemedText className="mt-4 text-center text-white/80">AI 正在理解你的内容…</ThemedText>
    </View>
  );

  const renderSchedule = (p: ModalScheduleResult) => (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
      showsVerticalScrollIndicator={false}>
      <View className="mt-2 flex-row items-start gap-2">
        <Icon name="Calendar" size={22} color={GOLD} strokeWidth={1.8} />
        <View className="flex-1">
          <ThemedText className="text-base font-semibold text-white">
            已为你整理为日程安排
          </ThemedText>
          <ThemedText className="mt-1 text-sm text-white/50">
            我提取了时间、事项和提醒信息，你可以确认后保存
          </ThemedText>
        </View>
      </View>

      {p.missingFields.length > 0 && (
        <View className="bg-amber-500/15 border-amber-400/35 mt-4 rounded-2xl border px-3 py-2">
          <ThemedText className="text-xs font-medium text-amber-200/95">请补充</ThemedText>
          {p.missingFields.map((m) => (
            <ThemedText key={m} className="mt-1 text-sm text-amber-100/90">
              · {m}
            </ThemedText>
          ))}
        </View>
      )}
      {p.aiMessage ? (
        <View className="mt-3 rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2">
          <ThemedText className="text-xs text-cyan-100/90">{p.aiMessage}</ThemedText>
        </View>
      ) : null}

      <View className="mt-5 rounded-3xl border border-white/10 bg-neutral-800/90 p-4">
        <ThemedText className="mb-2 text-xs text-[#F5D34F]">| 日程安排</ThemedText>
        <View className="flex-row items-start justify-between gap-2">
          <ThemedText className="flex-1 text-lg font-semibold text-[#F5D34F]">{p.title}</ThemedText>
          <View className="shrink-0 flex-row items-center gap-1">
            <Icon name="Clock" size={16} color="rgba(255,255,255,0.55)" />
            <ThemedText className="text-sm text-white/60">{p.timeRange}</ThemedText>
          </View>
        </View>
        {p.todos.length > 0 && (
          <View className="mt-4">
            <ThemedText className="mb-2 text-xs" style={{ color: '#ffffff' }}>
              待办
            </ThemedText>
            {p.todos.map((t) => (
              <ThemedText key={t} className="mt-1 text-sm" style={{ color: '#ffffff' }}>
                · {t}
              </ThemedText>
            ))}
          </View>
        )}
        {p.actionPoints.length > 0 && (
          <View className="mt-4">
            <ThemedText className="mb-2 text-xs" style={{ color: '#ffffff' }}>
              行动要点
            </ThemedText>
            {p.actionPoints.map((t) => (
              <View key={t} className="mt-2 flex-row gap-2">
                <Icon name="Lightbulb" size={16} color={GOLD} />
                <ThemedText className="flex-1 text-sm" style={{ color: '#ffffff' }}>
                  {t}
                </ThemedText>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );

  const renderNote = (p: ModalNoteResult) => (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
      showsVerticalScrollIndicator={false}>
      <View className="mt-2 flex-row items-start gap-2">
        <Icon name="Lightbulb" size={22} color="#fff" strokeWidth={1.8} />
        <View className="flex-1">
          <ThemedText className="text-base font-semibold text-white">
            已为你整理为灵感笔记
          </ThemedText>
          <ThemedText className="mt-1 text-sm text-white/50">
            我提炼了讨论重点、结论与后续行动项
          </ThemedText>
        </View>
      </View>

      <View className="mt-5 rounded-3xl border border-white/10 bg-neutral-800/90 p-4">
        <ThemedText className="mb-2 text-xs text-[#F5D34F]">| {p.sectionLabel}</ThemedText>
        <View className="flex-row items-start justify-between gap-2">
          <ThemedText className="flex-1 text-lg font-semibold text-[#F5D34F]">{p.title}</ThemedText>
          {p.timeRange ? (
            <View className="shrink-0 flex-row items-center gap-1">
              <Icon name="Clock" size={16} color="rgba(255,255,255,0.55)" />
              <ThemedText className="text-sm text-white/60">{p.timeRange}</ThemedText>
            </View>
          ) : null}
        </View>
        {p.coreIdea ? (
          <View className="mt-4">
            <ThemedText className="mb-1 text-xs" style={{ color: '#ffffff' }}>
              核心想法
            </ThemedText>
            <ThemedText className="text-sm leading-6" style={{ color: '#ffffff' }}>
              {p.coreIdea}
            </ThemedText>
          </View>
        ) : null}
        {p.missingFields.length > 0 && (
          <View className="bg-amber-500/15 border-amber-400/35 mt-4 rounded-2xl border px-3 py-2">
            <ThemedText className="text-xs font-medium text-amber-200/95">建议补充</ThemedText>
            {p.missingFields.map((m) => (
              <ThemedText key={m} className="mt-1 text-sm text-amber-100/90">
                · {m}
              </ThemedText>
            ))}
          </View>
        )}
        {p.aiMessage ? (
          <View className="mt-4 rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2">
            <ThemedText className="text-xs text-cyan-100/90">{p.aiMessage}</ThemedText>
          </View>
        ) : null}
        {p.todos.length > 0 && (
          <View className="mt-4">
            <ThemedText className="mb-2 text-xs" style={{ color: '#ffffff' }}>
              待办事项
            </ThemedText>
            {p.todos.map((t) => (
              <ThemedText key={t} className="mt-1 text-sm" style={{ color: '#ffffff' }}>
                · {t}
              </ThemedText>
            ))}
          </View>
        )}
        {p.conclusions.length > 0 && (
          <View className="mt-4">
            <ThemedText className="mb-2 text-xs" style={{ color: '#ffffff' }}>
              关键结论
            </ThemedText>
            {p.conclusions.map((t) => (
              <View key={t} className="mt-2 flex-row gap-2">
                <Icon name="Lightbulb" size={16} color={GOLD} />
                <ThemedText className="flex-1 text-sm" style={{ color: '#ffffff' }}>
                  {t}
                </ThemedText>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );

  const renderResult = () => {
    if (!result) return null;
    if (result.kind === 'schedule') return renderSchedule(result);
    if (result.kind === 'note') return renderNote(result);
    return null;
  };

  const resultFooter = (
    <View
      className="flex-row gap-2 border-t border-white/10 px-4 pt-3"
      style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
      <Pressable
        onPress={closeAll}
        className="active:opacity-85 flex-1 items-center rounded-full border border-white/25 bg-white/12 py-3"
        accessibilityRole="button"
        accessibilityLabel="取消">
        <Text style={styles.footerBtnLabelLight}>取消</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          onSave();
        }}
        disabled={isSaving}
        className={`flex-1 items-center rounded-full py-3 active:opacity-90 ${isSaving ? 'opacity-60' : ''}`}
        style={{ backgroundColor: GOLD }}
        accessibilityRole="button"
        accessibilityLabel="保存">
        <Text style={styles.footerBtnLabelOnGold}>{isSaving ? '保存中…' : '保存'}</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          setResult(null);
          setPhase('input');
          setDraft(rawSubmitted);
        }}
        className="border-white/35 active:opacity-85 flex-1 items-center rounded-full border py-3"
        accessibilityRole="button"
        accessibilityLabel="修改">
        <Text style={styles.footerBtnLabelDark}>修改</Text>
      </Pressable>
    </View>
  );

  const isInputPhase = phase === 'input';
  const keyboardLift = isInputPhase
    ? Math.min(Math.max(0, keyboardHeight - insets.bottom), Math.round(windowHeight * 0.38))
    : 0;
  const sheetBottomPadding = Math.max(insets.bottom, 16);
  const effectiveSheetMaxH = sheetMaxH;
  const effectiveSheetMinH = sheetMinH;
  const showKeyboardSubmitButton =
    isInputPhase && showRecordingLayout && keyboardHeight > 0 && voicePhase !== 'finalizing';

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={closeAll}>
      <KeyboardAvoidingView
        behavior={undefined}
        style={[styles.kavRoot, themes[theme]]}>
        <View style={styles.overlayRoot}>
          <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFillObject} />
          <Pressable
            style={StyleSheet.absoluteFillObject}
            className="bg-black/45"
            onPress={closeAll}
            accessibilityLabel="关闭背景"
          />
          <View
            pointerEvents="box-none"
            style={[
              styles.sheetWrap,
              {
                paddingTop: insets.top + 12,
                paddingBottom: sheetBottomPadding,
                justifyContent: isInputPhase ? 'flex-end' : 'center',
              },
            ]}>
            <View
              style={[
                styles.sheet,
                {
                  minHeight: effectiveSheetMinH,
                  maxHeight: effectiveSheetMaxH,
                  paddingBottom:
                    phase === 'result'
                      ? 0
                      : Math.max(insets.bottom, showRecordingLayout ? 20 : 8),
                },
              ]}>
              <View className="relative shrink-0 flex-row items-center justify-center px-4 pb-3 pt-4">
                <ThemedText
                  className="text-center text-white"
                  style={{ fontSize: 16, lineHeight: 20, fontWeight: '400' }}>
                  AI记录
                </ThemedText>
                {showKeyboardSubmitButton ? (
                  <Pressable
                    onPress={() => {
                      handleSubmitInspirationFromRecording().catch(() => {});
                    }}
                    style={styles.headerKeyboardSubmitButton}
                    accessibilityRole="button"
                    accessibilityLabel="键盘提交灵感笔记">
                    <Icon name="Check" size={18} color="#111111" />
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={closeAll}
                  hitSlop={12}
                  className="absolute right-3 h-9 w-9 items-center justify-center rounded-full bg-white/10"
                  accessibilityRole="button"
                  accessibilityLabel="关闭">
                  <Icon name="X" size={18} color="#fff" />
                </Pressable>
              </View>

              {phase === 'result' ? (
                <>
                  <View style={styles.sheetBody}>{renderResult()}</View>
                  {resultFooter}
                </>
              ) : (
                <View style={styles.sheetBody}>
                  {phase === 'input' ? renderInput() : null}
                  {phase === 'analyzing' ? renderAnalyzing() : null}
                </View>
              )}
            </View>
          </View>
          {savedTargetTab ? (
            <View style={styles.savedDialogOverlay} pointerEvents="box-none">
              <Pressable
                style={StyleSheet.absoluteFillObject}
                className="bg-black/55"
                onPress={closeSavedDialogOnly}
                accessibilityRole="button"
                accessibilityLabel="关闭已保存弹窗背景"
              />
              <View style={styles.savedDialogCard}>
                <View className="flex-row items-start gap-3">
                  <View style={styles.savedDialogIconWrap}>
                    <Icon name="Check" size={18} color="#111111" />
                  </View>
                  <View className="flex-1">
                    <ThemedText className="text-lg font-semibold text-[#F8F8F8]">已保存</ThemedText>
                    <ThemedText className="mt-1 text-sm leading-5 text-white/65">
                      已同步到灵感笔记模块。
                    </ThemedText>
                  </View>
                </View>

                <View className="mt-6 flex-row justify-end gap-2">
                  <Pressable
                    onPress={goToSavedResult}
                    className="active:opacity-85 items-center rounded-full px-4 py-2.5"
                    style={styles.savedDialogPrimaryBtn}
                    accessibilityRole="button"
                    accessibilityLabel="查看已保存内容">
                    <ThemedText style={styles.savedDialogPrimaryBtnText}>去查看</ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={closeSavedDialogAndSheet}
                    className="active:opacity-85 items-center rounded-full px-4 py-2.5"
                    style={styles.savedDialogGhostBtn}
                    accessibilityRole="button"
                    accessibilityLabel="关闭已保存弹窗">
                    <ThemedText style={styles.savedDialogGhostBtnText}>关闭</ThemedText>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  kavRoot: {
    flex: 1,
  },
  overlayRoot: {
    flex: 1,
  },
  /** 弹窗垂直居中，避免 RN 下 flex + max-h 百分比导致子级高度塌成一条底栏 */
  sheetWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  sheet: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    borderRadius: 30,
    backgroundColor: SHEET_BG,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  sheetBody: {
    flex: 1,
    backgroundColor: SHEET_BG,
  },
  figmaCard: {
    borderRadius: 26,
    backgroundColor: 'transparent',
    alignSelf: 'center',
    overflow: 'hidden',
  },
  listeningInputCard: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  listeningInputInner: {
    flex: 1,
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  listeningInputField: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 22,
    paddingHorizontal: 20,
    paddingVertical: 18,
    backgroundColor: 'transparent',
    borderRadius: 0,
  },
  cardIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micOrbWrap: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingActionRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 56,
  },
  recordingSideButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0C0F14',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  recordingSideButtonPlaceholder: {
    width: 40,
    height: 40,
  },
  micIconImage: {
    width: 72,
    height: 72,
  },
  waveRing: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: 'rgba(245, 211, 79, 0.95)',
    backgroundColor: 'rgba(245, 211, 79, 0.08)',
  },
  footerBtnLabelLight: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f4f4f5',
  },
  footerBtnLabelOnGold: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  footerBtnLabelDark: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fafafa',
  },
  savedDialogOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  savedDialogCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#161616',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  savedDialogIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GOLD,
  },
  savedDialogPrimaryBtn: {
    backgroundColor: GOLD,
  },
  savedDialogGhostBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.24)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  savedDialogPrimaryBtnText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
    color: '#111111',
  },
  savedDialogGhostBtnText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
    color: '#f4f4f5',
  },
  headerKeyboardSubmitButton: {
    position: 'absolute',
    right: 52,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFD041',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.18)',
  },
});
