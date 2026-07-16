import { useTheme } from '../../components/theme-context';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  FlatList,
  ScrollView,
  Vibration,
  useWindowDimensions,
  Share,
} from 'react-native';
import { Text } from '../../components/Text';
import { StackrBackButton } from '../../components/StackrBackButton';
import EditionAwareCardImage from '../../components/EditionAwareCardImage';
import {
  EmptyStateCard,
  HeroActionPanel,
  PremiumCard,
  ScanModeCard,
  StatPill,
  TrustBadge,
} from '../../components/PremiumUI';
import { SafeAreaView , useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { fetchBinders, BinderRecord } from '../../lib/binders';
import { ensureOwnedCardQuantity } from '../../lib/ownership';
import { scanStore } from '../../lib/scanStore';
import * as ImageManipulator from 'expo-image-manipulator';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { PRICE_API_URL } from '../../lib/config';
import { recordAchievementEvent } from '../../lib/achievements';
import { Buffer } from 'buffer';
import { decode as decodeJpeg } from 'jpeg-js';
import {
  lookupLocalCardsByPrintedNumber,
  lookupLocalCardsByPrintedTotal,
  lookupLocalCardsByLooseNameText,
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
} from '../../lib/onDeviceVisualMatcher';
import {
  scannerPackCardToLocalCard,
  searchScannerPack,
  syncScannerPack,
} from '../../lib/scannerPack';
import type { NormalisedScanResponse, ScanCandidate, ScanEditionHint, ScanErrorResponse, ScanErrorStage } from '../../types/scan';

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
const BINDER_PAGE_SCAN_PROFILE = { width: 1500, compress: 0.88 };
const BINDER_PAGE_CARD_PROFILE = { width: 760, compress: 0.72 };
const USE_SNAPSHOT_CAPTURE = true;
const REQUEST_TIMEOUT_MS = 5000;
const MANUAL_SCAN_HARD_TIMEOUT_MS = 30000;
const CARD_LOOKUP_TIMEOUT_MS = 3500;
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
const BINDER_PAGE_ASPECT_RATIO = CARD_ASPECT_RATIO;
const BINDER_PAGE_FRAME_MARGIN_RATIO = 0.06;
const GRID_SCAN_OPTIONS = ['auto', '2', '3', '4', '5'] as const;
const DEFAULT_AUTO_GRID_SIZE = 3;
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

function isLikelyImageCaptureError(message?: string | null) {
  return /camera|capture|image|photo|snapshot|manipulat|base64|file path|takephoto|takesnapshot|permission|denied|uri|codec|decode|width|height/i
    .test(String(message ?? ''));
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
  scanSlot?: number;
  scanCropUri?: string | null;
};

type GridScanSize = typeof GRID_SCAN_OPTIONS[number];
type GridScanSlotStatus = 'Confirmed' | 'Check Match' | 'Not Identified' | 'Empty';
type GridScanSlot = {
  slot: number;
  row: number;
  col: number;
  gridSize: number;
  cropUri: string;
  card: ScannedCard | null;
  status: GridScanSlotStatus;
  included: boolean;
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

function localCardToScanCandidate(card: LocalScanCard): ScanCandidate {
  const resolvedCard = toScannedCard(card);
  return {
    id: card.id,
    name: card.name,
    number: card.number,
    setName: card.set_name,
    setCode: card.set_id,
    imageSmall: card.image_small,
    imageLarge: null,
    imageSource: 'scrydex',
    source: 'ximilar',
    resolvedCard,
  };
}

function pokemonRowToScannedCard(card: any, editionHint?: ScanEditionHint | null, editionSource?: ScanCandidate['editionSource']): ScannedCard {
  const setPrintedTotal = Number(card?.raw_data?.set?.printedTotal ?? card?.raw_data?.set?.total ?? NaN);

  return {
    id: card.id,
    name: card.name,
    number: card.number ?? '',
    set_id: card.set_id,
    set_name: card.raw_data?.set?.name ?? card.set_id,
    set_printed_total: Number.isFinite(setPrintedTotal) ? setPrintedTotal : null,
    image_small: card.image_small ?? card.raw_data?.images?.small ?? '',
    image_large: card.image_large ?? card.raw_data?.images?.large ?? null,
    raw_data: card.raw_data ?? null,
    rarity: card.rarity ?? card.raw_data?.rarity ?? '',
    editionHint: editionHint ?? null,
    editionSource: editionHint ? editionSource : undefined,
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

// Retained for edition-specific scan confidence checks as the scan pipeline evolves.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  originalUri: string;
  originalWidth: number;
  originalHeight: number;
  crop: ImageCropRect | null;
  sourceLabel: 'frame-crop' | 'full-frame';
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
type ScanMode = 'manual' | 'auto' | 'page';
type CameraMode = 'single' | 'grid';

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

type ImageCropRect = {
  originX: number;
  originY: number;
  width: number;
  height: number;
};

type PreviewCropFrame = {
  previewWidth: number;
  previewHeight: number;
  frameX: number;
  frameY: number;
  frameWidth: number;
  frameHeight: number;
  marginRatio?: number;
};

function clampImageCrop(crop: ImageCropRect, imageWidth: number, imageHeight: number) {
  const originX = Math.max(0, Math.min(imageWidth - 1, Math.floor(crop.originX)));
  const originY = Math.max(0, Math.min(imageHeight - 1, Math.floor(crop.originY)));
  const maxWidth = Math.max(1, imageWidth - originX);
  const maxHeight = Math.max(1, imageHeight - originY);

  return {
    originX,
    originY,
    width: Math.max(1, Math.min(maxWidth, Math.floor(crop.width))),
    height: Math.max(1, Math.min(maxHeight, Math.floor(crop.height))),
  };
}

function getCenteredCardCrop(photoWidth?: number, photoHeight?: number, frame?: PreviewCropFrame | null) {
  if (!photoWidth || !photoHeight) return null;

  if (frame?.previewWidth && frame?.previewHeight && frame.frameWidth && frame.frameHeight) {
    const sensorAspect = photoWidth / photoHeight;
    const previewAspect = frame.previewWidth / frame.previewHeight;
    let visiblePhotoWidth = photoWidth;
    let visiblePhotoHeight = photoHeight;
    let hiddenX = 0;
    let hiddenY = 0;

    if (sensorAspect > previewAspect) {
      visiblePhotoWidth = photoHeight * previewAspect;
      hiddenX = (photoWidth - visiblePhotoWidth) / 2;
    } else {
      visiblePhotoHeight = photoWidth / previewAspect;
      hiddenY = (photoHeight - visiblePhotoHeight) / 2;
    }

    const scaleX = visiblePhotoWidth / frame.previewWidth;
    const scaleY = visiblePhotoHeight / frame.previewHeight;
    const rawWidth = frame.frameWidth * scaleX;
    const rawHeight = frame.frameHeight * scaleY;
    const marginRatio = frame.marginRatio ?? 0;
    const width = Math.min(photoWidth, rawWidth * (1 + marginRatio));
    const height = Math.min(photoHeight, rawHeight * (1 + marginRatio));
    const marginX = (width - rawWidth) / 2;
    const marginY = (height - rawHeight) / 2;

    return clampImageCrop({
      originX: hiddenX + frame.frameX * scaleX - marginX,
      originY: hiddenY + frame.frameY * scaleY - marginY,
      width,
      height,
    }, photoWidth, photoHeight);
  }

  let cropWidth = photoWidth * CARD_CROP_WIDTH_RATIO;
  let cropHeight = cropWidth / CARD_ASPECT_RATIO;
  const maxCropHeight = photoHeight * CARD_CROP_HEIGHT_RATIO;

  if (cropHeight > maxCropHeight) {
    cropHeight = maxCropHeight;
    cropWidth = cropHeight * CARD_ASPECT_RATIO;
  }

  return clampImageCrop({
    originX: (photoWidth - cropWidth) / 2,
    originY: (photoHeight - cropHeight) / 2,
    width: cropWidth,
    height: cropHeight,
  }, photoWidth, photoHeight);
}

function getGridScanSize(value: GridScanSize) {
  return value === 'auto' ? DEFAULT_AUTO_GRID_SIZE : Number(value);
}

function getGridScanLabel(value: GridScanSize) {
  return value === 'auto' ? 'Auto' : `${value} x ${value}`;
}

function getGridScanDescription(value: GridScanSize) {
  const size = getGridScanSize(value);
  return value === 'auto'
    ? `Auto starts at ${size} x ${size} - ${size * size} positions`
    : `${size * size} positions`;
}

function getBinderPageSlotCrop(pageWidth: number, pageHeight: number, slotIndex: number, gridSize: number) {
  const row = Math.floor(slotIndex / gridSize);
  const col = slotIndex % gridSize;
  const cellWidth = pageWidth / gridSize;
  const cellHeight = pageHeight / gridSize;
  let slotWidth = cellWidth * 0.92;
  let slotHeight = slotWidth / CARD_ASPECT_RATIO;

  if (slotHeight > cellHeight * 0.92) {
    slotHeight = cellHeight * 0.92;
    slotWidth = slotHeight * CARD_ASPECT_RATIO;
  }

  return clampImageCrop({
    originX: col * cellWidth + (cellWidth - slotWidth) / 2,
    originY: row * cellHeight + (cellHeight - slotHeight) / 2,
    width: slotWidth,
    height: slotHeight,
  }, pageWidth, pageHeight);
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

function getNumericCollectorNumber(value?: string | null) {
  const match = String(value ?? '').match(/\d+/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function getScannedCardPrintedTotal(card?: ScannedCard | null) {
  if (!card) return null;
  if (typeof card.set_printed_total === 'number' && Number.isFinite(card.set_printed_total) && card.set_printed_total > 0) {
    return card.set_printed_total;
  }

  const rawTotal = card.raw_data?.set?.printedTotal ?? card.raw_data?.set?.total;
  const parsed = Number(rawTotal);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function isReliablePrintedNumberForValidation(printedNumber?: PrintedNumber | null) {
  return Boolean(printedNumber && !isSuspiciousPrintedNumber(printedNumber));
}

function doesScannedCardMatchPrintedNumber(card: ScannedCard | null | undefined, printedNumber?: PrintedNumber | null) {
  if (!isReliablePrintedNumberForValidation(printedNumber)) return true;
  if (!card || !printedNumber) return false;

  const cardNumber = getNumericCollectorNumber(card.number);
  if (cardNumber == null || cardNumber !== printedNumber.number) return false;

  const setPrintedTotal = getScannedCardPrintedTotal(card);
  if (setPrintedTotal != null && printedNumber.total >= 10 && setPrintedTotal !== printedNumber.total) {
    return false;
  }

  return true;
}

function removePrintedNumberMismatches(candidates: ScanCandidate[], printedNumber?: PrintedNumber | null) {
  if (!isReliablePrintedNumberForValidation(printedNumber)) return candidates;

  return candidates.map((candidate) => {
    const resolvedCard = candidate.resolvedCard as ScannedCard | null | undefined;
    if (!resolvedCard || doesScannedCardMatchPrintedNumber(resolvedCard, printedNumber)) return candidate;
    return { ...candidate, resolvedCard: null };
  });
}

function findPrintedNumberAlignedMatch(candidates: ScanCandidate[], printedNumber?: PrintedNumber | null) {
  return (candidates.find((candidate) => {
    const resolvedCard = candidate.resolvedCard as ScannedCard | null | undefined;
    return Boolean(resolvedCard && doesScannedCardMatchPrintedNumber(resolvedCard, printedNumber));
  })?.resolvedCard as ScannedCard | null | undefined) ?? null;
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
  return clampImageCrop({
    originX: width * region.x,
    originY: height * region.y,
    width: width * region.width,
    height: height * region.height,
  }, width, height);
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

// Retained for visual edition reads when card-image OCR is re-enabled.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  const isFocused = useIsFocused();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const camera = useRef<Camera>(null);
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const params = useLocalSearchParams<{
    mode?: string;
    binderId?: string;
    flow?: string;
    reason?: string;
    session?: string;
    scanMode?: string;
    pageMode?: string;
  }>();
  const isInventoryMode = params.mode === 'inventory';
  const isMarketMode = params.mode === 'market' || isInventoryMode;
  const sellerFlow = params.flow === 'stock_out' ? 'stock_out' : 'stock_in';
  const sellerReason = typeof params.reason === 'string'
    ? params.reason
    : sellerFlow === 'stock_out'
      ? 'Customer purchase'
      : 'Purchased stock';
  const sellerModeLabel = sellerFlow === 'stock_out' ? 'Stock Out' : 'Stock In';
  const sellerQueueLabel = sellerFlow === 'stock_out' ? 'Out cart' : 'Intake batch';
  const isSellerStockOut = isInventoryMode && sellerFlow === 'stock_out';

  const [torch, setTorch] = useState(false);
  const [step, setStep] = useState<ScanStep>('scanning');
  const [scanMode, setScanMode] = useState<ScanMode>(isInventoryMode ? 'auto' : 'manual');
  const [cameraMode, setCameraMode] = useState<CameraMode>('single');
  const [gridScanSize, setGridScanSize] = useState<GridScanSize>('auto');
  const [binders, setBinders] = useState<BinderRecord[]>([]);
  const [selectedBinder, setSelectedBinder] = useState<BinderRecord | null>(null);
  const [loadingBinders, setLoadingBinders] = useState(true);
  const [scannedCards, setScannedCards] = useState<ScannedCard[]>([]);
  const [scanning, setScanning] = useState(false);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [processingOcr, setProcessingOcr] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [autoScanActive, setAutoScanActive] = useState(false);
  const [scanningMessage, setScanningMessage] = useState('Reading card...');
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [scanError, setScanError] = useState<ScanErrorState | null>(null);
  const [frozenFrameUri, setFrozenFrameUri] = useState<string | null>(null);
  const [pageScanProgress, setPageScanProgress] = useState<{ current: number; total: number } | null>(null);
  const [gridScanSlots, setGridScanSlots] = useState<GridScanSlot[]>([]);
  const activeGridSize = getGridScanSize(gridScanSize);
  const activeGridSlotCount = activeGridSize * activeGridSize;

  const scannerLayout = useMemo(() => {
    const safeWidth = Math.max(1, screenWidth - insets.left - insets.right);
    const safeHeight = Math.max(1, screenHeight - insets.top - insets.bottom);
    const compact = safeHeight < 760 || safeWidth < 360;
    const headerReserve = compact ? 68 : 76;
    const isPageMode = cameraMode === 'grid' && !isInventoryMode;
    const modeReserve = !isInventoryMode ? (cameraMode === 'grid' ? 124 : 58) : 0;
    const hasScannedPreview = scannedCards.length > 0;
    const bottomReserve = hasScannedPreview
      ? compact ? 168 : 184
      : compact ? 118 : 132;
    const feedbackReserve = lastScanned ? 52 : 0;
    const topPadding = Math.max(6, Math.min(compact ? 18 : 30, Math.round(safeHeight * 0.035)));
    const baseAvailableHeight = Math.max(
      160,
      safeHeight - headerReserve - modeReserve - bottomReserve - feedbackReserve - topPadding - 12
    );
    const horizontalGutter = isPageMode ? (safeWidth < 360 ? 18 : 28) : safeWidth < 360 ? 36 : 64;
    const maxFrameWidth = Math.max(160, Math.min(isPageMode ? safeWidth - horizontalGutter : compact ? 292 : 320, safeWidth - horizontalGutter));
    const frameAspectRatio = isPageMode ? BINDER_PAGE_ASPECT_RATIO : CARD_ASPECT_RATIO;
    const widthBeforeTips = Math.max(160, Math.min(maxFrameWidth, baseAvailableHeight * frameAspectRatio));
    const showTips = safeHeight >= 680 && widthBeforeTips >= 232;
    const tipReserve = showTips ? 54 : 0;
    const availableHeight = Math.max(160, baseAvailableHeight - tipReserve);
    const frameWidth = Math.round(Math.max(160, Math.min(maxFrameWidth, availableHeight * frameAspectRatio)));
    const frameHeight = Math.round(frameWidth / frameAspectRatio);
    const shutterSize = compact ? 72 : 80;

    return {
      frameWidth,
      frameHeight,
      shutterSize,
      shutterInnerSize: compact ? 54 : 60,
      compact,
      frameTopPadding: topPadding,
      showTips,
    };
  }, [
    insets.bottom,
    insets.left,
    insets.right,
    insets.top,
    isMarketMode,
    lastScanned,
    scannedCards.length,
    cameraMode,
    isInventoryMode,
    screenHeight,
    screenWidth,
  ]);

  const isCompactScanner = scannerLayout.compact;
  const scannerFrameWidth = scannerLayout.frameWidth;
  const scannerFrameHeight = scannerLayout.frameHeight;
  const shutterSize = scannerLayout.shutterSize;
  const shutterInnerSize = scannerLayout.shutterInnerSize;

  const scanCooldownRef = useRef(false);
  const autoScanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scannedCardIdsRef = useRef<Set<string>>(new Set());
  const scanningMessageRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastFrameSigRef = useRef<string | null>(null);
  const lastFrameTsRef = useRef<number>(0);
  const handleCaptureRef = useRef<((isAuto?: boolean) => Promise<void>) | null>(null);
  const pendingRenderLoggedRef = useRef(false);
  const lastScanDebugRef = useRef<number>(0);
  const scannerFrameRef = useRef<View>(null);
  const scannerFrameRectRef = useRef<PreviewCropFrame | null>(null);
  const cameraPermissionRequestedRef = useRef(false);
  const cameraIsActive = isFocused && step === 'scanning' && !cameraError;

  const updateScannerFrameRect = useCallback(() => {
    requestAnimationFrame(() => {
      scannerFrameRef.current?.measureInWindow((x, y, width, height) => {
        if (!width || !height) return;
        scannerFrameRectRef.current = {
          previewWidth: screenWidth,
          previewHeight: screenHeight,
          frameX: x,
          frameY: y,
          frameWidth: width,
          frameHeight: height,
          marginRatio: cameraMode === 'grid' ? BINDER_PAGE_FRAME_MARGIN_RATIO : 0.18,
        };
      });
    });
  }, [cameraMode, screenHeight, screenWidth]);

  useEffect(() => {
    updateScannerFrameRect();
  }, [scannerLayout.frameHeight, scannerLayout.frameWidth, updateScannerFrameRect]);

  const selectCameraMode = useCallback((mode: CameraMode) => {
    setCameraMode(mode);
    setAutoScanActive(false);
    setFrozenFrameUri(null);
    if (mode === 'grid') {
      setScanMode('page');
      setGridScanSize((current) => current ?? 'auto');
    } else {
      setScanMode('manual');
    }
  }, []);

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
    if (!hasPermission && !cameraPermissionRequestedRef.current) {
      cameraPermissionRequestedRef.current = true;
      await requestPermission();
    }
  };

  checkPermission();
}, [hasPermission, requestPermission]);
  // ===============================
  // CLEANUP ON UNMOUNT
  // ===============================

  useEffect(() => {
    if (isFocused) return;
    setAutoScanActive(false);
    setCameraReady(false);
    setProcessingOcr(false);
    setPageScanProgress(null);
    scanCooldownRef.current = false;
    setFrozenFrameUri(null);
    if (autoScanIntervalRef.current) {
      clearInterval(autoScanIntervalRef.current);
      autoScanIntervalRef.current = null;
    }
  }, [isFocused]);

  useEffect(() => {
    if (!isInventoryMode) return;
    if (!cameraIsActive || !cameraReady || pendingConfirmation || scanError || processingOcr) return;
    setScanMode('auto');
    setAutoScanActive(true);
  }, [cameraIsActive, cameraReady, isInventoryMode, pendingConfirmation, processingOcr, scanError]);

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

    if (cameraIsActive && scanMode === 'auto' && autoScanActive) {
      autoScanIntervalRef.current = setInterval(() => {
        // TODO seller scanner: replace timed captures with frame-processor card detection when the native scanner pipeline is available.
        if (!scanCooldownRef.current) void handleCaptureRef.current?.(!isInventoryMode);
      }, 950);
    }

    return () => {
      if (autoScanIntervalRef.current) clearInterval(autoScanIntervalRef.current);
    };
  }, [cameraIsActive, scanMode, autoScanActive, isInventoryMode]);

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
      setPageScanProgress(null);
      setScanError(null);
      setFrozenFrameUri(null);
    }, delay);
  }, [stopScanningMessages]);

  const closeScanner = useCallback(() => {
    setAutoScanActive(false);
    setTorch(false);
    setProcessingOcr(false);
    setScanning(false);
    setPageScanProgress(null);
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

  const fetchJsonWithTimeout = useCallback(async (
    url: string,
    body: Record<string, unknown>,
    timeoutMs: number
  ): Promise<any | null> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const raw = await response.text();
      let data: any = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        console.log('Page scan returned non-JSON response:', {
          url,
          status: response.status,
          preview: raw.slice(0, 180),
        });
        return null;
      }

      if (!response.ok && !data?.match && !data?.candidates?.length) {
        console.log('Page scan request failed:', {
          url,
          status: response.status,
          error: data?.error ?? data?.message,
        });
        return null;
      }

      return data;
    } catch (error) {
      console.log('Page scan request failed:', {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }, []);

  const lookupPageScanCandidate = useCallback(async (
    candidate: ScanCandidate,
    printedNumber?: PrintedNumber | null,
    setId?: string | null
  ): Promise<ScannedCard | null> => {
    const resolvedCard = candidate.resolvedCard as ScannedCard | null | undefined;
    if (resolvedCard?.id) return resolvedCard;

    const candidateName = String(candidate.name ?? '').trim();
    const genericName = candidateName.toLowerCase();
    if (!candidateName || genericName === 'card' || genericName === 'tcg card' || genericName === 'trading card') {
      return null;
    }

    const { hint: editionHint, source: editionSource } = getEffectiveScanEditionHint(candidate, selectedBinder?.edition);
    const numberClean = printedNumber?.number != null
      ? String(printedNumber.number)
      : candidate.number
        ? String(candidate.number).split('/')[0].trim().replace(/^0+/, '')
        : null;
    const setTotalClean = printedNumber?.total != null ? String(printedNumber.total) : null;
    const searchParams = new URLSearchParams({ name: candidateName });
    if (numberClean) searchParams.append('number', numberClean);
    if (setTotalClean) searchParams.append('setTotal', setTotalClean);
    if (setId) {
      searchParams.append('setId', setId);
      searchParams.append('strictSet', '1');
    } else {
      const lookupSetName = stripScanEditionFromSetName(candidate.setName);
      if (lookupSetName) searchParams.append('setName', lookupSetName);
      if (candidate.setCode) searchParams.append('setId', String(candidate.setCode));
    }
    if (editionHint) searchParams.append('editionHint', editionHint);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CARD_LOOKUP_TIMEOUT_MS);
    try {
      const response = await fetch(`${PRICE_API_URL}/api/search/tcg?${searchParams.toString()}`, {
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const data = await response.json();
      let cards = (data.cards ?? []) as ScannedCard[];
      if (!cards.length) return null;
      if (setId) cards = cards.filter((card) => card.set_id === setId);
      if (!cards.length) return null;

      const parsedTotal = setTotalClean ? Number(setTotalClean) : null;
      const totalMatches = parsedTotal
        ? cards.filter((card) => card.set_printed_total === parsedTotal)
        : [];
      const numberMatches = numberClean
        ? (totalMatches.length ? totalMatches : cards).filter((card) => String(parseInt(card.number, 10)) === numberClean)
        : [];
      const card =
        pickCardForEditionHint(numberMatches, editionHint)
        ?? pickCardForEditionHint(totalMatches, editionHint)
        ?? pickCardForEditionHint(cards, editionHint)
        ?? cards[0];

      return withScannedCardEditionHint(card, editionHint, editionSource);
    } catch (error) {
      console.log('Page scan candidate lookup failed:', {
        name: candidateName,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }, [selectedBinder?.edition]);

  const identifyBinderPageCard = useCallback(async (
    input: { base64: string; uri: string; width: number; height: number; slot: number }
  ): Promise<ScannedCard | null> => {
    const expectedSetId = selectedBinder?.source_set_id ?? null;
    let printedNumber = await readPrintedNumberFromCardImage(input.uri, input.width, input.height, {
      includeFastRegions: true,
      includeFallbackRegions: true,
      includeFullCard: false,
    });
    let nameText: string | null = null;
    const getNameText = async () => {
      if (nameText !== null) return nameText;
      nameText = await readNameTextFromCardImage(input.uri, input.width, input.height, {
        regions: NAME_OCR_REGIONS,
        resizeWidth: 900,
      });
      return nameText;
    };

    let match = await lookupCardBySetNumber(expectedSetId, printedNumber);

    if (!match && printedNumber) {
      const localResult = await fetchJsonWithTimeout(
        `${PRICE_API_URL}/api/local-ai/identify`,
        {
          printedNumber,
          setId: expectedSetId ?? '',
          base64Image: input.base64,
          ocrText: printedNumber.ocrText ?? '',
        },
        LOCAL_AI_VISUAL_TIMEOUT_MS + 1200
      );
      match = localResult?.match ?? (localResult?.candidates?.length === 1 ? localResult.candidates[0] : null);
    }

    if (!match) {
      const rareCandyNameHint = await getNameText();
      const rareCandyResult = await fetchJsonWithTimeout(
        `${PRICE_API_URL}/api/rare-candy-scan/identify`,
        {
          base64Image: input.base64,
          setId: expectedSetId ?? '',
          nameHint: rareCandyNameHint,
          printedNumber: printedNumber
            ? { number: printedNumber.number, total: printedNumber.total }
            : null,
        },
        RARE_CANDY_STYLE_TIMEOUT_MS + 1500
      );
      match = rareCandyResult?.match ?? null;
    }

    if (!match) {
      match = await fingerprintScan(
        input.base64,
        expectedSetId,
        expectedSetId ? null : printedNumber?.total,
        expectedSetId ? SET_FINGERPRINT_CONFIDENCE_THRESHOLD : GENERAL_FINGERPRINT_CONFIDENCE_THRESHOLD
      );
    }

    if (!match) {
      const ximilarResult = await fetchJsonWithTimeout(
        `${PRICE_API_URL}/api/scan/tcg`,
        { base64Image: input.base64, magicAi: true },
        9000
      ) as NormalisedScanResponse | null;
      if (ximilarResult?.ok && Array.isArray(ximilarResult.candidates)) {
        for (const candidate of ximilarResult.candidates.slice(0, 5)) {
          const resolved = await lookupPageScanCandidate(candidate, printedNumber, expectedSetId);
          if (resolved) {
            match = resolved;
            break;
          }
        }
      }
    }

    if (!match && !printedNumber) {
      const text = await getNameText();
      const numberFromText = parsePrintedNumberSignalFromText(text);
      if (numberFromText) {
        printedNumber = numberFromText;
        match = await lookupCardBySetNumber(expectedSetId, printedNumber);
      }
    }

    if (!match) {
      console.log('Page scan slot missed:', {
        slot: input.slot,
        printedNumber: printedNumber ? `${printedNumber.number}/${printedNumber.total}` : null,
      });
      return null;
    }

    match = await resolveCardInExpectedSet(match, expectedSetId, printedNumber);
    const binderEditionHint = normalizeScanEditionHint(selectedBinder?.edition);
    return withScannedCardEditionHint(
      match,
      binderEditionHint ?? match.editionHint ?? null,
      binderEditionHint ? 'binder' : match.editionSource
    );
  }, [
    fetchJsonWithTimeout,
    fingerprintScan,
    lookupCardBySetNumber,
    lookupPageScanCandidate,
    resolveCardInExpectedSet,
    selectedBinder?.edition,
    selectedBinder?.source_set_id,
  ]);

  const handleCapture = useCallback(async (isAuto = false) => {
    if (!camera.current) {
      if (isAuto) logScanDebug('camera-not-ready');
      return;
    }
    if (!cameraReady) {
      if (isAuto) logScanDebug('camera-session-not-ready');
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

    const encodeCapturedFrame = async (
      capturedUri: string,
      originalWidth: number,
      originalHeight: number,
      profile: { width: number; compress: number },
      crop: ImageCropRect | null,
      sourceLabel: CaptureResult['sourceLabel']
    ): Promise<CaptureResult> => {
      const actions: ImageManipulator.Action[] = [
        ...(crop ? [{ crop }] : []),
        { resize: { width: profile.width } },
      ];
      const manipulated = await ImageManipulator.manipulateAsync(
        capturedUri,
        actions,
        { compress: profile.compress, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      logScanStage('IMAGE_ENCODED', {
        sourceLabel,
        width: manipulated.width,
        height: manipulated.height,
        bytesApprox: Math.round((manipulated.base64?.length ?? 0) * 0.75),
        hasBase64: Boolean(manipulated.base64),
        crop: crop
          ? {
              originX: crop.originX,
              originY: crop.originY,
              width: crop.width,
              height: crop.height,
              originalWidth,
              originalHeight,
            }
          : null,
      });

      return {
        base64: manipulated.base64 ?? '',
        uri: manipulated.uri,
        width: manipulated.width,
        height: manipulated.height,
        originalUri: capturedUri,
        originalWidth,
        originalHeight,
        crop,
        sourceLabel,
      };
    };

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
      if (!capturedUri) {
        throw new Error('Camera returned a photo without a file path.');
      }
      if (capturedUri) {
        setFrozenFrameUri(capturedUri);
      }
      logScanStage('IMAGE_CAPTURED', {
        source,
        width: photo.width,
        height: photo.height,
        path: photo.path ? '[file]' : null,
      });
      const crop = getCenteredCardCrop(photo.width, photo.height, scannerFrameRectRef.current);
      const encoded = await encodeCapturedFrame(capturedUri, photo.width, photo.height, profile, crop, 'frame-crop');
      console.log('Capture timing:', {
        source,
        profile,
        takePhotoMs: photoDoneAt - captureStartedAt,
        manipulateMs: Date.now() - photoDoneAt,
        totalMs: Date.now() - captureStartedAt,
      });
      return encoded;
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
      if (!PRICE_API_URL) {
        return {
          ok: false,
          provider: 'ximilar',
          stage: 'backend',
          code: 'SCAN_API_URL_MISSING',
          message: 'The Ximilar scan service is not configured.',
          details: 'Missing EXPO_PUBLIC_PRICE_API_URL. Restart Expo after adding it to .env.local.',
        };
      }

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

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), CARD_LOOKUP_TIMEOUT_MS);
      let searchRes: Response;
      try {
        searchRes = await fetch(`${PRICE_API_URL}/api/search/tcg?${searchParams.toString()}`, {
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
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

    const lookupXimilarCandidateLocally = async (candidate: ScanCandidate): Promise<ScannedCard | null> => {
      if (!candidate.name || isGenericXimilarCardName(candidate.name)) return null;

      try {
        const { supabase } = await import('../../lib/supabase');
        const { hint: editionHint, source: editionSource } = getEffectiveScanEditionHint(candidate, selectedBinder?.edition);
        const candidateNumber = candidate.number ? String(candidate.number).split('/')[0].trim().replace(/^0+/, '') : null;
        const candidateSetName = stripScanEditionFromSetName(candidate.setName);
        const normaliseLookupText = (value?: string | null) =>
          String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

        let query = supabase
          .from('pokemon_cards')
          .select('id, name, number, rarity, image_small, image_large, set_id, raw_data')
          .ilike('name', `%${candidate.name}%`)
          .limit(80);

        if (candidateNumber) query = query.eq('number', candidateNumber);

        const { data, error } = await query;
        if (error) throw error;

        let rows = data ?? [];
        if (rows.length === 0 && candidateNumber) {
          const { data: looseRows, error: looseError } = await supabase
            .from('pokemon_cards')
            .select('id, name, number, rarity, image_small, image_large, set_id, raw_data')
            .eq('number', candidateNumber)
            .limit(120);
          if (looseError) throw looseError;
          rows = looseRows ?? [];
        }

        if (!rows.length) return null;

        const normalizedCandidateName = normalizeCardName(candidate.name);
        const normalizedSetName = normaliseLookupText(candidateSetName);
        const normalizedSetCode = normaliseLookupText(candidate.setCode);

        const numberMatches = candidateNumber
          ? rows.filter((row) => String(parseInt(row.number ?? '', 10)) === candidateNumber || String(row.number ?? '') === candidateNumber)
          : rows;
        const nameMatches = numberMatches.filter((row) => {
          const rowName = normalizeCardName(row.name);
          return rowName === normalizedCandidateName || rowName.includes(normalizedCandidateName) || normalizedCandidateName.includes(rowName);
        });
        const candidates = nameMatches.length ? nameMatches : numberMatches;

        const setMatches = candidates.filter((row) => {
          const rowSetName = normaliseLookupText(row.raw_data?.set?.name);
          const rowSetId = normaliseLookupText(row.set_id);
          const rowPtcgoCode = normaliseLookupText(row.raw_data?.set?.ptcgoCode);

          return Boolean(
            (normalizedSetName && (rowSetName === normalizedSetName || rowSetName.includes(normalizedSetName) || normalizedSetName.includes(rowSetName)))
            || (normalizedSetCode && (rowSetId === normalizedSetCode || rowPtcgoCode === normalizedSetCode))
          );
        });

        const row = setMatches[0] ?? candidates[0] ?? null;
        if (!row) return null;

        return pokemonRowToScannedCard(row, editionHint, editionSource);
      } catch (error) {
        console.log('Fast local Ximilar resolve failed:', {
          name: candidate.name,
          code: 'LOCAL_CARD_LOOKUP_FAILED',
          error: error instanceof Error ? error.message : String(error),
          stack: SHOW_SCAN_DEBUG && error instanceof Error ? error.stack : undefined,
        });
        return null;
      }
    };

    const resolveXimilarCandidates = async (
      candidates: ScanCandidate[],
      fallbackPrintedNumber?: PrintedNumber | null,
      setId?: string | null
    ): Promise<ScanCandidate[]> => {
      const resolveCandidate = async (candidate: ScanCandidate): Promise<ScanCandidate> => {
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
          const localCard = await lookupXimilarCandidateLocally(candidateWithEdition);
          const card = localCard ?? await lookupParsedCard(candidateWithEdition, fallbackPrintedNumber, setId);
          logScanStage('POKEMON_API_LOOKUP_COMPLETE', {
            name: candidateWithEdition.name,
            resolved: Boolean(card),
            cardId: card?.id,
            cardName: card?.name,
            editionHint: card?.editionHint ?? candidateWithEdition.editionHint,
            source: localCard ? 'supabase' : 'backend',
          });
          return { ...candidateWithEdition, resolvedCard: card };
        } catch (lookupError) {
          logScanStage('POKEMON_API_LOOKUP_COMPLETE', {
            name: candidateWithEdition.name,
            resolved: false,
            code: 'CARD_LOOKUP_FAILED',
            error: lookupError instanceof Error ? lookupError.message : String(lookupError),
            stack: SHOW_SCAN_DEBUG && lookupError instanceof Error ? lookupError.stack : undefined,
          });
          return { ...candidateWithEdition, resolvedCard: null };
        }
      };

      return Promise.all(candidates.slice(0, 5).map(resolveCandidate));
    };

    let scanTimedOut = false;
    const hardTimeout = !isAuto
      ? setTimeout(() => {
          scanTimedOut = true;
          const timeoutError = makeScanError(
            'upload',
            'SCAN_TIMEOUT',
            'The scan took too long to complete.',
            `No scan result after ${MANUAL_SCAN_HARD_TIMEOUT_MS}ms.`
          );
          logScanStage('API_RESPONSE_RECEIVED', {
            ok: false,
            code: timeoutError.code,
            stage: timeoutError.stage,
            details: timeoutError.details,
          });
          setScanError(timeoutError);
          stopScanningMessages();
          scanCooldownRef.current = false;
          setProcessingOcr(false);
          setFrozenFrameUri(null);
        }, MANUAL_SCAN_HARD_TIMEOUT_MS)
      : null;

    const throwIfScanTimedOut = () => {
      if (!scanTimedOut) return;
      const error = new Error(`Scan exceeded ${MANUAL_SCAN_HARD_TIMEOUT_MS}ms.`);
      error.name = 'AbortError';
      throw error;
    };

    let recoveryBase64 = '';
    let recoveryXimilarCandidates: ScanCandidate[] | null = null;
    let recoveryMatch: ScannedCard | null = null;

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
      throwIfScanTimedOut();
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
      recoveryBase64 = bestBase64;
      let bestUri = capture.uri;
      let bestWidth = capture.width;
      let bestHeight = capture.height;
      let ximilarBase64 = bestBase64;
      let ximilarSourceLabel: CaptureResult['sourceLabel'] = capture.sourceLabel;
      const scanStartedAt = Date.now();
      const captureDoneAt = Date.now();
      const elapsedScanMs = () => Date.now() - scanStartedAt;
      const hasFastScanBudget = (reserveMs = 0) => !isAuto || elapsedScanMs() + reserveMs < AUTO_SCAN_SOFT_BUDGET_MS;
      const hasHardScanBudget = (reserveMs = 0) => !isAuto || elapsedScanMs() + reserveMs < AUTO_SCAN_HARD_BUDGET_MS;
      const shouldDeferInitialNumberOcr = isMarketMode && !isAuto && !expectedSetId;
      const shouldUseXimilarProvider = !isAuto && !expectedSetId && (isMarketMode || selectedBinder);
      let printedNumber: PrintedNumber | null = null;
      let triedFallbackNumberRegions = false;
      let numberOcrDoneAt = captureDoneAt;
      let attemptedInitialNumberOcr = false;
      const readInitialPrintedNumber = async () => {
        if (attemptedInitialNumberOcr) return printedNumber;
        attemptedInitialNumberOcr = true;
        printedNumber = await readPrintedNumberFromCardImage(bestUri, bestWidth, bestHeight, {
          fastRegions: PRIMARY_NUMBER_OCR_REGIONS,
          includeFallbackRegions: false,
          includeFullCard: false,
        });
        numberOcrDoneAt = Date.now();
        return printedNumber;
      };

      if (!shouldDeferInitialNumberOcr) {
        await readInitialPrintedNumber();
        throwIfScanTimedOut();
      }
      let cachedNameText: string | null = null;
      let cachedTotalHintText: string | null = null;
      let cachedNameCandidates: LocalScanCard[] | null | undefined;
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
      const getLocalNameCandidates = async () => {
        const nameText = await getNameText(bestUri, bestWidth, bestHeight);
        if (cachedNameCandidates === undefined) {
          cachedNameCandidates = nameText
            ? await lookupLocalCardsByLooseNameText(nameText, expectedSetId, { limit: 12 })
            : null;
        }
        return {
          nameText,
          candidates: cachedNameCandidates ?? [],
        };
      };
      const prepareFullFrameForXimilar = async () => {
        if (!shouldUseXimilarProvider || !capture.crop) return;

        const fullFrameCapture = await encodeCapturedFrame(
          capture.originalUri,
          capture.originalWidth,
          capture.originalHeight,
          initialScanProfile,
          null,
          'full-frame'
        );
        if (!fullFrameCapture.base64) return;

        ximilarBase64 = fullFrameCapture.base64;
        ximilarSourceLabel = fullFrameCapture.sourceLabel;
      };
      const switchToFullFrameCapture = async (reason: string) => {
        if (!capture.crop) return false;

        logScanStage('FULL_FRAME_RETRY_STARTED', {
          reason,
          crop: {
            originX: capture.crop.originX,
            originY: capture.crop.originY,
            width: capture.crop.width,
            height: capture.crop.height,
            originalWidth: capture.originalWidth,
            originalHeight: capture.originalHeight,
          },
        });

        const fullFrameCapture = await encodeCapturedFrame(
          capture.originalUri,
          capture.originalWidth,
          capture.originalHeight,
          initialScanProfile,
          null,
          'full-frame'
        );
        if (!fullFrameCapture.base64) return false;

        bestBase64 = fullFrameCapture.base64;
        recoveryBase64 = bestBase64;
        bestUri = fullFrameCapture.uri;
        bestWidth = fullFrameCapture.width;
        bestHeight = fullFrameCapture.height;
        attemptedInitialNumberOcr = Boolean(printedNumber);
        cachedNameText = null;
        cachedTotalHintText = null;
        cachedNameCandidates = undefined;
        numberOcrDoneAt = Date.now();
        return true;
      };
      let match: ScannedCard | null = null;
      let ximilarCandidatesForConfirmation: ScanCandidate[] | null = null;
      let ximilarError: ScanErrorState | null = null;
      let ximilarResultRejectedByOcr = false;
      let ximilarResultRejectedByNameOcr = false;

      const applyNameOcrGuardToXimilarResults = async (source: string) => {
        const currentCandidates = ximilarCandidatesForConfirmation ?? [];
        const currentResolvedCards = currentCandidates
          .map((candidate) => candidate.resolvedCard as ScannedCard | null | undefined)
          .filter(Boolean) as ScannedCard[];

        if (!match && currentResolvedCards.length === 0) return false;

        const { nameText, candidates: localNameCards } = await getLocalNameCandidates();
        throwIfScanTimedOut();

        if (!nameText || localNameCards.length === 0) return false;

        const localNameIds = new Set(localNameCards.map((card) => card.id));
        const matchDisagreesWithTitle = Boolean(match && !localNameIds.has(match.id));
        const resolvedCandidateDisagreesWithTitle = currentResolvedCards.some((card) => !localNameIds.has(card.id));

        if (!matchDisagreesWithTitle && !resolvedCandidateDisagreesWithTitle) return false;

        const localCandidates = localNameCards.slice(0, 5).map(localCardToScanCandidate);
        const validatedLocalCandidates = removePrintedNumberMismatches(localCandidates, printedNumber);
        const validatedLocalMatch = isReliablePrintedNumberForValidation(printedNumber)
          ? findPrintedNumberAlignedMatch(validatedLocalCandidates, printedNumber)
          : null;
        const singleLocalMatch = validatedLocalCandidates.length === 1
          ? validatedLocalCandidates[0].resolvedCard as ScannedCard | null
          : null;

        logScanStage('XIMILAR_RESULT_REJECTED_BY_NAME_OCR', {
          source,
          nameText: nameText.slice(0, 180),
          rejectedMatch: match
            ? {
                id: match.id,
                name: match.name,
                set: match.set_name,
                number: match.number,
              }
            : null,
          rejectedCandidates: currentResolvedCards.map((card) => ({
            id: card.id,
            name: card.name,
            set: card.set_name,
            number: card.number,
          })).slice(0, 5),
          replacementCandidates: localNameCards.map((card) => ({
            id: card.id,
            name: card.name,
            set: card.set_name,
            number: card.number,
          })).slice(0, 5),
        });

        ximilarResultRejectedByNameOcr = true;
        ximilarCandidatesForConfirmation = validatedLocalCandidates;
        match = validatedLocalMatch ?? singleLocalMatch ?? null;
        recoveryXimilarCandidates = ximilarCandidatesForConfirmation;
        recoveryMatch = match;
        return true;
      };

      await prepareFullFrameForXimilar();
      throwIfScanTimedOut();

      if (shouldUseXimilarProvider) {
        console.log('[market-scan] primary provider: ximilar', {
          sourceLabel: ximilarSourceLabel,
          magicAi: true,
        });
        const ximilarResponse = await identifyWithXimilarTcg(ximilarBase64, true);
        throwIfScanTimedOut();
        if (!ximilarResponse.ok) {
          ximilarError = { ...ximilarResponse, debugDetails: ximilarResponse.details };
          setScanError(ximilarError);
        } else {
          ximilarError = null;
          setScanError(null);
          let primaryCandidates = await resolveXimilarCandidates(
            ximilarResponse.candidates.slice(0, 1),
            shouldDeferInitialNumberOcr ? null : printedNumber,
            null
          );
          throwIfScanTimedOut();
          match = findPrintedNumberAlignedMatch(primaryCandidates, printedNumber);
          ximilarCandidatesForConfirmation = primaryCandidates;
          recoveryXimilarCandidates = ximilarCandidatesForConfirmation;
          recoveryMatch = match;

          if (match && shouldDeferInitialNumberOcr) {
            const ocrPrintedNumber = await readInitialPrintedNumber();
            throwIfScanTimedOut();
            const validatedPrimaryCandidates = removePrintedNumberMismatches(primaryCandidates, ocrPrintedNumber);
            const validatedMatch = findPrintedNumberAlignedMatch(validatedPrimaryCandidates, ocrPrintedNumber);

            if (!validatedMatch && ocrPrintedNumber) {
              ximilarResultRejectedByOcr = true;
              logScanStage('XIMILAR_RESULT_REJECTED_BY_OCR', {
                printedNumber: `${ocrPrintedNumber.number}/${ocrPrintedNumber.total}`,
                numberRegion: ocrPrintedNumber.region,
                candidate: match.name,
                candidateNumber: match.number,
                candidateSet: match.set_name,
                candidateTotal: getScannedCardPrintedTotal(match),
              });
            }

            primaryCandidates = validatedPrimaryCandidates;
            match = validatedMatch;
            ximilarCandidatesForConfirmation = primaryCandidates;
            recoveryXimilarCandidates = ximilarCandidatesForConfirmation;
            recoveryMatch = match;
          }

          if (!match && ximilarResponse.candidates.length > 1) {
            const fallbackCandidates = await resolveXimilarCandidates(
              ximilarResponse.candidates.slice(1),
              printedNumber,
              null
            );
            throwIfScanTimedOut();
            ximilarCandidatesForConfirmation = removePrintedNumberMismatches(
              [...primaryCandidates, ...fallbackCandidates],
              printedNumber
            );
            match = findPrintedNumberAlignedMatch(ximilarCandidatesForConfirmation, printedNumber);
            recoveryXimilarCandidates = ximilarCandidatesForConfirmation;
            recoveryMatch = match;
          }

          if (match && shouldDeferInitialNumberOcr && !printedNumber) {
            const ocrPrintedNumber = await readInitialPrintedNumber();
            throwIfScanTimedOut();
            ximilarCandidatesForConfirmation = removePrintedNumberMismatches(
              ximilarCandidatesForConfirmation,
              ocrPrintedNumber
            );
            const validatedMatch = findPrintedNumberAlignedMatch(ximilarCandidatesForConfirmation, ocrPrintedNumber);

            if (!validatedMatch && ocrPrintedNumber) {
              ximilarResultRejectedByOcr = true;
              logScanStage('XIMILAR_RESULT_REJECTED_BY_OCR', {
                printedNumber: `${ocrPrintedNumber.number}/${ocrPrintedNumber.total}`,
                numberRegion: ocrPrintedNumber.region,
                candidate: match.name,
                candidateNumber: match.number,
                candidateSet: match.set_name,
                candidateTotal: getScannedCardPrintedTotal(match),
              });
            }

            match = validatedMatch;
            recoveryXimilarCandidates = ximilarCandidatesForConfirmation;
            recoveryMatch = match;
          }
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
        await applyNameOcrGuardToXimilarResults('ximilar-crop');

        if (
          !match
          && shouldDeferInitialNumberOcr
          && capture.crop
          && (ximilarResultRejectedByOcr || ximilarResultRejectedByNameOcr || Boolean(ximilarCandidatesForConfirmation?.length))
        ) {
          const switchedToFullFrame = await switchToFullFrameCapture(
            ximilarResultRejectedByOcr
              ? 'ocr-rejected-crop-result'
              : ximilarResultRejectedByNameOcr
                ? 'name-ocr-rejected-crop-result'
                : 'unresolved-crop-candidates'
          );
          throwIfScanTimedOut();

          if (switchedToFullFrame) {
            const fullFrameXimilarResponse = await identifyWithXimilarTcg(bestBase64, false);
            throwIfScanTimedOut();

            if (fullFrameXimilarResponse.ok) {
              const fullFramePrintedNumber = await readInitialPrintedNumber();
              throwIfScanTimedOut();
              const fullFrameCandidates = await resolveXimilarCandidates(
                fullFrameXimilarResponse.candidates,
                fullFramePrintedNumber,
                null
              );
              throwIfScanTimedOut();

              ximilarCandidatesForConfirmation = removePrintedNumberMismatches(
                fullFrameCandidates,
                fullFramePrintedNumber
              );
              match = findPrintedNumberAlignedMatch(ximilarCandidatesForConfirmation, fullFramePrintedNumber);
              recoveryXimilarCandidates = ximilarCandidatesForConfirmation;
              recoveryMatch = match;

              console.log('[market-scan] local resolve after full-frame Ximilar retry', {
                printedNumber: fullFramePrintedNumber ? `${fullFramePrintedNumber.number}/${fullFramePrintedNumber.total}` : null,
                candidates: ximilarCandidatesForConfirmation.map((candidate) => ({
                  name: candidate.name,
                  setName: candidate.setName,
                  setCode: candidate.setCode,
                  number: candidate.number,
                  resolved: Boolean(candidate.resolvedCard),
                })).slice(0, 5),
                resolved: match ? {
                  id: match.id,
                  name: match.name,
                  set: match.set_name,
                  number: match.number,
                } : null,
              });
              await applyNameOcrGuardToXimilarResults('ximilar-full-frame');
            }
          }
        }

        if (!match && !ximilarCandidatesForConfirmation?.length) {
          console.log('[market-scan] retrying Ximilar with framed crop + Magic AI');
          const ximilarMagicResponse = await identifyWithXimilarTcg(bestBase64, true);
          throwIfScanTimedOut();
          if (!ximilarMagicResponse.ok) {
            ximilarError = { ...ximilarMagicResponse, debugDetails: ximilarMagicResponse.details };
            setScanError(ximilarError);
          } else {
            ximilarError = null;
            setScanError(null);
            let primaryCandidates = await resolveXimilarCandidates(
              ximilarMagicResponse.candidates.slice(0, 1),
              printedNumber,
              null
            );
            throwIfScanTimedOut();
            match = findPrintedNumberAlignedMatch(primaryCandidates, printedNumber);
            ximilarCandidatesForConfirmation = primaryCandidates;
            recoveryXimilarCandidates = ximilarCandidatesForConfirmation;
            recoveryMatch = match;

            if (!match && ximilarMagicResponse.candidates.length > 1) {
              const fallbackCandidates = await resolveXimilarCandidates(
                ximilarMagicResponse.candidates.slice(1),
                printedNumber,
                null
              );
              throwIfScanTimedOut();
              ximilarCandidatesForConfirmation = removePrintedNumberMismatches(
                [...primaryCandidates, ...fallbackCandidates],
                printedNumber
              );
              match = findPrintedNumberAlignedMatch(ximilarCandidatesForConfirmation, printedNumber);
              recoveryXimilarCandidates = ximilarCandidatesForConfirmation;
              recoveryMatch = match;
            }

            if (match && shouldDeferInitialNumberOcr && !printedNumber) {
              const ocrPrintedNumber = await readInitialPrintedNumber();
              throwIfScanTimedOut();
              const validatedCandidates = removePrintedNumberMismatches(
                ximilarCandidatesForConfirmation,
                ocrPrintedNumber
              );
              const validatedMatch = findPrintedNumberAlignedMatch(validatedCandidates, ocrPrintedNumber);

              if (!validatedMatch && ocrPrintedNumber) {
                ximilarResultRejectedByOcr = true;
                logScanStage('XIMILAR_RESULT_REJECTED_BY_OCR', {
                  source: 'magic-ai',
                  printedNumber: `${ocrPrintedNumber.number}/${ocrPrintedNumber.total}`,
                  numberRegion: ocrPrintedNumber.region,
                  candidate: match.name,
                  candidateNumber: match.number,
                  candidateSet: match.set_name,
                  candidateTotal: getScannedCardPrintedTotal(match),
                });
              }

              primaryCandidates = validatedCandidates.slice(0, primaryCandidates.length);
              match = validatedMatch;
              ximilarCandidatesForConfirmation = validatedCandidates;
              recoveryXimilarCandidates = ximilarCandidatesForConfirmation;
              recoveryMatch = match;
            }
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
          await applyNameOcrGuardToXimilarResults('magic-ai');
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
        throwIfScanTimedOut();
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
          const nameText = await getNameText(bestUri, bestWidth, bestHeight);
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
          const nameText = await getNameText(bestUri, bestWidth, bestHeight);
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
          const nameText = await getNameText(bestUri, bestWidth, bestHeight);
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
            const nameText = await getNameText(bestUri, bestWidth, bestHeight);
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
        const nameText = await getNameText(bestUri, bestWidth, bestHeight);
        let totalHintText = '';
        let totalHintPrintedNumber: PrintedNumber | null = null;
        let inferredTotal: number | null = null;
        let totalNameCandidates: LocalScanCard[] | null = null;
        let fusionResult = await identifyWithLocalFusion(null, expectedSetId, nameText);
        const nameCandidates = await lookupLocalCardsByNameText(nameText, expectedSetId);
        if (!fusionResult?.match && hasHardScanBudget(900)) {
          totalHintText = await getTotalHintText(bestUri, bestWidth, bestHeight);
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
          recoveryBase64 = bestBase64;
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
        throwIfScanTimedOut();
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
      recoveryMatch = match;
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
        recordAchievementEvent('card_scanned', {
          cardId: match.id,
          setId: match.set_id,
          mode: 'auto',
        }).catch((achievementError) => {
          console.log('Scan achievement check failed:', achievementError);
        });
        Vibration.vibrate([0, 90, 40, 90]);
        setTimeout(() => setLastScanned('👉 Next card!'), 500);
        resetScanState(900);
        return;
      }

      // Manual + market: show confirmation overlay
      throwIfScanTimedOut();
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
      const isImageError = isLikelyImageCaptureError(errorMessage);

      if (!isAbort && recoveryXimilarCandidates?.length) {
        logScanStage('CANDIDATES_RENDER_STARTED', {
          recoveredFrom: 'SCAN_RESULT_RENDER_FAILED',
          error: errorMessage,
          candidates: recoveryXimilarCandidates.length,
        });
        stopScanningMessages();
        setScanError(null);
        setProcessingOcr(false);
        setPendingConfirmation({
          card: recoveryMatch ?? undefined,
          candidates: recoveryXimilarCandidates,
          base64: recoveryBase64,
          isMarket: isMarketMode,
          editionChoiceRequired: false,
        });
        return;
      }

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
      if (!isAuto && !scanTimedOut) setScanError(nextError);
      stopScanningMessages();
      scanCooldownRef.current = false;
      setProcessingOcr(false);
      setLastScanned(null);
      if (isAuto) setFrozenFrameUri(null);
    } finally {
      if (hardTimeout) clearTimeout(hardTimeout);
    }
  }, [cameraReady, fingerprintScan, isMarketMode, logScanDebug, lookupCardBySetNumber, processingOcr, resetScanState, resolveCardInExpectedSet, selectedBinder, startScanningMessages, stopScanningMessages]);

  useEffect(() => {
    handleCaptureRef.current = handleCapture;
  }, [handleCapture]);

  const handleBinderPageCapture = useCallback(async () => {
    if (!camera.current || !cameraReady || scanCooldownRef.current || processingOcr) {
      return;
    }

    setAutoScanActive(false);
    setProcessingOcr(true);
    setPageScanProgress({ current: 0, total: activeGridSlotCount });
    setGridScanSlots([]);
    setScannedCards([]);
    scannedCardIdsRef.current.clear();
    setScanError(null);
    setLastScanned(null);
    setFrozenFrameUri(null);
    scanCooldownRef.current = true;
    startScanningMessages();

    try {
      const photo = await camera.current.takePhoto({ flash: 'off', enableShutterSound: false });
      const capturedUri = photo.path
        ? photo.path.startsWith('file://')
          ? photo.path
          : `file://${photo.path}`
        : null;

      if (!capturedUri) {
        throw new Error('Camera returned a photo without a file path.');
      }

      setFrozenFrameUri(capturedUri);
      const pageFrame = scannerFrameRectRef.current
        ? { ...scannerFrameRectRef.current, marginRatio: BINDER_PAGE_FRAME_MARGIN_RATIO }
        : null;
      const pageCrop = getCenteredCardCrop(photo.width, photo.height, pageFrame);
      const pageProfile = activeGridSize >= 4
        ? { width: 2000, compress: 0.9 }
        : BINDER_PAGE_SCAN_PROFILE;
      const pageActions: ImageManipulator.Action[] = [
        ...(pageCrop ? [{ crop: pageCrop }] : []),
        { resize: { width: pageProfile.width } },
      ];
      const pageImage = await ImageManipulator.manipulateAsync(
        capturedUri,
        pageActions,
        { compress: pageProfile.compress, format: ImageManipulator.SaveFormat.JPEG }
      );
      const pageMatches: ScannedCard[] = [];
      const seenIds = new Set(scannedCardIdsRef.current);

      for (let slot = 0; slot < activeGridSlotCount; slot += 1) {
        setPageScanProgress({ current: slot + 1, total: activeGridSlotCount });
        const slotCrop = getBinderPageSlotCrop(pageImage.width, pageImage.height, slot, activeGridSize);
        const slotImage = await ImageManipulator.manipulateAsync(
          pageImage.uri,
          [
            { crop: slotCrop },
            { resize: { width: BINDER_PAGE_CARD_PROFILE.width } },
          ],
          {
            compress: BINDER_PAGE_CARD_PROFILE.compress,
            format: ImageManipulator.SaveFormat.JPEG,
            base64: true,
          }
        );

        const row = Math.floor(slot / activeGridSize);
        const col = slot % activeGridSize;

        if (!slotImage.base64) {
          const emptySlot: GridScanSlot = {
            slot: slot + 1,
            row,
            col,
            gridSize: activeGridSize,
            cropUri: slotImage.uri,
            card: null,
            status: 'Empty',
            included: false,
          };
          setGridScanSlots((prev) => [...prev, emptySlot]);
          continue;
        }

        const match = await identifyBinderPageCard({
          base64: slotImage.base64,
          uri: slotImage.uri,
          width: slotImage.width,
          height: slotImage.height,
          slot: slot + 1,
        });

        const cardWithSlot = match
          ? { ...match, scanSlot: slot + 1, scanCropUri: slotImage.uri }
          : null;
        const isDuplicateInBatch = Boolean(cardWithSlot && seenIds.has(cardWithSlot.id));
        const slotResult: GridScanSlot = {
          slot: slot + 1,
          row,
          col,
          gridSize: activeGridSize,
          cropUri: slotImage.uri,
          card: cardWithSlot,
          status: cardWithSlot ? (isDuplicateInBatch ? 'Check Match' : 'Confirmed') : 'Not Identified',
          included: Boolean(cardWithSlot && !isDuplicateInBatch),
        };
        setGridScanSlots((prev) => [...prev, slotResult]);

        if (!cardWithSlot || isDuplicateInBatch) continue;
        seenIds.add(cardWithSlot.id);
        pageMatches.push(cardWithSlot);
      }

      pageMatches.forEach((card) => scannedCardIdsRef.current.add(card.id));
      setScannedCards(pageMatches);
      setLastScanned(`${pageMatches.length} of ${activeGridSlotCount} grid positions identified`);
      Vibration.vibrate([0, 80, 40, 80]);
      setStep('review');
      Alert.alert(
        pageMatches.length ? 'Grid scan complete' : 'Grid scan needs review',
        pageMatches.length
          ? `Found ${pageMatches.length} of ${activeGridSlotCount} card${pageMatches.length === 1 ? '' : 's'}. Review the grid before importing.`
          : 'No confident matches were found, but the grid positions are ready to review, retake, or mark empty.'
      );
    } catch (error: any) {
      console.log('Binder page scan failed:', error);
      setScanError(makeScanError(
        isLikelyImageCaptureError(error?.message) ? 'image' : 'render',
        'BINDER_PAGE_SCAN_FAILED',
        'The binder page scan could not be completed.',
        error?.message ?? String(error),
        undefined,
        error?.stack
      ));
    } finally {
      stopScanningMessages();
      setProcessingOcr(false);
      setPageScanProgress(null);
      scanCooldownRef.current = false;
      setFrozenFrameUri(null);
    }
  }, [
    activeGridSize,
    activeGridSlotCount,
    cameraReady,
    identifyBinderPageCard,
    processingOcr,
    startScanningMessages,
    stopScanningMessages,
  ]);

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
    recordAchievementEvent('card_scanned', {
      cardId: card.id,
      setId: card.set_id,
      mode: isMarket ? 'market' : isInventoryMode ? 'inventory' : 'binder',
    }).catch((achievementError) => {
      console.log('Scan achievement check failed:', achievementError);
    });

    if (isInventoryMode) {
      try {
        // TODO seller scanner: keep camera warm and update the in-camera batch/cart once seller inventory queues are lifted into this route.
        await scanStore.triggerCallback(base64, card);
        setAutoScanActive(false);
        setFrozenFrameUri(null);
        router.back();
      } catch (error: any) {
        console.log('Scan callback failed', {
          message: error?.message ?? String(error),
          stack: SHOW_SCAN_DEBUG ? error?.stack : undefined,
        });
        setScanError(makeScanError(
          'render',
          'SCAN_CALLBACK_FAILED',
          'The scan completed, but the result could not be handed back to the previous screen.',
          error?.message ?? String(error),
          undefined,
          error?.stack
        ));
      }
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
    setPageScanProgress(null);
    setLastScanned(null);
  }, []);

  const handleSearchManually = useCallback(() => {
    setPendingConfirmation(null);
    setScanError(null);
    setAutoScanActive(false);
    setFrozenFrameUri(null);
    setPageScanProgress(null);
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

  const cardsReadyForImport = gridScanSlots.length
    ? gridScanSlots
        .filter((slot) => slot.included && slot.card)
        .map((slot) => slot.card as ScannedCard)
    : scannedCards;

  const handleGridSlotPress = useCallback((slot: GridScanSlot) => {
    const removeSlotCard = () => {
      if (slot.card?.id) {
        scannedCardIdsRef.current.delete(slot.card.id);
        setScannedCards((prev) => prev.filter((card) => card.id !== slot.card?.id));
      }
    };

    Alert.alert(
      `Position ${slot.slot}`,
      slot.card
        ? `${slot.card.name}\n${formatScanCardSubtitle(slot.card.set_name, slot.card.number, slot.card.editionHint)}`
        : slot.status === 'Empty'
          ? 'This position is marked empty.'
          : 'No confident card match was found for this crop.',
      [
        ...(slot.card
          ? [{
              text: slot.included ? 'Exclude from import' : 'Include in import',
              onPress: () => {
                setGridScanSlots((prev) => prev.map((current) =>
                  current.slot === slot.slot
                    ? {
                        ...current,
                        included: !slot.included,
                        status: !slot.included ? 'Confirmed' : 'Check Match',
                      }
                    : current
                ));
                if (slot.included) removeSlotCard();
                if (!slot.included && slot.card) {
                  scannedCardIdsRef.current.add(slot.card.id);
                  setScannedCards((prev) => prev.some((card) => card.id === slot.card?.id) ? prev : [...prev, slot.card as ScannedCard]);
                }
              },
            }]
          : []),
        {
          text: 'Mark empty',
          onPress: () => {
            removeSlotCard();
            setGridScanSlots((prev) => prev.map((current) =>
              current.slot === slot.slot
                ? { ...current, card: null, status: 'Empty', included: false }
                : current
            ));
          },
        },
        {
          text: 'Retake single card',
          onPress: () => {
            selectCameraMode('single');
            setStep('scanning');
            setLastScanned(`Retake position ${slot.slot}`);
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }, [selectCameraMode]);

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

      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 43 }}>
        <FlatList
          data={loadingBinders ? [] : binders}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 132 }}
          ListHeaderComponent={
            <View style={{ gap: 16, marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <StackrBackButton onPress={() => router.back()} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '900' }}>
                    Stackr scanner
                  </Text>
                  <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '700', marginTop: 1 }}>
                    Choose a destination before opening the camera.
                  </Text>
                </View>
              </View>

              <HeroActionPanel
                title="Scan Cards"
                subtitle="Capture Pokemon cards, confirm the match, and send each result straight into the right Stackr workflow."
                icon="scan-outline"
                primaryLabel={selectedBinder ? 'Start Binder Scan' : 'Choose Binder'}
                onPrimaryPress={() => {
                  if (!selectedBinder) {
                    Alert.alert('Select a binder', 'Please select which binder to scan into.');
                    return;
                  }
                  setStep('scanning');
                }}
                secondaryLabel="Manual Search"
                onSecondaryPress={handleSearchManually}
              >
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <StatPill label="Binders" value={String(binders.length)} icon="albums-outline" />
                  <StatPill label="Destination" value={selectedBinder ? selectedBinder.name : 'Not set'} icon="navigate-outline" tone={selectedBinder ? 'green' : 'gold'} />
                </View>
              </HeroActionPanel>

              <View>
                <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '900', marginBottom: 9 }}>
                  Scan modes
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  <ScanModeCard
                    title="Add to Collection"
                    body="Identify cards and check values before saving."
                    icon="sparkles-outline"
                    onPress={() => router.replace({ pathname: '/scan', params: { mode: 'market' } })}
                    tone="green"
                  />
                  <ScanModeCard
                    title="Add to Binder"
                    body="Add cards directly into the binder you choose below."
                    icon="albums-outline"
                    selected
                    onPress={() => {}}
                  />
                  <ScanModeCard
                    title="Seller Stock In"
                    body="Scan purchased or received stock into an intake batch."
                    icon="archive-outline"
                    onPress={() => router.replace({ pathname: '/scan', params: { mode: 'inventory', flow: 'stock_in' } })}
                    tone="neutral"
                  />
                  <ScanModeCard
                    title="Seller Stock Out"
                    body="Scan sold, shipped or removed stock into an out cart."
                    icon="exit-outline"
                    onPress={() => router.replace({ pathname: '/scan', params: { mode: 'inventory', flow: 'stock_out' } })}
                    tone="gold"
                  />
                  <ScanModeCard
                    title="Create Listing"
                    body="Open listing creation with scan and photo requirements."
                    icon="pricetag-outline"
                    onPress={() => router.push('/listing/new' as any)}
                    tone="green"
                  />
                  <ScanModeCard
                    title="Build Trade or Offer"
                    body="Open trade tools for cards being offered."
                    icon="swap-horizontal-outline"
                    onPress={() => router.push({ pathname: '/(tabs)/market', params: { mode: 'trade' } } as any)}
                    tone="gold"
                  />
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '900' }}>
                    Choose binder
                  </Text>
                  <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '700', marginTop: 2 }}>
                    Scans will queue here before you save the batch.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => router.push('/binder/new?returnTo=scan')}
                  style={{ backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: 12, paddingVertical: 9 }}
                >
                  <Text style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 12 }}>New Binder</Text>
                </TouchableOpacity>
              </View>
            </View>
          }
          ListEmptyComponent={
            loadingBinders ? (
              <PremiumCard style={{ alignItems: 'center', paddingVertical: 24 }}>
                <ActivityIndicator color={theme.colors.primary} />
                <Text style={{ color: theme.colors.textSoft, marginTop: 10, fontWeight: '700' }}>
                  Loading binders...
                </Text>
              </PremiumCard>
            ) : (
              <EmptyStateCard
                icon="albums-outline"
                title="No binders yet"
                body="Create a binder first, then scan cards straight into it."
                actionLabel="Create Binder"
                onAction={() => router.push('/binder/new?returnTo=scan')}
              />
            )
          }
          renderItem={({ item }) => {
            const selected = selectedBinder?.id === item.id;

            return (
              <TouchableOpacity onPress={() => setSelectedBinder(item)} activeOpacity={0.84}>
                <PremiumCard selected={selected} style={{ marginBottom: 10, padding: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View
                      style={{
                        width: 50,
                        height: 58,
                        borderRadius: 12,
                        backgroundColor: item.color || theme.colors.primary,
                        borderWidth: 2,
                        borderColor: '#FFFFFF',
                        ...{
                          shadowColor: '#1B2A4B',
                          shadowOpacity: 0.1,
                          shadowRadius: 8,
                          shadowOffset: { width: 0, height: 4 },
                          elevation: 3,
                        },
                      }}
                    />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                        <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 15 }} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <TrustBadge
                          label={item.type === 'official' ? 'Official' : 'Custom'}
                          icon={item.type === 'official' ? 'ribbon-outline' : 'folder-outline'}
                          tone={item.type === 'official' ? 'gold' : 'purple'}
                        />
                      </View>
                      <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 5, fontWeight: '700' }}>
                        {selected ? 'Ready for binder scan' : 'Tap to use as scan destination'}
                      </Text>
                    </View>
                    <View
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 15,
                        backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
                        borderWidth: 1,
                        borderColor: selected ? theme.colors.primary : theme.colors.border,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ color: selected ? '#FFFFFF' : theme.colors.textSoft, fontSize: 14, fontWeight: '900' }}>
                        {selected ? '✓' : '>'}
                      </Text>
                    </View>
                  </View>
                </PremiumCard>
              </TouchableOpacity>
            );
          }}
        />

        <View style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 16 }}>
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
              opacity: selectedBinder ? 1 : 0.78,
              shadowColor: theme.colors.primary,
              shadowOpacity: selectedBinder ? 0.24 : 0,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 8 },
              elevation: selectedBinder ? 5 : 0,
            }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 16 }}>
              {selectedBinder ? `Scan into "${selectedBinder.name}"` : 'Select a binder first'}
            </Text>
          </TouchableOpacity>
        </View>
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
        <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 16 }}>
          <FlatList
            key={gridScanSlots.length ? `grid-${activeGridSize}` : 'single-list'}
            data={gridScanSlots.length ? gridScanSlots : scannedCards}
            keyExtractor={(item: ScannedCard | GridScanSlot) => gridScanSlots.length ? `slot-${(item as GridScanSlot).slot}` : (item as ScannedCard).id}
            numColumns={gridScanSlots.length ? activeGridSize : 1}
            columnWrapperStyle={gridScanSlots.length ? { gap: 8, marginBottom: 8 } : undefined}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 286, flexGrow: scannedCards.length === 0 && gridScanSlots.length === 0 ? 1 : 0 }}
            ListHeaderComponent={
              <View style={{ gap: 16, marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <StackrBackButton onPress={() => setStep('scanning')} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 24, fontWeight: '900' }}>
                      Review Cards
                    </Text>
                    <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '700', marginTop: 2 }}>
                      {gridScanSlots.length
                        ? 'Review each grid position before importing confirmed cards.'
                        : 'Confirm the batch before importing it.'}
                    </Text>
                  </View>
                </View>

                <HeroActionPanel
                  title={gridScanSlots.length ? 'Grid Scan Review' : 'Scan Batch'}
                  subtitle={gridScanSlots.length
                    ? 'Positions keep the same layout as your photo. Tap a slot to exclude it, mark it empty, or retake that card.'
                    : 'Each confirmed card stays queued here until you add the batch or remove a mismatch.'}
                  icon="checkmark-done-outline"
                >
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    <StatPill label="Confirmed" value={String(cardsReadyForImport.length)} icon="layers-outline" tone="green" />
                    {gridScanSlots.length ? <StatPill label="Grid" value={`${activeGridSize} x ${activeGridSize}`} icon="grid-outline" tone="purple" /> : null}
                    <StatPill label="Destination" value={selectedBinder?.name ?? 'Collection'} icon="albums-outline" />
                  </View>
                </HeroActionPanel>

                <View style={{ backgroundColor: theme.colors.card, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, padding: 12 }}>
                  <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '900', marginBottom: 9 }}>
                    Import destination
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 10 }}>
                    <TouchableOpacity
                      onPress={() => setSelectedBinder(null)}
                      style={{
                        minHeight: 40,
                        paddingHorizontal: 12,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: !selectedBinder ? theme.colors.primary : theme.colors.border,
                        backgroundColor: !selectedBinder ? theme.colors.primary : theme.colors.surface,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ color: !selectedBinder ? '#FFFFFF' : theme.colors.text, fontSize: 12, fontWeight: '900' }} numberOfLines={1}>
                        Collection
                      </Text>
                    </TouchableOpacity>
                    {binders.map((binder) => {
                      const selected = selectedBinder?.id === binder.id;
                      return (
                        <TouchableOpacity
                          key={binder.id}
                          onPress={() => setSelectedBinder(binder)}
                          style={{
                            minHeight: 40,
                            paddingHorizontal: 12,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: selected ? theme.colors.primary : theme.colors.border,
                            backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Text style={{ color: selected ? '#FFFFFF' : theme.colors.text, fontSize: 12, fontWeight: '900' }} numberOfLines={1}>
                            {binder.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                    <TouchableOpacity
                      onPress={() => router.push('/binder/new?returnTo=scan-review')}
                      style={{ minHeight: 40, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.card, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '900' }}>New binder</Text>
                    </TouchableOpacity>
                  </ScrollView>
                </View>
              </View>
            }
            ListEmptyComponent={
              <View style={{ flex: 1, justifyContent: 'center' }}>
                <EmptyStateCard
                  icon="scan-outline"
                  title="No cards scanned yet"
                  body="Return to the camera and scan a card flat in frame. Results will appear here for confirmation."
                  actionLabel="Back to Scanner"
                  onAction={() => setStep('scanning')}
                />
              </View>
            }
            renderItem={({ item }) => {
              if (gridScanSlots.length) {
                const slot = item as GridScanSlot;
                const tone = slot.status === 'Confirmed'
                  ? '#10B981'
                  : slot.status === 'Check Match'
                    ? '#F59E0B'
                    : slot.status === 'Empty'
                      ? theme.colors.textSoft
                      : '#EF4444';
                return (
                  <TouchableOpacity
                    onPress={() => handleGridSlotPress(slot)}
                    activeOpacity={0.86}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      backgroundColor: theme.colors.card,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: slot.included ? theme.colors.primary : theme.colors.border,
                      padding: 6,
                    }}
                  >
                    <View style={{ aspectRatio: CARD_ASPECT_RATIO, borderRadius: 10, overflow: 'hidden', backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }}>
                      {slot.cropUri ? (
                        <Image source={{ uri: slot.cropUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      ) : null}
                    </View>
                    <Text style={{ color: theme.colors.textSoft, fontSize: 9, fontWeight: '900', marginTop: 5 }}>
                      Position {slot.slot}
                    </Text>
                    <Text style={{ color: theme.colors.text, fontSize: 10, fontWeight: '900', marginTop: 2 }} numberOfLines={2}>
                      {slot.card?.name ?? slot.status}
                    </Text>
                    <Text style={{ color: tone, fontSize: 9, fontWeight: '900', marginTop: 3 }} numberOfLines={1}>
                      {slot.included ? slot.status : slot.status === 'Confirmed' ? 'Excluded' : slot.status}
                    </Text>
                  </TouchableOpacity>
                );
              }

              const itemCard = item as ScannedCard;
              return (
              <PremiumCard style={{ marginBottom: 10, padding: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 58, height: 80, borderRadius: 10, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden' }}>
                    {itemCard.image_small ? (
                      <EditionAwareCardImage
                        uri={itemCard.image_small}
                        cardId={itemCard.id}
                        rawData={itemCard.raw_data}
                        editionHint={itemCard.editionHint}
                        sourceSize="small"
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="contain"
                      />
                    ) : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                      <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 15, flexShrink: 1 }} numberOfLines={1}>
                        {itemCard.name}
                      </Text>
                      <TrustBadge label="Matched" icon="checkmark-circle-outline" tone="green" />
                    </View>
                    <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 4, fontWeight: '700' }}>
                      {formatScanCardSubtitle(itemCard.set_name, itemCard.number, itemCard.editionHint)}
                    </Text>
                    {itemCard.rarity ? (
                      <Text style={{ color: '#B7791F', fontSize: 11, marginTop: 3, fontWeight: '900' }}>
                        {itemCard.rarity}
                      </Text>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      scannedCardIdsRef.current.delete(itemCard.id);
                      setScannedCards((prev) => prev.filter((c) => c.id !== itemCard.id));
                    }}
                    style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FCA5A5' }}
                  >
                    <Text style={{ color: '#991B1B', fontWeight: '900', fontSize: 16 }}>x</Text>
                  </TouchableOpacity>
                </View>
              </PremiumCard>
              );
            }}
          />

          {(cardsReadyForImport.length > 0 || gridScanSlots.length > 0) && (
            <View style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 16, gap: 9 }}>
              <View style={{ flexDirection: 'row', gap: 9 }}>
                <TouchableOpacity
                  onPress={() => setStep('scanning')}
                  style={{ flex: 1, backgroundColor: theme.colors.card, borderRadius: 14, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border }}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Scan More</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => router.push('/binder/new?returnTo=scan-review')}
                  style={{ flex: 1, backgroundColor: theme.colors.secondary, borderRadius: 14, paddingVertical: 12, alignItems: 'center' }}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: '900' }}>New Binder</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={() => {
                  if (!cardsReadyForImport.length && !gridScanSlots.length) return;
                  Alert.alert(
                    'Discard scanned cards?',
                    'Remove all scanned cards from this batch review.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Discard All',
                        style: 'destructive',
                        onPress: () => {
                          scannedCardIdsRef.current.clear();
                          setScannedCards([]);
                          setGridScanSlots([]);
                          setStep('scanning');
                        },
                      },
                    ]
                  );
                }}
                style={{ backgroundColor: '#F8FAFC', borderRadius: 14, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border }}
              >
                <Text style={{ color: theme.colors.textSoft, fontWeight: '900' }}>Discard Batch</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={async () => {
                  if (!cardsReadyForImport.length) {
                    Alert.alert('No confirmed cards', 'Confirm at least one grid position before importing.');
                    return;
                  }
                  try {
                    setScanning(true);
                    const { supabase } = await import('../../lib/supabase');
                    await Promise.all(cardsReadyForImport.map((card) =>
                      ensureOwnedCardQuantity(
                        { cardId: card.id, setId: card.set_id },
                        { increaseBy: 1 }
                      )
                    ));

                    if (selectedBinder) {
                      const rows = cardsReadyForImport.map((card) => ({
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
                    }

                    const destinationLabel = selectedBinder ? `"${selectedBinder.name}"` : 'your collection';
                    Alert.alert(
                      'All added',
                      `${cardsReadyForImport.length} card${cardsReadyForImport.length !== 1 ? 's' : ''} added to ${destinationLabel}.`,
                      selectedBinder
                        ? [
                            { text: 'Go to binder', onPress: () => router.replace({ pathname: '/binder/[id]', params: { id: selectedBinder.id } }) },
                            { text: 'Scan more', onPress: () => { setScannedCards([]); setGridScanSlots([]); scannedCardIdsRef.current.clear(); setStep('scanning'); } },
                          ]
                        : [
                            { text: 'OK' },
                            { text: 'Scan more', onPress: () => { setScannedCards([]); setGridScanSlots([]); scannedCardIdsRef.current.clear(); setStep('scanning'); } },
                          ]
                    );
                  } catch (error: any) {
                    Alert.alert('Error', error?.message ?? 'Could not add cards.');
                  } finally {
                    setScanning(false);
                  }
                }}
                disabled={scanning || !cardsReadyForImport.length}
                style={{ backgroundColor: theme.colors.primary, borderRadius: 15, paddingVertical: 16, alignItems: 'center', opacity: scanning || !cardsReadyForImport.length ? 0.6 : 1, shadowColor: theme.colors.primary, shadowOpacity: 0.24, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 5 }}
              >
                {scanning ? <ActivityIndicator color="#FFFFFF" /> : (
                  <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 16 }}>
                    Add Confirmed Cards
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // ===============================
  // PERMISSION / NO DEVICE
  // ===============================

  if (!hasPermission && isInventoryMode) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '900', textAlign: 'center', marginBottom: 12 }}>Camera access needed</Text>
          <Text style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginBottom: 24, lineHeight: 21 }}>
            Stackr uses your camera to recognise cards for seller inventory scanning.
          </Text>
          <TouchableOpacity onPress={requestPermission} style={{ backgroundColor: theme.colors.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, marginBottom: 12, minHeight: 50, justifyContent: 'center' }}>
            <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 16 }}>Allow camera access</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSearchManually} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontWeight: '700' }}>Search manually</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

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

  if (!device && isInventoryMode) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '900', textAlign: 'center', marginBottom: 12 }}>Camera unavailable</Text>
          <Text style={{ color: 'rgba(255,255,255,0.72)', textAlign: 'center', lineHeight: 21, marginBottom: 24 }}>
            Try again, or search for the card manually.
          </Text>
          <TouchableOpacity onPress={handleSearchManually} style={{ backgroundColor: theme.colors.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, minHeight: 50, justifyContent: 'center' }}>
            <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 16 }}>Search manually</Text>
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

  if (cameraError && isInventoryMode) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '900', textAlign: 'center', marginBottom: 12 }}>
            Camera unavailable
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.72)', textAlign: 'center', lineHeight: 21, marginBottom: 24 }}>
            Try again, or search for the card manually.
          </Text>
          <TouchableOpacity
            onPress={() => setCameraError(null)}
            style={{ backgroundColor: theme.colors.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, marginBottom: 12, minHeight: 50, justifyContent: 'center' }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 16 }}>Try again</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSearchManually} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontWeight: '700' }}>Search manually</Text>
          </TouchableOpacity>
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

  const sellerScannerInstruction = isInventoryMode
    ? pendingConfirmation
      ? 'Review match.'
      : processingOcr
        ? 'Reading card.'
        : autoScanActive
          ? 'Place card inside frame.'
          : 'Starting scanner.'
    : null;
  const scannerFrameColor = isInventoryMode
    ? pendingConfirmation
      ? '#F59E0B'
      : processingOcr
        ? theme.colors.primary
        : autoScanActive
          ? '#10B981'
          : 'rgba(255,255,255,0.62)'
    : autoScanActive
      ? '#10B981'
      : processingOcr
      ? theme.colors.primary
      : 'rgba(255,255,255,0.5)';
  const reviewTitle = isInventoryMode
    ? 'Review match'
    : pendingConfirmation?.editionChoiceRequired
      ? 'Card found - choose the edition'
      : 'Is this the right card?';
  const rejectLabel = isInventoryMode ? 'Cancel' : 'Wrong';
  const confirmLabel = isInventoryMode ? (isSellerStockOut ? 'Add to out cart' : 'Add to batch') : 'Correct';

  // ===============================
  // SCANNING STEP
  // ===============================

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <Stack.Screen options={{ headerShown: false }} />
      <Camera
        ref={camera}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        device={device}
        isActive={cameraIsActive}
        photo={true}
        torch={torch ? 'on' : 'off'}
        onInitialized={() => {
          setCameraReady(true);
          setCameraError(null);
        }}
        onError={(error) => {
          const message = String(error?.message ?? '');
          const code = String(error?.code ?? '');
          setCameraReady(false);
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
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 22, lineHeight: 24 }}>✕</Text>
          </TouchableOpacity>

          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '900' }}>
              {isInventoryMode ? 'Inventory Scanner' : isMarketMode ? 'Market Scan' : cameraMode === 'grid' ? 'Grid Scan' : 'Card Scan'}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 }}>
              {isInventoryMode
                ? `${sellerModeLabel} · ${sellerReason}`
                : isMarketMode
                ? 'Scan card to view market value'
                : cameraMode === 'grid'
                ? `${getGridScanLabel(gridScanSize)} grid scan`
                : `${scannedCards.length} card${scannedCards.length !== 1 ? 's' : ''} scanned`}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TouchableOpacity
              onPress={() => setTorch((prev) => !prev)}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: torch ? '#F59E0B' : 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', borderWidth: torch ? 2 : 0, borderColor: '#F59E0B' }}
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

        {/* Scan mode toggle */}
        {isInventoryMode && (
          <View style={{ alignItems: 'center', marginTop: -4, marginBottom: 8 }}>
            <View style={{ minHeight: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: sellerFlow === 'stock_out' ? 'rgba(249,115,22,0.18)' : 'rgba(105,56,245,0.20)', borderWidth: 1, borderColor: sellerFlow === 'stock_out' ? 'rgba(251,146,60,0.48)' : 'rgba(167,139,250,0.50)', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name={sellerFlow === 'stock_out' ? 'cart-outline' : 'archive-outline'} size={17} color="#FFFFFF" />
              <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '900' }}>{sellerModeLabel}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12, fontWeight: '700' }}>{sellerReason}</Text>
            </View>
          </View>
        )}

        {!isInventoryMode && (
          <View style={{ alignItems: 'center', marginTop: 8 }}>
            <View style={{ flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 999, padding: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }}>
              <TouchableOpacity
                onPress={() => selectCameraMode('single')}
                style={{ paddingHorizontal: isCompactScanner ? 20 : 26, paddingVertical: 8, borderRadius: 999, backgroundColor: cameraMode === 'single' ? '#FFFFFF' : 'transparent' }}
              >
                <Text style={{ color: cameraMode === 'single' ? '#000000' : 'rgba(255,255,255,0.7)', fontWeight: '900', fontSize: 13 }}>Single</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => selectCameraMode('grid')}
                style={{ paddingHorizontal: isCompactScanner ? 20 : 26, paddingVertical: 8, borderRadius: 999, backgroundColor: cameraMode === 'grid' ? theme.colors.primary : 'transparent' }}
              >
                <Text style={{ color: cameraMode === 'grid' ? '#FFFFFF' : 'rgba(255,255,255,0.7)', fontWeight: '900', fontSize: 13 }}>Grid</Text>
              </TouchableOpacity>
            </View>

            {scanMode === 'auto' && cameraMode === 'single' && (
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 6, textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6 }}>
                {autoScanActive ? '🔴 Scanning every 2s — hold card in frame' : 'Tap Start to begin auto scanning'}
              </Text>
            )}
          </View>
        )}

        {!isInventoryMode && cameraMode === 'grid' && (
          <View style={{ alignItems: 'center', marginTop: 6 }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 7, paddingHorizontal: 20, paddingBottom: 6 }}
            >
              {GRID_SCAN_OPTIONS.map((option) => {
                const active = gridScanSize === option;
                return (
                  <TouchableOpacity
                    key={option}
                    onPress={() => setGridScanSize(option)}
                    style={{
                      minHeight: 34,
                      paddingHorizontal: 12,
                      borderRadius: 999,
                      backgroundColor: active ? '#FFFFFF' : 'rgba(0,0,0,0.48)',
                      borderWidth: 1,
                      borderColor: active ? '#FFFFFF' : 'rgba(255,255,255,0.2)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: active ? theme.colors.primary : 'rgba(255,255,255,0.78)', fontSize: 11, fontWeight: '900' }}>
                      {getGridScanLabel(option)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6 }}>
              {getGridScanDescription(gridScanSize)}
            </Text>
          </View>
        )}

        {!isInventoryMode && cameraMode === 'grid' && (
          <View style={{ alignItems: 'center', marginTop: 6 }}>
            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6 }}>
              Fit the whole page inside the grid. Empty pockets are fine.
            </Text>
          </View>
        )}

        {/* Frame guide */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-start', paddingTop: scannerLayout.frameTopPadding }}>
          <View
            ref={scannerFrameRef}
            onLayout={updateScannerFrameRect}
            style={{
            width: scannerFrameWidth, height: scannerFrameHeight,
            borderRadius: isInventoryMode ? 22 : 16,
            borderWidth: 2,
            borderColor: scannerFrameColor,
          }}>
            <View style={{ position: 'absolute', top: -2, left: -2, width: 28, height: 28, borderTopWidth: 4, borderLeftWidth: 4, borderColor: scannerFrameColor, borderRadius: 4 }} />
            <View style={{ position: 'absolute', top: -2, right: -2, width: 28, height: 28, borderTopWidth: 4, borderRightWidth: 4, borderColor: scannerFrameColor, borderRadius: 4 }} />
            <View style={{ position: 'absolute', bottom: -2, left: -2, width: 28, height: 28, borderBottomWidth: 4, borderLeftWidth: 4, borderColor: scannerFrameColor, borderRadius: 4 }} />
            <View style={{ position: 'absolute', bottom: -2, right: -2, width: 28, height: 28, borderBottomWidth: 4, borderRightWidth: 4, borderColor: scannerFrameColor, borderRadius: 4 }} />

            {cameraMode === 'grid' && !isInventoryMode && (
              <>
                {Array.from({ length: Math.max(0, activeGridSize - 1) }, (_, index) => index + 1).map((index) => (
                  <View
                    key={`page-v-${index}`}
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: `${(index / activeGridSize) * 100}%`,
                      width: 1,
                      backgroundColor: 'rgba(255,255,255,0.56)',
                    }}
                  />
                ))}
                {Array.from({ length: Math.max(0, activeGridSize - 1) }, (_, index) => index + 1).map((index) => (
                  <View
                    key={`page-h-${index}`}
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: `${(index / activeGridSize) * 100}%`,
                      height: 1,
                      backgroundColor: 'rgba(255,255,255,0.56)',
                    }}
                  />
                ))}
              </>
            )}

            {sellerScannerInstruction && !processingOcr && (
              <View style={{ position: 'absolute', left: 18, right: 18, bottom: 18, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.58)', paddingHorizontal: 12, paddingVertical: 9, alignItems: 'center' }}>
                <Text style={{ color: '#FFFFFF', fontSize: 15, lineHeight: 20, fontWeight: '900', textAlign: 'center' }}>{sellerScannerInstruction}</Text>
              </View>
            )}

            {processingOcr && (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={theme.colors.primary} size="large" />
                <Text style={{ color: '#FFFFFF', fontWeight: '700', marginTop: 12, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}>
                  {cameraMode === 'grid' && pageScanProgress
                    ? `Reading slot ${pageScanProgress.current} of ${pageScanProgress.total}`
                    : isInventoryMode ? 'Reading card.' : scanningMessage}
                </Text>
              </View>
            )}
          </View>

          {lastScanned && !isInventoryMode && (
            <View style={{ marginTop: 18, backgroundColor: lastScanned.startsWith('✅') || lastScanned.startsWith('👉') ? 'rgba(16,185,129,0.9)' : 'rgba(245,158,11,0.9)', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 }}>
              <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 14, textAlign: 'center' }}>{lastScanned}</Text>
            </View>
          )}

          {scannerLayout.showTips && (
          <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 28, width: '100%', maxWidth: scannerFrameWidth + 72, marginTop: 18 }}>
            {(cameraMode === 'grid'
              ? ['Full page visible', 'Corners aligned', 'Reduce glare']
              : ['Good lighting', 'Card flat', 'Name + number visible']
            ).map((tip) => (
              <View key={tip} style={{ flex: 1, minHeight: 34, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10, paddingVertical: 7, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' }}>
                <Text style={{ color: 'rgba(255,255,255,0.84)', fontSize: 10, fontWeight: '800', textAlign: 'center', lineHeight: 12 }}>{tip}</Text>
              </View>
            ))}
          </View>
          )}
        </View>

        {/* Confirmation overlay */}
        {pendingConfirmation?.card && isInventoryMode && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text style={{ color: 'rgba(255,255,255,0.68)', fontSize: 13, marginBottom: 16, fontWeight: '800' }}>
              {reviewTitle}
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
            <Text style={{ color: 'rgba(255,255,255,0.64)', fontSize: 13, marginBottom: 8, textAlign: 'center' }}>
              {formatScanCardSubtitle(
                pendingConfirmation.card.set_name,
                pendingConfirmation.card.number,
                pendingConfirmation.card.editionHint ?? pendingConfirmation.candidates?.[0]?.editionHint
              )}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13, marginBottom: 24, textAlign: 'center' }}>
              {isSellerStockOut ? 'Add this match to the out cart before completing the transaction.' : 'Add this match to the intake batch before committing inventory.'}
            </Text>
            <View style={{ flexDirection: 'row', gap: 12, width: '100%', maxWidth: 360 }}>
              <TouchableOpacity onPress={handleReject} style={{ flex: 1, minHeight: 50, backgroundColor: 'rgba(255,255,255,0.13)', borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' }}>
                <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 16 }}>{rejectLabel}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleConfirm} style={{ flex: 1, minHeight: 50, backgroundColor: '#10B981', borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 16 }}>{confirmLabel}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {pendingConfirmation?.card && !isInventoryMode && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 16 }}>
              {reviewTitle}
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
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 16 }}>{isInventoryMode ? 'Review match' : 'Is this the right card?'}</Text>
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
                  <TouchableOpacity onPress={() => handleSelectEditionChoice('1st_edition')} style={{ flex: 1, backgroundColor: '#4B22A2', borderRadius: 14, paddingVertical: 15, alignItems: 'center' }}>
                    <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 15 }}>1st Edition</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={handleReject} style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}>
                  <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 15 }}>{isInventoryMode ? 'Cancel' : 'Wrong card'}</Text>
                </TouchableOpacity>
              </View>
            ) : (
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <TouchableOpacity onPress={handleReject} style={{ flex: 1, backgroundColor: '#EF4444', borderRadius: 14, paddingVertical: 16, alignItems: 'center' }}>
                <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 16 }}>{rejectLabel}</Text>
              </TouchableOpacity>
              {pendingConfirmation.candidates?.some((candidate) => candidate.resolvedCard) ? (
                <TouchableOpacity onPress={handleConfirm} style={{ flex: 1, backgroundColor: '#10B981', borderRadius: 14, paddingVertical: 16, alignItems: 'center' }}>
                  <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 16 }}>{confirmLabel}</Text>
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
              {(SHOW_SCAN_DEBUG || scanError.details || scanError.stack) && (
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
          {isInventoryMode && (
            <View style={{ width: '100%', paddingHorizontal: 16, paddingBottom: Math.max(8, insets.bottom * 0.35) }}>
              <View style={{ borderRadius: 20, backgroundColor: 'rgba(5,10,26,0.76)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', padding: 14, gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: '#FFFFFF', fontSize: 16, lineHeight: 21, fontWeight: '900' }}>{sellerQueueLabel}</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.68)', fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 2 }}>
                      {isSellerStockOut
                        ? 'Cards wait here before stock changes.'
                        : 'Scans enter a reviewable intake batch.'}
                    </Text>
                  </View>
                  <View style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: processingOcr ? 'rgba(105,56,245,0.38)' : autoScanActive ? 'rgba(16,185,129,0.32)' : 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' }}>
                    <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '900' }}>
                      {processingOcr ? 'Reading' : autoScanActive ? 'Auto-detecting' : 'Ready'}
                    </Text>
                  </View>
                </View>

                {lastScanned && (
                  <Text style={{ color: '#FFFFFF', fontSize: 13, lineHeight: 18, fontWeight: '800' }} numberOfLines={2}>{lastScanned}</Text>
                )}

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    onPress={handleSearchManually}
                    style={{ flex: 1, minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '900' }}>Search manually</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleCapture(false)}
                    disabled={processingOcr || !cameraReady}
                    style={{ flex: 1, minHeight: 44, borderRadius: 14, backgroundColor: processingOcr || !cameraReady ? 'rgba(255,255,255,0.20)' : theme.colors.primary, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '900' }}>{processingOcr ? 'Reading' : 'Scan now'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {!isInventoryMode && scannedCards.length > 0 && (
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

          {!isInventoryMode && scanMode === 'manual' && (
            <>
              <TouchableOpacity
                onPress={() => handleCapture(false)}
                disabled={processingOcr || !cameraReady}
                style={{ width: shutterSize, height: shutterSize, borderRadius: shutterSize / 2, backgroundColor: processingOcr || !cameraReady ? 'rgba(255,255,255,0.4)' : '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: 'rgba(255,255,255,0.3)' }}
              >
                {processingOcr ? (
                  <ActivityIndicator color={theme.colors.primary} size="large" />
                ) : (
                  <View style={{ width: shutterInnerSize, height: shutterInnerSize, borderRadius: shutterInnerSize / 2, backgroundColor: theme.colors.primary }} />
                )}
              </TouchableOpacity>
              <Text style={{ color: 'rgba(255,255,255,0.74)', fontSize: 13, fontWeight: '700' }}>
                {cameraReady ? 'Tap to scan card' : 'Starting camera...'}
              </Text>
            </>
          )}

          {!isInventoryMode && cameraMode === 'grid' && (
            <>
              <TouchableOpacity
                onPress={handleBinderPageCapture}
                disabled={processingOcr || !cameraReady}
                style={{ width: shutterSize, height: shutterSize, borderRadius: shutterSize / 2, backgroundColor: processingOcr || !cameraReady ? 'rgba(255,255,255,0.4)' : '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: 'rgba(255,255,255,0.3)' }}
              >
                {processingOcr ? (
                  <ActivityIndicator color={theme.colors.primary} size="large" />
                ) : (
                  <Ionicons name="grid-outline" size={32} color={theme.colors.primary} />
                )}
              </TouchableOpacity>
              <Text style={{ color: 'rgba(255,255,255,0.74)', fontSize: 13, fontWeight: '700' }}>
                {cameraReady ? `Tap to scan ${activeGridSlotCount}-card grid` : 'Starting camera...'}
              </Text>
            </>
          )}

          {!isInventoryMode && scanMode === 'auto' && (
            <>
              <TouchableOpacity
                onPress={toggleAutoScan}
                disabled={!cameraReady}
                style={{ width: shutterSize, height: shutterSize, borderRadius: shutterSize / 2, backgroundColor: !cameraReady ? 'rgba(255,255,255,0.4)' : autoScanActive ? '#EF4444' : '#10B981', alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: 'rgba(255,255,255,0.3)' }}
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

