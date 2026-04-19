import { router } from 'expo-router';
import React, { useState } from 'react';
import { ImageBackground, Pressable, SafeAreaView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ThemedText from '@/components/ThemedText';

export default function OnboardingScreen() {
  const [agreed, setAgreed] = useState(true);
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView className="flex-1 bg-black" style={{ paddingTop: insets.top }}>
      <View className="flex-1 bg-black">
        <ImageBackground
          source={{
            uri: 'file:///Users/ZHOU/.cursor/projects/Users-ZHOU-Desktop-project-luna-main/assets/image-4bddf3a2-33fa-4565-9b38-8e6f8b02b5a4.png',
          }}
          resizeMode="cover"
          className="flex-1">
          <View className="bg-black/15 flex-1 px-8">
            <View className="items-center" style={{ marginTop: 96 }}>
              <ThemedText className="font-outfit text-3xl tracking-widest text-white">
                AI YOU
              </ThemedText>
              <ThemedText className="mt-3 text-base text-white">
                “你的思维，从此多一个你”
              </ThemedText>
            </View>

            <View className="flex-1" />

            <Pressable
              onPress={() => {
                if (!agreed) return;
                router.push('/screens/login');
              }}
              className={`items-center rounded-full border border-white/35 py-4 ${agreed ? 'bg-white/15' : 'bg-white/10'}`}>
              <ThemedText className="text-xl font-medium text-white">
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
        </ImageBackground>
      </View>
    </SafeAreaView>
  );
}
