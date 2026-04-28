import { useFocusEffect, useLocalSearchParams, router } from 'expo-router';
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  RefreshControl,
  Alert,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import useThemeColors from '@/app/contexts/ThemeColors';
import Avatar from '@/components/Avatar';
import { Chip } from '@/components/Chip';
import Icon, { IconName } from '@/components/Icon';
import MemoryTuneModal from '@/components/MemoryTuneModal';
import ThemedText from '@/components/ThemedText';
import { useGlobalFloatingTabBarInset } from '@/hooks/useGlobalFloatingTabBarInset';
import { peekProfileCache, putProfileCache } from '@/lib/profileCache';
import { countPrivateThreads } from '@/lib/privateChatApi';
import {
  peekMemoryMemories,
  putMemoryMemories,
  memoryMemoriesStale,
  peekMemoryDocuments,
  putMemoryDocuments,
  memoryDocumentsStale,
  LIST_CACHE_POLL_INTERVAL_MS,
} from '@/lib/listDataCache';
import {
  clearPendingMemoryReview,
  getPendingMemoryReview,
  subscribePendingMemoryReview,
  type PendingMemoryReview,
} from '@/lib/pendingMemoryReview';
import {
  deleteInspirationNote,
  deleteSchedule,
  listInspirationNotes,
  listSchedules,
  NotesApiError,
  type InspirationNote,
  type Schedule,
  updateScheduleTask,
} from '@/lib/notesApi';
import {
  memoryApi,
  UserMemory,
  HistoryDocument,
  getCategoryIcon,
  getCategoryColor,
  getMimeLabel,
  getMimeColor,
  formatMemoryDate,
  translateCategory,
  extractCategories,
  confidenceLabel,
  resolveMemoryTime,
  hasRawMemoryTime,
} from '@/services/memoryApi';
import { formatScheduleTimeForDisplay } from '@/utils/date';
import {
  fetchProfile,
  bustAvatarCache,
  resolveProfileDisplayTagPills,
  formatAiLearningDataLine,
} from '@/services/profileApi';
import { knowledgeApi, type KnowledgeFile } from '@/services/knowledgeApi';
import { AI_CEO_PROFILE } from '@/lib/aiCeoProfile';

// ─── Tab types ────────────────────────────────────────────────────────────────

type TabKey = '灵感笔记' | '用户记忆' | '历史文档';
const TABS: TabKey[] = ['灵感笔记', '用户记忆', '历史文档'];
type NotesTabKey = '灵感笔记' | '日程安排';
type TopPageKey = 'aiCeo' | 'memory';

const NOTES_TABS: NotesTabKey[] = ['灵感笔记', '日程安排'];

interface TopSwitchProps {
  activePage: TopPageKey;
  onChange: (page: TopPageKey) => void;
  topInset: number;
  onTunePress: () => void;
  onInitModelPress?: () => void;
}

