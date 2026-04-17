import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  FlatList,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
} from 'react-native';

import useThemeColors from '@/app/contexts/ThemeColors';
import Header from '@/components/Header';
import Icon from '@/components/Icon';
import ThemedText from '@/components/ThemedText';
import { useGlobalFloatingTabBarInset } from '@/hooks/useGlobalFloatingTabBarInset';
import {
  knowledgeApi,
  KnowledgeChunk,
  KnowledgeFile,
  displayKnowledgeFilename,
  formatFileSize,
  formatDate,
  getMimeLabel,
  getMimeColor,
  normalizeKnowledgeFileStatus,
} from '@/services/knowledgeApi';

const MD_IMG = /!\[[^\]]*\]\((data:image\/[a-z0-9+.-]+;base64,[^)]+)\)/gi;

function ChunkContent({ content }: { content: string }) {
  const text = content ?? '';
  const parts: React.ReactNode[] = [];
  let last = 0;
  const re = new RegExp(MD_IMG.source, MD_IMG.flags);
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      const t = text.slice(last, m.index);
      if (t) {
        parts.push(
          <ThemedText key={`t-${k++}`} className="text-sm leading-6 text-primary">
            {t}
          </ThemedText>
        );
      }
    }
    parts.push(
      <Image
        key={`i-${k++}`}
        source={{ uri: m[1] }}
        className="my-2 w-full rounded-lg bg-secondary"
        style={{ minHeight: 120, maxHeight: 320 }}
        resizeMode="contain"
      />
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    const t = text.slice(last);
    if (t) {
      parts.push(
        <ThemedText key={`t-${k++}`} className="text-sm leading-6 text-primary">
          {t}
        </ThemedText>
      );
    }
  }
  return <View className="gap-1">{parts}</View>;
}

function parseParams(p: Record<string, string | string[] | undefined>): KnowledgeFile | null {
  const g = (key: string): string => {
    const v = p[key];
    if (Array.isArray(v)) return v[0] ?? '';
    return v ?? '';
  };
  const fileId = g('fileId');
  if (!fileId) return null;
  const st = normalizeKnowledgeFileStatus(g('status'));
  const fid = g('folder_id');
  return {
    id: fileId,
    filename: displayKnowledgeFilename(g('filename') || '未命名'),
    mime_type: g('mime_type') || 'application/octet-stream',
    file_size: Number(g('file_size')) || 0,
    folder_id: fid ? fid : null,
    status: st,
    chunk_count: Number(g('chunk_count')) || 0,
    created_at: g('created_at') || new Date().toISOString(),
    progress: g('progress') !== '' && g('progress') != null ? Number(g('progress')) : null,
  };
}

