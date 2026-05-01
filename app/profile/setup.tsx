import { theme } from '../../lib/theme';
import React, { useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  ScrollView,
  TextInput,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Text } from '../../components/Text';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useProfile } from '../../components/profile-context';
import { AVATAR_PRESETS } from '../../lib/avatars';

// ===============================
// CONSTANTS
// ===============================

const TYPE_OPTIONS = [
  { key: 'water', label: '💧 Water', accent: '#4FC3F7', card: '#78C8F0' },
  { key: 'fire', label: '🔥 Fire', accent: '#FF8A65', card: '#F5AC78' },
  { key: 'grass', label: '🌿 Grass', accent: '#81C784', card: '#A7DB8D' },
  { key: 'electric', label: '⚡ Electric', accent: '#FFD54F', card: '#FAE078' },
  { key: 'psychic', label: '🔮 Psychic', accent: '#CE93D8', card: '#FA92B2' },
  { key: 'dark', label: '🌑 Dark', accent: '#90A4AE', card: '#705848' },
  { key: 'dragon', label: '🐉 Dragon', accent: '#7986CB', card: '#7038F8' },
  { key: 'fighting', label: '🥊 Fighting', accent: '#EF5350', card: '#C03028' },
  { key: 'ghost', label: '👻 Ghost', accent: '#AB47BC', card: '#705898' },
  { key: 'ice', label: '❄️ Ice', accent: '#4DD0E1', card: '#98D8D8' },
  { key: 'fairy', label: '🌸 Fairy', accent: '#F48FB1', card: '#EE99AC' },
  { key: 'normal', label: '⭐ Normal', accent: '#BDBDBD', card: '#A8A878' },
];

const BACKGROUNDS = [
  { key: 'galaxy', label: 'Galaxy', preview: '#3B2C85' },
  { key: 'forest', label: 'Forest', preview: '#2E7D32' },
  { key: 'ocean', label: 'Ocean', preview: '#1565C0' },
  { key: 'lava', label: 'Lava', preview: '#BF360C' },
];

// ===============================
// HELPERS
// ===============================

