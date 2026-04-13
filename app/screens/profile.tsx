import { View, Image, ScrollView } from 'react-native';
import Header, { HeaderIcon } from '@/components/Header';
import ThemedText from '@/components/ThemedText';
import Avatar from '@/components/Avatar';
import ListLink from '@/components/ListLink';
import AnimatedView from '@/components/AnimatedView';
import ThemedScroller from '@/components/ThemeScroller';
import { shadowPresets } from '@/utils/useShadow';

export default function ProfileScreen() {
    return (
        <AnimatedView className='flex-1 bg-background' animation='fadeIn' duration={350} playOnlyOnce={false}   >
            <Header showBackButton title="Profile" />
            <ThemedScroller className='!px-10'>
                <View className=" px-6 py-10 w-full border border-border rounded-3xl mb-4">
                    <View className="flex-col justify-center items-center">
                        <Avatar src={require('@/assets/img/thomino.jpg')} size="xl" />
                        <View className="items-center flex-1 mt-3">
                            <ThemedText className="text-2xl font-bold">John Doe</ThemedText>
                            <View className='flex flex-row items-center'>
                                <ThemedText className='text-sm text-subtext'>johndoe@gmail.com</ThemedText>
                            </View>
                        </View>
                    </View>
                </View>

                <View style={shadowPresets.medium} className='bg-secondary rounded-3xl  '>
                    <ListLink className='px-5' hasBorder title="Settings" icon="Settings" href="/screens/edit-profile" />
                    <ListLink className='px-5' hasBorder title="Upgrade to plus" icon="MapPin" href="/screens/subscription" />
                    <ListLink className='px-5' hasBorder title="Ai Voice" icon="MicVocal" href="/screens/ai-voice" />
                    <ListLink className='px-5' hasBorder title="Help" icon="HelpCircle" href="/screens/help" />
                    <ListLink className='px-5' title="Logout" icon="LogOut" href="/screens/welcome" />
                </View>
            </ThemedScroller>

        </AnimatedView>
    );
}