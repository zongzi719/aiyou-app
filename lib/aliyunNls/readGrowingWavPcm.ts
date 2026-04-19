import * as FileSystem from 'expo-file-system/legacy';

import { base64ToUint8Array, findWavPcmDataByteOffset } from './wavPcm';

export type GrowingWavState = {
  pcmStart: number | null;
  nextReadPos: number;
};

export function createGrowingWavPcmReader(): {
  state: GrowingWavState;
  pollNewPcm(uri: string | null | undefined): Promise<Uint8Array | null>;
} {
  const state: GrowingWavState = { pcmStart: null, nextReadPos: 0 };

  return {
    state,
    async pollNewPcm(uri: string | null | undefined): Promise<Uint8Array | null> {
      if (!uri) return null;
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists || !info.size || info.size <= state.nextReadPos) {
        return null;
      }

      if (state.pcmStart == null) {
        const headLen = Math.min(info.size, 65536);
        const headB64 = await FileSystem.readAsStringAsync(uri, {
          encoding: 'base64',
          length: headLen,
          position: 0,
        });
        const head = base64ToUint8Array(headB64);
        const pcm = findWavPcmDataByteOffset(head);
        if (pcm == null) {
          return null;
        }
        state.pcmStart = pcm;
        state.nextReadPos = Math.max(state.nextReadPos, pcm);
      }

      const from = state.nextReadPos;
      const to = info.size;
      if (from >= to) return null;

      const segmentB64 = await FileSystem.readAsStringAsync(uri, {
        encoding: 'base64',
        position: from,
        length: to - from,
      });
      const bytes = base64ToUint8Array(segmentB64);
      state.nextReadPos = to;
      return bytes;
    },
  };
}
