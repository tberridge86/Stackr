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
                  headerBackTitleVisible: false,
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
                <Stack.Screen name="card/[id]" />
                <Stack.Screen name="set/[id]" />
                <Stack.Screen name="offer/new" />
                <Stack.Screen name="offers" />
                <Stack.Screen name="binder/new" />
                <Stack.Screen name="binder/[id]" options={{ title: '' }} />
                <Stack.Screen name="binder/add-cards" />
                <Stack.Screen name="scan/index" />
                <Stack.Screen name="scan/result" />
                <Stack.Screen name="market/index" options={{ title: '' }} />
                <Stack.Screen name="price-builder/index" options={{ title: '' }} />
                <Stack.Screen name="user/[id]" options={{ title: '' }} />
              </Stack>
            </TradeProvider>
          </CollectionProvider>
        </ProfileProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}