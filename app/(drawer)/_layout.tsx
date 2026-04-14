import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Drawer } from 'expo-router/drawer';
import { router } from 'expo-router';
import { useThemeColors } from '../contexts/ThemeColors';
import CustomDrawerContent from '@/components/CustomDrawerContent';
import { useFonts, Outfit_400Regular, Outfit_700Bold } from '@expo-google-fonts/outfit';
import { hasPrivateChatBackendSession } from '@/lib/authSession';

export default function DrawerLayout() {
    const colors = useThemeColors();
    const [fontsLoaded] = useFonts({
        Outfit_400Regular,
        Outfit_700Bold,
    });
    const [authChecked, setAuthChecked] = useState(false);

    useEffect(() => {
        hasPrivateChatBackendSession().then((loggedIn) => {
            if (!loggedIn) {
                router.replace('/screens/welcome');
            } else {
                setAuthChecked(true);
            }
        });
    }, []);

    // 未检查完 / 未登录时渲染空白背景，防止主页内容一闪而过
    if (!fontsLoaded || !authChecked) {
        return <View style={{ flex: 1 }} className="bg-background" />;
    }

    return (
        <Drawer
            screenOptions={{
                headerShown: false,
                drawerType: 'slide',
                drawerPosition: 'left',
                drawerStyle: {
                    backgroundColor: colors.bg,
                    //backgroundColor: 'red',
                    width: '85%',
                    flex: 1,
                },
                overlayColor: 'rgba(0,0,0, 0.4)',
                swipeEdgeWidth: 100
            }}
            drawerContent={(props) => <CustomDrawerContent drawerNavigation={props.navigation} />}
        >
            <Drawer.Screen
                name="index"
                options={{
                    title: 'Menu',
                    drawerLabel: 'Menu',
                }}
                //redirect={true}
            />
        </Drawer>
    );
}