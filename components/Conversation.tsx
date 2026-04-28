import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  Keyboard,
  Platform,
  StyleSheet,
  Image,
  Text,
  Linking,
  Alert,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AnimatedView from './AnimatedView';
import Icon from './Icon';
import StarFloatingLoader from './StarFloatingLoader';
import ThemedText from './ThemedText';

import { useThemeColors } from '@/app/contexts/ThemeColors';
import { useGlobalFloatingTabBarExtraBottom } from '@/hooks/useGlobalFloatingTabBarInset';
import {
  formatAssistantMessageMarkdown,
  getAstLinkDisplayLabel,
} from '@/lib/assistantMessageCitations';
import {
  parseThinkingBlocks,
  stripGeneratedDocumentRefs,
  type ParsedChatDocument,
} from '@/lib/chatGeneratedDocuments';
import { persistFromAssistantMessagesFireForget } from '@/lib/persistGeneratedChatDocuments';
import { shareChatConversation } from '@/lib/shareChatConversation';
import { knowledgeApi } from '@/services/knowledgeApi';
import { shadowPresets } from '@/utils/useShadow';

export type MessageFile = {
  name: string;
  mimeType: string;
};

export type Message = {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  images?: string[];
  files?: MessageFile[];
  timestamp: Date;
  isStreaming?: boolean;
  /** 流式期间 AI 正在执行的步骤描述 */
  thinkingStep?: string;
};

type ConversationProps = {
  messages: Message[];
  isTyping?: boolean;
  /** 私人模式：每条「用户 + 助手（非流式）」合并为同一圆角外框 */
  combineTurnsInFrame?: boolean;
  /** 重新生成指定助手回复（会移除该条并基于上一条用户消息重试） */
  onRegenerateAssistant?: (assistantMessageId: string) => void;
  /**
   * 已收藏到知识库的助手消息 id（与 onKnowledgeAssistantStarred 同时传入时由外层持久化，避免切页丢状态）
   */
  knowledgeStarredAssistantIds?: Set<string>;
  onKnowledgeAssistantStarred?: (assistantMessageId: string) => void;
  /** 私人对话线程 id：用于将助手生成的报告默认登记到「历史文档」 */
  getThreadId?: () => string | null;
};

function buildMarkdownStyles(colors: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    body: {
      color: colors.text,
      fontSize: 16,
      lineHeight: 24,
    },
    heading1: {
      color: colors.text,
      fontSize: 24,
      fontWeight: '700',
      marginBottom: 8,
      marginTop: 16,
    },
    heading2: {
      color: colors.text,
      fontSize: 20,
      fontWeight: '700',
      marginBottom: 8,
      marginTop: 12,
    },
    heading3: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '600',
      marginBottom: 6,
      marginTop: 10,
    },
    strong: {
      fontWeight: '700',
      color: colors.text,
    },
    em: {
      fontStyle: 'italic',
    },
    bullet_list: {
      marginVertical: 8,
    },
    ordered_list: {
      marginVertical: 8,
    },
    list_item: {
      marginVertical: 4,
    },
    code_inline: {
      backgroundColor: colors.secondary,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: 14,
    },
    code_block: {
      backgroundColor: colors.secondary,
      padding: 12,
      borderRadius: 8,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: 14,
      marginVertical: 8,
    },
    fence: {
      backgroundColor: colors.secondary,
      padding: 12,
      borderRadius: 8,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: 14,
      marginVertical: 8,
    },
    blockquote: {
      borderLeftWidth: 3,
      borderLeftColor: colors.text,
      paddingLeft: 12,
      marginVertical: 8,
      opacity: 0.8,
    },
    link: {
      color: colors.isDark ? 'rgba(230, 240, 255, 0.96)' : 'rgba(15, 40, 90, 0.95)',
      fontSize: 15,
      lineHeight: 22,
      textDecorationLine: 'none' as 'none',
      backgroundColor: colors.isDark ? 'rgba(220, 232, 255, 0.18)' : 'rgba(30, 80, 200, 0.08)',
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.isDark
        ? 'rgba(220, 232, 255, 0.28)'
        : 'rgba(30, 80, 200, 0.18)',
      marginTop: 2,
      marginBottom: 2,
    },
    linkLabel: {
      color: colors.isDark ? 'rgba(230, 240, 255, 0.96)' : 'rgba(15, 40, 90, 0.95)',
      fontSize: 15,
      lineHeight: 22,
    },
    linkIcon: {
      color: colors.isDark ? 'rgba(200, 220, 255, 0.6)' : 'rgba(30, 80, 200, 0.55)',
      fontSize: 12,
      lineHeight: 20,
    },
    paragraph: {
      marginVertical: 4,
    },
  });
}

