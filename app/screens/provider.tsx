import React, { useState, useRef, useEffect } from 'react';
import { View, Image } from 'react-native';

import { Button } from '@/components/Button';
import Header from '@/components/Header';
import ShowRating from '@/components/ShowRating';
import ThemeFooter from '@/components/ThemeFooter';
import ThemedScroller from '@/components/ThemeScroller';
import ThemedText from '@/components/ThemedText';
const ProviderScreen = () => {
  return (
    <>
      <Header showBackButton />
      <ThemedScroller>
        <View className="flex-1 items-center justify-center bg-background p-6">
          <View className="mb-4 h-24 w-24 items-center justify-center rounded-2xl bg-secondary">
            <Image source={require('@/assets/img/logo-3.png')} className="h-14 w-14" />
          </View>
          <ThemedText className="text-2xl font-bold">Gemini Pro</ThemedText>
          <ThemedText className="text-sm text-subtext">by Google</ThemedText>
          <ThemedText className="my-4 text-center text-base">
            Multimodal AI for creative and technical tasks. Lorem ipsum dolor sit amet consectetur
            adipisicing elit. Quisquam, quos.
          </ThemedText>
        </View>
        <View className="w-full flex-row justify-between border-y border-border py-7">
          <View className="flex-1 items-center justify-normal">
            <ShowRating rating={4.5} size="lg" />
            <ThemedText className="mt-1 text-sm text-subtext">1k+ Reviews</ThemedText>
          </View>
          <View className="flex-1 items-center justify-normal">
            <ThemedText className="text-lg font-bold">#1</ThemedText>
            <ThemedText className="mt-1 text-sm text-subtext">in Lifestyle</ThemedText>
          </View>
          <View className="flex-1 items-center justify-normal">
            <ThemedText className="text-lg font-bold">5M+</ThemedText>
            <ThemedText className="mt-1 text-sm text-subtext">Conversations</ThemedText>
          </View>
        </View>
        <ThemedText className="my-4 text-lg font-bold">Ratings</ThemedText>
        <RatingProgress rating={5} progress={75} />
        <RatingProgress rating={4} progress={25} />
        <RatingProgress rating={3} progress={10} />
        <RatingProgress rating={2} progress={15} />
        <RatingProgress rating={1} progress={10} />
      </ThemedScroller>
      <ThemeFooter>
        <Button title="Chat" variant="primary" rounded="full" />
      </ThemeFooter>
    </>
  );
};

const RatingProgress = (props: any) => {
  return (
    <View className="my-2 w-full flex-row items-center justify-center">
      <ShowRating rating={props.rating} size="md" />
      <View className="ml-4 h-1 flex-1 rounded-full bg-secondary">
        <View className="h-1 rounded-full bg-primary" style={{ width: `${props.progress}%` }} />
      </View>
    </View>
  );
};

export default ProviderScreen;
