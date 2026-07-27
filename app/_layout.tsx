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
import { Image, InteractionManager, KeyboardAvoidingView, Platform, Text as NativeText, TextInput as NativeTextInput, TouchableOpacity, View } from 'react-native';
import { Text } from '../components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StripeAppProvider } from '../components/StripeAppProvider';
import * as SplashScreen from 'expo-splash-screen';
import { memo, useEffect, useState } from 'react';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/inter';
import { BETA_TRADE_DEMO_MODE } from '../lib/config';
import { LatestFeaturesModal } from '../components/LatestFeaturesModal';
import { StackrPopupProvider } from '../components/StackrPopupProvider';
import { StackrQueryProvider } from '../components/StackrQueryProvider';
import { StackrBackdrop } from '../components/StackrBackdrop';
import { stackrIcons } from '../lib/stackrIcons';
import { stackrFonts, typeScale } from '../lib/typography';
import { COLLECTOR_TABS, SELLER_TABS } from '../lib/routes';
import { StackrCardActionIcon } from '../components/StackrScreen';
import { stackrTabBarSizes } from '../lib/stackrSizing';
import { installRuntimeFetchDiagnostics } from '../lib/runtimeFetchDiagnostics';

installRuntimeFetchDiagnostics();
void SplashScreen.preventAutoHideAsync().catch(() => {});

function configureNativeTypographyDefaults() {
  const nativeText = NativeText as any;
  const nativeTextInput = NativeTextInput as any;
  const textDefaults = nativeText.defaultProps ?? {};
  const inputDefaults = nativeTextInput.defaultProps ?? {};
  const baseTextStyle = {
    fontFamily: stackrFonts.medium,
    fontWeight: '500',
    letterSpacing: 0,
  };

  nativeText.defaultProps = {
    ...textDefaults,
    allowFontScaling: textDefaults.allowFontScaling ?? true,
    maxFontSizeMultiplier: textDefaults.maxFontSizeMultiplier ?? 1.25,
    style: [baseTextStyle, textDefaults.style],
  };
  nativeTextInput.defaultProps = {
    ...inputDefaults,
    allowFontScaling: inputDefaults.allowFontScaling ?? true,
    maxFontSizeMultiplier: inputDefaults.maxFontSizeMultiplier ?? 1.2,
    style: [baseTextStyle, inputDefaults.style],
  };
}

// ===============================
// PERSISTENT TAB BAR
// ===============================

const {
  homeFrame: HOME_TAB_FRAME_SIZE,
  secondaryFrame: SECONDARY_TAB_FRAME_SIZE,
  homeIcon: HOME_TAB_ICON_SIZE,
  secondaryIcon: SECONDARY_TAB_ICON_SIZE,
  marketCommunityIcon: MARKET_COMMUNITY_TAB_ICON_SIZE,
  bindersVaultIcon: BINDERS_VAULT_TAB_ICON_SIZE,
  centerScanFrame: CENTER_SCAN_FRAME_SIZE,
  centerScanIcon: CENTER_SCAN_ICON_SIZE,
  footerSearchIcon: FOOTER_SEARCH_ICON_SIZE,
  barHeightIos: TAB_BAR_HEIGHT_IOS,
  barHeightAndroid: TAB_BAR_HEIGHT_ANDROID,
  paddingBottomIos: TAB_BAR_PADDING_BOTTOM_IOS,
  paddingBottomAndroid: TAB_BAR_PADDING_BOTTOM_ANDROID,
  activeGlowExtra: ACTIVE_GLOW_EXTRA,
  activeGlowCoreExtra: ACTIVE_GLOW_CORE_EXTRA,
  scanRaise: SCAN_TAB_RAISE,
  tabRaise: STANDARD_TAB_RAISE,
} = stackrTabBarSizes;

const TAB_ICONS: Record<string, any> = {
  home: stackrIcons.hub,
  collection: stackrIcons.binders,
  scan: stackrIcons.scanCard,
  market: stackrIcons.marketplace,
  search: stackrIcons.searchCard,
  dashboard: stackrIcons.hub,
  inventory: stackrIcons.stock,
  listings: stackrIcons.sellerMode,
  orders: stackrIcons.trade,
};

const shouldHideShellControls = (pathname: string) =>
  pathname.startsWith('/(auth)') ||
  pathname.startsWith('/login') ||
  pathname.startsWith('/signup') ||
  pathname.startsWith('/binder/new') ||
  pathname.startsWith('/listing') ||
  pathname.startsWith('/grade') ||
  pathname.startsWith('/scan');

