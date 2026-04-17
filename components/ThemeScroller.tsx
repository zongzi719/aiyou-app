import React from 'react';
import {
  ScrollView,
  ScrollViewProps,
  View,
  Animated,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';

interface ThemeScrollerProps extends ScrollViewProps {
  children: React.ReactNode;
  onScroll?: ((event: NativeSyntheticEvent<NativeScrollEvent>) => void) | any;
  contentContainerStyle?: any;
  scrollEventThrottle?: number;
  headerSpace?: boolean;
  /** 默认 true；为 false 时不追加底部占位 View，便于自行用 contentContainerStyle 控制 */
  footerSpacer?: boolean;
}

export default function ThemedScroller({
  children,
  className,
  onScroll,
  contentContainerStyle,
  scrollEventThrottle = 16,
  headerSpace = false,
  footerSpacer = true,
  ...props
}: ThemeScrollerProps) {
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      style={{ width: '100%' }}
      bounces={false}
      overScrollMode="never"
      className={`flex-1 bg-background px-global ${className || ''}`}
      onScroll={onScroll}
      scrollEventThrottle={scrollEventThrottle}
      contentContainerStyle={[
        headerSpace && { paddingTop: 70 }, // Add space for fixed header
        contentContainerStyle,
      ]}
      {...props}>
      {children}
      {footerSpacer ? <View className="h-20 w-full" /> : null}
    </ScrollView>
  );
}

// Create an Animated version of ScrollView for use with Animated.event
export const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);
