import { router } from 'expo-router';
import React from 'react';
import { ActivityIndicator, ScrollView, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import useThemeColors from '@/app/contexts/ThemeColors';
import Icon from '@/components/Icon';
import ThemedScroller from '@/components/ThemeScroller';
import ThemedText from '@/components/ThemedText';
import { useAliyunNlsRealtimeDebug } from '@/hooks/useAliyunNlsRealtimeDebug';

export default function AliyunRealtimeAsrDebugScreen() {
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
        <ThemedText className="text-lg font-semibold text-primary">实时语音调试</ThemedText>
        <View className="w-16" />
      </View>

      <ThemedScroller className="flex-1 px-global pt-4" keyboardShouldPersistTaps="handled">
        <ThemedText className="mb-2 text-sm text-subtext">
          需本机运行 Token 服务（见 dev-servers/aliyun-nls-token），并配置 EXPO_PUBLIC_NLS_TOKEN_URL
          与 EXPO_PUBLIC_ALIYUN_NLS_APPKEY。iOS 使用 16k PCM 推流；Android 为静音连通性测试。
        </ThemedText>

        <View className="mt-4 flex-row gap-3">
          <TouchableOpacity
            accessibilityRole="button"
            disabled={isSessionActive}
            onPress={() => {
              startSession().catch(() => null);
            }}
            className="flex-1 items-center rounded-2xl bg-primary py-3.5">
            {isSessionActive ? (
              <ActivityIndicator color="#111" />
            ) : (
              <ThemedText className="text-base font-semibold text-[#111]">开始</ThemedText>
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

        <View className="mt-6 rounded-2xl bg-secondary p-4">
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
            <ThemedText className="text-sm text-red-300">{errorText}</ThemedText>
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
          <ScrollView className="mt-2 max-h-64">
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
        </View>
      </ThemedScroller>
    </View>
  );
}
