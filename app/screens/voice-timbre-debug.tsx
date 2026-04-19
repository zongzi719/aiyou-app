import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon from '@/components/Icon';
import ThemedText from '@/components/ThemedText';
import { useRecording } from '@/hooks/useRecording';
import {
  createAliyunVoiceFromUrl,
  queryAliyunVoice,
  synthesizeAliyunCosyVoiceToAudioUrl,
  updateAliyunVoiceFromUrl,
  waitForAliyunVoiceReady,
  type AliyunVoiceDetails,
} from '@/lib/aliyunVoiceApi';
import { registerAliyunClonedVoiceFromRecording } from '@/lib/registerAliyunClonedVoice';
import { fetchProfile } from '@/services/profileApi';

const ACCENT = '#D4A017';
const ACCENT_SOFT = '#F5DCA8';
const CARD_BG = 'rgba(8, 26, 51, 0.92)';
const MAX_VOICE_RECORD_SECONDS = 10;

const VOICE_SCRIPT = `“Hello，我来了。

只要我持续完善我的分身，它就会越来越像我。
这一段声音，就是另一个我的起点。

我的声音里，藏着我的思考方式、我的判断习惯、我的表达节奏。

录下来，它就能学会。

以后，它就能替我思考，替我推演，替我看见我看不见的东西。”`;

function formatTimer(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')} : ${String(s).padStart(2, '0')}`;
}

