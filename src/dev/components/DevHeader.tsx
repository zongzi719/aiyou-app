import { router } from 'expo-router';
import React from 'react';
import { View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon from '@/components/Icon';
import ThemedText from '@/components/ThemedText';

interface DevHeaderProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
}

export default function DevHeader({ title, showBack = true, onBack }: DevHeaderProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      className="flex-row items-center gap-3 border-b border-neutral-800 bg-neutral-950 px-4 pb-3"
      style={{ paddingTop: Math.max(insets.top, 12) }}>
      {showBack ? (
        <Pressable
          onPress={onBack ?? (() => router.back())}
          hitSlop={12}
          className="h-9 w-9 items-center justify-center rounded-md bg-neutral-900">
          <Icon name="ArrowLeft" size={22} className="text-neutral-200" />
        </Pressable>
      ) : (
        <View className="w-9" />
      )}
      <ThemedText className="flex-1 text-base font-bold text-neutral-100">{title}</ThemedText>
    </View>
  );
}
