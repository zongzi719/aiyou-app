import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

import type { SelectedFile } from '@/components/ChatInput';
import { getAuthSession, getPrivateChatAuthHeaders } from '@/lib/authSession';
import { getApiBaseUrl } from '@/lib/devApiConfig';
import { uploadFilesToThreadFromSelection, type UploadedFileInfo } from '@/lib/privateChatApi';
import {
  parseDecisionReplySections,
  type DecisionReplySections,
} from '@/utils/decisionReplyParser';

export type DecisionCoachProfile = {
  id: string;
  name: string;
  roleLabel: string;
  tagline: string;
  systemPrompt: string;
};

export const DECISION_COACHES: DecisionCoachProfile[] = [
  {
    id: 'strategy',
    name: 'Sarah Chen',
    roleLabel: '默认教练',
    tagline: '拥有 GPT、DEEPSEEK 大模型推理能力\n最强大脑',
    systemPrompt:
      '你是一位战略教练。请从商业战略、市场空间、竞争格局、差异化与资源匹配的角度，给出结构化输出：先给“决策建议”，再给“关键问题”，最后给“风险提示”。要求简洁、可执行、中文输出。',
  },
  {
    id: 'risk',
    name: 'Marcus Johnson',
    roleLabel: '风险',
    tagline: '拥有顶级风险评估模型，帮助您排雷\n一切潜在风险',
    systemPrompt:
      '你是一位风险教练。请优先识别不确定性、合规/法律风险、财务与执行风险，给出结构化输出：先“决策建议”，再“关键问题”，最后“风险提示”。要求中文输出、列点清晰。',
  },
  {
    id: 'product',
    name: 'Yuki Tanaka',
    roleLabel: '产品',
    tagline: '产品分析一流，懂用户行为、懂市场',
    systemPrompt:
      '你是一位产品教练。请从用户价值、需求验证、产品定位、体验与增长的角度分析，按“决策建议 / 关键问题 / 风险提示”三段式输出，中文、可落地。',
  },
  {
    id: 'growth',
    name: 'Elena Rodriguez',
    roleLabel: '增长',
    tagline: '帮您提供快速增长的建议',
    systemPrompt:
      '你是一位增长教练。请从获客、转化、留存、定价、渠道与增长模型角度分析，按“决策建议 / 关键问题 / 风险提示”三段式输出，中文、可执行。',
  },
  {
    id: 'data',
    name: 'David Park',
    roleLabel: '数据',
    tagline: '1000w+ 用户数据',
    systemPrompt:
      '你是一位数据教练。请从指标体系、假设验证、数据口径、实验设计与量化评估角度分析，按“决策建议 / 关键问题 / 风险提示”三段式输出，中文、尽量给出可测量指标。',
  },
  {
    id: 'ops',
    name: 'David Kim',
    roleLabel: '运营',
    tagline: '帮您把策略落到可执行的路径',
    systemPrompt:
      '你是一位运营教练。请从资源安排、执行节奏、协作机制、关键里程碑与落地风险角度分析，按“决策建议 / 关键问题 / 风险提示”三段式输出，中文，突出可执行步骤。',
  },
];

const STORAGE_KEY = 'luna_decision_coach_thread_map_v1';

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  return undefined;
}

async function loadThreadMap(): Promise<Record<string, string>> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    const json = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(json)) {
      if (typeof v === 'string' && v.trim()) out[k] = v.trim();
    }
    return out;
  } catch {
    return {};
  }
}

async function saveThreadMap(map: Record<string, string>): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

async function postJson(
  path: string,
  body: unknown
): Promise<{ status: number; json: unknown; text: string }> {
  const base = await getApiBaseUrl();
  const headers = await getPrivateChatAuthHeaders();
  const url = joinUrl(base, path);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { ...headers, Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') {
      throw new Error('请求超时，请稍后重试');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

function normalizeAiContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    const o = content as Record<string, unknown>;
    if (typeof o.text === 'string') return o.text;
    if (o.type === 'text' && typeof o.text === 'string') return o.text;
  }
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && 'type' in part) {
        const p = part as { type?: string; text?: string };
        if (p.type === 'text' && typeof p.text === 'string') return p.text;
      }
      return '';
    })
    .join('');
}