function getInitials(name: string): string {
  return name
    .trim()
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

// ===============================
// MAIN COMPONENT
// ===============================

export default function ProfileSetupScreen() {
  const { profile, updateProfile } = useProfile();

  const [collectorName, setCollectorName] = useState(profile?.collector_name ?? '');
  const [pokemonType, setPokemonType] = useState(profile?.pokemon_type ?? 'water');
  const [backgroundKey, setBackgroundKey] = useState(profile?.background_key ?? 'galaxy');
  const [avatarPreset, setAvatarPreset] = useState<string | null>(profile?.avatar_preset ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isEditing = !!profile?.collector_name;

  const selectedType = useMemo(
    () => TYPE_OPTIONS.find((t) => t.key === pokemonType) ?? TYPE_OPTIONS[0],
    [pokemonType]
  );

  const selectedAvatar = useMemo(
    () => AVATAR_PRESETS.find((a) => a.key === avatarPreset) ?? null,
    [avatarPreset]
  );

  const initials = getInitials(collectorName || 'PC');

  // ===============================
  // SAVE
  // ===============================

  const handleSave = async () => {
    if (!collectorName.trim()) {
      setError('Collector name is required.');
      return;
    }

    try {
      setSaving(true);
      setError('');

      const result = await updateProfile({
        collector_name: collectorName.trim(),
        pokemon_type: pokemonType,
        background_key: backgroundKey,
        avatar_preset: avatarPreset,
        avatar_url: null,
      });

      if (result?.error) {
        setError(result.error.message ?? 'Could not save profile.');
        return;
      }

      if (isEditing) {
        Alert.alert('Saved', 'Your profile has been updated.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        router.replace('/(tabs)');
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  // ===============================
  // RENDER
  // ===============================

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
          {isEditing && (
            <TouchableOpacity
              onPress={() => router.back()}
              style={{
                width: 40, height: 40,
                borderRadius: 12,
                backgroundColor: theme.colors.card,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 12,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <Text style={{ color: theme.colors.text, fontSize: 24, lineHeight: 26 }}>‹</Text>
            </TouchableOpacity>
          )}

          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontSize: 28, fontWeight: '900' }}>
              {isEditing ? 'Edit Profile' : 'Set up your profile'}
            </Text>
            <Text style={{ color: theme.colors.textSoft, marginTop: 4, lineHeight: 20 }}>
              {isEditing
                ? 'Update your collector card.'
                : 'Your collector card is how other collectors will see you.'}
            </Text>
          </View>
        </View>

        {/* ===============================
            PREVIEW CARD
        =============================== */}
        <View style={{ marginBottom: 24, alignItems: 'center' }}>
          <View style={{
            width: '100%',
            borderRadius: 22,
            padding: 18,
            borderWidth: 6,
            borderColor: '#F6D54A',
            backgroundColor: selectedType.card,
          }}>
            <Text style={{ color: '#0b0f2a', fontSize: 12, marginBottom: 4 }}>
              Collector
            </Text>
            <Text style={{ color: '#0b0f2a', fontSize: 28, fontWeight: '900', marginBottom: 4 }}>
              {collectorName || 'Your Name'}
            </Text>
            <Text style={{ color: '#0b0f2a', fontWeight: '800', alignSelf: 'flex-end', marginBottom: 8 }}>
              HP 120
            </Text>

            {/* Avatar frame */}
            <View style={{
              height: 190,
              borderRadius: 18,
              backgroundColor: 'rgba(0,0,0,0.18)',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 10,
              overflow: 'hidden',
            }}>
              {selectedAvatar ? (
                <Image source={selectedAvatar.image} style={{ width: '100%', height: '100%' }} />
              ) : (
                <View style={{
                  width: 110, height: 110,
                  borderRadius: 999,
                  backgroundColor: selectedType.accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Text style={{ color: '#0b0f2a', fontSize: 40, fontWeight: '900' }}>
                    {initials}
                  </Text>
                </View>
              )}
            </View>

            <Text style={{ color: '#0b0f2a', textAlign: 'center', marginBottom: 14, fontWeight: '700' }}>
              Collector • Trade Partner
            </Text>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
              <Text style={{ color: '#0b0f2a', fontWeight: '800', fontSize: 16 }}>Collector Type</Text>
              <Text style={{ color: '#0b0f2a', fontWeight: '900', fontSize: 16 }}>{selectedType.label}</Text>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
              <Text style={{ color: '#0b0f2a', fontWeight: '800', fontSize: 16 }}>Background</Text>
              <Text style={{ color: '#0b0f2a', fontWeight: '900', fontSize: 16 }}>
                {BACKGROUNDS.find((bg) => bg.key === backgroundKey)?.label ?? '—'}
              </Text>
            </View>

            <Text style={{ color: '#0b0f2a', fontWeight: '700', marginTop: 10 }}>
              Collecting. Trading. Connecting.
            </Text>
          </View>
        </View>

        {/* ===============================
            COLLECTOR NAME
        =============================== */}
        <Text style={{ color: theme.colors.text, fontWeight: '800', marginBottom: 8, marginTop: 4 }}>
          Collector Name *
        </Text>
        <TextInput
          value={collectorName}
          onChangeText={(text) => {
            setCollectorName(text);
            if (error) setError('');
          }}
          placeholder="Enter collector name"
          placeholderTextColor={theme.colors.textSoft}
          style={{
            backgroundColor: theme.colors.card,
            color: theme.colors.text,
            borderRadius: 12,
            padding: 14,
            borderWidth: 1,
            borderColor: error ? '#EF4444' : theme.colors.border,
            fontWeight: '700',
          }}
          maxLength={30}
        />
        <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 6 }}>
          This is the name other collectors will see. ({collectorName.length}/30)
        </Text>

        {/* ===============================
            AVATAR
        =============================== */}
        <Text style={{ color: theme.colors.text, fontWeight: '800', marginBottom: 8, marginTop: 20 }}>
          Choose Avatar
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {AVATAR_PRESETS.map((avatar) => {
            const selected = avatar.key === avatarPreset;
            return (
              <TouchableOpacity
                key={avatar.key}
                onPress={() => setAvatarPreset(avatar.key)}
                style={{
                  width: 70, height: 70,
                  borderRadius: 12,
                  overflow: 'hidden',
                  borderWidth: 3,
                  borderColor: selected ? '#F6D54A' : 'transparent',
                }}
              >
                <Image source={avatar.image} style={{ width: '100%', height: '100%' }} />
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          onPress={() => setAvatarPreset(null)}
          style={{ marginTop: 10, alignSelf: 'flex-start' }}
        >
          <Text style={{ color: '#F6D54A', fontWeight: '700' }}>
            Use initials instead
          </Text>
        </TouchableOpacity>

        <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 6, marginBottom: 4 }}>
          You can leave the avatar blank and use your initials.
        </Text>

        {/* ===============================
            POKEMON TYPE
        =============================== */}
        <Text style={{ color: theme.colors.text, fontWeight: '800', marginBottom: 8, marginTop: 20 }}>
          Choose your Pokémon type
        </Text>

        <View style={{ gap: 10 }}>
          {TYPE_OPTIONS.map((type) => {
            const selected = type.key === pokemonType;
            return (
              <TouchableOpacity
                key={type.key}
                onPress={() => setPokemonType(type.key)}
                style={{
                  backgroundColor: selected
                    ? type.accent + '22'
                    : theme.colors.card,
                  borderRadius: 14,
                  padding: 14,
                  borderWidth: 2,
                  borderColor: selected ? type.accent : theme.colors.border,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <View style={{
                  width: 14, height: 14,
                  borderRadius: 999,
                  backgroundColor: type.accent,
                  marginRight: 10,
                }} />
                <Text style={{
                  color: theme.colors.text,
                  fontWeight: selected ? '900' : '700',
                  flex: 1,
                }}>
                  {type.label}
                </Text>
                {selected && (
                  <Ionicons name="checkmark-circle" size={18} color={type.accent} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ===============================
            BACKGROUND
        =============================== */}
        <Text style={{ color: theme.colors.text, fontWeight: '800', marginBottom: 8, marginTop: 20 }}>
          Choose your background
        </Text>

        <View style={{ gap: 10 }}>
          {BACKGROUNDS.map((bg) => {
            const selected = bg.key === backgroundKey;
            return (
              <TouchableOpacity
                key={bg.key}
                onPress={() => setBackgroundKey(bg.key)}
                style={{
                  borderRadius: 16,
                  padding: 18,
                  minHeight: 74,
                  justifyContent: 'flex-end',
                  borderWidth: 3,
                  borderColor: selected ? '#F6D54A' : 'transparent',
                  backgroundColor: bg.preview,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 16 }}>
                    {bg.label}
                  </Text>
                  {selected && (
                    <Ionicons name="checkmark-circle" size={20} color="#F6D54A" />
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ===============================
            ERROR
        =============================== */}
        {!!error && (
          <View style={{
            backgroundColor: '#FEE2E2',
            borderRadius: 12,
            padding: 12,
            marginTop: 16,
            borderWidth: 1,
            borderColor: '#FCA5A5',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}>
            <Ionicons name="alert-circle" size={18} color="#EF4444" />
            <Text style={{ color: '#991B1B', fontWeight: '700', flex: 1 }}>
              {error}
            </Text>
          </View>
        )}

        {/* ===============================
            SAVE BUTTON
        =============================== */}
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          style={{
            backgroundColor: '#F6D54A',
            padding: 16,
            borderRadius: 14,
            alignItems: 'center',
            marginTop: 24,
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 8,
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? (
            <ActivityIndicator color="#0b0f2a" size="small" />
          ) : (
            <Ionicons name="checkmark-circle" size={20} color="#0b0f2a" />
          )}
          <Text style={{ color: '#0b0f2a', fontWeight: '900', fontSize: 16 }}>
            {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Save Collector Card'}
          </Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}