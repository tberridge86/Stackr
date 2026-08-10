import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackrBackdrop } from '../../components/StackrBackdrop';
import { StackrPageTitle } from '../../components/StackrScreen';
import { StackrButton } from '../../components/StackrControls';
import { StackrEmptyState, StackrErrorState, StackrLoadingState, StackrStateBlock } from '../../components/StackrStates';
import { Text } from '../../components/Text';
import { useAppMode } from '../../components/app-mode-context';
import { useTheme } from '../../components/theme-context';
import {
  InventoryItem,
  InventoryMovement,
  InventorySaleTransaction,
  loadInventoryItems,
  loadInventoryMovements,
  loadInventorySales,
} from '../../lib/inventory';
import { ROUTES } from '../../lib/routes';
import { SELLER_WORKSPACE_ITEMS, getSellerWorkspaceSummary, type SellerCapabilityStatus } from '../../lib/sellerWorkspace';
import { stackrTabContentPadding } from '../../lib/stackrSizing';

const money = (value: number) => `£${value.toFixed(2)}`;

const statusCopy: Record<SellerCapabilityStatus, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  available: { label: 'Available', icon: 'checkmark-circle-outline' },
  partial: { label: 'Partial', icon: 'alert-circle-outline' },
  backend_required: { label: 'Backend required', icon: 'construct-outline' },
};

