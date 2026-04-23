import React, { useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
  TextInput,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { useProfile } from '../../components/profile-context';
import { AVATAR_PRESETS } from '../../lib/avatars';

const TYPE_OPTIONS = [
  { key: 'water', label: 'Water', accent: '#4FC3F7', card: '#78C8F0' },
  { key: 'fire', label: 'Fire', accent: '#FF8A65', card: '#F5AC78' },
  { key: 'grass', label: 'Grass', accent: '#81C784', card: '#A7DB8D' },
  { key: 'electric', label: 'Electric', accent: '#FFD54F', card: '#FAE078' },
  { key: 'psychic', label: 'Psychic', accent: '#CE93D8', card: '#FA92B2' },
  { key: 'dark', label: 'Dark', accent: '#90A4AE', card: '#705848' },
  { key: 'dragon', label: 'Dragon', accent: '#7986CB', card: '#7038F8' },
];

const BACKGROUNDS = [
  { key: 'galaxy', label: 'Galaxy', preview: '#3B2C85' },
  { key: 'forest', label: 'Forest', preview: '#2E7D32' },
  { key: 'ocean', label: 'Ocean', preview: '#1565C0' },
  { key: 'lava', label: 'Lava', preview: '#BF360C' },
];

function getInitials(name: string) {
  return name
    .trim()
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export default function ProfileSetupScreen() {
  const { profile, updateProfile } = useProfile();

  const [collectorName, setCollectorName] = useState(profile?.collector_name ?? '');
  const [pokemonType, setPokemonType] = useState(profile?.pokemon_type ?? 'water');
  const [backgroundKey, setBackgroundKey] = useState(profile?.background_key ?? 'galaxy');
  const [avatarPreset, setAvatarPreset] = useState(profile?.avatar_preset ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedType = useMemo(
    () => TYPE_OPTIONS.find((type) => type.key === pokemonType) ?? TYPE_OPTIONS[0],
    [pokemonType]
  );

  const selectedAvatar = useMemo(
    () => AVATAR_PRESETS.find((avatar) => avatar.key === avatarPreset) ?? null,
    [avatarPreset]
  );

  const initials = getInitials(collectorName || 'PC');

  const handleSave = async () => {
    if (!collectorName.trim()) {
      setError('Collector name is required.');
      return;
    }

    setSaving(true);
    setError('');

    const { error } = await updateProfile({
      collector_name: collectorName.trim(),
      pokemon_type: pokemonType,
      background_key: backgroundKey,
      avatar_preset: avatarPreset,
      avatar_url: null,
    });

    setSaving(false);

    if (error) {
      setError(error.message || 'Failed to save profile.');
      return;
    }

    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.heading}>Set up your profile</Text>
        <Text style={styles.subheading}>
          Your collector card is how other collectors will see you.
        </Text>

        <View style={styles.previewWrap}>
          <View style={[styles.collectorCard, { backgroundColor: selectedType.card }]}>
            <Text style={styles.collectorSmall}>Collector</Text>
            <Text style={styles.collectorName}>{collectorName || 'Your Name'}</Text>
            <Text style={styles.hp}>HP 120</Text>

            <View style={styles.avatarFrame}>
              {selectedAvatar ? (
                <Image source={selectedAvatar.image} style={styles.avatarImage} />
              ) : (
                <View style={[styles.initialsAvatar, { backgroundColor: selectedType.accent }]}>
                  <Text style={styles.initialsText}>{initials}</Text>
                </View>
              )}
            </View>

            <Text style={styles.cardTagline}>Collector • Trade Partner</Text>

            <View style={styles.attackRow}>
              <Text style={styles.attackName}>Collector Type</Text>
              <Text style={styles.attackValue}>{selectedType.label}</Text>
            </View>

            <View style={styles.attackRow}>
              <Text style={styles.attackName}>Background</Text>
              <Text style={styles.attackValue}>
                {BACKGROUNDS.find((bg) => bg.key === backgroundKey)?.label}
              </Text>
            </View>

            <Text style={styles.footerText}>Collecting. Trading. Connecting.</Text>
          </View>
        </View>

        <Text style={styles.label}>Collector Name *</Text>
        <TextInput
          value={collectorName}
          onChangeText={setCollectorName}
          placeholder="Enter collector name"
          placeholderTextColor="#8f9bc2"
          style={styles.input}
        />

        <Text style={styles.helper}>This is the name other users will see.</Text>

        <Text style={styles.label}>Choose Avatar</Text>
        <View style={styles.avatarGrid}>
          {AVATAR_PRESETS.map((avatar) => {
            const selected = avatar.key === avatarPreset;

            return (
              <Pressable
                key={avatar.key}
                onPress={() => setAvatarPreset(avatar.key)}
                style={[
                  styles.avatarItem,
                  selected && styles.avatarSelected,
                ]}
              >
                <Image source={avatar.image} style={styles.avatarThumb} />
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={() => setAvatarPreset(null)}
          style={styles.clearAvatarButton}
        >
          <Text style={styles.clearAvatarText}>Use initials instead</Text>
        </Pressable>

        <Text style={styles.helper}>
          You can leave the avatar blank and use your initials.
        </Text>

        <Text style={styles.label}>Choose your Pokémon type</Text>
        <View style={styles.optionGrid}>
          {TYPE_OPTIONS.map((type) => {
            const selected = type.key === pokemonType;
            return (
              <Pressable
                key={type.key}
                onPress={() => setPokemonType(type.key)}
                style={[
                  styles.optionChip,
                  selected && { borderColor: type.accent, backgroundColor: 'rgba(255,255,255,0.08)' },
                ]}
              >
                <View style={[styles.typeDot, { backgroundColor: type.accent }]} />
                <Text style={styles.optionText}>{type.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>Choose your background</Text>
        <View style={styles.backgroundRow}>
          {BACKGROUNDS.map((bg) => {
            const selected = bg.key === backgroundKey;
            return (
              <Pressable
                key={bg.key}
                onPress={() => setBackgroundKey(bg.key)}
                style={[
                  styles.backgroundCard,
                  { backgroundColor: bg.preview },
                  selected && styles.backgroundSelected,
                ]}
              >
                <Text style={styles.backgroundLabel}>{bg.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
          <Text style={styles.saveButtonText}>
            {saving ? 'Saving...' : 'Save Collector Card'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#080b1d' },
  container: { padding: 20, paddingBottom: 120 },
  heading: { color: '#fff', fontSize: 30, fontWeight: '900', marginBottom: 6 },
  subheading: { color: '#AAB3D1', marginBottom: 18 },

  previewWrap: {
    marginBottom: 20,
    alignItems: 'center',
  },
  collectorCard: {
    width: '100%',
    borderRadius: 22,
    padding: 18,
    borderWidth: 6,
    borderColor: '#F6D54A',
  },
  collectorSmall: {
    color: '#0b0f2a',
    fontSize: 12,
    marginBottom: 4,
  },
  collectorName: {
    color: '#0b0f2a',
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 4,
  },
  hp: {
    color: '#0b0f2a',
    fontWeight: '800',
    alignSelf: 'flex-end',
    marginBottom: 8,
  },
  avatarFrame: {
    height: 190,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  initialsAvatar: {
    width: 110,
    height: 110,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: {
    color: '#fff',
    fontSize: 40,
    fontWeight: '900',
  },
  cardTagline: {
    color: '#0b0f2a',
    textAlign: 'center',
    marginBottom: 14,
    fontWeight: '700',
  },
  attackRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  attackName: {
    color: '#0b0f2a',
    fontWeight: '800',
    fontSize: 16,
  },
  attackValue: {
    color: '#0b0f2a',
    fontWeight: '900',
    fontSize: 16,
  },
  footerText: {
    color: '#0b0f2a',
    fontWeight: '700',
    marginTop: 10,
  },

  label: {
    color: '#fff',
    fontWeight: '800',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#121938',
    color: '#fff',
    borderRadius: 12,
    padding: 14,
  },
  helper: {
    color: '#8f9bc2',
    fontSize: 12,
    marginTop: 6,
  },

  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  avatarItem: {
    width: 70,
    height: 70,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  avatarSelected: {
    borderColor: '#FFD166',
  },
  avatarThumb: {
    width: '100%',
    height: '100%',
  },
  clearAvatarButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  clearAvatarText: {
    color: '#FFD166',
    fontWeight: '700',
  },

  optionGrid: {
    gap: 10,
  },
  optionChip: {
    backgroundColor: '#121938',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  typeDot: {
    width: 14,
    height: 14,
    borderRadius: 999,
    marginRight: 10,
  },
  optionText: {
    color: '#fff',
    fontWeight: '700',
  },

  backgroundRow: {
    gap: 10,
  },
  backgroundCard: {
    borderRadius: 16,
    padding: 18,
    minHeight: 74,
    justifyContent: 'flex-end',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  backgroundSelected: {
    borderColor: '#FFD166',
  },
  backgroundLabel: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 16,
  },

  error: {
    color: '#FF6B6B',
    marginTop: 16,
  },
  saveButton: {
    backgroundColor: '#FFD166',
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  saveButtonText: {
    color: '#0b0f2a',
    fontWeight: '900',
    fontSize: 16,
  },
});