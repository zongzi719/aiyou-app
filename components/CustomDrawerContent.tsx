import { router } from 'expo-router';
import { useDrawerStatus } from '@react-navigation/drawer';
import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { shadowPresets } from '@/utils/useShadow';
import ThemedText from './ThemedText';
import Icon, { IconName } from './Icon';
import useThemeColors from '@/app/contexts/ThemeColors';
import ThemeToggle from '@/components/ThemeToggle';
import ThemedScroller from './ThemeScroller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Avatar from './Avatar';
import { hasPrivateChatBackendSession } from '@/lib/authSession';
import { searchPrivateThreads, type ThreadSummary } from '@/lib/privateChatApi';
import { fetchProfile, bustAvatarCache, type UserProfile } from '@/services/profileApi';

type Props = {
    drawerNavigation: { closeDrawer: () => void };
};

export default function CustomDrawerContent({ drawerNavigation }: Props) {
    const insets = useSafeAreaInsets();
    const colors = useThemeColors();
    const drawerStatus = useDrawerStatus();
    const [privateThreads, setPrivateThreads] = useState<ThreadSummary[]>([]);
    const [threadsLoading, setThreadsLoading] = useState(false);
    const [profile, setProfile] = useState<UserProfile | null>(null);

    useEffect(() => {
        if (drawerStatus !== 'open') return;
        let cancelled = false;
        void (async () => {
            setThreadsLoading(true);
            try {
                if (!(await hasPrivateChatBackendSession())) {
                    if (!cancelled) setPrivateThreads([]);
                    return;
                }
                const [list, prof] = await Promise.all([
                    searchPrivateThreads({ limit: 40 }),
                    fetchProfile().catch(() => null),
                ]);
                if (!cancelled) {
                    setPrivateThreads(list);
                    if (prof) setProfile(prof);
                }
            } finally {
                if (!cancelled) setThreadsLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [drawerStatus]);

    return (
        <View className="flex-1 px-global bg-background" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
            <ThemedScroller className='flex-1 px-0 '>
                <View className='flex-row justify-between items-center mt-4'>
                    <View
                        className='bg-secondary rounded-full relative flex-1 mr-4' style={shadowPresets.medium}>
                        <Icon name="Search" className="absolute top-4 left-4 z-50" size={20} />
                        <TextInput
                            className='h-[47px] pl-12 pr-3 rounded-lg bg-transparent text-primary'
                            placeholder='Search'
                            placeholderTextColor={colors.placeholder}
                            returnKeyType="done"
                            autoFocus={false}
                        />
                    </View>
                    <ThemeToggle />
                </View>


                <View className='flex-col pb-4 mb-4 mt-4 border-b border-border'>
                    <NavItem
                        href="/"
                        icon="Plus"
                        label="New chat"
                        onPress={() => {
                            drawerNavigation.closeDrawer();
                            router.replace({ pathname: '/', params: { newChat: '1' } });
                        }}
                    />
                    <NavItem
                        href="/screens/knowledge-base"
                        icon="BookOpen"
                        label="知识库"
                        onPress={() => {
                            drawerNavigation.closeDrawer();
                            router.push('/screens/knowledge-base');
                        }}
                    />
                    <NavItem
                        href="/screens/memory"
                        icon="Brain"
                        label="记忆库"
                        onPress={() => {
                            drawerNavigation.closeDrawer();
                            router.push('/screens/memory');
                        }}
                    />
                    <NavItem href="/screens/search-form" icon="LayoutGrid" label="Explore" />
                </View>

                {threadsLoading ? (
                    <View className="py-4 items-center">
                        <ActivityIndicator color={colors.highlight} />
                    </View>
                ) : null}
                {!threadsLoading && privateThreads.length > 0 ? (
                    <View className="mb-4 border-b border-border pb-4">
                        <ThemedText className="mb-2 text-xs font-semibold uppercase text-subtext">
                            历史对话
                        </ThemedText>
                        {privateThreads.map((t) => (
                            <TouchableOpacity
                                key={t.thread_id}
                                className="py-2.5 pr-2"
                                onPress={() => {
                                    drawerNavigation.closeDrawer();
                                    router.replace({
                                        pathname: '/',
                                        params: { openThreadId: t.thread_id },
                                    });
                                }}>
                                <ThemedText className="text-base text-primary" numberOfLines={1}>
                                    {t.title}
                                </ThemedText>
                            </TouchableOpacity>
                        ))}
                    </View>
                ) : null}

            </ThemedScroller>
            <TouchableOpacity activeOpacity={0.8} onPress={() => router.push('/screens/profile')} className='bg-background flex-row justify-start items-center pt-4 pb-4 border rounded-3xl px-4 border-border'>
                <Avatar
                    src={profile?.avatar_url
                        ? bustAvatarCache(profile.avatar_url)
                        : require('@/assets/img/thomino.jpg')}
                    name={profile?.display_name || profile?.username}
                    size="md"
                />
                <View className='ml-4 flex-1'>
                    <ThemedText className='text-base font-semibold' numberOfLines={1}>
                        {profile?.display_name || profile?.username || 'AI You'}
                    </ThemedText>
                    <ThemedText className='opacity-50 text-xs' numberOfLines={1}>
                        @{profile?.username || '—'}
                    </ThemedText>
                </View>
                <Icon name="ChevronRight" size={18} className='ml-2' />
            </TouchableOpacity>

        </View>
    );
}

type NavItemProps = {
    href: string;
    icon: IconName;
    label: string;
    className?: string;
    description?: string;
    onPress?: () => void;
};

export const NavItem = ({ href, icon, label, description, onPress }: NavItemProps) => (

        <TouchableOpacity
            onPress={onPress ?? (() => router.push(href))}
            className={`flex-row items-center py-2`}>
            <View className='flex-row items-center justify-center w-9 h-9 bg-secondary rounded-lg'>
                <Icon name={icon} size={18} className='' />
            </View>
            <View className='flex-1 ml-4 '>
                {label &&
                    <ThemedText className="text-base font-bold">{label}</ThemedText>
                }
                {description &&
                    <ThemedText className='opacity-50 text-xs'>{description}</ThemedText>
                }
            </View>

        </TouchableOpacity>

);