const PersistentTabBar = memo(function PersistentTabBar() {
  const { theme } = useTheme();
  const { mode } = useAppMode();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const tabs = mode === 'seller' ? SELLER_TABS : COLLECTOR_TABS;

  const tabBarHeight = Platform.OS === 'android'
    ? TAB_BAR_HEIGHT_ANDROID + insets.bottom
    : TAB_BAR_HEIGHT_IOS;
  const tabBarPaddingBottom = Platform.OS === 'android'
    ? insets.bottom + TAB_BAR_PADDING_BOTTOM_ANDROID
    : TAB_BAR_PADDING_BOTTOM_IOS;

  const isActive = (tab: (typeof tabs)[number]) => {
    const route = typeof tab.route === 'string' ? tab.route : String(tab.route.pathname ?? '');
    if (tab.key === 'home') {
      return pathname === '/' || pathname === '/(tabs)' || pathname === '/(tabs)/index';
    }
    if (tab.key === 'collection') {
      return pathname.startsWith('/binder') || pathname.startsWith('/collection') || pathname.startsWith('/set') || pathname.startsWith('/pokemon') || pathname.startsWith('/duplicates') || pathname === '/(tabs)/binder';
    }
    if (tab.key === 'scan') return pathname.startsWith('/scan');
    if (tab.key === 'market' || tab.key === 'listings') {
      return pathname.startsWith('/(tabs)/market')
        || pathname.startsWith('/market')
        || pathname.startsWith('/trade')
        || pathname.startsWith('/marketplace')
        || pathname.startsWith('/market-place')
        || pathname.startsWith('/offer')
        || pathname.startsWith('/offers')
        || pathname.startsWith('/listing')
        || pathname.startsWith('/orders')
        || pathname.startsWith('/watchlist')
        || pathname.startsWith('/prices')
        || pathname.startsWith('/price-builder');
    }
    if (tab.key === 'search') {
      return pathname.startsWith('/(tabs)/search') || pathname.startsWith('/search') || pathname.startsWith('/product') || pathname.startsWith('/card') || pathname.startsWith('/set');
    }
    if (tab.key === 'dashboard') {
      return pathname === '/'
        || pathname === '/(tabs)'
        || pathname === '/(tabs)/index'
        || pathname === '/seller'
        || pathname === '/seller/index';
    }
    if (tab.key === 'inventory') return pathname.startsWith('/(tabs)/inventory') || pathname.startsWith('/inventory');
    if (tab.key === 'orders') return pathname.startsWith('/seller/orders');
    const publicRoute = route.replace('/(tabs)', '') || '/';
    return pathname === route
      || pathname.startsWith(`${route}/`)
      || pathname === publicRoute
      || pathname.startsWith(`${publicRoute}/`);
  };

  if (shouldHideShellControls(pathname)) return null;

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
        const active = isActive(tab);
        const isHome = tab.key === 'home';
        const isScan = tab.key === 'scan';
        const frameSize = isScan ? CENTER_SCAN_FRAME_SIZE : isHome ? HOME_TAB_FRAME_SIZE : SECONDARY_TAB_FRAME_SIZE;
        const iconSize = isScan
          ? CENTER_SCAN_ICON_SIZE
          : isHome
          ? HOME_TAB_ICON_SIZE
          : tab.key === 'market' || tab.key === 'search' || tab.key === 'listings' || tab.key === 'orders'
            ? MARKET_COMMUNITY_TAB_ICON_SIZE
            : tab.key === 'collection' || tab.key === 'inventory' || tab.key === 'dashboard'
              ? BINDERS_VAULT_TAB_ICON_SIZE
              : SECONDARY_TAB_ICON_SIZE;
        const icon = TAB_ICONS[tab.key] ?? stackrIcons.hub;
        const usesCardArtworkIcon = tab.key === 'scan' || tab.key === 'search';
        const cardArtworkSize = tab.key === 'scan' ? CENTER_SCAN_ICON_SIZE : FOOTER_SEARCH_ICON_SIZE;
        const activeGlowColor = theme.dark ? 'rgba(180,150,255,0.22)' : 'rgba(190,168,255,0.34)';
        const activeGlowCoreColor = theme.dark ? 'rgba(165,132,255,0.18)' : 'rgba(211,198,255,0.42)';
        const glowFrameSize = frameSize + ACTIVE_GLOW_EXTRA;
        return (
          <TouchableOpacity
            key={tab.key}
            onPress={() => router.push(tab.route as any)}
            activeOpacity={0.82}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: active }}
            style={{
              flex: 1,
              minHeight: 66,
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 2,
            }}
          >
            <View style={{
              width: frameSize,
              height: frameSize,
              borderRadius: frameSize / 2,
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: isScan ? -SCAN_TAB_RAISE : -STANDARD_TAB_RAISE,
              backgroundColor: isScan
                ? theme.colors.primary
                : 'transparent',
              borderWidth: isScan ? 1 : 0,
              borderColor: isScan ? theme.colors.primary + '45' : 'transparent',
              shadowColor: isScan ? theme.colors.primary : 'transparent',
              shadowOpacity: isScan ? 0.24 : 0,
              shadowRadius: isScan ? 11 : 7,
              shadowOffset: { width: 0, height: isScan ? 4 : 2 },
              elevation: isScan ? 5 : 0,
            }}>
              {active ? (
                <>
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      width: glowFrameSize,
                      height: glowFrameSize,
                      borderRadius: glowFrameSize / 2,
                      backgroundColor: activeGlowColor,
                      shadowColor: '#BDA7FF',
                      shadowOpacity: theme.dark ? 0.22 : 0.16,
                      shadowRadius: 11,
                      shadowOffset: { width: 0, height: 2 },
                      elevation: isScan ? 0 : 2,
                    }}
                  />
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      width: frameSize + ACTIVE_GLOW_CORE_EXTRA,
                      height: frameSize + ACTIVE_GLOW_CORE_EXTRA,
                      borderRadius: (frameSize + ACTIVE_GLOW_CORE_EXTRA) / 2,
                      backgroundColor: activeGlowCoreColor,
                    }}
                  />
                </>
              ) : null}
              {usesCardArtworkIcon ? (
                <StackrCardActionIcon
                  source={icon}
                  frameSize={frameSize}
                  artworkSize={cardArtworkSize}
                  imageStyle={{ opacity: isScan ? 0.98 : 1 }}
                />
              ) : (
                <Image
                  source={icon}
                  resizeMode="contain"
                  style={{
                    width: iconSize,
                    height: iconSize,
                  }}
                />
              )}
            </View>
            <Text style={{
              ...(isScan ? typeScale.caption : isHome ? typeScale.caption : typeScale.micro),
              fontWeight: isScan || isHome ? '800' : '600',
              color: active || isScan ? theme.colors.primary : theme.colors.textSoft,
              marginTop: 0,
              textAlign: 'center',
              width: '100%',
            }}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
});

