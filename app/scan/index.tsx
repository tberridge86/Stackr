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
  useWindowDimensions,
  Share,
} from 'react-native';
import { Text } from '../../components/Text';
import EditionAwareCardImage from '../../components/EditionAwareCardImage';
import { SafeAreaView , useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { fetchBinders, BinderRecord } from '../../lib/binders';
import { scanStore } from '../../lib/scanStore';
import * as ImageManipulator from 'expo-image-manipulator';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { PRICE_API_URL } from '../../lib/config';
import { Buffer } from 'buffer';
import { decode as decodeJpeg } from 'jpeg-js';
import {
  lookupLocalCardsByPrintedNumber,
  lookupLocalCardsByPrintedTotal,
  lookupLocalCardsByNameText,
  lookupLocalCardsBySet,
  lookupLocalCardByNameTotalAndNumberHint,
  resolveLocalCardByFusion,
  resolveLocalCardsByName,
  warmLocalCardIndex,
  type LocalScanCard,
} from '../../lib/localCardIndex';
import {
  embedImageOnDevice,
  isOnDeviceVisualAvailable,
  rerankWithOnDeviceVisual,
  setBundledOnDeviceVisualModel,
} from '../../lib/onDeviceVisualMatcher';
import {
  scannerPackCardToLocalCard,
  searchScannerPack,
  syncScannerPack,
} from '../../lib/scannerPack';
import clipVisionModel from '../../assets/models/clip-vit-base-patch32-vision-quantized.zip';
import type { NormalisedScanResponse, ScanCandidate, ScanEditionHint, ScanErrorResponse, ScanErrorStage } from '../../types/scan';

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
const MARKET_XIMILAR_SCAN_PROFILE = { width: 1400, compress: 0.9 };
const USE_SNAPSHOT_CAPTURE = true;
const REQUEST_TIMEOUT_MS = 5000;
const LOCAL_AI_TIMEOUT_MS = 2500;
const LOCAL_AI_VISUAL_TIMEOUT_MS = 3500;
const RARE_CANDY_STYLE_TIMEOUT_MS = 3500;
const USE_RARE_CANDY_STYLE_SCAN = process.env.EXPO_PUBLIC_RARE_CANDY_STYLE_SCAN !== 'false';
const AUTO_SCAN_SOFT_BUDGET_MS = 4500;
const AUTO_SCAN_HARD_BUDGET_MS = 6500;
const GENERAL_FINGERPRINT_CONFIDENCE_THRESHOLD = 78;
const SET_FINGERPRINT_CONFIDENCE_THRESHOLD = 60;
const SCAN_PROVIDER = process.env.EXPO_PUBLIC_SCAN_PROVIDER ?? 'local-ai';
const CARD_ASPECT_RATIO = 0.716;
const CARD_CROP_WIDTH_RATIO = 0.96;
const CARD_CROP_HEIGHT_RATIO = 0.98;
const NUMBER_OCR_WIDTH = 1600;
const PRIMARY_NUMBER_OCR_REGIONS = [
  { name: 'number-fast-lower-half', x: 0, y: 0.52, width: 1, height: 0.44 },
];
const SECONDARY_NUMBER_OCR_REGIONS = [
  { name: 'number-fast-bottom-right', x: 0.5, y: 0.78, width: 0.48, height: 0.16 },
  { name: 'number-fast-bottom-left', x: 0, y: 0.78, width: 0.5, height: 0.16 },
  { name: 'number-micro-left', x: 0, y: 0.79, width: 0.42, height: 0.14 },
  { name: 'number-strip', x: 0.46, y: 0.68, width: 0.52, height: 0.24 },
];
const FAST_NUMBER_OCR_REGIONS = [
  ...PRIMARY_NUMBER_OCR_REGIONS,
  ...SECONDARY_NUMBER_OCR_REGIONS,
];
const FALLBACK_NUMBER_OCR_REGIONS = [
  { name: 'bottom-right', x: 0.42, y: 0.64, width: 0.56, height: 0.32 },
  { name: 'bottom-left', x: 0, y: 0.64, width: 0.58, height: 0.32 },
  { name: 'bottom-band', x: 0, y: 0.64, width: 1, height: 0.32 },
];
const TOTAL_HINT_OCR_REGIONS = [
  { name: 'total-hint-micro-left', x: 0, y: 0.84, width: 0.34, height: 0.09 },
  { name: 'total-hint-low-left', x: 0, y: 0.81, width: 0.48, height: 0.14 },
  { name: 'total-hint-card-number-line', x: 0, y: 0.88, width: 0.46, height: 0.08 },
  { name: 'total-hint-card-number-tight', x: 0.03, y: 0.895, width: 0.36, height: 0.065 },
  { name: 'total-hint-bottom-left', x: 0, y: 0.78, width: 0.58, height: 0.18 },
  { name: 'total-hint-bottom-band', x: 0, y: 0.78, width: 1, height: 0.18 },
];
const NAME_OCR_REGIONS = [
  { name: 'top-name', x: 0, y: 0, width: 1, height: 0.28 },
  { name: 'title-left', x: 0.02, y: 0.04, width: 0.76, height: 0.18 },
  { name: 'title-band', x: 0, y: 0.02, width: 1, height: 0.18 },
];
const FIRST_EDITION_CAPABLE_SET_IDS = new Set([
  'base1',
  'base2',
  'base3',
  'base5',
  'gym1',
  'gym2',
  'neo1',
  'neo2',
  'neo3',
  'neo4',
]);
const FIRST_EDITION_STAMP_REGIONS: OcrRegion[] = [
  { name: 'stamp-left-art-lower', x: 0.07, y: 0.39, width: 0.17, height: 0.1 },
  { name: 'stamp-left-between-art-text', x: 0.07, y: 0.45, width: 0.17, height: 0.1 },
  { name: 'stamp-left-text-top', x: 0.07, y: 0.51, width: 0.17, height: 0.1 },
];
const FIRST_EDITION_STRONG_CONFIDENCE = 0.92;
const SHOW_SCAN_DEBUG =
  __DEV__ ||
  process.env.EXPO_PUBLIC_SHOW_SCAN_DEBUG === 'true' ||
  process.env.EXPO_PUBLIC_APP_ENV === 'beta';

function logScanStage(stage: string, payload: Record<string, unknown> = {}) {
  console.log(`[scan:${stage}]`, payload);
}

function stageMessage(stage?: ScanErrorStage) {
  switch (stage) {
    case 'image':
      return 'The camera image could not be captured or encoded. Try again with the card flat in frame.';
    case 'upload':
      return 'The scan request could not be sent. Check your connection and try again.';
    case 'ximilar':
      return 'The card recognition service did not complete the scan.';
    case 'normalisation':
      return 'The recognition service responded, but no usable card candidate was found.';
    case 'card_lookup':
      return 'The card was recognised, but extra card details could not be loaded.';
    case 'render':
      return 'The scan result could not be displayed.';
    case 'backend':
    default:
      return 'The scan service hit an unexpected problem. Please retry the scan.';
  }
}

function makeScanError(
  stage: ScanErrorStage,
  code: string,
  message: string,
  details?: string,
  httpStatus?: number,
  stack?: string
): ScanErrorState {
  return {
    ok: false,
    provider: 'ximilar',
    stage,
    code,
    message,
    details,
    httpStatus,
    debugDetails: details,
    stack,
  };
}

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
  image_large?: string | null;
  raw_data?: any;
  rarity: string;
  editionHint?: ScanEditionHint | null;
  editionSource?: ScanCandidate['editionSource'];
};