const TopSwitch = ({
  activePage,
  onChange,
  topInset,
  onTunePress,
  onInitModelPress,
}: TopSwitchProps) => {
  const labels: { key: TopPageKey; label: string }[] = [
    { key: 'aiCeo', label: 'AI CEO' },
    { key: 'memory', label: '记忆库' },
  ];

  return (
    <View
      className="mb-4 flex-row items-center justify-between px-global"
      style={{ paddingTop: topInset + 8 }}>
      <View className="flex-row items-center gap-4">
        {labels.map((item) => {
          const isActive = item.key === activePage;
          return (
            <TouchableOpacity
              key={item.key}
              onPress={() => onChange(item.key)}
              activeOpacity={0.8}
              className="pb-1">
              <ThemedText
                className={`text-2xl font-bold ${isActive ? 'text-primary' : 'text-subtext'}`}>
                {item.label}
              </ThemedText>
              {isActive ? <View className="mt-1 h-0.5 rounded-full bg-primary" /> : null}
            </TouchableOpacity>
          );
        })}
      </View>

      <View className="flex-row items-center gap-2">
        {activePage === 'aiCeo' && onInitModelPress ? (
          <TouchableOpacity
            activeOpacity={0.85}
            className="rounded-full border border-[#B98C44]/60 bg-[#081A33] px-3 py-1.5"
            onPress={onInitModelPress}>
            <ThemedText className="text-[14px] font-semibold text-[#F5DCA8]">初始化模型</ThemedText>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          activeOpacity={0.85}
          className="rounded-full bg-secondary px-3 py-1.5"
          onPress={onTunePress}>
          <ThemedText className="text-[14px] font-semibold text-primary">记忆微调</ThemedText>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const AiCeoTab = ({ contentBottomPad }: { contentBottomPad: number }) => {
  const [profile, setProfile] = useState(() => peekProfileCache());
  const [learningStats, setLearningStats] = useState<{ docs: number; convs: number } | null>(null);
  const score = AI_CEO_PROFILE.dimensions;

  const tagPills = useMemo(() => resolveProfileDisplayTagPills(profile?.tags), [profile?.tags]);
  const displayName = profile?.display_name || profile?.username || '用户';

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const cached = peekProfileCache();
      if (cached) setProfile(cached);
      fetchProfile()
        .then((p) => {
          if (!cancelled) {
            putProfileCache(p);
            setProfile(p);
          }
        })
        .catch(() => {});

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

  return (
    <ScrollView
      className="flex-1"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: contentBottomPad }}>
      <View className="mx-global mb-4 rounded-3xl border border-[#B98C44] bg-[#081A33] p-4">
        <View className="flex-row items-start gap-4">
          <Avatar
            src={
              profile?.avatar_url
                ? bustAvatarCache(profile.avatar_url)
                : require('@/assets/img/thomino.jpg')
            }
            size="xl"
          />
          <View className="flex-1 pt-0.5">
            <ThemedText className="text-2xl font-bold tracking-wide text-white">
              {displayName}
            </ThemedText>
            <View className="mt-2 flex-row flex-wrap gap-2">
              {tagPills.map((tag) => (
                <View
                  key={tag}
                  className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5">
                  <ThemedText className="text-[14px] text-white/75">{tag}</ThemedText>
                </View>
              ))}
            </View>
            <ThemedText className="mt-2 text-[14px] leading-5 text-white/60">
              {learningStats
                ? formatAiLearningDataLine(learningStats.docs, learningStats.convs)
                : '加载中…'}
            </ThemedText>
          </View>
        </View>

        <View className="mt-4 rounded-2xl border border-[#B98C44] bg-black/30 p-3">
          <View className="mb-2 flex-row items-center justify-between">
            <ThemedText className="text-[16px] font-semibold text-[#F5DCA8]">对齐率</ThemedText>
            <ThemedText className="text-2xl font-bold text-[#F5DCA8]">
              Lv.{AI_CEO_PROFILE.level}
            </ThemedText>
          </View>
          <View className="mb-2 h-2 overflow-hidden rounded-full bg-white/20">
            <View
              className="h-full rounded-full bg-[#B98C44]"
              style={{ width: `${AI_CEO_PROFILE.alignmentBarPercent}%` }}
            />
          </View>
          <View className="mb-2 flex-row items-center justify-between">
            <ThemedText className="text-[14px] text-[#D4D9E5]">
              预计再互动{AI_CEO_PROFILE.nextLevelMins}分钟可升至下一等级
            </ThemedText>
          </View>
          <View className="flex-row items-center justify-between border-t border-[#B98C44]/40 pt-2">
            <ThemedText className="text-[16px] text-[#D4D9E5]">模型匹配度</ThemedText>
            <ThemedText className="text-xl font-bold text-[#F5DCA8]">
              {AI_CEO_PROFILE.match}%
            </ThemedText>
          </View>
          <View className="mt-1 flex-row items-center justify-between">
            <ThemedText className="text-[16px] text-[#D4D9E5]">MBTI</ThemedText>
            <ThemedText className="text-xl font-bold text-[#F5DCA8]">
              {AI_CEO_PROFILE.mbti}
            </ThemedText>
          </View>
          <View className="mt-3 flex-row border-t border-[#B98C44]/40 pt-3">
            {AI_CEO_PROFILE.strengths.map((item) => (
              <View key={item} className="flex-1 items-center">
                <ThemedText className="text-[14px] text-[#8A97AF]">核心关注</ThemedText>
                <ThemedText className="mt-1 text-[16px] font-semibold text-white">{item}</ThemedText>
              </View>
            ))}
          </View>
        </View>
      </View>

      <View className="mx-global mb-4 rounded-3xl bg-secondary p-4">
        <View className="mb-3 flex-row gap-5">
          <ThemedText className="border-b border-primary pb-1 text-base font-semibold text-primary">
            认知模型
          </ThemedText>
          <ThemedText className="text-base text-subtext">语言风格</ThemedText>
          <ThemedText className="text-base text-subtext">战略方法</ThemedText>
          <ThemedText className="text-base text-subtext">决策逻辑</ThemedText>
        </View>
        <ThemedText className="mb-4 text-[16px] text-[#D7B469]">模型完善度</ThemedText>

        <View className="bg-background/60 rounded-2xl p-4">
          {score.map((item) => (
            <View key={item.label} className="mb-3">
              <View className="mb-1 flex-row items-center justify-between">
                <ThemedText className="text-[16px] text-primary">{item.label}</ThemedText>
                <ThemedText className="text-[16px] font-semibold text-[#D7B469]">
                  {item.value}%
                </ThemedText>
              </View>
              <View className="h-2 overflow-hidden rounded-full bg-secondary">
                <View
                  className="h-full rounded-full bg-[#7E7AF7]"
                  style={{ width: `${item.value}%` }}
                />
              </View>
            </View>
          ))}
        </View>

        <ThemedText className="mt-4 text-base leading-7 text-primary">
          {AI_CEO_PROFILE.insight}
        </ThemedText>
      </View>
    </ScrollView>
  );
};

// ─── Tab Bar ─────────────────────────────────────────────────────────────────

interface TabBarProps {
  active: TabKey;
  onChange: (tab: TabKey) => void;
}

const TabBar = ({ active, onChange }: TabBarProps) => {
  const colors = useThemeColors();
  return (
    <View className="mx-global mb-4 flex-row rounded-full bg-secondary p-1">
      {TABS.map((tab) => {
        const isActive = tab === active;
        return (
          <TouchableOpacity
            key={tab}
            onPress={() => onChange(tab)}
            activeOpacity={0.7}
            className="flex-1 items-center rounded-full py-2"
            style={
              isActive
                ? { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }
                : undefined
            }>
            <ThemedText
              className={`text-[16px] font-semibold ${isActive ? 'text-primary' : 'text-subtext'}`}>
              {tab}
            </ThemedText>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

// ─── Search Bar ───────────────────────────────────────────────────────────────

interface SearchBarProps {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
}

const SearchBar = ({ value, onChangeText, placeholder }: SearchBarProps) => {
  const colors = useThemeColors();
  return (
    <View className="mx-global mb-4 h-11 flex-row items-center rounded-full bg-secondary px-4">
      <Icon name="Search" size={18} />
      <TextInput
        className="ml-2 flex-1 text-[16px] text-primary"
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        value={value}
        onChangeText={onChangeText}
        returnKeyType="search"
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => onChangeText('')}>
          <Icon name="X" size={16} />
        </TouchableOpacity>
      )}
    </View>
  );
};

// ─── 用户记忆 ─────────────────────────────────────────────────────────────────

interface MemoryCardProps {
  memory: UserMemory;
  onDelete: (id: string) => void;
}

const MemoryCard = ({ memory, onDelete }: MemoryCardProps) => {
  const iconName = getCategoryIcon(memory.category) as IconName;
  const iconColor = getCategoryColor(memory.category);
  const confLabel = confidenceLabel(memory.confidence);
  const timeIso = resolveMemoryTime(memory);
  const timeLabel = timeIso ? formatMemoryDate(timeIso) : '';

  const openDetail = () => {
    router.push(`/screens/memory-user-detail?id=${encodeURIComponent(memory.id)}`);
  };

  const handleLongPress = () => {
    if (memory.deletable === false) return;
    Alert.alert(translateCategory(memory.category), undefined, [
      {
        text: '删除',
        style: 'destructive',
        onPress: () => onDelete(memory.id),
      },
      { text: '取消', style: 'cancel' },
    ]);
  };

  return (
    <TouchableOpacity
      onPress={openDetail}
      onLongPress={handleLongPress}
      activeOpacity={0.75}
      className="mx-global mb-3 rounded-2xl bg-secondary px-4 py-4">
      <View className="flex-row items-start">
        <View
          className="mr-3 mt-0.5 h-9 w-9 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${iconColor}22` }}>
          <Icon name={iconName} size={18} color={iconColor} />
        </View>
        <View className="flex-1">
          <ThemedText className="mb-1 text-[16px] font-bold text-primary">
            {translateCategory(memory.category)}
          </ThemedText>

          {/* 置信度 · 创建时间 */}
          {confLabel || timeLabel ? (
            <View className="mb-2 flex-row flex-wrap items-center gap-x-3">
              {confLabel ? (
                <View className="flex-row items-center gap-x-1">
                  <ThemedText className="text-[14px] text-subtext">置信度</ThemedText>
                  <ThemedText className="text-[14px] font-semibold text-primary">
                    {confLabel}
                  </ThemedText>
                </View>
              ) : null}
              {timeLabel ? (
                <View className="flex-row items-center gap-x-1">
                  <ThemedText className="text-[14px] text-subtext">创建时间</ThemedText>
                  <ThemedText className="text-[14px] text-subtext">{timeLabel}</ThemedText>
                </View>
              ) : null}
            </View>
          ) : null}

          <ThemedText className="text-[16px] leading-6 text-subtext">{memory.content}</ThemedText>
        </View>
      </View>
    </TouchableOpacity>
  );
};

interface MemoriesTabProps {
  contentBottomPad: number;
}

const MemoriesTab = ({ contentBottomPad }: MemoriesTabProps) => {
  const colors = useThemeColors();
  const [memories, setMemories] = useState<UserMemory[]>(() => peekMemoryMemories() ?? []);
  const [activeCategory, setActiveCategory] = useState('全部');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (force = false) => {
    if (!force && !memoryMemoriesStale()) {
      const cached = peekMemoryMemories();
      if (cached) setMemories(cached);
      return;
    }
    try {
      const list = await memoryApi.getMemories();
      const missingRawTime = list.filter((m) => !hasRawMemoryTime(m));
      if (missingRawTime.length > 0) {
        console.warn(
          '[memory] 以下用户记忆缺少后端原始时间字段（已使用兜底时间显示）:',
          missingRawTime.map((m) => ({
            id: m.id,
            category: m.category,
            contentPreview: m.content.slice(0, 40),
          }))
        );
      }
      putMemoryMemories(list);
      setMemories(list);
    } catch {
      if (!peekMemoryMemories()?.length) setMemories([]);
    }
  }, []);

  const onPullRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load(true);
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load(false);
    }, [load])
  );

  useEffect(() => {
    const id = setInterval(() => {
      load(false);
    }, LIST_CACHE_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load]);

  // 从实际数据动态提取分类列表
  const categories = extractCategories(memories);

  const memorySortTime = (m: UserMemory) => {
    const iso = resolveMemoryTime(m);
    if (!iso) return Number.NEGATIVE_INFINITY;
    const t = new Date(iso).getTime();
    return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
  };

  const filtered = memories
    .filter((m) => {
      const matchCat = activeCategory === '全部' || m.category === activeCategory;
      const matchSearch = search
        ? m.content.toLowerCase().includes(search.toLowerCase()) ||
          translateCategory(m.category).includes(search)
        : true;
      return matchCat && matchSearch;
    })
    .sort((a, b) => memorySortTime(b) - memorySortTime(a));

  const handleDelete = async (id: string) => {
    setMemories((prev) => {
      const next = prev.filter((m) => m.id !== id);
      putMemoryMemories(next);
      return next;
    });
    try {
      await memoryApi.deleteMemory(id);
    } catch {
      /* ignore */
    }
  };

  return (
    <FlatList
      data={filtered}
      keyExtractor={(item) => item.id}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onPullRefresh}
          tintColor={colors.highlight}
        />
      }
      ListHeaderComponent={
        <>
          <SearchBar value={search} onChangeText={setSearch} placeholder="搜索记忆" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mb-4"
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
            {categories.map((cat) => (
              <Chip
                key={cat}
                label={cat === '全部' ? '全部' : translateCategory(cat)}
                isSelected={activeCategory === cat}
                onPress={() => setActiveCategory(cat)}
                size="sm"
              />
            ))}
          </ScrollView>
        </>
      }
      renderItem={({ item }) => <MemoryCard memory={item} onDelete={handleDelete} />}
      ListEmptyComponent={
        <View className="items-center py-16">
          <Icon name="Brain" size={44} />
          <ThemedText className="mt-3 text-subtext">暂无记忆</ThemedText>
        </View>
      }
      contentContainerStyle={{ paddingBottom: contentBottomPad }}
    />
  );
};

