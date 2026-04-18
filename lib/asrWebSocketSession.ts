import type { AsrWsMode } from '@/lib/asrWsUrl';
import { getAsrWebSocketUrl } from '@/lib/asrWsUrl';

export type AsrServerMessage =
  | { type: 'partial'; text: string }
  | { type: 'final'; text: string }
  | { type: 'done'; audio_url: string }
  | { type: 'error'; message: string };

export type AsrWsHandlers = {
  onMessage: (msg: AsrServerMessage) => void;
  onClose: (ev: { code: number; reason: string; wasClean: boolean }) => void;
  onError: (e: Event | Error) => void;
};

function parseServerPayload(data: unknown): AsrServerMessage | null {
  if (typeof data !== 'string') return null;
  try {
    const v = JSON.parse(data) as Record<string, unknown>;
    const t = v.type;
    if (t === 'partial' && typeof v.text === 'string') {
      return { type: 'partial', text: v.text };
    }
    if (t === 'final' && typeof v.text === 'string') {
      return { type: 'final', text: v.text };
    }
    if (t === 'done' && typeof v.audio_url === 'string') {
      return { type: 'done', audio_url: v.audio_url };
    }
    if (t === 'error' && typeof v.message === 'string') {
      return { type: 'error', message: v.message };
    }
    return null;
  } catch {
    return null;
  }
}

export async function connectAsrWebSocket(
  mode: AsrWsMode,
  handlers: AsrWsHandlers
): Promise<WebSocket> {
  const url = await getAsrWebSocketUrl(mode);
  const ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';

  ws.onmessage = (ev) => {
    if (typeof ev.data === 'string') {
      const msg = parseServerPayload(ev.data);
      if (msg) handlers.onMessage(msg);
    }
  };
  ws.onclose = (ev) => {
    handlers.onClose({ code: ev.code, reason: ev.reason || '', wasClean: ev.wasClean });
  };

  return new Promise((resolve, reject) => {
    ws.onopen = () => resolve(ws);
    ws.onerror = (e) => {
      handlers.onError(e);
      try {
        ws.close();
      } catch {
        /* noop */
      }
      reject(new Error('WebSocket 连接失败'));
    };
  });
}

export function wsSendJson(ws: WebSocket, obj: Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

export function wsSendBinary(ws: WebSocket, buf: ArrayBuffer): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(buf);
  }
}
