import MaskedView from '@react-native-masked-view/masked-view';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon from '@/components/Icon';
import ThemedText from '@/components/ThemedText';
import { useRecording } from '@/hooks/useRecording';
import { putProfileCache } from '@/lib/profileCache';
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
import { bustAvatarCache, fetchProfile, updateProfile, uploadAvatar } from '@/services/profileApi';

const voiceCloneProvider = getVoiceCloneProvider();

const ACCENT = '#D4A017';
const ACCENT_SOFT = '#F5DCA8';
const CARD_BG = 'rgba(8, 26, 51, 0.92)';
const MAX_VOICE_RECORD_SECONDS = 10;
const LAST_VOICE_CLONE_TASK_ID_KEY = 'luna:last_voice_clone_task_id';
const VOICE_CLONE_SYNC_TIMEOUT_MS = 600_000;
const VOICE_CLONE_RECOVER_TIMEOUT_MS = 90_000;

const IMAGE_STEP_BG_URI =
  'file:///Users/ZHOU/.cursor/projects/Users-ZHOU-Desktop-project-luna-main/assets/Group_561-bf5ddc81-f815-4ed3-a55b-885ba80e2cff.png';

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
  const presets: Array<{ width: number; compress: number }> = [
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
      <ThemedText className="text-center text-base font-bold text-black">{label}</ThemedText>
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
        <ThemedText className="text-base font-normal text-black">开始</ThemedText>
      </View>
    </TouchableOpacity>
  );
}

/** Figma 1037:8848 氛围光（简化：无 heavy blur，保留色块与位置关系） */
function IntroAmbience() {
  return (
    <View pointerEvents="none" className="absolute inset-0 overflow-hidden">
      <View
        className="absolute"
        style={{
          left: -32,
          top: 52,
          width: 236,
          height: 288,
          borderRadius: 42,
          backgroundColor: 'rgba(23, 52, 66, 0.42)',
        }}
      />
      <View
        className="absolute"
        style={{
          left: 8,
          top: 28,
          width: 276,
          height: 268,
          borderRadius: 38,
          backgroundColor: 'rgba(0, 39, 28, 0.32)',
        }}
      />
    </View>
  );
}

