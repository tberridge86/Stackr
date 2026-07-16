import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackrBackdrop, StackrHeroBackdrop } from '../../components/StackrBackdrop';
import { StackrPageTitle } from '../../components/StackrScreen';
import { Text } from '../../components/Text';
import { useAppMode } from '../../components/app-mode-context';
import { useAchievements } from '../../components/achievement-context';
import { useProfile } from '../../components/profile-context';
import { useTheme } from '../../components/theme-context';
import { ACHIEVEMENTS, type AchievementDefinition, type AchievementUnlock } from '../../lib/achievements';
import { getCollectionSummary } from '../../lib/collectionSummary';
import { readCreateListingDraftSummary } from '../../lib/listingDrafts';
import { getPriceFromPokemonCard } from '../../lib/pricing';
import {
  getProfileAvatar,
  getProfileAvatarsForTeam,
  getProfileTeam,
  STACKR_PROFILE_TEAMS,
  type StackrProfileAvatar,
  type StackrProfileTeam,
  type StackrProfileTeamKey,
} from '../../lib/profileAvatars';
import {
  getProfileShowcaseSearchConfig,
  loadProfileShowcase,
  removeProfileShowcaseCard,
  type ProfileShowcaseCard,
  type ProfileShowcaseSlot,
} from '../../lib/profileShowcase';
import { ROUTES } from '../../lib/routes';
import { stackrIcons } from '../../lib/stackrIcons';
import { stackrTabContentPadding } from '../../lib/stackrSizing';
import { supabase } from '../../lib/supabase';

const IDENTITY_ONBOARDING_KEY = 'stackr:identity-onboarding:v2';
const USD_TO_GBP = 0.79;

const HERO_ICONS = {
  achievements: stackrIcons.protect,
  binders: stackrIcons.binders,
  cards: stackrIcons.scanCard,
  chase: stackrIcons.chase,
  edit: stackrIcons.profile,
  favorite: stackrIcons.favorite,
  market: stackrIcons.marketplace,
  notifications: stackrIcons.notifications,
  profile: stackrIcons.profile,
  progress: stackrIcons.hub,
  rawCard: require('../../assets/rev2/04-listing-categories/clean/Raw Card.png'),
  seller: stackrIcons.sellerMode,
  settings: stackrIcons.info,
  slab: require('../../assets/rev2/04-listing-categories/clean/Graded Slab.png'),
  trade: stackrIcons.trade,
  valuePounds: stackrIcons.priceBuilder,
} as const;

type HeroIconKey = keyof typeof HERO_ICONS;

type ProfileStats = {
  binderCount: number;
  ownedCount: number;
  completedSets: number;
  collectionValue: number;
  tradeCount: number;
  sellerListings: number | null;
  sellerDrafts: number;
  sellerSales: number | null;
  sellerInventory: number | null;
};

type IdentityStep = 'team' | 'identity' | 'character' | 'preview';
type IdentityMode = 'photo' | 'character';
type ShowcaseDisplayCard = any | ProfileShowcaseCard;

const initialStats: ProfileStats = {
  binderCount: 0,
  ownedCount: 0,
  completedSets: 0,
  collectionValue: 0,
  tradeCount: 0,
  sellerListings: null,
  sellerDrafts: 0,
  sellerSales: null,
  sellerInventory: null,
};

function money(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return 'Unavailable';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);
}

function compactNumber(value: number) {
  return new Intl.NumberFormat('en-GB', { notation: value >= 10000 ? 'compact' : 'standard' }).format(value);
}

function getProfileInitials(name?: string | null): string {
  const initials = (name ?? '')
    .trim()
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return initials || 'S';
}

function getTierColour(tier: AchievementDefinition['tier']) {
  if (tier === 'rainbow') return '#8B5CF6';
  if (tier === 'gold') return '#F6C453';
  if (tier === 'silver') return '#94A3B8';
  return '#C08457';
}

function getAchievementIcon(achievement: AchievementDefinition): ImageSourcePropType {
  if (achievement.id.includes('binder')) return HERO_ICONS.binders;
  if (achievement.id.includes('scan')) return HERO_ICONS.cards;
  if (achievement.id.includes('master')) return HERO_ICONS.achievements;
  if (achievement.id.includes('card')) return HERO_ICONS.favorite;
  return HERO_ICONS.progress;
}

function calculateProgression(stats: ProfileStats, unlocks: AchievementUnlock[]) {
  const achievementXp = unlocks.reduce((sum, unlock) => sum + 180 + unlock.coinReward, 0);
  const xp = stats.ownedCount * 5 + stats.binderCount * 120 + stats.tradeCount * 160 + achievementXp;
  const level = Math.max(1, Math.floor(Math.sqrt(xp / 140)) + 1);
  const currentLevelStart = Math.pow(level - 1, 2) * 140;
  const nextLevelStart = Math.pow(level, 2) * 140;
  const progress = Math.max(0, Math.min(1, (xp - currentLevelStart) / Math.max(1, nextLevelStart - currentLevelStart)));

  return {
    xp,
    level,
    current: xp - currentLevelStart,
    needed: nextLevelStart - currentLevelStart,
    progress,
    nextUnlock: level < 6 ? 'Profile frame slot' : level < 12 ? 'Animated border preview' : 'Seasonal profile effect',
  };
}

async function persistProfilePhoto(uri: string) {
  if (!FileSystem.documentDirectory) return uri;

  const profileAvatarDir = `${FileSystem.documentDirectory}profile-avatars`;
  const dirInfo = await FileSystem.getInfoAsync(profileAvatarDir);

  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(profileAvatarDir, { intermediates: true });
  }

  const extensionMatch = uri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  const extension = extensionMatch?.[1]?.toLowerCase() ?? 'jpg';
  const destination = `${profileAvatarDir}/profile-avatar-${Date.now()}.${extension}`;

  await FileSystem.copyAsync({ from: uri, to: destination });
  return destination;
}

function HeroIcon({
  icon,
  size = 28,
  label,
}: {
  icon: HeroIconKey | ImageSourcePropType;
  size?: number;
  label?: string;
}) {
  return (
    <Image
      source={typeof icon === 'string' ? HERO_ICONS[icon] : icon}
      resizeMode="contain"
      accessibilityLabel={label}
      accessibilityIgnoresInvertColors
      style={{ width: size, height: size }}
    />
  );
}

function IconButton({
  icon,
  label,
  onPress,
  badge,
}: {
  icon: HeroIconKey;
  label: string;
  onPress: () => void;
  badge?: number;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      activeOpacity={0.84}
      style={{
        width: 42,
        height: 42,
        borderRadius: 15,
        backgroundColor: 'rgba(255,255,255,0.76)',
        borderWidth: 1,
        borderColor: 'rgba(232,225,255,0.9)',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#6136F5',
        shadowOpacity: 0.10,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 5 },
        elevation: 2,
      }}
    >
      <HeroIcon icon={icon} size={27} label={label} />
      {badge != null && badge > 0 && (
        <View
          style={{
            position: 'absolute',
            top: -4,
            right: -4,
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            paddingHorizontal: 4,
            backgroundColor: '#EF4444',
            borderWidth: 2,
            borderColor: theme.colors.card,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 9, lineHeight: 11, fontWeight: '900' }}>
            {badge > 99 ? '99+' : badge}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function ProgressBar({
  progress,
  colour,
}: {
  progress: number;
  colour: string;
}) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
      style={{
        height: 10,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.52)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.62)',
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: `${Math.round(progress * 100)}%`,
          height: '100%',
          borderRadius: 999,
          backgroundColor: colour,
        }}
      />
    </View>
  );
}

