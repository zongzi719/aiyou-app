/**
 * 从标准 WAV（含 data 子块）中定位 PCM 起始偏移，并支持按「已读字节」增量切分。
 */
export function findWavPcmDataByteOffset(buffer: Uint8Array): number | null {
  if (buffer.length < 12) return null;
  if (buffer[0] !== 0x52 || buffer[1] !== 0x49 || buffer[2] !== 0x46 || buffer[3] !== 0x46) {
    return null;
  }
  let i = 12;
  while (i + 8 <= buffer.length) {
    const id = String.fromCharCode(buffer[i], buffer[i + 1], buffer[i + 2], buffer[i + 3]);
    const size =
      buffer[i + 4] | (buffer[i + 5] << 8) | (buffer[i + 6] << 16) | (buffer[i + 7] << 24);
    if (id === 'data') {
      return i + 8;
    }
    const padded = size + (size % 2);
    i += 8 + padded;
  }
  return null;
}

export function base64ToUint8Array(b64: string): Uint8Array {
  const g = globalThis as unknown as { atob?: (s: string) => string };
  if (typeof g.atob !== 'function') {
    throw new Error('atob 不可用');
  }
  const binary = g.atob(b64);
  const out = new Uint8Array(binary.length);
  for (let k = 0; k < binary.length; k++) {
    out[k] = binary.charCodeAt(k);
  }
  return out;
}
