import { Image, Pressable, Text, View, Alert } from 'react-native'
import React, { useState, useEffect, useRef } from 'react';
import { Link, Stack } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import useThemeColors from '../contexts/ThemeColors';
import Icon from '@/components/Icon';
import ActionSheet, { ActionSheetRef } from 'react-native-actions-sheet';
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
      <Stack.Screen options={{
        headerShown: false,  // Disabling the header
        presentation: 'card',
        animation:'slide_from_bottom'

      }} />

      {isLoading ? (
        <Text>Loading</Text>
      ) : (

        <>
          <View style={{ paddingTop: insets.top, paddingBottom: insets.bottom }} className='bg-background flex-1 h-full  py-4 flex-1'>
            <View className='w-full justify-between flex-row items-center px-4'>
              <View className='flex-row items-center'>
                <ThemedText className='text-3xl font-outfit-bold'>Luna</ThemedText>
                <View
                  className='px-2 py-1 bg-highlight rounded-lg ml-2'>
                  <Text className='text-white font-outfit-bold'>PRO</Text>
                </View>
              </View>
              <View className=''>
                <Pressable onPress={() => router.dismiss()} className='w-12 h-12 bg-secondary rounded-full items-center justify-center'>
                  <Icon name="X" size={25} />
                </Pressable>
              </View>
            </View>
            <ThemedScroller className='h-full px-4'>
              <View className='h-6 w-full' />
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
            <View className='px-4 pt-4 w-full items-center justify-center bg-background border-t border-border'>
              <Pressable
                onPress={() => actionSheetRef.current?.show()}
                className='w-full items-center bg-sky-500 rounded-lg justify-center py-4'>
                <Text className='text-white text-base'>Start free trial</Text>
              </Pressable>
              <Text className='text-subtext mt-3'>Recurring billing. Cancel anytime</Text>
            </View>
          </View>


          <ActionSheet
            ref={actionSheetRef}
            isModal={false}
            gestureEnabled
            overdrawEnabled={false}
            closable={true}
            containerStyle={{
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              backgroundColor: colors.bg
            }}
          >
            <View className='px-5'>
              <View className='w-full flex-row items-center justify-between mb-6'>
                <ThemedText className='font-bold text-lg'>30 Day free trial</ThemedText>
                <ThemedText className='font-bold text-lg'>$0.00</ThemedText>
              </View>

              <SelectPlan onSelect={() => handleSelect('Annual')} isSelected={selectedPlan === 'Annual'} period="Annual" badge="Save 43%" price="$39.99/year after trial" save="($3.33 per month)" />
              <SelectPlan onSelect={() => handleSelect('Monthly')} isSelected={selectedPlan === 'Monthly'} period="Monthly" price="$6.99/month after trial" badge={undefined} save={undefined} />
            </View>
            <View className='px-5 pt-4 w-full items-center justify-center '>
                <Pressable className='w-full items-center bg-sky-500 rounded-lg justify-center py-4'>
                  <Text className='text-white text-base'>Start free trial</Text>
                </Pressable>
              <ThemedText className='my-3'>Recurring billing. Cancel anytime</ThemedText>
            </View>
          </ActionSheet>

        </>
      )}
    </>
  )
}

const SelectPlan = (props: { badge: any; save: any; price: any; period: any; isSelected: any; onSelect: any; }) => {
  const { badge, save, price, period, isSelected, onSelect } = props

  return (
    <Pressable onPress={onSelect} className={`flex-row justify-between items-center p-4 rounded-lg  mb-4 border  ${isSelected ? 'border-highlight' : 'border-border'}`}>
      <View>
        <View className='flex-row items-center mb-2'>
          <Text className='text-lg font-semibold text-primary'>{period}</Text>
          {badge &&
            <View className='px-1 py-1 ml-2 bg-highlight rounded-md'><Text className='text-xs text-white'>{badge}</Text></View>
          }
        </View>
        <Text className='text-sm text-primary'>{price} {save && <Text className='text-highlight text-xs'>{save}</Text>}</Text>
      </View>
      <View className={`w-6 h-6 items-center justify-center border rounded-full bg-secondary ${isSelected ? 'border-sky-500' : 'border-transparent'}`}>
        <View className={`w-4 h-4 items-center justify-center border rounded-full  ${isSelected ? 'bg-sky-500 border-sky-500' : 'bg-transparent border-transparent'}`} />
      </View>
    </Pressable>
  )
}


const RowItem = (props: { label: any; isFree?: any; isPro?: any; }) => {
  const { label, isFree, isPro } = props
  return (
    <View className='w-full flex-row border-b border-border'>
      <View className='flex-1 py-6'>
        <ThemedText className='text-base'>{label}</ThemedText>
      </View>
      <View className='w-[150px] flex-row '>
        <View className='w-1/2 items-center justify-center'>
          {isFree &&
            <Icon name="Check" size={25} />
          }
        </View>

        <View className='w-1/2 items-center justify-center bg-highlight'>
          {isPro &&
            <Icon name="Check" size={25} color='white' />
          }
        </View>
      </View>
    </View>
  )
}

export default Subscription
