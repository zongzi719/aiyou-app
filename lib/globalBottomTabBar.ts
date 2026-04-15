/**
 * 全局底部悬浮 Tab 栏：与 components/GlobalBottomTabBar 布局保持一致，
 * 供输入框、列表等预留底部空间。
 */

/** 除安全区外，悬浮栏占用高度（含与输入框/列表的间距），与 GlobalBottomTabBar 视觉对齐（底栏 60，+ 在栏内） */
export const GLOBAL_FLOATING_TAB_BAR_STACKING_HEIGHT = 72;

const AUTH_SCREEN_PREFIXES = [
  '/screens/welcome',
  '/screens/login',
  '/screens/signup',
  '/screens/forgot-password',
] as const;

export function shouldShowGlobalBottomTabBar(pathname: string | null | undefined): boolean {
  if (pathname == null || pathname === '') return false;
  if (pathname === '/dev' || pathname.startsWith('/dev/')) return false;
  if (AUTH_SCREEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return false;
  }
  if (pathname === '/') return true;
  if (
    pathname === '/suggestions' ||
    pathname === '/lottie' ||
    pathname === '/mic-animation'
  ) {
    return true;
  }
  if (pathname.startsWith('/screens/')) return true;
  return false;
}

export type GlobalBottomTabKey = 'chat' | 'memory' | 'knowledge' | 'profile';

export function getGlobalBottomTabKey(
  pathname: string | null | undefined
): GlobalBottomTabKey | null {
  if (pathname == null) return null;
  if (
    pathname === '/' ||
    pathname === '/suggestions' ||
    pathname === '/lottie' ||
    pathname === '/mic-animation'
  ) {
    return 'chat';
  }
  if (pathname === '/screens/memory' || pathname.startsWith('/screens/memory/')) {
    return 'memory';
  }
  if (
    pathname === '/screens/knowledge-base' ||
    pathname.startsWith('/screens/knowledge-base/') ||
    pathname === '/screens/knowledge-file-detail' ||
    pathname.startsWith('/screens/knowledge-file-detail/')
  ) {
    return 'knowledge';
  }
  if (
    pathname === '/screens/profile' ||
    pathname.startsWith('/screens/profile/') ||
    pathname === '/screens/edit-profile' ||
    pathname.startsWith('/screens/edit-profile/')
  ) {
    return 'profile';
  }
  return null;
}
