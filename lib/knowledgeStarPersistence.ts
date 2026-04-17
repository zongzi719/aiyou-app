import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'kb_conversation_star_assistant_v1';

export async function loadKnowledgeStarredAssistantIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === 'string' && x.length > 0));
  } catch {
    return new Set();
  }
}

export async function addKnowledgeStarredAssistantId(id: string): Promise<void> {
  const cur = await loadKnowledgeStarredAssistantIds();
  if (cur.has(id)) return;
  cur.add(id);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...cur]));
}
