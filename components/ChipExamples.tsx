import React from 'react';
import { View, ScrollView } from 'react-native';

import Avatar from './Avatar';
import { Chip } from './Chip';
import ThemedText from './ThemedText';

export default function ChipExamples() {
  return (
    <ScrollView className="flex-1 p-4">
      <ThemedText className="mb-4 text-xl font-bold">Chip Sizes</ThemedText>
      <View className="mb-6 flex-row flex-wrap gap-2">
        <Chip label="Extra Small" size="xs" />
        <Chip label="Small" size="sm" />
        <Chip label="Medium" size="md" />
        <Chip label="Large" size="lg" />
        <Chip label="Extra Large" size="xl" />
        <Chip label="2XL" size="xxl" />
      </View>

      <ThemedText className="mb-4 text-xl font-bold">Selected State</ThemedText>
      <View className="mb-6 flex-row flex-wrap gap-2">
        <Chip label="Not Selected" />
        <Chip label="Selected" isSelected />
      </View>

      <ThemedText className="mb-4 text-xl font-bold">With Icons</ThemedText>
      <View className="mb-6 flex-row flex-wrap gap-2">
        <Chip label="Home" icon="Home" />
        <Chip label="Settings" icon="Settings" isSelected />
        <Chip label="Search" icon="Search" size="lg" />
        <Chip label="Notifications" icon="Bell" size="xl" isSelected />
      </View>

      <ThemedText className="mb-4 text-xl font-bold">With Images</ThemedText>
      <View className="mb-6 flex-row flex-wrap gap-2">
        <Chip
          label="John Doe"
          image={{ uri: 'https://mighty.tools/mockmind-api/content/human/108.jpg' }}
        />
        <Chip
          label="Jane Smith"
          image={{ uri: 'https://mighty.tools/mockmind-api/content/human/107.jpg' }}
          isSelected
        />
        <Chip
          label="Mike Johnson"
          image={{ uri: 'https://mighty.tools/mockmind-api/content/human/106.jpg' }}
          size="lg"
        />
      </View>

      <ThemedText className="mb-4 text-xl font-bold">As Links</ThemedText>
      <View className="mb-6 flex-row flex-wrap gap-2">
        <Chip label="Go to Home" href="/" icon="Home" />
        <Chip label="Profile" href="/profile" icon="User" isSelected />
        <Chip label="Settings" href="/settings" icon="Settings" size="lg" />
      </View>

      <ThemedText className="mb-4 text-xl font-bold">With Custom Left Content</ThemedText>
      <View className="mb-6 flex-row flex-wrap gap-2">
        <Chip
          label="Custom Avatar"
          leftContent={
            <Avatar
              src="https://mighty.tools/mockmind-api/content/human/105.jpg"
              size="xs"
              className="mr-2"
            />
          }
          size="lg"
        />
        <Chip
          label="Custom Badge"
          leftContent={<View className="mr-2 h-3 w-3 rounded-full bg-red-500" />}
          isSelected
        />
      </View>
    </ScrollView>
  );
}
