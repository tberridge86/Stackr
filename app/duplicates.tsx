import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StackrBackdrop } from '../components/StackrBackdrop';
import { StackrBackButton } from '../components/StackrBackButton';
import { StackrButton, StackrIconButton } from '../components/StackrControls';
import { StackrImage } from '../components/StackrImage';
import { StackrPageTitle } from '../components/StackrScreen';
import { StackrEmptyState, StackrErrorState, StackrSkeleton } from '../components/StackrStates';
import { Text } from '../components/Text';
import { useTheme } from '../components/theme-context';
import {
  fetchBinderCards,
  fetchBinders,
  type BinderCardRecord,
  type BinderRecord,
} from '../lib/binders';
import { USD_TO_GBP } from '../lib/config';
import { getIncrementalListWindow } from '../lib/performance';
import { getDisplaySetName } from '../lib/setDisplay';
import { stackrCardImageSizes, stackrTabContentPadding } from '../lib/stackrSizing';
import { numericTextStyle } from '../lib/typography';

type DuplicateListItem = {
  cardId: string;
  setId: string | null;
  name: string;
  setName: string;
  cardNumber: string | null;
  imageUrl: string | null;
  totalOwned: number;
  duplicateCopies: number;
  valuePerCard: number | null;
  duplicateValue: number;
  binderNames: string[];
  createdAt: string | null;
  condition: string | null;
};

type BinderGroup = {
  binder: BinderRecord;
  cards: BinderCardRecord[];
};

type ViewMode = 'grid' | 'list';
type SortKey = 'most' | 'highest' | 'name' | 'set' | 'recent' | 'lowest';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'most', label: 'Most duplicates' },
  { key: 'highest', label: 'Highest duplicate value' },
  { key: 'name', label: 'Card name' },
  { key: 'set', label: 'Set' },
  { key: 'recent', label: 'Recently added' },
  { key: 'lowest', label: 'Lowest value' },
];

const getOwnedQuantity = (card: BinderCardRecord) =>
  card.owned ? Math.max(1, Number(card.owned_quantity ?? 1)) : 0;

const getCardImageUrl = (card: BinderCardRecord): string | null =>
  card.image_url ??
  card.card?.images?.small ??
  card.card?.images?.large ??
  card.card?.raw_data?.images?.small ??
  null;

const getCardDisplayName = (card: BinderCardRecord) =>
  card.card_name ?? card.card?.name ?? card.card?.raw_data?.name ?? card.card_id ?? 'Unknown card';

const getCardSetName = (card: BinderCardRecord) =>
  getDisplaySetName({
    setId: card.set_id,
    setName: card.set_name,
    set: card.card?.set,
    rawData: card.card?.raw_data,
  });

const getCardNumber = (card: BinderCardRecord) =>
  card.card_number ??
  card.card?.number ??
  card.card?.raw_data?.number ??
  null;

const getCurrentTcgPriceGbp = (card: BinderCardRecord): number | null => {
  const prices = card.card?.tcgplayer?.prices ?? card.card?.raw_data?.tcgplayer?.prices;
  if (!prices) return null;

  for (const value of Object.values(prices) as any[]) {
    const price = value?.market ?? value?.mid ?? value?.low;
    if (typeof price === 'number' && Number.isFinite(price) && price > 0) {
      return Math.round(price * USD_TO_GBP * 100) / 100;
    }
  }

  return null;
};

const getCardPrice = (card: BinderCardRecord): number | null => {
  const current = getCurrentTcgPriceGbp(card);
  if (current != null) return current;

  const fallback = [card.tcg_price, card.ebay_price, card.cardmarket_price].find(
    (value) => typeof value === 'number' && Number.isFinite(value) && value > 0
  );

  return fallback ?? null;
};

const formatMoney = (value: number) => `\u00A3${value.toFixed(value >= 1000 ? 0 : 2)}`;

const getLatestDate = (current: string | null, next: string | null | undefined) => {
  if (!next) return current;
  if (!current) return next;
  return new Date(next).getTime() > new Date(current).getTime() ? next : current;
};

