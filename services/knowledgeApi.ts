import * as FileSystem from 'expo-file-system/legacy';

import { getAuthSession } from '@/lib/authSession';
import { getApiBaseUrl, getDevUserId } from '@/lib/devApiConfig';

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

function sanitizeKnowledgeDownloadFilename(name: string): string {
  const base = name.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'file';
  return base.length > 120 ? base.slice(0, 120) : base;
}

/**
 * 列表/详情展示用：文件名在 multipart 或存储链路中可能被 UTF-8 百分号编码，需解码后再展示。
 */
export function displayKnowledgeFilename(filename: string): string {
  if (!filename || !/%[0-9A-Fa-f]{2}/.test(filename)) return filename;
  let cur = filename;
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(cur);
      if (next === cur || !next || next.includes('\uFFFD')) break;
      cur = next;
      if (!/%[0-9A-Fa-f]{2}/.test(cur)) break;
    } catch {
      break;
    }
  }
  return cur;
}

/** 将后端可能出现的别名统一为文档约定四种状态，避免未知值在 UI 上被当成「处理失败」 */
const KNOWLEDGE_STATUS_ALIASES: Record<string, KnowledgeFile['status']> = {
  queued: 'queued',
  pending: 'queued',
  waiting: 'queued',
  processing: 'processing',
  running: 'processing',
  in_progress: 'processing',
  inprogress: 'processing',
  parsing: 'processing',
  indexing: 'processing',
  vectorizing: 'processing',
  embedding: 'processing',
  done: 'done',
  completed: 'done',
  complete: 'done',
  success: 'done',
  succeeded: 'done',
  finished: 'done',
  ready: 'done',
  indexed: 'done',
  ok: 'done',
  error: 'error',
  failed: 'error',
  failure: 'error',
};

function normStatusKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

/** 部分后端用数字表示阶段（0~3，与文档字符串枚举并存；若与贵司后端不一致可再调映射） */
const KNOWLEDGE_STATUS_BY_NUMBER: Record<number, KnowledgeFile['status']> = {
  0: 'queued',
  1: 'processing',
  2: 'done',
  3: 'error',
};

export function normalizeKnowledgeFileStatus(raw: unknown): KnowledgeFile['status'] {
  if (raw == null) return 'queued';
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const mapped = KNOWLEDGE_STATUS_BY_NUMBER[raw];
    if (mapped) return mapped;
    return 'queued';
  }
  if (typeof raw !== 'string') return 'queued';
  const key = normStatusKey(raw);
  const mapped = KNOWLEDGE_STATUS_ALIASES[key];
  if (mapped) return mapped;
  const valid: KnowledgeFile['status'][] = ['queued', 'processing', 'done', 'error'];
  if (valid.includes(raw as KnowledgeFile['status'])) return raw as KnowledgeFile['status'];
  return 'queued';
}

function pickChunkArray(o: Record<string, unknown>): unknown[] {
  if (Array.isArray(o.chunks)) return o.chunks;
  if (Array.isArray(o.items)) return o.items;
  if (Array.isArray(o.records)) return o.records;
  if (Array.isArray(o.list)) return o.list;
  if (Array.isArray(o.rows)) return o.rows;
  if (Array.isArray(o.data)) return o.data;
  return [];
}

function normalizeKnowledgeChunk(
  raw: unknown,
  fileId: string,
  fallbackIndex: number
): KnowledgeChunk {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const id =
    typeof o.id === 'string' && o.id
      ? o.id
      : typeof o.chunk_id === 'string' && o.chunk_id
        ? o.chunk_id
        : typeof o._id === 'string' && o._id
          ? o._id
          : `${fileId}-chunk-${fallbackIndex}`;
  const index =
    typeof o.index === 'number' && Number.isFinite(o.index)
      ? o.index
      : typeof o.chunk_index === 'number' && Number.isFinite(o.chunk_index)
        ? o.chunk_index
        : fallbackIndex;
  const content =
    typeof o.content === 'string'
      ? o.content
      : typeof o.text === 'string'
        ? o.text
        : typeof o.body === 'string'
          ? o.body
          : '';
  const token_count =
    typeof o.token_count === 'number' && Number.isFinite(o.token_count)
      ? o.token_count
      : typeof o.tokenCount === 'number' && Number.isFinite(o.tokenCount)
        ? o.tokenCount
        : typeof o.tokens === 'number' && Number.isFinite(o.tokens)
          ? o.tokens
          : 0;
  const fromApi: Record<string, unknown> =
    o.metadata && typeof o.metadata === 'object' && !Array.isArray(o.metadata)
      ? { ...(o.metadata as Record<string, unknown>) }
      : {};
  if (typeof o.char_count === 'number' && Number.isFinite(o.char_count)) {
    fromApi.char_count = o.char_count;
  }
  if (o.section_title != null && o.section_title !== '') {
    fromApi.section_title = o.section_title;
  }
  const metadata = Object.keys(fromApi).length > 0 ? fromApi : undefined;
  return { id, index, content, token_count, metadata };
}

