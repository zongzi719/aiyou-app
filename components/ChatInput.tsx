import { Pressable, Image, View, Alert, Text, TextInput, TouchableOpacity, Platform, Dimensions, Keyboard } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "./Icon";
import { shadowPresets } from "@/utils/useShadow";
import AnimatedView from "./AnimatedView";
import { useState, useEffect, useRef } from "react";
import Animated, {
    useAnimatedStyle,
    withTiming,
    withSpring,
    useSharedValue,
    interpolate,
    Easing,
    Extrapolation,
    Keyframe,
} from "react-native-reanimated";
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { CardScroller } from "./CardScroller";
import useThemeColors from "@/app/contexts/ThemeColors";
import { useGlobalFloatingTabBarExtraBottom } from "@/hooks/useGlobalFloatingTabBarInset";
import { LinearGradient } from "expo-linear-gradient";
import LottieView from "lottie-react-native";
import { useRecording } from "@/hooks/useRecording";
import { ShimmerText } from "./ShimmerText";

// Exit animation for image removal
const imageExitAnimation = new Keyframe({
    0: { opacity: 1, transform: [{ scale: 1 }] },
    100: { opacity: 0, transform: [{ scale: 0.8 }] },
}).duration(120);



export interface SelectedFile {
    uri: string;
    name: string;
    mimeType: string;
    size?: number;
}

type ChatInputProps = {
    onSendMessage?: (text: string, images?: string[], files?: SelectedFile[]) => void;
};


