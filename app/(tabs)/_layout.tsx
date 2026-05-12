import { Tabs } from 'expo-router';
import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../components/theme-context';

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
        tabBarIcon: ({ color, size, focused }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'ellipse';
          if (route.name === 'trade') iconName = focused ? 'storefront' : 'storefront-outline';
          if (route.name === 'community/index') iconName = focused ? 'people' : 'people-outline';
          if (route.name === 'index') iconName = focused ? 'home' : 'home-outline';
          if (route.name === 'binder') iconName = focused ? 'book' : 'book-outline';
          if (route.name === 'pokedex') iconName = focused ? 'desktop' : 'desktop-outline';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tabs.Screen name="trade" options={{ title: 'Market' }} />
      <Tabs.Screen name="community/index" options={{ title: 'Social', tabBarLabel: 'Social' }} />
      <Tabs.Screen name="index" options={{ title: 'Hub' }} />
      <Tabs.Screen name="binder" options={{ title: 'Binder' }} />
      <Tabs.Screen name="pokedex" options={{ title: 'Pokédex' }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
      <Tabs.Screen name="market" options={{ href: null }} />
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}