const buildDuplicates = (groups: BinderGroup[]): DuplicateListItem[] => {
  const duplicateMap = new Map<string, DuplicateListItem>();

  for (const { binder, cards } of groups) {
    for (const card of cards) {
      const totalOwned = getOwnedQuantity(card);
      const duplicateCopies = Math.max(0, totalOwned - 1);
      if (!duplicateCopies) continue;

      const key = `${card.set_id ?? ''}:${card.card_id}`;
      const valuePerCard = getCardPrice(card);
      const duplicateValue = valuePerCard == null ? 0 : valuePerCard * duplicateCopies;
      const current = duplicateMap.get(key);

      if (current) {
        current.totalOwned += totalOwned;
        current.duplicateCopies += duplicateCopies;
        current.duplicateValue += duplicateValue;
        current.createdAt = getLatestDate(current.createdAt, card.created_at);
        if (current.valuePerCard == null && valuePerCard != null) current.valuePerCard = valuePerCard;
        if (!current.binderNames.includes(binder.name)) current.binderNames.push(binder.name);
        continue;
      }

      duplicateMap.set(key, {
        cardId: card.card_id,
        setId: card.set_id,
        name: getCardDisplayName(card),
        setName: getCardSetName(card),
        cardNumber: getCardNumber(card),
        imageUrl: getCardImageUrl(card),
        totalOwned,
        duplicateCopies,
        valuePerCard,
        duplicateValue,
        binderNames: [binder.name],
        createdAt: card.created_at ?? null,
        condition: card.condition ?? null,
      });
    }
  }

  return [...duplicateMap.values()];
};

const sortDuplicates = (items: DuplicateListItem[], sortKey: SortKey) => {
  const sorted = [...items];
  sorted.sort((a, b) => {
    if (sortKey === 'most') return b.duplicateCopies - a.duplicateCopies || a.name.localeCompare(b.name);
    if (sortKey === 'highest') return b.duplicateValue - a.duplicateValue || b.duplicateCopies - a.duplicateCopies;
    if (sortKey === 'lowest') return a.duplicateValue - b.duplicateValue || a.name.localeCompare(b.name);
    if (sortKey === 'name') return a.name.localeCompare(b.name);
    if (sortKey === 'set') return a.setName.localeCompare(b.setName) || a.name.localeCompare(b.name);
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime || a.name.localeCompare(b.name);
  });
  return sorted;
};

const getItemValueLabel = (item: DuplicateListItem) =>
  item.valuePerCard == null
    ? 'Value unavailable'
    : `${formatMoney(item.duplicateValue)} duplicate value`;

const getCardDetailRoute = (item: DuplicateListItem) => ({
  pathname: '/card/[id]',
  params: { id: item.cardId, setId: item.setId ?? undefined },
} as const);