type ScanEditionDetection = {
  hint: ScanEditionHint | null;
  confidence: number;
  reason: string;
  metrics?: Record<string, unknown>;
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

const SCAN_EDITION_LABELS: Record<ScanEditionHint, string> = {
  '1st_edition': '1st Edition',
  unlimited: 'Unlimited',
  shadowless: 'Shadowless',
};

function normalizeScanEditionHint(value?: string | null): ScanEditionHint | null {
  if (!value) return null;
  const normalised = value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const joined = normalised.replace(/\s+/g, '');

  if (!normalised) return null;
  if (normalised === 'shadowless' || /\bshadowless\b/.test(normalised)) return 'shadowless';
  if (
    normalised === '1st edition'
    || normalised === '1st ed'
    || normalised === 'first edition'
    || /\b1st\s*(edition|ed)\b/.test(normalised)
    || /\bfirst\s*(edition|ed)\b/.test(normalised)
    || joined.includes('1stedition')
    || joined.includes('firstedition')
  ) {
    return '1st_edition';
  }
  if (normalised === 'unlimited' || /\bunlimited\b/.test(normalised)) return 'unlimited';

  return null;
}

function detectEditionHintFromScanFields(value: any): ScanEditionHint | null {
  const text = [
    value?.editionHint,
    value?.edition,
    value?.printing,
    value?.variant,
    value?.name,
    value?.full_name,
    value?.card_name,
    value?.setName,
    value?.set_name,
    value?.set,
    value?.rarity,
  ]
    .filter(Boolean)
    .map(String)
    .join(' ');

  return normalizeScanEditionHint(text);
}

function getEffectiveScanEditionHint(parsed: any, binderEdition?: string | null): {
  hint: ScanEditionHint | null;
  source: ScanCandidate['editionSource'];
} {
  const explicitHint = normalizeScanEditionHint(parsed?.editionHint);
  if (explicitHint && parsed?.editionSource === 'image_ocr') {
    return { hint: explicitHint, source: 'image_ocr' };
  }

  const binderHint = normalizeScanEditionHint(binderEdition);
  if (binderHint) return { hint: binderHint, source: 'binder' };

  if (explicitHint) {
    return { hint: explicitHint, source: parsed?.editionSource ?? 'ximilar' };
  }

  const detectedHint = detectEditionHintFromScanFields(parsed);
  return {
    hint: detectedHint,
    source: detectedHint ? 'ximilar' : null,
  };
}

function withCandidateEditionHint(candidate: ScanCandidate, binderEdition?: string | null): ScanCandidate {
  const { hint, source } = getEffectiveScanEditionHint(candidate, binderEdition);
  if (!hint) return candidate;
  return {
    ...candidate,
    editionHint: hint,
    editionSource: source,
  };
}

function withScannedCardEditionHint(
  card: ScannedCard,
  hint?: ScanEditionHint | null,
  source?: ScanCandidate['editionSource']
): ScannedCard {
  if (!hint) return card;
  return {
    ...card,
    editionHint: hint,
    editionSource: source ?? card.editionSource ?? 'resolver',
  };
}

function stripScanEditionFromSetName(setName?: string | null) {
  if (!setName) return setName ?? null;
  const cleaned = String(setName)
    .replace(/\b(1st|first)\s*(edition|ed)\b/gi, '')
    .replace(/\bunlimited\b/gi, '')
    .replace(/\bshadowless\b/gi, '')
    .replace(/[()[\]{}]/g, ' ')
    .replace(/\s*[-:/]\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned || setName;
}

function detectEditionHintFromCard(card: ScannedCard): ScanEditionHint | null {
  return detectEditionHintFromScanFields({
    id: card.id,
    set_id: card.set_id,
    set_name: card.set_name,
    rarity: card.rarity,
  });
}

function scoreCardForEditionHint(card: ScannedCard, editionHint?: ScanEditionHint | null) {
  if (!editionHint) return 0;

  const cardHint = detectEditionHintFromCard(card);
  if (cardHint === editionHint) return 5;
  if (!cardHint && editionHint === 'unlimited') return 3;
  if (!cardHint) return 1;
  if (editionHint === 'unlimited' && (cardHint === '1st_edition' || cardHint === 'shadowless')) return -4;
  if (editionHint === '1st_edition' && cardHint === 'unlimited') return -4;
  return -1;
}

function pickCardForEditionHint(cards: ScannedCard[], editionHint?: ScanEditionHint | null) {
  if (!cards.length) return null;
  if (!editionHint) return cards[0];

  return [...cards].sort((a, b) => scoreCardForEditionHint(b, editionHint) - scoreCardForEditionHint(a, editionHint))[0];
}

function formatScanEditionHint(hint?: ScanEditionHint | null) {
  return hint ? SCAN_EDITION_LABELS[hint] : null;
}

function formatScanCardSubtitle(setName?: string | null, number?: string | null, editionHint?: ScanEditionHint | null) {
  const parts = [
    setName,
    number ? `#${number}` : null,
    formatScanEditionHint(editionHint),
  ].filter(Boolean);
  return parts.join(' - ');
}

function isFirstEditionCapableScanTarget(value: any, fallbackSetId?: string | null) {
  const setId = String(
    fallbackSetId
    ?? value?.set_id
    ?? value?.setCode
    ?? value?.set_code
    ?? value?.set?.id
    ?? ''
  ).toLowerCase();

  if (setId && FIRST_EDITION_CAPABLE_SET_IDS.has(setId)) return true;
  if (setId === 'base4' || setId === 'base6') return false;

  const setName = String(
    value?.set_name
    ?? value?.setName
    ?? value?.set?.name
    ?? ''
  ).toLowerCase();

  if (!setName) return false;
  if (/\bbase\s*set\s*2\b/.test(setName) || /\blegendary\s+collection\b/.test(setName)) return false;

  return (
    /\bbase\b/.test(setName)
    || /\bjungle\b/.test(setName)
    || /\bfossil\b/.test(setName)
    || /\bteam\s+rocket\b/.test(setName)
    || /\bgym\s+(heroes|challenge)\b/.test(setName)
    || /\bneo\s+(genesis|discovery|revelation|destiny)\b/.test(setName)
  );
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
  ocrMs?: number;
  repairedFrom?: string;
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
  card?: ScannedCard | null;
  candidates?: ScanCandidate[];
  base64: string;
  isMarket: boolean;
  editionChoiceRequired?: boolean;
};

type ScanErrorState = ScanErrorResponse & {
  debugDetails?: string;
  stack?: string;
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
  if (printedNumber.number > 300 && printedNumber.total >= 10) {
    const rawNumber = String(printedNumber.number);
    const trimmedNumber = Number(rawNumber.slice(1));

    if (
      Number.isFinite(trimmedNumber)
      && trimmedNumber > 0
      && trimmedNumber <= printedNumber.total + 30
    ) {
      return {
        ...printedNumber,
        number: trimmedNumber,
        repairedFrom: `${printedNumber.number}/${printedNumber.total}`,
      };
    }
  }

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

function isSuspiciousPrintedNumber(printedNumber?: PrintedNumber | null) {
  if (!printedNumber) return false;

  if (printedNumber.number < 1 || printedNumber.total < 1) {
    return true;
  }

  if (printedNumber.number > 300) {
    return true;
  }

  if (printedNumber.total >= 10 && printedNumber.number > printedNumber.total + 150) {
    return true;
  }

  if (printedNumber.total < 10 && !hasThreeDigitTotalEvidence(printedNumber.ocrText)) {
    return true;
  }

  if (
    printedNumber.total < 10
    && printedNumber.number > printedNumber.total
    && isBroadNumberRegion(printedNumber.region)
  ) {
    return true;
  }

  return false;
}

function inferPrintedTotalFromText(text?: string | null) {
  if (!text) return null;
  const normalised = text
    .replace(/[Oo]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/[Ss]/g, '5');
  const matches = [...normalised.matchAll(/(?:\/|\uFF0F|\u2044|\u2215)\s*0?(\d{2,3})(?=\D|$)/g)];
  const totals = matches
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value > 0);
  return totals[0] ?? null;
}

function parsePrintedNumberSignalFromText(text?: string | null): PrintedNumber | null {
  const parsed = parsePrintedNumberFromOcr(text) ?? parsePrintedNumber(text);
  return parsed ? repairSuspiciousPrintedNumber(parsed) : null;
}

function isBroadNumberRegion(region?: string) {
  return region === 'bottom-band'
    || region === 'bottom-left'
    || region === 'number-fast-lower-half'
    || region === 'lower-half'
    || region === 'full-card';
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
  if (printedNumber.total && printedNumber.number > printedNumber.total) return false;
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

function shouldUsePrintedTotalVisualPool(
  printedNumber?: PrintedNumber | null,
  localIndexResult?: { candidates?: LocalScanCard[] | null; needsVisualRerank?: boolean } | null
) {
  if (!printedNumber?.total) return false;
  return Boolean(
    isBroadNumberRegion(printedNumber.region)
    || hasLongerNumberHint(printedNumber)
    || localIndexResult?.candidates?.length === 0
  );
}

function isLowConfidenceShortNumber(printedNumber?: PrintedNumber | null) {
  return Boolean(
    printedNumber
    && printedNumber.number < 10
    && printedNumber.total >= 50
    && isBroadNumberRegion(printedNumber.region)
  );
}

function hasSecretSuffixRisk(
  printedNumber?: PrintedNumber | null,
  candidates?: LocalScanCard[] | null,
  totalCandidates?: LocalScanCard[] | null
) {
  if (
    !printedNumber
    || printedNumber.number >= 100
    || printedNumber.number > printedNumber.total
    || !isBroadNumberRegion(printedNumber.region)
  ) {
    return false;
  }

  const read = String(printedNumber.number);
  const exactCandidateIds = new Set((candidates ?? []).map((card) => card.id));
  return Boolean(totalCandidates?.some((card) => {
    const cardNumber = Number.parseInt(card.number, 10);
    return Number.isFinite(cardNumber)
      && cardNumber > printedNumber.total
      && String(cardNumber).endsWith(read)
      && !exactCandidateIds.has(card.id);
  }));
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

async function readOcrRegionText(
  uri: string,
  width: number,
  height: number,
  region: OcrRegion,
  options?: { resizeWidth?: number }
) {
  const crop = getOcrRegionCrop(width, height, region);
  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    [{ crop }, { resize: { width: options?.resizeWidth ?? 1000 } }],
    { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG }
  );
  const result = await TextRecognition.recognize(manipulated.uri);
  return result?.text ?? '';
}

function getPixelRegionStats(
  decoded: { width: number; height: number; data: Uint8Array | Buffer },
  region: OcrRegion
) {
  const startX = Math.max(0, Math.round(decoded.width * region.x));
  const startY = Math.max(0, Math.round(decoded.height * region.y));
  const regionWidth = Math.max(1, Math.min(decoded.width - startX, Math.round(decoded.width * region.width)));
  const regionHeight = Math.max(1, Math.min(decoded.height - startY, Math.round(decoded.height * region.height)));
  const rowInk = new Array(regionHeight).fill(0);
  const columnInk = new Array(regionWidth).fill(0);
  const darkMask = new Uint8Array(regionWidth * regionHeight);
  let dark = 0;
  let veryDark = 0;
  let ink = 0;
  let total = 0;

  for (let y = 0; y < regionHeight; y += 1) {
    for (let x = 0; x < regionWidth; x += 1) {
      const index = ((startY + y) * decoded.width + startX + x) * 4;
      const r = decoded.data[index];
      const g = decoded.data[index + 1];
      const b = decoded.data[index + 2];
      const luma = (0.299 * r) + (0.587 * g) + (0.114 * b);
      total += 1;

      if (luma < 110) {
        ink += 1;
        rowInk[y] += 1;
        columnInk[x] += 1;
      }
      if (luma < 82) {
        dark += 1;
        darkMask[(y * regionWidth) + x] = 1;
      }
      if (luma < 55) veryDark += 1;
    }
  }

  const rowsWithInk = rowInk.filter((count) => count / regionWidth > 0.035).length;
  const columnsWithInk = columnInk.filter((count) => count / regionHeight > 0.035).length;
  const visited = new Uint8Array(darkMask.length);
  const components: {
    area: number;
    width: number;
    height: number;
    density: number;
    aspect: number;
    score: number;
  }[] = [];

  for (let i = 0; i < darkMask.length; i += 1) {
    if (!darkMask[i] || visited[i]) continue;

    const stack = [i];
    visited[i] = 1;
    let area = 0;
    let minX = regionWidth;
    let maxX = 0;
    let minY = regionHeight;
    let maxY = 0;

    while (stack.length) {
      const current = stack.pop()!;
      const x = current % regionWidth;
      const y = Math.floor(current / regionWidth);
      area += 1;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);

      const neighbours = [
        x > 0 ? current - 1 : -1,
        x < regionWidth - 1 ? current + 1 : -1,
        y > 0 ? current - regionWidth : -1,
        y < regionHeight - 1 ? current + regionWidth : -1,
      ];

      for (const next of neighbours) {
        if (next < 0 || visited[next] || !darkMask[next]) continue;
        visited[next] = 1;
        stack.push(next);
      }
    }

    const componentWidth = maxX - minX + 1;
    const componentHeight = maxY - minY + 1;
    if (area < 8 || componentWidth < 3 || componentHeight < 3) continue;

    const density = area / (componentWidth * componentHeight);
    const aspect = componentWidth / componentHeight;
    const widthRatio = componentWidth / regionWidth;
    const heightRatio = componentHeight / regionHeight;
    const stampLikeShape =
      aspect >= 0.45
      && aspect <= 2.2
      && widthRatio >= 0.12
      && widthRatio <= 0.58
      && heightRatio >= 0.18
      && heightRatio <= 0.78
      && density >= 0.12
      && density <= 0.75;

    components.push({
      area,
      width: componentWidth,
      height: componentHeight,
      density,
      aspect,
      score: stampLikeShape ? (area / (regionWidth * regionHeight)) + (density * 0.08) + (Math.min(widthRatio, heightRatio) * 0.12) : 0,
    });
  }

  const compactStampComponent = components.sort((a, b) => b.score - a.score)[0] ?? null;

  return {
    name: region.name,
    darkRatio: total ? dark / total : 0,
    veryDarkRatio: total ? veryDark / total : 0,
    inkRatio: total ? ink / total : 0,
    inkRowsRatio: rowsWithInk / regionHeight,
    inkColumnsRatio: columnsWithInk / regionWidth,
    compactStampComponent,
  };
}

function detectFirstEditionStampByPixels(base64Image: string): ScanEditionDetection {
  try {
    const decoded = decodeJpeg(Buffer.from(base64Image, 'base64'), { useTArray: true });
    const metrics = FIRST_EDITION_STAMP_REGIONS.map((region) => getPixelRegionStats(decoded, region));
    const scored = metrics
      .map((metric) => ({
        ...metric,
        score:
          (metric.darkRatio * 1.2)
          + (metric.veryDarkRatio * 1.5)
          + (metric.inkRowsRatio * 0.05)
          + (metric.inkColumnsRatio * 0.05)
          + ((metric.compactStampComponent?.score ?? 0) * 1.8),
      }))
      .sort((a, b) => b.score - a.score);
    const best = scored[0];
    const compactScore = best?.compactStampComponent?.score ?? 0;
    const hasStrongStampShape = Boolean(
      best
      && compactScore > 0.11
      && best.darkRatio > 0.075
      && best.veryDarkRatio > 0.032
      && best.inkRowsRatio > 0.22
      && best.inkRowsRatio < 0.74
      && best.inkColumnsRatio > 0.22
      && best.inkColumnsRatio < 0.78
    );

    if (hasStrongStampShape) {
      return {
        hint: '1st_edition',
        confidence: Math.min(0.97, 0.9 + (compactScore * 0.4) + (best.veryDarkRatio * 0.8)),
        reason: `dark stamp mark detected in ${best.name}`,
        metrics: { best, regions: scored },
      };
    }

    return {
      hint: 'unlimited',
      confidence: best?.veryDarkRatio && best.veryDarkRatio > 0.04 ? 0.62 : 0.74,
      reason: 'no strong 1st Edition stamp mark detected in expected area',
      metrics: { best, regions: scored },
    };
  } catch (error) {
    return {
      hint: null,
      confidence: 0,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function detectFirstEditionStampByOcr(
  uri: string,
  width: number,
  height: number
): Promise<ScanEditionDetection | null> {
  const chunks: string[] = [];

  for (const region of FIRST_EDITION_STAMP_REGIONS) {
    try {
      const text = await readOcrRegionText(uri, width, height, region, { resizeWidth: 1400 });
      if (text.trim()) chunks.push(text);
    } catch (error) {
      console.log('Edition stamp OCR region failed:', {
        region: region.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const ocrText = chunks.join('\n').replace(/\s+/g, ' ').trim();
  const normalized = ocrText.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const joined = normalized.replace(/\s+/g, '');

  if (
    /\b(1st|first)\s*(edition|ed)\b/.test(normalized)
    || /\bedition\b/.test(normalized)
    || joined.includes('1stedition')
    || joined.includes('firstedition')
  ) {
    return {
      hint: '1st_edition',
      confidence: 0.94,
      reason: '1st Edition stamp text detected',
      metrics: { ocrText },
    };
  }

  return ocrText
    ? {
        hint: null,
        confidence: 0,
        reason: 'edition OCR text did not contain stamp wording',
        metrics: { ocrText },
      }
    : null;
}

async function readVisualEditionHintFromCardImage(
  uri: string,
  width: number,
  height: number,
  base64Image: string
): Promise<ScanEditionDetection> {
  const pixelResult = detectFirstEditionStampByPixels(base64Image);
  if (pixelResult.hint === '1st_edition' && pixelResult.confidence >= FIRST_EDITION_STRONG_CONFIDENCE) {
    return pixelResult;
  }
  if (pixelResult.hint === 'unlimited') {
    return pixelResult;
  }

  const ocrResult = await detectFirstEditionStampByOcr(uri, width, height);
  if (ocrResult?.hint === '1st_edition') return ocrResult;

  if (pixelResult.hint === '1st_edition') {
    return {
      hint: 'unlimited',
      confidence: 0.58,
      reason: `possible 1st Edition mark was below confidence threshold (${pixelResult.confidence.toFixed(2)})`,
      metrics: pixelResult.metrics,
    };
  }

  if (pixelResult.hint) return pixelResult;

  return ocrResult ?? {
    ...pixelResult,
    hint: 'unlimited',
    confidence: 0.58,
    reason: 'no readable 1st Edition stamp evidence was found',
  };
}

async function readNameTextFromCardImage(
  uri: string,
  width: number,
  height: number,
  options?: { regions?: OcrRegion[]; resizeWidth?: number }
) {
  const chunks: string[] = [];

  for (const region of options?.regions ?? NAME_OCR_REGIONS) {
    const regionStartedAt = Date.now();
    const text = await readOcrRegionText(uri, width, height, region, {
      resizeWidth: options?.resizeWidth ?? 1000,
    });
    const ocrMs = Date.now() - regionStartedAt;
    if (text.trim()) {
      console.log('Name OCR text:', {
        region: region.name,
        ocrMs,
        preview: text.replace(/\s+/g, ' ').trim().slice(0, 80),
      });
      chunks.push(text);
    } else {
      console.log('Name OCR empty:', {
        region: region.name,
        ocrMs,
      });
    }
  }

  return chunks.join('\n').trim();
}

async function readTotalHintTextFromCardImage(uri: string, width: number, height: number) {
  const chunks: string[] = [];

  for (const region of TOTAL_HINT_OCR_REGIONS) {
    const regionStartedAt = Date.now();
    const text = await readOcrRegionText(uri, width, height, region, { resizeWidth: 1800 });
    const ocrMs = Date.now() - regionStartedAt;
    if (text.trim()) {
      console.log('Total hint OCR text:', {
        region: region.name,
        ocrMs,
        preview: text.replace(/\s+/g, ' ').trim().slice(0, 80),
      });
      chunks.push(text);
    }
  }

  return chunks.join('\n').trim();
}

async function readPrintedNumberFromRegion(uri: string, width: number, height: number, region: OcrRegion) {
  const startedAt = Date.now();
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
    printedNumber.ocrMs = Date.now() - startedAt;
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
      && printedNumber.number <= printedNumber.total
      && isBroadNumberRegion(region.name)
      && hasThreeDigitCollectorEvidence(printedNumber.ocrText)
    ) {
      console.log('Printed number OCR ignored broad truncated match:', {
        region: region.name,
        number: `${printedNumber.number}/${printedNumber.total}`,
        ocrMs: printedNumber.ocrMs,
      });
      continue;
    }

    if (printedNumber) {
      if (isSuspiciousPrintedNumber(printedNumber)) {
        console.log('Printed number OCR ignored suspicious match:', {
          region: region.name,
          number: `${printedNumber.number}/${printedNumber.total}`,
          ocrMs: printedNumber.ocrMs,
        });
        continue;
      }

      if (
        printedNumber.number < 10
        && printedNumber.total < 10
        && isBroadNumberRegion(region.name)
      ) {
        console.log('Printed number OCR ignored tiny broad match:', {
          region: region.name,
          number: `${printedNumber.number}/${printedNumber.total}`,
          ocrMs: printedNumber.ocrMs,
        });
        continue;
      }

      console.log('Printed number OCR matched:', {
        region: region.name,
        number: `${printedNumber.number}/${printedNumber.total}`,
        ocrMs: printedNumber.ocrMs,
        repairedFrom: printedNumber.repairedFrom,
      });
      return printedNumber;
    }
  }

  return null;
}

function logPrintedNumberOcrMiss(regions: OcrRegion[]) {
  console.log('Printed number OCR missed regions:', {
    regions: regions.map((region) => region.name),
  });
}

async function readPrintedNumberFromCardImage(
  uri: string,
  width?: number,
  height?: number,
  options?: {
    includeFastRegions?: boolean;
    includeFallbackRegions?: boolean;
    includeFullCard?: boolean;
    fastRegions?: OcrRegion[];
    fallbackRegions?: OcrRegion[];
  }
) {
  try {
    if (width && height) {
      if (options?.includeFastRegions !== false) {
        const fastRegions = options?.fastRegions ?? FAST_NUMBER_OCR_REGIONS;
        const fastRead = await readPrintedNumberFromRegions(uri, width, height, fastRegions);
        if (fastRead) return fastRead;
        logPrintedNumberOcrMiss(fastRegions);
      }

      if (options?.includeFallbackRegions !== false) {
        const fallbackRegions = options?.fallbackRegions ?? FALLBACK_NUMBER_OCR_REGIONS;
        const fallbackRead = await readPrintedNumberFromRegions(uri, width, height, fallbackRegions);
        if (fallbackRead) return fallbackRead;
        logPrintedNumberOcrMiss(fallbackRegions);
      }
    }

    if (options?.includeFullCard === false) return null;

    const startedAt = Date.now();
    const result = await TextRecognition.recognize(uri);
    const rawPrintedNumber = parsePrintedNumberFromOcr(result?.text) ?? parsePrintedNumber(result?.text);
    const printedNumber = rawPrintedNumber ? repairSuspiciousPrintedNumber(rawPrintedNumber) : null;
    if (printedNumber) {
      printedNumber.ocrMs = Date.now() - startedAt;
      if (isSuspiciousPrintedNumber(printedNumber)) {
        console.log('Printed number OCR ignored suspicious match:', {
          region: 'full-card',
          number: `${printedNumber.number}/${printedNumber.total}`,
          ocrMs: printedNumber.ocrMs,
        });
        return null;
      }

      printedNumber.region = 'full-card';
      console.log('Printed number OCR matched:', {
        region: 'full-card',
        number: `${printedNumber.number}/${printedNumber.total}`,
        ocrMs: printedNumber.ocrMs,
        repairedFrom: printedNumber.repairedFrom,
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
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const params = useLocalSearchParams<{ mode?: string; binderId?: string }>();
  const isInventoryMode = params.mode === 'inventory';
  const isMarketMode = params.mode === 'market' || isInventoryMode;

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
  const [scanError, setScanError] = useState<ScanErrorState | null>(null);
  const [frozenFrameUri, setFrozenFrameUri] = useState<string | null>(null);

  const isCompactScanner = screenHeight < 780;
  const scannerFrameWidth = Math.min(screenWidth - 64, isCompactScanner ? 286 : 300);
  const scannerFrameHeight = Math.round(scannerFrameWidth / CARD_ASPECT_RATIO);
  const shutterSize = isCompactScanner ? 72 : 80;
  const shutterInnerSize = isCompactScanner ? 54 : 60;

  const scanCooldownRef = useRef(false);
  const autoScanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scannedCardIdsRef = useRef<Set<string>>(new Set());
  const scanningMessageRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastFrameSigRef = useRef<string | null>(null);
  const lastFrameTsRef = useRef<number>(0);
  const handleCaptureRef = useRef<((isAuto?: boolean) => Promise<void>) | null>(null);
  const pendingRenderLoggedRef = useRef(false);
  const lastScanDebugRef = useRef<number>(0);

  // ===============================
  // LOAD BINDERS
  // ===============================

  useEffect(() => {
    fetchBinders().then((data) => {
      setBinders(data);
      setLoadingBinders(false);
    });
    warmLocalCardIndex();
    syncScannerPack()
      .then((manifest) => {
        console.log('Scanner pack ready:', {
          id: manifest.id,
          cards: manifest.cardCount,
          dimensions: manifest.dimensions,
          generatedAt: manifest.generatedAt,
        });
      })
      .catch((error) => {
        console.log('Scanner pack sync failed:', error);
      });
  }, []);

  useEffect(() => {
    if (isMarketMode || !params.binderId || selectedBinder) return;
    const binder = binders.find((item) => item.id === params.binderId);
    if (!binder) return;
    setSelectedBinder(binder);
    setStep('scanning');
  }, [binders, isMarketMode, params.binderId, selectedBinder]);

  useEffect(() => {
    if (!pendingConfirmation) {
      pendingRenderLoggedRef.current = false;
      return;
    }
    if (!pendingRenderLoggedRef.current) {
      logScanStage('CANDIDATES_RENDER_STARTED', {
        candidates: pendingConfirmation.candidates?.length ?? (pendingConfirmation.card ? 1 : 0),
        names: pendingConfirmation.candidates?.map((candidate) => candidate.name).slice(0, 5)
          ?? (pendingConfirmation.card ? [pendingConfirmation.card.name] : []),
      });
      pendingRenderLoggedRef.current = true;
    }

    const timer = setTimeout(() => {
      logScanStage('CANDIDATES_RENDER_COMPLETE', {
        candidates: pendingConfirmation.candidates?.length ?? (pendingConfirmation.card ? 1 : 0),
      });
    }, 0);

    return () => clearTimeout(timer);
  }, [pendingConfirmation]);

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
        if (!scanCooldownRef.current) void handleCaptureRef.current?.(true);
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
    if (scanningMessageRef.current) {
      clearInterval(scanningMessageRef.current);
      scanningMessageRef.current = null;
    }
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
      setScanError(null);
      setFrozenFrameUri(null);
    }, delay);
  }, [stopScanningMessages]);

  const closeScanner = useCallback(() => {
    setAutoScanActive(false);
    setTorch(false);
    setProcessingOcr(false);
    setScanning(false);
    setPendingConfirmation(null);
    setScanError(null);
    setFrozenFrameUri(null);
    scanCooldownRef.current = false;
    if (autoScanIntervalRef.current) {
      clearInterval(autoScanIntervalRef.current);
      autoScanIntervalRef.current = null;
    }
    if (scanningMessageRef.current) {
      clearInterval(scanningMessageRef.current);
      scanningMessageRef.current = null;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  }, []);

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
        .select('id, name, number, rarity, image_small, image_large, set_id, raw_data')
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
        image_large: card.image_large ?? card.raw_data?.images?.large ?? null,
        raw_data: card.raw_data ?? null,
        rarity: card.rarity ?? '',
      };
    } catch {
      return null;
    }
  }, []);

  const logScanDebug = useCallback((message: string, data?: Record<string, unknown>) => {
    const now = Date.now();
    if (now - lastScanDebugRef.current < 1200) return;
    lastScanDebugRef.current = now;
    console.log(`Scan debug: ${message}`, data ?? {});
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
        .select('id, name, number, rarity, image_small, image_large, set_id, raw_data')
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
        image_large: candidate.image_large ?? candidate.raw_data?.images?.large ?? null,
        raw_data: candidate.raw_data ?? null,
        rarity: candidate.rarity ?? '',
        editionHint: card.editionHint,
        editionSource: card.editionSource,
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
        .select('id, name, number, rarity, image_small, image_large, set_id, raw_data')
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
        image_large: card.image_large ?? card.raw_data?.images?.large ?? null,
        raw_data: card.raw_data ?? null,
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
    if (!camera.current) {
      if (isAuto) logScanDebug('camera-not-ready');
      return;
    }
    if (scanCooldownRef.current || processingOcr) {
      if (isAuto) {
        logScanDebug('capture-blocked', {
          cooldown: scanCooldownRef.current,
          processingOcr,
        });
      }
      return;
    }

    const now = Date.now();
    if (isAuto && now - lastFrameTsRef.current < 700) {
      logScanDebug('frame-throttled', {
        sinceLastFrameMs: now - lastFrameTsRef.current,
      });
      return;
    }

    setProcessingOcr(true);
    setScanError(null);
    setFrozenFrameUri(null);
    scanCooldownRef.current = true;
    startScanningMessages();
    if (isAuto) logScanDebug('capture-started');

    const captureCardImage = async (profile: { width: number; compress: number }): Promise<CaptureResult> => {
      const captureStartedAt = Date.now();
      let photo;
      let source: 'snapshot' | 'photo' = 'photo';
      try {
        if (USE_SNAPSHOT_CAPTURE && isAuto && profile.width <= FAST_SCAN_PROFILE.width) {
          source = 'snapshot';
          photo = await camera.current!.takeSnapshot({ quality: 85 });
        } else {
          photo = await camera.current!.takePhoto({ flash: 'off', enableShutterSound: false });
        }
      } catch (error) {
        if (source === 'snapshot') {
          source = 'photo';
          photo = await camera.current!.takePhoto({ flash: 'off', enableShutterSound: false });
        } else {
          throw error;
        }
      }
      const photoDoneAt = Date.now();
      const capturedUri = photo.path
        ? photo.path.startsWith('file://')
          ? photo.path
          : `file://${photo.path}`
        : null;
      if (capturedUri) {
        setFrozenFrameUri(capturedUri);
      }
      logScanStage('IMAGE_CAPTURED', {
        source,
        width: photo.width,
        height: photo.height,
        path: photo.path ? '[file]' : null,
      });
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
      logScanStage('IMAGE_ENCODED', {
        width: manipulated.width,
        height: manipulated.height,
        bytesApprox: Math.round((manipulated.base64?.length ?? 0) * 0.75),
        hasBase64: Boolean(manipulated.base64),
      });
      console.log('Capture timing:', {
        source,
        profile,
        takePhotoMs: photoDoneAt - captureStartedAt,
        manipulateMs: Date.now() - photoDoneAt,
        totalMs: Date.now() - captureStartedAt,
      });
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

    const identifyWithXimilarTcg = async (base64Image: string, magicAi = false): Promise<NormalisedScanResponse> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), magicAi ? 7500 : 5500);
      const startedAt = Date.now();
      logScanStage('API_REQUEST_STARTED', {
        provider: 'ximilar',
        magicAi,
        bytesApprox: Math.round(base64Image.length * 0.75),
      });
      try {
        const response = await fetch(`${PRICE_API_URL}/api/scan/tcg`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64Image, magicAi }),
          signal: controller.signal,
        });
        const responseBody = await response.text();
        let data: NormalisedScanResponse | any = null;
        try {
          data = responseBody ? JSON.parse(responseBody) : null;
        } catch (parseError) {
          data = makeScanError(
            'backend',
            'XIMILAR_INVALID_RESPONSE',
            'The scan service returned an unreadable response.',
            responseBody.slice(0, 2000),
            response.status,
            parseError instanceof Error ? parseError.stack : undefined
          );
        }
        logScanStage('API_RESPONSE_RECEIVED', {
          status: response.status,
          magicAi,
          totalMs: Date.now() - startedAt,
          ok: response.ok,
          responseOk: data?.ok,
          candidates: data?.candidates?.length,
          code: data?.code,
          stage: data?.stage,
          body: SHOW_SCAN_DEBUG ? responseBody.slice(0, 2000) : undefined,
        });

        if (!response.ok || data?.ok === false) {
          return {
            ok: false,
            provider: 'ximilar',
            stage: data?.stage ?? 'backend',
            code: data?.code ?? 'SCAN_API_REQUEST_FAILED',
            message: data?.message ?? 'The scan request failed.',
            details: data?.details ?? responseBody.slice(0, 2000),
            httpStatus: data?.httpStatus ?? response.status,
          };
        }

        if (data?.ok === true && Array.isArray(data.candidates)) {
          return data as NormalisedScanResponse;
        }

        return makeScanError(
          'normalisation',
          'XIMILAR_INVALID_RESPONSE',
          'The scan service response did not include any candidates.',
          responseBody.slice(0, 2000),
          response.status
        );
      } catch (error) {
        const isAbort = error instanceof Error && error.name === 'AbortError';
        const scanError = makeScanError(
          'upload',
          'SCAN_API_REQUEST_FAILED',
          isAbort ? 'The scan request timed out.' : 'The scan request could not be sent.',
          error instanceof Error ? error.message : String(error),
          undefined,
          error instanceof Error ? error.stack : undefined
        );
        logScanStage('API_RESPONSE_RECEIVED', {
          magicAi,
          totalMs: Date.now() - startedAt,
          ok: false,
          code: scanError.code,
          error: scanError.details,
          stack: SHOW_SCAN_DEBUG ? scanError.stack : undefined,
        });
        return scanError;
      } finally {
        clearTimeout(timeout);
      }
    };

    const isGenericXimilarCardName = (name?: string | null) => {
      const normalized = String(name ?? '').trim().toLowerCase();
      return !normalized || normalized === 'card' || normalized === 'tcg card' || normalized === 'trading card';
    };

    const identifyWithRareCandyStyle = async (
      base64Image?: string | null,
      setId?: string | null,
      nameHint?: string | null,
      printedNumberHint?: PrintedNumber | null
    ) => {
      if (!USE_RARE_CANDY_STYLE_SCAN || !base64Image) return null;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), RARE_CANDY_STYLE_TIMEOUT_MS);
      let response: Response;

      try {
        response = await fetch(`${PRICE_API_URL}/api/rare-candy-scan/identify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base64Image,
            setId,
            nameHint,
            printedNumber: printedNumberHint
              ? { number: printedNumberHint.number, total: printedNumberHint.total }
              : null,
          }),
          signal: controller.signal,
        });
      } catch (error) {
        console.log('Rare Candy style scan failed or timed out:', {
          timeoutMs: RARE_CANDY_STYLE_TIMEOUT_MS,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      } finally {
        clearTimeout(timeout);
      }

      const raw = await response.text();
      let data: any = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        console.log('Rare Candy style scan returned non-JSON response:', {
          status: response.status,
          preview: raw.slice(0, 180),
        });
        return null;
      }

      console.log('Rare Candy style scan result:', {
        status: response.status,
        card: data?.match?.name,
        topMatch: data?.topMatch?.name,
        set: data?.match?.set_name ?? data?.topMatch?.set_name,
        similarity: data?.similarity,
        margin: data?.margin,
        confidence: data?.confidence,
        accepted: data?.accepted,
        reasons: data?.candidates?.[0]?.reasons,
        totalMs: data?.totalMs,
      });

      if (!response.ok || !data?.match) return null;
      return {
        match: data.match as ScannedCard,
        candidates: data.candidates ?? [],
        needsVisualRerank: false,
        resolvedBy: 'rare-candy-style',
      };
    };

    const identifyWithLocalAi = async (
      printedNumber?: PrintedNumber | null,
      setId?: string | null,
      base64Image?: string | null,
      nameHint?: string | null
    ) => {
      if (!printedNumber) return null;

      const controller = new AbortController();
      const timeoutMs = base64Image ? LOCAL_AI_VISUAL_TIMEOUT_MS : LOCAL_AI_TIMEOUT_MS;
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;

      try {
        response = await fetch(`${PRICE_API_URL}/api/local-ai/identify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ printedNumber, setId, base64Image, nameHint }),
          signal: controller.signal,
        });
      } catch (error) {
        console.log('Local AI request failed or timed out:', {
          timeoutMs,
          visual: Boolean(base64Image),
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      } finally {
        clearTimeout(timeout);
      }

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
        const totalCandidates = printedNumber?.total
          ? await lookupLocalCardsByPrintedTotal(printedNumber.total, setId)
          : null;
        if (
          !ocrText
          && hasSecretSuffixRisk(printedNumber, candidates, totalCandidates)
        ) {
          const riskyCandidates = totalCandidates
            ?.filter((card) => {
              const cardNumber = Number.parseInt(card.number, 10);
              return Number.isFinite(cardNumber)
                && printedNumber
                && cardNumber > printedNumber.total
                && String(cardNumber).endsWith(String(printedNumber.number));
            })
            .slice(0, 5)
            .map((card) => `${card.name} (${card.set_name}) #${card.number}`);
          console.log('Local index unique match needs name due to suffix risk:', {
            read: `${printedNumber?.number}/${printedNumber?.total}`,
            candidate: `${candidates[0].name} (${candidates[0].set_name})`,
            riskyCandidates,
          });
          return { match: null, candidates, needsVisualRerank: true, resolvedBy: 'local-number-needs-name' };
        }

        if ((hasLongerNumberHint(printedNumber) || isLowConfidenceShortNumber(printedNumber)) && !ocrText) {
          console.log('Local index unique match ignored due to longer OCR number hint:', {
            read: `${printedNumber?.number}/${printedNumber?.total}`,
            candidate: `${candidates[0].name} (${candidates[0].set_name})`,
          });
          return { match: null, candidates, needsVisualRerank: true, resolvedBy: null };
        }

        if (
          ocrText
          && printedNumber?.number != null
          && printedNumber.number < 100
          && isBroadNumberRegion(printedNumber.region)
          && !resolveLocalCardsByName(candidates, ocrText)
        ) {
          console.log('Local index unique match ignored due to name mismatch:', {
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
      if (!isOnDeviceVisualAvailable()) return null;

      const startedAt = Date.now();
      const visualResult = await rerankWithOnDeviceVisual(base64Image, candidates);
      if (visualResult.status !== 'disabled') {
        console.log('On-device visual scan result:', {
          status: visualResult.status,
          reason: visualResult.reason,
          card: visualResult.match?.name,
          set: visualResult.match?.set_name,
          similarity: visualResult.similarity,
          candidates: candidates?.length ?? 0,
          totalMs: Date.now() - startedAt,
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

    const identifyWithScannerPackVisual = async (
      base64Image?: string | null,
      candidates?: LocalScanCard[] | null
    ) => {
      if (!isOnDeviceVisualAvailable()) return null;

      const startedAt = Date.now();
      const embedded = await embedImageOnDevice(base64Image);
      if (embedded.status !== 'ready') {
        if (embedded.status !== 'disabled') {
          console.log('Scanner pack visual search unavailable:', {
            status: embedded.status,
            reason: embedded.reason,
          });
        }
        return null;
      }

      const results = await searchScannerPack(embedded.embedding, {
        limit: 5,
        candidateIds: candidates?.map((candidate) => candidate.id),
      });
      const searchDoneAt = Date.now();

      const best = results[0];
      const second = results[1];
      const margin = best && second ? best.similarity - second.similarity : 1;

      console.log('Scanner pack visual search result:', {
        card: best?.card.name,
        number: best?.card.number,
        set: best?.card.setName,
        similarity: best ? Number(best.similarity.toFixed(4)) : null,
        margin: Number(margin.toFixed(4)),
        candidates: candidates?.length ?? 'all',
        searchMs: searchDoneAt - startedAt,
        totalMs: Date.now() - startedAt,
        top: results.slice(0, 3).map((result) => ({
          card: result.card.name,
          number: result.card.number,
          set: result.card.setName,
          similarity: Number(result.similarity.toFixed(4)),
        })),
      });

      if (!best || best.similarity < 0.7 || margin < 0.02) return null;

      return {
        match: toScannedCard(scannerPackCardToLocalCard(best.card)),
        candidates: results.map((result) => scannerPackCardToLocalCard(result.card)),
        needsVisualRerank: false,
        resolvedBy: 'scanner-pack-visual',
      };
    };

    const identifyWithLocalFusion = async (
      printedNumber?: PrintedNumber | null,
      setId?: string | null,
      nameText?: string | null,
      totalHintText?: string | null
    ) => {
      const fusionResult = await resolveLocalCardByFusion({
        printedNumber,
        nameText,
        totalHintText,
        setId,
      });

      if (!fusionResult) return null;

      console.log('Local fusion scan result:', {
        card: fusionResult.match?.name,
        number: fusionResult.match?.number,
        set: fusionResult.match?.set_name,
        confidence: fusionResult.confidence,
        candidates: fusionResult.candidates.length,
        resolvedBy: fusionResult.resolvedBy,
        reason: fusionResult.reason,
      });

      return {
        match: fusionResult.match ? toScannedCard(fusionResult.match) : null,
        candidates: fusionResult.candidates,
        needsVisualRerank: !fusionResult.match && fusionResult.candidates.length > 1,
        resolvedBy: fusionResult.resolvedBy,
      };
    };

    const lookupParsedCard = async (
      parsed: any,
      fallbackPrintedNumber?: PrintedNumber | null,
      setId?: string | null
    ): Promise<ScannedCard | null> => {
      const parsedForLookup = parsed;
      if (!parsedForLookup || parsedForLookup.error || !parsedForLookup.name) return null;
      if (parsedForLookup.provider === 'ximilar' && isGenericXimilarCardName(parsedForLookup.name)) return null;

      const numberClean = fallbackPrintedNumber?.number != null
        ? String(fallbackPrintedNumber.number)
        : setId
          ? null
          : parsedForLookup.number
            ? String(parsedForLookup.number).split('/')[0].trim().replace(/^0+/, '')
            : null;
      const setTotalClean = fallbackPrintedNumber?.total != null
        ? String(fallbackPrintedNumber.total)
        : setId
          ? null
          : parsedForLookup.printedTotal
            ? String(parsedForLookup.printedTotal)
            : null;
      const { hint: editionHint, source: editionSource } = getEffectiveScanEditionHint(parsedForLookup, selectedBinder?.edition);
      const lookupSetName = stripScanEditionFromSetName(parsedForLookup.setName);

      if (
        fallbackPrintedNumber
        && fallbackPrintedNumber.number < 100
        && isBroadNumberRegion(fallbackPrintedNumber.region)
      ) {
        return null;
      }

      const searchParams = new URLSearchParams({ name: parsedForLookup.name });
      if (numberClean) searchParams.append('number', numberClean);
      if (setTotalClean) searchParams.append('setTotal', setTotalClean);
      if (!setId && lookupSetName) searchParams.append('setName', String(lookupSetName));
      if (!setId && parsedForLookup.setCode) searchParams.append('setId', String(parsedForLookup.setCode));
      if (editionHint) searchParams.append('editionHint', editionHint);
      if (setId) {
        searchParams.append('setId', setId);
        searchParams.append('strictSet', '1');
      }

      const searchRes = await fetch(`${PRICE_API_URL}/api/search/tcg?${searchParams.toString()}`);
      const searchData = await searchRes.json();
      const cards = (searchData.cards ?? []) as ScannedCard[];

      if (cards.length === 0) return null;

      let card = pickCardForEditionHint(cards, editionHint) ?? cards[0];
      const parsedTotal = setTotalClean ? Number(setTotalClean) : null;
      if (parsedTotal) {
        const totalMatches = cards.filter((c) => c.set_printed_total === parsedTotal);
        if (totalMatches.length > 0) card = pickCardForEditionHint(totalMatches, editionHint) ?? totalMatches[0];
      }
      if (numberClean) {
        const numberMatches = cards.filter((c) =>
          String(parseInt(c.number, 10)) === numberClean
          && (!parsedTotal || c.set_printed_total === parsedTotal)
        );
        if (numberMatches.length === 1) {
          card = numberMatches[0];
        } else if (numberMatches.length > 1) {
          if (setId) {
            const setMatches = numberMatches.filter((c) => c.set_id === setId);
            card =
              pickCardForEditionHint(setMatches, editionHint)
              ?? numberMatches.find((c) => c.set_id === setId)
              ?? pickCardForEditionHint(numberMatches, editionHint)
              ?? numberMatches[0];
          } else {
            card = pickCardForEditionHint(numberMatches, editionHint) ?? numberMatches[0];
          }
        }
      }

      return withScannedCardEditionHint(card, editionHint, editionSource);
    };

    const resolveXimilarCandidates = async (
      candidates: ScanCandidate[],
      fallbackPrintedNumber?: PrintedNumber | null,
      setId?: string | null
    ): Promise<ScanCandidate[]> => {
      const resolved: ScanCandidate[] = [];

      for (const candidate of candidates) {
        const candidateWithEdition = withCandidateEditionHint(candidate, selectedBinder?.edition);
        logScanStage('POKEMON_API_LOOKUP_STARTED', {
          name: candidateWithEdition.name,
          number: candidateWithEdition.number,
          setName: candidateWithEdition.setName,
          setCode: candidateWithEdition.setCode,
          editionHint: candidateWithEdition.editionHint,
          editionSource: candidateWithEdition.editionSource,
        });

        try {
          const card = await lookupParsedCard(candidateWithEdition, fallbackPrintedNumber, setId);
          resolved.push({ ...candidateWithEdition, resolvedCard: card });
          logScanStage('POKEMON_API_LOOKUP_COMPLETE', {
            name: candidateWithEdition.name,
            resolved: Boolean(card),
            cardId: card?.id,
            cardName: card?.name,
            editionHint: card?.editionHint ?? candidateWithEdition.editionHint,
          });
        } catch (lookupError) {
          resolved.push({ ...candidateWithEdition, resolvedCard: null });
          logScanStage('POKEMON_API_LOOKUP_COMPLETE', {
            name: candidateWithEdition.name,
            resolved: false,
            code: 'CARD_LOOKUP_FAILED',
            error: lookupError instanceof Error ? lookupError.message : String(lookupError),
            stack: SHOW_SCAN_DEBUG && lookupError instanceof Error ? lookupError.stack : undefined,
          });
        }
      }

      return resolved;
    };

    try {
      // Step 1: capture at fast profile
      const scanWallStartedAt = Date.now();
      const expectedSetId = selectedBinder?.source_set_id ?? null;
      const initialScanProfile =
        !isAuto && isMarketMode && !expectedSetId
          ? MARKET_XIMILAR_SCAN_PROFILE
          : isAuto
            ? FAST_SCAN_PROFILE
            : ACCURACY_SCAN_PROFILE;
      const capture = await captureCardImage(initialScanProfile);
      const base64 = capture.base64;
      if (!base64) {
        const imageError = makeScanError(
          'image',
          'SCAN_IMAGE_READ_FAILED',
          'The camera image did not include readable image data.',
          'ImageManipulator returned an empty base64 payload.'
        );
        logScanStage('API_RESPONSE_RECEIVED', {
          ok: false,
          code: imageError.code,
          stage: imageError.stage,
          details: imageError.details,
        });
        if (!isAuto) setScanError(imageError);
        stopScanningMessages();
        scanCooldownRef.current = false;
        setProcessingOcr(false);
        if (isAuto) setFrozenFrameUri(null);
        return;
      }
      let bestBase64 = base64;
      let bestUri = capture.uri;
      let bestWidth = capture.width;
      let bestHeight = capture.height;
      const scanStartedAt = Date.now();
      const captureDoneAt = Date.now();
      const elapsedScanMs = () => Date.now() - scanStartedAt;
      const hasFastScanBudget = (reserveMs = 0) => !isAuto || elapsedScanMs() + reserveMs < AUTO_SCAN_SOFT_BUDGET_MS;
      const hasHardScanBudget = (reserveMs = 0) => !isAuto || elapsedScanMs() + reserveMs < AUTO_SCAN_HARD_BUDGET_MS;
      const shouldDeferInitialNumberOcr = isMarketMode && !isAuto && !expectedSetId;
      let printedNumber: PrintedNumber | null = null;
      let triedFallbackNumberRegions = false;
      let numberOcrDoneAt = captureDoneAt;
      let attemptedInitialNumberOcr = false;
      const readInitialPrintedNumber = async () => {
        if (attemptedInitialNumberOcr) return printedNumber;
        attemptedInitialNumberOcr = true;
        printedNumber = await readPrintedNumberFromCardImage(bestUri, capture.width, capture.height, {
          fastRegions: PRIMARY_NUMBER_OCR_REGIONS,
          includeFallbackRegions: false,
          includeFullCard: false,
        });
        numberOcrDoneAt = Date.now();
        return printedNumber;
      };

      if (!shouldDeferInitialNumberOcr) {
        await readInitialPrintedNumber();
      }
      let cachedNameText: string | null = null;
      let cachedTotalHintText: string | null = null;
      const getNameText = async (uri: string, width: number, height: number) => {
        if (cachedNameText !== null) return cachedNameText;
        cachedNameText = await readNameTextFromCardImage(uri, width, height, {
          regions: isAuto ? [NAME_OCR_REGIONS[0]] : NAME_OCR_REGIONS,
          resizeWidth: isAuto ? 760 : 1000,
        });
        return cachedNameText;
      };
      const getTotalHintText = async (uri: string, width: number, height: number) => {
        if (cachedTotalHintText !== null) return cachedTotalHintText;
        cachedTotalHintText = await readTotalHintTextFromCardImage(uri, width, height);
        return cachedTotalHintText;
      };
      let match: ScannedCard | null = null;
      let ximilarCandidatesForConfirmation: ScanCandidate[] | null = null;
      let ximilarError: ScanErrorState | null = null;

      if (!isAuto && !expectedSetId && (isMarketMode || selectedBinder)) {
        console.log('[market-scan] primary provider: ximilar');
        const ximilarResponse = await identifyWithXimilarTcg(bestBase64, false);
        if (!ximilarResponse.ok) {
          ximilarError = { ...ximilarResponse, debugDetails: ximilarResponse.details };
          setScanError(ximilarError);
        } else {
          ximilarError = null;
          setScanError(null);
          ximilarCandidatesForConfirmation = await resolveXimilarCandidates(
            ximilarResponse.candidates,
            shouldDeferInitialNumberOcr ? null : printedNumber,
            null
          );
          match = (ximilarCandidatesForConfirmation.find((candidate) => candidate.resolvedCard)?.resolvedCard as ScannedCard | null) ?? null;
        }
        console.log('[market-scan] local resolve after Ximilar', {
          provider: 'ximilar',
          candidates: ximilarCandidatesForConfirmation?.map((candidate) => ({
            name: candidate.name,
            setName: candidate.setName,
            setCode: candidate.setCode,
            number: candidate.number,
            resolved: Boolean(candidate.resolvedCard),
          })).slice(0, 5) ?? null,
          resolved: match ? {
            id: match.id,
            name: match.name,
            set: match.set_name,
            number: match.number,
          } : null,
        });
        if (!match && !ximilarCandidatesForConfirmation?.length) {
          console.log('[market-scan] retrying Ximilar with Magic AI');
          const ximilarMagicResponse = await identifyWithXimilarTcg(bestBase64, true);
          if (!ximilarMagicResponse.ok) {
            ximilarError = { ...ximilarMagicResponse, debugDetails: ximilarMagicResponse.details };
            setScanError(ximilarError);
          } else {
            ximilarError = null;
            setScanError(null);
            ximilarCandidatesForConfirmation = await resolveXimilarCandidates(
              ximilarMagicResponse.candidates,
              shouldDeferInitialNumberOcr ? null : printedNumber,
              null
            );
            match = (ximilarCandidatesForConfirmation.find((candidate) => candidate.resolvedCard)?.resolvedCard as ScannedCard | null) ?? null;
          }
          console.log('[market-scan] local resolve after Magic AI', {
            candidates: ximilarCandidatesForConfirmation?.map((candidate) => ({
              name: candidate.name,
              setName: candidate.setName,
              setCode: candidate.setCode,
              number: candidate.number,
              resolved: Boolean(candidate.resolvedCard),
            })).slice(0, 5) ?? null,
            resolved: match ? {
              id: match.id,
              name: match.name,
              set: match.set_name,
              number: match.number,
            } : null,
          });
        }

        if (!match && !ximilarCandidatesForConfirmation?.length && ximilarError) {
          stopScanningMessages();
          scanCooldownRef.current = false;
          setProcessingOcr(false);
          return;
        }
      }

      if (!match && shouldDeferInitialNumberOcr) {
        await readInitialPrintedNumber();
      }

      // Duplicate frame check
      const sig = `${base64.slice(0, 48)}:${base64.length}`;
      if (isAuto && sig === lastFrameSigRef.current && now - lastFrameTsRef.current < 2200) {
        setLastScanned('Hold steady — same frame');
        logScanDebug('duplicate-frame', {
          sinceLastFrameMs: now - lastFrameTsRef.current,
        });
        resetScanState(500);
        return;
      }
      lastFrameSigRef.current = sig;
      lastFrameTsRef.current = now;

      const useLocalAi = SCAN_PROVIDER === 'local-ai' || SCAN_PROVIDER === 'hybrid';
      const useGibl = SCAN_PROVIDER === 'gibl-only' || SCAN_PROVIDER === 'hybrid';
      const useLegacy = SCAN_PROVIDER === 'legacy' || SCAN_PROVIDER === 'hybrid';
      const allowRemoteResolvers = false;

      if (!printedNumber && useLocalAi && expectedSetId && hasHardScanBudget(1800)) {
        triedFallbackNumberRegions = true;
        const fallbackPrintedNumber = await readPrintedNumberFromCardImage(bestUri, capture.width, capture.height, {
          includeFastRegions: false,
          fallbackRegions: SECONDARY_NUMBER_OCR_REGIONS,
          includeFullCard: false,
        });

        if (fallbackPrintedNumber) {
          printedNumber = fallbackPrintedNumber;
        }
      }

      if (isAuto && useLocalAi && !printedNumber && !expectedSetId) {
        console.log('Scan timing:', {
          captureMs: captureDoneAt - scanStartedAt,
          numberOcrMs: Date.now() - captureDoneAt,
          skipped: 'auto-no-number',
          totalMs: Date.now() - scanStartedAt,
        });
        stopScanningMessages();
        scanCooldownRef.current = false;
        setProcessingOcr(false);
        setFrozenFrameUri(null);
        return;
      }

      // Step 2: official binders can resolve instantly from the printed card number.
      if (!match) {
        match = await lookupCardBySetNumber(expectedSetId, printedNumber);
      }

      // Step 3: local OCR resolver. This is the exact-match layer of the YOLO + CLIP + OCR pipeline.
      if (!match && useLocalAi && printedNumber) {
        let localResult = await identifyWithLocalFusion(printedNumber, expectedSetId);
        if (
          !localResult?.match
          && hasFastScanBudget(1400)
          && (
            !printedNumber
            || isBroadNumberRegion(printedNumber.region)
            || hasLongerNumberHint(printedNumber)
            || isLowConfidenceShortNumber(printedNumber)
            || localResult?.needsVisualRerank
          )
        ) {
          const nameText = await getNameText(bestUri, capture.width, capture.height);
          localResult = await identifyWithLocalFusion(
            printedNumber,
            expectedSetId,
            nameText
          );
        }

        let localIndexResult = await identifyWithLocalIndex(printedNumber, expectedSetId);
        const totalCandidates = shouldUsePrintedTotalVisualPool(printedNumber, localIndexResult)
          ? await lookupLocalCardsByPrintedTotal(printedNumber?.total, expectedSetId)
          : null;
        const visualCandidates = totalCandidates?.length
          ? totalCandidates
          : localIndexResult?.candidates?.length
          ? localIndexResult.candidates
          : null;
        const onDeviceVisualResult = localIndexResult?.match || !hasFastScanBudget(900)
          ? null
          : await identifyWithOnDeviceVisual(bestBase64, visualCandidates);
        const localIndexNeedsNameEvidence = localIndexResult?.resolvedBy === 'local-number-needs-name';
        localResult = localIndexResult?.match
          ? localIndexResult
          : localResult?.match && !localIndexNeedsNameEvidence
          ? localResult
          : onDeviceVisualResult?.match
            ? onDeviceVisualResult
            : localIndexResult?.needsVisualRerank
              ? localIndexResult
              : allowRemoteResolvers && hasHardScanBudget(LOCAL_AI_TIMEOUT_MS)
                ? await identifyWithLocalAi(printedNumber, expectedSetId)
                : localResult;
        const firstLocalDoneAt = Date.now();
        if (shouldTryNameTotalFallback(printedNumber, localIndexResult, localResult)) {
          const nameText = await getNameText(bestUri, capture.width, capture.height);
          const nameOcrDoneAt = Date.now();
          if (nameText) {
            printedNumber = {
              ...printedNumber,
              ocrText: `${printedNumber.ocrText ?? ''}\n${nameText}`.trim(),
            };
            const nameTotalMatch = await lookupLocalCardByNameTotalAndNumberHint(
              printedNumber.total,
              printedNumber.ocrText,
              printedNumber,
              expectedSetId
            );
            if (nameTotalMatch) {
              localResult = {
                match: toScannedCard(nameTotalMatch),
                candidates: [nameTotalMatch],
                needsVisualRerank: false,
                resolvedBy: 'local-name-total',
              };
            }
            if (!localResult?.match) {
              localIndexResult = await identifyWithLocalIndex(printedNumber, expectedSetId, printedNumber.ocrText);
              const totalCandidatesAfterName = shouldUsePrintedTotalVisualPool(printedNumber, localIndexResult)
                ? await lookupLocalCardsByPrintedTotal(printedNumber.total, expectedSetId)
                : null;
              const visualCandidatesAfterName = totalCandidatesAfterName?.length
                ? totalCandidatesAfterName
                : localIndexResult?.candidates?.length
                ? localIndexResult.candidates
                : null;
              const onDeviceVisualResultAfterName = localIndexResult?.match || !hasFastScanBudget(900)
                ? null
                : await identifyWithOnDeviceVisual(bestBase64, visualCandidatesAfterName);
              localResult = localIndexResult?.match
                ? localIndexResult
                : onDeviceVisualResultAfterName?.match
                  ? onDeviceVisualResultAfterName
                  : allowRemoteResolvers && hasHardScanBudget(LOCAL_AI_TIMEOUT_MS)
                    ? await identifyWithLocalAi(printedNumber, expectedSetId)
                    : localResult;
            }
            if (!localResult?.match && localResult?.needsVisualRerank && allowRemoteResolvers && hasHardScanBudget(LOCAL_AI_VISUAL_TIMEOUT_MS)) {
              localResult = await identifyWithLocalAi(printedNumber, expectedSetId, bestBase64);
            }
            console.log('Scan timing:', {
              captureMs: captureDoneAt - scanStartedAt,
              numberOcrMs: numberOcrDoneAt - captureDoneAt,
              numberRegion: printedNumber.region,
              numberRegionOcrMs: printedNumber.ocrMs,
              firstResolveMs: firstLocalDoneAt - numberOcrDoneAt,
              nameOcrMs: nameOcrDoneAt - firstLocalDoneAt,
              secondResolveMs: Date.now() - nameOcrDoneAt,
              totalMs: Date.now() - scanStartedAt,
            });
          } else {
            console.log('Scan timing:', {
              captureMs: captureDoneAt - scanStartedAt,
              numberOcrMs: numberOcrDoneAt - captureDoneAt,
              numberRegion: printedNumber.region,
              numberRegionOcrMs: printedNumber.ocrMs,
              firstResolveMs: firstLocalDoneAt - numberOcrDoneAt,
              nameOcrMs: nameOcrDoneAt - firstLocalDoneAt,
              totalMs: Date.now() - scanStartedAt,
            });
          }
        } else {
          const timingPrintedNumber = printedNumber as PrintedNumber | null;
          console.log('Scan timing:', {
            captureMs: captureDoneAt - scanStartedAt,
            numberOcrMs: numberOcrDoneAt - captureDoneAt,
            numberRegion: timingPrintedNumber?.region,
            numberRegionOcrMs: timingPrintedNumber?.ocrMs,
            firstResolveMs: firstLocalDoneAt - numberOcrDoneAt,
            totalMs: Date.now() - scanStartedAt,
          });
        }
        match = localResult?.match ?? null;
      }

      if (!match && useLocalAi && printedNumber && hasHardScanBudget(1300)) {
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
          const totalCandidates = shouldUsePrintedTotalVisualPool(printedNumber, localIndexResult)
            ? await lookupLocalCardsByPrintedTotal(printedNumber.total, expectedSetId)
            : null;
          const visualCandidates = totalCandidates?.length
            ? totalCandidates
            : localIndexResult?.candidates?.length
            ? localIndexResult.candidates
            : null;
          const onDeviceVisualResult = localIndexResult?.match || !hasFastScanBudget(900)
            ? null
            : await identifyWithOnDeviceVisual(bestBase64, visualCandidates);
          let localResult = localIndexResult?.match
            ? localIndexResult
            : onDeviceVisualResult?.match
              ? onDeviceVisualResult
              : localIndexResult?.needsVisualRerank
                ? localIndexResult
                : allowRemoteResolvers && hasHardScanBudget(LOCAL_AI_TIMEOUT_MS)
                  ? await identifyWithLocalAi(printedNumber, expectedSetId)
                  : localIndexResult;
        if (shouldTryNameTotalFallback(printedNumber, localIndexResult, localResult) && hasHardScanBudget(1200)) {
          const nameText = await getNameText(bestUri, capture.width, capture.height);
          if (nameText) {
              printedNumber = {
                ...printedNumber,
                ocrText: `${printedNumber.ocrText ?? ''}\n${nameText}`.trim(),
              };
              if (
                printedNumber.number < 100
                && isBroadNumberRegion(printedNumber.region)
              ) {
                const nameTotalMatch = await lookupLocalCardByNameTotalAndNumberHint(
                  printedNumber.total,
                  printedNumber.ocrText,
                  printedNumber,
                  expectedSetId
                );
                if (nameTotalMatch) {
                  localResult = {
                    match: toScannedCard(nameTotalMatch),
                    candidates: [nameTotalMatch],
                    needsVisualRerank: false,
                    resolvedBy: 'local-name-total',
                  };
                }
              }
              if (!localResult?.match) {
                localIndexResult = await identifyWithLocalIndex(printedNumber, expectedSetId, printedNumber.ocrText);
                const totalCandidatesAfterName = shouldUsePrintedTotalVisualPool(printedNumber, localIndexResult)
                  ? await lookupLocalCardsByPrintedTotal(printedNumber.total, expectedSetId)
                  : null;
                const visualCandidatesAfterName = totalCandidatesAfterName?.length
                  ? totalCandidatesAfterName
                  : localIndexResult?.candidates?.length
                  ? localIndexResult.candidates
                  : null;
                const onDeviceVisualResultAfterName = localIndexResult?.match || !hasFastScanBudget(900)
                  ? null
                  : await identifyWithOnDeviceVisual(bestBase64, visualCandidatesAfterName);
                localResult = localIndexResult?.match
                  ? localIndexResult
                  : onDeviceVisualResultAfterName?.match
                    ? onDeviceVisualResultAfterName
                    : allowRemoteResolvers && hasHardScanBudget(LOCAL_AI_TIMEOUT_MS)
                      ? await identifyWithLocalAi(printedNumber, expectedSetId)
                      : localResult;
              }
            }
          }
          match = localResult?.match ?? null;
          console.log('Scan timing:', {
            captureMs: captureDoneAt - scanStartedAt,
            numberOcrMs: numberOcrDoneAt - captureDoneAt,
            numberRegion: printedNumber.region,
            numberRegionOcrMs: printedNumber.ocrMs,
            nameOcrMs: Date.now() - numberOcrDoneAt,
            totalMs: Date.now() - scanStartedAt,
          });
        }
      }

      if (!match && useLocalAi && !printedNumber && !triedFallbackNumberRegions && expectedSetId && hasHardScanBudget(1300)) {
        triedFallbackNumberRegions = true;
        const fallbackPrintedNumber = await readPrintedNumberFromCardImage(bestUri, capture.width, capture.height, {
          includeFastRegions: false,
          includeFullCard: false,
        });

        if (fallbackPrintedNumber) {
          printedNumber = fallbackPrintedNumber;
          let localIndexResult = await identifyWithLocalIndex(printedNumber, expectedSetId);
          let localResult = localIndexResult?.match
            ? localIndexResult
            : localIndexResult?.needsVisualRerank
              ? localIndexResult
              : await identifyWithLocalFusion(printedNumber, expectedSetId);

          if (shouldTryNameTotalFallback(printedNumber, localIndexResult, localResult) && hasHardScanBudget(1200)) {
            const nameText = await getNameText(bestUri, capture.width, capture.height);
            if (nameText) {
              printedNumber = {
                ...printedNumber,
                ocrText: `${printedNumber.ocrText ?? ''}\n${nameText}`.trim(),
              };
              localIndexResult = await identifyWithLocalIndex(printedNumber, expectedSetId, printedNumber.ocrText);
              localResult = localIndexResult?.match
                ? localIndexResult
                : await identifyWithLocalFusion(printedNumber, expectedSetId, nameText);
            }
          }

          match = localResult?.match ?? null;
        }
      }

      if (!match && useLocalAi && !printedNumber && hasHardScanBudget(1600)) {
        const nameText = await getNameText(bestUri, capture.width, capture.height);
        let totalHintText = '';
        let totalHintPrintedNumber: PrintedNumber | null = null;
        let inferredTotal: number | null = null;
        let totalNameCandidates: LocalScanCard[] | null = null;
        let fusionResult = await identifyWithLocalFusion(null, expectedSetId, nameText);
        const nameCandidates = await lookupLocalCardsByNameText(nameText, expectedSetId);
        if (!fusionResult?.match && hasHardScanBudget(900)) {
          totalHintText = await getTotalHintText(bestUri, capture.width, capture.height);
          const combinedNameAndTotalText = `${nameText}\n${totalHintText}`.trim();
          totalHintPrintedNumber = parsePrintedNumberSignalFromText(totalHintText);
          inferredTotal = inferPrintedTotalFromText(combinedNameAndTotalText);
          totalNameCandidates = inferredTotal && nameCandidates?.length
            ? nameCandidates.filter((candidate) => candidate.set_printed_total === inferredTotal)
            : null;
          fusionResult = await identifyWithLocalFusion(totalHintPrintedNumber, expectedSetId, nameText, totalHintText);
        }
        const setCandidates = totalNameCandidates?.length
          ? totalNameCandidates
          : nameCandidates?.length
          ? nameCandidates
          : await lookupLocalCardsBySet(expectedSetId);

        console.log('No-number scan fallback:', {
          hasNameText: Boolean(nameText),
          totalHintNumber: totalHintPrintedNumber
            ? `${totalHintPrintedNumber.number}/${totalHintPrintedNumber.total}`
            : null,
          inferredTotal,
          nameCandidates: nameCandidates?.length ?? 0,
          totalNameCandidates: totalNameCandidates?.length ?? 0,
          setCandidates: setCandidates?.length ?? 0,
          expectedSetId,
        });

        if (fusionResult?.match) {
          match = fusionResult.match;
        } else if (totalNameCandidates?.length === 1 || nameCandidates?.length === 1) {
          const selected = totalNameCandidates?.length === 1 ? totalNameCandidates[0] : nameCandidates![0];
          match = toScannedCard(selected);
          console.log('Local index scan result:', {
            card: match.name,
            number: match.number,
            set: match.set_name,
            candidates: 1,
            resolvedBy: totalNameCandidates?.length === 1 ? 'local-name-total-no-number' : 'local-name-no-number',
          });
        } else {
          const rareCandyWithName = hasHardScanBudget(1200)
            ? await identifyWithRareCandyStyle(bestBase64, expectedSetId, nameText, totalHintPrintedNumber)
            : null;
          const visualResult = rareCandyWithName?.match
            ? rareCandyWithName
            : hasHardScanBudget(1600)
            ? await identifyWithScannerPackVisual(bestBase64, setCandidates)
            : null;
          match = visualResult?.match ?? null;
        }
      }

      if (!match && useLocalAi && !printedNumber && !isAuto) {
        const hqCapture = await captureCardImage(ACCURACY_SCAN_PROFILE);
        bestBase64 = hqCapture.base64;
        bestUri = hqCapture.uri;
        bestWidth = hqCapture.width;
        bestHeight = hqCapture.height;
        printedNumber = await readPrintedNumberFromCardImage(bestUri, hqCapture.width, hqCapture.height);
        let localIndexResult = await identifyWithLocalIndex(printedNumber, expectedSetId);
        const totalCandidates = shouldUsePrintedTotalVisualPool(printedNumber, localIndexResult)
          ? await lookupLocalCardsByPrintedTotal(printedNumber?.total, expectedSetId)
          : null;
        const visualCandidates = totalCandidates?.length
          ? totalCandidates
          : localIndexResult?.candidates?.length
          ? localIndexResult.candidates
          : null;
        const onDeviceVisualResult = localIndexResult?.match || !hasFastScanBudget(900)
          ? null
          : await identifyWithOnDeviceVisual(bestBase64, visualCandidates);
        let localResult = localIndexResult?.match
          ? localIndexResult
          : onDeviceVisualResult?.match
            ? onDeviceVisualResult
            : localIndexResult?.needsVisualRerank
              ? localIndexResult
              : allowRemoteResolvers && hasHardScanBudget(LOCAL_AI_TIMEOUT_MS)
                ? await identifyWithLocalAi(printedNumber, expectedSetId)
                : localIndexResult;
        if (shouldTryNameTotalFallback(printedNumber, localIndexResult, localResult) && hasHardScanBudget(1200)) {
          const nameText = await readNameTextFromCardImage(bestUri, hqCapture.width, hqCapture.height);
          if (nameText) {
            printedNumber = {
              ...printedNumber,
              ocrText: `${printedNumber.ocrText ?? ''}\n${nameText}`.trim(),
            };
            if (
              printedNumber.number < 100
              && isBroadNumberRegion(printedNumber.region)
            ) {
              const nameTotalMatch = await lookupLocalCardByNameTotalAndNumberHint(
                printedNumber.total,
                printedNumber.ocrText,
                printedNumber,
                expectedSetId
              );
              if (nameTotalMatch) {
                localResult = {
                  match: toScannedCard(nameTotalMatch),
                  candidates: [nameTotalMatch],
                  needsVisualRerank: false,
                  resolvedBy: 'local-name-total',
                };
              }
            }
            if (!localResult?.match) {
              localIndexResult = await identifyWithLocalIndex(printedNumber, expectedSetId, printedNumber.ocrText);
              const totalCandidatesAfterName = shouldUsePrintedTotalVisualPool(printedNumber, localIndexResult)
                ? await lookupLocalCardsByPrintedTotal(printedNumber.total, expectedSetId)
                : null;
              const visualCandidatesAfterName = totalCandidatesAfterName?.length
                ? totalCandidatesAfterName
                : localIndexResult?.candidates?.length
                ? localIndexResult.candidates
                : null;
              const onDeviceVisualResultAfterName = localIndexResult?.match || !hasFastScanBudget(900)
                ? null
                : await identifyWithOnDeviceVisual(bestBase64, visualCandidatesAfterName);
              localResult = localIndexResult?.match
                ? localIndexResult
                : onDeviceVisualResultAfterName?.match
                  ? onDeviceVisualResultAfterName
                  : allowRemoteResolvers && hasHardScanBudget(LOCAL_AI_TIMEOUT_MS)
                    ? await identifyWithLocalAi(printedNumber, expectedSetId)
                    : localResult;
            }
            if (!localResult?.match && localResult?.needsVisualRerank && allowRemoteResolvers && hasHardScanBudget(LOCAL_AI_VISUAL_TIMEOUT_MS)) {
              localResult = await identifyWithLocalAi(printedNumber, expectedSetId, bestBase64);
            }
          }
        }
        match = localResult?.match ?? null;
      }

      // Step 4: test GiblTCG as an external image-recognition provider.
      if (!match && useGibl && allowRemoteResolvers && hasHardScanBudget(3500)) {
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
      if (!match && expectedSetId && useLegacy && !isAuto) {
        const hqCapture = await captureCardImage(ACCURACY_SCAN_PROFILE);
        bestBase64 = hqCapture.base64;
        bestUri = hqCapture.uri;
        bestWidth = hqCapture.width;
        bestHeight = hqCapture.height;
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
            const ximilarFallbackResponse = await identifyWithXimilarTcg(bestBase64, false);
            if (ximilarFallbackResponse.ok) {
              ximilarCandidatesForConfirmation = await resolveXimilarCandidates(
                ximilarFallbackResponse.candidates,
                printedNumber,
                expectedSetId
              );
              match = (ximilarCandidatesForConfirmation.find((candidate) => candidate.resolvedCard)?.resolvedCard as ScannedCard | null) ?? null;
              if (!match && ximilarCandidatesForConfirmation.length) {
                stopScanningMessages();
                setProcessingOcr(false);
                setPendingConfirmation({
                  candidates: ximilarCandidatesForConfirmation,
                  base64: bestBase64,
                  isMarket: isMarketMode,
                });
                return;
              }
            } else {
              setScanError({ ...ximilarFallbackResponse, debugDetails: ximilarFallbackResponse.details });
              stopScanningMessages();
              scanCooldownRef.current = false;
              setProcessingOcr(false);
              return;
            }
          }

          if (!match) {
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
        }

        if (!match && (!useLegacy || isAuto)) {
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
          bestWidth = hqCapture.width;
          bestHeight = hqCapture.height;
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
      if (!match && ximilarCandidatesForConfirmation?.length) {
        stopScanningMessages();
        setProcessingOcr(false);
        setPendingConfirmation({
          candidates: ximilarCandidatesForConfirmation,
          base64: bestBase64,
          isMarket: isMarketMode,
        });
        return;
      }

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
        setFrozenFrameUri(null);
        return;
      }

      match = await resolveCardInExpectedSet(match, expectedSetId, printedNumber);
      const binderEditionHint = normalizeScanEditionHint(selectedBinder?.edition);
      match = withScannedCardEditionHint(
        match,
        binderEditionHint ?? match.editionHint ?? null,
        binderEditionHint ? 'binder' : match.editionSource
      );
      console.log('Scan completed:', {
        card: match.name,
        number: match.number,
        set: match.set_name,
        editionHint: match.editionHint,
        printedNumber: printedNumber ? `${printedNumber.number}/${printedNumber.total}` : null,
        numberRegion: printedNumber?.region,
        numberRegionOcrMs: printedNumber?.ocrMs,
        totalMs: Date.now() - scanStartedAt,
        wallMs: Date.now() - scanWallStartedAt,
        mode: isAuto ? 'auto' : 'manual',
      });

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
      setPendingConfirmation({
        card: match,
        candidates: ximilarCandidatesForConfirmation ?? undefined,
        base64: bestBase64,
        isMarket: isMarketMode,
        editionChoiceRequired: false,
      });

    } catch (error: any) {
      const isAbort = error?.name === 'AbortError';
      const errorMessage = error?.message ?? String(error);
      const isImageError = /camera|image|photo|snapshot|manipulat|base64/i.test(errorMessage);
      const nextError = makeScanError(
        isAbort ? 'upload' : isImageError ? 'image' : 'render',
        isAbort ? 'SCAN_API_REQUEST_FAILED' : isImageError ? 'SCAN_IMAGE_READ_FAILED' : 'SCAN_RESULT_RENDER_FAILED',
        isAbort ? 'Scan timed out. Try again with better lighting.' : 'Something went wrong while completing the scan.',
        errorMessage,
        undefined,
        error?.stack
      );
      logScanStage('API_RESPONSE_RECEIVED', {
        ok: false,
        code: nextError.code,
        stage: nextError.stage,
        message: nextError.message,
        details: nextError.details,
        stack: SHOW_SCAN_DEBUG ? nextError.stack : undefined,
      });
      if (!isAuto) setScanError(nextError);
      stopScanningMessages();
      scanCooldownRef.current = false;
      setProcessingOcr(false);
      setLastScanned(null);
      if (isAuto) setFrozenFrameUri(null);
    }
  }, [fingerprintScan, isMarketMode, logScanDebug, lookupCardBySetNumber, processingOcr, resetScanState, resolveCardInExpectedSet, selectedBinder, startScanningMessages, stopScanningMessages]);

  useEffect(() => {
    handleCaptureRef.current = handleCapture;
  }, [handleCapture]);

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

  const confirmPendingCard = useCallback(async (cardOverride?: ScannedCard | null) => {
    if (!pendingConfirmation) return;
    const { base64, isMarket } = pendingConfirmation;
    const card = cardOverride
      ?? pendingConfirmation.card
      ?? (pendingConfirmation.candidates?.find((candidate) => candidate.resolvedCard)?.resolvedCard as ScannedCard | null | undefined);
    if (!card) {
      setScanError(makeScanError(
        'card_lookup',
        'CARD_LOOKUP_FAILED',
        'This candidate could not be matched to a card in the database yet.',
        JSON.stringify(pendingConfirmation.candidates ?? []).slice(0, 2000)
      ));
      return;
    }
    setPendingConfirmation(null);
    scanCooldownRef.current = false;
    saveTrainingData(card.id, base64);

    if (isInventoryMode) {
      scanStore.triggerCallback(base64);
      setAutoScanActive(false);
      setFrozenFrameUri(null);
      router.back();
      return;
    }

    if (isMarket) {
      setAutoScanActive(false);
      setFrozenFrameUri(null);
      router.replace({ pathname: '/scan/result', params: { cardsJson: JSON.stringify([card]) } });
      return;
    }

    scannedCardIdsRef.current.add(card.id);
    setScannedCards((prev) => [...prev, card]);
    setLastScanned(`✅ ${card.name} #${card.number} added!`);
    setFrozenFrameUri(null);
    Vibration.vibrate([0, 90, 40, 90]);
  }, [isInventoryMode, pendingConfirmation, saveTrainingData]);

  const handleConfirm = useCallback(() => {
    confirmPendingCard();
  }, [confirmPendingCard]);

  const handleSelectEditionChoice = useCallback((editionHint: ScanEditionHint) => {
    if (!pendingConfirmation?.card) return;

    const card = withScannedCardEditionHint(pendingConfirmation.card, editionHint, 'resolver');
    const candidates = pendingConfirmation.candidates?.map((candidate) => {
      const resolvedCard = candidate.resolvedCard as ScannedCard | null | undefined;
      if (resolvedCard?.id !== card.id) return candidate;
      return {
        ...candidate,
        editionHint,
        editionSource: 'resolver' as const,
        resolvedCard: card,
      };
    });

    setPendingConfirmation((current) => current ? {
      ...current,
      card,
      candidates,
      editionChoiceRequired: false,
    } : current);

    confirmPendingCard(card);
  }, [confirmPendingCard, pendingConfirmation]);

  const handleReject = useCallback(() => {
    setPendingConfirmation(null);
    scanCooldownRef.current = false;
    setFrozenFrameUri(null);
    setLastScanned(null);
  }, []);

  const handleSearchManually = useCallback(() => {
    setPendingConfirmation(null);
    setScanError(null);
    setAutoScanActive(false);
    setFrozenFrameUri(null);
    scanCooldownRef.current = false;
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/market' as any);
    }
  }, []);

  const shareDebugDetails = useCallback(async (details: string) => {
    try {
      await Share.share({ message: details });
    } catch (error) {
      console.log('Copy/share debug details failed:', error);
    }
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
                      <EditionAwareCardImage
                        uri={item.image_small}
                        cardId={item.id}
                        rawData={item.raw_data}
                        editionHint={item.editionHint}
                        sourceSize="small"
                        style={{ width: 50, height: 70, borderRadius: 6 }}
                        resizeMode="contain"
                      />
                    ) : (
                      <View style={{ width: 50, height: 70, borderRadius: 6, backgroundColor: theme.colors.surface }} />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 14 }} numberOfLines={1}>{item.name}</Text>
                      <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 2 }}>
                        {formatScanCardSubtitle(item.set_name, item.number, item.editionHint)}
                      </Text>
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
        video={true}
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

      {frozenFrameUri && step === 'scanning' && (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <Image
            source={{ uri: frozenFrameUri }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
        </View>
      )}

      <SafeAreaView style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }}>
          <TouchableOpacity
            onPress={closeScanner}
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
                onPress={() => { setAutoScanActive(false); setFrozenFrameUri(null); setStep('review'); }}
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
                onPress={() => { setScanMode('manual'); setAutoScanActive(false); setFrozenFrameUri(null); }}
                style={{ paddingHorizontal: 20, paddingVertical: 8, borderRadius: 999, backgroundColor: scanMode === 'manual' ? '#FFFFFF' : 'transparent' }}
              >
                <Text style={{ color: scanMode === 'manual' ? '#000000' : 'rgba(255,255,255,0.7)', fontWeight: '900', fontSize: 13 }}>Manual</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setScanMode('auto'); setFrozenFrameUri(null); }}
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
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-start', paddingTop: isCompactScanner ? 18 : 34 }}>
          <View style={{
            width: scannerFrameWidth, height: scannerFrameHeight,
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
            <View style={{ marginTop: 18, backgroundColor: lastScanned.startsWith('✅') || lastScanned.startsWith('👉') ? 'rgba(16,185,129,0.9)' : 'rgba(245,158,11,0.9)', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 }}>
              <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 14, textAlign: 'center' }}>{lastScanned}</Text>
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 28, width: '100%', maxWidth: scannerFrameWidth + 72, marginTop: 18 }}>
            {['Good lighting', 'Card flat', 'Name + number visible'].map((tip) => (
              <View key={tip} style={{ flex: 1, minHeight: 34, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10, paddingVertical: 7, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' }}>
                <Text style={{ color: 'rgba(255,255,255,0.84)', fontSize: 10, fontWeight: '800', textAlign: 'center', lineHeight: 12 }}>{tip}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Confirmation overlay */}
        {pendingConfirmation?.card && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 16 }}>
              {pendingConfirmation.editionChoiceRequired ? 'Card found - choose the edition' : 'Is this the right card?'}
            </Text>
            {pendingConfirmation.card?.image_small ? (
              <EditionAwareCardImage
                uri={pendingConfirmation.card.image_large ?? pendingConfirmation.card.image_small}
                cardId={pendingConfirmation.card.id}
                rawData={pendingConfirmation.card.raw_data}
                editionHint={pendingConfirmation.card.editionHint ?? pendingConfirmation.candidates?.[0]?.editionHint}
                sourceSize="large"
                style={{ width: 160, height: 224, borderRadius: 10, marginBottom: 16 }}
                resizeMode="contain"
              />
            ) : null}
            <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '900', textAlign: 'center', marginBottom: 4 }}>
              {pendingConfirmation.card?.name ?? pendingConfirmation.candidates?.[0]?.name ?? 'Unknown card'}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 32 }}>
              {formatScanCardSubtitle(
                pendingConfirmation.card.set_name,
                pendingConfirmation.card.number,
                pendingConfirmation.card.editionHint ?? pendingConfirmation.candidates?.[0]?.editionHint
              )}
            </Text>
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

        {pendingConfirmation && !pendingConfirmation.card && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 16 }}>Is this the right card?</Text>
            <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '900', textAlign: 'center', marginBottom: 4 }}>
              {pendingConfirmation.candidates?.[0]?.name ?? 'Unknown card'}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 10, textAlign: 'center' }}>
              {formatScanCardSubtitle(
                pendingConfirmation.candidates?.[0]?.setName ?? 'Set unknown',
                pendingConfirmation.candidates?.[0]?.number,
                pendingConfirmation.candidates?.[0]?.editionHint
              )}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13, marginBottom: 20, textAlign: 'center', maxWidth: 280 }}>
              Details unavailable - search manually or confirm later.
            </Text>
            {(pendingConfirmation.candidates?.length ?? 0) > 1 && (
              <View style={{ width: '100%', maxWidth: 360, gap: 8, marginBottom: 20 }}>
                {pendingConfirmation.candidates?.slice(0, 4).map((candidate, index) => {
                  const candidateCard = candidate.resolvedCard as ScannedCard | null | undefined;
                  return (
                    <TouchableOpacity
                      key={`${candidate.name}-${candidate.number ?? index}-${candidate.setCode ?? candidate.setName ?? 'unknown'}`}
                      onPress={() => {
                        if (candidateCard) {
                          setPendingConfirmation((current) => current ? { ...current, card: candidateCard } : current);
                        }
                      }}
                      style={{
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: candidateCard ? 'rgba(16,185,129,0.65)' : 'rgba(255,255,255,0.18)',
                        backgroundColor: candidateCard ? 'rgba(16,185,129,0.14)' : 'rgba(255,255,255,0.08)',
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                      }}
                    >
                      <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '900' }} numberOfLines={1}>
                        {candidateCard?.name ?? candidate.name}
                      </Text>
                      <Text style={{ color: 'rgba(255,255,255,0.62)', fontSize: 11, fontWeight: '700', marginTop: 2 }} numberOfLines={1}>
                        {candidateCard
                          ? formatScanCardSubtitle(candidateCard.set_name, candidateCard.number, candidateCard.editionHint ?? candidate.editionHint)
                          : formatScanCardSubtitle(candidate.setName ?? 'Details unavailable', candidate.number, candidate.editionHint)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            {pendingConfirmation.editionChoiceRequired ? (
              <View style={{ width: '100%', maxWidth: 340, gap: 12 }}>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity onPress={() => handleSelectEditionChoice('unlimited')} style={{ flex: 1, backgroundColor: '#2563EB', borderRadius: 14, paddingVertical: 15, alignItems: 'center' }}>
                    <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 15 }}>Unlimited</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleSelectEditionChoice('1st_edition')} style={{ flex: 1, backgroundColor: '#7C3AED', borderRadius: 14, paddingVertical: 15, alignItems: 'center' }}>
                    <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 15 }}>1st Edition</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={handleReject} style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}>
                  <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 15 }}>Wrong card</Text>
                </TouchableOpacity>
              </View>
            ) : (
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <TouchableOpacity onPress={handleReject} style={{ flex: 1, backgroundColor: '#EF4444', borderRadius: 14, paddingVertical: 16, alignItems: 'center' }}>
                <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 16 }}>Wrong</Text>
              </TouchableOpacity>
              {pendingConfirmation.candidates?.some((candidate) => candidate.resolvedCard) ? (
                <TouchableOpacity onPress={handleConfirm} style={{ flex: 1, backgroundColor: '#10B981', borderRadius: 14, paddingVertical: 16, alignItems: 'center' }}>
                  <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 16 }}>Correct</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={handleSearchManually} style={{ flex: 1, backgroundColor: '#2563EB', borderRadius: 14, paddingVertical: 16, alignItems: 'center' }}>
                  <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 16 }}>Search</Text>
                </TouchableOpacity>
              )}
            </View>
            )}
          </View>
        )}

        {scanError && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '900', textAlign: 'center', marginBottom: 10 }}>Scan couldn&apos;t be completed</Text>
            <Text style={{ color: 'rgba(255,255,255,0.76)', fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 330, marginBottom: 12 }}>
              {stageMessage(scanError.stage)}
            </Text>
            {(SHOW_SCAN_DEBUG || scanError.code) && (
              <Text style={{ color: 'rgba(255,255,255,0.64)', fontSize: 12, fontWeight: '800', textAlign: 'center', marginBottom: 20 }}>
                Error code: {scanError.code}
              </Text>
            )}
            <View style={{ width: '100%', maxWidth: 330, gap: 10 }}>
              <TouchableOpacity
                onPress={() => {
                  setScanError(null);
                  setFrozenFrameUri(null);
                  scanCooldownRef.current = false;
                  setProcessingOcr(false);
                }}
                style={{ backgroundColor: theme.colors.primary, borderRadius: 14, paddingVertical: 15, alignItems: 'center' }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 16 }}>Retry Scan</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSearchManually} style={{ backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 14, paddingVertical: 15, alignItems: 'center' }}>
                <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 16 }}>Search Manually</Text>
              </TouchableOpacity>
              {SHOW_SCAN_DEBUG && (
                <TouchableOpacity
                  onPress={() => shareDebugDetails(JSON.stringify(scanError, null, 2))}
                  style={{ borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', borderRadius: 14, paddingVertical: 13, alignItems: 'center' }}
                >
                  <Text style={{ color: 'rgba(255,255,255,0.86)', fontWeight: '900', fontSize: 14 }}>Copy Debug Details</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Bottom controls */}
        <View style={{ alignItems: 'center', paddingBottom: Math.max(12, insets.bottom * 0.25), gap: isCompactScanner ? 16 : 18 }}>
          {scannedCards.length > 0 && (
            <TouchableOpacity
              onPress={() => { setAutoScanActive(false); setFrozenFrameUri(null); setStep('review'); }}
              style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 6, alignItems: 'center' }}
            >
              {scannedCards.slice(-5).map((card) => (
                <EditionAwareCardImage
                  key={card.id}
                  uri={card.image_small}
                  cardId={card.id}
                  rawData={card.raw_data}
                  editionHint={card.editionHint}
                  sourceSize="small"
                  style={{ width: 36, height: 50, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' }}
                  resizeMode="cover"
                />
              ))}
              {scannedCards.length > 5 && (
                <View style={{ width: 36, height: 50, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '900' }}>+{scannedCards.length - 5}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}

          {scanMode === 'manual' && (
            <>
              <TouchableOpacity
                onPress={() => handleCapture(false)}
                disabled={processingOcr}
                style={{ width: shutterSize, height: shutterSize, borderRadius: shutterSize / 2, backgroundColor: processingOcr ? 'rgba(255,255,255,0.4)' : '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: 'rgba(255,255,255,0.3)' }}
              >
                {processingOcr ? (
                  <ActivityIndicator color={theme.colors.primary} size="large" />
                ) : (
                  <View style={{ width: shutterInnerSize, height: shutterInnerSize, borderRadius: shutterInnerSize / 2, backgroundColor: theme.colors.primary }} />
                )}
              </TouchableOpacity>
              <Text style={{ color: 'rgba(255,255,255,0.74)', fontSize: 13, fontWeight: '700' }}>Tap to scan card</Text>
            </>
          )}

          {scanMode === 'auto' && (
            <>
              <TouchableOpacity
                onPress={toggleAutoScan}
                style={{ width: shutterSize, height: shutterSize, borderRadius: shutterSize / 2, backgroundColor: autoScanActive ? '#EF4444' : '#10B981', alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: 'rgba(255,255,255,0.3)' }}
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
