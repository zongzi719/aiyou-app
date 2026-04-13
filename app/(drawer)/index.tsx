import Header from '@/components/Header';
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, Pressable, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import Icon, { IconName } from '@/components/Icon';
import ThemedText from '@/components/ThemedText';
import DrawerButton from '@/components/DrawerButton';
import { ChatInput } from '@/components/ChatInput';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeColors } from '@/app/contexts/ThemeColors';
import { useFocusEffect, useLocalSearchParams, router } from 'expo-router';
import { Conversation, Message } from '@/components/Conversation';
import { streamMessage, isConfigured, AIMessage } from '@/services/ai';
import { hasPrivateChatBackendSession } from '@/lib/authSession';
import {
  createPrivateThread,
  streamPrivateChatRun,
  persistThreadTitleFireForget,
  getPrivateThreadStateMessages,
} from '@/lib/privateChatApi';
import { getSelectedModelName } from '@/lib/privateChatUiModel';
import ModelSelector from '@/components/ModelSelector';

function firstSearchParam(v: string | string[] | undefined): string | undefined {
    if (v == null) return undefined;
    if (Array.isArray(v)) return v[0];
    return v;
}

const HomeScreen = () => {
    const colors = useThemeColors();
    const scrollViewRef = useRef<ScrollView>(null);
    const privateThreadIdRef = useRef<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [isTyping, setIsTyping] = useState(false);
    const selectedModelRef = useRef<string>('');

    // 初始化时读取上次选择的模型
    useEffect(() => {
        getSelectedModelName().then((name) => { selectedModelRef.current = name; });
    }, []);
    const params = useLocalSearchParams<{ openThreadId?: string | string[]; newChat?: string | string[] }>();
    const openThreadIdParam = firstSearchParam(params.openThreadId);
    const newChatParam = firstSearchParam(params.newChat);

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
                router.replace('/');
                return;
            }
        };
        void run();
    }, [newChatParam, openThreadIdParam]);

    useFocusEffect(
        useCallback(() => {
            const timer = setTimeout(() => {
                scrollViewRef.current?.scrollToEnd({ animated: false });
            }, 100);

            return () => clearTimeout(timer);
        }, [])
    );

    const handleSendMessage = async (text: string, images?: string[]) => {
        const userMessage: Message = {
            id: Date.now().toString(),
            type: 'user',
            content: text,
            images: images && images.length > 0 ? images : undefined,
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
                }

                const modelName = selectedModelRef.current || await getSelectedModelName();

                let sseErrorMsg: string | undefined;
                await streamPrivateChatRun(
                    threadId,
                    text,
                    modelName,
                    images,
                    {
                        onAssistantText: (full) => {
                            setMessages(prev =>
                                prev.map(m =>
                                    m.id === assistantId ? { ...m, content: full } : m
                                )
                            );
                        },
                        onTitleDetected: (title) => {
                            if (privateThreadIdRef.current) {
                                persistThreadTitleFireForget(privateThreadIdRef.current, title);
                            }
                        },
                        onError: (errMsg) => {
                            sseErrorMsg = errMsg;
                        },
                    }
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
                            m.id === assistantId ? { ...m, isStreaming: false } : m
                        )
                    );
                }
            } catch (error) {
                setIsTyping(false);
                const msg = error instanceof Error ? error.message : '私人模式请求失败';
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
            { role: 'user' as const, content: text },
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
                                contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end', paddingBottom: 20 }}
                                showsVerticalScrollIndicator={false}
                                bounces={false}
                                overScrollMode='never'
                            >
                                <View className='flex-1 items-center justify-center relative'>
                                    <ThemedText className='text-4xl font-outfit-bold'>Welcome John<Text className='text-sky-500'>.</Text></ThemedText>
                                    <ThemedText className='text-sm text-gray-500 mt-2'>What can I help you with today?</ThemedText>
                                    <View className='flex-row gap-x-2 flex-wrap items-center justify-center mt-8'>
                                        <TipCard title="Make a recipe" icon="Cookie" />
                                        <TipCard title="Generate image" icon="Image" />
                                        <TipCard title="Generate text" icon="Text" />
                                        <TipCard title="Generate code" icon="Code" />
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

const TipCard = ({ title, icon }: { title: string, icon: string }) => {
    return (
        <Pressable className='p-3 mb-2 bg-background border border-border flex flex-row items-center rounded-3xl'>
            <Icon name={icon as IconName} size={15} className=' rounded-xl' />
            <ThemedText className='text-sm font-semibold ml-2 mr-1'>{title}</ThemedText>
        </Pressable>
    );
};

export default HomeScreen;