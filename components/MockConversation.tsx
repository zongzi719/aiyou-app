import { LinearGradient } from 'expo-linear-gradient';
import React, { useState, useRef, useEffect } from 'react';
import { View, ScrollView, Pressable, Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AnimatedView from './AnimatedView';
import Icon from './Icon';
import ShimmerText from './ShimmerText';
import ThemedText from './ThemedText';
import { Divider } from './layout/Divider';

import { useThemeColors } from '@/app/contexts/ThemeColors';
import { shadowPresets } from '@/utils/useShadow';

type Message = {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
};

type MockConversationProps = {
  messages: Message[];
  isTyping?: boolean;
};

const mockResponses = [
  {
    title: 'Connect Your API Key',
    content:
      "To get real AI responses, you'll need to connect your own API key. Luna supports both OpenAI (ChatGPT) and Google (Gemini) APIs.",
    details:
      'Head to Settings > API Configuration to add your key. Your API key is stored securely on your device and never sent to our servers. This ensures you have full control over your usage and costs.',
  },
  {
    title: 'Getting Started',
    content:
      "This is a demo conversation to showcase Luna's chat interface. The animations, typing indicators, and message bubbles are all ready for your AI integration.",
    details:
      "Once connected, you can customize the AI's behavior, set system prompts, and adjust response parameters to match your app's needs.",
  },
  {
    title: 'Why Bring Your Own Key?',
    content:
      "We believe in transparency and control. By using your own API key, you get direct access to the AI provider's pricing, no middleman fees, and complete privacy.",
    details:
      'You can monitor your usage directly in the OpenAI or Google Cloud console, set spending limits, and switch between models as needed.',
  },
];

export const MockConversation = ({ messages, isTyping }: MockConversationProps) => {
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
    setLikedMessages((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  };

  const getMockResponse = (index: number) => {
    return mockResponses[index % mockResponses.length];
  };

  if (messages.length === 0 && !isTyping) {
    return null;
  }
  return (
    <View className="relative flex-1">
      <ScrollView
        ref={scrollViewRef}
        className="flex-1 px-6"
        contentContainerStyle={{ paddingBottom: insets.bottom + 140, paddingTop: insets.top + 80 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onScroll={handleScroll}
        scrollEventThrottle={16}>
        {messages.map((message, index) => (
          <View key={message.id} className="mb-6">
            {message.type === 'user' ? (
              <UserMessage content={message.content} />
            ) : (
              <AssistantMessage
                response={getMockResponse(Math.floor(index / 2))}
                isLiked={likedMessages.has(message.id)}
                onLike={() => toggleLike(message.id)}
              />
            )}
          </View>
        ))}

        {isTyping && (
          <AnimatedView animation="fadeIn" duration={300}>
            <ShimmerText text="Luna is thinking..." />
          </AnimatedView>
        )}
      </ScrollView>

      {/* Floating scroll to bottom button */}
      {showScrollButton && (
        <View
          style={{ bottom: insets.bottom + 130 }}
          className="absolute left-0 w-full items-center justify-center pb-4">
          <AnimatedView
            animation="scaleIn"
            duration={200}
            //className="absolute bottom-4 right-4"
          >
            <Pressable
              onPress={scrollToBottom}
              className="h-10 w-10 items-center justify-center rounded-full border border-border bg-secondary"
              style={shadowPresets.small}>
              <Icon name="ArrowDown" size={18} />
            </Pressable>
          </AnimatedView>
        </View>
      )}

      <LinearGradient
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          width: '100%',
          height: insets.bottom + 140,
        }}
        colors={['transparent', 'transparent', colors.gradient]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />
    </View>
  );
};

const UserMessage = ({ content }: { content: string }) => (
  <AnimatedView animation="slideInBottom" duration={300}>
    <View
      style={shadowPresets.small}
      className="max-w-[85%] self-end rounded-3xl bg-secondary p-global">
      <ThemedText className="text-base">{content}</ThemedText>
    </View>
  </AnimatedView>
);

type AssistantMessageProps = {
  response: (typeof mockResponses)[0];
  isLiked: boolean;
  onLike: () => void;
};

const AssistantMessage = ({ response, isLiked, onLike }: AssistantMessageProps) => (
  <AnimatedView animation="fadeIn" duration={400} delay={200}>
    <View className="max-w-[95%]">
      <ThemedText className="mb-3 text-xl font-bold">{response.title}</ThemedText>
      <ThemedText className="mb-4 leading-6">{response.content}</ThemedText>
      <ThemedText className="mb-4 leading-6 text-subtext">{response.details}</ThemedText>
      <Divider className="my-3" />
      <View className="mt-2 flex-row">
        <Pressable onPress={onLike} className="mr-6 flex-row items-center">
          <Icon
            name="Heart"
            size={18}
            color={isLiked ? '#E57DDF' : undefined}
            fill={isLiked ? '#E57DDF' : 'none'}
          />
        </Pressable>
        <Pressable className="mr-6 flex-row items-center">
          <Icon name="Copy" size={18} />
        </Pressable>
        <Pressable className="flex-row items-center">
          <Icon name="Share2" size={18} />
        </Pressable>
      </View>
    </View>
  </AnimatedView>
);

const TypingIndicator = () => (
  <View className="flex-row items-center py-4">
    <View className="flex-row gap-2">
      {[0, 1, 2].map((i) => (
        <AnimatedView
          key={i}
          animation="scaleIn"
          duration={400}
          delay={i * 150}
          className="h-1 w-1 rounded-full bg-primary"
        />
      ))}
    </View>
    <ThemedText className="ml-3 text-sm text-subtext">Luna is typing...</ThemedText>
  </View>
);

export default MockConversation;
