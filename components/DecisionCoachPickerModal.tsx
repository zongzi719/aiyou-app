import React, { useMemo } from 'react';
import { Modal, Pressable, View } from 'react-native';

import Icon from '@/components/Icon';
import ThemedText from '@/components/ThemedText';
import { shadowPresets } from '@/utils/useShadow';

export type DecisionCoachProfile = {
  id: string;
  name: string;
  roleLabel: string;
  tagline: string;
};

type Props = {
  visible: boolean;
  coaches: DecisionCoachProfile[];
  selectedCoachIds: string[];
  onChangeSelectedCoachIds: (next: string[]) => void;
  onClose: () => void;
};

function CoachAvatar({ name, selected }: { name: string; selected: boolean }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');

  return (
    <View
      className={`h-12 w-12 items-center justify-center rounded-full ${
        selected ? 'bg-[#FFD041]/20' : 'bg-white/10'
      }`}>
      <ThemedText
        className={`text-base font-semibold ${selected ? 'text-[#FFD041]' : 'text-white/90'}`}>
        {initials || 'AI'}
      </ThemedText>
    </View>
  );
}

export default function DecisionCoachPickerModal({
  visible,
  coaches,
  selectedCoachIds,
  onChangeSelectedCoachIds,
  onClose,
}: Props) {
  const selectedSet = useMemo(() => new Set(selectedCoachIds), [selectedCoachIds]);
  const selectedCount = selectedCoachIds.length;

  const toggleCoach = (coachId: string) => {
    const next = new Set(selectedSet);
    if (next.has(coachId)) {
      next.delete(coachId);
      // 至少保留 1 个
      if (next.size === 0) {
        next.add(coachId);
      }
      onChangeSelectedCoachIds(Array.from(next));
      return;
    }
    if (next.size >= 3) return;
    next.add(coachId);
    onChangeSelectedCoachIds(Array.from(next));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="bg-black/55 flex-1" onPress={onClose}>
        <Pressable
          className="absolute bottom-0 left-0 right-0 rounded-t-[28px] bg-[#1F2127] px-5 pb-8 pt-5"
          onPress={() => undefined}
          style={shadowPresets.card}>
          <View className="flex-row items-center justify-between">
            <View className="min-w-0">
              <ThemedText className="text-[18px] font-semibold text-white">选择教练</ThemedText>
              <ThemedText className="mt-1 text-[14px] text-[#6A7282]">
                最多选择三个教练 ({selectedCount}/3)
              </ThemedText>
            </View>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="关闭">
              <Icon name="X" size={20} color="rgba(255,255,255,0.9)" />
            </Pressable>
          </View>

          <View className="mt-4 gap-3">
            {coaches.map((c) => {
              const selected = selectedSet.has(c.id);
              return (
                <Pressable
                  key={c.id}
                  onPress={() => toggleCoach(c.id)}
                  className={`rounded-2xl px-4 py-3 ${
                    selected ? 'bg-[#2B3239]' : 'bg-white/4 border border-white/10'
                  }`}
                  accessibilityRole="button"
                  accessibilityLabel={`选择教练 ${c.name}`}>
                  <View className="flex-row items-center gap-3">
                    <CoachAvatar name={c.name} selected={selected} />
                    <View className="min-w-0 flex-1">
                      <View className="flex-row items-center justify-between">
                        <ThemedText
                          className="text-[15px] font-semibold text-white"
                          numberOfLines={1}>
                          {c.name}
                        </ThemedText>
                        <ThemedText className="ml-2 text-[14px] text-white/60">
                          {c.roleLabel}
                        </ThemedText>
                      </View>
                      <ThemedText
                        className="mt-1 text-[14px] leading-[20px] text-[#A6A6A6]"
                        numberOfLines={2}>
                        {c.tagline}
                      </ThemedText>
                    </View>

                    <View className="bg-white/8 h-6 w-6 items-center justify-center rounded-full">
                      {selected ? (
                        <Icon name="Check" size={16} color="#FFD041" />
                      ) : (
                        <View className="border-white/18 h-3.5 w-3.5 rounded-full border" />
                      )}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={() => undefined}
            className="absolute bottom-6 right-6 h-11 w-11 items-center justify-center rounded-full border border-white bg-[#1A1A1A]"
            accessibilityRole="button"
            accessibilityLabel="新增教练">
            <Icon name="Plus" size={22} color="#FFFFFF" strokeWidth={2} />
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
