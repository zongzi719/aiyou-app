import '../global.css';
import React from 'react';
import { Stack } from 'expo-router';
import { ThemeProvider } from './contexts/ThemeContext';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DrawerProvider } from '@/app/contexts/DrawerContext';
import useThemedNavigation from './hooks/useThemedNavigation';
import { Platform, View } from 'react-native';
import GlobalBottomTabBar from '@/components/GlobalBottomTabBar';
import { AiRecordModalProvider } from '@/app/contexts/AiRecordModalContext';

function ThemedLayout() {
  const { ThemedStatusBar, screenOptions } = useThemedNavigation();

  return (
    <View className="flex-1 bg-background">
      <ThemedStatusBar />
      <Stack screenOptions={screenOptions}>
        <Stack.Screen name="(drawer)" options={{ headerShown: false }} />
        <Stack.Screen name="screens/welcome" options={{ headerShown: false }} />
        <Stack.Screen name="screens/login" options={{ headerShown: false }} />
        <Stack.Screen name="screens/signup" options={{ headerShown: false }} />
        <Stack.Screen name="screens/forgot-password" options={{ headerShown: false }} />
        <Stack.Screen name="dev" options={{ headerShown: false }} />
      </Stack>
      <GlobalBottomTabBar />
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView className={`bg-background ${Platform.OS === 'ios' ? 'pb-0 ' : ''}`} style={{ flex: 1 }}>
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
