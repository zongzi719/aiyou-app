import { useFonts, Outfit_400Regular, Outfit_700Bold } from '@expo-google-fonts/outfit';
import { router } from 'expo-router';
import { Stack } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useThemeColors } from '../contexts/ThemeColors';

import { getAuthSession, hasPrivateChatBackendSession } from '@/lib/authSession';
import {
  clearProfileCache,
  hydrateProfileCache,
  peekProfileCache,
} from '@/lib/profileCache';

export default function DrawerLayout() {
  const colors = useThemeColors();
  const [fontsLoaded] = useFonts({
    Outfit_400Regular,
    Outfit_700Bold,
  });
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    hasPrivateChatBackendSession().then(async (loggedIn) => {
      if (!loggedIn) {
        router.replace('/screens/welcome');
        return;
      }
      await hydrateProfileCache();
      const { userId } = await getAuthSession();
      const cached = peekProfileCache();
      if (cached && userId && cached.user_id !== userId) {
        await clearProfileCache();
      }
      setAuthChecked(true);
    });
  }, []);

  // 未检查完 / 未登录时渲染空白背景，防止主页内容一闪而过
  if (!fontsLoaded || !authChecked) {
    return <View style={{ flex: 1 }} className="bg-background" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