/** 仅覆写内联 `link`：可点击、短标题、↗，避免依赖 `openUrl` 对 onLinkPress 的布尔陷阱 */
const assistantChatMarkdownRules = {
  link: (node: any, children: any, _parent: unknown, styles: any) => {
    const href = (node?.attributes?.href as string | undefined)?.trim() ?? '';
    if (!href) {
      return (
        <Text key={node.key} style={styles.body}>
          {children}
        </Text>
      );
    }
    const display = getAstLinkDisplayLabel(node, href);
    return (
      <Text
        key={node.key}
        accessible
        accessibilityRole="link"
        accessibilityLabel={`${display}，在浏览器中打开`}
        onPress={() => {
          void Linking.openURL(href);
        }}
        style={styles.link}
      >
        <Text style={styles.linkLabel}>{display}</Text>
        <Text style={styles.linkIcon}> ↗</Text>
      </Text>
    );
  },
};

export const Conversation = ({
  messages,
  isTyping,
  combineTurnsInFrame = false,
  onRegenerateAssistant,
  knowledgeStarredAssistantIds: knowledgeStarredAssistantIdsProp,
  onKnowledgeAssistantStarred,
  getThreadId,
}: ConversationProps) => {
  const insets = useSafeAreaInsets();
  const floatingTabExtra = useGlobalFloatingTabBarExtraBottom();
  const scrollViewRef = useRef<ScrollView>(null);
  const [internalStarredIds, setInternalStarredIds] = useState<Set<string>>(() => new Set());
  const [showScrollButton, setShowScrollButton] = useState(false);
  const colors = useThemeColors();

  useEffect(() => {
    persistFromAssistantMessagesFireForget(messages, getThreadId);
  }, [messages, getThreadId]);

  const useExternalStar =
    knowledgeStarredAssistantIdsProp != null && onKnowledgeAssistantStarred != null;
  const knowledgeSavedIds = useExternalStar
    ? knowledgeStarredAssistantIdsProp!
    : internalStarredIds;

  useEffect(() => {
    // 首轮对话保留在顶部，避免被强制滚到底部后落在屏幕中间。
    if (messages.length <= 2 && !isTyping) return;
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages, isTyping]);

  useEffect(() => {
    const keyboardShowEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const keyboardListener = Keyboard.addListener(keyboardShowEvent, () => {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    });

    return () => keyboardListener.remove();
  }, []);

  const handleScroll = (event: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    setShowScrollButton(distanceFromBottom > 100);
  };

  const scrollToBottom = () => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  };

  const markKnowledgeSaved = useCallback(
    (assistantId: string) => {
      if (useExternalStar) {
        onKnowledgeAssistantStarred!(assistantId);
      } else {
        setInternalStarredIds((prev) => new Set(prev).add(assistantId));
      }
    },
    [useExternalStar, onKnowledgeAssistantStarred]
  );

  if (messages.length === 0 && !isTyping) {
    return null;
  }

  const renderedList = renderMessageList({
    messages,
    colors,
    knowledgeSavedIds,
    markKnowledgeSaved,
    onRegenerateAssistant,
    combineTurnsInFrame,
  });

  return (
    <View className="relative flex-1">
      <ScrollView
        ref={scrollViewRef}
        className="flex-1 px-6"
        contentContainerStyle={{
          paddingBottom: insets.bottom + 140 + floatingTabExtra,
          paddingTop: insets.top + 80,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onScroll={handleScroll}
        scrollEventThrottle={16}>
        {renderedList}

        {isTyping && (
          <AnimatedView animation="fadeIn" duration={300}>
            <TypingIndicator />
          </AnimatedView>
        )}
      </ScrollView>

      {showScrollButton && (
        <View
          style={{ bottom: insets.bottom + 130 }}
          className="absolute left-0 w-full items-center justify-center pb-4">
          <AnimatedView animation="scaleIn" duration={200}>
            <Pressable
              onPress={scrollToBottom}
              className="h-10 w-10 items-center justify-center rounded-full border border-border bg-secondary"
              style={shadowPresets.small}>
              <Icon name="ArrowDown" size={18} />
            </Pressable>
          </AnimatedView>
        </View>
      )}

      <LinearGradient
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          width: '100%',
          height: insets.bottom + 140,
        }}
        colors={['transparent', 'transparent', colors.gradient]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />
    </View>
  );
};

