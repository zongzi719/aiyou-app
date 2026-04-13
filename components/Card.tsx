import { Link, router } from 'expo-router';
import { View, Text, Image, Pressable, ImageBackground, TouchableOpacity, ViewStyle, Dimensions, ImageSourcePropType } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ThemedText from './ThemedText';
import { Button } from './Button';
import useShadow, { shadowPresets } from '@/utils/useShadow';
import Icon from './Icon';
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import useThemeColors from '@/app/contexts/ThemeColors';
import Favorite from './Favorite';
const { width: windowWidth } = Dimensions.get('window');
interface CardProps {
    title: string;
    description?: string;
    hasShadow?: boolean;
    image: string | ImageSourcePropType;
    href?: string;
    onPress?: () => void;
    variant?: 'classic' | 'overlay' | 'compact' | 'minimal';
    className?: string;
    button?: string;
    onButtonPress?: () => void;
    price?: string;
    rating?: number;
    badge?: string;
    badgeColor?: string;
    icon?: string;
    iconColor?: string;
    imageHeight?: number;
    showOverlay?: boolean;
    hasFavorite?: boolean;
    overlayGradient?: readonly [string, string];
    width?: any;
    rounded?: 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
    children?: React.ReactNode;
    style?: ViewStyle;
}

const Card: React.FC<CardProps> = ({
    title,
    description,
    image,
    hasShadow = false,
    href,
    onPress,
    variant = 'classic',
    className = 'w-full',
    button,
    onButtonPress,
    price,
    rating,
    badge,
    hasFavorite = false,
    badgeColor = '#000000',
    imageHeight = 200,
    showOverlay = true,
    overlayGradient = ['transparent', 'rgba(0,0,0,0.3)'] as readonly [string, string],
    rounded = 'lg',
    width = '100%',
    children,
    style,
    ...props
}) => {
    const handlePress = () => {
        if (onPress) {
            onPress();
        }
    };

    const getRoundedClass = () => {
        switch (rounded) {
            case 'none': return 'rounded-none';
            case 'sm': return 'rounded-sm';
            case 'md': return 'rounded-md';
            case 'lg': return 'rounded-lg';
            case 'xl': return 'rounded-xl';
            case '2xl': return 'rounded-2xl';
            case 'full': return 'rounded-full';
            default: return 'rounded-lg';
        }
    };

    const renderBadge = () => {
        if (!badge) return null;
        return (
            <View
                className={`absolute top-2 right-2 z-10 px-2 py-1 rounded-full ${getRoundedClass()}`}
                style={{ backgroundColor: badgeColor }}
            >
                <Text className="text-white text-xs font-medium">{badge}</Text>
            </View>
        );
    };
    const colors = useThemeColors();
    const renderRating = () => {
        if (!rating) return null;
        return (
            <View className="flex-row items-center">
                <MaterialIcons name="star" size={16} color={colors.text} />
                <ThemedText className="text-xs font-semibold ml-0">{rating}</ThemedText>
            </View>
        );
    };

    const renderPrice = () => {
        if (!price) return null;
        return (
            <ThemedText className={`text-sm font-bold ${variant === 'overlay' ? 'text-white' : 'text-invert'}`}>{price}</ThemedText>
        );
    };

    const renderContent = () => {
        const cardContent = (
            <View

            className={`flex-1 bg-secondary ${getRoundedClass()} ${className}`}
            style={[
                hasShadow && {
                    ...shadowPresets.card
                },
                style
            ]}>
                <View className="relative">
                    {hasFavorite && (
                        <View className='absolute top-2 right-2 z-50'>
                            <Favorite
                                initialState={false}
                                productName={title}
                                size={24}
                            />
                        </View>
                    )}
                    {variant === 'overlay' ? (
                        <ImageBackground
                            source={typeof image === 'string' ? { uri: image } : image}
                            className={`w-full overflow-hidden ${getRoundedClass()}`}
                            style={{ height: imageHeight || 200 }}
                        >
                            {showOverlay && (
                                <LinearGradient
                                    colors={overlayGradient}
                                    className='w-full h-full relative flex flex-col justify-end'
                                >
                                    <View className="p-4 absolute bottom-0 left-0 right-0">
                                        <Text className="text-base font-bold text-white">{title}</Text>
                                        {description && (
                                            <Text numberOfLines={1} className="text-xs text-white">{description}</Text>
                                        )}
                                        {(price || rating) && (
                                            <View className="flex-row items-center mt-1 justify-between">
                                                {renderPrice()}
                                                {renderRating()}
                                            </View>
                                        )}
                                    </View>
                                </LinearGradient>
                            )}
                        </ImageBackground>
                    ) : (
                        <Image
                            source={typeof image === 'string' ? { uri: image } : image}
                            className={`w-full ${getRoundedClass()}`}
                            style={{ height: imageHeight || 200, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}
                        />
                    )}
                    {renderBadge()}
                </View>

                {variant !== 'overlay' && (
                    <View className="p-3 w-full flex-1 ">


                        <ThemedText className="text-sm font-semibold mb-2">{title}</ThemedText>

                        {description && (
                            <ThemedText numberOfLines={1} className="text-xs text-subtext">
                                {description}
                            </ThemedText>
                        )}
                        {(price || rating) && (
                            <View className="flex-row items-center mt-auto justify-between">
                                {renderPrice()}
                                {renderRating()}
                            </View>
                        )}
                        {children}
                        {button && (
                            <Button
                                className='mt-3'
                                title={button}
                                size='small'
                                onPress={onButtonPress}
                            />
                        )}
                    </View>
                )}
            </View>
        );

        if (href) {
            return (
                <TouchableOpacity className={`${variant === 'overlay' ? '!h-auto' : ''} ${className}`} activeOpacity={0.8} onPress={() => router.push(href)} style={{ width: width, ...style }}>
                    {cardContent}
                </TouchableOpacity>
            );
        }

        return (
            <TouchableOpacity className={`${variant === 'overlay' ? '!h-auto' : ''} ${className}`} activeOpacity={0.8} onPress={handlePress} style={{ width: width, ...style }}>
                {cardContent}
            </TouchableOpacity>
        );
    };

    return renderContent();
};

export default Card;