function formatDecisionHttpError(status: number, json: unknown, text: string): string {
  const detail =
    (asRecord(json)?.detail as string | undefined) ??
    (asRecord(json)?.message as string | undefined) ??
    '';
  const combined = `${detail}\n${text}`.trim();
  const lower = combined.toLowerCase();
  const isHtmlError = lower.includes('<html') || lower.includes('<!doctype html');
  const isGatewayTimeout =
    status === 504 ||
    lower.includes('504 gateway time-out') ||
    lower.includes('gateway timeout') ||
    lower.includes('upstream timed out');
  const isGatewayUnavailable = status === 502 || status === 503;

  if (isGatewayTimeout) {
    return '网关超时，服务暂时不可用，请稍后重试。';
  }
  if (isGatewayUnavailable) {
    return '网关异常，服务暂时不可用，请稍后重试。';
  }
  if (isHtmlError) {
    return `服务异常（HTTP ${status}），请稍后重试。`;
  }
  if (detail.trim()) return detail.trim().slice(0, 240);
  if (text.trim()) return text.trim().slice(0, 240);
  return `HTTP ${status}`;
}

function extractLastAiTextFromMessages(messages: unknown): string {
  if (!Array.isArray(messages)) return '';
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = asRecord(messages[i]);
    if (!m) continue;
    const kwargs = asRecord(m.kwargs);
    const src = kwargs ?? m;
    const type = typeof src.type === 'string' ? src.type : '';
    const role = typeof src.role === 'string' ? src.role : '';
    const isAi = type === 'ai' || type === 'assistant' || role === 'assistant' || role === 'ai';
    if (!isAi) continue;
    const contentSrc = (src as Record<string, unknown>).content;
    const text = normalizeAiContent(contentSrc).trim();
    if (text) return text;
  }
  return '';
}

async function imageUriToDataUrl(uri: string): Promise<string> {
  const compressed = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1024 } }], {
    compress: 0.65,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  const base64 = await FileSystem.readAsStringAsync(compressed.uri, { encoding: 'base64' });
  return `data:image/jpeg;base64,${base64}`;
}

async function createDecisionCoachThread(coachId: string): Promise<string> {
  const session = await getAuthSession();
  if (!session.userId) throw new Error('缺少 user_id');
  const { status, json, text } = await postJson('/api/threads', {
    metadata: {
      user_id: session.userId,
      is_decision_coach: 'true',
      coach_id: coachId,
    },
  });
  if (status < 200 || status >= 300) {
    const detail =
      (asRecord(json)?.detail as string | undefined) ??
      (asRecord(json)?.message as string | undefined) ??
      text.slice(0, 200) ??
      `HTTP ${status}`;
    throw new Error(`创建教练线程失败：${detail}`);
  }
  const tid = (asRecord(json)?.thread_id as string | undefined) ?? '';
  if (!tid) throw new Error('创建教练线程失败：响应无 thread_id');
  return tid;
}

export async function ensureDecisionCoachThreads(
  coachIds: string[]
): Promise<Record<string, string>> {
  const map = await loadThreadMap();
  const next = { ...map };
  for (const coachId of coachIds) {
    if (next[coachId]) continue;
    const tid = await createDecisionCoachThread(coachId);
    next[coachId] = tid;
  }
  if (JSON.stringify(next) !== JSON.stringify(map)) {
    await saveThreadMap(next);
  }
  return next;
}

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

type RunDecisionCoachResult =
  | { ok: true; rawText: string; sections: DecisionReplySections }
  | { ok: false; errorText: string };

