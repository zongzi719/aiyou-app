import { getApiBaseUrl, getDevUserId } from '@/lib/devApiConfig';
import { getAuthSession } from '@/lib/authSession';

const API_PREFIX = '/api/memory';

async function getHeaders(): Promise<Record<string, string>> {
  const [session, devUserId] = await Promise.all([getAuthSession(), getDevUserId()]);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session.token) {
    headers['Authorization'] = `Bearer ${session.token}`;
    headers['x-auth-token'] = session.token;
  }
  headers['x-user-id'] = session.userId ?? devUserId;
  if (session.tenantId) headers['x-tenant-id'] = session.tenantId;
  if (session.workspaceId) headers['x-workspace-id'] = session.workspaceId;
  return headers;
}

async function getBaseUrl(): Promise<string> {
  return (await getApiBaseUrl()).replace(/\/$/, '');
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const [base, headers] = await Promise.all([getBaseUrl(), getHeaders()]);
  const res = await fetch(`${base}${API_PREFIX}${path}`, {
    ...options,
    headers: { ...headers, ...(options?.headers ?? {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error((err as { detail?: string } | null)?.detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Types ───────────────────────────────────────────────────────────────────

/** 对应 GET /api/memory 返回的 facts 数组中的单条记忆 */
export interface UserMemory {
  id: string;
  category: string;
  content: string;
  confidence?: number;
  /** 全量记忆接口中每条块的更新时间（ISO 8601） */
  updatedAt?: string;
  /** 非 facts 汇总块不可调用删除接口 */
  deletable?: boolean;
  // 接口可能以不同字段名返回时间
  created_at?: string;
  updated_at?: string;
  timestamp?: string;
  created_time?: string;
  source?: string;
  source_thread_id?: string;
}

/** GET /api/memory 中 user / history 下的单块结构 */
interface MemorySummaryBlock {
  summary?: string;
  updatedAt?: string;
  updated_at?: string;
}

/** 从记忆对象中提取用于展示的时间（优先接口约定的 updatedAt） */
export function resolveMemoryTime(m: UserMemory): string | undefined {
  return (
    m.updatedAt ??
    m.created_at ??
    m.updated_at ??
    m.created_time ??
    m.timestamp
  );
}

export interface HistoryDocument {
  id: string;
  title: string;
  preview: string;
  mime_type: string;
  created_at: string;
  thread_id?: string;
}

export interface HistoryTodo {
  id: string;
  title: string;
  category: '会议' | '安排' | '决策' | '其他';
  status: 'active' | 'done';
  created_at: string;
}

interface MemoryResponse {
  version?: string;
  lastUpdated?: string;
  facts?: UserMemory[];
  user?: Record<string, MemorySummaryBlock | undefined>;
  history?: Record<string, MemorySummaryBlock | undefined>;
  // layered 结构兼容
  layers?: Record<string, { facts?: UserMemory[] }>;
}

function blockTime(block: MemorySummaryBlock): string | undefined {
  return block.updatedAt ?? block.updated_at;
}

/** 将全量记忆 JSON 中的 user/history 块展平为列表项 */
function memoriesFromSummarySections(
  section: Record<string, MemorySummaryBlock | undefined> | undefined,
  prefix: string,
): UserMemory[] {
  if (!section) return [];
  const out: UserMemory[] = [];
  for (const [key, block] of Object.entries(section)) {
    if (!block) continue;
    const summary = block.summary?.trim();
    const t = blockTime(block);
    if (!summary && !t) continue;
    out.push({
      id: `${prefix}:${key}`,
      category: key,
      content: summary ?? '（暂无摘要）',
      updatedAt: t,
      deletable: false,
    });
  }
  return out;
}

function normalizeMemoriesPayload(data: MemoryResponse): UserMemory[] {
  const fromFacts = (data.facts ?? []).map((f) => ({
    ...f,
    updatedAt: f.updatedAt ?? f.updated_at,
    deletable: f.deletable ?? true,
  }));
  const fromUser = memoriesFromSummarySections(data.user, 'user');
  const fromHistory = memoriesFromSummarySections(data.history, 'history');
  const structured = [...fromUser, ...fromHistory];

  if (fromFacts.length > 0 && structured.length > 0) {
    return [...fromFacts, ...structured];
  }
  if (fromFacts.length > 0) return fromFacts;
  return structured;
}

// ─── API ─────────────────────────────────────────────────────────────────────

export const memoryApi = {
  /**
   * GET /api/memory?layer=agent_private
   * 返回当前用户的记忆事实列表
   */
  getMemories: async () => {
    const data = await request<MemoryResponse>('?layer=agent_private');
    return normalizeMemoriesPayload(data);
  },

  /**
   * DELETE /api/memory/facts/{fact_id}
   */
  deleteMemory: (id: string) =>
    request<{ deleted: boolean }>(`/facts/${id}`, { method: 'DELETE' }),

  getDocuments: (q?: string) => {
    const qs = q ? `?q=${encodeURIComponent(q)}` : '';
    return request<{ documents: HistoryDocument[] }>(`/documents${qs}`).then((r) => r.documents);
  },

  getTodos: (category?: string) => {
    const qs = category && category !== '全部'
      ? `?category=${encodeURIComponent(category)}`
      : '';
    return request<{ todos: HistoryTodo[] }>(`/todos${qs}`).then((r) => r.todos);
  },

  toggleTodo: (id: string, status: 'active' | 'done') =>
    request<{ updated: boolean }>(`/todos/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

export const TODO_CATEGORIES = ['全部', '会议', '安排', '决策', '其他'];

/** 将 API 返回的英文 category 翻译为中文显示名 */
const CATEGORY_ZH_MAP: Record<string, string> = {
  workcontext: '工作上下文',
  personalcontext: '个人上下文',
  topofmind: '当前关注',
  recentmonths: '近月回顾',
  earliercontext: '早期脉络',
  longtermbackground: '长期背景',
  preference:  '偏好',
  context:     '背景',
  habit:       '习惯',
  goal:        '目标',
  style:       '风格',
  cognition:   '认知',
  belief:      '认知',
  fact:        '事实',
  behavior:    '行为',
  skill:       '技能',
  interest:    '兴趣',
  experience:  '经历',
  personality: '个性',
  value:       '价值观',
  knowledge:   '知识',
};

export function translateCategory(category: string): string {
  return CATEGORY_ZH_MAP[category.toLowerCase()] ?? category;
}

/** 从记忆列表中提取去重的分类列表（含"全部"） */
export function extractCategories(memories: UserMemory[]): string[] {
  const seen = new Set<string>();
  for (const m of memories) {
    if (m.category) seen.add(m.category);
  }
  return ['全部', ...Array.from(seen)];
}

export function getCategoryIcon(category: string): string {
  const map: Record<string, string> = {
    workcontext: 'Briefcase',
    personalcontext: 'User',
    topofmind: 'Zap',
    recentmonths: 'Calendar',
    earliercontext: 'Archive',
    longtermbackground: 'Clock',
    preference:  'Heart',
    context:     'Globe',
    habit:       'Repeat',
    goal:        'Target',
    style:       'Eye',
    cognition:   'Brain',
    belief:      'Brain',
    fact:        'BookOpen',
    behavior:    'Activity',
    skill:       'Zap',
    interest:    'Star',
    experience:  'Clock',
    personality: 'User',
    value:       'Shield',
    knowledge:   'Database',
  };
  return map[category.toLowerCase()] ?? 'Sparkles';
}

export function getCategoryColor(category: string): string {
  const map: Record<string, string> = {
    workcontext: '#0EA5E9',
    personalcontext: '#8B5CF6',
    topofmind: '#F97316',
    recentmonths: '#10B981',
    earliercontext: '#64748B',
    longtermbackground: '#6366F1',
    preference:  '#F59E0B',
    context:     '#0EA5E9',
    habit:       '#10B981',
    goal:        '#F97316',
    style:       '#8B5CF6',
    cognition:   '#7C3AED',
    belief:      '#7C3AED',
    fact:        '#64748B',
    behavior:    '#EC4899',
    skill:       '#EAB308',
    interest:    '#06B6D4',
    experience:  '#6366F1',
    personality: '#14B8A6',
    value:       '#E11D48',
    knowledge:   '#3B82F6',
  };
  return map[category.toLowerCase()] ?? '#6B7280';
}

export function getTodoCategoryIcon(category: string): string {
  const map: Record<string, string> = {
    会议: 'Users',
    安排: 'Calendar',
    决策: 'ClipboardList',
    其他: 'MoreHorizontal',
  };
  return map[category] ?? 'Circle';
}

export function getMimeLabel(mimeType: string): string {
  if (mimeType.includes('pdf')) return 'PDF';
  if (mimeType.includes('word') || mimeType.includes('docx') || mimeType.includes('doc')) return 'Word';
  if (mimeType.includes('excel') || mimeType.includes('xlsx') || mimeType.includes('xls')) return 'Excel';
  if (mimeType.includes('powerpoint') || mimeType.includes('pptx') || mimeType.includes('ppt')) return 'PPT';
  if (mimeType.includes('text')) return 'TXT';
  if (mimeType.includes('image')) return '图片';
  return '文档';
}

export function getMimeColor(mimeType: string): string {
  if (mimeType.includes('pdf')) return '#9B2226';
  if (mimeType.includes('word') || mimeType.includes('doc')) return '#37474F';
  if (mimeType.includes('excel') || mimeType.includes('xls')) return '#2E7D32';
  if (mimeType.includes('powerpoint') || mimeType.includes('ppt')) return '#E65100';
  return '#455A64';
}

export function formatMemoryDate(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

export function groupByDate(items: { created_at: string }[]): Record<string, typeof items> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups: Record<string, typeof items> = {};
  for (const item of items) {
    const d = new Date(item.created_at);
    d.setHours(0, 0, 0, 0);
    let label: string;
    if (d.getTime() === today.getTime()) {
      label = '今天';
    } else if (d.getTime() === yesterday.getTime()) {
      label = '昨天';
    } else {
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      label = `${d.getFullYear()}-${mm}-${dd}`;
    }
    if (!groups[label]) groups[label] = [];
    groups[label].push(item);
  }
  return groups;
}

/** 将 0~1 的置信度数值转为中文等级标签 */
export function confidenceLabel(value?: number): string {
  if (value == null) return '';
  if (value >= 0.9) return '极高';
  if (value >= 0.75) return '高';
  if (value >= 0.5) return '中';
  if (value >= 0.25) return '低';
  return '极低';
}

/** 将 ISO 时间转为相对时间描述（如"5 天前"） */
export function relativeTime(iso?: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} 个月前`;
  return `${Math.floor(months / 12)} 年前`;
}
