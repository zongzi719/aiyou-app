import { DrawerActions, useNavigation, NavigationProp } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, router } from 'expo-router';
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Pressable,
  KeyboardAvoidingView,
  ScrollView,
  ImageBackground,
  Image,
  useWindowDimensions,
  StyleSheet,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeColors } from '@/app/contexts/ThemeColors';
import { ChatInput, SelectedFile } from '@/components/ChatInput';
import { Conversation, Message, type MessageFile } from '@/components/Conversation';
import DecisionCoachPickerModal, {
  type DecisionCoachProfile,
} from '@/components/DecisionCoachPickerModal';
import DecisionWelcome from '@/components/DecisionWelcome';
import Icon, { IconName } from '@/components/Icon';
import ThemedText from '@/components/ThemedText';

import { useGlobalFloatingTabBarExtraBottom } from '@/hooks/useGlobalFloatingTabBarInset';
import { hasPrivateChatBackendSession } from '@/lib/authSession';
import {
  DECISION_COACHES,
  ensureDecisionCoachThreads,
  runDecisionTurn,
} from '@/lib/decisionChatApi';
import {
  addKnowledgeStarredAssistantId,
  loadKnowledgeStarredAssistantIds,
} from '@/lib/knowledgeStarPersistence';
import { prependPrivateThreadCache } from '@/lib/listDataCache';
import {
  buildSimpleHomeSuggestionBatch,
  CHAT_HOME_SIMPLE_ROUNDS,
} from '@/lib/chatHomeSimplePrompts';
import {
  createPrivateThread,
  streamPrivateChatRun,
  persistThreadTitleFireForget,
  getPrivateThreadStateMessages,
  uploadFilesToThreadFromSelection,
  type UploadedFileInfo,
} from '@/lib/privateChatApi';
import { streamMessage, isConfigured, AIMessage } from '@/services/ai';
import { getSelectedModelName } from '@/lib/privateChatUiModel';
import { consumePendingHomeChatMessage } from '@/lib/pendingHomeChatMessage';
import DecisionConversation, { type DecisionTurn } from '@/components/DecisionConversation';

/** 将英文后端错误转为中文友好提示 */
function friendlyError(raw: string): string {
  const s = raw.toLowerCase();
  if (
    s.includes('authentication') ||
    s.includes('access is invalid') ||
    s.includes('credentials') ||
    s.includes('unauthorized') ||
    s.includes('api key')
  ) {
    return '当前模型的 API 凭证无效或未在服务端配置，请点击右上角模型名称切换到其他可用模型后重试。';
  }
  if (s.includes('rate limit') || s.includes('quota') || s.includes('too many')) {
    return '请求过于频繁，请稍后再试。';
  }
  if (s.includes('timeout') || s.includes('network') || s.includes('网络')) {
    return '网络连接超时，请检查网络后重试。';
  }
  if (s.includes('context length') || s.includes('token') || s.includes('too long')) {
    return '消息内容过长，请缩短后重试。';
  }
  if (
    s.includes('model') &&
    (s.includes('not found') || s.includes('not exist') || s.includes('invalid'))
  ) {
    return '所选模型不存在或当前不可用，请点击右上角切换模型。';
  }
  // 回退：原样返回但截断过长英文
  return raw.length > 200 ? raw.slice(0, 200) + '…' : raw;
}

/** 私密模式空状态背景（Figma 402×874 画板比例） */
const PRIVATE_MODE_SCREEN_BG = '#08141F';
const PRIVATE_EMPTY_FIGMA = { frameW: 402, frameH: 874 } as const;
const PRIVATE_EMPTY_IMG = { w: 827, h: 526, left: -331, top: -3 } as const;
const PRIVATE_EMPTY_GRAD_TOP = { h: 452 } as const;
const PRIVATE_EMPTY_GRAD_MID = { top: 191, h: 339 } as const;

