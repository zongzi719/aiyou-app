import React, { useState } from 'react';
import { View, Image, TouchableOpacity } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Header from '@/components/Header';
import ThemedScroller from '@/components/ThemeScroller';
import Input from '@/components/forms/Input';
import Section from '@/components/layout/Section';
import { Button } from '@/components/Button';
import Icon from '@/components/Icon';

export default function EditProfileScreen() {
  const [profileImage, setProfileImage] = useState<string | null>(null);

  const pickImage = async () => {
    // No permissions request is necessary for launching the image library
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (!result.canceled) {
      setProfileImage(result.assets[0].uri);
    }
  };

  return (
    <>
      <Header
      title="Profile settings"
      showBackButton
        rightComponents={[
          <Button title="Save changes" rounded="full" />
        ]}
      />
      <ThemedScroller className='px-8'>


        <View className="items-center flex-col mb-8 mt-8">
          <TouchableOpacity
            onPress={pickImage}
            className="relative"
            activeOpacity={0.9}
          >
            {profileImage ? (
              <Image
                source={{ uri: profileImage }}
                className="w-28 h-28 rounded-full border border-border"
              />
            ) : (
              <View className="w-24 h-24 rounded-full bg-secondary items-center justify-center">
                <Icon name="Plus" size={25} className="text-subtext" />
              </View>
            )}

          </TouchableOpacity>
          <View className="mt-4">
            <Button variant='ghost' title={profileImage ? 'Change photo' : 'Upload photo'} className="text-sm bg-secondary" onPress={pickImage} />

            {profileImage && (
              <Button
                className='mt-2'
                title="Remove photo"
                variant="ghost"
                onPress={() => setProfileImage(null)}
              />
            )}
          </View>
        </View>
        <View className='p-global bg-secondary rounded-2xl'>
          <Section titleSize='xl' className='pt-0 pb-8' title="Personal information" subtitle="Manage your personal information" />
          <Input
            label="First Name"
            variant='underlined'
            value="John"
            keyboardType="email-address"
            autoCapitalize="none" />
          <Input
            label="Last Name"
            value="Doe"
            variant="underlined"
            containerClassName='flex-1'
            keyboardType="email-address"
            autoCapitalize="none" />

          <Input
            label="Email"
            variant="underlined"
            keyboardType="email-address"
            value="john.doe@example.com"
            autoCapitalize="none" />
        </View>





      </ThemedScroller>
    </>
  );
}