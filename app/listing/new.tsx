import { theme } from '../../lib/theme';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
  Pressable,
} from 'react-native';
import { Text } from '../../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import { fetchEbayPrice } from '../../lib/ebay';

const PRICE_API_URL = process.env.EXPO_PUBLIC_PRICE_API_URL ?? '';
const USD_TO_GBP = 0.79;
const EUR_TO_GBP = 0.85;

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
  { key: 'Near Mint', label: 'Near Mint', short: 'NM', desc: 'Pack fresh, no visible wear' },
  { key: 'Lightly Played', label: 'Lightly Played', short: 'LP', desc: 'Minor edge wear only' },
  { key: 'Moderately Played', label: 'Moderately Played', short: 'MP', desc: 'Visible wear, still playable' },
  { key: 'Heavily Played', label: 'Heavily Played', short: 'HP', desc: 'Significant wear or creases' },
  { key: 'Damaged', label: 'Damaged', short: 'DM', desc: 'Heavy damage, tears or bends' },
];

function normalise(v: string) {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export default function NewListingScreen() {
  const [step, setStep] = useState<Step>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SelectedCard[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [selectedCard, setSelectedCard] = useState<SelectedCard | null>(null);
  const [condition, setCondition] = useState('Near Mint');
  const [askingPrice, setAskingPrice] = useState('');
  const [prices, setPrices] = useState<Prices>({ ebay: null, tcg: null, cardmarket: null, loading: false });

  type Photo = { uri: string; base64: string };
  const [photos, setPhotos] = useState<Photo[]>([]);
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

  const pickPhoto = async (fromCamera: boolean) => {
    if (photos.length >= 4) {
      Alert.alert('Max photos', 'You can add up to 4 photos.');
      return;
    }

    const options = { quality: 0.7, allowsEditing: true, aspect: [3, 4] as [number, number], base64: true };
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (asset.base64) {
        setPhotos(prev => [...prev, { uri: asset.uri, base64: asset.base64! }]);
      }
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const uploadPhotos = async (userId: string): Promise<string[]> => {
    const urls: string[] = [];
    for (const photo of photos) {
      const path = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;

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

    setPosting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');

      setUploading(true);
      const photoUrls = photos.length > 0 ? await uploadPhotos(user.id) : [];
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
      <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16, marginBottom: 10 }}>Condition</Text>
      {CONDITIONS.map(c => (
        <TouchableOpacity
          key={c.key}
          onPress={() => setCondition(c.key)}
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            backgroundColor: condition === c.key ? theme.colors.primary + '18' : theme.colors.card,
            borderRadius: 12, padding: 12, marginBottom: 8,
            borderWidth: 2, borderColor: condition === c.key ? theme.colors.primary : theme.colors.border,
          }}
        >
          <View>
            <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 14 }}>{c.label}</Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 1 }}>{c.desc}</Text>
          </View>
          <Text style={{ color: theme.colors.textSoft, fontWeight: '900', fontSize: 13 }}>{c.short}</Text>
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
        onPress={() => { if (!askingPrice.trim()) { Alert.alert('Price required', 'Enter an asking price to continue.'); return; } setStep('photos'); }}
        style={{ backgroundColor: theme.colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
      >
        <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>Next → Add Photos</Text>
      </TouchableOpacity>
    </View>
    </View>
  );

  const renderPhotos = () => (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 8 }}>
        <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16, marginBottom: 4 }}>Card Photos</Text>
        <Text style={{ color: theme.colors.textSoft, fontSize: 13, marginBottom: 16 }}>
          Add up to 4 photos. Clear photos help your listing sell faster.
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {photos.map((photo, i) => (
            <View key={i} style={{ width: '47%', aspectRatio: 3 / 4 }}>
              <Image source={{ uri: photo.uri }} style={{ flex: 1, borderRadius: 12 }} resizeMode="cover" />
              {i === 0 && (
                <View style={{
                  position: 'absolute', bottom: 8, left: 8,
                  backgroundColor: theme.colors.primary,
                  borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
                }}>
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900' }}>★ Main</Text>
                </View>
              )}
              <TouchableOpacity
                onPress={() => removePhoto(i)}
                style={{
                  position: 'absolute', top: 6, right: 6,
                  backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 999,
                  width: 26, height: 26, alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '900' }}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}

          {photos.length < 4 && (
            <TouchableOpacity
              onPress={() => Alert.alert('Add photo', 'Choose a source', [
                { text: 'Camera', onPress: () => pickPhoto(true) },
                { text: 'Gallery', onPress: () => pickPhoto(false) },
                { text: 'Cancel', style: 'cancel' },
              ])}
              style={{
                width: '47%', aspectRatio: 3 / 4,
                backgroundColor: theme.colors.card,
                borderRadius: 12, borderWidth: 2, borderColor: theme.colors.border,
                borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Text style={{ color: theme.colors.primary, fontSize: 32 }}>+</Text>
              <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 4 }}>Add photo</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <View style={{ padding: 16, paddingTop: 8, paddingBottom: 90 }}>
        <TouchableOpacity
          onPress={() => setStep('review')}
          style={{ backgroundColor: theme.colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
        >
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>
            {photos.length > 0 ? 'Next → Review' : 'Skip Photos'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

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
          <Row label="Photos" value={`${photos.length} photo${photos.length !== 1 ? 's' : ''}`} />
        </View>

        {/* Photos preview */}
        {photos.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
            {photos.slice(0, 4).map((photo, i) => (
              <Image key={i} source={{ uri: photo.uri }} style={{ flex: 1, aspectRatio: 3 / 4, borderRadius: 10 }} resizeMode="cover" />
            ))}
          </View>
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
