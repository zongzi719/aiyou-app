import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '@/components/Icon';
import ThemedText from '@/components/ThemedText';
import { useRecording } from '@/hooks/useRecording';
import { analyzeAiRecordInput, type AiRecordPayload } from '@/lib/aiRecordAnalysis';
import { setPendingHomeChatMessage } from '@/lib/pendingHomeChatMessage';

const GOLD = '#F5D34F';
/** 白底 / 金底按钮上的文字，避免与 ThemedText 默认 text-primary 冲突导致看不清 */
const FOOTER_LABEL_ON_LIGHT = '#111111';
const CYAN_GLOW = 'rgba(34, 211, 238, 0.45)';

const SUGGESTION_ROUNDS: string[][] = [
  ['明天下午三点钟开会', '提醒我准备产品演讲'],
  ['记录：新功能三条用户痛点', '周五前整理本周复盘要点'],
  ['灵感：把决策过程做成可回放的时间线', '备忘：下周约设计对齐交互稿'],
];

type Phase = 'input' | 'analyzing' | 'result';

type Props = {
  visible: boolean;
  onRequestClose: () => void;
};

export default function AiRecordModal({ visible, onRequestClose }: Props) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { isRecording, isTranscribing, startRecording, stopRecording, transcribeAudio } = useRecording();

  /** 略放大弹窗，避免输入区加高后底部麦克风被裁切 */
  const sheetMaxH = Math.round(windowHeight * 0.93);
  const sheetMinH = Math.round(
    Math.min(windowHeight * 0.76, windowHeight - insets.top - Math.max(insets.bottom, 8) - 12)
  );

  const [phase, setPhase] = useState<Phase>('input');
  const [draft, setDraft] = useState('');
  const [rawSubmitted, setRawSubmitted] = useState('');
  const [result, setResult] = useState<AiRecordPayload | null>(null);
  const [suggestionRound, setSuggestionRound] = useState(0);

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
    }
  }, [visible]);

  const closeAll = useCallback(() => {
    onRequestClose();
  }, [onRequestClose]);

  const handleMicPress = useCallback(async () => {
    try {
      if (!isRecording) {
        await startRecording();
      } else {
        const uri = await stopRecording();
        if (uri) {
          const text = await transcribeAudio(uri);
          setDraft((prev) => (prev ? `${prev}\n${text}` : text));
        }
      }
    } catch (e) {
      Alert.alert('录音失败', e instanceof Error ? e.message : '请检查麦克风权限后重试');
    }
  }, [isRecording, startRecording, stopRecording, transcribeAudio]);

  const runAnalyze = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t) {
      Alert.alert('提示', '请先输入内容，或使用语音录入');
      return;
    }
    setRawSubmitted(t);
    setPhase('analyzing');
    try {
      const payload = await analyzeAiRecordInput(t);
      if (payload.kind === 'chat') {
        setPendingHomeChatMessage(t);
        closeAll();
        router.replace('/?newChat=1');
        return;
      }
      setResult(payload);
      setPhase('result');
    } catch {
      setPhase('input');
      Alert.alert('分析失败', '请检查网络或 API 配置后重试');
    }
  }, [closeAll]);

  const onSaveMock = useCallback(() => {
    Alert.alert('已保存', '演示环境：内容已确认，后续可接入日历与笔记存储。', [
      { text: '好的', onPress: closeAll },
    ]);
  }, [closeAll]);

  const renderInput = () => (
    <View className="px-1 pb-2">
      <View
        className="rounded-3xl bg-neutral-900/95 border border-cyan-500/35 overflow-hidden"
        style={styles.cardGlow}
      >
        <View className="px-4 pt-4 pb-3">
          <ThemedText className="text-[15px] leading-6 text-white/90">
            今天有什么灵感/安排事项？告诉我，可以帮你生成
          </ThemedText>
        </View>
        <View className="px-4 flex-row flex-wrap gap-2">
          {suggestions.map((s) => (
            <Pressable
              key={s}
              onPress={() => setDraft(s)}
              className="px-3 py-2 rounded-full bg-white/10 border border-white/10 active:opacity-80"
            >
              <ThemedText className="text-xs text-white/85" numberOfLines={2}>
                {s}
              </ThemedText>
            </Pressable>
          ))}
        </View>
        <Pressable
          onPress={() => setSuggestionRound((i) => i + 1)}
          className="flex-row items-center gap-1 self-end px-4 py-2 active:opacity-70"
          accessibilityRole="button"
          accessibilityLabel="换一批示例"
        >
          <Icon name="RefreshCw" size={14} color="rgba(255,255,255,0.55)" />
          <ThemedText className="text-xs text-white/55">换一批</ThemedText>
        </Pressable>
        <View className="px-3 pb-3">
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={isRecording ? '正在聆听…' : '在此输入，或点击下方麦克风'}
            placeholderTextColor="rgba(255,255,255,0.35)"
            multiline
            className="min-h-[240px] text-[15px] text-white px-3 py-3 rounded-2xl bg-black/40 border border-white/10"
            textAlignVertical="top"
          />
          <View className="flex-row items-center justify-between mt-3 px-1">
            <View className="flex-row gap-3">
              <Pressable
                hitSlop={8}
                onPress={() => Alert.alert('即将推出', '图片速记将在后续版本开放。')}
                accessibilityRole="button"
                accessibilityLabel="图片"
              >
                <Icon name="Image" size={22} color="rgba(255,255,255,0.65)" strokeWidth={1.6} />
              </Pressable>
              <Pressable
                hitSlop={8}
                onPress={() => Alert.alert('即将推出', '链接摘录将在后续版本开放。')}
                accessibilityRole="button"
                accessibilityLabel="链接"
              >
                <Icon name="Link" size={22} color="rgba(255,255,255,0.65)" strokeWidth={1.6} />
              </Pressable>
            </View>
            <Pressable
              onPress={() => void runAnalyze(draft)}
              disabled={isTranscribing}
              className="w-11 h-11 rounded-full bg-white items-center justify-center active:opacity-85"
              accessibilityRole="button"
              accessibilityLabel="提交分析"
            >
              <Icon name="ArrowUp" size={22} color="#111" strokeWidth={2.2} />
            </Pressable>
          </View>
        </View>
      </View>

      <View className="items-center mt-8 pb-1">
        <Pressable onPress={() => void handleMicPress()} accessibilityRole="button" accessibilityLabel="语音输入">
          <LinearGradient
            colors={['#F5D34F', '#1e293b', '#0ea5e9']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.micOrb}
          >
            <Icon
              name={isRecording ? 'Pause' : 'Mic'}
              size={28}
              color="#fff"
              strokeWidth={isRecording ? 2.5 : 2}
            />
          </LinearGradient>
        </Pressable>
        <ThemedText className="text-xs text-white/55 mt-3">
          {isTranscribing ? '正在识别语音…' : isRecording ? '点击结束录音' : '点击录音'}
        </ThemedText>
      </View>
    </View>
  );

  const renderAnalyzing = () => (
    <View className="items-center justify-center px-6 py-16 min-h-[200px]">
      <ActivityIndicator size="large" color={GOLD} />
      <ThemedText className="text-white/80 mt-4 text-center">AI 正在理解你的内容…</ThemedText>
    </View>
  );

  const renderSchedule = (p: Extract<AiRecordPayload, { kind: 'schedule' }>) => (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
      showsVerticalScrollIndicator={false}
    >
      <View className="flex-row items-start gap-2 mt-2">
        <Icon name="Calendar" size={22} color={GOLD} strokeWidth={1.8} />
        <View className="flex-1">
          <ThemedText className="text-base font-semibold text-white">已为你整理为日程安排</ThemedText>
          <ThemedText className="text-sm text-white/50 mt-1">
            我提取了时间、事项和提醒信息，你可以确认后保存
          </ThemedText>
        </View>
      </View>

      {p.missingFields.length > 0 && (
        <View className="mt-4 rounded-2xl bg-amber-500/15 border border-amber-400/35 px-3 py-2">
          <ThemedText className="text-xs text-amber-200/95 font-medium">请补充</ThemedText>
          {p.missingFields.map((m) => (
            <ThemedText key={m} className="text-sm text-amber-100/90 mt-1">
              · {m}
            </ThemedText>
          ))}
        </View>
      )}

      <View className="mt-5 rounded-3xl bg-neutral-800/90 border border-white/10 p-4">
        <ThemedText className="text-xs text-[#F5D34F] mb-2">| 日程安排</ThemedText>
        <View className="flex-row items-start justify-between gap-2">
          <ThemedText className="text-[#F5D34F] text-lg font-semibold flex-1">{p.title}</ThemedText>
          <View className="flex-row items-center gap-1 shrink-0">
            <Icon name="Clock" size={16} color="rgba(255,255,255,0.55)" />
            <ThemedText className="text-sm text-white/60">{p.timeRange}</ThemedText>
          </View>
        </View>
        {p.todos.length > 0 && (
          <View className="mt-4">
            <ThemedText className="text-xs text-white/45 mb-2">待办</ThemedText>
            {p.todos.map((t) => (
              <ThemedText key={t} className="text-sm text-white/85 mt-1">
                · {t}
              </ThemedText>
            ))}
          </View>
        )}
        {p.actionPoints.length > 0 && (
          <View className="mt-4">
            <ThemedText className="text-xs text-white/45 mb-2">行动要点</ThemedText>
            {p.actionPoints.map((t) => (
              <View key={t} className="flex-row gap-2 mt-2">
                <Icon name="Lightbulb" size={16} color={GOLD} />
                <ThemedText className="text-sm text-white/85 flex-1">{t}</ThemedText>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );

  const renderNote = (p: Extract<AiRecordPayload, { kind: 'note' }>) => (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
      showsVerticalScrollIndicator={false}
    >
      <View className="flex-row items-start gap-2 mt-2">
        <Icon name="Lightbulb" size={22} color="#fff" strokeWidth={1.8} />
        <View className="flex-1">
          <ThemedText className="text-base font-semibold text-white">已为你整理为灵感笔记</ThemedText>
          <ThemedText className="text-sm text-white/50 mt-1">
            我提炼了讨论重点、结论与后续行动项
          </ThemedText>
        </View>
      </View>

      <View className="mt-5 rounded-3xl bg-neutral-800/90 border border-white/10 p-4">
        <ThemedText className="text-xs text-[#F5D34F] mb-2">| {p.sectionLabel}</ThemedText>
        <View className="flex-row items-start justify-between gap-2">
          <ThemedText className="text-[#F5D34F] text-lg font-semibold flex-1">{p.title}</ThemedText>
          {p.timeRange ? (
            <View className="flex-row items-center gap-1 shrink-0">
              <Icon name="Clock" size={16} color="rgba(255,255,255,0.55)" />
              <ThemedText className="text-sm text-white/60">{p.timeRange}</ThemedText>
            </View>
          ) : null}
        </View>
        {p.coreIdea ? (
          <View className="mt-4">
            <ThemedText className="text-xs text-white/45 mb-1">核心想法</ThemedText>
            <ThemedText className="text-sm text-white/85 leading-6">{p.coreIdea}</ThemedText>
          </View>
        ) : null}
        {p.todos.length > 0 && (
          <View className="mt-4">
            <ThemedText className="text-xs text-white/45 mb-2">待办事项</ThemedText>
            {p.todos.map((t) => (
              <ThemedText key={t} className="text-sm text-white/85 mt-1">
                · {t}
              </ThemedText>
            ))}
          </View>
        )}
        {p.conclusions.length > 0 && (
          <View className="mt-4">
            <ThemedText className="text-xs text-white/45 mb-2">关键结论</ThemedText>
            {p.conclusions.map((t) => (
              <View key={t} className="flex-row gap-2 mt-2">
                <Icon name="Lightbulb" size={16} color={GOLD} />
                <ThemedText className="text-sm text-white/85 flex-1">{t}</ThemedText>
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
      className="flex-row gap-2 px-4 pt-3 border-t border-white/10"
      style={{ paddingBottom: Math.max(insets.bottom, 12) }}
    >
      <Pressable
        onPress={closeAll}
        className="flex-1 py-3 rounded-full bg-white items-center active:opacity-85"
        accessibilityRole="button"
        accessibilityLabel="取消"
      >
        <Text style={styles.footerBtnLabelLight}>取消</Text>
      </Pressable>
      <Pressable
        onPress={onSaveMock}
        className="flex-1 py-3 rounded-full items-center active:opacity-90"
        style={{ backgroundColor: GOLD }}
        accessibilityRole="button"
        accessibilityLabel="保存"
      >
        <Text style={styles.footerBtnLabelLight}>保存</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          setResult(null);
          setPhase('input');
          setDraft(rawSubmitted);
        }}
        className="flex-1 py-3 rounded-full border border-white/35 items-center active:opacity-85"
        accessibilityRole="button"
        accessibilityLabel="修改"
      >
        <Text style={styles.footerBtnLabelDark}>修改</Text>
      </Pressable>
    </View>
  );

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onRequestClose={closeAll}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kavRoot}
      >
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
            ]}
          >
            <View
              style={[
                styles.sheet,
                {
                  minHeight: sheetMinH,
                  maxHeight: sheetMaxH,
                  paddingBottom: phase === 'result' ? 0 : Math.max(insets.bottom, 8),
                },
              ]}
            >
              <View className="flex-row items-center justify-center px-4 pt-4 pb-3 relative shrink-0">
                <ThemedText className="text-base font-semibold text-white">AI记录</ThemedText>
                <Pressable
                  onPress={closeAll}
                  hitSlop={12}
                  className="absolute right-3 w-9 h-9 rounded-full bg-white/10 items-center justify-center"
                  accessibilityRole="button"
                  accessibilityLabel="关闭"
                >
                  <Icon name="X" size={18} color="#fff" />
                </Pressable>
              </View>

              {phase === 'input' && isRecording ? (
                <ThemedText className="text-xs text-cyan-300/90 px-5 pb-1 shrink-0">正在聆听…</ThemedText>
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
                  bounces={false}
                >
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
    borderRadius: 28,
    backgroundColor: '#0a0a0a',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  sheetBody: {
    flex: 1,
  },
  sheetScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 12,
  },
  cardGlow: {
    shadowColor: CYAN_GLOW,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 14,
    elevation: 12,
  },
  micOrb: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  footerBtnLabelLight: {
    fontSize: 14,
    fontWeight: '600',
    color: FOOTER_LABEL_ON_LIGHT,
  },
  footerBtnLabelDark: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fafafa',
  },
});