export const ChatInput = (props: ChatInputProps) => {
    const colors = useThemeColors();
    const insets = useSafeAreaInsets();
    const floatingTabExtra = useGlobalFloatingTabBarExtraBottom();

    const [isExpanded, setIsExpanded] = useState(false);
    const [selectedImages, setSelectedImages] = useState<string[]>([]);
    const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
    const [inputText, setInputText] = useState('');
    const [isRecordingUI, setIsRecordingUI] = useState(false);
    const lottieRef = useRef<LottieView>(null);
    const inputRef = useRef<any>(null);

    // Android focus animation values
    const androidFocusProgress = useSharedValue(0);
    const overlayOpacity = useSharedValue(0);

    // Listen for keyboard show/hide on Android
    useEffect(() => {
        if (Platform.OS !== 'android') return;

        const keyboardShowListener = Keyboard.addListener('keyboardDidShow', () => {
            // Animate up when keyboard shows
            overlayOpacity.value = withTiming(1, { duration: 200 });
            androidFocusProgress.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) });
        });

        const keyboardHideListener = Keyboard.addListener('keyboardDidHide', () => {
            // Animate down when keyboard hides
            androidFocusProgress.value = withTiming(0, { duration: 250, easing: Easing.in(Easing.cubic) });
            overlayOpacity.value = withTiming(0, { duration: 200 });
        });

        return () => {
            keyboardShowListener.remove();
            keyboardHideListener.remove();
        };
    }, []);

    // Recording hook
    const { isTranscribing, startRecording, stopRecording, transcribeAudio } = useRecording();

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
        transform: [{ rotate: `${rotation.value}deg` }]
    }));

    const containerStyle = useAnimatedStyle(() => {
        const width = interpolate(
            attachExpand.value,
            [0, 1],
            [40, 189],
            Extrapolation.CLAMP
        );
        return {
            width,
            overflow: 'hidden' as const,
            transform: [{ scale: containerScale.value }],
        };
    });

    const attachButtonStyle = useAnimatedStyle(() => ({
        opacity: attachExpand.value,
        transform: [
            { scale: interpolate(attachExpand.value, [0, 1], [0.5, 1], Extrapolation.CLAMP) },
        ],
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
        pointerEvents: overlayOpacity.value > 0 ? 'auto' as const : 'none' as const,
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

    // Start recording
    const handleStartRecording = async () => {
        const fadeConfig = { duration: 10, easing: Easing.out(Easing.ease) };

        try {
            await startRecording();

            // Hide Mic + AudioLines, show Stop
            audioButtonsVisible.value = withSpring(0, { damping: 100, stiffness: 600 });
            inputVisible.value = withTiming(0, fadeConfig);
            setTimeout(() => {
                stopButtonVisible.value = withSpring(1, { damping: 100, stiffness: 600 });
                lottieVisible.value = withTiming(1, fadeConfig);
            }, 100);

            setIsRecordingUI(true);
        } catch (error) {
            Alert.alert('Error', 'Could not start recording. Please check microphone permissions.');
        }
    };

    // Stop recording and transcribe
    const handleStopRecording = async () => {
        const fadeConfig = { duration: 10, easing: Easing.out(Easing.ease) };

        // Show Mic + AudioLines, hide Stop
        stopButtonVisible.value = withSpring(0, { damping: 200, stiffness: 600 });
        lottieVisible.value = withTiming(0, fadeConfig);
        setTimeout(() => {
            audioButtonsVisible.value = withSpring(1, { damping: 200, stiffness: 600 });
            inputVisible.value = withTiming(1, fadeConfig);
        }, 100);

        setIsRecordingUI(false);

        try {
            const audioUri = await stopRecording();
            if (audioUri) {
                const transcription = await transcribeAudio(audioUri);
                setInputText(prev => prev ? `${prev} ${transcription}` : transcription);
            }
        } catch (error) {
            Alert.alert('Error', error instanceof Error ? error.message : 'Transcription failed');
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
            setSelectedImages(prev => [...prev, ...uris]);
        }
    };

    const removeImage = (indexToRemove: number) => {
        setSelectedImages(prev => prev.filter((_, index) => index !== indexToRemove));
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
        setSelectedFiles(prev => prev.filter((_, index) => index !== indexToRemove));
    };

    const handleSendMessage = () => {
        const hasContent = inputText.trim() || selectedImages.length > 0 || selectedFiles.length > 0;
        if (props.onSendMessage && hasContent) {
            props.onSendMessage(
                inputText,
                selectedImages.length > 0 ? selectedImages : undefined,
                selectedFiles.length > 0 ? selectedFiles : undefined,
            );
            setInputText('');
            setSelectedImages([]);
            setSelectedFiles([]);
        }
    };

    return (
        <>
            {/* Android overlay when focused */}
            {Platform.OS === 'android' && (
                <Animated.View
                    style={[androidOverlayStyle, { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0)', zIndex: 998 }]}
                >
                    <Pressable style={{ flex: 1 }} onPress={handleOverlayPress} />
                </Animated.View>
            )}

            <Animated.View
                style={[
                    { paddingBottom: insets.bottom + floatingTabExtra, zIndex: 999 },
                    Platform.OS === 'android' ? androidInputStyle : {}
                ]}
                className="px-global w-full absolute bottom-0 left-0 right-0"
            >
            {selectedImages.length > 0 && (
                <View className="mb-0">
                    <ScrollableImageList
                        images={selectedImages}
                        onRemove={removeImage}
                    />
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

            <View style={{ ...shadowPresets.card }} className="bg-background rounded-[25px] border border-border">
                <LinearGradient style={{ borderRadius: 25 }} colors={['transparent', 'transparent', 'rgba(255,255,255,0.1)']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}>
                    <View className="relative min-h-[60px]">
                        {/* Lottie waveform */}
                        <Animated.View style={[lottieStyle, { position: 'absolute', width: '100%', height: '100%' }]} pointerEvents={isRecordingUI ? 'auto' : 'none'}>
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
                                    zIndex: 40
                                }}
                                source={require('@/assets/lottie/waves.json')}
                            />
                        </Animated.View>

                        {/* Text Input */}
                        <Animated.View style={inputStyle} pointerEvents={isRecordingUI ? 'none' : 'auto'}>
                            {isTranscribing ? (
                                <View className="px-6 py-5" style={{ minHeight: 60, justifyContent: 'center' }}>
                                    <ShimmerText text="Transcribing..." className="text-base text-text" />
                                </View>
                            ) : (
                                <TextInput
                                    ref={inputRef}
                                    placeholder="Ask me anything..."
                                    placeholderTextColor={colors.text}
                                    className='text-text px-6 py-5'
                                    value={inputText}
                                    onChangeText={setInputText}
                                    style={{ minHeight: 60 }}
                                    multiline={true}
                                />
                            )}
                        </Animated.View>
                    </View>
                    <View className='flex-row justify-between px-4 pt-4 pb-2 rounded-b-3xl'>
                        <View className='flex-row gap-x-2 flex-1 items-center -ml-2'>
                            {/* Expandable container for plus + attachment buttons */}
                            <Animated.View
                                style={[containerStyle]}
                                className={`flex-row p-1.5 items-center border rounded-full gap-3 ${isExpanded ? 'bg-background border-border' : ' border-transparent'}`}
                            >
                                <Pressable onPress={handleToggle} className='items-center justify-center w-10 h-10 rounded-full'>
                                    <Animated.View style={iconStyle}>
                                        <Icon name="Plus" size={20} />
                                    </Animated.View>
                                </Pressable>

                                {/* Attachment buttons */}
                                <Animated.View style={attachButtonStyle}>
                                    <TouchableOpacity activeOpacity={0.8} onPress={pickImage} className='items-center justify-center w-10 h-10 rounded-full'>
                                        <Icon name="Image" size={20} />
                                    </TouchableOpacity>
                                </Animated.View>
                                <Animated.View style={attachButtonStyle}>
                                    <TouchableOpacity activeOpacity={0.8} className='items-center justify-center w-10 h-10 rounded-full'>
                                        <Icon name="Camera" size={20} />
                                    </TouchableOpacity>
                                </Animated.View>
                                <Animated.View style={attachButtonStyle}>
                                    <TouchableOpacity activeOpacity={0.8} onPress={pickDocument} className='items-center justify-center w-10 h-10 rounded-full'>
                                        <Icon name="File" size={20} />
                                    </TouchableOpacity>
                                </Animated.View>
                            </Animated.View>
                        </View>

                        <View className='flex-row gap-x-2 items-center'>
                            {/* Mic + AudioLines - fade out when recording */}
                            <Animated.View style={audioButtonsStyle} className='flex-row gap-x-2'>
                                <Pressable
                                    onPress={handleStartRecording}
                                    className='items-center justify-center w-10 h-10 rounded-full'>
                                    <Icon name='Mic' size={20} />
                                </Pressable>
                                <Pressable
                                    onPress={handleStartRecording}
                                    className='items-center flex justify-center w-10 h-10 bg-primary rounded-full'>
                                    <Icon name='AudioLines' size={18} color={colors.invert} />
                                </Pressable>
                            </Animated.View>

                            {/* Stop button - fade in when recording */}
                            {isRecordingUI && (
                                <Animated.View style={[stopButtonStyle, { position: 'absolute', right: 0 }]}>
                                    <Pressable
                                        onPress={handleStopRecording}
                                        className='items-center flex-row justify-center h-10 px-4 bg-sky-500 rounded-full gap-2'>
                                        <Icon name='Check' size={12} color="white" />
                                        <Text className='text-white font-semibold text-sm'>Done</Text>
                                    </Pressable>
                                </Animated.View>
                            )}

                            {/* Send button - fade in when typing */}
                            {!isRecordingUI && (
                                <Animated.View style={[sendButtonStyle, { position: 'absolute', right: 0 }]}>
                                    <Pressable
                                        onPress={handleSendMessage}
                                        className='items-center flex justify-center w-10 h-10 bg-primary rounded-full'>
                                        <Icon name='Send' size={18} color={colors.invert} />
                                    </Pressable>
                                </Animated.View>
                            )}
                        </View>
                    </View>
                </LinearGradient>
            </View>
        </Animated.View>
        </>
    );
}

const FileAttachmentBadge = ({ file, onRemove }: { file: SelectedFile; onRemove: () => void }) => {
    const ext = file.name.split('.').pop()?.toUpperCase() ?? 'FILE';
    const displayName = file.name.length > 20 ? `${file.name.slice(0, 18)}…` : file.name;
    return (
        <View className="flex-row items-center bg-secondary rounded-2xl px-3 py-2 gap-x-2 border border-border">
            <View className="w-7 h-7 rounded-lg bg-primary items-center justify-center">
                <Text className="text-invert text-[9px] font-bold">{ext.slice(0, 4)}</Text>
            </View>
            <Text className="text-primary text-xs font-medium max-w-[120px]" numberOfLines={1}>
                {displayName}
            </Text>
            <Pressable onPress={onRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Icon name="X" size={13} />
            </Pressable>
        </View>
    );
};

const ScrollableImageList = ({ images, onRemove }: { images: string[], onRemove: (index: number) => void }) => {
    return (
        <CardScroller className="mb-2 pb-0" space={5}>
            {images.map((uri, index) => (
                <Animated.View
                    key={`${uri}-${index}`}
                    exiting={imageExitAnimation}
                    className="relative"
                >
                    <AnimatedView animation="scaleIn" duration={200} delay={200}>
                        <Image
                            source={{ uri }}
                            className="w-20 h-20 rounded-2xl"
                        />
                        <Pressable
                            onPress={() => onRemove(index)}
                            className="absolute top-1 right-1 bg-black/50 rounded-full w-6 h-6 items-center justify-center"
                        >
                            <Icon name="X" size={12} color="white" />
                        </Pressable>
                    </AnimatedView>
                </Animated.View>
            ))}
        </CardScroller>
    );
};
