import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Image,
  type ImageSourcePropType,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '../Text';
import { StackrImage } from '../StackrImage';
import { StackrCardActionIcon } from '../StackrScreen';
import { StackrBottomSheet } from '../StackrModalSystem';
import { StackrProfileAvatar } from '../StackrProfileAvatar';
import { useTheme } from '../theme-context';
import { marketIcons, type MarketIconName } from '../../lib/marketIcons';
import { LIVE_COMMERCE_RELEASE_APPROVED, TRADE_CASH_TERMS_ENABLED } from '../../lib/config';
import { stackrIcons } from '../../lib/stackrIcons';
import { stackrSellCategoryIconSizes } from '../../lib/stackrSizing';

export type MarketMode = 'buy' | 'trade';
export type MarketListingVariant =
  | 'buy'
  | 'trade'
  | 'tradePlusCash'
  | 'openToOffers'
  | 'sold'
  | 'reserved'
  | 'unavailable';

export type MarketProtectionTier = 'Bronze' | 'Silver' | 'Gold';

const PROTECTION_TIER_ICONS: Record<MarketProtectionTier, ImageSourcePropType> = {
  Bronze: stackrIcons.protectionBronze,
  Silver: stackrIcons.protectionSilver,
  Gold: stackrIcons.protectionGold,
};

export type MarketListingCardData = {
  id: string;
  title: string;
  setName?: string | null;
  cardNumber?: string | null;
  language?: string | null;
  variant?: string | null;
  imageUri?: string | null;
  fullImageUri?: string | null;
  imageBadgeLabel?: string | null;
  imageIsCatalogue?: boolean;
  condition?: string | null;
  gradeCompany?: string | null;
  grade?: string | null;
  quantity?: number | null;
  price?: number | null;
  buyerTotal?: number | null;
  buyerTotalIsEstimate?: boolean;
  buyerTotalUnavailable?: boolean;
  previousPrice?: number | null;
  marketEstimate?: number | null;
  terms?: string | null;
  sellerName?: string | null;
  sellerAvatarUrl?: string | null;
  sellerUserId?: string | null;
  transactionCount?: number | null;
  verified?: boolean;
  protectionTier?: MarketProtectionTier | null;
  protectionAgreementRequired?: boolean;
  variantType: MarketListingVariant;
  saved?: boolean;
  favoriteCount?: number | null;
  inDemand?: boolean;
  isMine?: boolean;
  createdAt?: string | null;
  categoryLabel?: string | null;
  categoryImageIcon?: ImageSourcePropType;
};

const money = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value)
    ? `\u00A3${value.toFixed(2)}`
    : null;

function getVariantCopy(variant: MarketListingVariant) {
  switch (variant) {
    case 'trade':
      return { label: 'Trade', icon: marketIcons.trade };
    case 'tradePlusCash':
      return {
        label: TRADE_CASH_TERMS_ENABLED ? 'Trade + cash' : 'Trade',
        icon: marketIcons.trade,
      };
    case 'openToOffers':
      return { label: 'Open to offers', icon: marketIcons.offer };
    case 'sold':
      return { label: 'Sold', icon: marketIcons.success };
    case 'reserved':
      return { label: 'Reserved', icon: marketIcons.warning };
    case 'unavailable':
      return { label: 'Unavailable', icon: marketIcons.error };
    default:
      return {
        label: LIVE_COMMERCE_RELEASE_APPROVED ? 'Buy' : 'Offers only',
        icon: LIVE_COMMERCE_RELEASE_APPROVED ? marketIcons.buy : marketIcons.offer,
      };
  }
}

