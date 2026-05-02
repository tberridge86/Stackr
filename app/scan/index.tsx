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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const PRICE_API_URL = (process.env.EXPO_PUBLIC_PRICE_API_URL ?? '').replace(/\/$/, '');

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

  // Normalise a string — strips diacritics and lowercases
  const normalise = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  const stageKeywords = [
    /^basic\s*(.*)/i,
    /^stage\s*1\s*(.*)/i,
    /^stage\s*2\s*(.*)/i,
    /^vmax\s*(.*)/i,
    /^vstar\s*(.*)/i,
    /^vex\s*(.*)/i,
    /^gx\s*(.*)/i,
  ];

  const skipPatterns = [
    /^hp\s*\d+/i,
    /^\d+\/\d+$/,
    /^©/,
    /^illus/i,
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
    /^send/i,
    /^search/i,
    /^your/i,
    /^it can/i,
  ];

  for (const line of lines) {
    const normalisedLine = normalise(line);

    // ✅ Check if line starts with a stage keyword
    // e.g. "BẠSIG Shaymin" or just "BẠSIG" alone
    let matchedStage = false;
    for (const stagePattern of stageKeywords) {
      const match = normalisedLine.match(stagePattern);
      if (match) {
        matchedStage = true;
        const remainder = match[1]?.replace(/[^a-zA-ZÀ-ÿ\s\-']/g, '').trim();
        if (remainder && remainder.length >= 3) {
          // Name was on same line as stage keyword e.g. "Basic Shaymin"
          console.log(`🎯 Stage+name on same line: "${line}" → "${remainder}"`);
          return remainder;
        }
        // Name is on next line — skip this line and let loop continue
        console.log(`⏭️ Stage keyword found ("${line}"), checking next line...`);
        break;
      }
    }

    if (matchedStage) continue; // skip "BASIC" line, move to "Shaymin"

    // Original skip logic
    const shouldSkip = skipPatterns.some((pattern) => pattern.test(normalisedLine));
    if (!shouldSkip && line.length >= 3) {
      const cleaned = line.replace(/[^a-zA-ZÀ-ÿ\s\-']/g, '').trim();
      if (cleaned.length >= 3) {
        console.log(`✅ Card name found: "${cleaned}"`);
        return cleaned;
      }
    }
  }

  return null;
}

function extractSetNumber(text: string): string | null {
  const standard = text.match(/(\d{1,3})\s*\/\s*(\d{1,3})/);
  if (standard) return `${standard[1]}/${standard[2]}`;

  const promo = text.match(/\b([A-Z]{2,4}\d{3})\b/);
  if (promo) return promo[1];

  return null;
}

function extractSetId(text: string): string | null {

  const SET_CODE_MAP: Record<string, string> = {
    'jpor': 'me3', 'por': 'me3', 'me3': 'me3', 'me03': 'me3',
    'iobf': 'sv3', 'obf': 'sv3',
    'imew': 'sv3pt5', 'mew': 'sv3pt5',
    'ipar': 'sv4', 'par': 'sv4',
    'ipaf': 'sv4pt5', 'paf': 'sv4pt5',
    'itef': 'sv5', 'tef': 'sv5',
    'itwm': 'sv6', 'twm': 'sv6',
    'isfa': 'sv6pt5', 'sfa': 'sv6pt5',
    'iscr': 'sv7', 'scr': 'sv7',
    'issp': 'sv8', 'ssp': 'sv8',
    'ipre': 'sv8pt5', 'pre': 'sv8pt5',
    'jtt': 'sv9',
    'viv': 'swsh4', 'bst': 'swsh5', 'cre': 'swsh6',
    'evs': 'swsh7', 'fco': 'swsh8', 'brs': 'swsh9',
    'ast': 'swsh10', 'pgo': 'swsh10pt5', 'loe': 'swsh11',
    'sil': 'swsh12', 'crz': 'swsh12pt5',
    'gri': 'sm2', 'bus': 'sm3', 'shf': 'sm3pt5',
    'cim': 'sm4', 'upr': 'sm5', 'fli': 'sm6',
    'loc': 'sm8', 'teu': 'sm9', 'unb': 'sm10',
    'una': 'sm11', 'hif': 'sm11pt5', 'coh': 'sm12',
    'fla': 'xy2', 'fuf': 'xy3', 'pha': 'xy4',
    'pri': 'xy5', 'roo': 'xy7', 'aor': 'xy8',
    'bkp': 'xy9', 'ste': 'xy12',
    'ecard1': 'ecard1', 'ecard2': 'ecard2', 'ecard3': 'ecard3',
    'neo1': 'neo1', 'neo2': 'neo2', 'neo3': 'neo3', 'neo4': 'neo4',
    'base1': 'base1', 'base2': 'base2', 'base3': 'base3',
    'gym1': 'gym1', 'gym2': 'gym2',
  };

  const sortedKeys = Object.keys(SET_CODE_MAP)
    .sort((a, b) => b.length - a.length);

  const lowerText = text.toLowerCase();

  for (const code of sortedKeys) {
    if (lowerText.includes(code)) {
      console.log(`✅ Set matched: "${code}" → "${SET_CODE_MAP[code]}"`);
      return SET_CODE_MAP[code];
    }
  }

  const setCode = text.match(
    /\b(sv\d+[a-z]*|swsh\d+[a-z]*|sm\d+[a-z]*|xy\d+[a-z]*|bw\d+[a-z]*|me\d+[a-z]*)\b/i
  );

  if (setCode) {
    return setCode[1].toLowerCase();
  }

  return null;
}

// ===============================
// MAIN COMPONENT
// ===============================

export default function ScanScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const camera = useRef<Camera>(null);
  const insets = useSafeAreaInsets();

  // ← torch state is now INSIDE the component ✅
  const [torch, setTorch] = useState(false);

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
  // ===============================

  const handleCapture = useCallback(async (isAuto = false) => {
    if (!camera.current || scanCooldownRef.current || processingOcr) return;

    setProcessingOcr(true);
    scanCooldownRef.current = true;

    try {
      const photo = await camera.current.takePhoto({ flash: 'off' });

      const result = await TextRecognition.recognize(`file://${photo.path}`);
      const text = result.text ?? '';

      // 🔍 DEBUG — remove once scanning is fixed
console.log('=== RAW OCR LINES ===');
text.split('\n').forEach((line, i) => {
  if (line.trim()) {
    console.log(`${i}: "${line.trim()}"`);
  }
});
console.log('=== END OCR ===');
console.log('📝 Extracted name:', extractCardName(text));
console.log('🔢 Extracted number:', extractSetNumber(text));
console.log('🏷️ Extracted setId:', extractSetId(text));

      console.log('=== RAW OCR LINES ===');
text.split('\n').forEach((line, i) => {
  if (line.trim()) {
    console.log(`${i}: "${line.trim()}"`);
  }
});
console.log('=== END ===');

      const cardName = extractCardName(text);
      const setNumber = extractSetNumber(text);
      const setId = extractSetId(text);

      console.log('Name:', cardName, '| Number:', setNumber, '| SetId:', setId);

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

      const params = new URLSearchParams({ name: cardName });
      if (setNumber) {
        const rawNumber = setNumber.split('/')[0];
        const cleanNumber = String(parseInt(rawNumber, 10));
        params.append('number', cleanNumber);
      }
      if (setId) {
        params.append('setId', setId);
      }

      const searchUrl = `${PRICE_API_URL}/api/search/tcg?${params.toString()}`;
      console.log('Searching:', searchUrl);

      const res = await fetch(searchUrl);
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

      if (scannedCardIdsRef.current.has(match.id)) {
        if (isAuto) {
          setLastScanned('Already scanned — swipe to next card');
          resetScanState(1500);
        } else {
          setLastScanned(`${match.name} already in list`);
          Vibration.vibrate(100);
          resetScanState(2000);
        }
        return;
      }

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
  // AUTO SCAN TOGGLE
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

                      const { error } = await supabase
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
        torch={torch ? 'on' : 'off'}
      />

      <SafeAreaView style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>

        {/* Header — fixed closing tags */}
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }}>
          <TouchableOpacity
            onPress={() => {
              setAutoScanActive(false);
              setTorch(false);
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

          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            {/* Torch toggle */}
            <TouchableOpacity
              onPress={() => setTorch((prev) => !prev)}
              style={{
                width: 40, height: 40,
                borderRadius: 20,
                backgroundColor: torch ? '#F59E0B' : 'rgba(0,0,0,0.5)',
                alignItems: 'center', justifyContent: 'center',
                borderWidth: torch ? 2 : 0,
                borderColor: '#F59E0B',
              }}
            >
              <Text style={{ fontSize: 18 }}>🔦</Text>
            </TouchableOpacity>

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
        </View>

        {/* Mode toggle */}
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
              onPress={() => { setScanMode('manual'); setAutoScanActive(false); }}
              style={{
                paddingHorizontal: 20, paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: scanMode === 'manual' ? '#FFFFFF' : 'transparent',
              }}
            >
              <Text style={{
                color: scanMode === 'manual' ? '#000000' : 'rgba(255,255,255,0.7)',
                fontWeight: '900', fontSize: 13,
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
                fontWeight: '900', fontSize: 13,
              }}>
                Auto
              </Text>
            </TouchableOpacity>
          </View>

          {scanMode === 'auto' && (
            <Text style={{
              color: 'rgba(255,255,255,0.8)',
              fontSize: 11, marginTop: 6, textAlign: 'center',
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
            width: 430, height: 620,
            borderRadius: 16,
            borderWidth: 2,
            borderColor: autoScanActive
              ? '#10B981'
              : processingOcr
              ? theme.colors.primary
              : 'rgba(255,255,255,0.5)',
          }}>
            <View style={{ position: 'absolute', top: -2, left: -2, width: 28, height: 28, borderTopWidth: 4, borderLeftWidth: 4, borderColor: autoScanActive ? '#10B981' : theme.colors.primary, borderRadius: 4 }} />
            <View style={{ position: 'absolute', top: -2, right: -2, width: 28, height: 28, borderTopWidth: 4, borderRightWidth: 4, borderColor: autoScanActive ? '#10B981' : theme.colors.primary, borderRadius: 4 }} />
            <View style={{ position: 'absolute', bottom: -2, left: -2, width: 28, height: 28, borderBottomWidth: 4, borderLeftWidth: 4, borderColor: autoScanActive ? '#10B981' : theme.colors.primary, borderRadius: 4 }} />
            <View style={{ position: 'absolute', bottom: -2, right: -2, width: 28, height: 28, borderBottomWidth: 4, borderRightWidth: 4, borderColor: autoScanActive ? '#10B981' : theme.colors.primary, borderRadius: 4 }} />

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
        <View style={{ alignItems: 'center', paddingBottom: insets.bottom + 48, gap: 14 }}>

          {scannedCards.length > 0 && (
            <TouchableOpacity
              onPress={() => { setAutoScanActive(false); setStep('review'); }}
              style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 6, alignItems: 'center' }}
            >
              {scannedCards.slice(-5).map((card) => (
                <Image
                  key={card.id}
                  source={{ uri: card.image_small }}
                  style={{ width: 36, height: 50, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' }}
                  resizeMode="cover"
                />
              ))}
              {scannedCards.length > 5 && (
                <View style={{
                  width: 36, height: 50, borderRadius: 4,
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
                  borderWidth: 4, borderColor: 'rgba(255,255,255,0.3)',
                }}
              >
                {processingOcr ? (
                  <ActivityIndicator color={theme.colors.primary} size="large" />
                ) : (
                  <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: theme.colors.primary }} />
                )}
              </TouchableOpacity>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
                Tap to scan card
              </Text>
            </>
          )}

          {scanMode === 'auto' && (
            <>
              <TouchableOpacity
                onPress={toggleAutoScan}
                style={{
                  width: 80, height: 80,
                  borderRadius: 40,
                  backgroundColor: autoScanActive ? '#EF4444' : '#10B981',
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 4, borderColor: 'rgba(255,255,255,0.3)',
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