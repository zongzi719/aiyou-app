import React, { useState, useRef } from 'react';
import { View, ScrollView, Pressable, Animated, Easing } from 'react-native';
import Header from '@/components/Header';
import Icon from '@/components/Icon';
import { Button } from '@/components/Button';
import Section from '@/components/layout/Section';
import LottieView from 'lottie-react-native';
import { shadowPresets } from "@/utils/useShadow";
import useThemeColors from '../contexts/ThemeColors';
import { VoiceSelectCard } from '@/components/VoiceSelectCard';
import ThemedText from '@/components/ThemedText';

// Add type for VoiceItem props
type VoiceItemProps = {
  name: string;
  description: string;
  isSelected: boolean;
  onSelect: (name: string) => void;
};

export default function AiVoiceScreen() {
  // Add state to track which voice is selected
  const [selectedVoice, setSelectedVoice] = useState("John");

  // Function to handle selection
  const handleSelectVoice = (voiceName: string) => {
    setSelectedVoice(voiceName);
  };

  return (
    <View className="flex-1 bg-background">
      <Header showBackButton
        rightComponents={[
          <Button title="Save" rounded="full" />
        ]}
      />

      <ScrollView className="flex-1 px-global">
        <Section title="Ai Voice" titleSize='3xl' className='py-8 mb-8 pl-3' subtitle="Pick the voice that matches your style" />
        <View className='flex flex-row flex-wrap ' >
          <VoiceSelectCard
            isSelected={selectedVoice === "John"}
            name="John"
            description="Deep and rich tone"
            onSelect={handleSelectVoice}
          />
          <VoiceSelectCard
            isSelected={selectedVoice === "Jessica"}
            name="Jessica"
            description="Friendly and warm"
            onSelect={handleSelectVoice}
          />
          <VoiceSelectCard
            isSelected={selectedVoice === "Larry"}
            name="Larry"
            description="British gentleman"
            onSelect={handleSelectVoice}
          />
          <VoiceSelectCard
            isSelected={selectedVoice === "Monday"}
            name="Monday"
            description="Always annoyed"
            onSelect={handleSelectVoice}
          />
          <VoiceSelectCard
            isSelected={selectedVoice === "Tomas"}
            name="Tomas"
            description="Chill and relaxed"
            onSelect={handleSelectVoice}
          />
          <VoiceSelectCard
            isSelected={selectedVoice === "Jerry"}
            name="Jerry"
            description="Sarcastic and funny"
            onSelect={handleSelectVoice}
          />
        </View>

      </ScrollView>


    </View>
  );
}