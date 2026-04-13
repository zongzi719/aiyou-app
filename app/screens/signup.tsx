import { Link, router } from 'expo-router';
import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import ThemedText from '@/components/ThemedText';
import Input from '@/components/forms/Input';

export default function SignupScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [strengthText, setStrengthText] = useState('');

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

  const checkPasswordStrength = (password: string) => {
    let strength = 0;
    const feedback = [];

    // Length check
    if (password.length >= 8) {
      strength += 25;
    } else {
      feedback.push('At least 8 characters');
    }

    // Uppercase check
    if (/[A-Z]/.test(password)) {
      strength += 25;
    } else {
      feedback.push('Add uppercase letter');
    }

    // Lowercase check
    if (/[a-z]/.test(password)) {
      strength += 25;
    } else {
      feedback.push('Add lowercase letter');
    }

    // Numbers or special characters check
    if (/[0-9!@#$%^&*(),.?":{}|<>]/.test(password)) {
      strength += 25;
    } else {
      feedback.push('Add number or special character');
    }

    setPasswordStrength(strength);
    setStrengthText(feedback.join(' • ') || 'Strong password!');
    return strength >= 75;
  };

  const validatePassword = (password: string) => {
    if (!password) {
      setPasswordError('Password is required');
      return false;
    } else if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return false;
    }
    const isStrong = checkPasswordStrength(password);
    if (!isStrong) {
      setPasswordError('Please create a stronger password');
      return false;
    }
    setPasswordError('');
    return true;
  };

  const handleSignup = () => {
    const isEmailValid = validateEmail(email);
    const isPasswordValid = validatePassword(password);

    if (isEmailValid && isPasswordValid) {
      setIsLoading(true);
      // Simulate API call
      setTimeout(() => {
        setIsLoading(false);
        // Navigate to home screen after successful login
        router.replace('/');
      }, 1500);
    }
  };

  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top }} className="flex-1 bg-background p-10">
      <View className="mt-8">
        <ThemedText className="mb-14 font-outfit-bold text-4xl">AI You</ThemedText>
        <ThemedText className="mb-10 text-xl font-bold">Create account</ThemedText>

        <Input
          label="Email"
          //leftIcon="mail"
          variant="classic"
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            if (emailError) validateEmail(text);
          }}
          error={emailError}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />

        <Input
          label="Password"
          variant="classic"
          value={password}
          onChangeText={(text) => {
            setPassword(text);
            checkPasswordStrength(text);
            if (passwordError) validatePassword(text);
          }}
          error={passwordError}
          isPassword
          autoCapitalize="none"
        />

        {password.length > 0 && (
          <View className="mb-4">
            <View className="h-1 w-full overflow-hidden rounded-full bg-secondary">
              <View
                className={`h-full rounded-full ${passwordStrength >= 75 ? 'bg-green-500' : passwordStrength >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                style={{ width: `${passwordStrength}%` }}
              />
            </View>
            <ThemedText className="mt-1 text-xs text-subtext">{strengthText}</ThemedText>
          </View>
        )}

        <Button
          title="Sign up"
          onPress={handleSignup}
          loading={isLoading}
          size="large"
          className="mb-6"
          rounded="full"
        />

        <View className="flex-row justify-center">
          <ThemedText className="text-subtext">Already have an account? </ThemedText>
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
