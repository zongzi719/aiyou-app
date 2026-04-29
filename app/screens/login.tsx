import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  View,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  Image,
  ImageBackground,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon from '@/components/Icon';
import ThemedText from '@/components/ThemedText';
import { hasPrivateChatBackendSession, persistAuthSession } from '@/lib/authSession';
import { putProfileCache } from '@/lib/profileCache';
import { postUserLogin } from '@/lib/userLoginApi';
import { fetchProfile, needsAiBossModelOnboarding } from '@/services/profileApi';

/** 在原先约 47px 行高基础上再缩小 20% */
const LOGIN_INPUT_ROW_HEIGHT = Math.round(Math.round(36 * 1.3) * 0.8);

const loginInputTextStyle = {
  flex: 1,
  height: LOGIN_INPUT_ROW_HEIGHT,
  paddingVertical: 0,
  paddingHorizontal: 0,
  textAlign: 'left' as const,
  textAlignVertical: 'center' as const,
  fontSize: 14,
  color: '#FFFFFF',
  ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
};

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
  const [accountFocused, setAccountFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

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
  /** 设计稿 402×874 下的绝对坐标，已按安全区顶部内边距换算到内容区 */
  const wordmarkTop = Math.max(8, 244 - insets.top);
  const formTop = Math.max(0, 356 - insets.top);

  return (
    <ImageBackground
      source={require('@/assets/images/backgrounds/login-bg-v2.png')}
      resizeMode="cover"
      className="flex-1 bg-black">
      <View className="flex-1" style={{ paddingTop: insets.top }}>
        {/* Rectangle 579：顶部压暗 */}
        <LinearGradient
          pointerEvents="none"
          colors={['#000104', 'rgba(0, 0, 0, 0)']}
          locations={[0.35, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 316, zIndex: 0 }}
        />
        {/* Rectangle 578：底部渐黑 */}
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.55)', '#000000']}
          locations={[0, 0.38, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 420, zIndex: 0 }}
        />
        {/* Rectangle 580：轻微毛玻璃（近似 backdrop-blur） */}
        <BlurView
          pointerEvents="none"
          intensity={Platform.OS === 'ios' ? 22 : 12}
          tint="dark"
          style={[StyleSheet.absoluteFillObject, { zIndex: 0, opacity: 0.35 }]}
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="flex-1"
          style={{ zIndex: 1 }}
          keyboardVerticalOffset={16}>
          <View className="relative flex-1">
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: wordmarkTop,
                left: 0,
                right: 0,
                alignItems: 'center',
                zIndex: 2,
              }}>
              <Image
                source={require('@/assets/images/login-wordmark.png')}
                resizeMode="contain"
                style={{ width: Math.round(142 * 1.1), height: Math.round(38 * 1.1), opacity: 1 }}
              />
            </View>

            <View className="flex-1 px-[30px]" style={{ paddingTop: formTop }}>
              {!!apiError && (
                <ThemedText className="mb-3 text-center text-[16px] text-red-300">
                  {apiError}
                </ThemedText>
              )}

              <View
                className="mb-3 flex-row items-center rounded-[30px] px-4"
                style={{
                  height: LOGIN_INPUT_ROW_HEIGHT,
                  backgroundColor: accountFocused
                    ? 'rgba(130, 130, 130, 0.58)'
                    : '#3F3F3F80',
                  borderWidth: accountFocused ? 1 : 0,
                  borderColor: accountFocused ? '#FFFFFF' : 'transparent',
                }}>
                <TextInput
                  value={account}
                  onChangeText={(text) => {
                    setAccount(text);
                    if (accountError) validateAccount(text);
                    if (apiError) setApiError('');
                  }}
                  onFocus={() => setAccountFocused(true)}
                  onBlur={() => setAccountFocused(false)}
                  placeholder="手机号"
                  placeholderTextColor="rgba(255,255,255,0.85)"
                  keyboardType={Platform.OS === 'ios' ? 'ascii-capable' : 'visible-password'}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="username"
                  textContentType="username"
                  underlineColorAndroid="transparent"
                  style={loginInputTextStyle}
                />
              </View>
              {!!accountError && (
                <ThemedText className="-mt-2 mb-2 text-[14px] text-red-300">{accountError}</ThemedText>
              )}

              <View
                className="mb-3 flex-row items-center rounded-[30px] px-4"
                style={{
                  height: LOGIN_INPUT_ROW_HEIGHT,
                  backgroundColor: passwordFocused
                    ? 'rgba(130, 130, 130, 0.58)'
                    : '#3F3F3F80',
                  borderWidth: passwordFocused ? 1 : 0,
                  borderColor: passwordFocused ? '#FFFFFF' : 'transparent',
                }}>
                <TextInput
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (passwordError) validatePassword(text);
                    if (apiError) setApiError('');
                  }}
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                  placeholder="密码"
                  placeholderTextColor="rgba(255,255,255,0.85)"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  underlineColorAndroid="transparent"
                  style={loginInputTextStyle}
                />
                <Pressable
                  hitSlop={8}
                  onPress={() => setShowPassword((prev) => !prev)}
                  className="justify-center"
                  style={{ height: LOGIN_INPUT_ROW_HEIGHT }}>
                  <Icon
                    name={showPassword ? 'Eye' : 'EyeOff'}
                    size={18}
                    color="#FFFFFF"
                    strokeWidth={2}
                  />
                </Pressable>
              </View>
              {!!passwordError && (
                <ThemedText className="-mt-2 mb-2 text-[14px] text-red-300">{passwordError}</ThemedText>
              )}

              <View className="mb-6 mt-3 flex-row items-center justify-between">
                <Pressable
                  onPress={() => setRememberPassword((prev) => !prev)}
                  className="flex-row items-center"
                  hitSlop={8}>
                  {rememberPassword ? (
                    <View
                      className="mr-2.5 items-center justify-center rounded-full border-2 border-white"
                      style={{ width: 18, height: 18 }}>
                      <View className="rounded-full bg-white" style={{ width: 7, height: 7 }} />
                    </View>
                  ) : (
                    <View
                      className="mr-2.5 rounded-full bg-transparent"
                      style={{
                        width: 18,
                        height: 18,
                        borderWidth: 1.5,
                        borderColor: '#B0B0B0',
                      }}
                    />
                  )}
                  <ThemedText
                    className={`text-[14px] font-normal ${
                      rememberPassword ? 'text-[#C4C4C4]' : 'text-[#B0B0B0]'
                    }`}>
                    记住密码
                  </ThemedText>
                </Pressable>
                <Link href="/screens/forgot-password" asChild>
                  <Pressable hitSlop={8}>
                    <ThemedText className="text-[14px] font-normal text-[#989898]">忘记密码？</ThemedText>
                  </Pressable>
                </Link>
              </View>

              <Pressable
                onPress={handleLogin}
                disabled={isLoading}
                className={`h-[42px] items-center justify-center rounded-[30px] bg-white ${isLoading ? 'opacity-70' : ''}`}>
                <ThemedText className="text-[16px] font-normal text-black">
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
