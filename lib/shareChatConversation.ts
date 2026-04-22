import { Alert, NativeModules, Platform, Share } from 'react-native';

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/** 点击微信卡片后打开的落地页（需为已备案 https；未配置时用网关域名首页） */
export function getChatShareOpenUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_CHAT_SHARE_WEB_URL?.trim();
  if (explicit) return explicit;
  const base = process.env.EXPO_PUBLIC_DEV_API_BASE_URL?.trim();
  if (base && !/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(base)) {
    return `${trimTrailingSlash(base)}/`;
  }
  return 'https://aiyou.ontuotu.com/';
}

const CARD_TITLE = '和 AI You 的对话';
const CARD_DESC = '点击查看对话内容';

function isUserCancelledWeChat(err: unknown): boolean {
  if (err && typeof err === 'object' && 'code' in err) {
    const c = (err as { code?: number }).code;
    return c === -2;
  }
  return false;
}

/**
 * 优先走微信「网页」分享（会话内链接卡片）；未配置 AppId、未安装微信或非原生端时回退系统分享。
 */
export async function shareChatConversation(plainMessage: string): Promise<void> {
  const body = plainMessage.trim();
  const appId = process.env.EXPO_PUBLIC_WECHAT_APP_ID?.trim();
  const openUrl = getChatShareOpenUrl();
  const thumb = process.env.EXPO_PUBLIC_CHAT_SHARE_THUMB_URL?.trim();
  const nm = NativeModules as { WeChat?: { registerApp?: unknown } };

  if (
    Platform.OS !== 'web' &&
    appId &&
    appId.startsWith('wx') &&
    nm.WeChat &&
    typeof nm.WeChat.registerApp === 'function'
  ) {
    try {
      const WeChat = await import('expo-react-native-wechat-v2');
      const universalLink = process.env.EXPO_PUBLIC_WECHAT_IOS_UNIVERSAL_LINK?.trim() || '';
      await WeChat.registerApp(appId, universalLink);
      const installed = await WeChat.isWXAppInstalled();
      if (!installed) {
        Alert.alert('未安装微信', '将使用系统分享发送内容。');
      } else {
        await WeChat.shareWebpage({
          webpageUrl: openUrl,
          title: CARD_TITLE,
          description: CARD_DESC,
          ...(thumb ? { thumbImageUrl: thumb } : {}),
          scene: 0,
        });
        return;
      }
    } catch (err) {
      if (isUserCancelledWeChat(err)) {
        return;
      }
      /* 未注册/回调未配置等：回退系统分享 */
    }
  }

  try {
    await Share.share({
      title: CARD_TITLE,
      message: body ? `${CARD_TITLE}\n${openUrl}\n\n${body}` : `${CARD_TITLE}\n${openUrl}`,
    });
  } catch {
    /* 用户取消 */
  }
}
