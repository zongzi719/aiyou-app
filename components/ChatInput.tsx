import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import LottieView from 'lottie-react-native';
import { useState, useEffect, useRef } from 'react';
import {
  Pressable,
  Image,
  View,
  Alert,
  Linking,
  Text,
  TextInput,
  TouchableOpacity,
  Platform,
  Dimensions,
  Keyboard,
  ImageBackground,
  Modal,
  FlatList,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  withTiming,
  withSpring,
  useSharedValue,
  interpolate,
  Easing,
  Extrapolation,
  Keyframe,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AnimatedView from './AnimatedView';
import { CardScroller } from './CardScroller';
import Icon from './Icon';
import { RecordingVoiceWave } from './RecordingVoiceWave';
import ThemedText from './ThemedText';

import useThemeColors from '@/app/contexts/ThemeColors';
import { useGlobalFloatingTabBarExtraBottom } from '@/hooks/useGlobalFloatingTabBarInset';
import { useStreamingAsr } from '@/hooks/useStreamingAsr';
import { setHomeRecordPanelVisible } from '@/lib/homeRecordPanelStore';
import { peekKnowledgeData } from '@/lib/listDataCache';
import { knowledgeApi, type KnowledgeFile } from '@/services/knowledgeApi';
import { shadowPresets } from '@/utils/useShadow';

// Exit animation for image removal
const imageExitAnimation = new Keyframe({
  0: { opacity: 1, transform: [{ scale: 1 }] },
  100: { opacity: 0, transform: [{ scale: 0.8 }] },
}).duration(120);

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

export interface SelectedFile {
  /** 本地文件 URI；来自知识库时可为空字符串，发送前再拉取 */
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
  /** 从知识库选择时填写，发送时用 download + 线程 uploads，选中时不拉本地 */
  knowledgeFileId?: string;
}

type ChatInputProps = {
  onSendMessage?: (text: string, images?: string[], files?: SelectedFile[]) => void;
  variant?: 'default' | 'home';
};

export const ChatInput = (props: ChatInputProps) => {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const floatingTabExtra = useGlobalFloatingTabBarExtraBottom();

  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [inputText, setInputText] = useState('');
  const [showHomeRecordPanel, setShowHomeRecordPanel] = useState(false);
  /** 点击✅等结束录音时立即收起底部语音区（不等 WS 关闭），提升响应 */
  const [homeVoiceSheetDismissed, setHomeVoiceSheetDismissed] = useState(false);
  const [isStoppingHomeRecording, setIsStoppingHomeRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [showSourceMenu, setShowSourceMenu] = useState(false);
  const [showKnowledgePicker, setShowKnowledgePicker] = useState(false);
  const [knowledgeFiles, setKnowledgeFiles] = useState<KnowledgeFile[]>([]);
  const [loadingKnowledgeFiles, setLoadingKnowledgeFiles] = useState(false);
  const lottieRef = useRef<LottieView>(null);
  const inputRef = useRef<any>(null);
  /** 本次流式识别开始前的输入框内容 */
  const asrPrefixRef = useRef('');
  const wasStreamingRef = useRef(false);
  // Android focus animation values
  const androidFocusProgress = useSharedValue(0);
  const overlayOpacity = useSharedValue(0);

  // Listen for keyboard show/hide on Android
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const keyboardShowListener = Keyboard.addListener('keyboardDidShow', () => {
      // Animate up when keyboard shows
      overlayOpacity.value = withTiming(1, { duration: 200 });
      androidFocusProgress.value = withTiming(1, {
        duration: 300,
        easing: Easing.out(Easing.cubic),
      });
    });

    const keyboardHideListener = Keyboard.addListener('keyboardDidHide', () => {
      // Animate down when keyboard hides
      androidFocusProgress.value = withTiming(0, {
        duration: 250,
        easing: Easing.in(Easing.cubic),
      });
      overlayOpacity.value = withTiming(0, { duration: 200 });
    });

    return () => {
      keyboardShowListener.remove();
      keyboardHideListener.remove();
    };
  }, []);

  const combineAsrPrefix = (prefix: string, session: string) => {
    if (!session.trim()) return prefix;
    if (!prefix.trim()) return session;
    return `${prefix} ${session}`;
  };

  const showMicPermissionGuide = () => {
    Alert.alert('语音识别', '需要麦克风权限才能使用语音输入', [
      { text: '取消', style: 'cancel' },
      {
        text: '去开启',
        onPress: () => {
          Linking.openSettings().catch(() => {
            Alert.alert('无法打开设置', '请手动前往系统设置开启麦克风权限');
          });
        },
      },
    ]);
  };

  const {
    isStreaming: isRecordingUI,
    meterLevel: streamMeterLevel,
    startStreaming,
    stopStreaming,
    cancelStreaming,
  } = useStreamingAsr({
    mode: 'chat',
    onPartialTranscript: (sessionText) => {
      setInputText(combineAsrPrefix(asrPrefixRef.current, sessionText));
    },
    onTranscript: (sessionText) => {
      setInputText(combineAsrPrefix(asrPrefixRef.current, sessionText));
    },
    onError: (msg) => {
      if (msg.includes('麦克风权限')) {
        showMicPermissionGuide();
        return;
      }
      Alert.alert('语音识别', msg);
    },
  });

  // Animation shared values
  const rotation = useSharedValue(0);
  const attachExpand = useSharedValue(0);
  const containerScale = useSharedValue(1);
  const audioButtonsVisible = useSharedValue(1);
  const stopButtonVisible = useSharedValue(0);
  const inputVisible = useSharedValue(1);
  const lottieVisible = useSharedValue(0);
  const sendButtonVisible = useSharedValue(0);

  // Animation config
  const animConfig = {
    duration: 280,
    easing: Easing.bezier(0.25, 0.1, 0.25, 1),
  };

  // Watch for text input changes to show/hide send button
  useEffect(() => {
    const hasText = inputText.trim().length > 0;
    if (hasText && !isRecordingUI) {
      // Hide audio buttons, show send
      audioButtonsVisible.value = withSpring(0, { damping: 90, stiffness: 600 });
      setTimeout(() => {
        sendButtonVisible.value = withSpring(1, { damping: 90, stiffness: 600 });
      }, 100);
    } else if (!hasText && !isRecordingUI) {
      // Show audio buttons, hide send
      sendButtonVisible.value = withSpring(0, { damping: 90, stiffness: 600 });
      setTimeout(() => {
        audioButtonsVisible.value = withSpring(1, { damping: 90, stiffness: 600 });
      }, 100);
    }
  }, [inputText, isRecordingUI]);

  // Toggle expand/collapse
  const handleToggle = () => {
    if (isExpanded) {
      // Collapse
      rotation.value = withTiming(0, animConfig);
      attachExpand.value = withTiming(0, animConfig);
      containerScale.value = withTiming(1, animConfig);

      setIsExpanded(false);
    } else {
      setTimeout(() => {
        rotation.value = withSpring(135, { damping: 90, stiffness: 600 });
        attachExpand.value = withSpring(1, { damping: 80, stiffness: 600 });
        containerScale.value = withSpring(1, { damping: 90, stiffness: 600 });
        // Settle back to 1
        setTimeout(() => {
          containerScale.value = withSpring(1, { damping: 90, stiffness: 600 });
        }, 150);
      }, 0);

      setIsExpanded(true);
    }
  };

  // Animated styles
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const containerStyle = useAnimatedStyle(() => {
    const width = interpolate(attachExpand.value, [0, 1], [40, 189], Extrapolation.CLAMP);
    return {
      width,
      overflow: 'hidden' as const,
      transform: [{ scale: containerScale.value }],
    };
  });

  const attachButtonStyle = useAnimatedStyle(() => ({
    opacity: attachExpand.value,
    transform: [{ scale: interpolate(attachExpand.value, [0, 1], [0.5, 1], Extrapolation.CLAMP) }],
  }));

  // Audio buttons (Mic + AudioLines) style
  const audioButtonsStyle = useAnimatedStyle(() => ({
    opacity: audioButtonsVisible.value,
    transform: [
      { scale: interpolate(audioButtonsVisible.value, [0, 1], [0.9, 1], Extrapolation.CLAMP) },
    ],
  }));

  // Stop button style
  const stopButtonStyle = useAnimatedStyle(() => ({
    opacity: stopButtonVisible.value,
    transform: [
      { scale: interpolate(stopButtonVisible.value, [0, 1], [0.9, 1], Extrapolation.CLAMP) },
    ],
  }));

  // Input fade style
  const inputStyle = useAnimatedStyle(() => ({
    opacity: inputVisible.value,
  }));

  // Lottie fade style
  const lottieStyle = useAnimatedStyle(() => ({
    opacity: lottieVisible.value,
  }));

  // Send button style
  const sendButtonStyle = useAnimatedStyle(() => ({
    opacity: sendButtonVisible.value,
    transform: [
      { scale: interpolate(sendButtonVisible.value, [0, 1], [0.5, 1], Extrapolation.CLAMP) },
    ],
  }));

  // Android overlay style
  const androidOverlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
    pointerEvents: overlayOpacity.value > 0 ? ('auto' as const) : ('none' as const),
  }));

  // Android input container position style
  const screenHeight = Dimensions.get('window').height;
  const androidInputStyle = useAnimatedStyle(() => {
    if (Platform.OS !== 'android') return {};

    const translateY = interpolate(
      androidFocusProgress.value,
      [0, 1],
      [0, -(screenHeight * 0.35)],
      Extrapolation.CLAMP
    );

    return {
      transform: [{ translateY }],
    };
  });

  // Close Android keyboard when overlay pressed
  const handleOverlayPress = () => {
    Keyboard.dismiss();
  };

  // Start streaming ASR (non-home variant)
  const handleStartRecording = async () => {
    const fadeConfig = { duration: 10, easing: Easing.out(Easing.ease) };

    try {
      setIsStoppingHomeRecording(false);
      asrPrefixRef.current = inputText;
      await startStreaming();

      // Hide Mic + AudioLines, show Stop
      audioButtonsVisible.value = withSpring(0, { damping: 100, stiffness: 600 });
      inputVisible.value = withTiming(0, fadeConfig);
      setTimeout(() => {
        stopButtonVisible.value = withSpring(1, { damping: 100, stiffness: 600 });
        lottieVisible.value = withTiming(1, fadeConfig);
      }, 100);
    } catch {
      Alert.alert('Error', 'Could not start recording. Please check microphone permissions.');
    }
  };

  /** 流式识别结束或取消后恢复底部动画（isRecordingUI 由 hook 驱动） */
  useEffect(() => {
    if (wasStreamingRef.current && !isRecordingUI) {
      const fadeConfig = { duration: 10, easing: Easing.out(Easing.ease) };
      stopButtonVisible.value = withSpring(0, { damping: 200, stiffness: 600 });
      lottieVisible.value = withTiming(0, fadeConfig);
      setTimeout(() => {
        audioButtonsVisible.value = withSpring(1, { damping: 200, stiffness: 600 });
        inputVisible.value = withTiming(1, fadeConfig);
      }, 100);
      setIsStoppingHomeRecording(false);
      setRecordingSeconds(0);
    }
    wasStreamingRef.current = isRecordingUI;
  }, [isRecordingUI]);

  useEffect(() => {
    if (!isRecordingUI) {
      setHomeVoiceSheetDismissed(false);
    }
  }, [isRecordingUI]);

  // Stop streaming：发送 end，等待 WS 关闭后由 effect 复位 UI
  const handleStopRecording = async () => {
    setIsStoppingHomeRecording(true);
    try {
      await stopStreaming();
    } catch (error) {
      Alert.alert(
        '识别失败',
        error instanceof Error ? error.message : '语音转文字失败，请稍后重试'
      );
    }
  };

  /** 首页：结束录音并立即收起底部语音面板（LayoutAnimation 过渡） */
  const handleHomeConfirmVoiceDone = async () => {
    if (isStoppingHomeRecording) return;
    Keyboard.dismiss();
    LayoutAnimation.configureNext(
      LayoutAnimation.create(
        200,
        LayoutAnimation.Types.easeInEaseOut,
        LayoutAnimation.Properties.opacity
      )
    );
    setHomeVoiceSheetDismissed(true);
    setShowHomeRecordPanel(false);
    setIsStoppingHomeRecording(true);
    try {
      await stopStreaming();
    } catch (error) {
      setHomeVoiceSheetDismissed(false);
      setIsStoppingHomeRecording(false);
      Alert.alert(
        '识别失败',
        error instanceof Error ? error.message : '语音转文字失败，请稍后重试'
      );
    }
  };

  const handleCancelRecording = async () => {
    LayoutAnimation.configureNext(
      LayoutAnimation.create(
        180,
        LayoutAnimation.Types.easeInEaseOut,
        LayoutAnimation.Properties.opacity
      )
    );
    setHomeVoiceSheetDismissed(true);
    setShowHomeRecordPanel(false);
    if (!isRecordingUI) return;
    setIsStoppingHomeRecording(true);
    try {
      await cancelStreaming();
      setInputText(asrPrefixRef.current);
    } catch {
      // 用户取消录音
    }
  };

  /** 主输入条麦克风：只展开录音面板，不自动开始录音（与设计图一致） */
  const openHomeRecordPanel = () => {
    Keyboard.dismiss();
    setHomeVoiceSheetDismissed(false);
    setShowHomeRecordPanel(true);
  };

  /** 面板中央：未录音时开始识别；录音中显示暂停图标，点击即结束本次录音（流式 ASR 无真暂停） */
  const handleHomePanelCenterPress = async () => {
    if (isStoppingHomeRecording) return;
    if (isRecordingUI) {
      await handleHomeConfirmVoiceDone();
      return;
    }
    try {
      asrPrefixRef.current = inputText;
      await startStreaming();
      setRecordingSeconds(0);
    } catch (error) {
      Alert.alert('录音失败', error instanceof Error ? error.message : '请检查麦克风权限后重试');
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert('需要相册权限', '请在系统设置中允许访问相册后重试。');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 9,
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const uris = result.assets.map((a) => a.uri);
      setSelectedImages((prev) => [...prev, ...uris]);
    }
  };

  const pickCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('需要相机权限', '请在系统设置中允许访问相机后重试。');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const uris = result.assets.map((a) => a.uri);
      setSelectedImages((prev) => [...prev, ...uris]);
    }
  };

  const removeImage = (indexToRemove: number) => {
    setSelectedImages((prev) => prev.filter((_, index) => index !== indexToRemove));
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets.length > 0) {
        const unsupported: string[] = [];
        const supported: SelectedFile[] = [];

        for (const a of result.assets) {
          const ext = a.name.split('.').pop()?.toLowerCase() ?? '';
          // 旧版 Word .doc 格式服务器无法转换，需要用 .docx 或 PDF
          if (ext === 'doc') {
            unsupported.push(a.name);
          } else {
            supported.push({
              uri: a.uri,
              name: a.name,
              mimeType: a.mimeType ?? 'application/octet-stream',
              size: a.size,
            });
          }
        }

        if (unsupported.length > 0) {
          Alert.alert(
            '格式不支持',
            `以下文件为旧版 Word 格式（.doc），请在 Word 中另存为 .docx 或 PDF 后重新上传：\n\n${unsupported.join('\n')}`,
            [{ text: '知道了' }]
          );
        }
        if (supported.length > 0) {
          setSelectedFiles((prev) => [...prev, ...supported]);
        }
      }
    } catch {
      Alert.alert('无法打开文件', '请重试');
    }
  };

  const removeFile = (indexToRemove: number) => {
    setSelectedFiles((prev) => prev.filter((_, index) => index !== indexToRemove));
  };

  const handleSendMessage = () => {
    if (isRecordingUI) return;
    const hasContent = inputText.trim() || selectedImages.length > 0 || selectedFiles.length > 0;
    if (props.onSendMessage && hasContent) {
      props.onSendMessage(
        inputText,
        selectedImages.length > 0 ? selectedImages : undefined,
        selectedFiles.length > 0 ? selectedFiles : undefined
      );
      setInputText('');
      setSelectedImages([]);
      setSelectedFiles([]);
    }
  };

  const isHomeVariant = props.variant === 'home';
  /** 顶部输入条是否与底部大面板同属「语音会话」态（点✅收起面板后切回紧凑条） */
  const homeInputVoiceSessionUi =
    (showHomeRecordPanel || isRecordingUI) && !homeVoiceSheetDismissed;
  const homeRecordPanelOpen =
    isHomeVariant && !homeVoiceSheetDismissed && (showHomeRecordPanel || isRecordingUI);
  /** 遮罩高度：输入条 + 间距 + 录音面板 + 安全区（与布局大致对齐，避免挡住面板） */
  const homeRecordPanelBodyPx = 200;
  const homeRecordDimmerBottom = 60 + 8 + homeRecordPanelBodyPx + Math.max(insets.bottom, 12);
  const homeRecordingTime = `${Math.floor(recordingSeconds / 60)
    .toString()
    .padStart(2, '0')} : ${(recordingSeconds % 60).toString().padStart(2, '0')}`;
  const homeVoiceWaveLevel = isRecordingUI ? streamMeterLevel : 0;
  const homeVoiceWaveActive = isRecordingUI;

  useEffect(() => {
    if (!isRecordingUI || isStoppingHomeRecording) return;
    const timer = setInterval(() => {
      setRecordingSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isRecordingUI, isStoppingHomeRecording]);

  useEffect(() => {
    setHomeRecordPanelVisible(homeRecordPanelOpen);
    return () => {
      setHomeRecordPanelVisible(false);
    };
  }, [homeRecordPanelOpen]);

  const appendPickedFiles = (files: SelectedFile[]) => {
    if (files.length === 0) return;
    setSelectedFiles((prev) => [...prev, ...files]);
  };

  const handleSelectLocalFile = async () => {
    setShowSourceMenu(false);
    await pickDocument();
  };

  const handleSelectKnowledgeBase = async () => {
    setShowSourceMenu(false);
    setShowKnowledgePicker(true);
    setLoadingKnowledgeFiles(true);
    try {
      // 与知识库页一致：不传 folder_id；先带分页，仍为空则不带 query（与 loadData 完全相同）
      let { files } = await knowledgeApi.getFiles({ page: 1, page_size: 200 });
      if (files.length === 0) {
        ({ files } = await knowledgeApi.getFiles());
      }
      if (files.length === 0) {
        const cached = peekKnowledgeData();
        if (cached?.files?.length) {
          files = cached.files;
        }
      }
      setKnowledgeFiles(files);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '获取知识库文件失败';
      Alert.alert('读取失败', msg);
      setShowKnowledgePicker(false);
    } finally {
      setLoadingKnowledgeFiles(false);
    }
  };

  const handlePickKnowledgeFile = (file: KnowledgeFile) => {
    appendPickedFiles([
      {
        uri: '',
        name: file.filename,
        mimeType: file.mime_type || 'application/octet-stream',
        size: file.file_size,
        knowledgeFileId: file.id,
      },
    ]);
    setShowKnowledgePicker(false);
  };

  return (
    <>
      {isHomeVariant && homeRecordPanelOpen ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="关闭录音面板"
          onPress={() => {
            handleCancelRecording().catch(() => {});
          }}
          className="absolute left-0 right-0 top-0 z-[998] bg-black/40"
          style={{ bottom: homeRecordDimmerBottom }}
        />
      ) : null}
      {/* Android overlay when focused */}
      {Platform.OS === 'android' && (
        <Animated.View
          style={[
            androidOverlayStyle,
            {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0)',
              zIndex: 998,
            },
          ]}>
          <Pressable style={{ flex: 1 }} onPress={handleOverlayPress} />
        </Animated.View>
      )}

      <Animated.View
        style={[
          {
            paddingBottom: homeRecordPanelOpen ? 0 : insets.bottom + floatingTabExtra,
            zIndex: 999,
          },
          Platform.OS === 'android' ? androidInputStyle : {},
        ]}
        className="absolute bottom-0 left-0 right-0 w-full">
        <View className="px-global">
          {selectedImages.length > 0 && (
            <View className="mb-0">
              <ScrollableImageList images={selectedImages} onRemove={removeImage} />
            </View>
          )}

          {selectedFiles.length > 0 && (
            <View className="mb-2 flex-row flex-wrap gap-2 px-1">
              {selectedFiles.map((file, index) => (
                <FileAttachmentBadge
                  key={`${file.uri}-${index}`}
                  file={file}
                  onRemove={() => removeFile(index)}
                />
              ))}
            </View>
          )}

          <View
            style={{ ...shadowPresets.card }}
            className={`${isHomeVariant ? '' : 'rounded-[25px] border border-border bg-background'}`}>
            {isHomeVariant ? (
              <View className="gap-2 pb-1">
                {homeInputVoiceSessionUi ? (
                  <View className="flex-row items-end">
                    <Pressable
                      onPress={() => setShowSourceMenu(true)}
                      className="mr-2 h-[56px] w-[56px] items-center justify-center"
                      accessibilityRole="button"
                      accessibilityLabel="添加来源">
                      <Image
                        source={require('@/assets/images/chat-link-btn.png')}
                        resizeMode="contain"
                        className="h-[56px] w-[56px]"
                      />
                    </Pressable>
                    <ImageBackground
                      source={require('@/assets/images/chat-input-normal-bg.png')}
                      resizeMode="stretch"
                      className="h-[60px] flex-1 flex-row items-center rounded-full bg-[#1A1F28]/95 pl-5 pr-3">
                      <TextInput
                        ref={inputRef}
                        placeholder="问一问AI YOU"
                        placeholderTextColor="rgba(255,255,255,0.5)"
                        className="flex-1 py-0 text-[14px] text-white"
                        value={inputText}
                        onChangeText={setInputText}
                        onSubmitEditing={handleSendMessage}
                        returnKeyType="send"
                        multiline={false}
                      />
                      <Pressable
                        onPress={handleSendMessage}
                        disabled={inputText.trim().length === 0 || isRecordingUI}
                        className="bg-white/18 h-[36px] w-[36px] items-center justify-center rounded-full"
                        accessibilityRole="button"
                        accessibilityLabel="发送">
                        <Icon
                          name="ArrowUp"
                          size={20}
                          color={
                            inputText.trim().length > 0 && !isRecordingUI
                              ? 'white'
                              : 'rgba(255,255,255,0.65)'
                          }
                        />
                      </Pressable>
                    </ImageBackground>
                  </View>
                ) : (
                  <View className="flex-row items-end">
                    <Pressable
                      onPress={() => setShowSourceMenu(true)}
                      className="mr-2 h-[56px] w-[56px] items-center justify-center"
                      accessibilityRole="button"
                      accessibilityLabel="添加来源">
                      <Image
                        source={require('@/assets/images/chat-link-btn.png')}
                        resizeMode="contain"
                        className="h-[56px] w-[56px]"
                      />
                    </Pressable>
                    <ImageBackground
                      source={require('@/assets/images/chat-input-normal-bg.png')}
                      resizeMode="stretch"
                      className="h-[60px] flex-1 flex-row items-center rounded-full bg-[#1A1F28]/95 pl-5 pr-3">
                      <TextInput
                        ref={inputRef}
                        placeholder="问一问AI YOU"
                        placeholderTextColor="rgba(255,255,255,0.5)"
                        className="flex-1 py-0 text-[14px] text-white"
                        value={inputText}
                        onChangeText={setInputText}
                        onSubmitEditing={handleSendMessage}
                        returnKeyType="send"
                        multiline={false}
                      />
                      <View className="flex-row items-center gap-2">
                        <Pressable
                          onPress={openHomeRecordPanel}
                          disabled={isRecordingUI}
                          className={`border-white/28 bg-black/35 h-[34px] w-[34px] items-center justify-center rounded-full border ${isRecordingUI ? 'opacity-45' : ''}`}
                          accessibilityRole="button"
                          accessibilityLabel="录音">
                          <Icon name="Mic" size={17} color="white" />
                        </Pressable>
                        <Pressable
                          onPress={pickCamera}
                          className="border-white/28 bg-black/35 h-[34px] w-[34px] items-center justify-center rounded-full border"
                          accessibilityRole="button"
                          accessibilityLabel="拍照">
                          <Icon name="Camera" size={17} color="white" />
                        </Pressable>
                      </View>
                    </ImageBackground>
                  </View>
                )}
              </View>
            ) : (
              <LinearGradient
                style={{ borderRadius: 25 }}
                colors={['transparent', 'transparent', 'rgba(255,255,255,0.1)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}>
                <View className="relative min-h-[60px]">
                  {/* Lottie waveform */}
                  <Animated.View
                    style={[lottieStyle, { position: 'absolute', width: '100%', height: '100%' }]}
                    pointerEvents={isRecordingUI ? 'auto' : 'none'}>
                    <LottieView
                      ref={lottieRef}
                      autoPlay
                      loop
                      style={{
                        width: '100%',
                        height: 65,
                        position: 'absolute',
                        left: 0,
                        bottom: -12,
                        zIndex: 40,
                      }}
                      source={require('@/assets/lottie/waves.json')}
                    />
                  </Animated.View>

                  {/* Text Input */}
                  <Animated.View style={inputStyle} pointerEvents={isRecordingUI ? 'none' : 'auto'}>
                    <TextInput
                      ref={inputRef}
                      placeholder={isHomeVariant ? '问一问AI YOU' : 'Ask me anything...'}
                      placeholderTextColor={isHomeVariant ? 'rgba(255,255,255,0.65)' : colors.text}
                      className={`px-6 py-5 ${isHomeVariant ? 'text-white' : 'text-text'}`}
                      value={inputText}
                      onChangeText={setInputText}
                      style={{ minHeight: 60 }}
                      multiline
                    />
                  </Animated.View>
                </View>
                <View className="flex-row justify-between rounded-b-3xl px-4 pb-2 pt-4">
                  <View className="-ml-2 flex-1 flex-row items-center gap-x-2">
                    {/* Expandable container for plus + attachment buttons */}
                    <Animated.View
                      style={[containerStyle]}
                      className={`flex-row items-center gap-3 rounded-full border p-1.5 ${
                        isExpanded
                          ? isHomeVariant
                            ? 'border-white/30 bg-[#172331]/90'
                            : 'border-border bg-background'
                          : 'border-transparent'
                      }`}>
                      <Pressable
                        onPress={handleToggle}
                        className={`h-10 w-10 items-center justify-center rounded-[18px] border ${
                          isHomeVariant
                            ? 'border-white/35 bg-[#273748]'
                            : 'border-border bg-background'
                        }`}>
                        <Animated.View style={iconStyle}>
                          <Icon
                            name="Plus"
                            size={20}
                            color={isHomeVariant ? '#FFFFFF' : undefined}
                          />
                        </Animated.View>
                      </Pressable>

                      {/* Attachment buttons */}
                      <Animated.View style={attachButtonStyle}>
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={pickImage}
                          className="h-10 w-10 items-center justify-center rounded-full">
                          <Icon name="Image" size={20} />
                        </TouchableOpacity>
                      </Animated.View>
                      <Animated.View style={attachButtonStyle}>
                        <TouchableOpacity
                          activeOpacity={0.8}
                          className="h-10 w-10 items-center justify-center rounded-full">
                          <Icon name="Camera" size={20} />
                        </TouchableOpacity>
                      </Animated.View>
                      <Animated.View style={attachButtonStyle}>
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={pickDocument}
                          className="h-10 w-10 items-center justify-center rounded-full">
                          <Icon name="File" size={20} />
                        </TouchableOpacity>
                      </Animated.View>
                    </Animated.View>
                  </View>

                  <View className="flex-row items-center gap-x-2">
                    {/* Mic + AudioLines - fade out when recording */}
                    <Animated.View style={audioButtonsStyle} className="flex-row gap-x-2">
                      <Pressable
                        onPress={handleStartRecording}
                        className="h-10 w-10 items-center justify-center rounded-full">
                        <Icon name="Mic" size={20} />
                      </Pressable>
                      <Pressable
                        onPress={handleStartRecording}
                        className="bg-highlight flex h-10 w-10 items-center justify-center rounded-full">
                        <Icon name="AudioLines" size={18} color="#ffffff" />
                      </Pressable>
                    </Animated.View>

                    {/* Stop button - fade in when recording */}
                    {isRecordingUI && (
                      <Animated.View style={[stopButtonStyle, { position: 'absolute', right: 0 }]}>
                        <Pressable
                          onPress={handleStopRecording}
                          className="h-10 flex-row items-center justify-center gap-2 rounded-full bg-sky-500 px-4">
                          <Icon name="Check" size={12} color="white" />
                          <Text className="text-sm font-semibold text-white">Done</Text>
                        </Pressable>
                      </Animated.View>
                    )}

                    {/* Send button - fade in when typing */}
                    {!isRecordingUI && (
                      <Animated.View style={[sendButtonStyle, { position: 'absolute', right: 0 }]}>
                        <Pressable
                          onPress={handleSendMessage}
                          className="bg-highlight flex h-10 w-10 items-center justify-center rounded-full">
                          <Icon name="Send" size={18} color="#ffffff" />
                        </Pressable>
                      </Animated.View>
                    )}
                  </View>
                </View>
              </LinearGradient>
            )}
          </View>
        </View>
        {isHomeVariant && homeRecordPanelOpen ? (
          <View className="mt-2 w-full">
            <ImageBackground
              source={require('@/assets/images/record-panel-bg.png')}
              resizeMode="stretch"
              className="w-full overflow-hidden rounded-t-[34px] border-t border-white/20 bg-[#12161F]/95"
              style={{ paddingBottom: Math.max(insets.bottom, 8) }}>
              <View
                className="w-full flex-col"
                style={{ height: homeRecordPanelBodyPx, paddingHorizontal: 8 }}>
                <View className="items-center pt-2">
                  <ThemedText
                    className={
                      isRecordingUI
                        ? 'text-[20px] font-medium leading-[26px] text-[#A5A5A5]'
                        : 'text-[15px] leading-[20px] text-[#A5A5A5]'
                    }>
                    {isRecordingUI ? homeRecordingTime : '点击录音'}
                  </ThemedText>
                </View>

                <View className="min-h-0 flex-1 flex-row items-center justify-center">
                  {isRecordingUI ? (
                    <Pressable
                      onPress={() => {
                        handleCancelRecording().catch(() => {});
                      }}
                      className="absolute left-5 z-10 h-[40px] w-[40px] items-center justify-center rounded-full border border-white/20 bg-[#111827]/90">
                      <Icon name="RefreshCw" size={21} color="white" />
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={() => {
                      handleHomePanelCenterPress().catch(() => {});
                    }}
                    className="h-[72px] w-[72px] items-center justify-center rounded-[36px] border border-[#F5C65A]/80 bg-[#2E3440]">
                    <Icon
                      name={isRecordingUI ? 'Pause' : 'Mic'}
                      size={30}
                      color="#FFFFFF"
                      strokeWidth={isRecordingUI ? 2.4 : 2}
                    />
                  </Pressable>
                  {isRecordingUI ? (
                    <Pressable
                      onPress={() => {
                        handleHomeConfirmVoiceDone().catch(() => {});
                      }}
                      className="absolute right-5 z-10 h-[40px] w-[40px] items-center justify-center rounded-full border border-white/20 bg-[#111827]/90">
                      <Icon name="Check" size={22} color="white" />
                    </Pressable>
                  ) : null}
                </View>

                <View className="px-2 pb-2">
                  <RecordingVoiceWave level={homeVoiceWaveLevel} active={homeVoiceWaveActive} />
                </View>
              </View>
            </ImageBackground>
          </View>
        ) : null}
      </Animated.View>

      <Modal
        visible={showSourceMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSourceMenu(false)}>
        <Pressable className="flex-1" onPress={() => setShowSourceMenu(false)}>
          <View
            className="absolute left-4 w-[210px] rounded-2xl border border-white/10 bg-[#2A2C32] px-4 py-3"
            style={{ bottom: insets.bottom + floatingTabExtra + 62 }}>
            <Pressable
              className="border-white/8 flex-row items-center border-b py-3"
              onPress={() => {
                handleSelectKnowledgeBase().catch(() => {});
              }}>
              <Icon name="LibraryBig" size={20} color="white" />
              <ThemedText className="ml-3 text-[16px] text-white">知识库</ThemedText>
            </Pressable>
            <Pressable
              className="border-white/8 flex-row items-center border-b py-3"
              onPress={handleSelectLocalFile}>
              <Icon name="File" size={20} color="white" />
              <ThemedText className="ml-3 text-[16px] text-white">本地文件</ThemedText>
            </Pressable>
            <Pressable
              className="border-white/8 flex-row items-center border-b py-3"
              onPress={() => Alert.alert('暂未接入', '微信文件能力后续接入')}>
              <Icon name="MessageCircleMore" size={20} color="white" />
              <ThemedText className="ml-3 text-[16px] text-white">微信文件</ThemedText>
            </Pressable>
            <Pressable
              className="flex-row items-center pt-3"
              onPress={() => Alert.alert('暂未接入', '腾讯文档能力后续接入')}>
              <Icon name="FileText" size={20} color="white" />
              <ThemedText className="ml-3 text-[16px] text-white">腾讯文档</ThemedText>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={showKnowledgePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowKnowledgePicker(false)}>
        <View className="flex-1 justify-end bg-black/60">
          <Pressable className="flex-1" onPress={() => setShowKnowledgePicker(false)} />
          <View className="max-h-[70%] rounded-t-3xl bg-[#1F2127] px-4 pb-6 pt-4">
            <View className="mb-3 flex-row items-center justify-between">
              <ThemedText className="text-[17px] text-white">选择知识库文件</ThemedText>
              <Pressable onPress={() => setShowKnowledgePicker(false)}>
                <Icon name="X" size={20} color="white" />
              </Pressable>
            </View>
            {loadingKnowledgeFiles ? (
              <View className="items-center py-8">
                <ThemedText className="text-white/70">正在加载文件...</ThemedText>
              </View>
            ) : (
              <FlatList
                data={knowledgeFiles}
                keyExtractor={(item) => item.id}
                ListEmptyComponent={
                  <View className="items-center py-8">
                    <ThemedText className="text-white/70">暂无可用知识库文件</ThemedText>
                  </View>
                }
                renderItem={({ item }) => (
                  <Pressable
                    className="flex-row items-center border-b border-white/10 py-3"
                    onPress={() => handlePickKnowledgeFile(item)}>
                    <Icon name="FileText" size={18} color="white" />
                    <View className="ml-3 flex-1">
                      <ThemedText className="text-[14px] text-white" numberOfLines={1}>
                        {item.filename}
                      </ThemedText>
                      <ThemedText className="mt-1 text-[12px] text-white/60" numberOfLines={1}>
                        {[
                          item.mime_type,
                          item.status === 'processing'
                            ? '处理中'
                            : item.status === 'queued'
                              ? '排队中'
                              : item.status === 'error'
                                ? '处理失败'
                                : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </ThemedText>
                    </View>
                  </Pressable>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </>
  );
};

const FileAttachmentBadge = ({ file, onRemove }: { file: SelectedFile; onRemove: () => void }) => {
  const ext = file.name.split('.').pop()?.toUpperCase() ?? 'FILE';
  const displayName = file.name.length > 20 ? `${file.name.slice(0, 18)}…` : file.name;
  return (
    <View className="flex-row items-center gap-x-2 rounded-2xl border border-border bg-secondary px-3 py-2">
      <View className="bg-highlight h-7 w-7 items-center justify-center rounded-lg">
        <Text className="text-[9px] font-bold text-white">{ext.slice(0, 4)}</Text>
      </View>
      <Text className="max-w-[120px] text-xs font-medium text-primary" numberOfLines={1}>
        {displayName}
      </Text>
      <Pressable onPress={onRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Icon name="X" size={13} />
      </Pressable>
    </View>
  );
};

const ScrollableImageList = ({
  images,
  onRemove,
}: {
  images: string[];
  onRemove: (index: number) => void;
}) => {
  return (
    <CardScroller className="mb-2 pb-0" space={5}>
      {images.map((uri, index) => (
        <Animated.View key={`${uri}-${index}`} exiting={imageExitAnimation} className="relative">
          <AnimatedView animation="scaleIn" duration={200} delay={200}>
            <Image source={{ uri }} className="h-20 w-20 rounded-2xl" />
            <Pressable
              onPress={() => onRemove(index)}
              className="absolute right-1 top-1 h-6 w-6 items-center justify-center rounded-full bg-black/50">
              <Icon name="X" size={12} color="white" />
            </Pressable>
          </AnimatedView>
        </Animated.View>
      ))}
    </CardScroller>
  );
};