function PrivateEmptyFigmaBackground({ winW, winH }: { winW: number; winH: number }) {
  const imgW = (PRIVATE_EMPTY_IMG.w / PRIVATE_EMPTY_FIGMA.frameW) * winW;
  const imgH = imgW * (PRIVATE_EMPTY_IMG.h / PRIVATE_EMPTY_IMG.w);
  const imgLeft = (PRIVATE_EMPTY_IMG.left / PRIVATE_EMPTY_FIGMA.frameW) * winW;
  const imgTop = (PRIVATE_EMPTY_IMG.top / PRIVATE_EMPTY_FIGMA.frameH) * winH;
  const gradTopH = (PRIVATE_EMPTY_GRAD_TOP.h / PRIVATE_EMPTY_FIGMA.frameH) * winH;
  const gradMidTop = (PRIVATE_EMPTY_GRAD_MID.top / PRIVATE_EMPTY_FIGMA.frameH) * winH;
  const gradMidH = (PRIVATE_EMPTY_GRAD_MID.h / PRIVATE_EMPTY_FIGMA.frameH) * winH;

  const imgShadow =
    Platform.OS === 'ios'
      ? {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.25,
          shadowRadius: 4,
        }
      : { elevation: 4 };

  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFillObject}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Image
        source={require('@/assets/images/private-chat-empty-top-bg.png')}
        style={[
          {
            position: 'absolute',
            top: imgTop,
            left: imgLeft,
            width: imgW,
            height: imgH,
            zIndex: 0,
          },
          imgShadow,
        ]}
        resizeMode="cover"
      />
      {/* Rectangle 579：中部向下渐入底色 */}
      <LinearGradient
        colors={['rgba(8,20,31,0)', PRIVATE_MODE_SCREEN_BG]}
        locations={[0.0206, 0.9587]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: gradMidTop,
          height: gradMidH,
          zIndex: 1,
        }}
      />
      {/* Rectangle 580（旋转后）：顶部与星空衔接 */}
      <LinearGradient
        colors={[PRIVATE_MODE_SCREEN_BG, 'rgba(8,20,31,0)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: gradTopH,
          zIndex: 2,
        }}
      />
    </View>
  );
}

function firstSearchParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  if (Array.isArray(v)) return v[0];
  return v;
}

