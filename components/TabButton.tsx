import { useThemeColors } from 'app/contexts/ThemeColors';
import { TabTriggerSlotProps } from 'expo-router/ui';
import { ComponentProps, forwardRef, useEffect, useState, ReactNode } from 'react';
import { Text, Pressable, View, Animated } from 'react-native';
import Icon, { IconName } from '@/components/Icon';
import ThemedText from './ThemedText';
import Avatar from './Avatar';
import AnimatedView from './AnimatedView';

export type TabButtonProps = TabTriggerSlotProps & {
  icon?: IconName;
  avatar?: string;
  customContent?: ReactNode;
  labelAnimated?: boolean;
  hasBadge?: boolean;
};

export const TabButton = forwardRef<View, TabButtonProps>(
  ({ icon, avatar, children, isFocused, onPress, customContent, labelAnimated = true, hasBadge = false, ...props }, ref) => {
    const colors = useThemeColors();

    // Use Animated Values to control opacity and translateY
    const [labelOpacity] = useState(new Animated.Value(isFocused ? 1 : 0));
    const [labelMarginBottom] = useState(new Animated.Value(isFocused ? 0 : 10));
    const [lineScale] = useState(new Animated.Value(isFocused ? 0 : 10));

    // Animate opacity and translation when the tab becomes focused or unfocused
    useEffect(() => {
      Animated.parallel([
        Animated.timing(labelOpacity, {
          toValue: isFocused ? 1 : 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(labelMarginBottom, {
          toValue: isFocused ? 0 : 10,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(lineScale, {
          toValue: isFocused ? 1 : 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }, [isFocused]);

    // Render icon or custom content
    const renderContent = () => {
      if (customContent) {
        return customContent;
      }
      
      if (icon) {
        return (
          <View className="relative">
            <View className={`w-full relative ${isFocused ? 'opacity-100' : 'opacity-40'}`}>
              {/*isFocused && (
                <AnimatedView animation='scaleIn' duration={200} className='absolute border-4 rounded-full border-border -top-1 -left-1/3  w-full h-8  bg-highlight/20' ></AnimatedView>
              )}*/}
              <Icon name={icon} size={24} strokeWidth={isFocused ? 2.5 : 2} color={isFocused ? colors.highlight : colors.icon} />
            </View>
            {hasBadge && (
              <View className="absolute w-3 h-3 border border-border rounded-full bg-red-500 -top-1 -right-1.5" />
            )}
          </View>
        );
      }
      if (avatar) {
        return (
          <View className={`rounded-full border-2 ${isFocused ? 'border-highlight' : 'border-transparent'}`}>
            <Avatar src={avatar} size="xxs"  />
          </View>
        );
      }
      return null;
    };

    return (
      <Pressable
        className={`w-1/5 overflow-hidden ${isFocused ? '' : ''}`}
        ref={ref}
        {...props}
        onPress={onPress}>
        <View className="flex-col items-center justify-center pt-4 pb-0 w-full relative">
          {/*<Animated.View className="absolute w-full h-[2px] bg-primary left-0 top-0"
            style={{
              opacity: lineScale,
              transform: [{ scaleX: lineScale }],
            }}
          />*/}
          
          {renderContent()}

          {labelAnimated ? (
            <Animated.View className="relative"
              style={{
                opacity: labelOpacity,
                transform: [{ translateY: labelMarginBottom }],
              }}
            >
              <ThemedText className={`text-[9px] mt-px text-highlight`}>
                {children}
              </ThemedText>
            </Animated.View>
          ) : (
            <ThemedText className={`text-[9px] mt-px`}>
              {children}
            </ThemedText>
          )}
        </View>
      </Pressable>
    );
  }
);
