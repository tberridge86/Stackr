import { theme } from '../../lib/theme';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Alert,
  Image,
  ScrollView,
} from 'react-native';
import { Text } from '../../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { fetchAllSets, PokemonSet } from '../../lib/pokemonTcg';
import { createBinder, fetchBinderById } from '../../lib/binders';
import { supabase } from '../../lib/supabase';
import { BINDER_COVERS } from '../../lib/binderCovers';

// ===============================
// CONSTANTS
// ===============================

const COLOR_OPTIONS = [
  '#EF4444', '#F97316', '#F59E0B', '#EAB308',
  '#84CC16', '#22C55E', '#10B981', '#14B8A6',
  '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6',
  '#A855F7', '#EC4899', '#F43F5E', '#64748B',
];

const GRADIENT_OPTIONS = [
  { colors: ['#3B82F6', '#1D4ED8'], label: 'Ocean' },
  { colors: ['#8B5CF6', '#6D28D9'], label: 'Purple' },
  { colors: ['#EC4899', '#BE185D'], label: 'Pink' },
  { colors: ['#F97316', '#C2410C'], label: 'Ember' },
  { colors: ['#22C55E', '#15803D'], label: 'Forest' },
  { colors: ['#06B6D4', '#0E7490'], label: 'Cyan' },
  { colors: ['#F59E0B', '#B45309'], label: 'Gold' },
  { colors: ['#EF4444', '#991B1B'], label: 'Crimson' },
];

const cardShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};

// ===============================
// HELPERS
// ===============================

const isDark = (color: string): boolean => {
  const c = color.replace('#', '');
  const rgb = parseInt(c, 16);
  if (isNaN(rgb)) return false;
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  return (r * 299 + g * 587 + b * 114) / 1000 < 140;
};

// ===============================
// BINDER PREVIEW COMPONENT
// ===============================

function BinderPreview({
  name,
  color,
  gradient,
  coverKey,
}: {
  name: string;
  color: string;
  gradient: string[] | null;
  coverKey: string | null;
}) {
  const cover = BINDER_COVERS.find((c) => c.key === coverKey) ?? null;
  const hasGradient = Array.isArray(gradient) && gradient.length >= 2;
  const textColor = hasGradient || isDark(color) ? '#FFFFFF' : theme.colors.text;
  const backgroundColors = hasGradient
    ? (gradient as [string, string])
    : ([color, color] as [string, string]);

  if (cover) {
    return (
      <View style={{
        borderRadius: 16,
        marginBottom: 20,
        height: 100,
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: cover.accentColor,
        ...cardShadow,
      }}>
        <Image
          source={cover.image}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }}
          resizeMode="cover"
        />
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' }} />
        <View style={{ flex: 1, padding: 16, justifyContent: 'center' }}>
          <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700', opacity: 0.8 }}>PREVIEW</Text>
          <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '900', marginTop: 4 }} numberOfLines={1}>
            {name.trim() || 'Binder name'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <LinearGradient
      colors={backgroundColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
        height: 100,
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: color,
        ...cardShadow,
      }}
    >
      <Text style={{ color: textColor, fontSize: 11, fontWeight: '700', opacity: 0.8 }}>PREVIEW</Text>
      <Text style={{ color: textColor, fontSize: 20, fontWeight: '900', marginTop: 4 }} numberOfLines={1}>
        {name.trim() || 'Binder name'}
      </Text>
    </LinearGradient>
  );
}

// ===============================
// MAIN COMPONENT
// ===============================

