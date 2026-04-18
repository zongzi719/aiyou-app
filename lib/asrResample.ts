/**
 * 将麦克风 PCM（Int16 小端 mono）重采样为 16kHz，与流式 ASR 网关约定一致。
 * iOS 上 AVAudioEngine 常为 44.1k/48k，若按 16k 解析会导致识别异常（易成「嗯嗯」类 filler）。
 */
export function resampleInt16MonoTo16k(input: Int16Array, inputSampleRate: number): Int16Array {
  const outRate = 16000;
  if (inputSampleRate <= 0 || !Number.isFinite(inputSampleRate)) {
    return input;
  }
  if (Math.abs(inputSampleRate - outRate) < 1) {
    return input;
  }

  const ratio = inputSampleRate / outRate;
  const outLen = Math.max(1, Math.floor(input.length / ratio));
  const out = new Int16Array(outLen);

  for (let i = 0; i < outLen; i++) {
    const srcPos = i * ratio;
    const i0 = Math.floor(srcPos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const f = srcPos - i0;
    const s = (1 - f) * input[i0] + f * input[i1];
    out[i] = Math.max(-32768, Math.min(32767, Math.round(s)));
  }

  return out;
}

/** Int16 小端 → Uint8Array，供现有 PCM 累加器使用 */
export function int16ArrayToLeUint8(samples: Int16Array): Uint8Array {
  const buf = new ArrayBuffer(samples.length * 2);
  new Int16Array(buf).set(samples);
  return new Uint8Array(buf);
}
