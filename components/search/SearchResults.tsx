import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  type ImageSourcePropType,
  ScrollView,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '../Text';
import { StackrImage } from '../StackrImage';
import { enforceSetVisualRuntimePolicy } from '../../lib/providerSetMarkRuntimePolicy';
import { StackrCardActionIcon } from '../StackrScreen';
import { useTheme } from '../theme-context';
import { RARITY_SYMBOL_CARD_OVERLAY, RaritySymbol } from '../RaritySymbol';
import { searchIcons, type SearchIconName } from '../../lib/searchIcons';
import { stackrIcons } from '../../lib/stackrIcons';
import { stackrSellCategoryIconSizes } from '../../lib/stackrSizing';

const money = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value)
    ? `\u00A3${value.toFixed(2)}`
    : null;

export function SearchCategoryChip({
  label,
  icon,
  imageIcon,
  active,
  onPress,
}: {
  label: string;
  icon: SearchIconName;
  imageIcon?: ImageSourcePropType;
  active: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.82}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={{
        minHeight: 34,
        paddingHorizontal: 10,
        borderRadius: 11,
        borderWidth: 1,
        borderColor: active ? theme.colors.primary + '55' : theme.colors.border,
        backgroundColor: active ? theme.colors.primary + '12' : theme.colors.card,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {imageIcon ? (
        <StackrCardActionIcon
          source={imageIcon}
          frameSize={stackrSellCategoryIconSizes.chipFrame}
          artworkSize={stackrSellCategoryIconSizes.chipArtwork}
        />
      ) : (
        <Ionicons name={icon} size={15} color={active ? theme.colors.primary : theme.colors.textSoft} />
      )}
      <Text
        numberOfLines={1}
        ellipsizeMode="tail"
        style={{
          color: active ? theme.colors.primary : theme.colors.text,
          fontSize: 12,
          lineHeight: 15,
          fontWeight: '900',
          maxWidth: 118,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function SearchResultSection({
  title,
  count,
  children,
  onViewAll,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
  onViewAll?: () => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: 9, marginBottom: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 7 }}>
          <Text style={{ color: theme.colors.text, fontSize: 17, lineHeight: 22, fontWeight: '900' }}>
            {title}
          </Text>
          {count != null ? (
            <Text style={{ color: theme.colors.textSoft, fontSize: 11.5, fontWeight: '800' }}>
              {count}
            </Text>
          ) : null}
        </View>
        {onViewAll ? (
          <TouchableOpacity onPress={onViewAll} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '900' }}>View all</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={{ gap: 9 }}>{children}</View>
    </View>
  );
}

export function SearchRailSection({
  title,
  count,
  children,
  onViewAll,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
  onViewAll?: () => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: 10, marginBottom: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'baseline', gap: 7 }}>
          <Text style={{ color: theme.colors.text, fontSize: 17, lineHeight: 22, fontWeight: '900' }}>
            {title}
          </Text>
          {count != null ? (
            <Text style={{ color: theme.colors.textSoft, fontSize: 11.5, fontWeight: '800' }}>
              {count}
            </Text>
          ) : null}
        </View>
        {onViewAll ? (
          <TouchableOpacity onPress={onViewAll} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '900' }}>View all</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10, paddingRight: 12 }}
      >
        {children}
      </ScrollView>
    </View>
  );
}

