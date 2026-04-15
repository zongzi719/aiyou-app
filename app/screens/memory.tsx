import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';

import useThemeColors from '@/app/contexts/ThemeColors';
import { Chip } from '@/components/Chip';
import Header from '@/components/Header';
import Icon, { IconName } from '@/components/Icon';
import ThemedText from '@/components/ThemedText';
import { useGlobalFloatingTabBarInset } from '@/hooks/useGlobalFloatingTabBarInset';
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
  deleteInspirationNote,
  deleteSchedule,
  listInspirationNotes,
  listSchedules,
  NotesApiError,
  type InspirationNote,
  type Schedule,
  updateScheduleTask,
} from '@/lib/notesApi';
import { safeRouterBackOrHome } from '@/lib/safeRouterBack';
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
} from '@/services/memoryApi';

// ─── Tab types ────────────────────────────────────────────────────────────────

type TabKey = '灵感笔记' | '用户记忆' | '历史文档';
const TABS: TabKey[] = ['灵感笔记', '用户记忆', '历史文档'];
type NotesTabKey = '灵感笔记' | '日程安排';

const NOTES_TABS: NotesTabKey[] = ['灵感笔记', '日程安排'];

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
              className={`text-sm font-semibold ${isActive ? 'text-primary' : 'text-subtext'}`}>
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
        className="ml-2 flex-1 text-sm text-primary"
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
          <ThemedText className="mb-1 text-sm font-bold text-primary">
            {translateCategory(memory.category)}
          </ThemedText>

          {/* 置信度 · 创建时间 */}
          {confLabel || timeLabel ? (
            <View className="mb-2 flex-row flex-wrap items-center gap-x-3">
              {confLabel ? (
                <View className="flex-row items-center gap-x-1">
                  <ThemedText className="text-xs text-subtext">置信度</ThemedText>
                  <ThemedText className="text-xs font-semibold text-primary">
                    {confLabel}
                  </ThemedText>
                </View>
              ) : null}
              {timeLabel ? (
                <View className="flex-row items-center gap-x-1">
                  <ThemedText className="text-xs text-subtext">创建时间</ThemedText>
                  <ThemedText className="text-xs text-subtext">{timeLabel}</ThemedText>
                </View>
              ) : null}
            </View>
          ) : null}

          <ThemedText className="text-sm leading-5 text-subtext">{memory.content}</ThemedText>
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
    if (!force && !memoryMemoriesStale()) return;
    try {
      const list = await memoryApi.getMemories();
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
              className="mx-global mb-3 rounded-2xl bg-secondary px-4 py-4">
              <View className="flex-row items-start gap-2">
                <View className="flex-1">
                  <ThemedText className="text-sm font-bold text-primary">{note.title}</ThemedText>
                  <ThemedText className="mt-1 text-xs text-subtext">
                    {formatMemoryDate(note.created_at)}
                  </ThemedText>
                </View>
                <TouchableOpacity onPress={() => handleDelete(note)}>
                  <Icon name="Trash2" size={16} />
                </TouchableOpacity>
              </View>
              <ThemedText className="mt-2 text-sm leading-5 text-subtext">
                {note.ai_content || note.raw_content || '暂无内容'}
              </ThemedText>
              {note.tags.length > 0 ? (
                <View className="mt-3 flex-row flex-wrap gap-2">
                  {note.tags.map((tag) => (
                    <View
                      key={`${note.id}-${tag}`}
                      className="rounded-full border border-border bg-background px-2 py-1">
                      <ThemedText className="text-xs text-subtext">#{tag}</ThemedText>
                    </View>
                  ))}
                </View>
              ) : null}
            </TouchableOpacity>
          );
        }
        const schedule = item as Schedule;
        return (
          <TouchableOpacity
            activeOpacity={0.75}
            className="mx-global mb-3 rounded-2xl bg-secondary px-4 py-4">
            <View className="flex-row items-start gap-2">
              <View className="flex-1">
                <ThemedText className="text-sm font-bold text-primary">{schedule.title}</ThemedText>
                <ThemedText className="mt-1 text-xs text-subtext">
                  {schedule.start_time || '时间待定'}
                  {schedule.end_time ? ` - ${schedule.end_time}` : ''}
                </ThemedText>
              </View>
              <TouchableOpacity onPress={() => handleDeleteSchedule(schedule)}>
                <Icon name="Trash2" size={16} />
              </TouchableOpacity>
            </View>
            {schedule.description ? (
              <ThemedText className="mt-2 text-sm leading-5 text-subtext">
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
                        task.is_completed ? 'border-primary bg-primary' : 'border-border'
                      }`}>
                      {task.is_completed ? <Icon name="Check" size={12} color="#fff" /> : null}
                    </View>
                    <ThemedText
                      className={`text-sm ${task.is_completed ? 'text-subtext line-through' : 'text-primary'}`}>
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
                    <ThemedText className="text-xs text-subtext">#{tag}</ThemedText>
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

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      className="mx-global mb-3 overflow-hidden rounded-2xl bg-secondary">
      <View style={{ backgroundColor: color }} className="flex-row items-center px-4 py-2.5">
        <ThemedText className="flex-1 text-sm font-bold text-white" numberOfLines={1}>
          {doc.title}
        </ThemedText>
        <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => {}}>
          <Icon name="MoreHorizontal" size={18} color="white" />
        </TouchableOpacity>
      </View>
      {!showTitleOnly && (
        <View className="flex-row px-4 py-3">
          <View className="mr-3 flex-1">
            <ThemedText className="text-sm leading-5 text-subtext" numberOfLines={3}>
              {doc.preview}
            </ThemedText>
            <ThemedText className="mt-2 text-xs text-subtext">
              {formatMemoryDate(doc.created_at)}
            </ThemedText>
          </View>
          <View
            style={{ backgroundColor: color }}
            className="h-16 w-14 items-center justify-center rounded-xl">
            <ThemedText className="text-sm font-bold text-white">{label}</ThemedText>
          </View>
        </View>
      )}
      {showTitleOnly && (
        <View className="px-4 py-2">
          <ThemedText className="text-xs text-subtext">
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
              <ThemedText className="text-sm text-subtext">
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
  const listBottomPad = useGlobalFloatingTabBarInset();
  const [activeTab, setActiveTab] = useState<TabKey>('灵感笔记');
  const notesInitialTab: NotesTabKey = params.notesTab === 'schedule' ? '日程安排' : '灵感笔记';

  useEffect(() => {
    if (params.tab === 'memory') setActiveTab('用户记忆');
    if (params.tab === 'inspiration') setActiveTab('灵感笔记');
    if (params.tab === 'documents') setActiveTab('历史文档');
  }, [params.tab]);

  return (
    <View className="flex-1 bg-background">
      <Header title="记忆库" showBackButton onBackPress={safeRouterBackOrHome} />

      <TabBar active={activeTab} onChange={setActiveTab} />

      <View className="flex-1">
        {activeTab === '灵感笔记' && (
          <InspirationListTab contentBottomPad={listBottomPad} initialNotesTab={notesInitialTab} />
        )}
        {activeTab === '用户记忆' && <MemoriesTab contentBottomPad={listBottomPad} />}
        {activeTab === '历史文档' && <DocumentsTab contentBottomPad={listBottomPad} />}
      </View>
    </View>
  );
}
