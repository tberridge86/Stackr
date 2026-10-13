import { usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Animated, Platform, Text as NativeText, TextInput as NativeTextInput, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold, useFonts,
} from '@expo-google-fonts/inter';
import { AuthProvider } from '../components/auth-context';
import { ProfileProvider } from '../components/profile-context';
import { ThemeProvider } from '../components/theme-context';
import { StackrSafeAreaBoundary } from '../components/StackrSafeAreaBoundary';
import { StackrQueryProvider } from '../components/StackrQueryProvider';
import { StackrLoadingScreen } from '../components/StackrLoadingScreen';
import { StackrStartupVideo, STARTUP_VIDEO_TIMEOUT_MS } from '../components/StackrStartupVideo';
import { stackrFonts } from '../lib/typography';
import { hydrateStackrHapticsPreference } from '../lib/haptics';
import { installRuntimeFetchDiagnostics } from '../lib/runtimeFetchDiagnostics';
import { FONT_LOAD_TIMEOUT_MS } from '../lib/startup';
import { lightTheme } from '../lib/theme';
import { markStartupPhase } from '../lib/performance';

// Register diagnostics and native splash control before any app requests.
installRuntimeFetchDiagnostics();
void SplashScreen.preventAutoHideAsync().catch(() => {});
// Evaluate the navigation/commerce/provider graph only when fonts can display it.
const AppShell = lazy(() => import('../components/StackrAppShell'));

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
    maxFontSizeMultiplier: 0,
    style: [baseTextStyle, textDefaults.style],
  };
  nativeTextInput.defaultProps = {
    ...inputDefaults,
    allowFontScaling: inputDefaults.allowFontScaling ?? true,
    maxFontSizeMultiplier: 0,
    style: [baseTextStyle, inputDefaults.style],
  };
}

// ===============================
// ROOT LAYOUT
// ===============================

export default function RootLayout() {
  const pathname = usePathname();
  const [fontWaitExpired, setFontWaitExpired] = useState(false);
  const [showStartupScreen, setShowStartupScreen] = useState(true);
  const [startupVideoFinished, setStartupVideoFinished] = useState(false);
  const [startupSurfaceReady, setStartupSurfaceReady] = useState(false);
  const markSurfaceReady = useCallback(() => setStartupSurfaceReady(true), []);
  useEffect(() => { markStartupPhase('root-mounted'); }, []);
  const startupOpacity = useRef(new Animated.Value(1)).current;
  const startupDismissing = useRef(false);
  const startupOverlayVisible = showStartupScreen && pathname !== '/splash-preview';
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) return;
    const timeout = setTimeout(() => setFontWaitExpired(true), FONT_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [fontError, fontsLoaded]);

  const fontsReady = Boolean(fontsLoaded || fontError || fontWaitExpired);

  useEffect(() => {
    if (fontsLoaded) configureNativeTypographyDefaults();
  }, [fontsLoaded]);

  useEffect(() => { void hydrateStackrHapticsPreference(); }, []);

  const finishStartup = useCallback(() => {
    if (startupDismissing.current) return;
    startupDismissing.current = true;
    Animated.timing(startupOpacity, {
      toValue: 0,
      duration: 240,
      useNativeDriver: Platform.OS !== 'web',
      isInteraction: false,
    }).start(({ finished }) => {
      if (finished) setShowStartupScreen(false);
      else startupDismissing.current = false;
    });
  }, [startupOpacity]);

  const forceFinishStartup = useCallback(() => {
    startupDismissing.current = true;
    startupOpacity.stopAnimation();
    setShowStartupScreen(false);
  }, [startupOpacity]);

  useEffect(() => {
    const timeout = setTimeout(forceFinishStartup, STARTUP_VIDEO_TIMEOUT_MS + 500);
    return () => {
      clearTimeout(timeout);
      startupOpacity.stopAnimation();
    };
  }, [forceFinishStartup, startupOpacity]);

  useEffect(() => {
    if (fontsReady && (startupSurfaceReady || startupVideoFinished)) finishStartup();
  }, [finishStartup, fontsReady, startupSurfaceReady, startupVideoFinished]);

  useEffect(() => {
    if (pathname === '/splash-preview') setStartupVideoFinished(true);
  }, [pathname]);

  useEffect(() => {
    if (!startupOverlayVisible) markStartupPhase('overlay-removed');
  }, [startupOverlayVisible]);

  return (
    <ThemeProvider>
      <AuthProvider>
        <ProfileProvider>
          <View
            style={{ flex: 1, backgroundColor: lightTheme.colors.bg }}
            onLayout={() => { markStartupPhase('root-layout'); void SplashScreen.hideAsync().catch(() => {}); }}
          >
          <StackrSafeAreaBoundary>
            <View
              style={{ flex: 1 }}
            >
              <View
                style={{ flex: 1 }}
                accessibilityElementsHidden={startupOverlayVisible}
                importantForAccessibility={startupOverlayVisible ? 'no-hide-descendants' : 'auto'}
              >
                <StackrQueryProvider>
                  {fontsReady ? (
                    <Suspense fallback={<StackrLoadingScreen message="Opening Stackr" />}>
                      <AppShell startupVisible={startupOverlayVisible || !startupSurfaceReady} onReady={markSurfaceReady} />
                    </Suspense>
                  ) : <StackrLoadingScreen message="Opening Stackr" />}
                </StackrQueryProvider>
              </View>
              {startupOverlayVisible ? (
                <Animated.View
                  pointerEvents="auto"
                  accessibilityViewIsModal
                  importantForAccessibility="yes"
                  style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    bottom: 0,
                    left: 0,
                    zIndex: 10000,
                    elevation: 10000,
                    opacity: startupOpacity,
                  }}
                >
                  <StatusBar hidden />
                  <StackrStartupVideo onComplete={() => setStartupVideoFinished(true)} />
                </Animated.View>
              ) : null}
            </View>
          </StackrSafeAreaBoundary>
          </View>
        </ProfileProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
