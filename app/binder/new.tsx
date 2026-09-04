import { useTheme } from '../../components/theme-context';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  Modal,
  type ImageSourcePropType,
} from 'react-native';
import { Text } from '../../components/Text';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  fetchAllSets,
  getPokemonSetLogoUrl,
  getPokemonSetLogoOrSymbolUrl,
  normalizePokemonCardLanguage,
  normalizePokemonSetId,
  type PokemonCardLanguage,
  type PokemonSet,
} from '../../lib/pokemonTcg';
import { getJapaneseSetLogoSourceForSet } from '../../lib/japaneseSetLogos';
import {
  getPokemonSetLanguageFromPrefixedId,
  stripPokemonSetLanguagePrefix,
} from '../../lib/pokemonSetIdentity';
import { createBinder, fetchBinderById } from '../../lib/binders';
import { supabase } from '../../lib/supabase';
import { BINDER_COVERS } from '../../lib/binderCovers';
import { StackrBackdrop } from '../../components/StackrBackdrop';
import { StackrPageHeader, StackrScreen } from '../../components/StackrScreen';
import { StackrBackButton } from '../../components/StackrBackButton';
import { BinderArtwork } from '../../components/BinderArtwork';
import { BinderModeIconBadge } from '../../components/BinderModeBadge';
import {
  CUSTOM_BINDER_NAME_ART,
  getCustomBinderNameArt,
  getCustomBinderNameArtKeyForBinder,
  getRandomCustomBinderNameArtKey,
  setCustomBinderNameArtKeyForBinder,
} from '../../lib/customBinderNameArt';

// ===============================
// CONSTANTS
// ===============================

const BASE_ERA_SET_IDS = [
  'base1', 'base2', 'base3', 'base4', 'base5',
  'gym1', 'gym2', 'neo1', 'neo2', 'neo3', 'neo4',
];

const SET_LANGUAGE_OPTIONS: { key: PokemonCardLanguage; label: string }[] = [
  { key: 'en', label: 'English' },
  { key: 'ja', label: 'Japanese' },
  { key: 'zh-cn', label: 'Simplified' },
  { key: 'zh-tw', label: 'Traditional' },
];

const cardShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};

// ===============================
// BINDER PREVIEW COMPONENT
// ===============================

function BinderPreview({
  name,
  coverKey,
  sourceSetId,
  sourceSetLanguage,
  fallbackLogoUrl,
  fallbackLogoSource,
  type,
  cardMode,
  customNameArtKey,
}: {
  name: string;
  coverKey: string | null;
  sourceSetId?: string | null;
  sourceSetLanguage?: PokemonCardLanguage | string | null;
  fallbackLogoUrl?: string | null;
  fallbackLogoSource?: ImageSourcePropType | null;
  type: 'official' | 'custom';
  cardMode?: 'raw' | 'graded';
  customNameArtKey?: string | null;
}) {
  const { theme } = useTheme();
  const cover = BINDER_COVERS.find((c) => c.key === coverKey) ?? null;
  const customNameArt = type === 'custom' ? getCustomBinderNameArt(customNameArtKey) : null;

  return (
    <View style={{
      borderRadius: 16,
      marginBottom: 20,
      minHeight: 132,
      padding: 14,
      borderWidth: 1,
      borderColor: cover?.accentColor ?? theme.colors.border,
      backgroundColor: theme.colors.card,
      ...cardShadow,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ position: 'relative' }}>
          <BinderArtwork
            coverKey={coverKey}
            sourceSetId={type === 'official' ? sourceSetId : null}
            sourceSetLanguage={type === 'official' ? sourceSetLanguage : null}
            setName={type === 'official' ? name : null}
            fallbackLogoUrl={type === 'official' ? fallbackLogoUrl : null}
            fallbackLogoSource={type === 'official' ? fallbackLogoSource : null}
            fallbackArtSource={customNameArt?.source ?? null}
            fallbackColor={cover?.accentColor ?? theme.colors.primary}
            width={92}
            stageHeight={104}
            plateWidth={76}
            plateHeight={86}
            artworkWidth={60}
            artworkHeight={74}
            progressWidth={76}
          />
          {cardMode === 'graded' ? (
            <BinderModeIconBadge type="graded" size={44} style={{ position: 'absolute', top: 5, left: 5 }} />
          ) : null}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '700', opacity: 0.8 }}>PREVIEW</Text>
          {customNameArt ? (
            <Image source={customNameArt.source} style={{ width: '100%', height: 32, marginTop: 4 }} resizeMode="contain" />
          ) : fallbackLogoSource ? (
            <Image source={fallbackLogoSource} style={{ width: '100%', height: 38, marginTop: 4 }} resizeMode="contain" />
          ) : fallbackLogoUrl ? (
            <Image source={{ uri: fallbackLogoUrl }} style={{ width: '100%', height: 38, marginTop: 4 }} resizeMode="contain" />
          ) : null}
          <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900', marginTop: 4 }} numberOfLines={1}>
            {name.trim() || 'Binder name'}
          </Text>
          <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '700', marginTop: 5 }} numberOfLines={1}>
            {cover?.label ?? 'No cover selected'}
          </Text>
        </View>
      </View>
    </View>
  );
}

