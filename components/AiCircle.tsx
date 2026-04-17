import { LinearGradient } from 'expo-linear-gradient';
import LottieView from 'lottie-react-native';
import React, { useState } from 'react';
import { TouchableOpacity, View } from 'react-native';

import AnimatedView from './AnimatedView';
import Icon from './Icon';

import { shadowPresets } from '@/utils/useShadow';

export const AiCircle = () => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const toggleSpeaking = () => {
    setIsSpeaking((prev) => !prev);
  };
  return (
    <View className="flex-1 items-center justify-center">
      <AnimatedView animation="scaleIn" duration={200} shouldResetAnimation>
        <View
          //activeOpacity={0.5}
          className="relative h-[250px] w-[250px] items-center justify-center">
          <View
            style={shadowPresets.large}
            className="relative z-[9999] h-[140px] w-[140px] items-center justify-center rounded-full bg-background">
            <LinearGradient
              colors={['#D883E4', '#016BF0', '#3DE3E0', '#E57DDF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={{
                ...shadowPresets.large,
                width: 128,
                height: 128,
                borderRadius: 140,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={toggleSpeaking}
                className="h-[120px] w-[120px] items-center justify-center rounded-full bg-background">
                <LinearGradient
                  style={{
                    borderRadius: 120,
                    width: 120,
                    height: 120,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  colors={['transparent', 'rgba(255,255,255,0.1)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}>
                  <Icon name={isSpeaking ? 'Pause' : 'Mic'} size={34} strokeWidth={1.2} />
                </LinearGradient>
              </TouchableOpacity>
            </LinearGradient>
          </View>
          {isSpeaking && (
            <LottieView
              autoPlay
              style={{
                width: 250,
                height: 250,
                opacity: 0.2,
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 500,
              }}
              source={require('@/assets/lottie/speaking.json')}
            />
          )}
        </View>
      </AnimatedView>
    </View>
  );
};
