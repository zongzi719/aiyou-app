import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import ThemedText from './ThemedText';
import useThemeColors from '@/app/contexts/ThemeColors';

interface PageLoaderProps {
    text?: string;
}

export default function PageLoader({ text }: PageLoaderProps) {
    const colors = useThemeColors();

    return (
        <View className="flex-1 items-center justify-center bg-background">
            <ActivityIndicator size="large" color={colors.highlight} />
            {text && (
                <ThemedText className="mt-4 text-subtext">
                    {text}
                </ThemedText>
            )}
        </View>
    );
}