function ProfileAvatarFrame({
  size,
  avatarUrl,
  stackrAvatar,
  initials,
  borderColor,
  backgroundColor,
  variant = 'compact',
}: {
  size: number;
  avatarUrl?: string | null;
  stackrAvatar?: StackrProfileAvatar | null;
  initials: string;
  borderColor: string;
  backgroundColor: string;
  variant?: 'compact' | 'picker' | 'hero';
}) {
  const cropScale = stackrAvatar?.cropScale ?? 1.04;
  const cropX = stackrAvatar?.cropX ?? 0;
  const cropY = stackrAvatar?.cropY ?? 0;
  const isCharacter = Boolean(stackrAvatar && !avatarUrl);
  const isHero = variant === 'hero';

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor,
        borderWidth: isHero ? 3 : 2,
        borderColor: isHero ? 'rgba(255,255,255,0.9)' : borderColor,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
      ) : stackrAvatar ? (
        <Image
          source={stackrAvatar.image}
          resizeMode="contain"
          style={{
            width: isCharacter ? size * 1.1 : size,
            height: isCharacter ? size * 1.1 : size,
            transform: [{ scale: cropScale }, { translateX: cropX }, { translateY: cropY }],
          }}
        />
      ) : (
        <Text style={{ color: '#FFFFFF', fontSize: size * 0.34, lineHeight: size * 0.4, fontWeight: '900' }}>
          {initials}
        </Text>
      )}
    </View>
  );
}

function TeamCrest({
  team,
  active,
  size = 54,
}: {
  team: StackrProfileTeam;
  active?: boolean;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: Math.round(size * 0.72),
        borderRadius: Math.round(size * 0.24),
        backgroundColor: '#FFFFFF',
        borderWidth: active ? 2 : 1,
        borderColor: active ? team.color : '#E8E1FF',
        alignItems: 'center',
        justifyContent: 'center',
        padding: Math.max(4, Math.round(size * 0.08)),
        shadowColor: team.color,
        shadowOpacity: active ? 0.18 : 0.08,
        shadowRadius: active ? 14 : 8,
        shadowOffset: { width: 0, height: 6 },
        elevation: active ? 3 : 1,
      }}
    >
      {team.logo ? (
        <Image source={team.logo} resizeMode="contain" style={{ width: '100%', height: '100%' }} accessibilityLabel={`${team.label} team crest`} />
      ) : (
        <Text style={{ color: team.color, fontWeight: '900' }}>{team.label}</Text>
      )}
    </View>
  );
}

function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.colors.text, fontSize: 20, lineHeight: 25, fontWeight: '900' }}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ color: theme.colors.textSoft, fontSize: 12.5, lineHeight: 17, fontWeight: '700', marginTop: 2 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}

function StatChip({
  icon,
  label,
  value,
}: {
  icon: HeroIconKey;
  label: string;
  value: string | number;
}) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 118,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.72)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.74)',
        paddingHorizontal: 9,
        paddingVertical: 11,
        gap: 6,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View style={{ width: 62, height: 54, alignItems: 'center', justifyContent: 'center' }}>
        <HeroIcon icon={icon} size={icon === 'rawCard' ? 52 : 47} label="" />
      </View>
      <Text style={{ color: '#07145F', fontSize: 19, lineHeight: 23, fontWeight: '900', textAlign: 'center' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
        {value}
      </Text>
      <Text style={{ color: '#615B94', fontSize: 11.5, lineHeight: 15, fontWeight: '800', textAlign: 'center' }} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.82}>
        {label}
      </Text>
    </View>
  );
}

