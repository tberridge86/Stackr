import { router } from 'expo-router';
import { useTheme } from '../../../components/theme-context';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Image,
  Pressable,
  TextInput,
  Modal,
  Alert,
  ScrollView,
  Linking,
} from 'react-native';
import { Text } from '../../../components/Text';
import { FeatureTipGate } from '../../../components/FeatureTipModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AVATAR_PRESETS } from '../../../lib/avatars';
import { BinderArtwork } from '../../../components/BinderArtwork';
import { supabase } from '../../../lib/supabase';
import { getMyFriends } from '../../../lib/friends';
import { useProfile } from '../../../components/profile-context';
import { StackrBackdrop, StackrHeroBackdrop } from '../../../components/StackrBackdrop';
import { StackrCardActionIcon } from '../../../components/StackrScreen';
import { RARITY_SYMBOL_CARD_OVERLAY, RaritySymbol } from '../../../components/RaritySymbol';
import { stackrIcons } from '../../../lib/stackrIcons';
import { stackrTabContentPadding } from '../../../lib/stackrSizing';
import { fetchStackrCardRows } from '../../../lib/stackrDomainAdapter';

type FeedMode = 'global' | 'friends';
type SocialTab = 'Social' | 'Flex' | 'Trades' | 'Local' | 'News';
type LocalFilter = 'Stores' | 'Meet ups' | 'Trade nights';
type CommunityChannelKey =
  | 'all'
  | 'social'
  | 'question'
  | 'flex'
  | 'binder_flex'
  | 'chase_flex'
  | 'slab_flex'
  | 'milestone'
  | 'trade_talk'
  | 'deal_check'
  | 'looking_for_trade'
  | 'trade_win';

type SocialPost = {
  id: string;
  user_id: string;
  post_type: string;
  body: string | null;
  binder_id: string | null;
  card_id: string | null;
  set_id: string | null;
  created_at: string;
};

type ProfilePreview = {
  id: string;
  collector_name: string | null;
  avatar_preset: string | null;
};

type CardPreview = {
  id: string;
  name: string;
  set_id: string;
  image_small: string | null;
  image_large: string | null;
  raw_data?: any;
};

type OwnedCardOption = {
  binder_id: string | null;
  binder_name?: string | null;
  card_id: string;
  set_id: string;
  card?: CardPreview | null;
};

type BinderOption = {
  id: string;
  name: string;
  type?: string | null;
  is_public?: boolean | null;
  cover_key?: string | null;
  source_set_id?: string | null;
  language?: string | null;
};

type FlexPickerMode = 'binder' | 'chase' | 'trade' | 'slab' | null;