type RenderListCtx = {
  messages: Message[];
  colors: ReturnType<typeof useThemeColors>;
  knowledgeSavedIds: Set<string>;
  markKnowledgeSaved: (id: string) => void;
  onRegenerateAssistant?: (assistantMessageId: string) => void;
  combineTurnsInFrame: boolean;
};

function renderMessageList(ctx: RenderListCtx): React.ReactNode[] {
  const {
    messages,
    colors,
    knowledgeSavedIds,
    markKnowledgeSaved,
    onRegenerateAssistant,
    combineTurnsInFrame,
  } = ctx;
  const out: React.ReactNode[] = [];

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]!;
    if (message.type === 'user') {
      const next = messages[i + 1];
      if (next?.type === 'assistant') {
        const { main } = parseThinkingBlocks(next.content);
        const { documents } = stripGeneratedDocumentRefs(main);
        const useCombinedFrame = combineTurnsInFrame || documents.length > 0;
        if (useCombinedFrame) {
          out.push(
            <View key={`turn-${message.id}-${next.id}`} className="mb-6">
              <CombinedChatTurn
                userMessage={message}
                assistantMessage={next}
                colors={colors}
                savedToKnowledge={knowledgeSavedIds.has(next.id)}
                onKnowledgeSaved={() => markKnowledgeSaved(next.id)}
                onRegenerateAssistant={onRegenerateAssistant}
              />
            </View>
          );
          i++;
          continue;
        }
      }
      out.push(
        <View key={message.id} className="mb-6">
          <UserMessage content={message.content} images={message.images} files={message.files} />
        </View>
      );
    } else {
      out.push(
        <View key={message.id} className="mb-6">
          <AssistantMessage
            content={message.content}
            isStreaming={message.isStreaming}
            thinkingStep={message.thinkingStep}
            messageId={message.id}
            contentTimestamp={message.timestamp}
            savedToKnowledge={knowledgeSavedIds.has(message.id)}
            onKnowledgeSaved={() => markKnowledgeSaved(message.id)}
            onRegenerateAssistant={onRegenerateAssistant}
          />
        </View>
      );
    }
  }

  return out;
}

function fileIcon(mimeType: string): string {
  if (mimeType.includes('pdf')) return '📄';
  if (mimeType.includes('word') || mimeType.includes('doc')) return '📝';
  if (mimeType.includes('excel') || mimeType.includes('xls') || mimeType.includes('spreadsheet'))
    return '📊';
  if (
    mimeType.includes('powerpoint') ||
    mimeType.includes('ppt') ||
    mimeType.includes('presentation')
  )
    return '📑';
  if (mimeType.includes('image')) return '🖼️';
  if (mimeType.includes('audio')) return '🎵';
  if (mimeType.includes('video')) return '🎬';
  return '📎';
}

function fileTypeLabel(mimeType: string): string {
  if (mimeType.includes('pdf')) return 'PDF';
  if (mimeType.includes('word') || mimeType.includes('docx') || mimeType.includes('doc'))
    return 'Word 文档';
  if (mimeType.includes('excel') || mimeType.includes('xlsx') || mimeType.includes('xls'))
    return 'Excel 表格';
  if (mimeType.includes('powerpoint') || mimeType.includes('pptx') || mimeType.includes('ppt'))
    return 'PPT 演示文稿';
  if (mimeType.includes('text/plain')) return '文本文件';
  if (mimeType.includes('image')) return '图片';
  return '文档';
}

const FileCard = ({ file }: { file: MessageFile }) => {
  const colors = useThemeColors();
  return (
    <View
      style={[shadowPresets.small, { backgroundColor: colors.secondary }]}
      className="min-w-[180px] max-w-[280px] flex-row items-center gap-3 overflow-hidden rounded-2xl px-3 py-2.5">
      <View className="h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-500">
        <ThemedText className="text-lg">{fileIcon(file.mimeType)}</ThemedText>
      </View>
      <View className="min-w-0 flex-1">
        <ThemedText className="text-sm font-medium text-primary" numberOfLines={2}>
          {file.name}
        </ThemedText>
        <ThemedText className="mt-0.5 text-[14px] text-subtext">
          {fileTypeLabel(file.mimeType)}
        </ThemedText>
      </View>
    </View>
  );
};

