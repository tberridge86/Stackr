import { Tabs } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../lib/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  const tabBarHeight = Platform.OS === 'android'
    ? 64 + insets.bottom
    : 84;

  const tabBarPaddingBottom = Platform.OS === 'android'
    ? insets.bottom + 8
    : 10;

  return (
    <Tabs
      initialRouteName="index"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSoft,
        tabBarStyle: {
          backgroundColor: theme.colors.card,
          borderTopColor: theme.colors.border,
          borderTopWidth: 1,
          height: tabBarHeight,
          paddingTop: 8,
          paddingBottom: tabBarPaddingBottom,
          shadowColor: '#000',
          shadowOpacity: 0.08,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 5 },
          elevation: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '800',
          marginBottom: Platform.OS === 'android' ? 4 : 0,
        },
        tabBarIcon: ({ color, size, focused }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'ellipse';

          if (route.name === 'trade') {
            iconName = focused ? 'storefront' : 'storefront-outline';
          }
          if (route.name === 'community/index') {
            iconName = focused ? 'people' : 'people-outline';
          }
          if (route.name === 'index') {
            iconName = focused ? 'home' : 'home-outline';
          }
          if (route.name === 'binder') {
            iconName = focused ? 'book' : 'book-outline';
          }
          if (route.name === 'pokedex') {
            iconName = focused ? 'desktop' : 'desktop-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarItemStyle: {
          paddingVertical: 2,
        },
        sceneStyle: {
          backgroundColor: theme.colors.bg,
        },
      })}
    >
      <Tabs.Screen name="trade" options={{ title: 'Market' }} />
      <Tabs.Screen
        name="community/index"
        options={{ title: 'Social', tabBarLabel: 'Social' }}
      />
      <Tabs.Screen name="index" options={{ title: 'Hub' }} />
      <Tabs.Screen name="binder" options={{ title: 'Binder' }} />
      <Tabs.Screen name="pokedex" options={{ title: 'Pokédex' }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
      <Tabs.Screen name="market" options={{ href: null }} />
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}