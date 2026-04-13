import React from 'react';
import { View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ThemedText from '@/components/ThemedText';
import Icon from '@/components/Icon';

interface DevHeaderProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
}

export default function DevHeader({ title, showBack = true, onBack }: DevHeaderProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      className="border-b border-neutral-800 bg-neutral-950 px-4 pb-3 flex-row items-center gap-3"
      style={{ paddingTop: Math.max(insets.top, 12) }}
    >
      {showBack ? (
        <Pressable
          onPress={onBack ?? (() => router.back())}
          hitSlop={12}
          className="h-9 w-9 items-center justify-center rounded-md bg-neutral-900"
        >
          <Icon name="ArrowLeft" size={22} className="text-neutral-200" />
        </Pressable>
      ) : (
        <View className="w-9" />
      )}
      <ThemedText className="text-base font-bold text-neutral-100 flex-1">{title}</ThemedText>
    </View>
  );
}
