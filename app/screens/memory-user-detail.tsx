import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';

import useThemeColors from '@/app/contexts/ThemeColors';
import Header from '@/components/Header';
import Icon, { IconName } from '@/components/Icon';
import ThemedText from '@/components/ThemedText';
import { useGlobalFloatingTabBarInset } from '@/hooks/useGlobalFloatingTabBarInset';
import { putMemoryMemories } from '@/lib/listDataCache';
import { safeRouterBackOrHome } from '@/lib/safeRouterBack';
import {
  memoryApi,
  translateCategory,
  getCategoryIcon,
  getCategoryColor,
  confidenceLabel,
  resolveMemoryTime,
  formatMemoryDate,
  type UserMemory,
} from '@/services/memoryApi';

type MemoryDraft = {
  content: string;
  category: string;
  confidenceLine: string;
};

function memoryToDraft(m: UserMemory): MemoryDraft {
  return {
    content: m.content,
    category: m.category,
    confidenceLine: m.confidence != null && !Number.isNaN(m.confidence) ? String(m.confidence) : '',
  };
}

function parseConfidenceLine(line: string): number | undefined {
  const t = line.trim();
  if (!t) return undefined;
  const n = Number(t);
  if (Number.isNaN(n)) return undefined;
  return Math.min(1, Math.max(0, n));
}

function draftEqualsMemory(d: MemoryDraft, m: UserMemory): boolean {
  const dc = parseConfidenceLine(d.confidenceLine);
  const mc = m.confidence;
  const confEqual =
    dc === undefined && mc === undefined
      ? true
      : dc !== undefined && mc !== undefined
        ? Math.abs(dc - mc) < 1e-6
        : false;
  return (
    d.content.trim() === m.content.trim() &&
    d.category.trim() === m.category.trim() &&
    confEqual
  );
}

