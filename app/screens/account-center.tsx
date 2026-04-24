import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ThemedText from '@/components/ThemedText';
import Icon from '@/components/Icon';
import Input from '@/components/forms/Input';
import { useGlobalFloatingTabBarInset } from '@/hooks/useGlobalFloatingTabBarInset';
import { putProfileCache } from '@/lib/profileCache';
import { preferHttpsMediaUrl } from '@/lib/preferHttpsMediaUrl';
import {
  fetchProfile,
  updateProfile,
  uploadAvatar,
  bustAvatarCache,
  UserProfile,
} from '@/services/profileApi';

const BG = '#1D1D1D';
const CARD = '#262626';
const GOLD = '#AA873C';

export default function AccountCenterScreen() {
  const insets = useSafeAreaInsets();
  const listBottomPad = useGlobalFloatingTabBarInset();
  const { width: winW } = useWindowDimensions();
  const cardW = Math.min(370, winW - 32);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [localAvatar, setLocalAvatar] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = await fetchProfile();
      putProfileCache(p);
      setProfile(p);
      setDisplayName(p.display_name ?? '');
      setBio(p.bio ?? '');
      setTagsInput((p.tags ?? []).join('、'));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handlePickAvatar = async () => {
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
    setLocalAvatar(asset.uri);
    setAvatarUploading(true);
    try {
      const updated = await uploadAvatar(asset.uri, asset.mimeType ?? 'image/jpeg');
      putProfileCache(updated);
      setProfile(updated);
    } catch (e) {
      Alert.alert('上传失败', e instanceof Error ? e.message : '请稍后重试');
      setLocalAvatar(null);
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const tags = tagsInput
        .split(/[，,、\s]+/)
        .map((t) => t.trim())
        .filter(Boolean);
      const next = await updateProfile({ display_name: displayName.trim(), bio: bio.trim(), tags });
      putProfileCache(next);
      setProfile(next);
      Alert.alert('已保存', '资料已更新');
    } catch (e) {
      Alert.alert('保存失败', e instanceof Error ? e.message : '请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  const avatarUri = localAvatar ?? (profile?.avatar_url ? bustAvatarCache(profile.avatar_url) : null);
  const nameHint =
    profile?.display_name?.trim() || profile?.username || '用户';

  return (
    <View className="flex-1" style={{ backgroundColor: BG, paddingTop: insets.top }}>
      <StatusBar style="light" />
      <View className="flex-row items-center justify-center border-b border-[#2E2E2E] px-2" style={{ minHeight: 48 }}>
        <TouchableOpacity
          onPress={() => router.back()}
          className="absolute left-1 h-10 w-10 items-center justify-center"
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="返回">
          <Icon name="ArrowLeft" size={24} color="#fff" />
        </TouchableOpacity>
        <ThemedText className="text-base text-white" style={{ fontSize: 16, lineHeight: 22 }}>
          编辑资料
        </ThemedText>
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving || !profile}
          className="absolute right-2 min-w-[48px] items-end px-2 py-1.5"
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="保存">
          <ThemedText
            style={{
              color: saving || !profile ? 'rgba(200,200,200,0.4)' : GOLD,
              fontSize: 16,
              fontWeight: '600',
            }}>
            {saving ? '保存中…' : '保存'}
          </ThemedText>
        </TouchableOpacity>
      </View>

      {loading && !profile ? (
        <View className="flex-1 items-center justify-center" style={{ backgroundColor: BG }}>
          <ActivityIndicator size="large" color={GOLD} />
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            paddingBottom: listBottomPad + 32,
            paddingHorizontal: 16,
            paddingTop: 16,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          <View
            style={{
              width: cardW,
              alignSelf: 'center',
              backgroundColor: CARD,
              borderRadius: 20,
              overflow: 'hidden',
            }}>
            <View className="border-b border-[#2E2E2E] px-3 py-3">
              <ThemedText className="mb-2 text-xs text-subtext">头像</ThemedText>
              <TouchableOpacity
                onPress={handlePickAvatar}
                disabled={avatarUploading}
                className="h-20 w-20 items-center justify-center overflow-hidden"
                style={{
                  borderRadius: 40,
                  backgroundColor: 'rgba(255,255,255,0.1)',
                }}
                activeOpacity={0.85}>
                {avatarUri ? (
                  <Image
                    source={{ uri: preferHttpsMediaUrl(avatarUri) }}
                    className="h-full w-full"
                    resizeMode="cover"
                  />
                ) : (
                  <Icon name="User" size={32} color="#B8B8B8" />
                )}
                {avatarUploading ? (
                  <View className="absolute inset-0 items-center justify-center bg-black/50">
                    <ActivityIndicator color="#fff" size="small" />
                  </View>
                ) : null}
              </TouchableOpacity>
              <ThemedText className="mt-2 text-[12px] text-subtext" numberOfLines={1}>
                {nameHint}
              </ThemedText>
            </View>
            <View className="px-2 pb-4 pt-1">
              <Input
                label="显示名"
                variant="underlined"
                value={displayName}
                onChangeText={setDisplayName}
                autoCapitalize="words"
                placeholder="你的显示名称"
              />
              <Input
                label="用户名"
                variant="underlined"
                value={profile?.username ?? ''}
                editable={false}
                containerClassName="opacity-50"
              />
              <Input
                label="声音ID"
                variant="underlined"
                value={profile?.voice_id ?? ''}
                editable={false}
                containerClassName="opacity-50"
              />
              <Input
                label="个人简介"
                variant="underlined"
                value={bio}
                onChangeText={setBio}
                placeholder="一句话介绍自己"
              />
              <Input
                label="标签（逗号分隔）"
                variant="underlined"
                value={tagsInput}
                onChangeText={setTagsInput}
                placeholder="如：AI、创业、产品"
              />
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
