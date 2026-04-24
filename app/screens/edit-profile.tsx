import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  View,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ThemedText from '@/components/ThemedText';
import IconLucide from '@/components/Icon';
import { useGlobalFloatingTabBarInset } from '@/hooks/useGlobalFloatingTabBarInset';
import { clearAuthSession } from '@/lib/authSession';
import { putProfileCache, clearProfileCache } from '@/lib/profileCache';
import { clearAllListDataCaches } from '@/lib/listDataCache';
import { fetchProfile } from '@/services/profileApi';

const BG = '#1D1D1D';
const CARD = '#262626';
const DIVIDER = '#2E2E2E';
const GOLD = '#AA873C';

function sectionTitle(text: string, isFirst = false) {
  return (
    <ThemedText
      className="mb-2.5 text-sm text-white"
      style={{ fontSize: 14, lineHeight: 20, marginTop: isFirst ? 8 : 20, marginLeft: 4 }}>
      {text}
    </ThemedText>
  );
}

type RowProps = {
  icon: React.ComponentProps<typeof IconLucide>['name'];
  label: string;
  onPress: () => void;
  isLast?: boolean;
};

function settingsNavRow({ icon, label, onPress, isLast }: RowProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className="min-h-[50px] flex-row items-center justify-between px-3"
      style={
        isLast
          ? undefined
          : {
              borderBottomWidth: 1,
              borderColor: DIVIDER,
            }
      }>
      <View className="flex-row items-center">
        <IconLucide name={icon} size={20} color="#fff" />
        <ThemedText
          className="ml-3.5 text-[15px] text-white"
          style={{ lineHeight: 22 }}>
          {label}
        </ThemedText>
      </View>
      <IconLucide name="ChevronRight" size={20} color="#fff" />
    </TouchableOpacity>
  );
}

export default function EditProfileScreen() {
  const insets = useSafeAreaInsets();
  const listBottomPad = useGlobalFloatingTabBarInset();
  const { width: winW } = useWindowDimensions();
  const cardW = Math.min(370, winW - 32);

  const [clearing, setClearing] = useState(false);

  const handleOpenNotifications = () => {
    void Linking.openSettings();
  };

  const handleClearCache = async () => {
    setClearing(true);
    try {
      clearAllListDataCaches();
      await clearProfileCache();
      const p = await fetchProfile();
      putProfileCache(p);
      Alert.alert('已清除', '应用缓存与列表缓存已清理');
    } catch (e) {
      Alert.alert('操作失败', e instanceof Error ? e.message : '请稍后重试');
    } finally {
      setClearing(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('退出登录', '确定要退出当前账号吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '退出',
        style: 'destructive',
        onPress: async () => {
          await clearAuthSession();
          router.replace('/screens/welcome');
        },
      },
    ]);
  };

  return (
    <View className="flex-1" style={{ backgroundColor: BG, paddingTop: insets.top }}>
      <StatusBar style="light" />
      <View className="flex-row items-center justify-center px-4" style={{ height: 48 }}>
        <TouchableOpacity
          onPress={() => router.back()}
          className="absolute left-3 h-10 w-10 items-center justify-center"
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="返回">
          <IconLucide name="ArrowLeft" size={24} color="#fff" />
        </TouchableOpacity>
        <ThemedText className="text-base text-white" style={{ fontSize: 16, lineHeight: 22 }}>
          设置
        </ThemedText>
        <View className="absolute right-3 w-10" />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingBottom: listBottomPad + 32,
          paddingHorizontal: 16,
          paddingTop: 4,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        {sectionTitle('通用', true)}
        <View
          style={{
            width: cardW,
            alignSelf: 'center',
            backgroundColor: CARD,
            borderRadius: 20,
            overflow: 'hidden',
          }}>
          {settingsNavRow({
            icon: 'Bell',
            label: '通知',
            onPress: handleOpenNotifications,
          })}
          {settingsNavRow({
            icon: 'User',
            label: '编辑资料',
            onPress: () => router.push('/screens/account-center'),
            isLast: true,
          })}
        </View>

        {sectionTitle('隐私与安全')}
        <View
          style={{
            width: cardW,
            alignSelf: 'center',
            backgroundColor: CARD,
            borderRadius: 20,
            overflow: 'hidden',
          }}>
          {settingsNavRow({
            icon: 'KeyRound',
            label: '修改密码',
            onPress: () => router.push('/screens/forgot-password'),
          })}
          <TouchableOpacity
            onPress={handleClearCache}
            disabled={clearing}
            activeOpacity={0.7}
            className="min-h-[50px] flex-row items-center justify-between px-3">
            <View className="flex-row items-center">
              <IconLucide name="Trash2" size={20} color="#fff" />
              <ThemedText
                className="ml-3.5 text-[15px] text-white"
                style={{ lineHeight: 22 }}>
                清除缓存
              </ThemedText>
            </View>
            {clearing ? (
              <ActivityIndicator size="small" color={GOLD} />
            ) : (
              <IconLucide name="ChevronRight" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>

        {sectionTitle('关于')}
        <View
          style={{
            width: cardW,
            alignSelf: 'center',
            backgroundColor: CARD,
            borderRadius: 20,
            overflow: 'hidden',
          }}>
          {settingsNavRow({
            icon: 'Info',
            label: '关于本应用',
            onPress: () => router.push('/screens/help'),
            isLast: true,
          })}
        </View>

        <TouchableOpacity
          onPress={handleLogout}
          className="mt-8 flex-row items-center justify-center"
          style={{
            marginHorizontal: 17,
            minHeight: 42,
            borderRadius: 20,
            backgroundColor: GOLD,
          }}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel="退出登录">
          <IconLucide name="LogOut" size={18} color="#fff" />
          <ThemedText className="ml-2 text-sm text-white">退出登录</ThemedText>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
