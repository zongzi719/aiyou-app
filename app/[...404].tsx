import { Stack } from 'expo-router';
import React from 'react';
import { Dimensions, View } from 'react-native';

import { Button } from '@/components/Button';
import Header from '@/components/Header';
import Icon from '@/components/Icon';
import ThemedText from '@/components/ThemedText';
const windowWidth = Dimensions.get('window').width;
export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen />
      <Header title=" " showBackButton />
      <View className="flex-1 items-center justify-center bg-background p-global">
        <View className=" mb-8">
          <Icon name="AlertCircle" strokeWidth={1} size={70} />
        </View>
        <ThemedText className="mb-2 text-2xl font-bold">Page Not Found</ThemedText>
        <ThemedText className="mb-8 w-2/3 text-center text-base text-subtext">
          The page you're looking for doesn't exist or has been moved.
        </ThemedText>
        <View className="flex-row items-center justify-center">
          <Button title="Back to Home" href="/" size="medium" className="px-6" />
        </View>
      </View>
    </>
  );
}