interface InspirationListTabProps {
  contentBottomPad: number;
  initialNotesTab?: NotesTabKey;
}

const InspirationListTab = ({ contentBottomPad, initialNotesTab }: InspirationListTabProps) => {
  const colors = useThemeColors();
  const [activeNotesTab, setActiveNotesTab] = useState<NotesTabKey>(initialNotesTab ?? '灵感笔记');
  const [notes, setNotes] = useState<InspirationNote[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [noteRows, scheduleRows] = await Promise.all([
        listInspirationNotes({ limit: 100 }),
        listSchedules({ limit: 100 }),
      ]);
      setNotes(noteRows);
      setSchedules(scheduleRows);
    } catch (error) {
      const apiError = error as NotesApiError;
      Alert.alert('加载失败', apiError?.message || '请稍后重试');
      setNotes([]);
      setSchedules([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  useEffect(() => {
    if (initialNotesTab) setActiveNotesTab(initialNotesTab);
  }, [initialNotesTab]);

  const onPullRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const handleDelete = async (note: InspirationNote) => {
    Alert.alert('删除灵感', `确认删除「${note.title}」吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteInspirationNote(note.id);
            setNotes((prev) => prev.filter((row) => row.id !== note.id));
          } catch (error) {
            const apiError = error as NotesApiError;
            Alert.alert('删除失败', apiError?.message || '请稍后重试');
          }
        },
      },
    ]);
  };

  const filteredNotes = notes.filter((n) => {
    if (!search.trim()) return true;
    const keyword = search.toLowerCase();
    return (
      n.title.toLowerCase().includes(keyword) ||
      n.raw_content.toLowerCase().includes(keyword) ||
      n.ai_content?.toLowerCase().includes(keyword)
    );
  });

  const filteredSchedules = schedules.filter((s) => {
    if (!search.trim()) return true;
    const keyword = search.toLowerCase();
    const taskText = s.tasks.map((t) => t.content).join(' ');
    return (
      s.title.toLowerCase().includes(keyword) ||
      (s.description?.toLowerCase().includes(keyword) ?? false) ||
      taskText.toLowerCase().includes(keyword)
    );
  });

  const handleDeleteSchedule = (schedule: Schedule) => {
    Alert.alert('删除日程', `确认删除「${schedule.title}」吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteSchedule(schedule.id);
            setSchedules((prev) => prev.filter((row) => row.id !== schedule.id));
          } catch (error) {
            const apiError = error as NotesApiError;
            Alert.alert('删除失败', apiError?.message || '请稍后重试');
          }
        },
      },
    ]);
  };

  const handleToggleScheduleTask = async (schedule: Schedule, taskIndex: number) => {
    const current = schedule.tasks[taskIndex];
    if (!current) return;
    const next = !current.is_completed;

    setSchedules((prev) =>
      prev.map((row) =>
        row.id === schedule.id
          ? {
              ...row,
              tasks: row.tasks.map((task, idx) =>
                idx === taskIndex ? { ...task, is_completed: next } : task
              ),
            }
          : row
      )
    );

    try {
      const tasks = await updateScheduleTask(schedule.id, taskIndex, next);
      setSchedules((prev) => prev.map((row) => (row.id === schedule.id ? { ...row, tasks } : row)));
    } catch (error) {
      setSchedules((prev) =>
        prev.map((row) =>
          row.id === schedule.id
            ? {
                ...row,
                tasks: row.tasks.map((task, idx) =>
                  idx === taskIndex ? { ...task, is_completed: !next } : task
                ),
              }
            : row
        )
      );
      const apiError = error as NotesApiError;
      Alert.alert('更新失败', apiError?.message || '请稍后重试');
    }
  };

  return (
    <FlatList
      data={activeNotesTab === '灵感笔记' ? filteredNotes : filteredSchedules}
      keyExtractor={(item) => item.id}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onPullRefresh}
          tintColor={colors.highlight}
        />
      }
      ListHeaderComponent={
        <>
          <View className="mb-3 flex-row gap-2 px-global">
            {NOTES_TABS.map((tab) => (
              <Chip
                key={tab}
                label={tab}
                isSelected={activeNotesTab === tab}
                onPress={() => setActiveNotesTab(tab)}
                size="sm"
              />
            ))}
          </View>
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder={activeNotesTab === '灵感笔记' ? '搜索灵感笔记' : '搜索日程安排'}
          />
        </>
      }
      renderItem={({ item }) => {
        if (activeNotesTab === '灵感笔记') {
          const note = item as InspirationNote;
          return (
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() =>
                router.push(`/screens/memory-inspiration-detail?id=${encodeURIComponent(note.id)}`)
              }
              className="mx-global mb-3 rounded-2xl bg-secondary px-4 py-4">
              <View className="flex-row items-start gap-2">
                <View className="flex-1">
                  <ThemedText className="text-[16px] font-bold text-primary">{note.title}</ThemedText>
                  <ThemedText className="mt-1 text-[14px] text-subtext">
                    {formatMemoryDate(note.created_at)}
                  </ThemedText>
                </View>
                <TouchableOpacity onPress={() => handleDelete(note)}>
                  <Icon name="Trash2" size={16} />
                </TouchableOpacity>
              </View>
              <ThemedText className="mt-2 text-[16px] leading-6 text-subtext">
                {note.ai_content || note.raw_content || '暂无内容'}
              </ThemedText>
              {note.tags.length > 0 ? (
                <View className="mt-3 flex-row flex-wrap gap-2">
                  {note.tags.map((tag) => (
                    <View
                      key={`${note.id}-${tag}`}
                      className="rounded-full border border-border bg-background px-2 py-1">
                      <ThemedText className="text-[14px] text-subtext">#{tag}</ThemedText>
                    </View>
                  ))}
                </View>
              ) : null}
            </TouchableOpacity>
          );
        }
        const schedule = item as Schedule;
        const startShown = schedule.start_time
          ? formatScheduleTimeForDisplay(schedule.start_time)
          : '时间待定';
        const endShown = schedule.end_time ? formatScheduleTimeForDisplay(schedule.end_time) : '';
        const scheduleTimeLabel = endShown ? `${startShown} - ${endShown}` : startShown;
        return (
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() =>
              router.push(`/screens/memory-schedule-detail?id=${encodeURIComponent(schedule.id)}`)
            }
            className="mx-global mb-3 rounded-2xl bg-secondary px-4 py-4">
            <View className="flex-row items-start gap-2">
              <View className="flex-1">
                <ThemedText className="text-[16px] font-bold text-primary">{schedule.title}</ThemedText>
                <ThemedText className="mt-1 text-[14px] text-subtext">{scheduleTimeLabel}</ThemedText>
              </View>
              <TouchableOpacity onPress={() => handleDeleteSchedule(schedule)}>
                <Icon name="Trash2" size={16} />
              </TouchableOpacity>
            </View>
            {schedule.description ? (
              <ThemedText className="mt-2 text-[16px] leading-6 text-subtext">
                {schedule.description}
              </ThemedText>
            ) : null}
            {schedule.tasks.length > 0 ? (
              <View className="mt-2">
                {schedule.tasks.map((task, idx) => (
                  <TouchableOpacity
                    key={`${schedule.id}-${task.content}-${idx}`}
                    activeOpacity={0.8}
                    onPress={() => {
                      handleToggleScheduleTask(schedule, idx);
                    }}
                    className="flex-row items-center gap-2 py-1">
                    <View
                      className={`h-5 w-5 items-center justify-center rounded-full border ${
                        task.is_completed ? 'border-highlight bg-highlight' : 'border-border'
                      }`}>
                      {task.is_completed ? <Icon name="Check" size={12} color="#fff" /> : null}
                    </View>
                    <ThemedText
                      className={`text-[16px] ${task.is_completed ? 'text-subtext line-through' : 'text-primary'}`}>
                      {task.content}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            {schedule.tags.length > 0 ? (
              <View className="mt-3 flex-row flex-wrap gap-2">
                {schedule.tags.map((tag) => (
                  <View
                    key={`${schedule.id}-${tag}`}
                    className="rounded-full border border-border bg-background px-2 py-1">
                    <ThemedText className="text-[14px] text-subtext">#{tag}</ThemedText>
                  </View>
                ))}
              </View>
            ) : null}
          </TouchableOpacity>
        );
      }}
      ListEmptyComponent={
        <View className="items-center py-16">
          <Icon name={activeNotesTab === '灵感笔记' ? 'NotebookPen' : 'Calendar'} size={44} />
          <ThemedText className="mt-3 text-subtext">
            {loading
              ? '加载中...'
              : activeNotesTab === '灵感笔记'
                ? '暂无灵感笔记'
                : '暂无日程安排'}
          </ThemedText>
        </View>
      }
      contentContainerStyle={{ paddingBottom: contentBottomPad }}
    />
  );
};

// ─── 历史文档 ─────────────────────────────────────────────────────────────────

interface DocumentCardProps {
  doc: HistoryDocument;
  showTitleOnly: boolean;
}

const DocumentCard = ({ doc, showTitleOnly }: DocumentCardProps) => {
  const color = getMimeColor(doc.mime_type);
  const label = getMimeLabel(doc.mime_type);
  const openDoc = () => {
    const u = doc.source_url?.trim();
    if (u && /^https?:\/\//i.test(u)) {
      void Linking.openURL(u);
      return;
    }
    Alert.alert('提示', '暂无可打开的链接，请稍后同步或联系管理员配置历史文档接口。');
  };

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={openDoc}
      className="mx-global mb-3 overflow-hidden rounded-2xl bg-secondary">
      <View style={{ backgroundColor: color }} className="flex-row items-center px-4 py-2.5">
        <ThemedText className="flex-1 text-[16px] font-bold text-white" numberOfLines={1}>
          {doc.title}
        </ThemedText>
        <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => {}}>
          <Icon name="MoreHorizontal" size={18} color="white" />
        </TouchableOpacity>
      </View>
      {!showTitleOnly && (
        <View className="flex-row px-4 py-3">
          <View className="mr-3 flex-1">
            <ThemedText className="text-[16px] leading-6 text-subtext" numberOfLines={3}>
              {doc.preview}
            </ThemedText>
            <ThemedText className="mt-2 text-[14px] text-subtext">
              {formatMemoryDate(doc.created_at)}
            </ThemedText>
          </View>
          <View
            style={{ backgroundColor: color }}
            className="h-16 w-14 items-center justify-center rounded-xl">
            <ThemedText className="text-[16px] font-bold text-white">{label}</ThemedText>
          </View>
        </View>
      )}
      {showTitleOnly && (
        <View className="px-4 py-2">
          <ThemedText className="text-[14px] text-subtext">
            {formatMemoryDate(doc.created_at)}
          </ThemedText>
        </View>
      )}
    </TouchableOpacity>
  );
};

