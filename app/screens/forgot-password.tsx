import { Link, router } from 'expo-router';
import React, { useState } from 'react';
import { View, Pressable, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import ThemedText from '@/components/ThemedText';
import Input from '@/components/forms/Input';

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) {
      setEmailError('Email is required');
      return false;
    } else if (!emailRegex.test(email)) {
      setEmailError('Please enter a valid email');
      return false;
    }
    setEmailError('');
    return true;
  };

  const handleResetPassword = () => {
    const isEmailValid = validateEmail(email);

    if (isEmailValid) {
      setIsLoading(true);
      // Simulate API call
      setTimeout(() => {
        setIsLoading(false);
        // Show success message
        Alert.alert(
          'Password Reset Link Sent',
          "We've sent a password reset link to your email address. Please check your inbox.",
          [{ text: 'OK', onPress: () => router.back() }]
        );
      }, 1500);
    }
  };

  return (
    <View style={{ paddingTop: insets.top }} className="flex-1 bg-background p-10">
      <View className="mt-8">
        <ThemedText className="mb-1 mt-10 text-3xl font-bold">Reset Password</ThemedText>
        <ThemedText className="mb-14 text-subtext">
          Enter your email address and we'll send you a link to reset your password
        </ThemedText>

        <Input
          label="Email"
          value={email}
          variant="underlined"
          onChangeText={(text) => {
            setEmail(text);
            if (emailError) validateEmail(text);
          }}
          error={emailError}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />

        <Button
          title="Send Reset Link"
          onPress={handleResetPassword}
          loading={isLoading}
          size="large"
          className="mb-6 mt-4"
          rounded="full"
        />

        <View className="mt-8 flex-row justify-center">
          <ThemedText className="text-subtext">Remember your password? </ThemedText>
          <Link href="/screens/login" asChild>
            <Pressable>
              <ThemedText className="underline">Log in</ThemedText>
            </Pressable>
          </Link>
        </View>
      </View>
    </View>
  );
}
