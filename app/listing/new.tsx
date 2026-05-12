import { useTheme } from '../../components/theme-context';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import { fetchEbayPrice } from '../../lib/ebay';

import { PRICE_API_URL, USD_TO_GBP, EUR_TO_GBP } from '../../lib/config';

type Step = 'search' | 'condition' | 'photos' | 'review';

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

const PHOTO_SLOTS: Array<{ key: string; label: string; desc: string; corner: SlotCorner; required: boolean }> = [
  { key: 'front', label: 'Card Front', desc: 'Full front face — fill the frame, card flat on surface', corner: null, required: true },
  { key: 'back', label: 'Card Back', desc: 'Full back — same orientation, good lighting', corner: null, required: true },
  { key: 'corner_tl', label: 'Top-Left', desc: 'Close up of the top-left corner (front)', corner: 'tl', required: false },
  { key: 'corner_tr', label: 'Top-Right', desc: 'Close up of the top-right corner (front)', corner: 'tr', required: false },
  { key: 'corner_bl', label: 'Bottom-Left', desc: 'Close up of the bottom-left corner (front)', corner: 'bl', required: false },
  { key: 'corner_br', label: 'Bottom-Right', desc: 'Close up of the bottom-right corner (front)', corner: 'br', required: false },
];

function normalise(v: string) {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export default function NewListingScreen() {
  const { theme } = useTheme();
  const [step, setStep] = useState<Step>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SelectedCard[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [selectedCard, setSelectedCard] = useState<SelectedCard | null>(null);
  const [condition, setCondition] = useState('');
  const [conditionGuideVisible, setConditionGuideVisible] = useState(false);
  const [askingPrice, setAskingPrice] = useState('');
  const [prices, setPrices] = useState<Prices>({ ebay: null, tcg: null, cardmarket: null, loading: false });

  type Photo = { uri: string; base64: string };
  type PhotoMap = { [key: string]: Photo };
  const [photos, setPhotos] = useState<PhotoMap>({});
  const [slotIndex, setSlotIndex] = useState(0);
  const [uploading, setUploading] = useState(false);

  const [description, setDescription] = useState('');
  const [posting, setPosting] = useState(false);

  // ===============================
  // SEARCH
  // ===============================

  const searchCards = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const words = trimmed.replace(/[''ʼ]/g, "'").split(/\s+/).filter(Boolean);
      let dbQuery = supabase
        .from('pokemon_cards')
        .select('id, name, number, rarity, image_small, image_large, set_id, raw_data')
        .limit(40);

      for (const word of words) {
        if (!word.includes("'") && /[a-z]s$/i.test(word)) {
          const wildcardForm = `${word.slice(0, -1)}_s`;
          dbQuery = dbQuery.or(`name.ilike.%${word}%,name.ilike.%${wildcardForm}%`);
        } else {
          dbQuery = dbQuery.ilike('name', `%${word}%`);
        }
      }

      const { data, error } = await dbQuery;
      if (error) throw error;
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
    searchTimer.current = setTimeout(() => searchCards(text), 350);
  };

  const selectCard = (card: SelectedCard) => {
    setSelectedCard(card);
    setStep('condition');
    fetchPrices(card);
  };

  // ===============================
  // PRICES
  // ===============================

  const fetchPrices = async (card: SelectedCard) => {
    setPrices({ ebay: null, tcg: null, cardmarket: null, loading: true });
    try {
      const rawSetName = card.set_name ?? '';
      const setName = (rawSetName && rawSetName !== card.set_id) ? rawSetName : '';
      const [ebayResult] = await Promise.allSettled([
        fetchEbayPrice({ cardId: card.id, name: card.name, setName, number: card.number ?? '', rarity: card.rarity ?? '' }),
      ]);

      const tcgPrices = card.raw_data?.tcgplayer?.prices;
      let tcg: number | null = null;
      if (tcgPrices) {
        for (const key of ['holofoil', 'reverseHolofoil', 'normal', '1stEditionHolofoil', '1stEditionNormal']) {
          const val = tcgPrices[key]?.market ?? tcgPrices[key]?.mid;
          if (typeof val === 'number') { tcg = Math.round(val * USD_TO_GBP * 100) / 100; break; }
        }
      }

      const cm = card.raw_data?.cardmarket?.prices;
      const cardmarket = cm?.trendPrice != null ? Math.round(cm.trendPrice * EUR_TO_GBP * 100) / 100 : null;

      const ebay = ebayResult.status === 'fulfilled' ? (ebayResult.value?.average ?? null) : null;

      setPrices({ ebay, tcg, cardmarket, loading: false });
    } catch {
      setPrices({ ebay: null, tcg: null, cardmarket: null, loading: false });
    }
  };

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
    if (!selectedCard) return;
    const price = parseFloat(askingPrice.replace(/[£,]/g, ''));
    if (!price || isNaN(price) || price <= 0) {
      Alert.alert('Price required', 'Please enter a valid asking price.');
      return;
    }

    const missingRequired = PHOTO_SLOTS.filter(s => s.required && !photos[s.key]);
    if (missingRequired.length > 0) {
      Alert.alert('Photos required', `Please add a ${missingRequired.map(s => s.label).join(' and ')} photo before posting.`);
      return;
    }

    setPosting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');

      setUploading(true);
      const photoUrls = Object.keys(photos).length > 0 ? await uploadPhotos(user.id) : [];
      setUploading(false);

      const { error } = await supabase.from('user_card_flags').insert({
        user_id: user.id,
        card_id: selectedCard.id,
        set_id: selectedCard.set_id,
        flag_type: 'trade',
        condition,
        asking_price: price,
        listing_notes: description.trim() || null,
        listing_images: photoUrls,
        listing_status: 'active',
      });

      if (error) throw error;

      Alert.alert('Listed!', 'Your card is now on the marketplace.', [
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

  const renderSearch = () => (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
        <TextInput
          value={searchQuery}
          onChangeText={handleSearchChange}
          placeholder="Search by name or set..."
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
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
        {searchResults.map(card => (
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
        {!searching && searchQuery.trim().length > 0 && searchResults.length === 0 && (
          <Text style={{ color: theme.colors.textSoft, textAlign: 'center', marginTop: 24 }}>No cards found</Text>
        )}
      </ScrollView>
    </View>
  );

  const renderCondition = () => (
    <View style={{ flex: 1 }}>
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 8 }}>
      {/* Card preview */}
      {selectedCard && (
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 12,
          backgroundColor: theme.colors.card, borderRadius: 14, padding: 12,
          borderWidth: 1, borderColor: theme.colors.border, marginBottom: 20,
        }}>
          {selectedCard.image_small && (
            <Image source={{ uri: selectedCard.image_small }} style={{ width: 54, height: 75, borderRadius: 8 }} resizeMode="contain" />
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>{selectedCard.name}</Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 13, marginTop: 2 }}>{selectedCard.set_name}</Text>
            {selectedCard.number && <Text style={{ color: theme.colors.textSoft, fontSize: 12 }}>#{selectedCard.number}</Text>}
          </View>
        </View>
      )}

      {/* Condition */}
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
            <PriceRow label="eBay Sold Avg" value={prices.ebay} />
            <PriceRow label="TCGPlayer Market" value={prices.tcg} />
            <PriceRow label="Cardmarket Trend" value={prices.cardmarket} />
          </>
        )}
      </View>

      {/* Asking price */}
      <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16, marginBottom: 6 }}>Your Asking Price</Text>
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

    </ScrollView>
    <View style={{ padding: 16, paddingTop: 8, paddingBottom: 90 }}>
      <TouchableOpacity
        onPress={() => { if (!condition) { Alert.alert('Condition required', 'Please select a condition before continuing.'); return; } if (!askingPrice.trim()) { Alert.alert('Price required', 'Enter an asking price to continue.'); return; } setSlotIndex(0); setStep('photos'); }}
        style={{ backgroundColor: condition ? theme.colors.primary : theme.colors.border, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
      >
        <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>Next → Add Photos</Text>
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
    const slot = PHOTO_SLOTS[slotIndex];
    const captured = photos[slot.key];
    const requiredFilled = PHOTO_SLOTS.filter(s => s.required).every(s => photos[s.key]);
    const filledCount = Object.keys(photos).length;

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
            const isCurrent = i === slotIndex;
            return (
              <TouchableOpacity
                key={s.key}
                onPress={() => setSlotIndex(i)}
                style={{
                  paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
                  backgroundColor: isCurrent ? theme.colors.primary : done ? theme.colors.primary + '22' : theme.colors.card,
                  borderWidth: 1.5,
                  borderColor: isCurrent ? theme.colors.primary : done ? theme.colors.primary + '66' : theme.colors.border,
                }}
              >
                <Text style={{
                  color: isCurrent ? '#fff' : done ? theme.colors.primary : theme.colors.textSoft,
                  fontSize: 12, fontWeight: '800',
                }}>
                  {done ? '✓ ' : s.required ? '' : ''}{s.label}{s.required ? '' : ' (opt)'}
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
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900' }}>✓ {slot.label}</Text>
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
                {filledCount === PHOTO_SLOTS.length ? 'Done → Review' : `Continue with ${filledCount} photo${filledCount !== 1 ? 's' : ''}`}
              </Text>
            </TouchableOpacity>
          )}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {slotIndex > 0 && (
              <TouchableOpacity
                onPress={() => setSlotIndex(prev => prev - 1)}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: 'center', backgroundColor: theme.colors.card, borderWidth: 1.5, borderColor: theme.colors.border }}
              >
                <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 14 }}>← Back</Text>
              </TouchableOpacity>
            )}
            {slotIndex < PHOTO_SLOTS.length - 1 && (
              <TouchableOpacity
                onPress={() => setSlotIndex(prev => prev + 1)}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: 'center', backgroundColor: theme.colors.card, borderWidth: 1.5, borderColor: theme.colors.border }}
              >
                <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 14 }}>Next →</Text>
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
          <Row label="Card" value={selectedCard?.name ?? ''} />
          <Row label="Set" value={selectedCard?.set_name ?? selectedCard?.set_id ?? ''} />
          <Row label="Condition" value={condition} />
          <Row label="Asking Price" value={`£${parseFloat(askingPrice || '0').toFixed(2)}`} highlight />
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

      <View style={{ padding: 16, paddingTop: 8, paddingBottom: 90 }}>
        <TouchableOpacity
          onPress={postListing}
          disabled={posting}
          style={{
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
    search: 'Find Your Card',
    condition: 'Condition & Price',
    photos: 'Photos',
    review: 'Review & Post',
  };

  const STEPS: Step[] = ['search', 'condition', 'photos', 'review'];
  const stepIndex = STEPS.indexOf(step);

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      {/* Progress bar */}
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 }}>
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

      {step === 'search' && renderSearch()}
      {step === 'condition' && renderCondition()}
      {step === 'photos' && renderPhotos()}
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