const HomeScreen = () => {
  const navigation = useNavigation<NavigationProp<any>>();
  const insets = useSafeAreaInsets();
  const floatingTabExtra = useGlobalFloatingTabBarExtraBottom();
  const colors = useThemeColors();
  const scrollViewRef = useRef<ScrollView>(null);
  const privateThreadIdRef = useRef<string | null>(null);
  /** 清屏或新开对话时递增，用于忽略仍在进行的私人模式流式回调 */
  const privateUiEpochRef = useRef(0);
  const handleSendMessageRef = useRef<
    (text: string, images?: string[], files?: SelectedFile[]) => Promise<void>
  >(() => Promise.resolve());
  const [messages, setMessages] = useState<Message[]>([]);
  const [knowledgeStarredIds, setKnowledgeStarredIds] = useState<Set<string>>(() => new Set());
  const [isTyping, setIsTyping] = useState(false);
  const selectedModelRef = useRef<string>('');
  const [homeMode, setHomeMode] = useState<'private' | 'decision'>('private');
  const [suggestionBatchIndex, setSuggestionBatchIndex] = useState(0);
  const [decisionStarted, setDecisionStarted] = useState(false);
  const [coachPickerOpen, setCoachPickerOpen] = useState(false);
  const [selectedCoachIds, setSelectedCoachIds] = useState<string[]>(['strategy']);
  const [coachEnabledMap, setCoachEnabledMap] = useState<Record<string, boolean>>({
    strategy: true,
  });
  const [decisionTurns, setDecisionTurns] = useState<DecisionTurn[]>([]);
  const [decisionIsRunning, setDecisionIsRunning] = useState(false);

  const handleOpenDrawer = useCallback(() => {
    try {
      navigation.dispatch(DrawerActions.openDrawer());
    } catch {
      router.push('/(drawer)');
    }
  }, [navigation]);

  const handleClearScreen = useCallback(() => {
    if (homeMode === 'private') {
      privateUiEpochRef.current += 1;
      privateThreadIdRef.current = null;
      setMessages([]);
      setIsTyping(false);
      return;
    }
    setDecisionTurns([]);
    setDecisionStarted(false);
    setDecisionIsRunning(false);
  }, [homeMode]);

  useEffect(() => {
    getSelectedModelName().then((name) => {
      selectedModelRef.current = name;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadKnowledgeStarredAssistantIds().then((ids) => {
      if (!cancelled) setKnowledgeStarredIds(ids);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleKnowledgeAssistantStarred = useCallback((assistantMessageId: string) => {
    setKnowledgeStarredIds((prev) => new Set(prev).add(assistantMessageId));
    void addKnowledgeStarredAssistantId(assistantMessageId);
  }, []);
  const params = useLocalSearchParams<{
    openThreadId?: string | string[];
    newChat?: string | string[];
  }>();
  const openThreadIdParam = firstSearchParam(params.openThreadId);
  const newChatParam = firstSearchParam(params.newChat);

  useFocusEffect(
    useCallback(() => {
      const timer = setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: false });
      }, 100);

      return () => clearTimeout(timer);
    }, [])
  );

  type PrivateSendOptions = {
    /** 已有末尾用户消息，仅追加助手回复并请求模型 */
    regenerate?: boolean;
    /** 直连模型时构建上下文的「当前用户之前」消息列表 */
    historyForLocalAi?: Message[];
  };

  const handleSendMessagePrivate = async (
    text: string,
    images?: string[],
    files?: SelectedFile[],
    opts?: PrivateSendOptions
  ) => {
    const requestEpoch = privateUiEpochRef.current;
    const safeSetMessages = (updater: React.SetStateAction<Message[]>) => {
      if (privateUiEpochRef.current !== requestEpoch) return;
      setMessages(updater);
    };
    const safeSetTyping = (v: boolean) => {
      if (privateUiEpochRef.current !== requestEpoch) return;
      setIsTyping(v);
    };

    const hasFiles = files && files.length > 0;
    const messageFiles: MessageFile[] | undefined = hasFiles
      ? files!.map((f) => ({ name: f.name, mimeType: f.mimeType }))
      : undefined;
    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: text,
      images: images && images.length > 0 ? images : undefined,
      files: messageFiles,
      timestamp: new Date(),
    };
    if (!opts?.regenerate) {
      safeSetMessages((prev) => [...prev, userMessage]);
    }

    const usePrivateGateway = await hasPrivateChatBackendSession();

    if (usePrivateGateway) {
      safeSetTyping(true);
      const assistantId = (Date.now() + 1).toString();
      const assistantMessage: Message = {
        id: assistantId,
        type: 'assistant',
        content: '',
        timestamp: new Date(),
        isStreaming: true,
      };

      try {
        safeSetTyping(false);
        safeSetMessages((prev) => [...prev, assistantMessage]);

        let threadId = privateThreadIdRef.current;
        if (!threadId) {
          threadId = await createPrivateThread('新对话');
          privateThreadIdRef.current = threadId;
          prependPrivateThreadCache({
            thread_id: threadId,
            title: '新对话',
            updated_at: new Date().toISOString(),
          });
        }

        // 若有附件先上传到服务端，按 API 文档 Step 3+4 规范处理
        let uploadedFileInfos: UploadedFileInfo[] | undefined;
        if (hasFiles) {
          try {
            const uploaded: UploadedFileInfo[] = await uploadFilesToThreadFromSelection(
              threadId,
              files!
            );
            if (uploaded.length === 0) {
              throw new Error('文件上传成功但未返回路径，请重试');
            }
            uploadedFileInfos = uploaded;
          } catch (uploadErr) {
            const errMsg = uploadErr instanceof Error ? uploadErr.message : '文件上传失败';
            safeSetMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: errMsg, isStreaming: false } : m
              )
            );
            safeSetTyping(false);
            return;
          }
        }

        const modelName = selectedModelRef.current || (await getSelectedModelName());
        // 用户原始文字直接作为 content，文件路径通过 additional_kwargs.files 结构化传递
        const llmText = text.trim() || (uploadedFileInfos ? '请分析这个文件' : '');

        let sseErrorMsg: string | undefined;
        await streamPrivateChatRun(
          threadId,
          llmText,
          modelName,
          images,
          {
            onAssistantText: (full) => {
              safeSetMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: full, thinkingStep: undefined } : m
                )
              );
            },
            onThinkingStep: (step) => {
              safeSetMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, thinkingStep: step } : m))
              );
            },
            onTitleDetected: (title) => {
              if (privateUiEpochRef.current !== requestEpoch) return;
              if (privateThreadIdRef.current) {
                persistThreadTitleFireForget(privateThreadIdRef.current, title);
              }
            },
            onError: (errMsg) => {
              sseErrorMsg = friendlyError(errMsg);
            },
          },
          uploadedFileInfos
        );

        if (sseErrorMsg) {
          safeSetMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: sseErrorMsg as string, isStreaming: false }
                : m
            )
          );
        } else {
          safeSetMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, isStreaming: false, thinkingStep: undefined } : m
            )
          );
        }
      } catch (error) {
        safeSetTyping(false);
        const raw = error instanceof Error ? error.message : '请求失败，请稍后重试';
        const msg = friendlyError(raw);
        safeSetMessages((prev) => {
          const filtered = prev.filter((m) => m.id !== assistantId);
          return [
            ...filtered,
            {
              id: (Date.now() + 2).toString(),
              type: 'assistant',
              content: msg,
              timestamp: new Date(),
            },
          ];
        });
      }
      return;
    }

    // Check if AI is configured
    if (!isConfigured()) {
      safeSetTyping(true);
      setTimeout(() => {
        if (privateUiEpochRef.current !== requestEpoch) return;
        safeSetTyping(false);
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          type: 'assistant',
          content:
            'To get real AI responses, add your API key to the .env file. Luna supports OpenAI (ChatGPT), Google Gemini, and Anthropic Claude.\n\nCopy .env.example to .env and add your key to get started!',
          timestamp: new Date(),
        };
        safeSetMessages((prev) => [...prev, assistantMessage]);
      }, 1000);
      return;
    }

    // Show typing indicator
    safeSetTyping(true);

    // Create assistant message for streaming
    const assistantId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantId,
      type: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    };

    const historyBase = opts?.historyForLocalAi ?? messages;
    const aiMessages: AIMessage[] = [
      ...historyBase.map((m) => ({
        role: m.type as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user' as const, content: text.trim() || (hasFiles ? '请分析这个文件' : '') },
    ];

    try {
      safeSetTyping(false);
      safeSetMessages((prev) => [...prev, assistantMessage]);

      // Stream the response
      await streamMessage(aiMessages, (chunk) => {
        safeSetMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + chunk } : m))
        );
      });

      // Mark streaming as complete
      safeSetMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m))
      );
    } catch (error) {
      safeSetTyping(false);
      const errorMessage: Message = {
        id: (Date.now() + 2).toString(),
        type: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Something went wrong'}`,
        timestamp: new Date(),
      };
      safeSetMessages((prev) => {
        // Remove the empty streaming message if it exists
        const filtered = prev.filter((m) => m.id !== assistantId || m.content !== '');
        return [...filtered, errorMessage];
      });
    }
  };

  const handleSendMessagePrivateRef = useRef(handleSendMessagePrivate);
  handleSendMessagePrivateRef.current = handleSendMessagePrivate;

  const handleRegenerateAssistant = useCallback((assistantMessageId: string) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === assistantMessageId);
      if (idx <= 0) return prev;
      const u = prev[idx - 1];
      if (u.type !== 'user') return prev;
      const historyForLocalAi = prev.slice(0, idx - 1);
      Promise.resolve()
        .then(() =>
          handleSendMessagePrivateRef.current(u.content, u.images, undefined, {
            regenerate: true,
            historyForLocalAi,
          })
        )
        .catch(() => {});
      return prev.slice(0, idx);
    });
  }, []);

  const handleSendMessageDecision = async (
    text: string,
    images?: string[],
    files?: SelectedFile[]
  ) => {
    if (decisionIsRunning) return;
    const prompt = text.trim();
    if (!prompt && (!images || images.length === 0) && (!files || files.length === 0)) return;

    const enabledCoachIds = selectedCoachIds.filter((id) => coachEnabledMap[id] !== false);
    const coachProfiles: DecisionCoachProfile[] = DECISION_COACHES.filter((c) =>
      enabledCoachIds.includes(c.id)
    );

    // 先把本轮插入 UI：每个 coach 先给一个 loading card
    const turnId = `${Date.now()}`;
    const newTurn: DecisionTurn = {
      id: turnId,
      userText: prompt || (files && files.length > 0 ? '请分析这个文件' : '请帮我做决策分析'),
      coachCards: coachProfiles.map((c) => ({
        coachId: c.id,
        coachName: c.name,
        coachRole: c.roleLabel,
        enabled: coachEnabledMap[c.id] !== false,
        loading: true,
        decisionAdvice: '',
        keyQuestions: '',
        riskWarnings: '',
        rawText: '',
        errorText: '',
      })),
      createdAt: new Date(),
    };
    setDecisionTurns((prev) => [...prev, newTurn]);
    setDecisionIsRunning(true);

    try {
      const usePrivateGateway = await hasPrivateChatBackendSession();
      if (!usePrivateGateway) {
        const err = '未登录或缺少租户/工作区信息，无法调用决策模式接口，请先登录后重试。';
        setDecisionTurns((prev) =>
          prev.map((t) =>
            t.id !== turnId
              ? t
              : {
                  ...t,
                  coachCards: t.coachCards.map((card) => ({
                    ...card,
                    loading: false,
                    errorText: err,
                  })),
                }
          )
        );
        return;
      }

      const modelName = selectedModelRef.current || (await getSelectedModelName());
      await ensureDecisionCoachThreads(enabledCoachIds);

      const results = await runDecisionTurn({
        coachIds: enabledCoachIds,
        userText: prompt || (files && files.length > 0 ? '请分析这个文件' : '请帮我做决策分析'),
        modelName,
        images,
        files,
      });

      setDecisionTurns((prev) =>
        prev.map((t) => {
          if (t.id !== turnId) return t;
          return {
            ...t,
            coachCards: t.coachCards.map((card) => {
              const r = results[card.coachId];
              if (!r) return { ...card, loading: false, errorText: '未收到该教练回复' };
              if (r.ok) {
                return {
                  ...card,
                  loading: false,
                  rawText: r.rawText,
                  decisionAdvice: r.sections.decisionAdvice,
                  keyQuestions: r.sections.keyQuestions,
                  riskWarnings: r.sections.riskWarnings,
                };
              }
              return {
                ...card,
                loading: false,
                errorText: r.errorText,
              };
            }),
          };
        })
      );
    } catch (e) {
      const raw = e instanceof Error ? e.message : '请求失败，请稍后重试';
      const msg = friendlyError(raw);
      setDecisionTurns((prev) =>
        prev.map((t) =>
          t.id !== turnId
            ? t
            : {
                ...t,
                coachCards: t.coachCards.map((card) => ({
                  ...card,
                  loading: false,
                  errorText: msg,
                })),
              }
        )
      );
    } finally {
      setDecisionIsRunning(false);
    }
  };

  const handleSendMessage = async (text: string, images?: string[], files?: SelectedFile[]) => {
    if (homeMode === 'decision') {
      if (!decisionStarted) setDecisionStarted(true);
      return handleSendMessageDecision(text, images, files);
    }
    return handleSendMessagePrivate(text, images, files);
  };

  handleSendMessageRef.current = handleSendMessage;

  useEffect(() => {
    const run = async () => {
      if (typeof openThreadIdParam === 'string' && openThreadIdParam.length > 0) {
        const tid = openThreadIdParam;
        privateThreadIdRef.current = tid;
        if (!(await hasPrivateChatBackendSession())) return;
        try {
          const msgs = await getPrivateThreadStateMessages(tid);
          setMessages(msgs);
        } catch {
          setMessages([]);
        }
        return;
      }
      if (newChatParam === '1') {
        privateUiEpochRef.current += 1;
        privateThreadIdRef.current = null;
        setMessages([]);
        setDecisionTurns([]);
        setDecisionStarted(false);
        const pending = consumePendingHomeChatMessage();
        router.replace('/');
        if (pending) {
          setTimeout(() => {
            void handleSendMessageRef.current(pending);
          }, 200);
        }
      }
    };
    void run();
  }, [newChatParam, openThreadIdParam]);

  const hasMessages = messages.length > 0;
  const hasDecisionMessages = decisionTurns.length > 0;

  useEffect(() => {
    if (!hasMessages) setSuggestionBatchIndex(0);
  }, [hasMessages]);

  const visibleSuggestions = useMemo(
    () => buildSimpleHomeSuggestionBatch(suggestionBatchIndex),
    [suggestionBatchIndex]
  );
  const shouldShowChatInput = homeMode === 'private' || decisionStarted || hasDecisionMessages;
  const { width: winW, height: winH } = useWindowDimensions();
  const isPrivateEmptyHome = homeMode === 'private' && !hasMessages;

  const mainContent = (
          <KeyboardAvoidingView behavior={undefined} keyboardVerticalOffset={0} style={{ flex: 1 }}>
            <View style={{ flex: 1 }}>
              <View
                className="flex-row items-center justify-between px-6"
                style={{ paddingTop: insets.top + 10 }}>
                <Pressable
                  onPress={handleOpenDrawer}
                  className="h-10 w-10 items-start justify-center"
                  accessibilityRole="button"
                  accessibilityLabel="打开侧边栏">
                  <Icon
                    name="AlignJustify"
                    size={28}
                    color="rgba(255,255,255,0.92)"
                    strokeWidth={1.9}
                  />
                </Pressable>

                <View className="flex-row items-center rounded-full bg-[#3C3C3C] p-0.5">
                  <Pressable
                    onPress={() => setHomeMode('private')}
                    className={`rounded-full px-6 py-2.5 ${homeMode === 'private' ? 'bg-[#00000033]' : ''}`}>
                    <ThemedText
                      className={`${homeMode === 'private' ? 'font-bold text-[#FFD041]' : 'text-white/70'} text-[14px]`}>
                      私人模式
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={() => setHomeMode('decision')}
                    className={`rounded-full px-6 py-2.5 ${homeMode === 'decision' ? 'bg-[#00000033]' : ''}`}>
                    <ThemedText
                      className={`${homeMode === 'decision' ? 'font-bold text-[#FFD041]' : 'text-white/70'} text-[14px]`}>
                      决策模式
                    </ThemedText>
                  </Pressable>
                </View>

                <Pressable
                  onPress={handleClearScreen}
                  className="h-10 w-10 items-end justify-center"
                  accessibilityRole="button"
                  accessibilityLabel="清屏">
                  <Icon name="Paintbrush" size={22} color="rgba(255,255,255,0.92)" />
                </Pressable>
              </View>

              {homeMode === 'private' ? (
                hasMessages ? (
                  <Conversation
                    messages={messages}
                    isTyping={isTyping}
                    combineTurnsInFrame
                    onRegenerateAssistant={handleRegenerateAssistant}
                    knowledgeStarredAssistantIds={knowledgeStarredIds}
                    onKnowledgeAssistantStarred={handleKnowledgeAssistantStarred}
                  />
                ) : (
                    <ScrollView
                      ref={scrollViewRef}
                      className="flex-1 bg-transparent px-8 pb-10 pt-28"
                      contentContainerStyle={{
                        flexGrow: 1,
                        paddingBottom: 30 + floatingTabExtra,
                      }}
                      showsVerticalScrollIndicator={false}
                      bounces={false}
                      overScrollMode="never">
                      <View className="w-full max-w-md">
                      <ThemedText className="text-[32px] leading-[45px] text-white">
                        我是AI YOU
                      </ThemedText>
                      <ThemedText
                        className="mt-1 text-[16px] leading-[22px]"
                        style={{ color: 'rgba(255,255,255,0.78)' }}>
                        你的分身已经准备用你的方式思考
                      </ThemedText>

                      <View className="mt-12">
                        <ThemedText className="mb-2 text-[16px] leading-[22px] text-white">
                          试试问我：
                        </ThemedText>
                        <View className="gap-y-1.5">
                          {visibleSuggestions.map((s, idx) => (
                            <TipCard
                              key={`${suggestionBatchIndex}-${idx}-${s.prompt}`}
                              title={s.prompt}
                              categoryLabel={s.categoryLabel}
                              icon={s.icon}
                              onPress={() => void handleSendMessage(s.prompt)}
                            />
                          ))}
                        </View>
                        <Pressable
                          onPress={() =>
                            setSuggestionBatchIndex((i) => (i + 1) % CHAT_HOME_SIMPLE_ROUNDS)
                          }
                          className="mt-2 flex-row items-center gap-1 self-start"
                          accessibilityRole="button"
                          accessibilityLabel="换一批常见问题">
                          <ThemedText className="text-[10px] text-white/60">换一批</ThemedText>
                          <Icon name="RefreshCw" size={11} color="rgba(255,255,255,0.65)" />
                        </Pressable>
                      </View>

                      <View className="mt-12">
                        <ThemedText
                          className="text-[16px] leading-[22px]"
                          style={{ color: 'rgba(255,255,255,0.9)' }}>
                          或者随便聊点什么
                        </ThemedText>
                        <ThemedText
                          className="text-[16px] leading-[22px]"
                          style={{ color: 'rgba(255,255,255,0.9)' }}>
                          --我都能接得住
                        </ThemedText>
                      </View>
                    </View>
                    </ScrollView>
                )
              ) : decisionStarted || hasDecisionMessages ? (
                <DecisionConversation
                  turns={decisionTurns}
                  coachEnabledMap={coachEnabledMap}
                  onToggleCoach={(coachId, enabled) =>
                    setCoachEnabledMap((prev) => ({ ...prev, [coachId]: enabled }))
                  }
                  isRunning={decisionIsRunning}
                  onOpenCoachPicker={() => setCoachPickerOpen(true)}
                />
              ) : (
                <DecisionWelcome
                  defaultCoach={
                    DECISION_COACHES.find((c) => c.id === 'strategy') ?? DECISION_COACHES[0]
                  }
                  coaches={DECISION_COACHES}
                  onStart={() => setDecisionStarted(true)}
                  bottomOffset={floatingTabExtra}
                  reserveInputSpace={false}
                />
              )}
              {shouldShowChatInput ? (
                <ChatInput onSendMessage={handleSendMessage} variant="home" />
              ) : null}
            </View>
          </KeyboardAvoidingView>
  );

  return (
    <View style={{ flex: 1 }}>
      {isPrivateEmptyHome ? (
        <View
          style={{
            flex: 1,
            backgroundColor: PRIVATE_MODE_SCREEN_BG,
            overflow: 'hidden',
          }}>
          <PrivateEmptyFigmaBackground winW={winW} winH={winH} />
          <View style={{ flex: 1, zIndex: 3 }}>{mainContent}</View>
        </View>
      ) : (
        <ImageBackground
          source={require('@/assets/images/login-bg.png')}
          resizeMode="cover"
          style={{ flex: 1 }}>
          <View className="relative flex-1 bg-[#1D1D1D]">
            <LinearGradient
              style={{ width: '100%', display: 'flex', flex: 1, flexDirection: 'column' }}
              colors={['rgba(10,32,52,0.38)', 'transparent', colors.gradient]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}>
              {mainContent}
            </LinearGradient>
          </View>
        </ImageBackground>
      )}

      <DecisionCoachPickerModal
        visible={coachPickerOpen}
        coaches={DECISION_COACHES}
        selectedCoachIds={selectedCoachIds}
        onClose={() => setCoachPickerOpen(false)}
        onChangeSelectedCoachIds={(next) => {
          setSelectedCoachIds(next);
          setCoachEnabledMap((prev) => {
            const map: Record<string, boolean> = { ...prev };
            for (const id of next) {
              if (map[id] == null) map[id] = true;
            }
            // 不自动删除旧 key：保留历史开关状态
            return map;
          });
        }}
      />
    </View>
  );
};

const TipCard = ({
  title,
  categoryLabel,
  icon: _icon,
  onPress,
}: {
  title: string;
  categoryLabel?: string;
  icon: IconName;
  onPress: () => void;
}) => {
  return (
    <Pressable
      onPress={onPress}
      className="self-start rounded-full border border-white/60 bg-transparent px-3.5 py-1">
      <ThemedText className="text-[12px] text-white/90" numberOfLines={1}>
        {categoryLabel ? (
          <ThemedText className="text-[11px] text-white/55">{categoryLabel} · </ThemedText>
        ) : null}
        {title}
      </ThemedText>
    </Pressable>
  );
};

export default HomeScreen;
