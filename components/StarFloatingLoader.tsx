import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';

import Icon from '@/components/Icon';
import ThemedText from '@/components/ThemedText';

type StarFloatingLoaderProps = {
  text: string;
  className?: string;
  textClassName?: string;
};

export default function StarFloatingLoader({
  text,
  className = '',
  textClassName = '',
}: StarFloatingLoaderProps) {
  const float = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: 0,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    floatLoop.start();
    glowLoop.start();
    return () => {
      floatLoop.stop();
      glowLoop.stop();
    };
  }, [float, glow]);

  const iconTranslateY = float.interpolate({
    inputRange: [0, 1],
    outputRange: [1.5, -1.5],
  });
  const iconScale = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [0.95, 1.08],
  });
  const textOpacity = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [0.72, 1],
  });

  return (
    <View className={`flex-row items-center gap-2 ${className}`}>
      <Animated.View style={{ transform: [{ translateY: iconTranslateY }, { scale: iconScale }] }}>
        <Icon name="Sparkles" size={17} color="#F6C344" fill="#F6C344" />
      </Animated.View>
      <Animated.View style={{ opacity: textOpacity }}>
        <ThemedText style={{ color: '#FFFFFF' }} className={`text-[15px] ${textClassName}`}>
          {text}
        </ThemedText>
      </Animated.View>
    </View>
  );
}
