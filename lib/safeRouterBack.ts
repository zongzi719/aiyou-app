import { router } from 'expo-router';

/** 有历史则返回上一页，否则回到聊天首页（与底部 Tab 使用 replace 时一致） */
export function safeRouterBackOrHome(): void {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/');
  }
}
