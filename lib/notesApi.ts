import { apiDirectRaw, getDevUserId } from '@/lib/devApiConfig';

export type NotesKind = 'inspiration' | 'schedule';
export type SchedulePriority = '核心' | '重要' | '次要';

export type InspirationNote = {
  id: string;
  user_id: string;
  title: string;
  raw_content: string;
  ai_content: string | null;
  ai_insights: string | null;
  tags: string[];
  audio_url: string | null;
  created_at: string;
};

export type ScheduleTask = {
  content: string;
  is_completed: boolean;
};

export type Schedule = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  priority: SchedulePriority;
  tags: string[];
  tasks: ScheduleTask[];
  created_at: string;
  updated_at: string;
};

export type AnalyzeInspirationResult = {
  type: 'inspiration';
  title: string;
  ai_content: string | null;
  ai_insights: string | null;
  tags: string[];
  missing_fields: string[];
  ai_message: string;
};

export type AnalyzeScheduleResult = {
  type: 'schedule';
  title: string;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  priority: SchedulePriority;
  tags: string[];
  tasks: ScheduleTask[];
  missing_fields: string[];
  ai_message: string;
};

export type AnalyzeResult = AnalyzeInspirationResult | AnalyzeScheduleResult;

export type CreateInspirationPayload = {
  user_id?: string;
  title: string;
  raw_content?: string;
  ai_content?: string | null;
  ai_insights?: string | null;
  tags?: string[];
  audio_url?: string | null;
};

export type CreateSchedulePayload = {
  user_id?: string;
  title: string;
  description?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  priority?: SchedulePriority;
  tags?: string[];
  tasks?: ScheduleTask[];
};

type JsonObject = Record<string, unknown>;

export class NotesApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'NotesApiError';
    this.status = status;
  }
}

function parseJson(text: string): JsonObject | null {
  if (!text.trim()) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as JsonObject;
    }
    return null;
  } catch {
    return null;
  }
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function asNullableString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

function asSchedulePriority(v: unknown, fallback: SchedulePriority = '重要'): SchedulePriority {
  if (v === '核心' || v === '重要' || v === '次要') return v;
  return fallback;
}

function asTasks(v: unknown): ScheduleTask[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const row = item as JsonObject;
      const content = asString(row.content).trim();
      if (!content) return null;
      return {
        content,
        is_completed: Boolean(row.is_completed),
      };
    })
    .filter((row): row is ScheduleTask => row !== null);
}

function getErrorMessage(status: number, text: string, json: JsonObject | null): string {
  const detail = json?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail.trim();
  const message = json?.message;
  if (typeof message === 'string' && message.trim()) return message.trim();
  const msg = text.trim();
  if (msg) return msg.slice(0, 200);
  if (status === 400) return '请求参数有误，请检查输入内容';
  if (status === 404) return '目标记录不存在或已被删除';
  if (status >= 500) return '服务暂时不可用，请稍后重试';
  return `请求失败（HTTP ${status}）`;
}

async function requestJson(
  path: string,
  method: string,
  body?: unknown
): Promise<JsonObject | null> {
  const { status, text } = await apiDirectRaw({ path, method, body });
  const json = parseJson(text);
  if (status < 200 || status >= 300) {
    throw new NotesApiError(getErrorMessage(status, text, json), status);
  }
  return json;
}

async function resolveUserId(userId?: string): Promise<string> {
  if (userId?.trim()) return userId.trim();
  const cached = await getDevUserId();
  return cached.trim() || 'default';
}

export async function analyzeNoteInput(input: {
  text: string;
  audio_url?: string | null;
}): Promise<AnalyzeResult> {
  const text = input.text.trim();
  if (!text) {
    throw new NotesApiError('请输入要分析的内容', 400);
  }

  const fallback: AnalyzeInspirationResult = {
    type: 'inspiration',
    title: text.slice(0, 24) || '灵感记录',
    ai_content: text,
    ai_insights: null,
    tags: [],
    missing_fields: [],
    ai_message: '分析服务暂不可用，已按灵感笔记处理',
  };

  try {
    const json =
      (await requestJson('/api/notes/analyze', 'POST', {
        text,
        audio_url: input.audio_url ?? null,
      })) ?? {};

    const type = json.type === 'schedule' ? 'schedule' : 'inspiration';
    if (type === 'schedule') {
      return {
        type: 'schedule',
        title: asString(json.title, '日程安排'),
        description: asNullableString(json.description),
        start_time: asNullableString(json.start_time),
        end_time: asNullableString(json.end_time),
        priority: asSchedulePriority(json.priority),
        tags: asStringArray(json.tags),
        tasks: asTasks(json.tasks),
        missing_fields: asStringArray(json.missing_fields),
        ai_message: asString(json.ai_message),
      };
    }
    return {
      type: 'inspiration',
      title: asString(json.title, '灵感记录'),
      ai_content: asNullableString(json.ai_content),
      ai_insights: asNullableString(json.ai_insights),
      tags: asStringArray(json.tags),
      missing_fields: asStringArray(json.missing_fields),
      ai_message: asString(json.ai_message),
    };
  } catch {
    return fallback;
  }
}

