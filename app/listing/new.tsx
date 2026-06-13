import { useTheme } from '../../components/theme-context';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Text } from '../../components/Text';
import PokeTraceMarketInsights from '../../components/PokeTraceMarketInsights';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import { Camera, useCameraPermission } from 'react-native-vision-camera';
import { fetchEbayPrice } from '../../lib/ebay';
import { searchLocalPokemonCards } from '../../lib/cardSearch';
import { getProductPriceWithFallback } from '../../lib/productSearch';
import type { ProductLookupType } from '../../lib/productSearch';
import { useScanCamera } from '../../lib/useScanCamera';
import { fetchPokeTraceCardPrice } from '../../lib/pricing';

import { USD_TO_GBP, EUR_TO_GBP } from '../../lib/config';

type Step = 'category' | 'search' | 'condition' | 'photos' | 'review';
type ListingType = 'raw_card' | 'graded_slab' | ProductLookupType;

type SelectedCard = {
  id: string;
  name: string;
  number: string | null;
  set_id: string;
  set_name: string | null;
  rarity: string | null;
  image_small: string | null;
  image_large: string | null;
  raw_data: any;
};

type Prices = {
  ebay: number | null;
  tcg: number | null;
  cardmarket: number | null;
  loading: boolean;
};

const LISTING_TYPES: { key: ListingType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'raw_card', label: 'Raw Card', icon: 'albums-outline' },
  { key: 'graded_slab', label: 'Graded Slab', icon: 'id-card-outline' },
  { key: 'sealed_product', label: 'Sealed Product', icon: 'cube-outline' },
  { key: 'booster_pack', label: 'Booster Pack', icon: 'file-tray-full-outline' },
  { key: 'sleeved_booster_pack', label: 'Sleeved Pack', icon: 'file-tray-full-outline' },
  { key: 'booster_bundle', label: 'Booster Bundle', icon: 'file-tray-stacked-outline' },
  { key: 'booster_box', label: 'Booster Box', icon: 'archive-outline' },
  { key: 'elite_trainer_box', label: 'Elite Trainer Box', icon: 'file-tray-stacked-outline' },
  { key: 'collection_bundle', label: 'Collection Bundle', icon: 'cube-outline' },
  { key: 'accessories', label: 'Accessories', icon: 'layers-outline' },
];

const GRADING_COMPANIES = ['PSA', 'CGC', 'BGS', 'Ace'];
const GRADES = ['10', '9.5', '9', '8', '7'];

const isCardListing = (type: ListingType) => type === 'raw_card' || type === 'graded_slab';

const listingTypeLabel = (type: ListingType) =>
  LISTING_TYPES.find((item) => item.key === type)?.label ?? 'Listing';

const slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80);

const CONDITIONS = [
  {
    key: 'Near Mint', label: 'Near Mint', short: 'NM', color: '#22C55E',
    desc: 'Pack fresh, no visible wear',
    detail: 'Essentially straight from the pack. Corners are sharp, the surface is free of scratches, and edges show no whitening. Suitable for PSA 9–10 grading submission. Any imperfection — even minor — should move it to LP.',
  },
  {
    key: 'Lightly Played', label: 'Lightly Played', short: 'LP', color: '#84CC16',
    desc: 'Minor edge wear only',
    detail: 'Very light edge or corner whitening visible only under direct light. No creases, scratches on the face, or print defects. The card still looks great at arm\'s length. PSA 7–8 range.',
  },
  {
    key: 'Moderately Played', label: 'Moderately Played', short: 'MP', color: '#F59E0B',
    desc: 'Visible wear, still presentable',
    detail: 'Clear edge and corner whitening. Possible very light surface scratches or minor scuffs. No creases, bends, or tears. The wear is obvious but the card is still presentable. PSA 5–6 range.',
  },
  {
    key: 'Heavily Played', label: 'Heavily Played', short: 'HP', color: '#F97316',
    desc: 'Significant wear or creases',
    detail: 'Heavy corner whitening, visible scratches, and possible light creases. The card is complete and fully legible but shows obvious heavy play. Not suitable for grading. PSA 3–4 range.',
  },
  {
    key: 'Damaged', label: 'Damaged', short: 'DM', color: '#EF4444',
    desc: 'Heavy damage, tears or bends',
    detail: 'Severe damage such as deep creases, tears, bends, water damage, or writing on the card. The card is complete but significantly compromised. Cannot be submitted for professional grading.',
  },
];

type SlotCorner = 'tl' | 'tr' | 'bl' | 'br' | null;

const PHOTO_SLOTS: { key: string; label: string; desc: string; corner: SlotCorner; required: boolean }[] = [
  { key: 'front', label: 'Card Front', desc: 'Full front face — fill the frame, card flat on surface', corner: null, required: true },
  { key: 'back', label: 'Card Back', desc: 'Full back — same orientation, good lighting', corner: null, required: true },
  { key: 'corner_tl', label: 'Top-Left', desc: 'Close up of the top-left corner (front)', corner: 'tl', required: false },
  { key: 'corner_tr', label: 'Top-Right', desc: 'Close up of the top-right corner (front)', corner: 'tr', required: false },
  { key: 'corner_bl', label: 'Bottom-Left', desc: 'Close up of the bottom-left corner (front)', corner: 'bl', required: false },
  { key: 'corner_br', label: 'Bottom-Right', desc: 'Close up of the bottom-right corner (front)', corner: 'br', required: false },
];

const PHOTO_CAPTURE_NOTICES: Record<string, string> = {
  front: 'Front captured',
  back: 'Back captured',
  corner_tl: 'Top-left corner captured',
  corner_tr: 'Top-right corner captured',
  corner_bl: 'Bottom-left corner captured',
  corner_br: 'Bottom-right corner captured',
};

