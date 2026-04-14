import React, { useState, useCallback } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Header from '@/components/Header';
import ThemedText from '@/components/ThemedText';
import Icon, { IconName } from '@/components/Icon';
import { Chip } from '@/components/Chip';
import useThemeColors from '@/app/contexts/ThemeColors';
import {
  memoryApi,
  UserMemory,
  HistoryDocument,
  HistoryTodo,
  TODO_CATEGORIES,
  getCategoryIcon,
  getCategoryColor,
  getTodoCategoryIcon,
  getMimeLabel,
  getMimeColor,
  formatMemoryDate,
  groupByDate,
  translateCategory,
  extractCategories,
  confidenceLabel,
  relativeTime,
  resolveMemoryTime,
} from '@/services/memoryApi';

// ─── Tab types ────────────────────────────────────────────────────────────────

type TabKey = '用户记忆' | '历史文档' | '历史事项';
const TABS: TabKey[] = ['用户记忆', '历史文档', '历史事项'];

// ─── Tab Bar ─────────────────────────────────────────────────────────────────

interface TabBarProps {
  active: TabKey;
  onChange: (tab: TabKey) => void;
}

const TabBar = ({ active, onChange }: TabBarProps) => {
  const colors = useThemeColors();
  return (
    <View className="flex-row bg-secondary rounded-full mx-global mb-4 p-1">
      {TABS.map((tab) => {
        const isActive = tab === active;
        return (
          <TouchableOpacity
            key={tab}
            onPress={() => onChange(tab)}
            activeOpacity={0.7}
            className="flex-1 items-center py-2 rounded-full"
            style={isActive ? { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border } : undefined}
          >
            <ThemedText
              className={`text-sm font-semibold ${isActive ? 'text-primary' : 'text-subtext'}`}
            >
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
    <View className="flex-row items-center bg-secondary rounded-full px-4 mb-4 h-11 mx-global">
      <Icon name="Search" size={18} />
      <TextInput
        className="flex-1 ml-2 text-sm text-primary"
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
  const timeLabel = relativeTime(resolveMemoryTime(memory));

  const handleLongPress = () => {
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
      className="bg-secondary rounded-2xl px-4 py-4 mb-3 mx-global"
    >
      <View className="flex-row items-start">
        <View
          className="w-9 h-9 rounded-xl items-center justify-center mr-3 mt-0.5"
          style={{ backgroundColor: `${iconColor}22` }}
        >
          <Icon name={iconName} size={18} color={iconColor} />
        </View>
        <View className="flex-1">
          <ThemedText className="text-sm font-bold text-primary mb-1">
            {translateCategory(memory.category)}
          </ThemedText>

          {/* 置信度 · 创建时间 */}
          {(confLabel || timeLabel) ? (
            <View className="flex-row flex-wrap items-center gap-x-3 mb-2">
              {confLabel ? (
                <View className="flex-row items-center gap-x-1">
                  <ThemedText className="text-xs text-subtext">置信度</ThemedText>
                  <ThemedText className="text-xs font-semibold text-primary">{confLabel}</ThemedText>
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

          <ThemedText className="text-sm text-subtext leading-5">{memory.content}</ThemedText>
        </View>
      </View>
    </TouchableOpacity>
  );
};

interface MemoriesTabProps {
  refreshing: boolean;
  onRefresh: () => void;
}

const MemoriesTab = ({ refreshing, onRefresh }: MemoriesTabProps) => {
  const colors = useThemeColors();
  const [memories, setMemories] = useState<UserMemory[]>([]);
  const [activeCategory, setActiveCategory] = useState('全部');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const list = await memoryApi.getMemories();
      setMemories(list);
    } catch {
      setMemories([]);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  // 从实际数据动态提取分类列表
  const categories = extractCategories(memories);

  const filtered = memories.filter((m) => {
    const matchCat = activeCategory === '全部' || m.category === activeCategory;
    const matchSearch = search
      ? m.content.toLowerCase().includes(search.toLowerCase()) ||
        translateCategory(m.category).includes(search)
      : true;
    return matchCat && matchSearch;
  });

  const handleDelete = async (id: string) => {
    setMemories((prev) => prev.filter((m) => m.id !== id));
    try { await memoryApi.deleteMemory(id); } catch { /* ignore */ }
  };

  return (
    <FlatList
      data={filtered}
      keyExtractor={(item) => item.id}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.highlight} />
      }
      ListHeaderComponent={
        <>
          <SearchBar value={search} onChangeText={setSearch} placeholder="搜索记忆" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mb-4"
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
          >
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
          <ThemedText className="text-subtext mt-3">暂无记忆</ThemedText>
        </View>
      }
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
      className="mb-3 rounded-2xl bg-secondary overflow-hidden mx-global"
    >
      <View style={{ backgroundColor: color }} className="flex-row items-center px-4 py-2.5">
        <ThemedText className="flex-1 text-sm font-bold text-white" numberOfLines={1}>
          {doc.title}
        </ThemedText>
        <TouchableOpacity
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={() => {}}
        >
          <Icon name="MoreHorizontal" size={18} color="white" />
        </TouchableOpacity>
      </View>
      {!showTitleOnly && (
        <View className="flex-row px-4 py-3">
          <View className="flex-1 mr-3">
            <ThemedText className="text-sm text-subtext leading-5" numberOfLines={3}>
              {doc.preview}
            </ThemedText>
            <ThemedText className="text-xs text-subtext mt-2">
              {formatMemoryDate(doc.created_at)}
            </ThemedText>
          </View>
          <View
            style={{ backgroundColor: color }}
            className="w-14 h-16 rounded-xl items-center justify-center"
          >
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
  refreshing: boolean;
  onRefresh: () => void;
}

const DocumentsTab = ({ refreshing, onRefresh }: DocumentsTabProps) => {
  const colors = useThemeColors();
  const [documents, setDocuments] = useState<HistoryDocument[]>([]);
  const [search, setSearch] = useState('');
  const [showTitleOnly, setShowTitleOnly] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await memoryApi.getDocuments();
      setDocuments(list);
    } catch {
      setDocuments([]);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const filtered = documents.filter((d) =>
    search ? d.title.toLowerCase().includes(search.toLowerCase()) : true
  );

  return (
    <FlatList
      data={filtered}
      keyExtractor={(item) => item.id}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.highlight} />
      }
      ListHeaderComponent={
        <>
          <SearchBar value={search} onChangeText={setSearch} placeholder="搜索文档" />
          <View className="flex-row items-center justify-between px-global mb-3">
            <ThemedText className="text-base font-bold">近30天</ThemedText>
            <TouchableOpacity onPress={() => setShowTitleOnly((v) => !v)}>
              <ThemedText className="text-sm text-subtext">
                {showTitleOnly ? '显示详情' : '只显示标题'}
              </ThemedText>
            </TouchableOpacity>
          </View>
        </>
      }
      renderItem={({ item }) => (
        <DocumentCard doc={item} showTitleOnly={showTitleOnly} />
      )}
      ListEmptyComponent={
        <View className="items-center py-16">
          <Icon name="FileText" size={44} />
          <ThemedText className="text-subtext mt-3">暂无历史文档</ThemedText>
        </View>
      }
    />
  );
};

// ─── 历史事项 ─────────────────────────────────────────────────────────────────

interface TodoItemProps {
  todo: HistoryTodo;
  onToggle: (id: string, status: 'active' | 'done') => void;
}

const TodoItem = ({ todo, onToggle }: TodoItemProps) => {
  const iconName = getTodoCategoryIcon(todo.category) as IconName;
  const isDone = todo.status === 'done';

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => onToggle(todo.id, isDone ? 'active' : 'done')}
      className="flex-row items-center bg-secondary rounded-2xl px-4 py-3.5 mb-2.5 mx-global"
    >
      <View
        className="w-9 h-9 rounded-xl items-center justify-center mr-3"
        style={{ backgroundColor: isDone ? 'transparent' : '#1A1A2E', borderWidth: isDone ? 0 : 0 }}
      >
        <Icon name={iconName} size={18} className={isDone ? 'opacity-40' : ''} />
      </View>
      <ThemedText
        className={`flex-1 text-sm font-medium ${isDone ? 'text-subtext' : 'text-primary'}`}
        numberOfLines={1}
      >
        {todo.title}
      </ThemedText>
      <View className="ml-3">
        {isDone ? (
          <View className="w-6 h-6 rounded-full border-2 border-border items-center justify-center">
            <Icon name="Check" size={12} />
          </View>
        ) : (
          <View className="w-6 h-6 rounded-full border-2 border-primary items-center justify-center">
            <View className="w-3 h-3 rounded-full bg-primary" />
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

interface TodosTabProps {
  refreshing: boolean;
  onRefresh: () => void;
}

const TodosTab = ({ refreshing, onRefresh }: TodosTabProps) => {
  const colors = useThemeColors();
  const [todos, setTodos] = useState<HistoryTodo[]>([]);
  const [activeCategory, setActiveCategory] = useState('全部');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const list = await memoryApi.getTodos(activeCategory);
      setTodos(list);
    } catch {
      setTodos([]);
    }
  }, [activeCategory]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const filtered = todos.filter((t) =>
    search ? t.title.toLowerCase().includes(search.toLowerCase()) : true
  );

  const grouped = groupByDate(filtered) as Record<string, HistoryTodo[]>;
  const dateKeys = Object.keys(grouped);

  const handleToggle = async (id: string, newStatus: 'active' | 'done') => {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: newStatus } : t))
    );
    try { await memoryApi.toggleTodo(id, newStatus); } catch { /* ignore */ }
  };

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.highlight} />
      }
    >
      <SearchBar value={search} onChangeText={setSearch} placeholder="搜索事项" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="mb-4"
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
      >
        {TODO_CATEGORIES.map((cat) => (
          <Chip
            key={cat}
            label={cat}
            isSelected={activeCategory === cat}
            onPress={() => setActiveCategory(cat)}
            size="sm"
          />
        ))}
      </ScrollView>

      {dateKeys.length === 0 ? (
        <View className="items-center py-16">
          <Icon name="CheckSquare" size={44} />
          <ThemedText className="text-subtext mt-3">暂无历史事项</ThemedText>
        </View>
      ) : (
        dateKeys.map((dateKey) => (
          <View key={dateKey}>
            <ThemedText className="text-sm font-bold text-primary px-global mb-2">
              {dateKey}
            </ThemedText>
            {grouped[dateKey].map((todo) => (
              <TodoItem key={todo.id} todo={todo} onToggle={handleToggle} />
            ))}
            <View className="mb-3" />
          </View>
        ))
      )}
      <View className="h-8" />
    </ScrollView>
  );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function MemoryScreen() {
  const [activeTab, setActiveTab] = useState<TabKey>('用户记忆');
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 600));
    setRefreshing(false);
  }, []);

  return (
    <View className="flex-1 bg-background">
      <Header
        title="记忆库"
        showBackButton
        onBackPress={() => router.back()}
      />

      <TabBar active={activeTab} onChange={setActiveTab} />

      <View className="flex-1">
        {activeTab === '用户记忆' && (
          <MemoriesTab refreshing={refreshing} onRefresh={handleRefresh} />
        )}
        {activeTab === '历史文档' && (
          <DocumentsTab refreshing={refreshing} onRefresh={handleRefresh} />
        )}
        {activeTab === '历史事项' && (
          <TodosTab refreshing={refreshing} onRefresh={handleRefresh} />
        )}
      </View>
    </View>
  );
}
