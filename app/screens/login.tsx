import { Link, router } from 'expo-router';
import React, { useState } from 'react';
import {
  View,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  ImageBackground,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon from '@/components/Icon';
import ThemedText from '@/components/ThemedText';
import { persistAuthSession } from '@/lib/authSession';
import { postUserLogin } from '@/lib/userLoginApi';

export default function LoginScreen() {
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [rememberPassword, setRememberPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  const validateAccount = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setAccountError('请输入手机号');
      return false;
    }
    setAccountError('');
    return true;
  };

  const validatePassword = (pwd: string) => {
    if (!pwd) {
      setPasswordError('请输入密码');
      return false;
    }
    if (pwd.length < 6) {
      setPasswordError('密码至少 6 位');
      return false;
    }
    setPasswordError('');
    return true;
  };

  const handleLogin = async () => {
    const okAccount = validateAccount(account);
    const okPassword = validatePassword(password);
    setApiError('');

    if (!okAccount || !okPassword) return;

    setIsLoading(true);
    const result = await postUserLogin({
      username: account.trim(),
      password,
    });
    setIsLoading(false);

    if (!result.ok) {
      setApiError(result.message);
      Alert.alert('登录未成功', result.message, [{ text: '知道了' }]);
      return;
    }

    const { token, user_id, tenant_id, workspace_id } = result.data;
    if (!user_id || !tenant_id || !workspace_id) {
      setApiError(
        `登录成功但缺少私人模式所需字段。user_id=${user_id || '无'}，tenant_id=${tenant_id || '无'}，workspace_id=${workspace_id || '无'}。请确认后端登录或 /api/auth/me 返回 tenancy / user 信息。`
      );
      return;
    }

    await persistAuthSession({
      token,
      userId: user_id,
      tenantId: tenant_id,
      workspaceId: workspace_id,
    });
    router.replace('/');
  };

  const insets = useSafeAreaInsets();

  return (
    <ImageBackground
      source={require('@/assets/images/login-bg.png')}
      resizeMode="cover"
      className="flex-1 bg-black">
      <View className="bg-black/55 flex-1" style={{ paddingTop: insets.top }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="flex-1 px-9"
          keyboardVerticalOffset={16}>
          <View className="flex-1">
            <View className="items-center pt-36">
              <ThemedText className="text-[42px] font-light tracking-[6px] text-white">
                AI YOU
              </ThemedText>
              <ThemedText className="mt-2 text-base text-white/70">
                你的思维，从此多一个你
              </ThemedText>
            </View>

            <View className="mt-28">
              {!!apiError && (
                <ThemedText className="mb-3 text-center text-sm text-red-300">
                  {apiError}
                </ThemedText>
              )}

              <View className="mb-4 h-12 rounded-full bg-[#3F3F3F]/50 px-5">
                <TextInput
                  value={account}
                  onChangeText={(text) => {
                    setAccount(text);
                    if (accountError) validateAccount(text);
                    if (apiError) setApiError('');
                  }}
                  className="h-12 text-base text-white"
                  placeholder="手机号"
                  placeholderTextColor="rgba(255,255,255,0.72)"
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="username"
                  textContentType="telephoneNumber"
                />
              </View>
              {!!accountError && (
                <ThemedText className="-mt-2 mb-2 text-xs text-red-300">{accountError}</ThemedText>
              )}

              <View className="mb-4 h-12 flex-row items-center rounded-full bg-[#3F3F3F]/50 px-5">
                <TextInput
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (passwordError) validatePassword(text);
                    if (apiError) setApiError('');
                  }}
                  className="h-12 flex-1 text-base text-white"
                  placeholder="密码"
                  placeholderTextColor="rgba(255,255,255,0.72)"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <Pressable hitSlop={8} onPress={() => setShowPassword((prev) => !prev)}>
                  <Icon
                    name={showPassword ? 'EyeOff' : 'Eye'}
                    size={20}
                    color="rgba(255,255,255,0.9)"
                    strokeWidth={2}
                  />
                </Pressable>
              </View>
              {!!passwordError && (
                <ThemedText className="-mt-2 mb-2 text-xs text-red-300">{passwordError}</ThemedText>
              )}

              <View className="mb-7 flex-row items-center justify-between px-1">
                <Pressable
                  onPress={() => setRememberPassword((prev) => !prev)}
                  className="flex-row items-center"
                  hitSlop={8}>
                  <View className="border-white/65 mr-2 h-3.5 w-3.5 items-center justify-center rounded-full border">
                    {rememberPassword ? (
                      <View className="h-2 w-2 rounded-full bg-white/90" />
                    ) : null}
                  </View>
                  <ThemedText className="text-white/65 text-base">记住密码</ThemedText>
                </Pressable>
                <Link href="/screens/forgot-password" asChild>
                  <Pressable hitSlop={8}>
                    <ThemedText className="text-white/65 text-base">忘记密码？</ThemedText>
                  </Pressable>
                </Link>
              </View>

              <Pressable
                onPress={handleLogin}
                disabled={isLoading}
                className={`h-12 items-center justify-center rounded-full border border-white/35 bg-white/15 ${isLoading ? 'opacity-70' : ''}`}>
                <ThemedText className="text-sm font-normal text-white">
                  {isLoading ? '登录中...' : '登录'}
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </ImageBackground>
  );
}