function getSetLogoUri(set: PokemonSet | null | undefined, fallbackLanguage?: PokemonCardLanguage | string | null) {
  if (!set) return null;
  return getPokemonSetLogoOrSymbolUrl(set, set.language ?? fallbackLanguage)
    ?? getPokemonSetLogoUrl(set.id, set.language ?? fallbackLanguage)
    ?? null;
}

function getSetLogoSource(set: PokemonSet | null | undefined, fallbackLanguage?: PokemonCardLanguage | string | null) {
  if (!set) return null;
  return getJapaneseSetLogoSourceForSet({
    id: set.id,
    language: set.language ?? fallbackLanguage,
    setCode: set.externalIds?.setCode,
    sourceId: set.externalIds?.tcgdex ?? set.externalIds?.pokedata,
    name: set.name,
    localName: set.localName,
    englishDisplayName: set.englishDisplayName,
    externalIds: set.externalIds,
  });
}

function stripSetLanguagePrefix(setId?: string | null) {
  return stripPokemonSetLanguagePrefix(setId);
}

function isSameSetId(left?: string | null, right?: string | null) {
  const leftId = normalizePokemonSetId(stripSetLanguagePrefix(left));
  const rightId = normalizePokemonSetId(stripSetLanguagePrefix(right));
  return Boolean(leftId && rightId && leftId === rightId);
}

function inferSetLanguageFromId(setId?: string | null): PokemonCardLanguage {
  const raw = String(setId ?? '').trim().toLowerCase();
  const stripped = stripSetLanguagePrefix(raw);
  const prefixedLanguage = getPokemonSetLanguageFromPrefixedId(raw);
  if (prefixedLanguage) return prefixedLanguage;
  return raw.startsWith('ja:') || raw.startsWith('jp:') || /^sv\d+[a-z]$/i.test(stripped) ? 'ja' : 'en';
}

function getSetLanguageLabel(language?: PokemonCardLanguage | string | null) {
  const normalized = normalizePokemonCardLanguage(language);
  if (normalized === 'ja') return 'Japanese';
  if (normalized === 'zh-cn') return 'Simplified Chinese';
  if (normalized === 'zh-tw') return 'Traditional Chinese';
  return 'English';
}

function getSetLanguageBadge(language?: PokemonCardLanguage | string | null) {
  const normalized = normalizePokemonCardLanguage(language);
  if (normalized === 'ja') return 'JP';
  if (normalized === 'zh-cn') return 'SC';
  if (normalized === 'zh-tw') return 'TC';
  return null;
}

function normalizeSetListText(value?: string | null) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/pok\u00e9mon/g, 'pokemon')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getSetSearchText(set: PokemonSet) {
  return normalizeSetListText([
    set.name,
    set.localName,
    set.englishDisplayName,
    set.id,
    set.series,
    set.externalIds?.setCode,
    set.externalIds?.tcgdex,
    set.externalIds?.pokedata,
  ].filter(Boolean).join(' '));
}

function getEditDistanceWithin(left: string, right: string, maxDistance: number) {
  if (Math.abs(left.length - right.length) > maxDistance) return maxDistance + 1;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array(right.length + 1).fill(0);

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    let rowMin = current[0];
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost
      );
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > maxDistance) return maxDistance + 1;
    for (let j = 0; j <= right.length; j += 1) previous[j] = current[j];
  }

  return previous[right.length];
}

function isLikelySetSearchMatch(set: PokemonSet, query: string) {
  const search = normalizeSetListText(query);
  if (!search) return true;
  const haystack = getSetSearchText(set);
  if (haystack.includes(search)) return true;

  const haystackTokens = haystack.split(' ').filter(Boolean);
  return search.split(' ').filter(Boolean).every((token) => (
    haystackTokens.some((candidate) => (
      candidate.includes(token)
      || token.includes(candidate)
      || (token.length >= 5 && getEditDistanceWithin(token, candidate, 2) <= 2)
    ))
  ));
}