export async function createInspirationNote(
  payload: CreateInspirationPayload
): Promise<{ id: string; created_at: string }> {
  const json =
    (await requestJson('/api/notes/inspiration', 'POST', {
      user_id: await resolveUserId(payload.user_id),
      title: payload.title.trim(),
      raw_content: payload.raw_content ?? '',
      ai_content: payload.ai_content ?? null,
      ai_insights: payload.ai_insights ?? null,
      tags: payload.tags ?? [],
      audio_url: payload.audio_url ?? null,
    })) ?? {};
  return {
    id: asString(json.id),
    created_at: asString(json.created_at),
  };
}

export async function listInspirationNotes(params?: {
  user_id?: string;
  limit?: number;
}): Promise<InspirationNote[]> {
  const userId = await resolveUserId(params?.user_id);
  const limit = Math.max(1, Math.min(100, params?.limit ?? 50));
  const json = await requestJson(
    `/api/notes/inspiration?user_id=${encodeURIComponent(userId)}&limit=${limit}`,
    'GET'
  );
  const rows = Array.isArray(json?.notes) ? json.notes : [];
  return rows
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const row = item as JsonObject;
      return {
        id: asString(row.id),
        user_id: asString(row.user_id, userId),
        title: asString(row.title, '未命名灵感'),
        raw_content: asString(row.raw_content),
        ai_content: asNullableString(row.ai_content),
        ai_insights: asNullableString(row.ai_insights),
        tags: asStringArray(row.tags),
        audio_url: asNullableString(row.audio_url),
        created_at: asString(row.created_at),
      };
    })
    .filter((row): row is InspirationNote => row !== null && row.id.length > 0);
}

export async function deleteInspirationNote(noteId: string): Promise<void> {
  await requestJson(`/api/notes/inspiration/${encodeURIComponent(noteId)}`, 'DELETE');
}

export async function createSchedule(
  payload: CreateSchedulePayload
): Promise<{ id: string; created_at: string }> {
  const json =
    (await requestJson('/api/notes/schedules', 'POST', {
      user_id: await resolveUserId(payload.user_id),
      title: payload.title.trim(),
      description: payload.description ?? null,
      start_time: payload.start_time ?? null,
      end_time: payload.end_time ?? null,
      priority: payload.priority ?? '重要',
      tags: payload.tags ?? [],
      tasks: payload.tasks ?? [],
    })) ?? {};
  return {
    id: asString(json.id),
    created_at: asString(json.created_at),
  };
}

export async function listSchedules(params?: {
  user_id?: string;
  limit?: number;
}): Promise<Schedule[]> {
  const userId = await resolveUserId(params?.user_id);
  const limit = Math.max(1, Math.min(100, params?.limit ?? 50));
  const json = await requestJson(
    `/api/notes/schedules?user_id=${encodeURIComponent(userId)}&limit=${limit}`,
    'GET'
  );
  const rows = Array.isArray(json?.schedules) ? json.schedules : [];
  return rows
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const row = item as JsonObject;
      return {
        id: asString(row.id),
        user_id: asString(row.user_id, userId),
        title: asString(row.title, '未命名日程'),
        description: asNullableString(row.description),
        start_time: asNullableString(row.start_time),
        end_time: asNullableString(row.end_time),
        priority: asSchedulePriority(row.priority),
        tags: asStringArray(row.tags),
        tasks: asTasks(row.tasks),
        created_at: asString(row.created_at),
        updated_at: asString(row.updated_at),
      };
    })
    .filter((row): row is Schedule => row !== null && row.id.length > 0);
}

export async function updateScheduleTask(
  scheduleId: string,
  taskIndex: number,
  isCompleted: boolean
): Promise<ScheduleTask[]> {
  const json =
    (await requestJson(
      `/api/notes/schedules/${encodeURIComponent(scheduleId)}/tasks/${taskIndex}`,
      'PATCH',
      { is_completed: isCompleted }
    )) ?? {};
  return asTasks(json.tasks);
}

export async function deleteSchedule(scheduleId: string): Promise<void> {
  await requestJson(`/api/notes/schedules/${encodeURIComponent(scheduleId)}`, 'DELETE');
}
