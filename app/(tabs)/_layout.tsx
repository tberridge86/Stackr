import { Tabs } from 'expo-router';
import React from 'react';
import { Ionicons } from '@expo/vector-icons';

export default function TabLayout() {
  return (
    <Tabs
      initialRouteName="index"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#FFD166',
        tabBarInactiveTintColor: '#7f89b0',
        tabBarStyle: {
          backgroundColor: '#0d122b',
          borderTopWidth: 0,
          height: 82,
          paddingTop: 10,
          paddingBottom: 12,
          position: 'absolute',
          left: 14,
          right: 14,
          bottom: 14,
          borderRadius: 24,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
        },
        tabBarIcon: ({ color, size, focused }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'ellipse';

          if (route.name === 'trade') {
            iconName = focused ? 'swap-horizontal' : 'swap-horizontal-outline';
          }

          if (route.name === 'community') {
            iconName = focused ? 'people' : 'people-outline';
          }

          if (route.name === 'index') {
            iconName = focused ? 'home' : 'home-outline';
          }

          if (route.name === 'binder') {
            iconName = focused ? 'folder' : 'folder-outline';
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
          backgroundColor: '#080b1d',
        },
      })}
    >
      <Tabs.Screen name="trade" options={{ title: 'Trade' }} />
      <Tabs.Screen name="community" options={{ title: 'Community' }} />
      <Tabs.Screen name="index" options={{ title: 'Hub' }} />
      <Tabs.Screen name="binder" options={{ title: 'Binder' }} />
      <Tabs.Screen name="pokedex" options={{ title: 'Pokédex' }} />

      <Tabs.Screen name="profile" options={{ href: null }} />
      <Tabs.Screen name="market" options={{ href: null }} />
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}