// ===============================
// APP SHELL (theme-aware)
// ===============================

function AppNavigation() {
  const { theme } = useTheme();
  const [showDeferredShellExtras, setShowDeferredShellExtras] = useState(false);
  const legacyRedirectScreenOptions = {
    headerShown: false,
    animation: 'none' as const,
  };

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      setShowDeferredShellExtras(true);
    });

    return () => {
      task.cancel?.();
    };
  }, []);

  return (
    <AuthProvider>
      <ProfileProvider>
        <AppModeProvider>
          <CollectionProvider>
            <TradeProvider>
              <AchievementProvider>
                <StatusBar style="dark" />
                <Stack
                  screenOptions={{
                    headerShown: true,
                    gestureEnabled: false,
                    fullScreenGestureEnabled: false,
                    headerStyle: { backgroundColor: 'transparent' },
                    headerBackground: () => (
                      <View style={{ flex: 1, backgroundColor: theme.colors.bg, overflow: 'hidden' }}>
                        <StackrBackdrop />
                      </View>
                    ),
                    headerTintColor: theme.colors.primary,
                    headerTitleStyle: { color: theme.colors.text, ...typeScale.cardTitle },
                    headerShadowVisible: false,
                    headerBackButtonDisplayMode: 'minimal',
                    headerBackTitle: '',
                    contentStyle: { backgroundColor: theme.colors.bg },
                  }}
                >
                  <Stack.Screen name="index" options={{ headerShown: false }} />
                  <Stack.Screen name="(tabs)" options={{ headerShown: false, title: '' }} />
                  <Stack.Screen name="search" options={legacyRedirectScreenOptions} />
                  <Stack.Screen name="card/[id]" options={{ title: '' }} />
                  <Stack.Screen name="set/[id]" options={{ title: '' }} />
                  <Stack.Screen name="product/[id]" options={{ title: '' }} />
                  <Stack.Screen name="offer/new" options={{ title: '' }} />
                  <Stack.Screen name="offer/index" options={{ title: '' }} />
                  <Stack.Screen name="offer/[id]" options={{ title: '' }} />
                  <Stack.Screen name="offers" options={{ title: '' }} />
                  <Stack.Screen name="orders" options={{ title: '' }} />
                  <Stack.Screen name="watchlist" options={{ title: '' }} />
                  <Stack.Screen name="value-history" options={{ title: 'Value History' }} />
                  <Stack.Screen name="listing/new" options={{ headerShown: false, title: '' }} />
                  <Stack.Screen name="listing/[id]" options={legacyRedirectScreenOptions} />
                  <Stack.Screen name="listing/index" options={legacyRedirectScreenOptions} />
                  <Stack.Screen name="listing/camera" options={legacyRedirectScreenOptions} />
                  <Stack.Screen name="seller/index" options={{ headerShown: false, title: '' }} />
                  <Stack.Screen name="seller/onboarding" options={{ title: '' }} />
                  <Stack.Screen name="seller/orders" options={{ title: '' }} />
                  <Stack.Screen name="binder/new" options={{ headerShown: false, title: '' }} />
                  <Stack.Screen name="binder/[id]" options={{ headerShown: false, title: '' }} />
                  <Stack.Screen name="binder/add-cards" options={{ title: '' }} />
                  <Stack.Screen name="binder/index" options={legacyRedirectScreenOptions} />
                  <Stack.Screen name="scan" options={{ title: '' }} />
                  <Stack.Screen name="scan/camera" options={legacyRedirectScreenOptions} />
                  <Stack.Screen name="scan/result" options={{ title: '' }} />
                  <Stack.Screen name="scan/binder-page-result" options={{ headerShown: false, title: '' }} />
                  <Stack.Screen name="scan/rectification-diagnostics" options={{ headerShown: false, title: '' }} />
                  <Stack.Screen name="prices/index" options={{ title: '' }} />
                  <Stack.Screen name="community/profile/[userId]" options={{ headerShown: false, title: '' }} />
                  <Stack.Screen name="community/index" options={legacyRedirectScreenOptions} />
                  <Stack.Screen name="price-builder/index" options={{ title: '' }} />
                  <Stack.Screen name="user/[id]" options={legacyRedirectScreenOptions} />
                  <Stack.Screen name="pokemon/[id]" options={{ title: '' }} />
                  <Stack.Screen name="trade/index" options={legacyRedirectScreenOptions} />
                  <Stack.Screen name="trade/[userId]" options={legacyRedirectScreenOptions} />
                  <Stack.Screen name="(tabs)/trade" options={legacyRedirectScreenOptions} />
                  <Stack.Screen name="(auth)/login" options={{ title: '' }} />
                  <Stack.Screen name="(auth)/callback" options={{ title: '' }} />
                  <Stack.Screen name="(auth)/reset-password" options={{ title: '' }} />
                  <Stack.Screen name="callback" options={legacyRedirectScreenOptions} />
                  <Stack.Screen name="reset-password" options={legacyRedirectScreenOptions} />
                  <Stack.Screen name="auth/callback" options={legacyRedirectScreenOptions} />
                  <Stack.Screen name="auth/reset-password" options={legacyRedirectScreenOptions} />
                  <Stack.Screen name="notifications" options={{ title: '' }} />
                  <Stack.Screen name="settings" options={{ title: '' }} />
                  <Stack.Screen name="admin/japanese-catalogue" options={{ headerShown: false, title: '' }} />
                  <Stack.Screen name="admin/scanner-analytics" options={{ headerShown: false, title: '' }} />
                  <Stack.Screen name="admin/scan-lab" options={{ headerShown: false, title: '' }} />
                  <Stack.Screen name="admin/recognition-feedback" options={{ headerShown: false, title: '' }} />
                  <Stack.Screen name="admin/social-content" options={{ headerShown: false, title: '' }} />
                  <Stack.Screen name="camera" options={legacyRedirectScreenOptions} />
                  <Stack.Screen name="scan/card-camera" options={{ title: '' }} />
                  <Stack.Screen name="binder-legacy" options={legacyRedirectScreenOptions} />
                  <Stack.Screen name="collection" options={legacyRedirectScreenOptions} />
                  <Stack.Screen name="marketplace" options={legacyRedirectScreenOptions} />
                  <Stack.Screen name="market-place" options={legacyRedirectScreenOptions} />
                  <Stack.Screen name="list" options={legacyRedirectScreenOptions} />
                  <Stack.Screen name="--/index" options={legacyRedirectScreenOptions} />
                </Stack>
                {showDeferredShellExtras ? <LatestFeaturesModal /> : null}
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
      <StackrPopupProvider>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}>
          {BETA_TRADE_DEMO_MODE ? (
            <AppNavigation />
          ) : (
            <StripeAppProvider>
              <AppNavigation />
            </StripeAppProvider>
          )}
        </KeyboardAvoidingView>
      </StackrPopupProvider>
    </GestureHandlerRootView>
  );
}

// ===============================
// ROOT LAYOUT
// ===============================

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  useEffect(() => {
    if (!fontsLoaded && !fontError) return;
    configureNativeTypographyDefaults();
    const timeout = setTimeout(() => {
      void SplashScreen.hideAsync().catch(() => {});
    }, 80);

    return () => clearTimeout(timeout);
  }, [fontError, fontsLoaded]);

  if (!fontsLoaded && !fontError) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
        <Image
          source={require('../assets/rev2/01-brand/app/splash-ultra-hd.png')}
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
        />
      </View>
    );
  }

  return (
    <ThemeProvider>
      <StackrQueryProvider>
        <AppShell />
      </StackrQueryProvider>
    </ThemeProvider>
  );
}
