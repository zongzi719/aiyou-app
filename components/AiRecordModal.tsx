import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
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
const ACCENT_GOLD = '#AA873C';
/** 白底 / 金底按钮上的文字，避免与 ThemedText 默认 text-primary 冲突导致看不清 */
const SHEET_BG = '#1D1D1D';

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
  /** 与稿一致：Frame 1597880490 366×463@26px 圆角；小屏不超出视窗 */
  const mainCardW = Math.min(366, windowWidth - 32);
  const mainCardH = Math.max(300, Math.min(463, windowHeight - insets.top - 210));

  /** 首次语音前输入框原文；voiceAccumulated 非空后保持不变 */
  const preVoiceTextRef = useRef('');
  /** 历次流式 session 已落定文本之和 */
  const voiceAccumulatedRef = useRef('');
  const wasVoiceStreamingRef = useRef(false);
  const isVoiceStreamingRef = useRef(false);

  const [pendingAudioUrl, setPendingAudioUrl] = useState<string | null>(null);
  /** 区分采集中与已点结束、等待 done/OSS */
  const [voicePhase, setVoicePhase] = useState<'idle' | 'capturing' | 'finalizing'>('idle');

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

  const [phase, setPhase] = useState<Phase>('input');
  const [draft, setDraft] = useState('');
  const [rawSubmitted, setRawSubmitted] = useState('');
  const [result, setResult] = useState<ModalResult | null>(null);
  const [suggestionRound, setSuggestionRound] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  /** 未点「点击录音」前不展示输入框与发起点工具栏，仅展示引导与示例 */
  const [showComposer, setShowComposer] = useState(false);
  const textInputRef = useRef<TextInput | null>(null);

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
      setShowComposer(false);
      preVoiceTextRef.current = '';
      voiceAccumulatedRef.current = '';
      setPendingAudioUrl(null);
      setVoicePhase('idle');
      wasVoiceStreamingRef.current = false;
    }
  }, [visible]);

  useEffect(() => {
    if (!showComposer || !visible) return;
    const t = setTimeout(() => {
      textInputRef.current?.focus();
    }, 250);
    return () => clearTimeout(t);
  }, [showComposer, visible]);

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

  const handleMicPress = useCallback(async () => {
    if (!showComposer) {
      setShowComposer(true);
      return;
    }
    try {
      if (!isVoiceStreaming) {
        if (!voiceAccumulatedRef.current.trim()) {
          preVoiceTextRef.current = draft;
        }
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
  }, [showComposer, isVoiceStreaming, draft, startStreaming, stopStreaming]);

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
      Alert.alert('已保存', '已同步到灵感笔记模块。', [
        {
          text: '去查看',
          onPress: () => {
            closeAll();
            router.push(`/screens/memory?tab=inspiration&notesTab=${tab}`);
          },
        },
        { text: '关闭', onPress: closeAll },
      ]);
    } catch (error) {
      const apiError = error as NotesApiError;
      Alert.alert('保存失败', apiError?.message || '请稍后重试');
    } finally {
      setIsSaving(false);
    }
  }, [closeAll, isSaving, rawSubmitted, result, pendingAudioUrl]);

  const renderInput = () => (
    <View
      className="items-center pb-2"
      style={{ paddingHorizontal: 3, alignItems: 'center' }}>
      <View style={[styles.figmaCard, { width: mainCardW, height: mainCardH }]}>
        <LinearGradient
          colors={['#161a1f', '#0c0e12', '#0a1218', '#102230', '#0d1f2d']}
          locations={[0, 0.22, 0.45, 0.72, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <LinearGradient
          colors={['transparent', 'rgba(20, 55, 72, 0.2)', 'rgba(30, 90, 100, 0.18)']}
          locations={[0, 0.4, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.cardBottomGlow}
          pointerEvents="none"
        />
        <View
          style={{
            flex: 1,
            zIndex: 1,
            paddingTop: 20,
            paddingBottom: 16,
            paddingHorizontal: 20,
            justifyContent: 'flex-start',
          }}>
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
              <Pressable
                key={s}
                onPress={() => setDraft(s)}
                className="rounded-full border px-3 py-2.5 active:opacity-80"
                style={{ borderColor: 'rgba(255,255,255,0.28)' }}>
                <ThemedText
                  style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, lineHeight: 18 }}
                  numberOfLines={2}>
                  {s}
                </ThemedText>
              </Pressable>
            ))}
          </View>

          <Pressable
            onPress={() => setSuggestionRound((i) => i + 1)}
            className="mt-2 flex-row items-center gap-1.5 self-start active:opacity-70"
            accessibilityRole="button"
            accessibilityLabel="换一批示例">
            <ThemedText style={{ color: '#8a8a8a', fontSize: 10, lineHeight: 12 }}>换一批</ThemedText>
            <Icon name="RefreshCw" size={12} color="#8a8a8a" />
          </Pressable>

          {showComposer ? (
            <View className="mt-3" style={{ flex: 1, minHeight: 0 }}>
              <TextInput
                ref={textInputRef}
                value={draft}
                onChangeText={setDraft}
                placeholder={isVoiceStreaming ? '正在聆听…' : '在此输入，或点击下方麦克风'}
                placeholderTextColor="rgba(165,165,165,0.75)"
                multiline
                className="rounded-2xl border px-3 py-3 text-[15px] text-white"
                style={{
                  flex: 1,
                  minHeight: 100,
                  borderColor: 'rgba(255,255,255,0.08)',
                  backgroundColor: 'rgba(0,0,0,0.3)',
                  color: '#ffffff',
                }}
                textAlignVertical="top"
              />
              <View className="mt-3 flex-row items-center justify-between">
                <View className="flex-row" style={{ gap: 10 }}>
                  <Pressable
                    onPress={() => Alert.alert('即将推出', '图片速记将在后续版本开放。')}
                    accessibilityRole="button"
                    accessibilityLabel="图片"
                    style={styles.cardIconCircle}>
                    <Icon name="Image" size={18} color="rgba(255,255,255,0.85)" strokeWidth={1.5} />
                  </Pressable>
                  <Pressable
                    onPress={() => Alert.alert('即将推出', '链接摘录将在后续版本开放。')}
                    accessibilityRole="button"
                    accessibilityLabel="链接"
                    style={styles.cardIconCircle}>
                    <Icon name="Link" size={18} color="rgba(255,255,255,0.85)" strokeWidth={1.5} />
                  </Pressable>
                </View>
                <Pressable
                  onPress={() => {
                    runAnalyze(draft);
                  }}
                  disabled={isVoiceStreaming}
                  className="active:opacity-85 h-10 w-10 items-center justify-center rounded-full"
                  style={{ backgroundColor: ACCENT_GOLD }}
                  accessibilityRole="button"
                  accessibilityLabel="提交分析">
                  <Icon name="ArrowUp" size={20} color="#ffffff" strokeWidth={2.2} />
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={{ flex: 1, minHeight: 40, marginTop: 4 }} />
          )}
        </View>
      </View>

      <View className="mt-8 items-center pb-1">
        <Pressable
          onPress={() => {
            handleMicPress().catch(() => {});
          }}
          accessibilityRole="button"
          accessibilityLabel={showComposer ? '语音输入' : '点击以显示输入并录音'}>
          <LinearGradient
            colors={['#C9A227', '#4c1d95', '#0e7490', '#AA873C']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.micOrb}>
            <Icon
              name={isVoiceStreaming ? 'Pause' : 'Mic'}
              size={28}
              color="#fff"
              strokeWidth={isVoiceStreaming ? 2.5 : 2}
            />
          </LinearGradient>
        </Pressable>
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
          setShowComposer(true);
        }}
        className="border-white/35 active:opacity-85 flex-1 items-center rounded-full border py-3"
        accessibilityRole="button"
        accessibilityLabel="修改">
        <Text style={styles.footerBtnLabelDark}>修改</Text>
      </Pressable>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={closeAll}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
                paddingBottom: Math.max(insets.bottom, 16),
              },
            ]}>
            <View
              style={[
                styles.sheet,
                {
                  minHeight: sheetMinH,
                  maxHeight: sheetMaxH,
                  paddingBottom: phase === 'result' ? 0 : Math.max(insets.bottom, 8),
                },
              ]}>
              <View className="relative shrink-0 flex-row items-center justify-center px-4 pb-3 pt-4">
                <ThemedText
                  className="text-center text-white"
                  style={{ fontSize: 16, lineHeight: 20, fontWeight: '400' }}>
                  AI记录
                </ThemedText>
                <Pressable
                  onPress={closeAll}
                  hitSlop={12}
                  className="absolute right-3 h-9 w-9 items-center justify-center rounded-full bg-white/10"
                  accessibilityRole="button"
                  accessibilityLabel="关闭">
                  <Icon name="X" size={18} color="#fff" />
                </Pressable>
              </View>

              {phase === 'input' && isVoiceStreaming ? (
                <ThemedText className="shrink-0 px-5 pb-1 text-xs text-cyan-300/90">
                  正在聆听…
                </ThemedText>
              ) : null}

              {phase === 'result' ? (
                <>
                  <View style={styles.sheetBody}>{renderResult()}</View>
                  {resultFooter}
                </>
              ) : (
                <ScrollView
                  style={styles.sheetBody}
                  contentContainerStyle={[
                    styles.sheetScrollContent,
                    { paddingBottom: 28 + Math.max(insets.bottom, 12) + 100 },
                  ]}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  bounces={false}>
                  {phase === 'input' ? renderInput() : null}
                  {phase === 'analyzing' ? renderAnalyzing() : null}
                </ScrollView>
              )}
            </View>
          </View>
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
  },
  sheetScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 12,
  },
  figmaCard: {
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignSelf: 'center',
    overflow: 'hidden',
  },
  cardBottomGlow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 200,
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
  micOrb: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
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
});
