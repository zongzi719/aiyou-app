import { nlsRandomId32 } from './nlsIds';

export type NlsRealtimeHandlers = {
  onTranscriptionStarted?: (taskId: string, sessionId?: string) => void;
  onPartial?: (text: string, index: number) => void;
  onSentenceEnd?: (text: string, index: number) => void;
  onCompleted?: (taskId: string) => void;
  onTaskFailed?: (message: string, raw: NlsMessage) => void;
  onRawMessage?: (raw: NlsMessage) => void;
};

export type NlsMessage = {
  header: {
    namespace?: string;
    name?: string;
    status?: number;
    status_text?: string;
    status_message?: string;
    task_id?: string;
    message_id?: string;
    appkey?: string;
  };
  payload?: Record<string, unknown>;
};

const SUCCESS = 20000000;

export class AliyunNlsRealtimeTranscriber {
  private ws: WebSocket | null = null;

  private taskId = '';

  private canSendBinary = false;

  constructor(
    private readonly options: {
      gatewayWss: string;
      appkey: string;
      getToken: () => Promise<string>;
      handlers?: NlsRealtimeHandlers;
      /** 与默认 PCM 参数合并；参见 StartTranscription payload */
      payload?: Record<string, unknown>;
      /** WebSocket 关闭（含对端断开、本地 close） */
      onConnectionClosed?: () => void;
    }
  ) {}

  async connectAndStart(): Promise<void> {
    const token = await this.options.getToken();
    const base = this.options.gatewayWss.replace(/\/$/, '');
    const url = `${base}?token=${encodeURIComponent(token)}`;
    this.taskId = nlsRandomId32();

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      const t = setTimeout(() => {
        reject(new Error('等待 TranscriptionStarted 超时'));
      }, 15000);

      ws.onclose = () => {
        this.canSendBinary = false;
        this.options.onConnectionClosed?.();
      };

      ws.onopen = () => {
        const msg: NlsMessage = {
          header: {
            message_id: nlsRandomId32(),
            task_id: this.taskId,
            namespace: 'SpeechTranscriber',
            name: 'StartTranscription',
            appkey: this.options.appkey,
          },
          payload: {
            format: 'pcm',
            sample_rate: 16000,
            enable_intermediate_result: true,
            enable_punctuation_prediction: true,
            enable_inverse_text_normalization: true,
            ...this.options.payload,
          },
        };
        ws.send(JSON.stringify(msg));
      };

      ws.onmessage = (ev) => {
        if (typeof ev.data !== 'string') return;
        let parsed: NlsMessage;
        try {
          parsed = JSON.parse(ev.data) as NlsMessage;
        } catch {
          return;
        }
        this.options.handlers?.onRawMessage?.(parsed);

        if (parsed.header?.name === 'TranscriptionStarted') {
          clearTimeout(t);
          this.canSendBinary = true;
          const sid =
            typeof parsed.payload?.session_id === 'string' ? parsed.payload.session_id : undefined;
          this.options.handlers?.onTranscriptionStarted?.(this.taskId, sid);
          resolve();
          return;
        }

        this.dispatchMessage(parsed);
      };

      ws.onerror = () => {
        clearTimeout(t);
        reject(new Error('WebSocket 连接失败'));
      };
    });
  }

  private dispatchMessage(parsed: NlsMessage): void {
    const name = parsed.header?.name;
    const status = parsed.header?.status;
    const taskId = parsed.header?.task_id || '';

    if (status != null && status !== SUCCESS) {
      const st = parsed.header?.status_text || parsed.header?.status_message || '';
      this.options.handlers?.onTaskFailed?.(st || `status ${status}`, parsed);
      return;
    }

    switch (name) {
      case 'TranscriptionResultChanged': {
        const idx = Number(parsed.payload?.index ?? 0);
        const text = String(parsed.payload?.result ?? '');
        this.options.handlers?.onPartial?.(text, idx);
        break;
      }
      case 'SentenceEnd': {
        const idx = Number(parsed.payload?.index ?? 0);
        const text = String(parsed.payload?.result ?? '');
        this.options.handlers?.onSentenceEnd?.(text, idx);
        break;
      }
      case 'TranscriptionCompleted':
        this.canSendBinary = false;
        this.options.handlers?.onCompleted?.(taskId || this.taskId);
        break;
      default:
        break;
    }
  }

  sendPcmChunk(chunk: Uint8Array): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.canSendBinary) return;
    const ab = chunk.buffer as ArrayBuffer;
    const out =
      chunk.byteOffset === 0 && chunk.byteLength === ab.byteLength
        ? ab
        : ab.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength);
    this.ws.send(out);
  }

  stop(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const stopMsg: NlsMessage = {
      header: {
        message_id: nlsRandomId32(),
        task_id: this.taskId,
        namespace: 'SpeechTranscriber',
        name: 'StopTranscription',
        appkey: this.options.appkey,
      },
    };
    this.ws.send(JSON.stringify(stopMsg));
    this.canSendBinary = false;
  }

  close(): void {
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
    this.canSendBinary = false;
  }
}