export function SearchCardRailItem({
  name,
  imageUri,
  setName,
  setLogoUri,
  number,
  rarity,
  estimatedValue,
  listingCount,
  ownedQuantity,
  onPress,
}: {
  name: string;
  imageUri?: string | null;
  setName?: string | null;
  setLogoUri?: string | null;
  number?: string | null;
  rarity?: string | null;
  estimatedValue?: number | null;
  listingCount?: number;
  ownedQuantity?: number;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const estimate = money(estimatedValue);
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.84}
      accessibilityRole="button"
      accessibilityLabel={`Open card ${name}${setName ? ` from ${setName}` : ''}`}
      style={{
        width: 158,
        minHeight: 264,
        borderRadius: 17,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.card,
        padding: 10,
        gap: 8,
      }}
    >
      <View style={{ height: 172, borderRadius: 13, overflow: 'hidden', backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
        <StackrImage
          uri={imageUri}
          contentFit="contain"
          rounded={13}
          style={{ width: '100%', height: '100%', borderRadius: 13, backgroundColor: theme.colors.surface }}
        />
        <RaritySymbol rarity={rarity} size={14} style={RARITY_SYMBOL_CARD_OVERLAY} />
      </View>
      <Text style={{ color: theme.colors.text, fontSize: 14.5, lineHeight: 18, fontWeight: '900' }} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.78}>
        {name}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 18 }}>
        {setLogoUri ? (
          <StackrImage uri={setLogoUri} contentFit="contain" rounded={0} style={{ width: 38, height: 15, backgroundColor: 'transparent' }} showFallbackIcon={false} />
        ) : null}
        <Text style={{ flex: 1, color: theme.colors.textSoft, fontSize: 11.5, lineHeight: 14, fontWeight: '800' }} numberOfLines={1}>
          {setName ?? 'Unknown set'}
        </Text>
      </View>
      <RailMetaLine primary={estimate ?? (listingCount ? `${listingCount} listing${listingCount === 1 ? '' : 's'}` : number ? `#${number}` : 'Card')} />
      <RailMetaLine
        muted
        primary={[
          number ? `#${number}` : null,
          rarity,
          ownedQuantity ? `Owned x${ownedQuantity}` : null,
        ].filter(Boolean).join(' - ')}
      />
    </TouchableOpacity>
  );
}

export function SearchSetRailItem({
  name,
  logoUri,
  artworkUri,
  series,
  year,
  total,
  ownedCount,
  completionPercent,
  onPress,
}: {
  name: string;
  logoUri?: string | null;
  artworkUri?: string | null;
  series?: string | null;
  year?: string | number | null;
  total?: number | null;
  ownedCount?: number | null;
  completionPercent?: number | null;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.84}
      accessibilityRole="button"
      accessibilityLabel={`Open set ${name}`}
      style={{
        width: 176,
        minHeight: 176,
        borderRadius: 17,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.card,
        padding: 10,
        gap: 8,
      }}
    >
      <View style={{ height: 76, borderRadius: 13, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <StackrImage uri={enforceSetVisualRuntimePolicy(logoUri)} fullUri={enforceSetVisualRuntimePolicy(artworkUri)} contentFit="contain" rounded={12} style={{ width: '100%', height: '100%', backgroundColor: 'transparent' }} showFallbackIcon={false} />
        {!logoUri && !artworkUri ? <Ionicons name={searchIcons.sets} size={26} color={theme.colors.textSoft} /> : null}
      </View>
      <Text style={{ color: theme.colors.text, fontSize: 14.5, lineHeight: 18, fontWeight: '900' }} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.78}>
        {name}
      </Text>
      <RailMetaLine muted primary={[series, year].filter(Boolean).join(' - ') || 'Pokemon set'} />
      <RailMetaLine
        primary={[
          total ? `${total} cards` : null,
          ownedCount != null ? `${ownedCount} owned` : null,
          completionPercent != null ? `${Math.round(completionPercent)}%` : null,
        ].filter(Boolean).join(' - ')}
      />
    </TouchableOpacity>
  );
}

export function SearchProductRailItem({
  name,
  imageUri,
  setName,
  setLogoUri,
  productType,
  estimatedValue,
  listingCount,
  lowestPrice,
  saved,
  onPress,
}: {
  name: string;
  imageUri?: string | null;
  setName?: string | null;
  setLogoUri?: string | null;
  productType?: string | null;
  estimatedValue?: number | null;
  listingCount?: number;
  lowestPrice?: number | null;
  saved?: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const price = money(lowestPrice ?? estimatedValue);
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.84}
      accessibilityRole="button"
      accessibilityLabel={`Open sealed product ${name}`}
      style={{
        width: 174,
        minHeight: 226,
        borderRadius: 17,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.card,
        padding: 10,
        gap: 8,
      }}
    >
      <StackrImage
        uri={imageUri}
        fallbackSource={stackrIcons.marketplace}
        contentFit="contain"
        rounded={13}
        style={{ width: '100%', height: 118, borderRadius: 13, backgroundColor: theme.colors.surface }}
        showFallbackIcon={false}
      />
      <Text style={{ color: theme.colors.text, fontSize: 14.5, lineHeight: 18, fontWeight: '900' }} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.78}>
        {name}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 18 }}>
        {setLogoUri ? (
          <StackrImage uri={setLogoUri} contentFit="contain" rounded={0} style={{ width: 38, height: 15, backgroundColor: 'transparent' }} showFallbackIcon={false} />
        ) : null}
        <Text style={{ flex: 1, color: theme.colors.textSoft, fontSize: 11.5, lineHeight: 14, fontWeight: '800' }} numberOfLines={1}>
          {setName ?? productType ?? 'Sealed product'}
        </Text>
      </View>
      <RailMetaLine primary={price ?? productType ?? 'Product'} />
      <RailMetaLine muted primary={[productType, listingCount ? `${listingCount} listing${listingCount === 1 ? '' : 's'}` : null, saved ? 'Saved' : null].filter(Boolean).join(' - ')} />
    </TouchableOpacity>
  );
}

