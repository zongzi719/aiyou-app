import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, useWindowDimensions, View } from 'react-native';

import Icon from '@/components/Icon';
import ThemedText from '@/components/ThemedText';
import type { DecisionCoachProfile } from '@/lib/decisionChatApi';
import { shadowPresets } from '@/utils/useShadow';

type Props = {
  defaultCoach: DecisionCoachProfile;
  coaches?: DecisionCoachProfile[];
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
  coaches,
  onStart,
  bottomOffset = 0,
  reserveInputSpace = true,
}: Props) {
  const bottomPadding = (reserveInputSpace ? 140 : 64) + bottomOffset;
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(360, width - 48);
  const coachList = useMemo(() => {
    if (coaches && coaches.length > 0) return coaches;
    return [defaultCoach];
  }, [coaches, defaultCoach]);
  const [activeCoachIndex, setActiveCoachIndex] = useState(() =>
    Math.max(
      0,
      coachList.findIndex((c) => c.id === defaultCoach.id)
    )
  );
  const swipeX = useRef(new Animated.Value(0)).current;
  const swipeY = useRef(new Animated.Value(0)).current;
  const swipeLockedRef = useRef(false);
  const gestureDirectionRef = useRef<'left' | 'right' | null>(null);
  const unlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dragDirection, setDragDirection] = useState<'left' | 'right'>('left');
  const swipeThreshold = Math.max(70, cardWidth * 0.2);
  const topCoach = coachList[activeCoachIndex];
  const leftCoach = coachList[(activeCoachIndex + 1) % coachList.length];
  const rightCoach = coachList[(activeCoachIndex - 1 + coachList.length) % coachList.length];
  const previewCoach = dragDirection === 'right' ? rightCoach : leftCoach;

  const commitCoachSwitch = (direction: 'left' | 'right') => {
    setActiveCoachIndex((prev) => {
      if (coachList.length <= 1) return prev;
      if (direction === 'left') return (prev + 1) % coachList.length;
      return (prev - 1 + coachList.length) % coachList.length;
    });
    swipeX.setValue(0);
    swipeY.setValue(0);
    swipeLockedRef.current = false;
  };

  const scheduleUnlockFallback = () => {
    if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
    unlockTimerRef.current = setTimeout(() => {
      swipeLockedRef.current = false;
    }, 380);
  };

  const animateCardBack = () => {
    Animated.parallel([
      Animated.spring(swipeX, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 7,
      }),
      Animated.spring(swipeY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 8,
      }),
    ]).start(() => {
      swipeLockedRef.current = false;
      setDragDirection('left');
    });
    scheduleUnlockFallback();
  };

  const panResponder = useRef(
    PanResponder.create({
      onPanResponderGrant: () => {
        gestureDirectionRef.current = null;
      },
      onMoveShouldSetPanResponder: (_evt, gesture) =>
        coachList.length > 1 && !swipeLockedRef.current && Math.abs(gesture.dx) > 5,
      onPanResponderMove: Animated.event([null, { dx: swipeX, dy: swipeY }], {
        useNativeDriver: false,
        listener: (_evt, gesture) => {
          if (gestureDirectionRef.current == null) {
            if (gesture.dx > 6) {
              gestureDirectionRef.current = 'right';
              setDragDirection('right');
            } else if (gesture.dx < -6) {
              gestureDirectionRef.current = 'left';
              setDragDirection('left');
            }
          }
        },
      }),
      onPanResponderRelease: (_evt, gesture) => {
        if (swipeLockedRef.current) return;
        if (coachList.length <= 1) {
          animateCardBack();
          return;
        }
        swipeLockedRef.current = true;
        const absDx = Math.abs(gesture.dx);
        if (absDx < swipeThreshold) {
          animateCardBack();
          return;
        }
        const toRight = gesture.dx > 0;
        const targetX = toRight ? cardWidth * 1.35 : -cardWidth * 1.35;
        const targetY = gesture.dy * 0.2;
        Animated.parallel([
          Animated.timing(swipeX, {
            toValue: targetX,
            duration: 220,
            useNativeDriver: true,
          }),
          Animated.timing(swipeY, {
            toValue: targetY,
            duration: 220,
            useNativeDriver: true,
          }),
        ]).start(() => {
          commitCoachSwitch(toRight ? 'right' : 'left');
          setDragDirection('left');
        });
        scheduleUnlockFallback();
      },
      onPanResponderTerminate: () => {
        if (swipeLockedRef.current) return;
        gestureDirectionRef.current = null;
        animateCardBack();
      },
    })
  ).current;

  const topCardRotate = swipeX.interpolate({
    inputRange: [-cardWidth, 0, cardWidth],
    outputRange: ['-8deg', '0deg', '8deg'],
    extrapolate: 'clamp',
  });
  const topCardScale = swipeX.interpolate({
    inputRange: [-cardWidth, 0, cardWidth],
    outputRange: [0.98, 1, 0.98],
    extrapolate: 'clamp',
  });
  const nextCardScale = swipeX.interpolate({
    inputRange: [-cardWidth, 0, cardWidth],
    outputRange: [0.96, 0.92, 0.96],
    extrapolate: 'clamp',
  });
  const nextCardOpacity = swipeX.interpolate({
    inputRange: [-cardWidth, 0, cardWidth],
    outputRange: [0.75, 0.52, 0.75],
    extrapolate: 'clamp',
  });

  useEffect(() => {
    return () => {
      if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
    };
  }, []);

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
          <ThemedText
            className="mt-3 max-w-[260px] text-center text-[16px] leading-[22px]"
            style={{ color: 'rgba(255,255,255,0.9)' }}>
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
          <View className="w-full items-center">
            <View className="relative">
              <View
                className="absolute top-0 h-[189px] rounded-[20px] bg-[#131A20]"
                style={{
                  left: 8,
                  width: cardWidth,
                  transform: [{ rotate: '6.2deg' }],
                  opacity: 0.62,
                }}
              />
              <View
                className="absolute top-2 h-[189px] rounded-[20px] bg-[#181F26]"
                style={{
                  left: 4,
                  width: cardWidth,
                  transform: [{ rotate: '2.6deg' }],
                  opacity: 0.82,
                }}
              />
              {coachList.length > 1 ? (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    shadowPresets.card,
                    {
                      position: 'absolute',
                      top: 24,
                      width: cardWidth,
                      transform: [{ scale: nextCardScale }],
                      opacity: nextCardOpacity,
                    },
                  ]}
                  className="rounded-[20px] bg-[#2B3239] px-4 py-4">
                  <CoachCardContent coach={previewCoach} />
                </Animated.View>
              ) : null}

              <Animated.View
                {...panResponder.panHandlers}
                style={[
                  shadowPresets.card,
                  {
                    width: cardWidth,
                    marginTop: 24,
                    transform: [
                      { translateX: swipeX },
                      { translateY: swipeY },
                      { rotate: topCardRotate },
                      { scale: topCardScale },
                    ],
                  },
                ]}
                className="rounded-[20px] bg-[#2B3239] px-4 py-4">
                <CoachCardContent coach={topCoach} />
              </Animated.View>
            </View>
          </View>
          {coachList.length > 1 ? (
            <View className="mt-3 flex-row items-center justify-center gap-2">
              {coachList.map((coach, idx) => (
                <View
                  key={coach.id}
                  className={`h-1.5 rounded-full ${idx === activeCoachIndex ? 'w-5 bg-[#FFD041]' : 'w-1.5 bg-white/35'}`}
                />
              ))}
            </View>
          ) : null}

          <Pressable
            onPress={onStart}
            className="mt-8 h-10 w-[219px] items-center justify-center rounded-[26px] border border-white bg-white"
            accessibilityRole="button"
            accessibilityLabel="开始对话">
            <ThemedText className="text-[12px] font-semibold text-[#111]">开始对话</ThemedText>
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

