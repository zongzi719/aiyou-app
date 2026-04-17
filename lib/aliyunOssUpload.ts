import * as CryptoJS from 'crypto-js';
import * as FileSystem from 'expo-file-system/legacy';

/** 与产品约定一致：录音归档根目录（OSS 无真实文件夹，对象键前缀即「按用户分目录」） */
export const REGISTER_VOICE_OSS_PREFIX = 'regesiter_voice';

type OssConfig = {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  endpointHost: string;
};

function getOssConfig(): OssConfig {
  const accessKeyId = process.env.EXPO_PUBLIC_ALIYUN_OSS_ACCESS_KEY_ID?.trim();
  const accessKeySecret = process.env.EXPO_PUBLIC_ALIYUN_OSS_ACCESS_KEY_SECRET?.trim();
  const bucket = process.env.EXPO_PUBLIC_ALIYUN_OSS_BUCKET?.trim();
  let endpointHost =
    process.env.EXPO_PUBLIC_ALIYUN_OSS_ENDPOINT?.trim() || 'oss-cn-hangzhou.aliyuncs.com';
  endpointHost = endpointHost.replace(/^https?:\/\//, '').replace(/\/$/, '');

  if (!accessKeyId || accessKeyId.includes('your-')) {
    throw new Error('请在 .env 配置 EXPO_PUBLIC_ALIYUN_OSS_ACCESS_KEY_ID');
  }
  if (!accessKeySecret || accessKeySecret.includes('your-')) {
    throw new Error('请在 .env 配置 EXPO_PUBLIC_ALIYUN_OSS_ACCESS_KEY_SECRET');
  }
  if (!bucket || bucket.includes('your-')) {
    throw new Error('请在 .env 配置 EXPO_PUBLIC_ALIYUN_OSS_BUCKET');
  }
  return { accessKeyId, accessKeySecret, bucket, endpointHost };
}

/** 仅允许安全字符，避免对象键被篡改 */
export function sanitizeOssUserId(userId: string): string {
  const s = userId
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 128);
  if (!s) throw new Error('用户 ID 无效，无法生成 OSS 路径');
  return s;
}

function extensionFromUri(uri: string): string {
  const clean = uri.split('?')[0] || '';
  const ext = clean.split('.').pop()?.toLowerCase();
  if (ext === 'wav' || ext === 'mp3' || ext === 'm4a' || ext === 'aac' || ext === 'caf') {
    return ext === 'caf' ? 'm4a' : ext;
  }
  return 'm4a';
}

function mimeForExt(ext: string): string {
  switch (ext) {
    case 'wav':
      return 'audio/wav';
    case 'mp3':
      return 'audio/mpeg';
    case 'aac':
      return 'audio/aac';
    default:
      return 'audio/mp4';
  }
}

function base64ToUint8Array(b64: string): Uint8Array {
  const parsed = CryptoJS.enc.Base64.parse(b64);
  const words = parsed.words;
  const sigBytes = parsed.sigBytes;
  const u8 = new Uint8Array(sigBytes);
  for (let i = 0; i < sigBytes; i += 1) {
    u8[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
  }
  return u8;
}

async function readLocalFileAsBytes(uri: string): Promise<Uint8Array> {
  const b64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return base64ToUint8Array(b64);
}

function encodeObjectKeyForUrl(objectKey: string): string {
  return objectKey.split('/').map(encodeURIComponent).join('/');
}

/** OSS V1 签名（PutObject），含 x-oss-object-acl: public-read 便于 CosyVoice 拉取公网 URL */
function signPutObject(params: {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  objectKey: string;
  contentType: string;
  gmtDate: string;
  publicRead: boolean;
}): string {
  const aclLine = params.publicRead ? 'x-oss-object-acl:public-read\n' : '';
  const canonicalizedResource = `/${params.bucket}/${params.objectKey}`;
  const stringToSign = [
    'PUT',
    '',
    params.contentType,
    params.gmtDate,
    aclLine + canonicalizedResource,
  ].join('\n');

  const signature = CryptoJS.enc.Base64.stringify(
    CryptoJS.HmacSHA1(stringToSign, params.accessKeySecret)
  );
  return `OSS ${params.accessKeyId}:${signature}`;
}

function buildPublicObjectUrl(bucket: string, endpointHost: string, objectKey: string): string {
  const encoded = encodeObjectKeyForUrl(objectKey);
  return `https://${bucket}.${endpointHost}/${encoded}`;
}

export type UploadRegisterVoiceResult = {
  objectKey: string;
  publicUrl: string;
};

/**
 * 将本地录音上传到 OSS：`regesiter_voice/{userId}/voice_{ts}.{ext}`
 * 同一 userId 前缀下多次上传即可，无需单独「建文件夹」。
 */
export async function uploadRegisterVoiceRecording(params: {
  localUri: string;
  userId: string;
  /** 设为 false 时需 Bucket/规则本身允许匿名读，否则 CosyVoice 无法拉取 */
  publicReadAcl?: boolean;
}): Promise<UploadRegisterVoiceResult> {
  const cfg = getOssConfig();
  const safeId = sanitizeOssUserId(params.userId);
  const ext = extensionFromUri(params.localUri);
  const objectKey = `${REGISTER_VOICE_OSS_PREFIX}/${safeId}/voice_${Date.now()}.${ext}`;
  const contentType = mimeForExt(ext);
  const body = await readLocalFileAsBytes(params.localUri);
  const gmtDate = new Date().toUTCString();
  const publicRead = params.publicReadAcl !== false;

  const authorization = signPutObject({
    accessKeyId: cfg.accessKeyId,
    accessKeySecret: cfg.accessKeySecret,
    bucket: cfg.bucket,
    objectKey,
    contentType,
    gmtDate,
    publicRead,
  });

  const putUrl = `https://${cfg.bucket}.${cfg.endpointHost}/${encodeObjectKeyForUrl(objectKey)}`;
  const headers: Record<string, string> = {
    Authorization: authorization,
    Date: gmtDate,
    'Content-Type': contentType,
    'Content-Length': String(body.length),
  };
  if (publicRead) {
    headers['x-oss-object-acl'] = 'public-read';
  }

  const res = await fetch(putUrl, {
    method: 'PUT',
    headers,
    body: body as unknown as BodyInit,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`OSS 上传失败 (${res.status})：${errText.slice(0, 400)}`);
  }

  const publicUrl = buildPublicObjectUrl(cfg.bucket, cfg.endpointHost, objectKey);
  return { objectKey, publicUrl };
}
