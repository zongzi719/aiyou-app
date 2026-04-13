import React from 'react';
import { Pressable, View, ViewStyle } from 'react-native';
import Icon from './Icon';
import Avatar from './Avatar';
import { useThemeColors } from 'app/contexts/ThemeColors';
import { DrawerActions, useNavigation, NavigationProp } from '@react-navigation/native';

interface DrawerButtonProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  style?: ViewStyle;
  isAvatar?: boolean;
}

export default function DrawerButton({
  size = 'md',
  className,
  style,
  isAvatar = false,
}: DrawerButtonProps) {
  const colors = useThemeColors();
  const navigation = useNavigation<NavigationProp<any>>();

  const sizeMap = {
    sm: 16,
    md: 24,
    lg: 32,
  };

  const handlePress = () => {
    try {
      navigation.dispatch(DrawerActions.openDrawer());
    } catch (e) {
      console.warn('Drawer navigation context not available:', e);
    }
  };

  return (
    <View className={`rounded-full ${className}`} style={style}>
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
        className='rounded-full bg-background border border-border p-3'
      >
        {isAvatar ? (
          <Avatar
            src="https://mighty.tools/mockmind-api/content/human/5.jpg"
            size="xs"
          />
        ) : (
          <Icon name="Menu" size={sizeMap[size]} color={colors.text} />
        )}
      </Pressable>
    </View>
  );
}
