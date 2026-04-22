import React, { useState } from 'react';
import {
  View,
  Pressable,
  Modal,
  FlatList,
  ScrollView,
  Keyboard,
  Alert,
  Text,
  TextInput,
  SafeAreaView,
} from 'react-native';

import { Button } from './Button';
import Icon, { IconName } from './Icon';
import ThemedText from './ThemedText';
import Input from './forms/Input';

import useThemeColors from '@/app/contexts/ThemeColors';

interface ProductVariantCreatorProps {
  hasStock?: boolean;
}

interface Option {
  name: string;
  values: string[];
}

interface Variant extends Record<string, string | null> {
  price: string;
  stock: string;
  image: null;
}

const ProductVariantCreator: React.FC<ProductVariantCreatorProps> = ({ hasStock }) => {
  const colors = useThemeColors();
  const [options, setOptions] = useState<Option[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [currentOption, setCurrentOption] = useState<Option>({ name: '', values: [''] });
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const addOption = () => {
    if (options.length < 3) {
      setModalVisible(true);
      setCurrentOption({ name: '', values: [''] });
      setEditingIndex(null);
    }
  };

  const editOption = (index: number) => {
    setCurrentOption(options[index]);
    setEditingIndex(index);
    setModalVisible(true);
  };

  const handleSaveOption = () => {
    const trimmedValues = currentOption.values.filter((v) => v.trim());

    if (!currentOption.name.trim()) {
      Alert.alert('缺少选项名称', '请先输入选项名称再保存。');
      return;
    }

    if (trimmedValues.length === 0) {
      Alert.alert('缺少选项值', '请至少输入一个选项值再保存。');
      return;
    }

    const updatedOptions = [...options];
    if (editingIndex !== null) {
      updatedOptions[editingIndex] = { ...currentOption, values: trimmedValues };
    } else {
      updatedOptions.push({ ...currentOption, values: trimmedValues });
    }

    setOptions(updatedOptions);
    setModalVisible(false);
    generateVariants(updatedOptions);
  };

  const addValue = () => {
    // Adds a new empty value to the current option values
    setCurrentOption((prevOption) => ({
      ...prevOption,
      values: [...prevOption.values, ''],
    }));
  };
  const deleteOption = () => {
    if (editingIndex === null) return;
    const updatedOptions = [...options];
    updatedOptions.splice(editingIndex, 1); // Removes the option at the index being edited
    setOptions(updatedOptions);
    setModalVisible(false);
    generateVariants(updatedOptions); // Update variants after deleting an option
  };

  const removeValue = (index: number) => {
    const updatedValues = [...currentOption.values];
    updatedValues.splice(index, 1);
    setCurrentOption({ ...currentOption, values: updatedValues.length ? updatedValues : [''] });
  };

  const generateVariants = (updatedOptions: Option[]) => {
    const combinations = updatedOptions.reduce((acc: Record<string, string>[], option) => {
      if (acc.length === 0) return option.values.map((v) => ({ [option.name]: v }));
      return acc.flatMap((prev) =>
        option.values.map((value) => ({ ...prev, [option.name]: value }))
      );
    }, []);
    setVariants(combinations.map((variant) => ({ ...variant, price: '', stock: '', image: null })));
  };

  return (
    <>
      <View
        className={`mb-2  mt-2 overflow-hidden rounded-xl border-neutral-400 ${options.length > 0 ? 'border' : ''}`}>
        {options.map((option, index) => (
          <Pressable
            onPress={() => editOption(index)}
            key={index}
            className="-mb-px border-b border-neutral-300 p-4">
            <View className="flex-row items-center justify-between">
              <ThemedText className="font-semibold">{option.name}</ThemedText>
              <View className="rounded-lg">
                <Icon name="Edit" size={20} />
              </View>
            </View>
            <View className="mt-1 flex-row flex-wrap gap-1">
              {option.values.map((value, i) => (
                <View key={i} className="rounded-lg bg-secondary px-3 py-1 text-sm">
                  <ThemedText key={i} className="text-sm">
                    {value}
                  </ThemedText>
                </View>
              ))}
            </View>
          </Pressable>
        ))}
      </View>
      {options.length < 3 ? (
        <Pressable
          onPress={addOption} // Calls addValue to add a new empty input
          className=" relative z-50 flex-row items-center justify-center rounded-lg border border-neutral-400 px-4 py-3">
          <Icon name="Plus" size={20} />
          <Text className="ml-2 text-primary">添加选项</Text>
        </Pressable>
      ) : (
        <View className=" relative z-50 flex-row items-center justify-center rounded-lg bg-neutral-100 px-4 py-3">
          <Text className="text-neutral-400 text-primary">最多只能添加 3 个选项</Text>
        </View>
      )}

      {variants.length > 0 && (
        <View className="mt-4">
          <Text className="mb-2 mt-0 text-xl font-medium text-primary">规格组合</Text>
          {variants.map((variant, index) => (
            <View key={index} className="mb-2 rounded-lg border border-neutral-400 p-2">
              <View className="flex-row items-center justify-start">
                <Text className="ml-2">{Object.values(variant).slice(0, -3).join(' / ')}</Text>
                <View className="ml-auto flex-row">
                  <View className="w-[80px]">
                    <Input
                      label="价格"
                      //className="h-[55px]"
                      containerClassName="mb-0"
                      //placeholder="Price"
                      keyboardType="numeric"
                      value={variant.price}
                      onChangeText={(text) => {
                        const updatedVariants = [...variants];
                        updatedVariants[index].price = text;
                        setVariants(updatedVariants);
                      }}
                    />
                  </View>
                  {hasStock && (
                    <Input
                      label="库存"
                      containerClassName="mb-0 w-20 ml-2"
                      className="h-[55px]"
                      //placeholder="Stock"
                      keyboardType="numeric"
                      //value={variant.stock}
                      onFocus={() => {
                        const updatedVariants = [...variants];
                        updatedVariants[index].stock = variant.stock;
                        setVariants(updatedVariants);
                      }}
                    />
                  )}
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      <Modal visible={modalVisible} transparent animationType="slide">
        <SafeAreaView className="flex-1 bg-background">
          <View className="w-full flex-1 bg-background">
            <View className="w-full flex-row justify-between px-4">
              <Pressable
                onPress={() => setModalVisible(false)}
                className="h-12 w-12 items-start justify-center rounded-full">
                <Icon name="X" size={25} />
              </Pressable>

              <View className="flex-row">
                <Pressable
                  onPress={() => {
                    Alert.alert('删除选项', '确定要删除这个选项吗？', [
                      { text: '取消', style: 'cancel' },
                      { text: '删除', style: 'destructive', onPress: () => deleteOption() },
                    ]);
                  }}
                  className="h-12 w-12  items-center justify-center rounded-full">
                  <Icon name="Trash" size={18} />
                </Pressable>
                <Button
                  onPress={handleSaveOption}
                  title="保存"
                  size="medium"
                  className="ml-2 items-center justify-center px-6"
                />
              </View>
            </View>
            <View className="mt-8 flex-1">
              <View className="w-full  px-4">
                <ThemedText className=" text-xl font-medium">选项名称</ThemedText>
                <ThemedText className="mb-4 w-full text-sm">例如：尺码、颜色、时长</ThemedText>
                <Input
                  label="名称"
                  value={currentOption.name}
                  onChangeText={(text) => setCurrentOption({ ...currentOption, name: text })}
                />
                <ThemedText className="mt-8 text-xl font-medium">选项值</ThemedText>
                <ThemedText className="w-full text-sm text-subtext">
                  例如：黑色、大号、小时等
                </ThemedText>
                <FlatList
                  className="relative mt-4 rounded-lg border border-neutral-500"
                  data={currentOption.values}
                  keyExtractor={(item, index) => index.toString()}
                  renderItem={({ item, index }) => (
                    <View className="flex-row items-center border-b border-neutral-500">
                      <TextInput
                        className="flex-1 px-4 py-3 text-primary placeholder:text-primary"
                        placeholder="请输入选项值"
                        placeholderTextColor={colors.placeholder}
                        value={item}
                        onChangeText={(text) => {
                          const updatedValues = currentOption.values.map((val, i) =>
                            i === index ? text : val
                          );

                          // If the user is typing in the last input, add a new empty one
                          if (index === updatedValues.length - 1 && text !== '') {
                            updatedValues.push('');
                          }

                          setCurrentOption({
                            ...currentOption,
                            values: updatedValues,
                          });
                        }}
                        onSubmitEditing={Keyboard.dismiss}
                      />
                      <Pressable onPress={() => removeValue(index)} className="px-3">
                        <Icon name="Trash" size={20} />
                      </Pressable>
                    </View>
                  )}
                  ListFooterComponent={
                    <Pressable
                      onPress={addValue}
                      className="flex-row items-center justify-center rounded-lg px-4 py-3">
                      <Icon name="Plus" size={20} />
                      <ThemedText className="ml-2">添加选项值</ThemedText>
                    </Pressable>
                  }
                />
              </View>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
};

export default ProductVariantCreator;
