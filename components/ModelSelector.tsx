import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  View,
  ActivityIndicator,
  Animated,
  Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ThemedText from '@/components/ThemedText';
import Icon from '@/components/Icon';
import { fetchAvailableModels, type ModelInfo } from '@/lib/modelsApi';
import { getSelectedModelName, setSelectedModelName } from '@/lib/privateChatUiModel';

const FALLBACK_MODELS: ModelInfo[] = [
  { id: 'doubao-seed-2.0-mini', display_name: 'doubao-seed-2.0-mini' },
  { id: 'qwen-turbo', display_name: 'qwen-turbo' },
];

function shortLabel(id: string, displayName?: string): string {
  const src = displayName || id;
  return src.length > 20 ? src.slice(0, 18) + '…' : src;
}

type Props = {
  /** 当模型改变时回调（可选） */
  onModelChange?: (modelName: string) => void;
};

const ModelSelector = ({ onModelChange }: Props) => {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState('');
  const slideAnim = useRef(new Animated.Value(300)).current;

  // 初始化：读取上次选择的模型
  useEffect(() => {
    getSelectedModelName().then(setSelected);
  }, []);

  const openPicker = async () => {
    setVisible(true);
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    if (models.length === 0) {
      setLoading(true);
      const fetched = await fetchAvailableModels();
      setModels(fetched.length > 0 ? fetched : FALLBACK_MODELS);
      setLoading(false);
    }
  };

  const closePicker = () => {
    Animated.timing(slideAnim, {
      toValue: 300,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => setVisible(false));
  };

  const handleSelect = async (model: ModelInfo) => {
    setSelected(model.id);
    await setSelectedModelName(model.id);
    onModelChange?.(model.id);
    closePicker();
  };

  return (
    <>
      {/* Header 按钮 */}
      <Pressable
        onPress={openPicker}
        className="flex-row items-center gap-1 rounded-full border border-white/30 bg-black/25 px-3 py-1.5"
      >
        <ThemedText className="text-xs font-medium text-white" numberOfLines={1}>
          {shortLabel(selected)}
        </ThemedText>
        <Icon name="ChevronDown" size={12} color="white" />
      </Pressable>

      {/* 模型选择弹层 */}
      <Modal
        visible={visible}
        transparent
        animationType="none"
        onRequestClose={closePicker}
      >
        {/* 背景遮罩 */}
        <Pressable
          className="flex-1 bg-black/50"
          onPress={closePicker}
        />

        {/* 底部卡片 */}
        <Animated.View
          style={{ transform: [{ translateY: slideAnim }] }}
          className="absolute bottom-0 left-0 right-0 rounded-t-3xl bg-neutral-900 border-t border-neutral-700"
        >
          <View style={{ paddingBottom: insets.bottom + 8 }}>
            {/* 拖动条 */}
            <View className="items-center pt-3 pb-2">
              <View className="w-10 h-1 rounded-full bg-neutral-600" />
            </View>

            <View className="px-5 pb-2 flex-row items-center justify-between">
              <ThemedText className="text-base font-semibold text-white">选择模型</ThemedText>
              <Pressable onPress={closePicker} className="p-1">
                <Icon name="X" size={18} color="#9ca3af" />
              </Pressable>
            </View>

            {loading ? (
              <View className="py-10 items-center">
                <ActivityIndicator color="#9ca3af" />
                <ThemedText className="mt-2 text-xs text-neutral-500">加载模型列表…</ThemedText>
              </View>
            ) : (
              <ScrollView
                className="max-h-80"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 4 }}
              >
                {models.map((model) => {
                  const isActive = model.id === selected;
                  return (
                    <Pressable
                      key={model.id}
                      onPress={() => handleSelect(model)}
                      className={`flex-row items-center justify-between py-3.5 px-4 mb-1 rounded-xl ${
                        isActive ? 'bg-white/10' : 'bg-neutral-800/60'
                      }`}
                    >
                      <View className="flex-1">
                        <ThemedText className="text-sm font-medium text-white">
                          {model.display_name || model.id}
                        </ThemedText>
                        {model.display_name && (
                          <ThemedText className="text-[11px] text-neutral-500 font-mono mt-0.5">
                            {model.id}
                          </ThemedText>
                        )}
                      </View>
                      {isActive && (
                        <Icon name="Check" size={16} color="#60a5fa" />
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </Animated.View>
      </Modal>
    </>
  );
};

export default ModelSelector;
