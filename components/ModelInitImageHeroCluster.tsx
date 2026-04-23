import React from 'react';
import {
  Image,
  ImageSourcePropType,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';

import Icon from '@/components/Icon';

type AvatarSpot = {
  nx: number;
  ny: number;
  size: number;
  source: ImageSourcePropType;
  /** 远景：略小、变淡，模拟景深 */
  depth: 'back' | 'mid' | 'front';
};

const AVATAR_SPOTS: AvatarSpot[] = [
  { nx: 0.14, ny: 0.58, size: 40, source: require('@/assets/img/user-1.jpg'), depth: 'back' },
  { nx: 0.86, ny: 0.62, size: 36, source: require('@/assets/img/user-2.jpg'), depth: 'back' },
  { nx: 0.1, ny: 0.36, size: 50, source: require('@/assets/img/user-3.jpg'), depth: 'mid' },
  { nx: 0.8, ny: 0.3, size: 48, source: require('@/assets/img/thomino.jpg'), depth: 'mid' },
  { nx: 0.26, ny: 0.26, size: 58, source: require('@/assets/img/user-4.jpg'), depth: 'front' },
  { nx: 0.72, ny: 0.44, size: 54, source: require('@/assets/img/user-1.jpg'), depth: 'front' },
  { nx: 0.48, ny: 0.76, size: 46, source: require('@/assets/img/user-2.jpg'), depth: 'mid' },
];

function depthStyle(depth: AvatarSpot['depth']) {
  switch (depth) {
    case 'back':
      return { opacity: 0.48, transform: [{ scale: 0.92 }] as const };
    case 'mid':
      return { opacity: 0.82, transform: [{ scale: 1 }] as const };
    default:
      return { opacity: 1, transform: [{ scale: 1 }] as const };
  }
}

function FloatingAvatar({ cw, spot }: { cw: number; spot: AvatarSpot }) {
  const s = Math.round((spot.size / 556) * cw);
  const d = depthStyle(spot.depth);
  return (
    <View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: `${spot.nx * 100}%`,
          top: `${spot.ny * 100}%`,
          width: s,
          height: s,
          marginLeft: -s / 2,
          marginTop: -s / 2,
          borderRadius: s / 2,
          overflow: 'hidden',
          opacity: d.opacity,
          transform: d.transform,
        },
        Platform.select({
          ios: {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.35,
            shadowRadius: 4,
          },
          android: { elevation: 4 },
          default: {},
        }),
      ]}>
      <Image source={spot.source} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
    </View>
  );
}

export type ModelInitImageHeroClusterProps = {
  containerWidth: number;
  aspectRatio?: number;
  portraitUri: string | null;
  onCenterPress: () => void;
};

/**
 * 图像采集中部：青绿氛围光 + 错落头像 + 中央半透明「+」（对齐设计稿层次，非单张拼贴图）
 */
export default function ModelInitImageHeroCluster({
  containerWidth: cw,
  aspectRatio = 556 / 399.17,
  portraitUri,
  onCenterPress,
}: ModelInitImageHeroClusterProps) {
  const h = cw / aspectRatio;
  const centerRing = Math.round((118 / 556) * cw);
  const innerRing = Math.round((72 / 556) * cw);

  return (
    <View style={{ width: cw, height: h, overflow: 'hidden' }}>
      {/* 氛围光（参考稿 Rectangle 49 / 53 色相） */}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, { backgroundColor: 'transparent' }]}>
        <View
          style={{
            position: 'absolute',
            width: cw * 0.92,
            height: h * 0.85,
            borderRadius: 42,
            backgroundColor: '#03503A',
            opacity: 0.38,
            left: -cw * 0.12,
            top: h * 0.06,
            transform: [{ scaleX: 1.05 }],
          }}
        />
        <View
          style={{
            position: 'absolute',
            width: cw * 0.55,
            height: h * 0.7,
            borderRadius: 80,
            backgroundColor: '#26556B',
            opacity: 0.32,
            right: -cw * 0.08,
            top: h * 0.18,
          }}
        />
      </View>

      {/* 远景头像 → 中景 → 近景 */}
      {[...AVATAR_SPOTS].sort((a, b) => {
        const o = { back: 0, mid: 1, front: 2 };
        return o[a.depth] - o[b.depth];
      }).map((spot, i) => (
        <FloatingAvatar key={`${spot.nx}-${spot.ny}-${i}`} cw={cw} spot={spot} />
      ))}

      {/* 右下角淡圆环占位 */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          right: cw * 0.02,
          bottom: h * 0.04,
          width: cw * 0.22,
          height: cw * 0.22,
          borderRadius: (cw * 0.22) / 2,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.14)',
        }}
      />

      {/* 中央：双环 + 加号 / 已选图 */}
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={onCenterPress}
        accessibilityRole="button"
        accessibilityLabel={portraitUri ? '更换照片' : '选择照片'}
        style={[StyleSheet.absoluteFillObject, styles.centerHit]}>
        <View
          style={[
            styles.centerOuter,
            {
              width: centerRing,
              height: centerRing,
              borderRadius: centerRing / 2,
            },
          ]}>
          {portraitUri ? (
            <Image
              source={{ uri: portraitUri }}
              style={{
                width: innerRing,
                height: innerRing,
                borderRadius: innerRing / 2,
              }}
              resizeMode="cover"
            />
          ) : (
            <View
              style={[
                styles.centerInner,
                {
                  width: innerRing,
                  height: innerRing,
                  borderRadius: innerRing / 2,
                },
              ]}>
              <Icon name="Plus" size={Math.round((36 / 556) * cw)} color="rgba(255,255,255,0.95)" strokeWidth={2.2} />
            </View>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  centerHit: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  centerOuter: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.45,
        shadowRadius: 10,
      },
      android: { elevation: 12 },
      default: {},
    }),
  },
  centerInner: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
  },
});
