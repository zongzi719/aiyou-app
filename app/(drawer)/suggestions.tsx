import Header from '@/components/Header';
import React, { useState } from 'react';
import { View, KeyboardAvoidingView, TouchableOpacity, Platform } from 'react-native';
import Icon from '@/components/Icon';
import ThemedText from '@/components/ThemedText';
import DrawerButton from '@/components/DrawerButton';
import { ChatInput } from '@/components/ChatInput';
import { BotSwitch } from '@/components/BotSwitch';
import { CardScroller } from '@/components/CardScroller';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeColors } from '@/app/contexts/ThemeColors';
import { Conversation, Message } from '@/components/Conversation';
import { streamMessage, isConfigured, AIMessage } from '@/services/ai';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const HomeScreen = () => {
    const colors = useThemeColors();
    const [messages, setMessages] = useState<Message[]>([]);
    const [isTyping, setIsTyping] = useState(false);
    const insets = useSafeAreaInsets();
    const rightComponents = [
        <BotSwitch key="bot-switch" />
    ];

    const leftComponent = [
        <DrawerButton key="drawer-button" />
    ];

    const handleSendMessage = async (text: string, images?: string[]) => {
        const userMessage: Message = {
            id: Date.now().toString(),
            type: 'user',
            content: text,
            timestamp: new Date(),
        };
        setMessages(prev => [...prev, userMessage]);

        if (!isConfigured()) {
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

        setIsTyping(true);

        const assistantId = (Date.now() + 1).toString();
        const assistantMessage: Message = {
            id: assistantId,
            type: 'assistant',
            content: '',
            timestamp: new Date(),
            isStreaming: true,
        };

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

            await streamMessage(aiMessages, (chunk) => {
                setMessages(prev =>
                    prev.map(m =>
                        m.id === assistantId
                            ? { ...m, content: m.content + chunk }
                            : m
                    )
                );
            });

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
                const filtered = prev.filter(m => m.id !== assistantId || m.content !== '');
                return [...filtered, errorMessage];
            });
        }
    };

    const hasMessages = messages.length > 0;

    return (
        <View className="flex-1 bg-background relative">
            <LinearGradient style={{ width: '100%', display: 'flex', flex: 1, flexDirection: 'column' }} colors={['transparent', 'transparent', colors.gradient]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    keyboardVerticalOffset={0}
                    style={{ flex: 1 }}
                >
                    <View className='flex-1'>
                        <Header
                            title=""
                            variant="transparent"
                            leftComponent={leftComponent}
                            rightComponents={rightComponents}
                        />

                        {hasMessages ? (
                            <Conversation messages={messages} isTyping={isTyping} />
                        ) : (
                            <View className='flex-1 items-center justify-end pb-36' style={{ paddingBottom: insets.bottom + 130 }}>
                                <CardScroller className='px-global pb-4'>
                                    <SuggestionCard title="Make a recipe" description="Find the best recipes" icon="Cookie" />
                                    <SuggestionCard title="Generate image" description="Use text to generate an image" icon="Image" />
                                    <SuggestionCard title="Generate text" description="Use an image to generate text" icon="Text" />
                                    <SuggestionCard title="Generate code" description="Use text to generate code" icon="Code" />
                                </CardScroller>
                            </View>
                        )}

                        <ChatInput onSendMessage={handleSendMessage} />
                    </View>
                </KeyboardAvoidingView>
            </LinearGradient>
        </View>
    );
};

const SuggestionCard = (props: any) => {
    return (
        <TouchableOpacity
            activeOpacity={0.8}
            className='p-4 bg-secondary w-[270px] flex flex-row items-center rounded-3xl border border-border'>
            <Icon name={props.icon} size={20} className='bg-background rounded-2xl w-14 h-14' />
            <View className='ml-4 flex-1'>
                <ThemedText className='text-lg font-semibold'>{props.title}</ThemedText>
                <ThemedText className='text-xs'>{props.description}</ThemedText>
            </View>
        </TouchableOpacity>
    );
};


export default HomeScreen;