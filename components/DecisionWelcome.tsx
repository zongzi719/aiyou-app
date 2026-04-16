import React from 'react';
import { Pressable, View } from 'react-native';

import Icon from '@/components/Icon';
import ThemedText from '@/components/ThemedText';
import type { DecisionCoachProfile } from '@/lib/decisionChatApi';
import { shadowPresets } from '@/utils/useShadow';

type Props = {
  defaultCoach: DecisionCoachProfile;
  onStart: () => void;
  bottomOffset?: number;
  reserveInputSpace?: boolean;
};

function CoachAvatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');

  return (
    <View className="bg-white/12 h-12 w-12 items-center justify-center rounded-full">
      <ThemedText className="text-base font-semibold text-white/90">{initials || 'AI'}</ThemedText>
    </View>
  );
}

export default function DecisionWelcome({
  defaultCoach,
  onStart,
  bottomOffset = 0,
  reserveInputSpace = true,
}: Props) {
  const bottomPadding = (reserveInputSpace ? 140 : 64) + bottomOffset;

  return (
    <View className="flex-1">
      <View className="absolute inset-0">
        <View
          className="absolute left-20 top-40 h-[104px] w-[135px] rounded-[82.5px] bg-[#26556B]"
          style={{ opacity: 0.75 }}
        />
        <View
          className="absolute left-64 top-56 h-[52px] w-[79px] rounded-[37.5px] bg-[#03503A]"
          style={{ opacity: 0.65 }}
        />
        <View
          className="absolute left-40 top-64 h-[56px] w-[106px] rounded-[105.5px] bg-[#003380]"
          style={{ opacity: 0.65 }}
        />
      </View>

      <View className="flex-1 px-6 pt-28" style={{ paddingBottom: bottomPadding }}>
        <View className="items-center" style={{ transform: [{ translateY: -50 }] }}>
          <ThemedText className="text-[24px] font-semibold leading-[30px] text-white">
            欢迎来到决策模式
          </ThemedText>
          <ThemedText className="mt-3 max-w-[260px] text-center text-[16px] leading-[22px] text-white/85">
            在此模式下，你的商业问题将由多位教练共同分析，帮助您
          </ThemedText>

          <View className="mt-10 w-full max-w-md flex-row justify-center gap-10">
            <View className="gap-6">
              <FeatureItem text="模拟老板思维" />
              <FeatureItem text="给出决策建议" />
            </View>
            <View className="gap-6">
              <FeatureItem text="追问关键问题" />
              <FeatureItem text="纠正潜在决策错误" />
            </View>
          </View>
        </View>

        <View className="flex-1" />

        <View className="items-center">
          <View className="w-full max-w-md">
            <View className="relative">
              <View
                className="absolute left-2 top-0 h-[189px] w-full rounded-[20px] bg-[#131A20]"
                style={{ transform: [{ rotate: '8.81deg' }], opacity: 0.65 }}
              />
              <View
                className="absolute left-1 top-2 h-[189px] w-full rounded-[20px] bg-[#181F26]"
                style={{ transform: [{ rotate: '3.8deg' }], opacity: 0.85 }}
              />

              <View
                style={shadowPresets.card}
                className="mt-6 rounded-[20px] bg-[#2B3239] px-4 py-4">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-3">
                    <CoachAvatar name={defaultCoach.name} />
                    <View className="min-w-0">
                      <View className="flex-row items-center gap-2">
                        <ThemedText
                          className="text-[14px] font-semibold text-white"
                          numberOfLines={1}>
                          {defaultCoach.name}
                        </ThemedText>
                        <ThemedText className="text-[12px] text-[#A6A6A6]" numberOfLines={1}>
                          {defaultCoach.roleLabel || '默认教练'}
                        </ThemedText>
                      </View>
                      <ThemedText className="mt-1 text-[10px] text-[#A6A6A6]" numberOfLines={2}>
                        {defaultCoach.tagline || '拥有多模型推理能力'}
                      </ThemedText>
                    </View>
                  </View>

                  <View className="h-3.5 w-3.5 rounded-full bg-[#FFC800]" />
                </View>

                <View className="mt-3 flex-row items-center gap-2">
                  <Icon name="Eye" size={16} color="rgba(255,255,255,0.85)" />
                  <ThemedText className="text-[12px] text-white/90">我擅长</ThemedText>
                </View>
                <ThemedText className="mt-2 text-[14px] leading-[20px] text-white/90">
                  从战略角度来看，进军 AI 生产力市场前景可期，但关键在于差异化。作为一名
                  CEO，我会首先评估你的产品相较于现有工具，是否能够创造出独特的价值。
                </ThemedText>
              </View>
            </View>
          </View>

          <Pressable
            onPress={onStart}
            className="mt-8 h-10 w-[219px] items-center justify-center rounded-[26px] bg-white"
            accessibilityRole="button"
            accessibilityLabel="开始对话">
            <ThemedText style={{ color: '#111111' }} className="text-[12px] font-semibold">
              开始对话
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function FeatureItem({ text }: { text: string }) {
  return (
    <View className="flex-row items-center gap-2">
      <Icon name="CircleCheck" size={16} color="rgba(255,255,255,0.95)" />
      <ThemedText className="text-[12px] text-white">{text}</ThemedText>
    </View>
  );
}
