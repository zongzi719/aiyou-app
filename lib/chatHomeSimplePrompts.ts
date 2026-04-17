import type { IconName } from '@/components/Icon';

import type { ChatHomeSuggestion } from '@/lib/memorySuggestedPrompts';

/** 每类题库长度；「换一批」前 N 次使用不同下标，保证 N 轮内不重样 */
export const CHAT_HOME_SIMPLE_ROUNDS = 20;

type SimpleCategoryKey = '商业' | '日常' | '日期/天气' | '时政';

const CATEGORY_ORDER: { label: SimpleCategoryKey; icon: IconName }[] = [
  { label: '商业', icon: 'Zap' },
  { label: '日常', icon: 'Cookie' },
  { label: '日期/天气', icon: 'Calendar' },
  { label: '时政', icon: 'Globe' },
];

/** 每类 20 条，每条不超过 12 个汉字 */
const POOLS: Record<SimpleCategoryKey, readonly string[]> = {
  商业: [
    '今天适合买基金吗',
    '副业做什么挣钱',
    '怎么节省个税',
    '小公司如何获客',
    '面试怎么谈薪资',
    '存款还是理财好',
    '电商选品注意啥',
    '创业先要啥准备',
    '如何做月度预算',
    '员工激励怎么搞',
    '合同要看哪些点',
    '商标注册麻烦吗',
    '外贸收款安全吗',
    '自媒体如何起号',
    '定价太高怎么办',
    '怎样做用户调研',
    '如何写商业计划',
    '竞品分析怎么做',
    '天使轮怎么找钱',
    '信用卡怎养额度',
  ],
  日常: [
    '今晚吃什么好呢',
    '早睡有什么好招',
    '喝水每天喝多少',
    '家务怎么分工好',
    '通勤书单推荐下',
    '快递丢了怎么办',
    '租房要注意什么',
    '猫咪挑食怎么办',
    '周末短途去哪玩',
    '咖啡每天喝几杯',
    '垃圾分类怎么分',
    '怎么拒绝不伤脸',
    '失眠了快速入睡',
    '微波炉能热什么',
    '新家除甲醛方法',
    '买菜怎么更新鲜',
    '散步每天走多久',
    '护腰有什么好招',
    '早餐吃啥更健康',
    '雨天心情低落呀',
  ],
  '日期/天气': [
    '今天农历几号呀',
    '本周有节假日吗',
    '明天会下雨吗',
    '黄梅天几时结束',
    '台风来了怎么办',
    '今天适合晒被吗',
    '冬至一般是哪天',
    '紫外线强怎么防',
    '空气质量咋判断',
    '出门要带伞吗',
    '本周五几月几号',
    '寒潮要注意什么',
    '闰年怎么算出来',
    '夏天防中暑要点',
    '秋天干燥喝什么',
    '冬天护肤小诀窍',
    '现在几点钟了呀',
    '本周还有几天班',
    '农历生日怎么算',
    '今天大概几点日出',
  ],
  时政: [
    '两会一般在几月',
    '碳中和什么意思',
    '养老金上调了吗',
    '医保报销怎么看',
    '乡村振兴指什么',
    '数字经济是什么',
    '一带一路指什么',
    '地方债风险大吗',
    '延迟退休怎么算',
    '美联储降息影响',
    '央行降准啥意思',
    '人民币汇率近况',
    '中欧班列做什么',
    '长三角是指哪里',
    '自贸片区干什么的',
    '进博会在哪举办',
    '载人航天新进展',
    '芯片国产化近况',
    '个税专项扣除啥',
    '新质生产力是啥',
  ],
};

function assertPools(): void {
  for (const { label } of CATEGORY_ORDER) {
    const pool = POOLS[label];
    if (pool.length < CHAT_HOME_SIMPLE_ROUNDS) {
      throw new Error(`chatHomeSimplePrompts: 「${label}」题库不足 ${CHAT_HOME_SIMPLE_ROUNDS} 条`);
    }
    for (const line of pool) {
      if ([...line].length > 12) {
        throw new Error(`chatHomeSimplePrompts: 超过 12 字 — ${label}: ${line}`);
      }
    }
  }
}

assertPools();

/**
 * 返回一批 4 条：商业、日常、日期/天气、时政各 1 条（同一下标，保证一轮内四类各不重复上一条）。
 */
export function buildSimpleHomeSuggestionBatch(batchIndex: number): ChatHomeSuggestion[] {
  const i = batchIndex % CHAT_HOME_SIMPLE_ROUNDS;
  return CATEGORY_ORDER.map(({ label, icon }) => ({
    prompt: POOLS[label][i]!,
    icon,
    categoryLabel: label,
  }));
}
