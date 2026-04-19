import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { ActionSheetRef } from 'react-native-actions-sheet';

import ActionSheetThemed from './ActionSheetThemed';
import Icon from './Icon';
import ThemedText from './ThemedText';

import { useThemeColors } from '@/app/contexts/ThemeColors';
import { getPrivateChatUiModelLabel, setPrivateChatUiModelLabel } from '@/lib/privateChatUiModel';

export const BotSwitch = () => {
  const [selectedModel, setSelectedModel] = useState('ChatGPT');
  const actionSheetRef = useRef<ActionSheetRef>(null);

  useEffect(() => {
    void getPrivateChatUiModelLabel().then((label) => {
      if (label) setSelectedModel(label);
    });
  }, []);

  // AI model options
  const modelOptions = [
    { label: 'ChatGPT', value: 'ChatGPT' },
    { label: 'Claude', value: 'Claude' },
    { label: 'Gemini', value: 'Gemini' },
  ];

  // Open the action sheet
  const openModelSelector = () => {
    if (actionSheetRef.current) {
      actionSheetRef.current.show();
    }
  };

  // Handle model selection
  const handleModelSelect = (model: string) => {
    setSelectedModel(model);
    void setPrivateChatUiModelLabel(model);
    if (actionSheetRef.current) {
      actionSheetRef.current.hide();
    }
  };

  const colors = useThemeColors();
  return (
    <>
      <Pressable
        className="flex-row rounded-full border border-white/30 bg-white/15 py-1 pl-3 pr-2"
        onPress={openModelSelector}>
        <ThemedText className="mr-1 text-primary">{selectedModel}</ThemedText>
        <Icon name="ChevronDown" size={16} className="opacity-50" color={colors.text} />
      </Pressable>

      {/* ActionSheet for model selection */}
      <ActionSheetThemed ref={actionSheetRef}>
        <View className="px-10 py-10">
          <View className="mb-4">
            <ThemedText className="mb-2 text-xl font-semibold">Select AI Model</ThemedText>
            <ThemedText className="text-subtext">Choose the AI model to chat with</ThemedText>
          </View>

          {modelOptions.map((option) => (
            <Pressable
              key={option.value}
              onPress={() => handleModelSelect(option.value)}
              className={`mb-2 flex-row items-center justify-between rounded-2xl p-3 ${selectedModel === option.value ? 'bg-background' : ''}`}>
              <ThemedText className="text-base">{option.label}</ThemedText>
              {selectedModel === option.value && <Icon name="Check" size={20} />}
            </Pressable>
          ))}

          <Pressable
            onPress={() => actionSheetRef.current?.hide()}
            className="mt-4 items-center rounded-full border border-white/30 bg-white/15 py-3">
            <ThemedText className="font-semibold text-primary">Cancel</ThemedText>
          </Pressable>
        </View>
      </ActionSheetThemed>
    </>
  );
};
