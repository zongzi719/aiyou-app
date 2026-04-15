import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  GLOBAL_FLOATING_TAB_BAR_STACKING_HEIGHT,
  shouldShowGlobalBottomTabBar,
} from '@/lib/globalBottomTabBar';

/** 列表 / 滚动区底部内边距（安全区 + 悬浮 Tab 栏占位） */
export function useGlobalFloatingTabBarInset(): number {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  if (!shouldShowGlobalBottomTabBar(pathname)) return insets.bottom + 16;
  return insets.bottom + GLOBAL_FLOATING_TAB_BAR_STACKING_HEIGHT + 16;
}

/** 叠加在底部安全区之上的额外高度（如绝对定位的 ChatInput） */
export function useGlobalFloatingTabBarExtraBottom(): number {
  const pathname = usePathname();
  if (!shouldShowGlobalBottomTabBar(pathname)) return 0;
  return GLOBAL_FLOATING_TAB_BAR_STACKING_HEIGHT;
}