function getSetListDedupeKey(set: PokemonSet) {
  const language = normalizePokemonCardLanguage(set.language);
  const code = String(set.externalIds?.setCode ?? set.externalIds?.tcgdex ?? '').trim();
  const name = normalizeSetListText(set.englishDisplayName ?? set.name ?? set.localName ?? set.id);
  const localName = normalizeSetListText(set.localName ?? '');
  const releaseDate = String(set.releaseDate ?? '').trim().slice(0, 10);
  if (code && !/^pokedata:/i.test(code)) return `${language}:code:${normalizePokemonSetId(code)}`;
  if (name && releaseDate) return `${language}:name:${name}:${releaseDate}`;
  if (localName && releaseDate) return `${language}:local:${localName}:${releaseDate}`;
  return `${language}:id:${normalizePokemonSetId(stripSetLanguagePrefix(set.id))}`;
}

function chooseSetListRecord(current: PokemonSet, incoming: PokemonSet) {
  const currentLogoScore = current.images?.logo || current.images?.symbol ? 1 : 0;
  const incomingLogoScore = incoming.images?.logo || incoming.images?.symbol ? 1 : 0;
  const currentTotal = Number(current.total ?? current.printedTotal ?? 0);
  const incomingTotal = Number(incoming.total ?? incoming.printedTotal ?? 0);
  if (incomingLogoScore > currentLogoScore) return incoming;
  if (incomingLogoScore === currentLogoScore && incomingTotal > currentTotal) return incoming;
  return current;
}

function dedupeSetList(list: PokemonSet[]) {
  const byKey = new Map<string, PokemonSet>();
  for (const set of list) {
    const key = getSetListDedupeKey(set);
    const existing = byKey.get(key);
    byKey.set(key, existing ? chooseSetListRecord(existing, set) : set);
  }
  return [...byKey.values()];
}

function SetLogoThumb({
  set,
  language,
  width,
  height,
}: {
  set: PokemonSet;
  language?: PokemonCardLanguage | string | null;
  width?: number;
  height?: number;
}) {
  const { theme } = useTheme();
  const thumbWidth = width ?? 84;
  const thumbHeight = height ?? 38;
  const logoSource = getSetLogoSource(set, language);
  const logoUri = getSetLogoUri(set, language);
  if (logoSource) {
    return <Image source={logoSource} style={{ width: thumbWidth, height: thumbHeight }} resizeMode="contain" />;
  }
  if (logoUri) {
    return <Image source={{ uri: logoUri }} style={{ width: thumbWidth, height: thumbHeight }} resizeMode="contain" />;
  }

  return (
    <View
      style={{
        width: thumbWidth,
        height: thumbHeight,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: theme.colors.primary + '24',
        backgroundColor: theme.colors.primary + '0F',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 6,
      }}
    >
      <Text
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.62}
        style={{
          color: theme.colors.primary,
          fontSize: 10,
          lineHeight: 11,
          fontWeight: '900',
          textAlign: 'center',
        }}
      >
        {set.name}
      </Text>
    </View>
  );
}

// ===============================
// MAIN COMPONENT
// ===============================

