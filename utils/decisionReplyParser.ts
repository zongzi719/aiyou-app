export type DecisionReplySections = {
  decisionAdvice: string;
  keyQuestions: string;
  riskWarnings: string;
};

function normalizeHeading(s: string): string {
  return s
    .replace(/\r/g, '')
    .replace(/[【】]/g, '')
    .replace(
      /^((第[一二三四五六七八九十0-9]+[点章节部分]|[一二三四五六七八九十0-9]+)\s*[、.\-:：）)]\s*)+/i,
      ''
    )
    .replace(/[：:]\s*$/g, '')
    .trim()
    .toLowerCase();
}

function findSectionIndex(lines: string[], headingMatchers: RegExp[]): number {
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i] ?? '';
    const line = raw.trim();
    if (!line) continue;
    const normalized = normalizeHeading(line.replace(/^#+\s*/, ''));
    if (headingMatchers.some((re) => re.test(normalized))) return i;
  }
  return -1;
}

function sliceBetween(lines: string[], startIdx: number, endIdx: number): string {
  const start = Math.max(0, startIdx);
  const end = endIdx <= 0 ? lines.length : Math.min(lines.length, endIdx);
  return lines.slice(start, end).join('\n').trim();
}

export function parseDecisionReplySections(rawText: string): DecisionReplySections {
  const text = (rawText ?? '').trim();
  if (!text) {
    return { decisionAdvice: '', keyQuestions: '', riskWarnings: '' };
  }

  const lines = text.replace(/\r/g, '').split('\n');

  const adviceIdx = findSectionIndex(lines, [/^决策建议$/, /^建议$/, /^结论$/, /^推荐$/]);
  const questionsIdx = findSectionIndex(lines, [/^关键问题$/, /^问题$/, /^追问$/, /^需要思考$/]);
  const riskIdx = findSectionIndex(lines, [/^风险提示$/, /^风险$/, /^注意事项$/, /^潜在风险$/]);

  const indices = [
    { key: 'advice', idx: adviceIdx },
    { key: 'questions', idx: questionsIdx },
    { key: 'risk', idx: riskIdx },
  ]
    .filter((x) => x.idx >= 0)
    .sort((a, b) => a.idx - b.idx);

  // 没有任何可识别标题：全部归入“决策建议”
  if (indices.length === 0) {
    return { decisionAdvice: text, keyQuestions: '', riskWarnings: '' };
  }

  const getNextIdx = (idx: number) => {
    const next = indices.find((x) => x.idx > idx);
    return next ? next.idx : lines.length;
  };

  let decisionAdvice = '';
  let keyQuestions = '';
  let riskWarnings = '';

  if (adviceIdx >= 0) {
    decisionAdvice = sliceBetween(lines, adviceIdx + 1, getNextIdx(adviceIdx));
  }
  if (questionsIdx >= 0) {
    keyQuestions = sliceBetween(lines, questionsIdx + 1, getNextIdx(questionsIdx));
  }
  if (riskIdx >= 0) {
    riskWarnings = sliceBetween(lines, riskIdx + 1, getNextIdx(riskIdx));
  }

  // 兜底：有标题但内容被写在同一行（如“决策建议：xxx”）
  const inlineMatchers: { idx: number; set: (v: string) => void; re: RegExp }[] = [
    {
      idx: adviceIdx,
      set: (v) => {
        if (!decisionAdvice) decisionAdvice = v;
      },
      re: /(决策建议|建议|结论|推荐)\s*[：:]\s*(.+)$/i,
    },
    {
      idx: questionsIdx,
      set: (v) => {
        if (!keyQuestions) keyQuestions = v;
      },
      re: /(关键问题|问题|追问|需要思考)\s*[：:]\s*(.+)$/i,
    },
    {
      idx: riskIdx,
      set: (v) => {
        if (!riskWarnings) riskWarnings = v;
      },
      re: /(风险提示|风险|注意事项|潜在风险)\s*[：:]\s*(.+)$/i,
    },
  ];

  for (const m of inlineMatchers) {
    if (m.idx < 0) continue;
    const line = (lines[m.idx] ?? '').trim().replace(/^#+\s*/, '');
    const hit = line.match(m.re);
    if (hit && hit[2]) m.set(hit[2].trim());
  }

  const allEmpty = !decisionAdvice && !keyQuestions && !riskWarnings;
  if (allEmpty) {
    return { decisionAdvice: text, keyQuestions: '', riskWarnings: '' };
  }

  // 保证至少有“决策建议”
  if (!decisionAdvice) {
    const leftover = text;
    decisionAdvice = leftover;
  }

  return { decisionAdvice, keyQuestions, riskWarnings };
}