export default function NewListingScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { hasPermission, requestPermission } = useCameraPermission();
  const [step, setStep] = useState<Step>('category');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SelectedCard[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [listingType, setListingType] = useState<ListingType>('raw_card');
  const [productName, setProductName] = useState('');
  const [gradingCompany, setGradingCompany] = useState('PSA');
  const [grade, setGrade] = useState('10');
  const [selectedCard, setSelectedCard] = useState<SelectedCard | null>(null);
  const [condition, setCondition] = useState('');
  const [conditionGuideVisible, setConditionGuideVisible] = useState(false);
  const [askingPrice, setAskingPrice] = useState('');
  const [prices, setPrices] = useState<Prices>({ ebay: null, tcg: null, cardmarket: null, loading: false });

  type Photo = { uri: string; base64: string };
  type PhotoMap = { [key: string]: Photo };
  const [photos, setPhotos] = useState<PhotoMap>({});
  const [slotIndex, setSlotIndex] = useState(0);
  const [captureNotice, setCaptureNotice] = useState('Capture the card front');
  const [uploading, setUploading] = useState(false);

  const [description, setDescription] = useState('');
  const [posting, setPosting] = useState(false);

  const cameraSlotIndex = Math.min(Math.max(slotIndex, 0), PHOTO_SLOTS.length - 1);
  const cameraSlot = PHOTO_SLOTS[cameraSlotIndex] ?? PHOTO_SLOTS[0];
  const isCornerCaptureSlot = Boolean(cameraSlot.corner);
  const listingHeaderHeight = insets.top + 58;
  const listingFrameBottomPadding = isCornerCaptureSlot ? 138 : 150;
  const listingFrameWidth = isCornerCaptureSlot
    ? Math.min(screenWidth - 62, 360)
    : Math.min(screenWidth * 0.76, 340);
  const listingFrameHeight = isCornerCaptureSlot
    ? listingFrameWidth
    : Math.round(listingFrameWidth / 0.716);
  const listingFrameX = Math.round((screenWidth - listingFrameWidth) / 2);
  const listingFrameY = Math.round(
    listingHeaderHeight
    + ((screenHeight - listingHeaderHeight - insets.bottom - listingFrameBottomPadding - listingFrameHeight) / 2)
  );
  const { camera, device, torch, toggleTorch, takePhoto } = useScanCamera(false, false, {
    cropToCard: true,
    cropFrame: {
      previewWidth: screenWidth,
      previewHeight: screenHeight,
      frameWidth: listingFrameWidth,
      frameHeight: listingFrameHeight,
      frameX: listingFrameX,
      frameY: listingFrameY,
      marginRatio: 0,
    },
    resizeWidth: isCornerCaptureSlot ? 1400 : 1600,
    compress: 0.82,
  });

  const recommendedValue = prices.ebay ?? prices.tcg ?? prices.cardmarket ?? null;
  const parsedAskingPrice = parseFloat(askingPrice.replace(/[£,]/g, ''));
  const isOverMarketWarning = recommendedValue != null
    && Number.isFinite(parsedAskingPrice)
    && parsedAskingPrice > recommendedValue * 1.2;

  // ===============================
  // SEARCH
  // ===============================

  const searchCards = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const data = await searchLocalPokemonCards<any>(trimmed, {
        limit: 60,
        select: 'id, name, number, rarity, image_small, image_large, set_id, raw_data',
      });

      setSearchResults(
        (data ?? []).map((c: any) => ({
          id: c.id,
          name: c.name,
          number: c.number ?? null,
          set_id: c.set_id,
          set_name: c.raw_data?.set?.name ?? c.set_id ?? null,
          rarity: c.rarity ?? null,
          image_small: c.image_small ?? null,
          image_large: c.image_large ?? null,
          raw_data: c.raw_data,
        }))
      );
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (isCardListing(listingType)) {
      searchTimer.current = setTimeout(() => searchCards(text), 350);
    }
  };

  const handleListingTypeChange = (type: ListingType) => {
    setListingType(type);
    setSelectedCard(null);
    setSearchResults([]);
    setSearchQuery('');
    setProductName('');
    setCondition('');
    setAskingPrice('');
    setPrices({ ebay: null, tcg: null, cardmarket: null, loading: false });
  };

  const exitListing = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/(tabs)/trade' as any);
  };

  const goBack = () => {
    if (step === 'category') {
      exitListing();
      return;
    }
    if (step === 'search') setStep('category');
    if (step === 'condition') setStep('search');
    if (step === 'photos') setStep('condition');
    if (step === 'review') setStep('photos');
  };

  const selectCard = (card: SelectedCard) => {
    setSelectedCard(card);
    setStep('condition');
    fetchPrices(card);
  };

  const selectProduct = async () => {
    const trimmed = productName.trim() || searchQuery.trim();
    if (!trimmed) {
      Alert.alert('Product required', 'Enter the sealed product you want to list.');
      return;
    }
    setProductName(trimmed);
    setStep('condition');
    await fetchProductPrices(trimmed);
  };

  // ===============================
  // PRICES
  // ===============================

  const fetchPrices = async (card: SelectedCard) => {
    setPrices({ ebay: null, tcg: null, cardmarket: null, loading: true });
    try {
      const rawSetName = card.set_name ?? '';
      const setName = (rawSetName && rawSetName !== card.set_id) ? rawSetName : '';
      const pokeTrace = await fetchPokeTraceCardPrice({
        identifier: card.name,
        setName,
        number: card.number ?? null,
        market: 'US',
        gradingCompany,
        grade,
      });
      const fetchCardEbayPrice = async () => {
        if (listingType === 'raw_card' && pokeTrace?.ebay_average != null) {
          return {
            low: pokeTrace.ebay_low,
            average: pokeTrace.ebay_average,
            high: pokeTrace.ebay_high,
            count: pokeTrace.ebay_count,
          };
        }

        if (listingType === 'graded_slab' && pokeTrace?.graded_average != null) {
          return {
            low: pokeTrace.graded_low,
            average: pokeTrace.graded_average,
            high: pokeTrace.graded_high,
            count: pokeTrace.graded_count,
          };
        }

        if (listingType === 'raw_card') {
          return fetchEbayPrice({
            cardId: card.id,
            name: card.name,
            setName,
            number: card.number ?? '',
            setTotal: card.raw_data?.set?.printedTotal ?? card.raw_data?.set?.total ?? null,
            rarity: card.rarity ?? '',
          });
        }

        return null;
      };

      const [ebayResult] = await Promise.allSettled([fetchCardEbayPrice()]);

      const tcgPrices = card.raw_data?.tcgplayer?.prices;
      let tcg: number | null = pokeTrace?.tcg_mid ?? pokeTrace?.tcg_low ?? null;
      if (tcgPrices) {
        for (const key of ['holofoil', 'reverseHolofoil', 'normal', '1stEditionHolofoil', '1stEditionNormal']) {
          const val = tcgPrices[key]?.market ?? tcgPrices[key]?.mid;
          if (tcg == null && typeof val === 'number') { tcg = Math.round(val * USD_TO_GBP * 100) / 100; break; }
        }
      }

      const cm = card.raw_data?.cardmarket?.prices;
      const cardmarket = pokeTrace?.cardmarket_trend
        ?? (cm?.trendPrice != null ? Math.round(cm.trendPrice * EUR_TO_GBP * 100) / 100 : null);

      const ebay = ebayResult.status === 'fulfilled' ? (ebayResult.value?.average ?? null) : null;

      setPrices({ ebay, tcg, cardmarket, loading: false });
    } catch {
      setPrices({ ebay: null, tcg: null, cardmarket: null, loading: false });
    }
  };

  const fetchProductPrices = async (name: string) => {
    setPrices({ ebay: null, tcg: null, cardmarket: null, loading: true });
    try {
      const data = await getProductPriceWithFallback(name, listingType as ProductLookupType);
      setPrices({
        ebay: data?.average ?? null,
        tcg: null,
        cardmarket: null,
        loading: false,
      });
    } catch {
      setPrices({ ebay: null, tcg: null, cardmarket: null, loading: false });
    }
  };

  useEffect(() => {
    if (listingType === 'graded_slab' && selectedCard) {
      fetchPrices(selectedCard);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grade, gradingCompany]);

  // ===============================
  // PHOTOS
  // ===============================

  const pickPhoto = async (slotKey: string, fromCamera: boolean) => {
    const options = { quality: 0.8, allowsEditing: true, aspect: [3, 4] as [number, number], base64: true };
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (asset.base64) {
        setPhotos(prev => ({ ...prev, [slotKey]: { uri: asset.uri, base64: asset.base64! } }));
        // Auto-advance to next slot after capture
        const idx = PHOTO_SLOTS.findIndex(s => s.key === slotKey);
        if (idx < PHOTO_SLOTS.length - 1) setSlotIndex(idx + 1);
      }
    }
  };

  const captureListingPhoto = async () => {
    const safeSlotIndex = Math.min(Math.max(slotIndex, 0), PHOTO_SLOTS.length - 1);
    const slot = PHOTO_SLOTS[safeSlotIndex];
    if (!slot) return;

    const photo = await takePhoto();
    if (!photo?.base64) return;

    setPhotos(prev => ({ ...prev, [slot.key]: { uri: photo.uri, base64: photo.base64 } }));
    setCaptureNotice(PHOTO_CAPTURE_NOTICES[slot.key] ?? `${slot.label} captured`);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    if (safeSlotIndex < PHOTO_SLOTS.length - 1) {
      setSlotIndex(safeSlotIndex + 1);
    } else if (slotIndex !== safeSlotIndex) {
      setSlotIndex(safeSlotIndex);
    }
  };

  const uploadPhotos = async (userId: string): Promise<string[]> => {
    const urls: string[] = [];
    for (const slot of PHOTO_SLOTS) {
      const photo = photos[slot.key];
      if (!photo) continue;
      const path = `${userId}/${slot.key}_${Date.now()}.jpg`;

      // Convert base64 to Uint8Array for upload
      const binaryString = atob(photo.base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const { data, error } = await supabase.storage
        .from('trade-listings')
        .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('trade-listings')
        .getPublicUrl(data.path);

      urls.push(publicUrl);
    }
    return urls;
  };

  // ===============================
  // POST LISTING
  // ===============================

  const postListing = async () => {
    if (isCardListing(listingType) && !selectedCard) return;
    if (!isCardListing(listingType) && !productName.trim()) return;
    const price = parseFloat(askingPrice.replace(/[^0-9.]/g, ''));
    if (!price || isNaN(price) || price <= 0) {
      Alert.alert('Price required', 'Please enter a valid asking price.');
      return;
    }

    const missingRequired = PHOTO_SLOTS.filter(s => s.required && !photos[s.key]);
    if (missingRequired.length > 0) {
      Alert.alert('Photos required', `Please add a ${missingRequired.map(s => s.label).join(' and ')} photo before posting.`);
      return;
    }

    if (isOverMarketWarning) {
      Alert.alert(
        'This is >20% market value',
        'This listing will be flagged for admin review to help keep trades fair.',
        [
          { text: 'Edit price', style: 'cancel' },
          { text: 'Post anyway', onPress: () => postListingConfirmed(price) },
        ]
      );
      return;
    }

    postListingConfirmed(price);
  };

  const postListingConfirmed = async (price: number) => {
    setPosting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');

      setUploading(true);
      const photoUrls = Object.keys(photos).length > 0 ? await uploadPhotos(user.id) : [];
      setUploading(false);

      const resolvedName = isCardListing(listingType)
        ? selectedCard?.name ?? ''
        : productName.trim();
      const cardId = isCardListing(listingType)
        ? selectedCard!.id
        : `product:${listingType}:${slugify(resolvedName) || Date.now()}`;
      const setId = isCardListing(listingType) ? selectedCard!.set_id : null;
      const marketEstimate = recommendedValue ?? null;
      const reviewRequired = marketEstimate != null && price > marketEstimate * 1.2;

      const { error } = await supabase.from('user_card_flags').insert({
        user_id: user.id,
        card_id: cardId,
        set_id: setId,
        flag_type: 'trade',
        condition: listingType === 'raw_card' ? condition : listingType === 'graded_slab' ? `${gradingCompany} ${grade}` : 'Sealed',
        asking_price: price,
        market_estimate: marketEstimate,
        product_type: listingType,
        product_name: resolvedName,
        pricing_mode: listingType === 'graded_slab' ? 'graded' : listingType === 'raw_card' ? 'raw' : 'sealed',
        grade_company: listingType === 'graded_slab' ? gradingCompany : null,
        grade: listingType === 'graded_slab' ? grade : null,
        admin_review_required: reviewRequired,
        admin_review_reason: reviewRequired ? 'This is >20% market value' : null,
        listing_notes: description.trim() || null,
        listing_images: photoUrls,
        listing_status: 'active',
      });

      if (error) throw error;

      Alert.alert('Listed!', reviewRequired ? 'Your listing is live and flagged for admin review.' : 'Your listing is now live in Trades.', [
        { text: 'OK', onPress: () => router.replace('/trade' as any) },
      ]);
    } catch (err: any) {
      Alert.alert('Could not post listing', err?.message ?? 'Something went wrong.');
    } finally {
      setPosting(false);
      setUploading(false);
    }
  };

  // ===============================
  // RENDER STEPS
  // ===============================

  const renderListingTypeOption = (item: { key: ListingType; label: string; icon: keyof typeof Ionicons.glyphMap }) => {
    const active = listingType === item.key;
    return (
      <TouchableOpacity
        key={item.key}
        onPress={() => handleListingTypeChange(item.key)}
        activeOpacity={0.85}
        style={{
          width: '31%',
          minHeight: 102,
          backgroundColor: active ? theme.colors.primary + '10' : theme.colors.card,
          borderRadius: 14,
          borderWidth: 1.5,
          borderColor: active ? theme.colors.primary : theme.colors.border,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 10,
          marginBottom: 10,
          position: 'relative',
        }}
      >
        {active && (
          <View style={{ position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: 10, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="checkmark" size={14} color="#FFFFFF" />
          </View>
        )}
        <Ionicons name={item.icon} size={34} color={active ? theme.colors.primary : theme.colors.text} />
        <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 11, textAlign: 'center', marginTop: 8 }} numberOfLines={2}>
          {item.label}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderCategory = () => (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 110, gap: 10 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          {LISTING_TYPES.map(renderListingTypeOption)}
        </View>
      </ScrollView>

      <View style={{ padding: 16, paddingTop: 8, paddingBottom: 90 }}>
        <TouchableOpacity
          onPress={() => setStep('search')}
          style={{ backgroundColor: theme.colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
        >
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>Next</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderSearch = () => (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingBottom: 12, gap: 10 }}>
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          backgroundColor: theme.colors.card,
          borderRadius: 14,
          padding: 12,
          borderWidth: 1,
          borderColor: theme.colors.border,
        }}>
          <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: theme.colors.primary + '16', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={LISTING_TYPES.find((item) => item.key === listingType)?.icon ?? 'cube-outline'} size={24} color={theme.colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '800' }}>Listing category</Text>
            <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: '900' }}>{listingTypeLabel(listingType)}</Text>
          </View>
          <TouchableOpacity onPress={() => setStep('category')} style={{ paddingHorizontal: 10, paddingVertical: 7 }}>
            <Text style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 12 }}>Change</Text>
          </TouchableOpacity>
        </View>

        {isCardListing(listingType) ? (
          <>
            <TextInput
              value={searchQuery}
              onChangeText={handleSearchChange}
              placeholder={listingType === 'graded_slab' ? 'Search the card inside the slab...' : 'Search by name or set...'}
              placeholderTextColor={theme.colors.textSoft}
              autoFocus
              style={{
                backgroundColor: theme.colors.card,
                color: theme.colors.text,
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: 14,
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontSize: 15,
              }}
            />
            {searching && <ActivityIndicator style={{ marginTop: 8 }} color={theme.colors.primary} />}
          </>
        ) : (
          <>
            <TextInput
              value={productName}
              onChangeText={setProductName}
              placeholder={`Enter ${listingTypeLabel(listingType).toLowerCase()} name...`}
              placeholderTextColor={theme.colors.textSoft}
              autoFocus
              style={{
                backgroundColor: theme.colors.card,
                color: theme.colors.text,
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: 14,
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontSize: 15,
              }}
            />
            <TouchableOpacity
              onPress={selectProduct}
              style={{ backgroundColor: theme.colors.primary, borderRadius: 14, paddingVertical: 13, alignItems: 'center' }}
            >
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14 }}>Continue</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <ScrollView
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="interactive"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 320 }}
      >
        {isCardListing(listingType) && searchResults.map(card => (
          <TouchableOpacity
            key={card.id}
            onPress={() => selectCard(card)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: theme.colors.card,
              borderRadius: 14,
              padding: 12,
              marginBottom: 8,
              borderWidth: 1,
              borderColor: theme.colors.border,
              gap: 12,
            }}
          >
            {card.image_small ? (
              <Image source={{ uri: card.image_small }} style={{ width: 46, height: 64, borderRadius: 6 }} resizeMode="contain" />
            ) : (
              <View style={{ width: 46, height: 64, borderRadius: 6, backgroundColor: theme.colors.surface }} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 14 }} numberOfLines={1}>{card.name}</Text>
              <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                {card.set_name ?? card.set_id}{card.number ? ` · #${card.number}` : ''}
              </Text>
              {card.rarity && <Text style={{ color: '#FFD166', fontSize: 11, fontWeight: '700', marginTop: 2 }}>{card.rarity}</Text>}
            </View>
          </TouchableOpacity>
        ))}
        {isCardListing(listingType) && !searching && searchQuery.trim().length > 0 && searchResults.length === 0 && (
          <Text style={{ color: theme.colors.textSoft, textAlign: 'center', marginTop: 24 }}>No cards found</Text>
        )}
      </ScrollView>
    </View>
  );

  const renderCondition = () => (
    <View style={{ flex: 1 }}>
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 8 }}>
      {/* Card preview */}
      {(selectedCard || productName.trim()) && (
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 12,
          backgroundColor: theme.colors.card, borderRadius: 14, padding: 12,
          borderWidth: 1, borderColor: theme.colors.border, marginBottom: 20,
        }}>
          {selectedCard?.image_small ? (
            <Image source={{ uri: selectedCard.image_small }} style={{ width: 54, height: 75, borderRadius: 8 }} resizeMode="contain" />
          ) : (
            <View style={{ width: 54, height: 75, borderRadius: 8, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={LISTING_TYPES.find((item) => item.key === listingType)?.icon ?? 'cube-outline'} size={24} color={theme.colors.textSoft} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>{selectedCard?.name ?? productName.trim()}</Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 13, marginTop: 2 }}>
              {selectedCard?.set_name ?? listingTypeLabel(listingType)}
            </Text>
            {selectedCard?.number && <Text style={{ color: theme.colors.textSoft, fontSize: 12 }}>#{selectedCard.number}</Text>}
          </View>
        </View>
      )}

      {listingType === 'raw_card' && (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>Condition <Text style={{ color: '#EF4444', fontSize: 14 }}>*</Text></Text>
            <TouchableOpacity
              onPress={() => setConditionGuideVisible(true)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.colors.surface, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: theme.colors.border }}
            >
              <Ionicons name="help-circle-outline" size={15} color={theme.colors.primary} />
              <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '800' }}>Grading guide</Text>
            </TouchableOpacity>
          </View>
          {condition === '' && (
            <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginBottom: 8, fontWeight: '700' }}>Select a condition to continue</Text>
          )}
          {CONDITIONS.map(c => (
            <TouchableOpacity
              key={c.key}
              onPress={() => setCondition(c.key)}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                backgroundColor: condition === c.key ? c.color + '18' : theme.colors.card,
                borderRadius: 12, padding: 12, marginBottom: 8,
                borderWidth: 2, borderColor: condition === c.key ? c.color : theme.colors.border,
              }}
            >
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 14 }}>{c.label}</Text>
                <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 1 }}>{c.desc}</Text>
              </View>
              <View style={{ backgroundColor: condition === c.key ? c.color : theme.colors.surface, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: condition === c.key ? c.color : theme.colors.border }}>
                <Text style={{ color: condition === c.key ? '#fff' : theme.colors.textSoft, fontWeight: '900', fontSize: 12 }}>{c.short}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </>
      )}

      {listingType === 'graded_slab' && (
        <View style={{ backgroundColor: theme.colors.card, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 12 }}>
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16, marginBottom: 10 }}>Slab details</Text>
          <Text style={{ color: theme.colors.textSoft, fontWeight: '800', fontSize: 12, marginBottom: 8 }}>Company</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {GRADING_COMPANIES.map((company) => (
              <TouchableOpacity key={company} onPress={() => setGradingCompany(company)} style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: gradingCompany === company ? theme.colors.primary : theme.colors.surface, borderWidth: 1, borderColor: gradingCompany === company ? theme.colors.primary : theme.colors.border }}>
                <Text style={{ color: gradingCompany === company ? '#fff' : theme.colors.text, fontWeight: '900', fontSize: 12 }}>{company}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={{ color: theme.colors.textSoft, fontWeight: '800', fontSize: 12, marginBottom: 8 }}>Grade</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {GRADES.map((value) => (
              <TouchableOpacity key={value} onPress={() => setGrade(value)} style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: grade === value ? theme.colors.primary : theme.colors.surface, borderWidth: 1, borderColor: grade === value ? theme.colors.primary : theme.colors.border }}>
                <Text style={{ color: grade === value ? '#fff' : theme.colors.text, fontWeight: '900', fontSize: 12 }}>{value}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Suggested prices */}
      <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16, marginTop: 12, marginBottom: 8 }}>Suggested Prices</Text>
      <View style={{
        backgroundColor: theme.colors.card, borderRadius: 14, padding: 12,
        borderWidth: 1, borderColor: theme.colors.border, marginBottom: 10,
      }}>
        {prices.loading ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={{ color: theme.colors.textSoft, fontSize: 13 }}>Fetching prices...</Text>
          </View>
        ) : (
          <>
            <PriceRow label={listingType === 'graded_slab' ? 'PokeTrace Graded Avg' : 'eBay Sold Avg'} value={prices.ebay} />
            {isCardListing(listingType) && <PriceRow label="TCGPlayer Market" value={prices.tcg} />}
            {isCardListing(listingType) && <PriceRow label="Cardmarket Trend" value={prices.cardmarket} />}
            {recommendedValue != null && (
              <TouchableOpacity
                onPress={() => setAskingPrice(recommendedValue.toFixed(2))}
                style={{ marginTop: 8, backgroundColor: theme.colors.surface, borderRadius: 10, paddingVertical: 9, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border }}
              >
                <Text style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 12 }}>Use recommended £{recommendedValue.toFixed(2)}</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

      {selectedCard && isCardListing(listingType) && (
        <PokeTraceMarketInsights
          cardName={selectedCard.name}
          setName={selectedCard.set_name ?? null}
          number={selectedCard.number ?? null}
          rawCondition={listingType === 'raw_card' ? condition || 'Near Mint' : null}
          gradingCompany={listingType === 'graded_slab' ? gradingCompany : null}
          grade={listingType === 'graded_slab' ? grade : null}
        />
      )}

      {/* Asking price */}
      <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16, marginBottom: 6 }}>Your Trade Value</Text>
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: theme.colors.card, borderRadius: 14,
        borderWidth: 1, borderColor: theme.colors.border,
        paddingHorizontal: 14, marginBottom: 2,
      }}>
        <Text style={{ color: theme.colors.textSoft, fontSize: 18, fontWeight: '700', marginRight: 4 }}>£</Text>
        <TextInput
          value={askingPrice}
          onChangeText={setAskingPrice}
          placeholder="0.00"
          placeholderTextColor={theme.colors.textSoft}
          keyboardType="decimal-pad"
          style={{ flex: 1, color: theme.colors.text, fontSize: 18, fontWeight: '700', paddingVertical: 14 }}
        />
      </View>
      {isOverMarketWarning && (
        <View style={{ backgroundColor: '#FEF3C7', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#F59E0B', marginTop: 8 }}>
          <Text style={{ color: '#92400E', fontWeight: '900', fontSize: 12 }}>This is &gt;20% market value</Text>
          <Text style={{ color: '#92400E', fontSize: 12, marginTop: 2 }}>Admin can review this listing to keep Trades fair.</Text>
        </View>
      )}

    </ScrollView>
    <View style={{ padding: 16, paddingTop: 8, paddingBottom: 90, flexDirection: 'row', gap: 10 }}>
      <TouchableOpacity
        onPress={goBack}
        style={{ flex: 1, backgroundColor: theme.colors.card, borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, borderColor: theme.colors.border }}
      >
        <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 15 }}>Back</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => { if (listingType === 'raw_card' && !condition) { Alert.alert('Condition required', 'Please select a condition before continuing.'); return; } if (!askingPrice.trim()) { Alert.alert('Price required', 'Enter a trade value to continue.'); return; } setSlotIndex(0); setStep('photos'); }}
        style={{ flex: 1, backgroundColor: listingType !== 'raw_card' || condition ? theme.colors.primary : theme.colors.border, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
      >
        <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>Next</Text>
      </TouchableOpacity>
    </View>

    {/* Condition grading guide modal */}
    <Modal visible={conditionGuideVisible} transparent animationType="slide" onRequestClose={() => setConditionGuideVisible(false)}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={() => setConditionGuideVisible(false)} />
        <View style={{ backgroundColor: theme.colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, maxHeight: '80%' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 18 }}>Condition Grading Guide</Text>
          <TouchableOpacity onPress={() => setConditionGuideVisible(false)} style={{ padding: 4 }}>
            <Ionicons name="close" size={22} color={theme.colors.textSoft} />
          </TouchableOpacity>
        </View>
        <Text style={{ color: theme.colors.textSoft, fontSize: 13, marginBottom: 16, lineHeight: 18 }}>
          Condition affects value significantly. Be honest — misrepresented listings lead to disputes.
        </Text>
        <ScrollView showsVerticalScrollIndicator={false}>
          {CONDITIONS.map((c, i) => (
            <View key={c.key} style={{ marginBottom: i < CONDITIONS.length - 1 ? 16 : 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <View style={{ backgroundColor: c.color + '20', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1.5, borderColor: c.color }}>
                  <Text style={{ color: c.color, fontWeight: '900', fontSize: 13 }}>{c.short}</Text>
                </View>
                <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 15 }}>{c.label}</Text>
              </View>
              <Text style={{ color: theme.colors.textSoft, fontSize: 13, lineHeight: 20 }}>{c.detail}</Text>
              {i < CONDITIONS.length - 1 && (
                <View style={{ height: 1, backgroundColor: theme.colors.border, marginTop: 16 }} />
              )}
            </View>
          ))}
        </ScrollView>
        </View>
      </View>
    </Modal>
    </View>
  );

  const renderPhotos = () => {
    const safeSlotIndex = Math.min(Math.max(slotIndex, 0), PHOTO_SLOTS.length - 1);
    const slot = PHOTO_SLOTS[safeSlotIndex];
    if (!slot) return null;

    const captured = photos[slot.key];
    const requiredFilled = PHOTO_SLOTS.filter(s => s.required).every(s => photos[s.key]);
    const filledCount = Object.keys(photos).length;
    const cornerTargetStyle = getListingCornerTargetStyle(slot.corner);

    if (!hasPermission) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Ionicons name="camera-outline" size={42} color={theme.colors.primary} />
          <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900', marginTop: 14, textAlign: 'center' }}>
            Camera access is needed for listing photos.
          </Text>
          <TouchableOpacity
            onPress={requestPermission}
            style={{ marginTop: 18, backgroundColor: theme.colors.primary, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 12 }}
          >
            <Text style={{ color: '#fff', fontWeight: '900' }}>Allow Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={goBack}
            style={{ marginTop: 12, paddingHorizontal: 18, paddingVertical: 12 }}
          >
            <Text style={{ color: theme.colors.textSoft, fontWeight: '800' }}>Back</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (device) {
      return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {device && (
          <Camera
            ref={camera}
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={step === 'photos'}
            photo={true}
            torch={torch}
          />
        )}

        <SafeAreaView edges={['top', 'bottom']} style={StyleSheet.absoluteFill}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8 }}>
            <TouchableOpacity
              onPress={goBack}
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
            </TouchableOpacity>

            <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 8 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '900' }}>Listing Photos</Text>
              <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 }}>
                {captureNotice}
              </Text>
            </View>

            <TouchableOpacity
              onPress={toggleTorch}
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: torch === 'on' ? '#F59E0B' : 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', borderWidth: torch === 'on' ? 2 : 0, borderColor: '#F59E0B' }}
            >
              <Ionicons name={torch === 'on' ? 'flash' : 'flash-outline'} size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <View style={{
              position: 'absolute',
              left: listingFrameX,
              top: listingFrameY,
              width: listingFrameWidth,
              height: listingFrameHeight,
              borderRadius: 16,
              borderWidth: 2,
              borderColor: captured ? '#10B981' : 'rgba(255,255,255,0.6)',
            }}>
              <View style={{ position: 'absolute', top: -2, left: -2, width: 28, height: 28, borderTopWidth: 4, borderLeftWidth: 4, borderColor: theme.colors.primary, borderRadius: 4 }} />
              <View style={{ position: 'absolute', top: -2, right: -2, width: 28, height: 28, borderTopWidth: 4, borderRightWidth: 4, borderColor: theme.colors.primary, borderRadius: 4 }} />
              <View style={{ position: 'absolute', bottom: -2, left: -2, width: 28, height: 28, borderBottomWidth: 4, borderLeftWidth: 4, borderColor: theme.colors.primary, borderRadius: 4 }} />
              <View style={{ position: 'absolute', bottom: -2, right: -2, width: 28, height: 28, borderBottomWidth: 4, borderRightWidth: 4, borderColor: theme.colors.primary, borderRadius: 4 }} />

              {cornerTargetStyle && (
                <View style={cornerTargetStyle}>
                  <View style={{ position: 'absolute', top: 12, left: 12, right: 12, height: 1, backgroundColor: 'rgba(255,255,255,0.7)' }} />
                  <View style={{ position: 'absolute', bottom: 12, left: 12, right: 12, height: 1, backgroundColor: 'rgba(255,255,255,0.7)' }} />
                  <View style={{ position: 'absolute', left: 12, top: 12, bottom: 12, width: 1, backgroundColor: 'rgba(255,255,255,0.7)' }} />
                  <View style={{ position: 'absolute', right: 12, top: 12, bottom: 12, width: 1, backgroundColor: 'rgba(255,255,255,0.7)' }} />
                </View>
              )}

              <View style={{ position: 'absolute', left: 18, right: 18, bottom: 18, backgroundColor: 'rgba(0,0,0,0.58)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
                <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '800', textAlign: 'center' }}>
                  {slot.label}
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 10, textAlign: 'center', marginTop: 2 }} numberOfLines={2}>
                  {slot.desc}
                </Text>
              </View>
            </View>
          </View>

          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingBottom: Platform.OS === 'android' ? 54 : 34, gap: 8 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ minHeight: 42, gap: 7, alignItems: 'center', paddingHorizontal: 16 }}>
              {PHOTO_SLOTS.map((s, i) => {
                const photo = photos[s.key];
                const active = i === safeSlotIndex;
                return (
                  <TouchableOpacity
                    key={s.key}
                    onPress={() => setSlotIndex(i)}
                    style={{ width: 72, height: 44, borderRadius: 9, overflow: 'hidden', borderWidth: 1, borderColor: active ? theme.colors.primary : 'rgba(255,255,255,0.45)', backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}
                  >
                    {photo ? (
                      <>
                        <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                        <View style={{ position: 'absolute', top: 3, right: 3, width: 16, height: 16, borderRadius: 8, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                        </View>
                      </>
                    ) : (
                      <Text style={{ color: active ? '#FFFFFF' : 'rgba(255,255,255,0.72)', fontSize: 9, fontWeight: '900', textAlign: 'center' }}>
                        {i + 1}. {s.label}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              onPress={captureListingPhoto}
              style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: 'rgba(255,255,255,0.3)' }}
            >
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: theme.colors.primary }} />
            </TouchableOpacity>

            <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 11 }}>
              Tap to capture {slot.label.toLowerCase()}
            </Text>

            <TouchableOpacity
              onPress={() => setStep('review')}
              disabled={!requiredFilled}
              style={{ backgroundColor: theme.colors.primary, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 9, opacity: requiredFilled ? 1 : 0.45 }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 13 }}>
                {requiredFilled ? `Review ${filledCount} photo${filledCount !== 1 ? 's' : ''}` : 'Front and back required'}
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
      );
    }

    return (
      <View style={{ flex: 1 }}>
        {/* Slot pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, gap: 8, flexDirection: 'row' }}
        >
          {PHOTO_SLOTS.map((s, i) => {
            const done = !!photos[s.key];
            const isCurrent = i === safeSlotIndex;
            return (
              <TouchableOpacity
                key={s.key}
                onPress={() => setSlotIndex(i)}
                style={{
                  minWidth: 118, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                  backgroundColor: isCurrent ? theme.colors.primary : done ? theme.colors.primary + '22' : theme.colors.card,
                  borderWidth: 1.5,
                  borderColor: isCurrent ? theme.colors.primary : done ? theme.colors.primary + '66' : theme.colors.border,
                  alignItems: 'center',
                }}
              >
                <Text style={{
                  color: isCurrent ? '#fff' : done ? theme.colors.primary : theme.colors.textSoft,
                  fontSize: 12, fontWeight: '800',
                }}>
                  {done ? 'Done - ' : s.required ? '' : ''}{s.label}{s.required ? '' : ' (opt)'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 18, marginBottom: 4 }}>{slot.label}</Text>
          <Text style={{ color: theme.colors.textSoft, fontSize: 13, marginBottom: 16 }}>{slot.desc}</Text>

          {/* Photo / guide area */}
          <View style={{
            width: '100%', aspectRatio: 3 / 4, borderRadius: 16, overflow: 'hidden',
            marginBottom: 16, backgroundColor: theme.colors.card,
            borderWidth: captured ? 0 : 2, borderColor: theme.colors.border,
          }}>
            {captured ? (
              <>
                <Image source={{ uri: captured.uri }} style={{ flex: 1 }} resizeMode="cover" />
                <View style={{
                  position: 'absolute', bottom: 10, left: 10,
                  backgroundColor: theme.colors.primary,
                  borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
                }}>
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900' }}>{slot.label}</Text>
                </View>
              </>
            ) : (
              <CardGuideOverlay corner={slot.corner} theme={theme} />
            )}
          </View>

          {/* Capture buttons */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 4 }}>
            <TouchableOpacity
              onPress={() => pickPhoto(slot.key, true)}
              style={{ flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center', backgroundColor: theme.colors.primary }}
            >
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14 }}>
                {captured ? '↺  Retake' : '📷  Take Photo'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => pickPhoto(slot.key, false)}
              style={{ flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center', backgroundColor: theme.colors.card, borderWidth: 1.5, borderColor: theme.colors.border }}
            >
              <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 14 }}>Gallery</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Navigation */}
        <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 90, gap: 10 }}>
          {requiredFilled && (
            <TouchableOpacity
              onPress={() => setStep('review')}
              style={{ backgroundColor: theme.colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
            >
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>
                {filledCount === PHOTO_SLOTS.length ? 'Done - Review' : `Continue with ${filledCount} photo${filledCount !== 1 ? 's' : ''}`}
              </Text>
            </TouchableOpacity>
          )}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {true && (
              <TouchableOpacity
                onPress={() => safeSlotIndex > 0 ? setSlotIndex(safeSlotIndex - 1) : setStep('condition')}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: 'center', backgroundColor: theme.colors.card, borderWidth: 1.5, borderColor: theme.colors.border }}
              >
                <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 14 }}>Back</Text>
              </TouchableOpacity>
            )}
            {safeSlotIndex < PHOTO_SLOTS.length - 1 && (
              <TouchableOpacity
                onPress={() => setSlotIndex(safeSlotIndex + 1)}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: 'center', backgroundColor: theme.colors.card, borderWidth: 1.5, borderColor: theme.colors.border }}
              >
                <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 14 }}>Next</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  };

  const renderReview = () => (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 8 }}>
        {/* Summary */}
        <View style={{
          backgroundColor: theme.colors.card, borderRadius: 16, padding: 14,
          borderWidth: 1, borderColor: theme.colors.border, marginBottom: 16,
        }}>
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 15, marginBottom: 10 }}>Listing Summary</Text>
          <Row label="Type" value={listingTypeLabel(listingType)} />
          <Row label={isCardListing(listingType) ? 'Card' : 'Product'} value={selectedCard?.name ?? productName.trim()} />
          {selectedCard && <Row label="Set" value={selectedCard.set_name ?? selectedCard.set_id ?? ''} />}
          <Row label={listingType === 'graded_slab' ? 'Slab' : listingType === 'raw_card' ? 'Condition' : 'State'} value={listingType === 'graded_slab' ? `${gradingCompany} ${grade}` : listingType === 'raw_card' ? condition : 'Sealed'} />
          {recommendedValue != null && <Row label="Recommended" value={`£${recommendedValue.toFixed(2)}`} />}
          <Row label="Trade Value" value={`£${parseFloat(askingPrice || '0').toFixed(2)}`} highlight />
          {isOverMarketWarning && <Row label="Admin Review" value="This is >20% market value" />}
          <Row label="Photos" value={`${Object.keys(photos).length} of ${PHOTO_SLOTS.length}`} />
        </View>

        {/* Photos preview — labelled slots */}
        {Object.keys(photos).length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {PHOTO_SLOTS.filter(s => photos[s.key]).map(s => (
                <View key={s.key} style={{ width: 80 }}>
                  <Image source={{ uri: photos[s.key].uri }} style={{ width: 80, height: 107, borderRadius: 10 }} resizeMode="cover" />
                  <Text style={{ color: theme.colors.textSoft, fontSize: 10, textAlign: 'center', marginTop: 4, fontWeight: '700' }}>{s.label}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        )}

        {/* Description */}
        <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 15, marginBottom: 8 }}>Description (optional)</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Any extra details about your card..."
          placeholderTextColor={theme.colors.textSoft}
          multiline
          style={{
            backgroundColor: theme.colors.card, color: theme.colors.text,
            borderWidth: 1, borderColor: theme.colors.border, borderRadius: 14,
            paddingHorizontal: 14, paddingVertical: 12, minHeight: 90,
            textAlignVertical: 'top', fontSize: 14,
          }}
        />
      </ScrollView>

      <View style={{ padding: 16, paddingTop: 8, paddingBottom: 90, flexDirection: 'row', gap: 10 }}>
        <TouchableOpacity
          onPress={goBack}
          disabled={posting}
          style={{
            flex: 1,
            backgroundColor: theme.colors.card,
            borderRadius: 14,
            paddingVertical: 16,
            alignItems: 'center',
            borderWidth: 1.5,
            borderColor: theme.colors.border,
            opacity: posting ? 0.6 : 1,
          }}
        >
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={postListing}
          disabled={posting}
          style={{
            flex: 1,
            backgroundColor: theme.colors.primary, borderRadius: 14,
            paddingVertical: 16, alignItems: 'center', opacity: posting ? 0.6 : 1,
          }}
        >
          {posting ? (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>
                {uploading ? 'Uploading photos...' : 'Posting...'}
              </Text>
            </View>
          ) : (
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>Post Listing</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  const STEP_LABELS: Record<Step, string> = {
    category: 'Choose Category',
    search: 'Choose Listing',
    condition: 'Details & Value',
    photos: 'Photos',
    review: 'Review & Post',
  };

  const STEPS: Step[] = ['category', 'search', 'condition', 'photos', 'review'];
  const stepIndex = STEPS.indexOf(step);

  if (step === 'photos') {
    return renderPhotos();
  }

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      {/* Progress bar */}
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 }}>
        <TouchableOpacity onPress={goBack} style={{ width: 44, height: 44, alignItems: 'flex-start', justifyContent: 'center', marginBottom: 4 }}>
          <Ionicons name="arrow-back" size={26} color={theme.colors.primary} />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
          {STEPS.map((s, i) => (
            <View
              key={s}
              style={{
                flex: 1, height: 3, borderRadius: 999,
                backgroundColor: i <= stepIndex ? theme.colors.primary : theme.colors.border,
              }}
            />
          ))}
        </View>
        <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 18 }}>{STEP_LABELS[step]}</Text>
        <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 2 }}>Step {stepIndex + 1} of {STEPS.length}</Text>
      </View>

      {step === 'category' && renderCategory()}
      {step === 'search' && renderSearch()}
      {step === 'condition' && renderCondition()}
      {step === 'review' && renderReview()}
    </SafeAreaView>
  );
}

