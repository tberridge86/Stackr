import { CORE_COLLECTION_MODE, CORE_TAB_ROUTES } from '../../lib/appCapabilities';
import { StackrFunctionalIcon } from '../../components/StackrFunctionalIcon';
import { Tabs } from 'expo-router';
import React from 'react';

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
          return <StackrFunctionalIcon source={icon} resizeMode="contain" style={{ width: size, height: size }} />;
        },
      })}
    >
      <Tabs.Protected guard={!CORE_COLLECTION_MODE || CORE_TAB_ROUTES.includes("index")}>
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
      </Tabs.Protected>
      <Tabs.Protected guard={!CORE_COLLECTION_MODE || CORE_TAB_ROUTES.includes("binder")}>
        <Tabs.Screen name="binder" options={{ title: 'Binders' }} />
      </Tabs.Protected>
      <Tabs.Protected guard={!CORE_COLLECTION_MODE || CORE_TAB_ROUTES.includes("scan-hub")}>
        <Tabs.Screen name="scan-hub" options={{ title: 'Scan', href: null }} />
      </Tabs.Protected>
      <Tabs.Protected guard={!CORE_COLLECTION_MODE || CORE_TAB_ROUTES.includes("market")}>
        <Tabs.Screen name="market" options={{ title: 'Market' }} />
      </Tabs.Protected>
      <Tabs.Protected guard={!CORE_COLLECTION_MODE || CORE_TAB_ROUTES.includes("search")}>
        <Tabs.Screen name="search" options={{ title: 'Search' }} />
      </Tabs.Protected>
      <Tabs.Protected guard={!CORE_COLLECTION_MODE || CORE_TAB_ROUTES.includes("community/index")}>
        <Tabs.Screen name="community/index" options={{ title: 'Community', href: null }} />
      </Tabs.Protected>
      <Tabs.Protected guard={!CORE_COLLECTION_MODE || CORE_TAB_ROUTES.includes("inventory")}>
        <Tabs.Screen name="inventory" options={{ title: 'Inventory' }} />
      </Tabs.Protected>
      <Tabs.Protected guard={!CORE_COLLECTION_MODE || CORE_TAB_ROUTES.includes("profile")}>
        <Tabs.Screen name="profile" options={{ href: null }} />
      </Tabs.Protected>
      <Tabs.Protected guard={!CORE_COLLECTION_MODE || CORE_TAB_ROUTES.includes("trade")}>
        <Tabs.Screen name="trade" options={{ href: null }} />
      </Tabs.Protected>
      <Tabs.Protected guard={!CORE_COLLECTION_MODE || CORE_TAB_ROUTES.includes("explore")}>
        <Tabs.Screen name="explore" options={{ href: null }} />
      </Tabs.Protected>
      <Tabs.Protected guard={!CORE_COLLECTION_MODE || CORE_TAB_ROUTES.includes("pokedex")}>
        <Tabs.Screen name="pokedex" options={{ href: null }} />
      </Tabs.Protected>
    </Tabs>
  );
}

