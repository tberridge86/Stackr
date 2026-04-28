import { theme } from '../../lib/theme';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '../../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

type PokemonData = {
  id: number;
  name: string;
  height: number;
  weight: number;
  types: { type: { name: string } }[];
  abilities: { ability: { name: string } }[];
  stats: { base_stat: number; stat: { name: string } }[];
};

const formatName = (name: string) =>
  name.charAt(0).toUpperCase() + name.slice(1);

const cardShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};

export default function PokemonDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [data, setData] = useState<PokemonData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPokemon = async () => {
      try {
        setLoading(true);

        const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
        const json = await res.json();

        setData(json);
      } catch (err) {
        console.log('Failed to load Pokémon', err);
      } finally {
        setLoading(false);
      }
    };

    if (id) loadPokemon();
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} size="large" />
          <Text style={styles.loadingText}>Loading Pokémon...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>‹</Text>
          </TouchableOpacity>

          <Text style={{ color: theme.colors.text }}>
            Failed to load Pokémon.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>‹</Text>
        </TouchableOpacity>

        <View style={styles.header}>
          <Image
            source={{
              uri: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${data.id}.png`,
            }}
            style={styles.image}
          />

          <Text style={styles.name}>{formatName(data.name)}</Text>
          <Text style={styles.number}>#{String(data.id).padStart(4, '0')}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Type</Text>
          <View style={styles.row}>
            {data.types.map((t) => (
              <View key={t.type.name} style={styles.typeChip}>
                <Text style={styles.typeText}>{formatName(t.type.name)}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Base Stats</Text>
          {data.stats.map((s) => (
            <View key={s.stat.name} style={styles.statRow}>
              <Text style={styles.statName}>
                {formatName(s.stat.name.replace('-', ' '))}
              </Text>
              <Text style={styles.statValue}>{s.base_stat}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Info</Text>
          <Text style={styles.infoText}>
            Height: {(data.height / 10).toFixed(1)} m
          </Text>
          <Text style={styles.infoText}>
            Weight: {(data.weight / 10).toFixed(1)} kg
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Abilities</Text>
          {data.abilities.map((a) => (
            <Text key={a.ability.name} style={styles.infoText}>
              • {formatName(a.ability.name.replace('-', ' '))}
            </Text>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  container: {
    padding: 18,
    paddingBottom: 120,
  },

  center: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  loadingText: {
    color: theme.colors.textSoft,
    marginTop: 12,
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: theme.colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 12,
    ...cardShadow,
  },
  backButtonText: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: '900',
    marginTop: -2,
  },

  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  image: {
    width: 180,
    height: 180,
    marginBottom: 12,
  },
  name: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  number: {
    color: theme.colors.textSoft,
    marginTop: 4,
  },

  section: {
    backgroundColor: theme.colors.card,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...cardShadow,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 10,
  },

  row: {
    flexDirection: 'row',
    gap: 8,
  },

  typeChip: {
    backgroundColor: theme.colors.primary,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  typeText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  statName: {
    color: theme.colors.textSoft,
  },
  statValue: {
    color: theme.colors.text,
    fontWeight: '800',
  },

  infoText: {
    color: theme.colors.textSoft,
    marginBottom: 4,
  },
});