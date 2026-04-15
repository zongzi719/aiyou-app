import React, { useState, useCallback } from 'react';
import { View, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import Header from '@/components/Header';
import ThemedText from '@/components/ThemedText';
import Avatar from '@/components/Avatar';
import ListLink from '@/components/ListLink';
import AnimatedView from '@/components/AnimatedView';
import ThemedScroller from '@/components/ThemeScroller';
import Icon from '@/components/Icon';
import { shadowPresets } from '@/utils/useShadow';
import { clearAuthSession } from '@/lib/authSession';
import { fetchProfile, uploadAvatar, bustAvatarCache, UserProfile } from '@/services/profileApi';
import { useGlobalFloatingTabBarInset } from '@/hooks/useGlobalFloatingTabBarInset';

export default function ProfileScreen() {
  const listBottomPad = useGlobalFloatingTabBarInset();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [avatarUploading, setAvatarUploading] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      fetchProfile()
        .then((p) => { if (!cancelled) setProfile(p); })
        .catch(() => {})
        .finally(() => { if (!cancelled) setLoading(false); });
      return () => { cancelled = true; };
    }, [])
  );

  const handleAvatarPress = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('需要权限', '请在设置中允许访问相册');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    setAvatarUploading(true);
    try {
      const updated = await uploadAvatar(asset.uri, asset.mimeType ?? 'image/jpeg');
      setProfile(updated);
    } catch (e) {
      Alert.alert('上传失败', e instanceof Error ? e.message : '请稍后重试');
    } finally {
      setAvatarUploading(false);
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
    <AnimatedView className='flex-1 bg-background' animation='fadeIn' duration={350} playOnlyOnce={false}>
      <Header showBackButton title="个人资料" />
      <ThemedScroller
        className="!px-6"
        footerSpacer={false}
        contentContainerStyle={{ paddingBottom: listBottomPad }}
      >

        {/* 头像 + 基本信息卡片 */}
        <View className="px-6 py-8 w-full border border-border rounded-3xl mb-4">
          <View className="flex-col justify-center items-center">

            {/* 头像（可点击更换） */}
            <TouchableOpacity
              onPress={handleAvatarPress}
              activeOpacity={0.8}
              className="relative"
              disabled={avatarUploading || loading}
            >
              <Avatar
                src={profile?.avatar_url ? bustAvatarCache(profile.avatar_url) : require('@/assets/img/thomino.jpg')}
                size="xl"
              />
              <View className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-primary items-center justify-center border-2 border-background">
                {avatarUploading
                  ? <ActivityIndicator size="small" color="white" />
                  : <Icon name="Camera" size={13} color="white" />
                }
              </View>
            </TouchableOpacity>

            {/* 姓名 + 用户名 */}
            {loading ? (
              <View className="mt-4 items-center gap-y-2">
                <ActivityIndicator />
              </View>
            ) : (
              <View className="items-center flex-1 mt-3">
                <ThemedText className="text-2xl font-bold">
                  {profile?.display_name || profile?.username || '—'}
                </ThemedText>
                <ThemedText className="text-sm text-subtext mt-0.5">
                  @{profile?.username || '—'}
                </ThemedText>
                {!!profile?.bio && (
                  <ThemedText className="text-sm text-subtext text-center mt-2 px-4">
                    {profile.bio}
                  </ThemedText>
                )}
                {profile?.tags && profile.tags.length > 0 && (
                  <View className="flex-row flex-wrap justify-center gap-x-2 gap-y-1 mt-3">
                    {profile.tags.map((tag) => (
                      <View key={tag} className="bg-secondary rounded-full px-3 py-1">
                        <ThemedText className="text-xs text-subtext">{tag}</ThemedText>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>
        </View>

        {/* 功能菜单 */}
        <View style={shadowPresets.medium} className='bg-secondary rounded-3xl mb-6'>
          <ListLink className='px-5' hasBorder title="编辑资料" icon="Settings" href="/screens/edit-profile" />
          <ListLink className='px-5' hasBorder title="升级 Plus" icon="Zap" href="/screens/subscription" />
          <ListLink className='px-5' hasBorder title="AI 语音" icon="MicVocal" href="/screens/ai-voice" />
          <ListLink className='px-5' hasBorder title="帮助" icon="HelpCircle" href="/screens/help" />
          <ListLink className='px-5' title="退出登录" icon="LogOut" onPress={handleLogout} />
        </View>

      </ThemedScroller>
    </AnimatedView>
  );
}
