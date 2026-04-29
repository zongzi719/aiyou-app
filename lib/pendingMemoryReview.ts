import type { UserMemory } from '@/services/memoryApi';

export type PendingMemoryReview = {
  id: string;
  content: string;
  category: string;
  /** 一次接受写入多条时，用于取消时批量删除 */
  memoryIds?: string[];
  /** 顶栏逐条展示（与 content 同步） */
  lines?: string[];
};

type Listener = (next: PendingMemoryReview | null) => void;

let pendingMemoryReview: PendingMemoryReview | null = null;
const listeners = new Set<Listener>();

export function getPendingMemoryReview(): PendingMemoryReview | null {
  return pendingMemoryReview;
}

export function setPendingMemoryReview(memory: UserMemory | UserMemory[]): void {
  const memories = Array.isArray(memory) ? memory : [memory];
  if (memories.length === 0) return;
  const lines = memories.map((m) => m.content);
  pendingMemoryReview = {
    id: memories[0].id,
    content: lines.join('\n\n'),
    category: memories[0].category,
    memoryIds: memories.map((m) => m.id),
    lines,
  };
  for (const l of listeners) l(pendingMemoryReview);
}

export function clearPendingMemoryReview(): void {
  pendingMemoryReview = null;
  for (const l of listeners) l(null);
}

export function subscribePendingMemoryReview(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
