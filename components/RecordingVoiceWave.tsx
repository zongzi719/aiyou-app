import { useEffect, useMemo, useState } from 'react';
import { type LayoutChangeEvent, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

const WAVE_H = 28;
const SEGMENTS = 40;
const STROKE = '#F5C65A';

type Props = {
  /** 已归一化到 0–1 的音量 */
  level: number;
  /** 为 false 时保持平线（如暂停） */
  active: boolean;
};

/** expo-audio metering：约 -160（静音）～0（很大声），与 iOS/Android 实现一致 */
export function normalizeRecordingMetering(m?: number | null): number {
  if (m == null || !Number.isFinite(m)) return 0;
  if (m <= -55) return 0;
  return Math.max(0, Math.min(1, (m + 55) / 45));
}

export function RecordingVoiceWave({ level, active }: Props) {
  const [width, setWidth] = useState(280);
  const [phase, setPhase] = useState(0);

  const effLevel = active ? level : 0;

  useEffect(() => {
    if (effLevel < 0.04) return;
    const id = setInterval(() => setPhase((p) => p + 0.22), 48);
    return () => clearInterval(id);
  }, [effLevel]);

  const pathD = useMemo(() => {
    const mid = WAVE_H / 2;
    const amp = effLevel * (WAVE_H * 0.4);
    const step = width / SEGMENTS;
    let d = `M 0 ${mid}`;
    for (let i = 0; i <= SEGMENTS; i++) {
      const x = i * step;
      const t = (i / SEGMENTS) * Math.PI * 6 + phase;
      const y = mid + Math.sin(t) * amp;
      d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    return d;
  }, [width, effLevel, phase]);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) setWidth(w);
  };

  return (
    <View className="h-[28px] w-full" onLayout={onLayout}>
      <Svg width={width} height={WAVE_H}>
        <Path
          d={pathD}
          stroke={STROKE}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.9}
        />
      </Svg>
    </View>
  );
}