export function SearchListingRailItem({
  title,
  imageUri,
  subtitle,
  price,
  modeLabel,
  onPress,
}: {
  title: string;
  imageUri?: string | null;
  subtitle?: string | null;
  price?: number | null;
  modeLabel?: string | null;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const safeModeLabel = modeLabel === 'Trade' ? 'Trade' : modeLabel ? 'Offers' : modeLabel;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.84}
      accessibilityRole="button"
      accessibilityLabel={`Open Market listing ${title}`}
      style={{
        width: 174,
        minHeight: 232,
        borderRadius: 17,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.card,
        padding: 10,
        gap: 8,
      }}
    >
      <StackrImage uri={imageUri} contentFit="contain" rounded={13} style={{ width: '100%', height: 128, borderRadius: 13, backgroundColor: theme.colors.surface }} />
      <Text style={{ color: theme.colors.text, fontSize: 14.5, lineHeight: 18, fontWeight: '900' }} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.78}>
        {title}
      </Text>
      <RailMetaLine muted primary={subtitle ?? 'The Market'} />
      <RailMetaLine primary={[safeModeLabel ?? 'Market listing', money(price)].filter(Boolean).join(' - ')} />
    </TouchableOpacity>
  );
}

export function SearchCollectorRailItem({
  name,
  avatarUri,
  subtitle,
  onPress,
}: {
  name: string;
  avatarUri?: string | null;
  subtitle?: string | null;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.84}
      accessibilityRole="button"
      accessibilityLabel={`Open collector profile ${name}`}
      style={{
        width: 154,
        minHeight: 146,
        borderRadius: 17,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.card,
        padding: 12,
        alignItems: 'center',
        gap: 8,
      }}
    >
      <StackrImage uri={avatarUri} contentFit="cover" rounded={28} style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: theme.colors.surface }} />
      <Text style={{ color: theme.colors.text, fontSize: 14, lineHeight: 18, fontWeight: '900', textAlign: 'center' }} numberOfLines={1}>
        {name}
      </Text>
      <RailMetaLine muted primary={subtitle ?? 'Collector profile'} centered />
    </TouchableOpacity>
  );
}

export function SearchCardResult({
  name,
  imageUri,
  setName,
  setLogoUri,
  number,
  rarity,
  estimatedValue,
  listingCount,
  ownedQuantity,
  onPress,
}: {
  name: string;
  imageUri?: string | null;
  setName?: string | null;
  setLogoUri?: string | null;
  number?: string | null;
  rarity?: string | null;
  estimatedValue?: number | null;
  listingCount?: number;
  ownedQuantity?: number;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <SearchResultShell
      onPress={onPress}
      accessibilityLabel={`Open card ${name}${setName ? ` from ${setName}` : ''}`}
      leading={
        <View style={{ width: 58, height: 80, borderRadius: 9, overflow: 'hidden', backgroundColor: theme.colors.surface }}>
          <StackrImage
            uri={imageUri}
            contentFit="contain"
            rounded={9}
            style={{ width: '100%', height: '100%', borderRadius: 9, backgroundColor: theme.colors.surface }}
          />
          <RaritySymbol
            rarity={rarity}
            size={13}
            style={RARITY_SYMBOL_CARD_OVERLAY}
          />
        </View>
      }
    >
      <Text style={{ color: theme.colors.text, fontSize: 14.5, lineHeight: 19, fontWeight: '900' }} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.78}>
        {name}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
        {setLogoUri ? (
          <StackrImage uri={setLogoUri} contentFit="contain" rounded={0} style={{ width: 40, height: 16, backgroundColor: 'transparent' }} showFallbackIcon={false} />
        ) : null}
        <Text style={{ flex: 1, color: theme.colors.textSoft, fontSize: 12, fontWeight: '800' }} numberOfLines={1}>
          {setName ?? 'Unknown set'}
        </Text>
      </View>
      <MetaRow
        items={[
          number ? `#${number}` : null,
          money(estimatedValue) ? `Est. ${money(estimatedValue)}` : null,
          listingCount ? `${listingCount} Market listing${listingCount === 1 ? '' : 's'}` : null,
          ownedQuantity ? `Owned x${ownedQuantity}` : null,
        ]}
      />
    </SearchResultShell>
  );
}

