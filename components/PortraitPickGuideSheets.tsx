import React from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon from '@/components/Icon';
import ThemedText from '@/components/ThemedText';

const SHEET_BG = '#1A1A1A';
const CTA_PRIMARY = '#4A4A4A';
const BTN_ALBUM = '#3A3A3A';
const BTN_CAMERA = '#E8E8E8';
const CHECK_GOLD = '#D4A017';
const BADGE_GRAY = '#6B6B6B';

/** 设计稿四张：单人正面 / 面部清晰可见 / 人像太小 / 脸部遮挡 */
const EXAMPLE_SINGLE_FRONT = require('@/assets/images/portrait-guide/example-single-front.png');
const EXAMPLE_FACE_CLEAR = require('@/assets/images/portrait-guide/example-face-clear.png');
const EXAMPLE_TOO_SMALL = require('@/assets/images/portrait-guide/example-too-small.png');
const EXAMPLE_FACE_OBSCURED = require('@/assets/images/portrait-guide/example-face-obscured.png');

type ExampleItem = {
  key: string;
  label: string;
  source: number;
  /** 前两张 ✓，后两张 ✗ */
  ok: boolean;
};

const EXAMPLES: ExampleItem[] = [
  { key: 'a', label: '单人正面', source: EXAMPLE_SINGLE_FRONT, ok: true },
  { key: 'b', label: '面部清晰可见', source: EXAMPLE_FACE_CLEAR, ok: true },
  { key: 'c', label: '人像太小', source: EXAMPLE_TOO_SMALL, ok: false },
  { key: 'd', label: '脸部遮挡', source: EXAMPLE_FACE_OBSCURED, ok: false },
];

export type PortraitPickGuideSheetsProps = {
  visible: boolean;
  /** 1 = 说明 + 示例 + 立即选择；2 = 拍照 / 相册 */
  step: 1 | 2;
  onClose: () => void;
  onContinueToSource: () => void;
  onTakePhoto: () => void | Promise<void>;
  onPickLibrary: () => void | Promise<void>;
};

export default function PortraitPickGuideSheets({
  visible,
  step,
  onClose,
  onContinueToSource,
  onTakePhoto,
  onPickLibrary,
}: PortraitPickGuideSheetsProps) {
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const pad = Math.max(16, Math.min(20, winW * 0.05));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable
          style={[StyleSheet.absoluteFillObject, styles.backdrop]}
          onPress={onClose}
          accessibilityLabel="关闭"
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: SHEET_BG,
              paddingHorizontal: pad,
              paddingTop: 12,
              paddingBottom: Math.max(insets.bottom, 16) + 12,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
            },
          ]}>
          <View className="flex-row items-center justify-end" style={{ marginBottom: 8 }}>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="关闭"
              style={styles.closeBtn}>
              <Icon name="X" size={18} color="rgba(255,255,255,0.85)" strokeWidth={2.2} />
            </TouchableOpacity>
          </View>

          {step === 1 ? (
            <>
              <ThemedText
                className="text-[15px] font-normal leading-[22px] text-white"
                style={{ marginBottom: 18 }}>
                请添加一张清晰的正脸照片，以便 AI 生成更具辨识度且专业的虚拟形象。
              </ThemedText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.examplesRow}
                style={{ marginBottom: 20 }}>
                {EXAMPLES.map((ex) => (
                  <View key={ex.key} style={styles.exampleCol}>
                    <View style={styles.thumbWrap}>
                      <Image source={ex.source} style={StyleSheet.absoluteFillObject} resizeMode="contain" />
                      <View
                        pointerEvents="none"
                        style={[styles.badge, { backgroundColor: ex.ok ? CHECK_GOLD : BADGE_GRAY }]}>
                        <Icon
                          name={ex.ok ? 'Check' : 'X'}
                          size={11}
                          color="#FFFFFF"
                          strokeWidth={2.5}
                        />
                      </View>
                    </View>
                    <ThemedText
                      className="text-center text-white"
                      style={styles.exampleLabel}
                      numberOfLines={2}>
                      {ex.label}
                    </ThemedText>
                  </View>
                ))}
              </ScrollView>
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={onContinueToSource}
                style={styles.ctaMain}
                accessibilityRole="button"
                accessibilityLabel="立即选择">
                <ThemedText className="text-center text-base font-medium text-white">立即选择</ThemedText>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={{ height: 8 }} />
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => void onTakePhoto()}
                style={[styles.sourceBtn, { backgroundColor: BTN_CAMERA, marginBottom: 12 }]}
                accessibilityRole="button"
                accessibilityLabel="拍照">
                <ThemedText className="text-center text-base font-medium" style={{ color: '#111111' }}>
                  拍照
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => void onPickLibrary()}
                style={[styles.sourceBtn, { backgroundColor: BTN_ALBUM }]}
                accessibilityRole="button"
                accessibilityLabel="从相册中选择">
                <ThemedText className="text-center text-base font-medium text-white">
                  从相册中选择
                </ThemedText>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.52)',
  },
  backdrop: {
    zIndex: 0,
  },
  sheet: {
    zIndex: 1,
    maxHeight: '88%',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  examplesRow: {
    flexDirection: 'row',
    gap: 10,
    paddingRight: 4,
  },
  exampleCol: {
    width: 76,
  },
  thumbWrap: {
    width: 76,
    height: 96,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#2A2A2A',
  },
  badge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exampleLabel: {
    marginTop: 8,
    fontSize: 11,
    lineHeight: 15,
  },
  ctaMain: {
    backgroundColor: CTA_PRIMARY,
    borderRadius: 28,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceBtn: {
    borderRadius: 28,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
