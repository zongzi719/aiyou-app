import type { UserMemory } from '@/services/memoryApi';

export type PendingMemoryReview = {
  id: string;
  content: string;
  category: string;
};

type Listener = (next: PendingMemoryReview | null) => void;

let pendingMemoryReview: PendingMemoryReview | null = null;
const listeners = new Set<Listener>();

export function getPendingMemoryReview(): PendingMemoryReview | null {
  return pendingMemoryReview;
}

export function setPendingMemoryReview(memory: UserMemory): void {
  pendingMemoryReview = {
    id: memory.id,
    content: memory.content,
    category: memory.category,
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
