import { sendMessage, isConfigured, type AIMessage } from '@/services/ai';

export type AiRecordKind = 'schedule' | 'note' | 'chat';

export type AiRecordSchedulePayload = {
  kind: 'schedule';
  title: string;
  timeRange: string;
  todos: string[];
  actionPoints: string[];
  missingFields: string[];
};

export type AiRecordNotePayload = {
  kind: 'note';
  sectionLabel: string;
  title: string;
  timeRange: string;
  coreIdea: string;
  todos: string[];
  conclusions: string[];
};

export type AiRecordChatPayload = {
  kind: 'chat';
};

export type AiRecordPayload = AiRecordSchedulePayload | AiRecordNotePayload | AiRecordChatPayload;

function extractJsonObject(raw: string): string | null {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1].trim() : trimmed;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return body.slice(start, end + 1);
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === 'string')
    .map((s) => s.trim())
    .filter(Boolean);
}

function heuristicClassify(text: string): AiRecordPayload {
  const t = text.trim();
  const lower = t.toLowerCase();
  const scheduleHints =
    /明天|后天|今日|今天|周[一二三四五六日天]|几点|会议|开会|约会|提醒|日程|日历|预约|\d{1,2}[:：]\d{2}/.test(
      t
    );
  const questionHints =
    /^(什么|怎么|为什么|如何|能否|可以吗|吗[？?]?$|请问|谁|哪|几)/.test(t) ||
    /[？?]/.test(t) ||
    lower.includes('what ') ||
    lower.includes('how ');

  if (questionHints && !scheduleHints) {
    return { kind: 'chat' };
  }
  if (scheduleHints) {
    return {
      kind: 'schedule',
      title: t.slice(0, 40) + (t.length > 40 ? '…' : ''),
      timeRange: '待定',
      todos: [t.length > 80 ? t.slice(0, 80) + '…' : t],
      actionPoints: ['确认地点与时长'],
      missingFields: ['请补充具体日期时间或地点（若需要）'],
    };
  }
  return {
    kind: 'note',
    sectionLabel: '灵感速记',
    title: '语音记录整理',
    timeRange: '',
    coreIdea: t,
    todos: [],
    conclusions: [],
  };
}

function normalizePayload(parsed: Record<string, unknown>): AiRecordPayload {
  const kind = parsed.kind;
  if (kind === 'chat') {
    return { kind: 'chat' };
  }
  if (kind === 'schedule') {
    return {
      kind: 'schedule',
      title: typeof parsed.title === 'string' ? parsed.title : '日程事项',
      timeRange: typeof parsed.timeRange === 'string' ? parsed.timeRange : '待定',
      todos: asStringArray(parsed.todos),
      actionPoints: asStringArray(parsed.actionPoints),
      missingFields: asStringArray(parsed.missingFields),
    };
  }
  if (kind === 'note') {
    return {
      kind: 'note',
      sectionLabel: typeof parsed.sectionLabel === 'string' ? parsed.sectionLabel : '灵感笔记',
      title: typeof parsed.title === 'string' ? parsed.title : '笔记',
      timeRange: typeof parsed.timeRange === 'string' ? parsed.timeRange : '',
      coreIdea: typeof parsed.coreIdea === 'string' ? parsed.coreIdea : '',
      todos: asStringArray(parsed.todos),
      conclusions: asStringArray(parsed.conclusions),
    };
  }
  return heuristicClassify(JSON.stringify(parsed));
}

/**
 * 分析用户一句话：日程 / 灵感笔记 / 普通对话（跳转私聊）。
 */
export async function analyzeAiRecordInput(userText: string): Promise<AiRecordPayload> {
  const text = userText.trim();
  if (!text) {
    return { kind: 'chat' };
  }

  if (!isConfigured()) {
    return heuristicClassify(text);
  }

  const system = `你是「AI 记录」分类与结构化助手。用户输入来自语音或键盘，可能混杂多种意图。
你必须只输出一段合法 JSON（不要 markdown、不要解释），格式严格如下之一：

1) 日程 schedule：用户要安排、提醒、会议、约会等（含相对时间也算日程）
{"kind":"schedule","title":"string","timeRange":"string","todos":["…"],"actionPoints":["…"],"missingFields":["…"]}
若时间/地点等信息不足，missingFields 列出需用户补充的项（简短中文）。

2) 灵感笔记 note：想法、纪要要点、头脑风暴、待整理的材料（非直接问答）
{"kind":"note","sectionLabel":"string如灵感速记或会议纪要","title":"string","timeRange":"string可空","coreIdea":"string一段","todos":["…"],"conclusions":["…"]}

3) 普通对话 chat：用户在提问、闲聊、求解释、百科式问题，更适合进聊天窗口
{"kind":"chat"}

判断规则：明显问句且不是要记日程 → chat；要记在日历/提醒 → schedule；其余偏记录与整理 → note。`;

  const messages: AIMessage[] = [{ role: 'user', content: `${system}\n\n用户输入：\n${text}` }];

  try {
    const raw = await sendMessage(messages);
    const jsonStr = extractJsonObject(raw);
    if (!jsonStr) {
      return heuristicClassify(text);
    }
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    return normalizePayload(parsed);
  } catch {
    return heuristicClassify(text);
  }
}
