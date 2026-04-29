import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router, usePathname } from 'expo-router';
import React from 'react';
import { View, Pressable, Image, Platform, StyleSheet, Dimensions, PixelRatio } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAiRecordModal } from '@/app/contexts/AiRecordModalContext';
import { shouldShowGlobalBottomTabBar, getGlobalBottomTabKey } from '@/lib/globalBottomTabBar';
import { useHomeRecordPanelVisible } from '@/lib/homeRecordPanelStore';

const CENTER_INSPIRATION_NOTE = require('@/assets/tabbar/add-center.png');
const CHAT_ACTIVE = require('@/assets/tabbar/chat-active.png');
const CHAT_INACTIVE = require('@/assets/tabbar/chat-inactive.png');
const KNOWLEDGE_ACTIVE = require('@/assets/tabbar/knowledge-active.png');
const KNOWLEDGE_INACTIVE = require('@/assets/tabbar/knowledge-inactive.png');
const MEMORY_ACTIVE = require('@/assets/tabbar/memory-active.png');
const MEMORY_INACTIVE = require('@/assets/tabbar/memory-inactive.png');
const PROFILE_ACTIVE = require('@/assets/tabbar/profile-active.png');
const PROFILE_INACTIVE = require('@/assets/tabbar/profile-inactive.png');
/** 设计资源：灵感笔记+.png */

/** 设计规格：底栏 357×60，四键 30×30，中间 + 45×45 */
const BAR_WIDTH = 357;
const BAR_HEIGHT = 60;
const SIDE_ICON = 30;
const CENTER_SIZE = 45;
/** 与外壳圆角一致 */
const PILL_RADIUS = 20;

/** 顶/底沿水平聚光：整条有底光、中间略亮（提高 alpha 以便在 hairline 高度下仍可见） */
const GLASS_EDGE_TOP_COLORS = [
  'rgba(255,255,255,0.12)',
  'rgba(255,255,255,0.26)',
  'rgba(255,255,255,0.5)',
  'rgba(255,255,255,0.26)',
  'rgba(255,255,255,0.12)',
] as const;
const GLASS_EDGE_TOP_LOCATIONS = [0, 0.14, 0.5, 0.86, 1] as const;
const GLASS_EDGE_BOTTOM_COLORS = [
  'rgba(255,255,255,0.1)',
  'rgba(255,255,255,0.2)',
  'rgba(255,255,255,0.36)',
  'rgba(255,255,255,0.2)',
  'rgba(255,255,255,0.1)',
] as const;
const GLASS_EDGE_BOTTOM_LOCATIONS = [0, 0.14, 0.5, 0.86, 1] as const;
/** 至少约 1px 物理像素，hairline 在部分机型/叠 blur 上过淡 */
const GLASS_EDGE_STRIPE_H = Math.max(StyleSheet.hairlineWidth, PixelRatio.roundToNearestPixel(1));
const GLASS_EDGE_TOP_H = GLASS_EDGE_STRIPE_H;
const GLASS_EDGE_BOTTOM_H = GLASS_EDGE_STRIPE_H;

export default function GlobalBottomTabBar() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { openAiRecord, visible: aiRecordModalVisible } = useAiRecordModal();
  const homeRecordPanelVisible = useHomeRecordPanelVisible();

  if (!shouldShowGlobalBottomTabBar(pathname)) {
    return null;
  }
  if (pathname === '/' && homeRecordPanelVisible) {
    return null;
  }
  if (aiRecordModalVisible) {
    return null;
  }

  const active = getGlobalBottomTabKey(pathname);

  const goChat = () => router.replace('/');
  const goMemory = () => router.replace('/screens/memory');
  const goKnowledge = () => router.replace('/screens/knowledge-base');
  const goProfile = () => router.replace('/screens/profile');

  const onInspirationNotePress = () => {
    openAiRecord();
  };

  const screenW = Dimensions.get('window').width;
  const barWidth = Math.min(BAR_WIDTH, screenW - 24);

  return (
    <View
      pointerEvents="box-none"
      className="absolute left-0 right-0 items-center"
      style={{
        bottom: 0,
        paddingBottom: Math.max(insets.bottom, 4),
        /** 必须高于 ChatInput（zIndex 999）等底部浮层，否则 Tab 点击会被吃掉 */
        zIndex: 5000,
        /** 过高会在 Android 上形成厚重黑边感，保留足够盖住内容即可 */
        elevation: 24,
      }}>
      <View style={[styles.barWrap, { width: barWidth }]}>
        <View
          style={[
            styles.pillShell,
            {
              height: BAR_HEIGHT,
              width: '100%',
              borderRadius: PILL_RADIUS,
              overflow: 'hidden',
            },
          ]}>
          <BlurView
            intensity={Platform.OS === 'ios' ? 52 : 42}
            tint="dark"
            experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
            style={[styles.pillBlur, styles.pillInnerFill]}>
            <SideTabsRow
              active={active}
              goChat={goChat}
              goMemory={goMemory}
              onCenterPress={onInspirationNotePress}
              goKnowledge={goKnowledge}
              goProfile={goProfile}
            />
          </BlurView>
          <View pointerEvents="none" style={styles.glassEdgeOverlay}>
            <LinearGradient
              colors={[...GLASS_EDGE_BOTTOM_COLORS]}
              locations={[...GLASS_EDGE_BOTTOM_LOCATIONS]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.glassEdgeStripeBottom, { height: GLASS_EDGE_BOTTOM_H }]}
            />
            <LinearGradient
              colors={[...GLASS_EDGE_TOP_COLORS]}
              locations={[...GLASS_EDGE_TOP_LOCATIONS]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.glassEdgeStripeTop, { height: GLASS_EDGE_TOP_H }]}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

