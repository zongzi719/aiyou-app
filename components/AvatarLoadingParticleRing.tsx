import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

type Props = {
  size: number;
  children: React.ReactNode;
};

/** 生成数字形象加载态：双层粒子环慢速对转，中间放文案 */
export default function AvatarLoadingParticleRing({ size, children }: Props) {
  const rotationOuter = useSharedValue(0);
  const rotationInner = useSharedValue(0);

  useEffect(() => {
    rotationOuter.value = withRepeat(
      withTiming(360, { duration: 48_000, easing: Easing.linear }),
      -1,
      false
    );
    rotationInner.value = withRepeat(
      withTiming(-360, { duration: 64_000, easing: Easing.linear }),
      -1,
      false
    );
    // shared values stable — run once on mount
  }, []);

  const outerSpin = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotationOuter.value}deg` }],
  }));

  const innerSpin = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotationInner.value}deg` }],
  }));

  const rOuter = size / 2 - 4;
  const rInner = size / 2 - 18;
  const outerDots = useMemo(
    () =>
      Array.from({ length: 56 }, (_, i) => ({
        i,
        angle: (2 * Math.PI * i) / 56,
        big: i % 5 === 0,
        teal: i % 3 === 0,
      })),
    []
  );
  const innerDots = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        i,
        angle: (2 * Math.PI * i) / 36 + 0.12,
        big: i % 7 === 0,
        teal: i % 4 === 1,
      })),
    []
  );

  const cx = size / 2;

  const renderDot = (
    angle: number,
    r: number,
    big: boolean,
    teal: boolean,
    key: string
  ) => {
    const rad = angle - Math.PI / 2;
    const w = big ? 3.5 : 2.5;
    const x = cx + r * Math.cos(rad) - w / 2;
    const y = cx + r * Math.sin(rad) - w / 2;
    const bg = teal ? 'rgba(127,212,204,0.95)' : 'rgba(255,255,255,0.92)';
    return (
      <View
        key={key}
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: w,
          height: w,
          borderRadius: w / 2,
          backgroundColor: bg,
          shadowColor: teal ? '#5FB8AD' : '#FFFFFF',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.55,
          shadowRadius: big ? 3.5 : 2,
        }}
      />
    );
  };

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          {
            alignItems: 'center',
            justifyContent: 'center',
          },
        ]}>
        <View
          style={{
            width: size * 0.92,
            height: size * 0.92,
            borderRadius: size,
            backgroundColor: 'rgba(23, 52, 66, 0.28)',
          }}
        />
      </View>

      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, outerSpin, { width: size, height: size }]}>
        {outerDots.map((d) =>
          renderDot(d.angle, rOuter, d.big, d.teal, `o-${d.i}`)
        )}
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, innerSpin, { width: size, height: size }]}>
        {innerDots.map((d) =>
          renderDot(d.angle, rInner, d.big, d.teal, `i-${d.i}`)
        )}
      </Animated.View>

      <View
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10,
          paddingHorizontal: 22,
          maxWidth: size * 0.72,
        }}>
        {children}
      </View>
    </View>
  );
}