function ActionPill({
  label,
  icon,
  onPress,
  primary,
}: {
  label: string;
  icon: HeroIconKey;
  onPress: () => void;
  primary?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      activeOpacity={0.84}
      style={{
        minHeight: 42,
        borderRadius: 999,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        backgroundColor: primary ? theme.colors.primary : 'rgba(255,255,255,0.74)',
        borderWidth: 1,
        borderColor: primary ? 'rgba(255,255,255,0.42)' : 'rgba(232,225,255,0.9)',
      }}
    >
      <HeroIcon icon={icon} size={22} label="" />
      <Text style={{ color: primary ? '#FFFFFF' : '#07145F', fontSize: 12, lineHeight: 15, fontWeight: '900' }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function ShowcaseCabinet({
  title,
  subtitle,
  card,
  icon,
  onPress,
}: {
  title: string;
  subtitle: string;
  card: ShowcaseDisplayCard | null;
  icon: HeroIconKey;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const imageUri = card?.imageUri ?? card?.images?.small ?? card?.images?.large ?? null;
  const setName = card?.set?.name ?? card?.setName ?? null;
  const cardNumber = card?.number ?? null;
  const rawValue = card ? getPriceFromPokemonCard(card) : null;
  const value = typeof card?.estimatedValueGbp === 'number'
    ? card.estimatedValueGbp
    : rawValue == null
      ? null
      : rawValue * USD_TO_GBP;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.86}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${card?.name ?? subtitle}`}
      style={{
        width: '48%',
        minHeight: 282,
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.86)',
        borderWidth: 1,
        borderColor: '#E8E1FF',
        padding: 12,
        overflow: 'hidden',
        shadowColor: '#6136F5',
        shadowOpacity: 0.13,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
        elevation: 4,
      }}
    >
      <StackrHeroBackdrop opacity={0.08} />
      <View
        style={{
          height: 166,
          borderRadius: 20,
          backgroundColor: '#F7F3FF',
          borderWidth: 1,
          borderColor: '#EEE7FF',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {imageUri ? (
          <Image source={{ uri: imageUri }} resizeMode="contain" style={{ width: '88%', height: '92%' }} />
        ) : (
          <View style={{ alignItems: 'center', gap: 8, paddingHorizontal: 14 }}>
            <View
              style={{
                width: 88,
                height: 82,
                alignItems: 'center',
                justifyContent: 'center',
              }}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <HeroIcon icon={icon} size={icon === 'slab' ? 74 : 66} label="" />
            </View>
            <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 16, fontWeight: '800', textAlign: 'center' }}>
              {subtitle}
            </Text>
          </View>
        )}
      </View>
      <Text style={{ color: theme.colors.primary, fontSize: 11, lineHeight: 14, fontWeight: '900', marginTop: 10, textTransform: 'uppercase' }}>
        {title}
      </Text>
      <Text style={{ color: theme.colors.text, fontSize: 15, lineHeight: 19, fontWeight: '900', marginTop: 4 }} numberOfLines={2}>
        {card?.name ?? 'Choose display card'}
      </Text>
      <Text style={{ color: theme.colors.textSoft, fontSize: 11.5, lineHeight: 16, fontWeight: '700', marginTop: 4 }} numberOfLines={2}>
        {card ? [setName, cardNumber].filter(Boolean).join(' · ') : subtitle}
      </Text>
      {value != null ? (
        <Text style={{ color: theme.colors.primary, fontSize: 12, lineHeight: 15, fontWeight: '900', marginTop: 4 }}>
          {money(value)} estimated value
        </Text>
      ) : null}
      <View style={{ marginTop: 'auto', paddingTop: 10 }}>
        <Text style={{ color: theme.colors.primary, fontSize: 11.5, lineHeight: 14, fontWeight: '900' }}>
          {card ? 'Edit' : 'Choose card'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function AchievementBadge({
  achievement,
  unlocked,
}: {
  achievement: AchievementDefinition;
  unlocked?: AchievementUnlock;
}) {
  const { theme } = useTheme();
  const tierColour = getTierColour(achievement.tier);
  const complete = Boolean(unlocked);

  return (
    <View
      style={{
        width: '48%',
        minHeight: 152,
        borderRadius: 22,
        padding: 13,
        backgroundColor: complete ? '#FFFFFF' : 'rgba(255,255,255,0.62)',
        borderWidth: 1,
        borderColor: complete ? tierColour : '#E8E1FF',
        opacity: complete ? 1 : 0.66,
        shadowColor: complete ? tierColour : '#6136F5',
        shadowOpacity: complete ? 0.15 : 0.06,
        shadowRadius: complete ? 14 : 8,
        shadowOffset: { width: 0, height: 7 },
        elevation: complete ? 3 : 1,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <View
          style={{
            width: 50,
            height: 50,
            borderRadius: 25,
            borderWidth: 4,
            borderColor: complete ? tierColour : '#DCD5F4',
            backgroundColor: complete ? `${tierColour}18` : '#F7F3FF',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <HeroIcon icon={getAchievementIcon(achievement)} size={30} label="" />
        </View>
        <Text style={{ color: tierColour, fontSize: 10.5, lineHeight: 13, fontWeight: '900', textTransform: 'uppercase' }}>
          {achievement.tier}
        </Text>
      </View>
      <Text style={{ color: theme.colors.text, fontSize: 14, lineHeight: 18, fontWeight: '900', marginTop: 10 }} numberOfLines={2}>
        {achievement.title}
      </Text>
      <Text style={{ color: theme.colors.textSoft, fontSize: 11, lineHeight: 15, fontWeight: '700', marginTop: 3 }} numberOfLines={2}>
        {achievement.description}
      </Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 10 }}>
        <Text style={{ color: complete ? tierColour : theme.colors.textSoft, fontSize: 11, lineHeight: 14, fontWeight: '900' }}>
          {complete ? 'Unlocked' : 'Locked'}
        </Text>
        <Text style={{ color: '#B7791F', fontSize: 11, lineHeight: 14, fontWeight: '900' }}>
          {achievement.tier}
        </Text>
      </View>
    </View>
  );
}

function SellerModule({
  enabled,
  stats,
  onSetup,
  onOpen,
  onSettings,
  onExit,
}: {
  enabled: boolean;
  stats: ProfileStats;
  onSetup: () => void;
  onOpen: () => void;
  onSettings: () => void;
  onExit: () => void;
}) {
  const { theme } = useTheme();
  const dataUnavailable = enabled && [stats.sellerListings, stats.sellerSales, stats.sellerInventory].some((value) => value == null);

  return (
    <View
      style={{
        borderRadius: 26,
        padding: 16,
        backgroundColor: enabled ? '#FFFFFF' : 'rgba(255,255,255,0.72)',
        borderWidth: 1,
        borderColor: enabled ? '#D9CCFF' : '#E8E1FF',
        shadowColor: '#6136F5',
        shadowOpacity: enabled ? 0.14 : 0.06,
        shadowRadius: enabled ? 18 : 8,
        shadowOffset: { width: 0, height: 9 },
        elevation: enabled ? 4 : 1,
        overflow: 'hidden',
      }}
    >
      <StackrHeroBackdrop opacity={enabled ? 0.08 : 0.04} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
        <View
          style={{
            width: 58,
            height: 58,
            borderRadius: 20,
            backgroundColor: '#F7F3FF',
            borderWidth: 1,
            borderColor: '#E8E1FF',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <HeroIcon icon="seller" size={38} label="Seller Mode" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.colors.text, fontSize: 18, lineHeight: 23, fontWeight: '900' }}>
            Seller Profile
          </Text>
          <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 2 }}>
            {enabled ? 'Seller workspace active' : 'Manage stock, listings and sales with Stackr Seller Mode.'}
          </Text>
        </View>
      </View>

      {enabled && (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 15 }}>
            <StatChip icon="market" label="Live" value={stats.sellerListings == null ? '--' : stats.sellerListings} />
            <StatChip icon="edit" label="Drafts" value={stats.sellerDrafts} />
            <StatChip icon="trade" label="Sales" value={stats.sellerSales == null ? '--' : stats.sellerSales} />
            <StatChip icon="cards" label="Inventory" value={stats.sellerInventory == null ? '--' : stats.sellerInventory} />
          </View>
          <View style={{ marginTop: 12, borderRadius: 18, backgroundColor: '#F7F3FF', borderWidth: 1, borderColor: '#E8E1FF', padding: 12 }}>
            <Text style={{ color: theme.colors.text, fontSize: 12.5, lineHeight: 16, fontWeight: '900' }}>
              Current tier: Starter Seller
            </Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 11.5, lineHeight: 16, fontWeight: '700', marginTop: 4 }}>
              {dataUnavailable
                ? 'Some seller statistics are waiting on backend data. No payout or fulfilment totals are estimated here.'
                : stats.sellerDrafts
                  ? 'Live listings are published in The Market. Draft listings can be resumed from My Listings.'
                  : 'Live listings, inventory and completed sale totals are loaded from Stackr seller data.'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <TouchableOpacity
              onPress={onOpen}
              activeOpacity={0.84}
              accessibilityRole="button"
              accessibilityLabel="Open Seller Mode"
              style={{ flex: 1, minHeight: 44, borderRadius: 16, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 13, lineHeight: 16, fontWeight: '900' }}>Open Seller Mode</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onSettings}
              activeOpacity={0.84}
              accessibilityRole="button"
              accessibilityLabel="Open seller settings"
              style={{ flex: 1, minHeight: 44, borderRadius: 16, backgroundColor: '#F7F3FF', borderWidth: 1, borderColor: '#E8E1FF', alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: theme.colors.primary, fontSize: 13, lineHeight: 16, fontWeight: '900' }}>Seller settings</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={onExit}
            activeOpacity={0.84}
            accessibilityRole="button"
            accessibilityLabel="Return to collector mode"
            style={{ marginTop: 10, minHeight: 42, borderRadius: 15, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E8E1FF', alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: theme.colors.textSoft, fontSize: 12.5, lineHeight: 16, fontWeight: '900' }}>Return to collector mode</Text>
          </TouchableOpacity>
        </>
      )}
      {!enabled ? (
        <TouchableOpacity
          onPress={onSetup}
          activeOpacity={0.84}
          accessibilityRole="button"
          accessibilityLabel="Set up Seller Mode"
          style={{ marginTop: 14, minHeight: 46, borderRadius: 17, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 13, lineHeight: 16, fontWeight: '900' }}>
            Set up Seller Mode
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function IdentityFlowModal({
  visible,
  firstRun,
  collectorName,
  initials,
  selectedTeam,
  selectedMode,
  selectedAvatar,
  selectedPhotoUri,
  saving,
  step,
  onClose,
  onStep,
  onTeam,
  onMode,
  onAvatar,
  onPickPhoto,
  onReset,
  onConfirm,
}: {
  visible: boolean;
  firstRun: boolean;
  collectorName: string;
  initials: string;
  selectedTeam: StackrProfileTeam;
  selectedMode: IdentityMode;
  selectedAvatar: StackrProfileAvatar | null;
  selectedPhotoUri: string | null;
  saving: boolean;
  step: IdentityStep;
  onClose: () => void;
  onStep: (step: IdentityStep) => void;
  onTeam: (team: StackrProfileTeamKey) => void;
  onMode: (mode: IdentityMode) => void;
  onAvatar: (avatarKey: string) => void;
  onPickPhoto: () => Promise<void>;
  onReset: () => void;
  onConfirm: () => void;
}) {
  const { theme } = useTheme();
  const avatars = getProfileAvatarsForTeam(selectedTeam.key);
  const steps: IdentityStep[] = selectedMode === 'character'
    ? ['team', 'identity', 'character', 'preview']
    : ['team', 'identity', 'preview'];
  const currentIndex = steps.indexOf(step);

  const next = async () => {
    if (step === 'team') onStep('identity');
    else if (step === 'identity') {
      if (selectedMode === 'photo') await onPickPhoto();
      else onStep('character');
    } else if (step === 'character') onStep('preview');
    else onConfirm();
  };

  const primaryLabel =
    step === 'team'
      ? 'Continue'
      : step === 'identity'
        ? selectedMode === 'photo' ? 'Upload photo' : 'Choose character'
        : step === 'character'
          ? 'Preview identity'
          : firstRun ? 'Enter Stackr' : 'Save identity';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={firstRun ? undefined : onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <StackrBackdrop />
        <View style={{ flex: 1, padding: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
            <View style={{ flex: 1 }}>
              <StackrPageTitle title={firstRun ? 'Create Identity' : 'Edit Identity'} accentText="Identity" numberOfLines={1} />
              <Text style={{ color: theme.colors.textSoft, fontSize: 13, lineHeight: 18, fontWeight: '700', marginTop: 2 }}>
                Team, photo and character cosmetics.
              </Text>
            </View>
            {!firstRun && (
              <TouchableOpacity
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close identity editor"
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 15,
                  backgroundColor: '#FFFFFF',
                  borderWidth: 1,
                  borderColor: '#E8E1FF',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: theme.colors.text, fontSize: 18, lineHeight: 20, fontWeight: '900' }}>X</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
            {steps.map((item, index) => {
              const active = item === step;
              const done = index < currentIndex;
              const label = item === 'team' ? 'Team' : item === 'identity' ? 'Identity' : item === 'character' ? 'Character' : 'Preview';
              return (
                <TouchableOpacity
                  key={item}
                  disabled={!done && !active}
                  onPress={() => onStep(item)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active, disabled: !done && !active }}
                  style={{
                    flex: 1,
                    minHeight: 34,
                    borderRadius: 999,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: active ? theme.colors.primary : done ? '#F7F3FF' : 'rgba(255,255,255,0.62)',
                    borderWidth: 1,
                    borderColor: active ? theme.colors.primary : '#E8E1FF',
                  }}
                >
                  <Text style={{ color: active ? '#FFFFFF' : done ? theme.colors.primary : theme.colors.textSoft, fontSize: 11, lineHeight: 13, fontWeight: '900' }}>
                    {done ? `✓ ${label}` : label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
            {step === 'team' && (
              <View style={{ gap: 12 }}>
                {STACKR_PROFILE_TEAMS.map((team) => {
                  const active = team.key === selectedTeam.key;
                  return (
                    <TouchableOpacity
                      key={team.key}
                      onPress={() => onTeam(team.key)}
                      activeOpacity={0.86}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`Choose ${team.label} team`}
                      style={{
                        minHeight: 126,
                        borderRadius: 26,
                        padding: 14,
                        backgroundColor: active ? team.softColor : 'rgba(255,255,255,0.84)',
                        borderWidth: active ? 2 : 1,
                        borderColor: active ? team.color : '#E8E1FF',
                        shadowColor: team.color,
                        shadowOpacity: active ? 0.18 : 0.06,
                        shadowRadius: active ? 18 : 8,
                        shadowOffset: { width: 0, height: 8 },
                        elevation: active ? 4 : 1,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                        <TeamCrest team={team} size={96} active={active} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: theme.colors.text, fontSize: 20, lineHeight: 24, fontWeight: '900' }}>
                            {team.label}
                          </Text>
                          <Text style={{ color: theme.colors.textSoft, fontSize: 13, lineHeight: 18, fontWeight: '700', marginTop: 5 }}>
                            {team.tagline}
                          </Text>
                        </View>
                        {active && (
                          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: team.color, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ color: '#FFFFFF', fontSize: 16, lineHeight: 18, fontWeight: '900' }}>✓</Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {step === 'identity' && (
              <View style={{ gap: 12 }}>
                <TouchableOpacity
                  onPress={() => onMode('photo')}
                  activeOpacity={0.86}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectedMode === 'photo' }}
                  style={{
                    borderRadius: 26,
                    padding: 16,
                    minHeight: 132,
                    backgroundColor: selectedMode === 'photo' ? selectedTeam.softColor : '#FFFFFF',
                    borderWidth: selectedMode === 'photo' ? 2 : 1,
                    borderColor: selectedMode === 'photo' ? selectedTeam.color : '#E8E1FF',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 14,
                  }}
                >
                  <View style={{ width: 74, height: 74, borderRadius: 24, backgroundColor: '#F7F3FF', alignItems: 'center', justifyContent: 'center' }}>
                    <HeroIcon icon="profile" size={48} label="" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 19, lineHeight: 24, fontWeight: '900' }}>
                      Upload your own photo
                    </Text>
                    <Text style={{ color: theme.colors.textSoft, fontSize: 13, lineHeight: 18, fontWeight: '700', marginTop: 4 }}>
                      Use a personal image and keep your team cosmetics.
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => onMode('character')}
                  activeOpacity={0.86}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectedMode === 'character' }}
                  style={{
                    borderRadius: 26,
                    padding: 16,
                    minHeight: 132,
                    backgroundColor: selectedMode === 'character' ? selectedTeam.softColor : '#FFFFFF',
                    borderWidth: selectedMode === 'character' ? 2 : 1,
                    borderColor: selectedMode === 'character' ? selectedTeam.color : '#E8E1FF',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 14,
                  }}
                >
                  <View style={{ width: 80, height: 80, borderRadius: 26, backgroundColor: selectedTeam.softColor, borderWidth: 1, borderColor: selectedTeam.accent, alignItems: 'center', justifyContent: 'center' }}>
                    <TeamCrest team={selectedTeam} active={selectedMode === 'character'} size={66} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 19, lineHeight: 24, fontWeight: '900' }}>
                      Use a Stackr character
                    </Text>
                    <Text style={{ color: theme.colors.textSoft, fontSize: 13, lineHeight: 18, fontWeight: '700', marginTop: 4 }}>
                      Pick an individual {selectedTeam.label} character for your hero.
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}

            {step === 'character' && (
              <View>
                <View style={{ borderRadius: 26, padding: 15, backgroundColor: selectedTeam.softColor, borderWidth: 1, borderColor: selectedTeam.accent, marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <TeamCrest team={selectedTeam} active size={78} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.colors.text, fontSize: 18, lineHeight: 23, fontWeight: '900' }}>
                        {selectedTeam.label} characters
                      </Text>
                      <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 2 }}>
                        Individual transparent portraits, matched to your team crest.
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 11 }}>
                  {avatars.map((avatar) => {
                    const active = selectedAvatar?.key === avatar.key;
                    return (
                      <TouchableOpacity
                        key={avatar.key}
                        onPress={() => onAvatar(avatar.key)}
                        activeOpacity={0.86}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`Choose ${avatar.label}, ${selectedTeam.label} Stackr character`}
                        style={{
                          width: '30.8%',
                          aspectRatio: 0.86,
                          borderRadius: 24,
                          backgroundColor: active ? selectedTeam.softColor : '#FFFFFF',
                          borderWidth: active ? 2 : 1,
                          borderColor: active ? selectedTeam.color : '#E8E1FF',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: 8,
                          shadowColor: selectedTeam.color,
                          shadowOpacity: active ? 0.18 : 0.06,
                          shadowRadius: active ? 14 : 8,
                          shadowOffset: { width: 0, height: 7 },
                        }}
                      >
                        <ProfileAvatarFrame
                          size={82}
                          stackrAvatar={avatar}
                          initials={initials}
                          borderColor={active ? selectedTeam.color : '#FFFFFF'}
                          backgroundColor={selectedTeam.softColor}
                          variant="picker"
                        />
                        <Text
                          style={{ color: theme.colors.textSoft, fontSize: 10.5, lineHeight: 13, fontWeight: '900', marginTop: 8, textAlign: 'center' }}
                          numberOfLines={2}
                        >
                          {avatar.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {step === 'preview' && (
              <View style={{ gap: 14 }}>
                <LinearGradient
                  colors={[selectedTeam.softColor, '#FFFFFF']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    borderRadius: 30,
                    padding: 18,
                    borderWidth: 1,
                    borderColor: selectedTeam.accent,
                    overflow: 'hidden',
                    shadowColor: selectedTeam.color,
                    shadowOpacity: 0.16,
                    shadowRadius: 18,
                    shadowOffset: { width: 0, height: 10 },
                  }}
                >
                  <StackrHeroBackdrop opacity={0.10} />
                  <View style={{ alignItems: 'center' }}>
                    <ProfileAvatarFrame
                      size={150}
                      avatarUrl={selectedPhotoUri}
                      stackrAvatar={selectedPhotoUri ? null : selectedAvatar}
                      initials={initials}
                      borderColor={selectedTeam.color}
                      backgroundColor={selectedTeam.softColor}
                      variant="hero"
                    />
                    <Text style={{ color: theme.colors.text, fontSize: 26, lineHeight: 31, fontWeight: '900', marginTop: 14 }} numberOfLines={1}>
                      {collectorName}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 10 }}>
                      <TeamCrest team={selectedTeam} active size={76} />
                      <Text style={{ color: selectedTeam.color, fontSize: 13, lineHeight: 16, fontWeight: '900', textTransform: 'uppercase' }}>
                        {selectedTeam.label}
                      </Text>
                    </View>
                  </View>
                </LinearGradient>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <ActionPill label="Change Team" icon="market" onPress={() => onStep('team')} />
                  <ActionPill label="Reset" icon="settings" onPress={onReset} />
                </View>
              </View>
            )}
          </ScrollView>

          <View style={{ flexDirection: 'row', gap: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#E8E1FF' }}>
            {currentIndex > 0 && (
              <TouchableOpacity
                onPress={() => onStep(steps[Math.max(0, currentIndex - 1)])}
                disabled={saving}
                activeOpacity={0.84}
                style={{ flex: 0.8, minHeight: 50, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F3FF', borderWidth: 1, borderColor: '#E8E1FF' }}
              >
                <Text style={{ color: theme.colors.primary, fontSize: 13, lineHeight: 16, fontWeight: '900' }}>
                  Back
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={next}
              disabled={saving}
              activeOpacity={0.86}
              style={{ flex: 1, minHeight: 50, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primary, opacity: saving ? 0.68 : 1 }}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={{ color: '#FFFFFF', fontSize: 14, lineHeight: 17, fontWeight: '900' }}>
                  {primaryLabel}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

export default function ProfileScreen() {
  const { theme } = useTheme();
  const { mode, setMode } = useAppMode();
  const { profile, loading, refreshProfile, updateProfile } = useProfile();
  const { unlocks, refreshAchievements } = useAchievements();

  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<ProfileStats>(initialStats);
  const [unreadCount, setUnreadCount] = useState(0);
  const [favoriteCard, setFavoriteCard] = useState<ShowcaseDisplayCard | null>(null);
  const [chaseCard, setChaseCard] = useState<ShowcaseDisplayCard | null>(null);
  const [grailCard, setGrailCard] = useState<ShowcaseDisplayCard | null>(null);
  const [slabCard, setSlabCard] = useState<ShowcaseDisplayCard | null>(null);
  const [identityVisible, setIdentityVisible] = useState(false);
  const [identityFirstRun, setIdentityFirstRun] = useState(false);
  const [identityStep, setIdentityStep] = useState<IdentityStep>('team');
  const [identityMode, setIdentityMode] = useState<IdentityMode>('character');
  const [identityTeam, setIdentityTeam] = useState<StackrProfileTeamKey>('light');
  const [identityAvatarKey, setIdentityAvatarKey] = useState<string | null>(null);
  const [identityPhotoUri, setIdentityPhotoUri] = useState<string | null>(null);
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const profileTeam = useMemo(() => getProfileTeam(profile?.pokemon_type) ?? STACKR_PROFILE_TEAMS[0], [profile?.pokemon_type]);
  const stackrAvatar = useMemo(() => getProfileAvatar(profile?.avatar_preset) ?? null, [profile?.avatar_preset]);
  const selectedTeam = useMemo(() => getProfileTeam(identityTeam) ?? STACKR_PROFILE_TEAMS[0], [identityTeam]);
  const selectedAvatar = useMemo(() => getProfileAvatar(identityAvatarKey) ?? null, [identityAvatarKey]);
  const initials = getProfileInitials(profile?.collector_name);
  const collectorName = profile?.collector_name ?? 'Stackr Collector';
  const progression = useMemo(() => calculateProgression(stats, unlocks), [stats, unlocks]);
  const unlockMap = useMemo(() => new Map(unlocks.map((unlock) => [unlock.id, unlock])), [unlocks]);
  const nextAchievement = useMemo(() => ACHIEVEMENTS.find((achievement) => !unlockMap.has(achievement.id)) ?? null, [unlockMap]);
  const achievementPreview = useMemo(() => {
    const completed = unlocks.slice(0, 3);
    if (!nextAchievement) return completed;
    return [...completed, nextAchievement];
  }, [nextAchievement, unlocks]);
  const resetIdentityDraft = useCallback(() => {
    const teamKey = getProfileTeam(profile?.pokemon_type)?.key ?? 'light';
    const hasPhoto = Boolean(profile?.avatar_url);
    const firstAvatar = getProfileAvatarsForTeam(teamKey)[0]?.key ?? null;
    setIdentityTeam(teamKey);
    setIdentityPhotoUri(profile?.avatar_url ?? null);
    setIdentityAvatarKey(hasPhoto ? null : profile?.avatar_preset ?? firstAvatar);
    setIdentityMode(hasPhoto ? 'photo' : 'character');
    setIdentityStep('team');
  }, [profile?.avatar_preset, profile?.avatar_url, profile?.pokemon_type]);

  const openIdentityEditor = useCallback((firstRun = false) => {
    resetIdentityDraft();
    setIdentityFirstRun(firstRun);
    setIdentityVisible(true);
  }, [resetIdentityDraft]);

  const closeIdentityEditor = useCallback(() => {
    if (identityFirstRun) return;
    setIdentityVisible(false);
    resetIdentityDraft();
  }, [identityFirstRun, resetIdentityDraft]);

  useEffect(() => {
    resetIdentityDraft();
  }, [resetIdentityDraft]);

  useEffect(() => {
    let mounted = true;
    const maybeOpenOnboarding = async () => {
      if (!profile) return;
      const seen = await AsyncStorage.getItem(IDENTITY_ONBOARDING_KEY);
      const hasIdentity = Boolean(profile.pokemon_type && (profile.avatar_url || profile.avatar_preset));
      if (!mounted || seen === 'true' || hasIdentity) return;
      openIdentityEditor(true);
    };
    maybeOpenOnboarding();
    return () => {
      mounted = false;
    };
  }, [openIdentityEditor, profile]);

  const handleSelectTeam = useCallback((teamKey: StackrProfileTeamKey) => {
    setIdentityTeam(teamKey);
    if (identityMode === 'character') {
      setIdentityAvatarKey(getProfileAvatarsForTeam(teamKey)[0]?.key ?? null);
      setIdentityPhotoUri(null);
    }
  }, [identityMode]);

  const handleMode = useCallback((nextMode: IdentityMode) => {
    setIdentityMode(nextMode);
    if (nextMode === 'character') {
      setIdentityPhotoUri(null);
      setIdentityAvatarKey((current) => {
        const currentAvatar = getProfileAvatar(current);
        if (currentAvatar?.team === identityTeam) return current;
        return getProfileAvatarsForTeam(identityTeam)[0]?.key ?? null;
      });
    }
  }, [identityTeam]);

  const handlePickPhoto = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo access needed', 'Allow photo access to choose a custom profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      const persistedUri = await persistProfilePhoto(result.assets[0].uri);
      setIdentityMode('photo');
      setIdentityPhotoUri(persistedUri);
      setIdentityAvatarKey(null);
      setIdentityStep('preview');
    }
  }, []);

  const resetToTeamCharacter = useCallback(() => {
    setIdentityMode('character');
    setIdentityPhotoUri(null);
    setIdentityAvatarKey(getProfileAvatarsForTeam(identityTeam)[0]?.key ?? null);
  }, [identityTeam]);

  const handleSaveIdentity = useCallback(async () => {
    try {
      setSavingIdentity(true);
      const result = await updateProfile({
        pokemon_type: identityTeam,
        avatar_url: identityPhotoUri,
        avatar_preset: identityPhotoUri ? null : identityAvatarKey,
      });

      if (result?.error) {
        Alert.alert('Could not save identity', result.error.message ?? String(result.error));
        return;
      }

      await AsyncStorage.setItem(IDENTITY_ONBOARDING_KEY, 'true');
      setIdentityVisible(false);
      setIdentityFirstRun(false);
    } finally {
      setSavingIdentity(false);
    }
  }, [identityAvatarKey, identityPhotoUri, identityTeam, updateProfile]);

  const loadShowcaseCards = useCallback(async () => {
    if (!profile) return;
    try {
      const localShowcase = await loadProfileShowcase(profile.id);
      const loadCard = async (cardId?: string | null, setId?: string | null) => {
        if (!cardId || !setId) return null;
        const { getCachedCardSync, getCachedCardsForSet } = await import('../../lib/pokemonTcgCache');
        let found = getCachedCardSync(setId, cardId);
        if (!found) {
          const cards = await getCachedCardsForSet(setId);
          found = cards.find((card) => card.id === cardId) ?? null;
        }
        return found ?? null;
      };
      const mergeCard = (fresh: any | null, fallback?: ProfileShowcaseCard | null) => {
        if (!fresh) return fallback ?? null;
        return {
          ...fresh,
          imageUri: fallback?.imageUri ?? fresh.images?.small ?? fresh.images?.large ?? null,
          estimatedValueGbp: fallback?.estimatedValueGbp ?? null,
          showcaseKind: fallback?.showcaseKind ?? 'card',
        };
      };

      const [favorite, chase] = await Promise.all([
        loadCard(profile.favorite_card_id, profile.favorite_set_id),
        loadCard(profile.chase_card_id, profile.chase_set_id),
      ]);
      setFavoriteCard(mergeCard(favorite, localShowcase.favorite));
      setChaseCard(mergeCard(chase, localShowcase.chase));
      setGrailCard(localShowcase.grail ?? null);
      setSlabCard(localShowcase.slab ?? null);
    } catch (error) {
      console.log('Failed to load profile showcase cards', error);
    }
  }, [profile]);

  const loadStats = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [
        collectionSummary,
        tradesResult,
        notificationsResult,
        listingsResult,
        inventoryResult,
        salesResult,
        draftSummary,
      ] = await Promise.all([
        getCollectionSummary({ forceRefresh: true }),
        supabase.from('trade_offers').select('status').or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`),
        supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('read', false),
        supabase.from('user_card_flags').select('id, listing_price, listing_status', { count: 'exact' }).eq('user_id', user.id),
        supabase.from('seller_inventory_items').select('quantity').eq('user_id', user.id),
        supabase.from('seller_sale_transactions').select('sold_price').eq('user_id', user.id),
        readCreateListingDraftSummary().catch(() => null),
      ]);

      const completedTrades = (tradesResult.data ?? []).filter((trade: any) => trade.status === 'completed').length;
      const activeListings = listingsResult.error
        ? null
        : (listingsResult.data ?? []).filter((row: any) => row.listing_status == null || row.listing_status === 'active').length;
      const inventoryQuantity = inventoryResult.error
        ? null
        : (inventoryResult.data ?? []).reduce((sum: number, row: any) => sum + Number(row.quantity ?? 0), 0);
      const sales = salesResult.error ? null : salesResult.data?.length ?? 0;

      setStats({
        binderCount: collectionSummary.binderCount,
        ownedCount: collectionSummary.totalCardsOwned,
        completedSets: collectionSummary.completedSets,
        collectionValue: collectionSummary.collectionValue,
        tradeCount: completedTrades,
        sellerListings: activeListings,
        sellerDrafts: draftSummary ? 1 : 0,
        sellerSales: sales,
        sellerInventory: inventoryQuantity,
      });
      setUnreadCount(notificationsResult.count ?? 0);
    } catch (error) {
      console.log('Failed to load profile stats', error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadStats();
      loadShowcaseCards();
      refreshAchievements();
    }, [loadShowcaseCards, loadStats, refreshAchievements])
  );

  const handleRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await Promise.all([refreshProfile(), refreshAchievements(), loadStats(), loadShowcaseCards()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadShowcaseCards, loadStats, refreshAchievements, refreshProfile]);

  const handleLogout = useCallback(async () => {
    try {
      setLoggingOut(true);
      const { error } = await supabase.auth.signOut();
      if (error) {
        Alert.alert('Logout failed', error.message);
        return;
      }
      router.replace('/login');
    } catch {
      Alert.alert('Logout failed', 'Something went wrong. Please try again.');
    } finally {
      setLoggingOut(false);
    }
  }, []);

  const exitSellerMode = useCallback(async () => {
    await setMode('collector');
    router.replace(ROUTES.home as any);
  }, [setMode]);

  const confirmLogout = useCallback(() => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: handleLogout },
    ]);
  }, [handleLogout]);

  const openShowcaseSearch = useCallback((slot: ProfileShowcaseSlot) => {
    const config = getProfileShowcaseSearchConfig(slot);
    router.push({
      pathname: '/(tabs)/search',
      params: {
        profileShowcaseSlot: slot,
        category: config.category,
      },
    } as any);
  }, []);

  const handleShowcasePress = useCallback((slot: ProfileShowcaseSlot, card: ShowcaseDisplayCard | null) => {
    if (!card) {
      openShowcaseSearch(slot);
      return;
    }

    const actions: any[] = [
      {
        text: 'View card',
        onPress: () => router.push({ pathname: '/card/[id]', params: { id: card.id, setId: card.setId ?? card.set?.id ?? undefined } } as any),
      },
      {
        text: 'Replace',
        onPress: () => openShowcaseSearch(slot),
      },
      {
        text: 'Remove from showcase',
        style: 'destructive',
        onPress: async () => {
          if (!profile) return;
          try {
            await removeProfileShowcaseCard(profile.id, slot);
            if (slot === 'favorite') setFavoriteCard(null);
            if (slot === 'chase') setChaseCard(null);
            if (slot === 'grail') setGrailCard(null);
            if (slot === 'slab') setSlabCard(null);
            await refreshProfile();
          } catch (error: any) {
            Alert.alert('Could not update showcase', error?.message ?? 'Please try again.');
          }
        },
      },
    ];

    actions.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(card.name ?? 'Showcase card', 'Choose what you want to do with this showcase slot.', actions);
  }, [openShowcaseSearch, profile, refreshProfile]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <StackrBackdrop />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.colors.primary} size="large" />
          <Text style={{ color: theme.colors.textSoft, marginTop: 12, fontWeight: '800' }}>
            Loading profile...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <StackrBackdrop />
        <View style={{ flex: 1, padding: 22, alignItems: 'center', justifyContent: 'center' }}>
          <HeroIcon icon="profile" size={72} label="" />
          <Text style={{ color: theme.colors.text, fontSize: 20, lineHeight: 25, fontWeight: '900', marginTop: 14 }}>
            No profile found
          </Text>
          <Text style={{ color: theme.colors.textSoft, fontSize: 13, lineHeight: 18, fontWeight: '700', textAlign: 'center', marginTop: 6 }}>
            Complete your Stackr profile setup to continue.
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/profile/setup')}
            activeOpacity={0.84}
            style={{ marginTop: 18, minHeight: 48, borderRadius: 18, backgroundColor: theme.colors.primary, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 14, lineHeight: 17, fontWeight: '900' }}>
              Set up profile
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={confirmLogout}
            disabled={loggingOut}
            activeOpacity={0.84}
            style={{ marginTop: 12, minHeight: 46, borderRadius: 18, backgroundColor: '#FFECEC', paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' }}
          >
            {loggingOut ? (
              <ActivityIndicator color="#D92D20" />
            ) : (
              <Text style={{ color: '#D92D20', fontSize: 13, lineHeight: 16, fontWeight: '900' }}>
                Log out
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg, overflow: 'hidden' }}>
      <StackrBackdrop />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: stackrTabContentPadding.standard }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.primary} />}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <StackrPageTitle title="Profile" accentText="file" />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <IconButton icon="notifications" label="Open notifications" badge={unreadCount} onPress={() => router.push(ROUTES.notifications as any)} />
            <IconButton icon="settings" label="Open Settings" onPress={() => router.push(ROUTES.settings as any)} />
          </View>
        </View>

        <LinearGradient
          colors={[profileTeam.softColor, '#FFFFFF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: 32,
            padding: 16,
            borderWidth: 1,
            borderColor: profileTeam.accent,
            overflow: 'hidden',
            shadowColor: profileTeam.color,
            shadowOpacity: 0.16,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 14 },
            elevation: 5,
            marginBottom: 20,
          }}
        >
          <StackrHeroBackdrop opacity={0.12} />
          <View style={{ alignItems: 'center' }}>
            <ProfileAvatarFrame
              size={150}
              avatarUrl={profile.avatar_url}
              stackrAvatar={stackrAvatar}
              initials={initials}
              borderColor={profileTeam.color}
              backgroundColor={profileTeam.softColor}
              variant="hero"
            />
            <TouchableOpacity
              onPress={() => openIdentityEditor(false)}
              activeOpacity={0.84}
              accessibilityRole="button"
              accessibilityLabel="Edit identity"
              style={{
                minHeight: 34,
                borderRadius: 999,
                backgroundColor: theme.colors.primary,
                paddingHorizontal: 13,
                marginTop: 10,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <HeroIcon icon="profile" size={16} label="" />
              <Text style={{ color: '#FFFFFF', fontSize: 11.5, lineHeight: 15, fontWeight: '900' }}>
                Edit identity
              </Text>
            </TouchableOpacity>

            <Text style={{ color: theme.colors.text, fontSize: 28, lineHeight: 34, fontWeight: '900', textAlign: 'center', marginTop: 12 }} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.78}>
              {collectorName}
            </Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 14, lineHeight: 19, fontWeight: '800', marginTop: 2, textAlign: 'center' }} numberOfLines={1}>
              Level {progression.level} Collector
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 10, maxWidth: '100%' }}>
              <TeamCrest team={profileTeam} active size={72} />
              <Text style={{ color: profileTeam.color, fontSize: 13, lineHeight: 17, fontWeight: '900', textTransform: 'uppercase', textAlign: 'left', flexShrink: 1 }} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.82}>
                Team {profileTeam.label}
              </Text>
            </View>

            <View style={{ marginTop: 16, width: '100%' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                <Text style={{ color: theme.colors.text, fontSize: 15, lineHeight: 19, fontWeight: '900' }}>
                  Level {progression.level}
                </Text>
                <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 15, fontWeight: '800' }}>
                  {compactNumber(progression.current)} / {compactNumber(progression.needed)} XP
                </Text>
              </View>
              <ProgressBar progress={progression.progress} colour={theme.colors.primary} />
              <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 16, fontWeight: '800', marginTop: 6, textAlign: 'center' }}>
                {compactNumber(Math.max(0, progression.needed - progression.current))} XP to Level {progression.level + 1}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
            <StatChip icon="valuePounds" label="Collection Value" value={money(stats.collectionValue)} />
            <StatChip icon="rawCard" label="Cards" value={stats.ownedCount} />
            <StatChip icon="achievements" label="Completed Sets" value={stats.completedSets} />
          </View>
        </LinearGradient>
        <View style={{ marginBottom: 26 }}>
          <SectionHeader title="Your Showcase" subtitle="Choose the cards that define your collection." />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <ShowcaseCabinet title="Favourite Card" subtitle="Show the card that represents your collection." card={favoriteCard} icon="favorite" onPress={() => handleShowcasePress('favorite', favoriteCard)} />
            <ShowcaseCabinet title="Chase Card" subtitle="Choose the card you are currently hunting." card={chaseCard} icon="chase" onPress={() => handleShowcasePress('chase', chaseCard)} />
            <ShowcaseCabinet title="Grail" subtitle="Add the card you are proudest to chase." card={grailCard} icon="achievements" onPress={() => handleShowcasePress('grail', grailCard)} />
            <ShowcaseCabinet title="Favourite Slab" subtitle="Showcase a graded card from your vault." card={slabCard} icon="slab" onPress={() => handleShowcasePress('slab', slabCard)} />
          </View>
        </View>

        <View style={{ marginBottom: 26 }}>
          <SectionHeader title="Collector Journey" />
          <View style={{ borderRadius: 26, padding: 16, backgroundColor: 'rgba(255,255,255,0.86)', borderWidth: 1, borderColor: '#E8E1FF', overflow: 'hidden' }}>
            <StackrHeroBackdrop opacity={0.07} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
              <View style={{ width: 64, height: 64, borderRadius: 22, backgroundColor: '#F7F3FF', borderWidth: 1, borderColor: '#E8E1FF', alignItems: 'center', justifyContent: 'center' }}>
                <HeroIcon icon="progress" size={42} label="" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.text, fontSize: 21, lineHeight: 26, fontWeight: '900' }}>
                  Level {progression.level}
                </Text>
                <Text style={{ color: theme.colors.textSoft, fontSize: 12.5, lineHeight: 17, fontWeight: '700', marginTop: 2 }}>
                  {compactNumber(Math.max(0, progression.needed - progression.current))} XP remaining
                </Text>
              </View>
            </View>
            <View style={{ marginTop: 14 }}>
              <ProgressBar progress={progression.progress} colour={theme.colors.primary} />
            </View>
            <View style={{ gap: 10, marginTop: 14 }}>
              <View style={{ borderRadius: 18, padding: 12, backgroundColor: '#F7F3FF', borderWidth: 1, borderColor: '#E8E1FF', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <HeroIcon icon="profile" size={34} label="" />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.text, fontSize: 14, lineHeight: 18, fontWeight: '900' }}>
                    Next unlock
                  </Text>
                  <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 16, fontWeight: '700', marginTop: 2 }}>
                    Level {progression.level + 1} · {progression.nextUnlock}
                  </Text>
                </View>
              </View>
              {unlocks[0] ? (
                <View style={{ borderRadius: 18, padding: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E8E1FF', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <HeroIcon icon={getAchievementIcon(unlocks[0])} size={34} label="" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 14, lineHeight: 18, fontWeight: '900' }}>
                      Recent milestone
                    </Text>
                    <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 16, fontWeight: '700', marginTop: 2 }}>
                      {unlocks[0].title}
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        <View style={{ marginBottom: 26 }}>
          <SectionHeader
            title="Achievements"
            action={
              <TouchableOpacity onPress={() => router.push('/achievements' as any)} accessibilityRole="button" accessibilityLabel="View all achievements">
                <Text style={{ color: theme.colors.primary, fontSize: 12, lineHeight: 15, fontWeight: '900' }}>
                  View all
                </Text>
              </TouchableOpacity>
            }
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {achievementPreview.map((achievement) => (
              <AchievementBadge key={achievement.id} achievement={achievement} unlocked={unlockMap.get(achievement.id)} />
            ))}
          </View>
        </View>

        <View style={{ marginBottom: 24 }}>
          <SectionHeader title="Seller Identity" />
          <SellerModule
            enabled={mode === 'seller'}
            stats={stats}
            onSetup={() => setMode('seller')}
            onOpen={() => router.push(ROUTES.sellerDashboard as any)}
            onSettings={() => router.push(ROUTES.settings as any)}
            onExit={exitSellerMode}
          />
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 18, marginBottom: 18 }}>
          {['Settings', 'Privacy', 'Help'].map((label) => (
            <TouchableOpacity
              key={label}
              onPress={() => router.push(ROUTES.settings as any)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${label}`}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 15, fontWeight: '900' }}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <IdentityFlowModal
        visible={identityVisible}
        firstRun={identityFirstRun}
        collectorName={collectorName}
        initials={initials}
        selectedTeam={selectedTeam}
        selectedMode={identityMode}
        selectedAvatar={selectedAvatar}
        selectedPhotoUri={identityPhotoUri}
        saving={savingIdentity}
        step={identityStep}
        onClose={closeIdentityEditor}
        onStep={setIdentityStep}
        onTeam={handleSelectTeam}
        onMode={handleMode}
        onAvatar={(avatarKey) => {
          setIdentityMode('character');
          setIdentityPhotoUri(null);
          setIdentityAvatarKey(avatarKey);
        }}
        onPickPhoto={handlePickPhoto}
        onReset={resetToTeamCharacter}
        onConfirm={handleSaveIdentity}
      />
    </SafeAreaView>
  );
}
