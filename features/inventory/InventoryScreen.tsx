import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FeatureTipGate } from '../../components/FeatureTipModal';
import { StackrBackdrop } from '../../components/StackrBackdrop';
import { StackrImage } from '../../components/StackrImage';
import { StackrBottomSheet } from '../../components/StackrModalSystem';
import { Text } from '../../components/Text';
import { useAppMode } from '../../components/app-mode-context';
import { useAuth } from '../../components/auth-context';
import { StackrCardActionIcon, StackrPageTitle } from '../../components/StackrScreen';
import { useTheme } from '../../components/theme-context';
import {
  INVENTORY_CONDITIONS,
  InventoryCardSnapshot,
  InventoryCondition,
  InventoryItem,
  PRODUCT_INVENTORY_CONDITIONS,
  InventoryMovement,
  InventoryMovementDraft,
  InventoryMovementReason,
  InventorySaleTransaction,
  SellerBinderDelta,
  commitSellerInventoryBatch,
  createInventoryItem,
  loadInventoryMovements,
  loadInventoryItems,
} from '../../lib/inventory';
import { BinderRecord, fetchBinders } from '../../lib/binders';
import { getPriceFromPokemonCard } from '../../lib/pricing';
import { scanStore } from '../../lib/scanStore';
import { PRICE_API_URL } from '../../lib/config';
import { searchLocalPokemonCards } from '../../lib/cardSearch';
import { attachLiveTcgdexCardReferences, getPokemonSetLogoUrl } from '../../lib/pokemonTcg';
import { hydrateScanCardRowsWithLiveTcgdexReferences } from '../../lib/scanCardReferenceHydration';
import { ROUTES } from '../../lib/routes';
import { stackrIcons } from '../../lib/stackrIcons';
import { stackrCardImageSizes, stackrTabContentPadding } from '../../lib/stackrSizing';
import { stackrListPerformance } from '../../lib/performance';
import {
  PRODUCT_LOOKUP_OPTIONS,
  listMarketProducts,
  productLookupLabel,
  productToInventorySnapshot,
  refreshMarketProductPrice,
  searchMarketProducts,
} from '../../lib/productSearch';
import type { ProductLookupType } from '../../lib/productSearch';
import { fetchStackrPriceSnapshots } from '../../lib/stackrDomainAdapter';
import { getSellerStockOutRoute } from '../../lib/sellerStockOutRouting';
import {
  canStartSellerInventoryCommit,
  isSellerInventoryCommitAccountChanged,
  isSellerInventoryCommitReconciliationRequired,
  SellerInventoryCommitReconciliationRequiredError,
} from '../../lib/sellerBatchCommit';

const cardShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};

function alertSellerCommitFailure(error: unknown, title: string, fallback: string) {
  if (isSellerInventoryCommitReconciliationRequired(error)) {
    Alert.alert(
      'Save status unconfirmed',
      'The save may have completed, but Stackr could not confirm it. Further seller changes are paused. Pull down to refresh live stock before retrying.',
    );
    return;
  }
  if (isSellerInventoryCommitAccountChanged(error)) {
    Alert.alert(
      'Seller account changed',
      'No new save was sent after the account changed. Reopen Premium Seller Mode for the active account.',
    );
    return;
  }
  Alert.alert(title, fallback);
}

const conditionShort: Record<InventoryCondition, string> = {
  Mint: 'M',
  'Near Mint': 'NM',
  'Lightly Played': 'LP',
  'Moderately Played': 'MP',
  'Heavily Played': 'HP',
  Damaged: 'DMG',
  Sealed: 'SEA',
};

function mergeSellerBinderDeltas(deltas: SellerBinderDelta[]) {
  const merged = new Map<string, SellerBinderDelta>();
  for (const delta of deltas) {
    const key = `${delta.binder_id}:${delta.card_id}`;
    const current = merged.get(key);
    merged.set(key, current
      ? { ...current, quantity_delta: current.quantity_delta + delta.quantity_delta }
      : delta);
  }
  return [...merged.values()].filter((delta) => delta.quantity_delta !== 0);
}

type VaultModeKey = 'inbound' | 'outbound';

const VAULT_PURPLE = '#6938F5';
const VAULT_ORANGE = '#F97316';
const VAULT_PURPLE_SOFT = 'rgba(105,56,245,0.10)';
const VAULT_ORANGE_SOFT = 'rgba(249,115,22,0.12)';

const SELLER_TOKENS = {
  spacing: { xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32 },
  radius: { sm: 12, md: 16, lg: 20, xl: 24, pill: 999 },
  touch: { min: 44, comfortable: 48, primary: 52 },
  layout: { screenPadding: 20, screenPaddingSmall: 16, sectionGap: 28, cardGap: 16 },
  scanner: {
    overlayWidthRatio: 0.8,
    cardAspectRatio: 0.714,
    overlayRadius: 22,
    detectionStableMs: 500,
    duplicateCooldownMs: 1200,
  },
} as const;

const vaultModeOptions: {
  key: VaultModeKey;
  label: string;
  statusLabel: string;
  microcopy: string;
  actions: string[];
}[] = [
  {
    key: 'inbound',
    label: 'Stock In',
    statusLabel: 'Inventory intake',
    microcopy: 'Scans enter a reviewable intake batch before inventory is final.',
    actions: ['Purchased stock', 'Trade received', 'Store intake'],
  },
  {
    key: 'outbound',
    label: 'Stock Out',
    statusLabel: 'Transaction cart',
    microcopy: 'Scans enter an out cart before a sale or trade is completed.',
    actions: ['Customer purchase', 'Trade away', 'Transfer out'],
  },
];

type SellerReasonOption = {
  label: string;
  reason: InventoryMovementReason;
  destination?: 'collection' | 'binder' | 'duplicate' | 'sell_trade';
};

const stockInReasonOptions: SellerReasonOption[] = [
  { label: 'Purchased stock', reason: 'Added to Sell/Trade', destination: 'sell_trade' },
  { label: 'Trade received', reason: 'Added to Sell/Trade', destination: 'sell_trade' },
  { label: 'Store intake', reason: 'Added to Collection', destination: 'collection' },
  { label: 'Consignment', reason: 'Added to Sell/Trade', destination: 'sell_trade' },
  { label: 'Transfer in', reason: 'Added to Collection', destination: 'collection' },
  { label: 'Manual add', reason: 'Added to Collection', destination: 'collection' },
];

const stockOutReasonOptions: SellerReasonOption[] = [
  { label: 'Customer purchase', reason: 'Sold' },
  { label: 'Trade away', reason: 'Traded' },
  { label: 'Transfer out', reason: 'Shipped' },
  { label: 'Return/refund', reason: 'Removed from Collection' },
  { label: 'Lost or damaged', reason: 'Lost/Damaged' },
];

function VaultModeCard({
  option,
  selected,
  onPress,
}: {
  option: (typeof vaultModeOptions)[number];
  selected: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const progress = useRef(new Animated.Value(selected ? 1 : 0)).current;
  const activeColor = option.key === 'inbound' ? VAULT_PURPLE : VAULT_ORANGE;
  const activeSoft = option.key === 'inbound' ? VAULT_PURPLE_SOFT : VAULT_ORANGE_SOFT;
  const activeBorder = option.key === 'inbound' ? 'rgba(105,56,245,0.64)' : 'rgba(249,115,22,0.68)';
  const modeIcon = option.key === 'inbound' ? stackrIcons.inbound : stackrIcons.outbound;

  React.useEffect(() => {
    Animated.timing(progress, {
      toValue: selected ? 1 : 0,
      duration: 210,
      useNativeDriver: false,
    }).start();
  }, [progress, selected]);

  const backgroundColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.colors.card, activeColor],
  });
  const borderColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.colors.border, activeBorder],
  });
  const iconScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.12],
  });
  const cardScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.025],
  });

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.84}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${option.label}. ${option.statusLabel}. ${selected ? 'Selected' : 'Not selected'}.`}
      style={{
        flexGrow: 1,
        flexBasis: '47%',
        minWidth: 154,
      }}
    >
      <Animated.View
        style={{
          minHeight: 136,
          borderRadius: 22,
          borderWidth: selected ? 2 : 1,
          borderColor,
          backgroundColor,
          padding: 13,
          shadowColor: activeColor,
          shadowOpacity: selected ? 0.30 : 0.05,
          shadowRadius: selected ? 20 : 8,
          shadowOffset: { width: 0, height: selected ? 10 : 4 },
          elevation: selected ? 9 : 2,
          transform: [{ scale: cardScale }],
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <Animated.View
            style={{
              width: 56,
              height: 56,
              borderRadius: 19,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: selected ? 'rgba(255,255,255,0.92)' : activeSoft,
              borderWidth: 1,
              borderColor: selected ? 'rgba(255,255,255,0.54)' : activeColor + '24',
              transform: [{ scale: iconScale }],
            }}
          >
            <Image source={modeIcon} resizeMode="contain" style={{ width: 48, height: 48 }} />
          </Animated.View>
          <View
            style={{
              minWidth: 42,
              height: 34,
              borderRadius: 17,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: selected ? 10 : 8,
              backgroundColor: selected ? 'rgba(255,255,255,0.22)' : activeSoft,
              borderWidth: 1,
              borderColor: selected ? 'rgba(255,255,255,0.46)' : 'transparent',
            }}
          >
            <Ionicons
              name={selected ? 'checkmark' : option.key === 'inbound' ? 'arrow-down' : 'arrow-up'}
              size={selected ? 22 : 18}
              color={selected ? '#FFFFFF' : activeColor}
            />
          </View>
        </View>

        <Text
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.82}
          style={{
            color: selected ? '#FFFFFF' : theme.colors.text,
            fontSize: 16,
            lineHeight: 19,
            fontWeight: '900',
            marginTop: 12,
          }}
        >
          {option.label}
        </Text>
        <Text
          numberOfLines={2}
          style={{
            color: selected ? 'rgba(255,255,255,0.84)' : theme.colors.textSoft,
            fontSize: 11,
            lineHeight: 14,
            fontWeight: '700',
            marginTop: 4,
          }}
        >
          {option.microcopy}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
          {option.actions.map((action) => (
            <View
              key={action}
              style={{
                borderRadius: 999,
                paddingHorizontal: 8,
                paddingVertical: 4,
                backgroundColor: selected ? 'rgba(255,255,255,0.18)' : activeSoft,
                borderWidth: 1,
                borderColor: selected ? 'rgba(255,255,255,0.26)' : 'transparent',
              }}
            >
              <Text
                style={{
                  color: selected ? '#FFFFFF' : activeColor,
                  fontSize: 9,
                  lineHeight: 11,
                  fontWeight: '900',
                }}
              >
                {action}
              </Text>
            </View>
          ))}
        </View>
        {selected ? (
          <Text
            numberOfLines={1}
            style={{
              color: '#FFFFFF',
              fontSize: 10.5,
              lineHeight: 13,
              fontWeight: '900',
              marginTop: 9,
            }}
          >
            {option.statusLabel}
          </Text>
        ) : null}
      </Animated.View>
    </TouchableOpacity>
  );
}

function VaultRecentMovementRow({ movement }: { movement: InventoryMovement }) {
  const { theme } = useTheme();
  const inbound = movement.action_type === 'scan_in';
  const color = inbound ? VAULT_PURPLE : VAULT_ORANGE;
  const setLogoUrl = movement.set_id ? getPokemonSetLogoUrl(movement.set_id) : undefined;
  const value = movement.value_at_time != null ? money(movement.value_at_time * movement.quantity) : '--';
  const timestamp = new Date(movement.created_at).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <View
      style={{
        minHeight: 58,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 9,
        borderRadius: 15,
        paddingHorizontal: 9,
        paddingVertical: 7,
        backgroundColor: theme.colors.card,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 999, backgroundColor: color }} />
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: inbound ? VAULT_PURPLE_SOFT : VAULT_ORANGE_SOFT,
          overflow: 'hidden',
        }}
      >
        {movement.image_small ? (
          <Image source={{ uri: movement.image_small }} style={{ width: 34, height: 40 }} resizeMode="contain" />
        ) : (
          <Ionicons name="albums-outline" size={18} color={color} />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: theme.colors.text, fontSize: 12.5, fontWeight: '900' }}>
          {movement.card_name}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
          {setLogoUrl ? (
            <Image source={{ uri: setLogoUrl }} style={{ width: 42, height: 15 }} resizeMode="contain" />
          ) : (
            <Text numberOfLines={1} style={{ color: theme.colors.textSoft, fontSize: 10, fontWeight: '800' }}>
              {movement.reason}
            </Text>
          )}
          <Text numberOfLines={1} style={{ color: theme.colors.textSoft, fontSize: 10, fontWeight: '800' }}>
            {timestamp}
          </Text>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', minWidth: 58 }}>
        <Text style={{ color, fontSize: 12, fontWeight: '900' }}>{value}</Text>
        <Text style={{ color: theme.colors.textSoft, fontSize: 10, fontWeight: '800', marginTop: 1 }}>
          x{movement.quantity}
        </Text>
      </View>
    </View>
  );
}

function VaultTerminalPanel({
  mode,
  onScan,
  todayQuantity,
  todayValue,
  recentMovements,
  scanFeedback,
  feedbackAnim,
}: {
  mode: VaultModeKey;
  onScan: () => void;
  todayQuantity: number;
  todayValue: number;
  recentMovements: InventoryMovement[];
  scanFeedback: { mode: VaultModeKey; text: string } | null;
  feedbackAnim: Animated.Value;
}) {
  const { theme } = useTheme();
  const progress = useRef(new Animated.Value(mode === 'inbound' ? 1 : 0)).current;

  React.useEffect(() => {
    Animated.timing(progress, {
      toValue: mode === 'inbound' ? 1 : 0,
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [mode, progress]);

  const activeColor = mode === 'inbound' ? VAULT_PURPLE : VAULT_ORANGE;
  const activeSoft = mode === 'inbound' ? VAULT_PURPLE_SOFT : VAULT_ORANGE_SOFT;
  const heading = mode === 'inbound' ? 'Stock In' : 'Stock Out';
  const status = mode === 'inbound' ? 'Inventory intake' : 'Transaction cart';
  const scanLabel = mode === 'inbound' ? 'SCAN CARD IN' : 'SCAN CARD OUT';
  const quantityLabel = mode === 'inbound' ? 'Cards Added Today' : 'Cards Removed Today';
  const modeIcon = mode === 'inbound' ? stackrIcons.inbound : stackrIcons.outbound;
  const feedbackTranslateY = feedbackAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-8, 0],
  });
  const bannerBackground = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [VAULT_ORANGE, VAULT_PURPLE],
  });
  const bannerBorder = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(249,115,22,0.68)', 'rgba(105,56,245,0.64)'],
  });

  return (
    <View
      style={{
        position: 'relative',
        borderRadius: 22,
        borderWidth: 1,
        borderColor: activeModeBorderFor(mode),
        backgroundColor: activeSoft,
        padding: 10,
        marginBottom: 10,
      }}
    >
      {scanFeedback ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            right: 14,
            top: 14,
            zIndex: 4,
            opacity: feedbackAnim,
            transform: [{ translateY: feedbackTranslateY }],
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            borderRadius: 999,
            paddingHorizontal: 11,
            paddingVertical: 8,
            backgroundColor: scanFeedback.mode === 'inbound' ? VAULT_PURPLE : VAULT_ORANGE,
            shadowColor: scanFeedback.mode === 'inbound' ? VAULT_PURPLE : VAULT_ORANGE,
            shadowOpacity: 0.28,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 6 },
            elevation: 8,
          }}
        >
          <Ionicons name="checkmark" size={15} color="#FFFFFF" />
          <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '900' }}>{scanFeedback.text}</Text>
        </Animated.View>
      ) : null}

      <Animated.View
        style={{
          minHeight: 76,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: bannerBorder,
          backgroundColor: bannerBackground,
          paddingHorizontal: 14,
          paddingVertical: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          shadowColor: activeColor,
          shadowOpacity: 0.22,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
          elevation: 7,
        }}
      >
        <View
          style={{
            width: 54,
            height: 54,
            borderRadius: 19,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(255,255,255,0.92)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.42)',
          }}
        >
          <Image source={modeIcon} resizeMode="contain" style={{ width: 46, height: 46 }} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '900', letterSpacing: 0.4 }}>
            {heading}
          </Text>
          <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.84)', fontSize: 12, fontWeight: '800', marginTop: 2 }}>
            {status}
          </Text>
        </View>
      </Animated.View>

      <TouchableOpacity
        onPress={onScan}
        activeOpacity={0.86}
        accessibilityRole="button"
        accessibilityLabel={`${scanLabel}. ${status}.`}
        style={{
          minHeight: 66,
          borderRadius: 18,
          marginTop: 9,
          paddingHorizontal: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 11,
          backgroundColor: theme.colors.card,
          borderWidth: 1,
          borderColor: activeModeBorderFor(mode),
        }}
      >
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 15,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: activeColor,
          }}
        >
          <Ionicons name="scan-outline" size={23} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '900' }}>{scanLabel}</Text>
          <Text numberOfLines={1} style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '800', marginTop: 2 }}>
            Scanner stays ready. Mode changes instantly.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={activeColor} />
      </TouchableOpacity>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 9 }}>
        <View style={{ flex: 1, borderRadius: 16, padding: 11, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border }}>
          <Text style={{ color: theme.colors.textSoft, fontSize: 10, fontWeight: '900' }}>{quantityLabel}</Text>
          <Text style={{ color: activeColor, fontSize: 20, fontWeight: '900', marginTop: 3 }}>
            {todayQuantity} Card{todayQuantity === 1 ? '' : 's'}
          </Text>
        </View>
        <View style={{ flex: 1, borderRadius: 16, padding: 11, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border }}>
          <Text style={{ color: theme.colors.textSoft, fontSize: 10, fontWeight: '900' }}>Estimated Value</Text>
          <Text style={{ color: activeColor, fontSize: 20, fontWeight: '900', marginTop: 3 }}>
            {money(todayValue)}
          </Text>
        </View>
      </View>

      <View style={{ marginTop: 10 }}>
        <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '900', marginBottom: 7 }}>Last 5 scans</Text>
        <View style={{ gap: 6 }}>
          {recentMovements.length ? (
            recentMovements.map((movement) => (
              <VaultRecentMovementRow key={movement.id} movement={movement} />
            ))
          ) : (
            <View style={{ borderRadius: 15, padding: 12, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border }}>
              <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '800' }}>
                Scan activity will appear here immediately.
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const activeModeBorderFor = (mode: VaultModeKey) =>
  mode === 'inbound' ? 'rgba(105,56,245,0.34)' : 'rgba(249,115,22,0.38)';

type InventoryLookupType = 'raw_card' | ProductLookupType;

const INVENTORY_LOOKUP_OPTIONS: {
  key: InventoryLookupType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: 'raw_card', label: 'Raw Card', icon: 'albums-outline' },
  ...PRODUCT_LOOKUP_OPTIONS
    .filter((option) => option.key !== 'sealed_product')
    .map((option) => ({
      key: option.key,
      label: option.label,
      icon: option.icon as keyof typeof Ionicons.glyphMap,
    })),
];

type InventoryViewFilter = 'all' | 'lowStock' | 'highValue' | 'noPrice' | 'stockOut';
type InventoryFlow = 'scan_in' | 'scan_out';
type ScanInDestination = 'collection' | 'binder' | 'duplicate' | 'sell_trade';

const scanInDestinations: {
  key: ScanInDestination;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  reason: InventoryMovementReason;
}[] = [
  { key: 'collection', label: 'Add to Collection', icon: 'albums-outline', reason: 'Added to Collection' },
  { key: 'binder', label: 'Binder', icon: 'book-outline', reason: 'Added to Binder' },
  { key: 'duplicate', label: 'Add as Duplicate', icon: 'copy-outline', reason: 'Added as Duplicate' },
  { key: 'sell_trade', label: 'Sell/Trade inventory', icon: 'pricetag-outline', reason: 'Added to Sell/Trade' },
];

const scanOutReasons: InventoryMovementReason[] = [
  'Sold',
  'Traded',
  'Shipped',
  'Lost/Damaged',
  'Removed from Collection',
  'Other',
];

const inventoryViewFilters: {
  key: InventoryViewFilter;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: 'all', label: 'All owned', icon: 'file-tray-full-outline' },
  { key: 'lowStock', label: 'Single copies', icon: 'alert-circle-outline' },
  { key: 'highValue', label: 'High value', icon: 'trending-up-outline' },
  { key: 'noPrice', label: 'No price', icon: 'pricetag-outline' },
  { key: 'stockOut', label: 'Scan out', icon: 'remove-circle-outline' },
];

const money = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? `£${value.toFixed(2)}` : '--';

const getPreferredPrice = (card: InventoryCardSnapshot) =>
  card.is_product
    ? card.tcg_price ?? card.ebay_price ?? card.cardmarket_price ?? null
    : card.ebay_price ?? card.tcg_price ?? card.cardmarket_price ?? null;

const getDraftConditions = (card: InventoryCardSnapshot) =>
  card.is_product ? PRODUCT_INVENTORY_CONDITIONS : INVENTORY_CONDITIONS;

const INVENTORY_FILTER_CONDITIONS = [...INVENTORY_CONDITIONS, ...PRODUCT_INVENTORY_CONDITIONS];

type InventoryDraft = {
  card: InventoryCardSnapshot;
  quantities: Record<InventoryCondition, number>;
  askingPrice: string;
  expanded: boolean;
};

type SaleCartLine = {
  item: InventoryItem;
  quantity: number;
};

type PendingStockOut = {
  item: InventoryItem;
  quantity: number;
  reason: InventoryMovementReason;
};

const createQuantities = (defaultCondition: InventoryCondition = 'Near Mint') => {
  const quantities = Object.fromEntries(
    INVENTORY_CONDITIONS.map((condition) => [condition, 0])
  ) as Record<InventoryCondition, number>;
  quantities[defaultCondition] = 1;
  return quantities;
};

const getProductConfidence = (card: InventoryCardSnapshot) => {
  const count = card.product_price_count ?? 0;
  if (count >= 8) return { label: 'High confidence', color: '#16A34A' };
  if (count >= 3) return { label: 'Medium confidence', color: '#D97706' };
  if (card.is_product) return { label: 'Low confidence', color: '#DC2626' };
  return null;
};

const getProductResultSubtitle = (card: InventoryCardSnapshot) => {
  if (!card.is_product) {
    return `${card.set_name} · #${card.number ?? '--'} · ${money(getPreferredPrice(card))}`;
  }

  const typeLabel = card.product_type
    ? productLookupLabel(card.product_type as ProductLookupType)
    : 'Product';
  const setLabel = card.set_name && card.set_name !== typeLabel ? card.set_name : null;
  return `${typeLabel}${setLabel ? ` · ${setLabel}` : ''} · recommended ${money(getPreferredPrice(card))}`;
};