export function SearchSetResult({
  name,
  logoUri,
  artworkUri,
  series,
  year,
  total,
  ownedCount,
  completionPercent,
  onPress,
}: {
  name: string;
  logoUri?: string | null;
  artworkUri?: string | null;
  series?: string | null;
  year?: string | number | null;
  total?: number | null;
  ownedCount?: number | null;
  completionPercent?: number | null;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <SearchResultShell
      onPress={onPress}
      accessibilityLabel={`Open set ${name}`}
      leading={
        <View style={{ width: 64, height: 52, borderRadius: 12, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden' }}>
          <StackrImage uri={enforceSetVisualRuntimePolicy(logoUri)} fullUri={enforceSetVisualRuntimePolicy(artworkUri)} contentFit="contain" rounded={12} style={{ width: '100%', height: '100%', backgroundColor: 'transparent' }} showFallbackIcon={false} />
          {!logoUri && !artworkUri ? <Ionicons name={searchIcons.sets} size={24} color={theme.colors.textSoft} /> : null}
        </View>
      }
    >
      <Text style={{ color: theme.colors.text, fontSize: 14.5, lineHeight: 19, fontWeight: '900' }} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.78}>
        {name}
      </Text>
      <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '800', marginTop: 3 }} numberOfLines={1}>
        {[series, year].filter(Boolean).join(' · ') || 'Pokémon set'}
      </Text>
      <MetaRow
        items={[
          total ? `${total} cards` : null,
          ownedCount != null ? `${ownedCount} owned` : null,
          completionPercent != null ? `${Math.round(completionPercent)}% complete` : null,
        ]}
      />
    </SearchResultShell>
  );
}

export function SearchSealedResult({
  name,
  imageUri,
  setName,
  setLogoUri,
  productType,
  estimatedValue,
  listingCount,
  lowestPrice,
  saved,
  onPress,
}: {
  name: string;
  imageUri?: string | null;
  setName?: string | null;
  setLogoUri?: string | null;
  productType?: string | null;
  estimatedValue?: number | null;
  listingCount?: number;
  lowestPrice?: number | null;
  saved?: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <SearchResultShell
      onPress={onPress}
      accessibilityLabel={`Open sealed product ${name}`}
      leading={(
        <StackrImage
          uri={imageUri}
          fallbackSource={stackrIcons.marketplace}
          contentFit="contain"
          rounded={12}
          style={{ width: 66, height: 66, borderRadius: 12, backgroundColor: theme.colors.surface }}
          showFallbackIcon={false}
        />
      )}
    >
      <Text style={{ color: theme.colors.text, fontSize: 14.5, lineHeight: 19, fontWeight: '900' }} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.78}>
        {name}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
        {setLogoUri ? (
          <StackrImage uri={setLogoUri} contentFit="contain" rounded={0} style={{ width: 40, height: 16, backgroundColor: 'transparent' }} showFallbackIcon={false} />
        ) : null}
        <Text style={{ flex: 1, color: theme.colors.textSoft, fontSize: 12, fontWeight: '800' }} numberOfLines={1}>
          {setName ?? productType ?? 'Sealed product'}
        </Text>
      </View>
      <MetaRow
        items={[
          productType,
          money(estimatedValue) ? `Estimated ${money(estimatedValue)}` : null,
          lowestPrice != null ? `Lowest listing ${money(lowestPrice)}` : null,
          listingCount ? `${listingCount} listing${listingCount === 1 ? '' : 's'}` : null,
          saved ? 'Saved' : null,
        ]}
      />
    </SearchResultShell>
  );
}