const UserMessage = ({
  content,
  images,
  files,
}: {
  content: string;
  images?: string[];
  files?: MessageFile[];
}) => (
  <AnimatedView animation="slideInBottom" duration={300}>
    <View className="max-w-[85%] items-end gap-1 self-end">
      {images && images.length > 0 && (
        <View className="flex-row flex-wrap justify-end gap-1">
          {images.map((uri, i) => (
            <Image key={i} source={{ uri }} className="h-36 w-36 rounded-2xl" resizeMode="cover" />
          ))}
        </View>
      )}
      {files && files.length > 0 && (
        <View className="items-end gap-1">
          {files.map((f, i) => (
            <FileCard key={i} file={f} />
          ))}
        </View>
      )}
      {content.trim().length > 0 && (
        <View style={shadowPresets.small} className="rounded-3xl bg-[#2B3239] p-global">
          <ThemedText className="text-[16px] leading-[24px]">
            {content}
          </ThemedText>
        </View>
      )}
    </View>
  </AnimatedView>
);

const ThinkingBlock = ({ text }: { text: string }) => {
  const [expanded, setExpanded] = useState(false);
  const colors = useThemeColors();
  const summary =
    text
      .split('\n')
      .find((l) => l.trim().length > 0)
      ?.trim()
      .slice(0, 60) ?? '思考过程';

  return (
    <Pressable
      onPress={() => setExpanded((v) => !v)}
      className="mb-3 overflow-hidden rounded-xl border border-border"
      style={{ backgroundColor: colors.secondary + 'CC' }}>
      <View className="flex-row items-center gap-2 px-3 py-2">
        <Icon name="Brain" size={14} color={colors.placeholder} />
        <ThemedText className="flex-1 text-[14px] text-subtext" numberOfLines={1}>
          {summary}
          {summary.length <
          text
            .trim()
            .split('\n')
            .find((l) => l.trim())
            ?.trim().length!
            ? '…'
            : ''}
        </ThemedText>
        <Icon name={expanded ? 'ChevronUp' : 'ChevronDown'} size={14} color={colors.placeholder} />
      </View>
      {expanded && (
        <View className="border-t border-border px-3 pb-3 pt-1">
          <ThemedText className="text-[14px] leading-5 text-subtext">{text.trim()}</ThemedText>
        </View>
      )}
    </Pressable>
  );
};

function GeneratedDocumentCard({
  doc,
  assistantAt,
}: {
  doc: ParsedChatDocument;
  assistantAt: Date;
}) {
  const metaTime = useMemo(
    () =>
      new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(assistantAt),
    [assistantAt]
  );

  const onOpen = () => {
    const ref = doc.rawRef.trim();
    if (/^https?:\/\//i.test(ref)) {
      void Linking.openURL(ref);
      return;
    }
    Alert.alert(
      '提示',
      '该文件路径来自生成环境，移动端无法直接打开。请使用复制链接或在网页端下载。'
    );
  };

  return (
    <Pressable
      onPress={onOpen}
      className="mt-3 flex-row items-center gap-3 rounded-xl bg-black/25 px-3 py-3"
      accessibilityRole="button"
      accessibilityLabel={`文档 ${doc.displayName}`}>
      <View className="h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-[#2563EB]">
        <ThemedText className="text-[14px] font-semibold text-white">{doc.kindLabel}</ThemedText>
      </View>
      <View className="min-w-0 flex-1">
        <ThemedText className="text-[15px] font-medium text-primary" numberOfLines={2}>
          {doc.displayName}
        </ThemedText>
        <ThemedText className="mt-1 text-[14px] text-subtext">
          {metaTime}
          <ThemedText className="text-[14px] text-subtext"> · 生成</ThemedText>
        </ThemedText>
      </View>
    </Pressable>
  );
}

async function copyPlain(text: string) {
  const t = text.trim();
  if (!t) {
    Alert.alert('提示', '没有可复制的内容');
    return;
  }
  await Clipboard.setStringAsync(t);
  Alert.alert('已复制', '正文已复制到剪贴板（不含文件）');
}

function normalizeTitleHintForFilename(raw: string): string {
  let s = raw.trim() || '对话摘录';
  if (/%[0-9A-Fa-f]{2}/.test(s)) {
    try {
      s = decodeURIComponent(s);
    } catch {
      /* keep */
    }
  }
  return s.trim() || '对话摘录';
}

