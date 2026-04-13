import React, { useEffect } from 'react';
import { Text, StyleSheet } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    Easing,
} from 'react-native-reanimated';
import useThemeColors from '@/app/contexts/ThemeColors';

type ShimmerTextProps = {
    text: string;
    className?: string;
    duration?: number;
};

export const ShimmerText = ({ text, className, duration = 4000 }: ShimmerTextProps) => {
    const colors = useThemeColors();
    const translateX = useSharedValue(-100);

    useEffect(() => {
        translateX.value = withRepeat(
            withTiming(100, {
                duration,
                easing: Easing.linear,
            }),
            -1, // infinite
            false // don't reverse
        );
    }, [duration]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: `${translateX.value}%` }],
    }));

    return (
        <MaskedView
            maskElement={
                <Text className={className} style={styles.maskText}>
                    {text}
                </Text>
            }
        >
            <Animated.View style={[styles.gradientContainer, animatedStyle]}>
                <LinearGradient
                    colors={[colors.text, colors.secondary, colors.text]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.gradient}
                />
            </Animated.View>
            {/* Invisible text to maintain size */}
            <Text className={className} style={[styles.invisibleText]}>
                {text}
            </Text>
        </MaskedView>
    );
};

const styles = StyleSheet.create({
    maskText: {
        backgroundColor: 'transparent',
    },
    gradientContainer: {
        position: 'absolute',
        width: '300%',
        height: '100%',
        left: '-100%',
    },
    gradient: {
        flex: 1,
    },
    invisibleText: {
        opacity: 0,
    },
});

export default ShimmerText;
