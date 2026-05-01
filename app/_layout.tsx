import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../components/auth-context';
import { ProfileProvider } from '../components/profile-context';
import { TradeProvider } from '../components/trade-context';
import { CollectionProvider } from '../components/collection-context';
import { theme } from '../lib/theme';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <AuthProvider>
        <ProfileProvider>
          <CollectionProvider>
            <TradeProvider>
              <StatusBar style="dark" />

              <Stack
                screenOptions={{
                  headerShown: false,
                  gestureEnabled: true,
                  fullScreenGestureEnabled: true,
                  headerStyle: {
                    backgroundColor: theme.colors.card,
                  },
                  headerTintColor: theme.colors.text,
                  headerTitleStyle: {
                    fontWeight: '900',
                  },
                  contentStyle: {
                    backgroundColor: theme.colors.bg,
                  },
                  headerBackButtonDisplayMode: 'minimal',
                  headerBackTitleVisible: false,
                }}
              >
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="card/[id]" options={{ headerShown: false }} />
                <Stack.Screen name="set/[id]" options={{ headerShown: false }} />
                <Stack.Screen name="offer/new" options={{ headerShown: false }} />
                <Stack.Screen name="user/[id]" options={{ headerShown: false }} />
                <Stack.Screen name="offers" options={{ headerShown: false }} />
                <Stack.Screen name="binder/new" options={{ headerShown: false }} />
                <Stack.Screen name="binder/[id]" options={{ headerShown: false }} />
                <Stack.Screen name="binder/add-cards" options={{ headerShown: false }} />
                <Stack.Screen name="scan/index" options={{ headerShown: false }} />
                <Stack.Screen name="scan/result" options={{ headerShown: false }} />
              </Stack>
            </TradeProvider>
          </CollectionProvider>
        </ProfileProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}