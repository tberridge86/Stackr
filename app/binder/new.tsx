import { theme } from '../../lib/theme';
import React, { useEffect, useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { Text } from '../../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { fetchAllSets, PokemonSet } from '../../lib/pokemonTcg';
import { createBinder } from '../../lib/binders';

const cardShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};

export default function NewBinderScreen() {
  const [name, setName] = useState('');
  const [color, setColor] = useState(theme.colors.primary);
  const [type, setType] = useState<'official' | 'custom'>('official');

  const [sets, setSets] = useState<PokemonSet[]>([]);
  const [selectedSet, setSelectedSet] = useState<PokemonSet | null>(null);

  const [loadingSets, setLoadingSets] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchAllSets();
        setSets(data);
      } catch (err) {
        console.log('Failed to load sets', err);
      } finally {
        setLoadingSets(false);
      }
    };

    load();
  }, []);

  const handleSelectSet = (set: PokemonSet) => {
    setSelectedSet(set);
    setName(set.name);
  };

  const handleCreate = async () => {
    if (creating) return;

    if (!name.trim()) {
      console.log('Name required');
      return;
    }

    try {
      setCreating(true);

      const binder = await createBinder({
        name,
        color,
        type,
        sourceSetId: type === 'official' ? selectedSet?.id : null,
      });

      router.replace(`/binder/${binder.id}`);
    } catch (err) {
      console.log('Create binder failed', err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={{ flex: 1, padding: 16 }}>
        <Text
          style={{
            color: theme.colors.text,
            fontSize: 28,
            fontWeight: '900',
          }}
        >
          New Binder
        </Text>

        <Text
          style={{
            color: theme.colors.textSoft,
            marginTop: 6,
            marginBottom: 18,
          }}
        >
          Create an official set binder or your own custom collection.
        </Text>

        <View
          style={{
            backgroundColor: theme.colors.card,
            borderRadius: 20,
            padding: 14,
            borderWidth: 1,
            borderColor: theme.colors.border,
            ...cardShadow,
          }}
        >
          <Text
            style={{
              color: theme.colors.text,
              fontWeight: '900',
              marginBottom: 10,
            }}
          >
            Binder type
          </Text>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            {['official', 'custom'].map((t) => {
              const active = type === t;

              return (
                <TouchableOpacity
                  key={t}
                  onPress={() => setType(t as 'official' | 'custom')}
                  style={{
                    flex: 1,
                    backgroundColor: active
                      ? theme.colors.primary
                      : theme.colors.surface,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: active
                      ? theme.colors.primary
                      : theme.colors.border,
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      color: active ? '#FFFFFF' : theme.colors.textSoft,
                      fontWeight: '900',
                    }}
                  >
                    {t.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Binder name"
            placeholderTextColor={theme.colors.textSoft}
            style={{
              backgroundColor: theme.colors.surface,
              color: theme.colors.text,
              marginTop: 16,
              padding: 14,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: theme.colors.border,
              fontWeight: '700',
            }}
          />
        </View>

        {type === 'official' && (
          <View style={{ marginTop: 18, flex: 1 }}>
            <Text
              style={{
                color: theme.colors.text,
                fontWeight: '900',
                marginBottom: 10,
                fontSize: 16,
              }}
            >
              Select set
            </Text>

            {loadingSets ? (
              <ActivityIndicator color={theme.colors.primary} />
            ) : (
              <FlatList
                data={sets}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 14 }}
                renderItem={({ item }) => {
                  const active = selectedSet?.id === item.id;

                  return (
                    <TouchableOpacity
                      onPress={() => handleSelectSet(item)}
                      style={{
                        padding: 14,
                        borderRadius: 14,
                        marginBottom: 8,
                        backgroundColor: active
                          ? theme.colors.secondary
                          : theme.colors.card,
                        borderWidth: 1,
                        borderColor: active
                          ? theme.colors.secondary
                          : theme.colors.border,
                      }}
                    >
                      <Text
                        style={{
                          color: theme.colors.text,
                          fontWeight: '900',
                        }}
                      >
                        {item.name}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        )}

        <TouchableOpacity
          onPress={handleCreate}
          disabled={creating}
          style={{
            backgroundColor: theme.colors.primary,
            marginTop: 14,
            padding: 16,
            borderRadius: 16,
            alignItems: 'center',
            opacity: creating ? 0.6 : 1,
          }}
        >
          {creating ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>
              Create Binder
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}