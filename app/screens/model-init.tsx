import AsyncStorage from '@react-native-async-storage/async-storage';
import MaskedView from '@react-native-masked-view/masked-view';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  TouchableOpacity,
  ScrollView,
  Image,
  ImageBackground,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  ActivityIndicator,
  useWindowDimensions,
  PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AvatarDoneOrbitAvatar from '@/components/AvatarDoneOrbitAvatar';
import AvatarLoadingParticleRing from '@/components/AvatarLoadingParticleRing';
import Icon from '@/components/Icon';
import ModelInitImageHeroCluster from '@/components/ModelInitImageHeroCluster';
import PortraitPickGuideSheets from '@/components/PortraitPickGuideSheets';
import StarFloatingLoader from '@/components/StarFloatingLoader';
import ThemedText from '@/components/ThemedText';
import { useRecording } from '@/hooks/useRecording';
import { peekProfileCache, putProfileCache } from '@/lib/profileCache';
import { cloneAliyunVoiceFromLocalRecording } from '@/lib/registerAliyunClonedVoice';
import { queryImageJob, submitImageJob } from '@/lib/tencentMaasImageApi';
import {
  clearVoiceCloneTrainingTextCache,
  createVoiceCloneTaskFromRecording,
  fetchVoiceCloneTrainingText,
  getVoiceCloneStatusLabel,
  queryVoiceCloneTask,
  VoiceCloneDetectError,
  waitForVoiceCloneResult,
} from '@/lib/tencentMaasVoiceApi';
import { getVoiceCloneProvider } from '@/lib/voiceCloneProvider';
import { peekMemoryMemories, putMemoryMemories } from '@/lib/listDataCache';
import { memoryApi } from '@/services/memoryApi';
import { bustAvatarCache, fetchProfile, updateProfile, uploadAvatar } from '@/services/profileApi';

const voiceCloneProvider = getVoiceCloneProvider();

const ACCENT = '#D4A017';
const ACCENT_SOFT = '#F5DCA8';
const CARD_BG = 'rgba(8, 26, 51, 0.92)';
const MAX_VOICE_RECORD_SECONDS = 10;
const LAST_VOICE_CLONE_TASK_ID_KEY = 'luna:last_voice_clone_task_id';
const VOICE_CLONE_SYNC_TIMEOUT_MS = 600_000;
const VOICE_CLONE_RECOVER_TIMEOUT_MS = 90_000;

/**
 * UI 调试：在模型初始化各步之间左右滑切换界面（不调业务步骤）。
 * 上线或做完视觉后请改为 false。
 */
const MODEL_INIT_UI_SWIPE_BETWEEN_STEPS = true;

const MODEL_INIT_HOME_BG = require('@/assets/images/backgrounds/model-init-home-bg.png');
const MODEL_INIT_INTERVIEW_BG = require('@/assets/images/backgrounds/model-init-interview-bg.jpg');
const MODEL_INIT_IMAGE_BG = require('@/assets/images/backgrounds/model-init-image-bg.jpg');
/** 生成数字形象加载页全屏背景（由设计 PNG 转 JPEG 压缩） */
const MODEL_INIT_AVATAR_LOADING_SCREEN_BG = require('@/assets/images/backgrounds/model-init-avatar-loading-screen.jpg');
/** 生成数字形象完成页全屏背景（由设计 PNG 转 JPEG 压缩） */
const MODEL_INIT_AVATAR_DONE_SCREEN_BG = require('@/assets/images/backgrounds/model-init-avatar-done-screen.jpg');
/** 声音采集全屏背景（由设计稿导出，JPEG 压缩） */
const MODEL_INIT_VOICE_SCREEN_BG = require('@/assets/images/backgrounds/model-init-voice-screen-bg.jpg');
/** Figma Group 491 光效（intro 正中） */
const MODEL_INIT_INTRO_GLOW = require('@/assets/images/model-init-intro-glow.png');
const VOICE_MIC_PAUSE_IMG = require('@/assets/images/model-init-voice/voice-mic-pause.png');
const VOICE_MIC_SPEAK_IMG = require('@/assets/images/model-init-voice/voice-mic-speak.png');

/** 构建模型首页 Figma 402 宽画板比例 */
const MODEL_INIT_INTRO_FRAME = { w: 402, h: 874 } as const;
const MODEL_INIT_INTRO_GLOW_BOX = { w: 352, h: 400 } as const;
/** 图像采集页 Group 491 光效框（467×321，left -30 / top 222） */
const MODEL_INIT_IMAGE_GLOW_BOX = { w: 467, h: 321 } as const;
const MODEL_INIT_IMAGE_GLOW_LEFT = -30 / MODEL_INIT_INTRO_FRAME.w;
const MODEL_INIT_IMAGE_GLOW_TOP = 222 / MODEL_INIT_INTRO_FRAME.h;

/** Figma「声音采集2」垂直尺寸（画板 402×874）按屏高等比 */
function voiceStepY(px: number, layoutH: number) {
  return Math.round((px * layoutH) / MODEL_INIT_INTRO_FRAME.h);
}

const VOICE_SCRIPT = `“Hello，我来了。

只要我持续完善我的分身，它就会越来越像我。
这一段声音，就是另一个我的起点。

我的声音里，藏着我的思考方式、我的判断习惯、我的表达节奏。

录下来，它就能学会。

以后，它就能替我思考，替我推演，替我看见我看不见的东西。”`;

type Phase =
  | 'intro'
  | 'voice'
  | 'image'
  | 'avatarLoading'
  | 'avatarDone'
  | 'interviewPreamble'
  | 'interview'
  | 'complete';

/** 左右滑切换顺序（与产品流程一致） */
const MODEL_INIT_PHASE_SWIPE_ORDER: Phase[] = [
  'intro',
  'voice',
  'image',
  'avatarLoading',
  'avatarDone',
  'interviewPreamble',
  'interview',
  'complete',
];

function formatTimer(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')} : ${String(s).padStart(2, '0')}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function compressForAvatarUpload(inputUri: string): Promise<string> {
  try {
    const result = await ImageManipulator.manipulateAsync(
      inputUri,
      [
        {
          resize: {
            width: 768,
          },
        },
      ],
      {
        compress: 0.82,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );
    return result.uri;
  } catch {
    return inputUri;
  }
}

async function buildAvatarUploadCandidates(inputUri: string): Promise<string[]> {
  const presets: { width: number; compress: number }[] = [
    { width: 768, compress: 0.82 },
    { width: 640, compress: 0.72 },
    { width: 512, compress: 0.62 },
  ];
  const candidates: string[] = [];

  for (const preset of presets) {
    try {
      const result = await ImageManipulator.manipulateAsync(
        inputUri,
        [{ resize: { width: preset.width } }],
        { compress: preset.compress, format: ImageManipulator.SaveFormat.JPEG }
      );
      if (result.uri && !candidates.includes(result.uri)) {
        candidates.push(result.uri);
      }
    } catch {
      // 忽略该档失败，继续下一档压缩
    }
  }

  const fallback = await compressForAvatarUpload(inputUri);
  if (fallback && !candidates.includes(fallback)) {
    candidates.push(fallback);
  }
  if (!candidates.includes(inputUri)) {
    candidates.push(inputUri);
  }
  return candidates;
}

function parseStatusCodeFromErrorMessage(message: string): number | null {
  const matched = message.match(/\((\d{3})\)/);
  if (!matched) return null;
  const status = Number(matched[1]);
  return Number.isFinite(status) ? status : null;
}

function canRetryAvatarUpload(errorMessage: string): boolean {
  const normalized = errorMessage.toLowerCase();
  const status = parseStatusCodeFromErrorMessage(errorMessage);
  if (status !== null) {
    if (status >= 500) return true;
    return status === 408 || status === 413 || status === 415 || status === 429;
  }
  return normalized.includes('network request failed') || normalized.includes('timeout');
}

async function uploadAvatarWithRetry(
  inputUri: string,
  options?: {
    onAttemptStart?: (attempt: number, total: number) => void;
  }
): Promise<Awaited<ReturnType<typeof uploadAvatar>>> {
  const candidates = await buildAvatarUploadCandidates(inputUri);
  let lastError: unknown = null;

  for (let i = 0; i < candidates.length; i += 1) {
    const attempt = i + 1;
    options?.onAttemptStart?.(attempt, candidates.length);
    try {
      return await uploadAvatar(candidates[i], 'image/jpeg');
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!canRetryAvatarUpload(message) || i === candidates.length - 1) {
        throw error;
      }
      await sleep(500);
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error('头像上传失败，请稍后重试。');
}

function StepProgress({ filledSegments }: { filledSegments: number }) {
  return (
    <View className="mt-3 flex-row gap-1.5 px-1">
      {[0, 1, 2, 3].map((i) => (
        <View
          key={i}
          className="h-1.5 flex-1 rounded-full"
          style={{ backgroundColor: i < filledSegments ? ACCENT : 'rgba(255,255,255,0.12)' }}
        />
      ))}
    </View>
  );
}

function GoldButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={disabled}
      onPress={onPress}
      className="w-full overflow-hidden rounded-2xl py-3.5">
      <LinearGradient
        colors={['#E8C27A', '#B98C44', '#8A6428']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: 16 }]}
      />
      <ThemedText className="text-center text-base font-bold text-white">{label}</ThemedText>
    </TouchableOpacity>
  );
}

