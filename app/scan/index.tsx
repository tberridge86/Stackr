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
import { SafeAreaView , useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { fetchBinders, BinderRecord } from '../../lib/binders';
import * as ImageManipulator from 'expo-image-manipulator';


const PRICE_API_URL = (process.env.EXPO_PUBLIC_PRICE_API_URL ?? '').replace(/\/$/, '');

const SCANNING_MESSAGES = [
  'Reading card...',
  'Identifying Pokémon...',
  'Checking set number...',
  'Looking up in database...',
  'Almost there...',
  'Matching card...',
];

const FAST_SCAN_PROFILE = { width: 720, compress: 0.5 };
const ACCURACY_SCAN_PROFILE = { width: 960, compress: 0.72 };
const REQUEST_TIMEOUT_MS = 5000;

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
// MAIN COMPONENT
// ===============================

export default function ScanScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const camera = useRef<Camera>(null);
  const insets = useSafeAreaInsets();

  const params = useLocalSearchParams<{ mode?: string }>();
  const isMarketMode = params.mode === 'market';

  const [torch, setTorch] = useState(false);
  const [step, setStep] = useState<ScanStep>(isMarketMode ? 'scanning' : 'select_binder');
  const [scanMode, setScanMode] = useState<ScanMode>('manual');
  const [binders, setBinders] = useState<BinderRecord[]>([]);
  const [selectedBinder, setSelectedBinder] = useState<BinderRecord | null>(null);
  const [loadingBinders, setLoadingBinders] = useState(true);
  const [scannedCards, setScannedCards] = useState<ScannedCard[]>([]);
  const [scanning, setScanning] = useState(false);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [processingOcr, setProcessingOcr] = useState(false);
  const [autoScanActive, setAutoScanActive] = useState(false);
  const [scanningMessage, setScanningMessage] = useState('Reading card...');

  const scanCooldownRef = useRef(false);
  const autoScanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scannedCardIdsRef = useRef<Set<string>>(new Set());
  const scanningMessageRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastFrameSigRef = useRef<string | null>(null);
  const lastFrameTsRef = useRef<number>(0);

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
  const checkPermission = async () => {
    if (!hasPermission) {
      await requestPermission();
    }
  };

  checkPermission();
}, [hasPermission, requestPermission]);
  // ===============================
  // CLEANUP ON UNMOUNT
  // ===============================

  useEffect(() => {
    return () => {
      if (autoScanIntervalRef.current) clearInterval(autoScanIntervalRef.current);
      if (scanningMessageRef.current) clearInterval(scanningMessageRef.current);
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
        if (!processingOcr) handleCapture(true);
      }, 950);
    }

    return () => {
      if (autoScanIntervalRef.current) clearInterval(autoScanIntervalRef.current);
    };
  }, [step, scanMode, autoScanActive]);

  // ===============================
  // SCANNING MESSAGES
  // ===============================

  const startScanningMessages = useCallback(() => {
    let i = 0;
    setScanningMessage(SCANNING_MESSAGES[0]);
    scanningMessageRef.current = setInterval(() => {
      i = (i + 1) % SCANNING_MESSAGES.length;
      setScanningMessage(SCANNING_MESSAGES[i]);
    }, 2000);
  }, []);

  const stopScanningMessages = useCallback(() => {
    if (scanningMessageRef.current) {
      clearInterval(scanningMessageRef.current);
      scanningMessageRef.current = null;
    }
    setScanningMessage('Reading card...');
  }, []);

  // ===============================
  // RESET STATE
  // ===============================

  const resetScanState = useCallback((delay = 2000) => {
    stopScanningMessages();
    setTimeout(() => {
      scanCooldownRef.current = false;
      setLastScanned(null);
      setProcessingOcr(false);
    }, delay);
  }, [stopScanningMessages]);

  // ===============================
  // TOGGLE AUTO SCAN
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
  // CORE CAPTURE — Claude Vision
  // ===============================

  const handleCapture = useCallback(async (isAuto = false) => {
    if (!camera.current || scanCooldownRef.current || processingOcr) return;

    const now = Date.now();
    if (isAuto && now - lastFrameTsRef.current < 700) return;

    setProcessingOcr(true);
    scanCooldownRef.current = true;
    startScanningMessages();

    const identifyWithTimeout = async (base64Image: string) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(`${PRICE_API_URL}/api/cardsight/identify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64Image }),
          signal: controller.signal,
        });
        const json = await response.json();
        return json;
      } finally {
        clearTimeout(timeout);
      }
    };

    const runPass = async (profile: { width: number; compress: number }) => {
      const photo = await camera.current!.takePhoto({ flash: 'off' });
      const manipulated = await ImageManipulator.manipulateAsync(
        `file://${photo.path}`,
        [{ resize: { width: profile.width } }],
        {
          compress: profile.compress,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        }
      );

      const base64 = manipulated.base64 ?? '';
      const sig = `${base64.slice(0, 48)}:${base64.length}`;
      if (isAuto && sig === lastFrameSigRef.current && Date.now() - lastFrameTsRef.current < 2200) {
        return { duplicateFrame: true as const };
      }

      lastFrameSigRef.current = sig;
      lastFrameTsRef.current = Date.now();

      const parsed = await identifyWithTimeout(base64);
      return { duplicateFrame: false as const, parsed };
    };

    try {
      let parsedResult = await runPass(FAST_SCAN_PROFILE);

      if (parsedResult.duplicateFrame) {
        setLastScanned('Hold steady — same frame');
        resetScanState(500);
        return;
      }

      let parsed: any = parsedResult.parsed;
      if (parsed?.error || !parsed?.name) {
        const retry = await runPass(ACCURACY_SCAN_PROFILE);
        if (!retry.duplicateFrame) parsed = retry.parsed;
      }

      if (parsed?.error || !parsed?.name) {
        if (!isAuto) {
          Alert.alert(
            'Could not read card',
            'Make sure the card is clearly visible and well lit.',
            [{ text: 'Try again' }]
          );
        }
        stopScanningMessages();
        scanCooldownRef.current = false;
        setProcessingOcr(false);
        return;
      }

      const numberClean = parsed.number
        ? parsed.number.split('/')[0].trim().replace(/^0+/, '')
        : null;

      const params = new URLSearchParams({ name: parsed.name });
      if (numberClean) params.append('number', numberClean);

      const searchUrl = `${PRICE_API_URL}/api/search/tcg?${params.toString()}`;
      const searchRes = await fetch(searchUrl);
      const searchData = await searchRes.json();
      const cards = (searchData.cards ?? []) as ScannedCard[];

      if (cards.length === 0) {
        if (!isAuto) {
          Alert.alert(
            `"${parsed.name}" not found`,
            'Card identified but not found in database.',
            [{ text: 'OK' }]
          );
        }
        stopScanningMessages();
        scanCooldownRef.current = false;
        setProcessingOcr(false);
        return;
      }

      let match = cards[0];

      if (isMarketMode) {
        setAutoScanActive(false);
        router.replace({
          pathname: '/scan/result',
          params: { cardsJson: JSON.stringify([match]) },
        });
        stopScanningMessages();
        scanCooldownRef.current = false;
        setProcessingOcr(false);
        return;
      }

      if (numberClean) {
        const numberMatches = cards.filter((c) =>
          String(parseInt(c.number, 10)) === numberClean
        );

        if (numberMatches.length === 1) {
          match = numberMatches[0];
        } else if (numberMatches.length > 1) {
          if (selectedBinder?.source_set_id) {
            const setMatch = numberMatches.find(
              (c) => c.set_id === selectedBinder.source_set_id
            );
            match = setMatch ?? numberMatches[0];
          } else {
            match = numberMatches[0];
          }
        }
      }

      if (scannedCardIdsRef.current.has(match.id)) {
        if (isAuto) {
          setLastScanned('Already scanned — swipe to next card');
          resetScanState(900);
        } else {
          setLastScanned(`${match.name} already in list`);
          Vibration.vibrate(100);
          resetScanState(1400);
        }
        return;
      }

      scannedCardIdsRef.current.add(match.id);
      setScannedCards((prev) => [...prev, match]);
      setLastScanned(`✅ ${match.name} #${match.number} added!`);
      Vibration.vibrate([0, 90, 40, 90]);
      if (isAuto) setTimeout(() => setLastScanned('👉 Next card!'), 500);
      resetScanState(isAuto ? 900 : 1200);

    } catch (error: any) {
      console.log('Scan error:', error);
      if (!isAuto) {
        const timeoutMsg = error?.name === 'AbortError'
          ? 'Scan timed out. Try again with better lighting.'
          : 'Something went wrong. Try again.';
        Alert.alert('Scan failed', timeoutMsg);
      }
      stopScanningMessages();
      scanCooldownRef.current = false;
      setProcessingOcr(false);
      setLastScanned(null);
    }
  }, [isMarketMode, processingOcr, resetScanState, selectedBinder, startScanningMessages, stopScanningMessages]);

  // ===============================
  // SELECT BINDER STEP
  // ===============================

 if (step === 'select_binder' && !isMarketMode) {
  return (
    <SafeAreaView
      edges={['bottom']}
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
    >
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />

      <View style={{ flex: 1, padding: 16, paddingTop: 43 }}>
        <View style={{ marginBottom: 24, flexDirection: 'row', alignItems: 'flex-start' }}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12, paddingTop: 4 }}>
            <Text style={{ color: theme.colors.text, fontSize: 24 }}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: theme.colors.text,
                fontSize: 24,
                fontWeight: '900',
              }}
            >
              Select Binder
            </Text>
            <Text
              style={{
                color: theme.colors.textSoft,
                fontSize: 13,
                marginTop: 8,
              }}
            >
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
                  activeOpacity={0.8}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: selected
                      ? theme.colors.primary + '18'
                      : theme.colors.card,
                    borderRadius: 16,
                    padding: 14,
                    marginBottom: 10,
                    borderWidth: 2,
                    borderColor: selected
                      ? theme.colors.primary
                      : theme.colors.border,
                    gap: 12,
                  }}
                >
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      backgroundColor:
                        item.color || theme.colors.primary,
                    }}
                  />

                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: theme.colors.text,
                        fontWeight: '900',
                        fontSize: 15,
                      }}
                    >
                      {item.name}
                    </Text>

                    <Text
                      style={{
                        color: theme.colors.textSoft,
                        fontSize: 12,
                        marginTop: 2,
                      }}
                    >
                      {item.type === 'official'
                        ? 'Official set'
                        : 'Custom binder'}
                    </Text>
                  </View>

                  {selected && (
                    <View
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 13,
                        backgroundColor: theme.colors.primary,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text
                        style={{
                          color: '#FFFFFF',
                          fontSize: 14,
                          fontWeight: '900',
                        }}
                      >
                        ✓
                      </Text>
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
              Alert.alert(
                'Select a binder',
                'Please select which binder to scan into.'
              );
              return;
            }

            setStep('scanning');
          }}
          disabled={!selectedBinder}
          style={{
            backgroundColor: selectedBinder
              ? theme.colors.primary
              : theme.colors.textSoft,
            borderRadius: 16,
            paddingVertical: 16,
            alignItems: 'center',
            marginTop: 8,
            marginBottom: insets.bottom + 16,
          }}
        >
          <Text
            style={{
              color: '#FFFFFF',
              fontWeight: '900',
              fontSize: 16,
            }}
          >
            {selectedBinder
              ? `Scan into "${selectedBinder.name}"`
              : 'Select a binder first'}
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
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, padding: 16 }}>
<View style={{ marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <TouchableOpacity onPress={() => setStep('scanning')} style={{ marginRight: 12, paddingTop: 4 }}>
              <Text style={{ color: theme.colors.text, fontSize: 24 }}>←</Text>
            </TouchableOpacity>
            <Text style={{ color: theme.colors.text, fontSize: 24, fontWeight: '900' }}>Review Cards</Text>
          </View>
          <Text style={{ color: theme.colors.textSoft, fontSize: 13 }}>
              {scannedCards.length} card{scannedCards.length !== 1 ? 's' : ''} scanned · tap ✕ to remove
            </Text>
          </View>

          {scannedCards.length === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900', marginBottom: 8 }}>No cards scanned yet</Text>
              <Text style={{ color: theme.colors.textSoft, textAlign: 'center', lineHeight: 20 }}>Go back to the camera and scan some cards first.</Text>
              <TouchableOpacity onPress={() => setStep('scanning')} style={{ marginTop: 20, backgroundColor: theme.colors.primary, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 24 }}>
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
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.card, borderRadius: 14, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: theme.colors.border, gap: 12 }}>
                    {item.image_small ? (
                      <Image source={{ uri: item.image_small }} style={{ width: 50, height: 70, borderRadius: 6 }} resizeMode="contain" />
                    ) : (
                      <View style={{ width: 50, height: 70, borderRadius: 6, backgroundColor: theme.colors.surface }} />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 14 }} numberOfLines={1}>{item.name}</Text>
                      <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 2 }}>{item.set_name} · #{item.number}</Text>
                      {item.rarity && <Text style={{ color: '#FFD166', fontSize: 11, marginTop: 2, fontWeight: '700' }}>{item.rarity}</Text>}
                    </View>
                    <TouchableOpacity
                      onPress={() => { scannedCardIdsRef.current.delete(item.id); setScannedCards((prev) => prev.filter((c) => c.id !== item.id)); }}
                      style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FCA5A5' }}
                    >
                      <Text style={{ color: '#991B1B', fontWeight: '900', fontSize: 16 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                )}
              />

              <View style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 80, gap: 10 }}>
                <TouchableOpacity
                  onPress={() => setStep('scanning')}
                  style={{ backgroundColor: theme.colors.card, borderRadius: 14, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border }}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: '900' }}>📷 Scan More Cards</Text>
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
                      const { error } = await supabase.from('binder_cards').upsert(rows, { onConflict: 'binder_id,card_id', ignoreDuplicates: false });
                      if (error) throw error;
                      Alert.alert(
                        '🎉 All added!',
                        `${scannedCards.length} card${scannedCards.length !== 1 ? 's' : ''} added to "${selectedBinder.name}".`,
                        [
                          { text: 'Go to binder', onPress: () => router.replace({ pathname: '/binder/[id]', params: { id: selectedBinder.id } }) },
                          { text: 'Scan more', onPress: () => { setScannedCards([]); scannedCardIdsRef.current.clear(); setStep('scanning'); } },
                        ]
                      );
                    } catch (error: any) {
                      Alert.alert('Error', error?.message ?? 'Could not add cards.');
                    } finally {
                      setScanning(false);
                    }
                  }}
                  disabled={scanning}
                  style={{ backgroundColor: theme.colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', opacity: scanning ? 0.6 : 1 }}
                >
                  {scanning ? <ActivityIndicator color="#FFFFFF" /> : (
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
          <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '900', textAlign: 'center', marginBottom: 12 }}>Camera access needed</Text>
          <Text style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginBottom: 24 }}>Stackr needs camera access to scan your Pokémon cards.</Text>
          <TouchableOpacity onPress={requestPermission} style={{ backgroundColor: theme.colors.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, marginBottom: 12 }}>
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
  // SCANNING STEP
  // ===============================

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <Stack.Screen options={{ headerShown: false }} />
      <Camera
        ref={camera}
        style={{ flex: 1 }}
        device={device}
        isActive={step === 'scanning'}
        photo={true}
        torch={torch ? 'on' : 'off'}
      />

      <SafeAreaView style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }}>
          <TouchableOpacity
            onPress={() => { setAutoScanActive(false); setTorch(false); setStep('select_binder'); }}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 22, lineHeight: 24 }}>✕</Text>
          </TouchableOpacity>

          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '900' }}>
              {isMarketMode ? 'Market Scan' : `"${selectedBinder?.name ?? ''}"`}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 }}>
              {isMarketMode
                ? 'Scan card to view market value'
                : `${scannedCards.length} card${scannedCards.length !== 1 ? 's' : ''} scanned`}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TouchableOpacity
              onPress={() => setTorch((prev) => !prev)}
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: torch ? '#F59E0B' : 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', borderWidth: torch ? 2 : 0, borderColor: '#F59E0B' }}
            >
              <Text style={{ fontSize: 18 }}>🔦</Text>
            </TouchableOpacity>

            {scannedCards.length > 0 && (
              <TouchableOpacity
                onPress={() => { setAutoScanActive(false); setStep('review'); }}
                style={{ backgroundColor: theme.colors.primary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 12 }}>Review ({scannedCards.length})</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Mode toggle */}
        <View style={{ alignItems: 'center', marginTop: 8 }}>
          <View style={{ flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 999, padding: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }}>
            <TouchableOpacity
              onPress={() => { setScanMode('manual'); setAutoScanActive(false); }}
              style={{ paddingHorizontal: 20, paddingVertical: 8, borderRadius: 999, backgroundColor: scanMode === 'manual' ? '#FFFFFF' : 'transparent' }}
            >
              <Text style={{ color: scanMode === 'manual' ? '#000000' : 'rgba(255,255,255,0.7)', fontWeight: '900', fontSize: 13 }}>Manual</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setScanMode('auto')}
              style={{ paddingHorizontal: 20, paddingVertical: 8, borderRadius: 999, backgroundColor: scanMode === 'auto' ? theme.colors.primary : 'transparent' }}
            >
              <Text style={{ color: scanMode === 'auto' ? '#FFFFFF' : 'rgba(255,255,255,0.7)', fontWeight: '900', fontSize: 13 }}>Auto</Text>
            </TouchableOpacity>
          </View>

          {scanMode === 'auto' && (
            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 6, textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6 }}>
              {autoScanActive ? '🔴 Scanning every 2s — hold card in frame' : 'Tap Start to begin auto scanning'}
            </Text>
          )}
        </View>

        {/* Frame guide */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{
            width: 240, height: 335,
            borderRadius: 16,
            borderWidth: 2,
            borderColor: autoScanActive ? '#10B981' : processingOcr ? theme.colors.primary : 'rgba(255,255,255,0.5)',
          }}>
            <View style={{ position: 'absolute', top: -2, left: -2, width: 28, height: 28, borderTopWidth: 4, borderLeftWidth: 4, borderColor: autoScanActive ? '#10B981' : theme.colors.primary, borderRadius: 4 }} />
            <View style={{ position: 'absolute', top: -2, right: -2, width: 28, height: 28, borderTopWidth: 4, borderRightWidth: 4, borderColor: autoScanActive ? '#10B981' : theme.colors.primary, borderRadius: 4 }} />
            <View style={{ position: 'absolute', bottom: -2, left: -2, width: 28, height: 28, borderBottomWidth: 4, borderLeftWidth: 4, borderColor: autoScanActive ? '#10B981' : theme.colors.primary, borderRadius: 4 }} />
            <View style={{ position: 'absolute', bottom: -2, right: -2, width: 28, height: 28, borderBottomWidth: 4, borderRightWidth: 4, borderColor: autoScanActive ? '#10B981' : theme.colors.primary, borderRadius: 4 }} />

            {processingOcr && (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={theme.colors.primary} size="large" />
                <Text style={{ color: '#FFFFFF', fontWeight: '700', marginTop: 12, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}>
                  {scanningMessage}
                </Text>
              </View>
            )}
          </View>

          {lastScanned && (
            <View style={{ marginTop: 16, backgroundColor: lastScanned.startsWith('✅') || lastScanned.startsWith('👉') ? 'rgba(16,185,129,0.9)' : 'rgba(245,158,11,0.9)', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 }}>
              <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 14, textAlign: 'center' }}>{lastScanned}</Text>
            </View>
          )}
        </View>

        {/* Bottom controls */}
        <View style={{ alignItems: 'center', paddingBottom: insets.bottom + 48, gap: 14 }}>
          {scannedCards.length > 0 && (
            <TouchableOpacity
              onPress={() => { setAutoScanActive(false); setStep('review'); }}
              style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 6, alignItems: 'center' }}
            >
              {scannedCards.slice(-5).map((card) => (
                <Image key={card.id} source={{ uri: card.image_small }} style={{ width: 36, height: 50, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' }} resizeMode="cover" />
              ))}
              {scannedCards.length > 5 && (
                <View style={{ width: 36, height: 50, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '900' }}>+{scannedCards.length - 5}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}

          <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 24 }}>
            {['Good lighting', 'Card flat', 'Name + number visible'].map((tip) => (
              <View key={tip} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8, paddingVertical: 6, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}>
                <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 9, fontWeight: '700', textAlign: 'center' }}>{tip}</Text>
              </View>
            ))}
          </View>

          {scanMode === 'manual' && (
            <>
              <TouchableOpacity
                onPress={() => handleCapture(false)}
                disabled={processingOcr}
                style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: processingOcr ? 'rgba(255,255,255,0.4)' : '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: 'rgba(255,255,255,0.3)' }}
              >
                {processingOcr ? (
                  <ActivityIndicator color={theme.colors.primary} size="large" />
                ) : (
                  <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: theme.colors.primary }} />
                )}
              </TouchableOpacity>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>Tap to scan card</Text>
            </>
          )}

          {scanMode === 'auto' && (
            <>
              <TouchableOpacity
                onPress={toggleAutoScan}
                style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: autoScanActive ? '#EF4444' : '#10B981', alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: 'rgba(255,255,255,0.3)' }}
              >
                <Text style={{ fontSize: 28 }}>{autoScanActive ? '⏹' : '▶'}</Text>
              </TouchableOpacity>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
                {autoScanActive ? 'Tap to stop · hold card in frame' : 'Tap to start auto scan'}
              </Text>
            </>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}