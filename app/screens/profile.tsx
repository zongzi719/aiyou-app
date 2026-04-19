import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import React, { useState, useCallback, useMemo } from 'react';
import { View, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/app/contexts/ThemeContext';
import AnimatedView from '@/components/AnimatedView';
import Avatar from '@/components/Avatar';
import Icon from '@/components/Icon';
import ThemedScroller from '@/components/ThemeScroller';
import ThemedText from '@/components/ThemedText';
import { useGlobalFloatingTabBarInset } from '@/hooks/useGlobalFloatingTabBarInset';
import { clearAuthSession } from '@/lib/authSession';
import { peekProfileCache, putProfileCache } from '@/lib/profileCache';
import {
  fetchProfile,
  uploadAvatar,
  bustAvatarCache,
  UserProfile,
  resolveProfileDisplayTagPills,
  formatAiLearningDataLine,
} from '@/services/profileApi';
import { knowledgeApi, type KnowledgeFile } from '@/services/knowledgeApi';
import { countPrivateThreads } from '@/lib/privateChatApi';

/** 设计稿 mock：待办进度（后续可对接真实统计） */
const PENDING_PROGRESS = { percent: 63, done: 3, total: 8 };

type TaskPriority = 'core' | 'important' | 'minor';

interface TodayTaskItem {
  id: string;
  title: string;
  timeRange: string;
  bullets: string[];
  priorityLabel: string;
  priority: TaskPriority;
  doneSub: number;
  totalSub: number;
}

/** 今日任务：完整日程明细 mock */
const TODAY_TASKS: TodayTaskItem[] = [
  {
    id: 't1',
    title: '产品策略会议准备',
    timeRange: '09:30 – 10:30',
    bullets: ['准备演示PPT', '整理产品数据', '确认演讲结构'],
    priorityLabel: '核心',
    priority: 'core',
    doneSub: 2,
    totalSub: 3,
  },
  {
    id: 't2',
    title: '设计产品原型',
    timeRange: '11:00 – 12:30',
    bullets: ['绘制关键流程', '对齐交互稿', '标注组件状态'],
    priorityLabel: '重要',
    priority: 'important',
    doneSub: 0,
    totalSub: 3,
  },
  {
    id: 't3',
    title: '客户回访纪要',
    timeRange: '15:00 – 15:30',
    bullets: ['整理上周反馈', '列出待办'],
    priorityLabel: '次要',
    priority: 'minor',
    doneSub: 1,
    totalSub: 2,
  },
];

function SectionTitle({ title }: { title: string }) {
  return (
    <View className="mb-3 mt-1 flex-row items-center">
      <View className="mr-2 h-4 w-1 rounded-full bg-[#C9A227]" />
      <ThemedText className="text-base font-semibold">{title}</ThemedText>
    </View>
  );
}

function priorityPillClass(p: TaskPriority): string {
  switch (p) {
    case 'core':
      return 'bg-amber-500/20 border border-amber-500/40';
    case 'important':
      return 'bg-amber-600/20 border border-amber-600/35';
    case 'minor':
      return 'bg-stone-600/35 border border-stone-500/30';
    default:
      return 'bg-secondary border border-border';
  }
}

function priorityTextClass(p: TaskPriority): string {
  switch (p) {
    case 'core':
      return 'text-amber-400';
    case 'important':
      return 'text-amber-200';
    case 'minor':
      return 'text-stone-300';
    default:
      return 'text-subtext';
  }
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const listBottomPad = useGlobalFloatingTabBarInset();
  const [profile, setProfile] = useState<UserProfile | null>(() => peekProfileCache());
  const [loading, setLoading] = useState(() => peekProfileCache() === null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [learningStats, setLearningStats] = useState<{ docs: number; convs: number } | null>(null);

  const headerGradient = useMemo(
    () =>
      (isDark ? ['#12281c', '#0a120e', '#000000'] : ['#dce8e0', '#eef2ef', '#f5f5f5']) as [
        string,
        string,
        string,
      ],
    [isDark]
  );

  const sheetBg = isDark ? 'bg-[#141416]' : 'bg-secondary';
  const cardBg = isDark ? 'bg-[#2C2C2E]' : 'bg-background';
  const progressTrack = isDark ? 'bg-[#3A3A3C]' : 'bg-border';

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const cached = peekProfileCache();
      if (cached) {
        setProfile(cached);
        setLoading(false);
      } else {
        setLoading(true);
      }
      fetchProfile()
        .then((p) => {
          if (!cancelled) {
            putProfileCache(p);
            setProfile(p);
          }
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

      void (async () => {
        try {
          const [fileRes, convs] = await Promise.all([
            knowledgeApi.getFiles().catch(() => ({ files: [] as KnowledgeFile[], total: 0 })),
            countPrivateThreads().catch(() => 0),
          ]);
          const docs =
            typeof fileRes.total === 'number' && fileRes.total > 0
              ? fileRes.total
              : fileRes.files.length;
          if (!cancelled) setLearningStats({ docs, convs });
        } catch {
          if (!cancelled) setLearningStats({ docs: 0, convs: 0 });
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [])
  );

  const tagPills = useMemo(() => resolveProfileDisplayTagPills(profile?.tags), [profile?.tags]);

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
      putProfileCache(updated);
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

  const displayName = profile?.display_name || profile?.username || '用户';

  return (
    <AnimatedView
      className="flex-1 bg-background"
      animation="fadeIn"
      duration={350}
      playOnlyOnce={false}>
      <ThemedScroller
        className="!px-0"
        footerSpacer={false}
        contentContainerStyle={{ paddingBottom: listBottomPad }}
        showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={headerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.2, y: 1 }}
          className="w-full pb-10"
          style={{ paddingTop: insets.top + 8 }}>
          <View className="mb-4 flex-row justify-end px-4">
            <TouchableOpacity
              onPress={() => router.push('/screens/edit-profile')}
              hitSlop={12}
              className="p-1"
              accessibilityLabel="设置">
              <Icon name="Settings" size={22} color={isDark ? '#ffffff' : '#1a1a1a'} />
            </TouchableOpacity>
          </View>

          <View className="flex-row items-start gap-4 px-4">
            <TouchableOpacity
              onPress={handleAvatarPress}
              activeOpacity={0.8}
              disabled={avatarUploading || loading}
              className="relative">
              <Avatar
                src={
                  profile?.avatar_url
                    ? bustAvatarCache(profile.avatar_url)
                    : require('@/assets/img/thomino.jpg')
                }
                size="xl"
              />
              <View className="bg-highlight absolute bottom-0 right-0 h-7 w-7 items-center justify-center rounded-full border-2 border-background">
                {avatarUploading ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Icon name="Camera" size={13} color="white" />
                )}
              </View>
            </TouchableOpacity>

            <View className="flex-1 pt-0.5">
              {loading ? (
                <ActivityIndicator />
              ) : (
                <>
                  <ThemedText className="text-2xl font-bold tracking-wide">
                    {displayName}
                  </ThemedText>
                  <View className="mt-2 flex-row flex-wrap gap-2">
                    {tagPills.map((tag) => (
                      <View
                        key={tag}
                        className={
                          isDark
                            ? 'rounded-full border border-white/10 bg-white/10 px-3 py-1.5'
                            : 'rounded-full border border-black/10 bg-black/5 px-3 py-1.5'
                        }>
                        <ThemedText className="text-xs text-subtext">{tag}</ThemedText>
                      </View>
                    ))}
                  </View>
                  <ThemedText className="mt-2 text-xs leading-5 text-subtext">
                    {learningStats
                      ? formatAiLearningDataLine(learningStats.docs, learningStats.convs)
                      : '加载中…'}
                  </ThemedText>
                </>
              )}
            </View>
          </View>
        </LinearGradient>

        <View className={`${sheetBg} -mt-5 rounded-t-[28px] px-4 pb-4 pt-6`}>
          <TouchableOpacity
            onPress={() => router.push('/screens/memory?tab=inspiration')}
            activeOpacity={0.8}
            className={`mb-4 flex-row items-center justify-between rounded-2xl px-4 py-3 ${cardBg}`}>
            <View className="flex-row items-center gap-2">
              <Icon name="NotebookPen" size={18} />
              <ThemedText className="text-sm font-semibold">灵感笔记与日程</ThemedText>
            </View>
            <Icon name="ChevronRight" size={18} className="text-subtext" />
          </TouchableOpacity>

          <SectionTitle title="待处理事务" />
          <View className="mb-6 flex-row items-center gap-3">
            <ThemedText className="min-w-[40px] text-sm font-semibold text-[#C9A227]">
              {PENDING_PROGRESS.percent}%
            </ThemedText>
            <View className={`h-2 flex-1 overflow-hidden rounded-full ${progressTrack}`}>
              <View
                className="h-full rounded-full bg-[#C9A227]"
                style={{ width: `${PENDING_PROGRESS.percent}%` }}
              />
            </View>
            <ThemedText className="text-sm font-semibold text-[#C9A227]">
              {PENDING_PROGRESS.done}/{PENDING_PROGRESS.total}
            </ThemedText>
          </View>

          <View className="mt-4">
            <SectionTitle title="今日任务" />
            <ThemedText className="-mt-2 mb-3 text-xs text-subtext">今日完整日程安排</ThemedText>
          </View>

          {TODAY_TASKS.map((task) => (
            <View key={task.id} className={`mb-3 rounded-2xl p-4 ${cardBg}`}>
              <View className="flex-row items-start justify-between gap-2">
                <ThemedText className="flex-1 text-base font-semibold text-[#D4AF37]">
                  {task.title}
                </ThemedText>
                <View className="shrink-0 flex-row items-center gap-1">
                  <Icon name="Clock" size={14} color={isDark ? '#a3a3a3' : '#737373'} />
                  <ThemedText className="text-xs text-subtext">{task.timeRange}</ThemedText>
                </View>
              </View>
              <View className="mt-3 gap-1.5">
                {task.bullets.map((line) => (
                  <ThemedText key={line} className="text-sm leading-5 text-subtext">
                    · {line}
                  </ThemedText>
                ))}
              </View>
              <View className="mt-4 flex-row items-center justify-between">
                <View className={`rounded-full px-3 py-1 ${priorityPillClass(task.priority)}`}>
                  <ThemedText className={`text-xs font-medium ${priorityTextClass(task.priority)}`}>
                    {task.priorityLabel}
                  </ThemedText>
                </View>
                <ThemedText className="text-xs text-subtext">
                  {task.doneSub} / {task.totalSub} 完成
                </ThemedText>
              </View>
            </View>
          ))}

          <TouchableOpacity
            onPress={handleLogout}
            activeOpacity={0.85}
            className="mb-2 mt-6 w-full items-center justify-center rounded-xl bg-red-600 py-3.5">
            <ThemedText className="text-sm font-semibold text-white">退出登录</ThemedText>
          </TouchableOpacity>
        </View>
      </ThemedScroller>
    </AnimatedView>
  );
}
