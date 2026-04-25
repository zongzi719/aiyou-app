import {
  normalizeDocumentDedupeKey,
  parseThinkingBlocks,
  stripGeneratedDocumentRefs,
  type ParsedChatDocument,
} from '@/lib/chatGeneratedDocuments';
import { peekMemoryDocuments, putMemoryDocuments } from '@/lib/listDataCache';
import { memoryApi, type HistoryDocument } from '@/services/memoryApi';

type ChatMessageForPersist = {
  id: string;
  type: string;
  isStreaming?: boolean;
  content: string;
};

const savedKeys = new Set<string>();

function mimeForParsedDoc(doc: ParsedChatDocument): string {
  const e = doc.ext.toLowerCase();
  if (e === 'pdf') return 'application/pdf';
  if (e === 'md' || e === 'markdown') return 'text/markdown';
  if (e === 'doc' || e === 'docx') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return 'text/plain';
}

function mergeDocumentIntoCache(row: HistoryDocument): void {
  const cur = peekMemoryDocuments() ?? [];
  if (cur.some((d) => d.id === row.id)) {
    putMemoryDocuments(cur);
    return;
  }
  putMemoryDocuments([row, ...cur]);
}

/**
 * 将单条助手消息解析出的生成文档登记到记忆库「历史文档」（默认、静默、失败可重试）。
 */
export function persistAssistantGeneratedDocumentsFireForget(
  messageId: string,
  documents: ParsedChatDocument[],
  threadId?: string | null,
): void {
  if (documents.length === 0) return;
  const tid = threadId?.trim() || undefined;

  for (const doc of documents) {
    const dedupe = normalizeDocumentDedupeKey(doc.rawRef);
    const key = `${messageId}:${dedupe}`;
    if (savedKeys.has(key)) continue;
    savedKeys.add(key);

    void (async () => {
      try {
        const row = await memoryApi.recordGeneratedDocument({
          title: doc.displayName || '生成文档',
          source_url: doc.rawRef.trim(),
          mime_type: mimeForParsedDoc(doc),
          preview: '',
          thread_id: tid,
        });
        mergeDocumentIntoCache(row);
      } catch {
        savedKeys.delete(key);
      }
    })();
  }
}

/** 扫描当前消息列表中非流式助手回复，逐条登记其中的生成文档 */
export function persistFromAssistantMessagesFireForget(
  messages: ChatMessageForPersist[],
  getThreadId?: () => string | null,
): void {
  const tid = getThreadId?.() ?? null;
  for (const m of messages) {
    if (m.type !== 'assistant' || m.isStreaming) continue;
    const { main } = parseThinkingBlocks(m.content);
    const { documents } = stripGeneratedDocumentRefs(main);
    if (documents.length === 0) continue;
    persistAssistantGeneratedDocumentsFireForget(m.id, documents, tid);
  }
}
