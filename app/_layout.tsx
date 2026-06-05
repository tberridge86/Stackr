import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack, router, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../components/auth-context';
import { ProfileProvider } from '../components/profile-context';
import { TradeProvider } from '../components/trade-context';
import { CollectionProvider } from '../components/collection-context';
import { AchievementProvider } from '../components/achievement-context';
import { AppModeProvider, useAppMode } from '../components/app-mode-context';
import { ThemeProvider, useTheme } from '../components/theme-context';
import { KeyboardAvoidingView, Platform, TouchableOpacity, View } from 'react-native';
import { Text } from '../components/Text';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StripeProvider } from '@stripe/stripe-react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { BETA_TRADE_DEMO_MODE } from '../lib/config';
import { LatestFeaturesModal } from '../components/LatestFeaturesModal';

void SplashScreen.preventAutoHideAsync().catch(() => {});

// ===============================
// PERSISTENT TAB BAR
// ===============================

const TABS = [
  { name: 'Market\nPlace', route: '/(tabs)/trade', icon: 'storefront', iconOutline: 'storefront-outline' },
  { name: 'Social', route: '/(tabs)/community', icon: 'people', iconOutline: 'people-outline' },
  { name: 'Hub', route: '/(tabs)', icon: 'home', iconOutline: 'home-outline' },
  { name: 'Binder', route: '/(tabs)/binder', icon: 'book', iconOutline: 'book-outline' },
  { name: 'Pokédex', route: '/(tabs)/pokedex', icon: 'desktop', iconOutline: 'desktop-outline' },
];