function PriceRow({ label, value }: { label: string; value: number | null }) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 }}>
      <Text style={{ color: theme.colors.textSoft, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: value != null ? theme.colors.text : theme.colors.textSoft, fontWeight: '700', fontSize: 13 }}>
        {value != null ? `£${value.toFixed(2)}` : '--'}
      </Text>
    </View>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 }}>
      <Text style={{ color: theme.colors.textSoft, fontSize: 13 }}>{label}</Text>
      <Text style={{
        color: highlight ? theme.colors.primary : theme.colors.text,
        fontWeight: highlight ? '900' : '700', fontSize: 13,
      }}>{value}</Text>
    </View>
  );
}

function getListingCornerTargetStyle(corner: SlotCorner) {
  if (!corner) return null;

  const base = {
    position: 'absolute' as const,
    top: 18,
    right: 18,
    bottom: 18,
    left: 18,
    borderWidth: 2,
    borderColor: '#10B981',
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderRadius: 16,
  };

  if (corner === 'tl') return { ...base, borderTopLeftRadius: 22 };
  if (corner === 'tr') return { ...base, borderTopRightRadius: 22 };
  if (corner === 'bl') return { ...base, borderBottomLeftRadius: 22 };
  return { ...base, borderBottomRightRadius: 22 };
}

