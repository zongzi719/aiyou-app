import { useDrawerStatus } from '@react-navigation/drawer';
import { router } from 'expo-router';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, TouchableOpacity, ActivityIndicator, RefreshControl, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Avatar from './Avatar';
import Icon from './Icon';
import ThemedScroller from './ThemeScroller';
import ThemedText from './ThemedText';

import useThemeColors from '@/app/contexts/ThemeColors';
import { hasPrivateChatBackendSession } from '@/lib/authSession';
import {
  peekPrivateThreadsCache,
  putPrivateThreadsCache,
  privateThreadsCacheStale,
  LIST_CACHE_POLL_INTERVAL_MS,
} from '@/lib/listDataCache';
import { searchPrivateThreads, type ThreadSummary } from '@/lib/privateChatApi';
import { peekProfileCache, putProfileCache } from '@/lib/profileCache';
import { fetchProfile, bustAvatarCache, type UserProfile } from '@/services/profileApi';

type Props = {
  drawerNavigation: { closeDrawer: () => void };
};

type ThreadGroup = {
  dateKey: string;
  items: ThreadSummary[];
  sortTs: number;
};

/** 侧边栏对齐率进度（0–100），与 UI 稿一致 */
const DEFAULT_ALIGNMENT_RATE = 75;
const SIDEBAR_ALIGNMENT_LEVEL = 1;

