import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, ActivityIndicator, Alert, Image } from 'react-native';

import useThemeColors from '@/app/contexts/ThemeColors';
import { Button } from '@/components/Button';
import Header from '@/components/Header';
import Icon from '@/components/Icon';
import ThemedScroller from '@/components/ThemeScroller';
import ThemedText from '@/components/ThemedText';
import Input from '@/components/forms/Input';
import Section from '@/components/layout/Section';
import { useGlobalFloatingTabBarInset } from '@/hooks/useGlobalFloatingTabBarInset';
import { putProfileCache } from '@/lib/profileCache';
import {
  fetchProfile,
  updateProfile,
  uploadAvatar,
  bustAvatarCache,
  UserProfile,
} from '@/services/profileApi';

export default function EditProfileScreen() {
  const listBottomPad = useGlobalFloatingTabBarInset();
  const colors = useThemeColors();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [localAvatar, setLocalAvatar] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  useEffect(() => {
    fetchProfile()
      .then((p) => {
        putProfileCache(p);
        setProfile(p);
        setDisplayName(p.display_name ?? '');
        setBio(p.bio ?? '');
        setTagsInput((p.tags ?? []).join('、'));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
      router.back();
    } catch (e) {
      Alert.alert('保存失败', e instanceof Error ? e.message : '请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  const avatarUri =
    localAvatar ?? (profile?.avatar_url ? bustAvatarCache(profile.avatar_url) : null);

  return (
    <>
      <Header
        title="编辑资料"
        showBackButton
        rightComponents={[
          <Button
            key="save"
            title={saving ? '保存中…' : '保存'}
            rounded="full"
            onPress={handleSave}
            disabled={saving || loading}
          />,
        ]}
      />

      {loading ? (
        <View className="flex-1 items-center justify-center bg-background">
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <ThemedScroller
          className="px-8"
          footerSpacer={false}
          contentContainerStyle={{ paddingBottom: listBottomPad }}>
          {/* 头像选择 */}
          <View className="mb-8 mt-8 flex-col items-center">
            <TouchableOpacity
              onPress={handlePickAvatar}
              className="relative"
              activeOpacity={0.85}
              disabled={avatarUploading}>
              {avatarUri ? (
                <Image
                  source={{ uri: avatarUri }}
                  className="h-28 w-28 rounded-full border border-border"
                />
              ) : (
                <View className="h-28 w-28 items-center justify-center rounded-full bg-secondary">
                  <Icon name="User" size={40} />
                </View>
              )}
              <View className="bg-highlight absolute bottom-0 right-0 h-8 w-8 items-center justify-center rounded-full border-2 border-background">
                {avatarUploading ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Icon name="Camera" size={15} color="white" />
                )}
              </View>
            </TouchableOpacity>

            <Button
              variant="ghost"
              title={avatarUri ? '更换头像' : '上传头像'}
              className="mt-3 bg-secondary"
              onPress={handlePickAvatar}
            />
          </View>

          {/* 基本信息 */}
          <View className="rounded-2xl bg-secondary p-global">
            <Section
              titleSize="xl"
              className="pb-6 pt-0"
              title="个人信息"
              subtitle="管理你的公开资料"
            />

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
              placeholder="登录用户名（不可修改）"
            />
            <Input
              label="声音ID"
              variant="underlined"
              value={profile?.voice_id ?? ''}
              editable={false}
              containerClassName="opacity-50"
              placeholder="尚未创建声音模型"
            />
            <Input
              label="个人简介"
              variant="underlined"
              value={bio}
              onChangeText={setBio}
              placeholder="一句话介绍自己"
              autoCapitalize="none"
            />
            <Input
              label="标签（逗号分隔）"
              variant="underlined"
              value={tagsInput}
              onChangeText={setTagsInput}
              placeholder="如：AI、创业、产品"
              autoCapitalize="none"
            />
          </View>

          {/* 当前标签预览 */}
          {tagsInput.trim().length > 0 && (
            <View className="mt-4 flex-row flex-wrap gap-x-2 gap-y-2">
              {tagsInput
                .split(/[，,、\s]+/)
                .filter(Boolean)
                .map((tag) => (
                  <View key={tag} className="rounded-full bg-secondary px-3 py-1">
                    <ThemedText className="text-xs text-subtext">{tag}</ThemedText>
                  </View>
                ))}
            </View>
          )}
        </ThemedScroller>
      )}
    </>
  );
}
