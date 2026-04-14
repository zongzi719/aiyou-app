import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'luna_private_chat_model_name';

const DEFAULT_MODEL =
  process.env.EXPO_PUBLIC_PRIVATE_CHAT_MODEL_OPENAI?.trim() ||
  process.env.EXPO_PUBLIC_PRIVATE_CHAT_MODEL_CLAUDE?.trim() ||
  process.env.EXPO_PUBLIC_PRIVATE_CHAT_MODEL_GEMINI?.trim() ||
  'doubao-seed-2.0-mini';

/** 读取上次选择的模型名（model_name），默认 DEFAULT_MODEL */
export async function getSelectedModelName(): Promise<string> {
  const v = await AsyncStorage.getItem(KEY);
  return v?.trim() || DEFAULT_MODEL;
}

/** 保存选择的模型名 */
export async function setSelectedModelName(modelName: string): Promise<void> {
  await AsyncStorage.setItem(KEY, modelName.trim() || DEFAULT_MODEL);
}

// ── 向下兼容旧接口 ──────────────────────────────────────────────────────────

const LEGACY_KEY = 'luna_private_chat_ui_model';

/** @deprecated 使用 getSelectedModelName() */
export async function getPrivateChatUiModelLabel(): Promise<string> {
  // 优先读新 key，否则回退到旧 key 做一次迁移
  const newVal = await AsyncStorage.getItem(KEY);
  if (newVal?.trim()) return newVal.trim();
  const legacyVal = await AsyncStorage.getItem(LEGACY_KEY);
  return legacyVal?.trim() || DEFAULT_MODEL;
}

/** @deprecated 使用 setSelectedModelName() */
export async function setPrivateChatUiModelLabel(label: string): Promise<void> {
  await setSelectedModelName(label);
}

/** @deprecated 模型名现在直接来自 API，不再需要映射 */
export function modelNameFromUiLabel(label: string): string {
  return label.trim() || DEFAULT_MODEL;
}