function CardGuideOverlay({ corner, theme }: { corner: SlotCorner; theme: any }) {
  const accent = theme.colors.primary;
  const border = theme.colors.border;
  const barLen = 28;
  const barThick = 4;

  if (!corner) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface }}>
        <View style={{ position: 'absolute', top: 16, left: 16, right: 16, bottom: 16, borderRadius: 16, borderWidth: 1, borderColor: border }} />
        <View style={{
          width: '62%', aspectRatio: 0.72,
          borderWidth: 2, borderColor: accent, borderRadius: 14,
          borderStyle: 'dashed',
        }}>
          <View style={{ position: 'absolute', top: -2, left: -2, width: 32, height: 32, borderTopWidth: 4, borderLeftWidth: 4, borderColor: accent, borderTopLeftRadius: 14 }} />
          <View style={{ position: 'absolute', top: -2, right: -2, width: 32, height: 32, borderTopWidth: 4, borderRightWidth: 4, borderColor: accent, borderTopRightRadius: 14 }} />
          <View style={{ position: 'absolute', bottom: -2, left: -2, width: 32, height: 32, borderBottomWidth: 4, borderLeftWidth: 4, borderColor: accent, borderBottomLeftRadius: 14 }} />
          <View style={{ position: 'absolute', bottom: -2, right: -2, width: 32, height: 32, borderBottomWidth: 4, borderRightWidth: 4, borderColor: accent, borderBottomRightRadius: 14 }} />
        </View>
        <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 14, fontWeight: '700' }}>
          Fill the frame
        </Text>
      </View>
    );
  }

  const isTop = corner === 'tl' || corner === 'tr';
  const isLeft = corner === 'tl' || corner === 'bl';

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface }}>
      {/* Card outline with highlighted corner bracket */}
      <View style={{ width: '74%', aspectRatio: 1, borderWidth: 2, borderColor: accent, borderRadius: 18, borderStyle: 'dashed', position: 'relative', backgroundColor: accent + '10' }}>
        {/* Horizontal bar of L-bracket */}
        <View style={{
          position: 'absolute',
          top: isTop ? -2 : undefined,
          bottom: !isTop ? -2 : undefined,
          left: isLeft ? -2 : undefined,
          right: !isLeft ? -2 : undefined,
          width: barLen + 16,
          height: barThick,
          backgroundColor: accent,
          borderRadius: barThick,
        }} />
        {/* Vertical bar of L-bracket */}
        <View style={{
          position: 'absolute',
          top: isTop ? -2 : undefined,
          bottom: !isTop ? -2 : undefined,
          left: isLeft ? -2 : undefined,
          right: !isLeft ? -2 : undefined,
          width: barThick,
          height: barLen + 16,
          backgroundColor: accent,
          borderRadius: barThick,
        }} />
      </View>
      <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 14, fontWeight: '700' }}>
        Fill the frame with the {isTop ? 'top' : 'bottom'}-{isLeft ? 'left' : 'right'} corner
      </Text>
    </View>
  );
}
