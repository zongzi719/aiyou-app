/**
 * 将常见云存储的 http 链接改为 https，避免部分环境下 AVPlayer / ATS 组合问题。
 */
export function preferHttpsMediaUrl(uri: string): string {
  const t = uri.trim();
  if (!/^http:\/\//i.test(t)) return t;
  try {
    const u = new URL(t);
    if (
      u.hostname.includes('aliyuncs.com') ||
      u.hostname.includes('aliyun') ||
      u.hostname.includes('dashscope')
    ) {
      u.protocol = 'https:';
      return u.href;
    }
  } catch {
    return t;
  }
  return t;
}
