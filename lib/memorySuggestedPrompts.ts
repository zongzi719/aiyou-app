import type { IconName } from '@/components/Icon';
import type { UserMemory } from '@/services/memoryApi';
import {
  getCategoryIcon,
  resolveMemoryTime,
  translateCategory,
} from '@/services/memoryApi';

export interface ChatHomeSuggestion {
  prompt: string;
  icon: IconName;
}

/** 无记忆或接口失败时的中文常见问题（与记忆衍生问题合并为总池） */
export const DEFAULT_CHAT_HOME_SUGGESTIONS: ChatHomeSuggestion[] = [
  { prompt: '帮我列一份今天的高效待办清单，并按优先级排序。', icon: 'ClipboardList' },
  { prompt: '用简单的步骤教我一道家常菜做法。', icon: 'Cookie' },
  { prompt: '我想入门一个新技能，请给我一周学习计划。', icon: 'Sparkles' },
  { prompt: '帮我把一个复杂问题拆成可执行的小步骤。', icon: 'Calendar' },
  { prompt: '用通俗语言解释一个专业概念，并举生活里的例子。', icon: 'BookOpen' },
  { prompt: '根据我的目标，给一份本周可坚持的健康小习惯清单。', icon: 'Heart' },
  { prompt: '帮我写一段简洁、礼貌的中文工作沟通模板。', icon: 'MessageCircle' },
  { prompt: '我面临一个选择，请用利弊清单帮我理清思路。', icon: 'Brain' },
  { prompt: '给我一份短途周末放松安排，不要太累。', icon: 'Sun' },
  { prompt: '用要点总结「如何高效阅读一篇文章」的方法。', icon: 'FileText' },
  { prompt: '帮我头脑风暴：围绕一个主题列出 10 个创意点子。', icon: 'Zap' },
  { prompt: '请用「总—分—总」结构帮我组织一次简短发言稿。', icon: 'User' },
];

const MEMORY_TEMPLATES: Array<(categoryZh: string, short: string) => string> = [
  (cat, short) =>
    `关于「${cat}」的最新记忆「${short}」，请给我可执行的下一步建议。`,
  (cat, short) =>
    `请围绕记忆中这点「${short}」展开：我还能问哪些跟进问题？`,
  (cat, short) =>
    `把我记忆里「${cat}」相关的「${short}」整理成简短要点清单。`,
];

function excerptFromMemory(content: string, maxLen: number): string {
  const oneLine = content.trim().replace(/\s+/g, ' ');
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen - 1)}…`;
}

/**
 * 按更新时间取最新若干条记忆，生成中文追问（与分类、摘要相关）。
 */
export function buildMemorySuggestedPrompts(memories: UserMemory[]): ChatHomeSuggestion[] {
  const sorted = [...memories].sort((a, b) => {
    const ta = resolveMemoryTime(a) ? new Date(resolveMemoryTime(a)!).getTime() : 0;
    const tb = resolveMemoryTime(b) ? new Date(resolveMemoryTime(b)!).getTime() : 0;
    return tb - ta;
  });

  const out: ChatHomeSuggestion[] = [];
  const seen = new Set<string>();
  const cap = 10;

  for (let i = 0; i < sorted.length && out.length < cap; i++) {
    const m = sorted[i];
    const raw = m.content?.trim() ?? '';
    if (!raw) continue;

    const short = excerptFromMemory(raw, 42);
    const cat = translateCategory(m.category);
    const tpl = MEMORY_TEMPLATES[i % MEMORY_TEMPLATES.length];
    const prompt = tpl(cat, short);
    if (seen.has(prompt)) continue;
    seen.add(prompt);
    out.push({
      prompt,
      icon: getCategoryIcon(m.category) as IconName,
    });
  }

  return out;
}

/** 记忆衍生问题在前，默认问题去重补全，保证池子足够轮换 */
export function mergeChatHomeSuggestionPools(
  fromMemory: ChatHomeSuggestion[],
  defaults: ChatHomeSuggestion[] = DEFAULT_CHAT_HOME_SUGGESTIONS,
): ChatHomeSuggestion[] {
  const seen = new Set<string>();
  const out: ChatHomeSuggestion[] = [];

  const push = (x: ChatHomeSuggestion) => {
    const k = x.prompt.trim();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(x);
  };

  for (const x of fromMemory) push(x);
  for (const x of defaults) push(x);

  return out.length > 0 ? out : [...defaults];
}

/** 从总池中按批次取 4 条（循环），用于「换一批」 */
export function sliceChatHomeSuggestionBatch(
  items: ChatHomeSuggestion[],
  batchIndex: number,
  batchSize = 4,
): ChatHomeSuggestion[] {
  if (items.length === 0) return [];
  const n = items.length;
  const start = (batchIndex * batchSize) % n;
  const batch: ChatHomeSuggestion[] = [];
  for (let i = 0; i < batchSize; i++) {
    batch.push(items[(start + i) % n]);
  }
  return batch;
}