async function runDecisionCoachWait(args: {
  coachId: string;
  threadId: string;
  userText: string;
  modelName: string;
  images?: string[];
  files?: SelectedFile[];
}): Promise<RunDecisionCoachResult> {
  const coach = DECISION_COACHES.find((c) => c.id === args.coachId);
  if (!coach) return { ok: false, errorText: '未知教练' };

  const session = await getAuthSession();
  if (!session.userId || !session.tenantId || !session.workspaceId) {
    return { ok: false, errorText: '会话不完整，请先登录后重试' };
  }

  const hasImages = !!args.images && args.images.length > 0;
  const hasFiles = !!args.files && args.files.length > 0;

  let uploadedFileInfos: UploadedFileInfo[] | undefined;
  if (hasFiles) {
    uploadedFileInfos = await uploadFilesToThreadFromSelection(args.threadId, args.files!);
  }

  let messageContent: string | ContentPart[] = args.userText.trim();
  if (hasImages) {
    const parts: ContentPart[] = [];
    const dataUrls = await Promise.all(args.images!.map((u) => imageUriToDataUrl(u)));
    for (const url of dataUrls) {
      parts.push({ type: 'image_url', image_url: { url } });
    }
    if (args.userText.trim()) parts.push({ type: 'text', text: args.userText.trim() });
    messageContent = parts;
  }

  const humanMessage: Record<string, unknown> = {
    type: 'human',
    content: messageContent,
  };

  if (uploadedFileInfos && uploadedFileInfos.length > 0) {
    humanMessage.additional_kwargs = {
      files: uploadedFileInfos.map((f) => ({
        filename: f.filename,
        path: f.virtualPath,
        status: 'uploaded' as const,
      })),
    };
  }

  const body = {
    assistant_id: 'lead_agent',
    input: { messages: [humanMessage] },
    config: { recursion_limit: 100 },
    context: {
      user_id: session.userId,
      tenant_id: session.tenantId,
      workspace_id: session.workspaceId,
      thread_id: args.threadId,
      model_name: args.modelName,
      thinking_enabled: false,
      is_plan_mode: false,
      subagent_enabled: false,
      custom_system_prompt: coach.systemPrompt,
      output_guidelines: '请按“决策建议 / 关键问题 / 风险提示”三段式输出，中文，简洁可执行。',
      disable_auto_file_output: true,
    },
  };

  const { status, json, text } = await postJson(
    `/api/threads/${encodeURIComponent(args.threadId)}/runs/wait`,
    body
  );

  if (status < 200 || status >= 300) {
    const detail = formatDecisionHttpError(status, json, text);
    return { ok: false, errorText: `请求失败：${detail}` };
  }

  const root = asRecord(json);
  const rawMessages = root?.messages;
  const rawText = extractLastAiTextFromMessages(rawMessages).trim();
  if (!rawText) {
    return { ok: false, errorText: '未收到回复，请稍后重试' };
  }
  const sections = parseDecisionReplySections(rawText);
  return { ok: true, rawText, sections };
}

export async function runDecisionTurn(args: {
  coachIds: string[];
  userText: string;
  modelName: string;
  images?: string[];
  files?: SelectedFile[];
}): Promise<Record<string, RunDecisionCoachResult>> {
  const map = await ensureDecisionCoachThreads(args.coachIds);
  const entries = await Promise.all(
    args.coachIds.map(async (coachId) => {
      const threadId = map[coachId];
      if (!threadId) return [coachId, { ok: false, errorText: '线程创建失败' }] as const;
      const res = await runDecisionCoachWait({
        coachId,
        threadId,
        userText: args.userText,
        modelName: args.modelName,
        images: args.images,
        files: args.files,
      });
      return [coachId, res] as const;
    })
  );

  const out: Record<string, RunDecisionCoachResult> = {};
  for (const [coachId, res] of entries) out[coachId] = res;
  return out;
}
