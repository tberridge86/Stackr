import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack, router, usePathname, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppModeProvider, useAppMode } from './app-mode-context';
import { useTheme } from './theme-context';
import { KeyboardAvoidingView, Platform, TouchableOpacity, View } from 'react-native';
import { Text } from './Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { memo } from 'react';
import { CORE_COLLECTION_MODE, isCoreStackRoute } from '../lib/appCapabilities';
import { StackrPopupProvider } from './StackrPopupProvider';
import { StackrBackdrop } from './StackrBackdrop';
import { STACKR_ICON_OUTLINE, StackrNavigationIcon, type StackrNavigationIconName } from './StackrNavigationIcon';
import { typeScale } from '../lib/typography';
import { COLLECTOR_TABS, SELLER_TABS } from '../lib/routes';
import { canUseBrowsingBackGesture, resolveActiveStackrTab } from '../lib/stackrNavigationContext';
import { stackrTabBarSizes } from '../lib/stackrSizing';
import { stackrHaptics } from '../lib/haptics';
import { CardInspectionProvider } from './CardInspectionProvider';

import { StartupReadySignal } from './StartupReadySignal';


type StartupProps = { startupVisible: boolean; onReady: () => void };

// ===============================
// PERSISTENT TAB BAR
// ===============================

const {
  secondaryFrame: SECONDARY_TAB_FRAME_SIZE,
  barHeightIos: TAB_BAR_HEIGHT_IOS,
  barHeightAndroid: TAB_BAR_HEIGHT_ANDROID,
  paddingBottomIos: TAB_BAR_PADDING_BOTTOM_IOS,
  paddingBottomAndroid: TAB_BAR_PADDING_BOTTOM_ANDROID,
} = stackrTabBarSizes;

const TAB_ICONS: Record<string, StackrNavigationIconName> = {
  home: 'home', collection: 'collection', scan: 'scan', market: 'market',
  search: 'search', dashboard: 'home', inventory: 'inventory', listings: 'listings',
};

const shouldHideShellControls = (pathname: string) =>
  pathname.startsWith('/(auth)') ||
  pathname.startsWith('/login') ||
  pathname.startsWith('/signup') ||
  pathname.startsWith('/binder/new') ||
  pathname.startsWith('/listing') ||
  pathname.startsWith('/grade') ||
  (pathname.startsWith('/scan') && pathname !== '/scan-hub');