type LocalStore = {
  id: string;
  name: string;
  description: string | null;
  town: string | null;
  postcode: string | null;
  website_url: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

type LocalFeaturedEvent = {
  id: string;
  title: string;
  description: string | null;
  venue_name: string | null;
  town: string | null;
  postcode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  starts_at: string | null;
  external_url: string | null;
};

type LocalMeetup = {
  id: string;
  title: string;
  description: string | null;
  location_name: string;
  town: string | null;
  postcode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  starts_at: string | null;
  created_by: string;
};

type CommunityNewsItem = {
  id: string;
  title: string;
  body: string;
  category: string | null;
  icon: keyof typeof Ionicons.glyphMap;
  external_url: string | null;
  source_name: string | null;
  published_at: string | null;
};

type CommunityChannel = {
  key: CommunityChannelKey;
  label: string;
  shortLabel?: string;
  icon: keyof typeof Ionicons.glyphMap;
  prompt: string;
  postType?: string;
};
type LiveLocalPlace = {
  place_id: string;
  name: string;
  formatted_address: string;
  category?: string;
  latitude?: number;
  longitude?: number;
  website_url?: string | null;
  phone?: string | null;
  opening_hours?: string | null;
  distance_miles?: number | null;
};
type LocalPoint = {
  label: string;
  latitude: number;
  longitude: number;
};
type SelectedShop = LiveLocalPlace | LocalStore;

const LOCAL_TCG_KEYWORDS = [
  'pokemon',
  'pokémon',
  'tcg',
  'trading card',
  'trading cards',
  'collectible card',
  'collectable card',
  'card game',
  'magic the gathering',
  'mtg',
  'yu-gi-oh',
  'yugioh',
  'lorcana',
  'flesh and blood',
  'one piece card',
  'digimon card',
  'card shop',
  'game store',
  'games store',
  'tabletop',
  'board game',
  'comics',
  'comic',
  'hobby',
];

const LOCAL_STRONG_SHOP_TAGS = ['games', 'collector', 'hobby', 'comics'];
const LOCAL_EXCLUDED_AMENITIES = ['place_of_worship', 'church', 'community_centre', 'school'];
const LOCAL_EXCLUDED_NAME_WORDS = ['church', 'chapel', 'parish', 'mosque', 'temple', 'synagogue'];

const POST_FEED_TABS: SocialTab[] = ['Social', 'Flex', 'Trades'];

const COMMUNITY_CHANNELS: Record<Exclude<SocialTab, 'Local' | 'News'>, CommunityChannel[]> = {
  Social: [
    { key: 'all', label: 'All chat', shortLabel: 'All', icon: 'chatbubbles-outline', prompt: 'Start a collector chat, ask a question, or share what you are working on.' },
    { key: 'social', label: 'Social', icon: 'people-outline', prompt: 'What are you collecting, opening, sorting, or chasing today?', postType: 'social' },
    { key: 'question', label: 'Questions', icon: 'help-circle-outline', prompt: 'Ask the community about variants, pricing, storage, grading or binder choices.', postType: 'question' },
    { key: 'flex', label: 'Flex talk', icon: 'sparkles-outline', prompt: 'Show the story behind a pull, binder page or collection moment.', postType: 'general' },
  ],
  Flex: [
    { key: 'all', label: 'All flexes', shortLabel: 'All', icon: 'sparkles-outline', prompt: 'Post a card, binder, slab or milestone you want collectors to react to.' },
    { key: 'binder_flex', label: 'Binder Flex', icon: 'albums-outline', prompt: 'Show a binder page, master set push or completion progress.', postType: 'binder_showcase' },
    { key: 'chase_flex', label: 'Chase Cards', icon: 'sparkles-outline', prompt: 'Show the chase, the pull, or the card you finally landed.', postType: 'card_showcase' },
    { key: 'slab_flex', label: 'Slabs', icon: 'id-card-outline', prompt: 'Share a slab return, grade result or label win.', postType: 'slab_flex' },
    { key: 'milestone', label: 'Milestones', icon: 'trophy-outline', prompt: 'Celebrate a completed set, grail pickup, value milestone or trade win.', postType: 'milestone' },
  ],
  Trades: [
    { key: 'all', label: 'All trades', shortLabel: 'All', icon: 'swap-horizontal-outline', prompt: 'Talk through trades, offers, fairness checks and collector deal ideas.' },
    { key: 'trade_talk', label: 'Trade Talk', icon: 'chatbubble-ellipses-outline', prompt: 'Talk through a possible swap and what would make it fair.', postType: 'trade_discussion' },
    { key: 'deal_check', label: 'Deal Check', icon: 'scale-outline', prompt: 'Ask if a card-for-card deal, condition gap or trade value feels fair.', postType: 'deal_check' },
    { key: 'looking_for_trade', label: 'Looking For', icon: 'search-outline', prompt: 'Tell collectors what you want and what you might move.', postType: 'looking_for_trade' },
    { key: 'trade_win', label: 'Trade Wins', icon: 'trophy-outline', prompt: 'Show a completed trade and what made it work.', postType: 'trade_win' },
  ],
};

const POST_TYPE_TO_CHANNEL: Record<string, CommunityChannelKey> = {
  general: 'social',
  social: 'social',
  question: 'question',
  card_showcase: 'chase_flex',
  binder_showcase: 'binder_flex',
  slab_flex: 'slab_flex',
  milestone: 'milestone',
  trade_discussion: 'trade_talk',
  deal_check: 'deal_check',
  looking_for_trade: 'looking_for_trade',
  trade_win: 'trade_win',
};

const DISCUSSION_STARTERS: Record<CommunityChannelKey, string[]> = {
  all: ['What would you do?', 'Any thoughts?', 'Who else is chasing this?'],
  social: ['What are you collecting next?', 'What are you sorting today?', 'Any binder plans?'],
  question: ['Anyone know the variant?', 'Would you grade this?', 'What would you check first?'],
  flex: ['Rate the pickup', 'Keep or move?', 'What page does this belong on?'],
  binder_flex: ['Showcase page?', 'What is missing?', 'Master set or normal set?'],
  chase_flex: ['Worth the chase?', 'Hold or trade up?', 'What would you pair with it?'],
  slab_flex: ['Grade match your expectation?', 'Crack, cross or hold?', 'Label choice working?'],
  milestone: ['Next goal?', 'Best card in the run?', 'How long did it take?'],
  trade_talk: ['Fair swap?', 'Who adds cash?', 'Which side wins?'],
  deal_check: ['Condition gap?', 'Market value fair?', 'Would you accept?'],
  looking_for_trade: ['What would you offer?', 'Any duplicates available?', 'Which card balances the trade?'],
  trade_win: ['Best part of the deal?', 'Would you do it again?', 'What did you move?'],
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasLocalKeyword(text: string) {
  return LOCAL_TCG_KEYWORDS.some((keyword) => {
    if (keyword.length <= 4) {
      return new RegExp(`(^|[^a-z0-9])${escapeRegExp(keyword)}([^a-z0-9]|$)`, 'i').test(text);
    }
    return text.includes(keyword);
  });
}

function looksLikeCardStore(tags: Record<string, any>) {
  const shop = String(tags.shop ?? '').toLowerCase();
  const amenity = String(tags.amenity ?? '').toLowerCase();
  const name = String(tags.name ?? '').toLowerCase();
  const searchableText = [
    tags.name,
    tags.shop,
    tags.amenity,
    tags.description,
    tags.brand,
    tags.website,
    tags['contact:website'],
  ].filter(Boolean).join(' ').toLowerCase();

  const strongShopTag = LOCAL_STRONG_SHOP_TAGS.some((tag) => shop.includes(tag));
  const relevantText = hasLocalKeyword(searchableText);
  const excludedAmenity = LOCAL_EXCLUDED_AMENITIES.includes(amenity);
  const excludedName = LOCAL_EXCLUDED_NAME_WORDS.some((word) =>
    new RegExp(`(^|[^a-z0-9])${word}([^a-z0-9]|$)`, 'i').test(name)
  );

  if ((excludedAmenity || excludedName) && !strongShopTag) return false;
  return strongShopTag || relevantText;
}

function isLiveLocalPlace(place: LiveLocalPlace | LocalStore | null): place is LiveLocalPlace {
  return !!place && 'formatted_address' in place;
}

function getLocalRadiusMiles(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 15;
  return Math.min(100, Math.max(1, parsed));
}

function getShopAddress(shop: SelectedShop | null) {
  if (!shop) return '';
  if (isLiveLocalPlace(shop)) return shop.formatted_address;
  return [shop.town, shop.postcode].filter(Boolean).join(' ');
}

function getShopWebsite(shop: SelectedShop | null) {
  if (!shop) return null;
  return isLiveLocalPlace(shop) ? shop.website_url ?? null : shop.website_url ?? null;
}

function getShopDistanceLabel(shop: SelectedShop | null, point: LocalPoint | null) {
  if (!shop) return null;
  if (isLiveLocalPlace(shop) && typeof shop.distance_miles === 'number') {
    return `${shop.distance_miles.toFixed(1)} mi away`;
  }
  const miles = distanceMiles(point, shop);
  return miles == null ? null : `${miles.toFixed(1)} mi away`;
}

function buildDirectionsUrl(shop: SelectedShop) {
  const destination = typeof shop.latitude === 'number' && typeof shop.longitude === 'number'
    ? `${shop.latitude},${shop.longitude}`
    : `${shop.name} ${getShopAddress(shop)}`.trim();

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`;
}

async function openExternalUrl(url: string) {
  const safeUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  await Linking.openURL(safeUrl);
}

function getTabChannels(tab: SocialTab): CommunityChannel[] {
  if (tab === 'Local' || tab === 'News') return [];
  return COMMUNITY_CHANNELS[tab];
}

function getActiveChannel(tab: SocialTab, activeCategory: string): CommunityChannel {
  const channels = getTabChannels(tab);
  return channels.find((channel) => channel.label === activeCategory || channel.key === activeCategory) ?? channels[0] ?? COMMUNITY_CHANNELS.Social[0];
}

function getPostChannelKey(post: SocialPost): CommunityChannelKey {
  const explicit = POST_TYPE_TO_CHANNEL[post.post_type];
  if (explicit) return explicit;

  const body = (post.body ?? '').toLowerCase();
  if (/\b(trade|swap|offer|deal|cash|top[- ]?up|would you accept|fair)\b/.test(body)) {
    if (/\b(win|completed|done|agreed)\b/.test(body)) return 'trade_win';
    if (/\b(check|fair|value|condition|top[- ]?up)\b/.test(body)) return 'deal_check';
    if (/\b(looking for|lf|want|chasing|seeking)\b/.test(body)) return 'looking_for_trade';
    return 'trade_talk';
  }

  if (/\b(question|anyone know|help|which|should i|would you)\b/.test(body)) return 'question';
  if (/\b(flex|pull|grail|chase|slab|graded|psa|cgc|bgs|ace|tag)\b/.test(body)) return 'chase_flex';
  return 'social';
}

function getPostTab(post: SocialPost): Exclude<SocialTab, 'Local' | 'News'> {
  const channel = getPostChannelKey(post);
  if (['binder_flex', 'chase_flex', 'slab_flex', 'milestone', 'flex'].includes(channel)) return 'Flex';
  if (['trade_talk', 'deal_check', 'looking_for_trade', 'trade_win'].includes(channel)) return 'Trades';
  return 'Social';
}

function getChannelMeta(post: SocialPost): CommunityChannel {
  const tab = getPostTab(post);
  const channelKey = getPostChannelKey(post);
  return COMMUNITY_CHANNELS[tab].find((channel) => channel.key === channelKey) ?? COMMUNITY_CHANNELS[tab][0];
}

function getDiscussionStarters(channelKey: CommunityChannelKey) {
  return DISCUSSION_STARTERS[channelKey] ?? DISCUSSION_STARTERS.all;
}

function getComposerPostType(tab: SocialTab, channel: CommunityChannel, hasCard: boolean, hasBinder: boolean) {
  if (tab === 'Flex') {
    if (hasBinder) return 'binder_showcase';
    if (hasCard) return 'card_showcase';
    return channel.postType ?? 'milestone';
  }

  if (tab === 'Trades') {
    return channel.postType ?? 'trade_discussion';
  }

  return channel.postType ?? 'social';
}

function timeAgo(dateString: string) {
  const then = new Date(dateString).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

export default function CommunityScreen() {
  const { theme } = useTheme();
  const styles = React.useMemo(() => makeStyles(theme), [theme]);
  const { profile: myProfile } = useProfile();
  const isAdmin = myProfile?.role === 'admin';

  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfilePreview>>({});
  const [cards, setCards] = useState<Record<string, CardPreview>>({});
  const [ownedCards, setOwnedCards] = useState<OwnedCardOption[]>([]);
  const [chaseCards, setChaseCards] = useState<OwnedCardOption[]>([]);
  const [binderOptions, setBinderOptions] = useState<BinderOption[]>([]);
  const [bindersById, setBindersById] = useState<Record<string, BinderOption>>({});

  const [mode, setMode] = useState<FeedMode>('global');
  const [activeSocialTab, setActiveSocialTab] = useState<SocialTab>('Social');
  const [activeCategory, setActiveCategory] = useState<string>('All');

  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [cardPickerSearch, setCardPickerSearch] = useState('');
  const [flexPickerMode, setFlexPickerMode] = useState<FlexPickerMode>(null);
  const [collectorModalOpen, setCollectorModalOpen] = useState(false);
  const [collectorSearch, setCollectorSearch] = useState('');
  const [allCollectors, setAllCollectors] = useState<ProfilePreview[]>([]);
  const [collectorLoading, setCollectorLoading] = useState(false);

  const [body, setBody] = useState('');
  const [selectedCard, setSelectedCard] = useState<OwnedCardOption | null>(null);
  const [selectedBinder, setSelectedBinder] = useState<BinderOption | null>(null);
  const [friends, setFriends] = useState<any[]>([]);
  const [localStoreSearch, setLocalStoreSearch] = useState('');
  const [localRadiusMiles, setLocalRadiusMiles] = useState('15');
  const [localSearchPoint, setLocalSearchPoint] = useState<LocalPoint | null>(null);
  const [localFilter, setLocalFilter] = useState<LocalFilter>('Stores');
  const [localStores, setLocalStores] = useState<LocalStore[]>([]);
  const [liveLocalPlaces, setLiveLocalPlaces] = useState<LiveLocalPlace[]>([]);
  const [selectedShop, setSelectedShop] = useState<SelectedShop | null>(null);
  const [localFeaturedEvents, setLocalFeaturedEvents] = useState<LocalFeaturedEvent[]>([]);
  const [localMeetups, setLocalMeetups] = useState<LocalMeetup[]>([]);
  const [communityNews, setCommunityNews] = useState<CommunityNewsItem[]>([]);
  const [localLoading, setLocalLoading] = useState(false);
  const [liveLocalLoading, setLiveLocalLoading] = useState(false);
  const [meetupModalOpen, setMeetupModalOpen] = useState(false);
  const [meetupTitle, setMeetupTitle] = useState('');
  const [meetupLocation, setMeetupLocation] = useState('');
  const [meetupPostcode, setMeetupPostcode] = useState('');
  const [meetupDate, setMeetupDate] = useState('');

  const loadFeed = async () => {
    try {
      setLoading(true);

      const { error: userError } = await supabase.auth.getUser();

      const myFriends = await getMyFriends();
      setFriends(myFriends);

      if (userError) throw userError;
      const { data: postData, error: postError } = await supabase
        .from('social_posts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (postError) throw postError;

      const nextPosts = (postData ?? []) as SocialPost[];
      setPosts(nextPosts);

      const userIds = [...new Set(nextPosts.map((post) => post.user_id))];
      const cardIds = [
        ...new Set(nextPosts.map((post) => post.card_id).filter(Boolean)),
      ] as string[];
      const binderIds = [
        ...new Set(nextPosts.map((post) => post.binder_id).filter(Boolean)),
      ] as string[];

      if (userIds.length) {
        const { data: profileData } = await supabase
          .from('profile_public_directory')
          .select('id, collector_name, avatar_preset')
          .in('id', userIds);

        const profileMap = Object.fromEntries(
          (profileData ?? []).map((profile) => [profile.id, profile])
        );

        setProfiles(profileMap);
      } else {
        setProfiles({});
      }

      if (cardIds.length) {
        const rows = await fetchStackrCardRows(cardIds);
        const cardMap = Object.fromEntries(cardIds.flatMap((id) => {
          const card = rows.get(id);
          return card ? [[id, card]] : [];
        }));

        setCards(cardMap);
      } else {
        setCards({});
      }

      if (binderIds.length) {
        const { data: binderData } = await supabase
          .from('binders')
          .select('id, name, type, is_public, cover_key, source_set_id, language')
          .in('id', binderIds);

        setBindersById(Object.fromEntries((binderData ?? []).map((binder) => [binder.id, binder as BinderOption])));
      } else {
        setBindersById({});
      }
    } catch (error) {
      console.log('Feed load failed', error);
      Alert.alert('Error', 'Could not load community feed.');
    } finally {
      setLoading(false);
    }
  };

  const loadOwnedCards = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data: binderData, error: binderError } = await supabase
        .from('binders')
        .select('id, name, type, is_public, cover_key, source_set_id, language')
        .eq('user_id', user.id);

      if (binderError) throw binderError;

      setBinderOptions((binderData ?? []) as BinderOption[]);
      const binderIds = (binderData ?? []).map((binder) => binder.id);

      if (!binderIds.length) {
        setOwnedCards([]);
        setBinderOptions([]);
      } else {
        const binderNameMap = Object.fromEntries((binderData ?? []).map((binder) => [binder.id, binder.name]));

        const { data: ownedRows, error: ownedError } = await supabase
          .from('binder_cards')
          .select('binder_id, card_id, set_id')
          .in('binder_id', binderIds)
          .eq('owned', true);

        if (ownedError) throw ownedError;

        const { data: variantRows, error: variantError } = await supabase
          .from('user_card_variants')
          .select('card_id, set_id')
          .eq('user_id', user.id);

        if (variantError) throw variantError;

        const rowsByKey = new Map<string, {
          binder_id: string | null;
          card_id: string;
          set_id: string;
        }>();

        for (const row of ownedRows ?? []) {
          rowsByKey.set(`${row.set_id}:${row.card_id}`, {
            binder_id: row.binder_id,
            card_id: row.card_id,
            set_id: row.set_id,
          });
        }

        for (const row of variantRows ?? []) {
          const key = `${row.set_id}:${row.card_id}`;
          if (!rowsByKey.has(key)) {
            rowsByKey.set(key, {
              binder_id: null,
              card_id: row.card_id,
              set_id: row.set_id,
            });
          }
        }

        const flexRows = Array.from(rowsByKey.values());
        const cardIds = [
          ...new Set(flexRows.map((row) => row.card_id)),
        ];

        if (!cardIds.length) {
          setOwnedCards([]);
        } else {
          const rows = await fetchStackrCardRows(cardIds);
          const cardMap = Object.fromEntries(cardIds.flatMap((id) => {
            const card = rows.get(id);
            return card ? [[id, card]] : [];
          }));

          const options = flexRows.map((row) => ({
            binder_id: row.binder_id,
            binder_name: row.binder_id ? binderNameMap[row.binder_id] ?? null : 'Master set variant',
            card_id: row.card_id,
            set_id: row.set_id,
            card: cardMap[row.card_id] ?? null,
          }));

          setOwnedCards(options);
        }
      }

      const { data: watchRows, error: watchError } = await supabase
        .from('market_watchlist')
        .select('card_id, set_id, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (watchError) throw watchError;

      const chaseCardIds = [...new Set((watchRows ?? []).map((row) => row.card_id))];

      if (!chaseCardIds.length) {
        setChaseCards([]);
      } else {
        const rows = await fetchStackrCardRows(chaseCardIds);
        const chaseCardMap = Object.fromEntries(chaseCardIds.flatMap((id) => {
          const card = rows.get(id);
          return card ? [[id, card]] : [];
        }));
        setChaseCards((watchRows ?? []).map((row) => ({
          binder_id: null,
          binder_name: 'Chase card',
          card_id: row.card_id,
          set_id: row.set_id,
          card: chaseCardMap[row.card_id] ?? null,
        })));
      }
    } catch (error) {
      console.log('Owned cards load failed', error);
      Alert.alert('Error', 'Could not load your owned cards.');
    }
  };

  useEffect(() => {
    loadFeed();
    loadOwnedCards();
  }, []);

  const friendIds = useMemo(
    () => new Set(friends.map((friend) => friend.friend_id)),
    [friends]
  );

  const filteredCollectors = useMemo(() => {
    const query = collectorSearch.trim().toLowerCase();

    if (!query) return allCollectors;

    return allCollectors.filter((collector) =>
      (collector.collector_name ?? 'Collector').toLowerCase().includes(query)
    );
  }, [allCollectors, collectorSearch]);

  const loadCollectors = useCallback(async () => {
    try {
      setCollectorLoading(true);

      const currentUserId = myProfile?.id;
      let query = supabase
        .from('profile_public_directory')
        .select('id, collector_name, avatar_preset')
        .order('collector_name', { ascending: true, nullsFirst: false })
        .limit(250);

      if (currentUserId) {
        query = query.neq('id', currentUserId);
      }

      const { data, error } = await query;
      if (error) throw error;

      setAllCollectors((data ?? []) as ProfilePreview[]);
    } catch (error) {
      console.log('Collector directory load failed', error);
      Alert.alert('Could not load collectors', 'Please try again in a moment.');
    } finally {
      setCollectorLoading(false);
    }
  }, [myProfile?.id]);

  const openCollectorDirectory = useCallback(() => {
    setCollectorModalOpen(true);
    setCollectorSearch('');
    void loadCollectors();
  }, [loadCollectors]);

 const visiblePosts = useMemo(() => {
  const basePosts = mode === 'global'
    ? posts
    : posts.filter((post) => friendIds.has(post.user_id));

  if (!POST_FEED_TABS.includes(activeSocialTab)) return [];

  const activeChannel = getActiveChannel(activeSocialTab, activeCategory);
  return basePosts.filter((post) => {
    const postTab = getPostTab(post);
    if (activeSocialTab === 'Social') {
      if (activeChannel.key === 'all') return true;
      return postTab === 'Social' && getPostChannelKey(post) === activeChannel.key;
    }
    if (postTab !== activeSocialTab) return false;
    if (activeChannel.key === 'all') return true;
    return getPostChannelKey(post) === activeChannel.key;
  });
}, [posts, mode, friendIds, activeSocialTab, activeCategory]);
  const handleAdminDeletePost = async (postId: string) => {
    Alert.alert('Delete post', 'Remove this post permanently?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('social_posts').delete().eq('id', postId);
          if (!error) setPosts(prev => prev.filter(p => p.id !== postId));
          else Alert.alert('Error', error.message);
        },
      },
    ]);
  };

  const handleCreatePost = async () => {
    const trimmedBody = body.trim();

    if (!trimmedBody && !selectedCard && !selectedBinder) {
      Alert.alert('Add something first', 'Write a post, attach a card, or choose a binder.');
      return;
    }

    try {
      setPosting(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) throw new Error('You must be signed in.');

      if (selectedBinder && !selectedBinder.is_public) {
        const { error: visibilityError } = await supabase
          .from('binders')
          .update({ is_public: true })
          .eq('id', selectedBinder.id)
          .eq('user_id', user.id);

        if (visibilityError) throw visibilityError;
      }

      const activeChannel = getActiveChannel(activeSocialTab, activeCategory);
      const postType = getComposerPostType(activeSocialTab, activeChannel, Boolean(selectedCard), Boolean(selectedBinder));

      const { error } = await supabase.from('social_posts').insert({
        user_id: user.id,
        post_type: postType,
        body: trimmedBody || null,
        binder_id: selectedBinder?.id ?? selectedCard?.binder_id ?? null,
        card_id: selectedCard?.card_id ?? null,
        set_id: selectedCard?.set_id ?? null,
      });

      if (error) throw error;

      setBody('');
      setSelectedCard(null);
      setSelectedBinder(null);
      setActiveCategory('All');

      await loadFeed();
    } catch (error: any) {
      console.log('Create post failed', error);
      Alert.alert(
        'Could not post',
        error?.message ?? 'Something went wrong.'
      );
    } finally {
      setPosting(false);
    }
  };

  const loadLocalData = useCallback(async () => {
    try {
      setLocalLoading(true);

      const [storesResult, eventsResult, meetupsResult] = await Promise.all([
        supabase
          .from('local_stores')
          .select('id, name, description, town, postcode, website_url, latitude, longitude')
          .eq('is_published', true)
          .order('name', { ascending: true })
          .limit(25),
        supabase
          .from('local_featured_events')
          .select('*')
          .eq('is_published', true)
          .order('starts_at', { ascending: true })
          .limit(10),
        supabase
          .from('local_meetups')
          .select('*')
          .eq('status', 'published')
          .order('starts_at', { ascending: true, nullsFirst: false })
          .limit(25),
      ]);

      if (storesResult.error) throw storesResult.error;
      if (eventsResult.error) throw eventsResult.error;
      if (meetupsResult.error) throw meetupsResult.error;

      setLocalStores((storesResult.data ?? []) as LocalStore[]);
      setLocalFeaturedEvents((eventsResult.data ?? []) as LocalFeaturedEvent[]);
      setLocalMeetups((meetupsResult.data ?? []) as LocalMeetup[]);
    } catch (error) {
      console.log('Local data load failed', error);
      Alert.alert('Local unavailable', 'Could not load local stores and meet ups.');
    } finally {
      setLocalLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeSocialTab === 'Local') {
      loadLocalData();
    }
  }, [activeSocialTab, loadLocalData]);

  const loadCommunityNews = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('community_news')
        .select('id, title, body, category, icon, external_url, source_name, published_at')
        .eq('is_published', true)
        .order('sort_order', { ascending: true })
        .order('published_at', { ascending: false })
        .limit(25);

      if (error) throw error;
      setCommunityNews((data ?? []) as CommunityNewsItem[]);
    } catch (error) {
      console.log('Community news load failed', error);
      setCommunityNews([]);
    }
  }, []);

  useEffect(() => {
    if (activeSocialTab === 'News') {
      loadCommunityNews();
    }
  }, [activeSocialTab, loadCommunityNews]);

  const searchLiveLocalPlaces = useCallback(async (text: string) => {
    const queryText = text.trim();

    if (!queryText || queryText.length < 2) {
      setLocalSearchPoint(null);
      setLiveLocalPlaces([]);
      return;
    }

    try {
      setLiveLocalLoading(true);
      const point = await geocodeLocalSearch(queryText);
      setLocalSearchPoint(point);

      const areaResponse = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=gb&q=${encodeURIComponent(queryText)}`, {
        headers: { 'User-Agent': 'Stackr/1.0' },
      });
      const areas = await areaResponse.json();
      const firstArea = areas?.[0];

      if (!firstArea?.boundingbox) {
        setLiveLocalPlaces([]);
        return;
      }

      const [south, north, west, east] = firstArea.boundingbox.map((value: string) => Number(value));
      const overpassQuery = `
        [out:json][timeout:12];
        (
          node["shop"~"games|collector|hobby|comics|books"](${south},${west},${north},${east});
          way["shop"~"games|collector|hobby|comics|books"](${south},${west},${north},${east});
          node["name"~"pokemon|pokémon|tcg|trading card|magic the gathering|mtg|yugioh|yu-gi-oh|lorcana|tabletop|board game|comic|hobby", i](${south},${west},${north},${east});
          way["name"~"pokemon|pokémon|tcg|trading card|magic the gathering|mtg|yugioh|yu-gi-oh|lorcana|tabletop|board game|comic|hobby", i](${south},${west},${north},${east});
        );
        out center 30;
      `;
      const overpassResponse = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'User-Agent': 'Stackr/1.0',
        },
        body: `data=${encodeURIComponent(overpassQuery)}`,
      });
      const overpassJson = await overpassResponse.json();
      const places = ((overpassJson?.elements ?? []) as any[])
        .map((element) => {
          const tags = element.tags ?? {};
          const name = tags.name;
          if (!name) return null;
          if (!looksLikeCardStore(tags)) return null;
          const latitude = Number(element.lat ?? element.center?.lat);
          const longitude = Number(element.lon ?? element.center?.lon);
          const miles = Number.isFinite(latitude) && Number.isFinite(longitude) && point
            ? distanceMiles(point, { latitude, longitude })
            : null;
          if (miles != null && miles > getLocalRadiusMiles(localRadiusMiles)) return null;
          const address = [
            tags['addr:housenumber'],
            tags['addr:street'],
            tags['addr:city'] ?? tags['addr:town'] ?? tags['addr:village'],
            tags['addr:postcode'],
          ].filter(Boolean).join(', ');
          return {
            place_id: String(element.id),
            name,
            formatted_address: address || tags['addr:full'] || queryText,
            category: tags.shop ? String(tags.shop) : tags.amenity ? String(tags.amenity) : 'local',
            latitude: Number.isFinite(latitude) ? latitude : undefined,
            longitude: Number.isFinite(longitude) ? longitude : undefined,
            website_url: tags.website ?? tags['contact:website'] ?? null,
            phone: tags.phone ?? tags['contact:phone'] ?? null,
            opening_hours: tags.opening_hours ?? null,
            distance_miles: miles,
          } as LiveLocalPlace;
        })
        .filter(Boolean)
        .sort((a, b) => {
          const aDistance = point ? distanceMiles(point, a as LiveLocalPlace) ?? 9999 : 9999;
          const bDistance = point ? distanceMiles(point, b as LiveLocalPlace) ?? 9999 : 9999;
          return aDistance - bDistance;
        })
        .slice(0, 10) as LiveLocalPlace[];

      setLiveLocalPlaces(places);
    } catch (error) {
      console.log('Live local search failed', error);
      setLocalSearchPoint(null);
      setLiveLocalPlaces([]);
    } finally {
      setLiveLocalLoading(false);
    }
  }, [localRadiusMiles]);

  useEffect(() => {
    if (activeSocialTab !== 'Local') return;
    const timer = setTimeout(() => {
      searchLiveLocalPlaces(localStoreSearch);
    }, 450);
    return () => clearTimeout(timer);
  }, [activeSocialTab, localStoreSearch, searchLiveLocalPlaces]);

  const handleCreateLocalMeetup = () => {
    const parsedDate = meetupDate.trim() ? new Date(meetupDate.trim()) : null;

    if (!meetupTitle.trim() || !meetupLocation.trim()) {
      Alert.alert('Add meetup details', 'Please add a title and location.');
      return;
    }

    if (parsedDate && Number.isNaN(parsedDate.getTime())) {
      Alert.alert('Check the date', 'Use a readable date, for example 31 May 2026 18:30.');
      return;
    }

    (async () => {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;
        if (!user) throw new Error('You must be signed in.');
        const meetupPoint = meetupPostcode.trim()
          ? await geocodeLocalSearch(meetupPostcode.trim())
          : localSearchPoint;

        const meetupPayload = {
          title: meetupTitle.trim(),
          location_name: meetupLocation.trim(),
          postcode: meetupPostcode.trim() || localStoreSearch.trim() || null,
          latitude: meetupPoint?.latitude ?? null,
          longitude: meetupPoint?.longitude ?? null,
          starts_at: parsedDate ? parsedDate.toISOString() : null,
          status: 'published',
          created_by: user.id,
        };

        const { error } = await supabase.from('local_meetups').insert(meetupPayload);

        if (error) throw error;

        setMeetupTitle('');
        setMeetupLocation('');
        setMeetupPostcode('');
        setMeetupDate('');
        setMeetupModalOpen(false);
        await loadLocalData();
        Alert.alert('Meetup created', 'Your local meet up is now visible in Local.');
      } catch (error: any) {
        Alert.alert('Could not create meet up', error?.message ?? 'Please try again.');
      }
    })();
  };

  const handleJoinMeetup = async (meetupId: string) => {
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) throw new Error('You must be signed in.');

      const { error } = await supabase
        .from('local_meetup_attendees')
        .upsert(
          { meetup_id: meetupId, user_id: user.id, status: 'going' },
          { onConflict: 'meetup_id,user_id' }
        );

      if (error) throw error;
      Alert.alert('Joined', 'You are marked as going.');
    } catch (error: any) {
      Alert.alert('Could not join', error?.message ?? 'Please try again.');
    }
  };

  const openFlexPicker = (modeToOpen: Exclude<FlexPickerMode, null>) => {
    setActiveCategory(
      modeToOpen === 'binder' ? 'Binder Flex'
        : modeToOpen === 'chase' ? 'Chase Cards'
        : modeToOpen === 'trade' ? 'Trade Wins'
        : 'Slabs'
    );
    setFlexPickerMode(modeToOpen);
  };

  const handleChannelPress = (channel: CommunityChannel) => {
    setActiveCategory(channel.label);

    if (activeSocialTab !== 'Flex') return;
    if (channel.key === 'binder_flex') openFlexPicker('binder');
    if (channel.key === 'chase_flex') openFlexPicker('chase');
    if (channel.key === 'slab_flex') openFlexPicker('slab');
  };

  const chooseBinderFlex = (binder: BinderOption) => {
    setSelectedBinder(binder);
    setSelectedCard(null);
    setBody((current) => current || 'Binder flex - what page should I finish next?');
    setFlexPickerMode(null);
  };

  const chooseChaseFlex = (card: OwnedCardOption) => {
    setSelectedCard(card);
    setSelectedBinder(null);
    setBody((current) => current || 'Chase card check - hold, grade or trade up?');
    setFlexPickerMode(null);
  };

  const renderBinderCover = (binder: BinderOption, style: any) => {
    const flatStyle = StyleSheet.flatten(style) ?? {};
    const frameWidth = typeof flatStyle.width === 'number' ? flatStyle.width : 74;
    const compact = frameWidth <= 50;

    return (
      <View style={[style, { alignItems: 'center', justifyContent: 'center', overflow: 'visible', backgroundColor: 'transparent' }]}>
        <BinderArtwork
          coverKey={binder.cover_key}
          sourceSetId={binder.type === 'official' ? binder.source_set_id : null}
          sourceSetLanguage={binder.type === 'official' ? binder.language : null}
          setName={binder.type === 'official' ? binder.name : null}
          fallbackColor={theme.colors.primary}
          width={compact ? frameWidth : 70}
          stageHeight={compact ? frameWidth + 20 : 78}
          plateWidth={compact ? 36 : 54}
          plateHeight={compact ? 44 : 64}
          artworkWidth={compact ? 27 : 42}
          artworkHeight={compact ? 36 : 54}
          progressWidth={compact ? 36 : 54}
          progressHeight={compact ? 4 : 5}
          showFan={!compact}
        />
      </View>
    );
  };

  const renderPost = ({ item }: { item: SocialPost }) => {
    const profile = profiles[item.user_id];
    const avatar = AVATAR_PRESETS.find(
      (a) => a.key === profile?.avatar_preset
    );
    const card = item.card_id ? cards[item.card_id] : null;
    const binder = item.binder_id ? bindersById[item.binder_id] : null;
    const channel = getChannelMeta(item);
    const postTab = getPostTab(item);
    const starters = getDiscussionStarters(channel.key).slice(0, 3);
    const fallbackBody = item.post_type === 'card_showcase'
      ? 'Added this card to the collection. Thoughts?'
      : item.post_type === 'binder_showcase'
        ? 'Sharing a binder flex. What should I chase next?'
        : channel.prompt;
    const cardTagLabel = postTab === 'Trades'
      ? 'Trade card'
      : card?.raw_data?.rarity
        ? String(card.raw_data.rarity)
        : 'Collection card';

    return (
  <View style={styles.postCard}>
    <View style={styles.postTopRow}>
      <View style={styles.avatar}>
        {avatar?.image ? (
          <Image source={avatar.image} style={styles.avatarImage} />
        ) : (
          <Ionicons name="person" size={18} color="#fff" />
        )}
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.name} numberOfLines={1}>
          {profile?.collector_name ?? 'Collector'}
        </Text>
        <View style={styles.postMetaRow}>
          <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
          <Text style={styles.postMetaDot}>|</Text>
          <Text style={styles.time}>{postTab}</Text>
        </View>
      </View>

      <View style={styles.channelPill}>
        <View style={styles.channelPillMark} />
        <Text style={styles.channelPillText} numberOfLines={1}>
          {channel.shortLabel ?? channel.label}
        </Text>
      </View>

      {isAdmin && (
        <Pressable
          onPress={() => handleAdminDeletePost(item.id)}
          style={{ padding: 6 }}
        >
          <Ionicons name="trash-outline" size={16} color="#EF4444" />
        </Pressable>
      )}
    </View>
 
        <Text style={styles.body}>{item.body || fallbackBody}</Text>

        {card && (
          <View style={styles.attachedCard}>
            <View style={styles.attachedCardImageFrame}>
              {card.image_small || card.image_large ? (
                <Image
                  source={{ uri: card.image_small ?? card.image_large ?? '' }}
                  style={styles.attachedCardImage}
                  resizeMode="contain"
                />
              ) : (
                <View style={styles.emptyCardImage}>
                  <Text style={styles.emptyCardText}>No image</Text>
                </View>
              )}
              <RaritySymbol
                rarity={card.raw_data?.rarity ?? null}
                size={13}
                style={RARITY_SYMBOL_CARD_OVERLAY}
              />
            </View>

            <View style={styles.attachedCardCopy}>
              <Text style={styles.cardName}>{card.name}</Text>
              <Text style={styles.cardSet}>
                {card.raw_data?.set?.name ?? card.set_id}
              </Text>

              <View style={styles.cardAttributeRow}>
                <View style={[styles.cardAttributePill, styles.cardAttributePillPrimary]}>
                  <Text style={[styles.cardAttributeText, styles.cardAttributeTextPrimary]}>{cardTagLabel}</Text>
                </View>
              </View>
            </View>
          </View>
        )}
        {binder && !card && (
          <Pressable
            onPress={() => router.push(`/binder/${binder.id}?readOnly=true` as any)}
            style={styles.attachedCard}
          >
            {renderBinderCover(binder, styles.binderShareImage)}
            <View style={{ flex: 1 }}>
              <Text style={styles.cardName}>{binder.name}</Text>
              <Text style={styles.cardSet}>{binder.type === 'official' ? 'Official binder' : 'Custom binder'}</Text>
              <Text style={styles.cardTag}>Read-only binder flex</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textSoft} />
          </Pressable>
        )}
        <View style={styles.discussionPromptRow}>
          {starters.map((starter) => (
            <View key={starter} style={styles.discussionPromptChip}>
              <Text numberOfLines={1} style={styles.discussionPromptText}>{starter}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const socialTabs: SocialTab[] = ['Social', 'Flex', 'Trades', 'Local', 'News'];
  const socialCategories: Record<SocialTab, { icon: keyof typeof Ionicons.glyphMap; label: string }[]> = {
    Social: [
      { icon: 'chatbubbles-outline', label: 'All chat' },
      { icon: 'people-outline', label: 'Social' },
      { icon: 'help-circle-outline', label: 'Questions' },
    ],
    Flex: [
      { icon: 'albums-outline', label: 'Binder Flex' },
      { icon: 'sparkles-outline', label: 'Chase Cards' },
      { icon: 'id-card-outline', label: 'Slabs' },
      { icon: 'trophy-outline', label: 'Milestones' },
    ],
    Trades: [
      { icon: 'swap-horizontal-outline', label: 'Trade Talk' },
      { icon: 'scale-outline', label: 'Deal Check' },
      { icon: 'search-outline', label: 'Looking For' },
      { icon: 'trophy-outline', label: 'Trade Wins' },
    ],
    Local: [
      { icon: 'location-outline', label: 'Near Me' },
      { icon: 'calendar-outline', label: 'Events' },
      { icon: 'people-outline', label: 'Collectors' },
      { icon: 'swap-horizontal-outline', label: 'Trade Tables' },
    ],
    News: [
      { icon: 'megaphone-outline', label: 'Latest Stackr news' },
      { icon: 'newspaper-outline', label: 'Pokemon News' },
      { icon: 'sparkles-outline', label: 'New card set news' },
    ],
  };
  const activeSocialCategories = socialCategories[activeSocialTab] ?? [];
  const activePostChannels = getTabChannels(activeSocialTab);
  const activePostChannel = getActiveChannel(activeSocialTab, activeCategory);
  const localActions = [
    { icon: 'storefront-outline' as const, title: 'Local shops', body: 'Find card stores and sellers near you.' },
    { icon: 'people-outline' as const, title: 'Meet ups', body: 'Discover collector meet ups and casual trades.' },
    { icon: 'calendar-outline' as const, title: 'Trade nights', body: 'See upcoming events and table nights.' },
  ];
  const radiusMiles = getLocalRadiusMiles(localRadiusMiles);
  const localStoreResults = localStores
    .map((store) => ({ store, miles: distanceMiles(localSearchPoint, store) }))
    .filter(({ store, miles }) => {
      if (localSearchPoint && miles != null) return miles <= radiusMiles;
      if (localSearchPoint && miles == null) {
        const searchTerm = localStoreSearch.trim().toLowerCase();
        return [store.name, store.town, store.postcode].some((value) => (value ?? '').toLowerCase().includes(searchTerm));
      }
      return !localStoreSearch.trim() ||
        store.name.toLowerCase().includes(localStoreSearch.trim().toLowerCase())
        || (store.town ?? '').toLowerCase().includes(localStoreSearch.trim().toLowerCase())
        || (store.postcode ?? '').toLowerCase().includes(localStoreSearch.trim().toLowerCase());
    })
    .sort((a, b) => (a.miles ?? 9999) - (b.miles ?? 9999));
  const nearbyLocalMeetups = localSearchPoint
    ? localMeetups
        .map((event) => ({ event, miles: distanceMiles(localSearchPoint, event) }))
        .filter(({ miles, event }) => {
          if (miles != null) return miles <= radiusMiles;
          const searchTerm = localStoreSearch.trim().toLowerCase();
          return [event.postcode, event.town, event.location_name].some((value) => (value ?? '').toLowerCase().includes(searchTerm));
        })
        .sort((a, b) => (a.miles ?? 9999) - (b.miles ?? 9999))
    : localMeetups.map((event) => ({ event, miles: null as number | null }));
  const nearbyFeaturedEvents = localSearchPoint
    ? localFeaturedEvents
        .map((event) => ({ event, miles: distanceMiles(localSearchPoint, event) }))
        .filter(({ miles, event }) => {
          if (miles != null) return miles <= radiusMiles;
          const searchTerm = localStoreSearch.trim().toLowerCase();
          return [event.postcode, event.town, event.venue_name].some((value) => (value ?? '').toLowerCase().includes(searchTerm));
        })
        .sort((a, b) => (a.miles ?? 9999) - (b.miles ?? 9999))
    : localFeaturedEvents.map((event) => ({ event, miles: null as number | null }));
  const defaultNewsItems = [
    { icon: 'megaphone-outline' as const, title: 'Stackr beta updates', body: 'App updates posted by the Stackr team will appear here.', category: 'Latest Stackr news', external_url: null, source_name: 'Stackr' },
    { icon: 'newspaper-outline' as const, title: 'Pokemon news hub', body: 'Major Pokemon game, market, and collecting news will appear here.', category: 'Pokemon News', external_url: null, source_name: 'Stackr' },
    { icon: 'sparkles-outline' as const, title: 'New card set news', body: 'Upcoming set names, release dates, and TCG product news will appear here.', category: 'New card set news', external_url: null, source_name: 'Stackr' },
  ];
  const newsItems = communityNews.length
    ? communityNews.map((item) => ({
        icon: item.icon || 'newspaper-outline' as const,
        title: item.title,
        body: item.body,
        category: item.category ?? 'Pokemon News',
        external_url: item.external_url,
        source_name: item.source_name,
      }))
    : defaultNewsItems;
  const visibleNewsItems = activeCategory === 'All'
    ? newsItems
    : newsItems.filter((item) => item.category === activeCategory);
  const filteredOwnedCards = useMemo(() => {
    const query = cardPickerSearch.trim().toLowerCase();
    if (!query) return ownedCards;

    const words = query.split(/\s+/).filter(Boolean);
    return ownedCards.filter((item) => {
      const card = item.card;
      const haystack = [
        card?.name,
        card?.raw_data?.set?.name,
        card?.raw_data?.number,
        card?.id,
        item.card_id,
        item.set_id,
        item.binder_name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return words.every((word) => haystack.includes(word));
    });
  }, [cardPickerSearch, ownedCards]);

  const renderOwnedCard = ({ item }: { item: OwnedCardOption }) => {
    const card = item.card;

    return (
      <Pressable
        onPress={() => {
          setSelectedCard(item);
          setCardPickerSearch('');
          setCardModalOpen(false);
        }}
        style={styles.ownedCardRow}
      >
        {card?.image_small || card?.image_large ? (
          <Image
            source={{ uri: card.image_small ?? card.image_large ?? '' }}
            style={styles.ownedCardImage}
            resizeMode="contain"
          />
        ) : (
          <View style={styles.ownedCardImagePlaceholder} />
        )}

        <View style={{ flex: 1 }}>
          <Text style={styles.ownedCardName}>
            {card?.name ?? item.card_id}
          </Text>
          <Text style={styles.ownedCardSet}>
            {card?.raw_data?.set?.name ?? item.set_id}
          </Text>
        </View>

        <Text style={styles.selectText}>Select</Text>
      </Pressable>
    );
  };

  const renderFlexPickerContent = () => {
    if (flexPickerMode === 'binder') {
      return (
        <>
          <Text style={styles.modalHeading}>Share a binder</Text>
          <Text style={styles.modalSubheading}>Choose a binder to post as a read-only flex.</Text>
          {binderOptions.map((binder) => (
            <Pressable key={binder.id} onPress={() => chooseBinderFlex(binder)} style={styles.flexPickerRow}>
              {renderBinderCover(binder, styles.flexPickerCover)}
              <View style={{ flex: 1 }}>
                <Text style={styles.flexPickerTitle}>{binder.name}</Text>
                <Text style={styles.flexPickerSubtitle}>{binder.type === 'official' ? 'Official binder' : 'Custom binder'} · Read-only share</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textSoft} />
            </Pressable>
          ))}
          {!binderOptions.length && <Text style={styles.emptyText}>No binders found yet.</Text>}
        </>
      );
    }

    if (flexPickerMode === 'chase') {
      return (
        <>
          <Text style={styles.modalHeading}>Share a chase card</Text>
          <Text style={styles.modalSubheading}>Choose from your current market watchlist.</Text>
          <FlatList
            data={chaseCards}
            keyExtractor={(item) => `chase-${item.set_id}-${item.card_id}`}
            renderItem={({ item }) => (
              <Pressable onPress={() => chooseChaseFlex(item)} style={styles.ownedCardRow}>
                {item.card?.image_small || item.card?.image_large ? (
                  <Image source={{ uri: item.card.image_small ?? item.card.image_large ?? '' }} style={styles.ownedCardImage} resizeMode="contain" />
                ) : (
                  <View style={styles.ownedCardImagePlaceholder} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.ownedCardName}>{item.card?.name ?? item.card_id}</Text>
                  <Text style={styles.ownedCardSet}>{item.card?.raw_data?.set?.name ?? item.set_id}</Text>
                </View>
                <Text style={styles.selectText}>Flex</Text>
              </Pressable>
            )}
            style={{ maxHeight: 420 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.placeholderPanel}>
                <Ionicons name="sparkles-outline" size={28} color={theme.colors.primary} />
                <Text style={styles.placeholderTitle}>No chase cards yet</Text>
                <Text style={styles.emptyText}>Add cards to your market watchlist, then use this button to flex what you are chasing.</Text>
              </View>
            }
          />
        </>
      );
    }

    if (flexPickerMode === 'trade') {
      return (
        <>
          <Text style={styles.modalHeading}>Share a trade win</Text>
          <Text style={styles.modalSubheading}>Recent completed trades will appear here once trade history is wired in.</Text>
          <View style={styles.placeholderPanel}>
            <Ionicons name="swap-horizontal-outline" size={28} color={theme.colors.primary} />
            <Text style={styles.placeholderTitle}>Trade history coming soon</Text>
            <Text style={styles.emptyText}>For now, write your trade win in the composer and attach a card.</Text>
          </View>
        </>
      );
    }

    return (
      <>
        <Text style={styles.modalHeading}>Share a slab return</Text>
        <Text style={styles.modalSubheading}>Slabs are a placeholder until grading inventory is added.</Text>
        <View style={styles.placeholderPanel}>
          <Ionicons name="id-card-outline" size={28} color={theme.colors.primary} />
          <Text style={styles.placeholderTitle}>Slab support coming soon</Text>
          <Text style={styles.emptyText}>This will let users flex graded returns once slabs exist in inventory.</Text>
        </View>
      </>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StackrBackdrop />
      <FeatureTipGate
        tipKey="social-screen-v1"
        title="Social"
        subtitle="Share collection moments and find other collectors."
        items={[
          { icon: 'chatbubble-ellipses-outline', title: 'Post updates', body: 'Share a message or attach a card you own.' },
          { icon: 'people-outline', title: 'Friends feed', body: 'Switch between global posts and your friends.' },
          { icon: 'search-outline', title: 'Find collectors', body: 'Search names and open public profiles.' },
        ]}
      />
      <View style={styles.container}>
        <View style={styles.hero}>
          <View style={styles.brandRow}>
            <View style={styles.heroTitleBlock}>
              <Text style={styles.heroTitle}>Community</Text>
              <Text style={styles.subheading} numberOfLines={2}>
                {activeSocialTab === 'Social'
                  ? 'Collector posts, questions and daily chat.'
                  : activeSocialTab === 'Flex'
                    ? 'Push flexes, chase cards and collection milestones.'
                    : activeSocialTab === 'Trades'
                      ? 'Talk through trade ideas, deal checks and swaps.'
                      : activeSocialTab === 'Local'
                        ? 'Find shops, meet ups and trade nights.'
                        : 'Latest Pokemon news and Stackr updates.'}
              </Text>
            </View>
            <View style={styles.heroActions}>
              <Pressable onPress={openCollectorDirectory} style={styles.heroIconButton}>
                <StackrCardActionIcon source={stackrIcons.searchCard} frameSize={30} artworkSize={24} />
              </Pressable>
              <Pressable onPress={() => router.push('/notifications')} style={styles.heroIconButton}>
                <Image source={stackrIcons.notifications} style={{ width: 26, height: 26 }} resizeMode="contain" />
                <View style={styles.notificationDot} />
              </Pressable>
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.socialTabs}>
            {socialTabs.map((tab) => {
              const active = activeSocialTab === tab;
              return (
                <Pressable
                  key={tab}
                  onPress={() => {
                    setActiveSocialTab(tab);
                    setActiveCategory('All');
                  }}
                  style={styles.socialTab}
                >
                  <Text style={[styles.socialTabText, active && styles.socialTabTextActive]}>{tab}</Text>
                  {active && <View style={styles.socialTabUnderline} />}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {activeSocialTab === 'News' && (
          <View style={styles.newsCategoryWrap}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.newsCategoryStrip}
            >
              {[{ icon: 'apps-outline' as const, label: 'All' }, ...activeSocialCategories].map((item) => {
                const active = activeCategory === item.label;
                return (
                  <Pressable
                    key={item.label}
                    onPress={() => setActiveCategory(item.label)}
                    style={[styles.newsCategoryChip, active && styles.newsCategoryChipActive]}
                  >
                    <Ionicons
                      name={item.icon}
                      size={15}
                      color={active ? theme.colors.primary : theme.colors.textSoft}
                    />
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.88}
                      style={[styles.newsCategoryChipText, active && styles.newsCategoryChipTextActive]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {activeSocialTab === 'Local' && (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: stackrTabContentPadding.standard }}>
            {localLoading && (
              <ActivityIndicator color={theme.colors.primary} style={{ marginBottom: 10 }} />
            )}
            <View style={styles.localSearchPanel}>
              <View style={styles.localSearchInputRow}>
                <Ionicons name="search-outline" size={20} color={theme.colors.textSoft} />
                <TextInput
                  value={localStoreSearch}
                  onChangeText={setLocalStoreSearch}
                  placeholder="Enter postcode or town"
                  placeholderTextColor={theme.colors.textSoft}
                  style={styles.localSearchInput}
                  returnKeyType="search"
                  onSubmitEditing={() => searchLiveLocalPlaces(localStoreSearch)}
                />
                <Pressable
                  onPress={() => searchLiveLocalPlaces(localStoreSearch)}
                  disabled={liveLocalLoading}
                  style={[styles.localSearchButton, liveLocalLoading && { opacity: 0.6 }]}
                >
                  {liveLocalLoading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.localSearchButtonText}>Search</Text>
                  )}
                </Pressable>
              </View>
              <View style={styles.localSearchQuickRow}>
                {(['Stores', 'Meet ups', 'Trade nights'] as const).map((label) => (
                  <Pressable
                    key={label}
                    onPress={() => setLocalFilter(label)}
                    style={[styles.localSearchChip, localFilter === label && styles.localSearchChipActive]}
                  >
                    <Text style={[styles.localSearchChipText, localFilter === label && styles.localSearchChipTextActive]}>{label}</Text>
                  </Pressable>
                ))}
                <View style={styles.localRadiusControl}>
                  <Text style={styles.localRadiusLabel}>Within</Text>
                  <TextInput
                    value={localRadiusMiles}
                    onChangeText={(value) => setLocalRadiusMiles(value.replace(/[^0-9.]/g, ''))}
                    keyboardType="decimal-pad"
                    style={styles.localRadiusInput}
                    maxLength={4}
                  />
                  <Text style={styles.localRadiusLabel}>mi</Text>
                </View>
              </View>
            </View>

            {localFilter === 'Stores' && (
            <View style={styles.localHeroPanel}>
              <StackrHeroBackdrop opacity={0.20} />
              <View style={{ flex: 1 }}>
                <Text style={styles.localHeroTitle}>Find your local card scene</Text>
                <Text numberOfLines={2} style={styles.localHeroCopy}>
                  Type a postcode or town, then search OpenStreetMap for game shops, hobby shops and nearby collector spaces.
                </Text>
              </View>
              <View style={styles.mapMockLarge}>
                <View style={styles.mapLineOne} />
                <View style={styles.mapLineTwo} />
                <View style={styles.mapLineThree} />
                <View style={styles.mapDotOne} />
                <View style={styles.mapDotTwo} />
                <Ionicons name="location" size={30} color={theme.colors.primary} style={{ zIndex: 2 }} />
              </View>
            </View>
            )}

            {localFilter === 'Stores' && (
            <>
            <View style={styles.localSectionHeader}>
              <Text style={styles.panelTitle}>Stores near you</Text>
              <Text style={styles.viewAllText}>OpenStreetMap</Text>
            </View>
            <View style={styles.localStoreList}>
              {liveLocalLoading && (
                <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 8 }} />
              )}
              {liveLocalPlaces.map((place) => (
                <Pressable key={place.place_id} onPress={() => setSelectedShop(place)} style={styles.localStoreRow}>
                  <View style={styles.localStoreIcon}>
                    <Ionicons name="map-outline" size={19} color={theme.colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.localEventTitle}>{place.name}</Text>
                    <Text style={styles.localEventMeta}>{place.formatted_address || 'OpenStreetMap result'}</Text>
                    {!!place.category && <Text style={styles.localEventMeta}>{place.category}</Text>}
                  </View>
                  <Text style={styles.localDistance}>
                    {typeof place.distance_miles === 'number' ? `${place.distance_miles.toFixed(1)} mi` : 'Live'}
                  </Text>
                </Pressable>
              ))}
              {!liveLocalPlaces.length && localStoreResults.map(({ store, miles }) => (
                <Pressable key={store.id} onPress={() => setSelectedShop(store)} style={styles.localStoreRow}>
                  <View style={styles.localStoreIcon}>
                    <Ionicons name="storefront-outline" size={19} color={theme.colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.localEventTitle}>{store.name}</Text>
                    <Text style={styles.localEventMeta}>
                      {store.description ?? [store.town, store.postcode].filter(Boolean).join(' ') ?? 'Local card store'}
                    </Text>
                  </View>
                  <Text style={styles.localDistance}>{miles != null ? `${miles.toFixed(1)} mi` : store.town ?? 'Local'}</Text>
                </Pressable>
              ))}
              {!liveLocalLoading && !liveLocalPlaces.length && !localStoreResults.length && (
                <Text style={styles.localEmptyText}>
                  Type your postcode or town above to search for card shops, TCG stores, tabletop shops and similar venues.
                </Text>
              )}
            </View>
            </>
            )}

            {localFilter === 'Stores' && (
            <View style={styles.infoGrid}>
              {localActions.map((item) => (
                <View key={item.title} style={styles.infoTile}>
                  <Ionicons name={item.icon} size={24} color={theme.colors.primary} />
                  <Text style={styles.infoTileTitle}>{item.title}</Text>
                  <Text style={styles.infoTileBody}>{item.body}</Text>
                </View>
              ))}
            </View>
            )}

            {localFilter === 'Trade nights' && (
            <View style={styles.panelCard}>
              <View style={styles.panelHeader}>
                <View style={styles.panelTitleRow}>
                  <Ionicons name="sparkles-outline" size={20} color={theme.colors.primary} />
                  <Text style={styles.panelTitle}>Featured shows</Text>
                </View>
                {isAdmin && <Text style={styles.viewAllText}>Admin</Text>}
              </View>
              {nearbyFeaturedEvents.map(({ event, miles }) => (
                <View key={event.id} style={styles.adminEventCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.localEventTitle}>{event.title}</Text>
                    <Text style={styles.localEventMeta}>
                      {event.description ?? event.venue_name ?? event.town ?? 'Featured event'}
                    </Text>
                    <Text style={styles.adminEventDate}>
                      {shortDateTime(event.starts_at)}{miles != null ? ` · ${miles.toFixed(1)} mi` : ''}
                    </Text>
                  </View>
                  <Pressable style={styles.localJoinPill}>
                    <Text style={styles.localJoinText}>{event.external_url ? 'View event' : 'Details'}</Text>
                  </Pressable>
                </View>
              ))}
              {!nearbyFeaturedEvents.length && (
                <Text style={styles.localEmptyText}>No nearby trade nights yet. Admin-featured shows with postcodes will appear here.</Text>
              )}
            </View>
            )}

            {localFilter === 'Meet ups' && (
            <View style={styles.panelCard}>
              <View style={styles.panelHeader}>
                <View style={styles.panelTitleRow}>
                  <Ionicons name="calendar-outline" size={20} color={theme.colors.primary} />
                  <Text style={styles.panelTitle}>Meet ups from collectors</Text>
                </View>
                <Pressable onPress={() => setMeetupModalOpen(true)}>
                  <Text style={styles.viewAllText}>Create</Text>
                </Pressable>
              </View>
              {nearbyLocalMeetups.map(({ event, miles }) => (
                <View key={event.id} style={styles.localListRow}>
                  <View style={styles.dateBadge}>
                    <Text style={styles.dateBadgeDay}>{shortDate(event.starts_at).split(' ')[0]}</Text>
                    <Text style={styles.dateBadgeMonth}>{shortDate(event.starts_at).split(' ')[1] ?? 'TBC'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.localEventTitle}>{event.title}</Text>
                    <Text style={styles.localEventMeta}>
                      {event.location_name} - {shortDateTime(event.starts_at)}{miles != null ? ` · ${miles.toFixed(1)} mi` : ''}
                    </Text>
                    {!!event.description && <Text style={styles.localEventMeta}>{event.description}</Text>}
                  </View>
                  <Pressable onPress={() => handleJoinMeetup(event.id)} style={styles.localJoinPill}>
                    <Text style={styles.localJoinText}>Join</Text>
                  </Pressable>
                </View>
              ))}
              {!nearbyLocalMeetups.length && (
                <Text style={styles.localEmptyText}>No nearby collector meet ups yet. Create the first one.</Text>
              )}
            </View>
            )}

            {localFilter === 'Meet ups' && (
            <Pressable onPress={() => setMeetupModalOpen(true)} style={styles.createMeetupButton}>
              <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" />
              <Text style={styles.createMeetupButtonText}>Create local meet up</Text>
            </Pressable>
            )}
          </ScrollView>
        )}

        {activeSocialTab === 'News' && (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.newsListContent}>
            {visibleNewsItems.map((item) => (
              <Pressable
                key={`${item.category}-${item.title}`}
                onPress={() => item.external_url && openExternalUrl(item.external_url)}
                disabled={!item.external_url}
                style={styles.newsCard}
              >
                <View style={styles.newsIcon}>
                  <Ionicons name={item.icon} size={24} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.newsTitle}>{item.title}</Text>
                  <Text style={styles.newsBody}>{item.body}</Text>
                  <Text style={styles.newsSource}>
                    {[item.category, item.source_name].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                {!!item.external_url && <Ionicons name="open-outline" size={17} color={theme.colors.textSoft} />}
              </Pressable>
            ))}
            {!visibleNewsItems.length && (
              <Text style={styles.localEmptyText}>No news in this category yet.</Text>
            )}
          </ScrollView>
        )}

        {POST_FEED_TABS.includes(activeSocialTab) && (
          <FlatList
            data={visiblePosts}
            keyExtractor={(item) => item.id}
            renderItem={renderPost}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: stackrTabContentPadding.standard }}
            ListHeaderComponent={(
              <View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.flexCardRow}>
                  {activePostChannels.map((item) => {
                    const active = activePostChannel.key === item.key;
                    return (
                    <Pressable
                      key={item.label}
                      onPress={() => handleChannelPress(item)}
                      style={[styles.flexCard, active && styles.flexCardActive]}
                    >
                      <Ionicons name={item.icon} size={17} color={active ? theme.colors.primary : theme.colors.textSoft} />
                      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.86} style={styles.flexCardText}>{item.label}</Text>
                    </Pressable>
                    );
                  })}
                </ScrollView>

                <View style={styles.channelIntroCard}>
                  <View style={styles.channelIntroIcon}>
                    <Ionicons name={activePostChannel.icon} size={22} color={theme.colors.primary} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.channelIntroTitle}>{activePostChannel.label}</Text>
                    <Text numberOfLines={1} style={styles.channelIntroCopy}>{activePostChannel.prompt}</Text>
                  </View>
                </View>

                <View style={styles.modeRow}>
                  <Pressable onPress={() => setMode('global')}>
                    <Text style={mode === 'global' ? styles.activeTab : styles.tab}>
                      Global
                    </Text>
                  </Pressable>

                  <Pressable onPress={() => setMode('friends')}>
                    <Text style={mode === 'friends' ? styles.activeTab : styles.tab}>
                      Friends
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.createCard}>
                  <TextInput
                    value={body}
                    onChangeText={setBody}
                    placeholder={activePostChannel.prompt}
                    placeholderTextColor={theme.colors.textSoft}
                    multiline
                    style={styles.input}
                  />

                  {selectedCard?.card && (
                    <View style={styles.selectedCardPreview}>
                      <View style={styles.selectedPreviewRow}>
                        {selectedCard.card.image_small || selectedCard.card.image_large ? (
                          <Image
                            source={{ uri: selectedCard.card.image_small ?? selectedCard.card.image_large ?? '' }}
                            style={styles.selectedCardImage}
                            resizeMode="contain"
                          />
                        ) : (
                          <View style={styles.selectedCardImagePlaceholder} />
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={styles.selectedLabel}>Attached card</Text>
                          <Text style={styles.selectedName}>
                            {selectedCard.card.name}
                          </Text>
                        </View>
                        <Pressable onPress={() => setSelectedCard(null)}>
                          <Text style={styles.removeText}>Remove</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}

                  {selectedBinder && (
                    <View style={styles.selectedCardPreview}>
                      <View style={styles.selectedPreviewRow}>
                        {renderBinderCover(selectedBinder, styles.selectedBinderImage)}
                        <View style={{ flex: 1 }}>
                          <Text style={styles.selectedLabel}>Attached binder</Text>
                          <Text style={styles.selectedName}>{selectedBinder.name}</Text>
                        </View>
                        <Pressable onPress={() => setSelectedBinder(null)}>
                          <Text style={styles.removeText}>Remove</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}

                  <View style={styles.createActions}>
                    {activeSocialTab === 'Flex' && (
                      <Pressable
                        onPress={() => openFlexPicker('binder')}
                        style={styles.attachButton}
                      >
                        <Ionicons
                          name="albums-outline"
                          size={17}
                          color={theme.colors.text}
                        />
                        <Text style={styles.attachText}>Attach binder</Text>
                      </Pressable>
                    )}

                    <Pressable
                      onPress={() => {
                        setCardPickerSearch('');
                        setCardModalOpen(true);
                      }}
                      style={styles.attachButton}
                    >
                      <Ionicons
                        name="albums-outline"
                        size={17}
                        color={theme.colors.text}
                      />
                      <Text style={styles.attachText}>
                        {activeSocialTab === 'Trades' ? 'Attach trade card' : 'Attach owned card'}
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={handleCreatePost}
                      disabled={posting}
                      style={[styles.postButton, posting && { opacity: 0.6 }]}
                    >
                      {posting ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.postButtonText}>Post</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              </View>
            )}
            ListEmptyComponent={
              loading ? (
                <ActivityIndicator color={theme.colors.primary} />
              ) : (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>
                    {activeSocialTab === 'Trades'
                      ? 'No trade talk yet'
                      : activeSocialTab === 'Flex'
                        ? 'No flexes yet'
                        : 'No posts yet'}
                  </Text>
                  <Text style={styles.emptyText}>
                    {activeSocialTab === 'Trades'
                      ? 'Start a deal check, ask what is fair, or attach a card you might move.'
                      : activeSocialTab === 'Flex'
                        ? 'Push a binder flex, chase card or milestone to get collectors talking.'
                        : 'Start a collector chat, ask a question, or share what you are working on.'}
                  </Text>
                </View>
              )
            }
          />
        )}

      </View>

      <Modal visible={collectorModalOpen} animationType="slide" transparent>
        <View style={styles.meetupModalBackdrop}>
          <View style={styles.collectorModalCard}>
            <View style={styles.panelHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalHeading}>Find collectors</Text>
                <Text style={styles.modalSubheading}>
                  Browse everyone on Stackr and open a profile to add them.
                </Text>
              </View>
              <Pressable onPress={() => setCollectorModalOpen(false)} style={styles.modalCloseIcon}>
                <Ionicons name="close" size={18} color={theme.colors.text} />
              </Pressable>
            </View>

            <View style={styles.collectorSearchRow}>
              <Ionicons name="search-outline" size={18} color={theme.colors.textSoft} />
              <TextInput
                value={collectorSearch}
                onChangeText={setCollectorSearch}
                placeholder="Filter collectors..."
                placeholderTextColor={theme.colors.textSoft}
                autoCapitalize="none"
                style={styles.collectorSearchInput}
              />
              {collectorSearch.trim().length > 0 && (
                <Pressable onPress={() => setCollectorSearch('')} style={styles.collectorSearchClear}>
                  <Ionicons name="close-circle" size={18} color={theme.colors.textSoft} />
                </Pressable>
              )}
            </View>

            {collectorLoading ? (
              <View style={styles.collectorLoadingBox}>
                <ActivityIndicator color={theme.colors.primary} />
                <Text style={styles.userResultSubtext}>Loading collectors...</Text>
              </View>
            ) : (
              <FlatList
                data={filteredCollectors}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={filteredCollectors.length ? styles.collectorListContent : styles.emptyState}
                ListEmptyComponent={
                  <>
                    <Text style={styles.emptyTitle}>No collectors found</Text>
                    <Text style={styles.emptyText}>
                      Try a different name, or clear the filter to see everyone.
                    </Text>
                  </>
                }
                renderItem={({ item }) => {
                  const avatar = AVATAR_PRESETS.find((a) => a.key === item.avatar_preset);
                  const isFriend = friendIds.has(item.id);

                  return (
                    <Pressable
                      onPress={() => {
                        setCollectorModalOpen(false);
                        router.push(`/community/profile/${item.id}` as any);
                      }}
                      style={styles.userResultCard}
                    >
                      <View style={styles.userResultAvatar}>
                        {avatar?.image ? (
                          <Image source={avatar.image} style={styles.userResultAvatarImage} resizeMode="contain" />
                        ) : (
                          <Ionicons name="person" size={18} color="#FFFFFF" />
                        )}
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={1} style={styles.userResultName}>
                          {item.collector_name ?? 'Collector'}
                        </Text>
                        <Text style={styles.userResultSubtext}>
                          {isFriend ? 'Friend' : 'Open profile to add friend'}
                        </Text>
                      </View>
                      {isFriend && (
                        <View style={styles.friendBadge}>
                          <Text style={styles.friendBadgeText}>Friend</Text>
                        </View>
                      )}
                      <Ionicons name="chevron-forward" size={18} color={theme.colors.textSoft} />
                    </Pressable>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={!!selectedShop} animationType="slide" transparent>
        <View style={styles.meetupModalBackdrop}>
          <View style={styles.shopModalCard}>
            <View style={styles.panelHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalHeading}>{selectedShop?.name ?? 'Local shop'}</Text>
                <Text style={styles.modalSubheading}>
                  {getShopDistanceLabel(selectedShop, localSearchPoint) ?? 'Local card shop'}
                </Text>
              </View>
              <Pressable onPress={() => setSelectedShop(null)} style={styles.modalCloseIcon}>
                <Ionicons name="close" size={18} color={theme.colors.text} />
              </Pressable>
            </View>

            <ScrollView style={styles.shopDetailScroller} contentContainerStyle={styles.shopDetailBlock} showsVerticalScrollIndicator={false}>
              <InfoLine icon="location-outline" label="Address" value={getShopAddress(selectedShop) || 'Address not listed'} iconColor={theme.colors.primary} styles={styles} />
              {selectedShop && isLiveLocalPlace(selectedShop) && (
                <>
                  <InfoLine icon="time-outline" label="Opening times" value={selectedShop.opening_hours ?? 'Opening times not listed'} iconColor={theme.colors.primary} styles={styles} />
                  <InfoLine icon="call-outline" label="Phone" value={selectedShop.phone ?? 'Phone not listed'} iconColor={theme.colors.primary} styles={styles} />
                </>
              )}
              <InfoLine icon="globe-outline" label="Website" value={getShopWebsite(selectedShop) ?? 'Website not listed'} iconColor={theme.colors.primary} styles={styles} />
            </ScrollView>

            <View style={styles.shopActionRow}>
              {selectedShop && (
                <Pressable
                  onPress={() => Linking.openURL(buildDirectionsUrl(selectedShop))}
                  style={styles.shopActionButton}
                >
                  <Ionicons name="navigate-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.shopActionButtonText}>Navigate</Text>
                </Pressable>
              )}

              {!!getShopWebsite(selectedShop) && (
                <Pressable
                  onPress={() => openExternalUrl(getShopWebsite(selectedShop) as string)}
                  style={styles.shopSecondaryButton}
                >
                  <Ionicons name="globe-outline" size={18} color={theme.colors.primary} />
                  <Text style={styles.shopSecondaryButtonText}>Website</Text>
                </Pressable>
              )}

              {selectedShop && isLiveLocalPlace(selectedShop) && !!selectedShop.phone && (
                <Pressable
                  onPress={() => Linking.openURL(`tel:${selectedShop.phone}`)}
                  style={styles.shopSecondaryButton}
                >
                  <Ionicons name="call-outline" size={18} color={theme.colors.primary} />
                  <Text style={styles.shopSecondaryButtonText}>Call</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={cardModalOpen} animationType="slide">
        <SafeAreaView style={styles.safe}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalHeading}>Choose a card to attach</Text>
            <Text style={styles.modalSubheading}>
              Only cards you have marked as owned will appear here.
            </Text>

            <View style={styles.cardPickerSearchRow}>
              <Ionicons name="search-outline" size={18} color={theme.colors.textSoft} />
              <TextInput
                value={cardPickerSearch}
                onChangeText={setCardPickerSearch}
                placeholder="Search by card, set, number or binder"
                placeholderTextColor={theme.colors.textSoft}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.cardPickerSearchInput}
              />
              {cardPickerSearch.trim() ? (
                <Pressable onPress={() => setCardPickerSearch('')} style={styles.cardPickerClearButton}>
                  <Ionicons name="close" size={16} color={theme.colors.textSoft} />
                </Pressable>
              ) : null}
            </View>

            <Text style={styles.cardPickerCountText}>
              {filteredOwnedCards.length} of {ownedCards.length} cards
            </Text>

            <FlatList
              data={filteredOwnedCards}
              keyExtractor={(item) =>
                `${item.binder_id}-${item.set_id}-${item.card_id}`
              }
              renderItem={renderOwnedCard}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>{ownedCards.length ? 'No matching cards' : 'No owned cards found'}</Text>
                  <Text style={styles.emptyText}>
                    {ownedCards.length
                      ? 'Try a different card name, set, number or binder.'
                      : 'Mark cards as owned in a binder first, then come back to attach them.'}
                  </Text>
                </View>
              }
            />

            <Pressable
              onPress={() => {
                setCardPickerSearch('');
                setCardModalOpen(false);
              }}
              style={styles.closeButton}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal visible={flexPickerMode !== null} animationType="slide" transparent>
        <View style={styles.meetupModalBackdrop}>
          <View style={styles.flexPickerModalCard}>
            <View style={styles.panelHeader}>
              <View style={{ flex: 1 }} />
              <Pressable onPress={() => setFlexPickerMode(null)} style={styles.modalCloseIcon}>
                <Ionicons name="close" size={22} color={theme.colors.text} />
              </Pressable>
            </View>
            {flexPickerMode ? renderFlexPickerContent() : null}
          </View>
        </View>
      </Modal>

      <Modal visible={meetupModalOpen} animationType="slide" transparent>
        <View style={styles.meetupModalBackdrop}>
          <View style={styles.meetupModalCard}>
            <View style={styles.panelHeader}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.modalHeading}>Create meet up</Text>
                <Text style={styles.modalSubheading}>Add the basic details for a local collector event.</Text>
              </View>
              <Pressable onPress={() => setMeetupModalOpen(false)} style={styles.modalCloseIcon}>
                <Ionicons name="close" size={22} color={theme.colors.text} />
              </Pressable>
            </View>

            <TextInput
              value={meetupTitle}
              onChangeText={setMeetupTitle}
              placeholder="Meet up title"
              placeholderTextColor={theme.colors.textSoft}
              style={styles.meetupInput}
            />
            <TextInput
              value={meetupLocation}
              onChangeText={setMeetupLocation}
              placeholder="Location or shop name"
              placeholderTextColor={theme.colors.textSoft}
              style={styles.meetupInput}
            />
            <TextInput
              value={meetupPostcode}
              onChangeText={setMeetupPostcode}
              placeholder="Postcode or town"
              placeholderTextColor={theme.colors.textSoft}
              style={styles.meetupInput}
              autoCapitalize="characters"
            />
            <TextInput
              value={meetupDate}
              onChangeText={setMeetupDate}
              placeholder="Date and time"
              placeholderTextColor={theme.colors.textSoft}
              style={styles.meetupInput}
            />

            <Pressable onPress={handleCreateLocalMeetup} style={styles.createMeetupButton}>
              <Text style={styles.createMeetupButtonText}>Create meet up</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function InfoLine({
  icon,
  label,
  value,
  iconColor,
  styles,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  iconColor: string;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.shopInfoLine}>
      <Ionicons name={icon} size={18} color={iconColor} />
      <View style={{ flex: 1 }}>
        <Text style={styles.shopInfoLabel}>{label}</Text>
        <Text style={styles.shopInfoValue}>{value}</Text>
      </View>
    </View>
  );
}

async function geocodeLocalSearch(text: string): Promise<LocalPoint | null> {
  const queryText = text.trim();
  if (queryText.length < 2) return null;

  const areaResponse = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=gb&q=${encodeURIComponent(queryText)}`, {
    headers: { 'User-Agent': 'Stackr/1.0' },
  });
  const areas = await areaResponse.json();
  const firstArea = areas?.[0];
  const latitude = Number(firstArea?.lat);
  const longitude = Number(firstArea?.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return {
    label: firstArea?.display_name ?? queryText,
    latitude,
    longitude,
  };
}

function distanceMiles(from: LocalPoint | null, to?: { latitude?: number | null; longitude?: number | null }) {
  if (!from || typeof to?.latitude !== 'number' || typeof to.longitude !== 'number') return null;
  const radiusMiles = 3958.8;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return radiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function shortDate(dateString: string | null) {
  if (!dateString) return 'TBC';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(dateString));
}

function shortDateTime(dateString: string | null) {
  if (!dateString) return 'Date TBC';
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateString));
}

function makeStyles(theme: any) {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg, overflow: 'hidden' },
  container: { flex: 1, paddingHorizontal: 14, paddingTop: 0 },

  hero: {
    position: 'relative',
    paddingBottom: 2,
    overflow: 'visible',
  },

  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 0,
  },

  heroTitleBlock: {
    flex: 1,
    minWidth: 0,
  },

  heroActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  heroIconButton: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.66)',
    borderWidth: 1,
    borderColor: theme.colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },

  heroAddButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.34,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 7,
  },

  notificationDot: {
    position: 'absolute',
    right: 7,
    top: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.primary,
  },

  heading: {
    color: theme.colors.text,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 0,
  },

  heroTitle: {
    color: theme.colors.text,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '900',
    letterSpacing: 0,
  },

  subheading: {
    color: theme.colors.textSoft,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
    marginTop: 0,
  },

  socialTabs: {
    gap: 18,
    paddingTop: 7,
    paddingRight: 24,
  },

  socialTab: {
    paddingBottom: 7,
    alignItems: 'center',
  },

  socialTabText: {
    color: theme.colors.textSoft,
    fontSize: 13,
    fontWeight: '800',
  },

  socialTabTextActive: {
    color: theme.colors.primary,
  },

  socialTabUnderline: {
    position: 'absolute',
    bottom: 0,
    width: '112%',
    height: 3,
    borderRadius: 999,
    backgroundColor: theme.colors.primary,
  },

  flexCardRow: {
    gap: 6,
    paddingTop: 0,
    paddingBottom: 7,
  },

  categoryStrip: {
    gap: 8,
    paddingBottom: 12,
    paddingRight: 18,
  },

  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: '#1E1450',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },

  categoryChipActive: {
    backgroundColor: '#F6F1FF',
    borderColor: theme.colors.primary,
  },

  categoryChipText: {
    color: theme.colors.textSoft,
    fontWeight: '900',
    fontSize: 12,
  },

  categoryChipTextActive: {
    color: theme.colors.primary,
  },

  newsCategoryWrap: {
    height: 58,
    justifyContent: 'center',
    overflow: 'visible',
    marginBottom: 6,
    marginRight: -14,
  },

  newsCategoryStrip: {
    gap: 8,
    paddingTop: 8,
    paddingBottom: 8,
    paddingRight: 32,
    alignItems: 'center',
  },

  newsCategoryChip: {
    height: 38,
    flexGrow: 0,
    flexShrink: 0,
    minWidth: 64,
    maxWidth: 178,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },

  newsCategoryChipActive: {
    backgroundColor: theme.colors.primary + '14',
    borderColor: theme.colors.primary,
  },

  newsCategoryChipText: {
    color: theme.colors.textSoft,
    fontWeight: '900',
    fontSize: 12,
    flexShrink: 1,
    includeFontPadding: false,
  },

  newsCategoryChipTextActive: {
    color: theme.colors.primary,
  },

  flexCard: {
    width: 104,
    minHeight: 40,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.70)',
    borderWidth: 1,
    borderColor: theme.colors.primary + '14',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 7,
    shadowColor: '#1E1450',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },

  flexCardActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + '10',
  },

  flexCardText: {
    color: theme.colors.text,
    fontWeight: '900',
    textAlign: 'left',
    fontSize: 10,
    marginTop: 0,
    lineHeight: 12,
    flex: 1,
  },

  channelIntroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: theme.colors.primary + '16',
    backgroundColor: 'rgba(255,255,255,0.70)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 7,
  },

  channelIntroIcon: {
    width: 30,
    height: 30,
    borderRadius: 11,
    backgroundColor: theme.colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },

  channelIntroTitle: {
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 13,
  },

  channelIntroCopy: {
    color: theme.colors.textSoft,
    fontWeight: '700',
    fontSize: 10.5,
    lineHeight: 14,
    marginTop: 1,
  },

  homeSummaryGrid: {
    gap: 10,
    paddingBottom: 12,
  },

  homeSummaryCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: '#1E1450',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },

  flexPreviewRow: {
    gap: 10,
    paddingTop: 4,
  },

  flexPreviewCard: {
    width: 78,
  },

  flexPreviewImage: {
    width: 70,
    height: 96,
  },

  flexPreviewPlaceholder: {
    width: 70,
    height: 96,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  flexPreviewName: {
    color: theme.colors.textSoft,
    fontSize: 10,
    fontWeight: '800',
    marginTop: 5,
  },

  homeFeatureTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '900',
  },

  homeFeatureMeta: {
    color: theme.colors.textSoft,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 5,
    fontWeight: '700',
  },

  socialGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },

  panelCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: '#1E1450',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },

  panelHalf: {
    flex: 1,
  },

  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },

  panelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  panelTitle: {
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 16,
  },

  panelSubtitle: {
    color: theme.colors.textSoft,
    fontWeight: '700',
    fontSize: 10,
    marginTop: 1,
  },

  viewAllText: {
    color: theme.colors.primary,
    fontWeight: '900',
    fontSize: 11,
  },

  topicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 7,
  },

  topicIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${theme.colors.primary}10`,
  },

  topicText: {
    flex: 1,
    color: theme.colors.text,
    fontWeight: '800',
    fontSize: 11,
  },

  topicCount: {
    color: theme.colors.textSoft,
    fontSize: 10,
    fontWeight: '800',
  },

  localEventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 10,
  },

  localEventTitle: {
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 14,
  },

  localEventMeta: {
    color: theme.colors.textSoft,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
  },

  mapMock: {
    width: 62,
    height: 62,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFEAFB',
  },

  localButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },

  localPrimaryButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
  },

  localPrimaryText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 12,
  },

  localSecondaryButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
  },

  localSecondaryText: {
    color: theme.colors.primary,
    fontWeight: '900',
    fontSize: 12,
  },

  localSearchPanel: {
    backgroundColor: theme.colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 10,
    marginBottom: 12,
  },

  localSearchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.bg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
  },

  localSearchInput: {
    flex: 1,
    color: theme.colors.text,
    fontWeight: '800',
    paddingVertical: 11,
  },

  localSearchButton: {
    minWidth: 74,
    height: 34,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },

  localSearchButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },

  localSearchQuickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },

  localSearchChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },

  localSearchChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },

  localSearchChipText: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '900',
  },

  localSearchChipTextActive: {
    color: '#FFFFFF',
  },

  localRadiusControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: theme.colors.bg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },

  localRadiusLabel: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '900',
  },

  localRadiusInput: {
    width: 42,
    minHeight: 26,
    borderRadius: 9,
    backgroundColor: theme.colors.card,
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
    paddingVertical: 2,
    paddingHorizontal: 6,
  },

  localHeroPanel: {
    position: 'relative',
    flexDirection: 'row',
    gap: 9,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.primary + '16',
    padding: 10,
    marginBottom: 9,
    overflow: 'hidden',
  },

  localHeroTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '900',
  },

  localHeroCopy: {
    color: theme.colors.textSoft,
    fontSize: 10.5,
    lineHeight: 14,
    marginTop: 3,
  },

  mapMockLarge: {
    width: 82,
    minHeight: 88,
    borderRadius: 15,
    backgroundColor: theme.colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  mapLineOne: {
    position: 'absolute',
    width: 130,
    height: 1,
    backgroundColor: theme.colors.border,
    transform: [{ rotate: '-22deg' }],
    top: 30,
    left: -18,
  },

  mapLineTwo: {
    position: 'absolute',
    width: 120,
    height: 1,
    backgroundColor: theme.colors.border,
    transform: [{ rotate: '28deg' }],
    top: 66,
    left: -16,
  },

  mapLineThree: {
    position: 'absolute',
    width: 1,
    height: 120,
    backgroundColor: theme.colors.border,
    transform: [{ rotate: '15deg' }],
    top: -8,
    right: 25,
  },

  mapDotOne: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: theme.colors.primary + '55',
    top: 22,
    right: 18,
  },

  mapDotTwo: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: theme.colors.primary,
    bottom: 18,
    left: 18,
  },

  infoGrid: {
    gap: 10,
    marginBottom: 12,
  },

  localSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },

  localStoreList: {
    gap: 8,
    marginBottom: 12,
  },

  localStoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 10,
  },

  localStoreIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: theme.colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },

  localDistance: {
    color: theme.colors.primary,
    fontWeight: '900',
    fontSize: 12,
  },

  localEmptyText: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    padding: 12,
    textAlign: 'center',
  },

  infoTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
  },

  infoTileTitle: {
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 14,
    minWidth: 92,
  },

  infoTileBody: {
    flex: 1,
    color: theme.colors.textSoft,
    fontSize: 12,
    lineHeight: 17,
  },

  localListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },

  dateBadge: {
    width: 44,
    height: 50,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  dateBadgeDay: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 16,
  },

  dateBadgeMonth: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 9,
  },

  localJoinPill: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: theme.colors.primary + '14',
  },

  localJoinText: {
    color: theme.colors.primary,
    fontWeight: '900',
    fontSize: 12,
  },

  adminEventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.colors.primary + '08',
    borderRadius: 14,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: theme.colors.primary + '24',
  },

  adminEventDate: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '900',
    marginTop: 5,
  },

  createMeetupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    paddingVertical: 12,
    backgroundColor: theme.colors.primary,
    marginTop: 10,
  },

  createMeetupButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },

  meetupModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    justifyContent: 'flex-end',
  },

  meetupModalCard: {
    backgroundColor: theme.colors.card,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
  },

  shopModalCard: {
    backgroundColor: theme.colors.card,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 36,
    maxHeight: '70%',
    marginBottom: 26,
  },

  collectorModalCard: {
    backgroundColor: theme.colors.card,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 36,
    maxHeight: '76%',
    marginBottom: 26,
  },

  collectorSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.bg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    marginTop: 14,
    marginBottom: 12,
    minHeight: 46,
  },

  collectorSearchInput: {
    flex: 1,
    color: theme.colors.text,
    fontWeight: '800',
    paddingVertical: 10,
  },

  collectorSearchClear: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },

  collectorLoadingBox: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },

  collectorListContent: {
    paddingBottom: 14,
  },

  friendBadge: {
    borderRadius: 999,
    backgroundColor: theme.colors.primary + '18',
    paddingHorizontal: 9,
    paddingVertical: 5,
    marginRight: 4,
  },

  friendBadgeText: {
    color: theme.colors.primary,
    fontSize: 11,
    fontWeight: '900',
  },

  shopDetailScroller: {
    maxHeight: 330,
  },

  shopDetailBlock: {
    gap: 10,
    paddingTop: 4,
    paddingBottom: 14,
  },

  shopInfoLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bg,
    padding: 11,
  },

  shopInfoIcon: {
    color: theme.colors.primary,
  },

  shopInfoLabel: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 2,
  },

  shopInfoValue: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },

  shopActionRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    paddingTop: 2,
  },

  shopActionButton: {
    flexGrow: 1,
    minHeight: 44,
    borderRadius: 13,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 12,
  },

  shopActionButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },

  shopSecondaryButton: {
    flexGrow: 1,
    minHeight: 44,
    borderRadius: 13,
    backgroundColor: theme.colors.primary + '12',
    borderWidth: 1,
    borderColor: theme.colors.primary + '35',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 12,
  },

  shopSecondaryButtonText: {
    color: theme.colors.primary,
    fontSize: 13,
    fontWeight: '900',
  },

  flexPickerModalCard: {
    backgroundColor: theme.colors.card,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 18,
    maxHeight: '82%',
  },

  modalCloseIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    marginLeft: 10,
  },

  meetupInput: {
    backgroundColor: theme.colors.bg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.text,
    fontWeight: '800',
    padding: 12,
    marginTop: 9,
  },

  newsCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: theme.colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    marginBottom: 10,
  },

  newsIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary + '12',
  },

  newsTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '900',
  },

  newsBody: {
    color: theme.colors.textSoft,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },

  newsSource: {
    color: theme.colors.primary,
    fontSize: 11,
    fontWeight: '900',
    marginTop: 8,
  },

  newsListContent: {
    paddingBottom: stackrTabContentPadding.standard,
    paddingRight: 2,
  },

  sharePanel: {
    backgroundColor: theme.colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    padding: 12,
    marginBottom: 12,
  },

  shareActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 10,
  },

  shareAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexGrow: 1,
    flexBasis: '46%',
    justifyContent: 'center',
  },

  shareActionText: {
    color: theme.colors.text,
    fontWeight: '800',
    fontSize: 12,
  },

  modeRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 7,
    marginBottom: 9,
  },

  tab: {
    color: theme.colors.textSoft,
    fontWeight: '800',
  },

  activeTab: {
    color: theme.colors.primary,
    fontWeight: '900',
  },

  createCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 18,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },

  input: {
    minHeight: 70,
    color: theme.colors.text,
    textAlignVertical: 'top',
    fontWeight: '700',
  },

  createActions: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },

  attachButton: {
    width: '100%',
    backgroundColor: theme.colors.bg,
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },

  attachText: {
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 12,
  },

  postButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 20,
    width: '100%',
    alignItems: 'center',
  },

  postButtonText: {
    color: '#fff',
    fontWeight: '900',
  },

  selectedCardPreview: {
    backgroundColor: theme.colors.bg,
    borderRadius: 14,
    padding: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },

  selectedPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  selectedCardImage: {
    width: 38,
    height: 54,
    borderRadius: 5,
  },

  selectedCardImagePlaceholder: {
    width: 38,
    height: 54,
    borderRadius: 8,
    backgroundColor: theme.colors.surface,
  },

  selectedBinderImage: {
    width: 44,
    height: 44,
    borderRadius: 12,
  },

  selectedBinderImagePlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: theme.colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },

  flexPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.colors.bg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
    marginBottom: 10,
  },

  flexPickerIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: theme.colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },

  flexPickerCover: {
    width: 42,
    height: 42,
    borderRadius: 14,
  },

  flexPickerTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '900',
  },

  flexPickerSubtitle: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },

  placeholderPanel: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bg,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 18,
  },

  placeholderTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 8,
    marginBottom: 4,
  },

  selectedLabel: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '900',
  },

  selectedName: {
    color: theme.colors.text,
    fontWeight: '900',
    marginTop: 3,
  },

  removeText: {
    color: '#FF6B6B',
    fontWeight: '900',
    marginTop: 6,
  },

  postCard: {
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderRadius: 20,
    padding: 13,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.primary + '14',
    shadowColor: '#1E1450',
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },

  postTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  avatar: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: theme.colors.primary,
    marginRight: 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarImage: {
    width: 40,
    height: 40,
  },

  name: {
    color: theme.colors.text,
    fontWeight: '900',
  },

  time: {
    color: theme.colors.textSoft,
    fontSize: 11,
    marginTop: 2,
  },

  postMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  postMetaDot: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '900',
    marginTop: 2,
  },

  channelPill: {
    minHeight: 28,
    maxWidth: 122,
    borderRadius: 999,
    backgroundColor: theme.colors.primary + '10',
    borderWidth: 1,
    borderColor: theme.colors.primary + '18',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    marginLeft: 8,
  },

  channelPillMark: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.primary,
  },

  channelPillText: {
    color: theme.colors.primary,
    fontSize: 11,
    fontWeight: '900',
    flexShrink: 1,
  },

  body: {
    color: theme.colors.text,
    marginTop: 11,
    lineHeight: 19,
    fontWeight: '800',
  },

  attachedCard: {
    flexDirection: 'row',
    marginTop: 12,
    backgroundColor: 'rgba(248,245,255,0.78)',
    borderRadius: 18,
    padding: 10,
    borderWidth: 1,
    borderColor: theme.colors.primary + '16',
    gap: 12,
    overflow: 'hidden',
  },

  attachedCardImageFrame: {
    width: 82,
    height: 108,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: theme.colors.primary + '10',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  attachedCardImage: {
    width: 68,
    height: 96,
  },

  attachedCardCopy: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'center',
  },

  emptyCardImage: {
    width: 68,
    height: 96,
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  binderShareIcon: {
    width: 74,
    height: 74,
    marginRight: 12,
    borderRadius: 18,
    backgroundColor: theme.colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },

  binderShareImage: {
    width: 74,
    height: 74,
    marginRight: 12,
    borderRadius: 18,
  },

  emptyCardText: {
    color: theme.colors.textSoft,
    fontSize: 10,
  },

  cardName: {
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 16,
    lineHeight: 19,
  },

  cardSet: {
    color: theme.colors.textSoft,
    marginTop: 4,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '800',
  },

  cardTag: {
    color: theme.colors.primary,
    marginTop: 10,
    fontSize: 12,
    fontWeight: '900',
  },

  cardAttributeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 10,
  },

  cardAttributePill: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: theme.colors.primary + '14',
  },

  cardAttributePillPrimary: {
    backgroundColor: theme.colors.primary + '10',
    borderColor: theme.colors.primary + '1F',
  },

  cardAttributeText: {
    color: theme.colors.textSoft,
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '900',
  },

  cardAttributeTextPrimary: {
    color: theme.colors.primary,
  },

  discussionPromptRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 9,
  },

  discussionPromptChip: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: theme.colors.primary + '0D',
    borderWidth: 1,
    borderColor: theme.colors.primary + '18',
    maxWidth: '100%',
  },

  discussionPromptText: {
    color: theme.colors.primary,
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: '900',
  },

  modalContainer: {
    flex: 1,
    padding: 16,
  },

  modalHeading: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '900',
  },

  modalSubheading: {
    color: theme.colors.textSoft,
    marginTop: 4,
    marginBottom: 14,
  },

  cardPickerSearchRow: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    marginBottom: 8,
  },

  cardPickerSearchInput: {
    flex: 1,
    color: theme.colors.text,
    fontWeight: '700',
    paddingVertical: 11,
  },

  cardPickerClearButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },

  cardPickerCountText: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 10,
  },

  ownedCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },

  ownedCardImage: {
    width: 52,
    height: 74,
    marginRight: 12,
  },

  ownedCardImagePlaceholder: {
    width: 52,
    height: 74,
    marginRight: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
  },

  ownedCardName: {
    color: theme.colors.text,
    fontWeight: '900',
  },

  ownedCardSet: {
    color: theme.colors.textSoft,
    fontSize: 12,
    marginTop: 3,
  },

  selectText: {
    color: theme.colors.primary,
    fontWeight: '900',
  },

  closeButton: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginTop: 10,
  },

  closeButtonText: {
    color: theme.colors.text,
    fontWeight: '900',
  },

  emptyState: {
    alignItems: 'center',
    padding: 24,
  },

  emptyTitle: {
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 16,
  },

  emptyText: {
    color: theme.colors.textSoft,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 20,
  },

  searchCard: {
  backgroundColor: theme.colors.card,
  borderRadius: 18,
  padding: 12,
  marginTop: 12,
  marginBottom: 12,
  borderWidth: 1,
  borderColor: theme.colors.border,
},

searchInput: {
  backgroundColor: theme.colors.bg,
  borderRadius: 14,
  padding: 12,
  color: theme.colors.text,
  fontWeight: '800',
  borderWidth: 1,
  borderColor: theme.colors.border,
},

userResultCard: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: theme.colors.bg,
  borderRadius: 14,
  padding: 10,
  marginBottom: 8,
  borderWidth: 1,
  borderColor: theme.colors.border,
},

userResultAvatar: {
  width: 40,
  height: 40,
  borderRadius: 12,
  backgroundColor: theme.colors.primary,
  marginRight: 10,
  overflow: 'hidden',
  alignItems: 'center',
  justifyContent: 'center',
},

userResultAvatarImage: {
  width: 40,
  height: 40,
},

userResultName: {
  color: theme.colors.text,
  fontWeight: '900',
},

userResultSubtext: {
  color: theme.colors.textSoft,
  fontSize: 12,
  marginTop: 2,
},
});
}
