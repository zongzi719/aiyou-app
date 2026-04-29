import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { Image, ImageBackground, Pressable, SafeAreaView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ThemedText from '@/components/ThemedText';
import { hasPrivateChatBackendSession } from '@/lib/authSession';

export default function OnboardingScreen() {
  const [agreed, setAgreed] = useState(true);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    let cancelled = false;
    void hasPrivateChatBackendSession().then((loggedIn) => {
      if (cancelled || !loggedIn) return;
      router.replace('/');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-black" style={{ paddingTop: insets.top }}>
      <View className="flex-1 bg-black">
        <ImageBackground
          source={require('@/assets/images/backgrounds/welcome-bg.jpg')}
          resizeMode="cover"
          className="flex-1">
          <View className="relative flex-1">
            <LinearGradient
              pointerEvents="none"
              colors={[
                '#000000',
                '#000000',
                'rgba(0, 0, 0, 0.96)',
                'rgba(0, 1, 8, 0.72)',
                'rgba(0, 7, 34, 0.35)',
                'rgba(0, 7, 34, 0)',
              ]}
              locations={[0, 0.35, 0.56, 0.78, 0.9, 1]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 270, zIndex: 1 }}
            />
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 132,
                left: 0,
                right: 0,
                zIndex: 2,
                alignItems: 'center',
              }}>
              <View className="relative overflow-visible" style={{ width: 189, height: 56 }}>
                <View
                  pointerEvents="none"
                  className="absolute -inset-1 rounded-lg"
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.42)',
                    mixBlendMode: 'multiply',
                  }}
                />
                <Image
                  source={require('@/assets/images/welcome-wordmark.png')}
                  resizeMode="contain"
                  style={{ width: 189, height: 56, zIndex: 1, opacity: 1 }}
                />
              </View>
            </View>

            <View className="flex-1 px-8">
              <View className="flex-1" />

              <Pressable
                onPress={() => {
                  if (!agreed) return;
                  router.replace('/screens/login');
                }}
                className={`items-center rounded-full py-4 ${
                  agreed ? 'bg-white' : 'border-[0.5px] border-[#6B6B6B] bg-[#8C8C8C]/20'
                }`}>
                <ThemedText
                  className={`text-xl ${agreed ? 'font-medium text-black' : 'font-normal text-[#6B6B6B]'}`}>
                  账号登录
                </ThemedText>
              </Pressable>

              <Pressable
                className="mb-4 mt-5 flex-row items-center justify-center"
                onPress={() => setAgreed((v) => !v)}>
                <View
                  className={`mr-2 h-3.5 w-3.5 rounded-full border ${
                    agreed ? 'border-white bg-white' : 'border-white/80 bg-transparent'
                  }`}
                />
                <ThemedText className="text-[13px] text-white/90">
                  我已阅读并同意《用户协议》和《隐私政策》
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </ImageBackground>
      </View>
    </SafeAreaView>
  );
}