function CardGuideOverlay({ corner, theme }: { corner: SlotCorner; theme: any }) {
  const accent = theme.colors.primary;
  const border = theme.colors.border;
  const barLen = 28;
  const barThick = 4;

  if (!corner) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{
          width: '58%', aspectRatio: 3 / 4,
          borderWidth: 2, borderColor: border, borderRadius: 10,
          borderStyle: 'dashed',
        }} />
        <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 14, fontWeight: '700' }}>
          Fill the frame
        </Text>
      </View>
    );
  }

  const isTop = corner === 'tl' || corner === 'tr';
  const isLeft = corner === 'tl' || corner === 'bl';

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      {/* Card outline with highlighted corner bracket */}
      <View style={{ width: '58%', aspectRatio: 3 / 4, borderWidth: 1.5, borderColor: border, borderRadius: 10, position: 'relative' }}>
        {/* Horizontal bar of L-bracket */}
        <View style={{
          position: 'absolute',
          top: isTop ? -1.5 : undefined,
          bottom: !isTop ? -1.5 : undefined,
          left: isLeft ? -1.5 : undefined,
          right: !isLeft ? -1.5 : undefined,
          width: barLen,
          height: barThick,
          backgroundColor: accent,
          borderRadius: barThick,
        }} />
        {/* Vertical bar of L-bracket */}
        <View style={{
          position: 'absolute',
          top: isTop ? -1.5 : undefined,
          bottom: !isTop ? -1.5 : undefined,
          left: isLeft ? -1.5 : undefined,
          right: !isLeft ? -1.5 : undefined,
          width: barThick,
          height: barLen,
          backgroundColor: accent,
          borderRadius: barThick,
        }} />
      </View>
      <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 14, fontWeight: '700' }}>
        {isTop ? 'Top' : 'Bottom'}-{isLeft ? 'left' : 'right'} corner — zoom in close
      </Text>
    </View>
  );
}
