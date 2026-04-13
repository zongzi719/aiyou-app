import React, { useEffect, useRef, useState } from "react";
import { getPrivateChatUiModelLabel, setPrivateChatUiModelLabel } from "@/lib/privateChatUiModel";
import { Pressable, View } from "react-native";
import ThemedText from "./ThemedText";
import Icon from "./Icon";
import ActionSheetThemed from "./ActionSheetThemed";
import { ActionSheetRef } from "react-native-actions-sheet";
import { useThemeColors } from "@/app/contexts/ThemeColors";

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
        { label: 'Gemini', value: 'Gemini' }
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
                className="pl-3 pr-2 py-1 rounded-full flex-row bg-text border border-neutral-300 bg-secondary border-transparent"
                onPress={openModelSelector}
            >
                <ThemedText className="mr-1 !text-invert">{selectedModel}</ThemedText>
                <Icon name="ChevronDown" size={16} className="opacity-50" color={colors.invert} />
            </Pressable>
            
            {/* ActionSheet for model selection */}
            <ActionSheetThemed ref={actionSheetRef}>
                <View className="px-10 py-10">
                    <View className="mb-4">
                        <ThemedText className="text-xl font-semibold mb-2">Select AI Model</ThemedText>
                        <ThemedText className="text-subtext">Choose the AI model to chat with</ThemedText>
                    </View>
                    
                    {modelOptions.map((option) => (
                        <Pressable 
                            key={option.value}
                            onPress={() => handleModelSelect(option.value)}
                            className={`p-3 mb-2 rounded-2xl flex-row justify-between items-center ${selectedModel === option.value ? 'bg-background' : ''}`}
                        >
                            <ThemedText className="text-base">{option.label}</ThemedText>
                            {selectedModel === option.value && (
                                <Icon name="Check" size={20} />
                            )}
                        </Pressable>
                    ))}
                    
                    <Pressable 
                        onPress={() => actionSheetRef.current?.hide()}
                        className="mt-4 py-3 bg-text rounded-full items-center"
                    >
                        <ThemedText className="font-semibold !text-invert">Cancel</ThemedText>
                    </Pressable>
                </View>
            </ActionSheetThemed>
        </>
    )
}