export default function NewBinderScreen() {
  const params = useLocalSearchParams<{
    id?: string;
    sourceSetId?: string;
    type?: string;
  }>();

  const binderId = Array.isArray(params.id) ? params.id[0] : params.id;
  const paramSourceSetId = Array.isArray(params.sourceSetId)
    ? params.sourceSetId[0]
    : params.sourceSetId;
  const paramType = Array.isArray(params.type) ? params.type[0] : params.type;

  const isEditMode = Boolean(binderId);

  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(theme.colors.primary);
  const [gradient, setGradient] = useState<string[] | null>(null);
  const [coverKey, setCoverKey] = useState<string | null>(null);
  const [type, setType] = useState<'official' | 'custom'>(
    paramType === 'official' ? 'official' : 'custom'
  );

  const [sets, setSets] = useState<PokemonSet[]>([]);
  const [selectedSet, setSelectedSet] = useState<PokemonSet | null>(null);
  const [setSearch, setSetSearch] = useState('');
  const [loadingSets, setLoadingSets] = useState(true);
  const [loadingBinder, setLoadingBinder] = useState(isEditMode);
  const [saving, setSaving] = useState(false);

  // ===============================
  // LOAD SETS
  // ===============================

  const loadSets = useCallback(async () => {
    try {
      const data = await fetchAllSets();
      setSets(data);

      if (paramSourceSetId) {
        const found = data.find((s) => s.id === paramSourceSetId);
        if (found) {
          setSelectedSet(found);
          setName(found.name);
          setType('official');
        }
      }
    } catch (err) {
      console.log('Failed to load sets', err);
    } finally {
      setLoadingSets(false);
    }
  }, [paramSourceSetId]);

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
      setColor(binder.color ?? theme.colors.primary);
      setGradient(binder.gradient ?? null);
      setCoverKey(binder.cover_key ?? null);
      setType(binder.type ?? 'custom');
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
    const search = setSearch.trim().toLowerCase();
    if (!search) return sets;
    return sets.filter(
      (set) =>
        set.name.toLowerCase().includes(search) ||
        set.id.toLowerCase().includes(search)
    );
  }, [sets, setSearch]);

  // ===============================
  // ACTIONS
  // ===============================

  const handleSelectSet = (set: PokemonSet) => {
    if (isEditMode) return;
    setSelectedSet(set);
    setName(set.name);
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

    try {
      setSaving(true);

      if (isEditMode && binderId) {
        const { error } = await supabase
          .from('binders')
          .update({
            name: name.trim(),
            color,
            gradient: gradient ?? null,
            cover_key: coverKey ?? null,
          })
          .eq('id', binderId);

        if (error) throw error;

        Alert.alert('Saved', 'Binder updated successfully.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
        return;
      }

      const binder = await createBinder({
        name: name.trim(),
        color,
        gradient,
        coverKey: coverKey ?? null,
        type,
        sourceSetId: type === 'official' ? selectedSet?.id : null,
      });

      router.replace(`/binder/${binder.id}`);
    } catch (err) {
      console.log('Save binder failed', err);
      Alert.alert('Error', 'Could not save binder.');
    } finally {
      setSaving(false);
    }
  };

  // ===============================
  // LOADING
  // ===============================

  if (loadingBinder) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.colors.primary} size="large" />
          <Text style={{ color: theme.colors.textSoft, marginTop: 12 }}>Loading binder...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ===============================
  // MAIN RENDER
  // ===============================

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={{ flex: 1, padding: 16 }}>

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              width: 40, height: 40,
              borderRadius: 12,
              backgroundColor: theme.colors.card,
              alignItems: 'center', justifyContent: 'center',
              marginRight: 12,
              borderWidth: 1, borderColor: theme.colors.border,
            }}
          >
            <Text style={{ color: theme.colors.text, fontSize: 24, lineHeight: 26 }}>‹</Text>
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontSize: 26, fontWeight: '900' }}>
              {isEditMode ? 'Edit Binder' : 'New Binder'}
            </Text>
            <Text style={{ color: theme.colors.textSoft, marginTop: 4, fontSize: 13 }}>
              {isEditMode
                ? 'Update your binder name and style.'
                : 'Create an official set binder or your own custom collection.'}
            </Text>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          {/* Live preview */}
          <View style={{ marginTop: 16 }}>
            <BinderPreview
              name={name}
              color={color}
              gradient={gradient}
              coverKey={coverKey}
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
                          backgroundColor: active ? theme.colors.primary : theme.colors.surface,
                          paddingHorizontal: 14, paddingVertical: 12,
                          borderRadius: 14,
                          borderWidth: 1,
                          borderColor: active ? theme.colors.primary : theme.colors.border,
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ color: active ? '#FFFFFF' : theme.colors.textSoft, fontWeight: '900' }}>
                          {t.toUpperCase()}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {/* Name */}
            <Text style={{ color: theme.colors.text, fontWeight: '900', marginBottom: 8 }}>
              Binder name
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Base Set, My Charizard Collection..."
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

            {/* Colour picker */}
            <Text style={{ color: theme.colors.text, fontWeight: '900', marginBottom: 10 }}>
              Binder colour
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
              {COLOR_OPTIONS.map((option) => {
                const active = color === option && !gradient && !coverKey;
                return (
                  <TouchableOpacity
                    key={option}
                    onPress={() => { setColor(option); setGradient(null); setCoverKey(null); }}
                    style={{
                      width: 38, height: 38,
                      borderRadius: 19,
                      backgroundColor: option,
                      borderWidth: active ? 4 : 2,
                      borderColor: active ? theme.colors.text : theme.colors.border,
                    }}
                  />
                );
              })}
            </View>

            {/* Gradient picker */}
            <Text style={{ color: theme.colors.text, fontWeight: '900', marginBottom: 10 }}>
              Gradient (optional)
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {GRADIENT_OPTIONS.map((g, index) => {
                const active = gradient?.[0] === g.colors[0] && gradient?.[1] === g.colors[1];
                return (
                  <TouchableOpacity
                    key={index}
                    onPress={() => { setGradient(g.colors); setCoverKey(null); }}
                    style={{
                      borderRadius: 12,
                      overflow: 'hidden',
                      borderWidth: active ? 3 : 1,
                      borderColor: active ? '#FFFFFF' : theme.colors.border,
                    }}
                  >
                    <LinearGradient
                      colors={g.colors as [string, string]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={{ width: 64, height: 36, justifyContent: 'center', alignItems: 'center' }}
                    >
                      <Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: '900' }}>
                        {g.label}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                );
              })}
            </View>

            {gradient && (
              <TouchableOpacity
                onPress={() => setGradient(null)}
                style={{
                  marginTop: 10,
                  alignSelf: 'flex-start',
                  backgroundColor: theme.colors.surface,
                  borderRadius: 999,
                  paddingHorizontal: 12, paddingVertical: 6,
                  borderWidth: 1, borderColor: theme.colors.border,
                }}
              >
                <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '700' }}>
                  ✕ Clear gradient
                </Text>
              </TouchableOpacity>
            )}

            {/* ===============================
                BINDER COVER PICKER
            =============================== */}
            <Text style={{ color: theme.colors.text, fontWeight: '900', marginTop: 20, marginBottom: 6 }}>
              Binder Cover (optional)
            </Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginBottom: 12, lineHeight: 18 }}>
              Choose a Pokémon cover. Overrides colour and gradient.
            </Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>

              {/* No cover */}
              <TouchableOpacity
                onPress={() => setCoverKey(null)}
                style={{
                  width: 72, height: 100,
                  borderRadius: 10,
                  borderWidth: coverKey === null ? 3 : 1,
                  borderColor: coverKey === null ? theme.colors.primary : theme.colors.border,
                  backgroundColor: theme.colors.surface,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Ionicons
                  name="close"
                  size={20}
                  color={coverKey === null ? theme.colors.primary : theme.colors.textSoft}
                />
                <Text style={{
                  color: coverKey === null ? theme.colors.primary : theme.colors.textSoft,
                  fontSize: 10, fontWeight: '700',
                  marginTop: 4, textAlign: 'center',
                }}>
                  None
                </Text>
              </TouchableOpacity>

              {/* Cover options */}
              {BINDER_COVERS.map((cover) => {
                const selected = coverKey === cover.key;
                return (
                  <TouchableOpacity
                    key={cover.key}
                    onPress={() => { setCoverKey(cover.key); setGradient(null); }}
                    style={{
                      width: 72, height: 100,
                      borderRadius: 10,
                      overflow: 'hidden',
                      borderWidth: selected ? 3 : 1,
                      borderColor: selected ? cover.accentColor : theme.colors.border,
                    }}
                  >
                    <Image
                      source={cover.image}
                      style={{ width: '100%', height: '100%' }}
                      resizeMode="cover"
                    />

                    {/* Checkmark when selected */}
                    {selected && (
                      <View style={{
                        position: 'absolute', top: 4, right: 4,
                        width: 20, height: 20, borderRadius: 10,
                        backgroundColor: cover.accentColor,
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                      </View>
                    )}

                    {/* Name label */}
                    <View style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0,
                      backgroundColor: 'rgba(0,0,0,0.55)',
                      paddingVertical: 3,
                    }}>
                      <Text style={{ color: '#FFFFFF', fontSize: 8, fontWeight: '900', textAlign: 'center' }}>
                        {cover.label}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
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

              {selectedSet && (
                <View style={{
                  backgroundColor: theme.colors.secondary + '20',
                  borderRadius: 12, padding: 12, marginBottom: 12,
                  borderWidth: 1, borderColor: theme.colors.secondary,
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                }}>
                  <Image
                    source={{ uri: `https://images.pokemontcg.io/${selectedSet.id}/logo.png` }}
                    style={{ width: 60, height: 28 }}
                    resizeMode="contain"
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
                      {selectedSet.name}
                    </Text>
                    <Text style={{ color: theme.colors.textSoft, fontSize: 12 }}>
                      {selectedSet.total} cards
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => { setSelectedSet(null); setName(''); }}>
                    <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '700' }}>
                      Change
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              <TextInput
                value={setSearch}
                onChangeText={setSetSearch}
                placeholder="Search sets..."
                placeholderTextColor={theme.colors.textSoft}
                autoCapitalize="none"
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
                <FlatList
                  data={filteredSets}
                  keyExtractor={(item) => item.id}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  scrollEnabled={false}
                  contentContainerStyle={{ paddingBottom: 8 }}
                  renderItem={({ item }) => {
                    const active = selectedSet?.id === item.id;
                    return (
                      <TouchableOpacity
                        onPress={() => handleSelectSet(item)}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 12,
                          padding: 12, borderRadius: 14, marginBottom: 8,
                          backgroundColor: active ? theme.colors.secondary : theme.colors.surface,
                          borderWidth: 1,
                          borderColor: active ? theme.colors.secondary : theme.colors.border,
                        }}
                      >
                        <Image
                          source={{ uri: `https://images.pokemontcg.io/${item.id}/logo.png` }}
                          style={{ width: 60, height: 26 }}
                          resizeMode="contain"
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
                            {item.name}
                          </Text>
                          <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 2 }}>
                            {item.series} · {item.total} cards
                          </Text>
                        </View>
                        {active && (
                          <Text style={{ color: theme.colors.text, fontWeight: '900' }}>✓</Text>
                        )}
                      </TouchableOpacity>
                    );
                  }}
                />
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
      </View>
    </SafeAreaView>
  );
}