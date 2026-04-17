import { useSyncExternalStore } from 'react';

let visible = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function setHomeRecordPanelVisible(next: boolean): void {
  if (visible === next) return;
  visible = next;
  emit();
}

export function getHomeRecordPanelVisibleSnapshot(): boolean {
  return visible;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useHomeRecordPanelVisible(): boolean {
  return useSyncExternalStore(subscribe, getHomeRecordPanelVisibleSnapshot, () => false);
}
