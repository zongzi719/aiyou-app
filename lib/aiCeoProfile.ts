/** AI CEO / 对齐率 展示用数据（记忆库页与侧边栏共用，保持视觉一致） */
export const AI_CEO_PROFILE = {
  level: 3,
  nextLevelMins: 30,
  /** 对齐率进度条宽度 0–100 */
  alignmentBarPercent: 65,
  match: 65,
  mbti: 'ENTJ',
  strengths: ['产品经验', '数据导向', '战略型思维'],
  dimensions: [
    { label: '认知模型', value: 70 },
    { label: '语言风格', value: 76 },
    { label: '决策逻辑', value: 69 },
    { label: '战略方法', value: 85 },
  ],
  insight:
    '以提高组织执行力。我会优先考虑核心岗位的能力匹配和关键流程的效率。我比较关注跨部门协作与信息共享，以保证战略目标能够顺利落实。',
} as const;
