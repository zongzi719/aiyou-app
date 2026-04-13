import React from 'react';
import { Drawer } from 'expo-router/drawer';
import { useThemeColors } from '../contexts/ThemeColors';
import CustomDrawerContent from '@/components/CustomDrawerContent';
import { useFonts, Outfit_400Regular, Outfit_700Bold } from '@expo-google-fonts/outfit';

export default function DrawerLayout() {
    const colors = useThemeColors();
    const [fontsLoaded] = useFonts({
        Outfit_400Regular,
        Outfit_700Bold,
    });

    if (!fontsLoaded) {
        return null;
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