const inventoryParsedFromResolvedCard = (resolvedCard?: any) => {
  if (!resolvedCard) return null;
  const setName = resolvedCard.set_name ?? resolvedCard.set?.name ?? resolvedCard.setName;
  return {
    id: resolvedCard.id,
    name: resolvedCard.name,
    number: resolvedCard.number,
    set: setName,
    setName,
    set_id: resolvedCard.set_id ?? resolvedCard.set?.id,
    card: {
      id: resolvedCard.id,
      name: resolvedCard.name,
      number: resolvedCard.number,
      set: setName,
      setName,
      set_id: resolvedCard.set_id ?? resolvedCard.set?.id,
    },
  };
};

function SellerSessionCard({
  totalStock,
  inventoryValue,
  recentScans,
  pendingCount,
  onNewSession,
}: {
  totalStock: number;
  inventoryValue: number;
  recentScans: number;
  pendingCount: number;
  onNewSession: () => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ minHeight: 64, borderRadius: 16, padding: 12, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, ...cardShadow }}>
      {/* TODO seller sessions: persist session name/type/start time when seller_sessions exists. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: theme.colors.text, fontSize: 16, lineHeight: 21, fontWeight: '900' }}>Store Inventory</Text>
          <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 16, fontWeight: '700', marginTop: 2 }} numberOfLines={1}>
            Manual session - {totalStock} in stock - {money(inventoryValue)} inventory value
          </Text>
        </View>
        <TouchableOpacity
          onPress={onNewSession}
          activeOpacity={0.78}
          style={{ minHeight: 38, borderRadius: 13, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }}
        >
          <Text style={{ color: theme.colors.primary, fontSize: 12, lineHeight: 16, fontWeight: '900' }}>New session</Text>
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 9 }}>
        <View style={{ flex: 1, borderRadius: 13, padding: 9, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }}>
          <Text style={{ color: theme.colors.textSoft, fontSize: 11, lineHeight: 15, fontWeight: '700' }}>Recent scans</Text>
          <Text style={{ color: theme.colors.text, fontSize: 16, lineHeight: 21, fontWeight: '900', marginTop: 1 }}>{recentScans}</Text>
        </View>
        <View style={{ flex: 1, borderRadius: 13, padding: 9, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }}>
          <Text style={{ color: theme.colors.textSoft, fontSize: 11, lineHeight: 15, fontWeight: '700' }}>Needs review</Text>
          <Text style={{ color: pendingCount > 0 ? VAULT_ORANGE : VAULT_PURPLE, fontSize: 16, lineHeight: 21, fontWeight: '900', marginTop: 1 }}>{pendingCount}</Text>
        </View>
      </View>
    </View>
  );
}

function StockModeSegmentedControl({
  mode,
  onChange,
}: {
  mode: VaultModeKey;
  onChange: (mode: VaultModeKey) => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ minHeight: 48, borderRadius: 16, padding: 4, flexDirection: 'row', backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }}>
      {vaultModeOptions.map((option) => {
        const selected = mode === option.key;
        const activeColor = option.key === 'inbound' ? VAULT_PURPLE : '#C2410C';
        return (
          <TouchableOpacity
            key={option.key}
            onPress={() => onChange(option.key)}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={{
              flex: 1,
              minHeight: 44,
              borderRadius: 13,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              backgroundColor: selected ? activeColor : 'transparent',
            }}
          >
            <Ionicons
              name={option.key === 'inbound' ? 'log-in-outline' : 'log-out-outline'}
              size={18}
              color={selected ? '#FFFFFF' : theme.colors.textSoft}
            />
            <Text style={{ color: selected ? '#FFFFFF' : theme.colors.text, fontSize: 14, lineHeight: 18, fontWeight: '900' }}>
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function StockReasonChips({
  options,
  selectedLabel,
  onSelect,
}: {
  options: SellerReasonOption[];
  selectedLabel: string;
  onSelect: (option: SellerReasonOption) => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((option) => {
        const selected = selectedLabel === option.label;
        return (
          <TouchableOpacity
            key={option.label}
            onPress={() => onSelect(option)}
            activeOpacity={0.78}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={{
              minHeight: 36,
              borderRadius: 999,
              paddingHorizontal: 12,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: selected ? VAULT_PURPLE_SOFT : theme.colors.card,
              borderWidth: 1,
              borderColor: selected ? 'rgba(105,56,245,0.44)' : theme.colors.border,
            }}
          >
            <Text style={{ color: selected ? VAULT_PURPLE : theme.colors.textSoft, fontSize: 11.5, lineHeight: 15, fontWeight: '900' }}>
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function InventoryScanEntryCard({
  mode,
  reasonLabel,
  onPress,
}: {
  mode: VaultModeKey;
  reasonLabel: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const inbound = mode === 'inbound';
  const activeColor = inbound ? VAULT_PURPLE : '#C2410C';
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.86}
      accessibilityRole="button"
      accessibilityLabel="Open inventory scanner"
      style={{ minHeight: 88, borderRadius: 18, padding: 14, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: inbound ? 'rgba(105,56,245,0.26)' : 'rgba(249,115,22,0.28)', ...cardShadow }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: inbound ? VAULT_PURPLE : VAULT_ORANGE_SOFT, borderWidth: 1, borderColor: inbound ? VAULT_PURPLE : 'rgba(249,115,22,0.30)' }}>
          <StackrCardActionIcon source={stackrIcons.scanCard} frameSize={36} artworkSize={29} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: theme.colors.text, fontSize: 16.5, lineHeight: 21, fontWeight: '900' }}>Scan inventory</Text>
          <Text style={{ color: theme.colors.textSoft, fontSize: 12.5, lineHeight: 17, fontWeight: '700', marginTop: 3 }} numberOfLines={2}>
            {inbound ? 'Scan cards into the intake batch.' : 'Scan cards into the out cart before completing a sale or trade.'}
          </Text>
          <Text style={{ color: activeColor, fontSize: 11.5, lineHeight: 15, fontWeight: '900', marginTop: 5 }} numberOfLines={1}>
            {reasonLabel}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={activeColor} />
      </View>
    </TouchableOpacity>
  );
}

function SellerModeHelperNote({ mode }: { mode: VaultModeKey }) {
  const { theme } = useTheme();
  const inbound = mode === 'inbound';
  return (
    <View style={{ minHeight: 44, borderRadius: 15, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: inbound ? VAULT_PURPLE_SOFT : '#FFF7ED', borderWidth: 1, borderColor: inbound ? 'rgba(105,56,245,0.20)' : '#FED7AA' }}>
      <Ionicons name={inbound ? 'checkmark-circle-outline' : 'shield-checkmark-outline'} size={18} color={inbound ? VAULT_PURPLE : '#C2410C'} />
      <Text style={{ flex: 1, color: theme.colors.text, fontSize: 12.5, lineHeight: 17, fontWeight: '700' }}>
        {inbound ? 'High-confidence scans go into a reviewable intake batch.' : 'Cards are only removed after you complete the transaction.'}
      </Text>
    </View>
  );
}

function SellerSessionStats({
  mode,
  batchCount,
  outCartCount,
  estimatedValue,
  saleTotal,
  reviewCount,
}: {
  mode: VaultModeKey;
  batchCount: number;
  outCartCount: number;
  estimatedValue: number;
  saleTotal: number;
  reviewCount: number;
}) {
  const { theme } = useTheme();
  const inbound = mode === 'inbound';
  const stats = inbound
    ? [
        { label: 'Batch count', value: String(batchCount) },
        { label: 'Estimated value', value: money(estimatedValue) },
        { label: 'Needs review', value: String(reviewCount) },
      ]
    : [
        { label: 'Out cart', value: String(outCartCount) },
        { label: 'Sale total', value: money(saleTotal) },
        { label: 'Needs review', value: String(reviewCount) },
      ];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {stats.map((stat) => (
        <View key={stat.label} style={{ flexGrow: 1, flexBasis: '30%', minWidth: 92, borderRadius: 15, padding: 10, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border }}>
          <Text style={{ color: theme.colors.textSoft, fontSize: 11, lineHeight: 15, fontWeight: '700' }}>{stat.label}</Text>
          <Text style={{ color: inbound ? VAULT_PURPLE : '#C2410C', fontSize: 16, lineHeight: 21, fontWeight: '900', marginTop: 2 }} numberOfLines={1}>
            {stat.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function SellerQueuePreview({
  mode,
  drafts,
  saleCart,
  onReview,
  onComplete,
}: {
  mode: VaultModeKey;
  drafts: InventoryDraft[];
  saleCart: SaleCartLine[];
  onReview: () => void;
  onComplete: () => void;
}) {
  const { theme } = useTheme();
  const inbound = mode === 'inbound';
  const hasRows = inbound ? drafts.length > 0 : saleCart.length > 0;
  const title = inbound ? 'Intake batch' : 'Out cart';
  const empty = inbound ? 'Scan cards to build an intake batch.' : 'Scan cards to build an out cart.';
  const rows = inbound
    ? drafts.slice(0, 4).map((draft) => ({
        key: draft.card.id,
        name: draft.card.name,
        setName: draft.card.set_name ?? draft.card.set_id ?? 'Set unknown',
        quantity: getDraftConditions(draft.card).reduce((sum, condition) => sum + (draft.quantities[condition] ?? 0), 0),
        value: money(getPreferredPrice(draft.card)),
        image: draft.card.image_small,
        status: 'Reviewable',
      }))
    : saleCart.slice(0, 4).map((line) => ({
        key: line.item.id,
        name: line.item.card.name,
        setName: line.item.card.set_name ?? line.item.card.set_id ?? 'Set unknown',
        quantity: line.quantity,
        value: money(getPreferredPrice(line.item.card)),
        image: line.item.card.image_small,
        status: `${line.item.quantity} available`,
      }));
  return (
    <View style={{ borderRadius: 16, padding: 12, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 9 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: theme.colors.text, fontSize: 16, lineHeight: 21, fontWeight: '900' }}>{title}</Text>
          <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 16, fontWeight: '700', marginTop: 1 }}>
            {hasRows ? `${rows.length} line${rows.length === 1 ? '' : 's'} ready` : empty}
          </Text>
        </View>
        <TouchableOpacity
          onPress={hasRows ? onComplete : onReview}
          activeOpacity={0.78}
          style={{ minHeight: 38, borderRadius: 13, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: hasRows ? VAULT_PURPLE : theme.colors.surface, borderWidth: 1, borderColor: hasRows ? VAULT_PURPLE : theme.colors.border }}
        >
          <Text style={{ color: hasRows ? '#FFFFFF' : theme.colors.primary, fontSize: 11.5, lineHeight: 15, fontWeight: '900' }}>
            {hasRows ? (inbound ? 'Complete intake' : 'Complete transaction') : (inbound ? 'Review batch' : 'Review cart')}
          </Text>
        </TouchableOpacity>
      </View>
      {hasRows ? (
        <View style={{ gap: 8 }}>
          {rows.map((row) => (
            <View key={row.key} style={{ minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, padding: 7, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }}>
              {row.image ? (
                <Image source={{ uri: row.image }} resizeMode="contain" style={{ width: 36, height: 50, borderRadius: 6 }} />
              ) : (
                <View style={{ width: 36, height: 50, borderRadius: 8, backgroundColor: theme.colors.card, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="albums-outline" size={20} color={VAULT_PURPLE} />
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: theme.colors.text, fontSize: 14, lineHeight: 18, fontWeight: '900' }} numberOfLines={1}>{row.name}</Text>
                <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 16, fontWeight: '700', marginTop: 2 }} numberOfLines={1}>{row.setName}</Text>
                <Text style={{ color: inbound ? VAULT_PURPLE : '#C2410C', fontSize: 12, lineHeight: 16, fontWeight: '800', marginTop: 2 }} numberOfLines={1}>{row.status}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', minWidth: 58 }}>
                <Text style={{ color: theme.colors.text, fontSize: 14, lineHeight: 18, fontWeight: '900' }}>x{row.quantity}</Text>
                <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 16, fontWeight: '800', marginTop: 2 }}>{row.value}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View style={{ minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, padding: 10 }}>
          <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 17, fontWeight: '700', textAlign: 'center' }}>{empty}</Text>
        </View>
      )}
    </View>
  );
}

const toCardSnapshot = (row: any, snapshot?: any): InventoryCardSnapshot => {
  const raw = row.raw_data ?? {};
  return {
    id: row.id,
    name: row.name,
    number: row.number ?? null,
    set_id: row.set_id ?? null,
    set_name: raw?.set?.name ?? row.set_id ?? null,
    rarity: row.rarity ?? raw?.rarity ?? null,
    image_small: row.image_small ?? raw?.images?.small ?? null,
    image_large: row.image_large ?? raw?.images?.large ?? null,
    tcg_price: snapshot?.tcg_mid ?? getPriceFromPokemonCard(raw),
    ebay_price: snapshot?.ebay_average ?? null,
    cardmarket_price: snapshot?.cardmarket_trend ?? null,
  };
};

export default function InventoryScreen() {
  const { user } = useAuth();
  const currentUserIdRef = useRef<string | null>(user?.id ?? null);
  currentUserIdRef.current = user?.id ?? null;
  const { theme } = useTheme();
  const { setMode } = useAppMode();
  const { width } = useWindowDimensions();
  const isWideLayout = width >= 620;
  const columns = width >= 900 ? 3 : isWideLayout ? 2 : 1;
  const itemGap = 12;
  const itemWidth = (width - 32 - (columns - 1) * itemGap) / columns;

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [lookupType, setLookupType] = useState<InventoryLookupType>('raw_card');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<InventoryCardSnapshot[]>([]);
  const [searching, setSearching] = useState(false);
  const [drafts, setDrafts] = useState<InventoryDraft[]>([]);
  const [filterCondition, setFilterCondition] = useState<InventoryCondition | 'All'>('All');
  const [inventoryViewFilter, setInventoryViewFilter] = useState<InventoryViewFilter>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [setFilter, setSetFilter] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [saleOpen, setSaleOpen] = useState(false);
  const [sessionInfoOpen, setSessionInfoOpen] = useState(false);
  const [saleCart, setSaleCart] = useState<SaleCartLine[]>([]);
  const [salePrice, setSalePrice] = useState('');
  const [, setActiveFlow] = useState<InventoryFlow | null>(null);
  const [vaultMode, setVaultMode] = useState<VaultModeKey>('inbound');
  const [stockInReasonLabel, setStockInReasonLabel] = useState(stockInReasonOptions[0].label);
  const [stockOutReason, setStockOutReason] = useState<InventoryMovementReason>(stockOutReasonOptions[0].reason);
  const [scanInDestination, setScanInDestination] = useState<ScanInDestination>(stockInReasonOptions[0].destination ?? 'collection');
  const [selectedBinderId, setSelectedBinderId] = useState<string | null>(null);
  const [binders, setBinders] = useState<BinderRecord[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [stockScanMode, setStockScanMode] = useState<'add' | 'remove'>('add');
  const [stockOutCandidates, setStockOutCandidates] = useState<InventoryItem[]>([]);
  const [stockOutContext, setStockOutContext] = useState<'inventory' | 'sale'>('inventory');
  const [stockOutPickerOpen, setStockOutPickerOpen] = useState(false);
  const [pendingStockOut, setPendingStockOut] = useState<PendingStockOut | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<InventoryCardSnapshot | null>(null);
  const [productQuantity, setProductQuantity] = useState('1');
  const [productAskingPrice, setProductAskingPrice] = useState('');
  const [scanFeedback, setScanFeedback] = useState<{ mode: VaultModeKey; text: string } | null>(null);
  const [inventoryDataStale, setInventoryDataStale] = useState(false);
  const [inventoryLoadError, setInventoryLoadError] = useState<string | null>('Verifying live seller inventory before changes are allowed.');
  const reconciliationRequiredRef = useRef(false);
  const unconfirmedRequestIdRef = useRef<string | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inventoryResultLongPressRef = useRef<string | null>(null);
  const feedbackAnim = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    const reconciliationWasRequired = reconciliationRequiredRef.current;
    let sellerDataWasStale = false;
    setInventoryDataStale(false);
    setInventoryLoadError('Verifying live seller inventory before changes are allowed.');
    const [inventoryResult, binderResult, movementResult] = await Promise.allSettled([
      loadInventoryItems({ onStale: () => { sellerDataWasStale = true; } }),
      fetchBinders(),
      loadInventoryMovements({ onStale: () => { sellerDataWasStale = true; } }),
    ]);

    let nextLoadError: string | null = null;

    if (inventoryResult.status === 'fulfilled') {
      setItems(inventoryResult.value);
    } else {
      console.log('Seller inventory load failed', inventoryResult.reason);
      nextLoadError = 'Seller inventory could not be verified. Refresh before changing stock.';
    }
    if (binderResult.status === 'fulfilled') {
      setBinders(binderResult.value);
    } else {
      console.log('Inventory binders load failed', binderResult.reason);
      nextLoadError ??= 'Binder links could not be verified. Refresh before changing stock.';
    }
    if (movementResult.status === 'fulfilled') {
      setMovements(movementResult.value);
    } else {
      console.log('Inventory movements load failed', movementResult.reason);
      nextLoadError ??= 'Seller history could not be verified. Refresh before changing stock.';
    }

    setInventoryDataStale(sellerDataWasStale);
    if (sellerDataWasStale) {
      nextLoadError ??= 'Live seller data could not be verified. Cached stock is read-only until a refresh succeeds.';
    }
    const liveSellerStateVerified = inventoryResult.status === 'fulfilled'
      && movementResult.status === 'fulfilled'
      && !sellerDataWasStale;
    if (reconciliationWasRequired && liveSellerStateVerified) {
      reconciliationRequiredRef.current = false;
      unconfirmedRequestIdRef.current = null;
      setDrafts([]);
      setSaleCart([]);
      setPendingStockOut(null);
      setSelectedProduct(null);
      setWorkspaceOpen(false);
      setSaleOpen(false);
      setStockOutPickerOpen(false);
    } else if (reconciliationWasRequired) {
      nextLoadError = 'A previous save remains unconfirmed. Connect and refresh live stock before making another change.';
    }
    setInventoryLoadError(nextLoadError);
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const selectedBinder = useMemo(
    () => binders.find((binder) => binder.id === selectedBinderId) ?? null,
    [binders, selectedBinderId]
  );

  const refreshMovements = useCallback(async () => {
    try {
      const movementRows = await loadInventoryMovements({ onStale: () => setInventoryDataStale(true) });
      setMovements(movementRows);
    } catch (error) {
      console.log('Inventory movement refresh failed', error);
      setInventoryLoadError('Seller history could not be verified. Refresh the inventory before changing stock.');
    }
  }, []);

  const exitSellerMode = useCallback(async () => {
    await setMode('collector');
    router.replace(ROUTES.home as any);
  }, [setMode]);

  const showScanFeedback = useCallback((mode: VaultModeKey) => {
    setScanFeedback({
      mode,
      text: mode === 'inbound' ? 'Added to intake batch' : 'Added to out cart',
    });
    feedbackAnim.setValue(0);
    Animated.sequence([
      Animated.timing(feedbackAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.delay(760),
      Animated.timing(feedbackAnim, {
        toValue: 0,
        duration: 170,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setScanFeedback(null);
    });
  }, [feedbackAnim]);

  const commitInventoryChange = useCallback(async (input: {
    nextItems: InventoryItem[];
    movements?: InventoryMovementDraft[];
    sale?: InventorySaleTransaction | null;
    binderDeltas?: SellerBinderDelta[];
  }) => {
    if (!canStartSellerInventoryCommit({
      reconciliationRequired: reconciliationRequiredRef.current,
      loadError: inventoryLoadError,
    })) {
      throw new Error('Refresh Premium Seller Mode before changing stock.');
    }
    if (
      input.sale == null
      && input.movements?.some((movement) => getSellerStockOutRoute(movement.reason) === 'sale-cart')
    ) {
      throw new Error('Sold stock-out must be completed through the sale cart.');
    }

    let committed: Awaited<ReturnType<typeof commitSellerInventoryBatch>>;
    try {
      committed = await commitSellerInventoryBatch({
        expectedItems: items,
        items: input.nextItems,
        movements: input.movements,
        sale: input.sale,
        binderDeltas: mergeSellerBinderDeltas(input.binderDeltas ?? []),
      });
    } catch (error) {
      if (isSellerInventoryCommitReconciliationRequired(error)) {
        reconciliationRequiredRef.current = true;
        unconfirmedRequestIdRef.current = error instanceof SellerInventoryCommitReconciliationRequiredError
          ? error.requestId
          : null;
        setInventoryLoadError('A save may have completed but is not confirmed. Refresh live stock before making another change.');
      }
      throw error;
    }
    if (currentUserIdRef.current !== committed.userId) {
      reconciliationRequiredRef.current = true;
      unconfirmedRequestIdRef.current = committed.result.requestId;
      setInventoryLoadError('The active seller account changed while saving. Refresh live stock before making another change.');
      throw new SellerInventoryCommitReconciliationRequiredError(
        committed.result.requestId,
        'committed_identity_unverified',
      );
    }
    setItems(committed.items);
    if (committed.movements.length) {
      const committedIds = new Set(committed.movements.map((movement) => movement.id));
      setMovements((previous) => [
        ...committed.movements,
        ...previous.filter((movement) => !committedIds.has(movement.id)),
      ].slice(0, 100));
      showScanFeedback(
        committed.movements[0].action_type === 'scan_in' ? 'inbound' : 'outbound'
      );
    }
    return committed;
  }, [inventoryLoadError, items, showScanFeedback]);

  const searchCards = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return [] as InventoryCardSnapshot[];
    }

    try {
      setSearching(true);
      const data = await searchLocalPokemonCards<any>(trimmed, {
        language: 'all',
        limit: 60,
        select: 'id,name,language,number,rarity,set_id,image_small,image_large,raw_data',
      });

      const ids = (data ?? []).map((row: any) => row.id);
      const snapshotMap = new Map<string, any>();
      if (ids.length) {
        const snapshots = await fetchStackrPriceSnapshots(ids);
        for (const id of ids) {
          const snap = snapshots.get(id);
          if (!snap) continue;
          snapshotMap.set(id, {
            card_id: id,
            tcg_mid: snap.market_central,
            ebay_average: null,
            cardmarket_trend: null,
            snapshot_date: snap.snapshot_date,
            stackr_market: snap,
          });
        }
      }

      const snapshots = (data ?? []).map((row: any) => toCardSnapshot(row, snapshotMap.get(row.id)));
      setResults(snapshots);
      return snapshots;
    } catch (error) {
      console.log('Inventory search failed', error);
      setResults([]);
      return [] as InventoryCardSnapshot[];
    } finally {
      setSearching(false);
    }
  }, []);

  const searchProduct = useCallback(async (text: string, type: ProductLookupType) => {
    const trimmed = text.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }

    try {
      setSearching(true);
      const catalogResults = await searchMarketProducts(trimmed, type, 12);
      if (catalogResults.length) {
        setResults(catalogResults.map(productToInventorySnapshot));
        const needsPrice = catalogResults[0].latest_price?.average == null;
        if (needsPrice) {
          try {
            const price = await refreshMarketProductPrice(catalogResults[0]);
            setResults([
              productToInventorySnapshot({ ...catalogResults[0], latest_price: price }),
              ...catalogResults.slice(1).map(productToInventorySnapshot),
            ]);
          } catch (error) {
            console.log('Inventory product price refresh failed', error);
          }
        }
        return;
      }

      setResults([]);
    } catch (error) {
      console.log('Inventory product search failed', error);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const loadProductCatalog = useCallback(async (type: ProductLookupType) => {
    try {
      setSearching(true);
      const products = await listMarketProducts(type, 40);
      setResults(products.map(productToInventorySnapshot));
    } catch (error) {
      console.log('Inventory product catalog failed', error);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const onSearchChange = useCallback((text: string) => {
    setQuery(text);
    if (stockScanMode === 'remove') {
      setResults([]);
      return;
    }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      if (lookupType === 'raw_card') {
        searchCards(text);
      } else {
        if (text.trim().length < 2) {
          loadProductCatalog(lookupType);
        } else {
          searchProduct(text, lookupType);
        }
      }
    }, lookupType === 'raw_card' ? 300 : 450);
  }, [loadProductCatalog, lookupType, searchCards, searchProduct, stockScanMode]);

  const changeLookupType = useCallback((nextType: InventoryLookupType) => {
    setLookupType(nextType);
    setResults([]);
    setDrafts([]);
    if (nextType !== 'raw_card' && !query.trim()) {
      loadProductCatalog(nextType);
      return;
    }
    if (query.trim()) {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(() => {
        if (nextType === 'raw_card') {
          searchCards(query);
        } else {
          searchProduct(query, nextType);
        }
      }, 120);
    }
  }, [loadProductCatalog, query, searchCards, searchProduct]);

  const toggleDraftCard = useCallback((card: InventoryCardSnapshot) => {
    setDrafts((prev) => {
      if (prev.some((draft) => draft.card.id === card.id)) {
        return prev.filter((draft) => draft.card.id !== card.id);
      }
      return [...prev, { card, quantities: createQuantities(card.is_product ? 'Sealed' : 'Near Mint'), askingPrice: '', expanded: true }];
    });
  }, []);

  const toggleDraftExpanded = useCallback((cardId: string) => {
    setDrafts((prev) =>
      prev.map((draft) =>
        draft.card.id === cardId ? { ...draft, expanded: !draft.expanded } : draft
      )
    );
  }, []);

  const updateDraftQuantity = useCallback((cardId: string, condition: InventoryCondition, change: number) => {
    setDrafts((prev) =>
      prev.map((draft) => {
        if (draft.card.id !== cardId) return draft;
        return {
          ...draft,
          quantities: {
            ...draft.quantities,
            [condition]: Math.max(0, (draft.quantities[condition] ?? 0) + change),
          },
        };
      })
    );
  }, []);

  const updateDraftAskingPrice = useCallback((cardId: string, value: string) => {
    setDrafts((prev) =>
      prev.map((draft) =>
        draft.card.id === cardId
          ? { ...draft, askingPrice: value.replace(/[^0-9.]/g, '').slice(0, 9) }
          : draft
      )
    );
  }, []);

  const removeDraft = useCallback((cardId: string) => {
    setDrafts((prev) => prev.filter((draft) => draft.card.id !== cardId));
  }, []);

  const openProductStockModal = useCallback((card: InventoryCardSnapshot) => {
    setSelectedProduct(card);
    setProductQuantity('1');
    setProductAskingPrice('');
  }, []);

  const addStockLine = useCallback((currentItems: InventoryItem[], card: InventoryCardSnapshot, condition: InventoryCondition, quantity: number, askingPrice?: number | null) => {
    const existing = currentItems.find(
      (item) =>
        item.card_id === card.id &&
        item.condition === condition &&
        (item.card.inventory_binder_id ?? null) === (card.inventory_binder_id ?? null)
    );
    const now = new Date().toISOString();
    return existing
      ? currentItems.map((item) =>
          item.id === existing.id
            ? {
                ...item,
                quantity: item.quantity + quantity,
                asking_price: askingPrice ?? item.asking_price,
                updated_at: now,
                card,
              }
            : item
        )
      : [{
          ...createInventoryItem(card, condition, quantity),
          id: `${card.id}:${condition}:${Date.now()}:${Math.random()}`,
          asking_price: askingPrice ?? null,
        }, ...currentItems];
  }, []);

  const addSelectedProductToInventory = useCallback(async () => {
    if (!selectedProduct) return;

    const quantity = Math.max(1, Math.floor(Number.parseInt(productQuantity, 10) || 1));
    const parsedAskingPrice = Number.parseFloat(productAskingPrice.replace(/[^0-9.]/g, ''));
    const askingPrice = Number.isFinite(parsedAskingPrice) ? parsedAskingPrice : null;

    const productForInventory: InventoryCardSnapshot = {
      ...selectedProduct,
      inventory_binder_name: askingPrice != null ? 'Sell/Trade inventory' : null,
    };
    const next = addStockLine(items, productForInventory, 'Sealed', quantity, askingPrice);
    const addedItem = next.find((item) => (
      item.card_id === selectedProduct.id && item.condition === 'Sealed'
    ));
    if (!addedItem) return;

    try {
      await commitInventoryChange({
        nextItems: next,
        movements: [{
          inventory_item_id: addedItem.id,
          action_type: 'scan_in',
          card_id: selectedProduct.id,
          set_id: selectedProduct.set_id,
          card_name: selectedProduct.name,
          quantity,
          reason: askingPrice != null ? 'Added to Sell/Trade' : 'Added to Collection',
          value_at_time: getPreferredPrice(selectedProduct),
          image_small: selectedProduct.image_small,
        }],
      });
      setSelectedProduct(null);
      setProductQuantity('1');
      setProductAskingPrice('');
    } catch (error) {
      console.log('Product inventory commit failed', error);
      alertSellerCommitFailure(error, 'Could not add product', 'The change was rejected. Refresh and try again.');
    }
  }, [addStockLine, commitInventoryChange, items, productAskingPrice, productQuantity, selectedProduct]);

  const addAllDrafts = useCallback(async () => {
    if (scanInDestination === 'binder' && !selectedBinder) {
      Alert.alert('Choose a binder', 'Select the binder this scan-in should update before confirming.');
      return;
    }

    const totalQuantity = drafts.reduce(
      (sum, draft) => sum + getDraftConditions(draft.card).reduce((inner, condition) => inner + (draft.quantities[condition] ?? 0), 0),
      0
    );
    if (totalQuantity <= 0) {
      Alert.alert('No quantities selected', 'Add at least one condition quantity before adding to inventory.');
      return;
    }

    let next = items;
    const movements: InventoryMovementDraft[] = [];
    const binderDeltas: SellerBinderDelta[] = [];
    for (const draft of drafts) {
      const parsedAskingPrice = Number.parseFloat(draft.askingPrice);
      const askingPrice = Number.isFinite(parsedAskingPrice) ? parsedAskingPrice : null;
      const draftTotal = getDraftConditions(draft.card).reduce((sum, condition) => sum + (draft.quantities[condition] ?? 0), 0);
      const canUseBinder = scanInDestination === 'binder'
        && Boolean(selectedBinder)
        && Boolean(draft.card.set_id);
      if (scanInDestination === 'binder' && !draft.card.set_id) {
        Alert.alert('Binder not updated', `${draft.card.name} has no set id, so it will be added to Inventory only.`);
      }
      const cardForInventory: InventoryCardSnapshot = {
        ...draft.card,
        inventory_binder_id: canUseBinder ? selectedBinder?.id ?? null : null,
        inventory_binder_name: canUseBinder
          ? selectedBinder?.name ?? null
          : scanInDestination === 'sell_trade'
            ? 'Sell/Trade inventory'
            : null,
      };

      for (const condition of getDraftConditions(draft.card)) {
        const quantity = draft.quantities[condition] ?? 0;
        if (quantity <= 0) continue;
        next = addStockLine(next, cardForInventory, condition, quantity, askingPrice);
        const inventoryItem = next.find((item) => (
          item.card_id === draft.card.id
          && item.condition === condition
          && (item.card.inventory_binder_id ?? null) === (cardForInventory.inventory_binder_id ?? null)
        ));
        if (!inventoryItem) continue;
        const destination = scanInDestinations.find((item) => item.key === scanInDestination);
        movements.push({
          inventory_item_id: inventoryItem.id,
          action_type: 'scan_in',
          card_id: draft.card.id,
          set_id: draft.card.set_id,
          card_name: draft.card.name,
          quantity,
          reason: canUseBinder ? 'Added to Binder' : destination?.reason ?? 'Added to Collection',
          binder_id: canUseBinder ? selectedBinder?.id ?? null : null,
          binder_name: canUseBinder ? selectedBinder?.name ?? null : null,
          value_at_time: getPreferredPrice(draft.card),
          image_small: draft.card.image_small,
        });
      }

      if (canUseBinder && draftTotal > 0 && draft.card.set_id) {
        binderDeltas.push({
          binder_id: selectedBinder!.id,
          card_id: draft.card.id,
          set_id: draft.card.set_id,
          quantity_delta: draftTotal,
          card_name: draft.card.name,
          card_number: draft.card.number,
          image_url: draft.card.image_small,
          set_name: draft.card.set_name,
        });
      }
    }
    try {
      await commitInventoryChange({ nextItems: next, movements, binderDeltas });
      setQuery('');
      setResults([]);
      setDrafts([]);
      setWorkspaceOpen(false);
    } catch (error) {
      console.log('Inventory scan-in batch failed', error);
      alertSellerCommitFailure(error, 'Could not add batch', 'The batch was rejected. Refresh and try again.');
    }
  }, [addStockLine, commitInventoryChange, drafts, items, scanInDestination, selectedBinder]);

  const updateQuantity = useCallback(async (id: string, change: number) => {
    const current = items.find((item) => item.id === id);
    if (!current) return;
    const nextQuantity = Math.max(0, current.quantity + change);
    const actualChange = nextQuantity - current.quantity;
    if (actualChange === 0) return;
    const next = items
      .map((item) =>
        item.id === id
          ? { ...item, quantity: Math.max(0, item.quantity + change), updated_at: new Date().toISOString() }
          : item
      )
      .filter((item) => item.quantity > 0);
    const binderId = current.card.is_product || !current.set_id
      ? null
      : current.card.inventory_binder_id ?? null;
    try {
      await commitInventoryChange({
        nextItems: next,
        movements: [{
          inventory_item_id: current.id,
          action_type: actualChange > 0 ? 'scan_in' : 'scan_out',
          card_id: current.card_id,
          set_id: current.set_id,
          card_name: current.card.name,
          quantity: Math.abs(actualChange),
          reason: 'Other',
          binder_id: binderId,
          binder_name: binderId ? current.card.inventory_binder_name ?? null : null,
          value_at_time: getPreferredPrice(current.card),
          image_small: current.card.image_small,
        }],
        binderDeltas: binderId && current.set_id ? [{
          binder_id: binderId,
          card_id: current.card_id,
          set_id: current.set_id,
          quantity_delta: actualChange,
          card_name: current.card.name,
          card_number: current.card.number,
          image_url: current.card.image_small,
          set_name: current.card.set_name,
        }] : [],
      });
    } catch (error) {
      console.log('Inventory quantity update failed', error);
      alertSellerCommitFailure(error, 'Could not update quantity', 'The quantity change was rejected. Refresh and try again.');
    }
  }, [commitInventoryChange, items]);

  const updateAskingPrice = useCallback(async (id: string, value: string) => {
    const parsed = Number.parseFloat(value.replace(/[^0-9.]/g, ''));
    const next = items.map((item) =>
      item.id === id
        ? { ...item, asking_price: Number.isFinite(parsed) ? parsed : null, updated_at: new Date().toISOString() }
        : item
    );
    try {
      await commitInventoryChange({ nextItems: next });
    } catch (error) {
      console.log('Inventory price update failed', error);
      alertSellerCommitFailure(error, 'Could not update price', 'The price change was rejected. Refresh and try again.');
    }
  }, [commitInventoryChange, items]);

  const addItemToSale = useCallback((item: InventoryItem, quantity = 1) => {
    const quantityToAdd = Math.max(1, Math.min(item.quantity, quantity));
    setSaleCart((prev) => {
      const existing = prev.find((line) => line.item.id === item.id);
      if (existing) {
        return prev.map((line) =>
          line.item.id === item.id
            ? { ...line, quantity: Math.min(item.quantity, line.quantity + quantityToAdd) }
            : line
        );
      }
      return [...prev, { item, quantity: quantityToAdd }];
    });
    setSaleOpen(true);
  }, []);

  const routeStockOutItem = useCallback((
    item: InventoryItem,
    reason: InventoryMovementReason = stockOutReason,
    quantity = 1
  ) => {
    if (getSellerStockOutRoute(reason) === 'sale-cart') {
      addItemToSale(item, quantity);
      return;
    }
    setPendingStockOut({
      item,
      quantity,
      reason,
    });
  }, [addItemToSale, stockOutReason]);

  const updatePendingStockOutQuantity = useCallback((change: number) => {
    setPendingStockOut((current) => {
      if (!current) return current;
      return {
        ...current,
        quantity: Math.max(1, Math.min(current.item.quantity, current.quantity + change)),
      };
    });
  }, []);

  const confirmScanOut = useCallback(async () => {
    if (!pendingStockOut) return;

    const { item, quantity, reason } = pendingStockOut;
    if (quantity > item.quantity) {
      Alert.alert('Quantity too high', `You only own ${item.quantity} of this item.`);
      return;
    }

    if (getSellerStockOutRoute(reason) === 'sale-cart') {
      addItemToSale(item, quantity);
      setPendingStockOut(null);
      return;
    }

    const nextQuantity = Math.max(0, item.quantity - quantity);
    try {
      const now = new Date().toISOString();
      const next = items
        .map((current) =>
          current.id === item.id
            ? { ...current, quantity: nextQuantity, updated_at: now }
            : current
        )
        .filter((current) => current.quantity > 0);

      const binderId = item.card.is_product || !item.set_id
        ? null
        : item.card.inventory_binder_id ?? null;
      await commitInventoryChange({
        nextItems: next,
        movements: [{
          inventory_item_id: item.id,
          action_type: 'scan_out',
          card_id: item.card_id,
          set_id: item.set_id,
          card_name: item.card.name,
          quantity,
          reason,
          binder_id: binderId,
          binder_name: binderId ? item.card.inventory_binder_name ?? null : null,
          value_at_time: getPreferredPrice(item.card),
          image_small: item.card.image_small,
        }],
        binderDeltas: binderId && item.set_id ? [{
          binder_id: binderId,
          card_id: item.card_id,
          set_id: item.set_id,
          quantity_delta: -quantity,
          card_name: item.card.name,
          card_number: item.card.number,
          image_url: item.card.image_small,
          set_name: item.card.set_name,
        }] : [],
      });
      setPendingStockOut(null);
    } catch (error) {
      console.log('Inventory scan out failed', error);
      alertSellerCommitFailure(error, 'Could not remove item', 'The stock change was rejected. Refresh and try again.');
    }
  }, [addItemToSale, commitInventoryChange, items, pendingStockOut]);

  const identifyScannedCard = useCallback(async (base64Image: string) => {
    const { identifyCardsDetailed } = await import('../../lib/recognition/orchestrator');
    const result = await identifyCardsDetailed([base64Image]);
    return (result.cards[0] ?? null) as any;
  }, []);

  const findStockOutCandidates = useCallback((parsed: any) => {
    const name = String(parsed?.name ?? parsed?.card?.name ?? '').trim().toLowerCase();
    const setName = String(parsed?.set ?? parsed?.card?.set ?? parsed?.card?.setName ?? '').trim().toLowerCase();
    const number = String(parsed?.number ?? parsed?.card?.number ?? '').trim().toLowerCase();
    const cleanNumber = number.replace(/^0+/, '').replace(/[^a-z0-9]/g, '');

    return items
      .map((item) => {
        let score = 0;
        const itemName = item.card.name.toLowerCase();
        const itemSet = `${item.card.set_name ?? ''} ${item.card.set_id ?? ''}`.toLowerCase();
        const itemNumber = String(item.card.number ?? '').toLowerCase();
        const cleanItemNumber = itemNumber.replace(/^0+/, '').replace(/[^a-z0-9]/g, '');

        if (name && itemName === name) score += 80;
        else if (name && (itemName.includes(name) || name.includes(itemName))) score += 58;

        if (cleanNumber && cleanItemNumber && cleanNumber === cleanItemNumber) score += 55;
        if (setName && itemSet.includes(setName)) score += 35;

        return { item, score };
      })
      .filter((entry) => entry.score >= 55)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.item);
  }, [items]);

  const openStockOutPicker = useCallback((candidates: InventoryItem[], context: 'inventory' | 'sale') => {
    setStockOutCandidates(candidates);
    setStockOutContext(context);
    setStockOutPickerOpen(true);
  }, []);

  const scanToInventory = useCallback((mode: 'add' | 'remove' = stockScanMode) => {
    setVaultMode(mode === 'add' ? 'inbound' : 'outbound');
    setStockScanMode(mode);
    setActiveFlow(mode === 'add' ? 'scan_in' : 'scan_out');
    setResults([]);
    if (mode === 'remove') {
      setDrafts([]);
      setQuery('');
    }
    scanStore.setCallback(async (base64Image: string, resolvedCard?: any) => {
      try {
        const parsed = inventoryParsedFromResolvedCard(resolvedCard) ?? await identifyScannedCard(base64Image);
        const name = parsed?.name ?? parsed?.card?.name;
        if (!name) {
          Alert.alert('Could not identify card', 'Try searching manually or scan again.');
          return;
        }

        if (mode === 'remove') {
          const candidates = findStockOutCandidates(parsed);
          if (!candidates.length) {
            Alert.alert('Not owned yet', 'This scan did not match any item you currently own. Try manual search or Scan In first.');
            return;
          }
          openStockOutPicker(candidates, 'inventory');
          return;
        }

        setQuery(String(name));
        setWorkspaceOpen(true);
        setLookupType('raw_card');
        const matches = await searchCards(String(name));
        const parsedId = parsed?.id ?? parsed?.card?.id;
        const parsedSetId = parsed?.set_id ?? parsed?.card?.set_id;
        const parsedNumber = String(parsed?.number ?? parsed?.card?.number ?? '').replace(/^0+/, '');
        const exactMatch =
          matches.find((card) => parsedId && card.id === parsedId) ??
          matches.find((card) =>
            parsedSetId &&
            parsedNumber &&
            card.set_id === parsedSetId &&
            String(card.number ?? '').replace(/^0+/, '') === parsedNumber
          ) ??
          (matches.length === 1 ? matches[0] : null);
        if (exactMatch) {
          const card = exactMatch;
          setDrafts((prev) =>
            prev.some((draft) => draft.card.id === card.id)
              ? prev
              : [...prev, { card, quantities: createQuantities(card.is_product ? 'Sealed' : 'Near Mint'), askingPrice: '', expanded: true }]
          );
        }
      } catch (error) {
        console.log('Inventory scan failed', error);
        Alert.alert('Scan failed', 'Try searching manually for now.');
      }
    });
    const sellerReasonLabel = mode === 'add'
      ? stockInReasonLabel
      : stockOutReasonOptions.find((option) => option.reason === stockOutReason)?.label ?? 'Customer purchase';

    router.push({
      pathname: '/scan',
      params: {
        mode: 'inventory',
        flow: mode === 'add' ? 'stock_in' : 'stock_out',
        reason: sellerReasonLabel,
      },
    });
  }, [findStockOutCandidates, identifyScannedCard, openStockOutPicker, searchCards, stockInReasonLabel, stockOutReason, stockScanMode]);

  const filteredItems = useMemo(() => {
    const min = Number.parseFloat(minPrice);
    const max = Number.parseFloat(maxPrice);
    const cleanQuery = stockScanMode === 'remove' ? query.trim().toLowerCase() : '';
    return items.filter((item) => {
      const preferredPrice = getPreferredPrice(item.card);
      if (cleanQuery) {
        const haystack = [
          item.card.name,
          item.card.set_name,
          item.card.set_id,
          item.card.number,
          item.card.inventory_binder_name,
          item.condition,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(cleanQuery)) return false;
      }
      if (inventoryViewFilter === 'lowStock' && item.quantity > 2) return false;
      if (inventoryViewFilter === 'highValue' && (preferredPrice ?? 0) < 25) return false;
      if (inventoryViewFilter === 'noPrice' && preferredPrice != null) return false;
      if (filterCondition !== 'All' && item.condition !== filterCondition) return false;
      if (setFilter.trim()) {
        const haystack = `${item.card.set_name ?? ''} ${item.card.set_id ?? ''}`.toLowerCase();
        if (!haystack.includes(setFilter.trim().toLowerCase())) return false;
      }
      const price = preferredPrice ?? 0;
      if (Number.isFinite(min) && price < min) return false;
      if (Number.isFinite(max) && price > max) return false;
      return true;
    });
  }, [filterCondition, inventoryViewFilter, items, maxPrice, minPrice, query, setFilter, stockScanMode]);

  const catalogResults = useMemo(() => {
    return results;
  }, [results]);

  const totalStock = items.reduce((sum, item) => sum + item.quantity, 0);
  const inventoryValue = items.reduce((sum, item) => sum + (getPreferredPrice(item.card) ?? 0) * item.quantity, 0);
  const recentMovements = movements.slice(0, 5);
  const activeInventoryFilterCount = (inventoryViewFilter !== 'all' && inventoryViewFilter !== 'stockOut' ? 1 : 0)
    + (filterCondition !== 'All' ? 1 : 0)
    + (setFilter.trim() ? 1 : 0)
    + (minPrice.trim() ? 1 : 0)
    + (maxPrice.trim() ? 1 : 0);
  const saleEstimatedValue = saleCart.reduce(
    (sum, line) => sum + (getPreferredPrice(line.item.card) ?? 0) * line.quantity,
    0
  );
  const salePreviewImages = saleCart
    .flatMap((line) => Array.from({ length: line.quantity }, () => line.item.card.image_small))
    .filter(Boolean)
    .slice(0, 5) as string[];
  const workspaceExpanded = workspaceOpen || query.trim().length > 0 || results.length > 0;
  const inventoryListLabel = `${filteredItems.length} item${filteredItems.length !== 1 ? 's' : ''}`;
  const selectedVaultModeOption =
    vaultModeOptions.find((option) => option.key === vaultMode) ?? vaultModeOptions[0];
  const selectedVaultModeIcon = vaultMode === 'inbound' ? stackrIcons.inbound : stackrIcons.outbound;
  const recentScanTotal = movements.reduce((sum, movement) => sum + movement.quantity, 0);
  const selectedSellerReasonLabel = vaultMode === 'inbound'
    ? stockInReasonLabel
    : stockOutReasonOptions.find((option) => option.reason === stockOutReason)?.label ?? 'Customer purchase';
  const intakeBatchCount = drafts.reduce(
    (sum, draft) => sum + getDraftConditions(draft.card).reduce((inner, condition) => inner + (draft.quantities[condition] ?? 0), 0),
    0
  );
  const intakeBatchValue = drafts.reduce(
    (sum, draft) => {
      const quantity = getDraftConditions(draft.card).reduce((inner, condition) => inner + (draft.quantities[condition] ?? 0), 0);
      return sum + (getPreferredPrice(draft.card) ?? 0) * quantity;
    },
    0
  );
  const outCartCount = saleCart.reduce((sum, line) => sum + line.quantity, 0);
  const sellerReviewCount = vaultMode === 'inbound'
    ? drafts.filter((draft) => getDraftConditions(draft.card).reduce((sum, condition) => sum + (draft.quantities[condition] ?? 0), 0) <= 0).length
    : pendingStockOut ? 1 : 0;

  const handleStockInReasonSelect = useCallback((option: SellerReasonOption) => {
    setStockInReasonLabel(option.label);
    if (option.destination) setScanInDestination(option.destination);
  }, []);

  const handleStockOutReasonSelect = useCallback((option: SellerReasonOption) => {
    setStockOutReason(option.reason);
  }, []);

  const startSale = useCallback(() => {
    setVaultMode('outbound');
    setStockScanMode('remove');
    setActiveFlow('scan_out');
    setStockOutReason('Sold');
    setSaleCart([]);
    setSalePrice('');
    setSaleOpen(true);
  }, []);

  const selectVaultMode = useCallback((mode: VaultModeKey) => {
    setVaultMode(mode);
    setActiveFlow(mode === 'inbound' ? 'scan_in' : 'scan_out');
    setStockScanMode(mode === 'inbound' ? 'add' : 'remove');
    setResults([]);
    setQuery('');
    if (mode === 'outbound') {
      setDrafts([]);
      return;
    }
    setScanInDestination((current) => current === 'sell_trade' ? 'collection' : current);
  }, []);

  const runVaultScan = useCallback(() => {
    if (vaultMode === 'outbound' && totalStock <= 0) {
      Alert.alert(
        'Removing mode is active',
        'There are no owned cards to remove. Switch to Stock In before scanning new cards.',
        [
          { text: 'Stay Removing', style: 'cancel' },
          {
            text: 'Switch to Adding',
            onPress: () => {
              setVaultMode('inbound');
              setStockScanMode('add');
              setActiveFlow('scan_in');
            },
          },
        ]
      );
      return;
    }

    scanToInventory(vaultMode === 'inbound' ? 'add' : 'remove');
  }, [scanToInventory, totalStock, vaultMode]);

  const updateSaleQuantity = useCallback((itemId: string, change: number) => {
    setSaleCart((prev) =>
      prev
        .map((line) =>
          line.item.id === itemId
            ? { ...line, quantity: Math.max(0, Math.min(line.item.quantity, line.quantity + change)) }
            : line
        )
        .filter((line) => line.quantity > 0)
    );
  }, []);

  const chooseStockOutItem = useCallback(async (item: InventoryItem) => {
    setStockOutPickerOpen(false);
    if (stockOutContext === 'sale') {
      addItemToSale(item);
      setSaleOpen(true);
      return;
    }
    routeStockOutItem(item);
  }, [addItemToSale, routeStockOutItem, stockOutContext]);

  const scanToSale = useCallback(() => {
    setVaultMode('outbound');
    setStockScanMode('remove');
    setActiveFlow('scan_out');
    setSaleOpen(false);
    scanStore.setCallback(async (base64Image: string, resolvedCard?: any) => {
      try {
        const parsed = inventoryParsedFromResolvedCard(resolvedCard) ?? await identifyScannedCard(base64Image);
        const candidates = findStockOutCandidates(parsed);
        if (!candidates.length) {
          setSaleOpen(true);
          Alert.alert('Not found in inventory', 'This card is not currently owned in Inventory. Use Scan In first if needed.');
          return;
        }
        if (candidates.length === 1) {
          addItemToSale(candidates[0]);
          return;
        }
        openStockOutPicker(candidates, 'sale');
      } catch (error) {
        console.log('Sale scan failed', error);
        setSaleOpen(true);
        Alert.alert('Scan failed', 'Try adding the card from inventory manually.');
      }
    });
    router.push({
      pathname: '/scan',
      params: {
        mode: 'inventory',
        flow: 'stock_out',
        reason: stockOutReasonOptions.find((option) => option.reason === stockOutReason)?.label ?? 'Customer purchase',
      },
    });
  }, [addItemToSale, findStockOutCandidates, identifyScannedCard, openStockOutPicker, stockOutReason]);

  const completeSale = useCallback(async () => {
    if (!saleCart.length) {
      Alert.alert('No cards added', 'Add at least one inventory item before completing a sale.');
      return;
    }

    const soldPrice = Number.parseFloat(salePrice.replace(/[^0-9.]/g, ''));
    const now = new Date().toISOString();
    const nextItems = items
      .map((item) => {
        const line = saleCart.find((saleLine) => saleLine.item.id === item.id);
        if (!line) return item;
        return {
          ...item,
          quantity: Math.max(0, item.quantity - line.quantity),
          updated_at: now,
        };
      })
      .filter((item) => item.quantity > 0);

    const sale: InventorySaleTransaction = {
      id: `sale:${Date.now()}`,
      sold_price: Number.isFinite(soldPrice) ? soldPrice : null,
      estimated_value: saleEstimatedValue,
      created_at: now,
      lines: saleCart.map((line) => ({
        inventory_item_id: line.item.id,
        card_id: line.item.card_id,
        card_name: line.item.card.name,
        set_name: line.item.card.set_name,
        condition: line.item.condition,
        quantity: line.quantity,
        estimated_unit_price: getPreferredPrice(line.item.card),
        image_small: line.item.card.image_small,
      })),
    };
    const movements: InventoryMovementDraft[] = saleCart.map((line) => {
      const binderId = line.item.card.is_product || !line.item.set_id
        ? null
        : line.item.card.inventory_binder_id ?? null;
      return {
        inventory_item_id: line.item.id,
        action_type: 'scan_out',
        card_id: line.item.card_id,
        set_id: line.item.set_id,
        card_name: line.item.card.name,
        quantity: line.quantity,
        reason: 'Sold',
        binder_id: binderId,
        binder_name: binderId ? line.item.card.inventory_binder_name ?? null : null,
        value_at_time: getPreferredPrice(line.item.card),
        image_small: line.item.card.image_small,
      };
    });
    const binderDeltas: SellerBinderDelta[] = saleCart.flatMap((line) => {
      const binderId = line.item.card.is_product
        ? null
        : line.item.card.inventory_binder_id ?? null;
      if (!binderId || !line.item.set_id) return [];
      return [{
        binder_id: binderId,
        card_id: line.item.card_id,
        set_id: line.item.set_id,
        quantity_delta: -line.quantity,
        card_name: line.item.card.name,
        card_number: line.item.card.number,
        image_url: line.item.card.image_small,
        set_name: line.item.card.set_name,
      }];
    });

    try {
      await commitInventoryChange({ nextItems, movements, sale, binderDeltas });
      setSaleOpen(false);
      setSaleCart([]);
      setSalePrice('');
      Alert.alert('Sale completed', 'Inventory and the sale report were saved together.');
    } catch (error) {
      console.log('Seller sale commit failed', error);
      alertSellerCommitFailure(error, 'Could not complete sale', 'The sale was rejected. Refresh and try again.');
    }
  }, [commitInventoryChange, items, saleCart, saleEstimatedValue, salePrice]);

  const renderInventoryItem = ({ item }: { item: InventoryItem }) => {
    const price = getPreferredPrice(item.card);
    const saleLine = saleCart.find((line) => line.item.id === item.id);
    const imageWidth = isWideLayout ? '100%' : 76;
    const imageHeight = item.card.is_product ? 76 : 106;
    const imageRadius = item.card.is_product ? 12 : 7;

    if (!isWideLayout) {
      return (
        <View style={{ width: itemWidth, backgroundColor: theme.colors.card, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 12, position: 'relative', ...cardShadow }}>
          <TouchableOpacity
            onPress={() => updateQuantity(item.id, 1)}
            activeOpacity={0.82}
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: theme.colors.primary,
              borderWidth: 2,
              borderColor: theme.colors.card,
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 5,
            }}
          >
            <Ionicons name="add" size={17} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {item.card.image_small ? (
              <StackrImage
                uri={item.card.image_small}
                style={{ width: imageWidth, height: imageHeight, borderRadius: imageRadius, backgroundColor: theme.colors.surface }}
                contentFit="contain"
                priority="low"
                rounded={imageRadius}
                showFallbackIcon={false}
              />
            ) : (
              <View style={{ width: imageWidth, height: imageHeight, borderRadius: imageRadius, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={item.card.is_product ? 'cube-outline' : 'albums-outline'} size={26} color={theme.colors.primary} />
              </View>
            )}

            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={2} style={{ color: theme.colors.text, fontWeight: '900', fontSize: 15, lineHeight: 19 }}>{item.card.name}</Text>
              <Text numberOfLines={1} style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 3 }}>{item.card.set_name ?? item.card.set_id}</Text>
              <Text numberOfLines={1} style={{ color: theme.colors.textSoft, fontSize: 11, marginTop: 3, fontWeight: '800' }}>
                {item.card.inventory_binder_name ? item.card.inventory_binder_name : 'Collection'}
              </Text>

              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                <View style={{ borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: theme.colors.primary + '12', borderWidth: 1, borderColor: theme.colors.primary + '25' }}>
                  <Text style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 12 }}>{money(price)}</Text>
                </View>
                <View style={{ borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }}>
                  <Text style={{ color: theme.colors.textSoft, fontWeight: '900', fontSize: 11 }}>{conditionShort[item.condition]}</Text>
                </View>
                <View style={{ borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }}>
                  <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 11 }}>x{item.quantity}</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <TouchableOpacity onPress={() => routeStockOutItem(item)} style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: '#FFF7ED', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FED7AA' }}>
              <Ionicons name="remove" size={18} color={theme.colors.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => updateQuantity(item.id, 1)} style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="add" size={18} color="#FFFFFF" />
            </TouchableOpacity>
            <TextInput
              placeholder="Ask £"
              placeholderTextColor={theme.colors.textSoft}
              keyboardType="decimal-pad"
              defaultValue={item.asking_price != null ? String(item.asking_price) : ''}
              onEndEditing={(event) => updateAskingPrice(item.id, event.nativeEvent.text)}
              style={{ flex: 1, minWidth: 0, backgroundColor: theme.colors.surface, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 9, color: theme.colors.text, fontWeight: '800', borderWidth: 1, borderColor: theme.colors.border }}
            />
            <TouchableOpacity
              onPress={() => addItemToSale(item)}
              style={{
                height: 38,
                minWidth: 88,
                backgroundColor: saleLine ? `${theme.colors.primary}18` : theme.colors.primary,
                borderRadius: 12,
                paddingHorizontal: 10,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: theme.colors.primary,
              }}
            >
              <Text style={{ color: saleLine ? theme.colors.primary : '#FFFFFF', fontWeight: '900', fontSize: 12 }}>
                {saleLine ? `Sale x${saleLine.quantity}` : 'Sell'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <View style={{ width: itemWidth, backgroundColor: theme.colors.card, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 12, position: 'relative', ...cardShadow }}>
        <TouchableOpacity
          onPress={() => updateQuantity(item.id, 1)}
          activeOpacity={0.82}
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            width: 30,
            height: 30,
            borderRadius: 15,
            backgroundColor: theme.colors.primary,
            borderWidth: 2,
            borderColor: theme.colors.card,
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 5,
          }}
        >
          <Ionicons name="add" size={17} color="#FFFFFF" />
        </TouchableOpacity>
        {item.card.image_small ? (
          <StackrImage
            uri={item.card.image_small}
            style={{ width: '100%', aspectRatio: item.card.is_product ? 1 : stackrCardImageSizes.cardAspectRatio, borderRadius: 10 }}
            contentFit="contain"
            priority="low"
            rounded={10}
            showFallbackIcon={false}
          />
        ) : (
          <View style={{ width: '100%', aspectRatio: item.card.is_product ? 1 : stackrCardImageSizes.cardAspectRatio, borderRadius: 10, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={item.card.is_product ? 'cube-outline' : 'albums-outline'} size={28} color={theme.colors.primary} />
          </View>
        )}
        <Text numberOfLines={1} style={{ color: theme.colors.text, fontWeight: '900', fontSize: 13, marginTop: 8 }}>{item.card.name}</Text>
        <Text numberOfLines={1} style={{ color: theme.colors.textSoft, fontSize: 11, marginTop: 2 }}>{item.card.set_name ?? item.card.set_id}</Text>
        <Text numberOfLines={1} style={{ color: theme.colors.textSoft, fontSize: 10, marginTop: 2, fontWeight: '800' }}>
          {item.card.inventory_binder_name ? `Binder: ${item.card.inventory_binder_name}` : 'Collection'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          <Text style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 13 }}>{money(price)}</Text>
          <View style={{ backgroundColor: theme.colors.surface, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ color: theme.colors.textSoft, fontWeight: '900', fontSize: 10 }}>{conditionShort[item.condition]}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 9 }}>
          <TouchableOpacity onPress={() => routeStockOutItem(item)} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: '#FFF7ED', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FED7AA' }}>
            <Ionicons name="remove" size={18} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>{item.quantity}</Text>
          <TouchableOpacity onPress={() => updateQuantity(item.id, 1)} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="add" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        <TextInput
          placeholder="Ask £"
          placeholderTextColor={theme.colors.textSoft}
          keyboardType="decimal-pad"
          defaultValue={item.asking_price != null ? String(item.asking_price) : ''}
          onEndEditing={(event) => updateAskingPrice(item.id, event.nativeEvent.text)}
          style={{ marginTop: 8, backgroundColor: theme.colors.surface, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, color: theme.colors.text, fontWeight: '800', borderWidth: 1, borderColor: theme.colors.border }}
        />
        <TouchableOpacity
          onPress={() => addItemToSale(item)}
          style={{
            marginTop: 8,
            backgroundColor: saleLine ? `${theme.colors.primary}18` : theme.colors.primary,
            borderRadius: 10,
            paddingVertical: 9,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: saleLine ? theme.colors.primary : theme.colors.primary,
          }}
        >
          <Text style={{ color: saleLine ? theme.colors.primary : '#FFFFFF', fontWeight: '900', fontSize: 12 }}>
            {saleLine ? `In sale x${saleLine.quantity}` : 'Scan Out sale'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg, overflow: 'hidden' }} edges={['top']}>
      <StackrBackdrop />
      <FeatureTipGate
        tipKey="inventory-screen-v1"
        title="Seller Mode"
        subtitle="Scan stock in, build out carts, and keep an audit trail."
        items={[
          { icon: 'scan-outline', title: 'Stock In', body: 'Scan purchases, trade-ins, consignment, or store intake into a reviewable batch.' },
          { icon: 'log-out-outline', title: 'Stock Out', body: 'Build an out cart for sales, trades, transfers, or lost or damaged stock.' },
          { icon: 'time-outline', title: 'Audit trail', body: 'Committed inventory movements keep reason and value context where supported.' },
        ]}
      />

      <View style={{ paddingHorizontal: width < 360 ? SELLER_TOKENS.layout.screenPaddingSmall : SELLER_TOKENS.layout.screenPadding, paddingTop: 4, flex: 1 }}>
        <View style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <StackrPageTitle title="Seller Mode" accentText="Mode" />
            <Text style={{ color: theme.colors.textSoft, marginTop: 2, fontSize: 14, lineHeight: 19, fontWeight: '700' }}>
              Scan cards into or out of your inventory.
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              onPress={exitSellerMode}
              activeOpacity={0.82}
              style={{ minHeight: 44, borderRadius: 16, backgroundColor: '#F7F3FF', borderWidth: 1, borderColor: '#E8E1FF', paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, ...cardShadow }}
              accessibilityRole="button"
              accessibilityLabel="Return to collector mode"
            >
              <Ionicons name="home-outline" size={18} color={theme.colors.primary} />
              <Text style={{ color: theme.colors.primary, fontSize: 12, lineHeight: 15, fontWeight: '900' }}>Collector</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={refreshMovements}
              style={{ minWidth: 44, height: 44, borderRadius: 16, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center', ...cardShadow }}
              accessibilityRole="button"
              accessibilityLabel="Refresh seller history"
            >
              <Ionicons name="refresh" size={20} color={theme.colors.primary} />
            </TouchableOpacity>
          </View>
        </View>
        {inventoryDataStale ? (
          <View style={{ borderRadius: 14, borderWidth: 1, borderColor: theme.colors.semantic.warning, backgroundColor: `${theme.colors.semantic.warning}12`, padding: 10, marginBottom: 10 }}>
            <Text style={{ color: theme.colors.text, fontSize: 12, lineHeight: 17, fontWeight: '800' }}>
              Offline seller data — showing this account&apos;s last verified cache in read-only mode. Refresh online before changing stock.
            </Text>
          </View>
        ) : null}
        {inventoryLoadError ? (
          <View style={{ borderRadius: 14, borderWidth: 1, borderColor: '#EF4444', backgroundColor: '#EF444412', padding: 10, marginBottom: 10 }}>
            <Text style={{ color: theme.colors.text, fontSize: 12, lineHeight: 17, fontWeight: '800' }}>
              {inventoryLoadError}
            </Text>
          </View>
        ) : null}

        <SellerSessionCard
          totalStock={totalStock}
          inventoryValue={inventoryValue}
          recentScans={recentScanTotal}
          pendingCount={sellerReviewCount}
          onNewSession={() => setSessionInfoOpen(true)}
        />

        <StockModeSegmentedControl mode={vaultMode} onChange={selectVaultMode} />

        <StockReasonChips
          options={vaultMode === 'inbound' ? stockInReasonOptions : stockOutReasonOptions}
          selectedLabel={selectedSellerReasonLabel}
          onSelect={vaultMode === 'inbound' ? handleStockInReasonSelect : handleStockOutReasonSelect}
        />

        <InventoryScanEntryCard
          mode={vaultMode}
          reasonLabel={selectedSellerReasonLabel}
          onPress={runVaultScan}
        />

        <SellerModeHelperNote mode={vaultMode} />

        <SellerSessionStats
          mode={vaultMode}
          batchCount={intakeBatchCount}
          outCartCount={outCartCount}
          estimatedValue={intakeBatchValue}
          saleTotal={saleEstimatedValue}
          reviewCount={sellerReviewCount}
        />

        <SellerQueuePreview
          mode={vaultMode}
          drafts={drafts}
          saleCart={saleCart}
          onReview={() => {
            setWorkspaceOpen(true);
            if (vaultMode === 'outbound' && !saleCart.length) startSale();
          }}
          onComplete={vaultMode === 'inbound' ? addAllDrafts : saleCart.length ? completeSale : startSale}
        />

        <View style={{ backgroundColor: theme.colors.card, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 12, ...cardShadow }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: historyOpen ? 8 : 0 }}>
            <TouchableOpacity onPress={() => setHistoryOpen((open) => !open)} style={{ flex: 1, minWidth: 0, paddingRight: 10, minHeight: 44, justifyContent: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: '900' }}>Recent activity</Text>
                <Ionicons name={historyOpen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textSoft} />
              </View>
              {!historyOpen && (
                <Text numberOfLines={1} style={{ color: theme.colors.textSoft, fontSize: 13, fontWeight: '700', marginTop: 2 }}>
                  {recentMovements[0]
                    ? `${recentMovements[0].action_type === 'scan_in' ? 'Stock In' : 'Stock Out'}: ${recentMovements[0].card_name}`
                    : 'No seller activity yet.'}
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={startSale} style={{ minHeight: 44, borderRadius: 14, paddingHorizontal: 12, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="receipt-outline" size={17} color={theme.colors.primary} />
              <Text style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 12 }}>Out cart</Text>
            </TouchableOpacity>
          </View>
          {historyOpen && (
            recentMovements.length ? recentMovements.slice(0, 5).map((movement) => (
              <VaultRecentMovementRow key={movement.id} movement={movement} />
            )) : (
              <View style={{ paddingVertical: 12, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                <Text style={{ color: theme.colors.textSoft, fontWeight: '700', fontSize: 13 }}>No seller activity yet.</Text>
              </View>
            )
          )}
        </View>

        <View style={{ backgroundColor: theme.colors.card, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: workspaceExpanded ? 10 : 0 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: '900' }}>
                {vaultMode === 'inbound' ? 'Intake workspace' : 'Stock out workspace'}
              </Text>
              <Text numberOfLines={1} style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '700', marginTop: 2 }}>
                {workspaceExpanded
                  ? selectedVaultModeOption.microcopy
                  : vaultMode === 'inbound'
                    ? 'Open manual search and batch edits.'
                    : 'Open inventory search and stock-out review.'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                if (workspaceExpanded) {
                  setWorkspaceOpen(false);
                  if (!drafts.length) {
                    setQuery('');
                    setResults([]);
                  }
                } else {
                  setWorkspaceOpen(true);
                }
              }}
              style={{ height: 36, borderRadius: 12, paddingHorizontal: 12, backgroundColor: workspaceExpanded ? theme.colors.primary : theme.colors.surface, borderWidth: 1, borderColor: workspaceExpanded ? theme.colors.primary : theme.colors.border, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 }}
            >
              <Ionicons name={workspaceExpanded ? 'chevron-up' : 'search-outline'} size={16} color={workspaceExpanded ? '#FFFFFF' : theme.colors.primary} />
              <Text style={{ color: workspaceExpanded ? '#FFFFFF' : theme.colors.primary, fontWeight: '900', fontSize: 12 }}>
                {workspaceExpanded ? 'Close' : 'Manual search'}
              </Text>
            </TouchableOpacity>
          </View>

          {workspaceExpanded && (
            <>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 9,
              backgroundColor: vaultMode === 'inbound' ? VAULT_PURPLE_SOFT : VAULT_ORANGE_SOFT,
              borderRadius: 14,
              paddingHorizontal: 10,
              paddingVertical: 9,
              marginBottom: 10,
              borderWidth: 1,
              borderColor: vaultMode === 'inbound' ? 'rgba(105,56,245,0.24)' : 'rgba(249,115,22,0.30)',
            }}
          >
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: vaultMode === 'inbound' ? 'rgba(105,56,245,0.20)' : 'rgba(249,115,22,0.22)',
              }}
            >
              <Image source={selectedVaultModeIcon} resizeMode="contain" style={{ width: 28, height: 28 }} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 12 }} numberOfLines={1}>
                {selectedVaultModeOption.label}
              </Text>
              <Text style={{ color: theme.colors.textSoft, fontWeight: '700', fontSize: 11, marginTop: 1 }} numberOfLines={1}>
                {selectedVaultModeOption.microcopy}
              </Text>
            </View>
            <Text
              style={{
                color: vaultMode === 'inbound' ? VAULT_PURPLE : '#C2410C',
                fontWeight: '900',
                fontSize: 10,
              }}
            >
              {selectedVaultModeOption.statusLabel}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.colors.surface, borderRadius: 14, paddingHorizontal: 12, borderWidth: 1, borderColor: theme.colors.border }}>
            <Ionicons name="search-outline" size={18} color={theme.colors.textSoft} />
            <TextInput
              value={query}
              onChangeText={onSearchChange}
              placeholder={stockScanMode === 'add' ? (lookupType === 'raw_card' ? 'Search card to scan in...' : `Search ${productLookupLabel(lookupType).toLowerCase()}...`) : 'Search currently owned items...'}
              placeholderTextColor={theme.colors.textSoft}
              autoCorrect={false}
              spellCheck={false}
              autoCapitalize="words"
              style={{ flex: 1, color: theme.colors.text, paddingVertical: 11, fontWeight: '800' }}
            />
            {searching && <ActivityIndicator color={theme.colors.primary} />}
          </View>

          {stockScanMode === 'add' && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 10 }}>
              {INVENTORY_LOOKUP_OPTIONS.map((option) => {
                const active = lookupType === option.key;
                return (
                  <TouchableOpacity
                    key={option.key}
                    onPress={() => changeLookupType(option.key)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: 11,
                      paddingVertical: 8,
                      borderRadius: 12,
                      backgroundColor: active ? '#F6F1FF' : theme.colors.card,
                      borderWidth: 1,
                      borderColor: active ? theme.colors.primary : theme.colors.border,
                    }}
                  >
                    <Ionicons name={option.icon} size={15} color={active ? theme.colors.primary : theme.colors.textSoft} />
                    <Text style={{ color: active ? theme.colors.primary : theme.colors.textSoft, fontWeight: '900', fontSize: 11 }}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {results.length > 0 && (
            <>
            {stockScanMode === 'add' && lookupType !== 'raw_card' && (
              <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>
                      {productLookupLabel(lookupType)}
                    </Text>
                    <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 2, fontWeight: '700' }}>
                      {query.trim() ? `${catalogResults.length} matching item${catalogResults.length !== 1 ? 's' : ''}` : `${catalogResults.length} available item${catalogResults.length !== 1 ? 's' : ''}`}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => loadProductCatalog(lookupType)} style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="refresh" size={17} color={theme.colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
            <FlatList
              data={lookupType === 'raw_card' ? results : catalogResults}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: lookupType === 'raw_card' ? 220 : Math.min(540, Math.max(360, width * 0.95)), marginTop: 10 }}
              renderItem={({ item }) => {
                const selected = lookupType === 'raw_card' && drafts.some((draft) => draft.card.id === item.id);
                const confidence = getProductConfidence(item);
                const openResultDetails = () => {
                  if (lookupType !== 'raw_card') return;
                  router.push({
                    pathname: '/card/[id]',
                    params: {
                      id: item.id,
                      setId: item.set_id ?? '',
                    },
                  });
                };
                const handleResultPress = () => {
                  if (inventoryResultLongPressRef.current === item.id) {
                    inventoryResultLongPressRef.current = null;
                    return;
                  }
                  if (lookupType === 'raw_card') {
                    toggleDraftCard(item);
                    return;
                  }
                  openProductStockModal(item);
                };
                const handleResultLongPress = () => {
                  if (lookupType !== 'raw_card') return;
                  inventoryResultLongPressRef.current = item.id;
                  openResultDetails();
                  setTimeout(() => {
                    if (inventoryResultLongPressRef.current === item.id) {
                      inventoryResultLongPressRef.current = null;
                    }
                  }, 600);
                };
                return (
                  <TouchableOpacity
                    onPress={handleResultPress}
                    onLongPress={handleResultLongPress}
                    delayLongPress={320}
                    activeOpacity={0.82}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: lookupType === 'raw_card' ? 9 : 12,
                      paddingHorizontal: lookupType === 'raw_card' ? (selected ? 8 : 0) : 10,
                      marginBottom: lookupType === 'raw_card' ? (selected ? 6 : 0) : 8,
                      borderTopWidth: lookupType === 'raw_card' ? 1 : 0,
                      borderTopColor: theme.colors.border,
                      borderRadius: lookupType === 'raw_card' ? (selected ? 14 : 0) : 16,
                      backgroundColor: lookupType === 'raw_card'
                        ? selected ? theme.colors.primary + '12' : 'transparent'
                        : theme.colors.surface,
                      borderWidth: lookupType === 'raw_card' ? (selected ? 1 : 0) : 1,
                      borderColor: selected ? theme.colors.primary : theme.colors.border,
                    }}
                  >
                    {item.image_small ? (
                      <Image
                        source={{ uri: item.image_small }}
                        style={{
                          width: item.is_product ? 68 : 46,
                          height: item.is_product ? 68 : 62,
                          borderRadius: item.is_product ? 10 : 0,
                          opacity: lookupType === 'raw_card' && !selected ? 0.48 : 1,
                        }}
                        resizeMode="contain"
                      />
                    ) : (
                      <View style={{ width: item.is_product ? 68 : 46, height: item.is_product ? 68 : 62, borderRadius: 10, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center', opacity: lookupType === 'raw_card' && !selected ? 0.48 : 1 }}>
                        <Ionicons name={item.is_product ? 'cube-outline' : 'albums-outline'} size={20} color={theme.colors.primary} />
                      </View>
                    )}
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text numberOfLines={lookupType === 'raw_card' ? 1 : 2} style={{ color: theme.colors.text, fontWeight: '900', fontSize: lookupType === 'raw_card' ? 14 : 15 }}>{item.name}</Text>
                      <Text numberOfLines={1} style={{ color: theme.colors.textSoft, fontSize: 12 }}>
                        {getProductResultSubtitle(item)}
                      </Text>
                      {item.is_product && (
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                          <Text style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 12 }}>TCG {money(item.tcg_price)}</Text>
                          <Text style={{ color: theme.colors.textSoft, fontWeight: '800', fontSize: 12 }}>eBay {money(item.ebay_price)}</Text>
                        </View>
                      )}
                      {confidence && (
                        <View style={{ alignSelf: 'flex-start', marginTop: 4, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: `${confidence.color}18` }}>
                          <Text style={{ color: confidence.color, fontWeight: '900', fontSize: 10 }}>
                            {confidence.label}{item.product_price_count != null ? ` - ${item.product_price_count} sold` : ''}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: selected ? theme.colors.primary : theme.colors.surface, borderWidth: 1, borderColor: selected ? theme.colors.primary : theme.colors.border, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name={lookupType === 'raw_card' ? (selected ? 'checkmark' : 'add') : 'chevron-forward'} size={18} color={selected ? '#FFFFFF' : theme.colors.textSoft} />
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
            </>
          )}
            </>
          )}
        </View>

        {drafts.length > 0 && (
          <View style={{ backgroundColor: theme.colors.card, borderRadius: 18, padding: 12, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 12, ...cardShadow }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <View>
                <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '900' }}>Confirm Scan In</Text>
                <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 2 }}>{drafts.length} item{drafts.length !== 1 ? 's' : ''} selected</Text>
              </View>
              <TouchableOpacity onPress={addAllDrafts} style={{ backgroundColor: theme.colors.primary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9 }}>
                <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 12 }}>Confirm Add</Text>
              </TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
              {scanInDestinations.map((destination) => {
                const active = scanInDestination === destination.key;
                return (
                  <TouchableOpacity
                    key={destination.key}
                    onPress={() => setScanInDestination(destination.key)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: active ? theme.colors.primary + '12' : theme.colors.surface, borderWidth: 1, borderColor: active ? theme.colors.primary : theme.colors.border }}
                  >
                    <Ionicons name={destination.icon} size={15} color={theme.colors.primary} />
                    <Text style={{ color: active ? theme.colors.primary : theme.colors.text, fontWeight: '900', fontSize: 12 }}>{destination.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {scanInDestination === 'binder' && (
              <View style={{ marginBottom: 8 }}>
                {binders.length ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
                    {binders.map((binder) => {
                      const active = selectedBinderId === binder.id;
                      const suggested = drafts.some((draft) => draft.card.set_id && draft.card.set_id === binder.source_set_id);
                      return (
                        <TouchableOpacity
                          key={binder.id}
                          onPress={() => setSelectedBinderId(binder.id)}
                          style={{ borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: active ? theme.colors.primary + '12' : suggested ? '#F0FDF4' : theme.colors.surface, borderWidth: 1, borderColor: active ? theme.colors.primary : suggested ? '#86EFAC' : theme.colors.border }}
                        >
                          <Text style={{ color: active ? theme.colors.primary : theme.colors.text, fontWeight: '900', fontSize: 12 }}>{binder.name}</Text>
                          {suggested && !active && (
                            <Text style={{ color: '#16A34A', fontWeight: '900', fontSize: 9, marginTop: 2 }}>Suggested</Text>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                ) : (
                  <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '700' }}>No binders found. Add to Collection or create a binder first.</Text>
                )}
              </View>
            )}

            {drafts.map((draft) => {
              const draftConditions = getDraftConditions(draft.card);
              const draftTotal = draftConditions.reduce((sum, condition) => sum + (draft.quantities[condition] ?? 0), 0);
              return (
                <View key={draft.card.id} style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 10, marginTop: 8 }}>
                  <TouchableOpacity onPress={() => toggleDraftExpanded(draft.card.id)} style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {draft.card.image_small ? (
                      <Image source={{ uri: draft.card.image_small }} style={{ width: 40, height: draft.card.is_product ? 40 : 56, borderRadius: draft.card.is_product ? 8 : 0 }} resizeMode="contain" />
                    ) : (
                      <View style={{ width: 40, height: draft.card.is_product ? 40 : 56, borderRadius: 8, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name={draft.card.is_product ? 'cube-outline' : 'albums-outline'} size={18} color={theme.colors.primary} />
                      </View>
                    )}
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text numberOfLines={1} style={{ color: theme.colors.text, fontWeight: '900' }}>{draft.card.name}</Text>
                      <Text numberOfLines={1} style={{ color: theme.colors.textSoft, fontSize: 12 }}>{draft.card.set_name} · {draftTotal} total</Text>
                    </View>
                    <TouchableOpacity onPress={() => removeDraft(draft.card.id)} style={{ padding: 8 }}>
                      <Ionicons name="close" size={18} color={theme.colors.textSoft} />
                    </TouchableOpacity>
                    <Ionicons name={draft.expanded ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textSoft} />
                  </TouchableOpacity>

                  {draft.expanded && (
                    <View style={{ marginTop: 10, gap: 7 }}>
                      {draft.card.is_product && (
                        <View style={{ backgroundColor: theme.colors.surface, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: theme.colors.border }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 12 }}>Your price</Text>
                              <Text style={{ color: theme.colors.textSoft, fontSize: 11, marginTop: 2 }}>
                                Recommended {money(getPreferredPrice(draft.card))}
                              </Text>
                            </View>
                            <TextInput
                              value={draft.askingPrice}
                              onChangeText={(value) => updateDraftAskingPrice(draft.card.id, value)}
                              placeholder="Ask"
                              placeholderTextColor={theme.colors.textSoft}
                              keyboardType="decimal-pad"
                              style={{ width: 92, backgroundColor: theme.colors.card, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: 10, paddingVertical: 7, color: theme.colors.text, fontWeight: '900' }}
                            />
                          </View>
                        </View>
                      )}
                      {draftConditions.map((condition) => (
                        <View key={condition} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.colors.surface, borderRadius: 12, paddingVertical: 7, paddingHorizontal: 10 }}>
                          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 12 }}>{condition}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <TouchableOpacity onPress={() => updateDraftQuantity(draft.card.id, condition, -1)} style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: theme.colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.border }}>
                              <Ionicons name="remove" size={16} color={theme.colors.text} />
                            </TouchableOpacity>
                            <Text style={{ color: theme.colors.text, fontWeight: '900', minWidth: 20, textAlign: 'center' }}>{draft.quantities[condition] ?? 0}</Text>
                            <TouchableOpacity onPress={() => updateDraftQuantity(draft.card.id, condition, 1)} style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                              <Ionicons name="add" size={16} color="#FFFFFF" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
        <View style={{ marginBottom: 12 }}>
          <TouchableOpacity
            onPress={() => setFiltersOpen((open) => !open)}
            style={{
              backgroundColor: theme.colors.card,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: filtersOpen || activeInventoryFilterCount > 0 ? theme.colors.primary : theme.colors.border,
              paddingHorizontal: 12,
              paddingVertical: 10,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="filter-outline" size={18} color={filtersOpen || activeInventoryFilterCount > 0 ? theme.colors.primary : theme.colors.textSoft} />
              <Text style={{ color: filtersOpen || activeInventoryFilterCount > 0 ? theme.colors.primary : theme.colors.text, fontWeight: '900' }}>Filters</Text>
              {activeInventoryFilterCount > 0 && (
                <View style={{ minWidth: 22, height: 22, borderRadius: 11, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
                  <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 11 }}>{activeInventoryFilterCount}</Text>
                </View>
              )}
            </View>
            <Ionicons name={filtersOpen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textSoft} />
          </TouchableOpacity>

          {filtersOpen && (
            <View style={{ marginTop: 10 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
            {inventoryViewFilters.map((filter) => {
              const active = inventoryViewFilter === filter.key;
              return (
                <TouchableOpacity
                  key={filter.key}
                  onPress={() => {
                    setInventoryViewFilter(filter.key);
                    if (filter.key === 'stockOut') {
                      setVaultMode('outbound');
                      setStockScanMode('remove');
                      setActiveFlow('scan_out');
                    }
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 7,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 12,
                    backgroundColor: active ? '#F6F1FF' : theme.colors.card,
                    borderWidth: 1,
                    borderColor: active ? theme.colors.primary : theme.colors.border,
                  }}
                >
                  <Ionicons
                    name={filter.icon}
                    size={15}
                    color={active ? theme.colors.primary : theme.colors.textSoft}
                  />
                  <Text
                    style={{
                      color: active ? theme.colors.primary : theme.colors.textSoft,
                      fontWeight: '900',
                      fontSize: 11,
                    }}
                  >
                    {filter.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {(['All', ...INVENTORY_FILTER_CONDITIONS] as const).map((condition) => (
              <TouchableOpacity key={condition} onPress={() => setFilterCondition(condition)} style={{ paddingHorizontal: 11, paddingVertical: 8, borderRadius: 999, backgroundColor: filterCondition === condition ? theme.colors.primary : theme.colors.card, borderWidth: 1, borderColor: filterCondition === condition ? theme.colors.primary : theme.colors.border }}>
                <Text style={{ color: filterCondition === condition ? '#FFFFFF' : theme.colors.textSoft, fontWeight: '900', fontSize: 11 }}>{condition === 'All' ? 'All' : conditionShort[condition]}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <TextInput value={setFilter} onChangeText={setSetFilter} placeholder="Set" placeholderTextColor={theme.colors.textSoft} style={{ flex: 1, backgroundColor: theme.colors.card, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: 10, color: theme.colors.text }} />
            <TextInput value={minPrice} onChangeText={setMinPrice} placeholder="Min £" keyboardType="decimal-pad" placeholderTextColor={theme.colors.textSoft} style={{ width: 78, backgroundColor: theme.colors.card, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: 10, color: theme.colors.text }} />
            <TextInput value={maxPrice} onChangeText={setMaxPrice} placeholder="Max £" keyboardType="decimal-pad" placeholderTextColor={theme.colors.textSoft} style={{ width: 78, backgroundColor: theme.colors.card, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: 10, color: theme.colors.text }} />
          </View>
          {activeInventoryFilterCount > 0 && (
            <TouchableOpacity
              onPress={() => {
                setInventoryViewFilter('all');
                setFilterCondition('All');
                setSetFilter('');
                setMinPrice('');
                setMaxPrice('');
              }}
              style={{ marginTop: 8, alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border }}
            >
              <Text style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 11 }}>Clear filters</Text>
            </TouchableOpacity>
          )}
            </View>
          )}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <View>
            <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '900' }}>Owned Inventory</Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '700', marginTop: 1 }}>
              {inventoryListLabel}{activeInventoryFilterCount > 0 ? ' shown with filters' : ''}
            </Text>
          </View>
          {activeInventoryFilterCount > 0 && (
            <TouchableOpacity
              onPress={() => setFiltersOpen(true)}
              style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: theme.colors.primary + '12', borderWidth: 1, borderColor: theme.colors.primary + '30' }}
            >
              <Text style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 11 }}>Filtered</Text>
            </TouchableOpacity>
          )}
        </View>

        <FlatList
          data={filteredItems}
          keyExtractor={(item) => item.id}
          renderItem={renderInventoryItem}
          numColumns={columns}
          key={columns}
          columnWrapperStyle={columns > 1 ? { gap: itemGap } : undefined}
          {...stackrListPerformance.cardGrid(columns)}
          contentContainerStyle={{ paddingBottom: stackrTabContentPadding.standard }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => {
            setRefreshing(true);
            try {
              await load();
            } finally {
              setRefreshing(false);
            }
          }} tintColor={theme.colors.primary} />}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 24, paddingHorizontal: 24 }}>
              <Ionicons name="file-tray-full-outline" size={34} color={theme.colors.primary} />
              <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16, marginTop: 9 }}>No inventory yet</Text>
              <Text style={{ color: theme.colors.textSoft, textAlign: 'center', marginTop: 4, lineHeight: 18, fontSize: 12.5, fontWeight: '700' }}>Use Scan In to add cards or products to your collection.</Text>
            </View>
          }
        />
      </View>

      <StackrBottomSheet
        visible={sessionInfoOpen}
        title="Seller sessions"
        subtitle="Store Inventory is active now. Named sessions can be added when the seller session table is ready."
        onClose={() => setSessionInfoOpen(false)}
        maxHeight="42%"
        contentContainerStyle={{ gap: 10 }}
        footer={(
          <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
            <TouchableOpacity onPress={() => setSessionInfoOpen(false)} style={{ backgroundColor: theme.colors.primary, borderRadius: 16, paddingVertical: 14, alignItems: 'center' }}>
              <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 15 }}>Got it</Text>
            </TouchableOpacity>
          </View>
        )}
      >
        <View style={{ borderRadius: 16, padding: 12, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }}>
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 14 }}>Current workflow</Text>
          <Text style={{ color: theme.colors.textSoft, fontWeight: '700', fontSize: 12.5, lineHeight: 18, marginTop: 4 }}>
            Stock In and Stock Out still save against your Store Inventory with movement reasons, quantities, and value context.
          </Text>
        </View>
      </StackrBottomSheet>

      <StackrBottomSheet
        visible={!!selectedProduct}
        title="Confirm Scan In"
        subtitle={selectedProduct?.product_type ? productLookupLabel(selectedProduct.product_type as ProductLookupType) : 'Sealed product'}
        onClose={() => setSelectedProduct(null)}
        maxHeight="88%"
        contentContainerStyle={{ gap: 12 }}
        footer={selectedProduct ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
            <TouchableOpacity onPress={addSelectedProductToInventory} style={{ backgroundColor: theme.colors.primary, borderRadius: 16, paddingVertical: 14, alignItems: 'center' }}>
              <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 15 }}>Confirm Add</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      >
        {selectedProduct ? (
          <>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              {selectedProduct.image_large || selectedProduct.image_small ? (
                <Image source={{ uri: selectedProduct.image_large ?? selectedProduct.image_small ?? '' }} style={{ width: 104, height: 104, borderRadius: 14, backgroundColor: theme.colors.surface }} resizeMode="contain" />
              ) : (
                <View style={{ width: 104, height: 104, borderRadius: 14, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="cube-outline" size={30} color={theme.colors.primary} />
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: theme.colors.text, fontSize: 16, lineHeight: 21, fontWeight: '900' }} numberOfLines={3}>{selectedProduct.name}</Text>
                <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 16, fontWeight: '700', marginTop: 4 }} numberOfLines={2}>{selectedProduct.set_name ?? 'Product'}</Text>
                {getProductConfidence(selectedProduct) ? (
                  <View style={{ alignSelf: 'flex-start', marginTop: 8, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: `${getProductConfidence(selectedProduct)!.color}18` }}>
                    <Text style={{ color: getProductConfidence(selectedProduct)!.color, fontWeight: '900', fontSize: 11 }}>
                      {getProductConfidence(selectedProduct)!.label}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={{ backgroundColor: theme.colors.surface, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: theme.colors.border }}>
              <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 13, marginBottom: 8 }}>Recommended prices</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1, backgroundColor: theme.colors.card, borderRadius: 12, padding: 9, borderWidth: 1, borderColor: theme.colors.border }}>
                  <Text style={{ color: theme.colors.textSoft, fontWeight: '900', fontSize: 10.5 }}>TCG</Text>
                  <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 15, marginTop: 3 }} numberOfLines={1}>{money(selectedProduct.tcg_price)}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: theme.colors.card, borderRadius: 12, padding: 9, borderWidth: 1, borderColor: theme.colors.border }}>
                  <Text style={{ color: theme.colors.textSoft, fontWeight: '900', fontSize: 10.5 }}>eBay sold avg</Text>
                  <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 15, marginTop: 3 }} numberOfLines={1}>{money(selectedProduct.ebay_price)}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <View style={{ flex: 1, backgroundColor: theme.colors.card, borderRadius: 12, padding: 9, borderWidth: 1, borderColor: theme.colors.border }}>
                  <Text style={{ color: theme.colors.textSoft, fontWeight: '900', fontSize: 10.5 }}>eBay low</Text>
                  <Text style={{ color: theme.colors.text, fontWeight: '900', marginTop: 3 }} numberOfLines={1}>{money(selectedProduct.product_price_low)}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: theme.colors.card, borderRadius: 12, padding: 9, borderWidth: 1, borderColor: theme.colors.border }}>
                  <Text style={{ color: theme.colors.textSoft, fontWeight: '900', fontSize: 10.5 }}>eBay high</Text>
                  <Text style={{ color: theme.colors.text, fontWeight: '900', marginTop: 3 }} numberOfLines={1}>{money(selectedProduct.product_price_high)}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: theme.colors.card, borderRadius: 12, padding: 9, borderWidth: 1, borderColor: theme.colors.border }}>
                  <Text style={{ color: theme.colors.textSoft, fontWeight: '900', fontSize: 10.5 }}>Sold comps</Text>
                  <Text style={{ color: theme.colors.text, fontWeight: '900', marginTop: 3 }} numberOfLines={1}>{selectedProduct.product_price_count ?? '--'}</Text>
                </View>
              </View>
            </View>

            <View style={{ gap: 10 }}>
              <View>
                <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 12, marginBottom: 6 }}>Sell/trade price</Text>
                <TextInput
                  value={productAskingPrice}
                  onChangeText={(value) => setProductAskingPrice(value.replace(/[^0-9.]/g, '').slice(0, 9))}
                  placeholder={`Recommended ${money(getPreferredPrice(selectedProduct))}`}
                  placeholderTextColor={theme.colors.textSoft}
                  keyboardType="decimal-pad"
                  style={{ backgroundColor: theme.colors.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: 12, paddingVertical: 11, color: theme.colors.text, fontWeight: '900' }}
                />
              </View>
              <View>
                <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 12, marginBottom: 6 }}>Quantity to add</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <TouchableOpacity onPress={() => setProductQuantity((value) => String(Math.max(1, (Number.parseInt(value, 10) || 1) - 1)))} style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.border }}>
                    <Ionicons name="remove" size={18} color={theme.colors.text} />
                  </TouchableOpacity>
                  <TextInput
                    value={productQuantity}
                    onChangeText={(value) => setProductQuantity(value.replace(/[^0-9]/g, '').slice(0, 4) || '1')}
                    keyboardType="number-pad"
                    style={{ flex: 1, textAlign: 'center', backgroundColor: theme.colors.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: 12, paddingVertical: 10, color: theme.colors.text, fontWeight: '900', fontSize: 16 }}
                  />
                  <TouchableOpacity onPress={() => setProductQuantity((value) => String((Number.parseInt(value, 10) || 1) + 1))} style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="add" size={18} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </>
        ) : null}
      </StackrBottomSheet>

      <StackrBottomSheet
        visible={stockOutPickerOpen}
        title="Choose owned copy"
        subtitle={`Pick the exact condition to ${stockOutContext === 'sale' ? 'add to this sale' : 'review before Scan Out'}.`}
        onClose={() => {
          setStockOutPickerOpen(false);
          if (stockOutContext === 'sale') setSaleOpen(true);
        }}
        maxHeight="76%"
        contentContainerStyle={{ gap: 8 }}
      >
        {stockOutCandidates.map((item) => (
          <TouchableOpacity
            key={item.id}
            onPress={() => chooseStockOutItem(item)}
            style={{ minHeight: 72, flexDirection: 'row', alignItems: 'center', padding: 9, borderRadius: 16, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }}
          >
            {item.card.image_small ? (
              <Image source={{ uri: item.card.image_small }} style={{ width: 42, height: 58, borderRadius: 6 }} resizeMode="contain" />
            ) : (
              <View style={{ width: 42, height: 58, borderRadius: 6, backgroundColor: theme.colors.card, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={item.card.is_product ? 'cube-outline' : 'albums-outline'} size={20} color={theme.colors.primary} />
              </View>
            )}
            <View style={{ flex: 1, marginLeft: 10, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ color: theme.colors.text, fontWeight: '900', fontSize: 14 }}>{item.card.name}</Text>
              <Text numberOfLines={1} style={{ color: theme.colors.textSoft, fontSize: 11.5, marginTop: 2, fontWeight: '700' }}>{item.card.set_name ?? item.card.set_id} - #{item.card.number ?? '--'}</Text>
              <Text numberOfLines={1} style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 11.5, marginTop: 4 }}>{conditionShort[item.condition]} - {item.quantity} owned - {money(getPreferredPrice(item.card))}</Text>
            </View>
            <Ionicons name="chevron-forward" size={19} color={theme.colors.textSoft} />
          </TouchableOpacity>
        ))}
      </StackrBottomSheet>

      <StackrBottomSheet
        visible={!!pendingStockOut}
        title="Confirm Scan Out"
        subtitle="Nothing is removed until you confirm."
        onClose={() => setPendingStockOut(null)}
        maxHeight="88%"
        contentContainerStyle={{ gap: 12 }}
        footer={pendingStockOut ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 10, gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity onPress={() => setPendingStockOut(null)} style={{ flex: 1, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, paddingVertical: 13, alignItems: 'center' }}>
                <Text style={{ color: theme.colors.textSoft, fontWeight: '900' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setPendingStockOut(null); scanToInventory('remove'); }} style={{ flex: 1, borderRadius: 14, borderWidth: 1, borderColor: '#FDBA74', backgroundColor: '#FFF7ED', paddingVertical: 13, alignItems: 'center' }}>
                <Text style={{ color: '#C2410C', fontWeight: '900' }}>Scan Another</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={confirmScanOut} style={{ borderRadius: 16, backgroundColor: '#DC2626', paddingVertical: 15, alignItems: 'center' }}>
              <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 15 }}>
                {getSellerStockOutRoute(pendingStockOut.reason) === 'sale-cart' ? 'Add to Out Cart' : 'Confirm Remove'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
      >
        {pendingStockOut ? (
          <>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              {pendingStockOut.item.card.image_small ? (
                <Image source={{ uri: pendingStockOut.item.card.image_small }} style={{ width: 76, height: pendingStockOut.item.card.is_product ? 76 : 106, borderRadius: 10, backgroundColor: theme.colors.surface }} resizeMode="contain" />
              ) : (
                <View style={{ width: 76, height: 106, borderRadius: 10, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={pendingStockOut.item.card.is_product ? 'cube-outline' : 'albums-outline'} size={24} color={theme.colors.primary} />
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: theme.colors.text, fontSize: 16, lineHeight: 21, fontWeight: '900' }} numberOfLines={3}>{pendingStockOut.item.card.name}</Text>
                <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 16, fontWeight: '700', marginTop: 4 }} numberOfLines={2}>
                  {pendingStockOut.item.card.set_name ?? pendingStockOut.item.card.set_id ?? 'Collection'} - #{pendingStockOut.item.card.number ?? '--'}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  <View style={{ borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }}>
                    <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '900' }}>{pendingStockOut.item.condition}</Text>
                  </View>
                  <View style={{ borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }}>
                    <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '900' }}>{pendingStockOut.item.quantity} owned</Text>
                  </View>
                </View>
              </View>
            </View>

            {pendingStockOut.item.card.inventory_binder_name ? (
              <View style={{ backgroundColor: '#FFFBEB', borderRadius: 14, borderWidth: 1, borderColor: '#FDE68A', padding: 11 }}>
                <Text style={{ color: '#92400E', fontWeight: '900', fontSize: 12.5 }}>Binder completion may change</Text>
                <Text style={{ color: '#92400E', fontWeight: '700', fontSize: 12, lineHeight: 16, marginTop: 3 }}>
                  This copy is linked to {pendingStockOut.item.card.inventory_binder_name}. Removing it can reduce binder completion.
                </Text>
              </View>
            ) : null}

            <View>
              <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 13, marginBottom: 8 }}>Reason</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {scanOutReasons.map((reason) => {
                  const active = pendingStockOut.reason === reason;
                  return (
                    <TouchableOpacity
                      key={reason}
                      onPress={() => setPendingStockOut((current) => current ? { ...current, reason } : current)}
                      style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: active ? '#FFEDD5' : theme.colors.surface, borderWidth: 1, borderColor: active ? '#FDBA74' : theme.colors.border }}
                    >
                      <Text style={{ color: active ? '#C2410C' : theme.colors.textSoft, fontWeight: '900', fontSize: 12 }}>{reason}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={{ backgroundColor: theme.colors.surface, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, padding: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 13 }}>Quantity to remove</Text>
                  <Text style={{ color: theme.colors.textSoft, fontWeight: '700', fontSize: 11, marginTop: 2 }}>Current quantity: {pendingStockOut.item.quantity}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <TouchableOpacity onPress={() => updatePendingStockOutQuantity(-1)} style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="remove" size={16} color={theme.colors.text} />
                  </TouchableOpacity>
                  <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900', minWidth: 26, textAlign: 'center' }}>{pendingStockOut.quantity}</Text>
                  <TouchableOpacity onPress={() => updatePendingStockOutQuantity(1)} style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: '#FFEDD5', borderWidth: 1, borderColor: '#FDBA74', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="add" size={16} color="#C2410C" />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 12 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                <Text style={{ color: theme.colors.textSoft, fontWeight: '900', fontSize: 12 }}>Value impact</Text>
                <Text style={{ color: '#C2410C', fontWeight: '900', fontSize: 13 }} numberOfLines={1}>
                  -{money((getPreferredPrice(pendingStockOut.item.card) ?? 0) * pendingStockOut.quantity)}
                </Text>
              </View>
            </View>
          </>
        ) : null}
      </StackrBottomSheet>

      <StackrBottomSheet
        visible={saleOpen}
        title="Out cart"
        subtitle={`${saleCart.reduce((sum, line) => sum + line.quantity, 0)} item${saleCart.reduce((sum, line) => sum + line.quantity, 0) === 1 ? '' : 's'} ready - ${money(saleEstimatedValue)} estimated`}
        onClose={() => setSaleOpen(false)}
        maxHeight="82%"
        contentContainerStyle={{ gap: 12 }}
        footer={(
          <View style={{ paddingHorizontal: 16, paddingTop: 10, gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity onPress={scanToSale} style={{ flex: 1, borderRadius: 14, borderWidth: 1, borderColor: '#D8CCFF', paddingVertical: 13, alignItems: 'center', backgroundColor: theme.colors.card }}>
                <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>Scan More</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={completeSale} style={{ flex: 1, borderRadius: 14, backgroundColor: theme.colors.primary, paddingVertical: 13, alignItems: 'center', shadowColor: theme.colors.primary, shadowOpacity: 0.20, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } }}>
                <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>Complete Sale</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      >
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1, borderRadius: 14, padding: 11, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }}>
            <Text style={{ color: theme.colors.textSoft, fontSize: 10.5, fontWeight: '900' }}>ITEMS SCANNED</Text>
            <Text style={{ color: theme.colors.primary, fontSize: 24, lineHeight: 30, fontWeight: '900', marginTop: 2 }}>{saleCart.reduce((sum, line) => sum + line.quantity, 0)}</Text>
          </View>
          <View style={{ flex: 1, borderRadius: 14, padding: 11, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }}>
            <Text style={{ color: theme.colors.textSoft, fontSize: 10.5, fontWeight: '900' }}>ESTIMATED VALUE</Text>
            <Text style={{ color: theme.colors.text, fontSize: 20, lineHeight: 26, fontWeight: '900', marginTop: 2 }} numberOfLines={1}>{money(saleEstimatedValue)}</Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {salePreviewImages.length ? salePreviewImages.map((uri, index) => (
            <Image key={`${uri}:preview:${index}`} source={{ uri }} style={{ width: 44, height: 62, borderRadius: 6, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }} resizeMode="contain" />
          )) : (
            <View style={{ minHeight: 54, borderRadius: 14, paddingHorizontal: 12, justifyContent: 'center', backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }}>
              <Text style={{ color: theme.colors.textSoft, fontWeight: '800' }}>Add owned cards to begin</Text>
            </View>
          )}
        </ScrollView>

        {saleCart.length > 0 ? (
          <View style={{ borderRadius: 16, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden' }}>
            {saleCart.map((line, index) => (
              <View key={line.item.id} style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: theme.colors.border }}>
                <Text numberOfLines={1} style={{ flex: 1, color: theme.colors.text, fontWeight: '900', fontSize: 13.5 }}>{line.item.card.name}</Text>
                <Text style={{ color: theme.colors.textSoft, fontWeight: '800', marginHorizontal: 8, fontSize: 11.5 }}>{conditionShort[line.item.condition]}</Text>
                <TouchableOpacity onPress={() => updateSaleQuantity(line.item.id, -1)} style={{ width: 28, height: 28, borderRadius: 10, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="remove" size={15} color={theme.colors.text} />
                </TouchableOpacity>
                <Text style={{ width: 28, textAlign: 'center', color: theme.colors.text, fontWeight: '900' }}>{line.quantity}</Text>
                <TouchableOpacity onPress={() => updateSaleQuantity(line.item.id, 1)} style={{ width: 28, height: 28, borderRadius: 10, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="add" size={15} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}

        <TextInput
          value={salePrice}
          onChangeText={setSalePrice}
          placeholder="Actual sold price"
          placeholderTextColor={theme.colors.textSoft}
          keyboardType="decimal-pad"
          style={{ borderRadius: 14, borderWidth: 1, borderColor: '#E3DAFF', backgroundColor: theme.colors.surface, paddingHorizontal: 14, paddingVertical: 12, color: theme.colors.text, fontWeight: '900' }}
        />
      </StackrBottomSheet>
    </SafeAreaView>
  );
}