function normalizeFileChunksPayload(json: unknown, fileId: string): FileChunksResponse {
  const o = json && typeof json === 'object' ? (json as Record<string, unknown>) : {};
  let src: Record<string, unknown> = o;
  let list = pickChunkArray(o);
  if (list.length === 0) {
    const data = o.data;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const inner = data as Record<string, unknown>;
      const innerList = pickChunkArray(inner);
      if (innerList.length > 0) {
        src = inner;
        list = innerList;
      }
    }
  }

  const file_id = typeof src.file_id === 'string' ? src.file_id : fileId;
  const filenameRaw = typeof src.filename === 'string' ? src.filename : '';
  const filename = displayKnowledgeFilename(filenameRaw);
  const totalRaw =
    typeof src.total === 'number'
      ? src.total
      : typeof src.total_count === 'number'
        ? src.total_count
        : typeof src.count === 'number'
          ? src.count
          : list.length;
  const chunks = list.map((item, i) => normalizeKnowledgeChunk(item, file_id, i));
  return { file_id, filename, chunks, total: totalRaw };
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

function isNotFoundError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg === 'Not Found' || /\b404\b/.test(msg) || msg.toLowerCase().includes('not found');
}

/** 与 Web 管理端 `preview-chunks` 请求体一致（重新索引、拉取分块共用默认值） */
export interface KnowledgeChunkProcessingConfig {
  separator?: string;
  chunk_size?: number;
  chunk_overlap?: number;
}

export const DEFAULT_KNOWLEDGE_CHUNK_CONFIG: Required<KnowledgeChunkProcessingConfig> = {
  separator: '\n\n',
  chunk_size: 512,
  chunk_overlap: 50,
};

function mergeChunkConfig(
  overrides?: KnowledgeChunkProcessingConfig
): Required<KnowledgeChunkProcessingConfig> {
  return { ...DEFAULT_KNOWLEDGE_CHUNK_CONFIG, ...overrides };
}

function chunkQueryString(params?: { page?: number; page_size?: number }): string {
  const qs = new URLSearchParams();
  if (params?.page != null) qs.set('page', String(params.page));
  if (params?.page_size != null) qs.set('page_size', String(params.page_size));
  const q = qs.toString();
  return q ? `?${q}` : '';
}

async function fetchChunksViaPreview(
  fileId: string,
  params?: { page?: number; page_size?: number },
  chunkConfig?: KnowledgeChunkProcessingConfig
): Promise<FileChunksResponse> {
  const cfg = mergeChunkConfig(chunkConfig);
  const path = `/preview-chunks/${encodeURIComponent(fileId)}${chunkQueryString(params)}`;
  const json = await request<unknown>(path, {
    method: 'POST',
    body: JSON.stringify({
      separator: cfg.separator,
      chunk_size: cfg.chunk_size,
      chunk_overlap: cfg.chunk_overlap,
    }),
  });
  return normalizeFileChunksPayload(json, fileId);
}