function CoachCardContent({ coach }: { coach: DecisionCoachProfile }) {
  return (
    <View>
      <View className="absolute right-1 top-0 h-3.5 w-3.5 rounded-full bg-[#FFC800]" />
      <View className="flex-row items-center justify-between">
        <View className="min-w-0 flex-row items-center gap-3">
          <CoachAvatar name={coach.name} />
          <View className="min-w-0 flex-1">
            <View className="flex-row items-center gap-2">
              <ThemedText className="text-[14px] font-semibold text-white" numberOfLines={1}>
                {coach.name}
              </ThemedText>
              <ThemedText className="text-[12px] text-white" numberOfLines={1}>
                {coach.roleLabel || '默认教练'}
              </ThemedText>
            </View>
            <ThemedText className="mt-1 text-[10px] text-[#A6A6A6]" numberOfLines={2}>
              {coach.tagline || '拥有多模型推理能力'}
            </ThemedText>
          </View>
        </View>
      </View>

      <View className="mt-3 flex-row items-center gap-2">
        <Icon name="Eye" size={16} color="rgba(255,255,255,0.85)" />
        <ThemedText className="text-[12px] text-white/90">我擅长</ThemedText>
      </View>
      <View className="mt-2 h-[100px]">
        <ThemedText className="text-[14px] leading-[20px] text-white/90" numberOfLines={5}>
          {buildCoachPitch(coach)}
        </ThemedText>
      </View>
    </View>
  );
}

function buildCoachPitch(coach: DecisionCoachProfile): string {
  const tagline = coach.tagline.replace(/\n+/g, '，').trim();
  const role = coach.roleLabel || '教练';
  return `从${role}视角出发，我会重点关注可落地路径与关键风险。${tagline}。`;
}
