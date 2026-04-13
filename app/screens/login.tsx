import { Link, router } from 'expo-router';
import React, { useState } from 'react';
import { View, Pressable, Alert, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import ThemedText from '@/components/ThemedText';
import Input from '@/components/forms/Input';
import { persistAuthSession } from '@/lib/authSession';
import { postUserLogin } from '@/lib/userLoginApi';

export default function LoginScreen() {
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [accountError, setAccountError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  const validateAccount = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setAccountError('请输入邮箱、手机号或用户名');
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
    <View style={{ paddingTop: insets.top }} className="flex-1 bg-background">
      <ScrollView
        className="flex-1 px-10 pt-20"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }}>
        <View className="mt-8">
          <ThemedText className="mb-2 font-outfit-bold text-4xl">AI You</ThemedText>
          <ThemedText className="mb-12 text-lg leading-relaxed text-subtext">
            你的思维，从此多一个你
          </ThemedText>

          {apiError ? (
            <ThemedText className="mb-4 text-sm text-red-500">{apiError}</ThemedText>
          ) : null}

          <Input
            label="邮箱、手机号或用户名"
            variant="classic"
            value={account}
            onChangeText={(text) => {
              setAccount(text);
              if (accountError) validateAccount(text);
              if (apiError) setApiError('');
            }}
            error={accountError}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
          />

          <Input
            label="密码"
            variant="classic"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (passwordError) validatePassword(text);
              if (apiError) setApiError('');
            }}
            error={passwordError}
            isPassword
            autoCapitalize="none"
          />

          <Link className="mb-4 text-sm text-primary underline" href="/screens/forgot-password">
            忘记密码？
          </Link>

          <Button
            title="登录"
            onPress={handleLogin}
            loading={isLoading}
            size="large"
            className="mb-6"
            rounded="full"
          />

          <View className="flex-row flex-wrap justify-center">
            <ThemedText className="text-subtext">还没有账号？</ThemedText>
            <Link href="/screens/signup" asChild>
              <Pressable>
                <ThemedText className="underline">注册</ThemedText>
              </Pressable>
            </Link>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