type SideTabsRowProps = {
  active: ReturnType<typeof getGlobalBottomTabKey>;
  goChat: () => void;
  goMemory: () => void;
  onCenterPress: () => void;
  goKnowledge: () => void;
  goProfile: () => void;
};

function SideTabsRow({
  active,
  goChat,
  goMemory,
  onCenterPress,
  goKnowledge,
  goProfile,
}: SideTabsRowProps) {
  return (
    <View
      className="w-full flex-row items-center"
      style={{
        height: BAR_HEIGHT,
        paddingHorizontal: 4,
        /** 五个入口在整条底栏上等分留白，避免「中间两个贴着 +、两侧很远」 */
        justifyContent: 'space-evenly',
      }}>
      <Pressable
        onPress={goChat}
        accessibilityRole="button"
        accessibilityLabel="聊天"
        hitSlop={8}
        style={styles.tabSlot}>
        <Image
          source={active === 'chat' ? CHAT_ACTIVE : CHAT_INACTIVE}
          style={styles.sideImg}
          resizeMode="contain"
        />
      </Pressable>

      <Pressable
        onPress={goMemory}
        accessibilityRole="button"
        accessibilityLabel="记忆库"
        hitSlop={8}
        style={styles.tabSlot}>
        <Image
          source={active === 'memory' ? MEMORY_ACTIVE : MEMORY_INACTIVE}
          style={styles.sideImg}
          resizeMode="contain"
        />
      </Pressable>

      <Pressable
        onPress={onCenterPress}
        accessibilityRole="button"
        accessibilityLabel="灵感笔记"
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        style={styles.centerSlot}>
        <Image
          source={CENTER_INSPIRATION_NOTE}
          style={{ width: CENTER_SIZE, height: CENTER_SIZE }}
          resizeMode="contain"
        />
      </Pressable>

      <Pressable
        onPress={goKnowledge}
        accessibilityRole="button"
        accessibilityLabel="知识库"
        hitSlop={8}
        style={styles.tabSlot}>
        <Image
          source={active === 'knowledge' ? KNOWLEDGE_ACTIVE : KNOWLEDGE_INACTIVE}
          style={styles.sideImg}
          resizeMode="contain"
        />
      </Pressable>

      <Pressable
        onPress={goProfile}
        accessibilityRole="button"
        accessibilityLabel="个人资料"
        hitSlop={8}
        style={styles.tabSlot}>
        <Image
          source={active === 'profile' ? PROFILE_ACTIVE : PROFILE_INACTIVE}
          style={styles.sideImg}
          resizeMode="contain"
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  barWrap: {
    overflow: 'visible',
  },
  /** 轻微浮起，避免纯黑描边感 */
  pillShell: {
    shadowColor: 'rgba(0,0,0,0.12)',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: Platform.OS === 'android' ? 6 : 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.26)',
  },
  pillBlur: {
    backgroundColor: 'rgba(127, 127, 127, 0.2)',
  },
  pillInnerFill: {
    height: BAR_HEIGHT,
    width: '100%',
  },
  glassEdgeOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: PILL_RADIUS,
    overflow: 'hidden',
  },
  glassEdgeStripeTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
  },
  glassEdgeStripeBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  /** 与中间 45 同宽占位，五个槽视觉对称，space-evenly 间距更匀 */
  tabSlot: {
    width: CENTER_SIZE,
    height: BAR_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  centerSlot: {
    width: CENTER_SIZE,
    height: CENTER_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideImg: {
    width: SIDE_ICON,
    height: SIDE_ICON,
  },
});
