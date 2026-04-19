import { fetchNlsDevToken } from './devToken';

export type StreamingAsrBackend = 'aliyun' | 'gateway';

/**
 * 未设置或非 gateway 时默认阿里云实时识别。
 */
export function getStreamingAsrBackend(): StreamingAsrBackend {
  const v = process.env.EXPO_PUBLIC_ASR_BACKEND?.trim().toLowerCase();
  if (v === 'gateway') return 'gateway';
  return 'aliyun';
}

export function getNlsGatewayWssForStreaming(): string {
  return (
    process.env.EXPO_PUBLIC_ALIYUN_NLS_GATEWAY_WSS?.trim() ||
    'wss://nls-gateway-cn-shanghai.aliyuncs.com/ws/v1'
  );
}

export function getAliyunNlsAppkeyForStreaming(): string {
  return process.env.EXPO_PUBLIC_ALIYUN_NLS_APPKEY?.trim() || '';
}

export function validateAliyunNlsConfigForStreaming(): string | null {
  if (!process.env.EXPO_PUBLIC_NLS_TOKEN_URL?.trim()) {
    return '未配置 EXPO_PUBLIC_NLS_TOKEN_URL（Token 服务地址）';
  }
  if (!getAliyunNlsAppkeyForStreaming()) {
    return '未配置 EXPO_PUBLIC_ALIYUN_NLS_APPKEY';
  }
  return null;
}

/**
 * 与调试页相同：缓存 Token，减少 /nls/token 请求。
 */
export function createCachedNlsTokenGetter(): () => Promise<string> {
  let cache: { token: string; expiresAtMs: number } | null = null;
  return async () => {
    const base = process.env.EXPO_PUBLIC_NLS_TOKEN_URL?.trim() || '';
    if (!base) {
      throw new Error('未配置 EXPO_PUBLIC_NLS_TOKEN_URL');
    }
    const now = Date.now();
    const c = cache;
    if (c && c.expiresAtMs > now + 60_000) {
      return c.token;
    }
    const res = await fetchNlsDevToken(base);
    const exp = typeof res.expireTime === 'number' ? res.expireTime * 1000 : now + 20 * 60_000;
    cache = { token: res.token, expiresAtMs: exp };
    return res.token;
  };
}
