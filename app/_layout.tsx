import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack, router, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../components/auth-context';
import { ProfileProvider } from '../components/profile-context';
import { TradeProvider } from '../components/trade-context';
import { CollectionProvider } from '../components/collection-context';
import { theme } from '../lib/theme';
import { KeyboardAvoidingView, Platform, TouchableOpacity, View } from 'react-native';
import { Text } from '../components/Text';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ===============================
// PERSISTENT TAB BAR
// ===============================

const TABS = [
  { name: 'Market', route: '/trade', icon: 'storefront', iconOutline: 'storefront-outline' },
  { name: 'Social', route: '/community', icon: 'people', iconOutline: 'people-outline' },
  { name: 'Hub', route: '/', icon: 'home', iconOutline: 'home-outline' },
  { name: 'Binder', route: '/binder', icon: 'book', iconOutline: 'book-outline' },
  { name: 'Pokédex', route: '/pokedex', icon: 'desktop', iconOutline: 'desktop-outline' },
];

function PersistentTabBar() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const tabBarHeight = Platform.OS === 'android' ? 64 + insets.bottom : 84;
  const tabBarPaddingBottom = Platform.OS === 'android' ? insets.bottom + 8 : 10;

  const isActive = (route: string) => {
    if (route === '/') return pathname === '/' || pathname === '/index';
    return pathname.startsWith(route);
  };

  const hideTabBar = pathname === '/' || pathname.startsWith('/(auth)') || pathname.startsWith('/login') || pathname.startsWith('/signup');

  if (hideTabBar) {
    return null;
  }

  return (
    <View style={{
      position: 'absolute',
      bottom: 0, left: 0, right: 0,
      height: tabBarHeight,
      backgroundColor: theme.colors.card,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      flexDirection: 'row',
      paddingTop: 8,
      paddingBottom: tabBarPaddingBottom,
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: -5 },
      elevation: 6,
    }}>
      {TABS.map((tab) => {
        const active = isActive(tab.route);
        return (
          <TouchableOpacity
            key={tab.route}
            onPress={() => router.push(tab.route as any)}
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 2,
            }}
          >
            <Ionicons
              name={active ? tab.icon as any : tab.iconOutline as any}
              size={24}
              color={active ? theme.colors.primary : theme.colors.textSoft}
            />
            <Text style={{
              fontSize: 11,
              fontWeight: '800',
              color: active ? theme.colors.primary : theme.colors.textSoft,
              marginTop: 2,
            }}>
              {tab.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ===============================
// ROOT LAYOUT
// ===============================

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}>
      <AuthProvider>
        <ProfileProvider>
          <CollectionProvider>
            <TradeProvider>
              <StatusBar style="dark" />
              <Stack
                screenOptions={{
                  headerShown: true,
                  gestureEnabled: true,
                  fullScreenGestureEnabled: true,
                  headerStyle: {
                    backgroundColor: theme.colors.bg,
                  },
                  headerTintColor: theme.colors.primary,
                  headerTitleStyle: {
                    color: theme.colors.text,
                    fontWeight: '900',
                  },
                  headerShadowVisible: false,
                  headerBackButtonDisplayMode: 'minimal',
                  headerBackTitle: '',
                }}
              >
                <Stack.Screen
                  name="(tabs)"
                  options={{
                    headerShown: false,
                    title: '',
                  }}
                />
                <Stack.Screen name="card/[id]" options={{ title: '' }} />
                <Stack.Screen name="set/[id]" options={{ title: '' }} />
                <Stack.Screen name="offer/new" options={{ title: '' }} />
                <Stack.Screen name="offer/index" options={{ title: '' }} />
                <Stack.Screen name="offer/[id]" options={{ title: '' }} />
                <Stack.Screen name="offers" options={{ title: '' }} />

                <Stack.Screen name="listing/new" options={{ title: '' }} />
                <Stack.Screen name="binder/new" options={{ title: '' }} />
                <Stack.Screen name="binder/[id]" options={{ title: '' }} />
                <Stack.Screen name="binder/add-cards" options={{ title: '' }} />
                <Stack.Screen name="scan" options={{ title: '' }} />
                <Stack.Screen name="scan/result" options={{ title: '' }} />
                <Stack.Screen name="market/index" options={{ title: '' }} />
                <Stack.Screen name="price-builder/index" options={{ title: '' }} />
                <Stack.Screen name="user/[id]" options={{ title: '' }} />
                <Stack.Screen name="trade/[userId]" options={{ title: '' }} />
                <Stack.Screen name="(auth)/login" options={{ title: '' }} />
                <Stack.Screen name="notifications" options={{ title: '' }} />
                <Stack.Screen name="scan/card-camera" options={{ title: '' }} />
              </Stack>
              <PersistentTabBar />
            </TradeProvider>
          </CollectionProvider>
        </ProfileProvider>
      </AuthProvider>
      </KeyboardAvoidingView>
    </GestureHandlerRootView>
  );
}
