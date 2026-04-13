import { getApiBaseUrl } from '@/lib/devApiConfig';
import { getPrivateChatAuthHeaders } from '@/lib/authSession';

export interface ModelInfo {
  id: string;
  display_name?: string;
  name?: string;
}

function normalizeModels(json: unknown): ModelInfo[] {
  const toModel = (item: unknown): ModelInfo | null => {
    if (typeof item === 'string') return { id: item };
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      const id =
        typeof o.id === 'string' ? o.id :
        typeof o.model_name === 'string' ? o.model_name :
        typeof o.name === 'string' ? o.name : null;
      if (!id) return null;
      const display_name =
        typeof o.display_name === 'string' ? o.display_name :
        typeof o.name === 'string' ? o.name : undefined;
      return { id, display_name };
    }
    return null;
  };

  const arr: unknown[] = Array.isArray(json)
    ? json
    : json && typeof json === 'object'
      ? (
          (json as Record<string, unknown>).data ??
          (json as Record<string, unknown>).models ??
          (json as Record<string, unknown>).items ??
          []
        ) as unknown[]
      : [];

  return (arr as unknown[]).map(toModel).filter((m): m is ModelInfo => m !== null);
}

/** GET /api/models — 列出所有可用模型 */
export async function fetchAvailableModels(): Promise<ModelInfo[]> {
  try {
    const base = await getApiBaseUrl();
    const headers = await getPrivateChatAuthHeaders();
    const url = `${base.replace(/\/$/, '')}/api/models`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { ...headers, Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const json: unknown = await res.json();
    return normalizeModels(json);
  } catch {
    return [];
  }
}

/** GET /api/models/{model_name} — 获取单个模型详情 */
export async function fetchModelDetail(modelName: string): Promise<ModelInfo | null> {
  try {
    const base = await getApiBaseUrl();
    const headers = await getPrivateChatAuthHeaders();
    const url = `${base.replace(/\/$/, '')}/api/models/${encodeURIComponent(modelName)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { ...headers, Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const json = await res.json() as Record<string, unknown>;
    const id =
      typeof json.id === 'string' ? json.id :
      typeof json.model_name === 'string' ? json.model_name :
      modelName;
    const display_name =
      typeof json.display_name === 'string' ? json.display_name :
      typeof json.name === 'string' ? json.name : undefined;
    return { id, display_name };
  } catch {
    return null;
  }
}