export function MarketHeader({
  incomingOfferCount,
  savedCount,
  myListingCount,
  profileAvatarUrl,
  profileAvatarPreset,
  onSaved,
  onOffers,
  onMyListings,
  onOrders,
  onProfile,
  showShortcuts = true,
}: {
  incomingOfferCount?: number;
  savedCount?: number;
  myListingCount?: number;
  profileAvatarUrl?: string | null;
  profileAvatarPreset?: string | null;
  onSaved: () => void;
  onOffers: () => void;
  onMyListings: () => void;
  onOrders: () => void;
  onProfile?: () => void;
  showShortcuts?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: 9 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{ color: theme.colors.text, fontSize: 31, lineHeight: 36, fontWeight: '900' }}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.86}
          >
            The Ma<Text style={{ color: theme.colors.primary, fontSize: 31, lineHeight: 36, fontWeight: '900' }}>rket</Text>
          </Text>
          <Text style={{ color: theme.colors.textSoft, fontSize: 12.5, lineHeight: 16, fontWeight: '800', marginTop: -1 }}>
            Buy, trade and discover cards from collectors.
          </Text>
        </View>
        <TouchableOpacity
          onPress={onProfile}
          disabled={!onProfile}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel="Open profile"
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: theme.colors.card,
            borderWidth: 1,
            borderColor: theme.colors.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <StackrProfileAvatar
            avatarUrl={profileAvatarUrl}
            avatarPreset={profileAvatarPreset}
            size={34}
            borderWidth={1}
            accessibilityLabel="Open profile"
          />
        </TouchableOpacity>
      </View>
      {showShortcuts ? (
        <MarketShortcutRow
          savedCount={savedCount}
          incomingOfferCount={incomingOfferCount}
          myListingCount={myListingCount}
          onSaved={onSaved}
          onOffers={onOffers}
          onMyListings={onMyListings}
        />
      ) : null}
    </View>
  );
}

export function MarketShortcutRow({
  savedCount,
  incomingOfferCount,
  myListingCount,
  onSaved,
  onOffers,
  onMyListings,
}: {
  savedCount?: number;
  incomingOfferCount?: number;
  myListingCount?: number;
  onSaved: () => void;
  onOffers: () => void;
  onMyListings: () => void;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, width: '100%' }}>
      <MarketQuickLink
        imageIcon={stackrIcons.favorite}
        label="Favorited"
        accessibilityLabel="Favorited listings"
        count={savedCount}
        onPress={onSaved}
      />
      <MarketQuickLink icon={marketIcons.offer} label="Offers" count={incomingOfferCount} onPress={onOffers} />
      <MarketQuickLink icon={marketIcons.sell} label="My Listings" count={myListingCount} onPress={onMyListings} />
    </View>
  );
}

