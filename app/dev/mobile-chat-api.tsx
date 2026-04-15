import { router } from 'expo-router';
import React from 'react';
import { ScrollView, View } from 'react-native';

import ThemedText from '@/components/ThemedText';
import DevHeader from '@/src/dev/components/DevHeader';

/**
 * 与仓库内 src/dev/data/MOBILE_CHAT_API.md 对齐的速览（完整文档请在 IDE 中打开该文件）。
 */
export default function MobileChatApiDocScreen() {
  return (
    <View className="flex-1 bg-neutral-950">
      <DevHeader title="MOBILE_CHAT_API" onBack={() => router.replace('/dev')} />
      <ScrollView className="flex-1 px-4 pt-3" contentContainerClassName="pb-16">
        <ThemedText className="mb-3 text-xs leading-5 text-neutral-400">
          完整接口说明（AIYOU 移动端聊天）已同步至项目文件：{'\n'}
          <ThemedText className="font-mono text-[11px] text-sky-400">
            src/dev/data/MOBILE_CHAT_API.md
          </ThemedText>
          {'\n'}（约 2800+ 行，含私人/决策模式、记忆、Runs、Auth 等）
        </ThemedText>

        <ThemedText className="mb-2 text-sm font-semibold text-neutral-200">网关</ThemedText>
        <ThemedText className="mb-4 text-xs leading-5 text-neutral-500">
          默认线上网关：http://47.242.248.240:2026，API 前缀 /api。Web 端「环境配置」可改 Base URL；移动端在 .env 使用
          EXPO_PUBLIC_DEV_API_BASE_URL。
        </ThemedText>

        <ThemedText className="mb-2 text-sm font-semibold text-neutral-200">认证 Headers</ThemedText>
        <ThemedText className="mb-4 text-xs leading-5 text-neutral-500">
          Authorization: Bearer &lt;token&gt;{'\n'}
          X-User-ID / X-Tenant-ID / X-Workspace-ID{'\n'}
          Content-Type: application/json（JSON请求）
        </ThemedText>

        <ThemedText className="mb-2 text-sm font-semibold text-neutral-200">私人模式主路径</ThemedText>
        <ThemedText className="mb-4 text-xs leading-5 text-neutral-500">
          ① POST /api/auth/user-login{'\n'}
          ② POST /api/threads（metadata.user_id + title）{'\n'}
          ③ POST /api/threads/{'{id}'}/runs/stream（SSE，context 必含 tenancy + thread_id + model_name）{'\n'}
          ④ POST /api/sessions（fire-and-forget）{'\n'}
          ⑤ POST /api/threads/{'{id}'}/state（values.title，标题持久化）{'\n'}
          ⑥ POST /api/threads/search（历史列表）{'\n'}
          ⑦ GET /api/threads/{'{id}'}/state（历史消息）{'\n'}
          ⑧必要时 POST /api/threads/{'{id}'}/history（检查点）
        </ThemedText>

        <ThemedText className="mb-2 text-sm font-semibold text-neutral-200">SSE 事件（主实现）</ThemedText>
        <ThemedText className="mb-4 text-xs leading-5 text-neutral-500">
          metadata → 可忽略{'\n'}
          updates → 嵌套 title（如 lead_agent.title），触发标题回调{'\n'}
          values → 取 messages 最后一条 assistant/ai，并读顶层 title{'\n'}
          end → 结束{'\n'}
          备用：event data + type:message_chunk 增量拼接
        </ThemedText>

        <ThemedText className="mb-2 text-sm font-semibold text-neutral-200">App 对接代码</ThemedText>
        <ThemedText className="mb-4 text-xs leading-5 text-neutral-500">
          lib/privateChatApi.ts（流式、线程、历史）{'\n'}
          lib/userLoginApi.ts（登录）{'\n'}
          lib/authSession.ts（Headers）{'\n'}
          multitask_strategy 默认 reject；若网关支持 enqueue 可设环境变量
          EXPO_PUBLIC_PRIVATE_CHAT_MULTITASK_STRATEGY=enqueue
        </ThemedText>
      </ScrollView>
    </View>
  );
}
