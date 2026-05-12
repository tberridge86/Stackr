import { useTheme } from '../../components/theme-context';
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
  Modal,
} from 'react-native';
import { Text } from '../../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { fetchAllSets, PokemonSet } from '../../lib/pokemonTcg';
import { createBinder, fetchBinderById } from '../../lib/binders';
import { supabase } from '../../lib/supabase';
import { BINDER_COVERS } from '../../lib/binderCovers';

// ===============================
// CONSTANTS
// ===============================

const BASE_ERA_SET_IDS = [
  'base1', 'base2', 'base3', 'base4', 'base5',
  'gym1', 'gym2', 'neo1', 'neo2', 'neo3', 'neo4',
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
}: {
  name: string;
  coverKey: string | null;
}) {
  const cover = BINDER_COVERS.find((c) => c.key === coverKey) ?? null;

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
    <View style={{
      borderRadius: 16,
      marginBottom: 20,
      height: 100,
      justifyContent: 'center',
      padding: 16,
      borderWidth: 2,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.card,
      ...cardShadow,
    }}>
      <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '700', opacity: 0.8 }}>PREVIEW</Text>
      <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900', marginTop: 4 }} numberOfLines={1}>
        {name.trim() || 'Binder name'}
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
    type?: string;
  }>();

  const binderId = Array.isArray(params.id) ? params.id[0] : params.id;
  const paramSourceSetId = Array.isArray(params.sourceSetId) ? params.sourceSetId[0] : params.sourceSetId;
  const paramType = Array.isArray(params.type) ? params.type[0] : params.type;

  const isEditMode = Boolean(binderId);

  const [name, setName] = useState('');
  const [coverKey, setCoverKey] = useState<string | null>(null);
  const [coverDropdownOpen, setCoverDropdownOpen] = useState(false);
  const [type, setType] = useState<'official' | 'custom'>(
    paramType === 'official' ? 'official' : 'custom'
  );
  const [edition, setEdition] = useState<'1st_edition' | 'unlimited' | null>(null);
  const [editionModalVisible, setEditionModalVisible] = useState(false);

  const [sets, setSets] = useState<PokemonSet[]>([]);
  const [selectedSet, setSelectedSet] = useState<PokemonSet | null>(null);
  const [setSearch, setSetSearch] = useState('');
  const [loadingSets, setLoadingSets] = useState(true);
  const [loadingBinder, setLoadingBinder] = useState(isEditMode);
  const [saving, setSaving] = useState(false);

  const isBaseEra = selectedSet ? BASE_ERA_SET_IDS.includes(selectedSet.id) : false;

  const selectedCover = BINDER_COVERS.find((c) => c.key === coverKey) ?? null;

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
      setCoverKey(binder.cover_key ?? null);
      setType(binder.type ?? 'custom');
      setEdition((binder.edition as "1st_edition" | "unlimited" | null) ?? null);
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
    setEdition(null);
  };

  const saveBinder = async (resolvedEdition: '1st_edition' | 'unlimited' | null) => {
    try {
      setSaving(true);

      if (isEditMode && binderId) {
        const { error } = await supabase
          .from('binders')
          .update({
            name: name.trim(),
            color: theme.colors.primary,
            gradient: null,
            cover_key: coverKey ?? null,
            edition: resolvedEdition ?? null,
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
        color: theme.colors.primary,
        gradient: null,
        coverKey: coverKey ?? null,
        type,
        sourceSetId: type === 'official' ? selectedSet?.id : null,
        edition: resolvedEdition ?? null,
      });

      router.replace(`/binder/${binder.id}`);
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
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }} edges={['bottom', 'left', 'right']}>
      <View style={{ flex: 1, padding: 16, paddingBottom: 0 }}>

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
           <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontSize: 26, fontWeight: '900' }}>
              {isEditMode ? 'Edit Binder' : 'New Binder'}
            </Text>
            <Text style={{ color: theme.colors.textSoft, marginTop: 4, fontSize: 13 }}>
              {isEditMode
                ? 'Update your binder name and cover.'
                : 'Create an official set binder or your own custom collection.'}
            </Text>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 85 }}
        >
          {/* Live preview */}
          <View style={{ marginTop: 4 }}>
            <BinderPreview name={name} coverKey={coverKey} />
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
                        resizeMode="cover"
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
                    <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{selectedSet.name}</Text>
                    <Text style={{ color: theme.colors.textSoft, fontSize: 12 }}>{selectedSet.total} cards</Text>
                  </View>
                  <TouchableOpacity onPress={() => { setSelectedSet(null); setName(''); setEdition(null); }}>
                    <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '700' }}>Change</Text>
                  </TouchableOpacity>
                </View>
              )}

              {!selectedSet && (
                <>
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
                      renderItem={({ item }) => (
                        <TouchableOpacity
                          onPress={() => handleSelectSet(item)}
                          style={{
                            flexDirection: 'row', alignItems: 'center', gap: 12,
                            padding: 12, borderRadius: 14, marginBottom: 8,
                            backgroundColor: theme.colors.surface,
                            borderWidth: 1, borderColor: theme.colors.border,
                          }}
                        >
                          <Image
                            source={{ uri: `https://images.pokemontcg.io/${item.id}/logo.png` }}
                            style={{ width: 60, height: 26 }}
                            resizeMode="contain"
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{item.name}</Text>
                            <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 2 }}>
                              {item.series} · {item.total} cards
                            </Text>
                          </View>
                        </TouchableOpacity>
                      )}
                    />
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
      </View>

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
    </SafeAreaView>
  );
}