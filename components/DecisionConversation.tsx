import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AnimatedView from '@/components/AnimatedView';
import DecisionCoachCard, { type DecisionCoachCardModel } from '@/components/DecisionCoachCard';
import Icon from '@/components/Icon';
import ThemedText from '@/components/ThemedText';
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
  onOpenCoachPicker: () => void;
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

function FloatingCoachStack({ onOpenCoachPicker }: { onOpenCoachPicker: () => void }) {
  return (
    <View className="items-center gap-3">
      <Pressable
        onPress={onOpenCoachPicker}
        className="h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/10"
        accessibilityRole="button"
        accessibilityLabel="选择教练">
        <Icon name="UserRound" size={18} color="rgba(255,255,255,0.85)" />
      </Pressable>
      <Pressable
        onPress={() => undefined}
        className="bg-black/35 border-white/12 h-12 w-12 items-center justify-center rounded-full border"
        accessibilityRole="button"
        accessibilityLabel="添加教练">
        <Icon name="Plus" size={22} color="rgba(255,255,255,0.92)" />
      </Pressable>
    </View>
  );
}

export default function DecisionConversation({
  turns,
  coachEnabledMap,
  onToggleCoach,
  isRunning,
  onOpenCoachPicker,
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

      <View style={{ right: 18, bottom: insets.bottom + 105 }} className="absolute">
        <FloatingCoachStack onOpenCoachPicker={onOpenCoachPicker} />
      </View>
    </View>
  );
}