/** 图像采集主 CTA：338×56、圆角 30、金渐变、黑字（与 Intro「开始」同款样式） */
function ImageStepPrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      disabled={disabled}
      onPress={onPress}
      className="w-full overflow-hidden"
      style={{ height: 56, borderRadius: 30 }}>
      <LinearGradient
        colors={['#B3975C', '#A87F2A']}
        start={{ x: 0.05, y: 0.5 }}
        end={{ x: 0.95, y: 0.5 }}
        style={[StyleSheet.absoluteFill, { borderRadius: 30 }]}
      />
      <View className="flex-1 items-center justify-center">
        <ThemedText className="text-base font-normal" style={{ color: '#000000' }}>
          {label}
        </ThemedText>
      </View>
    </TouchableOpacity>
  );
}

/** Figma 1037:8853「开始」主按钮：高 56、圆角 30、双色金渐变 */
function IntroStartButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      className="w-full overflow-hidden"
      style={{ height: 56, borderRadius: 30 }}>
      <LinearGradient
        colors={['#B3975C', '#A87F2A']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[StyleSheet.absoluteFill, { borderRadius: 30 }]}
      />
      <View className="flex-1 items-center justify-center">
        <ThemedText className="text-base font-normal" style={{ color: '#000000' }}>
          开始
        </ThemedText>
      </View>
    </TouchableOpacity>
  );
}

function ImagePhaseGlow() {
  const { width: winW, height: winH } = useWindowDimensions();
  const boxW = Math.min((MODEL_INIT_IMAGE_GLOW_BOX.w / MODEL_INIT_INTRO_FRAME.w) * winW, winW + Math.abs(MODEL_INIT_IMAGE_GLOW_LEFT) * winW);
  const boxH = boxW * (MODEL_INIT_IMAGE_GLOW_BOX.h / MODEL_INIT_IMAGE_GLOW_BOX.w);
  const left = MODEL_INIT_IMAGE_GLOW_LEFT * winW;
  const top = MODEL_INIT_IMAGE_GLOW_TOP * winH;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left,
        top,
        width: boxW,
        height: boxH,
        zIndex: 0,
      }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Image
        source={MODEL_INIT_INTRO_GLOW}
        style={{ width: boxW, height: boxH }}
        resizeMode="contain"
      />
    </View>
  );
}

/** Figma Group 491：光效图置于屏幕正中 */
function IntroCenterGlow() {
  const { width: winW } = useWindowDimensions();
  const boxW = Math.min(
    (MODEL_INIT_INTRO_GLOW_BOX.w / MODEL_INIT_INTRO_FRAME.w) * winW,
    winW - 24
  );
  const boxH = boxW * (MODEL_INIT_INTRO_GLOW_BOX.h / MODEL_INIT_INTRO_GLOW_BOX.w);
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center' }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Image
        source={MODEL_INIT_INTRO_GLOW}
        style={{ width: boxW, height: boxH }}
        resizeMode="contain"
      />
    </View>
  );
}

/** Figma Frame 5：四段进度（20×10，gap 3）；第三段可半金半灰（加载中） */
function ModelInitStepSegments({
  filled,
  thirdSegmentPartial,
}: {
  filled: number;
  thirdSegmentPartial?: boolean;
}) {
  return (
    <View className="flex-row items-center" style={{ gap: 3 }}>
      {[0, 1, 2, 3].map((i) => {
        if (thirdSegmentPartial && i === 2 && filled >= 3) {
          return (
            <View
              key={i}
              style={{
                width: 20,
                height: 10,
                borderRadius: 5,
                overflow: 'hidden',
                flexDirection: 'row',
              }}>
              <View style={{ flex: 1, backgroundColor: '#FFAD00' }} />
              <View style={{ flex: 1, backgroundColor: '#878787' }} />
            </View>
          );
        }
        return (
          <View
            key={i}
            style={{
              width: 20,
              height: 10,
              borderRadius: 5,
              backgroundColor: i < filled ? '#FFAD00' : '#878787',
            }}
          />
        );
      })}
    </View>
  );
}

type AvatarChecklistStatus = 'done' | 'loading' | 'pending';

function avatarChecklistFromProgress(progress: number): {
  label: string;
  status: AvatarChecklistStatus;
}[] {
  const s1: AvatarChecklistStatus =
    progress >= 22 ? 'done' : progress > 0 ? 'loading' : 'pending';
  const s2: AvatarChecklistStatus =
    progress >= 88 ? 'done' : progress >= 22 ? 'loading' : 'pending';
  const s3: AvatarChecklistStatus =
    progress >= 100 ? 'done' : progress >= 88 ? 'loading' : 'pending';
  return [
    { label: '面部特征分析', status: s1 },
    { label: '生成虚拟形象身份', status: s2 },
    { label: '优化视觉风格', status: s3 },
  ];
}

function AvatarLoadingChecklistRow({
  label,
  status,
}: {
  label: string;
  status: AvatarChecklistStatus;
}) {
  return (
    <View className="flex-row items-center" style={{ gap: 12 }}>
      <View className="items-center justify-center" style={{ width: 20, height: 20 }}>
        {status === 'done' ? (
          <View
            className="items-center justify-center rounded-full"
            style={{ width: 20, height: 20, backgroundColor: '#FFAD00' }}>
            <Icon name="Check" size={12} color="#FFFFFF" strokeWidth={2.5} />
          </View>
        ) : status === 'loading' ? (
          <View
            className="items-center justify-center rounded-full"
            style={{ width: 20, height: 20, borderWidth: 1.67, borderColor: '#BABABA' }}>
            <ActivityIndicator size="small" color="#BABABA" />
          </View>
        ) : (
          <View
            className="rounded-full"
            style={{
              width: 18,
              height: 18,
              borderWidth: 1.6,
              borderColor: '#BABABA',
            }}
          />
        )}
      </View>
      <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, color: '#BABABA' }}>{label}</Text>
    </View>
  );
}

/** Figma Group 379「AIYOU」：细字重 + 金渐变 */
function IntroBrandMark() {
  return (
    <MaskedView className="self-start" maskElement={<BrandMarkMask />}>
      <LinearGradient
        colors={['#FFF6E0', '#E8C27A', '#B98C44']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        className="py-0.5">
        <Text className="text-[28px] font-light tracking-[0.16em] text-white opacity-0">AIYOU</Text>
      </LinearGradient>
    </MaskedView>
  );
}

function BrandMarkMask() {
  return (
    <Text
      className="text-[28px] font-light tracking-[0.2em] text-white"
      style={{ fontWeight: '300' }}>
      AIYOU
    </Text>
  );
}

function phaseToFilledSegments(phase: Phase): number {
  switch (phase) {
    case 'intro':
      return 0;
    case 'voice':
      return 1;
    case 'image':
      return 2;
    case 'avatarLoading':
    case 'avatarDone':
      return 3;
    case 'interviewPreamble':
    case 'interview':
    case 'complete':
      return 4;
    default:
      return 0;
  }
}

function isAliyunOssEnvMissing(message: string): boolean {
  return (
    message.includes('EXPO_PUBLIC_ALIYUN_OSS_ACCESS_KEY_ID') ||
    message.includes('EXPO_PUBLIC_ALIYUN_OSS_ACCESS_KEY_SECRET') ||
    message.includes('EXPO_PUBLIC_ALIYUN_OSS_BUCKET')
  );
}

function phaseTitle(phase: Phase): { n: string; label: string } | null {
  switch (phase) {
    case 'voice':
      return { n: '1', label: '声音采集' };
    case 'image':
      return { n: '2', label: '图像采集' };
    case 'avatarLoading':
    case 'avatarDone':
      return { n: '3', label: '生成数字形象' };
    case 'interviewPreamble':
    case 'interview':
      return { n: '4', label: '深度访谈' };
    case 'complete':
      return { n: '4', label: 'AI解析完成' };
    default:
      return null;
  }
}

type ChatRow =
  | { id: string; kind: 'ai'; text: string }
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'loading'; text: string }
  | { id: string; kind: 'memory'; title: string; tag: string; body: string };

