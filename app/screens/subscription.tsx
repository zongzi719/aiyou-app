import { Stack, router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import ActionSheet, { ActionSheetRef } from 'react-native-actions-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import useThemeColors from '../contexts/ThemeColors';

import Icon from '@/components/Icon';
import ThemedScroller from '@/components/ThemeScroller';
import ThemedText from '@/components/ThemedText';

const Subscription = () => {
  const insets = useSafeAreaInsets();
  const [isLoading, setLoading] = useState(true);

  // Simulate a loading delay
  useEffect(() => {
    setTimeout(() => {
      setLoading(false);
    }, 0);
  }, []);

  const colors = useThemeColors();
  const [selectedPlan, setSelectedPlan] = useState('Annual'); // State to keep track of the selected plan
  const handleSelect = (plan: React.SetStateAction<string>) => {
    setSelectedPlan(plan); // Update the selected plan
  };
  const actionSheetRef = useRef<ActionSheetRef>(null);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false, // Disabling the header
          presentation: 'card',
          animation: 'slide_from_bottom',
        }}
      />

      {isLoading ? (
        <Text>Loading</Text>
      ) : (
        <>
          <View
            style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
            className="h-full flex-1 flex-1  bg-background py-4">
            <View className="w-full flex-row items-center justify-between px-4">
              <View className="flex-row items-center">
                <ThemedText className="font-outfit-bold text-3xl">Luna</ThemedText>
                <View className="ml-2 rounded-lg bg-highlight px-2 py-1">
                  <Text className="font-outfit-bold text-white">PRO</Text>
                </View>
              </View>
              <View className="">
                <Pressable
                  onPress={() => router.dismiss()}
                  className="h-12 w-12 items-center justify-center rounded-full bg-secondary">
                  <Icon name="X" size={25} />
                </Pressable>
              </View>
            </View>
            <ThemedScroller className="h-full px-4">
              <View className="h-6 w-full" />
              <RowItem isFree isPro label="Unlimited Chat Messages" />
              <RowItem isFree isPro label="Image Generation" />
              <RowItem isFree isPro label="Text to Speech" />
              <RowItem isPro label="Priority Response Times" />
              <RowItem isPro label="Advanced Image Generation" />
              <RowItem isPro label="Voice Conversations" />
              <RowItem isPro label="Custom AI Assistants" />
              <RowItem isPro label="Document Analysis & Summaries" />
              <RowItem isPro label="Code Explanation & Generation" />
              <RowItem isPro label="API Access" />
            </ThemedScroller>
            <View className="w-full items-center justify-center border-t border-border bg-background px-4 pt-4">
              <Pressable
                onPress={() => actionSheetRef.current?.show()}
                className="w-full items-center justify-center rounded-lg bg-sky-500 py-4">
                <Text className="text-base text-white">Start free trial</Text>
              </Pressable>
              <Text className="mt-3 text-subtext">Recurring billing. Cancel anytime</Text>
            </View>
          </View>

          <ActionSheet
            ref={actionSheetRef}
            isModal={false}
            gestureEnabled
            overdrawEnabled={false}
            closable
            containerStyle={{
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              backgroundColor: colors.bg,
            }}>
            <View className="px-5">
              <View className="mb-6 w-full flex-row items-center justify-between">
                <ThemedText className="text-lg font-bold">30 Day free trial</ThemedText>
                <ThemedText className="text-lg font-bold">$0.00</ThemedText>
              </View>

              <SelectPlan
                onSelect={() => handleSelect('Annual')}
                isSelected={selectedPlan === 'Annual'}
                period="Annual"
                badge="Save 43%"
                price="$39.99/year after trial"
                save="($3.33 per month)"
              />
              <SelectPlan
                onSelect={() => handleSelect('Monthly')}
                isSelected={selectedPlan === 'Monthly'}
                period="Monthly"
                price="$6.99/month after trial"
                badge={undefined}
                save={undefined}
              />
            </View>
            <View className="w-full items-center justify-center px-5 pt-4 ">
              <Pressable className="w-full items-center justify-center rounded-lg bg-sky-500 py-4">
                <Text className="text-base text-white">Start free trial</Text>
              </Pressable>
              <ThemedText className="my-3">Recurring billing. Cancel anytime</ThemedText>
            </View>
          </ActionSheet>
        </>
      )}
    </>
  );
};

const SelectPlan = (props: {
  badge: any;
  save: any;
  price: any;
  period: any;
  isSelected: any;
  onSelect: any;
}) => {
  const { badge, save, price, period, isSelected, onSelect } = props;

  return (
    <Pressable
      onPress={onSelect}
      className={`mb-4 flex-row items-center justify-between rounded-lg  border p-4  ${isSelected ? 'border-highlight' : 'border-border'}`}>
      <View>
        <View className="mb-2 flex-row items-center">
          <Text className="text-lg font-semibold text-primary">{period}</Text>
          {badge && (
            <View className="ml-2 rounded-md bg-highlight px-1 py-1">
              <Text className="text-xs text-white">{badge}</Text>
            </View>
          )}
        </View>
        <Text className="text-sm text-primary">
          {price} {save && <Text className="text-xs text-highlight">{save}</Text>}
        </Text>
      </View>
      <View
        className={`h-6 w-6 items-center justify-center rounded-full border bg-secondary ${isSelected ? 'border-sky-500' : 'border-transparent'}`}>
        <View
          className={`h-4 w-4 items-center justify-center rounded-full border  ${isSelected ? 'border-sky-500 bg-sky-500' : 'border-transparent bg-transparent'}`}
        />
      </View>
    </Pressable>
  );
};

const RowItem = (props: { label: any; isFree?: any; isPro?: any }) => {
  const { label, isFree, isPro } = props;
  return (
    <View className="w-full flex-row border-b border-border">
      <View className="flex-1 py-6">
        <ThemedText className="text-base">{label}</ThemedText>
      </View>
      <View className="w-[150px] flex-row ">
        <View className="w-1/2 items-center justify-center">
          {isFree && <Icon name="Check" size={25} />}
        </View>

        <View className="w-1/2 items-center justify-center bg-highlight">
          {isPro && <Icon name="Check" size={25} color="white" />}
        </View>
      </View>
    </View>
  );
};

export default Subscription;