async function fetchChunksViaDocGet(
  fileId: string,
  params?: { page?: number; page_size?: number }
): Promise<FileChunksResponse> {
  const path = `/files/${encodeURIComponent(fileId)}/chunks${chunkQueryString(params)}`;
  const json = await request<unknown>(path);
  return normalizeFileChunksPayload(json, fileId);
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

/** RAG 分块（preview-chunks 或 GET /files/{id}/chunks） */
export interface KnowledgeChunk {
  id: string;
  index: number;
  content: string;
  token_count: number;
  metadata?: Record<string, unknown>;
}

export interface FileChunksResponse {
  file_id: string;
  filename: string;
  chunks: KnowledgeChunk[];
  total: number;
}

export interface KnowledgeChunkDetail extends KnowledgeChunk {
  file_id: string;
  filename: string;
}

export interface FileListParams {
  folder_id?: string;
  status?: KnowledgeFile['status'];
  q?: string;
  page?: number;
  page_size?: number;
}

/** 兼容不同后端包装：`files` / `items` / `data.files` 等 */
function extractKnowledgeFilesArray(payload: unknown): unknown[] {
  if (!payload || typeof payload !== 'object') return [];
  const r = payload as Record<string, unknown>;
  if (Array.isArray(r.files)) return r.files;
  if (Array.isArray(r.items)) return r.items;
  if (Array.isArray(r.list)) return r.list;
  if (Array.isArray(r.data)) return r.data;
  if (Array.isArray(r.records)) return r.records;
  if (Array.isArray(r.rows)) return r.rows;
  if (Array.isArray(r.result)) return r.result;
  const data = r.data;
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.files)) return d.files;
    if (Array.isArray(d.items)) return d.items;
    if (Array.isArray(d.list)) return d.list;
    if (Array.isArray(d.records)) return d.records;
    if (Array.isArray(d.rows)) return d.rows;
    if (Array.isArray(d.result)) return d.result;
  }
  return [];
}

function extractKnowledgeListTotal(payload: unknown, listLen: number): number {
  if (!payload || typeof payload !== 'object') return listLen;
  const r = payload as Record<string, unknown>;
  if (typeof r.total === 'number' && Number.isFinite(r.total)) return r.total;
  const data = r.data;
  if (data && typeof data === 'object') {
    const t = (data as Record<string, unknown>).total;
    if (typeof t === 'number' && Number.isFinite(t)) return t;
  }
  return listLen;
}

