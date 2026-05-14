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
import {
  lookupLocalCardByNameAndTotal,
  lookupLocalCardsByPrintedNumber,
  lookupLocalCardsByPrintedTotal,
  lookupLocalCardsByNameText,
  lookupLocalCardsBySet,
  resolveLocalCardsByName,
  warmLocalCardIndex,
  type LocalScanCard,
} from '../../lib/localCardIndex';
import {
  rerankWithOnDeviceVisual,
  setBundledOnDeviceVisualModel,
} from '../../lib/onDeviceVisualMatcher';
import clipVisionModel from '../../assets/models/clip-vit-base-patch32-vision-quantized.zip';

setBundledOnDeviceVisualModel(clipVisionModel);

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
const SCAN_PROVIDER = process.env.EXPO_PUBLIC_SCAN_PROVIDER ?? 'local-ai';
const CARD_ASPECT_RATIO = 0.716;
const CARD_CROP_WIDTH_RATIO = 0.96;
const CARD_CROP_HEIGHT_RATIO = 0.98;
const NUMBER_OCR_WIDTH = 1600;
const FAST_NUMBER_OCR_REGIONS = [
  { name: 'number-micro-left', x: 0, y: 0.79, width: 0.42, height: 0.14 },
  { name: 'number-micro-left-tilt', x: 0, y: 0.79, width: 0.42, height: 0.14, rotate: -2 },
  { name: 'number-strip-left', x: 0.02, y: 0.72, width: 0.5, height: 0.24 },
  { name: 'number-strip', x: 0.46, y: 0.68, width: 0.52, height: 0.24 },
];
const FALLBACK_NUMBER_OCR_REGIONS = [
  { name: 'bottom-left', x: 0, y: 0.64, width: 0.58, height: 0.32 },
  { name: 'bottom-right', x: 0.42, y: 0.64, width: 0.56, height: 0.32 },
  { name: 'bottom-band', x: 0, y: 0.64, width: 1, height: 0.32 },
  { name: 'lower-half', x: 0, y: 0.52, width: 1, height: 0.44 },
];
const NAME_OCR_REGION = { name: 'top-name', x: 0, y: 0, width: 1, height: 0.22 };

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

function toScannedCard(card: LocalScanCard): ScannedCard {
  return {
    id: card.id,
    name: card.name,
    number: card.number,
    set_id: card.set_id,
    set_name: card.set_name,
    set_printed_total: card.set_printed_total,
    image_small: card.image_small,
    rarity: card.rarity,
  };
}

type CaptureResult = {
  base64: string;
  uri: string;
  width: number;
  height: number;
};

type PrintedNumber = {
  number: number;
  total: number;
  ocrText?: string;
  region?: string;
};

type OcrRegion = {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotate?: number;
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

function parsePrintedNumber(text?: string | null): PrintedNumber | null {
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
  return { number, total, ocrText: text ?? undefined };
}

function hasThreeDigitCollectorEvidence(text?: string | null) {
  if (!text) return false;
  const normalised = text
    .replace(/[Oo]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/[Ss]/g, '5');
  return /(?:^|[^0-9])\d{3}\s*(?:\/|\uFF0F|\u2044|\u2215)\s*\d{2,3}(?=\D|$)/.test(normalised);
}

function hasThreeDigitTotalEvidence(text?: string | null) {
  if (!text) return false;
  const normalised = text
    .replace(/[Oo]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/[Ss]/g, '5');
  return /(?:\/|\uFF0F|\u2044|\u2215)\s*0\d{2}(?=\D|$)/.test(normalised);
}

function repairSuspiciousPrintedNumber(printedNumber: PrintedNumber) {
  if (
    printedNumber.total < 10
    && printedNumber.ocrText
    && hasThreeDigitTotalEvidence(printedNumber.ocrText)
  ) {
    return {
      ...printedNumber,
      total: Number(`0${printedNumber.total}`),
      region: printedNumber.region,
    };
  }

  return printedNumber;
}

function isBroadNumberRegion(region?: string) {
  return region === 'bottom-band' || region === 'bottom-left' || region === 'lower-half' || region === 'full-card';
}

function normalizeCardName(value?: string | null) {
  return String(value ?? '').trim().toLowerCase();
}

function parsePrintedNumberFromOcr(text?: string | null): PrintedNumber | null {
  if (!text) return null;
  const normalised = text
    .replace(/[Oo]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/[Ss]/g, '5');
  const matches = [...normalised.matchAll(/(?:^|[^0-9])(\d{1,3})\s*(?:\/|\uFF0F|\u2044|\u2215)\s*(\d{2,3})(?=\D|$)/g)];
  const match = matches
    .sort((a, b) => {
      const aNumberLength = a[1].length;
      const bNumberLength = b[1].length;
      if (aNumberLength !== bNumberLength) return bNumberLength - aNumberLength;
      return b[0].length - a[0].length;
    })[0];
  if (!match) return null;

  const number = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isFinite(number) || !Number.isFinite(total)) return null;
  return { number, total, ocrText: text ?? undefined };
}

