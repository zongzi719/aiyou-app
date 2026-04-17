import { Platform, ViewStyle } from 'react-native';

interface ShadowProps {
  elevation?: number;
  shadowColor?: string;
  shadowOpacity?: number;
  shadowRadius?: number;
  shadowOffset?: {
    width: number;
    height: number;
  };
}

export function getShadowStyle(options?: ShadowProps): ViewStyle {
  const {
    elevation = 5,
    shadowColor = '#000',
    shadowOpacity = 0.2,
    shadowRadius = 3.84,
    shadowOffset = { width: 0, height: 2 },
  } = options || {};

  const iosShadow: ViewStyle = {
    shadowColor,
    shadowOpacity,
    shadowRadius,
    shadowOffset,
  };

  const androidShadow: ViewStyle = {
    elevation,
  };

  return Platform.OS === 'ios' ? iosShadow : { ...iosShadow, ...androidShadow };
}

export const shadowPresets = {
  small: getShadowStyle({
    elevation: 3,
    shadowRadius: 2.5,
    shadowOffset: { width: 0, height: 1 },
  }),

  medium: getShadowStyle({
    elevation: 8,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
  }),

  large: getShadowStyle({
    elevation: 15,
    shadowRadius: 20.84,
    shadowColor: 'rgba(0, 0, 0, 0.2)',
    shadowOffset: { width: 0, height: 5 },
  }),

  card: getShadowStyle({
    elevation: 4,
    shadowRadius: 3.84,
    shadowOffset: { width: 0, height: 2 },
  }),
};

// 兼容旧命名：这是纯函数，不是 React Hook。
export const useShadow = getShadowStyle;

export default getShadowStyle;
