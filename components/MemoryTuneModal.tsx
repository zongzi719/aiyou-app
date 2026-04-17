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
import { useRecording } from '@/hooks/useRecording';
import { peekMemoryMemories, putMemoryMemories } from '@/lib/listDataCache';
import { translateCategory, type UserMemory, memoryApi } from '@/services/memoryApi';

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

function buildCloneReply(input: string, memories: UserMemory[]): string {
  const sample = memories
    .slice(0, 2)
    .map((m) => m.content)
    .filter(Boolean)
    .join('；');
  if (sample) {
    return `我理解了。结合你之前的记忆（${sample}），你刚才这句话更像是在强调「${input.slice(0, 20)}${input.length > 20 ? '...' : ''}」。`;
  }
  return '我理解了，这句话体现了你稳定的思考倾向。我先帮你抽取成一条可沉淀记忆。';
}

type ExpertCallLine = { id: string; role: 'user' | 'clone'; text: string };

function buildExpertLiveReply(userText: string): string {
  const t = userText.trim();
  if (t.length < 6) return '好的，我在听，你继续说说你的想法。';
  return `收到。关于「${t.slice(0, 28)}${t.length > 28 ? '…' : ''}」，我先记下了，还想补充吗？`;
}

function formatCallDuration(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')} : ${String(s).padStart(2, '0')}`;
}

