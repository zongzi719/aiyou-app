import React, { useState, useRef, useEffect } from 'react';
import Header from '@/components/Header';
import { View, Image } from 'react-native';
import ThemedText from '@/components/ThemedText';
import ThemedScroller from '@/components/ThemeScroller';
import ThemeFooter from '@/components/ThemeFooter';
import { Button } from '@/components/Button';
import ShowRating from '@/components/ShowRating';
const ProviderScreen = () => {

  return (
    <>
      <Header showBackButton />
      <ThemedScroller>
        <View className='flex-1 items-center justify-center bg-background p-6'>
          <View className='w-24 h-24 rounded-2xl items-center justify-center bg-secondary mb-4'>
            <Image source={require('@/assets/img/logo-3.png')} className='w-14 h-14' />
          </View>
          <ThemedText className='text-2xl font-bold'>Gemini Pro</ThemedText>
          <ThemedText className='text-sm text-subtext'>by Google</ThemedText>
          <ThemedText className='text-base my-4 text-center'>Multimodal AI for creative and technical tasks. Lorem ipsum dolor sit amet consectetur adipisicing elit. Quisquam, quos.</ThemedText>
        </View>
        <View className="w-full flex-row justify-between py-7 border-y border-border">
          <View className='flex-1 items-center justify-normal'>
            <ShowRating rating={4.5} size='lg' />
            <ThemedText className='text-sm mt-1 text-subtext'>1k+ Reviews</ThemedText>
          </View>
          <View className='flex-1 items-center justify-normal'>
            <ThemedText className='text-lg font-bold'>#1</ThemedText>
            <ThemedText className='text-sm mt-1 text-subtext'>in Lifestyle</ThemedText>
          </View>
          <View className='flex-1 items-center justify-normal'>
            <ThemedText className='text-lg font-bold'>5M+</ThemedText>
            <ThemedText className='text-sm mt-1 text-subtext'>Conversations</ThemedText>
          </View>
        </View>
        <ThemedText className='text-lg font-bold my-4'>Ratings</ThemedText>
        <RatingProgress rating={5} progress={75} />
        <RatingProgress rating={4} progress={25} />
        <RatingProgress rating={3} progress={10} />
        <RatingProgress rating={2} progress={15} />
        <RatingProgress rating={1} progress={10} />
      </ThemedScroller>
      <ThemeFooter>
        <Button title='Chat' variant='primary' rounded='full' />
      </ThemeFooter>
    </>
  );
};

const RatingProgress = (props: any) => {
  return (
    <View className='flex-row items-center justify-center w-full my-2'>
      <ShowRating rating={props.rating} size='md' />
      <View className="flex-1 h-1 bg-secondary rounded-full ml-4">
        <View className="h-1 bg-primary rounded-full" style={{ width: `${props.progress}%` }} />
      </View>
    </View>
  );
};

export default ProviderScreen;
