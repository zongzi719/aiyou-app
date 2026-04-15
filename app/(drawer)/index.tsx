import Header from '@/components/Header';
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { View, Text, Pressable, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import Icon, { IconName } from '@/components/Icon';
import ThemedText from '@/components/ThemedText';
import DrawerButton from '@/components/DrawerButton';
import { ChatInput, SelectedFile } from '@/components/ChatInput';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeColors } from '@/app/contexts/ThemeColors';
import { useFocusEffect, useLocalSearchParams, router } from 'expo-router';
import { Conversation, Message, type MessageFile } from '@/components/Conversation';
import { streamMessage, isConfigured, AIMessage } from '@/services/ai';
import { hasPrivateChatBackendSession } from '@/lib/authSession';
import {
  createPrivateThread,
  streamPrivateChatRun,
  persistThreadTitleFireForget,
  getPrivateThreadStateMessages,
  uploadFilesToThread,
  type UploadedFileInfo,
} from '@/lib/privateChatApi';
import { prependPrivateThreadCache } from '@/lib/listDataCache';
import { getSelectedModelName } from '@/lib/privateChatUiModel';
import ModelSelector from '@/components/ModelSelector';
import { fetchProfile } from '@/services/profileApi';
import { memoryApi } from '@/services/memoryApi';
import {
    buildMemorySuggestedPrompts,
    DEFAULT_CHAT_HOME_SUGGESTIONS,
    mergeChatHomeSuggestionPools,
    sliceChatHomeSuggestionBatch,
    type ChatHomeSuggestion,
} from '@/lib/memorySuggestedPrompts';
import { useGlobalFloatingTabBarExtraBottom } from '@/hooks/useGlobalFloatingTabBarInset';
import { consumePendingHomeChatMessage } from '@/lib/pendingHomeChatMessage';

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
    if (s.includes('model') && (s.includes('not found') || s.includes('not exist') || s.includes('invalid'))) {
        return '所选模型不存在或当前不可用，请点击右上角切换模型。';
    }
    // 回退：原样返回但截断过长英文
    return raw.length > 200 ? raw.slice(0, 200) + '…' : raw;
}


function firstSearchParam(v: string | string[] | undefined): string | undefined {
    if (v == null) return undefined;
    if (Array.isArray(v)) return v[0];
    return v;
}

