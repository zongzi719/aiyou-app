import React from 'react';
import { Pressable, Switch, View } from 'react-native';

import Icon from '@/components/Icon';
import ShimmerText from '@/components/ShimmerText';
import ThemedText from '@/components/ThemedText';
import { shadowPresets } from '@/utils/useShadow';

export type DecisionCoachCardModel = {
  coachId: string;
  coachName: string;
  coachRole: string;
  enabled: boolean;
  loading: boolean;
  decisionAdvice: string;
  keyQuestions: string;
  riskWarnings: string;
  rawText?: string;
  errorText?: string;
};

type Props = {
  model: DecisionCoachCardModel;
  onToggleEnabled: (next: boolean) => void;
};

function CoachAvatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');

  return (
    <View className="h-11 w-11 items-center justify-center rounded-full bg-white/10">
      <ThemedText className="text-[15px] font-semibold text-white/90">
        {initials || 'AI'}
      </ThemedText>
    </View>
  );
}

function SectionBlock({
  title,
  icon,
  tone,
  text,
}: {
  title: string;
  icon: 'Sparkles' | 'HelpCircle' | 'ShieldAlert';
  tone: 'purple' | 'cyan' | 'orange';
  text: string;
}) {
  const bg =
    tone === 'purple' ? 'bg-[#5B21B6]/20' : tone === 'cyan' ? 'bg-[#0EA5E9]/16' : 'bg-[#F59E0B]/16';
  const border =
    tone === 'purple'
      ? 'border-[#8B5CF6]/25'
      : tone === 'cyan'
        ? 'border-[#38BDF8]/25'
        : 'border-[#FBBF24]/25';
  const titleColor =
    tone === 'purple' ? 'text-[#C4B5FD]' : tone === 'cyan' ? 'text-[#7DD3FC]' : 'text-[#FCD34D]';

  return (
    <View className={`rounded-2xl border ${bg} ${border} px-4 py-3`}>
      <View className="flex-row items-center gap-2">
        <Icon name={icon} size={16} color="rgba(255,255,255,0.9)" />
        <ThemedText className={`text-[14px] font-semibold ${titleColor}`}>{title}</ThemedText>
      </View>
      <ThemedText className="text-white/85 mt-2 text-[13px] leading-[19px]">
        {text.trim()}
      </ThemedText>
    </View>
  );
}

export default function DecisionCoachCard({ model, onToggleEnabled }: Props) {
  const dimmed = !model.enabled;

  return (
    <View
      style={shadowPresets.card}
      className={`bg-[#2A2C32]/85 rounded-3xl border border-white/10 px-5 py-4 ${dimmed ? 'opacity-45' : 'opacity-100'}`}>
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-3">
          <CoachAvatar name={model.coachName} />
          <View className="min-w-0">
            <ThemedText className="text-[15px] font-semibold text-white" numberOfLines={1}>
              {model.coachName}
            </ThemedText>
            <ThemedText className="text-white/55 mt-0.5 text-[12px]" numberOfLines={1}>
              {model.coachRole}
            </ThemedText>
          </View>
        </View>

        <Switch
          value={model.enabled}
          onValueChange={onToggleEnabled}
          trackColor={{ false: 'rgba(255,255,255,0.16)', true: 'rgba(255,208,65,0.45)' }}
          thumbColor={model.enabled ? '#FFD041' : 'rgba(255,255,255,0.5)'}
        />
      </View>

      <View className="mt-4 gap-3">
        {model.loading ? (
          <View className="gap-3">
            <View className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <ShimmerText text="正在分析…" className="text-white/70" />
            </View>
            <View className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <ShimmerText text="正在生成关键问题…" className="text-white/70" />
            </View>
            <View className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <ShimmerText text="正在扫描风险…" className="text-white/70" />
            </View>
          </View>
        ) : model.errorText ? (
          <View className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <View className="flex-row items-center gap-2">
              <Icon name="TriangleAlert" size={16} color="rgba(255,255,255,0.85)" />
              <ThemedText className="text-white/85 text-[14px] font-semibold">出错了</ThemedText>
            </View>
            <ThemedText className="mt-2 text-[13px] leading-[19px] text-white/70">
              {model.errorText}
            </ThemedText>
          </View>
        ) : (
          <>
            {model.decisionAdvice.trim() ? (
              <SectionBlock
                title="决策建议"
                icon="Sparkles"
                tone="purple"
                text={model.decisionAdvice}
              />
            ) : null}
            {model.keyQuestions.trim() ? (
              <SectionBlock
                title="关键问题"
                icon="HelpCircle"
                tone="cyan"
                text={model.keyQuestions}
              />
            ) : null}
            {model.riskWarnings.trim() ? (
              <SectionBlock
                title="风险提示"
                icon="ShieldAlert"
                tone="orange"
                text={model.riskWarnings}
              />
            ) : null}
          </>
        )}
      </View>

      {model.rawText && !model.loading && !model.errorText ? (
        <Pressable
          onPress={() => undefined}
          className="mt-3 flex-row items-center gap-2 self-start"
          accessibilityRole="button"
          accessibilityLabel="查看原文">
          <Icon name="AlignLeft" size={14} color="rgba(255,255,255,0.6)" />
          <ThemedText className="text-white/55 text-[12px]">原文</ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}
