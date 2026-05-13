import { useTheme } from '../../components/theme-context';
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
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { PRICE_API_URL } from '../../lib/config';

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
const GENERAL_FINGERPRINT_CONFIDENCE_THRESHOLD = 78;
const SET_FINGERPRINT_CONFIDENCE_THRESHOLD = 60;
const SCAN_PROVIDER = process.env.EXPO_PUBLIC_SCAN_PROVIDER ?? 'gibl-only';
const CARD_ASPECT_RATIO = 0.716;
const CARD_CROP_WIDTH_RATIO = 0.78;
const CARD_CROP_HEIGHT_RATIO = 0.86;

// ===============================
// TYPES
// ===============================

type ScannedCard = {
  id: string;
  name: string;
  number: string;
  set_id: string;
  set_name: string;
  set_printed_total?: number | null;
  image_small: string;
  rarity: string;
};

type CaptureResult = {
  base64: string;
  uri: string;
};

type ScanStep = 'select_binder' | 'scanning' | 'review';
type ScanMode = 'manual' | 'auto';

type PendingConfirmation = {
  card: ScannedCard;
  base64: string;
  isMarket: boolean;
};

function getCenteredCardCrop(photoWidth?: number, photoHeight?: number) {
  if (!photoWidth || !photoHeight) return null;

  let cropWidth = photoWidth * CARD_CROP_WIDTH_RATIO;
  let cropHeight = cropWidth / CARD_ASPECT_RATIO;
  const maxCropHeight = photoHeight * CARD_CROP_HEIGHT_RATIO;

  if (cropHeight > maxCropHeight) {
    cropHeight = maxCropHeight;
    cropWidth = cropHeight * CARD_ASPECT_RATIO;
  }

  return {
    originX: Math.max(0, Math.round((photoWidth - cropWidth) / 2)),
    originY: Math.max(0, Math.round((photoHeight - cropHeight) / 2)),
    width: Math.max(1, Math.round(cropWidth)),
    height: Math.max(1, Math.round(cropHeight)),
  };
}

function parsePrintedNumber(text?: string | null) {
  if (!text) return null;
  const normalised = text
    .replace(/[Oo]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/[Ss]/g, '5');
  const match = normalised.match(/\b(\d{1,3})\s*[\/／]\s*(\d{2,3})\b/);
  if (!match) return null;

  const number = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isFinite(number) || !Number.isFinite(total)) return null;
  return { number, total };
}

function normalizeCardName(value?: string | null) {
  return String(value ?? '').trim().toLowerCase();
}

async function readPrintedNumberFromCardImage(uri: string) {
  try {
    const result = await TextRecognition.recognize(uri);
    return parsePrintedNumber(result?.text);
  } catch (error) {
    console.log('Card number OCR failed:', error);
    return null;
  }
}

// ===============================
// MAIN COMPONENT
// ===============================

