import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

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
  /** 前卡不透明度收束：与后层牌 DECK_OPAC 对齐，从边缘亮度收到 1，减少「后层半透变前层实色」的跳变 */
  const topCardPunch = useRef(new Animated.Value(1)).current;
  const swipeLockedRef = useRef(false);
  const exitAnimCommittedRef = useRef(false);
  /** 切牌后等 React 已提交「新前牌/旧牌隐藏」再设 swipe=0。否则在仍是 A 为前牌时设 0，A 会弹回中心闪一帧 */
  const pendingSwitchAfterIndexRef = useRef<{ punchIn: boolean } | null>(null);
  const gestureDirectionRef = useRef<'left' | 'right' | null>(null);
  const unlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 与 onPanResponder 闭包同步，避免过期的 cardWidth 导致 off-screen 位错和动画异常 */
  const cardWidthRef = useRef(cardWidth);
  cardWidthRef.current = cardWidth;
  const coachCountRef = useRef(coachList.length);
  coachCountRef.current = coachList.length;
  const [dragDirection, setDragDirection] = useState<'left' | 'right'>('left');
  const deckN = coachList.length;
  /** 露出的「后一张」在圆环上相对于 active 的位置：左划看下一教练 / 右划看上一教练 */
  const backDeckIndex = useMemo(() => {
    if (deckN <= 1) return 0;
    return dragDirection === 'right'
      ? (activeCoachIndex - 1 + deckN) % deckN
      : (activeCoachIndex + 1) % deckN;
  }, [activeCoachIndex, deckN, dragDirection]);

  /** 与 nextCardOpacity 的 outputRange 三档对齐：边缘略亮、叠在中间略暗，整体贴近实色，减轻「后→前」一帧跳变 */
  const DECK_OPAC_EDGE = 0.93;
  const DECK_OPAC_MID = 0.9;
  /** 后牌固定微缩。若用 swipeX 做 scale 插值，划动时后牌会「呼吸」；切页瞬间又与顶牌 scale(1) 对不齐，易被看成尺寸在闪。 */
  const DECK_BACK_STATIC_SCALE = 0.99;
  /** 固定外框，避免不同教练「我擅长」文案行数/长度导致后牌与切页后前牌 min 高度变化 */
  const COACH_CARD_OUTER_MIN_HEIGHT = 204;
  /** 前卡底面：切页时 topCardPunch 只动底面。整块卡 opacity 会让文案随 0.93→1 再闪一帧。 */
  const COACH_CARD_PLATE_BGCOLOR = '#2B3239';

  const runTopCardPunchIn = () => {
    topCardPunch.setValue(DECK_OPAC_EDGE);
    Animated.timing(topCardPunch, {
      toValue: 1,
      duration: 160,
      useNativeDriver: false,
      easing: Easing.out(Easing.cubic),
    }).start();
  };

  const commitCoachSwitch = (direction: 'left' | 'right', opts?: { punchIn: boolean }) => {
    if (coachList.length <= 1) return;
    pendingSwitchAfterIndexRef.current = { punchIn: opts?.punchIn !== false };
    setActiveCoachIndex((prev) => {
      if (direction === 'left') return (prev + 1) % coachList.length;
      return (prev - 1 + coachList.length) % coachList.length;
    });
  };

  useLayoutEffect(() => {
    const pending = pendingSwitchAfterIndexRef.current;
    if (pending == null) return;
    pendingSwitchAfterIndexRef.current = null;
    swipeX.setValue(0);
    swipeY.setValue(0);
    if (pending.punchIn) {
      runTopCardPunchIn();
    } else {
      topCardPunch.setValue(1);
    }
    swipeLockedRef.current = false;
  }, [activeCoachIndex]);

  const scheduleUnlockFallback = () => {
    if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
    unlockTimerRef.current = setTimeout(() => {
      swipeLockedRef.current = false;
    }, 380);
  };

  const animateCardBack = () => {
    // 必须与 onPanResponderMove 一致使用 JS 驱动：同一 swipeX / swipeY 切到 native 驱动会竞态、闪屏或双次 onComplete
    Animated.parallel([
      Animated.spring(swipeX, {
        toValue: 0,
        useNativeDriver: false,
        tension: 80,
        friction: 7,
      }),
      Animated.spring(swipeY, {
        toValue: 0,
        useNativeDriver: false,
        tension: 80,
        friction: 8,
      }),
    ]).start((result) => {
      if (result && result.finished === false) {
        swipeLockedRef.current = false;
        return;
      }
      swipeLockedRef.current = false;
      setDragDirection('left');
    });
    scheduleUnlockFallback();
  };

  const panResponder = useRef(
    PanResponder.create({
      onPanResponderGrant: () => {
        topCardPunch.stopAnimation();
        topCardPunch.setValue(1);
        gestureDirectionRef.current = null;
      },
      onMoveShouldSetPanResponder: (_evt, gesture) =>
        coachCountRef.current > 1 && !swipeLockedRef.current && Math.abs(gesture.dx) > 5,
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
        if (coachCountRef.current <= 1) {
          animateCardBack();
          return;
        }
        swipeLockedRef.current = true;
        const cw = cardWidthRef.current;
        const thr = Math.max(70, cw * 0.2);
        const absDx = Math.abs(gesture.dx);
        if (absDx < thr) {
          animateCardBack();
          return;
        }
        const toRight = gesture.dx > 0;
        const targetX = toRight ? cw * 1.35 : -cw * 1.35;
        const targetY = gesture.dy * 0.2;
        exitAnimCommittedRef.current = false;
        Animated.parallel([
          Animated.timing(swipeX, {
            toValue: targetX,
            duration: 220,
            useNativeDriver: false,
          }),
          Animated.timing(swipeY, {
            toValue: targetY,
            duration: 220,
            useNativeDriver: false,
          }),
        ]).start((result) => {
          if (result && result.finished === false) {
            swipeLockedRef.current = false;
            return;
          }
          if (exitAnimCommittedRef.current) return;
          exitAnimCommittedRef.current = true;
          commitCoachSwitch(toRight ? 'right' : 'left', { punchIn: true });
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
    outputRange: [0.99, 1, 0.99],
    extrapolate: 'clamp',
  });
  const nextCardOpacity = swipeX.interpolate({
    inputRange: [-cardWidth, 0, cardWidth],
    outputRange: [DECK_OPAC_EDGE, DECK_OPAC_MID, DECK_OPAC_EDGE],
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
              {deckN > 0
                ? coachList.map((coach, idx) => {
                    const isFront = activeCoachIndex === idx;
                    const isBack = deckN > 1 && backDeckIndex === idx;
                    const isHidden = deckN > 1 && !isFront && !isBack;

                    if (isHidden) {
                      return (
                        <View
                          key={coach.id}
                          accessible={false}
                          importantForAccessibility="no-hide-descendants"
                          className="overflow-hidden rounded-[20px] bg-[#2B3239] px-4 py-4"
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: -4000,
                            zIndex: 0,
                            width: cardWidth,
                            minHeight: COACH_CARD_OUTER_MIN_HEIGHT,
                            opacity: 0,
                            pointerEvents: 'none',
                          }}>
                          <CoachCardContent coach={coach} />
                        </View>
                      );
                    }

                    if (isBack) {
                      return (
                        <Animated.View
                          key={coach.id}
                          pointerEvents="none"
                          style={[
                            shadowPresets.card,
                            {
                              position: 'absolute',
                              top: 24,
                              left: 0,
                              zIndex: 5,
                              width: cardWidth,
                              minHeight: COACH_CARD_OUTER_MIN_HEIGHT,
                              backgroundColor: 'transparent',
                              transform: [{ scale: DECK_BACK_STATIC_SCALE }],
                            },
                          ]}
                          className="overflow-hidden rounded-[20px]">
                          <Animated.View
                            pointerEvents="none"
                            style={[
                              StyleSheet.absoluteFill,
                              {
                                borderRadius: 20,
                                backgroundColor: COACH_CARD_PLATE_BGCOLOR,
                                opacity: nextCardOpacity,
                              },
                            ]}
                          />
                          <View
                            className="z-20 justify-start px-4 py-4"
                            style={{
                              minHeight: COACH_CARD_OUTER_MIN_HEIGHT,
                              backgroundColor: 'transparent',
                            }}
                            pointerEvents="none">
                            <CoachCardContent coach={coach} />
                          </View>
                        </Animated.View>
                      );
                    }

                    return (
                      <Animated.View
                        key={coach.id}
                        {...panResponder.panHandlers}
                        style={[
                          shadowPresets.card,
                          {
                            position: 'relative',
                            width: cardWidth,
                            minHeight: COACH_CARD_OUTER_MIN_HEIGHT,
                            marginTop: 24,
                            zIndex: 20,
                            backgroundColor: 'transparent',
                            transform: [
                              { translateX: swipeX },
                              { translateY: swipeY },
                              { rotate: topCardRotate },
                              { scale: topCardScale },
                            ],
                          },
                        ]}
                        className="overflow-hidden rounded-[20px]">
                        <Animated.View
                          pointerEvents="none"
                          style={[
                            StyleSheet.absoluteFill,
                            {
                              borderRadius: 20,
                              backgroundColor: COACH_CARD_PLATE_BGCOLOR,
                              opacity: topCardPunch,
                            },
                          ]}
                        />
                        <View
                          className="z-20 justify-start px-4 py-4"
                          style={{
                            minHeight: COACH_CARD_OUTER_MIN_HEIGHT,
                            backgroundColor: 'transparent',
                          }}
                          pointerEvents="box-none">
                          <CoachCardContent coach={coach} />
                        </View>
                      </Animated.View>
                    );
                  })
                : null}
            </View>
          </View>
          {coachList.length > 1 ? (
            <View className="mt-3 flex-row items-center justify-center gap-2">
              {coachList.map((coach, idx) => (
                <View
                  key={coach.id}
                  className={`h-1.5 rounded-full ${idx === activeCoachIndex ? 'w-5 bg-[#FFD041]' : 'bg-white/35 w-1.5'}`}
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
    <View collapsable={false}>
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