function MarketQuickLink({
  icon,
  imageIcon,
  label,
  accessibilityLabel,
  count,
  onPress,
}: {
  icon?: MarketIconName;
  imageIcon?: ImageSourcePropType;
  label: string;
  accessibilityLabel?: string;
  count?: number;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const badgeLabel = count && count > 99 ? '99+' : count ? String(count) : '';
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityLabel={count && count > 0 ? `${accessibilityLabel ?? label}, ${count}` : accessibilityLabel ?? label}
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 38,
        paddingHorizontal: 8,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.72)',
        borderWidth: 1,
        borderColor: theme.colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      }}
    >
      {imageIcon ? (
        <Image
          source={imageIcon}
          resizeMode="contain"
          style={{ width: 18, height: 18, flexShrink: 0 }}
          accessibilityIgnoresInvertColors
        />
      ) : icon ? (
        <Ionicons name={icon} size={15} color={theme.colors.primary} style={{ flexShrink: 0 }} />
      ) : null}
      <Text
        style={{ color: theme.colors.text, fontWeight: '900', fontSize: 11.6, flexShrink: 1, minWidth: 0 }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.78}
      >
        {label}
      </Text>
      {count && count > 0 ? (
        <View
          style={{
            minWidth: badgeLabel.length > 2 ? 28 : 20,
            height: 18,
            borderRadius: 9,
            paddingHorizontal: badgeLabel.length > 2 ? 6 : 0,
            backgroundColor: theme.colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Text
            style={{
              color: '#FFFFFF',
              fontSize: 10,
              lineHeight: 18,
              fontWeight: '900',
              textAlign: 'center',
              includeFontPadding: false,
              textAlignVertical: 'center',
            }}
          >
            {badgeLabel}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

export function MarketModeSelector({
  value,
  onChange,
}: {
  value: MarketMode;
  onChange: (mode: MarketMode) => void;
}) {
  const { theme } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        padding: 4,
        borderRadius: 14,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      {(['buy', 'trade'] as const).map((mode) => {
        const active = value === mode;
        return (
          <TouchableOpacity
            key={mode}
            onPress={() => onChange(mode)}
            activeOpacity={0.84}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={{
              flex: 1,
              minHeight: 38,
              borderRadius: 11,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 7,
              backgroundColor: active ? theme.colors.card : 'transparent',
              borderWidth: active ? 1 : 0,
              borderColor: active ? theme.colors.border : 'transparent',
            }}
          >
            <Image
              source={mode === 'buy' ? stackrIcons.sellCard : stackrIcons.trade}
              resizeMode="contain"
              style={{
                width: 23,
                height: 23,
                opacity: active ? 1 : 0.68,
              }}
              accessibilityIgnoresInvertColors
            />
            <Text style={{ color: active ? theme.colors.text : theme.colors.textSoft, fontSize: 13, fontWeight: '900' }}>
              {mode === 'buy' ? 'Buy' : 'Trade'}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function MarketSearch({
  value,
  onChangeText,
  onClear,
  suggestion,
  onUseSuggestion,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onClear: () => void;
  suggestion?: string | null;
  onUseSuggestion?: () => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: 7 }}>
      <View
        style={{
          minHeight: 46,
          borderRadius: 14,
          backgroundColor: theme.colors.card,
          borderWidth: 1,
          borderColor: theme.colors.border,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 12,
          gap: 8,
        }}
      >
        <Ionicons name={marketIcons.search} size={18} color={theme.colors.textSoft} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder="Search cards, products, sets or sellers"
          placeholderTextColor={theme.colors.textSoft}
          autoCorrect={false}
          spellCheck={false}
          autoCapitalize="words"
          returnKeyType="search"
          accessibilityLabel="Search The Market"
          style={{
            flex: 1,
            color: theme.colors.text,
            fontSize: 14,
            fontWeight: '700',
            paddingVertical: 10,
          }}
        />
        {value.length > 0 ? (
          <TouchableOpacity
            onPress={onClear}
            accessibilityRole="button"
            accessibilityLabel="Clear Market search"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close-circle" size={18} color={theme.colors.textSoft} />
          </TouchableOpacity>
        ) : null}
      </View>
      {suggestion ? (
        <TouchableOpacity onPress={onUseSuggestion} activeOpacity={0.82} style={{ alignSelf: 'flex-start' }}>
          <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '800' }}>
            {`Search for "${suggestion}" instead`}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function MarketFilterChip({
  label,
  active,
  icon,
  imageIcon,
  disabled,
  onPress,
}: {
  label: string;
  active?: boolean;
  icon?: MarketIconName;
  imageIcon?: ImageSourcePropType;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(active), disabled: Boolean(disabled) }}
      style={{
        minHeight: 34,
        paddingHorizontal: 10,
        borderRadius: 11,
        backgroundColor: disabled
          ? theme.colors.surface
          : active
            ? theme.colors.primary + '12'
            : 'rgba(255,255,255,0.78)',
        borderWidth: 1,
        borderColor: disabled
          ? theme.colors.border
          : active
            ? theme.colors.primary + '55'
            : 'rgba(232,225,255,0.78)',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        opacity: disabled ? 0.64 : 1,
      }}
    >
      {imageIcon ? (
        <StackrCardActionIcon
          source={imageIcon}
          frameSize={stackrSellCategoryIconSizes.chipFrame - 4}
          artworkSize={stackrSellCategoryIconSizes.chipArtwork - 4}
        />
      ) : icon ? (
        <Ionicons name={icon} size={14} color={active ? theme.colors.primary : theme.colors.textSoft} />
      ) : null}
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.78}
        style={{
          color: disabled ? theme.colors.textSoft : active ? theme.colors.primary : theme.colors.text,
          fontSize: 11.8,
          lineHeight: 15,
          fontWeight: '900',
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function MarketFilterSheet({
  visible,
  title = 'Filters',
  subtitle: subtitleOverride,
  activeFilterCount,
  children,
  onClose,
  onClear,
}: {
  visible: boolean;
  title?: string;
  subtitle?: string;
  activeFilterCount?: number;
  children: React.ReactNode;
  onClose: () => void;
  onClear: () => void;
}) {
  const subtitle = subtitleOverride ?? (activeFilterCount && activeFilterCount > 0
    ? `${activeFilterCount} active`
    : 'Refine and narrow Market results.');

  return (
    <StackrBottomSheet
      visible={visible}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      onClear={onClear}
      maxHeight="76%"
    >
      {children}
    </StackrBottomSheet>
  );
}

function getListingTransaction(item: MarketListingCardData, variant: ReturnType<typeof getVariantCopy>) {
  const price = money(item.price);
  const estimate = money(item.marketEstimate);

  if (item.variantType === 'sold') {
    return { badge: 'Sold', primary: 'Sold', secondary: estimate ? `Est. market ${estimate}` : null, state: 'Unavailable' };
  }

  if (item.variantType === 'reserved' || item.variantType === 'unavailable') {
    return {
      badge: variant.label,
      primary: variant.label,
      secondary: estimate ? `Est. market ${estimate}` : null,
      state: 'No new offers',
    };
  }

  if (item.variantType === 'trade') {
    return {
      badge: 'Trade only',
      primary: 'Open to trade',
      secondary: estimate ? `Estimated trade value ${estimate}` : null,
      state: item.terms ?? 'Offer trade',
    };
  }

  if (item.variantType === 'tradePlusCash') {
    if (!TRADE_CASH_TERMS_ENABLED) {
      return {
        badge: 'Trade only',
        primary: 'Open to trade',
        secondary: estimate ? `Estimated trade value ${estimate}` : null,
        state: 'Offer trade',
      };
    }
    return {
      badge: 'Trade + cash',
      primary: item.terms ?? 'Trade + cash',
      secondary: estimate ? `Estimated trade value ${estimate}` : null,
      state: 'Propose trade',
    };
  }

  if (item.variantType === 'openToOffers') {
    return {
      badge: price ? 'Offers accepted' : 'Offers only',
      primary: price ?? 'Offers invited',
      secondary: estimate ? `Est. market ${estimate}` : null,
      state: price ? 'Make offer' : 'Make purchase offer',
    };
  }

  if (!LIVE_COMMERCE_RELEASE_APPROVED) {
    return {
      badge: 'Offers only',
      primary: 'Offers invited',
      secondary: estimate ? `Est. market ${estimate}` : null,
      state: 'Make offer',
    };
  }

  return {
    badge: price ? 'Buy now' : 'Offers only',
    primary: price ?? 'Offers invited',
    secondary: estimate ? `Est. market ${estimate}` : null,
    state: price ? 'Buy now' : 'Make purchase offer',
  };
}

function getCompactTransactionPrimary(primary: string) {
  if (primary === 'Offers invited') return 'Offers only';
  if (primary === 'Open to trade') return 'Trade';
  if (primary === 'Make purchase offer') return 'Offer';
  return primary;
}

function getLanguageLabel(language?: string | null) {
  const normalized = String(language ?? '').trim().toLowerCase();
  if (['ja', 'jp', 'jpn', 'japanese'].includes(normalized)) return 'Japanese';
  if (normalized && normalized !== 'en' && normalized !== 'english') return normalized.toUpperCase();
  return null;
}

function getListingIdentityLine(item: MarketListingCardData) {
  return [item.setName, item.cardNumber ? `#${item.cardNumber}` : null].filter(Boolean).join(' - ') || 'Collector listing';
}

function getListingConditionLine(item: MarketListingCardData) {
  if (item.gradeCompany || item.grade) {
    return [item.gradeCompany, item.grade ? `Grade ${item.grade}` : null].filter(Boolean).join(' ');
  }
  return item.condition ?? item.variant ?? null;
}

function ListingMetaPill({
  icon,
  imageIcon,
  label,
}: {
  icon?: MarketIconName;
  imageIcon?: ImageSourcePropType;
  label: string;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        minHeight: 24,
        maxWidth: '100%',
        borderRadius: 999,
        paddingHorizontal: 7,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {imageIcon ? (
        <Image
          source={imageIcon}
          resizeMode="contain"
          style={{ width: 14, height: 14, flexShrink: 0 }}
          accessibilityIgnoresInvertColors
        />
      ) : icon ? (
        <Ionicons name={icon} size={13} color={theme.colors.primary} style={{ flexShrink: 0 }} />
      ) : null}
      <Text
        style={{ color: theme.colors.text, fontSize: 10.5, lineHeight: 13, fontWeight: '900', flexShrink: 1, minWidth: 0 }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.78}
      >
        {label}
      </Text>
    </View>
  );
}

export function MarketListingCard({
  item,
  onPress,
  onSave,
  onMore,
  onSellerPress: _onSellerPress,
  compact = false,
}: {
  item: MarketListingCardData;
  onPress: () => void;
  onSave?: () => void;
  onMore?: () => void;
  onSellerPress?: () => void;
  compact?: boolean;
}) {
  const { theme } = useTheme();
  const variant = getVariantCopy(item.variantType);
  const transaction = getListingTransaction(item, variant);
  const identityLine = getListingIdentityLine(item);
  const languageLabel = getLanguageLabel(item.language);
  const conditionLine = getListingConditionLine(item);
  const detailsLine = [identityLine, languageLabel].filter(Boolean).join(' - ');
  const sellerLabel = item.isMine ? 'Your listing' : item.sellerName ?? 'Collector listing';
  const compactPrimary = getCompactTransactionPrimary(transaction.primary);
  const trustLabel = item.verified && !item.isMine ? 'Verified seller' : sellerLabel;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.84}
      accessibilityRole="button"
      accessibilityLabel={`Open listing for ${item.title}`}
      style={{
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.9)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.border,
        padding: compact ? 7 : 8,
        shadowColor: '#1B2A4B',
        shadowOpacity: 0.04,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 1,
      }}
    >
      <View>
        <StackrImage
          uri={item.imageUri}
          fullUri={item.fullImageUri}
          fallbackSource={stackrIcons.marketplace}
          contentFit="contain"
          rounded={12}
          style={{
            width: '100%',
            aspectRatio: 0.72,
            borderRadius: compact ? 11 : 12,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
          }}
          showFallbackIcon={false}
          accessibilityLabel={`${item.title} artwork`}
        />
        {item.imageBadgeLabel ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              minHeight: 24,
              borderRadius: 999,
              paddingHorizontal: 8,
              backgroundColor: 'rgba(255,255,255,0.92)',
              borderWidth: 1,
              borderColor: item.imageIsCatalogue ? theme.colors.secondary + '45' : theme.colors.primary + '35',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: item.imageIsCatalogue ? theme.colors.secondary : theme.colors.primary, fontSize: 9.5, fontWeight: '900' }}>
              {item.imageBadgeLabel}
            </Text>
          </View>
        ) : null}
        {!item.isMine && onSave ? (
          <View style={{ position: 'absolute', top: 4, right: 4 }}>
            <FavoriteButton saved={Boolean(item.saved)} onPress={onSave} floating />
          </View>
        ) : null}
      </View>

      <View style={{ gap: compact ? 4 : 5, paddingTop: compact ? 8 : 9, minHeight: compact ? 112 : 132 }}>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
          <Text style={{ flex: 1, minWidth: 0, color: theme.colors.text, fontSize: compact ? 13 : 13.5, lineHeight: compact ? 16 : 17, fontWeight: '900' }} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.78}>
            {item.title}
          </Text>
          {onMore ? (
            <TouchableOpacity
              onPress={onMore}
              accessibilityRole="button"
              accessibilityLabel="More listing actions"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{ width: 26, height: 26, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name={marketIcons.more} size={16} color={theme.colors.textSoft} />
            </TouchableOpacity>
          ) : null}
        </View>
        <Text style={{ color: theme.colors.textSoft, fontSize: 11.5, lineHeight: 15, fontWeight: '700' }} numberOfLines={1}>
          {detailsLine}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: compact ? 1 : 2 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{ color: theme.colors.text, fontSize: compact ? 16 : 17, lineHeight: compact ? 19 : 21, fontWeight: '900' }}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.72}
            >
              {compact ? compactPrimary : transaction.primary}
            </Text>
            {conditionLine ? (
              <Text style={{ color: theme.colors.textSoft, fontSize: compact ? 10.2 : 10.6, lineHeight: 14, fontWeight: '800' }} numberOfLines={1}>
                {conditionLine}
              </Text>
            ) : null}
          </View>
          <ListingMetaPill icon={variant.icon} label={transaction.badge} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: compact ? 2 : 1, minHeight: 17 }}>
          <Text style={{ flex: 1, minWidth: 0, color: theme.colors.textSoft, fontSize: compact ? 10.2 : 10.7, lineHeight: 14, fontWeight: '900' }} numberOfLines={1}>
            {trustLabel}
          </Text>
          {item.verified && !item.isMine ? <Ionicons name={marketIcons.verified} size={13} color={theme.colors.primary} /> : null}
          {item.inDemand ? <Ionicons name="flame-outline" size={13} color={theme.colors.secondary} /> : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function FavoriteButton({
  saved,
  onPress,
  floating,
}: {
  saved: boolean;
  onPress?: () => void;
  floating?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={saved ? 'Remove from favorited listings' : 'Add to favorited listings'}
      accessibilityState={{ selected: saved }}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      activeOpacity={0.78}
      style={{
        width: floating ? 40 : 44,
        height: floating ? 40 : 44,
        marginTop: floating ? 0 : -9,
        marginRight: floating ? 0 : -10,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 11,
          borderWidth: 1,
          borderColor: saved ? `${theme.colors.primary}55` : theme.colors.border,
          backgroundColor: saved ? `${theme.colors.primary}18` : 'rgba(255,255,255,0.9)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Image
          source={stackrIcons.favorite}
          resizeMode="contain"
          style={{
            width: 18,
            height: 18,
            opacity: saved ? 1 : 0.72,
          }}
          accessibilityIgnoresInvertColors
        />
      </View>
    </TouchableOpacity>
  );
}

export function SellerIdentityRow({
  avatarUrl,
  name,
  verified,
  transactionCount,
  onPress,
  trailing,
}: {
  avatarUrl?: string | null;
  name: string;
  verified?: boolean;
  transactionCount?: number | null;
  onPress?: () => void;
  trailing?: React.ReactNode;
}) {
  const { theme } = useTheme();
  const completedCount = transactionCount ?? 0;
  const historyLabel = completedCount > 0
    ? `${completedCount} completed sale${completedCount === 1 ? '' : 's'}`
    : verified
      ? 'No completed sales yet'
      : 'New seller';
  const trustLine = verified ? `Identity verified · ${historyLabel}` : historyLabel;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
      <TouchableOpacity
        onPress={onPress}
        disabled={!onPress}
        activeOpacity={0.8}
        style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 9 }}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={onPress ? `Open ${name}'s profile` : undefined}
      >
        <StackrProfileAvatar
          avatarUrl={avatarUrl}
          size={32}
          borderWidth={1}
          accessibilityLabel={`${name} profile image`}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: '900' }} numberOfLines={1}>
              {name}
            </Text>
            {verified ? <Ionicons name={marketIcons.verified} size={13} color={theme.colors.primary} /> : null}
          </View>
          <Text style={{ color: theme.colors.textSoft, fontSize: 10.5, lineHeight: 14, fontWeight: '700' }} numberOfLines={2}>
            {trustLine}
          </Text>
        </View>
      </TouchableOpacity>
      {trailing}
    </View>
  );
}