export default function ScanScreen() {
  const { theme } = useTheme();
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
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [autoScanActive, setAutoScanActive] = useState(false);
  const [scanningMessage, setScanningMessage] = useState('Reading card...');
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);

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
  // FINGERPRINT SCAN
  // ===============================

  const fingerprintScan = useCallback(async (
    base64Image: string,
    setId?: string | null,
    expectedPrintedTotal?: number | null,
    minConfidence = GENERAL_FINGERPRINT_CONFIDENCE_THRESHOLD
  ): Promise<ScannedCard | null> => {
    try {
      const response = await fetch(`${PRICE_API_URL}/api/scan/fingerprint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Image, setId }),
      });
      if (!response.ok) return null;
      const data = await response.json();
      const match = data.match;

      if (!match || match.confidence < minConfidence) {
        if (match?.confidence != null) {
          console.log('Fingerprint match below threshold:', {
            confidence: match.confidence,
            minConfidence,
            setId,
            card: match.card_name,
          });
        }
        return null;
      }
      if (setId && match.set_id !== setId) return null;

      const { supabase } = await import('../../lib/supabase');
      const { data: card } = await supabase
        .from('pokemon_cards')
        .select('id, name, number, rarity, image_small, set_id, raw_data')
        .eq('id', match.card_id)
        .single();
      if (!card) return null;

      const setPrintedTotal = Number(card.raw_data?.set?.printedTotal ?? card.raw_data?.set?.total ?? NaN);
      if (
        expectedPrintedTotal &&
        Number.isFinite(setPrintedTotal) &&
        setPrintedTotal !== expectedPrintedTotal
      ) {
        return null;
      }

      return {
        id: card.id,
        name: card.name,
        number: card.number ?? '',
        set_id: card.set_id,
        set_name: card.raw_data?.set?.name ?? card.set_id,
        set_printed_total: Number.isFinite(setPrintedTotal) ? setPrintedTotal : null,
        image_small: card.image_small ?? '',
        rarity: card.rarity ?? '',
      };
    } catch {
      return null;
    }
  }, []);

  const resolveCardInExpectedSet = useCallback(async (
    card: ScannedCard,
    setId?: string | null,
    printedNumber?: { number: number; total: number } | null
  ): Promise<ScannedCard> => {
    if (!setId || card.set_id === setId) return card;

    try {
      const { supabase } = await import('../../lib/supabase');
      const { data } = await supabase
        .from('pokemon_cards')
        .select('id, name, number, rarity, image_small, set_id, raw_data')
        .eq('set_id', setId)
        .ilike('name', card.name)
        .limit(20);
      const candidates = data ?? [];
      const exactNameCandidates = candidates.filter((item) => normalizeCardName(item.name) === normalizeCardName(card.name));
      const candidate = exactNameCandidates.find((item) => (
        printedNumber?.number != null && String(parseInt(item.number ?? '', 10)) === String(printedNumber.number)
      ))
        ?? exactNameCandidates[0]
        ?? candidates[0];
      if (!candidate) return card;

      const setPrintedTotal = Number(candidate.raw_data?.set?.printedTotal ?? candidate.raw_data?.set?.total ?? NaN);
      return {
        id: candidate.id,
        name: candidate.name,
        number: candidate.number ?? '',
        set_id: candidate.set_id,
        set_name: candidate.raw_data?.set?.name ?? candidate.set_id,
        set_printed_total: Number.isFinite(setPrintedTotal) ? setPrintedTotal : null,
        image_small: candidate.image_small ?? '',
        rarity: candidate.rarity ?? '',
      };
    } catch (error) {
      console.log('Expected set card resolve failed:', error);
      return card;
    }
  }, []);

  const lookupCardBySetNumber = useCallback(async (
    setId?: string | null,
    printedNumber?: { number: number; total: number } | null
  ): Promise<ScannedCard | null> => {
    if (!setId || !printedNumber?.number) return null;

    try {
      const { supabase } = await import('../../lib/supabase');
      const { data } = await supabase
        .from('pokemon_cards')
        .select('id, name, number, rarity, image_small, set_id, raw_data')
        .eq('set_id', setId)
        .eq('number', String(printedNumber.number))
        .limit(1);

      const card = data?.[0];
      if (!card) return null;

      const setPrintedTotal = Number(card.raw_data?.set?.printedTotal ?? card.raw_data?.set?.total ?? NaN);
      if (
        printedNumber.total &&
        Number.isFinite(setPrintedTotal) &&
        setPrintedTotal !== printedNumber.total
      ) {
        return null;
      }

      return {
        id: card.id,
        name: card.name,
        number: card.number ?? '',
        set_id: card.set_id,
        set_name: card.raw_data?.set?.name ?? card.set_id,
        set_printed_total: Number.isFinite(setPrintedTotal) ? setPrintedTotal : null,
        image_small: card.image_small ?? '',
        rarity: card.rarity ?? '',
      };
    } catch (error) {
      console.log('Set number lookup failed:', error);
      return null;
    }
  }, []);

  // ===============================
  // CORE CAPTURE — fingerprint-first, CardSight fallback
  // ===============================

  const handleCapture = useCallback(async (isAuto = false) => {
    if (!camera.current || scanCooldownRef.current || processingOcr) return;

    const now = Date.now();
    if (isAuto && now - lastFrameTsRef.current < 700) return;

    setProcessingOcr(true);
    scanCooldownRef.current = true;
    startScanningMessages();

    const captureCardImage = async (profile: { width: number; compress: number }): Promise<CaptureResult> => {
      const photo = await camera.current!.takePhoto({ flash: 'off' });
      const crop = getCenteredCardCrop(photo.width, photo.height);
      const actions: ImageManipulator.Action[] = [
        ...(crop ? [{ crop }] : []),
        { resize: { width: profile.width } },
      ];
      const manipulated = await ImageManipulator.manipulateAsync(
        `file://${photo.path}`,
        actions,
        { compress: profile.compress, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      return { base64: manipulated.base64 ?? '', uri: manipulated.uri };
    };

    const identifyWithCardSight = async (base64Image: string) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(`${PRICE_API_URL}/api/cardsight/identify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64Image }),
          signal: controller.signal,
        });
        return await response.json();
      } finally {
        clearTimeout(timeout);
      }
    };

    const identifyWithGibl = async (base64Image: string) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(`${PRICE_API_URL}/api/gibl/identify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64Image }),
          signal: controller.signal,
        });
        return await response.json();
      } finally {
        clearTimeout(timeout);
      }
    };

    const lookupParsedCard = async (
      parsed: any,
      fallbackPrintedNumber?: { number: number; total: number } | null,
      setId?: string | null
    ): Promise<ScannedCard | null> => {
      if (!parsed || parsed.error || !parsed.name) return null;

      const numberClean = parsed.number
        ? String(parsed.number).split('/')[0].trim().replace(/^0+/, '')
        : fallbackPrintedNumber?.number != null
          ? String(fallbackPrintedNumber.number)
          : null;
      const setTotalClean = parsed.printedTotal
        ? String(parsed.printedTotal)
        : fallbackPrintedNumber?.total != null
          ? String(fallbackPrintedNumber.total)
          : null;

      const searchParams = new URLSearchParams({ name: parsed.name });
      if (numberClean) searchParams.append('number', numberClean);
      if (setTotalClean) searchParams.append('setTotal', setTotalClean);
      if (setId) searchParams.append('setId', setId);

      const searchRes = await fetch(`${PRICE_API_URL}/api/search/tcg?${searchParams.toString()}`);
      const searchData = await searchRes.json();
      const cards = (searchData.cards ?? []) as ScannedCard[];

      if (cards.length === 0) return null;

      let card = cards[0];
      const parsedTotal = setTotalClean ? Number(setTotalClean) : null;
      if (parsedTotal) {
        const totalMatches = cards.filter((c) => c.set_printed_total === parsedTotal);
        if (totalMatches.length > 0) card = totalMatches[0];
      }
      if (numberClean) {
        const numberMatches = cards.filter((c) =>
          String(parseInt(c.number, 10)) === numberClean
          && (!parsedTotal || c.set_printed_total === parsedTotal)
        );
        if (numberMatches.length === 1) {
          card = numberMatches[0];
        } else if (numberMatches.length > 1) {
          card = setId
            ? numberMatches.find((c) => c.set_id === setId) ?? numberMatches[0]
            : numberMatches[0];
        }
      }

      return card;
    };

    try {
      // Step 1: capture at fast profile
      const capture = await captureCardImage(FAST_SCAN_PROFILE);
      const base64 = capture.base64;
      let bestBase64 = base64;
      let bestUri = capture.uri;
      const printedNumber = await readPrintedNumberFromCardImage(bestUri);

      // Duplicate frame check
      const sig = `${base64.slice(0, 48)}:${base64.length}`;
      if (isAuto && sig === lastFrameSigRef.current && now - lastFrameTsRef.current < 2200) {
        setLastScanned('Hold steady — same frame');
        resetScanState(500);
        return;
      }
      lastFrameSigRef.current = sig;
      lastFrameTsRef.current = now;

      const expectedSetId = selectedBinder?.source_set_id ?? null;
      const useGibl = SCAN_PROVIDER === 'gibl-only' || SCAN_PROVIDER === 'hybrid';
      const useLegacy = SCAN_PROVIDER === 'legacy' || SCAN_PROVIDER === 'hybrid';

      // Step 2: official binders can resolve instantly from the printed card number.
      let match: ScannedCard | null = await lookupCardBySetNumber(expectedSetId, printedNumber);

      // Step 3: test GiblTCG as the first image-recognition provider.
      if (!match && useGibl) {
        const parsed = await identifyWithGibl(bestBase64);
        console.log('Gibl scan result:', {
          name: parsed?.name,
          number: parsed?.number,
          printedTotal: parsed?.printedTotal,
          confidence: parsed?.confidence,
          error: parsed?.error,
        });
        match = await lookupParsedCard(parsed, printedNumber, expectedSetId);
      }

      // Step 4: try fingerprint match (fast, no AI cost). In official binders the set is already locked,
      // so OCR should not be allowed to hard-reject the fingerprint result.
      if (!match && useLegacy) {
        match = await fingerprintScan(
          base64,
          expectedSetId,
          expectedSetId ? null : printedNumber?.total,
          expectedSetId ? SET_FINGERPRINT_CONFIDENCE_THRESHOLD : GENERAL_FINGERPRINT_CONFIDENCE_THRESHOLD
        );
      }

      // Step 5: official binders get one sharper set-locked retry before any broader matching.
      if (!match && expectedSetId && useLegacy) {
        const hqCapture = await captureCardImage(ACCURACY_SCAN_PROFILE);
        bestBase64 = hqCapture.base64;
        bestUri = hqCapture.uri;
        const hqPrintedNumber = printedNumber ?? await readPrintedNumberFromCardImage(bestUri);
        match = await lookupCardBySetNumber(expectedSetId, hqPrintedNumber);
        if (!match) {
          match = await fingerprintScan(
            hqCapture.base64,
            expectedSetId,
            null,
            SET_FINGERPRINT_CONFIDENCE_THRESHOLD
          );
        }
      }

      // Step 6: fall back to CardSight if fingerprint didn't reach threshold
      if (!match) {
        if (expectedSetId) {
          if (!isAuto) {
            Alert.alert(
              'Could not read card',
              'Try again with the card flat and the bottom number clearly visible.'
            );
          }
          stopScanningMessages();
          scanCooldownRef.current = false;
          setProcessingOcr(false);
          return;
        }

        if (!useLegacy) {
          if (!isAuto) {
            Alert.alert(
              'Could not read card',
              'GiblTCG did not return a confident match. Try again with the card flat and well lit.'
            );
          }
          stopScanningMessages();
          scanCooldownRef.current = false;
          setProcessingOcr(false);
          return;
        }

        let parsed: any = null;

        parsed = await identifyWithCardSight(bestBase64);

        // If general-market fast profile failed, retry with accuracy profile.
        if (!expectedSetId && !match && (parsed?.error || !parsed?.name)) {
          const hqCapture = await captureCardImage(ACCURACY_SCAN_PROFILE);
          const base64Hq = hqCapture.base64;
          bestBase64 = base64Hq;
          bestUri = hqCapture.uri;
          const hqPrintedNumber = printedNumber ?? await readPrintedNumberFromCardImage(bestUri);
          match = await fingerprintScan(base64Hq, expectedSetId, hqPrintedNumber?.total);
          if (!match) parsed = await identifyWithCardSight(base64Hq);
        }

        // If CardSight identified a name, look it up in the TCG database
        if (!match) {
          match = await lookupParsedCard(parsed, printedNumber, expectedSetId);
        }
      }

      // Step 4: handle result
      if (!match) {
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

      match = await resolveCardInExpectedSet(match, expectedSetId, printedNumber);

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

      // Auto mode: add directly without confirmation
      if (isAuto) {
        scannedCardIdsRef.current.add(match.id);
        setScannedCards((prev) => [...prev, match!]);
        setLastScanned(`✅ ${match.name} #${match.number} added!`);
        Vibration.vibrate([0, 90, 40, 90]);
        setTimeout(() => setLastScanned('👉 Next card!'), 500);
        resetScanState(900);
        return;
      }

      // Manual + market: show confirmation overlay
      stopScanningMessages();
      setProcessingOcr(false);
      setPendingConfirmation({ card: match, base64: bestBase64, isMarket: isMarketMode });

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
  }, [fingerprintScan, isMarketMode, lookupCardBySetNumber, processingOcr, resetScanState, resolveCardInExpectedSet, selectedBinder, startScanningMessages, stopScanningMessages]);

  // ===============================
  // TRAINING DATA + CONFIRMATION
  // ===============================

  const saveTrainingData = useCallback(async (cardId: string, base64: string) => {
    try {
      const { supabase } = await import('../../lib/supabase');
      await supabase.from('scan_training_data').insert({ card_id: cardId, image_base64: base64 });
    } catch (err) {
      console.log('Training data save failed:', err);
    }
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!pendingConfirmation) return;
    const { card, base64, isMarket } = pendingConfirmation;
    setPendingConfirmation(null);
    scanCooldownRef.current = false;
    saveTrainingData(card.id, base64);

    if (isMarket) {
      setAutoScanActive(false);
      router.replace({ pathname: '/scan/result', params: { cardsJson: JSON.stringify([card]) } });
      return;
    }

    scannedCardIdsRef.current.add(card.id);
    setScannedCards((prev) => [...prev, card]);
    setLastScanned(`✅ ${card.name} #${card.number} added!`);
    Vibration.vibrate([0, 90, 40, 90]);
  }, [pendingConfirmation, saveTrainingData]);

  const handleReject = useCallback(() => {
    setPendingConfirmation(null);
    scanCooldownRef.current = false;
    setLastScanned(null);
  }, []);

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

  if (cameraError) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '900', textAlign: 'center', marginBottom: 12 }}>
            Camera unavailable
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.72)', textAlign: 'center', lineHeight: 21, marginBottom: 24 }}>
            {cameraError}
          </Text>
          <TouchableOpacity
            onPress={() => setCameraError(null)}
            style={{ backgroundColor: theme.colors.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, marginBottom: 12 }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 16 }}>Try Again</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontWeight: '700' }}>Go Back</Text>
          </TouchableOpacity>
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
        onError={(error) => {
          const message = String(error?.message ?? '');
          const code = String(error?.code ?? '');
          setAutoScanActive(false);
          setProcessingOcr(false);
          scanCooldownRef.current = false;
          setCameraError(
            code.includes('camera-is-restricted') || message.toLowerCase().includes('restricted')
              ? 'Camera access is restricted by the operating system. Check device privacy settings, parental controls, work profile/device policy, or try a physical device if you are using an emulator.'
              : message || 'The camera could not be started. Check permissions and try again.'
          );
        }}
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

        {/* Mode toggle — binder only */}
        {!isMarketMode && (
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
        )}

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

        {/* Confirmation overlay */}
        {pendingConfirmation && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 16 }}>Is this the right card?</Text>
            {pendingConfirmation.card.image_small ? (
              <Image source={{ uri: pendingConfirmation.card.image_small }} style={{ width: 160, height: 224, borderRadius: 10, marginBottom: 16 }} resizeMode="contain" />
            ) : null}
            <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '900', textAlign: 'center', marginBottom: 4 }}>{pendingConfirmation.card.name}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 32 }}>{pendingConfirmation.card.set_name} · #{pendingConfirmation.card.number}</Text>
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <TouchableOpacity onPress={handleReject} style={{ flex: 1, backgroundColor: '#EF4444', borderRadius: 14, paddingVertical: 16, alignItems: 'center' }}>
                <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 16 }}>✕ Wrong</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleConfirm} style={{ flex: 1, backgroundColor: '#10B981', borderRadius: 14, paddingVertical: 16, alignItems: 'center' }}>
                <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 16 }}>✓ Correct</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

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