export default function NewBinderScreen() {
  const { theme } = useTheme();
  const params = useLocalSearchParams<{
    id?: string;
    sourceSetId?: string;
    language?: string;
    type?: string;
    returnTo?: string;
  }>();

  const binderId = Array.isArray(params.id) ? params.id[0] : params.id;
  const paramSourceSetId = Array.isArray(params.sourceSetId) ? params.sourceSetId[0] : params.sourceSetId;
  const rawParamLanguage = Array.isArray(params.language) ? params.language[0] : params.language;
  const paramLanguage = rawParamLanguage
    ? normalizePokemonCardLanguage(rawParamLanguage)
    : inferSetLanguageFromId(paramSourceSetId);
  const paramType = Array.isArray(params.type) ? params.type[0] : params.type;
  const returnTo = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;

  const isEditMode = Boolean(binderId);

  const [name, setName] = useState('');
  const [coverKey, setCoverKey] = useState<string | null>(null);
  const [sourceSetId, setSourceSetId] = useState<string | null>(paramSourceSetId ?? null);
  const [setLanguage, setSetLanguage] = useState<PokemonCardLanguage>(paramLanguage);
  const [customNameArtKey, setCustomNameArtKey] = useState<string>(getRandomCustomBinderNameArtKey());
  const [coverDropdownOpen, setCoverDropdownOpen] = useState(false);
  const [type, setType] = useState<'official' | 'custom'>(
    paramType === 'official' ? 'official' : 'custom'
  );
  const [cardMode, setCardMode] = useState<'raw' | 'graded'>('raw');
  const [edition, setEdition] = useState<'1st_edition' | 'unlimited' | null>(null);
  const [defaultCondition, setDefaultCondition] = useState('Near Mint');
  const [editionModalVisible, setEditionModalVisible] = useState(false);

  const [sets, setSets] = useState<PokemonSet[]>([]);
  const [selectedSet, setSelectedSet] = useState<PokemonSet | null>(null);
  const [setSearch, setSetSearch] = useState('');
  const [loadingSets, setLoadingSets] = useState(true);
  const [loadingBinder, setLoadingBinder] = useState(isEditMode);
  const [saving, setSaving] = useState(false);

  const isBaseEra = selectedSet && setLanguage === 'en' ? BASE_ERA_SET_IDS.includes(selectedSet.id) : false;

  const selectedCover = BINDER_COVERS.find((c) => c.key === coverKey) ?? null;

  // ===============================
  // LOAD SETS
  // ===============================

  const loadSets = useCallback(async () => {
    try {
      setLoadingSets(true);
      const data = await fetchAllSets({
        language: setLanguage,
        preferCanonicalApi: setLanguage !== 'en',
      });
      setSets(data);

      if (paramSourceSetId) {
        const found = data.find((s) => s.id === paramSourceSetId || isSameSetId(s.id, paramSourceSetId));
        if (found) {
          setSelectedSet(found);
          setSourceSetId(found.id);
          setName(found.name);
          setSetLanguage(normalizePokemonCardLanguage(found.language ?? setLanguage));
          setType('official');
        }
      }
    } catch (err) {
      console.log('Failed to load sets', err);
    } finally {
      setLoadingSets(false);
    }
  }, [paramSourceSetId, setLanguage]);

  useEffect(() => {
    loadSets();
  }, [loadSets]);

  // ===============================
  // LOAD EXISTING BINDER (edit mode)
  // ===============================

  const loadBinder = useCallback(async () => {
    if (!binderId) return;

    try {
      setLoadingBinder(true);
      const binder = await fetchBinderById(binderId);

      if (!binder) {
        Alert.alert('Error', 'Binder not found.');
        router.back();
        return;
      }

      setName(binder.name ?? '');
      setCoverKey(binder.cover_key ?? null);
      setType(binder.type ?? 'custom');
      setSourceSetId(binder.source_set_id ?? null);
      setSetLanguage(
        binder.language
          ? normalizePokemonCardLanguage(binder.language)
          : inferSetLanguageFromId(binder.source_set_id)
      );
      if ((binder.type ?? 'custom') === 'custom') {
        setCustomNameArtKey(await getCustomBinderNameArtKeyForBinder(binder.id, binder.name));
      }
      setCardMode(binder.card_mode === 'graded' ? 'graded' : 'raw');
      setEdition((binder.edition as "1st_edition" | "unlimited" | null) ?? null);
      setDefaultCondition(binder.default_condition ?? 'Near Mint');
    } catch (err) {
      console.log('Failed to load binder', err);
      Alert.alert('Error', 'Could not load binder details.');
    } finally {
      setLoadingBinder(false);
    }
  }, [binderId]);

  useEffect(() => {
    loadBinder();
  }, [loadBinder]);

  // ===============================
  // FILTER SETS
  // ===============================

  const filteredSets = useMemo(() => {
    const availableSets = dedupeSetList(sets);
    const search = setSearch.trim();
    if (!search) return availableSets;
    return availableSets.filter((set) => isLikelySetSearchMatch(set, search));
  }, [sets, setSearch]);

  // ===============================
  // ACTIONS
  // ===============================

  const handleSelectSet = (set: PokemonSet) => {
    if (isEditMode) return;
    setSetLanguage(normalizePokemonCardLanguage(set.language ?? setLanguage));
    setSelectedSet(set);
    setSourceSetId(set.id);
    setName(set.name);
    setEdition(null);
  };

  const handleSetLanguageChange = (language: PokemonCardLanguage) => {
    if (isEditMode || language === setLanguage) return;
    setSetLanguage(language);
    setSelectedSet(null);
    setSourceSetId(null);
    setSetSearch('');
    setEdition(null);
    if (type === 'official') setName('');
  };

  const saveBinder = async (resolvedEdition: '1st_edition' | 'unlimited' | null) => {
    try {
      setSaving(true);

      if (isEditMode && binderId) {
        const updatePayload = {
          name: name.trim(),
          color: theme.colors.primary,
          gradient: null,
          cover_key: coverKey ?? null,
          language: type === 'official' ? setLanguage : 'en',
          edition: resolvedEdition ?? null,
          default_condition: defaultCondition,
          card_mode: cardMode,
        };

        let { error } = await supabase
          .from('binders')
          .update(updatePayload)
          .eq('id', binderId);

        if (error?.code === 'PGRST204') {
          const { default_condition, card_mode, language, ...fallbackPayload } = updatePayload;
          void default_condition;
          void card_mode;
          void language;
          const fallback = await supabase
            .from('binders')
            .update(fallbackPayload)
            .eq('id', binderId);
          error = fallback.error;
        }

        if (error) throw error;

        if (type === 'custom') {
          await setCustomBinderNameArtKeyForBinder(binderId, customNameArtKey);
        }

        Alert.alert('Saved', 'Binder updated successfully.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
        return;
      }

      const sourceSetLogoUrl = type === 'official' ? getSetLogoUri(selectedSet, setLanguage) : null;
      const sourceSetSymbolUrl = type === 'official' ? selectedSet?.images?.symbol ?? null : null;
      const sourceSetCoverUrl = type === 'official'
        ? selectedSet?.images?.cover ?? selectedSet?.images?.artwork ?? null
        : null;

      const binder = await createBinder({
        name: name.trim(),
        color: theme.colors.primary,
        gradient: null,
        coverKey: coverKey ?? null,
        type,
        sourceSetId: type === 'official' ? selectedSet?.id : null,
        sourceSetLogoUrl,
        sourceSetSymbolUrl,
        sourceSetCoverUrl,
        sourceSetDisplayName: type === 'official' ? selectedSet?.name ?? name.trim() : null,
        sourceSetLocalName: type === 'official' ? selectedSet?.localName ?? null : null,
        sourceSetEnglishDisplayName: type === 'official'
          ? selectedSet?.englishDisplayName ?? (setLanguage === 'en' ? selectedSet?.name ?? name.trim() : null)
          : null,
        language: type === 'official' ? setLanguage : 'en',
        edition: resolvedEdition ?? null,
        defaultCondition,
        cardMode,
      });

      if (type === 'custom') {
        await setCustomBinderNameArtKeyForBinder(binder.id, customNameArtKey);
      }

      if (returnTo === 'scan-review') {
        router.back();
      } else {
        router.replace(`/binder/${binder.id}`);
      }
    } catch (err) {
      console.log('Save binder failed', err);
      Alert.alert('Error', 'Could not save binder.');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (saving) return;

    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter a binder name.');
      return;
    }

    if (!isEditMode && type === 'official' && !selectedSet) {
      Alert.alert('Set required', 'Please select a set for your official binder.');
      return;
    }

    if (!isEditMode && isBaseEra && edition === null) {
      setEditionModalVisible(true);
      return;
    }

    await saveBinder(edition);
  };

  // ===============================
  // LOADING
  // ===============================

  if (loadingBinder) {
    return (
      <StackrScreen variant="form">
        <StackrBackdrop />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.colors.primary} size="large" />
          <Text style={{ color: theme.colors.textSoft, marginTop: 12 }}>Loading binder...</Text>
        </View>
      </StackrScreen>
    );
  }

  // ===============================
  // MAIN RENDER
  // ===============================

  return (
    <StackrScreen variant="form">
      <StackrBackdrop />
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 28 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 4 }}>
          <StackrBackButton
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace('/(tabs)/binder');
              }
            }}
            style={{ marginTop: 1 }}
          />
          <StackrPageHeader
            title={isEditMode ? 'Edit Binder' : 'New Binder'}
            accentText="Binder"
            subtitle={
              isEditMode
                ? 'Update your binder name and cover.'
                : 'Choose raw cards or graded slabs, then build your collection.'
            }
            style={{ flex: 1, marginBottom: 0 }}
          />
        </View>

        {!isEditMode && (
          <View style={{
            backgroundColor: theme.colors.card,
            borderRadius: 16,
            padding: 14,
            borderWidth: 1,
            borderColor: theme.colors.border,
            marginTop: 14,
            marginBottom: 12,
            ...cardShadow,
          }}>
            <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: '900', marginBottom: 8 }}>
              Is this binder for raw cards or graded cards?
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {(['raw', 'graded'] as const).map((mode) => {
                const active = cardMode === mode;
                return (
                  <TouchableOpacity
                    key={mode}
                    onPress={() => setCardMode(mode)}
                    style={{
                      flex: 1,
                      minHeight: 58,
                      backgroundColor: active ? theme.colors.primary + '12' : theme.colors.surface,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: active ? theme.colors.primary : theme.colors.border,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      {mode === 'graded' ? <BinderModeIconBadge type="graded" size={44} /> : null}
                      <Text style={{ color: active ? theme.colors.primary : theme.colors.text, fontWeight: '900' }}>
                        {mode === 'raw' ? 'Raw cards' : 'Graded slabs'}
                      </Text>
                    </View>
                    <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '700', marginTop: 2 }}>
                      {mode === 'raw' ? 'Normal binder' : 'Slab binder'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Live preview */}
        <View style={{ marginTop: 4 }}>
          <BinderPreview
            name={name}
            coverKey={coverKey}
            sourceSetId={type === 'official' ? selectedSet?.id ?? sourceSetId : null}
            sourceSetLanguage={type === 'official' ? setLanguage : null}
            fallbackLogoUrl={type === 'official' ? getSetLogoUri(selectedSet, setLanguage) : null}
            fallbackLogoSource={type === 'official' ? getSetLogoSource(selectedSet, setLanguage) : null}
            type={type}
            cardMode={cardMode}
            customNameArtKey={customNameArtKey}
          />
        </View>

          {/* Main form card */}
          <View style={{
            backgroundColor: theme.colors.card,
            borderRadius: 20,
            padding: 16,
            borderWidth: 1,
            borderColor: theme.colors.border,
            marginBottom: 16,
            ...cardShadow,
          }}>

            {/* Binder type */}
            {!isEditMode && (
              <>
                <Text style={{ color: theme.colors.text, fontWeight: '900', marginBottom: 10 }}>
                  Binder type
                </Text>
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                  {(['official', 'custom'] as const).map((t) => {
                    const active = type === t;
                    return (
                      <TouchableOpacity
                        key={t}
                        onPress={() => setType(t)}
                        style={{
                          flex: 1,
                          backgroundColor: active ? theme.colors.primary + '12' : theme.colors.surface,
                          paddingHorizontal: 14, paddingVertical: 12,
                          borderRadius: 14,
                          borderWidth: 1,
                          borderColor: active ? theme.colors.primary : theme.colors.border,
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ color: active ? theme.colors.primary : theme.colors.textSoft, fontWeight: '900' }}>
                          {t.toUpperCase()}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {isEditMode && (
              <>
                <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '900', marginBottom: 8 }}>
                  Is this binder for raw cards or graded cards?
                </Text>
                <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 17, marginBottom: 10 }}>
                  Raw is for normal singles. Graded is for slabbed cards with a grading company and grade.
                </Text>
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: cardMode === 'graded' ? 12 : 18 }}>
                  {(['raw', 'graded'] as const).map((mode) => {
                    const active = cardMode === mode;
                    return (
                      <TouchableOpacity
                        key={mode}
                        onPress={() => setCardMode(mode)}
                        style={{
                          flex: 1,
                          minHeight: 58,
                          backgroundColor: active ? theme.colors.primary + '12' : theme.colors.surface,
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          borderRadius: 14,
                          borderWidth: 1,
                          borderColor: active ? theme.colors.primary : theme.colors.border,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          {mode === 'graded' ? <BinderModeIconBadge type="graded" size={44} /> : null}
                          <Text style={{ color: active ? theme.colors.primary : theme.colors.text, fontWeight: '900' }}>
                            {mode === 'raw' ? 'Raw cards' : 'Graded slabs'}
                          </Text>
                        </View>
                        <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '700', marginTop: 2 }}>
                          {mode === 'raw' ? 'Condition based' : 'PSA / CGC / BGS'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {/* Name */}
            <Text style={{ color: theme.colors.text, fontWeight: '900', marginBottom: 8 }}>
              {type === 'custom' ? 'Custom title wording' : 'Binder name'}
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={type === 'custom' ? 'e.g. My Owned Hits, Trade Vault...' : 'e.g. Base Set, My Charizard Collection...'}
              placeholderTextColor={theme.colors.textSoft}
              style={{
                backgroundColor: theme.colors.surface,
                color: theme.colors.text,
                padding: 14,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: theme.colors.border,
                fontWeight: '700',
                marginBottom: 16,
              }}
            />

            {type === 'custom' ? (
              <>
                <Text style={{ color: theme.colors.text, fontWeight: '900', marginBottom: 8 }}>
                  Name art style
                </Text>
                <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 17, marginBottom: 10 }}>
                  This artwork appears anywhere an official set logo would normally appear.
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 8, marginBottom: 16 }}>
                  {CUSTOM_BINDER_NAME_ART.map((art) => {
                    const selected = customNameArtKey === art.key;
                    return (
                      <TouchableOpacity
                        key={art.key}
                        onPress={() => setCustomNameArtKey(art.key)}
                        activeOpacity={0.82}
                        style={{
                          width: 126,
                          minHeight: 72,
                          borderRadius: 16,
                          borderWidth: 1,
                          borderColor: selected ? theme.colors.primary : theme.colors.border,
                          backgroundColor: selected ? `${theme.colors.primary}12` : theme.colors.surface,
                          padding: 8,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Image source={art.source} style={{ width: 106, height: 34 }} resizeMode="contain" />
                        <Text style={{ color: selected ? theme.colors.primary : theme.colors.textSoft, fontSize: 10, fontWeight: '900', marginTop: 5 }} numberOfLines={1}>
                          {art.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            ) : null}

            {/* Cover dropdown */}
            <Text style={{ color: theme.colors.text, fontWeight: '900', marginBottom: 8 }}>
              Binder cover
            </Text>

            <TouchableOpacity
              onPress={() => setCoverDropdownOpen((prev) => !prev)}
              style={{
                backgroundColor: theme.colors.surface,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: theme.colors.border,
                flexDirection: 'row',
                alignItems: 'center',
                padding: 12,
                gap: 12,
              }}
            >
              {selectedCover ? (
                <Image
                  source={selectedCover.image}
                  style={{ width: 48, height: 48, borderRadius: 8 }}
                  resizeMode="cover"
                />
              ) : (
                <View style={{
                  width: 48, height: 48, borderRadius: 8,
                  backgroundColor: theme.colors.border,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Ionicons name="images-outline" size={22} color={theme.colors.textSoft} />
                </View>
              )}

              <Text style={{ flex: 1, color: selectedCover ? theme.colors.text : theme.colors.textSoft, fontWeight: '700' }}>
                {selectedCover ? selectedCover.label : 'No cover selected'}
              </Text>

              <Ionicons
                name={coverDropdownOpen ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={theme.colors.textSoft}
              />
            </TouchableOpacity>

            {coverDropdownOpen && (
              <View style={{
                marginTop: 8,
                backgroundColor: theme.colors.card,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: theme.colors.border,
                overflow: 'hidden',
              }}>
                {/* None option */}
                <TouchableOpacity
                  onPress={() => { setCoverKey(null); setCoverDropdownOpen(false); }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 12,
                    gap: 12,
                    backgroundColor: coverKey === null ? theme.colors.primary + '18' : 'transparent',
                    borderBottomWidth: 1,
                    borderBottomColor: theme.colors.border,
                  }}
                >
                  <View style={{
                    width: 48, height: 48, borderRadius: 8,
                    backgroundColor: theme.colors.surface,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Ionicons name="close" size={20} color={theme.colors.textSoft} />
                  </View>
                  <Text style={{ color: theme.colors.text, fontWeight: '700' }}>No cover</Text>
                  {coverKey === null && (
                    <Ionicons name="checkmark" size={18} color={theme.colors.primary} style={{ marginLeft: 'auto' }} />
                  )}
                </TouchableOpacity>

                {/* Cover options */}
                {BINDER_COVERS.map((cover, index) => {
                  const selected = coverKey === cover.key;
                  return (
                    <TouchableOpacity
                      key={cover.key}
                      onPress={() => { setCoverKey(cover.key); setCoverDropdownOpen(false); }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        padding: 12,
                        gap: 12,
                        backgroundColor: selected ? theme.colors.primary + '18' : 'transparent',
                        borderBottomWidth: index < BINDER_COVERS.length - 1 ? 1 : 0,
                        borderBottomColor: theme.colors.border,
                      }}
                    >
                      <Image
                        source={cover.image}
                        style={{ width: 48, height: 48, borderRadius: 8 }}
                        resizeMode="contain"
                      />
                      <Text style={{ flex: 1, color: theme.colors.text, fontWeight: '700' }}>
                        {cover.label}
                      </Text>
                      {selected && (
                        <Ionicons name="checkmark" size={18} color={theme.colors.primary} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {/* Set picker */}
          {!isEditMode && type === 'official' && (
            <View style={{
              backgroundColor: theme.colors.card,
              borderRadius: 20, padding: 16,
              borderWidth: 1, borderColor: theme.colors.border,
              marginBottom: 16,
              ...cardShadow,
            }}>
              <Text style={{ color: theme.colors.text, fontWeight: '900', marginBottom: 10, fontSize: 16 }}>
                Select set
              </Text>

              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                {SET_LANGUAGE_OPTIONS.map((option) => {
                  const active = setLanguage === option.key;
                  return (
                    <TouchableOpacity
                      key={option.key}
                      onPress={() => handleSetLanguageChange(option.key)}
                      activeOpacity={0.84}
                      accessibilityRole="button"
                      accessibilityLabel={`Show ${option.label} sets`}
                      style={{
                        flex: 1,
                        minHeight: 42,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: active ? theme.colors.primary : theme.colors.border,
                        backgroundColor: active ? theme.colors.primary + '12' : theme.colors.surface,
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'row',
                        gap: 7,
                      }}
                    >
                      <Ionicons
                        name={option.key === 'en' ? 'albums-outline' : 'sparkles-outline'}
                        size={15}
                        color={active ? theme.colors.primary : theme.colors.textSoft}
                      />
                      <Text style={{ color: active ? theme.colors.primary : theme.colors.text, fontWeight: '900', fontSize: 13 }}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {selectedSet && (
                <View style={{
                  backgroundColor: theme.colors.secondary + '20',
                  borderRadius: 12, padding: 12, marginBottom: 12,
                  borderWidth: 1, borderColor: theme.colors.secondary,
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                }}>
                  <SetLogoThumb set={selectedSet} language={setLanguage} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{selectedSet.name}</Text>
                    <Text style={{ color: theme.colors.textSoft, fontSize: 12 }}>
                      {getSetLanguageLabel(setLanguage)} · {selectedSet.series} · {selectedSet.total} cards
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => { setSelectedSet(null); setSourceSetId(null); setName(''); setEdition(null); }}>
                    <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '700' }}>Change</Text>
                  </TouchableOpacity>
                </View>
              )}

              {!selectedSet && (
                <>
                  <TextInput
                    value={setSearch}
                    onChangeText={setSetSearch}
                    placeholder={
                      setLanguage === 'ja'
                        ? 'Search Japanese sets...'
                        : setLanguage === 'zh-cn'
                          ? 'Search Simplified Chinese sets...'
                          : setLanguage === 'zh-tw'
                            ? 'Search Traditional Chinese sets...'
                            : 'Search English sets...'
                    }
                    placeholderTextColor={theme.colors.textSoft}
                    autoCorrect={false}
                    autoCapitalize="words"
                    style={{
                      backgroundColor: theme.colors.surface,
                      color: theme.colors.text,
                      padding: 14, borderRadius: 14,
                      borderWidth: 1, borderColor: theme.colors.border,
                      marginBottom: 12, fontWeight: '700',
                    }}
                  />

                  {loadingSets ? (
                    <ActivityIndicator color={theme.colors.primary} />
                  ) : (
                    <View style={{ paddingBottom: 8 }}>
                      {filteredSets.map((item) => (
                        <TouchableOpacity
                          key={`${item.language ?? setLanguage}:${item.id}`}
                          onPress={() => handleSelectSet(item)}
                          style={{
                            flexDirection: 'row', alignItems: 'center', gap: 12,
                            padding: 12, borderRadius: 14, marginBottom: 8,
                            backgroundColor: theme.colors.surface,
                            borderWidth: 1, borderColor: theme.colors.border,
                          }}
                        >
                          <SetLogoThumb set={item} language={setLanguage} />
                          {getSetLanguageBadge(setLanguage) ? (
                            <View style={{
                              borderRadius: 999,
                              paddingHorizontal: 8,
                              paddingVertical: 4,
                              backgroundColor: theme.colors.primary + '12',
                              borderWidth: 1,
                              borderColor: theme.colors.primary + '40',
                            }}>
                              <Text style={{ color: theme.colors.primary, fontSize: 10, fontWeight: '900' }}>
                                {getSetLanguageBadge(setLanguage)}
                              </Text>
                            </View>
                          ) : null}
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{item.name}</Text>
                            <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 2 }}>
                              {item.series} · {item.total} cards
                            </Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </>
              )}
            </View>
          )}

          {/* Save button */}
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            style={{
              backgroundColor: theme.colors.primary,
              padding: 16, borderRadius: 16,
              alignItems: 'center',
              flexDirection: 'row', justifyContent: 'center',
              gap: 8, opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 16 }}>
                {isEditMode ? 'Save Changes' : 'Create Binder'}
              </Text>
            )}
          </TouchableOpacity>
      </ScrollView>

      {/* Edition picker modal */}
      <Modal
        visible={editionModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditionModalVisible(false)}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.55)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}>
          <View style={{
            backgroundColor: theme.colors.card,
            borderRadius: 24,
            padding: 24,
            width: '100%',
            borderWidth: 1,
            borderColor: theme.colors.border,
            ...cardShadow,
          }}>
            <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900', marginBottom: 6 }}>
              Which edition?
            </Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 13, marginBottom: 24, lineHeight: 18 }}>
              Base Set cards exist in two editions with very different values. Choose which this binder represents.
            </Text>

            <TouchableOpacity
              onPress={async () => { setEditionModalVisible(false); await saveBinder('1st_edition'); }}
              style={{ backgroundColor: '#F59E0B', borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginBottom: 10 }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 16 }}>1st Edition</Text>
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 3 }}>Stamp on card · higher value</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={async () => { setEditionModalVisible(false); await saveBinder('unlimited'); }}
              style={{ backgroundColor: theme.colors.surface, borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: theme.colors.border }}
            >
              <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>Unlimited</Text>
              <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 3 }}>No stamp · standard print run</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setEditionModalVisible(false)}
              style={{ alignItems: 'center', paddingVertical: 8 }}
            >
              <Text style={{ color: theme.colors.textSoft, fontWeight: '700' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </StackrScreen>
  );
}
