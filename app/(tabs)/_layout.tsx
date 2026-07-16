import { Tabs } from 'expo-router';
import React from 'react';
import { Image } from 'react-native';
import { useTheme } from '../../components/theme-context';
import { stackrIcons } from '../../lib/stackrIcons';
import { StackrCardActionIcon } from '../../components/StackrScreen';
import { stackrTabBarSizes } from '../../lib/stackrSizing';

export default function TabLayout() {
  const { theme } = useTheme();
  return (
    <Tabs
      initialRouteName="index"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: { display: 'none' },
        sceneStyle: {
          backgroundColor: theme.colors.bg,
        },
        tabBarIcon: ({ size }) => {
          const icon =
            route.name === 'market' ? stackrIcons.marketplace :
            route.name === 'search' ? stackrIcons.searchCard :
            route.name === 'index' ? stackrIcons.hub :
            route.name === 'binder' ? stackrIcons.binders :
            route.name === 'inventory' ? stackrIcons.sellerMode :
            null;

          if (!icon) return null;
          if (route.name === 'search') {
            return (
              <StackrCardActionIcon
                source={icon}
                frameSize={size}
                artworkSize={Math.max(stackrTabBarSizes.nativeSearchMinArtwork, size - 4)}
              />
            );
          }
          return <Image source={icon} resizeMode="contain" style={{ width: size, height: size }} />;
        },
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="binder" options={{ title: 'Collection' }} />
      <Tabs.Screen name="market" options={{ title: 'The Market' }} />
      <Tabs.Screen name="search" options={{ title: 'Search' }} />
      <Tabs.Screen name="community/index" options={{ title: 'Community', href: null }} />
      <Tabs.Screen name="inventory" options={{ title: 'Inventory' }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
      <Tabs.Screen name="trade" options={{ href: null }} />
      <Tabs.Screen name="explore" options={{ href: null }} />
      <Tabs.Screen name="pokedex" options={{ href: null }} />
    </Tabs>
  );
}
