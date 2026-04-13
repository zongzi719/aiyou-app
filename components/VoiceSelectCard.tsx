import { View, Text, Pressable, Animated, Easing, Dimensions } from 'react-native';
import { shadowPresets } from '@/utils/useShadow';
import Icon from './Icon';
import useThemeColors from '@/app/contexts/ThemeColors';
import { useState, useEffect } from 'react';
import { useRef } from 'react';
import LottieView from 'lottie-react-native';
import { Button } from './Button';
import { LinearGradient } from 'expo-linear-gradient';

interface VoiceItemProps {
    name: string;
    description: string;
    isSelected: boolean;
    onSelect: (name: string) => void;
};

export const VoiceSelectCard = (props: VoiceItemProps) => {
    const windowWidth = Dimensions.get('window').width;
    const colors = useThemeColors();
    const [isVisible, setIsVisible] = useState(false);
    const slideAnim = useRef(new Animated.Value(10)).current;
    
    // Create a separate scale value
    const [isScaled, setIsScaled] = useState(false);
    const scaleAnim = useRef(new Animated.Value(0.8)).current;
    
    // Toggle scale animation
    const toggleScale = () => {
        // Determine target scale value
        const toValue = isScaled ? 0.8 : 1;
        
        // Run animation
        Animated.timing(scaleAnim, {
            toValue,
            duration: 300,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
        }).start();
        
        // Toggle state
        setIsScaled(!isScaled);
    };

    const toggleVisibility = () => {
        const toValue = isVisible ? 10 : 0;
        Animated.timing(slideAnim, {
            toValue,
            duration: 300,
            easing: Easing.bezier(0.25, 0.1, 0.25, 1),
            useNativeDriver: false,
        }).start();
        setIsVisible(!isVisible);
    };

    // Function to handle the "Use" button click
    const handleUse = () => {
        props.onSelect(props.name);
    };

    return (
        <View style={{width: windowWidth/2 - 30}} className='relative p-1.5 mx-1.5 mb-3 bg-transparent rounded-3xl overflow-hidden'>
            {/* The gradient background that scales */}
            <Animated.View 
                style={{
                    overflow: 'hidden',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    transform: [{ scale: scaleAnim }]
                }}
                className="rounded-3xl"
            >
                <LinearGradient 
                    start={{ x: 0, y: 0 }} 
                    end={{ x: 1, y: 1 }} 
                    colors={['#FD984D', '#F77B79', '#F265D6']} 
                    style={{ width: '100%', height: '100%' }}
                />
            </Animated.View>
            <Pressable
                className={`w-full relative z-50 flex flex-col items-start ${props.isSelected ? 'bg-secondary' : 'bg-secondary'}`}
                onPress={() => {
                    toggleVisibility();
                    toggleScale();
                }}
                style={{ ...shadowPresets.card, borderRadius: 20 }}
            >
                <View className='p-global items-start'>
                    <Icon name={isVisible ? "Pause" : "Play"} fill={colors.icon} size={20} />
                    <Text className={`text-lg font-outfit-bold text-text mt-16`}>{props.name}</Text>
                    <Text className={`text-xs opacity-60 text-text -mt-px`}>{props.description}</Text>
                </View>
                <Animated.View 
                    style={{ 
                        opacity: slideAnim.interpolate({
                            inputRange: [0, 10],
                            outputRange: [1, 0]
                        }), 
                        transform: [{ translateY: slideAnim }] 
                    }} 
                    className='absolute bottom-4 left-0 w-full'
                >
                    <LottieView
                        autoPlay
                        style={{
                            width: '100%',
                            height: 150,
                        }}
                        source={require('@/assets/lottie/waves.json')}
                    />
                </Animated.View>
            </Pressable>
        </View>
    )
}