export default function SellerDashboardScreen() {
  const { theme } = useTheme();
  const { setMode } = useAppMode();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [sales, setSales] = useState<InventorySaleTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboardErrors, setDashboardErrors] = useState<string[]>([]);

  const load = useCallback(async (refresh = false) => {
    try {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setDashboardErrors([]);
      const [inventoryItems, inventoryMovements, inventorySales] = await Promise.allSettled([
        loadInventoryItems(),
        loadInventoryMovements(),
        loadInventorySales(),
      ]);
      const nextErrors: string[] = [];

      if (inventoryItems.status === 'fulfilled') {
        setItems(inventoryItems.value);
      } else {
        nextErrors.push('Inventory could not be loaded.');
      }

      if (inventoryMovements.status === 'fulfilled') {
        setMovements(inventoryMovements.value);
      } else {
        nextErrors.push('Movement history could not be loaded.');
      }

      if (inventorySales.status === 'fulfilled') {
        setSales(inventorySales.value);
      } else {
        nextErrors.push('Sales history could not be loaded.');
      }

      setDashboardErrors(nextErrors);
    } catch {
      setDashboardErrors(['Seller Dashboard could not be loaded.']);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    const stock = items.reduce((sum, item) => sum + Math.max(0, Number(item.quantity ?? 0)), 0);
    const value = items.reduce((sum, item) => {
      const price = item.asking_price ?? item.card.ebay_price ?? item.card.tcg_price ?? item.card.cardmarket_price ?? 0;
      return sum + price * Math.max(0, Number(item.quantity ?? 0));
    }, 0);
    const awaitingAction = movements.filter((movement) => movement.action_type === 'scan_out').length;
    return { stock, value, awaitingAction, sales: sales.length };
  }, [items, movements, sales]);

  const workspaceSummary = getSellerWorkspaceSummary();

  const exitSellerMode = useCallback(async () => {
    await setMode('collector');
    router.replace(ROUTES.home as any);
  }, [setMode]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <StackrBackdrop />
        <StackrLoadingState label="Loading Seller Mode..." style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <StackrBackdrop />
      <FlatList
        data={SELLER_WORKSPACE_ITEMS}
        keyExtractor={(item) => item.key}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.colors.primary} />}
        contentContainerStyle={{ padding: 16, paddingBottom: stackrTabContentPadding.standard, gap: 10 }}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <StackrPageTitle title="Seller Dashboard" accentText="Dashboard" />
                <Text style={{ color: theme.colors.textSoft, fontSize: 13, lineHeight: 19, fontWeight: '700', marginTop: 4 }}>
                  Operational tools for stock intake, stock removal, listings and fulfilment.
                </Text>
              </View>
              <TouchableOpacity
                onPress={exitSellerMode}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel="Return to collector mode"
                style={{ minHeight: 44, borderRadius: 16, backgroundColor: '#F7F3FF', borderWidth: 1, borderColor: '#E8E1FF', paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
              >
                <Ionicons name="home-outline" size={18} color={theme.colors.primary} />
                <Text style={{ color: theme.colors.primary, fontSize: 12, lineHeight: 15, fontWeight: '900' }}>Collector</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {[
                ['Stock', String(summary.stock)],
                ['Inventory value', money(summary.value)],
                ['Movements', String(movements.length)],
                ['Sales records', String(summary.sales)],
              ].map(([label, value]) => (
                <View key={label} style={{ flexGrow: 1, flexBasis: '47%', minHeight: 64, borderRadius: 15, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, padding: 10 }}>
                  <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '800' }}>{label}</Text>
                  <Text style={{ color: theme.colors.text, fontSize: 18, lineHeight: 23, fontWeight: '900', marginTop: 3 }} numberOfLines={1}>{value}</Text>
                </View>
              ))}
            </View>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <StackrButton label="Scan In" icon="archive-outline" variant="primary" onPress={() => router.push(ROUTES.scanSellerIn as any)} style={{ flex: 1 }} />
              <StackrButton label="Scan Out" icon="exit-outline" variant="secondary" onPress={() => router.push(ROUTES.scanSellerOut as any)} style={{ flex: 1 }} />
            </View>

            {dashboardErrors.length ? (
              <StackrErrorState
                title="Seller Dashboard partially loaded"
                body={dashboardErrors.join(' ')}
                actionLabel="Retry"
                onAction={() => load(true)}
                secondaryLabel="Home"
                onSecondaryAction={() => router.replace(ROUTES.home as any)}
              />
            ) : null}

            <StackrStateBlock
              tone={workspaceSummary.backendRequired > 0 ? 'info' : 'success'}
              icon="business-outline"
              title={`${workspaceSummary.available} live tools, ${workspaceSummary.partial} partial, ${workspaceSummary.backendRequired} waiting on backend`}
              body="Stackr only marks seller features as available when the service boundary exists. Fulfilment, payouts and disputes remain explicit backend dependencies."
            />
          </View>
        }
        ListEmptyComponent={
          <StackrEmptyState
            title="No seller tools configured"
            body="Seller Mode has no workspace items available."
          />
        }
        renderItem={({ item }) => {
          const status = statusCopy[item.status];
          const disabled = item.status === 'backend_required' && !item.route;
          const statusColor =
            item.status === 'available'
              ? theme.colors.semantic.success
              : item.status === 'partial'
                ? theme.colors.semantic.warning
                : theme.colors.semantic.information;
          return (
            <TouchableOpacity
              disabled={disabled}
              activeOpacity={0.82}
              onPress={() => item.route ? router.push(item.route as any) : undefined}
              accessibilityRole="button"
              accessibilityLabel={`${item.label}. ${status.label}. ${item.description}`}
              style={{
                borderRadius: 18,
                backgroundColor: theme.colors.card,
                borderWidth: 1,
                borderColor: theme.colors.border,
                padding: 14,
                opacity: disabled ? 0.62 : 1,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: `${statusColor}16`, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={status.icon} size={21} color={statusColor} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: theme.colors.text, fontSize: 16, lineHeight: 21, fontWeight: '900' }}>{item.label}</Text>
                  <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 2 }}>{item.description}</Text>
                </View>
                {item.route ? <Ionicons name="chevron-forward" size={18} color={theme.colors.textSoft} /> : null}
              </View>
              {item.backendDependency ? (
                <Text style={{ color: theme.colors.textSoft, fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 10 }}>
                  {item.backendDependency}
                </Text>
              ) : null}
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}