export default function MemoryTuneModal({ visible, onRequestClose }: Props) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { height: windowHeight } = useWindowDimensions();
  const { isRecording, isTranscribing, startRecording, stopRecording, transcribeAudio, metering } =
    useRecording();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [voicePanelVisible, setVoicePanelVisible] = useState(false);
  const [voiceWillCancel, setVoiceWillCancel] = useState(false);
  const [voiceStartY, setVoiceStartY] = useState<number | null>(null);
  const [messages, setMessages] = useState<TuneMessage[]>([]);
  const [memories, setMemories] = useState<UserMemory[]>([]);
  const [pendingMemory, setPendingMemory] = useState<TuneMessage['memory'] | null>(null);
  const [inputMode, setInputMode] = useState<'text' | 'voice'>('text');
  const [attachMenuVisible, setAttachMenuVisible] = useState(false);
  const [expertCallOpen, setExpertCallOpen] = useState(false);
  const [expertCallMuted, setExpertCallMuted] = useState(true);
  const [expertCallSeconds, setExpertCallSeconds] = useState(0);
  const [expertCallLines, setExpertCallLines] = useState<ExpertCallLine[]>([]);
  const expertLinesRef = useRef<ExpertCallLine[]>([]);
  const expertRoundHasSpeechRef = useRef(false);
  const expertSilenceStartRef = useRef<number | null>(null);
  const expertAutoSendingRef = useRef(false);

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
    setPendingMemory(null);
    setInputMode('text');
    setAttachMenuVisible(false);
    setExpertCallOpen(false);
    setExpertCallMuted(true);
    setExpertCallSeconds(0);
    setExpertCallLines([]);
    expertLinesRef.current = [];
    setMessages([{ id: 'intro', role: 'clone', text: cloneIntro }]);

    let cancelled = false;
    void (async () => {
      try {
        const latest = await memoryApi.getMemories();
        if (cancelled) return;
        setMemories(latest);
        putMemoryMemories(latest);
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible]);

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
      const cloneReply = buildCloneReply(normalized, memories);

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
        { id: `a-${Date.now()}`, role: 'clone', text: cloneReply },
        memoryMessage,
        { id: `done-${Date.now()}`, role: 'clone', text: '记住啦。' },
      ]);
      setPendingMemory(memoryMessage.memory ?? null);
      setSending(false);
    },
    [memories, saving, sending]
  );

  const handleSend = useCallback(async () => {
    await submitMessage(draft);
  }, [draft, submitMessage]);

  const startVoicePress = useCallback(
    async (pageY?: number) => {
      if (isTranscribing || saving || sending) return;
      setVoiceWillCancel(false);
      setVoicePanelVisible(true);
      setVoiceStartY(pageY ?? null);
      try {
        await startRecording();
      } catch {
        setVoicePanelVisible(false);
      }
    },
    [isTranscribing, saving, sending, startRecording]
  );

  const trackVoiceMove = useCallback(
    (pageY?: number) => {
      if (voiceStartY == null || pageY == null) return;
      setVoiceWillCancel(voiceStartY - pageY > 70);
    },
    [voiceStartY]
  );

  const endVoicePress = useCallback(async () => {
    if (!isRecording && !voicePanelVisible) return;
    setVoicePanelVisible(false);
    setVoiceStartY(null);
    try {
      const uri = await stopRecording();
      if (!uri || voiceWillCancel) {
        setVoiceWillCancel(false);
        return;
      }
      const text = (await transcribeAudio(uri)).trim();
      if (!text) return;
      await submitMessage(text);
    } catch {
      /* ignore */
    } finally {
      setVoiceWillCancel(false);
    }
  }, [
    isRecording,
    voicePanelVisible,
    stopRecording,
    voiceWillCancel,
    transcribeAudio,
    submitMessage,
  ]);

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
    if (pendingMemory || saving || sending || isTranscribing) return;
    Keyboard.dismiss();
    setAttachMenuVisible(false);
    setExpertCallLines([]);
    expertLinesRef.current = [];
    setExpertCallMuted(false);
    expertRoundHasSpeechRef.current = false;
    expertSilenceStartRef.current = null;
    expertAutoSendingRef.current = false;
    setExpertCallOpen(true);
    try {
      await startRecording();
    } catch {
      setExpertCallMuted(true);
      Alert.alert('无法录音', '请检查麦克风权限后重试。');
    }
  }, [isTranscribing, pendingMemory, saving, sending, startRecording]);

  const finishExpertSpeechRound = useCallback(async () => {
    if (!expertCallOpen || expertAutoSendingRef.current) return;
    expertAutoSendingRef.current = true;
    setExpertCallMuted(true);
    expertRoundHasSpeechRef.current = false;
    expertSilenceStartRef.current = null;
    try {
      const uri = await stopRecording();
      if (!uri) return;
      const text = (await transcribeAudio(uri)).trim();
      if (!text) return;
      const uid = `ec-u-${Date.now()}`;
      setExpertCallLines((prev) => {
        const next = [...prev, { id: uid, role: 'user' as const, text }];
        expertLinesRef.current = next;
        return next;
      });
      await new Promise((r) => setTimeout(r, 420));
      setExpertCallLines((prev) => {
        const next = [
          ...prev,
          {
            id: `ec-a-${Date.now()}`,
            role: 'clone' as const,
            text: buildExpertLiveReply(text),
          },
        ];
        expertLinesRef.current = next;
        return next;
      });
    } catch {
      /* ignore */
    } finally {
      expertAutoSendingRef.current = false;
    }
  }, [expertCallOpen, stopRecording, transcribeAudio]);

  const toggleExpertMic = useCallback(async () => {
    if (!expertCallOpen || isTranscribing) return;
    if (expertCallMuted) {
      setExpertCallMuted(false);
      expertRoundHasSpeechRef.current = false;
      expertSilenceStartRef.current = null;
      expertAutoSendingRef.current = false;
      try {
        await startRecording();
      } catch {
        setExpertCallMuted(true);
        Alert.alert('无法录音', '请检查麦克风权限后重试。');
      }
    } else {
      await finishExpertSpeechRound();
    }
  }, [expertCallOpen, expertCallMuted, finishExpertSpeechRound, isTranscribing, startRecording]);

  useEffect(() => {
    if (!expertCallOpen || expertCallMuted || !isRecording) {
      expertRoundHasSpeechRef.current = false;
      expertSilenceStartRef.current = null;
      return;
    }
    const currentMeter = typeof metering === 'number' ? metering : -160;
    const isSpeakingNow = currentMeter > -42;
    if (isSpeakingNow) {
      expertRoundHasSpeechRef.current = true;
      expertSilenceStartRef.current = null;
      return;
    }
    // 仅在“已经说过话后”的静音段触发自动截断，避免开麦后不说话就立即发送空内容。
    if (!expertRoundHasSpeechRef.current) return;
    if (expertSilenceStartRef.current == null) {
      expertSilenceStartRef.current = Date.now();
      return;
    }
    if (Date.now() - expertSilenceStartRef.current >= 1200 && !expertAutoSendingRef.current) {
      void finishExpertSpeechRound();
    }
  }, [expertCallMuted, expertCallOpen, finishExpertSpeechRound, isRecording, metering]);

  const hangUpExpertCall = useCallback(async () => {
    let lines = [...expertLinesRef.current];
    setExpertCallOpen(false);
    setExpertCallMuted(true);
    expertRoundHasSpeechRef.current = false;
    expertSilenceStartRef.current = null;
    expertAutoSendingRef.current = false;

    if (isRecording) {
      try {
        const uri = await stopRecording();
        if (uri) {
          const text = (await transcribeAudio(uri)).trim();
          if (text) {
            lines = [...lines, { id: `ec-u-${Date.now()}`, role: 'user', text }];
          }
        }
      } catch {
        /* ignore */
      }
    }

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
    const cloneReply = buildCloneReply(combined, memories);

    setMessages((prev) => [...prev, ...merged]);

    await new Promise((r) => setTimeout(r, 360));

    const memoryPayload = {
      content: candidate,
      category: inferred.category,
      dimensionLabel: inferred.dimensionLabel,
    };
    const memoryBlock: TuneMessage = {
      id: `m-${Date.now()}`,
      role: 'memory',
      text: '记忆已生成',
      memory: memoryPayload,
    };

    setMessages((prev) => [
      ...prev,
      { id: `a-${Date.now()}`, role: 'clone', text: cloneReply },
      memoryBlock,
      { id: `done-${Date.now()}`, role: 'clone', text: '记住啦。' },
    ]);
    setPendingMemory(memoryPayload);
  }, [isRecording, memories, stopRecording, transcribeAudio]);

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
      setMessages((prev) => [
        ...prev,
        { id: `saved-${Date.now()}`, role: 'clone', text: '已存入记忆库。' },
      ]);
    } finally {
      setSaving(false);
    }
  }, [memories, pendingMemory, saving]);

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
                  return (
                    <View key={msg.id} className="mb-4 rounded-3xl bg-[#4A4A4D] p-4">
                      <View className="mb-1 flex-row items-center justify-between">
                        <ThemedText className="text-[14px] font-bold text-white">
                          {msg.text}
                        </ThemedText>
                        <View className="flex-row items-center">
                          <Icon name="Diamond" size={16} color="#21D4C6" />
                          <ThemedText className="ml-2 text-[14px] font-semibold text-[#21D4C6]">
                            {msg.memory.dimensionLabel}
                          </ThemedText>
                        </View>
                      </View>
                      <ThemedText className="text-[13px] text-[#E5E7EB]">
                        {msg.memory.content}
                      </ThemedText>
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
                  onPress={() => setPendingMemory(null)}>
                  <ThemedText className="text-[18px] font-semibold text-white">继续对话</ThemedText>
                </Pressable>
                <Pressable
                  className={`flex-1 items-center rounded-full bg-white py-4 ${saving ? 'opacity-60' : ''}`}
                  disabled={saving}
                  onPress={handleAccept}>
                  <ThemedText className="text-[18px] font-semibold text-[#111]">
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
                      editable={!saving && !isRecording && !voicePanelVisible && !pendingMemory}
                      onSubmitEditing={() => {
                        void handleSend();
                      }}
                      returnKeyType="send"
                    />
                  </View>
                ) : (
                  <Pressable
                    className="h-12 flex-1 items-center justify-center rounded-full border border-[#60626A] bg-[#2A2C33] px-4"
                    disabled={saving || isTranscribing || !!pendingMemory}
                    onPressIn={(event) => {
                      void startVoicePress(event.nativeEvent.pageY);
                    }}
                    onTouchMove={(event) => {
                      trackVoiceMove(event.nativeEvent.pageY);
                    }}
                    onPressOut={() => {
                      void endVoicePress();
                    }}>
                    <ThemedText
                      className={`text-base font-medium ${isRecording || voicePanelVisible ? 'text-[#8A8F99]' : 'text-white'}`}>
                      {isTranscribing
                        ? '正在识别语音…'
                        : isRecording || voicePanelVisible
                          ? voiceWillCancel
                            ? '松开取消'
                            : '松开发送 · 上划取消'
                          : '按住说话'}
                    </ThemedText>
                  </Pressable>
                )}
                <Pressable
                  className="ml-2 h-12 w-12 overflow-hidden rounded-full bg-[#29303B]"
                  disabled={saving || !!pendingMemory}
                  onPress={openExpertCall}>
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
                        void pickAttachmentFile();
                      }}>
                      <Icon name="FileText" size={22} color="#fff" />
                      <ThemedText className="ml-3 text-[16px] text-white">文件</ThemedText>
                    </Pressable>
                    <Pressable
                      className="flex-row items-center border-b border-white/10 px-5 py-4 active:bg-white/5"
                      onPress={() => {
                        void pickAttachmentAlbum();
                      }}>
                      <Icon name="Image" size={22} color="#fff" />
                      <ThemedText className="ml-3 text-[16px] text-white">相册</ThemedText>
                    </Pressable>
                    <Pressable
                      className="flex-row items-center px-5 py-4 active:bg-white/5"
                      onPress={() => {
                        void pickAttachmentCamera();
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
                        void hangUpExpertCall();
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
                    className="mt-2 flex-1 px-4"
                    contentContainerStyle={{ paddingBottom: 24 }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}>
                    {expertCallLines.length === 0 ? (
                      <View className="mt-8 px-4">
                        <ThemedText className="text-center text-[14px] leading-6 text-white/60">
                          点击麦克风开始说话，再次点击结束本轮发言；挂断后将为本轮对话生成记忆，确认后写入记忆库。
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
                            <ThemedText className="text-[15px] text-white">{line.text}</ThemedText>
                          </View>
                        </View>
                      )
                    )}
                  </ScrollView>

                  <View
                    className="bg-black/55 rounded-t-3xl px-6 pt-5"
                    style={{ paddingBottom: Math.max(insets.bottom, 16) }}>
                    <ThemedText className="mb-5 text-center text-[20px] font-medium tracking-wide text-white">
                      {formatCallDuration(expertCallSeconds)}
                    </ThemedText>
                    <View className="mb-5 flex-row items-center justify-around">
                      <Pressable
                        onPress={() => {
                          void toggleExpertMic();
                        }}
                        disabled={isTranscribing}
                        className={`h-16 w-16 items-center justify-center rounded-full border-2 ${expertCallMuted ? 'border-white/40 bg-white/5' : 'border-[#5AF0B6] bg-white/10'}`}>
                        <Icon name={expertCallMuted ? 'MicOff' : 'Mic'} size={26} color="#fff" />
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          void hangUpExpertCall();
                        }}
                        className="h-16 w-16 items-center justify-center rounded-full border-2 border-white/40 bg-white/5">
                        <Icon name="PhoneOff" size={26} color="#EF4444" />
                      </Pressable>
                    </View>
                    <View className="h-3 items-center justify-center overflow-hidden rounded-full">
                      <LinearGradient
                        colors={['transparent', 'rgba(245,211,79,0.85)', 'transparent']}
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
                <View className="w-[72%] rounded-3xl bg-[#2A2C33] px-5 py-6">
                  <View className="items-center">
                    <View
                      className={`h-16 w-16 items-center justify-center rounded-full ${voiceWillCancel ? 'bg-[#7F1D1D]' : 'bg-[#3A414D]'}`}>
                      <Icon name={voiceWillCancel ? 'X' : 'Mic'} size={28} color="#fff" />
                    </View>
                    <ThemedText className="mt-4 text-lg font-semibold text-white">
                      {voiceWillCancel ? '松开手指，取消发送' : '正在录音...'}
                    </ThemedText>
                    <ThemedText className="mt-2 text-sm text-[#BFC3CB]">
                      {voiceWillCancel ? '已进入取消区域' : '上划可取消，松开自动发送'}
                    </ThemedText>
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
