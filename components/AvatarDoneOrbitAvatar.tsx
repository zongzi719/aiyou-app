import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect } from 'react';
import { Image, ImageSourcePropType, StyleSheet, View } from 'react-native';
import Svg, { Ellipse, G } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

/** 原一圈 26s，加快 0.5 倍即速度 ×1.5 → 周期 ÷1.5 */
const ORBIT_PERIOD_MS = Math.round(26_000 / 1.5);
/** 行星点闪光脉动（与公转独立） */
const TWINKLE_MS = 900;

const FIGMA_FRAME_W = 197.2;
const FIGMA_FRAME_H = 202.88;
const DEG = Math.PI / 180;

function ellipsePoint(rx: number, ry: number, rotDeg: number, t: number) {
  'worklet';
  const rot = rotDeg * DEG;
  const x0 = rx * Math.cos(t);
  const y0 = ry * Math.sin(t);
  const x = x0 * Math.cos(rot) - y0 * Math.sin(rot);
  const y = x0 * Math.sin(rot) + y0 * Math.cos(rot);
  return { x, y };
}

type Props = {
  imageSource: ImageSourcePropType;
  orbitSize?: number;
};

/** 完成态头像：金边 + 倾斜椭圆轨道 + 两颗「行星」沿轨道运行 */
export default function AvatarDoneOrbitAvatar({ imageSource, orbitSize = 230 }: Props) {
  const s = orbitSize / FIGMA_FRAME_W;
  const w = orbitSize;
  const h = (FIGMA_FRAME_H / FIGMA_FRAME_W) * orbitSize;
  const cx = w / 2;
  const cy = h / 2;

  const rxCirc = (153.35 / 2) * s;
  const rxE3 = (44.99 / 2) * s;
  const ryE3 = (184.02 / 2) * s;
  const rxE2 = (43.56 / 2) * s;
  const ryE2 = (183.76 / 2) * s;

  const avatarD = 125 * s;
  const borderW = Math.max(2.5, 3 * s);

  const dotOuterR = (14.2 / 2) * s;
  const dotInnerR = (10.79 / 2) * s;

  const t = useSharedValue(0);
  const twinkle = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, { duration: ORBIT_PERIOD_MS, easing: Easing.linear }),
      -1,
      false
    );
    twinkle.value = withRepeat(
      withTiming(1, { duration: TWINKLE_MS, easing: Easing.linear }),
      -1,
      false
    );
  }, []);

  const planet1Style = useAnimatedStyle(() => {
    'worklet';
    const u = t.value * Math.PI * 2;
    const { x, y } = ellipsePoint(rxE3, ryE3, -130, u);
    const w = twinkle.value * Math.PI * 2;
    // 多频正弦叠加以增强「闪光」感，两颗点相位错开
    const pulse =
      0.42 * (0.5 + 0.5 * Math.sin(w * 2.1)) + 0.32 * (0.5 + 0.5 * Math.sin(w * 5.3 + 0.4));
    const g = 0.58 + 0.42 * pulse;
    return {
      position: 'absolute' as const,
      left: cx + x - dotOuterR,
      top: cy + y - dotOuterR,
      width: dotOuterR * 2,
      height: dotOuterR * 2,
      borderRadius: dotOuterR,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.4)',
      alignItems: 'center',
      justifyContent: 'center',
      opacity: 0.55 + 0.45 * g,
      transform: [{ scale: 0.88 + 0.12 * g }],
    };
  });

  const planet2Style = useAnimatedStyle(() => {
    'worklet';
    const u = -(t.value * Math.PI * 2) + Math.PI * 0.65;
    const { x, y } = ellipsePoint(rxE2, ryE2, 50.56, u);
    const w = twinkle.value * Math.PI * 2 + 1.85;
    const pulse =
      0.42 * (0.5 + 0.5 * Math.sin(w * 2.1)) + 0.32 * (0.5 + 0.5 * Math.sin(w * 5.3 + 0.4));
    const g = 0.58 + 0.42 * pulse;
    return {
      position: 'absolute' as const,
      left: cx + x - dotOuterR,
      top: cy + y - dotOuterR,
      width: dotOuterR * 2,
      height: dotOuterR * 2,
      borderRadius: dotOuterR,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.4)',
      alignItems: 'center',
      justifyContent: 'center',
      opacity: 0.55 + 0.45 * g,
      transform: [{ scale: 0.88 + 0.12 * g }],
    };
  });

  const glow = (size: number, color: string, opacity: number, ox: number, oy: number) => (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: cx - size / 2 + ox * s,
        top: cy - size / 2 + oy * s,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity,
      }}
    />
  );

  return (
    <View style={{ width: w, height: h, alignItems: 'center' }}>
      <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
        <G transform={`rotate(-130 ${cx} ${cy})`}>
          <Ellipse
            cx={cx}
            cy={cy}
            rx={rxE3}
            ry={ryE3}
            stroke="rgba(255,255,255,0.3)"
            strokeWidth={1}
            fill="none"
          />
        </G>
        <G transform={`rotate(50.56 ${cx} ${cy})`}>
          <Ellipse
            cx={cx}
            cy={cy}
            rx={rxE2}
            ry={ryE2}
            stroke="rgba(255,255,255,0.3)"
            strokeWidth={1}
            fill="none"
          />
        </G>
        <Ellipse
          cx={cx}
          cy={cy}
          rx={rxCirc}
          ry={rxCirc}
          stroke="rgba(255,255,255,0.3)"
          strokeWidth={1}
          fill="none"
        />
      </Svg>

      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        {glow(avatarD * 0.72, '#907127', 0.38, -14 * s, -14 * s)}
        {glow(avatarD * 0.72, '#907127', 0.38, 14 * s, 14 * s)}
        {glow(avatarD * 0.42, '#FFF948', 0.22, 12 * s, 12 * s)}
        {glow(avatarD * 0.42, '#FFF948', 0.22, -12 * s, -12 * s)}
      </View>

      <View
        style={{
          position: 'absolute',
          left: cx - (avatarD + borderW * 2) / 2,
          top: cy - (avatarD + borderW * 2) / 2,
          width: avatarD + borderW * 2,
          height: avatarD + borderW * 2,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <LinearGradient
          colors={['#FFD68A', '#E8C27A', '#B98C44', '#8A6428']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: avatarD + borderW * 2,
            height: avatarD + borderW * 2,
            borderRadius: (avatarD + borderW * 2) / 2,
            padding: borderW,
          }}>
          <Image
            source={imageSource}
            style={{
              width: avatarD,
              height: avatarD,
              borderRadius: avatarD / 2,
              backgroundColor: '#1a1a1a',
            }}
            resizeMode="cover"
          />
        </LinearGradient>
      </View>

      <Animated.View style={planet1Style}>
        <View
          style={{
            width: dotInnerR * 2,
            height: dotInnerR * 2,
            borderRadius: dotInnerR,
            backgroundColor: '#FFFFFF',
          }}
        />
      </Animated.View>
      <Animated.View style={planet2Style}>
        <View
          style={{
            width: dotInnerR * 2,
            height: dotInnerR * 2,
            borderRadius: dotInnerR,
            backgroundColor: '#FFFFFF',
          }}
        />
      </Animated.View>
    </View>
  );
}