export default function KnowledgeFileDetailScreen() {
  const colors = useThemeColors();
  const listBottomPad = useGlobalFloatingTabBarInset();
  const params = useLocalSearchParams();
  const initial = parseParams(params);
  const [file, setFile] = useState<KnowledgeFile | null>(initial);

  const [chunks, setChunks] = useState<KnowledgeChunk[]>([]);
  const [chunksTotal, setChunksTotal] = useState(0);
  const [chunkPage, setChunkPage] = useState(1);
  const [loadingChunks, setLoadingChunks] = useState(false);
  const [chunksRefreshing, setChunksRefreshing] = useState(false);
  const [chunksError, setChunksError] = useState<string | null>(null);
  const [hasMoreChunks, setHasMoreChunks] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const PAGE_SIZE = 20;

  useEffect(() => {
    if (!initial) {
      Alert.alert('提示', '缺少文件信息', [{ text: '知道了', onPress: () => router.back() }]);
    }
  }, [initial]);

  /** 进入详情时与服务器对齐一次状态（避免列表缓存与 /status 不一致导致不拉分块） */
  useEffect(() => {
    if (!file?.id) return;
    let cancelled = false;
    void (async () => {
      try {
        const s = await knowledgeApi.getFileStatus(file.id);
        if (cancelled) return;
        setFile((prev) =>
          prev && prev.id === file.id ? { ...prev, status: s.status, progress: s.progress } : prev
        );
      } catch {
        /* 保留路由参数中的状态 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file?.id]);

  useEffect(() => {
    if (!file) return;
    if (file.status === 'done' || file.status === 'error') return;
    const id = file.id;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (cancelled) return;
      try {
        const s = await knowledgeApi.getFileStatus(id);
        if (cancelled) return;
        setFile((prev) => (prev ? { ...prev, status: s.status, progress: s.progress } : prev));
        if (s.status !== 'done' && s.status !== 'error') {
          timer = setTimeout(tick, 2000);
        }
      } catch {
        if (!cancelled) timer = setTimeout(tick, 3000);
      }
    };
    timer = setTimeout(tick, 2000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [file?.id, file?.status]);

  const fetchChunks = useCallback(
    async (page: number, append: boolean) => {
      if (!file || file.status !== 'done') return;
      setLoadingChunks(true);
      setChunksError(null);
      try {
        const res = await knowledgeApi.getFileChunks(file.id, { page, page_size: PAGE_SIZE });
        setChunksTotal(res.total);
        setFile((prev) => (prev ? { ...prev, chunk_count: res.total } : prev));
        setChunks((prev) => (append ? [...prev, ...res.chunks] : res.chunks));
        setHasMoreChunks(page * PAGE_SIZE < res.total);
        setChunkPage(page);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setChunksError(msg);
        if (!append) setChunks([]);
      } finally {
        setLoadingChunks(false);
        setChunksRefreshing(false);
      }
    },
    [file?.id, file?.status]
  );

  useEffect(() => {
    if (file?.status === 'done') {
      void fetchChunks(1, false);
    } else {
      setChunks([]);
      setChunksTotal(0);
      setHasMoreChunks(false);
    }
  }, [file?.status, file?.id, fetchChunks]);

  const onRefreshChunks = useCallback(() => {
    if (file?.status !== 'done') return;
    setChunksRefreshing(true);
    void fetchChunks(1, false);
  }, [file?.status, fetchChunks]);

  const loadMoreChunks = useCallback(() => {
    if (!file || file.status !== 'done' || loadingChunks || !hasMoreChunks) return;
    void fetchChunks(chunkPage + 1, true);
  }, [file, loadingChunks, hasMoreChunks, chunkPage, fetchChunks]);

  const handleDelete = () => {
    if (!file) return;
    Alert.alert('删除文件', `确定删除「${file.filename}」？此操作不可撤销。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            await knowledgeApi.deleteFile(file.id);
            router.back();
          } catch {
            Alert.alert('删除失败', '请稍后重试');
          }
        },
      },
    ]);
  };

  const handleReindex = async () => {
    if (!file) return;
    try {
      await knowledgeApi.reindexFile(file.id);
      setFile({ ...file, status: 'queued', progress: 0 });
      setChunks([]);
      setChunksTotal(0);
    } catch {
      Alert.alert('操作失败', '请稍后重试');
    }
  };

  const handleDownload = async () => {
    if (!file || downloading) return;
    setDownloading(true);
    try {
      const uri = await knowledgeApi.downloadOriginalFile(file.id, file.filename);
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: file.mime_type, dialogTitle: file.filename });
      } else {
        Alert.alert('下载完成', '文件已保存到应用缓存');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('下载失败', msg || '请稍后重试');
    } finally {
      setDownloading(false);
    }
  };

  const openMenu = () => {
    if (!file || downloading) return;
    const actions: { text: string; style?: 'destructive' | 'cancel'; onPress?: () => void }[] = [
      { text: '下载', onPress: () => handleDownload() },
    ];
    if (file.status === 'error') {
      actions.push({ text: '重新处理', onPress: () => handleReindex() });
    }
    actions.push({ text: '删除', style: 'destructive', onPress: handleDelete });
    actions.push({ text: '取消', style: 'cancel' });
    Alert.alert(file.filename, undefined, actions);
  };

  if (!file) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color={colors.icon} />
      </View>
    );
  }

  const label = getMimeLabel(file.mime_type);
  const color = getMimeColor(file.mime_type);

  const statusLabel =
    file.status === 'done'
      ? '处理完成'
      : file.status === 'processing'
        ? '处理中'
        : file.status === 'queued'
          ? '排队中'
          : '处理失败';

  const headerBlock = (
    <View className="px-4 pb-4 pt-2">
      <View className="flex-row items-start">
        <View
          style={{ backgroundColor: color }}
          className="mr-3 h-12 w-12 items-center justify-center rounded-xl">
          <ThemedText className="text-xs font-bold text-white">{label}</ThemedText>
        </View>
        <View className="min-w-0 flex-1">
          <ThemedText className="text-base font-semibold text-primary" numberOfLines={2}>
            {file.filename}
          </ThemedText>
          <ThemedText className="mt-1 text-xs text-subtext">
            {label} · {formatFileSize(file.file_size)} · {formatDate(file.created_at)}
          </ThemedText>
        </View>
      </View>

      <View className="mt-4 flex-row items-center justify-between border-t border-border py-3">
        <View className="flex-row items-center gap-2">
          <ThemedText className="text-sm text-subtext">状态</ThemedText>
          {file.status === 'done' ? (
            <Icon name="CheckCircle2" size={18} color="#22c55e" />
          ) : file.status === 'error' ? (
            <Icon name="AlertCircle" size={18} color="#E53935" />
          ) : (
            <ActivityIndicator size="small" />
          )}
          <ThemedText className="text-sm text-primary">{statusLabel}</ThemedText>
        </View>
        <ThemedText className="text-sm text-subtext">
          {file.chunk_count > 0
            ? `${file.chunk_count} 个分块`
            : chunksTotal > 0
              ? `${chunksTotal} 个分块`
              : ''}
        </ThemedText>
      </View>

      {file.status === 'processing' && (
        <View className="mt-2">
          <View className="mb-1 flex-row justify-between">
            <ThemedText className="text-xs text-subtext">解析与向量化…</ThemedText>
            <ThemedText className="text-xs text-subtext">
              {Math.round((file.progress ?? 0) * 100)}%
            </ThemedText>
          </View>
          <View className="h-1 overflow-hidden rounded-full bg-border">
            <View
              className="h-1 rounded-full bg-primary"
              style={{ width: `${Math.round((file.progress ?? 0) * 100)}%` }}
            />
          </View>
        </View>
      )}

      {file.status === 'error' && (
        <View className="mt-3 flex-row flex-wrap items-center gap-2">
          <Icon name="AlertCircle" size={16} color="#E53935" />
          <ThemedText className="text-xs" style={{ color: '#E53935' }}>
            处理失败，可尝试重新处理
          </ThemedText>
          <TouchableOpacity
            onPress={() => void handleReindex()}
            className="rounded-lg bg-secondary px-3 py-1.5">
            <ThemedText className="text-xs text-primary">重新处理</ThemedText>
          </TouchableOpacity>
        </View>
      )}

      {file.status === 'done' && (
        <ThemedText className="mb-2 mt-4 text-sm font-semibold text-primary">
          共 {chunksTotal || file.chunk_count} 个分块
        </ThemedText>
      )}

      {file.status !== 'done' && file.status !== 'error' && (
        <ThemedText className="mt-3 text-xs text-subtext">处理完成后可查看 RAG 分块内容</ThemedText>
      )}

      {chunksError && file.status === 'done' && (
        <ThemedText className="mt-2 text-sm text-red-500">{chunksError}</ThemedText>
      )}
    </View>
  );

  const renderChunk = ({ item }: { item: KnowledgeChunk }) => {
    const displayIndex = item.index + 1;
    const charCount = [...(item.content ?? '')].length;
    return (
      <View className="bg-secondary/50 mx-4 mb-3 rounded-2xl border border-border p-3">
        <View className="mb-2 flex-row items-center justify-between">
          <View className="rounded-md border border-border bg-background px-2 py-0.5">
            <ThemedText className="text-xs text-subtext">#{displayIndex}</ThemedText>
          </View>
          <ThemedText className="text-xs text-subtext">
            {charCount} 字符 · {item.token_count} tokens
          </ThemedText>
        </View>
        <ChunkContent content={item.content ?? ''} />
      </View>
    );
  };

  return (
    <View className="flex-1 bg-background">
      <Header
        title="预览"
        showBackButton
        onBackPress={() => router.back()}
        rightComponents={[
          <TouchableOpacity
            key="menu"
            onPress={openMenu}
            disabled={downloading}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className={downloading ? 'opacity-40' : ''}>
            {downloading ? (
              <ActivityIndicator size="small" color={colors.icon} />
            ) : (
              <Icon name="MoreHorizontal" size={22} />
            )}
          </TouchableOpacity>,
        ]}
      />

      {file.status === 'done' ? (
        <FlatList
          data={chunks}
          keyExtractor={(c, i) => (c.id ? c.id : `chunk-${i}`)}
          renderItem={renderChunk}
          ListHeaderComponent={headerBlock}
          contentContainerStyle={{ paddingBottom: listBottomPad }}
          refreshControl={
            <RefreshControl
              refreshing={chunksRefreshing}
              onRefresh={onRefreshChunks}
              tintColor={colors.icon}
            />
          }
          onEndReached={loadMoreChunks}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingChunks && chunks.length > 0 ? (
              <ActivityIndicator style={{ paddingVertical: 16 }} color={colors.icon} />
            ) : null
          }
          ListEmptyComponent={
            loadingChunks ? (
              <View className="items-center py-12">
                <ActivityIndicator color={colors.icon} />
              </View>
            ) : (
              <View className="px-4 py-8">
                <ThemedText className="text-center text-sm text-subtext">暂无分块数据</ThemedText>
              </View>
            )
          }
        />
      ) : (
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: listBottomPad }}>
          {headerBlock}
        </ScrollView>
      )}
    </View>
  );
}
