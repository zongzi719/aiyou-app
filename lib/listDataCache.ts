import type { ThreadSummary } from '@/lib/privateChatApi';
import type { KnowledgeFolder, KnowledgeFile } from '@/services/knowledgeApi';
import type { UserMemory, HistoryDocument, HistoryTodo } from '@/services/memoryApi';

/** 超过该时间未更新则视为过期，下次进入或定时 tick 会重新请求 */
export const LIST_CACHE_STALE_MS = 120_000;

/** 定时检查间隔（仅当已过期时才会真正发请求） */
export const LIST_CACHE_POLL_INTERVAL_MS = 600_000;

interface Timestamped<T> {
  data: T;
  at: number;
}

function isStale(at: number): boolean {
  return Date.now() - at > LIST_CACHE_STALE_MS;
}

// ─── 记忆库：用户记忆 ───────────────────────────────────────────────────────

let memoriesBox: Timestamped<UserMemory[]> | null = null;

export function peekMemoryMemories(): UserMemory[] | null {
  return memoriesBox ? memoriesBox.data : null;
}

export function putMemoryMemories(list: UserMemory[]): void {
  memoriesBox = { data: list, at: Date.now() };
}

export function memoryMemoriesStale(): boolean {
  if (!memoriesBox) return true;
  return isStale(memoriesBox.at);
}

// ─── 记忆库：历史文档 ─────────────────────────────────────────────────────────

let documentsBox: Timestamped<HistoryDocument[]> | null = null;

export function peekMemoryDocuments(): HistoryDocument[] | null {
  return documentsBox ? documentsBox.data : null;
}

export function putMemoryDocuments(list: HistoryDocument[]): void {
  documentsBox = { data: list, at: Date.now() };
}

export function memoryDocumentsStale(): boolean {
  if (!documentsBox) return true;
  return isStale(documentsBox.at);
}

// ─── 记忆库：历史事项（按分类缓存）────────────────────────────────────────────

const todosByCategory = new Map<string, Timestamped<HistoryTodo[]>>();

export function peekMemoryTodos(category: string): HistoryTodo[] | null {
  const e = todosByCategory.get(category);
  return e ? e.data : null;
}

export function putMemoryTodos(category: string, list: HistoryTodo[]): void {
  todosByCategory.set(category, { data: list, at: Date.now() });
}

export function memoryTodosStale(category: string): boolean {
  const e = todosByCategory.get(category);
  if (!e) return true;
  return isStale(e.at);
}

// ─── 知识库 ─────────────────────────────────────────────────────────────────

let knowledgeBox: Timestamped<{ folders: KnowledgeFolder[]; files: KnowledgeFile[] }> | null = null;

export function peekKnowledgeData(): { folders: KnowledgeFolder[]; files: KnowledgeFile[] } | null {
  return knowledgeBox ? knowledgeBox.data : null;
}

export function putKnowledgeData(folders: KnowledgeFolder[], files: KnowledgeFile[]): void {
  knowledgeBox = { data: { folders, files }, at: Date.now() };
}

export function knowledgeDataStale(): boolean {
  if (!knowledgeBox) return true;
  return isStale(knowledgeBox.at);
}

// ─── 历史对话（侧栏 threads/search）──────────────────────────────────────────

let privateThreadsBox: Timestamped<ThreadSummary[]> | null = null;

export function peekPrivateThreadsCache(): ThreadSummary[] | null {
  return privateThreadsBox ? privateThreadsBox.data : null;
}

export function putPrivateThreadsCache(list: ThreadSummary[]): void {
  privateThreadsBox = { data: list, at: Date.now() };
}

export function privateThreadsCacheStale(): boolean {
  if (!privateThreadsBox) return true;
  return isStale(privateThreadsBox.at);
}

/** 新建对话后插到列表顶部并刷新缓存时间 */
export function prependPrivateThreadCache(item: ThreadSummary): void {
  const cur = privateThreadsBox?.data ?? [];
  const next = [item, ...cur.filter((t) => t.thread_id !== item.thread_id)];
  putPrivateThreadsCache(next);
}

export function clearAllListDataCaches(): void {
  memoriesBox = null;
  documentsBox = null;
  todosByCategory.clear();
  knowledgeBox = null;
  privateThreadsBox = null;
}
