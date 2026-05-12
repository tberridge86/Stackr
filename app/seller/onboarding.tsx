import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../components/Text';
import { useTheme } from '../../components/theme-context';
import { useAuth } from '../../components/auth-context';
import { PRICE_API_URL } from '../../lib/config';

type AccountStatus = {
  connected: boolean;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  detailsSubmitted?: boolean;
  accountId?: string;
};

export default function SellerOnboardingScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();

  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState(false);

  const loadStatus = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`${PRICE_API_URL}/api/stripe/account-status?userId=${user.id}`);
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Reload status every time the screen is focused (e.g. after returning from Stripe)
  useFocusEffect(loadStatus);

  const handleSetupOrResume = async () => {
    if (!user?.id || !user?.email) return;
    setActioning(true);
    try {
      const endpoint = status?.connected
        ? `${PRICE_API_URL}/api/stripe/create-account-link`
        : `${PRICE_API_URL}/api/stripe/create-connect-account`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, email: user.email }),
      });
      const data = await res.json();

      if (data.url) {
        await Linking.openURL(data.url);
      } else {
        Alert.alert('Error', data.error ?? 'Could not start setup. Try again.');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Something went wrong.');
    } finally {
      setActioning(false);
    }
  };

  // ─── Status derived values ────────────────────────────────────────────────

  const isFullyActive = status?.connected && status.chargesEnabled && status.payoutsEnabled;
  const isIncomplete = status?.connected && (!status.chargesEnabled || !status.payoutsEnabled);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 20 }}>Seller Account</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        {loading ? (
          <View style={{ alignItems: 'center', paddingTop: 60 }}>
            <ActivityIndicator color={theme.colors.primary} size="large" />
          </View>
        ) : (
          <>
            {/* Status card */}
            <View style={{
              backgroundColor: theme.colors.card, borderRadius: 20, padding: 20,
              borderWidth: 1.5,
              borderColor: isFullyActive ? '#22C55E' : isIncomplete ? '#F59E0B' : theme.colors.border,
              marginBottom: 20,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                <View style={{
                  width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isFullyActive ? '#22C55E22' : isIncomplete ? '#F59E0B22' : theme.colors.surface,
                }}>
                  <Ionicons
                    name={isFullyActive ? 'checkmark-circle' : isIncomplete ? 'time' : 'storefront-outline'}
                    size={28}
                    color={isFullyActive ? '#22C55E' : isIncomplete ? '#F59E0B' : theme.colors.textSoft}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 17 }}>
                    {isFullyActive ? 'Active' : isIncomplete ? 'Setup incomplete' : 'Not connected'}
                  </Text>
                  <Text style={{ color: theme.colors.textSoft, fontSize: 13, marginTop: 2 }}>
                    {isFullyActive
                      ? 'You can receive payouts from sales'
                      : isIncomplete
                      ? 'Finish verifying your details to receive payouts'
                      : 'Connect a bank account to receive payments'}
                  </Text>
                </View>
              </View>

              {isFullyActive && (
                <View style={{ gap: 8 }}>
                  <StatusRow icon="card-outline" label="Payments" active={!!status?.chargesEnabled} theme={theme} />
                  <StatusRow icon="cash-outline" label="Payouts" active={!!status?.payoutsEnabled} theme={theme} />
                  <StatusRow icon="document-text-outline" label="Details submitted" active={!!status?.detailsSubmitted} theme={theme} />
                </View>
              )}
            </View>

            {/* How it works */}
            {!isFullyActive && (
              <View style={{
                backgroundColor: theme.colors.card, borderRadius: 16, padding: 16,
                borderWidth: 1, borderColor: theme.colors.border, marginBottom: 20,
              }}>
                <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 15, marginBottom: 14 }}>How payouts work</Text>
                <HowItWorksRow number="1" text="Connect your bank account via Stripe — takes ~2 minutes." theme={theme} />
                <HowItWorksRow number="2" text="When you sell a card, Stripe holds the funds securely." theme={theme} />
                <HowItWorksRow number="3" text="Once the buyer confirms receipt, funds are released to your bank — typically within 2 days." theme={theme} />
                <HowItWorksRow number="4" text={`Stackr takes a small platform fee. You keep the rest.`} theme={theme} />
              </View>
            )}

            {/* Stripe branding note */}
            <View style={{
              flexDirection: 'row', alignItems: 'flex-start', gap: 10,
              backgroundColor: theme.colors.surface, borderRadius: 14, padding: 14,
              borderWidth: 1, borderColor: theme.colors.border, marginBottom: 24,
            }}>
              <Ionicons name="shield-checkmark-outline" size={18} color={theme.colors.primary} style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, color: theme.colors.textSoft, fontSize: 13, lineHeight: 20 }}>
                Payments are processed by <Text style={{ color: theme.colors.text, fontWeight: '800' }}>Stripe</Text> — your bank details are never stored by Stackr. Stripe is FCA-authorised in the UK.
              </Text>
            </View>

            {/* CTA */}
            {!isFullyActive && (
              <TouchableOpacity
                onPress={handleSetupOrResume}
                disabled={actioning}
                style={{
                  backgroundColor: theme.colors.primary, borderRadius: 16,
                  paddingVertical: 16, alignItems: 'center', flexDirection: 'row',
                  justifyContent: 'center', gap: 10,
                }}
              >
                {actioning
                  ? <ActivityIndicator color="#fff" />
                  : <Ionicons name="open-outline" size={18} color="#fff" />
                }
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>
                  {actioning ? 'Opening Stripe...' : isIncomplete ? 'Complete setup' : 'Set up payouts'}
                </Text>
              </TouchableOpacity>
            )}

            {isFullyActive && (
              <TouchableOpacity
                onPress={loadStatus}
                style={{
                  borderRadius: 16, paddingVertical: 14, alignItems: 'center',
                  borderWidth: 1.5, borderColor: theme.colors.border, backgroundColor: theme.colors.card,
                }}
              >
                <Text style={{ color: theme.colors.textSoft, fontWeight: '800', fontSize: 15 }}>Refresh status</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatusRow({ icon, label, active, theme }: { icon: any; label: string; active: boolean; theme: any }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Ionicons name={icon} size={16} color={active ? '#22C55E' : theme.colors.textSoft} />
      <Text style={{ flex: 1, color: theme.colors.textSoft, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: active ? '#22C55E' : '#EF4444', fontWeight: '800', fontSize: 12 }}>
        {active ? 'Enabled' : 'Pending'}
      </Text>
    </View>
  );
}

function HowItWorksRow({ number, text, theme }: { number: string; text: string; theme: any }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
      <View style={{
        width: 24, height: 24, borderRadius: 12, backgroundColor: theme.colors.primary + '20',
        alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0,
      }}>
        <Text style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 12 }}>{number}</Text>
      </View>
      <Text style={{ flex: 1, color: theme.colors.textSoft, fontSize: 13, lineHeight: 20 }}>{text}</Text>
    </View>
  );
}
