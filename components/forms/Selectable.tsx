import React, { ReactNode } from 'react';
import { View, Pressable, StyleProp, ViewStyle } from 'react-native';

import AnimatedView from '../AnimatedView';
import Icon, { IconName } from '../Icon';
import ThemedText from '../ThemedText';

import useThemeColors from '@/app/contexts/ThemeColors';

interface SelectableProps {
  title: string;
  description?: string;
  icon?: IconName;
  customIcon?: ReactNode;
  iconColor?: string;
  selected?: boolean;
  onPress?: () => void;
  error?: string;
  className?: string;
  containerClassName?: string;
  style?: StyleProp<ViewStyle>;
}

const Selectable: React.FC<SelectableProps> = ({
  title,
  description,
  icon,
  customIcon,
  iconColor,
  selected = false,
  onPress,
  error,
  className = '',
  containerClassName = '',
  style,
}) => {
  const colors = useThemeColors();

  return (
    <View className={`mb-2 ${containerClassName}`}>
      <Pressable
        onPress={onPress}
        style={style}
        className={`
          rounded-lg border border-transparent bg-secondary p-4 active:opacity-70
          ${selected ? ' bg-secondary' : 'border-transparent'}
          ${error ? 'border-red-500' : ''}
          ${className}
        `}>
        <View className="flex-row items-center">
          {icon && (
            <View
              className={`mr-4 h-12 w-12 items-center justify-center rounded-xl bg-secondary ${selected ? 'bg-highlight' : ''}`}>
              <Icon
                name={icon}
                size={20}
                strokeWidth={1.2}
                color={iconColor || (selected ? 'white' : colors.icon)}
              />
            </View>
          )}
          {customIcon && (
            <View className="mr-4 h-12 w-12 items-center justify-center rounded-xl bg-secondary">
              {customIcon}
            </View>
          )}
          <View className="flex-1">
            <ThemedText className="text-base font-semibold">{title}</ThemedText>
            {description && (
              <ThemedText className="mt-0 text-sm text-subtext">{description}</ThemedText>
            )}
          </View>
          {selected ? (
            <AnimatedView className="ml-3" animation="bounceIn" duration={500}>
              <Icon name="CheckCircle2" size={24} color={colors.highlight} />
            </AnimatedView>
          ) : (
            <></>
          )}
        </View>
      </Pressable>

      {error && <ThemedText className="mt-1 text-xs text-red-500">{error}</ThemedText>}
    </View>
  );
};

export default Selectable;