export function SearchListingResult({
  title,
  imageUri,
  subtitle,
  price,
  modeLabel,
  onPress,
}: {
  title: string;
  imageUri?: string | null;
  subtitle?: string | null;
  price?: number | null;
  modeLabel?: string | null;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const safeModeLabel = modeLabel === 'Trade' ? 'Trade' : modeLabel ? 'Offers' : modeLabel;
  return (
    <SearchResultShell
      onPress={onPress}
      accessibilityLabel={`Open Market listing ${title}`}
      leading={<StackrImage uri={imageUri} contentFit="contain" rounded={10} style={{ width: 58, height: 72, borderRadius: 10, backgroundColor: theme.colors.surface }} />}
    >
      <Text style={{ color: theme.colors.text, fontSize: 14.5, lineHeight: 19, fontWeight: '900' }} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.78}>
        {title}
      </Text>
      <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '800', marginTop: 3 }} numberOfLines={1}>
        {subtitle ?? 'The Market'}
      </Text>
      <MetaRow items={[safeModeLabel ?? 'Market listing', money(price)]} />
    </SearchResultShell>
  );
}

export function SearchCollectorResult({
  name,
  avatarUri,
  subtitle,
  onPress,
}: {
  name: string;
  avatarUri?: string | null;
  subtitle?: string | null;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <SearchResultShell
      onPress={onPress}
      accessibilityLabel={`Open collector profile ${name}`}
      leading={<StackrImage uri={avatarUri} contentFit="cover" rounded={22} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.surface }} />}
    >
      <Text style={{ color: theme.colors.text, fontSize: 14.5, lineHeight: 19, fontWeight: '900' }} numberOfLines={1}>
        {name}
      </Text>
      <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '800', marginTop: 3 }} numberOfLines={1}>
        {subtitle ?? 'Collector profile'}
      </Text>
    </SearchResultShell>
  );
}

export function RecentSearchPill({
  label,
  onPress,
  onRemove,
}: {
  label: string;
  onPress: () => void;
  onRemove: () => void;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.82}
      style={{
        height: 32,
        maxWidth: 188,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.card,
        paddingLeft: 10,
        paddingRight: 6,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <Ionicons name={searchIcons.recent} size={14} color={theme.colors.textSoft} />
      <Text
        numberOfLines={1}
        ellipsizeMode="tail"
        style={{ flexShrink: 1, color: theme.colors.text, fontSize: 12, lineHeight: 15, fontWeight: '900' }}
      >
        {label}
      </Text>
      <TouchableOpacity onPress={onRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={`Remove ${label} from recent searches`}>
        <Ionicons name="close" size={14} color={theme.colors.textSoft} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

export function SearchSkeleton() {
  const { theme } = useTheme();
  return (
    <View style={{ gap: 10 }}>
      {[0, 1, 2, 3].map((item) => (
        <View key={item} style={{ minHeight: 92, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.card, padding: 11, flexDirection: 'row', gap: 11 }}>
          <View style={{ width: 58, height: 72, borderRadius: 10, backgroundColor: theme.colors.surface }} />
          <View style={{ flex: 1, gap: 8, paddingTop: 4 }}>
            <View style={{ width: '78%', height: 15, borderRadius: 8, backgroundColor: theme.colors.surface }} />
            <View style={{ width: '56%', height: 12, borderRadius: 8, backgroundColor: theme.colors.surface }} />
            <View style={{ width: '42%', height: 12, borderRadius: 8, backgroundColor: theme.colors.surface }} />
          </View>
        </View>
      ))}
    </View>
  );
}

function SearchResultShell({
  leading,
  children,
  onPress,
  accessibilityLabel,
}: {
  leading: React.ReactNode;
  children: React.ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.84}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={{
        minHeight: 92,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.card,
        padding: 11,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 11,
      }}
    >
      {leading}
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textSoft} />
    </TouchableOpacity>
  );
}

function MetaRow({ items }: { items: (string | number | null | undefined | false)[] }) {
  const { theme } = useTheme();
  const filtered = items.filter((item): item is string | number => item !== null && item !== undefined && item !== false && String(item).length > 0);
  if (!filtered.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingTop: 7 }}>
      {filtered.map((item) => (
        <View key={String(item)} style={{ minHeight: 23, borderRadius: 999, paddingHorizontal: 8, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: theme.colors.textSoft, fontSize: 10.5, fontWeight: '900' }}>{item}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

function RailMetaLine({ primary, muted = false, centered = false }: { primary?: string | null; muted?: boolean; centered?: boolean }) {
  const { theme } = useTheme();
  if (!primary) return null;
  return (
    <Text
      numberOfLines={1}
      style={{
        color: muted ? theme.colors.textSoft : theme.colors.primary,
        fontSize: muted ? 11.2 : 12.5,
        lineHeight: muted ? 14 : 16,
        fontWeight: '900',
        textAlign: centered ? 'center' : 'left',
      }}
    >
      {primary}
    </Text>
  );
}
