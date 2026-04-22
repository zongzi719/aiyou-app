type TokenHubImageModel = 'hy-image-v3.0' | 'hy-image-lite';

interface SubmitImageJobBody {
  model: TokenHubImageModel;
  prompt: string;
  /** 图生图：任意可访问的图片地址（URL） */
  images?: string[];
  /** 返回图片类型：url / base64（文档示例常用 url） */
  rsp_img_type?: 'url' | 'base64';
}

interface SubmitImageJobResponse {
  id: string;
  task_id?: string;
  taskId?: string;
  request_id?: string;
  object?: string;
  created_at?: number;
  status?: string;
  data?: {
    id?: string;
    task_id?: string;
    taskId?: string;
  };
}

interface QueryImageJobBody {
  model: TokenHubImageModel;
  id: string;
}

type QueryJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'canceled' | string;

interface QueryImageJobResponse {
  request_id?: string;
  object?: string;
  created_at?: number;
  completed_at?: number;
  status: QueryJobStatus;
  data?: { url?: string; b64_json?: string; revised_prompt?: string }[];
  error?: unknown;
}

const TOKENHUB_BASE_URL = 'https://tokenhub.tencentmaas.com/v1/api/image';

function getTokenHubApiKey(): string {
  const key = process.env.EXPO_PUBLIC_TENCENT_MAAS_API_KEY;
  if (!key?.trim() || key.includes('your-tokenhub-key-here')) {
    throw new Error('未配置 TokenHub API Key，请在 .env 设置 EXPO_PUBLIC_TENCENT_MAAS_API_KEY');
  }
  const trimmed = key.trim().replace(/^["']|["']$/g, '');
  if (!trimmed.startsWith('sk-')) {
    throw new Error(
      'TokenHub API Key 格式不正确：需要以 sk- 开头。请在 .env 设置 EXPO_PUBLIC_TENCENT_MAAS_API_KEY=sk-...'
    );
  }
  return trimmed;
}

async function postJson<T>(
  url: string,
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<T> {
  const apiKey = getTokenHubApiKey();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    throw new Error(`TokenHub 请求失败 (${res.status}): ${text.slice(0, 200)}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`TokenHub 响应解析失败: ${text.slice(0, 200)}`);
  }
}

function pickFirstString(values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function pickTaskIdFromUnknown(input: unknown, depth = 0): string | undefined {
  if (depth > 4 || input == null) return undefined;
  if (typeof input === 'string') return input.trim() || undefined;
  if (Array.isArray(input)) {
    for (const item of input) {
      const found = pickTaskIdFromUnknown(item, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof input !== 'object') return undefined;

  const record = input as Record<string, unknown>;
  const direct = pickFirstString([
    record.task_id,
    record.taskId,
    record.job_id,
    record.jobId,
    record.id,
    record.request_id,
    record.requestId,
  ]);
  if (direct) return direct;

  for (const value of Object.values(record)) {
    const found = pickTaskIdFromUnknown(value, depth + 1);
    if (found) return found;
  }
  return undefined;
}

export async function submitImageJob(
  body: Omit<SubmitImageJobBody, 'model'> & { model?: TokenHubImageModel },
  signal?: AbortSignal
): Promise<SubmitImageJobResponse> {
  const payload: SubmitImageJobBody = {
    model: body.model ?? 'hy-image-v3.0',
    prompt: body.prompt,
    images: body.images,
    rsp_img_type: body.rsp_img_type ?? 'url',
  };
  const raw = await postJson<SubmitImageJobResponse>(`${TOKENHUB_BASE_URL}/submit`, payload, signal);
  const normalizedId = pickFirstString([
    raw.id,
    raw.task_id,
    raw.taskId,
    // 部分返回会把任务标识塞在 request_id。
    raw.request_id,
    raw.data?.id,
    raw.data?.task_id,
    raw.data?.taskId,
    pickTaskIdFromUnknown(raw.data),
    pickTaskIdFromUnknown(raw),
  ]);
  return {
    ...raw,
    id: normalizedId ?? '',
  };
}

export async function queryImageJob(
  body: Omit<QueryImageJobBody, 'model'> & { model?: TokenHubImageModel },
  signal?: AbortSignal
): Promise<QueryImageJobResponse> {
  const payload: QueryImageJobBody = {
    model: body.model ?? 'hy-image-v3.0',
    id: body.id,
  };
  return await postJson<QueryImageJobResponse>(`${TOKENHUB_BASE_URL}/query`, payload, signal);
}