export function ProtectionBadge({
  tier,
  compact,
  iconOnly,
}: {
  tier: MarketProtectionTier;
  compact?: boolean;
  iconOnly?: boolean;
}) {
  const tone = tier === 'Gold' ? '#B7791F' : tier === 'Silver' ? '#64748B' : '#B7791F';
  const tierIcon = PROTECTION_TIER_ICONS[tier];
  return (
    <View
      style={{
        minHeight: compact ? 22 : 30,
        borderRadius: 999,
        paddingHorizontal: compact ? 8 : 10,
        backgroundColor: tone + '12',
        borderWidth: 1,
        borderColor: tone + '35',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
      }}
    >
      <Image
        source={tierIcon}
        resizeMode="contain"
        style={{ width: compact ? 15 : 21, height: compact ? 15 : 21 }}
        accessibilityIgnoresInvertColors
      />
      {!iconOnly ? (
        <Text style={{ color: tone, fontSize: compact ? 10.2 : 12, fontWeight: '900' }}>
          {compact ? tier : `${tier} protection`}
        </Text>
      ) : null}
    </View>
  );
}

export function ProtectionDetail({ tier }: { tier: MarketProtectionTier }) {
  const { theme } = useTheme();
  const body =
    tier === 'Gold'
      ? 'Enhanced review can require additional evidence where supported. Do not ship until both sides have confirmed the agreed terms.'
      : tier === 'Silver'
        ? 'Structured listing evidence is expected, including clear condition imagery before a transaction proceeds.'
        : 'Standard collector protection. Check photos, condition notes and the other collector before making an offer.';
  const checked =
    tier === 'Bronze'
      ? 'Listing identity, status and standard photos where supplied.'
      : tier === 'Silver'
        ? 'Listing identity, condition imagery and offer timeline.'
        : 'Listing identity, enhanced evidence and offer timeline where operationally available.';
  return (
    <View
      style={{
        borderRadius: 14,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        padding: 12,
        gap: 7,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '900' }}>Protection</Text>
        <ProtectionBadge tier={tier} />
      </View>
      <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 17, fontWeight: '700' }}>
        {body}
      </Text>
      <Text style={{ color: theme.colors.text, fontSize: 12, lineHeight: 17, fontWeight: '800' }}>
        Checked: {checked}
      </Text>
    </View>
  );
}

