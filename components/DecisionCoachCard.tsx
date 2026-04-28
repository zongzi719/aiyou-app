import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  View,
  type ImageSourcePropType,
} from 'react-native';
import Markdown from 'react-native-markdown-display';

import Icon from '@/components/Icon';
import StarFloatingLoader from '@/components/StarFloatingLoader';
import ThemedText from '@/components/ThemedText';
import { useThemeColors } from '@/app/contexts/ThemeColors';
import { shadowPresets } from '@/utils/useShadow';

const decisionCoachSectionMarkdownStyles = StyleSheet.create({
  body: {
    color: '#B5B5B5',
    fontSize: 15,
    lineHeight: 21,
  },
  paragraph: {
    marginTop: 0,
    marginBottom: 0,
    marginVertical: 2,
  },
  strong: {
    color: '#B5B5B5',
    fontWeight: '700',
  },
  em: {
    color: '#B5B5B5',
    fontStyle: 'italic',
  },
  bullet_list: {
    marginVertical: 4,
    marginLeft: 0,
    paddingLeft: 0,
  },
  ordered_list: {
    marginVertical: 4,
  },
  list_item: {
    marginVertical: 2,
    marginLeft: 0,
    paddingLeft: 0,
  },
  bullet_list_content: {
    marginLeft: 0,
    paddingLeft: 0,
  },
  bullet_list_icon: {
    marginRight: 8,
  },
  link: {
    color: '#B5B5B5',
    textDecorationLine: 'underline',
  },
  code_inline: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    color: '#B5B5B5',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
  },
  code_block: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    color: '#B5B5B5',
    padding: 8,
    borderRadius: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    marginVertical: 4,
  },
  fence: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    color: '#B5B5B5',
    padding: 8,
    borderRadius: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    marginVertical: 4,
  },
  heading1: {
    color: '#B5B5B5',
    fontSize: 17,
    fontWeight: '700',
    marginVertical: 4,
  },
  heading2: {
    color: '#B5B5B5',
    fontSize: 16,
    fontWeight: '700',
    marginVertical: 4,
  },
  heading3: {
    color: '#B5B5B5',
    fontSize: 15,
    fontWeight: '600',
    marginVertical: 4,
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: 'rgba(255,255,255,0.35)',
    paddingLeft: 10,
    marginVertical: 6,
  },
});

const DECISION_SECTION_ICON_CONFIG = {
  decisionAdvice: {
    source: require('@/assets/images/decision-coach-icons/decision-advice.png') as ImageSourcePropType,
  },
  keyQuestions: {
    source: require('@/assets/images/decision-coach-icons/key-question.png') as ImageSourcePropType,
  },
  riskWarnings: {
    source: require('@/assets/images/decision-coach-icons/risk-warning.png') as ImageSourcePropType,
  },
} as const;

export type DecisionCoachCardModel = {
  coachId: string;
  coachName: string;
  coachRole: string;
  enabled: boolean;
  loading: boolean;
  decisionAdvice: string;
  keyQuestions: string;
  riskWarnings: string;
  rawText?: string;
  errorText?: string;
};

type Props = {
  model: DecisionCoachCardModel;
  onToggleEnabled: (next: boolean) => void;
  defaultExpanded?: boolean;
  showFooterActionBar?: boolean;
};

function CoachAvatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');

  return (
    <View className="h-11 w-11 items-center justify-center rounded-full bg-white/10">
      <ThemedText className="text-[15px] font-semibold text-white/90">
        {initials || 'AI'}
      </ThemedText>
    </View>
  );
}

function SectionBlock({
  title,
  iconType,
  text,
}: {
  title: string;
  iconType: keyof typeof DECISION_SECTION_ICON_CONFIG;
  text: string;
}) {
  const colors = useThemeColors();
  const iconConfig = DECISION_SECTION_ICON_CONFIG[iconType];
  const sectionMarkdownStyles = useMemo(
    () =>
      StyleSheet.create({
        ...decisionCoachSectionMarkdownStyles,
        body: {
          ...decisionCoachSectionMarkdownStyles.body,
          color: colors.text,
        },
        strong: {
          ...decisionCoachSectionMarkdownStyles.strong,
          color: colors.text,
        },
        em: {
          ...decisionCoachSectionMarkdownStyles.em,
          color: colors.text,
        },
        link: {
          ...decisionCoachSectionMarkdownStyles.link,
          color: colors.text,
        },
      }),
    [colors.text]
  );

  return (
    <View className="rounded-2xl border border-border bg-secondary px-4 py-3">
      <View className="flex-row items-center gap-2">
        <Image source={iconConfig.source} className="h-4 w-4" resizeMode="contain" />
        <ThemedText className="text-[16px] font-semibold text-primary">{title}</ThemedText>
      </View>
      <View className="mt-2">
        <Markdown
          style={sectionMarkdownStyles}
          onLinkPress={(url) => {
            Linking.openURL(url);
            return false;
          }}>
          {text.trim()}
        </Markdown>
      </View>
    </View>
  );
}