function PersistentTabBar() {
  const { theme } = useTheme();
  const { mode } = useAppMode();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const tabs = [
    ...TABS.slice(0, 4),
    mode === 'seller'
      ? { name: 'Inventory', route: '/(tabs)/inventory', icon: 'file-tray-full', iconOutline: 'file-tray-full-outline' }
      : TABS[4],
  ];

  const tabBarHeight = Platform.OS === 'android' ? 64 + insets.bottom : 84;
  const tabBarPaddingBottom = Platform.OS === 'android' ? insets.bottom + 8 : 10;

  const isActive = (route: string) => {
    if (route === '/(tabs)') {
      return pathname === '/' || pathname === '/(tabs)' || pathname === '/(tabs)/index';
    }
    const publicRoute = route.replace('/(tabs)', '') || '/';
    return pathname === route
      || pathname.startsWith(`${route}/`)
      || pathname === publicRoute
      || pathname.startsWith(`${publicRoute}/`);
  };

  // Hide on splash screen route and auth routes
  const hideTabBar =
    pathname.startsWith('/(auth)') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/listing') ||
    pathname.startsWith('/grade') ||
    pathname.startsWith('/scan');

  if (hideTabBar) return null;

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
      shadowOpacity: theme.dark ? 0.4 : 0.08,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: -5 },
      elevation: 6,
    }}>
      {tabs.map((tab) => {
        const active = isActive(tab.route);
        const isHub = tab.name === 'Hub';
        return (
          <TouchableOpacity
            key={tab.route}
            onPress={() => router.push(tab.route as any)}
            style={{ flex: isHub ? 1.18 : 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 2 }}
          >
            <View style={{
              width: isHub ? 46 : 32,
              height: isHub ? 34 : 28,
              borderRadius: isHub ? 17 : 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isHub ? (active ? theme.colors.primary : theme.colors.primary + '18') : 'transparent',
              borderWidth: isHub ? 1 : 0,
              borderColor: isHub ? theme.colors.primary + '55' : 'transparent',
            }}>
              <Ionicons
                name={active ? tab.icon as any : tab.iconOutline as any}
                size={isHub ? 27 : 24}
                color={isHub ? (active ? '#fff' : theme.colors.primary) : active ? theme.colors.primary : theme.colors.textSoft}
              />
            </View>
            <Text style={{
              fontSize: isHub ? 12 : 10,
              lineHeight: isHub ? 14 : 11,
              fontWeight: isHub ? '900' : '800',
              color: active ? theme.colors.primary : theme.colors.textSoft,
              marginTop: isHub ? 1 : 2,
              textAlign: 'center',
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
// APP SHELL (theme-aware)
// ===============================

function AppNavigation() {
  const { theme, isDark } = useTheme();

  return (
    <AuthProvider>
      <ProfileProvider>
        <AppModeProvider>
          <CollectionProvider>
            <TradeProvider>
              <AchievementProvider>
                <StatusBar style={isDark ? 'light' : 'dark'} />
                <Stack
                  screenOptions={{
                    headerShown: true,
                    gestureEnabled: false,
                    fullScreenGestureEnabled: false,
                    headerStyle: { backgroundColor: theme.colors.bg },
                    headerTintColor: theme.colors.primary,
                    headerTitleStyle: { color: theme.colors.text, fontWeight: '900' },
                    headerShadowVisible: false,
                    headerBackButtonDisplayMode: 'minimal',
                    headerBackTitle: '',
                    contentStyle: { backgroundColor: theme.colors.bg },
                  }}
                >
                  <Stack.Screen name="index" options={{ headerShown: false }} />
                  <Stack.Screen name="(tabs)" options={{ headerShown: false, title: '' }} />
                  <Stack.Screen name="card/[id]" options={{ title: '' }} />
                  <Stack.Screen name="set/[id]" options={{ title: '' }} />
                  <Stack.Screen name="offer/new" options={{ title: '' }} />
                  <Stack.Screen name="offer/index" options={{ title: '' }} />
                  <Stack.Screen name="offer/[id]" options={{ title: '' }} />
                  <Stack.Screen name="offers" options={{ title: '' }} />
                  <Stack.Screen name="listing/new" options={{ headerShown: false, title: '' }} />
                  <Stack.Screen name="seller/onboarding" options={{ title: '' }} />
                  <Stack.Screen name="binder/new" options={{ title: '' }} />
                  <Stack.Screen name="binder/[id]" options={{ title: '' }} />
                  <Stack.Screen name="binder/add-cards" options={{ title: '' }} />
                  <Stack.Screen name="scan" options={{ title: '' }} />
                  <Stack.Screen name="scan/result" options={{ title: '' }} />
                  <Stack.Screen name="market/index" options={{ title: '' }} />
                  <Stack.Screen name="community/profile/[userId]" options={{ headerShown: false, title: '' }} />
                  <Stack.Screen name="price-builder/index" options={{ title: '' }} />
                  <Stack.Screen name="user/[id]" options={{ title: '' }} />
                  <Stack.Screen name="pokemon/[id]" options={{ title: '' }} />
                  <Stack.Screen name="trade/[userId]" options={{ title: '' }} />
                  <Stack.Screen name="(auth)/login" options={{ title: '' }} />
                  <Stack.Screen name="(auth)/callback" options={{ title: '' }} />
                  <Stack.Screen name="(auth)/reset-password" options={{ title: '' }} />
                  <Stack.Screen name="callback" options={{ title: '' }} />
                  <Stack.Screen name="reset-password" options={{ title: '' }} />
                  <Stack.Screen name="auth/callback" options={{ title: '' }} />
                  <Stack.Screen name="auth/reset-password" options={{ title: '' }} />
                  <Stack.Screen name="notifications" options={{ title: '' }} />
                  <Stack.Screen name="scan/card-camera" options={{ title: '' }} />
                </Stack>
                <LatestFeaturesModal />
                <PersistentTabBar />
              </AchievementProvider>
            </TradeProvider>
          </CollectionProvider>
        </AppModeProvider>
      </ProfileProvider>
    </AuthProvider>
  );
}

function AppShell() {
  const { theme } = useTheme();

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}>
        {BETA_TRADE_DEMO_MODE ? (
          <AppNavigation />
        ) : (
          <StripeProvider publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ''}>
            <AppNavigation />
          </StripeProvider>
        )}
      </KeyboardAvoidingView>
    </GestureHandlerRootView>
  );
}

// ===============================
// ROOT LAYOUT
// ===============================

export default function RootLayout() {
  useEffect(() => {
    const timeout = setTimeout(() => {
      void SplashScreen.hideAsync().catch(() => {});
    }, 350);

    return () => clearTimeout(timeout);
  }, []);

  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}
