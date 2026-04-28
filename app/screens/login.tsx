import { Link, router } from 'expo-router';
import React, { useEffect, useState } from 'react';
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
import { hasPrivateChatBackendSession, persistAuthSession } from '@/lib/authSession';
import { putProfileCache } from '@/lib/profileCache';
import { postUserLogin } from '@/lib/userLoginApi';
import { fetchProfile, needsAiBossModelOnboarding } from '@/services/profileApi';

function normalizeLoginErrorMessage(message: string): string {
  const raw = message.trim();
  if (!raw) return '登录失败，请稍后重试';
  const lower = raw.toLowerCase();
  if (lower.includes('invalid username or password')) return '用户名或密码错误';
  if (lower.includes('invalid credentials')) return '账号或密码不正确';
  if (lower.includes('network request failed')) return '网络连接失败，请检查网络后重试';
  return raw;
}

export default function LoginScreen() {
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [rememberPassword, setRememberPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void hasPrivateChatBackendSession().then((loggedIn) => {
      if (cancelled || !loggedIn) return;
      router.replace('/');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const validateAccount = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setAccountError('请输入账号');
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
      const normalizedMessage = normalizeLoginErrorMessage(result.message);
      setApiError(normalizedMessage);
      Alert.alert('登录未成功', normalizedMessage, [{ text: '知道了' }]);
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

    try {
      const profile = await fetchProfile();
      putProfileCache(profile);
      if (needsAiBossModelOnboarding(profile)) {
        router.replace('/screens/model-init?postLogin=1');
        return;
      }
    } catch {
      /* 资料拉取失败时不阻断登录，仍进入首页 */
    }
    router.replace('/');
  };

  const insets = useSafeAreaInsets();

  return (
    <ImageBackground
      source={require('@/assets/images/backgrounds/login-bg-v2.png')}
      resizeMode="cover"
      className="flex-1 bg-black">
      <View className="bg-black/55 flex-1" style={{ paddingTop: insets.top }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="flex-1 px-9"
          keyboardVerticalOffset={16}>
          <View className="flex-1">
            <View className="items-center pt-36">
              <ThemedText className="text-[42px] font-light tracking-[4px] text-white">AIYOU</ThemedText>
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
                  placeholder="账号"
                  placeholderTextColor="rgba(255,255,255,0.72)"
                  keyboardType={Platform.OS === 'ios' ? 'ascii-capable' : 'visible-password'}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="username"
                  textContentType="username"
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
                  <ThemedText className="text-[#989898] text-base">记住密码</ThemedText>
                </Pressable>
                <Link href="/screens/forgot-password" asChild>
                  <Pressable hitSlop={8}>
                    <ThemedText className="text-[#989898] text-base">忘记密码？</ThemedText>
                  </Pressable>
                </Link>
              </View>

              <Pressable
                onPress={handleLogin}
                disabled={isLoading}
                className={`h-12 items-center justify-center rounded-full border border-white bg-white ${isLoading ? 'opacity-70' : ''}`}>
                <ThemedText className="text-sm font-normal text-black">
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
