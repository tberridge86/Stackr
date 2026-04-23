import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../components/auth-context';
import { ProfileProvider } from '../components/profile-context';
import { TradeProvider } from '../components/trade-context';
import { CollectionProvider } from '../components/collection-context';
import { OfferProvider } from '../components/offer-context';

export default function RootLayout() {
  return (
    <AuthProvider>
      <ProfileProvider>
        <CollectionProvider>
          <TradeProvider>
            <OfferProvider>
              <>
                <StatusBar style="light" />

                <Stack
                  screenOptions={{
                    headerShown: true,
                    gestureEnabled: true,
                    fullScreenGestureEnabled: true,
                    headerStyle: {
                      backgroundColor: '#0b0b0b',
                    },
                    headerTintColor: '#ffffff',
                    headerTitleStyle: {
                      fontWeight: '700',
                    },
                    contentStyle: {
                      backgroundColor: '#0b0b0b',
                    },
                    headerBackButtonDisplayMode: 'minimal',
                    headerBackTitleVisible: false,
                  }}
                >
                  <Stack.Screen
                    name="(tabs)"
                    options={{
                      headerShown: false,
                    }}
                  />

                  <Stack.Screen
                    name="card/[id]"
                    options={{
                      headerShown: false,
                      gestureEnabled: true,
                      fullScreenGestureEnabled: true,
                    }}
                  />

                  <Stack.Screen
                    name="set/[id]"
                    options={{
                      headerShown: false,
                      gestureEnabled: true,
                      fullScreenGestureEnabled: true,
                    }}
                  />

                  <Stack.Screen
                    name="offer/new"
                    options={{
                      headerShown: false,
                      gestureEnabled: true,
                      fullScreenGestureEnabled: true,
                    }}
                  />

                  <Stack.Screen
                    name="user/[id]"
                    options={{
                      headerShown: false,
                      gestureEnabled: true,
                      fullScreenGestureEnabled: true,
                    }}
                  />

                  <Stack.Screen
                    name="offers"
                    options={{
                      headerShown: false,
                      gestureEnabled: true,
                      fullScreenGestureEnabled: true,
                    }}
                  />

                  <Stack.Screen
                    name="binder/new"
                    options={{
                      headerShown: false,
                      gestureEnabled: true,
                      fullScreenGestureEnabled: true,
                    }}
                  />

                  <Stack.Screen
                    name="binder/[id]"
                    options={{
                      headerShown: false,
                      gestureEnabled: true,
                      fullScreenGestureEnabled: true,
                    }}
                  />

                  <Stack.Screen
                    name="binder/add-cards"
                    options={{
                      headerShown: false,
                      gestureEnabled: true,
                      fullScreenGestureEnabled: true,
                    }}
                  />
                </Stack>
              </>
            </OfferProvider>
          </TradeProvider>
        </CollectionProvider>
      </ProfileProvider>
    </AuthProvider>
  );
}