async function saveMarkdownToKnowledge(markdown: string, titleHint: string) {
  const dir = FileSystem.cacheDirectory;
  if (!dir) {
    throw new Error('当前环境无法写入缓存');
  }
  const hint = normalizeTitleHintForFilename(titleHint);
  const safe =
    hint
      .replace(/[/\\?%*:|"<>]/g, '_')
      .trim()
      .slice(0, 48) || '对话摘录';
  const filename = `${safe}_${Date.now()}.md`;
  const uri = `${dir}${filename}`;
  await FileSystem.writeAsStringAsync(uri, markdown, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  await knowledgeApi.uploadFile(uri, filename, 'text/markdown');
}

function MessageActionToolbar({
  copyText,
  shareBody,
  savedToKnowledge,
  onSaveKnowledge,
  onRegenerate,
  colors,
}: {
  copyText: string;
  shareBody: string;
  savedToKnowledge: boolean;
  onSaveKnowledge: () => void;
  onRegenerate?: () => void;
  colors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View className="border-t border-[#3B3939] pt-3">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-6">
          <Pressable
            onPress={() => void copyPlain(copyText)}
            accessibilityRole="button"
            accessibilityLabel="复制文本">
            <Icon name="Copy" size={20} color={colors.text} strokeWidth={1.75} />
          </Pressable>
          <Pressable
            onPress={onSaveKnowledge}
            accessibilityRole="button"
            accessibilityLabel="收藏到知识库">
            <Icon
              name="Star"
              size={20}
              color={savedToKnowledge ? '#FBBF24' : colors.text}
              fill={savedToKnowledge ? '#FBBF24' : 'none'}
              strokeWidth={1.75}
            />
          </Pressable>
          <Pressable
            onPress={() => void shareChatConversation(shareBody)}
            accessibilityRole="button"
            accessibilityLabel="分享">
            <Icon name="Share2" size={20} color={colors.text} strokeWidth={1.75} />
          </Pressable>
        </View>
        {onRegenerate ? (
          <Pressable
            onPress={onRegenerate}
            accessibilityRole="button"
            accessibilityLabel="重新生成">
            <Icon name="RefreshCw" size={20} color={colors.text} strokeWidth={1.75} />
          </Pressable>
        ) : (
          <View className="w-5" />
        )}
      </View>
    </View>
  );
}

function CombinedChatTurn({
  userMessage,
  assistantMessage,
  colors,
  savedToKnowledge,
  onKnowledgeSaved,
  onRegenerateAssistant,
}: {
  userMessage: Message;
  assistantMessage: Message;
  colors: ReturnType<typeof useThemeColors>;
  savedToKnowledge: boolean;
  onKnowledgeSaved: () => void;
  onRegenerateAssistant?: (id: string) => void;
}) {
  const { thinking, main } = parseThinkingBlocks(assistantMessage.content);
  const isStreaming = assistantMessage.isStreaming === true;
  const { displayMarkdown, documents } = !isStreaming
    ? stripGeneratedDocumentRefs(main)
    : { displayMarkdown: main, documents: [] as ParsedChatDocument[] };
  const displayMd = useMemo(
    () => formatAssistantMessageMarkdown(displayMarkdown),
    [displayMarkdown]
  );
  const markdownStyles = useMemo(() => buildMarkdownStyles(colors), [colors]);

  const copyText = `${userMessage.content.trim()}\n\n${displayMd}`.trim();
  const knowledgeMd = `# ${userMessage.content.trim().slice(0, 120)}\n\n${displayMd}`;

  const handleSave = () => {
    void (async () => {
      try {
        await saveMarkdownToKnowledge(knowledgeMd, userMessage.content.trim());
        onKnowledgeSaved();
        Alert.alert('已收藏', '内容已上传到知识库');
      } catch (e) {
        const msg = e instanceof Error ? e.message : '上传失败';
        Alert.alert('收藏失败', msg);
      }
    })();
  };

  return (
    <View className="gap-3">
      <UserMessage
        content={userMessage.content}
        images={userMessage.images}
        files={userMessage.files}
      />
      <AnimatedView animation="fadeIn" duration={400} delay={120}>
        <View className="max-w-[95%] self-start">
          <View
            style={shadowPresets.card}
            className="overflow-hidden rounded-3xl bg-secondary px-4 py-4">
            {thinking.map((t, i) => (
              <ThinkingBlock key={i} text={t} />
            ))}
            {displayMd.trim().length > 0 ? (
              <Markdown
                style={markdownStyles}
                rules={assistantChatMarkdownRules}
                onLinkPress={(url) => {
                  Linking.openURL(url);
                  return false;
                }}>
                {displayMd}
              </Markdown>
            ) : isStreaming ? null : (
              <ThemedText className="text-base italic text-subtext">（未收到正文）</ThemedText>
            )}
            {isStreaming ? (
              <View className="mt-2">
                <StarFloatingLoader text={assistantMessage.thinkingStep ?? '正在为您搜索历史资料...'} />
              </View>
            ) : null}
            {!isStreaming && documents.length > 0
              ? documents.map((d, idx) => (
                  <GeneratedDocumentCard
                    key={`${d.rawRef}-${idx}`}
                    doc={d}
                    assistantAt={assistantMessage.timestamp}
                  />
                ))
              : null}
            {!isStreaming ? (
              <View className="mt-4">
                <MessageActionToolbar
                  copyText={copyText}
                  shareBody={copyText}
                  savedToKnowledge={savedToKnowledge}
                  onSaveKnowledge={handleSave}
                  onRegenerate={
                    onRegenerateAssistant
                      ? () => onRegenerateAssistant(assistantMessage.id)
                      : undefined
                  }
                  colors={colors}
                />
              </View>
            ) : null}
          </View>
        </View>
      </AnimatedView>
    </View>
  );
}

type AssistantMessageProps = {
  content: string;
  isStreaming?: boolean;
  thinkingStep?: string;
  messageId: string;
  contentTimestamp: Date;
  savedToKnowledge: boolean;
  onKnowledgeSaved: () => void;
  onRegenerateAssistant?: (assistantMessageId: string) => void;
};

const AssistantMessage = ({
  content,
  isStreaming,
  thinkingStep,
  messageId,
  contentTimestamp,
  savedToKnowledge,
  onKnowledgeSaved,
  onRegenerateAssistant,
}: AssistantMessageProps) => {
  const colors = useThemeColors();
  const { thinking, main } = parseThinkingBlocks(content);
  const { displayMarkdown, documents } = !isStreaming
    ? stripGeneratedDocumentRefs(main)
    : { displayMarkdown: main, documents: [] as ParsedChatDocument[] };
  const displayMd = useMemo(
    () => formatAssistantMessageMarkdown(displayMarkdown),
    [displayMarkdown]
  );
  const markdownStyles = useMemo(() => buildMarkdownStyles(colors), [colors]);

  const copyText = displayMd.trim();
  const knowledgeMd = `# 对话摘录\n\n${copyText}`;

  const handleSave = () => {
    void (async () => {
      try {
        await saveMarkdownToKnowledge(knowledgeMd, '对话摘录');
        onKnowledgeSaved();
        Alert.alert('已收藏', '内容已上传到知识库');
      } catch (e) {
        const msg = e instanceof Error ? e.message : '上传失败';
        Alert.alert('收藏失败', msg);
      }
    })();
  };

  return (
    <AnimatedView animation="fadeIn" duration={400} delay={200}>
      <View className="max-w-[95%]">
        <View className="mb-4">
          {thinking.map((t, i) => (
            <ThinkingBlock key={i} text={t} />
          ))}
          {displayMd.trim().length > 0 ? (
            <Markdown
              style={markdownStyles}
              rules={assistantChatMarkdownRules}
              onLinkPress={(url) => {
                Linking.openURL(url);
                return false;
              }}>
              {displayMd}
            </Markdown>
          ) : !isStreaming ? (
            <ThemedText className="text-base italic text-subtext">（未收到回复）</ThemedText>
          ) : null}
          {isStreaming ? (
            <View className="mt-2">
              <StarFloatingLoader text={thinkingStep ?? '正在为您搜索历史资料...'} />
            </View>
          ) : null}
          {!isStreaming && documents.length > 0
            ? documents.map((d, idx) => (
                <GeneratedDocumentCard
                  key={`${d.rawRef}-${idx}`}
                  doc={d}
                  assistantAt={contentTimestamp}
                />
              ))
            : null}
        </View>
        {!isStreaming && content.trim().length > 0 && (
          <MessageActionToolbar
            copyText={copyText}
            shareBody={copyText}
            savedToKnowledge={savedToKnowledge}
            onSaveKnowledge={handleSave}
            onRegenerate={
              onRegenerateAssistant ? () => onRegenerateAssistant(messageId) : undefined
            }
            colors={colors}
          />
        )}
      </View>
    </AnimatedView>
  );
};

const TypingIndicator = () => (
  <View className="py-4">
    <StarFloatingLoader text="正在为您搜索历史资料..." />
  </View>
);

export default Conversation;