function hasLongerNumberHint(printedNumber?: PrintedNumber | null) {
  if (!printedNumber?.ocrText || printedNumber.number >= 100) return false;
  if (isBroadNumberRegion(printedNumber.region)) return true;
  const total = String(printedNumber.total).padStart(2, '0');
  const escapedTotal = total.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?:^|[^0-9])\\d{3}\\s*(?:\\/|\\uFF0F|\\u2044|\\u2215)\\s*0*${escapedTotal}(?=\\D|$)`);
  return pattern.test(printedNumber.ocrText);
}

function shouldTryNameTotalFallback(
  printedNumber?: PrintedNumber | null,
  localIndexResult?: { candidates?: LocalScanCard[] | null; needsVisualRerank?: boolean } | null,
  localResult?: { needsVisualRerank?: boolean; match?: ScannedCard | null } | null
): printedNumber is PrintedNumber {
  if (!printedNumber || localResult?.match) return false;
  return Boolean(
    localResult?.needsVisualRerank
    || !localIndexResult
    || localIndexResult?.needsVisualRerank
    || localIndexResult?.candidates?.length === 0
    || isBroadNumberRegion(printedNumber.region)
  );
}

function getOcrRegionCrop(
  width: number,
  height: number,
  region: OcrRegion
) {
  return {
    originX: Math.max(0, Math.round(width * region.x)),
    originY: Math.max(0, Math.round(height * region.y)),
    width: Math.max(1, Math.min(width, Math.round(width * region.width))),
    height: Math.max(1, Math.min(height, Math.round(height * region.height))),
  };
}

async function readOcrRegionText(uri: string, width: number, height: number, region: typeof NAME_OCR_REGION) {
  const crop = getOcrRegionCrop(width, height, region);
  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    [{ crop }, { resize: { width: 1000 } }],
    { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG }
  );
  const result = await TextRecognition.recognize(manipulated.uri);
  return result?.text ?? '';
}

async function readPrintedNumberFromRegion(uri: string, width: number, height: number, region: OcrRegion) {
  const crop = getOcrRegionCrop(width, height, region);
  const actions: ImageManipulator.Action[] = [
    { crop },
    ...(region.rotate ? [{ rotate: region.rotate }] : []),
    { resize: { width: NUMBER_OCR_WIDTH } },
  ];
  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    actions,
    { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG }
  );
  const result = await TextRecognition.recognize(manipulated.uri);
  const printedNumber = parsePrintedNumberFromOcr(result?.text);
  if (printedNumber) {
    printedNumber.ocrText = result?.text ?? undefined;
    printedNumber.region = region.name;
  }
  return printedNumber;
}

async function readPrintedNumberFromRegions(
  uri: string,
  width: number,
  height: number,
  regions: OcrRegion[]
) {
  for (const region of regions) {
    const rawPrintedNumber = await readPrintedNumberFromRegion(uri, width, height, region);
    const printedNumber = rawPrintedNumber ? repairSuspiciousPrintedNumber(rawPrintedNumber) : null;
    if (
      printedNumber
      && printedNumber.number < 100
      && isBroadNumberRegion(region.name)
      && hasThreeDigitCollectorEvidence(printedNumber.ocrText)
    ) {
      console.log('Printed number OCR ignored broad truncated match:', {
        region: region.name,
        number: `${printedNumber.number}/${printedNumber.total}`,
      });
      continue;
    }

    if (printedNumber) {
      if (
        printedNumber.number < 10
        && printedNumber.total < 10
        && isBroadNumberRegion(region.name)
      ) {
        console.log('Printed number OCR ignored tiny broad match:', {
          region: region.name,
          number: `${printedNumber.number}/${printedNumber.total}`,
        });
        continue;
      }

      console.log('Printed number OCR matched:', {
        region: region.name,
        number: `${printedNumber.number}/${printedNumber.total}`,
      });
      return printedNumber;
    }
  }

  return null;
}

async function readPrintedNumberFromCardImage(
  uri: string,
  width?: number,
  height?: number,
  options?: { includeFastRegions?: boolean; includeFallbackRegions?: boolean; includeFullCard?: boolean }
) {
  try {
    if (width && height) {
      if (options?.includeFastRegions !== false) {
        const fastRead = await readPrintedNumberFromRegions(uri, width, height, FAST_NUMBER_OCR_REGIONS);
        if (fastRead) return fastRead;
      }

      if (options?.includeFallbackRegions !== false) {
        const fallbackRead = await readPrintedNumberFromRegions(uri, width, height, FALLBACK_NUMBER_OCR_REGIONS);
        if (fallbackRead) return fallbackRead;
      }
    }

    if (options?.includeFullCard === false) return null;

    const result = await TextRecognition.recognize(uri);
    const rawPrintedNumber = parsePrintedNumberFromOcr(result?.text) ?? parsePrintedNumber(result?.text);
    const printedNumber = rawPrintedNumber ? repairSuspiciousPrintedNumber(rawPrintedNumber) : null;
    if (printedNumber) {
      printedNumber.region = 'full-card';
      console.log('Printed number OCR matched:', {
        region: 'full-card',
        number: `${printedNumber.number}/${printedNumber.total}`,
      });
    }
    return printedNumber;
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
    warmLocalCardIndex();
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
    printedNumber?: PrintedNumber | null
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
    printedNumber?: PrintedNumber | null
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
      return {
        base64: manipulated.base64 ?? '',
        uri: manipulated.uri,
        width: manipulated.width,
        height: manipulated.height,
      };
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

    const identifyWithLocalAi = async (
      printedNumber?: PrintedNumber | null,
      setId?: string | null,
      base64Image?: string | null,
      nameHint?: string | null
    ) => {
      if (!printedNumber) return null;

      const response = await fetch(`${PRICE_API_URL}/api/local-ai/identify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printedNumber, setId, base64Image, nameHint }),
      });

      const raw = await response.text();
      let data: any = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        console.log('Local AI returned non-JSON response:', {
          status: response.status,
          preview: raw.slice(0, 180),
        });
        return null;
      }

      if (!response.ok) {
        console.log('Local AI scan result:', {
          error: data?.error,
          status: response.status,
          printedNumber,
          stages: data?.stages,
        });
        return null;
      }

      console.log('Local AI scan result:', {
        card: data?.match?.name,
        number: data?.match?.number,
        set: data?.match?.set_name,
        confidence: data?.confidence,
        stages: data?.stages,
        candidates: data?.candidates?.length,
        candidateNames: data?.candidates?.map((card: ScannedCard) => `${card.name} (${card.set_name})`).slice(0, 5),
        needsVisualRerank: data?.needsVisualRerank,
        clipSimilarity: data?.clipSimilarity,
        resolvedBy: data?.resolvedBy,
      });

      return data;
    };

    const identifyWithLocalIndex = async (
      printedNumber?: PrintedNumber | null,
      setId?: string | null,
      ocrText?: string | null
    ) => {
      const candidates = await lookupLocalCardsByPrintedNumber(printedNumber, setId);
      if (!candidates) return null;

      if (candidates.length === 1) {
        if (hasLongerNumberHint(printedNumber)) {
          console.log('Local index unique match ignored due to longer OCR number hint:', {
            read: `${printedNumber?.number}/${printedNumber?.total}`,
            candidate: `${candidates[0].name} (${candidates[0].set_name})`,
          });
          return { match: null, candidates, needsVisualRerank: true, resolvedBy: null };
        }

        const match = toScannedCard(candidates[0]);
        console.log('Local index scan result:', {
          card: match.name,
          number: match.number,
          set: match.set_name,
          candidates: 1,
          resolvedBy: 'local-number',
        });
        return { match, candidates, needsVisualRerank: false, resolvedBy: 'local-number' };
      }

      const nameMatch = resolveLocalCardsByName(candidates, ocrText);
      if (nameMatch) {
        const match = toScannedCard(nameMatch);
        console.log('Local index scan result:', {
          card: match.name,
          number: match.number,
          set: match.set_name,
          candidates: candidates.length,
          resolvedBy: 'local-name',
        });
        return { match, candidates, needsVisualRerank: false, resolvedBy: 'local-name' };
      }

      console.log('Local index scan result:', {
        candidates: candidates.length,
        candidateNames: candidates.slice(0, 5).map((card) => `${card.name} (${card.set_name})`),
        needsVisualRerank: candidates.length > 1,
      });

      return { match: null, candidates, needsVisualRerank: candidates.length > 1, resolvedBy: null };
    };

    const identifyWithOnDeviceVisual = async (
      base64Image?: string | null,
      candidates?: LocalScanCard[] | null
    ) => {
      if (!candidates?.length) return null;

      const visualResult = await rerankWithOnDeviceVisual(base64Image, candidates);
      if (visualResult.status !== 'disabled') {
        console.log('On-device visual scan result:', {
          status: visualResult.status,
          reason: visualResult.reason,
          card: visualResult.match?.name,
          set: visualResult.match?.set_name,
          similarity: visualResult.similarity,
          candidates: candidates?.length ?? 0,
        });
      }

      if (!visualResult.match) return null;
      return {
        match: toScannedCard(visualResult.match),
        candidates,
        needsVisualRerank: false,
        resolvedBy: 'on-device-visual',
      };
    };

    const lookupParsedCard = async (
      parsed: any,
      fallbackPrintedNumber?: PrintedNumber | null,
      setId?: string | null
    ): Promise<ScannedCard | null> => {
      if (!parsed || parsed.error || !parsed.name) return null;

      const numberClean = fallbackPrintedNumber?.number != null
        ? String(fallbackPrintedNumber.number)
        : setId
          ? null
          : parsed.number
            ? String(parsed.number).split('/')[0].trim().replace(/^0+/, '')
            : null;
      const setTotalClean = fallbackPrintedNumber?.total != null
        ? String(fallbackPrintedNumber.total)
        : setId
          ? null
          : parsed.printedTotal
            ? String(parsed.printedTotal)
            : null;

      if (
        fallbackPrintedNumber
        && fallbackPrintedNumber.number < 100
        && isBroadNumberRegion(fallbackPrintedNumber.region)
      ) {
        return null;
      }

      const searchParams = new URLSearchParams({ name: parsed.name });
      if (numberClean) searchParams.append('number', numberClean);
      if (setTotalClean) searchParams.append('setTotal', setTotalClean);
      if (setId) {
        searchParams.append('setId', setId);
        searchParams.append('strictSet', '1');
      }

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
      const scanStartedAt = Date.now();
      const captureDoneAt = Date.now();
      let printedNumber = await readPrintedNumberFromCardImage(bestUri, capture.width, capture.height, {
        includeFallbackRegions: false,
        includeFullCard: false,
      });
      const numberOcrDoneAt = Date.now();

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
      const useLocalAi = SCAN_PROVIDER === 'local-ai' || SCAN_PROVIDER === 'hybrid';
      const useGibl = SCAN_PROVIDER === 'gibl-only' || SCAN_PROVIDER === 'hybrid';
      const useLegacy = SCAN_PROVIDER === 'legacy' || SCAN_PROVIDER === 'hybrid';

      // Step 2: official binders can resolve instantly from the printed card number.
      let match: ScannedCard | null = await lookupCardBySetNumber(expectedSetId, printedNumber);

      // Step 3: local OCR resolver. This is the exact-match layer of the YOLO + CLIP + OCR pipeline.
      if (!match && useLocalAi) {
        let localIndexResult = await identifyWithLocalIndex(printedNumber, expectedSetId);
        const visualCandidates = localIndexResult?.candidates?.length
          ? localIndexResult.candidates
          : await lookupLocalCardsByPrintedTotal(printedNumber?.total, expectedSetId);
        const onDeviceVisualResult = localIndexResult?.match
          ? null
          : await identifyWithOnDeviceVisual(bestBase64, visualCandidates);
        let localResult = localIndexResult?.match
          ? localIndexResult
          : onDeviceVisualResult?.match
            ? onDeviceVisualResult
            : await identifyWithLocalAi(printedNumber, expectedSetId);
        const firstLocalDoneAt = Date.now();
        if (shouldTryNameTotalFallback(printedNumber, localIndexResult, localResult)) {
          const nameText = await readOcrRegionText(bestUri, capture.width, capture.height, NAME_OCR_REGION);
          const nameOcrDoneAt = Date.now();
          if (nameText) {
            printedNumber = {
              ...printedNumber,
              ocrText: `${printedNumber.ocrText ?? ''}\n${nameText}`.trim(),
            };
            if (
              printedNumber.number < 100
              && isBroadNumberRegion(printedNumber.region)
            ) {
              const nameTotalMatch = await lookupLocalCardByNameAndTotal(
                printedNumber.total,
                printedNumber.ocrText,
                expectedSetId
              );
              if (nameTotalMatch) {
                localResult = {
                  match: toScannedCard(nameTotalMatch),
                  needsVisualRerank: false,
                  resolvedBy: 'local-name-total',
                };
              }
            }
            localIndexResult = await identifyWithLocalIndex(printedNumber, expectedSetId, printedNumber.ocrText);
            const visualCandidatesAfterName = localIndexResult?.candidates?.length
              ? localIndexResult.candidates
              : await lookupLocalCardsByPrintedTotal(printedNumber.total, expectedSetId);
            const onDeviceVisualResultAfterName = localIndexResult?.match
              ? null
              : await identifyWithOnDeviceVisual(bestBase64, visualCandidatesAfterName);
            localResult = localResult?.match
              ? localResult
              : localIndexResult?.match
                ? localIndexResult
                : onDeviceVisualResultAfterName?.match
                  ? onDeviceVisualResultAfterName
                  : await identifyWithLocalAi(printedNumber, expectedSetId);
            if (!localResult?.match && localResult?.needsVisualRerank) {
              localResult = await identifyWithLocalAi(printedNumber, expectedSetId, bestBase64);
            }
            console.log('Scan timing:', {
              captureMs: captureDoneAt - scanStartedAt,
              numberOcrMs: numberOcrDoneAt - captureDoneAt,
              firstResolveMs: firstLocalDoneAt - numberOcrDoneAt,
              nameOcrMs: nameOcrDoneAt - firstLocalDoneAt,
              secondResolveMs: Date.now() - nameOcrDoneAt,
              totalMs: Date.now() - scanStartedAt,
            });
          } else {
            console.log('Scan timing:', {
              captureMs: captureDoneAt - scanStartedAt,
              numberOcrMs: numberOcrDoneAt - captureDoneAt,
              firstResolveMs: firstLocalDoneAt - numberOcrDoneAt,
              nameOcrMs: nameOcrDoneAt - firstLocalDoneAt,
              totalMs: Date.now() - scanStartedAt,
            });
          }
        } else {
          console.log('Scan timing:', {
            captureMs: captureDoneAt - scanStartedAt,
            numberOcrMs: numberOcrDoneAt - captureDoneAt,
            firstResolveMs: firstLocalDoneAt - numberOcrDoneAt,
            totalMs: Date.now() - scanStartedAt,
          });
        }
        match = localResult?.match ?? null;
      }

      if (!match && useLocalAi && printedNumber) {
        const fallbackPrintedNumber = await readPrintedNumberFromCardImage(bestUri, capture.width, capture.height, {
          includeFastRegions: false,
        });
        if (
          fallbackPrintedNumber
          && (
            fallbackPrintedNumber.number !== printedNumber.number
            || fallbackPrintedNumber.total !== printedNumber.total
            || fallbackPrintedNumber.region !== printedNumber.region
          )
        ) {
          printedNumber = fallbackPrintedNumber;
          let localIndexResult = await identifyWithLocalIndex(printedNumber, expectedSetId);
          const visualCandidates = localIndexResult?.candidates?.length
            ? localIndexResult.candidates
            : await lookupLocalCardsByPrintedTotal(printedNumber.total, expectedSetId);
          const onDeviceVisualResult = localIndexResult?.match
            ? null
            : await identifyWithOnDeviceVisual(bestBase64, visualCandidates);
          let localResult = localIndexResult?.match
            ? localIndexResult
            : onDeviceVisualResult?.match
              ? onDeviceVisualResult
              : await identifyWithLocalAi(printedNumber, expectedSetId);
          if (shouldTryNameTotalFallback(printedNumber, localIndexResult, localResult)) {
            const nameText = await readOcrRegionText(bestUri, capture.width, capture.height, NAME_OCR_REGION);
            if (nameText) {
              printedNumber = {
                ...printedNumber,
                ocrText: `${printedNumber.ocrText ?? ''}\n${nameText}`.trim(),
              };
              if (
                printedNumber.number < 100
                && isBroadNumberRegion(printedNumber.region)
              ) {
                const nameTotalMatch = await lookupLocalCardByNameAndTotal(
                  printedNumber.total,
                  printedNumber.ocrText,
                  expectedSetId
                );
                if (nameTotalMatch) {
                  localResult = {
                    match: toScannedCard(nameTotalMatch),
                    needsVisualRerank: false,
                    resolvedBy: 'local-name-total',
                  };
                }
              }
              localIndexResult = await identifyWithLocalIndex(printedNumber, expectedSetId, printedNumber.ocrText);
              const visualCandidatesAfterName = localIndexResult?.candidates?.length
                ? localIndexResult.candidates
                : await lookupLocalCardsByPrintedTotal(printedNumber.total, expectedSetId);
              const onDeviceVisualResultAfterName = localIndexResult?.match
                ? null
                : await identifyWithOnDeviceVisual(bestBase64, visualCandidatesAfterName);
              localResult = localResult?.match
                ? localResult
                : localIndexResult?.match
                  ? localIndexResult
                  : onDeviceVisualResultAfterName?.match
                    ? onDeviceVisualResultAfterName
                    : await identifyWithLocalAi(printedNumber, expectedSetId);
            }
          }
          match = localResult?.match ?? null;
        }
      }

      if (!match && useLocalAi && !printedNumber) {
        const nameText = await readOcrRegionText(bestUri, capture.width, capture.height, NAME_OCR_REGION);
        const nameCandidates = await lookupLocalCardsByNameText(nameText, expectedSetId);
        const setCandidates = nameCandidates?.length
          ? nameCandidates
          : await lookupLocalCardsBySet(expectedSetId);

        if (nameCandidates?.length === 1) {
          match = toScannedCard(nameCandidates[0]);
          console.log('Local index scan result:', {
            card: match.name,
            number: match.number,
            set: match.set_name,
            candidates: 1,
            resolvedBy: 'local-name-no-number',
          });
        } else {
          const visualResult = await identifyWithOnDeviceVisual(bestBase64, setCandidates);
          match = visualResult?.match ?? null;
        }
      }

      if (!match && useLocalAi && !printedNumber) {
        const hqCapture = await captureCardImage(ACCURACY_SCAN_PROFILE);
        bestBase64 = hqCapture.base64;
        bestUri = hqCapture.uri;
        printedNumber = await readPrintedNumberFromCardImage(bestUri, hqCapture.width, hqCapture.height);
        let localIndexResult = await identifyWithLocalIndex(printedNumber, expectedSetId);
        const visualCandidates = localIndexResult?.candidates?.length
          ? localIndexResult.candidates
          : await lookupLocalCardsByPrintedTotal(printedNumber?.total, expectedSetId);
        const onDeviceVisualResult = localIndexResult?.match
          ? null
          : await identifyWithOnDeviceVisual(bestBase64, visualCandidates);
        let localResult = localIndexResult?.match
          ? localIndexResult
          : onDeviceVisualResult?.match
            ? onDeviceVisualResult
            : await identifyWithLocalAi(printedNumber, expectedSetId);
        if (shouldTryNameTotalFallback(printedNumber, localIndexResult, localResult)) {
          const nameText = await readOcrRegionText(bestUri, hqCapture.width, hqCapture.height, NAME_OCR_REGION);
          if (nameText) {
            printedNumber = {
              ...printedNumber,
              ocrText: `${printedNumber.ocrText ?? ''}\n${nameText}`.trim(),
            };
            if (
              printedNumber.number < 100
              && isBroadNumberRegion(printedNumber.region)
            ) {
              const nameTotalMatch = await lookupLocalCardByNameAndTotal(
                printedNumber.total,
                printedNumber.ocrText,
                expectedSetId
              );
              if (nameTotalMatch) {
                localResult = {
                  match: toScannedCard(nameTotalMatch),
                  needsVisualRerank: false,
                  resolvedBy: 'local-name-total',
                };
              }
            }
            localIndexResult = await identifyWithLocalIndex(printedNumber, expectedSetId, printedNumber.ocrText);
            const visualCandidatesAfterName = localIndexResult?.candidates?.length
              ? localIndexResult.candidates
              : await lookupLocalCardsByPrintedTotal(printedNumber.total, expectedSetId);
            const onDeviceVisualResultAfterName = localIndexResult?.match
              ? null
              : await identifyWithOnDeviceVisual(bestBase64, visualCandidatesAfterName);
            localResult = localResult?.match
              ? localResult
              : localIndexResult?.match
                ? localIndexResult
                : onDeviceVisualResultAfterName?.match
                  ? onDeviceVisualResultAfterName
                  : await identifyWithLocalAi(printedNumber, expectedSetId);
            if (!localResult?.match && localResult?.needsVisualRerank) {
              localResult = await identifyWithLocalAi(printedNumber, expectedSetId, bestBase64);
            }
          }
        }
        match = localResult?.match ?? null;
      }

      // Step 4: test GiblTCG as an external image-recognition provider.
      if (!match && useGibl) {
        const parsed = await identifyWithGibl(bestBase64);
        console.log('Gibl scan result:', {
          name: parsed?.name,
          number: parsed?.number,
          printedTotal: parsed?.printedTotal,
          confidence: parsed?.confidence,
          error: parsed?.error,
          status: parsed?.status,
          attempt: parsed?.attempt,
          details: parsed?.details,
          raw: parsed?.raw,
        });
        match = await lookupParsedCard(parsed, printedNumber, expectedSetId);
      }

      // Step 5: try fingerprint match (fast, no AI cost). In official binders the set is already locked,
      // so OCR should not be allowed to hard-reject the fingerprint result.
      if (!match && useLegacy) {
        match = await fingerprintScan(
          base64,
          expectedSetId,
          expectedSetId ? null : printedNumber?.total,
          expectedSetId ? SET_FINGERPRINT_CONFIDENCE_THRESHOLD : GENERAL_FINGERPRINT_CONFIDENCE_THRESHOLD
        );
      }

      // Step 6: official binders get one sharper set-locked retry before any broader matching.
      if (!match && expectedSetId && useLegacy) {
        const hqCapture = await captureCardImage(ACCURACY_SCAN_PROFILE);
        bestBase64 = hqCapture.base64;
        bestUri = hqCapture.uri;
        const hqPrintedNumber = printedNumber ?? await readPrintedNumberFromCardImage(bestUri, hqCapture.width, hqCapture.height);
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

      // Step 7: fall back to CardSight if fingerprint didn't reach threshold
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
              printedNumber
                ? 'The card number was read, but there are multiple matching cards and the visual reranker is unavailable right now.'
                : 'Could not read the printed card number confidently. Try again with the bottom number clearly visible.'
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
          const hqPrintedNumber = printedNumber ?? await readPrintedNumberFromCardImage(bestUri, hqCapture.width, hqCapture.height);
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
            width: 310, height: 433,
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