export default function MemoryUserDetailScreen() {
  const colors = useThemeColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const memoryId = typeof id === 'string' ? id : (id?.[0] ?? '');
  const bottomPad = useGlobalFloatingTabBarInset();
  const [memory, setMemory] = useState<UserMemory | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<MemoryDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!memoryId) {
      setMemory(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await memoryApi.getMemories();
      putMemoryMemories(rows);
      setMemory(rows.find((m) => m.id === memoryId) ?? null);
    } catch (e) {
      const err = e as Error;
      Alert.alert('加载失败', err?.message || '请稍后重试');
      setMemory(null);
    } finally {
      setLoading(false);
    }
  }, [memoryId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const editable = memory?.deletable !== false;

  const beginEdit = () => {
    if (!memory || !editable) return;
    setDraft(memoryToDraft(memory));
    setEditing(true);
  };

  const cancelEdit = () => {
    if (!memory || !draft) {
      setEditing(false);
      setDraft(null);
      return;
    }
    if (draftEqualsMemory(draft, memory)) {
      setEditing(false);
      setDraft(null);
      return;
    }
    Alert.alert('放弃修改？', '未保存的更改将丢失。', [
      { text: '继续编辑', style: 'cancel' },
      {
        text: '放弃',
        style: 'destructive',
        onPress: () => {
          setEditing(false);
          setDraft(null);
        },
      },
    ]);
  };

  const saveEdit = async () => {
    if (!memory || !draft) return;
    const content = draft.content.trim();
    if (!content) {
      Alert.alert('提示', '请填写记忆内容');
      return;
    }
    const category = draft.category.trim() || memory.category;
    const payload: { content: string; category: string; confidence?: number } = {
      content,
      category,
    };
    const c = parseConfidenceLine(draft.confidenceLine);
    if (c !== undefined) payload.confidence = c;

    setSaving(true);
    try {
      await memoryApi.updateMemoryFact(memory.id, payload);
      const rows = await memoryApi.getMemories();
      putMemoryMemories(rows);
      const next = rows.find((m) => m.id === memory.id) ?? null;
      setMemory(next);
      setEditing(false);
      setDraft(null);
    } catch (e) {
      const err = e as Error;
      Alert.alert('保存失败', err?.message || '请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = () => {
    if (!memory || !editable) return;
    Alert.alert('删除记忆', '确认删除该条记忆吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            await memoryApi.deleteMemory(memory.id);
            const rows = await memoryApi.getMemories();
            putMemoryMemories(rows);
            router.back();
          } catch (e) {
            const err = e as Error;
            Alert.alert('删除失败', err?.message || '请稍后重试');
          }
        },
      },
    ]);
  };

  const inputClass = 'rounded-xl border border-border bg-secondary px-3 py-3 text-sm text-primary';

  if (loading) {
    return (
      <View className="flex-1 bg-background">
        <Header title="记忆详情" showBackButton onBackPress={safeRouterBackOrHome} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.highlight} />
        </View>
      </View>
    );
  }

  if (!memory) {
    return (
      <View className="flex-1 bg-background">
        <Header title="记忆详情" showBackButton onBackPress={safeRouterBackOrHome} />
        <View className="flex-1 items-center justify-center px-global">
          <ThemedText className="text-subtext">未找到该条记忆</ThemedText>
        </View>
      </View>
    );
  }

  const iconName = getCategoryIcon(memory.category) as IconName;
  const iconColor = getCategoryColor(memory.category);
  const confLabel = confidenceLabel(memory.confidence);
  const timeIso = resolveMemoryTime(memory);
  const timeLabel = timeIso ? formatMemoryDate(timeIso) : '';

  const d = editing && draft ? draft : null;

  const headerRight = !editable
    ? []
    : editing
      ? [
          <TouchableOpacity
            key="cancel"
            onPress={cancelEdit}
            disabled={saving}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="X" size={22} color={colors.text} />
          </TouchableOpacity>,
          <TouchableOpacity
            key="save"
            onPress={() => {
              saveEdit();
            }}
            disabled={saving}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="Check" size={22} color={saving ? colors.placeholder : colors.highlight} />
          </TouchableOpacity>,
        ]
      : [
          <TouchableOpacity
            key="edit"
            onPress={beginEdit}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="Edit" size={22} color={colors.text} />
          </TouchableOpacity>,
          <TouchableOpacity
            key="del"
            onPress={onDelete}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="Trash2" size={22} color={colors.text} />
          </TouchableOpacity>,
        ];

  return (
    <View className="flex-1 bg-background">
      <Header
        title={editing ? '编辑记忆' : '记忆详情'}
        showBackButton
        onBackPress={() => {
          if (editing) cancelEdit();
          else safeRouterBackOrHome();
        }}
        rightComponents={headerRight}
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: bottomPad + 24,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {!editable ? (
          <View className="mb-4 rounded-xl border border-border bg-secondary/80 px-3 py-2">
            <ThemedText className="text-xs leading-5 text-subtext">
              此条为画像汇总展示，客户端不支持修改与删除。
            </ThemedText>
          </View>
        ) : null}

        <View className="mb-4 flex-row items-center gap-3">
          <View
            className="h-10 w-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${iconColor}22` }}>
            <Icon name={iconName} size={20} color={iconColor} />
          </View>
          <View className="flex-1">
            <ThemedText className="text-base font-bold text-primary">
              {translateCategory(memory.category)}
            </ThemedText>
            {(confLabel || timeLabel) && !editing ? (
              <View className="mt-1 flex-row flex-wrap gap-x-3">
                {confLabel ? (
                  <ThemedText className="text-xs text-subtext">置信度 {confLabel}</ThemedText>
                ) : null}
                {timeLabel ? (
                  <ThemedText className="text-xs text-subtext">更新 {timeLabel}</ThemedText>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>

        {editing && d ? (
          <>
            <ThemedText className="mb-1 text-xs font-semibold text-subtext">分类键</ThemedText>
            <TextInput
              className={inputClass}
              value={d.category}
              onChangeText={(t) => setDraft((prev) => (prev ? { ...prev, category: t } : prev))}
              placeholder="如 preference、context"
              placeholderTextColor={colors.placeholder}
              autoCapitalize="none"
            />

            <ThemedText className="mb-1 mt-4 text-xs font-semibold text-subtext">
              置信度（0～1，可选）
            </ThemedText>
            <TextInput
              className={inputClass}
              value={d.confidenceLine}
              onChangeText={(t) => setDraft((prev) => (prev ? { ...prev, confidenceLine: t } : prev))}
              placeholder="留空则不修改"
              placeholderTextColor={colors.placeholder}
              keyboardType="decimal-pad"
            />

            <ThemedText className="mb-1 mt-4 text-xs font-semibold text-subtext">内容</ThemedText>
            <TextInput
              className={`${inputClass} min-h-[160px]`}
              value={d.content}
              onChangeText={(t) => setDraft((prev) => (prev ? { ...prev, content: t } : prev))}
              placeholder="记忆内容"
              placeholderTextColor={colors.placeholder}
              multiline
              textAlignVertical="top"
            />
          </>
        ) : (
          <ThemedText className="text-sm leading-6 text-primary">{memory.content}</ThemedText>
        )}
      </ScrollView>
    </View>
  );
}
