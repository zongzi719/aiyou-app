import { getAuthSession } from '@/lib/authSession';
import { getApiBaseUrl, getDevUserId } from '@/lib/devApiConfig';

const API_PREFIX = '/api/meetings';

async function getHeaders(): Promise<Record<string, string>> {
  const [session, devUserId] = await Promise.all([getAuthSession(), getDevUserId()]);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
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

function httpError(status: number, detail?: string): Error {
  const base = detail?.trim() || `HTTP ${status}`;
  return new Error(base);
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const [base, headers] = await Promise.all([getBaseUrl(), getHeaders()]);
  const res = await fetch(`${base}${API_PREFIX}${path}`, {
    ...options,
    headers: { ...headers, ...(options?.headers ?? {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw httpError(res.status, (err as { detail?: string } | null)?.detail);
  }
  return res.json().catch(() => {
    throw new Error('服务器返回了无效的响应');
  }) as Promise<T>;
}

export interface TranscriptWord {
  word: string;
  startMs: number;
  endMs: number;
}

export interface TranscriptSegment {
  speakerId: number;
  startMs: number;
  endMs: number;
  text: string;
  words?: TranscriptWord[];
}

export interface TranscriptGrouped {
  speakerId: number;
  segments: {
    startMs: number;
    endMs: number;
    text: string;
  }[];
}

export interface MeetingAISummary {
  keyPoints: string[];
  decisions: string[];
  openQuestions: string[];
  todoItems: string[];
  summaryText: string;
  markdownContent: string;
}

export interface MeetingRecord {
  id: string;
  user_id: string;
  title: string;
  date: string;
  duration: string;
  participants: number;
  folder: string;
  audioUrl: string;
  audioDuration: string;
  asrTaskId: string;
  asrStatus: 'pending' | 'processing' | 'done' | 'failed';
  transcript: TranscriptSegment[];
  transcriptGrouped: TranscriptGrouped[];
  aiSummary: MeetingAISummary | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MeetingFolder {
  id: string;
  name: string;
  count: number;
}

export interface MeetingListResponse {
  meetings: MeetingRecord[];
}

export interface MeetingStatusResponse {
  asrStatus: MeetingRecord['asrStatus'];
  updated: boolean;
  transcript: TranscriptSegment[];
  transcriptGrouped: TranscriptGrouped[];
  audioDuration: string;
  error: string | null;
}

export const meetingApi = {
  getFolders: (userId?: string) => {
    const qs = new URLSearchParams();
    if (userId) qs.set('user_id', userId);
    const query = qs.toString();
    return request<{ folders: MeetingFolder[] }>(`/folders/list${query ? `?${query}` : ''}`).then(
      (r) => r.folders
    );
  },

  getMeetings: (params?: { user_id?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.user_id) qs.set('user_id', params.user_id);
    if (params?.limit != null) qs.set('limit', String(params.limit));
    const query = qs.toString();
    return request<MeetingListResponse>(`${query ? `?${query}` : ''}`);
  },

  getMeetingDetail: (meetingId: string) =>
    request<MeetingRecord>(`/${encodeURIComponent(meetingId)}`),

  getMeetingStatus: (meetingId: string) =>
    request<MeetingStatusResponse>(`/${encodeURIComponent(meetingId)}/status`),
};
