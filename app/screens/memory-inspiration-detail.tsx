import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  TextInput,
} from 'react-native';

import useThemeColors from '@/app/contexts/ThemeColors';
import Header from '@/components/Header';
import Icon from '@/components/Icon';
import ThemedText from '@/components/ThemedText';
import { useGlobalFloatingTabBarInset } from '@/hooks/useGlobalFloatingTabBarInset';
import {
  deleteInspirationNote,
  listInspirationNotes,
  NotesApiError,
  updateInspirationNote,
  type InspirationNote,
} from '@/lib/notesApi';
import { safeRouterBackOrHome } from '@/lib/safeRouterBack';
import { formatMemoryDate } from '@/services/memoryApi';

type InspirationDraft = {
  title: string;
  raw_content: string;
  ai_content: string;
  ai_insights: string;
  tagsLine: string;
  audio_url: string;
};

function noteToDraft(n: InspirationNote): InspirationDraft {
  return {
    title: n.title,
    raw_content: n.raw_content,
    ai_content: n.ai_content ?? '',
    ai_insights: n.ai_insights ?? '',
    tagsLine: n.tags.join(','),
    audio_url: n.audio_url ?? '',
  };
}

function tagsFromLine(line: string): string[] {
  return line
    .split(/[,，]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function draftEqualsNote(d: InspirationDraft, n: InspirationNote): boolean {
  return (
    d.title.trim() === n.title.trim() &&
    d.raw_content === n.raw_content &&
    (d.ai_content.trim() || '') === (n.ai_content?.trim() ?? '') &&
    (d.ai_insights.trim() || '') === (n.ai_insights?.trim() ?? '') &&
    tagsFromLine(d.tagsLine).join('\0') === n.tags.join('\0') &&
    (d.audio_url.trim() || '') === (n.audio_url?.trim() ?? '')
  );
}

export default function MemoryInspirationDetailScreen() {
  const colors = useThemeColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const noteId = typeof id === 'string' ? id : (id?.[0] ?? '');
  const bottomPad = useGlobalFloatingTabBarInset();
  const [note, setNote] = useState<InspirationNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<InspirationDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!noteId) {
      setNote(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await listInspirationNotes({ limit: 200 });
      setNote(rows.find((n) => n.id === noteId) ?? null);
    } catch (e) {
      const err = e as NotesApiError;
      Alert.alert('加载失败', err?.message || '请稍后重试');
      setNote(null);
    } finally {
      setLoading(false);
    }
  }, [noteId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const beginEdit = () => {
    if (!note) return;
    setDraft(noteToDraft(note));
    setEditing(true);
  };

  const cancelEdit = () => {
    if (!note || !draft) {
      setEditing(false);
      setDraft(null);
      return;
    }
    if (draftEqualsNote(draft, note)) {
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
    if (!note || !draft) return;
    const title = draft.title.trim();
    if (!title) {
      Alert.alert('提示', '请填写标题');
      return;
    }
    setSaving(true);
    try {
      await updateInspirationNote(note.id, {
        title,
        raw_content: draft.raw_content,
        ai_content: draft.ai_content.trim() ? draft.ai_content.trim() : null,
        ai_insights: draft.ai_insights.trim() ? draft.ai_insights.trim() : null,
        tags: tagsFromLine(draft.tagsLine),
        audio_url: draft.audio_url.trim() ? draft.audio_url.trim() : null,
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
    if (!note) return;
    Alert.alert('删除灵感', `确认删除「${note.title}」吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteInspirationNote(note.id);
            router.back();
          } catch (e) {
            const err = e as NotesApiError;
            Alert.alert('删除失败', err?.message || '请稍后重试');
          }
        },
      },
    ]);
  };

  const inputClass =
    'rounded-xl border border-border bg-secondary px-3 py-3 text-[16px] text-primary';

  if (loading) {
    return (
      <View className="flex-1 bg-background">
        <Header title="灵感详情" showBackButton onBackPress={safeRouterBackOrHome} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.highlight} />
        </View>
      </View>
    );
  }

  if (!note) {
    return (
      <View className="flex-1 bg-background">
        <Header title="灵感详情" showBackButton onBackPress={safeRouterBackOrHome} />
        <View className="flex-1 items-center justify-center px-global">
          <ThemedText className="text-[18px] text-subtext">未找到该灵感笔记</ThemedText>
        </View>
      </View>
    );
  }

  const d = editing && draft ? draft : null;

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

  return (
    <View className="flex-1 bg-background">
      <Header
        title={editing ? '编辑灵感' : '灵感详情'}
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
            <ThemedText className="mb-1 text-[14px] font-semibold text-subtext">标题</ThemedText>
            <TextInput
              className={inputClass}
              value={d.title}
              onChangeText={(t) => setDraft((prev) => (prev ? { ...prev, title: t } : prev))}
              placeholder="标题"
              placeholderTextColor={colors.placeholder}
            />

            <ThemedText className="mb-1 mt-4 text-[14px] font-semibold text-subtext">标签</ThemedText>
            <TextInput
              className={inputClass}
              value={d.tagsLine}
              onChangeText={(t) => setDraft((prev) => (prev ? { ...prev, tagsLine: t } : prev))}
              placeholder="多个标签用逗号分隔"
              placeholderTextColor={colors.placeholder}
            />

            <ThemedText className="mb-1 mt-4 text-[14px] font-semibold text-subtext">原文</ThemedText>
            <TextInput
              className={`${inputClass} min-h-[100px]`}
              value={d.raw_content}
              onChangeText={(t) => setDraft((prev) => (prev ? { ...prev, raw_content: t } : prev))}
              placeholder="原文"
              placeholderTextColor={colors.placeholder}
              multiline
              textAlignVertical="top"
            />

            <ThemedText className="mb-1 mt-4 text-[14px] font-semibold text-subtext">
              整理内容
            </ThemedText>
            <TextInput
              className={`${inputClass} min-h-[100px]`}
              value={d.ai_content}
              onChangeText={(t) => setDraft((prev) => (prev ? { ...prev, ai_content: t } : prev))}
              placeholder="整理内容"
              placeholderTextColor={colors.placeholder}
              multiline
              textAlignVertical="top"
            />

            <ThemedText className="mb-1 mt-4 text-[14px] font-semibold text-subtext">
              要点 / 洞察
            </ThemedText>
            <TextInput
              className={`${inputClass} min-h-[88px]`}
              value={d.ai_insights}
              onChangeText={(t) => setDraft((prev) => (prev ? { ...prev, ai_insights: t } : prev))}
              placeholder="要点 / 洞察"
              placeholderTextColor={colors.placeholder}
              multiline
              textAlignVertical="top"
            />

            <ThemedText className="mb-1 mt-4 text-[14px] font-semibold text-subtext">
              关联录音 URL
            </ThemedText>
            <TextInput
              className={inputClass}
              value={d.audio_url}
              onChangeText={(t) => setDraft((prev) => (prev ? { ...prev, audio_url: t } : prev))}
              placeholder="可选，留空则清除"
              placeholderTextColor={colors.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </>
        ) : (
          <>
            <ThemedText className="text-[22px] font-bold text-primary">{note.title}</ThemedText>
            <ThemedText className="mt-2 text-[14px] text-subtext">
              {formatMemoryDate(note.created_at)}
            </ThemedText>

            {note.tags.length > 0 ? (
              <View className="mt-4 flex-row flex-wrap gap-2">
                {note.tags.map((tag) => (
                  <View
                    key={`${note.id}-${tag}`}
                    className="rounded-full border border-border bg-secondary px-3 py-1">
                    <ThemedText className="text-[14px] text-subtext">#{tag}</ThemedText>
                  </View>
                ))}
              </View>
            ) : null}

            {note.raw_content?.trim() ? (
              <View className="mt-6">
                <ThemedText className="mb-2 text-[14px] font-semibold uppercase text-subtext">
                  原文
                </ThemedText>
                <ThemedText className="text-[16px] leading-7 text-primary">
                  {note.raw_content}
                </ThemedText>
              </View>
            ) : null}

            {note.ai_content?.trim() ? (
              <View className="mt-6">
                <ThemedText className="mb-2 text-[14px] font-semibold uppercase text-subtext">
                  整理内容
                </ThemedText>
                <ThemedText className="text-[16px] leading-7 text-primary">
                  {note.ai_content}
                </ThemedText>
              </View>
            ) : null}

            {note.ai_insights?.trim() ? (
              <View className="mt-6">
                <ThemedText className="mb-2 text-[14px] font-semibold uppercase text-subtext">
                  要点 / 洞察
                </ThemedText>
                <ThemedText className="text-[16px] leading-7 text-primary">
                  {note.ai_insights}
                </ThemedText>
              </View>
            ) : null}

            {note.audio_url?.trim() ? (
              <TouchableOpacity
                className="mt-6 flex-row items-center gap-2 rounded-xl border border-border bg-secondary px-4 py-3"
                onPress={() => Linking.openURL(note.audio_url!).catch(() => {})}
                accessibilityRole="button"
                accessibilityLabel="打开语音链接">
                <Icon name="Mic" size={20} color={colors.highlight} />
                <ThemedText className="flex-1 text-[16px] text-primary">查看关联录音</ThemedText>
                <Icon name="ExternalLink" size={18} color={colors.placeholder} />
              </TouchableOpacity>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}
