import { theme } from '../../lib/theme';
import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Image,
} from 'react-native';
import { Text } from '../../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { uploadCardScan } from '../../lib/storage';

type ScanStep = 'camera' | 'search' | 'searching';

const PRICE_API_URL = process.env.EXPO_PUBLIC_PRICE_API_URL ?? '';

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState<ScanStep>('camera');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [capturing, setCapturing] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  // ===============================
  // CAPTURE PHOTO
  // ===============================

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || capturing) return;

    try {
      setCapturing(true);

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });

      if (!photo?.uri) {
        Alert.alert('Error', 'Could not capture photo.');
        return;
      }

      setPhotoUri(photo.uri);
      setStep('search');
    } catch (error: any) {
      console.log('Capture failed:', error);
      Alert.alert('Error', 'Could not capture photo.');
    } finally {
      setCapturing(false);
    }
  }, [capturing]);

  // ===============================
  // SEARCH
  // ===============================

  const handleSearch = useCallback(async () => {
    if (!query.trim()) {
      Alert.alert('Enter card name', 'Type the name of the card you scanned.');
      return;
    }

    try {
      setStep('searching');

      // Upload photo to get URL (optional — for display)
      let imageUrl: string | null = null;
      if (photoUri) {
        try {
          imageUrl = await uploadCardScan(photoUri);
        } catch {
          // Non-fatal — we can still search without the upload
        }
      }

      // Search TCG API via backend
      const params = new URLSearchParams({ name: query.trim() });
      const res = await fetch(`${PRICE_API_URL}/api/search/tcg?${params.toString()}`);

      if (!res.ok) {
        throw new Error('Search failed');
      }

      const data = await res.json();
      const cards = data.cards ?? [];

      if (cards.length === 0) {
        Alert.alert(
          'No cards found',
          `Could not find any cards named "${query}". Try a different spelling.`,
          [{ text: 'Try again', onPress: () => setStep('search') }]
        );
        return;
      }

      // Navigate to results
      router.push({
        pathname: '/scan/result',
        params: {
          imageUrl: imageUrl ?? '',
          cardName: query.trim(),
          cardsJson: JSON.stringify(cards),
        },
      });
    } catch (error: any) {
      console.log('Search failed:', error);
      Alert.alert('Search failed', 'Could not search for this card.');
      setStep('search');
    }
  }, [query, photoUri]);

  // ===============================
  // NO PERMISSION
  // ===============================

  if (!permission) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#FFFFFF" />
        </View>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '900', textAlign: 'center', marginBottom: 12 }}>
            Camera access needed
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginBottom: 24, lineHeight: 20 }}>
            Stackr needs camera access to scan your Pokémon cards.
          </Text>
          <TouchableOpacity
            onPress={requestPermission}
            style={{
              backgroundColor: theme.colors.primary,
              borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 16 }}>Allow Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontWeight: '700' }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ===============================
  // SEARCH STEP — photo taken, enter name
  // ===============================

  if (step === 'search' || step === 'searching') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <View style={{ flex: 1, padding: 16 }}>

          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
            <TouchableOpacity
              onPress={() => { setStep('camera'); setPhotoUri(null); setQuery(''); }}
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
              <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: '900' }}>
                Identify Card
              </Text>
              <Text style={{ color: theme.colors.textSoft, fontSize: 13, marginTop: 2 }}>
                Type the card name you can see
              </Text>
            </View>
          </View>

          {/* Photo preview */}
          {photoUri && (
            <View style={{
              alignItems: 'center',
              marginBottom: 24,
            }}>
              <Image
                source={{ uri: photoUri }}
                style={{
                  width: 180,
                  height: 252,
                  borderRadius: 12,
                  borderWidth: 2,
                  borderColor: theme.colors.border,
                }}
                resizeMode="cover"
              />
            </View>
          )}

          {/* Card name input */}
          <Text style={{ color: theme.colors.text, fontWeight: '900', marginBottom: 8 }}>
            Card name
          </Text>

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="e.g. Charizard, Pikachu, Mewtwo..."
            placeholderTextColor={theme.colors.textSoft}
            autoFocus
            returnKeyType="search"
            onSubmitEditing={handleSearch}
            style={{
              backgroundColor: theme.colors.card,
              color: theme.colors.text,
              borderRadius: 14,
              padding: 16,
              fontSize: 16,
              fontWeight: '700',
              borderWidth: 1,
              borderColor: theme.colors.border,
              marginBottom: 12,
            }}
          />

          <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginBottom: 24, lineHeight: 18 }}>
            Tip: You can see the card name printed at the top of the card. Just type it exactly as shown.
          </Text>

          {/* Search button */}
          <TouchableOpacity
            onPress={handleSearch}
            disabled={step === 'searching' || !query.trim()}
            style={{
              backgroundColor: query.trim() ? theme.colors.primary : theme.colors.textSoft,
              borderRadius: 14,
              paddingVertical: 16,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 8,
              opacity: step === 'searching' ? 0.6 : 1,
            }}
          >
            {step === 'searching' ? (
              <>
                <ActivityIndicator color="#FFFFFF" size="small" />
                <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 16 }}>
                  Searching...
                </Text>
              </>
            ) : (
              <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 16 }}>
                Find Card
              </Text>
            )}
          </TouchableOpacity>

          {/* Skip photo — just search */}
          <TouchableOpacity
            onPress={() => setPhotoUri(null)}
            style={{ marginTop: 12, alignItems: 'center' }}
          >
            <Text style={{ color: theme.colors.textSoft, fontSize: 13 }}>
              Search without photo
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ===============================
  // CAMERA STEP
  // ===============================

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        ref={cameraRef}
        style={{ flex: 1 }}
        facing="back"
      >
        <SafeAreaView style={{ flex: 1 }}>

          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={{
                width: 40, height: 40,
                borderRadius: 20,
                backgroundColor: 'rgba(0,0,0,0.5)',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 22, lineHeight: 24 }}>✕</Text>
            </TouchableOpacity>

            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '900' }}>
                Scan Card
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 }}>
                Take a photo of your card
              </Text>
            </View>

            <View style={{ width: 40 }} />
          </View>

          {/* Frame guide */}
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{
              width: 240, height: 336,
              borderRadius: 16,
              borderWidth: 2,
              borderColor: 'rgba(255,255,255,0.5)',
              backgroundColor: 'transparent',
            }}>
              {/* Corner accents */}
              <View style={{ position: 'absolute', top: -2, left: -2, width: 28, height: 28, borderTopWidth: 4, borderLeftWidth: 4, borderColor: theme.colors.primary, borderRadius: 4 }} />
              <View style={{ position: 'absolute', top: -2, right: -2, width: 28, height: 28, borderTopWidth: 4, borderRightWidth: 4, borderColor: theme.colors.primary, borderRadius: 4 }} />
              <View style={{ position: 'absolute', bottom: -2, left: -2, width: 28, height: 28, borderBottomWidth: 4, borderLeftWidth: 4, borderColor: theme.colors.primary, borderRadius: 4 }} />
              <View style={{ position: 'absolute', bottom: -2, right: -2, width: 28, height: 28, borderBottomWidth: 4, borderRightWidth: 4, borderColor: theme.colors.primary, borderRadius: 4 }} />

              {/* Instruction inside frame */}
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 16 }}>
                <View style={{
                  backgroundColor: 'rgba(0,0,0,0.6)',
                  borderRadius: 8,
                  paddingHorizontal: 12, paddingVertical: 6,
                }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>
                    Make sure name is visible
                  </Text>
                </View>
              </View>
            </View>

            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 16, textAlign: 'center' }}>
              Centre the card in the frame
            </Text>
          </View>

          {/* Bottom controls */}
          <View style={{ alignItems: 'center', paddingBottom: 48, gap: 16 }}>

            {/* Tips row */}
            <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 24 }}>
              {['Good lighting', 'Card flat', 'Name visible'].map((tip) => (
                <View key={tip} style={{
                  flex: 1,
                  backgroundColor: 'rgba(0,0,0,0.5)',
                  borderRadius: 8, paddingVertical: 6,
                  alignItems: 'center',
                  borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
                }}>
                  <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 10, fontWeight: '700' }}>
                    {tip}
                  </Text>
                </View>
              ))}
            </View>

            {/* Capture button */}
            <TouchableOpacity
              onPress={handleCapture}
              disabled={capturing}
              style={{
                width: 80, height: 80,
                borderRadius: 40,
                backgroundColor: capturing ? 'rgba(255,255,255,0.4)' : '#FFFFFF',
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 4,
                borderColor: 'rgba(255,255,255,0.3)',
              }}
            >
              {capturing ? (
                <ActivityIndicator color={theme.colors.primary} size="large" />
              ) : (
                <View style={{
                  width: 60, height: 60,
                  borderRadius: 30,
                  backgroundColor: theme.colors.primary,
                }} />
              )}
            </TouchableOpacity>

            {/* Skip camera — just search */}
            <TouchableOpacity
              onPress={() => setStep('search')}
              style={{
                backgroundColor: 'rgba(0,0,0,0.5)',
                borderRadius: 10,
                paddingHorizontal: 16, paddingVertical: 8,
                borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
              }}
            >
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontWeight: '700', fontSize: 13 }}>
                Skip — search manually
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </CameraView>
    </View>
  );
}