import { router } from 'expo-router';
import LottieView from 'lottie-react-native';
import React, { useState, useRef } from 'react';
import { View, Text, FlatList, Dimensions, Pressable, SafeAreaView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ThemeToggle from '@/components/ThemeToggle';
import ThemedText from '@/components/ThemedText';

const { width } = Dimensions.get('window');
const windowWidth = Dimensions.get('window').width;

const slides = [
  {
    id: '1',
    title: 'AI You',
    image: require('@/assets/lottie/sphere.json'),
    description: 'Your personal assistant',
  },
  {
    id: '2',
    title: 'Voice assistant',
    image: require('@/assets/lottie/waves.json'),
    description: 'Your personal assistant',
  },
  {
    id: '3',
    title: 'Customizable & Fast',
    image: require('@/assets/lottie/waves.json'),
    description: 'Easily modify themes and layouts.',
  },
];

export default function OnboardingScreen() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef(null);
  const insets = useSafeAreaInsets();
  const handleScroll = (event: { nativeEvent: { contentOffset: { x: number } } }) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    setCurrentIndex(index);
  };

  return (
    <SafeAreaView className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="relative flex-1 bg-background">
        <View className="w-full items-end justify-end pr-6 pt-6">
          <ThemeToggle />
        </View>
        <FlatList
          ref={flatListRef}
          data={slides}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          snapToAlignment="start"
          decelerationRate="fast"
          snapToInterval={windowWidth}
          renderItem={({ item }) => (
            <View style={{ width: windowWidth }} className="items-center justify-center p-6">
              <LottieView
                source={item.image}
                autoPlay
                loop
                style={{ width: windowWidth, height: 300 }}
              />
              <ThemedText className="mt-4 font-outfit-bold text-2xl">{item.title}</ThemedText>
              <Text className="mt-2 text-center text-subtext">{item.description}</Text>
            </View>
          )}
          ListFooterComponent={() => <View className="h-28 w-full" />}
          keyExtractor={(item) => item.id}
        />

        <View className="mb-20 w-full flex-row justify-center">
          {slides.map((_, index) => (
            <View
              key={index}
              className={`mx-1 h-2 rounded-full ${index === currentIndex ? 'w-2 bg-highlight' : 'w-2 bg-secondary'}`}
            />
          ))}
        </View>

        <View className="mb-global w-full flex-col space-y-2 px-6">
          <Pressable
            onPress={() => router.push('/screens/login')}
            className="w-full flex-row items-center justify-center rounded-full bg-text py-4">
            <ThemedText className="text-sm !text-invert">账号登录</ThemedText>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