function toDateLabel(value?: string): string {
  if (!value) return '更早';
  const t = Date.parse(value);
  if (Number.isNaN(t)) return '更早';
  const d = new Date(t);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const dayStart = new Date(d);
  dayStart.setHours(0, 0, 0, 0);
  if (dayStart.getTime() === today.getTime()) return '今天';
  if (dayStart.getTime() === yesterday.getTime()) return '昨天';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

function toSortTs(value?: string): number {
  if (!value) return 0;
  const t = Date.parse(value);
  return Number.isNaN(t) ? 0 : t;
}

function groupThreadsByDate(threads: ThreadSummary[]): ThreadGroup[] {
  const map = new Map<string, ThreadGroup>();
  threads.forEach((thread) => {
    const dateKey = toDateLabel(thread.updated_at);
    const ts = toSortTs(thread.updated_at);
    const existed = map.get(dateKey);
    if (!existed) {
      map.set(dateKey, { dateKey, items: [thread], sortTs: ts });
      return;
    }
    existed.items.push(thread);
    if (ts > existed.sortTs) existed.sortTs = ts;
  });
  return Array.from(map.values())
    .map((group) => ({
      ...group,
      items: [...group.items].sort((a, b) => toSortTs(b.updated_at) - toSortTs(a.updated_at)),
    }))
    .sort((a, b) => b.sortTs - a.sortTs);
}

/** 侧边栏「音色调试 / 专家通话调试」等；生产包可设 EXPO_PUBLIC_ENABLE_SIDEBAR_DEBUG=true */
const SHOW_SIDEBAR_DEBUG_ENTRIES =
  (typeof __DEV__ !== 'undefined' && __DEV__) ||
  process.env.EXPO_PUBLIC_ENABLE_SIDEBAR_DEBUG === 'true';

const SHOW_NLS_RT_DEBUG =
  (typeof __DEV__ !== 'undefined' && __DEV__) ||
  process.env.EXPO_PUBLIC_ENABLE_NLS_DEBUG === 'true';

function filterThreadsByQuery(threads: ThreadSummary[], query: string): ThreadSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return threads;
  return threads.filter((thread) => {
    const title = (thread.title || '').toLowerCase();
    const dateLabel = toDateLabel(thread.updated_at).toLowerCase();
    const dateDash = dateLabel.replace(/\//g, '-');
    const dateCompact = dateLabel.replace(/\//g, '');
    return (
      title.includes(q) || dateLabel.includes(q) || dateDash.includes(q) || dateCompact.includes(q)
    );
  });
}

export default function CustomDrawerContent({ drawerNavigation }: Props) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const drawerStatus = useDrawerStatus();
  const [privateThreads, setPrivateThreads] = useState<ThreadSummary[]>(
    () => peekPrivateThreadsCache() ?? []
  );
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [threadsRefreshing, setThreadsRefreshing] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(() => peekProfileCache());
  const [searchText, setSearchText] = useState('');

  const loadThreads = useCallback(async (force: boolean) => {
    const cached = peekPrivateThreadsCache();
    if (cached != null) {
      setPrivateThreads(cached);
    }
    if (!force && !privateThreadsCacheStale()) {
      setThreadsLoading(false);
      return;
    }
    if (cached == null || cached.length === 0) {
      setThreadsLoading(true);
    }
    try {
      if (!(await hasPrivateChatBackendSession())) {
        setPrivateThreads([]);
        return;
      }
      const list = await searchPrivateThreads({ limit: 40 });
      putPrivateThreadsCache(list);
      setPrivateThreads(list);
    } finally {
      setThreadsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (drawerStatus !== 'open') return;
    let cancelled = false;
    const cached = peekProfileCache();
    if (cached) setProfile(cached);

    void (async () => {
      await loadThreads(false);
      if (cancelled) return;
      try {
        const prof = await fetchProfile().catch(() => null);
        if (!cancelled && prof) {
          putProfileCache(prof);
          setProfile(prof);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [drawerStatus, loadThreads]);

  useEffect(() => {
    if (drawerStatus !== 'open') return;
    const id = setInterval(() => {
      void loadThreads(false);
    }, LIST_CACHE_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [drawerStatus, loadThreads]);

  const onThreadsPullRefresh = useCallback(async () => {
    setThreadsRefreshing(true);
    try {
      await loadThreads(true);
    } finally {
      setThreadsRefreshing(false);
    }
  }, [loadThreads]);

  const groupedThreads = useMemo(
    () => groupThreadsByDate(filterThreadsByQuery(privateThreads, searchText)),
    [privateThreads, searchText]
  );
  const profileName = profile?.display_name || profile?.username || '';

  return (
    <View
      className="flex-1 bg-background px-global"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <ThemedScroller
        className="flex-1 px-0"
        bounces
        refreshControl={
          <RefreshControl
            refreshing={threadsRefreshing}
            onRefresh={onThreadsPullRefresh}
            tintColor={colors.highlight}
          />
        }>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.push('/screens/profile')}
          className="flex-row items-center pb-5 pt-4">
          {profile ? (
            <>
              <Avatar
                src={
                  profile.avatar_url
                    ? bustAvatarCache(profile.avatar_url)
                    : require('@/assets/img/thomino.jpg')
                }
                name={profile.display_name || profile.username}
                size="md"
              />
              <View className="ml-3 flex-1 justify-center">
                <ThemedText className="text-[26px] font-semibold tracking-[0.4px] text-primary">
                  {profileName}
                </ThemedText>
                <View className="mt-1 flex-row items-center justify-between">
                  <ThemedText className="text-sm text-subtext">对齐率</ThemedText>
                  <ThemedText className="text-sm text-subtext">Lv.{SIDEBAR_ALIGNMENT_LEVEL}</ThemedText>
                </View>
                <View className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/25">
                  <View
                    className="h-full rounded-full bg-[#F2C94C]"
                    style={{
                      width: `${Math.max(0, Math.min(100, DEFAULT_ALIGNMENT_RATE))}%`,
                    }}
                  />
                </View>
              </View>
            </>
          ) : (
            <View className="flex-row items-center">
              <View className="h-12 w-12 items-center justify-center rounded-full bg-secondary">
                <ActivityIndicator size="small" color={colors.highlight} />
              </View>
              <View className="ml-3 h-12 flex-1 justify-center">
                <ActivityIndicator size="small" color={colors.highlight} />
              </View>
            </View>
          )}
        </TouchableOpacity>

        <View className="border-border/70 mb-3 border-b" />

        {SHOW_SIDEBAR_DEBUG_ENTRIES ? (
          <>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                drawerNavigation.closeDrawer();
                router.push('/screens/voice-timbre-debug');
              }}
              className="mb-3 flex-row items-center justify-between rounded-2xl border border-[#B98C44]/40 bg-[#1E2A39] px-4 py-3">
              <View className="flex-row items-center gap-2">
                <Icon name="Mic" size={16} color="#E9D6A4" />
                <ThemedText className="text-sm font-semibold text-[#E9D6A4]">音色调试</ThemedText>
              </View>
              <Icon name="ChevronRight" size={16} color="rgba(233,214,164,0.9)" />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                drawerNavigation.closeDrawer();
                router.push('/screens/expert-call-workflow-debug');
              }}
              className="border-[#4A90D9]/35 mb-3 flex-row items-center justify-between rounded-2xl border bg-[#1A2635] px-4 py-3">
              <View className="flex-row items-center gap-2">
                <Icon name="Phone" size={16} color="#A8C8E8" />
                <ThemedText className="text-sm font-semibold text-[#A8C8E8]">
                  专家通话调试
                </ThemedText>
              </View>
              <Icon name="ChevronRight" size={16} color="rgba(168,200,232,0.9)" />
            </TouchableOpacity>

            {SHOW_NLS_RT_DEBUG ? (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  drawerNavigation.closeDrawer();
                  router.push('/screens/aliyun-realtime-asr-debug');
                }}
                className="border-[#4A90D9]/35 mb-3 flex-row items-center justify-between rounded-2xl border bg-[#1A2635] px-4 py-3">
                <View className="flex-row items-center gap-2">
                  <Icon name="AudioLines" size={16} color="#A8C8E8" />
                  <ThemedText className="text-sm font-semibold text-[#A8C8E8]">
                    实时语音调试
                  </ThemedText>
                </View>
                <Icon name="ChevronRight" size={16} color="rgba(168,200,232,0.9)" />
              </TouchableOpacity>
            ) : null}
          </>
        ) : null}

        <View className="mb-3">
          <View className="h-10 flex-row items-center rounded-full bg-[#1E2A39] px-4">
            <Icon name="Search" size={16} color="rgba(255,255,255,0.4)" />
            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              className="ml-2 flex-1 text-sm text-primary"
              placeholder="搜索标题或者日期..."
              placeholderTextColor="rgba(255,255,255,0.35)"
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>
        </View>

        {threadsLoading ? (
          <View className="items-center py-4">
            <ActivityIndicator color={colors.highlight} />
          </View>
        ) : null}
        {!threadsLoading && groupedThreads.length > 0 ? (
          <View className="pb-2">
            {groupedThreads.map((group) => (
              <View key={group.dateKey} className="mb-3">
                <ThemedText className="mb-2 text-[22px] font-semibold text-[#E9D6A4]">
                  {group.dateKey}
                </ThemedText>
                {group.items.map((t) => (
                  <TouchableOpacity
                    key={t.thread_id}
                    className="py-2 pr-2"
                    onPress={() => {
                      drawerNavigation.closeDrawer();
                      router.replace({
                        pathname: '/',
                        params: { openThreadId: t.thread_id },
                      });
                    }}>
                    <ThemedText
                      className="text-[16px] leading-[24px] text-primary"
                      numberOfLines={1}>
                      {t.title}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>
        ) : null}
        {!threadsLoading && groupedThreads.length === 0 ? (
          <View className="py-8">
            <ThemedText className="text-base text-subtext">暂无历史对话</ThemedText>
          </View>
        ) : null}
      </ThemedScroller>
    </View>
  );
}