/** 与 MemoryTuneModal 一致：写入后端并更新本地记忆列表缓存，便于「用户记忆」页立即展示 */
async function persistOnboardingInterviewFact(content: string, category: string): Promise<void> {
  const created = await memoryApi.addMemoryFact({
    content,
    category,
    confidence: 0.86,
  });
  if (created) {
    const current = peekMemoryMemories() ?? [];
    const next = [created, ...current.filter((m) => m.id !== created.id)];
    putMemoryMemories(next);
  }
}

export default function ModelInitScreen() {
  const { postLogin } = useLocalSearchParams<{ postLogin?: string }>();
  const isPostLoginOnboarding = postLogin === '1';
  const insets = useSafeAreaInsets();
  const { width: layoutW, height: layoutH } = useWindowDimensions();
  const [phase, setPhase] = useState<Phase>('intro');
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [voiceSubmitting, setVoiceSubmitting] = useState(false);
  const [voiceStatusText, setVoiceStatusText] = useState('');
  const [hasExistingVoiceId, setHasExistingVoiceId] = useState(false);
  const [hasExistingAvatar, setHasExistingAvatar] = useState(false);
  const [voiceGateChecked, setVoiceGateChecked] = useState(false);
  const [recoveringVoiceTask, setRecoveringVoiceTask] = useState(false);
  const [voicePromptText, setVoicePromptText] = useState(VOICE_SCRIPT);
  const [voicePromptTextId, setVoicePromptTextId] = useState<string | null>(null);
  const [voiceQualityFailCount, setVoiceQualityFailCount] = useState(0);
  /** 阿里云 OSS 路径用；与资料接口 user_id 一致 */
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [portraitUri, setPortraitUri] = useState<string | null>(null);
  const [avatarProgress, setAvatarProgress] = useState(0);
  const [avatarStatusText, setAvatarStatusText] = useState<string>('加载中');
  const [generatedAvatarUrl, setGeneratedAvatarUrl] = useState<string | null>(null);
  /** 完成页标题：与资料页一致，优先 display_name */
  const [profileDisplayName, setProfileDisplayName] = useState('用户');
  const [interviewInput, setInterviewInput] = useState('');
  const [interviewRound, setInterviewRound] = useState(0);
  const [chatRows, setChatRows] = useState<ChatRow[]>([]);
  const [portraitGuideVisible, setPortraitGuideVisible] = useState(false);
  const [portraitGuideStep, setPortraitGuideStep] = useState<1 | 2>(1);

  const closePortraitGuide = useCallback(() => {
    setPortraitGuideVisible(false);
    setPortraitGuideStep(1);
  }, []);

  const openPortraitGuide = useCallback(() => {
    setPortraitGuideStep(1);
    setPortraitGuideVisible(true);
  }, []);

  useEffect(() => {
    if (phase !== 'image') {
      setPortraitGuideVisible(false);
      setPortraitGuideStep(1);
    }
  }, [phase]);

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const avatarAbortRef = useRef<AbortController | null>(null);
  const { isRecording, isPaused, startRecording, stopRecording, pauseRecording, resumeRecording } =
    useRecording();

  const filled = phaseToFilledSegments(phase);
  const title = phaseTitle(phase);
  const modelInitBackground = (() => {
    switch (phase) {
      case 'voice':
        return MODEL_INIT_HOME_BG;
      case 'image':
        return MODEL_INIT_IMAGE_BG;
      case 'avatarLoading':
        return MODEL_INIT_AVATAR_LOADING_SCREEN_BG;
      case 'avatarDone':
        return MODEL_INIT_AVATAR_DONE_SCREEN_BG;
      case 'interviewPreamble':
      case 'interview':
        return MODEL_INIT_INTERVIEW_BG;
      case 'complete':
        return MODEL_INIT_HOME_BG;
      case 'intro':
      default:
        return MODEL_INIT_HOME_BG;
    }
  })();

  const persistVoiceIdAndContinue = useCallback(async (voiceId: string) => {
    const normalizedVoiceId = voiceId.trim();
    if (!normalizedVoiceId) {
      throw new Error('任务成功但未返回 voice_id');
    }
    setVoiceStatusText('正在写入个人资料');
    const updated = await updateProfile({ voice_id: normalizedVoiceId });
    putProfileCache(updated);
    setHasExistingVoiceId(true);
    if (updated.avatar_url?.trim()) {
      setHasExistingAvatar(true);
    }
    void AsyncStorage.removeItem(LAST_VOICE_CLONE_TASK_ID_KEY).catch(() => {});
    setVoiceQualityFailCount(0);
    setPhase('image');
  }, []);

  const refreshVoicePrompt = useCallback(async () => {
    clearVoiceCloneTrainingTextCache();
    const { textId, text } = await fetchVoiceCloneTrainingText({ taskType: 5, textLanguage: 1 });
    setVoicePromptTextId(textId);
    setVoicePromptText(text.trim() || VOICE_SCRIPT);
  }, []);

  useEffect(() => {
    if (phase !== 'avatarDone') return;
    const p = peekProfileCache();
    const n = p?.display_name?.trim() || p?.username?.trim();
    if (n) setProfileDisplayName(n);
  }, [phase]);

  useEffect(() => {
    if (!isRecording || isPaused) {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }
    tickRef.current = setInterval(() => {
      setRecordSeconds((s) => s + 1);
    }, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [isRecording, isPaused]);

  useEffect(() => {
    if (!isRecording || isPaused || recordSeconds < MAX_VOICE_RECORD_SECONDS) return;
    pauseRecording()
      .then(() => {
        Alert.alert(
          '提示',
          `当前录音最多 ${MAX_VOICE_RECORD_SECONDS} 秒，已自动暂停，请点击右侧确认。`
        );
      })
      .catch(() => {
        Alert.alert('提示', '录音时长已达上限，请点击右侧确认。');
      });
  }, [isRecording, isPaused, pauseRecording, recordSeconds]);

  useEffect(() => {
    return () => {
      avatarAbortRef.current?.abort();
      avatarAbortRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (phase !== 'voice') return;
    if (recoveringVoiceTask) return;
    if (voiceCloneProvider !== 'tencent') {
      setVoicePromptText(VOICE_SCRIPT);
      setVoicePromptTextId(null);
      setVoiceStatusText('');
      return;
    }
    let cancelled = false;
    setVoiceStatusText('正在加载朗读文本');
    refreshVoicePrompt()
      .then(() => {
        if (cancelled) return;
      })
      .catch(() => {
        if (cancelled) return;
        setVoicePromptTextId(null);
        setVoicePromptText(VOICE_SCRIPT);
      })
      .finally(() => {
        if (!cancelled) {
          setVoiceStatusText('');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [phase, refreshVoicePrompt, recoveringVoiceTask]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await fetchProfile();
        if (cancelled) return;
        putProfileCache(profile);
        setProfileDisplayName(
          profile.display_name?.trim() || profile.username?.trim() || '用户'
        );
        setProfileUserId(profile.user_id?.trim() || null);
        const existingVoiceId = profile.voice_id?.trim();
        setHasExistingVoiceId(Boolean(existingVoiceId));
        const existingAvatar = profile.avatar_url?.trim();
        setHasExistingAvatar(Boolean(existingAvatar));
      } catch {
        if (cancelled) return;
        setHasExistingVoiceId(false);
        setHasExistingAvatar(false);
        setProfileUserId(null);
      } finally {
        if (!cancelled) {
          setVoiceGateChecked(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (voiceCloneProvider !== 'tencent') return;
    if (phase !== 'voice') return;
    if (!voiceGateChecked) return;
    if (hasExistingVoiceId) return;
    let cancelled = false;
    (async () => {
      const cachedTaskId = (await AsyncStorage.getItem(LAST_VOICE_CLONE_TASK_ID_KEY))?.trim();
      if (!cachedTaskId || cancelled) return;
      setRecoveringVoiceTask(true);
      setVoiceStatusText('检测到上次未完成任务，正在恢复查询');
      try {
        const current = await queryVoiceCloneTask(cachedTaskId);
        if (cancelled) return;
        if (current.status === 2 && current.voiceId) {
          await persistVoiceIdAndContinue(current.voiceId);
          return;
        }
        if (current.status !== 0 && current.status !== 1) {
          console.warn('[voice-clone] recover status ended', {
            taskId: cachedTaskId,
            status: current.status,
            statusLabel: getVoiceCloneStatusLabel(current.status, current.statusText),
            statusText: current.statusText,
            errorMsg: current.errorMsg,
          });
          void AsyncStorage.removeItem(LAST_VOICE_CLONE_TASK_ID_KEY).catch(() => {});
          return;
        }
        const { voiceId } = await waitForVoiceCloneResult(cachedTaskId, {
          timeoutMs: VOICE_CLONE_RECOVER_TIMEOUT_MS,
          intervalMs: 2_500,
          onProgress: (status, statusText) => {
            const statusLabel = getVoiceCloneStatusLabel(status, statusText);
            setVoiceStatusText(`恢复中：${statusLabel}`);
            console.info('[voice-clone] recover polling', {
              taskId: cachedTaskId,
              status,
              statusLabel,
            });
          },
        });
        if (cancelled) return;
        await persistVoiceIdAndContinue(voiceId);
      } catch (error) {
        if (cancelled) return;
        const msg = error instanceof Error ? error.message : String(error);
        console.warn('[voice-clone] recover failed', { taskId: cachedTaskId, message: msg });
      } finally {
        if (!cancelled) {
          setRecoveringVoiceTask(false);
          setVoiceStatusText('');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasExistingVoiceId, persistVoiceIdAndContinue, phase, voiceGateChecked]);

  const onBack = () => {
    router.back();
  };

  const startModelInit = () => {
    if (!voiceGateChecked) {
      Alert.alert('提示', '正在加载资料，请稍后重试。');
      return;
    }
    setPhase('voice');
  };

  const toggleRecord = async () => {
    try {
      if (!isRecording) {
        if (voiceCloneProvider === 'tencent' && !voicePromptTextId) {
          setVoiceStatusText('正在刷新朗读文本');
          try {
            await refreshVoicePrompt();
          } finally {
            setVoiceStatusText('');
          }
        }
        setRecordSeconds(0);
        await startRecording();
        return;
      }
      if (isPaused) {
        if (recordSeconds >= MAX_VOICE_RECORD_SECONDS) {
          Alert.alert('提示', `当前录音最多 ${MAX_VOICE_RECORD_SECONDS} 秒，请点击右侧确认。`);
          return;
        }
        await resumeRecording();
        return;
      }
      await pauseRecording();
    } catch {
      Alert.alert('提示', '无法访问麦克风，请在系统设置中开启权限后重试。');
    }
  };

  const confirmVoice = async () => {
    if (voiceSubmitting) return;
    let createdTaskId = '';
    try {
      setVoiceSubmitting(true);
      setVoiceStatusText('正在保存录音');
      const recordedUri = isRecording ? await stopRecording() : null;
      if (!recordedUri) {
        throw new Error('请先完成录音再继续。');
      }

      if (voiceCloneProvider === 'aliyun') {
        const uid = profileUserId?.trim() || (await fetchProfile()).user_id?.trim() || '';
        if (!uid) {
          throw new Error('无法获取用户身份，请先登录后再完成声音采集。');
        }
        setProfileUserId(uid);
        const { voiceId } = await cloneAliyunVoiceFromLocalRecording({
          localUri: recordedUri,
          userId: uid,
          onStatus: setVoiceStatusText,
        });
        await persistVoiceIdAndContinue(voiceId);
        return;
      }

      setVoiceStatusText('正在创建声音复刻任务');
      const { taskId } = await createVoiceCloneTaskFromRecording({
        audioUri: recordedUri,
        voiceName: `AIYOU_${Date.now()}`,
        voiceGender: 2,
        voiceLanguage: 1,
        taskType: 5,
        textId: voicePromptTextId || undefined,
      });
      createdTaskId = taskId;
      void AsyncStorage.setItem(LAST_VOICE_CLONE_TASK_ID_KEY, taskId).catch(() => {});
      console.info('[voice-clone] task created', { taskId });

      setVoiceStatusText('正在训练音色模型');
      const { voiceId } = await waitForVoiceCloneResult(taskId, {
        timeoutMs: VOICE_CLONE_SYNC_TIMEOUT_MS,
        intervalMs: 2_500,
        onProgress: (status, statusText) => {
          const statusLabel = getVoiceCloneStatusLabel(status, statusText);
          setVoiceStatusText(`音色处理中：${statusLabel}`);
          console.info('[voice-clone] polling', { taskId, status, statusLabel });
        },
      });
      await persistVoiceIdAndContinue(voiceId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '声音复刻失败，请重试。';
      if (createdTaskId) {
        console.warn('[voice-clone] query failed', { taskId: createdTaskId, message: msg });
      }
      if (voiceCloneProvider === 'tencent' && msg.includes('当前朗读文本已失效')) {
        setVoiceStatusText('正在刷新朗读文本');
        try {
          await refreshVoicePrompt();
        } catch {
          // ignore refresh failure; keep fallback hint below
        } finally {
          setVoiceStatusText('');
        }
        Alert.alert('提示', '朗读文本已过期，已为你刷新。请按新文本重新录音后再提交。');
        return;
      }
      if (voiceCloneProvider === 'tencent' && e instanceof VoiceCloneDetectError) {
        const isQualityFailed = msg.includes('音频质量');
        if (isQualityFailed) {
          const nextCount = voiceQualityFailCount + 1;
          setVoiceQualityFailCount(nextCount);
          if (nextCount >= 2) {
            setVoiceStatusText('连续检测未通过，正在刷新朗读文本');
            try {
              await refreshVoicePrompt();
            } catch {
              // ignore refresh failure
            } finally {
              setVoiceStatusText('');
            }
          }
        }
        const detailLines: string[] = [msg];
        if (e.rawMessage?.trim()) {
          detailLines.push(`原始原因：${e.rawMessage.trim()}`);
        }
        if (e.requestId?.trim()) {
          detailLines.push(`RequestId：${e.requestId.trim()}`);
        }
        if (isQualityFailed && voiceQualityFailCount + 1 >= 2) {
          detailLines.push('已自动刷新朗读文本，请按新文本重新录音。');
        }
        Alert.alert('提示', detailLines.join('\n'));
        return;
      }
      if (voiceCloneProvider === 'aliyun' && isAliyunOssEnvMissing(msg)) {
        Alert.alert(
          '提示',
          '当前环境未配置阿里云 OSS 密钥，暂时无法完成声音复刻。你可以先继续后续步骤，稍后补齐 .env 后再回来采集声音。',
          [
            { text: '我去配置', style: 'cancel' },
            { text: '继续下一步', onPress: () => setPhase('image') },
          ]
        );
        return;
      }
      Alert.alert('提示', msg);
    } finally {
      setVoiceSubmitting(false);
      setVoiceStatusText('');
    }
  };

  const pickImage = async () => {
    let perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    }
    if (perm.status !== 'granted') {
      Alert.alert('提示', '需要相册权限才能选择照片，请在系统设置中开启后重试。');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setPortraitUri(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    let perm = await ImagePicker.getCameraPermissionsAsync();
    if (perm.status !== 'granted') {
      perm = await ImagePicker.requestCameraPermissionsAsync();
    }
    if (perm.status !== 'granted') {
      Alert.alert('提示', '需要相机权限才能拍摄照片，请在系统设置中开启后重试。');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setPortraitUri(result.assets[0].uri);
    }
  };

  const handlePortraitTakePhoto = async () => {
    closePortraitGuide();
    await takePhoto();
  };

  const handlePortraitPickLibrary = async () => {
    closePortraitGuide();
    await pickImage();
  };

  const startGenerateAvatar = async () => {
    if (!portraitUri) {
      Alert.alert('提示', '请先选择或拍摄一张照片。');
      return;
    }
    avatarAbortRef.current?.abort();
    const controller = new AbortController();
    avatarAbortRef.current = controller;

    setAvatarProgress(6);
    setAvatarStatusText('正在上传照片');
    setGeneratedAvatarUrl(null);
    setPhase('avatarLoading');

    try {
      // 1) 先把真人照片上传到现有后端，拿到可公网访问的 URL（作为 TokenHub images 输入）
      const uploadedPortraitProfile = await uploadAvatarWithRetry(portraitUri, {
        onAttemptStart: (attempt, total) => {
          setAvatarStatusText(
            attempt > 1 ? `正在上传照片（重试 ${attempt}/${total}）` : '正在上传照片'
          );
        },
      });
      putProfileCache(uploadedPortraitProfile);
      if (uploadedPortraitProfile.avatar_url?.trim()) {
        setHasExistingAvatar(true);
      }
      const portraitPublicUrl = uploadedPortraitProfile.avatar_url;
      if (!portraitPublicUrl?.trim()) throw new Error('照片上传成功但未返回可访问的图片地址');

      setAvatarProgress(22);
      setAvatarStatusText('正在生成数字形象');

      // 2) 提交 TokenHub 图生图任务
      const prompt =
        '请基于参考照片生成高质量二次元动漫风格的头像：干净背景、面部清晰、光线自然、人物居中、保留主要五官特征，避免过度夸张。';
      const submit = await submitImageJob(
        { model: 'hy-image-v3.0', prompt, images: [portraitPublicUrl], rsp_img_type: 'url' },
        controller.signal
      );
      if (!submit.id) {
        const debugKeys = Object.keys(submit || {}).join(', ') || 'none';
        const debugRaw = JSON.stringify(submit).slice(0, 220);
        throw new Error(`提交生成任务失败：未返回任务 id（keys: ${debugKeys}，raw: ${debugRaw}）`);
      }

      setAvatarProgress(30);

      // 3) 轮询查询结果
      const maxMs = 75_000;
      const startedAt = Date.now();
      let lastUrl: string | undefined;

      while (Date.now() - startedAt < maxMs) {
        if (controller.signal.aborted) throw new Error('已取消');
        const q = await queryImageJob({ model: 'hy-image-v3.0', id: submit.id }, controller.signal);
        const status = (q.status || '').toLowerCase();

        if (status === 'completed') {
          lastUrl = q.data?.[0]?.url;
          if (!lastUrl) throw new Error('生成已完成，但未返回图片地址');
          break;
        }
        if (status === 'failed' || status === 'canceled') {
          throw new Error('生成失败，请更换照片或稍后重试');
        }

        const elapsed = Date.now() - startedAt;
        const p = Math.min(92, 30 + Math.floor((elapsed / maxMs) * 62));
        setAvatarProgress(p);
        setAvatarStatusText(status === 'queued' ? '排队中' : '生成中');
        await sleep(1500);
      }

      if (!lastUrl) throw new Error('生成超时，请稍后重试');

      setAvatarProgress(94);
      setAvatarStatusText('正在保存头像');

      // 4) 下载生成结果到本地，再走现有 uploadAvatar() 作为最终头像
      const destination = new Directory(Paths.cache, 'generated-avatars', String(Date.now()));
      // 必须带 intermediates：否则父目录 generated-avatars 不存在时 create 会失败；
      // 若静默忽略，后续 download 会把临时文件移到不存在的路径，触发 CFNetwork “couldn’t be moved” 报错。
      destination.create({ intermediates: true, idempotent: true });
      const downloaded = await File.downloadFileAsync(lastUrl, destination, { idempotent: true });

      const finalProfile = await uploadAvatarWithRetry(downloaded.uri, {
        onAttemptStart: (attempt, total) => {
          setAvatarStatusText(
            attempt > 1 ? `正在保存头像（重试 ${attempt}/${total}）` : '正在保存头像'
          );
        },
      });
      putProfileCache(finalProfile);
      if (finalProfile.avatar_url?.trim()) {
        setHasExistingAvatar(true);
      }

      setGeneratedAvatarUrl(finalProfile.avatar_url || lastUrl);
      setAvatarProgress(100);
      setPhase('avatarDone');
    } catch (e) {
      if (controller.signal.aborted) {
        return;
      }
      Alert.alert('提示', e instanceof Error ? e.message : '生成失败，请稍后重试。');
      setPhase('image');
    } finally {
      if (avatarAbortRef.current === controller) {
        avatarAbortRef.current = null;
      }
    }
  };

  const resetVoiceStep = () => {
    setRecordSeconds(0);
    if (isRecording) {
      stopRecording().catch(() => {});
    }
  };

  const sendInterview = useCallback(() => {
    const text = interviewInput.trim();
    if (!text) return;
    setInterviewInput('');

    const userId = `u-${Date.now()}`;
    setChatRows((rows) => [...rows, { id: userId, kind: 'user', text }]);

    if (interviewRound === 0) {
      const memoryBody = `商业哲学 - 你相信，企业的长期生命力与「${text.slice(0, 24)}${text.length > 24 ? '…' : ''}」密切相关。`;
      const loadingId = `l1-${Date.now()}`;
      setChatRows((rows) => [...rows, { id: loadingId, kind: 'loading', text: '我正在了解学习...' }]);
      setTimeout(() => {
        setChatRows((rows) => [
          ...rows.filter((r) => r.id !== loadingId),
          {
            id: `a1-${Date.now()}`,
            kind: 'ai',
            text:
              text.length <= 4
                ? `${text}，是企业最慢建立、却最难取代的资产之一。这个答案，我会帮你记住。`
                : '这个视角很重要。这个答案，我会帮你记住。',
          },
          {
            id: `m1-${Date.now()}`,
            kind: 'memory',
            title: '记忆已生成',
            tag: '决策风格',
            body: memoryBody,
          },
          {
            id: `q2-${Date.now()}`,
            kind: 'ai',
            text: '面对重要决定，你通常更怕「错过机会」还是更怕「做错决定」？',
          },
        ]);
        setInterviewRound(1);
        void persistOnboardingInterviewFact(memoryBody, 'style').catch((err) =>
          Alert.alert(
            '提示',
            err instanceof Error ? err.message : '记忆未能同步到记忆库，可稍后在记忆库中手动补充。'
          )
        );
      }, 400);
      return;
    }

    const secondMemoryBody = `决策风格 - 面对重要决定时，你的回答是：「${text.slice(0, 40)}${text.length > 40 ? '…' : ''}」。`;
    const loadingId = `l2-${Date.now()}`;
    setChatRows((rows) => [...rows, { id: loadingId, kind: 'loading', text: '我正在了解学习...' }]);
    setTimeout(() => {
      setChatRows((rows) => [
        ...rows.filter((r) => r.id !== loadingId),
        {
          id: `a2-${Date.now()}`,
          kind: 'ai',
          text: '谢谢你的坦诚。这些回答会写入你的初始记忆模型。你可以随时在记忆库中继续完善。',
        },
      ]);
      setInterviewRound(2);
      void persistOnboardingInterviewFact(secondMemoryBody, 'style').catch((err) =>
        Alert.alert(
          '提示',
          err instanceof Error ? err.message : '记忆未能同步到记忆库，可稍后在记忆库中手动补充。'
        )
      );
    }, 400);
  }, [interviewInput, interviewRound]);

  const sampleAvatar = require('@/assets/img/thomino.jpg');

  /** 完成页头像：优先本次图生图结果，其次已写入资料的 avatar_url（动漫形象），勿回退到上传前的真人照 */
  const avatarDoneImageSource = useMemo(() => {
    const gen = generatedAvatarUrl?.trim();
    if (gen) return { uri: bustAvatarCache(gen) };
    const cached = peekProfileCache()?.avatar_url?.trim();
    if (cached) return { uri: bustAvatarCache(cached) };
    return sampleAvatar;
  }, [generatedAvatarUrl, sampleAvatar, phase]);

  const swipePhaseNavResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) =>
          MODEL_INIT_UI_SWIPE_BETWEEN_STEPS &&
          Math.abs(g.dx) > 12 &&
          Math.abs(g.dx) > Math.abs(g.dy) * 1.05,
        onPanResponderTerminationRequest: () => true,
        onPanResponderRelease: (_, g) => {
          if (!MODEL_INIT_UI_SWIPE_BETWEEN_STEPS) return;
          const idx = MODEL_INIT_PHASE_SWIPE_ORDER.indexOf(phase);
          if (idx < 0) return;
          const goNext = g.dx < -48 || g.vx < -0.35;
          const goPrev = g.dx > 48 || g.vx > 0.35;
          if (goNext && idx < MODEL_INIT_PHASE_SWIPE_ORDER.length - 1) {
            setPhase(MODEL_INIT_PHASE_SWIPE_ORDER[idx + 1]!);
          } else if (goPrev && idx > 0) {
            setPhase(MODEL_INIT_PHASE_SWIPE_ORDER[idx - 1]!);
          }
        },
      }),
    [phase],
  );

  return (
    <>
    <View
      style={styles.screenFill}
      {...(MODEL_INIT_UI_SWIPE_BETWEEN_STEPS ? swipePhaseNavResponder.panHandlers : {})}>
      {phase === 'intro' ? (
        <>
          <LinearGradient
            colors={['#000000', '#000000', '#0B1B28']}
            locations={[0, 0.5687, 0.9762]}
            start={{ x: 0.08, y: 1 }}
            end={{ x: 0.92, y: 0 }}
            style={StyleSheet.absoluteFillObject}
          />
          <IntroCenterGlow />
        </>
      ) : phase === 'voice' ? (
        <ImageBackground
          source={MODEL_INIT_VOICE_SCREEN_BG}
          resizeMode="cover"
          style={StyleSheet.absoluteFillObject}
        />
      ) : phase === 'image' ? (
        <>
          <LinearGradient
            colors={['#000000', '#000000', '#0B1B28']}
            locations={[0, 0.5687, 0.9762]}
            start={{ x: 0.09, y: 1 }}
            end={{ x: 0.91, y: 0 }}
            style={StyleSheet.absoluteFillObject}
          />
          <ImagePhaseGlow />
        </>
      ) : phase === 'avatarLoading' ? (
        <ImageBackground
          source={MODEL_INIT_AVATAR_LOADING_SCREEN_BG}
          resizeMode="cover"
          style={StyleSheet.absoluteFillObject}
        />
      ) : phase === 'avatarDone' ? (
        <ImageBackground
          source={MODEL_INIT_AVATAR_DONE_SCREEN_BG}
          resizeMode="cover"
          style={StyleSheet.absoluteFillObject}
        />
      ) : (
        <ImageBackground
          source={modelInitBackground}
          resizeMode="cover"
          imageStyle={styles.bgImage}
          style={[StyleSheet.absoluteFillObject, styles.screenFill]}>
          <LinearGradient
            colors={['rgba(11,27,40,0.72)', 'rgba(0,0,0,0.62)', 'rgba(7,16,24,0.72)']}
            locations={[0, 0.52, 1]}
            start={{ x: 0.22, y: 1 }}
            end={{ x: 0.78, y: 0 }}
            style={StyleSheet.absoluteFillObject}
          />
        </ImageBackground>
      )}
      <KeyboardAvoidingView
        style={[styles.screenFill, { zIndex: 1 }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View
          className="flex-1"
          style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }}>
          {phase === 'intro' ? (
            <View className="h-3" />
          ) : (
            <View className="flex-row items-center justify-between px-4">
              <TouchableOpacity
                onPress={onBack}
                hitSlop={12}
                className="h-10 w-10 items-center justify-center rounded-full bg-white/10">
                <Icon name="ArrowLeft" size={22} color={ACCENT_SOFT} />
              </TouchableOpacity>
              {phase === 'interview' || phase === 'interviewPreamble' ? (
                <View className="flex-1 flex-row items-center justify-between pl-3">
                  <ThemedText className="text-sm font-bold" style={{ color: ACCENT }}>
                    阶段 {interviewRound >= 2 ? '4' : interviewRound === 0 ? '1' : '2'}/4
                  </ThemedText>
                  <ThemedText className="text-sm font-bold" style={{ color: ACCENT }}>
                    认知 {interviewRound === 0 ? '24%' : interviewRound === 1 ? '54%' : '98%'}
                  </ThemedText>
                </View>
              ) : (
                <View className="w-10" />
              )}
            </View>
          )}

          {title && phase !== 'voice' && phase !== 'image' && phase !== 'avatarLoading' && phase !== 'avatarDone' ? (
            <View className="mt-2 px-4">
              <ThemedText className="text-2xl font-bold">
                <ThemedText style={{ color: ACCENT }}>{title.n} </ThemedText>
                <ThemedText className="text-white">{title.label}</ThemedText>
              </ThemedText>
              <StepProgress filledSegments={filled} />
            </View>
          ) : null}

          <ScrollView
            className={`mt-4 flex-1 ${phase === 'intro' || phase === 'voice' || phase === 'image' || phase === 'avatarLoading' || phase === 'avatarDone' ? '' : 'px-4'}`}
            contentContainerStyle={
              phase === 'intro' ||
              phase === 'voice' ||
              phase === 'image' ||
              phase === 'avatarLoading' ||
              phase === 'avatarDone'
                ? { flexGrow: 1 }
                : undefined
            }
            keyboardShouldPersistTaps="handled"
            scrollEnabled={
              phase !== 'voice' && phase !== 'image' && phase !== 'avatarLoading' && phase !== 'avatarDone'
            }
            bounces={
              phase !== 'voice' && phase !== 'image' && phase !== 'avatarLoading' && phase !== 'avatarDone'
            }
            alwaysBounceVertical={
              phase !== 'voice' && phase !== 'image' && phase !== 'avatarLoading' && phase !== 'avatarDone'
            }
            showsVerticalScrollIndicator={false}>
            {phase === 'intro' ? (
              <View
                className="flex-1 pb-2 pt-2"
                style={{
                  paddingHorizontal: Math.max(16, Math.round((37 / MODEL_INIT_INTRO_FRAME.w) * layoutW)),
                  zIndex: 1,
                }}>
                <IntroBrandMark />
                <View style={{ height: Math.max(40, Math.round((72 / MODEL_INIT_INTRO_FRAME.h) * layoutH)) }} />
                <View style={{ maxWidth: Math.min(320, Math.round((304 / MODEL_INIT_INTRO_FRAME.w) * layoutW)) }}>
                  <ThemedText className="text-[40px] font-normal leading-[50px] text-white">
                    开始构建AI{'\n'}BOSS模型
                  </ThemedText>
                </View>
                <ThemedText className="mt-3 text-base font-normal leading-[22px] text-white">
                  从今天起，拥有另一个自己
                </ThemedText>
                <View className="mt-auto w-full" style={{ paddingTop: Math.max(24, Math.round(0.04 * layoutH)) }}>
                  <IntroStartButton onPress={startModelInit} />
                </View>
              </View>
            ) : null}

            {phase === 'voice' ? (
              <View
                style={{
                  flex: 1,
                  flexDirection: 'column',
                  paddingHorizontal: Math.max(16, Math.round((22 / MODEL_INIT_INTRO_FRAME.w) * layoutW)),
                  zIndex: 1,
                  paddingBottom: Math.max(insets.bottom, voiceStepY(12, layoutH)),
                }}>
                <View>
                  <View className="flex-row items-end" style={{ gap: 6 }}>
                    <Text style={{ fontSize: 24, fontWeight: '700', color: '#FFAD00', lineHeight: 29 }}>
                      1
                    </Text>
                    <ThemedText className="text-base font-normal leading-5 text-white">声音采集</ThemedText>
                  </View>
                  <View style={{ marginTop: voiceStepY(10, layoutH), alignSelf: 'flex-start' }}>
                    <ModelInitStepSegments filled={1} />
                  </View>

                  {/* Figma：进度条底约 y=152 → 主标题 y=214，间距 62 */}
                  <ThemedText
                    className="font-normal text-white"
                    style={{
                      marginTop: voiceStepY(62, layoutH),
                      fontSize: 24,
                      lineHeight: 34,
                    }}>
                    你每一次说话{'\n'}都在让另一个你变得更聪明。
                  </ThemedText>

                  {/* 主标题底 y=282 → 说明 y=337，间距 55 */}
                  <ThemedText
                    className="font-normal text-white"
                    style={{
                      marginTop: voiceStepY(55, layoutH),
                      fontSize: 16,
                      lineHeight: 22,
                    }}>
                    请用自然语气请朗读以下内容：
                  </ThemedText>
                  <ThemedText
                    className="font-normal text-[#7F7F7F]"
                    style={{
                      marginTop: 0,
                      fontSize: 12,
                      lineHeight: 17,
                    }}>
                    找一个安静的环境
                  </ThemedText>

                  {/* 灰字底 y=376 → 卡片 y=393，间距 17；卡片高 278 */}
                  <View
                    className="overflow-hidden rounded-[20px]"
                    style={{
                      marginTop: voiceStepY(17, layoutH),
                      backgroundColor: '#1D1F21',
                      alignSelf: 'stretch',
                      paddingHorizontal: voiceStepY(18, layoutH),
                      paddingTop: voiceStepY(16, layoutH),
                      paddingBottom: voiceStepY(16, layoutH),
                      height: Math.min(
                        voiceStepY(278, layoutH),
                        Math.round(layoutH * 0.345)
                      ),
                    }}>
                    <Text
                      style={{
                        fontSize: 14,
                        lineHeight: 18,
                        letterSpacing: -0.12,
                        color: '#A6A6A6',
                        textAlign: 'justify',
                      }}>
                      {voicePromptText}
                    </Text>
                  </View>
                </View>

                {/* Figma：卡片底→计时约 32px；flex 吸收多余高度，避免控件挤在卡片下、底部空一大块 */}
                <View style={{ flex: 1, minHeight: voiceStepY(32, layoutH) }} />

                <View className="items-center">
                  <ThemedText
                    className="text-center"
                    style={{
                      marginBottom: voiceStepY(7, layoutH),
                      fontSize: 15,
                      lineHeight: 18,
                      color: '#A5A5A5',
                    }}>
                    {formatTimer(recordSeconds)}
                  </ThemedText>
                  <View className="flex-row items-center justify-center" style={{ gap: 50 }}>
                    <TouchableOpacity
                      onPress={resetVoiceStep}
                      hitSlop={12}
                      className="items-center justify-center rounded-full bg-white/10"
                      style={{ width: 48, height: 48 }}>
                      <Icon name="RotateCcw" size={24} color={ACCENT_SOFT} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={toggleRecord}
                      activeOpacity={0.9}
                      accessibilityLabel={isRecording && !isPaused ? '暂停录音' : '开始录音'}
                      className="h-[78px] w-[78px] items-center justify-center overflow-hidden rounded-full"
                      style={styles.voiceMicOuter}>
                      <Image
                        source={
                          isRecording && !isPaused ? VOICE_MIC_PAUSE_IMG : VOICE_MIC_SPEAK_IMG
                        }
                        style={{ width: 78, height: 78, borderRadius: 39 }}
                        resizeMode="contain"
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={confirmVoice}
                      disabled={recordSeconds === 0 || voiceSubmitting}
                      hitSlop={12}
                      className="items-center justify-center rounded-full bg-white/10"
                      style={{ width: 48, height: 48 }}>
                      {voiceSubmitting ? (
                        <ActivityIndicator size="small" color={ACCENT_SOFT} />
                      ) : (
                        <Icon
                          name="Check"
                          size={27}
                          color={recordSeconds > 0 && !voiceSubmitting ? ACCENT : '#555'}
                        />
                      )}
                    </TouchableOpacity>
                  </View>
                  {voiceStatusText ? (
                    <ThemedText className="text-white/55 mt-2 text-center text-xs">
                      {voiceStatusText}
                    </ThemedText>
                  ) : null}
                  <LinearGradient
                    colors={[
                      'transparent',
                      'rgba(179,151,92,0.55)',
                      'rgba(168,127,42,0.35)',
                      'transparent',
                    ]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={{
                      alignSelf: 'center',
                      marginTop: voiceStepY(20, layoutH),
                      marginBottom: 4,
                      height: 2,
                      width: Math.min(layoutW * 0.78, 320),
                      borderRadius: 1,
                    }}
                  />
                  {hasExistingVoiceId ? (
                    <TouchableOpacity
                      onPress={() => setPhase('image')}
                      className="mt-4 px-4 py-2"
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="已采集过声音，直接进入下一步">
                      <ThemedText className="text-center text-sm text-white/55 underline">
                        已采集过声音，直接进入下一步
                      </ThemedText>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            ) : null}

            {phase === 'image' ? (
              <View
                style={{
                  flex: 1,
                  paddingHorizontal: Math.max(16, Math.round((34 / MODEL_INIT_INTRO_FRAME.w) * layoutW)),
                  zIndex: 1,
                  paddingBottom: Math.max(insets.bottom, voiceStepY(12, layoutH)),
                }}>
                <View className="flex-row items-end" style={{ gap: 6 }}>
                  <Text style={{ fontSize: 24, fontWeight: '700', color: '#FFAD00', lineHeight: 29 }}>
                    2
                  </Text>
                  <ThemedText className="text-base font-normal leading-5 text-white">图像采集</ThemedText>
                </View>
                <View style={{ marginTop: voiceStepY(10, layoutH), alignSelf: 'flex-start' }}>
                  <ModelInitStepSegments filled={2} />
                </View>

                {/* 中部：青绿光晕 + 错落头像 + 中央「+」（对齐设计稿，非单张拼贴） */}
                <View
                  style={{
                    marginTop: voiceStepY(10, layoutH),
                    marginLeft: Math.round((-39 / MODEL_INIT_INTRO_FRAME.w) * layoutW),
                    alignSelf: 'center',
                  }}>
                  <ModelInitImageHeroCluster
                    containerWidth={(556 / MODEL_INIT_INTRO_FRAME.w) * layoutW}
                    aspectRatio={556 / 399.17}
                    portraitUri={portraitUri}
                    onCenterPress={openPortraitGuide}
                  />
                </View>

                <View style={{ flex: 1, minHeight: voiceStepY(16, layoutH) }} />

                <ThemedText
                  className="text-center text-white"
                  style={{
                    fontSize: 14,
                    lineHeight: 20,
                    marginBottom: voiceStepY(19, layoutH),
                  }}>
                  上传照片，生成分身形象
                </ThemedText>
                <ImageStepPrimaryButton
                  label={portraitUri ? '生成数字形象' : '选择图片'}
                  onPress={() => {
                    if (!portraitUri) {
                      openPortraitGuide();
                      return;
                    }
                    startGenerateAvatar();
                  }}
                />
                {portraitUri ? (
                  <TouchableOpacity onPress={openPortraitGuide} className="mt-3 px-4 py-2">
                    <ThemedText className="text-sm text-white/70">重新上传</ThemedText>
                  </TouchableOpacity>
                ) : null}
                {hasExistingAvatar ? (
                  <TouchableOpacity
                    onPress={() => setPhase('interviewPreamble')}
                    className="mt-4 px-4 py-2"
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="已上传过头像，进入下一环节">
                    <ThemedText className="text-center text-sm text-white/55 underline">
                      已上传过头像，进入下一环节
                    </ThemedText>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            {phase === 'avatarLoading' ? (
              <View
                style={{
                  flex: 1,
                  paddingHorizontal: Math.max(16, Math.round((19 / MODEL_INIT_INTRO_FRAME.w) * layoutW)),
                  zIndex: 1,
                  paddingBottom: Math.max(insets.bottom, voiceStepY(12, layoutH)),
                }}>
                {title ? (
                  <View style={{ flexShrink: 0 }}>
                    <View className="flex-row items-end" style={{ gap: 6 }}>
                      <Text style={{ fontSize: 24, fontWeight: '700', color: '#FFAD00', lineHeight: 29 }}>
                        {title.n}
                      </Text>
                      <ThemedText className="text-base font-normal leading-5 text-white">{title.label}</ThemedText>
                    </View>
                    <View style={{ marginTop: voiceStepY(10, layoutH), alignSelf: 'flex-start' }}>
                      <ModelInitStepSegments filled={3} thirdSegmentPartial />
                    </View>
                  </View>
                ) : null}

                <View
                  style={{
                    flex: 1,
                    justifyContent: 'center',
                    alignItems: 'center',
                    minHeight: Math.round(layoutH * 0.28),
                    paddingVertical: voiceStepY(16, layoutH),
                  }}>
                  <AvatarLoadingParticleRing
                    size={Math.min(288, Math.max(220, Math.round(layoutW * 0.78)))}>
                    <Text
                      style={{
                        fontSize: 26,
                        fontWeight: '300',
                        color: '#FFFFFF',
                        letterSpacing: 5,
                        textAlign: 'center',
                      }}>
                      AI YOU
                    </Text>
                    <Text
                      style={{
                        marginTop: 12,
                        fontSize: 13,
                        lineHeight: 20,
                        fontWeight: '400',
                        color: '#9A9A9A',
                        textAlign: 'center',
                      }}>
                      正在创建您的数字分身
                    </Text>
                  </AvatarLoadingParticleRing>
                </View>

                <View style={{ flexShrink: 0, paddingTop: voiceStepY(8, layoutH) }}>
                  <View style={{ gap: 16 }}>
                    {avatarChecklistFromProgress(avatarProgress).map((row) => (
                      <AvatarLoadingChecklistRow key={row.label} label={row.label} status={row.status} />
                    ))}
                  </View>

                  <View style={{ marginTop: voiceStepY(22, layoutH) }}>
                    <View
                      style={{
                        height: 6,
                        borderRadius: 9999,
                        backgroundColor: '#FFFFFF',
                        overflow: 'hidden',
                      }}>
                      <View style={{ width: `${Math.min(100, Math.max(0, avatarProgress))}%`, height: '100%' }}>
                        <LinearGradient
                          colors={['#938260', '#9B6900']}
                          locations={[0.4327, 1]}
                          start={{ x: 0, y: 0.5 }}
                          end={{ x: 1, y: 0.5 }}
                          style={StyleSheet.absoluteFillObject}
                        />
                      </View>
                    </View>
                    <View className="mt-2 flex-row items-center justify-between">
                      <Text style={{ fontSize: 12, lineHeight: 16, color: '#9B9B9B' }}>{avatarStatusText}</Text>
                      <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '500', color: '#9B9B9B' }}>
                        {avatarProgress}%
                      </Text>
                    </View>
                  </View>

                  <Text
                    style={{
                      marginTop: voiceStepY(14, layoutH),
                      fontSize: 12,
                      lineHeight: 20,
                      color: '#4C4C4C',
                      textAlign: 'center',
                      alignSelf: 'center',
                      maxWidth: 276,
                    }}>
                    此头像将代表您的 AI 分身，用于对话与洞察展示。
                  </Text>

                  <TouchableOpacity
                    onPress={() => {
                      avatarAbortRef.current?.abort();
                      avatarAbortRef.current = null;
                      setPhase('image');
                    }}
                    activeOpacity={0.88}
                    className="w-full items-center justify-center overflow-hidden"
                    style={{
                      marginTop: voiceStepY(20, layoutH),
                      height: 56,
                      borderRadius: 30,
                      backgroundColor: '#313131',
                    }}>
                    <Text style={{ fontSize: 16, lineHeight: 20, color: '#FFFFFF', fontWeight: '400' }}>
                      取消
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {phase === 'avatarDone' ? (
              <View
                style={{
                  flex: 1,
                  paddingHorizontal: Math.max(16, Math.round((34 / MODEL_INIT_INTRO_FRAME.w) * layoutW)),
                  zIndex: 1,
                  paddingBottom: Math.max(insets.bottom, voiceStepY(12, layoutH)),
                }}>
                {title ? (
                  <View style={{ flexShrink: 0 }}>
                    <View className="flex-row items-end" style={{ gap: 6 }}>
                      <Text style={{ fontSize: 24, fontWeight: '700', color: '#FFAD00', lineHeight: 29 }}>
                        {title.n}
                      </Text>
                      <ThemedText className="text-base font-normal leading-5 text-white">{title.label}</ThemedText>
                    </View>
                    <View style={{ marginTop: voiceStepY(10, layoutH), alignSelf: 'flex-start' }}>
                      <ModelInitStepSegments filled={3} thirdSegmentPartial />
                    </View>
                  </View>
                ) : null}

                <View
                  style={{
                    flex: 1,
                    justifyContent: 'center',
                    alignItems: 'center',
                    paddingVertical: voiceStepY(12, layoutH),
                  }}>
                  <AvatarDoneOrbitAvatar
                    orbitSize={Math.min(248, Math.max(200, Math.round(layoutW * 0.62)))}
                    imageSource={avatarDoneImageSource}
                  />
                  <Text
                    style={{
                      marginTop: voiceStepY(18, layoutH),
                      fontSize: 20,
                      lineHeight: 25,
                      fontWeight: '700',
                      color: '#FFFFFF',
                      textAlign: 'center',
                    }}>
                    {profileDisplayName}
                  </Text>
                  <Text
                    style={{
                      marginTop: 6,
                      fontSize: 16,
                      lineHeight: 22,
                      fontWeight: '400',
                      color: '#FFFFFF',
                      textAlign: 'center',
                    }}>
                    您的数字形象已生成
                  </Text>
                </View>

                <View style={{ flexShrink: 0, width: '100%' }}>
                  <TouchableOpacity
                    onPress={() => startGenerateAvatar()}
                    activeOpacity={0.88}
                    className="w-full items-center justify-center"
                    style={{
                      height: 53,
                      borderRadius: 26.5,
                      backgroundColor: 'rgba(255,255,255,0.1)',
                    }}>
                    <Text style={{ fontSize: 16, lineHeight: 22, color: '#FFFFFF', fontWeight: '400' }}>
                      重新生成
                    </Text>
                  </TouchableOpacity>
                  <View style={{ marginTop: 13 }}>
                    <ImageStepPrimaryButton label="确定" onPress={() => setPhase('interviewPreamble')} />
                  </View>
                  <Text
                    style={{
                      marginTop: voiceStepY(16, layoutH),
                      fontSize: 12,
                      lineHeight: 20,
                      color: '#A1A1A1',
                      textAlign: 'center',
                      alignSelf: 'center',
                      maxWidth: 320,
                    }}>
                    此头像将代表您的 AI 分身，用于对话与洞察展示。
                  </Text>
                </View>
              </View>
            ) : null}

            {phase === 'interviewPreamble' ? (
              <View className="pb-8 pt-4">
                <ThemedText className="text-center text-lg font-semibold leading-8 text-white">
                  形象和声音，只是开始。{'\n'}真正的你，藏在接下来的回答里。
                </ThemedText>
                <ThemedText className="text-white/55 mt-6 text-center text-sm">
                  我们随便聊聊，不用想太久。您准备好了吗？
                </ThemedText>
                <View className="mt-12">
                  <GoldButton
                    label="下一步"
                    onPress={() => {
                      setInterviewRound(0);
                      setChatRows([
                        {
                          id: 'q1',
                          kind: 'ai',
                          text: '我们先从最根本的开始——你认为，一家企业能活得久，靠的是什么？',
                        },
                      ]);
                      setPhase('interview');
                    }}
                  />
                </View>
              </View>
            ) : null}

            {phase === 'interview' ? (
              <View className="pb-28">
                <ThemedText className="text-white/45 mb-3 text-xs">
                  它会越来越懂你，越用越像你
                </ThemedText>
                {chatRows.map((row) => {
                  if (row.kind === 'ai') {
                    return (
                      <ThemedText key={row.id} className="mb-4 text-base leading-6 text-white">
                        {row.text}
                      </ThemedText>
                    );
                  }
                  if (row.kind === 'user') {
                    return (
                      <View
                        key={row.id}
                        className="bg-white/12 mb-4 self-end rounded-2xl px-4 py-3">
                        <ThemedText className="text-sm text-white/90">{row.text}</ThemedText>
                      </View>
                    );
                  }
                  if (row.kind === 'loading') {
                    return (
                      <View
                        key={row.id}
                        className="mb-4 self-start rounded-2xl border border-white/10 bg-white/8 px-4 py-3">
                        <StarFloatingLoader text={row.text} textClassName="text-white/80" />
                      </View>
                    );
                  }
                  return (
                    <View
                      key={row.id}
                      className="mb-4 rounded-2xl border border-white/10 p-3"
                      style={{ backgroundColor: CARD_BG }}>
                      <View className="mb-2 flex-row items-center justify-between">
                        <ThemedText className="text-xs text-white/50">{row.title}</ThemedText>
                        <View className="flex-row items-center gap-1">
                          <Icon name="Eye" size={14} color="#21D4C6" />
                          <ThemedText className="text-xs font-semibold text-teal-300">
                            {row.tag}
                          </ThemedText>
                        </View>
                      </View>
                      <ThemedText className="text-sm leading-5 text-white/80">
                        {row.body}
                      </ThemedText>
                    </View>
                  );
                })}
                {interviewRound >= 2 ? (
                  <GoldButton label="完成访谈" onPress={() => setPhase('complete')} />
                ) : null}
              </View>
            ) : null}

            {phase === 'complete' ? (
              <View className="items-center pt-8">
                <ThemedText className="text-center text-3xl font-bold text-white">
                  恭喜你！
                </ThemedText>
                <ThemedText className="mt-6 px-2 text-center text-sm leading-7 text-white/75">
                  已完成初次见面沟通，接下来将根据你上传的所有数据生成老板数字记忆模型。
                </ThemedText>
                <View className="mt-14 w-full">
                  <GoldButton
                    label="开始"
                    onPress={() => {
                      if (isPostLoginOnboarding) {
                        router.replace('/');
                        return;
                      }
                      router.back();
                    }}
                  />
                </View>
              </View>
            ) : null}
          </ScrollView>

          {phase === 'interview' && interviewRound < 2 ? (
            <View
              className="border-t border-white/10 bg-black/30 px-4 pt-3"
              style={{ paddingBottom: insets.bottom + 12 }}>
              <View className="flex-row items-center gap-2 rounded-2xl bg-white/10 px-4 py-2">
                <TextInput
                  className="min-h-[44px] flex-1 text-base text-white"
                  placeholder="发消息或按住说话"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  value={interviewInput}
                  onChangeText={setInterviewInput}
                  onSubmitEditing={sendInterview}
                  returnKeyType="send"
                />
                <TouchableOpacity
                  onPress={sendInterview}
                  className="h-10 w-10 items-center justify-center rounded-full bg-[#B98C44]">
                  <Icon name="ArrowUp" size={20} color="#ffffff" />
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </View>
    <PortraitPickGuideSheets
      visible={portraitGuideVisible}
      step={portraitGuideStep}
      onClose={closePortraitGuide}
      onContinueToSource={() => setPortraitGuideStep(2)}
      onTakePhoto={handlePortraitTakePhoto}
      onPickLibrary={handlePortraitPickLibrary}
    />
    </>
  );
}

const styles = StyleSheet.create({
  screenFill: {
    flex: 1,
  },
  bgImage: {
    alignSelf: 'center',
  },
  /** Figma 声音页主录音键 78×78 外光 */
  voiceMicOuter: {
    ...Platform.select({
      ios: {
        shadowColor: '#6C542B',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.65,
        shadowRadius: 22,
      },
      android: {
        elevation: 16,
      },
      default: {},
    }),
  },
});
