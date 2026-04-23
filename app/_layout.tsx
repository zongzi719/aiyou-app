import '../global.css';
import { Stack } from 'expo-router';
import React, { useEffect } from 'react';
import { Alert, Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ThemeProvider } from './contexts/ThemeContext';
import useThemedNavigation from './hooks/useThemedNavigation';

import { AiRecordModalProvider } from '@/app/contexts/AiRecordModalContext';
import { DrawerProvider } from '@/app/contexts/DrawerContext';
import GlobalBottomTabBar from '@/components/GlobalBottomTabBar';
import {
  preloadAppAssetsOnce,
  warmupAppDataOnce,
  warmupRemoteImagesOnce,
} from '@/lib/appBootstrapPreload';
import { buildEnvHealthReport } from '@/lib/envHealth';

function ThemedLayout() {
  const { ThemedStatusBar, screenOptions } = useThemedNavigation();

  useEffect(() => {
    preloadAppAssetsOnce().catch(() => {});
    warmupAppDataOnce().catch(() => {});
    warmupRemoteImagesOnce().catch(() => {});
  }, []);

  useEffect(() => {
    if (!__DEV__) return;
    console.info('[DEV CLIENT] Metro connected; save any file to verify Fast Refresh.');
    const report = buildEnvHealthReport();
    const { missingRequired, snapshot } = report;
    if (missingRequired.length === 0) {
      console.info('[ENV CHECK] ok', snapshot);
      return;
    }
    console.warn('[ENV CHECK] missing required envs', {
      snapshot,
      missingRequired,
      optionalMissingCount: report.optionalMissing.length,
    });
    const lines = missingRequired.map((x) => `- ${x.name}（${x.reason}）`).join('\n');
    Alert.alert(
      '环境变量检查未通过',
      `当前配置：AI=${snapshot.aiProvider}，Voice=${snapshot.voiceCloneProvider}\n\n缺失项：\n${lines}\n\n请补齐后重启 Expo（建议 npx expo start -c）`
    );
  }, []);

  return (
    <View className="flex-1 bg-background">
      <ThemedStatusBar />
      <Stack screenOptions={screenOptions}>
        <Stack.Screen name="(drawer)" options={{ headerShown: false }} />
        <Stack.Screen name="screens/welcome" options={{ headerShown: false }} />
        <Stack.Screen name="screens/login" options={{ headerShown: false }} />
        <Stack.Screen name="screens/signup" options={{ headerShown: false }} />
        <Stack.Screen name="screens/forgot-password" options={{ headerShown: false }} />
        <Stack.Screen name="screens/model-init" options={{ headerShown: false }} />
        <Stack.Screen name="dev" options={{ headerShown: false }} />
      </Stack>
      <GlobalBottomTabBar />
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView
      className={`bg-background ${Platform.OS === 'ios' ? 'pb-0 ' : ''}`}
      style={{ flex: 1 }}>
      <ThemeProvider>
        <DrawerProvider>
          <AiRecordModalProvider>
            <ThemedLayout />
          </AiRecordModalProvider>
        </DrawerProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