/** Figma Group 379「AI YOU」：细字重 + 金渐变 */
function IntroBrandMark() {
  return (
    <MaskedView className="self-start" maskElement={<BrandMarkMask />}>
      <LinearGradient
        colors={['#FFF6E0', '#E8C27A', '#B98C44']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        className="py-0.5">
        <Text className="text-[28px] font-light tracking-[0.2em] text-white opacity-0">AI YOU</Text>
      </LinearGradient>
    </MaskedView>
  );
}

function BrandMarkMask() {
  return (
    <Text
      className="text-[28px] font-light tracking-[0.2em] text-white"
      style={{ fontWeight: '300' }}>
      AI YOU
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
  | { id: string; kind: 'memory'; title: string; tag: string; body: string };

export default function ModelInitScreen() {
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>('intro');
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [voiceSubmitting, setVoiceSubmitting] = useState(false);
  const [voiceStatusText, setVoiceStatusText] = useState('');
  const [hasExistingVoiceId, setHasExistingVoiceId] = useState(false);
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
  const [interviewInput, setInterviewInput] = useState('');
  const [interviewRound, setInterviewRound] = useState(0);
  const [chatRows, setChatRows] = useState<ChatRow[]>([]);

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const avatarAbortRef = useRef<AbortController | null>(null);
  const { isRecording, isPaused, startRecording, stopRecording, pauseRecording, resumeRecording } =
    useRecording();

  const filled = phaseToFilledSegments(phase);
  const title = phaseTitle(phase);

  const persistVoiceIdAndContinue = useCallback(async (voiceId: string) => {
    const normalizedVoiceId = voiceId.trim();
    if (!normalizedVoiceId) {
      throw new Error('任务成功但未返回 voice_id');
    }
    setVoiceStatusText('正在写入个人资料');
    const updated = await updateProfile({ voice_id: normalizedVoiceId });
    putProfileCache(updated);
    setHasExistingVoiceId(true);
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
        setProfileUserId(profile.user_id?.trim() || null);
        const existingVoiceId = profile.voice_id?.trim();
        setHasExistingVoiceId(Boolean(existingVoiceId));
      } catch {
        if (cancelled) return;
        setHasExistingVoiceId(false);
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
    if (hasExistingVoiceId) {
      Alert.alert('提示', '检测到你已完成声音设置，已为你跳过此步骤。');
      setPhase('image');
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
      Alert.alert('提示', msg);
    } finally {
      setVoiceSubmitting(false);
      setVoiceStatusText('');
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('提示', '需要相册权限才能选择照片。');
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
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('提示', '需要相机权限才能拍摄照片。');
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

  const selectPortraitSource = () => {
    Alert.alert('选择头像来源', '请选择获取照片的方式', [
      { text: '取消', style: 'cancel' },
      { text: '拍照', onPress: () => void takePhoto() },
      { text: '从相册选择', onPress: () => void pickImage() },
    ]);
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
      try {
        // Directory.exists 不是实时刷新的；这里用幂等创建避免 “Destination already exists”
        destination.create();
      } catch {
        /* ignore */
      }
      const downloaded = await File.downloadFileAsync(lastUrl, destination);

      const finalProfile = await uploadAvatarWithRetry(downloaded.uri, {
        onAttemptStart: (attempt, total) => {
          setAvatarStatusText(
            attempt > 1 ? `正在保存头像（重试 ${attempt}/${total}）` : '正在保存头像'
          );
        },
      });
      putProfileCache(finalProfile);

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
      setTimeout(() => {
        setChatRows((rows) => [
          ...rows,
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
            body: `商业哲学 - 你相信，企业的长期生命力与「${text.slice(0, 24)}${text.length > 24 ? '…' : ''}」密切相关。`,
          },
          {
            id: `q2-${Date.now()}`,
            kind: 'ai',
            text: '面对重要决定，你通常更怕「错过机会」还是更怕「做错决定」？',
          },
        ]);
        setInterviewRound(1);
      }, 400);
      return;
    }

    setTimeout(() => {
      setChatRows((rows) => [
        ...rows,
        {
          id: `a2-${Date.now()}`,
          kind: 'ai',
          text: '谢谢你的坦诚。这些回答会写入你的初始记忆模型。你可以随时在记忆库中继续完善。',
        },
      ]);
      setInterviewRound(2);
    }, 400);
  }, [interviewInput, interviewRound]);

  const sampleAvatar = require('@/assets/img/thomino.jpg');

  return (
    <LinearGradient
      colors={['#0B1B28', '#000000', '#071018']}
      locations={[0, 0.52, 1]}
      start={{ x: 0.22, y: 1 }}
      end={{ x: 0.78, y: 0 }}
      style={styles.screenFill}>
      {phase === 'intro' ? <IntroAmbience /> : null}
      <KeyboardAvoidingView
        style={styles.screenFill}
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

          {title ? (
            <View className="mt-2 px-4">
              <ThemedText className="text-2xl font-bold">
                <ThemedText style={{ color: ACCENT }}>{title.n} </ThemedText>
                <ThemedText className="text-white">{title.label}</ThemedText>
              </ThemedText>
              <StepProgress filledSegments={filled} />
            </View>
          ) : null}

          <ScrollView
            className="mt-4 flex-1 px-4"
            contentContainerStyle={phase === 'intro' ? { flexGrow: 1 } : undefined}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {phase === 'intro' ? (
              <View className="flex-1 pb-2 pl-6 pr-1 pt-2">
                <IntroBrandMark />
                <View className="mt-[72px] max-w-[320px]">
                  <ThemedText className="text-[40px] font-normal leading-[50px] text-white">
                    开始构建AI{'\n'}BOSS模型
                  </ThemedText>
                </View>
                <ThemedText className="mt-3 text-base font-normal leading-[22.4px] text-white">
                  从今天起，拥有另一个自己
                </ThemedText>
                <View className="mt-auto w-full pt-10">
                  <IntroStartButton onPress={startModelInit} />
                </View>
              </View>
            ) : null}

            {phase === 'voice' ? (
              <View>
                <ThemedText className="text-lg font-semibold leading-8 text-white">
                  你每一次说话{'\n'}都在让另一个你变得更聪明。
                </ThemedText>
                <ThemedText className="mt-4 text-sm text-white/60">
                  请用自然语气朗读以下内容：
                </ThemedText>
                <ThemedText className="text-white/35 mt-1 text-xs">找一个安静的环境</ThemedText>

                <View
                  className="mt-5 rounded-2xl border border-white/10 p-4"
                  style={{ backgroundColor: CARD_BG }}>
                  <ThemedText className="text-sm leading-7 text-white/90">
                    {voicePromptText}
                  </ThemedText>
                </View>

                <View className="mt-10 items-center">
                  <ThemedText className="mb-3 text-sm text-white/80">
                    {formatTimer(recordSeconds)}
                  </ThemedText>
                  <View className="flex-row items-center justify-center gap-8">
                    <TouchableOpacity
                      onPress={resetVoiceStep}
                      className="h-12 w-12 items-center justify-center rounded-full bg-white/10">
                      <Icon name="RotateCcw" size={22} color={ACCENT_SOFT} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={toggleRecord}
                      activeOpacity={0.9}
                      className="h-20 w-20 items-center justify-center rounded-full border-2 border-[#B98C44]/80"
                      style={{
                        shadowColor: ACCENT,
                        shadowOpacity: 0.45,
                        shadowRadius: 16,
                        shadowOffset: { width: 0, height: 0 },
                      }}>
                      <LinearGradient
                        colors={['#3a2a18', '#1a120a']}
                        style={styles.micInnerGradient}
                      />
                      <Icon
                        name={isPaused ? 'Mic' : isRecording ? 'Pause' : 'Mic'}
                        size={32}
                        color={ACCENT_SOFT}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={confirmVoice}
                      disabled={recordSeconds === 0 || voiceSubmitting}
                      className="h-12 w-12 items-center justify-center rounded-full bg-white/10">
                      {voiceSubmitting ? (
                        <ActivityIndicator size="small" color={ACCENT_SOFT} />
                      ) : (
                        <Icon
                          name="Check"
                          size={24}
                          color={recordSeconds > 0 && !voiceSubmitting ? ACCENT : '#555'}
                        />
                      )}
                    </TouchableOpacity>
                  </View>
                  <ThemedText className="mt-6 text-center text-xs text-white/40">
                    完成朗读后点击右侧确认进入下一步（最多 10 秒）
                  </ThemedText>
                  {voiceStatusText ? (
                    <ThemedText className="text-white/55 mt-2 text-center text-xs">
                      {voiceStatusText}
                    </ThemedText>
                  ) : null}
                </View>
              </View>
            ) : null}

            {phase === 'image' ? (
              <View className="items-center pb-8">
                <View className="relative h-64 w-full items-center justify-center">
                  {portraitUri ? (
                    <TouchableOpacity activeOpacity={0.88} onPress={selectPortraitSource}>
                      <Image source={{ uri: portraitUri }} className="h-40 w-40 rounded-full" />
                    </TouchableOpacity>
                  ) : (
                    <ImageBackground
                      source={{ uri: IMAGE_STEP_BG_URI }}
                      resizeMode="contain"
                      className="h-64 w-full items-center justify-center">
                      <TouchableOpacity
                        onPress={selectPortraitSource}
                        activeOpacity={0.88}
                        className="h-28 w-28 items-center justify-center rounded-full bg-white/10">
                        <Icon name="Camera" size={34} color="white" />
                      </TouchableOpacity>
                    </ImageBackground>
                  )}
                </View>
                <ThemedText className="mt-6 text-center text-sm text-white/75">
                  上传真人照片或现场拍摄，生成动漫数字形象
                </ThemedText>
                <View className="mt-8 w-full">
                  <GoldButton
                    label={portraitUri ? '生成数字形象' : '选择图片'}
                    onPress={() => {
                      if (!portraitUri) {
                        selectPortraitSource();
                        return;
                      }
                      startGenerateAvatar();
                    }}
                  />
                </View>
                {portraitUri ? (
                  <TouchableOpacity onPress={selectPortraitSource} className="mt-3 px-4 py-2">
                    <ThemedText className="text-sm text-white/70">重新上传</ThemedText>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            {phase === 'avatarLoading' ? (
              <View className="items-center pt-6">
                <View className="h-48 w-48 items-center justify-center rounded-full border border-[#B98C44]/40">
                  <ThemedText className="text-xl font-bold text-white">AI YOU</ThemedText>
                  <ThemedText className="mt-2 px-6 text-center text-xs text-white/60">
                    正在创建您的数字分身
                  </ThemedText>
                </View>
                <View className="mt-10 h-2 w-full overflow-hidden rounded-full bg-white/10">
                  <View
                    className="h-full rounded-full"
                    style={{ width: `${avatarProgress}%`, backgroundColor: ACCENT }}
                  />
                </View>
                <View className="mt-2 w-full flex-row justify-between">
                  <ThemedText className="text-white/45 text-xs">{avatarStatusText}</ThemedText>
                  <ThemedText className="text-xs text-white/80">{avatarProgress}%</ThemedText>
                </View>
                <ThemedText className="text-white/45 mt-6 text-center text-xs">
                  此头像将代表您的 AI 分身，用于对话与洞察展示。
                </ThemedText>
                <TouchableOpacity
                  onPress={() => {
                    avatarAbortRef.current?.abort();
                    avatarAbortRef.current = null;
                    setPhase('image');
                  }}
                  className="mt-10 w-full rounded-2xl bg-white/10 py-3.5">
                  <ThemedText className="text-center text-base font-semibold text-white">
                    取消
                  </ThemedText>
                </TouchableOpacity>
              </View>
            ) : null}

            {phase === 'avatarDone' ? (
              <View className="items-center pb-8">
                <View className="rounded-full border-2 p-1" style={{ borderColor: ACCENT }}>
                  <Image
                    source={
                      generatedAvatarUrl
                        ? { uri: bustAvatarCache(generatedAvatarUrl) }
                        : portraitUri
                          ? { uri: portraitUri }
                          : sampleAvatar
                    }
                    className="h-44 w-44 rounded-full"
                  />
                </View>
                <ThemedText className="mt-6 text-xl font-bold text-white">MouMou</ThemedText>
                <ThemedText className="mt-1 text-sm text-white/60">您的数字形象已生成</ThemedText>
                <ThemedText className="text-white/45 mt-6 px-2 text-center text-xs">
                  此头像将代表您的 AI 分身，用于对话与洞察展示。
                </ThemedText>
                <View className="mt-8 w-full gap-3">
                  <TouchableOpacity
                    onPress={() => startGenerateAvatar()}
                    className="w-full rounded-2xl bg-white/10 py-3.5">
                    <ThemedText className="text-center text-base font-semibold text-white">
                      重新生成
                    </ThemedText>
                  </TouchableOpacity>
                  <GoldButton label="确定" onPress={() => setPhase('interviewPreamble')} />
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
                  <GoldButton label="开始" onPress={() => router.back()} />
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
                  <Icon name="ArrowUp" size={20} color="#111" />
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screenFill: {
    flex: 1,
  },
  micInnerGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 9999,
  },
});
