import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { fetchAllSets } from '../../lib/pokemonTcg';
import { createBinder } from '../../lib/binders';

const COLORS = ['#2563eb', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function NewBinderScreen() {
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [type, setType] = useState<'official' | 'custom'>('custom');
  const [sets, setSets] = useState<any[]>([]);
  const [selectedSetId, setSelectedSetId] = useState('');
  const [loadingSets, setLoadingSets] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedSetName = useMemo(
    () => sets.find((s) => s.id === selectedSetId)?.name ?? 'Choose a set',
    [sets, selectedSetId]
  );

  const loadSets = async () => {
    try {
      if (sets.length) return;
      setLoadingSets(true);
      const data = await fetchAllSets();
      setSets(data);
    } catch (error) {
      console.log('Failed to load sets', error);
    } finally {
      setLoadingSets(false);
    }
  };

  const saveBinder = async () => {
    try {
      if (!name.trim()) {
        Alert.alert('Missing name', 'Give your binder a name.');
        return;
      }

      if (type === 'official' && !selectedSetId) {
        Alert.alert('Missing set', 'Choose a set for the official binder.');
        return;
      }

      setSaving(true);

      const binder = await createBinder({
        name: name.trim(),
        color,
        type,
        sourceSetId: type === 'official' ? selectedSetId : null,
      });

      router.replace({
        pathname: '/binder/[id]',
        params: { id: binder.id },
      });
    } catch (error: any) {
      Alert.alert('Error', error?.message ?? 'Could not create binder.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0b0b0b' }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={{ color: 'white', fontSize: 28, fontWeight: '800', marginBottom: 16 }}>
          New Binder
        </Text>

        <Text style={{ color: '#d4d4d4', marginBottom: 8 }}>Binder name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="My Psyducks"
          placeholderTextColor="#777"
          style={{
            backgroundColor: '#151515',
            color: 'white',
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 14,
            marginBottom: 18,
          }}
        />

        <Text style={{ color: '#d4d4d4', marginBottom: 8 }}>Type</Text>
        <View style={{ flexDirection: 'row', marginBottom: 18 }}>
          {(['custom', 'official'] as const).map((item) => {
            const active = item === type;
            return (
              <TouchableOpacity
                key={item}
                onPress={() => setType(item)}
                style={{
                  backgroundColor: active ? '#2563eb' : '#151515',
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  borderRadius: 12,
                  marginRight: 10,
                }}
              >
                <Text style={{ color: 'white', fontWeight: '700' }}>
                  {item === 'custom' ? 'Custom Binder' : 'Official Set Binder'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={{ color: '#d4d4d4', marginBottom: 8 }}>Colour</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 18 }}>
          {COLORS.map((item) => {
            const active = item === color;
            return (
              <TouchableOpacity
                key={item}
                onPress={() => setColor(item)}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  backgroundColor: item,
                  marginRight: 10,
                  marginBottom: 10,
                  borderWidth: active ? 3 : 0,
                  borderColor: 'white',
                }}
              />
            );
          })}
        </View>

        {type === 'official' && (
          <>
            <Text style={{ color: '#d4d4d4', marginBottom: 8 }}>Set</Text>

            <TouchableOpacity
              onPress={loadSets}
              style={{
                backgroundColor: '#151515',
                borderRadius: 14,
                paddingHorizontal: 14,
                paddingVertical: 14,
                marginBottom: 12,
              }}
            >
              <Text style={{ color: 'white' }}>
                {loadingSets ? 'Loading sets...' : selectedSetName}
              </Text>
            </TouchableOpacity>

            {sets.slice(0, 30).map((set) => (
              <TouchableOpacity
                key={set.id}
                onPress={() => setSelectedSetId(set.id)}
                style={{
                  backgroundColor: selectedSetId === set.id ? '#1f2940' : '#151515',
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  marginBottom: 8,
                }}
              >
                <Text style={{ color: 'white', fontWeight: '700' }}>{set.name}</Text>
                <Text style={{ color: '#AAB3D1', marginTop: 4 }}>{set.series}</Text>
              </TouchableOpacity>
            ))}
          </>
        )}

        <TouchableOpacity
          onPress={saveBinder}
          disabled={saving}
          style={{
            backgroundColor: '#2563eb',
            borderRadius: 14,
            paddingVertical: 14,
            marginTop: 18,
          }}
        >
          <Text style={{ color: 'white', textAlign: 'center', fontWeight: '800' }}>
            {saving ? 'Creating...' : 'Create Binder'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}