export function MarketValueSummary({
  estimatedValue,
  recentRange,
  lastUpdated,
  deliveryIncluded,
  price,
}: {
  estimatedValue?: number | null;
  recentRange?: string | null;
  lastUpdated?: string | null;
  deliveryIncluded?: boolean | null;
  price?: number | null;
}) {
  const { theme } = useTheme();
  const difference =
    typeof price === 'number' && typeof estimatedValue === 'number'
      ? price - estimatedValue
      : null;
  return (
    <View
      style={{
        borderRadius: 14,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.card,
        padding: 12,
      }}
    >
      <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '900' }}>Estimated value</Text>
      {typeof price === 'number' ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 7 }}>
          <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 16, fontWeight: '800', flex: 1 }} numberOfLines={1}>
            User listing price
          </Text>
          <Text
            style={{ color: theme.colors.text, fontSize: 13, lineHeight: 17, fontWeight: '900', maxWidth: '48%', textAlign: 'right' }}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.68}
          >
            {money(price) ?? '--'}
          </Text>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 7 }}>
        <Text style={{ color: theme.colors.text, fontSize: 21, lineHeight: 26, fontWeight: '900', flex: 1, minWidth: 0 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.58}>
          {money(estimatedValue) ?? '--'}
        </Text>
        {difference != null ? (
          <Text style={{ color: difference <= 0 ? '#047857' : '#B45309', fontSize: 12, fontWeight: '900', flexShrink: 0 }} numberOfLines={1}>
            {difference <= 0 ? 'Below estimate' : 'Above estimate'}
          </Text>
        ) : null}
      </View>
      <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 6 }}>
        {recentRange ? `Recent sales range ${recentRange}. ` : ''}
        {lastUpdated ? `Pricing data last updated ${lastUpdated}. ` : 'Pricing freshness depends on available sources. '}
        {deliveryIncluded ? 'Delivery included where stated.' : 'Delivery costs may apply.'}
      </Text>
    </View>
  );
}

