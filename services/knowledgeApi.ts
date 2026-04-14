import { getApiBaseUrl, getDevUserId } from '@/lib/devApiConfig';
import { getAuthSession } from '@/lib/authSession';

const API_PREFIX = '/api/knowledge';

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

export interface KnowledgeFolder {
  id: string;
  name: string;
  count: number;
}

export interface KnowledgeFile {
  id: string;
  filename: string;
  mime_type: string;
  file_size: number;
  folder_id: string | null;
  status: 'queued' | 'processing' | 'done' | 'error';
  chunk_count: number;
  created_at: string;
  progress: number | null;
}

export interface FileListResponse {
  files: KnowledgeFile[];
  total: number;
}

export interface FileStatusResponse {
  status: KnowledgeFile['status'];
  progress: number | null;
  error_message: string | null;
}

export interface FileListParams {
  folder_id?: string;
  status?: KnowledgeFile['status'];
  q?: string;
  page?: number;
  page_size?: number;
}

export const knowledgeApi = {
  getFolders: () =>
    request<{ folders: KnowledgeFolder[] }>('/folders').then((r) => r.folders),

  createFolder: (name: string) =>
    request<{ id: string; name: string }>('/folders', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  renameFolder: (folderId: string, name: string) =>
    request<{ updated: boolean }>(`/folders/${folderId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),

  deleteFolder: (folderId: string) =>
    request<{ deleted: boolean }>(`/folders/${folderId}`, { method: 'DELETE' }),

  getFiles: (params?: FileListParams) => {
    const qs = new URLSearchParams();
    if (params?.folder_id) qs.set('folder_id', params.folder_id);
    if (params?.status) qs.set('status', params.status);
    if (params?.q) qs.set('q', params.q);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.page_size) qs.set('page_size', String(params.page_size));
    const query = qs.toString();
    return request<FileListResponse>(`/files${query ? `?${query}` : ''}`);
  },

  uploadFile: async (uri: string, filename: string, mimeType: string, folderId?: string) => {
    const [base, session, devUserId] = await Promise.all([getBaseUrl(), getAuthSession(), getDevUserId()]);

    const formData = new FormData();
    formData.append('file', { uri, name: filename, type: mimeType } as unknown as Blob);
    if (folderId && folderId !== 'all' && folderId !== 'recent') {
      formData.append('folder_id', folderId);
    }

    const headers: Record<string, string> = {};
    if (session.token) {
      headers['Authorization'] = `Bearer ${session.token}`;
      headers['x-auth-token'] = session.token;
    }
    headers['x-user-id'] = session.userId ?? devUserId;
    if (session.tenantId) headers['x-tenant-id'] = session.tenantId;
    if (session.workspaceId) headers['x-workspace-id'] = session.workspaceId;

    const res = await fetch(`${base}${API_PREFIX}/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let detail: string | undefined;
      try { detail = (JSON.parse(text) as { detail?: string }).detail; } catch { detail = text.slice(0, 200) || undefined; }
      console.error(`[uploadFile] HTTP ${res.status}:`, text.slice(0, 500));
      throw httpError(res.status, detail);
    }
    return res.json().catch(() => {
      throw new Error('服务器返回了无效的响应');
    }) as Promise<{ file_id: string; status: string }>;
  },

  deleteFile: (fileId: string) =>
    request<{ deleted: boolean }>(`/files/${fileId}`, { method: 'DELETE' }),

  getFileStatus: (fileId: string) =>
    request<FileStatusResponse>(`/status/${fileId}`),

  reindexFile: (fileId: string) =>
    request<{ queued: boolean }>(`/reindex/${fileId}`, { method: 'POST' }),
};

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

export function getMimeLabel(mimeType: string): string {
  if (mimeType.includes('pdf')) return 'PDF';
  if (mimeType.includes('word') || mimeType.includes('docx') || mimeType.includes('doc')) return 'Word';
  if (mimeType.includes('excel') || mimeType.includes('xlsx') || mimeType.includes('xls')) return 'Excel';
  if (mimeType.includes('powerpoint') || mimeType.includes('pptx') || mimeType.includes('ppt')) return 'PPT';
  if (mimeType.includes('text')) return 'TXT';
  if (mimeType.includes('image')) return '图片';
  if (mimeType.includes('audio')) return '音频';
  if (mimeType.includes('video')) return '视频';
  return '文档';
}

export function getMimeColor(mimeType: string): string {
  if (mimeType.includes('pdf')) return '#E53935';
  if (mimeType.includes('word') || mimeType.includes('doc')) return '#1E88E5';
  if (mimeType.includes('excel') || mimeType.includes('xls')) return '#43A047';
  if (mimeType.includes('powerpoint') || mimeType.includes('ppt')) return '#FB8C00';
  return '#8E8E93';
}
