import { theme } from '../../lib/theme';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  FlatList,
  Vibration,
} from 'react-native';
import { Text } from '../../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { fetchBinders, BinderRecord } from '../../lib/binders';

const PRICE_API_URL = process.env.EXPO_PUBLIC_PRICE_API_URL ?? '';

// ===============================
// TYPES
// ===============================

type ScannedCard = {
  id: string;
  name: string;
  number: string;
  set_id: string;
  set_name: string;
  image_small: string;
  rarity: string;
};

type ScanStep = 'select_binder' | 'scanning' | 'review';
type ScanMode = 'manual' | 'auto';

// ===============================
// TEXT EXTRACTION HELPERS
// ===============================

function extractCardName(text: string): string | null {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 1);

  const skipPatterns = [
    /^hp\s*\d+/i,
    /^\d+\/\d+$/,
    /^©/,
    /^illus/i,
    /^basic/i,
    /^stage/i,
    /^evolves/i,
    /^weakness/i,
    /^resistance/i,
    /^retreat/i,
    /^pokemon/i,
    /^trainer/i,
    /^energy/i,
    /^item/i,
    /^supporter/i,
    /^stadium/i,
    /^put/i,
    /^damage/i,
    /^\d+$/,
    /^[^a-zA-Z]/,
  ];

  for (const line of lines) {
    const shouldSkip = skipPatterns.some((pattern) => pattern.test(line));
    if (!shouldSkip && line.length >= 3) {
      const cleaned = line
        .replace(/[^a-zA-ZÀ-ÿ\s\-']/g, '')
        .trim();
      if (cleaned.length >= 3) {
        return cleaned;
      }
    }
  }

  return null;
}

function extractSetNumber(text: string): string | null {
  // Standard: 002/088 or 4/102 or 045/064
  const standard = text.match(/(\d{1,3})\s*\/\s*(\d{1,3})/);
  if (standard) return `${standard[1]}/${standard[2]}`;

  // Promo: SWSH001, SV001 etc
  const promo = text.match(/\b([A-Z]{2,4}\d{3})\b/);
  if (promo) return promo[1];

  return null;
}

// ===============================
// MAIN COMPONENT
// ===============================

export default function ScanScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const camera = useRef<Camera>(null);

  const [step, setStep] = useState<ScanStep>('select_binder');
  const [scanMode, setScanMode] = useState<ScanMode>('manual');
  const [binders, setBinders] = useState<BinderRecord[]>([]);
  const [selectedBinder, setSelectedBinder] = useState<BinderRecord | null>(null);
  const [loadingBinders, setLoadingBinders] = useState(true);

  const [scannedCards, setScannedCards] = useState<ScannedCard[]>([]);
  const [scanning, setScanning] = useState(false);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [processingOcr, setProcessingOcr] = useState(false);
  const [autoScanActive, setAutoScanActive] = useState(false);

  const scanCooldownRef = useRef(false);
  const autoScanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scannedCardIdsRef = useRef<Set<string>>(new Set());

  // ===============================
  // LOAD BINDERS
  // ===============================

  useEffect(() => {
    fetchBinders().then((data) => {
      setBinders(data);
      setLoadingBinders(false);
    });
  }, []);

  // ===============================
  // PERMISSION
  // ===============================

  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission]);

  // ===============================
  // CLEANUP ON UNMOUNT
  // ===============================

  useEffect(() => {
    return () => {
      if (autoScanIntervalRef.current) {
        clearInterval(autoScanIntervalRef.current);
      }
    };
  }, []);

  // ===============================
  // AUTO SCAN INTERVAL
  // ===============================

  useEffect(() => {
    if (autoScanIntervalRef.current) {
      clearInterval(autoScanIntervalRef.current);
      autoScanIntervalRef.current = null;
    }

    if (step === 'scanning' && scanMode === 'auto' && autoScanActive) {
      autoScanIntervalRef.current = setInterval(() => {
        handleCapture(true);
      }, 2500);
    }

    return () => {
      if (autoScanIntervalRef.current) {
        clearInterval(autoScanIntervalRef.current);
      }
    };
  }, [step, scanMode, autoScanActive]);

  // ===============================
  // RESET STATE
  // ===============================

  const resetScanState = useCallback((delay = 2000) => {
    setTimeout(() => {
      scanCooldownRef.current = false;
      setLastScanned(null);
      setProcessingOcr(false);
    }, delay);
  }, []);

  // ===============================
  // CORE CAPTURE + OCR
  // isAuto = true means silent failure (no alerts) for auto mode
  // ===============================

  const handleCapture = useCallback(async (isAuto = false) => {
    if (!camera.current || scanCooldownRef.current || processingOcr) return;

    setProcessingOcr(true);
    scanCooldownRef.current = true;

    try {
      const photo = await camera.current.takePhoto({ flash: 'off' });

      const result = await TextRecognition.recognize(`file://${photo.path}`);
      const text = result.text ?? '';

      // TEMPORARY — log full OCR output so we can see what format the number is in
console.log('=== FULL OCR TEXT ===');
console.log(text);
console.log('=== END OCR TEXT ===');

      console.log('OCR text:', text);

      const cardName = extractCardName(text);
      const setNumber = extractSetNumber(text);

      console.log('Name:', cardName, '| Number:', setNumber);

      if (!cardName) {
        if (!isAuto) {
          Alert.alert(
            'Could not read card name',
            'Make sure the card name and number are clearly visible.',
            [{ text: 'Try again' }]
          );
        }
        scanCooldownRef.current = false;
        setProcessingOcr(false);
        return;
      }

      // Build search params
      const params = new URLSearchParams({ name: cardName });
      if (setNumber) {
  const rawNumber = setNumber.split('/')[0];
  const cleanNumber = String(parseInt(rawNumber, 10)); // "002" → "2"
  params.append('number', cleanNumber);
}
      const res = await fetch(`${PRICE_API_URL}/api/search/tcg?${params.toString()}`);
      if (!res.ok) throw new Error(`Search failed: ${res.status}`);

      const data = await res.json();
      const cards = data.cards ?? [];

      if (cards.length === 0) {
        if (!isAuto) {
          Alert.alert(
            `"${cardName}" not found`,
            'Card was read but not found in TCG database. Try again.',
            [{ text: 'OK' }]
          );
        }
        scanCooldownRef.current = false;
        setProcessingOcr(false);
        return;
      }

      const match = cards[0] as ScannedCard;

      // Check not already scanned using ref for auto mode reliability
      if (scannedCardIdsRef.current.has(match.id)) {
        if (isAuto) {
          // In auto mode — silent, just show subtle feedback
          setLastScanned(`Already scanned — swipe to next card`);
          resetScanState(1500);
        } else {
          setLastScanned(`${match.name} already in list`);
          Vibration.vibrate(100);
          resetScanState(2000);
        }
        return;
      }

      // Add card
      scannedCardIdsRef.current.add(match.id);
      setScannedCards((prev) => [...prev, match]);
      setLastScanned(`✅ ${match.name}${setNumber ? ` #${setNumber}` : ''} added!`);
      Vibration.vibrate([0, 100, 50, 100]);
      resetScanState(isAuto ? 1500 : 2000);

    } catch (error: any) {
      console.log('Scan error:', error);
      if (!isAuto) {
        Alert.alert('Scan failed', 'Something went wrong. Try again.');
      }
      scanCooldownRef.current = false;
      setProcessingOcr(false);
      setLastScanned(null);
    }
  }, [processingOcr, resetScanState]);

  // ===============================
  // START / STOP AUTO SCAN
  // ===============================

  const toggleAutoScan = useCallback(() => {
    setAutoScanActive((prev) => {
      const next = !prev;
      if (!next && autoScanIntervalRef.current) {
        clearInterval(autoScanIntervalRef.current);
        autoScanIntervalRef.current = null;
      }
      return next;
    });
  }, []);

  // ===============================
  // SELECT BINDER STEP
  // ===============================

  if (step === 'select_binder') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <View style={{ flex: 1, padding: 16 }}>

          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
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
              <Text style={{ color: theme.colors.text, fontSize: 24, fontWeight: '900' }}>
                Scan Cards
              </Text>
              <Text style={{ color: theme.colors.textSoft, fontSize: 13, marginTop: 2 }}>
                Which binder are you scanning into?
              </Text>
            </View>
          </View>

          {loadingBinders ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : (
            <FlatList
              data={binders}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: 100 }}
              renderItem={({ item }) => {
                const selected = selectedBinder?.id === item.id;
                return (
                  <TouchableOpacity
                    onPress={() => setSelectedBinder(item)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: selected ? theme.colors.primary + '18' : theme.colors.card,
                      borderRadius: 16,
                      padding: 14,
                      marginBottom: 10,
                      borderWidth: 2,
                      borderColor: selected ? theme.colors.primary : theme.colors.border,
                      gap: 12,
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={{
                      width: 44, height: 44,
                      borderRadius: 10,
                      backgroundColor: item.color || theme.colors.primary,
                    }} />

                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 15 }}>
                        {item.name}
                      </Text>
                      <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 2 }}>
                        {item.type === 'official' ? 'Official set' : 'Custom binder'}
                      </Text>
                    </View>

                    {selected && (
                      <View style={{
                        width: 26, height: 26,
                        borderRadius: 13,
                        backgroundColor: theme.colors.primary,
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '900' }}>✓</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}

          <TouchableOpacity
            onPress={() => {
              if (!selectedBinder) {
                Alert.alert('Select a binder', 'Please select which binder to scan into.');
                return;
              }
              setStep('scanning');
            }}
            disabled={!selectedBinder}
            style={{
              backgroundColor: selectedBinder ? theme.colors.primary : theme.colors.textSoft,
              borderRadius: 16,
              paddingVertical: 16,
              alignItems: 'center',
              marginTop: 8,
            }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 16 }}>
              {selectedBinder ? `Scan into "${selectedBinder.name}"` : 'Select a binder first'}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ===============================
  // REVIEW STEP
  // ===============================

  if (step === 'review') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <View style={{ flex: 1, padding: 16 }}>

          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
            <TouchableOpacity
              onPress={() => setStep('scanning')}
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
              <Text style={{ color: theme.colors.text, fontSize: 24, fontWeight: '900' }}>
                Review Cards
              </Text>
              <Text style={{ color: theme.colors.textSoft, fontSize: 13, marginTop: 2 }}>
                {scannedCards.length} card{scannedCards.length !== 1 ? 's' : ''} scanned · tap ✕ to remove
              </Text>
            </View>
          </View>

          {scannedCards.length === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900', marginBottom: 8 }}>
                No cards scanned yet
              </Text>
              <Text style={{ color: theme.colors.textSoft, textAlign: 'center', lineHeight: 20 }}>
                Go back to the camera and scan some cards first.
              </Text>
              <TouchableOpacity
                onPress={() => setStep('scanning')}
                style={{
                  marginTop: 20,
                  backgroundColor: theme.colors.primary,
                  borderRadius: 14,
                  paddingVertical: 12, paddingHorizontal: 24,
                }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>Back to Scanner</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <FlatList
                data={scannedCards}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 150 }}
                renderItem={({ item }) => (
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: theme.colors.card,
                    borderRadius: 14,
                    padding: 10,
                    marginBottom: 8,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    gap: 12,
                  }}>
                    {item.image_small ? (
                      <Image
                        source={{ uri: item.image_small }}
                        style={{ width: 50, height: 70, borderRadius: 6 }}
                        resizeMode="contain"
                      />
                    ) : (
                      <View style={{
                        width: 50, height: 70,
                        borderRadius: 6,
                        backgroundColor: theme.colors.surface,
                      }} />
                    )}

                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 14 }} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 2 }}>
                        {item.set_name} · #{item.number}
                      </Text>
                      {item.rarity && (
                        <Text style={{ color: '#FFD166', fontSize: 11, marginTop: 2, fontWeight: '700' }}>
                          {item.rarity}
                        </Text>
                      )}
                    </View>

                    <TouchableOpacity
                      onPress={() => {
                        scannedCardIdsRef.current.delete(item.id);
                        setScannedCards((prev) => prev.filter((c) => c.id !== item.id));
                      }}
                      style={{
                        width: 32, height: 32,
                        borderRadius: 16,
                        backgroundColor: '#FEE2E2',
                        alignItems: 'center', justifyContent: 'center',
                        borderWidth: 1, borderColor: '#FCA5A5',
                      }}
                    >
                      <Text style={{ color: '#991B1B', fontWeight: '900', fontSize: 16 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                )}
              />

              <View style={{
                position: 'absolute',
                left: 16, right: 16, bottom: 24,
                gap: 10,
              }}>
                <TouchableOpacity
                  onPress={() => setStep('scanning')}
                  style={{
                    backgroundColor: theme.colors.card,
                    borderRadius: 14, paddingVertical: 13,
                    alignItems: 'center',
                    borderWidth: 1, borderColor: theme.colors.border,
                  }}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
                    📷 Scan More Cards
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={async () => {
                    if (!selectedBinder) return;
                    try {
                      setScanning(true);
                      const { supabase } = await import('../../lib/supabase');
                      const rows = scannedCards.map((card) => ({
                        binder_id: selectedBinder.id,
                        card_id: card.id,
                        set_id: card.set_id,
                        owned: true,
                        notes: '',
                        card_name: card.name,
                        card_number: card.number,
                        image_url: card.image_small,
                        set_name: card.set_name,
                      }));

                      const { error } = await (await import('../../lib/supabase')).supabase
                        .from('binder_cards')
                        .upsert(rows, {
                          onConflict: 'binder_id,card_id',
                          ignoreDuplicates: false,
                        });

                      if (error) throw error;

                      Alert.alert(
                        '🎉 All added!',
                        `${scannedCards.length} card${scannedCards.length !== 1 ? 's' : ''} added to "${selectedBinder.name}".`,
                        [
                          {
                            text: 'Go to binder',
                            onPress: () => router.replace({
                              pathname: '/binder/[id]',
                              params: { id: selectedBinder.id },
                            }),
                          },
                          {
                            text: 'Scan more',
                            onPress: () => {
                              setScannedCards([]);
                              scannedCardIdsRef.current.clear();
                              setStep('scanning');
                            },
                          },
                        ]
                      );
                    } catch (error: any) {
                      Alert.alert('Error', error?.message ?? 'Could not add cards.');
                    } finally {
                      setScanning(false);
                    }
                  }}
                  disabled={scanning}
                  style={{
                    backgroundColor: theme.colors.primary,
                    borderRadius: 14, paddingVertical: 16,
                    alignItems: 'center',
                    opacity: scanning ? 0.6 : 1,
                  }}
                >
                  {scanning ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 16 }}>
                      ✅ Add {scannedCards.length} Card{scannedCards.length !== 1 ? 's' : ''} to Binder
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // ===============================
  // PERMISSION / NO DEVICE
  // ===============================

  if (!hasPermission) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '900', textAlign: 'center', marginBottom: 12 }}>
            Camera access needed
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginBottom: 24 }}>
            Stackr needs camera access to scan your Pokémon cards.
          </Text>
          <TouchableOpacity
            onPress={requestPermission}
            style={{ backgroundColor: theme.colors.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, marginBottom: 12 }}
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

  if (!device) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#FFFFFF', fontSize: 16 }}>No camera found</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ===============================
  // SCANNING STEP — live camera
  // ===============================

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <Camera
        ref={camera}
        style={{ flex: 1 }}
        device={device}
        isActive={step === 'scanning'}
        photo={true}
      />

      <SafeAreaView style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }}>
          <TouchableOpacity
            onPress={() => {
              setAutoScanActive(false);
              setStep('select_binder');
            }}
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
            <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '900' }}>
              "{selectedBinder?.name}"
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 }}>
              {scannedCards.length} card{scannedCards.length !== 1 ? 's' : ''} scanned
            </Text>
          </View>

          {/* Review button */}
          {scannedCards.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setAutoScanActive(false);
                setStep('review');
              }}
              style={{
                backgroundColor: theme.colors.primary,
                borderRadius: 10,
                paddingHorizontal: 12, paddingVertical: 7,
              }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 12 }}>
                Review ({scannedCards.length})
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ===============================
            MODE TOGGLE — Manual / Auto
        =============================== */}
        <View style={{ alignItems: 'center', marginTop: 8 }}>
          <View style={{
            flexDirection: 'row',
            backgroundColor: 'rgba(0,0,0,0.6)',
            borderRadius: 999,
            padding: 4,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.2)',
          }}>
            <TouchableOpacity
              onPress={() => {
                setScanMode('manual');
                setAutoScanActive(false);
              }}
              style={{
                paddingHorizontal: 20, paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: scanMode === 'manual' ? '#FFFFFF' : 'transparent',
              }}
            >
              <Text style={{
                color: scanMode === 'manual' ? '#000000' : 'rgba(255,255,255,0.7)',
                fontWeight: '900',
                fontSize: 13,
              }}>
                Manual
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setScanMode('auto')}
              style={{
                paddingHorizontal: 20, paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: scanMode === 'auto' ? theme.colors.primary : 'transparent',
              }}
            >
              <Text style={{
                color: scanMode === 'auto' ? '#FFFFFF' : 'rgba(255,255,255,0.7)',
                fontWeight: '900',
                fontSize: 13,
              }}>
                Auto
              </Text>
            </TouchableOpacity>
          </View>

          {/* Auto mode instructions */}
          {scanMode === 'auto' && (
            <Text style={{
              color: 'rgba(255,255,255,0.8)',
              fontSize: 11,
              marginTop: 6,
              textAlign: 'center',
              backgroundColor: 'rgba(0,0,0,0.5)',
              paddingHorizontal: 12, paddingVertical: 4,
              borderRadius: 6,
            }}>
              {autoScanActive
                ? '🔴 Scanning every 2.5s — swipe cards through frame'
                : 'Tap Start to begin auto scanning'}
            </Text>
          )}
        </View>

        {/* Frame guide */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{
            width: 320, height: 448,
            borderRadius: 16,
            borderWidth: 2,
            borderColor: autoScanActive
              ? '#10B981'
              : processingOcr
              ? theme.colors.primary
              : 'rgba(255,255,255,0.5)',
          }}>
            {/* Corner accents */}
            <View style={{ position: 'absolute', top: -2, left: -2, width: 28, height: 28, borderTopWidth: 4, borderLeftWidth: 4, borderColor: autoScanActive ? '#10B981' : theme.colors.primary, borderRadius: 4 }} />
            <View style={{ position: 'absolute', top: -2, right: -2, width: 28, height: 28, borderTopWidth: 4, borderRightWidth: 4, borderColor: autoScanActive ? '#10B981' : theme.colors.primary, borderRadius: 4 }} />
            <View style={{ position: 'absolute', bottom: -2, left: -2, width: 28, height: 28, borderBottomWidth: 4, borderLeftWidth: 4, borderColor: autoScanActive ? '#10B981' : theme.colors.primary, borderRadius: 4 }} />
            <View style={{ position: 'absolute', bottom: -2, right: -2, width: 28, height: 28, borderBottomWidth: 4, borderRightWidth: 4, borderColor: autoScanActive ? '#10B981' : theme.colors.primary, borderRadius: 4 }} />

            {/* Processing indicator */}
            {processingOcr && (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={theme.colors.primary} size="large" />
                <Text style={{
                  color: '#FFFFFF', fontWeight: '700', marginTop: 12,
                  backgroundColor: 'rgba(0,0,0,0.5)',
                  paddingHorizontal: 12, paddingVertical: 6,
                  borderRadius: 8,
                }}>
                  Reading card...
                </Text>
              </View>
            )}
          </View>

          {/* Scan result feedback */}
          {lastScanned && (
            <View style={{
              marginTop: 16,
              backgroundColor: lastScanned.startsWith('✅')
                ? 'rgba(16,185,129,0.9)'
                : 'rgba(245,158,11,0.9)',
              borderRadius: 10,
              paddingHorizontal: 16, paddingVertical: 10,
            }}>
              <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 14, textAlign: 'center' }}>
                {lastScanned}
              </Text>
            </View>
          )}
        </View>

        {/* Bottom controls */}
        <View style={{ alignItems: 'center', paddingBottom: 48, gap: 14 }}>

          {/* Scanned cards preview strip — tap to review */}
          {scannedCards.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setAutoScanActive(false);
                setStep('review');
              }}
              style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 6, alignItems: 'center' }}
            >
              {scannedCards.slice(-5).map((card) => (
                <Image
                  key={card.id}
                  source={{ uri: card.image_small }}
                  style={{
                    width: 36, height: 50,
                    borderRadius: 4,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.5)',
                  }}
                  resizeMode="cover"
                />
              ))}
              {scannedCards.length > 5 && (
                <View style={{
                  width: 36, height: 50,
                  borderRadius: 4,
                  backgroundColor: 'rgba(0,0,0,0.6)',
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
                }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '900' }}>
                    +{scannedCards.length - 5}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )}

          {/* Tips */}
          <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 24 }}>
            {['Good lighting', 'Card flat', 'Name + number visible'].map((tip) => (
              <View key={tip} style={{
                flex: 1,
                backgroundColor: 'rgba(0,0,0,0.5)',
                borderRadius: 8, paddingVertical: 6,
                alignItems: 'center',
                borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
              }}>
                <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 9, fontWeight: '700', textAlign: 'center' }}>
                  {tip}
                </Text>
              </View>
            ))}
          </View>

          {/* MANUAL MODE — tap button */}
          {scanMode === 'manual' && (
            <>
              <TouchableOpacity
                onPress={() => handleCapture(false)}
                disabled={processingOcr}
                style={{
                  width: 80, height: 80,
                  borderRadius: 40,
                  backgroundColor: processingOcr ? 'rgba(255,255,255,0.4)' : '#FFFFFF',
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 4,
                  borderColor: 'rgba(255,255,255,0.3)',
                }}
              >
                {processingOcr ? (
                  <ActivityIndicator color={theme.colors.primary} size="large" />
                ) : (
                  <View style={{
                    width: 60, height: 60,
                    borderRadius: 30,
                    backgroundColor: theme.colors.primary,
                  }} />
                )}
              </TouchableOpacity>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
                Tap to scan card
              </Text>
            </>
          )}

          {/* AUTO MODE — start/stop button */}
          {scanMode === 'auto' && (
            <>
              <TouchableOpacity
                onPress={toggleAutoScan}
                style={{
                  width: 80, height: 80,
                  borderRadius: 40,
                  backgroundColor: autoScanActive ? '#EF4444' : '#10B981',
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 4,
                  borderColor: 'rgba(255,255,255,0.3)',
                }}
              >
                <Text style={{ fontSize: 28 }}>
                  {autoScanActive ? '⏹' : '▶'}
                </Text>
              </TouchableOpacity>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
                {autoScanActive ? 'Tap to stop · swipe cards through frame' : 'Tap to start auto scan'}
              </Text>
            </>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}