export function MarketEmptyState({
  icon = marketIcons.market,
  imageIcon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon?: MarketIconName;
  imageIcon?: ImageSourcePropType;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        borderRadius: 18,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.card,
        padding: 18,
        alignItems: 'center',
        gap: 10,
      }}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 16,
          backgroundColor: theme.colors.surface,
          borderWidth: 1,
          borderColor: theme.colors.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {imageIcon ? (
          <StackrCardActionIcon
            source={imageIcon}
            frameSize={stackrSellCategoryIconSizes.emptyStateFrame}
            artworkSize={stackrSellCategoryIconSizes.emptyStateArtwork}
          />
        ) : (
          <Ionicons name={icon} size={24} color={theme.colors.primary} />
        )}
      </View>
      <Text style={{ color: theme.colors.text, fontSize: 17, lineHeight: 22, fontWeight: '900', textAlign: 'center' }}>
        {title}
      </Text>
      <Text style={{ color: theme.colors.textSoft, fontSize: 13, lineHeight: 19, fontWeight: '700', textAlign: 'center' }}>
        {body}
      </Text>
      {actionLabel && onAction ? (
        <TouchableOpacity
          onPress={onAction}
          activeOpacity={0.84}
          style={{
            minHeight: 40,
            borderRadius: 13,
            paddingHorizontal: 16,
            backgroundColor: theme.colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 2,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '900' }}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function MarketSkeleton() {
  const { theme } = useTheme();
  return (
    <View style={{ gap: 11 }}>
      {[0, 1, 2, 3].map((item) => (
        <View
          key={item}
          style={{
            borderRadius: 16,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.card,
            padding: 11,
            flexDirection: 'row',
            gap: 12,
          }}
        >
          <View style={{ width: 82, height: 114, borderRadius: 10, backgroundColor: theme.colors.surface }} />
          <View style={{ flex: 1, gap: 8, paddingTop: 3 }}>
            <View style={{ width: '78%', height: 15, borderRadius: 8, backgroundColor: theme.colors.surface }} />
            <View style={{ width: '55%', height: 12, borderRadius: 8, backgroundColor: theme.colors.surface }} />
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <View style={{ width: 58, height: 22, borderRadius: 11, backgroundColor: theme.colors.surface }} />
              <View style={{ width: 72, height: 22, borderRadius: 11, backgroundColor: theme.colors.surface }} />
            </View>
            <View style={{ width: '38%', height: 20, borderRadius: 9, backgroundColor: theme.colors.surface, marginTop: 4 }} />
            <View style={{ width: '66%', height: 11, borderRadius: 8, backgroundColor: theme.colors.surface }} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function StickyMarketActions({
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
  disabledPrimary,
  busy,
}: {
  primaryLabel: string;
  secondaryLabel?: string;
  onPrimary: () => void;
  onSecondary?: () => void;
  disabledPrimary?: boolean;
  busy?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        backgroundColor: theme.colors.card,
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 16,
        flexDirection: 'row',
        gap: 10,
      }}
    >
      {secondaryLabel && onSecondary ? (
        <TouchableOpacity
          onPress={onSecondary}
          activeOpacity={0.84}
          style={{
            flex: 1,
            minHeight: 46,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '900' }}>{secondaryLabel}</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        onPress={onPrimary}
        disabled={disabledPrimary || busy}
        activeOpacity={0.84}
        style={{
          flex: 1,
          minHeight: 46,
          borderRadius: 14,
          backgroundColor: theme.colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabledPrimary || busy ? 0.55 : 1,
        }}
      >
        {busy ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '900' }}>{primaryLabel}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