interface DocumentsTabProps {
  contentBottomPad: number;
}

const DocumentsTab = ({ contentBottomPad }: DocumentsTabProps) => {
  const colors = useThemeColors();
  const [documents, setDocuments] = useState<HistoryDocument[]>(() => peekMemoryDocuments() ?? []);
  const [search, setSearch] = useState('');
  const [showTitleOnly, setShowTitleOnly] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (force = false) => {
    if (!force && !memoryDocumentsStale()) return;
    try {
      const list = await memoryApi.getDocuments();
      putMemoryDocuments(list);
      setDocuments(list);
    } catch {
      if (!peekMemoryDocuments()?.length) setDocuments([]);
    }
  }, []);

  const onPullRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load(true);
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load(false);
    }, [load])
  );

  useEffect(() => {
    const id = setInterval(() => {
      load(false);
    }, LIST_CACHE_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load]);

  const filtered = documents.filter((d) =>
    search ? d.title.toLowerCase().includes(search.toLowerCase()) : true
  );

  return (
    <FlatList
      data={filtered}
      keyExtractor={(item) => item.id}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onPullRefresh}
          tintColor={colors.highlight}
        />
      }
      ListHeaderComponent={
        <>
          <SearchBar value={search} onChangeText={setSearch} placeholder="搜索文档" />
          <View className="mb-3 flex-row items-center justify-between px-global">
            <ThemedText className="text-base font-bold">近30天</ThemedText>
            <TouchableOpacity onPress={() => setShowTitleOnly((v) => !v)}>
              <ThemedText className="text-[16px] text-subtext">
                {showTitleOnly ? '显示详情' : '只显示标题'}
              </ThemedText>
            </TouchableOpacity>
          </View>
        </>
      }
      renderItem={({ item }) => <DocumentCard doc={item} showTitleOnly={showTitleOnly} />}
      ListEmptyComponent={
        <View className="items-center py-16">
          <Icon name="FileText" size={44} />
          <ThemedText className="mt-3 text-subtext">暂无历史文档</ThemedText>
        </View>
      }
      contentContainerStyle={{ paddingBottom: contentBottomPad }}
    />
  );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function MemoryScreen() {
  const params = useLocalSearchParams<{ tab?: string; notesTab?: string }>();
  const insets = useSafeAreaInsets();
  const listBottomPad = useGlobalFloatingTabBarInset();
  const [activeTab, setActiveTab] = useState<TabKey>('灵感笔记');
  const [activePage, setActivePage] = useState<TopPageKey>('memory');
  const [showMemoryTune, setShowMemoryTune] = useState(false);
  const [pendingReview, setPendingReview] = useState<PendingMemoryReview | null>(() =>
    getPendingMemoryReview()
  );
  const [reviewDeleting, setReviewDeleting] = useState(false);
  const notesInitialTab: NotesTabKey = params.notesTab === 'schedule' ? '日程安排' : '灵感笔记';

  useEffect(() => {
    if (params.tab === 'memory') setActiveTab('用户记忆');
    if (params.tab === 'inspiration') setActiveTab('灵感笔记');
    if (params.tab === 'documents') setActiveTab('历史文档');
    if (params.tab === 'ceo') setActivePage('aiCeo');
  }, [params.tab]);

  useEffect(() => subscribePendingMemoryReview(setPendingReview), []);

  const handleAcceptPendingReview = useCallback(() => {
    clearPendingMemoryReview();
    setPendingReview(null);
  }, []);

  const handleCancelPendingReview = useCallback(async () => {
    if (!pendingReview || reviewDeleting) return;
    setReviewDeleting(true);
    try {
      if (!pendingReview.id.startsWith('local-')) {
        await memoryApi.deleteMemory(pendingReview.id);
      }
    } catch {
      // ignore: cache 仍以本地删除为准，后续拉取会再对齐
    } finally {
      const current = peekMemoryMemories() ?? [];
      const next = current.filter((m) => m.id !== pendingReview.id);
      putMemoryMemories(next);
      clearPendingMemoryReview();
      setPendingReview(null);
      setReviewDeleting(false);
    }
  }, [pendingReview, reviewDeleting]);

  return (
    <View className="flex-1 bg-background">
      <TopSwitch
        activePage={activePage}
        onChange={setActivePage}
        topInset={insets.top}
        onTunePress={() => setShowMemoryTune(true)}
        onInitModelPress={() => router.push('/screens/model-init')}
      />

      {activePage === 'memory' ? <TabBar active={activeTab} onChange={setActiveTab} /> : null}

      {activePage === 'memory' && pendingReview ? (
        <View
          className="absolute left-4 right-4 z-30 rounded-[30px] border border-[#B98C44]/40 bg-[#1D1D1D] px-5"
          style={{
            top: insets.top + 52,
            height: 130,
            shadowColor: '#000',
            shadowOpacity: 0.25,
            shadowRadius: 30,
            shadowOffset: { width: 0, height: 16 },
          }}>
          <View className="mt-3 flex-row items-center">
            <ThemedText className="text-[16px] text-[#FECF9A]">私密记忆更新</ThemedText>
            <Icon name="Lock" size={14} color="#FECF9A" style={{ marginLeft: 6 }} />
          </View>
          <ThemedText className="mt-2 text-[14px] leading-[20px] text-white" numberOfLines={2}>
            {pendingReview.content}
          </ThemedText>
          <View className="mt-4 flex-row justify-between">
            <TouchableOpacity
              disabled={reviewDeleting}
              onPress={handleAcceptPendingReview}
              className="h-6 w-[145px] items-center justify-center rounded-xl bg-[#AA873C]">
              <ThemedText className="text-[14px] text-black">接受</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={reviewDeleting}
              onPress={() => {
                handleCancelPendingReview().catch(() => {});
              }}
              className="h-6 w-[145px] items-center justify-center rounded-xl bg-white">
              <ThemedText className="text-[14px] text-black">取消</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <View className="flex-1">
        {activePage === 'aiCeo' ? <AiCeoTab contentBottomPad={listBottomPad} /> : null}
        {activePage === 'memory' && activeTab === '灵感笔记' ? (
          <InspirationListTab contentBottomPad={listBottomPad} initialNotesTab={notesInitialTab} />
        ) : null}
        {activePage === 'memory' && activeTab === '用户记忆' ? (
          <MemoriesTab contentBottomPad={listBottomPad} />
        ) : null}
        {activePage === 'memory' && activeTab === '历史文档' ? (
          <DocumentsTab contentBottomPad={listBottomPad} />
        ) : null}
      </View>
      <MemoryTuneModal visible={showMemoryTune} onRequestClose={() => setShowMemoryTune(false)} />
    </View>
  );
}