function SummaryMetric({
  value,
  label,
  align = 'flex-start',
}: {
  value: string;
  label: string;
  align?: 'flex-start' | 'center' | 'flex-end';
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.summaryMetric, { alignItems: align }]}>
      <Text numeric style={[styles.summaryMetricValue, { color: theme.colors.primary }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.summaryMetricLabel, { color: theme.colors.textSoft }]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

function DuplicatesSummaryCard({
  duplicateCopies,
  uniqueCards,
  duplicateValue,
  hasValue,
}: {
  duplicateCopies: number;
  uniqueCards: number;
  duplicateValue: number;
  hasValue: boolean;
}) {
  const { theme } = useTheme();
  return (
    <View
      accessibilityRole="summary"
      style={[styles.summaryCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
    >
      <SummaryMetric
        value={String(duplicateCopies)}
        label={`${duplicateCopies === 1 ? 'duplicate copy' : 'duplicate copies'}`}
      />
      <View style={[styles.summaryDivider, { backgroundColor: theme.colors.border }]} />
      <SummaryMetric
        value={String(uniqueCards)}
        label={`${uniqueCards === 1 ? 'unique card' : 'unique cards'}`}
        align="center"
      />
      <View style={[styles.summaryDivider, { backgroundColor: theme.colors.border }]} />
      <SummaryMetric
        value={hasValue ? formatMoney(duplicateValue) : '--'}
        label={hasValue ? 'estimated duplicate value' : 'value unavailable'}
        align="flex-end"
      />
    </View>
  );
}

function DuplicateQuantitySummary({ item }: { item: DuplicateListItem }) {
  const { theme } = useTheme();
  return (
    <View style={styles.quantityRow}>
      <View style={[styles.quantityPill, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <Text numeric style={[styles.quantityText, { color: theme.colors.text }]}>
          {item.totalOwned} owned
        </Text>
      </View>
      <View style={[styles.quantityPill, { backgroundColor: theme.colors.primary + '12', borderColor: theme.colors.primary + '35' }]}>
        <Text numeric style={[styles.quantityText, { color: theme.colors.primary }]}>
          {item.duplicateCopies} {item.duplicateCopies === 1 ? 'duplicate' : 'duplicates'}
        </Text>
      </View>
    </View>
  );
}

function DuplicateValueSummary({ item, compact = false }: { item: DuplicateListItem; compact?: boolean }) {
  const { theme } = useTheme();
  if (item.valuePerCard == null) {
    return (
      <Text style={[compact ? styles.listValueText : styles.valueUnavailable, { color: theme.colors.textSoft }]}>
        Value unavailable
      </Text>
    );
  }

  return (
    <View style={compact ? styles.listValueBlock : styles.valueBlock}>
      <Text numeric style={[compact ? styles.listValueText : styles.valueEach, { color: theme.colors.text }]}>
        {formatMoney(item.valuePerCard)} each
      </Text>
      <Text numeric style={[compact ? styles.listDuplicateValue : styles.valueTotal, { color: theme.colors.primary }]}>
        {formatMoney(item.duplicateValue)} duplicate value
      </Text>
    </View>
  );
}

function StopPropagationPressable({
  children,
  onPress,
  accessibilityLabel,
  style,
}: {
  children: React.ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.78}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={(event: GestureResponderEvent) => {
        event.stopPropagation();
        onPress();
      }}
      style={style}
    >
      {children}
    </TouchableOpacity>
  );
}

function DuplicateCardTile({
  item,
  width,
  onOpenActions,
  onViewCard,
}: {
  item: DuplicateListItem;
  width: number;
  onOpenActions: (item: DuplicateListItem) => void;
  onViewCard: (item: DuplicateListItem) => void;
}) {
  const { theme } = useTheme();
  const valueLabel = getItemValueLabel(item);

  return (
    <TouchableOpacity
      activeOpacity={0.84}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}. ${item.totalOwned} owned. ${item.duplicateCopies} duplicate ${item.duplicateCopies === 1 ? 'copy' : 'copies'}. ${valueLabel}. Tap to view card.`}
      onPress={() => onViewCard(item)}
      style={[
        styles.gridTile,
        {
          width,
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <View style={[styles.cardImageFrame, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <StackrImage
          uri={item.imageUrl}
          contentFit="contain"
          priority="normal"
          rounded={14}
          style={styles.cardImage}
          accessibilityLabel={`${item.name} card artwork`}
        />
        <StopPropagationPressable
          onPress={() => onOpenActions(item)}
          accessibilityLabel={`Manage ${item.name}`}
          style={[styles.tileOverflow, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
        >
          <Ionicons name="ellipsis-horizontal" size={18} color={theme.colors.text} />
        </StopPropagationPressable>
      </View>

      <Text style={[styles.tileName, { color: theme.colors.text }]} numberOfLines={2}>
        {item.name}
      </Text>
      <Text style={[styles.tileSet, { color: theme.colors.textSoft }]} numberOfLines={2}>
        {item.cardNumber ? `${item.setName} · ${item.cardNumber}` : item.setName}
      </Text>

      <DuplicateQuantitySummary item={item} />
      <DuplicateValueSummary item={item} />

      <StopPropagationPressable
        onPress={() => onOpenActions(item)}
        accessibilityLabel={`Manage ${item.name}`}
        style={[styles.manageButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
      >
        <Ionicons name="options-outline" size={18} color={theme.colors.text} />
        <Text style={[styles.manageButtonText, { color: theme.colors.text }]}>Manage</Text>
      </StopPropagationPressable>
    </TouchableOpacity>
  );
}

function DuplicateListRow({
  item,
  onOpenActions,
  onViewCard,
}: {
  item: DuplicateListItem;
  onOpenActions: (item: DuplicateListItem) => void;
  onViewCard: (item: DuplicateListItem) => void;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      activeOpacity={0.84}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}. ${item.totalOwned} owned. ${item.duplicateCopies} duplicate ${item.duplicateCopies === 1 ? 'copy' : 'copies'}. ${getItemValueLabel(item)}. Tap to view card.`}
      onPress={() => onViewCard(item)}
      style={[styles.listRow, { borderBottomColor: theme.colors.border }]}
    >
      <StackrImage
        uri={item.imageUrl}
        contentFit="contain"
        rounded={12}
        style={[styles.listImage, { backgroundColor: theme.colors.surface }]}
        accessibilityLabel={`${item.name} card artwork`}
      />
      <View style={styles.listCopy}>
        <Text style={[styles.listName, { color: theme.colors.text }]} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={[styles.listSet, { color: theme.colors.textSoft }]} numberOfLines={2}>
          {item.cardNumber ? `${item.setName} · ${item.cardNumber}` : item.setName}
        </Text>
        <Text numeric style={[styles.listQuantity, { color: theme.colors.primary }]} numberOfLines={1}>
          {item.totalOwned} owned · {item.duplicateCopies} {item.duplicateCopies === 1 ? 'duplicate' : 'duplicates'}
        </Text>
      </View>
      <DuplicateValueSummary item={item} compact />
      <StopPropagationPressable
        onPress={() => onOpenActions(item)}
        accessibilityLabel={`Manage ${item.name}`}
        style={styles.listOverflow}
      >
        <Ionicons name="ellipsis-horizontal" size={20} color={theme.colors.textSoft} />
      </StopPropagationPressable>
    </TouchableOpacity>
  );
}

function DuplicatesSkeleton() {
  const { width } = useWindowDimensions();
  const tileWidth = Math.floor((width - 36 - 12) / 2);
  return (
    <View style={styles.loadingWrap}>
      <StackrSkeleton height={96} style={styles.summarySkeleton} />
      <StackrSkeleton height={44} style={styles.utilitySkeleton} />
      <View style={styles.skeletonGrid}>
        {Array.from({ length: 6 }).map((_, index) => (
          <StackrSkeleton key={index} height={272} style={[styles.tileSkeleton, { width: tileWidth }]} />
        ))}
      </View>
    </View>
  );
}

function SortSheet({
  visible,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selected: SortKey;
  onSelect: (sort: SortKey) => void;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable
          accessibilityViewIsModal
          style={[styles.bottomSheet, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
        >
          <View style={styles.sheetHandle} />
          <Text style={[styles.sheetTitle, { color: theme.colors.text }]}>Sort duplicates</Text>
          {SORT_OPTIONS.map((option) => {
            const isSelected = option.key === selected;
            return (
              <TouchableOpacity
                key={option.key}
                activeOpacity={0.78}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                onPress={() => {
                  onSelect(option.key);
                  onClose();
                }}
                style={[styles.sheetOption, isSelected && { backgroundColor: theme.colors.primary + '12' }]}
              >
                <Text style={[styles.sheetOptionText, { color: isSelected ? theme.colors.primary : theme.colors.text }]}>
                  {option.label}
                </Text>
                {isSelected ? <Ionicons name="checkmark-circle" size={20} color={theme.colors.primary} /> : null}
              </TouchableOpacity>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function DuplicateActionsSheet({
  item,
  onClose,
  onViewCard,
  onCreateListing,
}: {
  item: DuplicateListItem | null;
  onClose: () => void;
  onViewCard: (item: DuplicateListItem) => void;
  onCreateListing: (item: DuplicateListItem) => void;
}) {
  const { theme } = useTheme();
  return (
    <Modal visible={Boolean(item)} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable
          accessibilityViewIsModal
          style={[styles.bottomSheet, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
        >
          {item ? (
            <>
              <View style={styles.sheetHandle} />
              <View style={styles.actionHeader}>
                <StackrImage
                  uri={item.imageUrl}
                  contentFit="contain"
                  rounded={10}
                  style={[styles.actionImage, { backgroundColor: theme.colors.surface }]}
                  accessibilityLabel={`${item.name} card artwork`}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.sheetTitle, { color: theme.colors.text }]} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <Text style={[styles.sheetSubtitle, { color: theme.colors.textSoft }]} numberOfLines={1}>
                    {item.totalOwned} owned · {item.duplicateCopies} {item.duplicateCopies === 1 ? 'duplicate' : 'duplicates'}
                  </Text>
                </View>
              </View>

              <View style={styles.actionGroup}>
                <StackrButton
                  label="Create listing"
                  variant="primary"
                  icon="storefront-outline"
                  onPress={() => onCreateListing(item)}
                />
                <StackrButton
                  label="View card"
                  variant="secondary"
                  icon="albums-outline"
                  onPress={() => onViewCard(item)}
                />
              </View>
              <Text style={[styles.sheetFootnote, { color: theme.colors.textSoft }]}>
                More actions will appear here when listing, trade or inventory status is available for this card.
              </Text>
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function DuplicatesScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [items, setItems] = useState<DuplicateListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [sortKey, setSortKey] = useState<SortKey>('most');
  const [sortSheetOpen, setSortSheetOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<DuplicateListItem | null>(null);
  const isGrid = viewMode === 'grid';
  const duplicateWindow = useMemo(
    () => getIncrementalListWindow(isGrid ? 2 : 1, {
      initialRows: isGrid ? 7 : 12,
      pageRows: isGrid ? 5 : 10,
      minInitial: isGrid ? 14 : 12,
      minPage: isGrid ? 10 : 10,
    }),
    [isGrid]
  );
  const [visibleItemCount, setVisibleItemCount] = useState(duplicateWindow.initialCount);

  const summary = useMemo(() => ({
    duplicateCopies: items.reduce((sum, item) => sum + item.duplicateCopies, 0),
    uniqueCards: items.length,
    duplicateValue: items.reduce((sum, item) => sum + item.duplicateValue, 0),
    hasValue: items.some((item) => item.valuePerCard != null),
  }), [items]);

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = query
      ? items.filter((item) =>
          [
            item.name,
            item.setName,
            item.cardNumber ?? '',
            item.binderNames.join(' '),
          ].join(' ').toLowerCase().includes(query)
        )
      : items;

    return sortDuplicates(filtered, sortKey);
  }, [items, searchQuery, sortKey]);

  const sortLabel = SORT_OPTIONS.find((option) => option.key === sortKey)?.label ?? 'Sort';
  const tileWidth = Math.floor((width - 36 - 12) / 2);
  useEffect(() => {
    setVisibleItemCount(Math.min(filteredItems.length, duplicateWindow.initialCount));
  }, [duplicateWindow.initialCount, filteredItems.length, searchQuery, sortKey, viewMode]);

  const visibleItems = useMemo(
    () => filteredItems.slice(0, visibleItemCount),
    [filteredItems, visibleItemCount]
  );
  const hasMoreDuplicateItems = visibleItemCount < filteredItems.length;
  const renderMoreDuplicateItems = useCallback(() => {
    setVisibleItemCount((current) => Math.min(filteredItems.length, current + duplicateWindow.pageSize));
  }, [duplicateWindow.pageSize, filteredItems.length]);

  const loadDuplicates = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const binders = await fetchBinders();
      const groups = await Promise.all(
        binders.map(async (binder) => ({
          binder,
          cards: await fetchBinderCards(binder.id),
        }))
      );

      setItems(buildDuplicates(groups));
    } catch (loadError) {
      console.log('Failed to load duplicate list', loadError);
      setError('We couldn’t load your extra cards.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadDuplicates();
    }, [loadDuplicates])
  );

  const viewCard = useCallback((item: DuplicateListItem) => {
    setSelectedItem(null);
    router.push(getCardDetailRoute(item));
  }, []);

  const createListing = useCallback((item: DuplicateListItem) => {
    setSelectedItem(null);
    router.push({
      pathname: '/listing/new',
      params: { cardId: item.cardId, setId: item.setId ?? undefined },
    });
  }, []);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <StackrBackdrop />

      <View style={styles.header}>
        <StackrBackButton onPress={() => router.back()} />
        <View style={styles.headerCopy}>
          <StackrPageTitle title="Duplicates" accentText="cates" />
          <Text style={[styles.subtitle, { color: theme.colors.textSoft }]}>Extra cards in your collection</Text>
        </View>
        <StackrIconButton
          icon={searchOpen ? 'close-outline' : 'search-outline'}
          label={searchOpen ? 'Close duplicate search' : 'Search duplicates'}
          selected={searchOpen}
          onPress={() => {
            setSearchOpen((open) => !open);
            if (searchOpen) setSearchQuery('');
          }}
        />
      </View>

      {searchOpen ? (
        <View style={[styles.searchWrap, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <Ionicons name="search-outline" size={18} color={theme.colors.textSoft} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search cards, sets or binders"
            placeholderTextColor={theme.colors.textSoft}
            autoCorrect={false}
            style={[styles.searchInput, { color: theme.colors.text }]}
            accessibilityLabel="Search duplicates"
            returnKeyType="search"
          />
          {searchQuery ? (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              accessibilityRole="button"
              accessibilityLabel="Clear duplicate search"
              style={styles.clearSearchButton}
            >
              <Ionicons name="close-circle" size={18} color={theme.colors.textSoft} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {loading ? (
        <DuplicatesSkeleton />
      ) : error && items.length === 0 ? (
        <View style={styles.stateWrap}>
          <StackrErrorState
            title="Duplicates unavailable"
            body={error}
            actionLabel="Try again"
            onAction={() => loadDuplicates(true)}
          />
        </View>
      ) : (
        <>
          <View style={styles.fixedContent}>
            <DuplicatesSummaryCard {...summary} />
            <View style={styles.utilityRow}>
              <TouchableOpacity
                activeOpacity={0.78}
                onPress={() => setSortSheetOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={`Sort duplicates. Current sort: ${sortLabel}`}
                style={[styles.sortControl, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
              >
                <Text style={[styles.sortText, { color: theme.colors.text }]} numberOfLines={1}>
                  Sort: {sortLabel}
                </Text>
                <Ionicons name="chevron-down" size={18} color={theme.colors.primary} />
              </TouchableOpacity>
              <View style={[styles.viewToggle, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
                <TouchableOpacity
                  activeOpacity={0.78}
                  onPress={() => setViewMode('grid')}
                  accessibilityRole="button"
                  accessibilityLabel="Grid view"
                  accessibilityState={{ selected: viewMode === 'grid' }}
                  style={[styles.viewToggleButton, viewMode === 'grid' && { backgroundColor: theme.colors.primary + '14' }]}
                >
                  <Ionicons name="grid-outline" size={19} color={viewMode === 'grid' ? theme.colors.primary : theme.colors.textSoft} />
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.78}
                  onPress={() => setViewMode('list')}
                  accessibilityRole="button"
                  accessibilityLabel="List view"
                  accessibilityState={{ selected: viewMode === 'list' }}
                  style={[styles.viewToggleButton, viewMode === 'list' && { backgroundColor: theme.colors.primary + '14' }]}
                >
                  <Ionicons name="list-outline" size={21} color={viewMode === 'list' ? theme.colors.primary : theme.colors.textSoft} />
                </TouchableOpacity>
              </View>
            </View>
            {error ? (
              <View style={[styles.inlineError, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
                <Ionicons name="alert-circle-outline" size={17} color={theme.colors.semantic.warning} />
                <Text style={[styles.inlineErrorText, { color: theme.colors.text }]}>
                  Showing cached duplicates. Pull to refresh or try again.
                </Text>
              </View>
            ) : null}
          </View>

          <FlatList
            key={viewMode}
            data={visibleItems}
            keyExtractor={(item) => `${item.setId ?? 'set'}:${item.cardId}`}
            numColumns={isGrid ? 2 : 1}
            columnWrapperStyle={isGrid ? styles.gridRow : undefined}
            scrollEventThrottle={32}
            initialNumToRender={isGrid ? 8 : 10}
            maxToRenderPerBatch={isGrid ? 6 : 10}
            updateCellsBatchingPeriod={50}
            windowSize={7}
            removeClippedSubviews
            onEndReached={hasMoreDuplicateItems ? renderMoreDuplicateItems : undefined}
            onEndReachedThreshold={0.8}
            contentContainerStyle={[
              visibleItems.length ? (isGrid ? styles.gridListContent : styles.listContent) : styles.emptyContent,
              { paddingBottom: insets.bottom + stackrTabContentPadding.standard },
            ]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => loadDuplicates(true)}
                tintColor={theme.colors.primary}
              />
            }
            ListEmptyComponent={
              <StackrEmptyState
                icon={searchQuery ? 'search-outline' : 'copy-outline'}
                title={searchQuery ? 'No matches found' : 'No duplicates yet'}
                body={searchQuery ? 'Try a different card, set or binder name.' : 'Extra copies you scan or add will appear here.'}
                actionLabel={searchQuery ? 'Clear search' : 'Scan cards'}
                onAction={searchQuery ? () => setSearchQuery('') : () => router.push('/scan')}
                secondaryLabel={searchQuery ? undefined : 'Browse collection'}
                onSecondaryAction={searchQuery ? undefined : () => router.push('/(tabs)/binder')}
              />
            }
            renderItem={({ item }) => (
              isGrid ? (
                <DuplicateCardTile
                  item={item}
                  width={tileWidth}
                  onOpenActions={setSelectedItem}
                  onViewCard={viewCard}
                />
              ) : (
                <DuplicateListRow
                  item={item}
                  onOpenActions={setSelectedItem}
                  onViewCard={viewCard}
                />
              )
            )}
            ListFooterComponent={hasMoreDuplicateItems ? (
              <View style={styles.batchFooter}>
                <ActivityIndicator color={theme.colors.primary} size="small" />
              </View>
            ) : null}
          />
        </>
      )}

      <SortSheet
        visible={sortSheetOpen}
        selected={sortKey}
        onSelect={setSortKey}
        onClose={() => setSortSheetOpen(false)}
      />
      <DuplicateActionsSheet
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onViewCard={viewCard}
        onCreateListing={createListing}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 10,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '800',
    marginTop: 1,
  },
  searchWrap: {
    minHeight: 46,
    marginHorizontal: 18,
    marginBottom: 10,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    minHeight: 44,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
    paddingVertical: 0,
  },
  clearSearchButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -12,
  },
  fixedContent: {
    paddingHorizontal: 18,
  },
  summaryCard: {
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#6136F5',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  summaryMetric: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  summaryMetricValue: {
    ...numericTextStyle,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '900',
  },
  summaryMetricLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
  },
  summaryDivider: {
    width: 1,
    height: 42,
    marginHorizontal: 10,
    opacity: 0.82,
  },
  utilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 12,
    paddingBottom: 10,
  },
  sortControl: {
    flex: 1,
    minHeight: 44,
    borderRadius: 15,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sortText: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
  },
  viewToggle: {
    minHeight: 44,
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 3,
  },
  viewToggleButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineError: {
    borderWidth: 1,
    borderRadius: 15,
    padding: 10,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inlineErrorText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  listContent: {
    paddingHorizontal: 18,
    paddingTop: 2,
  },
  gridListContent: {
    paddingHorizontal: 18,
    paddingTop: 4,
    rowGap: 16,
  },
  emptyContent: {
    flexGrow: 1,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  gridRow: {
    gap: 12,
  },
  gridTile: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 10,
    shadowColor: '#1A1640',
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  cardImageFrame: {
    width: '100%',
    aspectRatio: stackrCardImageSizes.cardAspectRatio,
    borderRadius: 16,
    borderWidth: 1,
    padding: 6,
    position: 'relative',
  },
  cardImage: {
    flex: 1,
    borderRadius: 14,
  },
  tileOverflow: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 44,
    height: 44,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileName: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
    marginTop: 10,
  },
  tileSet: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    marginTop: 3,
  },
  quantityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 9,
  },
  quantityPill: {
    minHeight: 28,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
  },
  valueBlock: {
    gap: 2,
    marginTop: 9,
  },
  valueEach: {
    ...numericTextStyle,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  valueTotal: {
    ...numericTextStyle,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
  },
  valueUnavailable: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    marginTop: 9,
  },
  manageButton: {
    marginTop: 10,
    minHeight: 44,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  manageButtonText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
  },
  listRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    minHeight: 132,
  },
  listImage: {
    width: 78,
    height: 110,
  },
  listCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  listName: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
  },
  listSet: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  listQuantity: {
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: '900',
  },
  listValueBlock: {
    width: 96,
    alignItems: 'flex-end',
    gap: 2,
  },
  listValueText: {
    ...numericTextStyle,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    textAlign: 'right',
  },
  listDuplicateValue: {
    ...numericTextStyle,
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: '900',
    textAlign: 'right',
  },
  listOverflow: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -10,
  },
  loadingWrap: {
    paddingHorizontal: 18,
    gap: 12,
  },
  summarySkeleton: {
    borderRadius: 20,
  },
  utilitySkeleton: {
    borderRadius: 15,
  },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingTop: 2,
  },
  tileSkeleton: {
    borderRadius: 20,
  },
  stateWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  batchFooter: {
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(8, 12, 31, 0.36)',
  },
  bottomSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    paddingTop: 10,
    paddingHorizontal: 18,
    paddingBottom: 28,
    gap: 12,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 46,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(105,56,245,0.22)',
    marginBottom: 4,
  },
  sheetTitle: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900',
  },
  sheetSubtitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    marginTop: 2,
  },
  sheetOption: {
    minHeight: 48,
    borderRadius: 16,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetOptionText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
  },
  actionHeader: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  actionImage: {
    width: 52,
    height: 74,
  },
  actionGroup: {
    gap: 10,
  },
  sheetFootnote: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
});
