import { Audio } from '@/lib/expoAvCompat';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import useThemeColors from '@/app/contexts/ThemeColors';
import Icon from '@/components/Icon';
import ThemedScroller from '@/components/ThemeScroller';
import ThemedText from '@/components/ThemedText';
import { useAliyunNlsRealtimeDebug } from '@/hooks/useAliyunNlsRealtimeDebug';
import {
  BAILIAN_WORKFLOW_START_PARAMS,
  completeBailianWorkflowStream,
  completeBailianWorkflowSync,
  isBailianWorkflowIncrementalOutputEnabled,
  runTypewriter,
} from '@/lib/bailianAppCompletion';
import { preferHttpsMediaUrl } from '@/lib/preferHttpsMediaUrl';
import { fetchProfile } from '@/services/profileApi';

const WORKFLOW_ERROR_MAX_LEN = 12_000;
/** 界面默认展示长度（折叠后），避免一屏被 Base64 撑满 */
const WORKFLOW_ERROR_PREVIEW_CHARS = 2_800;

/**
 * 错误日志里常含 CosyVoice 返回的超长 Base64 音频，压缩后便于阅读。
 */
function collapseLongBase64Runs(text: string): string {
  return text.replace(/[A-Za-z0-9+/=]{600,}/g, (m) => `〈Base64 已省略，${m.length} 字符〉`);
}

function formatUnknownError(e: unknown): string {
  let raw: string;
  if (e == null) {
    raw = e === null ? '未知错误（null）' : '未知错误（undefined）';
  } else if (e instanceof Error) {
    const name = e.name && e.name !== 'Error' ? `[${e.name}] ` : '';
    const m = e.message?.trim();
    if (m) {
      raw = `${name}${m}`;
    } else {
      const s = e.stack?.trim();
      raw = s ? `${name}${s.slice(0, 2000)}` : `${name || ''}（Error 无 message/stack）`.trim();
    }
  } else if (typeof e === 'string') {
    raw = e.trim() || '（空字符串异常）';
  } else {
    try {
      const j = JSON.stringify(e);
      raw = j === undefined ? String(e) : j;
    } catch {
      try {
        raw = String(e);
      } catch {
        raw = '工作流调用失败（无法序列化异常对象）';
      }
    }
  }
  const cleaned = raw.replace(/\uFEFF/g, '').trim();
  if (!cleaned) {
    return '工作流调用失败（异常无可见说明，请查看 Metro 日志）';
  }
  if (cleaned.length <= WORKFLOW_ERROR_MAX_LEN) return cleaned;
  return `${cleaned.slice(0, WORKFLOW_ERROR_MAX_LEN)}\n\n…（已截断，共 ${cleaned.length} 字符）`;
}

export default function ExpertCallWorkflowDebugScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const {
    statusLine,
    partialText,
    finalLines,
    taskId,
    errorText,
    isRecording,
    isSessionActive,
    startSession,
    stopSession,
  } = useAliyunNlsRealtimeDebug();

  const [userText, setUserText] = useState('');
  const [voiceId, setVoiceId] = useState('');
  const [replyDisplay, setReplyDisplay] = useState('');
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [workflowErrorExpanded, setWorkflowErrorExpanded] = useState(false);
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [lastAudioUrl, setLastAudioUrl] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
    };
  }, []);

  const fillFromAsr = useCallback(() => {
    const fromFinal = finalLines.join('\n').trim();
    if (fromFinal) setUserText(fromFinal);
  }, [finalLines]);

  const fillVoiceFromProfile = useCallback(async () => {
    try {
      const p = await fetchProfile();
      const v = p.voice_id?.trim() ?? '';
      if (v) setVoiceId(v);
    } catch {
      setWorkflowError('无法拉取资料，请检查登录状态。');
    }
  }, []);

  const playRemoteAudio = useCallback(async (uri: string) => {
    const playbackUri = preferHttpsMediaUrl(uri);
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
    const { sound, status } = await Audio.Sound.createAsync(
      { uri: playbackUri },
      { shouldPlay: true, volume: 1 }
    );
    if (!status.isLoaded) {
      const err =
        'error' in status && typeof status.error === 'string'
          ? status.error
          : '音频未能加载（链接可能已过期或格式不支持）';
      await sound.unloadAsync().catch(() => {});
      throw new Error(err);
    }
    soundRef.current = sound;
  }, []);

  const runWorkflow = useCallback(async () => {
    const ut = userText.trim();
    if (!ut || workflowLoading) return;
    setWorkflowLoading(true);
    setWorkflowError(null);
    setWorkflowErrorExpanded(false);
    setReplyDisplay('');
    setLastAudioUrl(null);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      let replyText = '';
      let audioUrl: string | null = null;

      if (!isBailianWorkflowIncrementalOutputEnabled()) {
        const sync = await completeBailianWorkflowSync(ut, voiceId, { signal: ac.signal });
        replyText = sync.text.trim();
        audioUrl = sync.audioUrl;
        setReplyDisplay(replyText);
      } else {
        const streamResult = await completeBailianWorkflowStream(
          ut,
          voiceId,
          {
            onTextChunk: (full) => setReplyDisplay(full),
            onAudioUrl: (url) => setLastAudioUrl(url),
          },
          { signal: ac.signal }
        );

        replyText = streamResult.text.trim();
        audioUrl = streamResult.audioUrl;

        if (!replyText && !audioUrl) {
          const sync = await completeBailianWorkflowSync(ut, voiceId, { signal: ac.signal });
          replyText = sync.text.trim();
          audioUrl = sync.audioUrl;
          setReplyDisplay('');
          const twSpeed = sync.text.length > 120 ? 12 : 6;
          await runTypewriter(sync.text, setReplyDisplay, {
            signal: ac.signal,
            msPerChar: twSpeed,
          });
        }
      }

      if (audioUrl) {
        setLastAudioUrl(audioUrl);
        try {
          await playRemoteAudio(audioUrl);
        } catch (playErr) {
          console.warn('[expert-call-workflow-debug] auto-play failed', playErr);
        }
      }
    } catch (e) {
      console.error('[expert-call-workflow-debug]', e);
      setWorkflowError(formatUnknownError(e));
    } finally {
      setWorkflowLoading(false);
    }
  }, [userText, voiceId, workflowLoading, playRemoteAudio]);

  const canRun = userText.trim().length > 0 && !workflowLoading;

  const workflowErrorForDisplay = useMemo(
    () => (workflowError ? collapseLongBase64Runs(workflowError) : ''),
    [workflowError]
  );

  const workflowErrorVisibleText = useMemo(() => {
    if (!workflowErrorForDisplay) return '';
    if (workflowErrorExpanded || workflowErrorForDisplay.length <= WORKFLOW_ERROR_PREVIEW_CHARS) {
      return workflowErrorForDisplay;
    }
    return `${workflowErrorForDisplay.slice(0, WORKFLOW_ERROR_PREVIEW_CHARS)}\n\n…（共 ${workflowErrorForDisplay.length} 字符，点击下方展开）`;
  }, [workflowErrorForDisplay, workflowErrorExpanded]);

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View className="flex-row items-center justify-between border-b border-border px-global py-3">
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => router.back()}
          className="flex-row items-center gap-1 py-2 pr-3">
          <Icon name="ChevronLeft" size={22} color={colors.text} />
          <ThemedText className="text-base text-primary">返回</ThemedText>
        </TouchableOpacity>
        <ThemedText className="text-lg font-semibold text-primary">专家通话调试</ThemedText>
        <View className="w-16" />
      </View>

      <ThemedScroller className="flex-1 px-global pt-4" keyboardShouldPersistTaps="handled">
        <ThemedText className="mb-2 text-sm text-subtext">
          先使用实时识别得到文字，可手改后点击「调用工作流」。入参：
          {BAILIAN_WORKFLOW_START_PARAMS.userText}、{BAILIAN_WORKFLOW_START_PARAMS.voiceId}
          （biz_params）。需配置 EXPO_PUBLIC_BAILIAN_APP_ID 与 API Key。
        </ThemedText>

        <View className="mt-2 flex-row gap-3">
          <TouchableOpacity
            accessibilityRole="button"
            disabled={isSessionActive}
            onPress={() => {
              startSession().catch(() => null);
            }}
            className="bg-highlight flex-1 items-center rounded-2xl py-3.5">
            {isSessionActive ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <ThemedText className="text-base font-semibold text-primary">开始识别</ThemedText>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => {
              stopSession().catch(() => null);
            }}
            className="flex-1 items-center rounded-2xl border border-border py-3.5">
            <ThemedText className="text-base font-semibold text-primary">停止</ThemedText>
          </TouchableOpacity>
        </View>

        <View className="mt-4 rounded-2xl bg-secondary p-4">
          <ThemedText className="text-sm text-subtext">状态</ThemedText>
          <ThemedText className="mt-1 text-base text-primary">{statusLine}</ThemedText>
          {isRecording ? (
            <ThemedText className="mt-2 text-sm text-subtext">录音中（iOS）</ThemedText>
          ) : null}
        </View>

        {taskId ? (
          <View className="mt-4 rounded-2xl bg-secondary p-4">
            <ThemedText className="text-sm text-subtext">task_id</ThemedText>
            <ThemedText className="mt-1 font-mono text-xs text-primary" selectable>
              {taskId}
            </ThemedText>
          </View>
        ) : null}

        {errorText ? (
          <View className="mt-4 rounded-2xl border border-red-500/40 bg-red-500/10 p-4">
            <ThemedText className="text-sm font-semibold" style={{ color: '#fca5a5' }}>
              实时识别错误
            </ThemedText>
            <ThemedText className="mt-1 text-sm leading-5" style={{ color: '#fee2e2' }} selectable>
              {errorText}
            </ThemedText>
          </View>
        ) : null}

        <View className="mt-4 rounded-2xl bg-secondary p-4">
          <ThemedText className="text-sm text-subtext">中间结果</ThemedText>
          <ThemedText className="mt-2 text-base leading-6 text-primary">
            {partialText || '—'}
          </ThemedText>
        </View>

        <View className="mt-4 rounded-2xl bg-secondary p-4">
          <ThemedText className="text-sm text-subtext">句末结果</ThemedText>
          <ScrollView className="mt-2 max-h-40">
            {finalLines.length === 0 ? (
              <ThemedText className="text-base text-subtext">—</ThemedText>
            ) : (
              finalLines.map((line, i) => (
                <ThemedText
                  key={`${i}-${line.slice(0, 8)}`}
                  className="mb-2 text-base text-primary">
                  {line}
                </ThemedText>
              ))
            )}
          </ScrollView>
          <TouchableOpacity
            accessibilityRole="button"
            className="mt-3 items-center rounded-xl border border-border py-2.5"
            onPress={fillFromAsr}>
            <ThemedText className="text-sm font-semibold text-primary">
              填入识别结果到下方
            </ThemedText>
          </TouchableOpacity>
        </View>

        <View className="mt-6">
          <ThemedText className="mb-2 text-sm font-semibold text-primary">user_text</ThemedText>
          <TextInput
            className="min-h-[100px] rounded-2xl border border-border bg-secondary px-4 py-3 text-base text-primary"
            placeholder="识别结果或手动输入"
            placeholderTextColor={colors.placeholder}
            multiline
            value={userText}
            onChangeText={setUserText}
            textAlignVertical="top"
          />
        </View>

        <View className="mt-4">
          <View className="mb-2 flex-row items-center justify-between">
            <ThemedText className="text-sm font-semibold text-primary">voice_id</ThemedText>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => {
                fillVoiceFromProfile().catch(() => {});
              }}>
              <ThemedText className="text-sm text-[#5AF0B6]">从资料填充</ThemedText>
            </TouchableOpacity>
          </View>
          <TextInput
            className="min-h-[72px] rounded-2xl border border-border bg-secondary px-4 py-3 font-mono text-sm text-primary"
            placeholder="CosyVoice 复刻音色 ID"
            placeholderTextColor={colors.placeholder}
            value={voiceId}
            onChangeText={setVoiceId}
            autoCapitalize="none"
            multiline
            textAlignVertical="top"
          />
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          disabled={!canRun}
          onPress={() => {
            runWorkflow().catch(() => {});
          }}
          className={`mt-6 items-center rounded-2xl py-4 ${canRun ? 'bg-highlight' : 'bg-secondary opacity-50'}`}>
          {workflowLoading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <ThemedText className="text-base font-semibold text-primary">调用工作流</ThemedText>
          )}
        </TouchableOpacity>

        {workflowError ? (
          <View className="mt-4 rounded-2xl border border-red-600/50 bg-red-950/80 p-4">
            <ThemedText
              className="text-sm font-semibold leading-5"
              style={{ color: '#fecaca' }}
              selectable>
              工作流错误
            </ThemedText>
            <ThemedText
              className="mt-2 text-sm leading-6"
              style={{ color: '#fef2f2' }}
              selectable>
              {workflowErrorVisibleText}
            </ThemedText>
            {workflowErrorForDisplay.length > WORKFLOW_ERROR_PREVIEW_CHARS ? (
              <TouchableOpacity
                accessibilityRole="button"
                className="mt-3 self-start rounded-lg bg-white/15 px-3 py-2"
                onPress={() => setWorkflowErrorExpanded((v) => !v)}>
                <ThemedText className="text-sm font-semibold" style={{ color: '#fef2f2' }}>
                  {workflowErrorExpanded
                    ? '收起长日志'
                    : `展开完整日志（约 ${workflowErrorForDisplay.length} 字符）`}
                </ThemedText>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              accessibilityRole="button"
              className="mt-2 self-start rounded-lg bg-white/10 px-3 py-2"
              onPress={() => {
                void (async () => {
                  try {
                    await Clipboard.setStringAsync(workflowError);
                    Alert.alert('已复制', '完整错误原文已复制到剪贴板（含未压缩的 Base64 等）。');
                  } catch {
                    Alert.alert('提示', '复制失败，请重试。');
                  }
                })();
              }}>
              <ThemedText className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>
                复制完整错误（原文）
              </ThemedText>
            </TouchableOpacity>
          </View>
        ) : null}

        <View className="mt-6 rounded-2xl bg-secondary p-4">
          <ThemedText className="mb-2 text-sm font-semibold text-primary">回答</ThemedText>
          <ThemedText className="text-base leading-7 text-primary">
            {replyDisplay || '—'}
          </ThemedText>
        </View>

        {lastAudioUrl ? (
          <View className="mt-4 rounded-2xl border border-border bg-secondary p-4">
            <ThemedText className="text-sm text-subtext">TTS 音频</ThemedText>
            <TouchableOpacity
              accessibilityRole="button"
              className="bg-highlight mt-3 flex-row items-center gap-2 self-start rounded-xl px-4 py-3"
              onPress={() => {
                playRemoteAudio(lastAudioUrl).catch((err) => {
                  const msg = err instanceof Error ? err.message : '无法播放该 URL';
                  Alert.alert(
                    '播放失败',
                    `${msg}\n\n请确认：1）Mac/模拟器未静音且音量已开；2）链接未过期（OSS 签名有时效）；3）已自动将 http 改为 https 重试。`
                  );
                });
              }}>
              <Icon name="Play" size={20} color="#ffffff" />
              <ThemedText className="text-base font-semibold text-primary">试听 / 重新播放</ThemedText>
            </TouchableOpacity>
            <ThemedText className="mt-2 break-all font-mono text-xs text-primary" selectable>
              {lastAudioUrl}
            </ThemedText>
          </View>
        ) : null}
      </ThemedScroller>
    </View>
  );
}