export const knowledgeApi = {
  getFolders: () => request<{ folders: KnowledgeFolder[] }>('/folders').then((r) => r.folders),

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
    return request<unknown>(`/files${query ? `?${query}` : ''}`).then((raw) => {
      const listRaw = extractKnowledgeFilesArray(raw);
      const total = extractKnowledgeListTotal(raw, listRaw.length);
      const files: KnowledgeFile[] = listRaw
        .map((item) => {
          const row = item as Record<string, unknown>;
          const idRaw =
            (typeof row.id === 'string' && row.id) ||
            (typeof row.file_id === 'string' && row.file_id) ||
            (typeof row.knowledge_file_id === 'string' && row.knowledge_file_id) ||
            (typeof row.uuid === 'string' && row.uuid) ||
            (typeof row._id === 'string' && row._id) ||
            (typeof row.id === 'number' && String(row.id)) ||
            (typeof row.file_id === 'number' && String(row.file_id)) ||
            '';
          const f = item as KnowledgeFile;
          const id = (idRaw || (typeof f.id === 'string' ? f.id : '')).trim();
          const filenameRaw =
            typeof f.filename === 'string'
              ? f.filename
              : typeof row.filename === 'string'
                ? row.filename
                : typeof row.name === 'string'
                  ? row.name
                  : typeof row.file_name === 'string'
                    ? row.file_name
                    : '';
          const mimeRaw =
            typeof f.mime_type === 'string'
              ? f.mime_type
              : typeof row.mime_type === 'string'
                ? row.mime_type
                : typeof row.mimeType === 'string'
                  ? row.mimeType
                  : 'application/octet-stream';
          return {
            ...f,
            id,
            filename: displayKnowledgeFilename(filenameRaw),
            mime_type: mimeRaw,
            status: normalizeKnowledgeFileStatus(f.status ?? row.status),
          };
        })
        .filter((f) => Boolean(f.id));
      const out: FileListResponse = { files, total };
      return out;
    });
  },

  /**
   * 上传文件（multipart）。与 Web 一致附带 `chunk_separator` / `chunk_size` / `chunk_overlap`；
   * 未传 `chunkProcessing` 时使用 `DEFAULT_KNOWLEDGE_CHUNK_CONFIG`。
   */
  uploadFile: async (
    uri: string,
    filename: string,
    mimeType: string,
    folderId?: string,
    chunkProcessing?: KnowledgeChunkProcessingConfig
  ) => {
    const [base, session, devUserId] = await Promise.all([
      getBaseUrl(),
      getAuthSession(),
      getDevUserId(),
    ]);

    const cfg = mergeChunkConfig(chunkProcessing);
    const formData = new FormData();
    formData.append('file', { uri, name: filename, type: mimeType } as unknown as Blob);
    if (folderId && folderId !== 'all' && folderId !== 'recent') {
      formData.append('folder_id', folderId);
    }
    formData.append('chunk_separator', cfg.separator);
    formData.append('chunk_size', String(cfg.chunk_size));
    formData.append('chunk_overlap', String(cfg.chunk_overlap));

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
      try {
        detail = (JSON.parse(text) as { detail?: string }).detail;
      } catch {
        detail = text.slice(0, 200) || undefined;
      }
      console.error(`[uploadFile] HTTP ${res.status}:`, text.slice(0, 500));
      throw httpError(res.status, detail);
    }
    return res.json().catch(() => {
      throw new Error('服务器返回了无效的响应');
    }) as Promise<{ file_id: string; status: string }>;
  },

  deleteFile: (fileId: string) =>
    request<{ deleted: boolean }>(`/files/${fileId}`, { method: 'DELETE' }),

  /**
   * 下载原始文件到应用缓存目录（GET /files/{id}/download，需服务端提供）。
   * 成功后返回本地 `file://` URI，可配合 expo-sharing 交给系统「存储到文件」等。
   */
  downloadOriginalFile: async (fileId: string, filename: string): Promise<string> => {
    const cacheDir = FileSystem.cacheDirectory;
    if (!cacheDir) {
      throw new Error('当前环境无法写入缓存，请在 App 内重试');
    }
    const [base, headers] = await Promise.all([getBaseUrl(), getHeaders()]);
    const url = `${base}${API_PREFIX}/files/${encodeURIComponent(fileId)}/download`;
    const hdrs: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() === 'content-type') continue;
      hdrs[k] = v;
    }
    const safeId = fileId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'file';
    const dest = `${cacheDir}kb_${safeId}_${sanitizeKnowledgeDownloadFilename(filename)}`;
    const result = await FileSystem.downloadAsync(url, dest, { headers: hdrs });
    if (result.status != null && (result.status < 200 || result.status >= 300)) {
      throw new Error(`下载失败（HTTP ${result.status}）`);
    }
    return result.uri;
  },

  getFileStatus: (fileId: string) =>
    request<FileStatusResponse>(`/status/${fileId}`).then((r) => ({
      ...r,
      status: normalizeKnowledgeFileStatus(r.status),
    })),

  reindexFile: (fileId: string, chunkConfig?: KnowledgeChunkProcessingConfig) => {
    const cfg = mergeChunkConfig(chunkConfig);
    return request<{ queued: boolean }>(`/reindex/${encodeURIComponent(fileId)}`, {
      method: 'POST',
      body: JSON.stringify({
        separator: cfg.separator,
        chunk_size: cfg.chunk_size,
        chunk_overlap: cfg.chunk_overlap,
      }),
    });
  },

  /**
   * 获取文件分块列表：优先 POST /preview-chunks/{id}（与 Web 管理端一致）；
   * 若返回 404 再回退 GET /files/{id}/chunks（文档备选）。
   */
  getFileChunks: (
    fileId: string,
    params?: { page?: number; page_size?: number },
    chunkConfig?: KnowledgeChunkProcessingConfig
  ) =>
    fetchChunksViaPreview(fileId, params, chunkConfig).catch((err: unknown) => {
      if (isNotFoundError(err)) {
        return fetchChunksViaDocGet(fileId, params);
      }
      throw err;
    }),

  /** 单个分块详情（内容过长时可展开） */
  getChunk: (chunkId: string) =>
    request<KnowledgeChunkDetail>(`/chunks/${encodeURIComponent(chunkId)}`).then((r) => ({
      ...r,
      filename: displayKnowledgeFilename(typeof r.filename === 'string' ? r.filename : ''),
    })),
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
  if (mimeType.includes('word') || mimeType.includes('docx') || mimeType.includes('doc'))
    return 'Word';
  if (mimeType.includes('excel') || mimeType.includes('xlsx') || mimeType.includes('xls'))
    return 'Excel';
  if (mimeType.includes('powerpoint') || mimeType.includes('pptx') || mimeType.includes('ppt'))
    return 'PPT';
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
