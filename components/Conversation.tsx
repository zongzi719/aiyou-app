import React, { useState, useRef, useEffect } from 'react';
import { View, ScrollView, Pressable, Keyboard, Platform, StyleSheet, Image } from 'react-native';
import ThemedText from './ThemedText';
import Icon from './Icon';
import { shadowPresets } from '@/utils/useShadow';
import { Divider } from './layout/Divider';
import AnimatedView from './AnimatedView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeColors } from '@/app/contexts/ThemeColors';
import Markdown from 'react-native-markdown-display';
import { ShimmerText } from './ShimmerText';

export type Message = {
    id: string;
    type: 'user' | 'assistant';
    content: string;
    images?: string[];
    timestamp: Date;
    isStreaming?: boolean;
};

type ConversationProps = {
    messages: Message[];
    isTyping?: boolean;
};

export const Conversation = ({ messages, isTyping }: ConversationProps) => {
    const insets = useSafeAreaInsets();
    const scrollViewRef = useRef<ScrollView>(null);
    const [likedMessages, setLikedMessages] = useState<Set<string>>(new Set());
    const [showScrollButton, setShowScrollButton] = useState(false);
    const colors = useThemeColors();

    // Scroll to end when messages change
    useEffect(() => {
        setTimeout(() => {
            scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
    }, [messages, isTyping]);

    // Scroll to end when keyboard opens
    useEffect(() => {
        const keyboardShowEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const keyboardListener = Keyboard.addListener(keyboardShowEvent, () => {
            setTimeout(() => {
                scrollViewRef.current?.scrollToEnd({ animated: true });
            }, 100);
        });

        return () => keyboardListener.remove();
    }, []);

    // Handle scroll to detect if user is at bottom
    const handleScroll = (event: any) => {
        const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
        const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
        setShowScrollButton(distanceFromBottom > 100);
    };

    const scrollToBottom = () => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
    };

    const toggleLike = (messageId: string) => {
        setLikedMessages(prev => {
            const newSet = new Set(prev);
            if (newSet.has(messageId)) {
                newSet.delete(messageId);
            } else {
                newSet.add(messageId);
            }
            return newSet;
        });
    };

    if (messages.length === 0 && !isTyping) {
        return null;
    }

    return (
        <View className="flex-1 relative">
            <ScrollView
                ref={scrollViewRef}
                className="flex-1 px-6"
                contentContainerStyle={{ paddingBottom: insets.bottom + 140, paddingTop: insets.top + 80 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                onScroll={handleScroll}
                scrollEventThrottle={16}
            >
                {messages.map((message) => (
                    <View key={message.id} className="mb-6">
                        {message.type === 'user' ? (
                            <UserMessage content={message.content} images={message.images} />
                        ) : (
                            <AssistantMessage
                                content={message.content}
                                isStreaming={message.isStreaming}
                                isLiked={likedMessages.has(message.id)}
                                onLike={() => toggleLike(message.id)}
                            />
                        )}
                    </View>
                ))}

                {isTyping && (
                    <AnimatedView animation="fadeIn" duration={300}>
                        <TypingIndicator />
                    </AnimatedView>
                )}
            </ScrollView>

            {/* Floating scroll to bottom button */}
            {showScrollButton && (
                <View style={{ bottom: insets.bottom + 130 }} className='absolute pb-4 w-full left-0 items-center justify-center'>
                    <AnimatedView animation="scaleIn" duration={200}>
                        <Pressable
                            onPress={scrollToBottom}
                            className="w-10 h-10 bg-secondary border border-border rounded-full items-center justify-center"
                            style={shadowPresets.small}
                        >
                            <Icon name="ArrowDown" size={18} />
                        </Pressable>
                    </AnimatedView>
                </View>
            )}

            <LinearGradient
                style={{ position: 'absolute', bottom: 0, left: 0, right: 0, width: '100%', height: insets.bottom + 140 }}
                colors={['transparent', 'transparent', colors.gradient]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
            />
        </View>
    );
};

const UserMessage = ({ content, images }: { content: string; images?: string[] }) => (
    <AnimatedView animation="slideInBottom" duration={300}>
        <View className="self-end max-w-[85%] items-end gap-1">
            {images && images.length > 0 && (
                <View className="flex-row flex-wrap gap-1 justify-end">
                    {images.map((uri, i) => (
                        <Image
                            key={i}
                            source={{ uri }}
                            className="w-36 h-36 rounded-2xl"
                            resizeMode="cover"
                        />
                    ))}
                </View>
            )}
            {content.trim().length > 0 && (
                <View style={shadowPresets.small} className="bg-secondary rounded-3xl p-global">
                    <ThemedText className="text-base">{content}</ThemedText>
                </View>
            )}
        </View>
    </AnimatedView>
);

type AssistantMessageProps = {
    content: string;
    isStreaming?: boolean;
    isLiked: boolean;
    onLike: () => void;
};

const AssistantMessage = ({ content, isStreaming, isLiked, onLike }: AssistantMessageProps) => {
    const colors = useThemeColors();

    const markdownStyles = StyleSheet.create({
        body: {
            color: colors.text,
            fontSize: 16,
            lineHeight: 24,
        },
        heading1: {
            color: colors.text,
            fontSize: 24,
            fontWeight: '700',
            marginBottom: 8,
            marginTop: 16,
        },
        heading2: {
            color: colors.text,
            fontSize: 20,
            fontWeight: '700',
            marginBottom: 8,
            marginTop: 12,
        },
        heading3: {
            color: colors.text,
            fontSize: 18,
            fontWeight: '600',
            marginBottom: 6,
            marginTop: 10,
        },
        strong: {
            fontWeight: '700',
            color: colors.text,
        },
        em: {
            fontStyle: 'italic',
        },
        bullet_list: {
            marginVertical: 8,
        },
        ordered_list: {
            marginVertical: 8,
        },
        list_item: {
            marginVertical: 4,
        },
        code_inline: {
            backgroundColor: colors.secondary,
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 4,
            fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
            fontSize: 14,
        },
        code_block: {
            backgroundColor: colors.secondary,
            padding: 12,
            borderRadius: 8,
            fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
            fontSize: 14,
            marginVertical: 8,
        },
        fence: {
            backgroundColor: colors.secondary,
            padding: 12,
            borderRadius: 8,
            fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
            fontSize: 14,
            marginVertical: 8,
        },
        blockquote: {
            borderLeftWidth: 3,
            borderLeftColor: colors.text,
            paddingLeft: 12,
            marginVertical: 8,
            opacity: 0.8,
        },
        link: {
            color: colors.text,
        },
        paragraph: {
            marginVertical: 4,
        },
    });

    return (
        <AnimatedView animation="fadeIn" duration={400} delay={200}>
            <View className="max-w-[95%]">
                <View className="mb-4">
                    {content.trim().length > 0 ? (
                        <Markdown style={markdownStyles}>{content}</Markdown>
                    ) : !isStreaming ? (
                        <ThemedText className="text-base text-subtext italic">（未收到回复）</ThemedText>
                    ) : null}
                    {isStreaming ? <ShimmerText text="正在回复…" /> : null}
                </View>
                {!isStreaming && content.trim().length > 0 && (
                    <>
                        <Divider className="my-3" />
                        <View className="flex-row mt-2">
                            <Pressable
                                onPress={onLike}
                                className="flex-row items-center mr-6"
                            >
                                <Icon
                                    name="Heart"
                                    size={18}
                                    color={isLiked ? "#E57DDF" : undefined}
                                    fill={isLiked ? "#E57DDF" : "none"}
                                />
                            </Pressable>
                            <Pressable className="flex-row items-center mr-6">
                                <Icon name="Copy" size={18} />
                            </Pressable>
                            <Pressable className="flex-row items-center">
                                <Icon name="Share2" size={18} />
                            </Pressable>
                        </View>
                    </>
                )}
            </View>
        </AnimatedView>
    );
};

const TypingIndicator = () => (
    <View className="flex-row items-center py-4">
        <View className="flex-row gap-2">
            {[0, 1, 2].map((i) => (
                <AnimatedView
                    key={i}
                    animation="scaleIn"
                    duration={400}
                    delay={i * 150}
                    className="w-1 h-1 bg-primary rounded-full"
                />
            ))}
        </View>
        <ThemedText className="ml-3 text-sm text-subtext">Luna is thinking...</ThemedText>
    </View>
);

export default Conversation;