const HomeScreen = () => {
    const floatingTabExtra = useGlobalFloatingTabBarExtraBottom();
    const colors = useThemeColors();
    const scrollViewRef = useRef<ScrollView>(null);
    const privateThreadIdRef = useRef<string | null>(null);
    const handleSendMessageRef = useRef<
        (text: string, images?: string[], files?: SelectedFile[]) => Promise<void>
    >(() => Promise.resolve());
    const [messages, setMessages] = useState<Message[]>([]);
    const [isTyping, setIsTyping] = useState(false);
    const selectedModelRef = useRef<string>('');
    const [userName, setUserName] = useState('');
    const [suggestionPool, setSuggestionPool] = useState<ChatHomeSuggestion[]>(DEFAULT_CHAT_HOME_SUGGESTIONS);
    const [suggestionBatchIndex, setSuggestionBatchIndex] = useState(0);

    useEffect(() => {
        getSelectedModelName().then((name) => { selectedModelRef.current = name; });
        fetchProfile()
            .then((p) => setUserName(p.display_name || p.username))
            .catch(() => {});
    }, []);
    const params = useLocalSearchParams<{ openThreadId?: string | string[]; newChat?: string | string[] }>();
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

    const handleSendMessage = async (text: string, images?: string[], files?: SelectedFile[]) => {
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
        setMessages(prev => [...prev, userMessage]);

        const usePrivateGateway = await hasPrivateChatBackendSession();

        if (usePrivateGateway) {
            setIsTyping(true);
            const assistantId = (Date.now() + 1).toString();
            const assistantMessage: Message = {
                id: assistantId,
                type: 'assistant',
                content: '',
                timestamp: new Date(),
                isStreaming: true,
            };

            try {
                setIsTyping(false);
                setMessages(prev => [...prev, assistantMessage]);

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
                        const uploaded: UploadedFileInfo[] = await uploadFilesToThread(threadId, files!);
                        if (uploaded.length === 0) {
                            throw new Error('文件上传成功但未返回路径，请重试');
                        }
                        uploadedFileInfos = uploaded;
                    } catch (uploadErr) {
                        const errMsg = uploadErr instanceof Error ? uploadErr.message : '文件上传失败';
                        setMessages(prev => prev.map(m =>
                            m.id === assistantId
                                ? { ...m, content: errMsg, isStreaming: false }
                                : m
                        ));
                        setIsTyping(false);
                        return;
                    }
                }

                const modelName = selectedModelRef.current || await getSelectedModelName();
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
                            setMessages(prev =>
                                prev.map(m =>
                                    m.id === assistantId
                                        ? { ...m, content: full, thinkingStep: undefined }
                                        : m
                                )
                            );
                        },
                        onThinkingStep: (step) => {
                            setMessages(prev =>
                                prev.map(m =>
                                    m.id === assistantId ? { ...m, thinkingStep: step } : m
                                )
                            );
                        },
                        onTitleDetected: (title) => {
                            if (privateThreadIdRef.current) {
                                persistThreadTitleFireForget(privateThreadIdRef.current, title);
                            }
                        },
                        onError: (errMsg) => {
                            sseErrorMsg = friendlyError(errMsg);
                        },
                    },
                    uploadedFileInfos,
                );

                if (sseErrorMsg) {
                    setMessages(prev => prev.map(m =>
                        m.id === assistantId
                            ? { ...m, content: sseErrorMsg as string, isStreaming: false }
                            : m
                    ));
                } else {
                    setMessages(prev =>
                        prev.map(m =>
                            m.id === assistantId
                                ? { ...m, isStreaming: false, thinkingStep: undefined }
                                : m
                        )
                    );
                }
            } catch (error) {
                setIsTyping(false);
                const raw = error instanceof Error ? error.message : '请求失败，请稍后重试';
                const msg = friendlyError(raw);
                setMessages(prev => {
                    const filtered = prev.filter(m => m.id !== assistantId);
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
            // Show mock response if no API key
            setIsTyping(true);
            setTimeout(() => {
                setIsTyping(false);
                const assistantMessage: Message = {
                    id: (Date.now() + 1).toString(),
                    type: 'assistant',
                    content: 'To get real AI responses, add your API key to the .env file. Luna supports OpenAI (ChatGPT), Google Gemini, and Anthropic Claude.\n\nCopy .env.example to .env and add your key to get started!',
                    timestamp: new Date(),
                };
                setMessages(prev => [...prev, assistantMessage]);
            }, 1000);
            return;
        }

        // Show typing indicator
        setIsTyping(true);

        // Create assistant message for streaming
        const assistantId = (Date.now() + 1).toString();
        const assistantMessage: Message = {
            id: assistantId,
            type: 'assistant',
            content: '',
            timestamp: new Date(),
            isStreaming: true,
        };

        // Build conversation history for context
        const aiMessages: AIMessage[] = [
            ...messages.map(m => ({
                role: m.type as 'user' | 'assistant',
                content: m.content,
            })),
            { role: 'user' as const, content: text.trim() || (hasFiles ? '请分析这个文件' : '') },
        ];

        try {
            setIsTyping(false);
            setMessages(prev => [...prev, assistantMessage]);

            // Stream the response
            await streamMessage(aiMessages, (chunk) => {
                setMessages(prev =>
                    prev.map(m =>
                        m.id === assistantId
                            ? { ...m, content: m.content + chunk }
                            : m
                    )
                );
            });

            // Mark streaming as complete
            setMessages(prev =>
                prev.map(m =>
                    m.id === assistantId
                        ? { ...m, isStreaming: false }
                        : m
                )
            );
        } catch (error) {
            setIsTyping(false);
            const errorMessage: Message = {
                id: (Date.now() + 2).toString(),
                type: 'assistant',
                content: `Error: ${error instanceof Error ? error.message : 'Something went wrong'}`,
                timestamp: new Date(),
            };
            setMessages(prev => {
                // Remove the empty streaming message if it exists
                const filtered = prev.filter(m => m.id !== assistantId || m.content !== '');
                return [...filtered, errorMessage];
            });
        }
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
                privateThreadIdRef.current = null;
                setMessages([]);
                const pending = consumePendingHomeChatMessage();
                router.replace('/');
                if (pending) {
                    setTimeout(() => {
                        void handleSendMessageRef.current(pending);
                    }, 200);
                }
                return;
            }
        };
        void run();
    }, [newChatParam, openThreadIdParam]);

    const leftComponent = [
        <DrawerButton key="drawer-button" />,
    ];

    const rightComponent = [
        <ModelSelector
            key="model-selector"
            onModelChange={(name) => { selectedModelRef.current = name; }}
        />,
    ];

    const hasMessages = messages.length > 0;

    useEffect(() => {
        if (hasMessages) return;
        let cancelled = false;
        (async () => {
            try {
                const memories = await memoryApi.getMemories();
                if (cancelled) return;
                const merged = mergeChatHomeSuggestionPools(buildMemorySuggestedPrompts(memories));
                setSuggestionPool(merged);
            } catch {
                if (!cancelled) setSuggestionPool([...DEFAULT_CHAT_HOME_SUGGESTIONS]);
            }
        })();
        return () => { cancelled = true; };
    }, [hasMessages]);

    useEffect(() => {
        setSuggestionBatchIndex(0);
    }, [suggestionPool]);

    const visibleSuggestions = useMemo(
        () => sliceChatHomeSuggestionBatch(suggestionPool, suggestionBatchIndex, 4),
        [suggestionPool, suggestionBatchIndex],
    );

    return (
        <View className="flex-1 bg-background relative">
            <LinearGradient style={{ width: '100%', display: 'flex', flex: 1, flexDirection: 'column' }} colors={['transparent', 'transparent', colors.gradient]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    keyboardVerticalOffset={0}
                    style={{ flex: 1 }}
                >
                    <View style={{ flex: 1 }}>
                        <Header
                            title=""
                            variant='transparent'
                            leftComponent={leftComponent}
                            rightComponents={rightComponent} />
                        {hasMessages ? (
                            <Conversation messages={messages} isTyping={isTyping} />
                        ) : (
                            <ScrollView
                                ref={scrollViewRef}
                                className='flex-1 px-8 pt-10 pb-10'
                                contentContainerStyle={{
                                    flexGrow: 1,
                                    justifyContent: 'flex-end',
                                    paddingBottom: 20 + floatingTabExtra,
                                }}
                                showsVerticalScrollIndicator={false}
                                bounces={false}
                                overScrollMode='never'
                            >
                                <View className='flex-1 items-center justify-center relative'>
                                    <ThemedText className='text-4xl font-outfit-bold'>你好 {userName || 'AI You'}<Text className='text-sky-500'>.</Text></ThemedText>
                                    <ThemedText className='text-sm text-gray-500 mt-2'>今天有什么我可以帮你的？</ThemedText>
                                    <View className='w-full max-w-md mt-6 px-1'>
                                        <Pressable
                                            onPress={() => setSuggestionBatchIndex((i) => i + 1)}
                                            className='flex-row items-center justify-end gap-1 self-end py-1 active:opacity-70'
                                            accessibilityRole='button'
                                            accessibilityLabel='换一批常见问题'
                                        >
                                            <Icon name="RefreshCw" size={14} color={colors.placeholder} />
                                            <ThemedText className='text-sm text-gray-500'>换一批</ThemedText>
                                        </Pressable>
                                    </View>
                                    <View className='flex-row gap-x-2 flex-wrap items-stretch justify-center mt-2 max-w-md'>
                                        {visibleSuggestions.map((s, idx) => (
                                            <TipCard
                                                key={`${suggestionBatchIndex}-${idx}-${s.prompt.slice(0, 24)}`}
                                                title={s.prompt}
                                                icon={s.icon}
                                                onPress={() => void handleSendMessage(s.prompt)}
                                            />
                                        ))}
                                    </View>
                                </View>
                            </ScrollView>
                        )}
                        <ChatInput onSendMessage={handleSendMessage} />
                    </View>
                </KeyboardAvoidingView>
            </LinearGradient>
        </View>
    );
};

const TipCard = ({
    title,
    icon,
    onPress,
}: {
    title: string;
    icon: IconName;
    onPress: () => void;
}) => {
    return (
        <Pressable
            onPress={onPress}
            className='p-3 mb-2 bg-background border border-border flex flex-row items-center rounded-3xl w-[47%] min-w-[140px]'
        >
            <Icon name={icon} size={15} className=' rounded-xl shrink-0' />
            <ThemedText className='text-sm font-semibold ml-2 mr-1 flex-1' numberOfLines={3}>{title}</ThemedText>
        </Pressable>
    );
};

export default HomeScreen;