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
import { Chip } from '@/components/Chip';
import Header from '@/components/Header';
import Icon from '@/components/Icon';
import ThemedText from '@/components/ThemedText';
import { useGlobalFloatingTabBarInset } from '@/hooks/useGlobalFloatingTabBarInset';
import {
  deleteSchedule,
  listSchedules,
  NotesApiError,
  updateSchedule,
  updateScheduleTask,
  type Schedule,
  type SchedulePriority,
  type ScheduleTask,
} from '@/lib/notesApi';
import { safeRouterBackOrHome } from '@/lib/safeRouterBack';
import { formatMemoryDate } from '@/services/memoryApi';
import { formatScheduleTimeForDisplay } from '@/utils/date';

const PRIORITIES: SchedulePriority[] = ['核心', '重要', '次要'];

type ScheduleDraft = {
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  priority: SchedulePriority;
  tagsLine: string;
  tasks: ScheduleTask[];
};

function scheduleToDraft(s: Schedule): ScheduleDraft {
  return {
    title: s.title,
    description: s.description ?? '',
    start_time: s.start_time ?? '',
    end_time: s.end_time ?? '',
    priority: s.priority,
    tagsLine: s.tags.join(','),
    tasks: s.tasks.map((t) => ({ ...t })),
  };
}

function tagsFromLine(line: string): string[] {
  return line
    .split(/[,，]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function normalizedTasks(tasks: ScheduleTask[]): { content: string; is_completed: boolean }[] {
  return tasks
    .map((t) => ({ content: t.content.trim(), is_completed: t.is_completed }))
    .filter((t) => t.content.length > 0);
}

function tasksEqual(
  a: { content: string; is_completed: boolean }[],
  b: { content: string; is_completed: boolean }[]
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].content !== b[i].content || a[i].is_completed !== b[i].is_completed) return false;
  }
  return true;
}

function draftEqualsSchedule(d: ScheduleDraft, s: Schedule): boolean {
  return (
    d.title.trim() === s.title.trim() &&
    (d.description.trim() || '') === (s.description?.trim() ?? '') &&
    (d.start_time.trim() || '') === (s.start_time?.trim() ?? '') &&
    (d.end_time.trim() || '') === (s.end_time?.trim() ?? '') &&
    d.priority === s.priority &&
    tagsFromLine(d.tagsLine).join('\0') === s.tags.join('\0') &&
    tasksEqual(normalizedTasks(d.tasks), normalizedTasks(s.tasks))
  );
}