export default function VoiceTimbreDebugScreen() {
  const insets = useSafeAreaInsets();
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [accountVoiceId, setAccountVoiceId] = useState('');
  const [voiceMeta, setVoiceMeta] = useState<AliyunVoiceDetails | null>(null);
  const [manualTestVoiceId, setManualTestVoiceId] = useState('');
  const [ttsPreviewUrl, setTtsPreviewUrl] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const { isRecording, isPaused, startRecording, stopRecording, pauseRecording, resumeRecording } =
    useRecording();

  const playRemoteUrl = useCallback(async (uri: string) => {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      allowsRecordingIOS: false,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });
    try {
      await soundRef.current?.unloadAsync();
    } catch {
      /* ignore */
    }
    soundRef.current = null;
    const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true, volume: 1 });
    soundRef.current = sound;
  }, []);

  const loadAccountVoice = useCallback(async () => {
    try {
      const p = await fetchProfile();
      const vid = p.voice_id?.trim() ?? '';
      setAccountVoiceId(vid);
      if (vid) {
        try {
          setVoiceMeta(await queryAliyunVoice(vid));
        } catch {
          setVoiceMeta(null);
        }
      } else {
        setVoiceMeta(null);
      }
    } catch {
      setAccountVoiceId('');
      setVoiceMeta(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadAccountVoice();
      return () => {
        soundRef.current?.unloadAsync().catch(() => {});
        soundRef.current = null;
      };
    }, [loadAccountVoice])
  );

  useEffect(() => {
    if (!isRecording || isPaused) {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }
    tickRef.current = setInterval(() => {
      setRecordSeconds((s) => s + 1);
    }, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [isRecording, isPaused]);

  useEffect(() => {
    if (!isRecording || isPaused || recordSeconds < MAX_VOICE_RECORD_SECONDS) return;
    pauseRecording()
      .then(() => {
        Alert.alert(
          '提示',
          `当前录音最多 ${MAX_VOICE_RECORD_SECONDS} 秒，已自动暂停，请点击右侧确认。`
        );
      })
      .catch(() => {
        Alert.alert('提示', '录音时长已达上限，请点击右侧确认。');
      });
  }, [isRecording, isPaused, pauseRecording, recordSeconds]);

  const requestTtsPreview = useCallback(async () => {
    const vid = accountVoiceId.trim();
    if (!vid) {
      Alert.alert('提示', '当前账号资料中暂无 voice_id。');
      return;
    }
    if (previewBusy) return;
    setPreviewBusy(true);
    try {
      const { audioUrl: url } = await synthesizeAliyunCosyVoiceToAudioUrl({ voiceId: vid });
      setTtsPreviewUrl(url);
      await playRemoteUrl(url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '合成试听失败。';
      Alert.alert('提示', msg);
    } finally {
      setPreviewBusy(false);
    }
  }, [accountVoiceId, playRemoteUrl, previewBusy]);

  const toggleRecord = async () => {
    try {
      if (!isRecording) {
        setRecordSeconds(0);
        setRecordedUri(null);
        setStatusText('');
        await startRecording();
        return;
      }
      if (isPaused) {
        if (recordSeconds >= MAX_VOICE_RECORD_SECONDS) {
          Alert.alert('提示', `当前录音最多 ${MAX_VOICE_RECORD_SECONDS} 秒，请点击右侧确认。`);
          return;
        }
        await resumeRecording();
        return;
      }
      await pauseRecording();
    } catch {
      Alert.alert('提示', '无法访问麦克风，请在系统设置中开启权限后重试。');
    }
  };

  const resetVoiceStep = async () => {
    setRecordSeconds(0);
    setRecordedUri(null);
    setStatusText('');
    if (isRecording) {
      await stopRecording().catch(() => null);
    }
  };

  /** 录音 → OSS → CosyVoice（有 voice_id 则 update_voice）→ 写入资料 */
  const confirmVoice = async () => {
    if (submitting) return;
    try {
      setSubmitting(true);
      setStatusText('正在保存录音…');
      const uri = isRecording ? await stopRecording() : recordedUri;
      if (!uri) {
        throw new Error('请先完成录音再继续。');
      }
      setRecordedUri(uri);

      setStatusText('正在读取用户资料…');
      const profile = await fetchProfile();
      const existingVoiceId = profile.voice_id?.trim() || undefined;

      const result = await registerAliyunClonedVoiceFromRecording({
        localUri: uri,
        userId: profile.user_id,
        existingVoiceId,
        onStatus: setStatusText,
      });
      setAccountVoiceId(result.voiceId);
      setTtsPreviewUrl(null);
      try {
        setVoiceMeta(await queryAliyunVoice(result.voiceId));
      } catch {
        setVoiceMeta(null);
      }
      setStatusText(`已完成：voice_id 已写入个人资料`);
      const title = existingVoiceId ? '音色已更新' : '音色已创建';
      Alert.alert(
        title,
        `voice_id（完整）：\n${result.voiceId}\n\n已保存到服务端个人资料。同一账号仅保留此音色 ID，再次录制将走更新接口。`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : '流程失败，请稍后重试。';
      setStatusText('');
      Alert.alert('提示', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const runManualUrlVoiceTask = async () => {
    if (submitting) return;
    const url = audioUrl.trim();
    if (!url) return;
    try {
      setSubmitting(true);
      setManualTestVoiceId('');
      const existing = accountVoiceId.trim();
      if (existing) {
        setStatusText('正在提交 update_voice（与账号已有音色一致）…');
        await updateAliyunVoiceFromUrl({ voiceId: existing, audioUrl: url });
        setStatusText(`已提交更新：${existing}，正在轮询状态…`);
        const ready = await waitForAliyunVoiceReady(existing, {
          timeoutMs: 5 * 60 * 1000,
          intervalMs: 8_000,
          onProgress: (status) => setStatusText(`音色处理中：${status}`),
        });
        setManualTestVoiceId(ready.voiceId);
        setStatusText(`音色更新完成：${ready.voiceId}（状态 ${ready.status}）`);
        try {
          setVoiceMeta(await queryAliyunVoice(ready.voiceId));
        } catch {
          /* ignore */
        }
      } else {
        setStatusText('正在提交 create_voice…');
        const created = await createAliyunVoiceFromUrl({
          audioUrl: url,
          prefix: `v${Date.now().toString(36)}`
            .toLowerCase()
            .replace(/[^a-z0-9]/g, 'x')
            .slice(0, 9),
        });
        setStatusText(`已创建音色：${created.voiceId}，正在轮询状态...`);
        const ready = await waitForAliyunVoiceReady(created.voiceId, {
          timeoutMs: 5 * 60 * 1000,
          intervalMs: 8_000,
          onProgress: (status) => setStatusText(`音色处理中：${status}`),
        });
        setManualTestVoiceId(ready.voiceId);
        setStatusText(`音色创建完成：${ready.voiceId}（状态 ${ready.status}）`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '阿里云音色任务失败，请稍后重试。';
      setStatusText('');
      Alert.alert('提示', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LinearGradient
      colors={['#0B1B28', '#000000', '#071018']}
      locations={[0, 0.52, 1]}
      start={{ x: 0.22, y: 1 }}
      end={{ x: 0.78, y: 0 }}
      style={styles.screenFill}>
      <View
        className="flex-1"
        style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }}>
        <View className="flex-row items-center justify-between px-4">
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={12}
            className="h-10 w-10 items-center justify-center rounded-full bg-white/10">
            <Icon name="ArrowLeft" size={22} color={ACCENT_SOFT} />
          </TouchableOpacity>
          <View className="w-10" />
        </View>

        <View className="mt-2 px-4">
          <ThemedText className="text-2xl font-bold">
            <ThemedText style={{ color: ACCENT }}>音色调试</ThemedText>
            <ThemedText className="text-white"> · 步骤1</ThemedText>
          </ThemedText>
          <ThemedText className="text-white/55 mt-2 text-xs">
            录音将上传至 OSS 路径 regesiter_voice/你的 user_id/，再调用 CosyVoice。若资料中已有
            voice_id，将走 update_voice 更新同一音色（不新建）。成功后写入个人资料 voice_id。
          </ThemedText>
        </View>

        <ScrollView
          className="mt-2 flex-1 px-4"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View
            className="mt-3 rounded-2xl border border-[#B98C44]/30 p-4"
            style={{ backgroundColor: CARD_BG }}>
            <ThemedText className="text-sm font-semibold text-[#E9D6A4]">
              当前账号 voice_id（完整展示）
            </ThemedText>
            {accountVoiceId ? (
              <>
                <ThemedText className="text-white/45 mt-2 text-[11px]">CosyVoice 复刻音色 ID</ThemedText>
                <ThemedText selectable className="mt-1 font-mono text-xs leading-5 text-emerald-200">
                  {accountVoiceId}
                </ThemedText>
                {voiceMeta ? (
                  <View className="mt-3 gap-1">
                    <ThemedText className="text-xs text-white/70">
                      状态：{voiceMeta.status}
                      {voiceMeta.targetModel ? ` · 驱动模型 ${voiceMeta.targetModel}` : ''}
                    </ThemedText>
                    {voiceMeta.resourceLink ? (
                      <>
                        <ThemedText className="text-white/45 mt-1 text-[11px]">
                          复刻参考音频 URL（query_voice.resource_link，公网样本）
                        </ThemedText>
                        <ThemedText selectable className="font-mono text-[11px] leading-5 text-white/80">
                          {voiceMeta.resourceLink}
                        </ThemedText>
                        <TouchableOpacity
                          accessibilityRole="button"
                          onPress={() => {
                            playRemoteUrl(voiceMeta.resourceLink!).catch(() => {
                              Alert.alert('提示', '无法播放参考音频。');
                            });
                          }}
                          className="mt-2 flex-row items-center gap-2 self-start rounded-xl bg-white/10 px-3 py-2">
                          <Icon name="Volume2" size={18} color={ACCENT_SOFT} />
                          <ThemedText className="text-sm text-white/90">播放参考样本</ThemedText>
                        </TouchableOpacity>
                      </>
                    ) : null}
                  </View>
                ) : (
                  <ThemedText className="text-white/45 mt-2 text-xs">
                    无法拉取阿里云详情（可稍后重试或检查 Key 权限）。
                  </ThemedText>
                )}
                <TouchableOpacity
                  accessibilityRole="button"
                  disabled={previewBusy}
                  onPress={() => {
                    requestTtsPreview().catch(() => {});
                  }}
                  className="mt-3 flex-row items-center gap-2 self-start rounded-xl bg-[#B98C44]/35 px-3 py-2">
                  {previewBusy ? (
                    <ActivityIndicator size="small" color={ACCENT_SOFT} />
                  ) : (
                    <Icon name="AudioLines" size={18} color={ACCENT_SOFT} />
                  )}
                  <ThemedText className="text-sm font-semibold text-[#F5E6C8]">
                    生成并播放合成试听
                  </ThemedText>
                </TouchableOpacity>
                <ThemedText className="text-white/40 mt-1 text-[10px] leading-4">
                  使用 CosyVoice 非流式 HTTP 合成接口，朗读示例句并返回短期有效 MP3 URL（约 24
                  小时），与文档「语音合成」步骤一致。
                </ThemedText>
                {ttsPreviewUrl ? (
                  <View className="mt-3">
                    <ThemedText className="text-white/45 text-[11px]">试听音频 URL</ThemedText>
                    <ThemedText selectable className="mt-1 font-mono text-[11px] leading-5 text-cyan-200/90">
                      {ttsPreviewUrl}
                    </ThemedText>
                    <TouchableOpacity
                      accessibilityRole="button"
                      onPress={() => {
                        playRemoteUrl(ttsPreviewUrl).catch(() => {
                          Alert.alert('提示', '无法播放试听。');
                        });
                      }}
                      className="mt-2 flex-row items-center gap-2 self-start rounded-xl bg-white/10 px-3 py-2">
                      <Icon name="Play" size={18} color={ACCENT_SOFT} />
                      <ThemedText className="text-sm text-white/90">再次播放试听</ThemedText>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </>
            ) : (
              <ThemedText className="text-white/55 mt-2 text-sm">
                暂无。完成首次录音并确认后，将写入服务端 voice_id。
              </ThemedText>
            )}
          </View>

          <ThemedText className="mt-6 text-lg font-semibold leading-8 text-white">
            你每一次说话{'\n'}都在让另一个你变得更聪明。
          </ThemedText>
          <ThemedText className="mt-4 text-sm text-white/60">请用自然语气朗读以下内容：</ThemedText>
          <ThemedText className="text-white/35 mt-1 text-xs">找一个安静的环境</ThemedText>

          <View
            className="mt-5 rounded-2xl border border-white/10 p-4"
            style={{ backgroundColor: CARD_BG }}>
            <ThemedText className="text-sm leading-7 text-white/90">{VOICE_SCRIPT}</ThemedText>
          </View>

          <View className="mt-10 items-center">
            <ThemedText className="mb-3 text-sm text-white/80">
              {formatTimer(recordSeconds)}
            </ThemedText>
            <View className="flex-row items-center justify-center gap-8">
              <TouchableOpacity
                onPress={() => void resetVoiceStep()}
                className="h-12 w-12 items-center justify-center rounded-full bg-white/10">
                <Icon name="RotateCcw" size={22} color={ACCENT_SOFT} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void toggleRecord()}
                activeOpacity={0.9}
                className="h-20 w-20 items-center justify-center rounded-full border-2 border-[#B98C44]/80"
                style={{
                  shadowColor: ACCENT,
                  shadowOpacity: 0.45,
                  shadowRadius: 16,
                  shadowOffset: { width: 0, height: 0 },
                }}>
                <LinearGradient colors={['#3a2a18', '#1a120a']} style={styles.micInnerGradient} />
                <Icon
                  name={isPaused ? 'Mic' : isRecording ? 'Pause' : 'Mic'}
                  size={32}
                  color={ACCENT_SOFT}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void confirmVoice()}
                disabled={recordSeconds === 0 || submitting}
                className="h-12 w-12 items-center justify-center rounded-full bg-white/10">
                {submitting ? (
                  <ActivityIndicator size="small" color={ACCENT_SOFT} />
                ) : (
                  <Icon
                    name="Check"
                    size={24}
                    color={recordSeconds > 0 && !submitting ? ACCENT : '#555'}
                  />
                )}
              </TouchableOpacity>
            </View>
            <ThemedText className="mt-6 text-center text-xs text-white/40">
              完成朗读后点右侧确认：需已登录（拉取 user_id），最多 {MAX_VOICE_RECORD_SECONDS}{' '}
              秒；若已有音色将自动 update_voice。
            </ThemedText>
            {statusText ? (
              <ThemedText className="text-white/55 mt-2 text-center text-xs">{statusText}</ThemedText>
            ) : null}
            {recordedUri ? (
              <ThemedText className="text-white/45 mt-2 text-center text-[11px]">
                最近录音：{recordedUri}
              </ThemedText>
            ) : null}
          </View>

          <View className="mt-6 rounded-2xl border border-[#B98C44]/25 bg-[#111A24]/80 px-4 py-4">
            <ThemedText className="text-sm font-semibold text-[#E9D6A4]">手动公网 URL（可选）</ThemedText>
            <ThemedText className="text-white/55 mt-1 text-xs leading-5">
              {accountVoiceId
                ? '当前账号已有 voice_id：将调用 update_voice 更新该音色（不写资料）。'
                : '无 voice_id 时调用 create_voice 新建（不写资料，调试专用）。'}
            </ThemedText>
            <View className="border-white/15 mt-3 rounded-xl border bg-black/20 px-3 py-2">
              <TextInput
                value={audioUrl}
                onChangeText={setAudioUrl}
                className="min-h-[42px] text-sm text-white"
                placeholder="https://… 公网 wav/mp3/m4a"
                placeholderTextColor="rgba(255,255,255,0.35)"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <TouchableOpacity
              onPress={() => void runManualUrlVoiceTask()}
              disabled={!audioUrl.trim() || submitting}
              className="bg-white/15 mt-3 items-center justify-center rounded-xl py-3">
              {submitting ? (
                <ActivityIndicator size="small" color={ACCENT_SOFT} />
              ) : (
                <ThemedText className="text-sm font-semibold text-white/90">
                  {accountVoiceId ? 'update_voice（不写资料）' : 'create_voice（不写资料）'}
                </ThemedText>
              )}
            </TouchableOpacity>
            {manualTestVoiceId ? (
              <View className="mt-3 rounded-xl border border-emerald-300/25 bg-emerald-500/10 px-3 py-2">
                <ThemedText className="text-xs text-emerald-200">
                  本次任务 voice_id（完整）：
                </ThemedText>
                <ThemedText selectable className="mt-1 font-mono text-[11px] leading-5 text-emerald-100">
                  {manualTestVoiceId}
                </ThemedText>
              </View>
            ) : null}
          </View>
          <View className="h-8" />
        </ScrollView>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screenFill: {
    flex: 1,
  },
  micInnerGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 9999,
  },
});