const PersistentTabBar = memo(function PersistentTabBar() {
  const { theme } = useTheme();
  const { mode } = useAppMode();
  const pathname = usePathname();
  const navigationState = useRootNavigationState();
  const insets = useSafeAreaInsets();
  const tabs = CORE_COLLECTION_MODE ? COLLECTOR_TABS.filter(tab => ['home', 'search', 'collection'].includes(tab.key))
    : mode === 'seller' ? SELLER_TABS : COLLECTOR_TABS;

  const tabBarHeight = Platform.OS === 'android'
    ? TAB_BAR_HEIGHT_ANDROID + insets.bottom
    : TAB_BAR_HEIGHT_IOS;
  const tabBarPaddingBottom = Platform.OS === 'android'
    ? insets.bottom + TAB_BAR_PADDING_BOTTOM_ANDROID
    : TAB_BAR_PADDING_BOTTOM_IOS;

  const activeTab = resolveActiveStackrTab(pathname, CORE_COLLECTION_MODE ? 'collector' : mode, navigationState);

  if (shouldHideShellControls(pathname)) return null;

  return (
    <View role="tablist" accessibilityLabel="Main navigation" style={{
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
        const active = tab.key === activeTab;
        const frameSize = SECONDARY_TAB_FRAME_SIZE;
        const icon = TAB_ICONS[tab.key] ?? 'home';
        return (
          <TouchableOpacity
            key={tab.key}
            onPress={() => {
              if (!active) void stackrHaptics.selection();
              router.push(tab.route as any);
            }}
            activeOpacity={0.82}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: active }}
            aria-selected={active}
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
              backgroundColor: active ? theme.colors.surface : 'transparent',
            }}>
              <StackrNavigationIcon
                name={icon}
                color={active ? theme.colors.primary : theme.dark ? theme.colors.text : STACKR_ICON_OUTLINE}
                accentColor={theme.colors.primary}
              />
            </View>
            <Text style={{
              ...typeScale.micro,
              fontWeight: active ? '800' : '600',
              color: active ? theme.colors.primary : theme.colors.textSoft,
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

function AppNavigation({ startupVisible, onReady }: StartupProps) {
  const { theme } = useTheme();
  const legacyRedirectScreenOptions = {
    headerShown: false,
    animation: 'none' as const,
  };


  return (
        <AppModeProvider>
                <StartupReadySignal onReady={onReady} />
                <StatusBar style="dark" />
                <Stack
                  screenOptions={({ route }) => ({
                    headerShown: true,
                    gestureEnabled: canUseBrowsingBackGesture(route.name),
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
                  })}
                >
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("index")}>
                    <Stack.Screen name="index" options={{ headerShown: false }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("(tabs)")}>
                    <Stack.Screen name="(tabs)" options={{ headerShown: false, title: '' }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("search")}>
                    <Stack.Screen name="search" options={legacyRedirectScreenOptions} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("card/[id]")}>
                    <Stack.Screen name="card/[id]" options={{ title: '' }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("set/[id]")}>
                    <Stack.Screen name="set/[id]" options={{ title: '' }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("product/[id]")}>
                    <Stack.Screen name="product/[id]" options={{ title: '' }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("offer/new")}>
                    <Stack.Screen name="offer/new" options={{ title: '' }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("offer/index")}>
                    <Stack.Screen name="offer/index" options={{ title: '' }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("offer/[id]")}>
                    <Stack.Screen name="offer/[id]" options={{ title: '' }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("offers")}>
                    <Stack.Screen name="offers" options={{ headerShown: false, title: '' }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("orders")}>
                    <Stack.Screen name="orders" options={{ headerShown: false, title: '' }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("watchlist")}>
                    <Stack.Screen name="watchlist" options={{ headerShown: false, title: '' }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("value-history")}>
                    <Stack.Screen name="value-history" options={{ title: 'Value History' }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("listing/new")}>
                    <Stack.Screen name="listing/new" options={{ headerShown: false, title: '' }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("listing/[id]")}>
                    <Stack.Screen name="listing/[id]" options={legacyRedirectScreenOptions} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("listing/index")}>
                    <Stack.Screen name="listing/index" options={legacyRedirectScreenOptions} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("listing/camera")}>
                    <Stack.Screen name="listing/camera" options={legacyRedirectScreenOptions} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("seller/index")}>
                    <Stack.Screen name="seller/index" options={{ headerShown: false, title: '' }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("seller/onboarding")}>
                    <Stack.Screen name="seller/onboarding" options={{ headerShown: false, title: '' }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("seller/orders")}>
                    <Stack.Screen name="seller/orders" options={{ headerShown: false, title: '' }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("binder/new")}>
                    <Stack.Screen name="binder/new" options={{ headerShown: false, title: '' }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("binder/[id]")}>
                    <Stack.Screen name="binder/[id]" options={{ headerShown: false, title: '' }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("binder/add-cards")}>
                    <Stack.Screen name="binder/add-cards" options={{ title: '' }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("binder/index")}>
                    <Stack.Screen name="binder/index" options={legacyRedirectScreenOptions} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("scan")}>
                    <Stack.Screen name="scan" options={{ title: '' }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("scan/camera")}>
                    <Stack.Screen name="scan/camera" options={legacyRedirectScreenOptions} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("scan/result")}>
                    <Stack.Screen name="scan/result" options={{ title: '' }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("scan/binder-page-result")}>
                    <Stack.Screen name="scan/binder-page-result" options={{ headerShown: false, title: '' }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("scan/rectification-diagnostics")}>
                    <Stack.Screen name="scan/rectification-diagnostics" options={{ headerShown: false, title: '' }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("prices/index")}>
                    <Stack.Screen name="prices/index" options={{ headerShown: false, title: 'Latest Prices' }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("community/profile/[userId]")}>
                    <Stack.Screen name="community/profile/[userId]" options={{ headerShown: false, title: '' }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("community/index")}>
                    <Stack.Screen name="community/index" options={legacyRedirectScreenOptions} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("price-builder/index")}>
                    <Stack.Screen name="price-builder/index" options={{ headerShown: false, title: 'Price Builder' }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("user/[id]")}>
                    <Stack.Screen name="user/[id]" options={legacyRedirectScreenOptions} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("pokemon/[id]")}>
                    <Stack.Screen name="pokemon/[id]" options={{ title: '' }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("trade/index")}>
                    <Stack.Screen name="trade/index" options={legacyRedirectScreenOptions} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("trade/[userId]")}>
                    <Stack.Screen name="trade/[userId]" options={legacyRedirectScreenOptions} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("(tabs)/trade")}>
                    <Stack.Screen name="(tabs)/trade" options={legacyRedirectScreenOptions} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("(auth)/login")}>
                    <Stack.Screen name="(auth)/login" options={{ title: '' }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("(auth)/callback")}>
                    <Stack.Screen name="(auth)/callback" options={{ title: '' }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("(auth)/reset-password")}>
                    <Stack.Screen name="(auth)/reset-password" options={{ title: '' }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("callback")}>
                    <Stack.Screen name="callback" options={legacyRedirectScreenOptions} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("reset-password")}>
                    <Stack.Screen name="reset-password" options={legacyRedirectScreenOptions} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("auth/callback")}>
                    <Stack.Screen name="auth/callback" options={legacyRedirectScreenOptions} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("auth/reset-password")}>
                    <Stack.Screen name="auth/reset-password" options={legacyRedirectScreenOptions} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("notifications")}>
                    <Stack.Screen name="notifications" options={{ title: '' }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("settings")}>
                    <Stack.Screen name="settings" options={{ headerShown: false, title: 'Settings' }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("help")}>
                    <Stack.Screen name="help" options={{ headerShown: false, title: 'Help' }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("legal")}>
                    <Stack.Screen name="legal" options={{ headerShown: false, title: 'Legal' }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("about")}>
                    <Stack.Screen name="about" options={{ headerShown: false, title: 'About Stackr' }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("friends/index")}>
                    <Stack.Screen name="friends/index" options={{ headerShown: false, title: 'Friends' }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("admin/japanese-catalogue")}>
                    <Stack.Screen name="admin/japanese-catalogue" options={{ headerShown: false, title: '' }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("admin/scanner-analytics")}>
                    <Stack.Screen name="admin/scanner-analytics" options={{ headerShown: false, title: '' }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("admin/quality-observability")}>
                    <Stack.Screen name="admin/quality-observability" options={{ headerShown: false, title: '' }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("admin/scan-lab")}>
                    <Stack.Screen name="admin/scan-lab" options={{ headerShown: false, title: '' }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("admin/recognition-feedback")}>
                    <Stack.Screen name="admin/recognition-feedback" options={{ headerShown: false, title: '' }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("admin/social-content")}>
                    <Stack.Screen name="admin/social-content" options={{ headerShown: false, title: '' }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("camera")}>
                    <Stack.Screen name="camera" options={legacyRedirectScreenOptions} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("scan/card-camera")}>
                    <Stack.Screen name="scan/card-camera" options={{ title: '' }} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("binder-legacy")}>
                    <Stack.Screen name="binder-legacy" options={legacyRedirectScreenOptions} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("collection")}>
                    <Stack.Screen name="collection" options={legacyRedirectScreenOptions} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("marketplace")}>
                    <Stack.Screen name="marketplace" options={legacyRedirectScreenOptions} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("market-place")}>
                    <Stack.Screen name="market-place" options={legacyRedirectScreenOptions} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("list")}>
                    <Stack.Screen name="list" options={legacyRedirectScreenOptions} />
                  </Stack.Protected>
                  <Stack.Protected guard={!CORE_COLLECTION_MODE || isCoreStackRoute("--/index")}>
                    <Stack.Screen name="--/index" options={legacyRedirectScreenOptions} />
                  </Stack.Protected>
                  <Stack.Protected key="achievements" guard={!CORE_COLLECTION_MODE || isCoreStackRoute("achievements")}>
                    <Stack.Screen name="achievements" options={{ headerShown: false }} />
                  </Stack.Protected>
                  <Stack.Protected key="admin/shadow-mode-pilot" guard={!CORE_COLLECTION_MODE || isCoreStackRoute("admin/shadow-mode-pilot")}>
                    <Stack.Screen name="admin/shadow-mode-pilot" options={{ headerShown: false }} />
                  </Stack.Protected>
                  <Stack.Protected key="coin-shop" guard={!CORE_COLLECTION_MODE || isCoreStackRoute("coin-shop")}>
                    <Stack.Screen name="coin-shop" options={{ headerShown: false }} />
                  </Stack.Protected>
                  <Stack.Protected key="collection/add-card" guard={!CORE_COLLECTION_MODE || isCoreStackRoute("collection/add-card")}>
                    <Stack.Screen name="collection/add-card" options={{ headerShown: false }} />
                  </Stack.Protected>
                  <Stack.Protected key="corocoro" guard={!CORE_COLLECTION_MODE || isCoreStackRoute("corocoro")}>
                    <Stack.Screen name="corocoro" options={{ headerShown: false }} />
                  </Stack.Protected>
                  <Stack.Protected key="dev/card-inspection" guard={!CORE_COLLECTION_MODE || isCoreStackRoute("dev/card-inspection")}>
                    <Stack.Screen name="dev/card-inspection" options={{ headerShown: false }} />
                  </Stack.Protected>
                  <Stack.Protected key="duplicates" guard={!CORE_COLLECTION_MODE || isCoreStackRoute("duplicates")}>
                    <Stack.Screen name="duplicates" options={{ headerShown: false }} />
                  </Stack.Protected>
                  <Stack.Protected key="grade/index" guard={!CORE_COLLECTION_MODE || isCoreStackRoute("grade/index")}>
                    <Stack.Screen name="grade/index" options={{ headerShown: false }} />
                  </Stack.Protected>
                  <Stack.Protected key="modal" guard={!CORE_COLLECTION_MODE || isCoreStackRoute("modal")}>
                    <Stack.Screen name="modal" options={{ headerShown: false }} />
                  </Stack.Protected>
                  <Stack.Protected key="offer/review" guard={!CORE_COLLECTION_MODE || isCoreStackRoute("offer/review")}>
                    <Stack.Screen name="offer/review" options={{ headerShown: false }} />
                  </Stack.Protected>
                  <Stack.Protected key="profile/setup" guard={!CORE_COLLECTION_MODE || isCoreStackRoute("profile/setup")}>
                    <Stack.Screen name="profile/setup" options={{ headerShown: false }} />
                  </Stack.Protected>
                  <Stack.Protected key="scan/card-vision-diagnostics" guard={!CORE_COLLECTION_MODE || isCoreStackRoute("scan/card-vision-diagnostics")}>
                    <Stack.Screen name="scan/card-vision-diagnostics" options={{ headerShown: false }} />
                  </Stack.Protected>
                  <Stack.Protected key="scan/diagnostics" guard={!CORE_COLLECTION_MODE || isCoreStackRoute("scan/diagnostics")}>
                    <Stack.Screen name="scan/diagnostics" options={{ headerShown: false }} />
                  </Stack.Protected>
                  <Stack.Protected key="scan/index" guard={!CORE_COLLECTION_MODE || isCoreStackRoute("scan/index")}>
                    <Stack.Screen name="scan/index" options={{ headerShown: false }} />
                  </Stack.Protected>
                  <Stack.Protected key="scan/local-inference-comparison" guard={!CORE_COLLECTION_MODE || isCoreStackRoute("scan/local-inference-comparison")}>
                    <Stack.Screen name="scan/local-inference-comparison" options={{ headerShown: false }} />
                  </Stack.Protected>
                  <Stack.Protected key="scan/owner" guard={!CORE_COLLECTION_MODE || isCoreStackRoute("scan/owner")}>
                    <Stack.Screen name="scan/owner" options={{ headerShown: false }} />
                  </Stack.Protected>
                  <Stack.Protected key="splash-preview" guard={!CORE_COLLECTION_MODE || isCoreStackRoute("splash-preview")}>
                    <Stack.Screen name="splash-preview" options={{ headerShown: false }} />
                  </Stack.Protected>
                </Stack>
                <PersistentTabBar />
        </AppModeProvider>
  );
}

export default function AppShell({ startupVisible, onReady }: StartupProps) {
  const { theme } = useTheme();

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <CardInspectionProvider>
        <StackrPopupProvider>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}>
          <AppNavigation startupVisible={startupVisible} onReady={onReady} />
          </KeyboardAvoidingView>
        </StackrPopupProvider>
      </CardInspectionProvider>
    </GestureHandlerRootView>
  );
}

