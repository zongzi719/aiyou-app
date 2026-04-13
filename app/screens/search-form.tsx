import React, { useState, useRef, useEffect } from 'react';
import { View, Image, Pressable, TextInput } from 'react-native';
import { Link, router } from 'expo-router';
import Icon, { IconName } from '@/components/Icon';
import ThemedScroller from '@/components/ThemeScroller';
import ThemedText from '@/components/ThemedText';
import useThemeColors from '@/app/contexts/ThemeColors';
import { Chip } from '@/components/Chip';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CardScroller } from '@/components/CardScroller';

type SearchCategory = 'top-picks' | 'featured' | 'trending' | 'productivity' | 'education';

const SearchScreen = () => {
  const colors = useThemeColors();
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState<SearchCategory>('top-picks');
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();

  const aiModels = [
    {
      id: 1,
      name: 'GPT-4 Turbo',
      creator: 'OpenAI',
      description: 'Most advanced reasoning with extended context window',
      image: require('@/assets/img/logo-1.png'),
      category: 'top-picks'
    },
    {
      id: 2,
      name: 'Claude 3 Opus',
      creator: 'Anthropic',
      description: 'High-performance vision and reasoning capabilities',
      image: require('@/assets/img/logo-2.png'),
      category: 'featured'
    },
    {
      id: 3,
      name: 'Gemini Pro',
      creator: 'Google',
      description: 'Multimodal AI for creative and technical tasks',
      image: require('@/assets/img/logo-3.png'),
      category: 'trending'
    },
    {
      id: 4,
      name: 'Midjourney',
      creator: 'Midjourney Inc',
      description: 'Text-to-image generation with artistic quality',
      image: require('@/assets/img/logo-4.png'),
      category: 'top-picks'
    },
    {
      id: 5,
      name: 'GitHub Copilot',
      creator: 'Microsoft',
      description: 'AI pair programmer for code completion',
      image: require('@/assets/img/logo-5.png'),
      category: 'productivity'
    },
    {
      id: 6,
      name: 'Perplexity',
      creator: 'Perplexity AI',
      description: 'Real-time knowledge search with citations',
      image: require('@/assets/img/logo-2.png'),
      category: 'education'
    },
    {
      id: 7,
      name: 'DALL-E 3',
      creator: 'OpenAI',
      description: 'Photorealistic image generation from text',
      image: require('@/assets/img/logo-1.png'),
      category: 'trending'
    },
    {
      id: 8,
      name: 'Whisper',
      creator: 'OpenAI',
      description: 'Speech recognition with multilingual support',
      image: require('@/assets/img/logo-3.png'),
      category: 'productivity'
    },
    {
      id: 9,
      name: 'Duolingo Max',
      creator: 'Duolingo',
      description: 'AI-powered language learning assistant',
      image: require('@/assets/img/logo-4.png'),
      category: 'education'
    },
  ];

  useEffect(() => {
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  }, []);

  const filterData = (data: any[]) => {
    if (!searchQuery) return data;
    return data.filter(item =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.creator.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase())
    );
  };

  const getFilteredResults = () => {
    const filteredModels = filterData(aiModels);
    return filteredModels.filter(model => category === 'top-picks' || model.category === category);
  };

  const results = getFilteredResults();

  return (
    <>
      <View style={{ paddingTop: insets.top }} className='p-global bg-background'>
        <View
          style={{ elevation: 10, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6.84, shadowOffset: { width: 0, height: 4 } }}
          className='bg-light-primary bg-secondary rounded-full relative'
        >
          <Icon name="ArrowLeft" onPress={() => router.back()} className="absolute top-1.5 left-1.5 z-50" size={20} />

          <TextInput
            ref={inputRef}
            className='py-3 pl-10 pr-3 rounded-lg text-primary'
            placeholder='Search AI models...'
            placeholderTextColor={colors.placeholder}
            onChangeText={setSearchQuery}
            value={searchQuery}
            returnKeyType="done"
            autoFocus={false}
          />

          {searchQuery.length > 0 && (
            <Pressable
              onPress={() => {
                setSearchQuery('');
                inputRef.current?.focus();
              }}
              className="absolute top-3 right-3 z-50 opacity-50"
            >
              <Icon name='X' size={20} />
            </Pressable>
          )}
        </View>

        <CardScroller className='mt-4' space={5} >
          <Chip
            label="Top Picks"
            isSelected={category === 'top-picks'}
            onPress={() => setCategory('top-picks')}
          />
          <Chip
            label="Featured"
            isSelected={category === 'featured'}
            onPress={() => setCategory('featured')}
          />
          <Chip
            label="Trending"
            isSelected={category === 'trending'}
            onPress={() => setCategory('trending')}
          />
          <Chip
            label="Productivity"
            isSelected={category === 'productivity'}
            onPress={() => setCategory('productivity')}
          />
          <Chip
            label="Education"
            isSelected={category === 'education'}
            onPress={() => setCategory('education')}
          />
        </CardScroller>
      </View>

      <ThemedScroller className='flex-1 px-0' keyboardShouldPersistTaps='handled'>
        <View className='mb-4'>
          {results.length > 0 ? (
            results.map((item) => (
              <Link key={item.id} href={`/screens/provider`} asChild>
                <Pressable className="flex-row items-center justify-start py-2  mb-2">
                  <View className='w-14 h-14 rounded-2xl items-center justify-center bg-secondary mr-5'>
                    <Image source={item.image} className='w-8 h-8' />
                  </View>
                  <View className='flex-1'>
                    <ThemedText className='text-base font-bold'>{item.name}</ThemedText>
                    <ThemedText className='text-sm mb-1 line-clamp-1 w-full whitespace-nowrap overflow-hidden'>{item.description}</ThemedText>
                    <ThemedText className='text-sm text-subtext'>by {item.creator}</ThemedText>
                  </View>
                </Pressable>
              </Link>
            ))
          ) : (
            <View className='items-center justify-center p-10'>
              <ThemedText className='text-lg font-bold mb-2 text-center'>
                No results found
              </ThemedText>
              <ThemedText className='text-center text-subtext'>
                Try different keywords or categories
              </ThemedText>
            </View>
          )}
        </View>
      </ThemedScroller>
    </>
  );
};

export default SearchScreen;