export default function MemoryScheduleDetailScreen() {
  const colors = useThemeColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const scheduleId = typeof id === 'string' ? id : (id?.[0] ?? '');
  const bottomPad = useGlobalFloatingTabBarInset();
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ScheduleDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!scheduleId) {
      setSchedule(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await listSchedules({ limit: 200 });
      setSchedule(rows.find((s) => s.id === scheduleId) ?? null);
    } catch (e) {
      const err = e as NotesApiError;
      Alert.alert('加载失败', err?.message || '请稍后重试');
      setSchedule(null);
    } finally {
      setLoading(false);
    }
  }, [scheduleId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const beginEdit = () => {
    if (!schedule) return;
    setDraft(scheduleToDraft(schedule));
    setEditing(true);
  };

  const cancelEdit = () => {
    if (!schedule || !draft) {
      setEditing(false);
      setDraft(null);
      return;
    }
    if (draftEqualsSchedule(draft, schedule)) {
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
    if (!schedule || !draft) return;
    const title = draft.title.trim();
    if (!title) {
      Alert.alert('提示', '请填写标题');
      return;
    }
    const tasksPayload = draft.tasks
      .map((t) => ({
        content: t.content.trim(),
        is_completed: t.is_completed,
      }))
      .filter((t) => t.content.length > 0);

    setSaving(true);
    try {
      await updateSchedule(schedule.id, {
        title,
        description: draft.description.trim() ? draft.description.trim() : null,
        start_time: draft.start_time.trim() ? draft.start_time.trim() : null,
        end_time: draft.end_time.trim() ? draft.end_time.trim() : null,
        priority: draft.priority,
        tags: tagsFromLine(draft.tagsLine),
        tasks: tasksPayload,
      });
      await load();
      setEditing(false);
      setDraft(null);
    } catch (e) {
      const err = e as NotesApiError;
      Alert.alert('保存失败', err?.message || '请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = () => {
    if (!schedule) return;
    Alert.alert('删除日程', `确认删除「${schedule.title}」吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteSchedule(schedule.id);
            router.back();
          } catch (e) {
            const err = e as NotesApiError;
            Alert.alert('删除失败', err?.message || '请稍后重试');
          }
        },
      },
    ]);
  };

  const handleToggleTask = async (taskIndex: number) => {
    if (!schedule || editing) return;
    const current = schedule.tasks[taskIndex];
    if (!current) return;
    const next = !current.is_completed;

    setSchedule({
      ...schedule,
      tasks: schedule.tasks.map((task, idx) =>
        idx === taskIndex ? { ...task, is_completed: next } : task
      ),
    });

    try {
      const tasks = await updateScheduleTask(schedule.id, taskIndex, next);
      setSchedule((prev) => (prev ? { ...prev, tasks } : null));
    } catch (e) {
      setSchedule((prev) =>
        prev
          ? {
              ...prev,
              tasks: prev.tasks.map((task, idx) =>
                idx === taskIndex ? { ...task, is_completed: !next } : task
              ),
            }
          : null
      );
      const err = e as NotesApiError;
      Alert.alert('更新失败', err?.message || '请稍后重试');
    }
  };

  const inputClass = 'rounded-xl border border-border bg-secondary px-3 py-3 text-sm text-primary';

  if (loading) {
    return (
      <View className="flex-1 bg-background">
        <Header title="日程详情" showBackButton onBackPress={safeRouterBackOrHome} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.highlight} />
        </View>
      </View>
    );
  }

  if (!schedule) {
    return (
      <View className="flex-1 bg-background">
        <Header title="日程详情" showBackButton onBackPress={safeRouterBackOrHome} />
        <View className="flex-1 items-center justify-center px-global">
          <ThemedText className="text-subtext">未找到该日程</ThemedText>
        </View>
      </View>
    );
  }

  const startShown = schedule.start_time
    ? formatScheduleTimeForDisplay(schedule.start_time)
    : '时间待定';
  const endShown = schedule.end_time ? formatScheduleTimeForDisplay(schedule.end_time) : '';
  const timeLabel = endShown ? `${startShown} - ${endShown}` : startShown;

  const headerRight = editing
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

  const d = editing && draft ? draft : null;

  return (
    <View className="flex-1 bg-background">
      <Header
        title={editing ? '编辑日程' : '日程详情'}
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
        {editing && d ? (
          <>
            <ThemedText className="mb-1 text-xs font-semibold text-subtext">标题</ThemedText>
            <TextInput
              className={inputClass}
              value={d.title}
              onChangeText={(t) => setDraft((prev) => (prev ? { ...prev, title: t } : prev))}
              placeholder="标题"
              placeholderTextColor={colors.placeholder}
            />

            <ThemedText className="mb-1 mt-4 text-xs font-semibold text-subtext">
              开始时间
            </ThemedText>
            <TextInput
              className={inputClass}
              value={d.start_time}
              onChangeText={(t) => setDraft((prev) => (prev ? { ...prev, start_time: t } : prev))}
              placeholder="如 2026-04-16T15:00 或自然语言"
              placeholderTextColor={colors.placeholder}
            />

            <ThemedText className="mb-1 mt-4 text-xs font-semibold text-subtext">
              结束时间
            </ThemedText>
            <TextInput
              className={inputClass}
              value={d.end_time}
              onChangeText={(t) => setDraft((prev) => (prev ? { ...prev, end_time: t } : prev))}
              placeholder="可选"
              placeholderTextColor={colors.placeholder}
            />

            <ThemedText className="mb-2 mt-4 text-xs font-semibold text-subtext">优先级</ThemedText>
            <View className="flex-row flex-wrap gap-2">
              {PRIORITIES.map((p) => (
                <Chip
                  key={p}
                  label={p}
                  isSelected={d.priority === p}
                  onPress={() => setDraft((prev) => (prev ? { ...prev, priority: p } : prev))}
                  size="sm"
                />
              ))}
            </View>

            <ThemedText className="mb-1 mt-4 text-xs font-semibold text-subtext">标签</ThemedText>
            <TextInput
              className={inputClass}
              value={d.tagsLine}
              onChangeText={(t) => setDraft((prev) => (prev ? { ...prev, tagsLine: t } : prev))}
              placeholder="多个标签用逗号分隔"
              placeholderTextColor={colors.placeholder}
            />

            <ThemedText className="mb-1 mt-4 text-xs font-semibold text-subtext">说明</ThemedText>
            <TextInput
              className={`${inputClass} min-h-[100px]`}
              value={d.description}
              onChangeText={(t) => setDraft((prev) => (prev ? { ...prev, description: t } : prev))}
              placeholder="说明"
              placeholderTextColor={colors.placeholder}
              multiline
              textAlignVertical="top"
            />

            <View className="mt-4 flex-row items-center justify-between">
              <ThemedText className="text-xs font-semibold text-subtext">待办</ThemedText>
              <TouchableOpacity
                onPress={() =>
                  setDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          tasks: [...prev.tasks, { content: '', is_completed: false }],
                        }
                      : prev
                  )
                }
                className="flex-row items-center gap-1 rounded-full bg-secondary px-3 py-1.5">
                <Icon name="Plus" size={16} color={colors.highlight} />
                <ThemedText className="text-xs font-medium text-primary">添加</ThemedText>
              </TouchableOpacity>
            </View>
            {d.tasks.map((task, idx) => (
              <View key={`task-${idx}`} className="mb-2 flex-row items-center gap-2">
                <TouchableOpacity
                  onPress={() =>
                    setDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            tasks: prev.tasks.map((t, i) =>
                              i === idx ? { ...t, is_completed: !t.is_completed } : t
                            ),
                          }
                        : prev
                    )
                  }
                  className={`h-8 w-8 items-center justify-center rounded-full border ${
                    task.is_completed ? 'border-primary bg-primary' : 'border-border'
                  }`}>
                  {task.is_completed ? <Icon name="Check" size={14} color="#fff" /> : null}
                </TouchableOpacity>
                <TextInput
                  className={`${inputClass} flex-1 py-2`}
                  value={task.content}
                  onChangeText={(t) =>
                    setDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            tasks: prev.tasks.map((row, i) =>
                              i === idx ? { ...row, content: t } : row
                            ),
                          }
                        : prev
                    )
                  }
                  placeholder={`待办 ${idx + 1}`}
                  placeholderTextColor={colors.placeholder}
                />
                <TouchableOpacity
                  onPress={() =>
                    setDraft((prev) =>
                      prev ? { ...prev, tasks: prev.tasks.filter((_, i) => i !== idx) } : prev
                    )
                  }
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Icon name="Trash2" size={18} color={colors.placeholder} />
                </TouchableOpacity>
              </View>
            ))}
          </>
        ) : (
          <>
            <ThemedText className="text-xl font-bold text-primary">{schedule.title}</ThemedText>
            <View className="mt-3 flex-row flex-wrap items-center gap-x-3 gap-y-1">
              <View className="flex-row items-center gap-1">
                <Icon name="Clock" size={16} color={colors.placeholder} />
                <ThemedText className="text-sm text-subtext">{timeLabel}</ThemedText>
              </View>
              <View className="rounded-full bg-secondary px-2 py-0.5">
                <ThemedText className="text-xs text-primary">
                  优先级 · {schedule.priority}
                </ThemedText>
              </View>
            </View>
            <ThemedText className="mt-2 text-xs text-subtext">
              更新于 {formatMemoryDate(schedule.updated_at)}
            </ThemedText>

            {schedule.description?.trim() ? (
              <View className="mt-6">
                <ThemedText className="mb-2 text-xs font-semibold uppercase text-subtext">
                  说明
                </ThemedText>
                <ThemedText className="text-sm leading-6 text-primary">
                  {schedule.description}
                </ThemedText>
              </View>
            ) : null}

            {schedule.tasks.length > 0 ? (
              <View className="mt-6">
                <ThemedText className="mb-3 text-xs font-semibold uppercase text-subtext">
                  待办
                </ThemedText>
                {schedule.tasks.map((task, idx) => (
                  <TouchableOpacity
                    key={`${schedule.id}-task-${idx}`}
                    activeOpacity={0.8}
                    onPress={() => handleToggleTask(idx)}
                    className="mb-2 flex-row items-start gap-3 rounded-xl border border-border bg-secondary px-3 py-3">
                    <View
                      className={`mt-0.5 h-6 w-6 items-center justify-center rounded-full border ${
                        task.is_completed ? 'border-primary bg-primary' : 'border-border'
                      }`}>
                      {task.is_completed ? <Icon name="Check" size={14} color="#fff" /> : null}
                    </View>
                    <ThemedText
                      className={`flex-1 text-sm leading-5 ${
                        task.is_completed ? 'text-subtext line-through' : 'text-primary'
                      }`}>
                      {task.content}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            {schedule.tags.length > 0 ? (
              <View className="mt-6 flex-row flex-wrap gap-2">
                {schedule.tags.map((tag) => (
                  <View
                    key={`${schedule.id}-${tag}`}
                    className="rounded-full border border-border bg-secondary px-3 py-1">
                    <ThemedText className="text-xs text-subtext">#{tag}</ThemedText>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}
