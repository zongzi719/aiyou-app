import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AnimatedView from '@/components/AnimatedView';
import DecisionCoachCard, { type DecisionCoachCardModel } from '@/components/DecisionCoachCard';
import Icon from '@/components/Icon';
import ThemedText from '@/components/ThemedText';
import { DECISION_COACHES, type DecisionCoachProfile } from '@/lib/decisionChatApi';
import { shadowPresets } from '@/utils/useShadow';

export type DecisionTurn = {
  id: string;
  userText: string;
  coachCards: DecisionCoachCardModel[];
  createdAt: Date;
};

type Props = {
  turns: DecisionTurn[];
  coachEnabledMap: Record<string, boolean>;
  onToggleCoach: (coachId: string, enabled: boolean) => void;
  isRunning?: boolean;
};

function UserBubble({ text }: { text: string }) {
  return (
    <AnimatedView animation="slideInBottom" duration={260}>
      <View
        style={shadowPresets.small}
        className="max-w-[85%] self-end rounded-3xl bg-secondary p-global">
        <ThemedText className="text-base">{text}</ThemedText>
      </View>
    </AnimatedView>
  );
}

const AVATAR_SIZE = 36;
/** 后圆被前圆水平盖住约 40% 圆宽 → 相邻中心距 = 0.6 * 直径 */
const OVERLAP_FRACTION = 0.4;
const MARGIN_LAP = -AVATAR_SIZE * OVERLAP_FRACTION;
const MAX_STACK = 3;
const AVATAR_COACH_BG = '#3A3A3C';
const AVATAR_ADD_BG = '#000000';

function coachInitialsForStack(name: string): string {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

function resolveStackCoaches(ids: string[]): DecisionCoachProfile[] {
  const byId = new Map(DECISION_COACHES.map((c) => [c.id, c] as const));
  const out: DecisionCoachProfile[] = [];
  for (const id of ids) {
    if (out.length >= MAX_STACK) break;
    const c = byId.get(id);
    if (c) out.push(c);
  }
  return out;
}

export function FloatingCoachStack({
  onOpenCoachPicker,
  selectedCoachIds,
}: {
  onOpenCoachPicker: () => void;
  selectedCoachIds: string[];
}) {
  const stack = useMemo(() => resolveStackCoaches(selectedCoachIds), [selectedCoachIds]);
  const facepileCount = 1 + stack.length;

  return (
    <Pressable
      onPress={onOpenCoachPicker}
      className="items-center justify-center"
      style={{ paddingVertical: 4, minHeight: 44, overflow: 'visible' }}
      accessibilityRole="button"
      accessibilityLabel={stack.length > 0 ? `已选 ${stack.length} 位教练，点击修改` : '选择教练'}>
      <View className="flex-row items-center" style={{ overflow: 'visible' }}>
        {/* 左侧 + 实心底在最上层，其后教练圆依次 40% 被遮挡，全部实色避免透叠 */}
        <View
          className="items-center justify-center overflow-hidden rounded-full"
          style={{
            width: AVATAR_SIZE,
            height: AVATAR_SIZE,
            backgroundColor: AVATAR_ADD_BG,
            zIndex: facepileCount,
            elevation: Platform.OS === 'android' ? facepileCount : undefined,
          }}>
          <Icon name="Plus" size={19} color="#FFFFFF" strokeWidth={2.2} />
        </View>
        {stack.map((c, i) => (
          <View
            key={c.id}
            className="items-center justify-center overflow-hidden rounded-full"
            style={{
              width: AVATAR_SIZE,
              height: AVATAR_SIZE,
              marginLeft: MARGIN_LAP,
              zIndex: facepileCount - 1 - i,
              elevation: Platform.OS === 'android' ? facepileCount - 1 - i : undefined,
              backgroundColor: AVATAR_COACH_BG,
            }}>
            <ThemedText
              className="text-center font-semibold text-white"
              numberOfLines={1}
              style={{ fontSize: 10.5, lineHeight: 14, letterSpacing: 0.2 }}>
              {coachInitialsForStack(c.name)}
            </ThemedText>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

export default function DecisionConversation({
  turns,
  coachEnabledMap,
  onToggleCoach,
  isRunning,
}: Props) {
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 120);
    return () => clearTimeout(timer);
  }, [turns.length, isRunning]);

  const handleScroll = (event: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    setShowScrollButton(distanceFromBottom > 120);
  };

  const scrollToBottom = () => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  };

  const renderedTurns = useMemo(() => turns, [turns]);

  return (
    <View className="relative flex-1">
      <ScrollView
        ref={scrollViewRef}
        className="flex-1 px-6"
        contentContainerStyle={{
          paddingBottom: insets.bottom + 170,
          paddingTop: insets.top + 80,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onScroll={handleScroll}
        scrollEventThrottle={16}>
        {renderedTurns.map((turn) => (
          <View key={turn.id} className="mb-8 gap-4">
            <UserBubble text={turn.userText} />
            <View className="gap-4">
              {turn.coachCards.map((c, idx) => (
                <DecisionCoachCard
                  key={`${turn.id}-${c.coachId}`}
                  model={{
                    ...c,
                    enabled: coachEnabledMap[c.coachId] !== false,
                  }}
                  onToggleEnabled={(next) => onToggleCoach(c.coachId, next)}
                  defaultExpanded={idx === 0}
                />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      {showScrollButton && (
        <View
          style={{ bottom: insets.bottom + 150 }}
          className="absolute left-0 w-full items-center justify-center">
          <AnimatedView animation="scaleIn" duration={180}>
            <Pressable
              onPress={scrollToBottom}
              className="h-10 w-10 items-center justify-center rounded-full border border-border bg-secondary"
              style={shadowPresets.small}
              accessibilityRole="button"
              accessibilityLabel="回到底部">
              <Icon name="ArrowDown" size={18} />
            </Pressable>
          </AnimatedView>
        </View>
      )}
    </View>
  );
}
