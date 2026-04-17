import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { Dimensions, Image, Pressable, Text, View } from 'react-native';

import { CardScroller } from './CardScroller';
import Icon from './Icon';

interface MultipleImagePickerProps {
  onImageSelect?: (uri: string) => void;
  hasMainImage?: boolean;
}

const windowWidth = Dimensions.get('window').width;

export const MultipleImagePicker: React.FC<MultipleImagePickerProps> = ({
  onImageSelect,
  hasMainImage = true,
}) => {
  const [mainImage, setMainImage] = useState<string | null>(null);
  const [additionalImages, setAdditionalImages] = useState<string[]>([]);

  const handleDelete = (index?: number) => {
    if (typeof index === 'undefined') {
      setMainImage(null);
    } else {
      setAdditionalImages((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const pickImage = async (isMain: boolean = false) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: false,
      aspect: [5, 4],
      quality: 1,
      allowsMultipleSelection: true,
      selectionLimit: isMain ? 1 : 4,
    });

    if (!result.canceled) {
      if (isMain) {
        const uri = result.assets[0].uri;
        setMainImage(uri);
        onImageSelect?.(uri);
      } else {
        const newImages = result.assets.map((asset) => asset.uri);
        setAdditionalImages((prev) => {
          const combined = [...prev, ...newImages];
          return combined.slice(0, 4); // Limit to 4 images
        });
      }
    }
  };

  return (
    <>
      <Text className="text-sm text-primary">Images</Text>
      <CardScroller>
        {mainImage ? (
          <View className="relative">
            <Pressable
              onPress={() => pickImage(true)}
              className="relative flex h-28 w-28 flex-col items-center justify-center overflow-hidden rounded-xl border border-border"
              android_ripple={{ color: 'rgba(0,0,0,0.3)', borderless: false }}>
              <Image className="h-full w-full" source={{ uri: mainImage }} />
            </Pressable>
            <Pressable
              onPress={() => handleDelete()}
              className="absolute right-2 top-2 h-7 w-7 items-center justify-center rounded-lg bg-white">
              <Icon name="Trash2" size={18} />
            </Pressable>
          </View>
        ) : (
          hasMainImage && (
            <Pressable
              onPress={() => pickImage(true)}
              className="relative flex h-28 w-28 flex-col items-center justify-center rounded-xl border border-border p-4"
              android_ripple={{ color: 'rgba(0,0,0,0.3)', borderless: false }}>
              <Icon name="Camera" size={24} />
              <Text className="absolute bottom-4 w-full text-center text-xs text-black text-primary">
                Main photo
              </Text>
            </Pressable>
          )
        )}
        {[...Array(4)].map((_, index) => {
          const image = additionalImages[index];
          return (
            <View key={index} className="relative">
              {image ? (
                <>
                  <Pressable
                    onPress={() => pickImage(false)}
                    className="relative flex h-28 w-28 flex-col items-center justify-center overflow-hidden rounded-xl border border-border"
                    android_ripple={{ color: 'rgba(0,0,0,0.3)', borderless: false }}>
                    <Image className="h-full w-full" source={{ uri: image }} />
                  </Pressable>
                  <Pressable
                    onPress={() => handleDelete(index)}
                    className="absolute right-2 top-2 h-7 w-7 items-center justify-center rounded-lg bg-white">
                    <Icon name="Trash2" size={18} />
                  </Pressable>
                </>
              ) : (
                <Pressable
                  onPress={() => pickImage(false)}
                  className="flex h-28 w-28 flex-col items-center justify-center rounded-xl border border-border p-4 opacity-40"
                  android_ripple={{ color: 'rgba(0,0,0,0.3)', borderless: false }}>
                  <Icon name="Plus" size={24} />
                </Pressable>
              )}
            </View>
          );
        })}
      </CardScroller>
    </>
  );
};
