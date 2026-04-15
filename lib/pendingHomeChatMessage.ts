let pending: string | null = null;

export function setPendingHomeChatMessage(text: string): void {
  pending = text.trim() || null;
}

export function consumePendingHomeChatMessage(): string | null {
  const t = pending;
  pending = null;
  return t;
}