export default function DecisionCoachCard({
  model,
  onToggleEnabled,
  defaultExpanded = false,
  showFooterActionBar = false,
}: Props) {
  const colors = useThemeColors();
  const dimmed = !model.enabled;
  const [expanded, setExpanded] = useState(defaultExpanded);

  useEffect(() => {
    setExpanded(defaultExpanded);
  }, [defaultExpanded, model.coachId]);

  return (
    <View
      style={shadowPresets.card}
      className={`rounded-3xl border border-border bg-secondary px-5 py-4 ${dimmed ? 'opacity-45' : 'opacity-100'}`}>
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-3">
          <CoachAvatar name={model.coachName} />
          <View className="min-w-0">
            <ThemedText className="text-[15px] font-semibold text-primary" numberOfLines={1}>
              {model.coachName}
            </ThemedText>
            <ThemedText className="mt-0.5 text-[14px] text-subtext" numberOfLines={1}>
              {model.coachRole}
            </ThemedText>
          </View>
        </View>

        <Switch
          value={model.enabled}
          onValueChange={onToggleEnabled}
          trackColor={{ false: 'rgba(255,255,255,0.16)', true: 'rgba(255,208,65,0.45)' }}
          thumbColor={model.enabled ? '#FFD041' : 'rgba(255,255,255,0.5)'}
        />
      </View>

      <View className="mt-3">
        <Pressable
          onPress={() => setExpanded((v) => !v)}
          className="flex-row items-center justify-between rounded-xl border border-border bg-background px-3 py-2"
          accessibilityRole="button"
          accessibilityLabel={expanded ? '收起回答' : '展开回答'}>
          <ThemedText className="text-[14px] text-primary">{expanded ? '收起' : '展开'}</ThemedText>
          <Icon name={expanded ? 'ChevronUp' : 'ChevronDown'} size={14} color={colors.text} />
        </Pressable>
      </View>

      {expanded ? (
        <View className="mt-4 gap-3">
          {model.loading ? (
            <View className="gap-3">
              <View className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <StarFloatingLoader text="正在分析..." textClassName="text-white/75 text-[14px]" />
              </View>
              <View className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <StarFloatingLoader text="正在生成关键问题..." textClassName="text-white/75 text-[14px]" />
              </View>
              <View className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <StarFloatingLoader text="正在扫描风险..." textClassName="text-white/75 text-[14px]" />
              </View>
            </View>
          ) : model.errorText ? (
            <View className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <View className="flex-row items-center gap-2">
                <Icon name="TriangleAlert" size={16} color="rgba(255,255,255,0.85)" />
                <ThemedText className="text-[14px] font-semibold text-[#F5F5F5]">出错了</ThemedText>
              </View>
              <ThemedText className="mt-2 text-[13px] leading-[19px] text-[#D4D4D8]">
                {model.errorText}
              </ThemedText>
            </View>
          ) : (
            <>
              <SectionBlock
                title="决策建议"
                iconType="decisionAdvice"
                text={model.decisionAdvice.trim() || '暂无内容'}
              />
              <SectionBlock
                title="关键问题"
                iconType="keyQuestions"
                text={model.keyQuestions.trim() || '暂无内容'}
              />
              <SectionBlock
                title="风险提示"
                iconType="riskWarnings"
                text={model.riskWarnings.trim() || '暂无内容'}
              />
            </>
          )}
        </View>
      ) : null}

      {showFooterActionBar && model.rawText && !model.loading && !model.errorText ? (
        <Pressable
          onPress={() => undefined}
          className="mt-3 flex-row items-center gap-2 self-start"
          accessibilityRole="button"
          accessibilityLabel="查看原文">
          <Icon name="AlignLeft" size={14} color="rgba(255,255,255,0.6)" />
          <ThemedText className="text-white/55 text-[14px]">原文</ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}
