/** 将 PCM Int16 流按固定采样点数切分为 ArrayBuffer，供 WebSocket 发送 */
const SAMPLES_PER_FRAME = 4096;
const BYTES_PER_FRAME = SAMPLES_PER_FRAME * 2;

export class PcmInt16FrameAccumulator {
  private buf = new Int16Array(0);

  /** 追加小端 Int16 PCM（与 expo-stream-audio 一致） */
  appendPcmInt16LE(bytes: Uint8Array): ArrayBuffer[] {
    const byteLen = bytes.byteLength - (bytes.byteLength % 2);
    const view = new DataView(bytes.buffer, bytes.byteOffset, byteLen);
    const n = byteLen / 2;
    const incoming = new Int16Array(n);
    for (let i = 0; i < n; i++) {
      incoming[i] = view.getInt16(i * 2, true);
    }
    const merged = new Int16Array(this.buf.length + incoming.length);
    merged.set(this.buf, 0);
    merged.set(incoming, this.buf.length);
    this.buf = merged;

    const out: ArrayBuffer[] = [];
    let offset = 0;
    while (offset + SAMPLES_PER_FRAME <= this.buf.length) {
      const slice = this.buf.subarray(offset, offset + SAMPLES_PER_FRAME);
      const frame = new ArrayBuffer(BYTES_PER_FRAME);
      new Int16Array(frame).set(slice);
      out.push(frame);
      offset += SAMPLES_PER_FRAME;
    }
    if (offset < this.buf.length) {
      this.buf = this.buf.slice(offset);
    } else {
      this.buf = new Int16Array(0);
    }
    return out;
  }

  /** 会话结束时将剩余不足一帧的样本补零发出（可选）；若丢弃则清空 */
  flushPadWithZeros(): ArrayBuffer | null {
    if (this.buf.length === 0) return null;
    const frame = new ArrayBuffer(BYTES_PER_FRAME);
    const out = new Int16Array(frame);
    out.set(this.buf.subarray(0, Math.min(this.buf.length, SAMPLES_PER_FRAME)));
    this.buf = new Int16Array(0);
    return frame;
  }

  clear(): void {
    this.buf = new Int16Array(0);
  }
}

export { SAMPLES_PER_FRAME, BYTES_PER_FRAME };
