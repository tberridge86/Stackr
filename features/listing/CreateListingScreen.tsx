import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Image,
  type ImageSourcePropType,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  CardIdentificationTile,
  CardMatchConfirmation,
  ConditionEstimateCard,
  ConditionSelector,
  DraftSavedIndicator,
  EvidenceChecklist,
  FieldLabel,
  ImageQualityIndicator,
  InlineRequirementMessage,
  ListingFlowHeader,
  ListingReviewSection,
  MarketplaceListingPreview,
  PressableChecklistItem,
  PrimaryFooter,
  ProtectionTierReveal,
  STACKR_LISTING_INPUT_ACCESSORY_ID,
  StackrTextInput,
  ToggleCard,
  ValueComparisonCard,
  XimilarAnalysisStatus,
} from '../../components/listing/CreateListingFlowComponents';
import {
  GuidedListingCamera,
  assessGuidedCaptureQuality,
  type GuidedCaptureQuality,
  type GuidedCaptureResult,
} from '../../components/listing/GuidedListingCamera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SLAB_GRADE_SHORTCUTS, SLAB_GRADING_COMPANIES, formatSlabCompanyLabel } from '../../components/SlabStickerLabel';
import { RARITY_SYMBOL_CARD_OVERLAY, RaritySymbol } from '../../components/RaritySymbol';
import { StackrBackdrop } from '../../components/StackrBackdrop';
import { StackrCardActionIcon, StackrScreen } from '../../components/StackrScreen';
import { StackrImage } from '../../components/StackrImage';
import { getPokemonLanguageDescriptor, PokemonLanguageFlagIcon } from '../../components/PokemonLanguageBadge';
import { Text } from '../../components/Text';
import { useTheme } from '../../components/theme-context';
import { assertCanCommitQuantity, fetchUserCardAvailability } from '../../lib/cardOwnership';
import { searchLocalPokemonCards } from '../../lib/cardSearch';
import type { CapturedFrame, CaptureRect } from '../../lib/captureGeometry';
import { USD_TO_GBP, EUR_TO_GBP } from '../../lib/config';
import { fetchCachedPokemonCardDetails } from '../../lib/marketSearchDataCache';
import { fetchOwnedCardRows } from '../../lib/ownership';
import { assertPremiumSellerWriteAccess } from '../../lib/premiumSellerAccess';
import { assertGate0UserCopyAllowed } from '../../lib/gate0CommerceCopy';
import {
  searchForeignPokemonCards,
  type ForeignPokemonCard,
  type ForeignPokemonCardBrief,
  type ForeignPokemonLanguageCode,
} from '../../lib/foreignPokemon';
import {
  clearLegacyCreateListingDraft,
  getCreateListingDraftKey,
} from '../../lib/listingDrafts';
import { stackrSellCategoryIconSizes } from '../../lib/stackrSizing';
import {
  getListingCategories,
  getListingCategoryConfig,
  isCardCatalogueCategory,
  isListingCategoryKey,
  isSealedLikeCategory,
  type ListingCategoryKey,
} from '../../lib/listingCategoryRegistry';
import {
  calculateListingProtectionTier,
  formatCurrency,
  formatProtectionTier,
  getCategoryEvidenceRequirements,
  getListingProgressLabels,
  getListingProgressStages,
  getMissingListingRequirements,
  getRequiredCategoryEvidence,
  getVerificationRequirements,
  type EvidenceSlotKey,
  type ListingFlowStage,
  type ListingProtectionTier,
  type MissingRequirement,
} from '../../lib/listingFlow';
import {
  extractCertificationNumberFromText,
  getCaptureRequirementProgress,
  getCaptureRequirementsForListing,
  getCompletedEvidenceKeys,
  getRequirementById,
  type CaptureRequirement,
  type CaptureType,
} from '../../lib/listingCaptureRequirements';
import {
  isLikelyDuplicateListingPhoto,
  type ListingPhotoIssueSeverity,
  type ListingPhotoQualityIssue,
  type ListingPhotoSource,
  type ListingPhotoValidationMetrics,
} from '../../lib/listingPhotoValidation';
import { getProductPriceWithFallback, searchMarketProducts, type MarketProduct, type ProductLookupType } from '../../lib/productSearch';
import { getPokemonCardImageUrls, getPokemonCardLanguageLabel, normalizePokemonCardLanguage } from '../../lib/pokemonTcg';
import { selectTcgdexReferencePersistenceImage } from '../../lib/tcgdexReferencePersistence';
import { fetchPokeTraceCardPrice, getPreferredMarketPrice } from '../../lib/pricing';
import { buildScanRouteParamsForIntent } from '../../lib/scanIntent';
import {
  assessCardCenteringFromJpeg,
  formatCardCenteringAssessment,
  type CardCenteringAssessment,
} from '../../lib/cardCenteringAssessment';
import { stackrIcons } from '../../lib/stackrIcons';
import { supabase } from '../../lib/supabase';
import { gradeCardWithXimilar, type XimilarGradeImage } from '../../lib/ximilar';
import { fetchStackrPriceSnapshots } from '../../lib/stackrDomainAdapter';

type FlowStep =
  | 'category'
  | 'entry'
  | 'identify'
  | 'confirm'
  | 'manual'
  | 'condition'
  | 'value'
  | 'protection'
  | 'evidence'
  | 'ai'
  | 'gold'
  | 'details'
  | 'review'
  | 'success';

type IdentificationMethod = 'scan' | 'search' | 'collection' | 'manual';
type ListingMode = 'sell' | 'trade' | 'both';
type ListingSubjectType = ListingCategoryKey;
type CatalogueProductListingSubjectType = Extract<ListingSubjectType, ProductLookupType>;

type SelectedCard = {
  id: string;
  name: string;
  number: string | null;
  set_id: string;
  set_name: string | null;
  rarity: string | null;
  image_small: string | null;
  image_large: string | null;
  language?: string | null;
  variant?: string | null;
  ownedQuantity?: number;
  estimatedValue?: number | null;
  estimatedValueSource?: string | null;
  raw_data?: Record<string, any> | null;
};

type ManualIdentity = {
  cardName: string;
  setName: string;
  cardNumber: string;
  language: string;
  variant: string;
  state: ListingSubjectType;
  notes: string;
};

type PriceState = {
  market: number | null;
  low: number | null;
  high: number | null;
  graded: number | null;
  loading: boolean;
  unavailable: boolean;
};

type EvidencePhoto = {
  uri: string;
  sourceUri?: string | null;
  previewUri?: string | null;
  base64?: string | null;
  width?: number;
  height?: number;
  crop?: CaptureRect | null;
  captureFrame?: CapturedFrame | null;
  requirementId?: string;
  requirementLabel?: string;
  captureType?: string;
  evidenceKey?: EvidenceSlotKey;
  captureSource?: ListingPhotoSource;
  localStatus?: 'saved_locally' | 'uploading' | 'uploaded' | 'upload_failed';
  barcodeData?: string | null;
  barcodeType?: string | null;
  ocrText?: string | null;
  certificationCandidate?: string | null;
  quality: {
    purpose?: string;
    purposeLabel?: string;
    fullCardVisible: boolean;
    steady: boolean;
    lighting: boolean;
    singleCard: boolean;
    glareOk?: boolean;
    warning?: string | null;
    issues?: ListingPhotoQualityIssue[];
    highestPriorityIssue?: ListingPhotoQualityIssue | null;
    severity?: ListingPhotoIssueSeverity;
    requiresRetake?: boolean;
    canOverride?: boolean;
    overrideAccepted?: boolean;
    overrideReason?: string | null;
    imageFingerprint?: string | null;
    metrics?: ListingPhotoValidationMetrics | null;
  };
};

type EvidencePhotoMap = Partial<Record<string, EvidencePhoto>>;

type SlabCertification = {
  grader: string;
  grade?: string;
  certificationNumber: string;
  captureMethod: 'qr' | 'barcode' | 'ocr' | 'manual';
  confidence?: number;
  labelImageId: string;
  verifiedByUser: boolean;
  capturedAt?: string;
};

type XimilarEstimate = {
  condition: string | null;
  confidence: 'High confidence' | 'Moderate confidence' | 'Limited confidence' | null;
  breakdown: { label: string; value: string }[];
  rawFinalScore?: number | null;
  centeringAssessment?: CardCenteringAssessment | null;
};

type DraftState = {
  step: FlowStep;
  identificationMethod: IdentificationMethod | null;
  selectedCard: SelectedCard | null;
  selectedProduct: MarketProduct | null;
  manualIdentity: ManualIdentity;
  listingSubjectType: ListingSubjectType;
  listingMode: ListingMode;
  sellerCondition: string;
  sealedStatus: string;
  packagingCondition: string;
  slabCaseCondition: string;
  certificationNumber: string;
  askingPrice: string;
  tradeValue: string;
  offersAccepted: boolean;
  minimumOffer: string;
  wantedCards: string;
  description: string;
  knownDefects: string;
  selectedProtectionTier: ListingProtectionTier | null;
  silverLiabilityAccepted: boolean;
  quantity: string;
  gradingCompany: string;
  grade: string;
  slabCertification: SlabCertification | null;
  evidencePhotos: EvidencePhotoMap;
  ximilarEstimate: XimilarEstimate | null;
  ximilarStatus: 'idle' | 'processing' | 'complete' | 'failed';
  conditionDiscrepancyReason: string;
  sellerDeclarationAccepted: boolean;
  aiDeclarationAccepted: boolean;
  updatedAt?: string;
};

type ListingMediaItem = {
  role: 'stock' | 'seller' | 'verification';
  slot: string;
  label: string;
  url: string;
  required: boolean;
  metadata?: Record<string, any>;
};

const AUTO_SAVE_DELAY_MS = 450;
const GOLD_VERIFICATION_ENABLED = false;

const LISTING_CATEGORIES = getListingCategories();
const PRODUCT_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  LISTING_CATEGORIES.map((category) => [category.key, category.title])
);

const LISTING_LANGUAGE_OPTIONS: { key: ForeignPokemonLanguageCode; label: string; shortLabel: string }[] = [
  { key: 'en', label: 'English', shortLabel: 'EN' },
  { key: 'ja', label: 'Japanese', shortLabel: 'JP' },
  { key: 'fr', label: 'French', shortLabel: 'FR' },
  { key: 'de', label: 'German', shortLabel: 'DE' },
  { key: 'es', label: 'Spanish', shortLabel: 'ES' },
  { key: 'it', label: 'Italian', shortLabel: 'IT' },
  { key: 'pt-br', label: 'Portuguese', shortLabel: 'PT' },
  { key: 'zh-cn', label: 'Simplified Chinese', shortLabel: 'CN' },
  { key: 'zh-tw', label: 'Traditional Chinese', shortLabel: 'TW' },
  { key: 'id', label: 'Indonesian', shortLabel: 'ID' },
  { key: 'th', label: 'Thai', shortLabel: 'TH' },
];

const DEFAULT_MANUAL_IDENTITY: ManualIdentity = {
  cardName: '',
  setName: '',
  cardNumber: '',
  language: 'English',
  variant: 'Standard',
  state: 'raw_card',
  notes: '',
};

const DEFAULT_PRICES: PriceState = {
  market: null,
  low: null,
  high: null,
  graded: null,
  loading: false,
  unavailable: false,
};

const PROTECTION_TIER_RANK: Record<ListingProtectionTier, number> = {
  bronze: 1,
  silver: 2,
  gold: 3,
};

const PROTECTION_TIER_ARTWORK: Record<ListingProtectionTier, ImageSourcePropType> = {
  bronze: require('../../assets/rev2/10-market-trade/protection-tiers/Bronze.png'),
  silver: require('../../assets/rev2/10-market-trade/protection-tiers/silver.png'),
  gold: require('../../assets/rev2/10-market-trade/protection-tiers/gold.png'),
};

const PROTECTION_TIER_CHOICE_COPY: Record<ListingProtectionTier, string> = {
  bronze: 'Fastest evidence flow for lower-value cards.',
  silver: 'AI-assisted condition evidence. Collector agreement is required when Silver is manually selected.',
  gold: 'Unavailable in the current beta.',
};

const SUCCESS_TIER_ARTWORK: Record<ListingProtectionTier, ImageSourcePropType> = {
  bronze: require('../../assets/rev2/10-market-trade/protection-tiers/Bronze.png'),
  silver: require('../../assets/rev2/10-market-trade/protection-tiers/silver.png'),
  gold: require('../../assets/rev2/10-market-trade/protection-tiers/gold.png'),
};

const SUCCESS_TIER_TONES: Record<ListingProtectionTier, string> = {
  bronze: '#B7791F',
  silver: '#64748B',
  gold: '#D97706',
};

const SEALED_STATUS_OPTIONS = [
  'Factory sealed',
  'Seal appears intact, review required',
  'Opened',
  'Incomplete',
  'Resealed suspected',
  'Unknown',
];

const PACKAGING_CONDITION_OPTIONS = [
  'Excellent',
  'Light shelf wear',
  'Moderate shelf wear',
  'Significant wear',
  'Damaged packaging',
];

const SLAB_CASE_CONDITION_OPTIONS = [
  'Clean',
  'Light surface marks',
  'Noticeable scratches',
  'Chipped',
  'Cracked',
  'Label damage',
  'Possible tampering',
];

function getSelectableProtectionTiers(recommended: ListingProtectionTier): ListingProtectionTier[] {
  if (!GOLD_VERIFICATION_ENABLED || recommended === 'gold') return ['silver', 'bronze'];
  if (recommended === 'silver') return ['silver', 'bronze'];
  return ['bronze', 'silver'];
}

const parseCurrency = (value: string) => {
  const parsed = Number(String(value ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const isCardSubject = (type: ListingSubjectType) => isCardCatalogueCategory(type);
const canUseProductCatalogue = (type: ListingSubjectType): type is CatalogueProductListingSubjectType => {
  const category = getListingCategoryConfig(type);
  return category.catalogueLookup === 'sealed_product' && Boolean(category.catalogueProductType);
};
const isListingSubjectType = (value: unknown): value is ListingSubjectType =>
  isListingCategoryKey(value);

function getListingSubjectTypeForProduct(product: MarketProduct): ListingSubjectType {
  return isListingSubjectType(product.product_type) ? product.product_type : 'sealed_product';
}

function resolveListingSubjectTypeForSelection({
  requested,
  selectedCard,
  selectedProduct,
}: {
  requested: unknown;
  selectedCard?: SelectedCard | null;
  selectedProduct?: MarketProduct | null;
}): ListingSubjectType {
  if (selectedProduct) return getListingSubjectTypeForProduct(selectedProduct);
  if (selectedCard) return requested === 'graded_slab' ? 'graded_slab' : 'raw_card';
  return isListingSubjectType(requested) ? requested : 'raw_card';
}

const slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80);

const getCardImageUrl = (card: SelectedCard | null) => {
  if (!card) return null;
  const storedImage = card.image_large ?? card.image_small ?? card.raw_data?.images?.large ?? card.raw_data?.images?.small ?? null;
  const isForeignProviderCard = Boolean(card.raw_data?.external_ids?.tcgdex || card.raw_data?.tcgdex || String(card.id).includes(':'));
  if (isForeignProviderCard && storedImage) return storedImage;
  const official = getPokemonCardImageUrls(card.id, card.set_id, card.number);
  return (
    official.large ??
    official.small ??
    storedImage ??
    null
  );
};

function listingCardForPersistence(card: SelectedCard | null, existing: SelectedCard | null = null) {
  if (!card) return null;
  const existingCard = existing?.id === card.id ? existing : null;
  const imageSmall = selectTcgdexReferencePersistenceImage(card.image_small, existingCard?.image_small);
  const imageLarge = selectTcgdexReferencePersistenceImage(card.image_large, existingCard?.image_large);
  const rawImageSmall = selectTcgdexReferencePersistenceImage(
    card.raw_data?.images?.small,
    existingCard?.raw_data?.images?.small,
  );
  const rawImageLarge = selectTcgdexReferencePersistenceImage(
    card.raw_data?.images?.large,
    existingCard?.raw_data?.images?.large,
  );
  return {
    ...card,
    image_small: imageSmall,
    image_large: imageLarge,
    raw_data: {
      ...card.raw_data,
      images: {
        ...(card.raw_data?.images ?? {}),
        small: rawImageSmall,
        large: rawImageLarge,
      },
    },
  };
}

const isMissingListingMediaColumnError = (error: any) => {
  if (!error) return false;
  const message = [
    error.code,
    error.message,
    error.details,
    error.hint,
  ].filter(Boolean).join(' ');
  return /listing_media|official_image_url|seller_front_image_url|seller_back_image_url/i.test(message)
    && /42703|PGRST204|schema cache|column|could not find/i.test(message);
};

const toLegacyListingPayload = (payload: Record<string, any>) => {
  const {
    listing_media,
    official_image_url,
    seller_front_image_url,
    seller_back_image_url,
    ...legacyPayload
  } = payload;

  return legacyPayload;
};

const flowStepToStage = (step: FlowStep): ListingFlowStage => {
  if (step === 'category' || step === 'entry' || step === 'identify' || step === 'confirm' || step === 'manual') return 'card';
  if (step === 'condition') return 'condition';
  if (step === 'value') return 'value';
  if (step === 'protection') return 'protection';
  if (step === 'evidence') return 'evidence';
  if (step === 'ai') return 'ai';
  if (step === 'gold') return 'gold';
  if (step === 'details') return 'details';
  return 'review';
};

function mapCardRow(row: any): SelectedCard {
  return {
    id: row.id,
    name: row.name,
    number: row.number ?? null,
    set_id: row.set_id ?? '',
    set_name: row.raw_data?.set?.name ?? row.set_name ?? row.set_id ?? null,
    rarity: row.rarity ?? row.raw_data?.rarity ?? null,
    image_small: row.image_small ?? row.raw_data?.images?.small ?? null,
    image_large: row.image_large ?? row.raw_data?.images?.large ?? null,
    language: row.language ?? row.raw_data?.language ?? null,
    variant: row.raw_data?.subtypes?.join(', ') ?? null,
    ownedQuantity: row.ownedQuantity ?? row.owned_quantity ?? undefined,
    estimatedValue: row.estimatedValue ?? null,
    estimatedValueSource: row.estimatedValueSource ?? null,
    raw_data: row.raw_data ?? null,
  };
}

function getTcgFallbackValue(raw: any): number | null {
  const prices = raw?.tcgplayer?.prices;
  if (!prices) return null;
  for (const key of ['holofoil', 'reverseHolofoil', 'normal', '1stEditionHolofoil', '1stEditionNormal']) {
    const value = prices[key]?.market ?? prices[key]?.mid ?? prices[key]?.low;
    if (typeof value === 'number') return Math.round(value * USD_TO_GBP * 100) / 100;
  }
  for (const entry of Object.values(prices) as any[]) {
    const value = entry?.market ?? entry?.mid ?? entry?.low;
    if (typeof value === 'number') return Math.round(value * USD_TO_GBP * 100) / 100;
  }
  return null;
}

function getCardmarketFallbackValue(raw: any): number | null {
  const prices = raw?.cardmarket?.prices;
  const value = prices?.trendPrice ?? prices?.averageSellPrice ?? prices?.avg30 ?? prices?.avg7 ?? prices?.lowPrice;
  return typeof value === 'number' ? Math.round(value * EUR_TO_GBP * 100) / 100 : null;
}

function getOwnedCardSearchText(card: SelectedCard) {
  return [
    card.name,
    card.set_name,
    card.set_id,
    card.number,
    card.rarity,
    getPokemonCardLanguageLabel(card.language),
  ].filter(Boolean).join(' ').toLowerCase();
}

function sortOwnedCardsByValue(cards: SelectedCard[]) {
  return [...cards].sort((a, b) => {
    const av = typeof a.estimatedValue === 'number' ? a.estimatedValue : -1;
    const bv = typeof b.estimatedValue === 'number' ? b.estimatedValue : -1;
    if (bv !== av) return bv - av;
    return a.name.localeCompare(b.name);
  });
}

function getEvidencePhotoUrl(photo?: EvidencePhoto | null) {
  return photo?.previewUri ?? photo?.uri ?? null;
}

function getCapturePlaceholderCopy(requirement: CaptureRequirement, subjectLabel: string) {
  const label = requirement.label.toLowerCase();
  if (requirement.captureType === 'full_front') {
    return {
      title: 'Actual front photo',
      body: 'Use the real card in hand. Catalogue art does not count as condition evidence.',
    };
  }
  if (requirement.captureType === 'full_back') {
    return {
      title: 'Actual back photo',
      body: 'Turn the exact card over and capture the whole back, flat and evenly lit.',
    };
  }
  if (requirement.captureType.startsWith('surface_')) {
    return {
      title: `${requirement.label} evidence`,
      body: 'Tilt the real card so scratches, dents, print lines and whitening can be reviewed.',
    };
  }
  if (requirement.captureType.startsWith('slab')) {
    return {
      title: `${requirement.label} photo`,
      body: 'Capture the exact slab, including the holder and label where requested.',
    };
  }
  if (requirement.captureType.startsWith('packaging') || requirement.captureType === 'sealed_detail') {
    return {
      title: `${requirement.label} proof`,
      body: 'Photograph the exact product being sold. Stock packaging images are only references.',
    };
  }
  return {
    title: `${subjectLabel.charAt(0).toUpperCase()}${subjectLabel.slice(1)} ${label}`,
    body: 'Keep the real item visible, sharp and evenly lit for buyer review.',
  };
}

function getCapturedPhotoResizeMode(captureType: CaptureType) {
  if (captureType.startsWith('edge_') || captureType === 'slab_label' || captureType === 'slab_qr') return 'contain';
  return 'cover';
}

async function fetchLatestMarketSnapshots(cardIds: string[]) {
  const snapshots = new Map<string, any>();
  const uniqueIds = [...new Set(cardIds.filter(Boolean))];
  const stackrSnapshots = await fetchStackrPriceSnapshots(uniqueIds);
  for (const cardId of uniqueIds) {
    const row = stackrSnapshots.get(cardId);
    if (!row) continue;
    snapshots.set(cardId, {
      card_id: cardId,
      ebay_average: null,
      tcg_mid: row.market_central,
      tcg_low: row.market_low,
      cardmarket_trend: null,
      snapshot_at: row.snapshot_at,
      stackr_market: row,
    });
  }
  return snapshots;
}

function mapForeignCardRow(card: ForeignPokemonCardBrief | ForeignPokemonCard): SelectedCard {
  const detailed = card as ForeignPokemonCard;
  const set = detailed.set ?? null;
  const pricing = detailed.pricing ?? null;
  // A foreign row may include a provider image base, but a controlled card
  // reference may only be used after the exact live record validation path
  // has supplied its display URL. Never construct provider asset paths here.
  const imageSmall = card.imageSmall ?? card.image ?? null;
  const imageLarge = card.image ?? imageSmall;
  return {
    id: card.id,
    name: card.name,
    number: card.number ?? card.localId ?? null,
    set_id: set?.id ?? card.providerCardId?.split('-').slice(0, -1).join('-') ?? '',
    set_name: set?.name ?? null,
    rarity: detailed.rarity ?? null,
    image_small: imageSmall ?? null,
    image_large: imageLarge ?? null,
    language: card.language,
    variant: [
      getPokemonCardLanguageLabel(card.language),
      pricing?.preferredSource ? `Source: ${pricing.preferredSource}` : null,
    ].filter(Boolean).join(' · '),
    raw_data: {
      ...(typeof detailed.raw === 'object' && detailed.raw ? detailed.raw as Record<string, any> : {}),
      language: card.language,
      region: card.region,
      external_ids: {
        tcgdex: card.providerCardId,
      },
      images: {
        small: imageSmall ?? null,
        large: imageLarge ?? null,
      },
      set,
      pricing,
      tcgdex: {
        providerCardId: card.providerCardId,
        localId: card.localId,
      },
    },
  };
}

function mapXimilarScoreToCondition(score?: number | null): string | null {
  if (score == null || Number.isNaN(score)) return null;
  if (score >= 8.5) return 'Likely Near Mint';
  if (score >= 6.5) return 'Likely Lightly Played';
  if (score >= 4.5) return 'Likely Moderately Played';
  if (score >= 2.5) return 'Likely Heavily Played';
  return 'Likely Damaged';
}

function getValueWarning(estimate: number | null, entered: number | null) {
  if (estimate == null || entered == null || estimate <= 0) return null;
  const diff = ((entered - estimate) / estimate) * 100;
  if (Math.abs(diff) < 25) return null;
  return `This is ${Math.abs(Math.round(diff))}% ${diff > 0 ? 'above' : 'below'} the current Stackr estimate.`;
}

function getSlabConditionLabel(gradingCompany: string, grade: string) {
  const company = gradingCompany.trim() || 'Grader';
  const value = grade.trim() || 'grade not set';
  return `${company} ${value}`;
}

function normalizeCertificationNumber(value?: string | null) {
  return String(value ?? '').replace(/\D/g, '');
}

function getCertificationCaptureMethod(photo?: EvidencePhoto | null): SlabCertification['captureMethod'] {
  if (!photo) return 'manual';
  if (photo.barcodeData && String(photo.barcodeType ?? '').toLowerCase().includes('qr')) return 'qr';
  if (photo.barcodeData) return 'barcode';
  if (photo.ocrText || photo.certificationCandidate) return 'ocr';
  return 'manual';
}

type CertificationDuplicateReview = {
  inventoryMatches: number;
  ownActiveListings: number;
  otherActiveListings: number;
  completedListings: number;
  total: number;
};

function listingTextContainsCertification(row: any, normalizedCert: string) {
  const haystack = normalizeCertificationNumber([
    row?.listing_notes,
    row?.notes,
    JSON.stringify(row?.listing_media ?? []),
  ].filter(Boolean).join(' '));
  return normalizedCert.length >= 6 && haystack.includes(normalizedCert);
}

async function fetchCertificationDuplicateReview(
  userId: string,
  certificationNumber: string
): Promise<CertificationDuplicateReview | null> {
  const trimmed = certificationNumber.trim();
  const normalizedCert = normalizeCertificationNumber(trimmed);
  if (normalizedCert.length < 6) return null;

  const certValues = Array.from(new Set([trimmed, normalizedCert].filter(Boolean)));

  try {
    const [inventoryResult, listingsResult] = await Promise.all([
      supabase
        .from('binder_cards')
        .select('id, cert_number, binders!inner(user_id)')
        .in('cert_number', certValues)
        .eq('binders.user_id', userId)
        .limit(20),
      supabase
        .from('user_card_flags')
        .select('id, user_id, listing_status, listing_notes, notes, listing_media')
        .eq('flag_type', 'trade')
        .eq('pricing_mode', 'graded')
        .or('listing_status.eq.active,listing_status.eq.sold,listing_status.is.null')
        .limit(500),
    ]);

    if (inventoryResult.error) console.log('Certification inventory duplicate lookup failed:', inventoryResult.error.message);
    if (listingsResult.error) console.log('Certification listing duplicate lookup failed:', listingsResult.error.message);

    const matchingListings = (listingsResult.data ?? []).filter((row: any) => listingTextContainsCertification(row, normalizedCert));
    const inventoryMatches = inventoryResult.error ? 0 : (inventoryResult.data ?? []).length;
    const ownActiveListings = matchingListings.filter((row: any) => row.user_id === userId && (row.listing_status === 'active' || row.listing_status == null)).length;
    const otherActiveListings = matchingListings.filter((row: any) => row.user_id !== userId && (row.listing_status === 'active' || row.listing_status == null)).length;
    const completedListings = matchingListings.filter((row: any) => row.listing_status === 'sold').length;
    const total = inventoryMatches + ownActiveListings + otherActiveListings + completedListings;

    return total
      ? { inventoryMatches, ownActiveListings, otherActiveListings, completedListings, total }
      : null;
  } catch (error) {
    console.log('Certification duplicate lookup failed:', error);
    return null;
  }
}

export default function CreateListingScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ cardId?: string; setId?: string; type?: string; productName?: string; listingAction?: string; q?: string }>();
  const isFocused = useIsFocused();
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [draftStorageKey, setDraftStorageKey] = useState<string | null>(null);
  const [draftSessionUserId, setDraftSessionUserId] = useState<string | null | undefined>(undefined);
  const draftAuthUserIdRef = useRef<string | null | undefined>(undefined);
  const draftAuthGenerationRef = useRef(0);
  const [step, setStep] = useState<FlowStep>('category');
  const [identificationMethod, setIdentificationMethod] = useState<IdentificationMethod | null>(null);
  const [selectedCard, setSelectedCard] = useState<SelectedCard | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<MarketProduct | null>(null);
  const [manualIdentity, setManualIdentity] = useState<ManualIdentity>(DEFAULT_MANUAL_IDENTITY);
  const [storedListingSubjectType, setListingSubjectType] = useState<ListingSubjectType>('raw_card');
  const [listingMode, setListingMode] = useState<ListingMode>('sell');
  const [sellerCondition, setSellerCondition] = useState('');
  const [sealedStatus, setSealedStatus] = useState('Factory sealed');
  const [packagingCondition, setPackagingCondition] = useState('Excellent');
  const [slabCaseCondition, setSlabCaseCondition] = useState('Clean');
  const [certificationNumber, setCertificationNumber] = useState('');
  const [slabCertification, setSlabCertification] = useState<SlabCertification | null>(null);
  const [conditionGuideVisible, setConditionGuideVisible] = useState(false);
  const [askingPrice, setAskingPrice] = useState('');
  const [tradeValue, setTradeValue] = useState('');
  const [offersAccepted, setOffersAccepted] = useState(true);
  const [minimumOffer, setMinimumOffer] = useState('');
  const [wantedCards, setWantedCards] = useState('');
  const [description, setDescription] = useState('');
  const [knownDefects, setKnownDefects] = useState('');
  const [selectedProtectionTier, setSelectedProtectionTier] = useState<ListingProtectionTier | null>(null);
  const [silverLiabilityAccepted, setSilverLiabilityAccepted] = useState(false);
  const [quantity, setQuantity] = useState('1');
  const [gradingCompany, setGradingCompany] = useState('PSA');
  const [grade, setGrade] = useState('10');
  const [prices, setPrices] = useState<PriceState>(DEFAULT_PRICES);
  const [searchQuery, setSearchQuery] = useState('');
  const [collectionSearchQuery, setCollectionSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SelectedCard[]>([]);
  const [productResults, setProductResults] = useState<MarketProduct[]>([]);
  const [listingLanguage, setListingLanguage] = useState<ForeignPokemonLanguageCode>('en');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [ownedCards, setOwnedCards] = useState<SelectedCard[]>([]);
  const [searching, setSearching] = useState(false);
  const [collectionLoading, setCollectionLoading] = useState(false);
  const [evidencePhotos, setEvidencePhotos] = useState<EvidencePhotoMap>({});
  const [activeEvidenceIndex, setActiveEvidenceIndex] = useState(0);
  const [activeCaptureRequirement, setActiveCaptureRequirement] = useState<CaptureRequirement | null>(null);
  const [ximilarStatus, setXimilarStatus] = useState<'idle' | 'processing' | 'complete' | 'failed'>('idle');
  const [ximilarError, setXimilarError] = useState<string | null>(null);
  const [ximilarEstimate, setXimilarEstimate] = useState<XimilarEstimate | null>(null);
  const [conditionDiscrepancyReason, setConditionDiscrepancyReason] = useState('');
  const [sellerDeclarationAccepted, setSellerDeclarationAccepted] = useState(false);
  const [aiDeclarationAccepted, setAiDeclarationAccepted] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRequestIdRef = useRef(0);
  const ownedCardsRequestIdRef = useRef(0);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistedDraftSelectedCardRef = useRef<SelectedCard | null>(null);
  const suppressNextAutoSaveRef = useRef(false);
  const listingActionHandledRef = useRef<string | null>(null);
  const photoCatalogueMatchRef = useRef<string | null>(null);
  const photoCatalogueSuggestionRef = useRef(0);
  const routeHasPrefill = Boolean(params.cardId || params.productName);
  const listingSubjectType = resolveListingSubjectTypeForSelection({
    requested: storedListingSubjectType,
    selectedCard: listingCardForPersistence(selectedCard),
    selectedProduct,
  });
  const isGradedSlabListing = listingSubjectType === 'graded_slab';
  const categoryConfig = getListingCategoryConfig(listingSubjectType);
  const categoryIcon = categoryConfig.asset;
  const categoryProductFamily = categoryConfig.family;

  const listingValueNumber = parseCurrency(askingPrice);
  const tradeValueNumber = parseCurrency(tradeValue);
  const activeTransactionValue = listingMode === 'trade' ? tradeValueNumber : listingValueNumber;
  const tierDecision = useMemo(() => calculateListingProtectionTier({
    marketValue: prices.market,
    listingValue: listingMode !== 'trade' ? listingValueNumber : null,
    tradeValue: listingMode !== 'sell' ? tradeValueNumber : null,
  }), [listingMode, listingValueNumber, prices.market, tradeValueNumber]);
  const recommendedProtectionTier: ListingProtectionTier = (
    !GOLD_VERIFICATION_ENABLED && tierDecision.tier === 'gold'
      ? 'silver'
      : tierDecision.tier
  );
  const allowedProtectionTiers = useMemo(
    () => getSelectableProtectionTiers(recommendedProtectionTier),
    [recommendedProtectionTier]
  );
  const protectionTier = selectedProtectionTier && allowedProtectionTiers.includes(selectedProtectionTier)
    ? selectedProtectionTier
    : recommendedProtectionTier;
  const usesProtectionTier = listingSubjectType === 'raw_card';
  const evidenceTier: ListingProtectionTier = usesProtectionTier ? protectionTier : 'bronze';
  const protectionTierIsManual = usesProtectionTier && selectedProtectionTier != null && selectedProtectionTier !== recommendedProtectionTier;
  const protectionTierIsDowngraded = usesProtectionTier && PROTECTION_TIER_RANK[protectionTier] < PROTECTION_TIER_RANK[recommendedProtectionTier];
  const silverAgreementRequired = usesProtectionTier && protectionTier === 'silver' && protectionTierIsManual;
  const verificationRequirements = useMemo(() => getVerificationRequirements({
    categoryKey: listingSubjectType,
    productFamily: categoryProductFamily,
    tier: evidenceTier,
    sealedStatus,
    grader: gradingCompany,
    integrations: {
      ximilar: true,
      certificationLookup: false,
      agsLabel: GOLD_VERIFICATION_ENABLED && listingSubjectType === 'raw_card',
      humanReview: !isGradedSlabListing,
    },
  }), [categoryProductFamily, evidenceTier, gradingCompany, isGradedSlabListing, listingSubjectType, sealedStatus]);
  const requiresGoldReview = GOLD_VERIFICATION_ENABLED && usesProtectionTier && protectionTier === 'gold'
    && (verificationRequirements.requiresAGSLabel || verificationRequirements.requiresHumanReview);
  const silverAgreementDisclosure = verificationRequirements.requiresXimilar
    ? 'Silver uses AI-assisted condition evidence and seller photos. The listing will show that collector agreement is required before proceeding.'
    : 'Silver was manually selected. Buyer or trader agreement is required before proceeding.';
  const protectionRevealCopy = useMemo(() => {
    if (listingSubjectType === 'raw_card') return null;
    if (listingSubjectType === 'graded_slab') {
      return {
        message: protectionTier === 'bronze'
          ? 'Essential slab evidence using the professional grade as stated on the label.'
          : protectionTier === 'silver'
            ? 'Enhanced slab evidence with certification and holder-condition review.'
            : 'Enhanced verification review for Stackr’s highest-value slab listings.',
        requirements: protectionTier === 'bronze'
          ? ['Slab front photograph', 'Slab back photograph', 'Certification label photograph', 'Seller-confirmed grader and grade']
          : protectionTier === 'silver'
            ? ['Bronze slab evidence included', 'Slab case condition disclosure', 'Certification label captured as the required proof', 'QR or barcode only where useful as optional supporting evidence']
            : ['Silver slab evidence included', 'Enhanced Stackr review record', 'Manual verification pending state until review completes'],
      };
    }
    if (isSealedLikeCategory(listingSubjectType)) {
      return {
        message: 'Standard packaging evidence for sealed collectibles. Seal photos are encouraged, not mandatory.',
        requirements: [
          'Actual-item front photograph',
          'Actual-item back photograph',
          'Sealed status',
          'Packaging condition',
          'Optional seal, wrap or crimp close-ups where useful',
          'Catalogue media kept separate from seller photos',
        ],
      };
    }
    return {
      message: 'Manual listing evidence for products that need Stackr catalogue review.',
      requirements: ['Main seller photo', 'Included contents photo', 'Item condition disclosure', 'Catalogue review where required'],
    };
  }, [listingSubjectType, protectionTier]);
  const progressStages = useMemo(() => getListingProgressStages(evidenceTier, categoryProductFamily), [categoryProductFamily, evidenceTier]);
  const progressLabels = useMemo(() => getListingProgressLabels(categoryProductFamily), [categoryProductFamily]);
  const evidenceRequirements = useMemo(() => getCategoryEvidenceRequirements(listingSubjectType, evidenceTier), [evidenceTier, listingSubjectType]);
  const requiredEvidence = useMemo(() => getRequiredCategoryEvidence(listingSubjectType, evidenceTier), [evidenceTier, listingSubjectType]);
  const capturedPhotoIds = useMemo(() => Object.keys(evidencePhotos), [evidencePhotos]);
  const captureRequirements = useMemo(() => getCaptureRequirementsForListing({
    requirements: evidenceRequirements,
    categoryKey: listingSubjectType,
    productFamily: categoryProductFamily,
    tier: evidenceTier,
    grader: gradingCompany,
    capturedPhotoIds,
  }), [capturedPhotoIds, categoryProductFamily, evidenceRequirements, evidenceTier, gradingCompany, listingSubjectType]);
  const captureProgress = useMemo(() => getCaptureRequirementProgress(captureRequirements), [captureRequirements]);
  const capturedEvidenceKeys = useMemo(() => getCompletedEvidenceKeys(captureRequirements), [captureRequirements]);
  const currentCaptureRequirement = captureRequirements[Math.min(activeEvidenceIndex, captureRequirements.length - 1)] ?? captureRequirements[0];
  const identityConfirmed = Boolean(selectedCard || selectedProduct || manualIdentity.cardName.trim());
  const identityPendingReview = Boolean(!selectedCard && !selectedProduct && manualIdentity.cardName.trim());
  const detailsComplete = Boolean(quantity.trim());
  const goldReady = !requiresGoldReview;
  const valueEntered = listingMode === 'sell'
    ? listingValueNumber != null
    : listingMode === 'trade'
      ? tradeValueNumber != null
      : listingValueNumber != null && tradeValueNumber != null;
  const displayGradingCompany = formatSlabCompanyLabel(gradingCompany);
  const slabConditionLabel = getSlabConditionLabel(displayGradingCompany, grade);
  const conditionSelected = listingSubjectType === 'graded_slab'
    ? Boolean(gradingCompany.trim() && grade.trim() && certificationNumber.trim() && slabCaseCondition.trim())
    : isSealedLikeCategory(listingSubjectType)
      ? Boolean(sealedStatus.trim() && packagingCondition.trim())
      : listingSubjectType === 'accessories' || listingSubjectType === 'other'
        ? Boolean(packagingCondition.trim())
        : Boolean(sellerCondition);
  const declaredCondition = listingSubjectType === 'graded_slab'
    ? `${slabConditionLabel} - case ${slabCaseCondition.toLowerCase()}`
    : isSealedLikeCategory(listingSubjectType)
      ? `${sealedStatus} - ${packagingCondition}`
      : listingSubjectType === 'accessories' || listingSubjectType === 'other'
        ? packagingCondition
        : sellerCondition;
  const aiComplete = !verificationRequirements.requiresXimilar || ximilarStatus === 'complete';
  const missingPublicationRequirements = useMemo(() => {
    const missing = getMissingListingRequirements({
      identityConfirmed,
      conditionSelected,
      valueEntered,
      tier: evidenceTier,
      capturedEvidenceKeys,
      aiComplete,
      goldReady: isGradedSlabListing ? true : goldReady,
      detailsComplete,
      sellerDeclarationAccepted: sellerDeclarationAccepted
        && (!verificationRequirements.requiresXimilar || aiDeclarationAccepted),
      requiredEvidence,
    });
    if (silverAgreementRequired && !silverLiabilityAccepted) {
      missing.push({ key: 'silver-liability', label: 'Accept the Silver agreement statement' });
    }
    return missing;
  }, [
    aiComplete,
    aiDeclarationAccepted,
    capturedEvidenceKeys,
    detailsComplete,
    goldReady,
    identityConfirmed,
    evidenceTier,
    requiresGoldReview,
    conditionSelected,
    requiredEvidence,
    sellerDeclarationAccepted,
    silverAgreementRequired,
    silverLiabilityAccepted,
    isGradedSlabListing,
    verificationRequirements.requiresXimilar,
    valueEntered,
  ]);
  const completedStages = useMemo(() => {
    const completed: ListingFlowStage[] = [];
    if (identityConfirmed) completed.push('card');
    if (conditionSelected) completed.push('condition');
    if (valueEntered) completed.push('value');
    if (usesProtectionTier && step !== 'category' && step !== 'entry' && step !== 'identify' && step !== 'confirm' && step !== 'manual' && valueEntered) completed.push('protection');
    if (captureProgress.requiredDone) completed.push('evidence');
    if (verificationRequirements.requiresXimilar && aiComplete) completed.push('ai');
    if (goldReady && requiresGoldReview) completed.push('gold');
    if (detailsComplete) completed.push('details');
    if (sellerDeclarationAccepted) completed.push('review');
    return completed;
  }, [aiComplete, captureProgress.requiredDone, conditionSelected, detailsComplete, goldReady, identityConfirmed, requiresGoldReview, sellerDeclarationAccepted, step, usesProtectionTier, valueEntered, verificationRequirements.requiresXimilar]);

  const catalogueImageUrl = selectedProduct?.image_large_url ?? selectedProduct?.image_url ?? null;
  const cardTitle = selectedCard?.name ?? selectedProduct?.name ?? manualIdentity.cardName.trim() ?? '';
  const cardSubtitle = selectedCard
    ? [selectedCard.set_name, selectedCard.number ? `#${selectedCard.number}` : null].filter(Boolean).join(' · ')
    : selectedProduct
      ? [selectedProduct.set_name, categoryConfig.title, selectedProduct.source ? `Source: ${selectedProduct.source}` : null].filter(Boolean).join(' · ')
      : [manualIdentity.setName.trim(), manualIdentity.cardNumber.trim() ? `#${manualIdentity.cardNumber.trim()}` : null, manualIdentity.variant.trim()].filter(Boolean).join(' · ');
  const cardImageUrl = getCardImageUrl(selectedCard) ?? catalogueImageUrl;
  const sellerPreviewPhoto = evidencePhotos.front ?? evidencePhotos.packaging_front ?? evidencePhotos.slab_front ?? Object.values(evidencePhotos)[0] ?? null;
  const sellerPreviewPhotoUrl = getEvidencePhotoUrl(sellerPreviewPhoto);
  const slabLabelPhoto = evidencePhotos.slab_label ?? evidencePhotos.slab_cert ?? null;
  const resolvedSlabCertification = useMemo<SlabCertification | null>(() => {
    if (!isGradedSlabListing || !certificationNumber.trim()) return null;

    const currentNumber = certificationNumber.trim();
    const currentNormalised = normalizeCertificationNumber(currentNumber);
    const storedNormalised = normalizeCertificationNumber(slabCertification?.certificationNumber);
    const labelImageId = slabCertification?.labelImageId
      ?? slabLabelPhoto?.requirementId
      ?? slabLabelPhoto?.evidenceKey
      ?? 'manual';

    if (slabCertification && currentNormalised && currentNormalised === storedNormalised) {
      return {
        ...slabCertification,
        grader: displayGradingCompany,
        grade: grade.trim() || slabCertification.grade,
        certificationNumber: currentNumber,
        labelImageId,
        verifiedByUser: true,
      };
    }

    return {
      grader: displayGradingCompany,
      grade: grade.trim() || undefined,
      certificationNumber: currentNumber,
      captureMethod: 'manual',
      confidence: 1,
      labelImageId,
      verifiedByUser: true,
      capturedAt: new Date().toISOString(),
    };
  }, [certificationNumber, displayGradingCompany, grade, isGradedSlabListing, slabCertification, slabLabelPhoto?.evidenceKey, slabLabelPhoto?.requirementId]);
  const handleCertificationNumberChange = useCallback((value: string) => {
    setCertificationNumber(value);
    const trimmed = value.trim();
    if (!trimmed) {
      setSlabCertification(null);
      return;
    }

    setSlabCertification((current) => ({
      grader: displayGradingCompany,
      grade: grade.trim() || undefined,
      certificationNumber: trimmed,
      captureMethod: 'manual',
      confidence: 1,
      labelImageId: current?.labelImageId ?? slabLabelPhoto?.requirementId ?? slabLabelPhoto?.evidenceKey ?? 'manual',
      verifiedByUser: true,
      capturedAt: new Date().toISOString(),
    }));
  }, [displayGradingCompany, grade, slabLabelPhoto?.evidenceKey, slabLabelPhoto?.requirementId]);
  const slabCertificationDisplay = resolvedSlabCertification
    ? `${resolvedSlabCertification.certificationNumber} (${resolvedSlabCertification.captureMethod.toUpperCase()})`
    : certificationNumber || 'Seller-confirmed';
  const valueWarning = getValueWarning(prices.market, activeTransactionValue);
  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, []);

  useEffect(() => {
    if (activeEvidenceIndex >= captureRequirements.length) {
      setActiveEvidenceIndex(0);
    }
  }, [activeEvidenceIndex, captureRequirements.length]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const resetListingDraftState = useCallback(() => {
    searchRequestIdRef.current += 1;
    ownedCardsRequestIdRef.current += 1;
    photoCatalogueSuggestionRef.current += 1;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    suppressNextAutoSaveRef.current = true;
    persistedDraftSelectedCardRef.current = null;
    setStep('category');
    setIdentificationMethod(null);
    setSelectedCard(null);
    setSelectedProduct(null);
    setManualIdentity(DEFAULT_MANUAL_IDENTITY);
    setListingSubjectType('raw_card');
    setListingMode('sell');
    setSellerCondition('');
    setSealedStatus('Factory sealed');
    setPackagingCondition('Excellent');
    setSlabCaseCondition('Clean');
    setCertificationNumber('');
    setSlabCertification(null);
    setAskingPrice('');
    setTradeValue('');
    setOffersAccepted(true);
    setMinimumOffer('');
    setWantedCards('');
    setDescription('');
    setKnownDefects('');
    setCollectionSearchQuery('');
    setRecentSearches([]);
    setSelectedProtectionTier(null);
    setSilverLiabilityAccepted(false);
    setQuantity('1');
    setGradingCompany('PSA');
    setGrade('10');
    setPrices(DEFAULT_PRICES);
    setSearchQuery('');
    setSearchResults([]);
    setProductResults([]);
    setOwnedCards([]);
    setSearching(false);
    setCollectionLoading(false);
    setEvidencePhotos({});
    setActiveEvidenceIndex(0);
    setXimilarStatus('idle');
    setXimilarError(null);
    setXimilarEstimate(null);
    setConditionDiscrepancyReason('');
    setSellerDeclarationAccepted(false);
    setAiDeclarationAccepted(false);
    setDraftSaved(false);
  }, []);

  useEffect(() => {
    let mounted = true;
    let authEventEpoch = 0;
    const bindDraftSession = (userId: string | null) => {
      if (!mounted || draftAuthUserIdRef.current === userId) return;
      draftAuthUserIdRef.current = userId;
      draftAuthGenerationRef.current += 1;
      resetListingDraftState();
      setDraftSessionUserId(userId);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      authEventEpoch += 1;
      bindDraftSession(session?.user?.id ?? null);
    });

    const initialAuthEventEpoch = authEventEpoch;
    void supabase.auth.getUser().then(({ data, error }) => {
      if (!mounted || initialAuthEventEpoch !== authEventEpoch) return;
      if (error) {
        console.log('Listing draft user lookup failed:', error.message);
        bindDraftSession(null);
        return;
      }
      bindDraftSession(data.user?.id ?? null);
    });

    return () => {
      mounted = false;
      draftAuthGenerationRef.current += 1;
      subscription.unsubscribe();
    };
  }, [resetListingDraftState]);

  useEffect(() => {
    if (draftSessionUserId === undefined) return;
    let cancelled = false;
    const expectedUserId = draftSessionUserId;
    const expectedGeneration = draftAuthGenerationRef.current;
    const isCurrentDraftIdentity = () => (
      !cancelled
      && draftAuthUserIdRef.current === expectedUserId
      && draftAuthGenerationRef.current === expectedGeneration
    );
    const verifyCurrentDraftIdentity = async () => {
      if (!expectedUserId || !isCurrentDraftIdentity()) return false;
      const { data: { user }, error } = await supabase.auth.getUser();
      return !error && user?.id === expectedUserId && isCurrentDraftIdentity();
    };
    const restoreDraft = async () => {
      try {
        if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
        setDraftLoaded(false);
        setDraftStorageKey(null);
        resetListingDraftState();
        await clearLegacyCreateListingDraft();
        if (!isCurrentDraftIdentity() || !expectedUserId) return;
        if (!await verifyCurrentDraftIdentity()) return;

        const scopedDraftKey = getCreateListingDraftKey(expectedUserId);
        setDraftStorageKey(scopedDraftKey);
        if (routeHasPrefill) return;

        const raw = await AsyncStorage.getItem(scopedDraftKey);
        if (!raw || !await verifyCurrentDraftIdentity()) return;

        const draft = JSON.parse(raw) as DraftState;
        if (!isCurrentDraftIdentity()) return;
        const restoredSelectedCard = draft.selectedCard ?? null;
        persistedDraftSelectedCardRef.current = restoredSelectedCard;
        const restoredSelectedProduct = draft.selectedProduct ?? null;
        const restoredSubjectType = resolveListingSubjectTypeForSelection({
          requested: draft.listingSubjectType,
          selectedCard: restoredSelectedCard,
          selectedProduct: restoredSelectedProduct,
        });
        setStep(draft.step ?? 'category');
        setIdentificationMethod(draft.identificationMethod ?? null);
        setSelectedCard(restoredSelectedCard);
        setSelectedProduct(restoredSelectedProduct);
        setManualIdentity({
          ...(draft.manualIdentity ?? DEFAULT_MANUAL_IDENTITY),
          state: restoredSubjectType,
          variant: restoredSubjectType === 'graded_slab' ? 'Graded slab' : getListingCategoryConfig(restoredSubjectType).title,
        });
        setListingSubjectType(restoredSubjectType);
        setListingMode(draft.listingMode ?? 'sell');
        setSellerCondition(draft.sellerCondition ?? '');
        setSealedStatus(draft.sealedStatus ?? 'Factory sealed');
        setPackagingCondition(draft.packagingCondition ?? 'Excellent');
        setSlabCaseCondition(draft.slabCaseCondition ?? 'Clean');
        setCertificationNumber(draft.certificationNumber ?? '');
        setSlabCertification(draft.slabCertification ?? null);
        setAskingPrice(draft.askingPrice ?? '');
        setTradeValue(draft.tradeValue ?? '');
        setOffersAccepted(draft.offersAccepted ?? true);
        setMinimumOffer(draft.minimumOffer ?? '');
        setWantedCards(draft.wantedCards ?? '');
        setDescription(draft.description ?? '');
        setKnownDefects(draft.knownDefects ?? '');
        setSelectedProtectionTier(draft.selectedProtectionTier ?? null);
        setSilverLiabilityAccepted(draft.silverLiabilityAccepted ?? false);
        setQuantity(draft.quantity ?? '1');
        setGradingCompany(formatSlabCompanyLabel(draft.gradingCompany ?? 'PSA'));
        setGrade(draft.grade ?? '10');
        setEvidencePhotos(draft.evidencePhotos ?? {});
        setXimilarEstimate(draft.ximilarEstimate ?? null);
        setXimilarStatus(draft.ximilarStatus ?? 'idle');
        setConditionDiscrepancyReason(draft.conditionDiscrepancyReason ?? '');
        setSellerDeclarationAccepted(draft.sellerDeclarationAccepted ?? false);
        setAiDeclarationAccepted(draft.aiDeclarationAccepted ?? false);
      } catch (error) {
        console.log('Listing draft restore failed:', error);
      } finally {
        if (isCurrentDraftIdentity()) setDraftLoaded(true);
      }
    };

    void restoreDraft();
    return () => {
      cancelled = true;
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [draftSessionUserId, resetListingDraftState, routeHasPrefill]);

  const buildDraftState = useCallback((): DraftState => ({
    step,
    identificationMethod,
    selectedCard: listingCardForPersistence(selectedCard, persistedDraftSelectedCardRef.current),
    selectedProduct,
    manualIdentity,
    listingSubjectType,
    listingMode,
    sellerCondition,
    sealedStatus,
    packagingCondition,
    slabCaseCondition,
    certificationNumber,
    askingPrice,
    tradeValue,
    offersAccepted,
    minimumOffer,
    wantedCards,
    description,
    knownDefects,
    selectedProtectionTier,
    silverLiabilityAccepted,
    quantity,
    gradingCompany: displayGradingCompany,
    grade,
    slabCertification,
    evidencePhotos,
    ximilarEstimate,
    ximilarStatus,
    conditionDiscrepancyReason,
    sellerDeclarationAccepted,
    aiDeclarationAccepted,
    updatedAt: new Date().toISOString(),
  }), [
    aiDeclarationAccepted,
    askingPrice,
    certificationNumber,
    conditionDiscrepancyReason,
    description,
    evidencePhotos,
    grade,
    displayGradingCompany,
    identificationMethod,
    knownDefects,
    listingMode,
    listingSubjectType,
    manualIdentity,
    minimumOffer,
    offersAccepted,
    packagingCondition,
    quantity,
    selectedCard,
    selectedProduct,
    selectedProtectionTier,
    sealedStatus,
    sellerCondition,
    sellerDeclarationAccepted,
    silverLiabilityAccepted,
    slabCertification,
    slabCaseCondition,
    step,
    tradeValue,
    wantedCards,
    ximilarEstimate,
    ximilarStatus,
  ]);

  useEffect(() => {
    if (!draftLoaded || !draftSessionUserId || !draftStorageKey || step === 'success') return;
    const authenticatedDraftKey = getCreateListingDraftKey(draftSessionUserId);
    if (draftStorageKey !== authenticatedDraftKey) return;
    if (suppressNextAutoSaveRef.current) {
      suppressNextAutoSaveRef.current = false;
      return;
    }
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      void (async () => {
        try {
          const { data: { user }, error } = await supabase.auth.getUser();
          if (error) throw error;
          if (user?.id !== draftSessionUserId) return;
          if (getCreateListingDraftKey(user.id) !== draftStorageKey) return;
          const draftState = buildDraftState();
          await AsyncStorage.setItem(draftStorageKey, JSON.stringify(draftState));
          persistedDraftSelectedCardRef.current = draftState.selectedCard;
          setDraftSaved(true);
          setTimeout(() => setDraftSaved(false), 1400);
        } catch (error) {
          console.log('Listing draft save failed:', error);
        }
      })();
    }, AUTO_SAVE_DELAY_MS);
  }, [buildDraftState, draftLoaded, draftSessionUserId, draftStorageKey, step]);

  useEffect(() => {
    setSelectedProtectionTier((current) => (
      current && (!usesProtectionTier || !allowedProtectionTiers.includes(current)) ? null : current
    ));
  }, [allowedProtectionTiers, usesProtectionTier]);

  useEffect(() => {
    if (!silverAgreementRequired) setSilverLiabilityAccepted(false);
  }, [silverAgreementRequired]);

  useEffect(() => {
    if (step === 'gold') {
      setStep('details');
    } else if (!usesProtectionTier && (step === 'protection' || step === 'ai')) {
      setStep('evidence');
    }
  }, [step, usesProtectionTier]);

  useEffect(() => {
    if (!selectedProduct) return;
    const productSubjectType = getListingSubjectTypeForProduct(selectedProduct);
    if (storedListingSubjectType === productSubjectType) return;

    setListingSubjectType(productSubjectType);
    setSelectedProtectionTier(null);
    setEvidencePhotos({});
    setActiveEvidenceIndex(0);
    setCertificationNumber('');
    setSlabCertification(null);
    setSlabCaseCondition('Clean');
    setManualIdentity((current) => ({
      ...current,
      state: productSubjectType,
      variant: getListingCategoryConfig(productSubjectType).title,
    }));
  }, [storedListingSubjectType, selectedProduct]);

  useEffect(() => {
    if (listingSubjectType === 'graded_slab') {
      setSellerCondition(getSlabConditionLabel(displayGradingCompany, grade));
    }
  }, [grade, displayGradingCompany, listingSubjectType]);

  useEffect(() => {
    const cardId = typeof params.cardId === 'string' ? params.cardId : null;
    const productName = typeof params.productName === 'string' ? params.productName.trim() : '';
    const typeParam = isListingSubjectType(params.type) ? params.type : null;

    if (productName && typeParam && !isCardSubject(typeParam)) {
      setManualIdentity({
        ...DEFAULT_MANUAL_IDENTITY,
        cardName: productName,
        setName: PRODUCT_TYPE_LABELS[typeParam] ?? 'Sealed product',
        state: typeParam,
      });
      setListingSubjectType(typeParam);
      setIdentificationMethod('manual');
      setStep('condition');
      if (canUseProductCatalogue(typeParam)) void fetchProductPrices(productName, typeParam);
      return;
    }

    if (!cardId || selectedCard?.id === cardId) return;

    let cancelled = false;
    const loadPrefilledCard = async () => {
      try {
        const data = (await fetchCachedPokemonCardDetails([cardId])).get(cardId);
        if (!data || cancelled) return;

        const card = mapCardRow(data);
        setSelectedCard(card);
        setSearchQuery(card.name);
        setListingLanguage(normalizePokemonCardLanguage(card.language));
        setListingSubjectType(typeParam === 'graded_slab' ? 'graded_slab' : 'raw_card');
        setIdentificationMethod('search');
        setStep('confirm');
        void fetchPrices(card, typeParam === 'graded_slab' ? 'graded_slab' : 'raw_card');
      } catch (error) {
        console.log('Failed to load prefilled listing card:', error);
      }
    };

    void loadPrefilledCard();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.cardId, params.productName, params.setId, params.type, selectedCard?.id]);

  const fetchPrices = useCallback(async (card: SelectedCard, subjectType: ListingSubjectType = listingSubjectType) => {
    setPrices({ ...DEFAULT_PRICES, loading: true });
    try {
      const setName = card.set_name && card.set_name !== card.set_id ? card.set_name : '';
      const pokeTrace = await fetchPokeTraceCardPrice({
        identifier: card.id,
        setName,
        number: card.number ?? null,
        language: card.language ?? null,
        market: 'US',
        gradingCompany: displayGradingCompany,
        grade: grade.trim() || '10',
      });

      const market = subjectType === 'graded_slab'
        ? pokeTrace?.graded_average ?? null
        : pokeTrace?.stackr_central ?? null;
      const low = subjectType === 'graded_slab'
        ? pokeTrace?.graded_low ?? null
        : pokeTrace?.stackr_low ?? null;
      const high = subjectType === 'graded_slab'
        ? pokeTrace?.graded_high ?? null
        : pokeTrace?.stackr_high ?? null;

      setPrices({
        market,
        low,
        high,
        graded: pokeTrace?.graded_average ?? null,
        loading: false,
        unavailable: market == null,
      });
    } catch (error) {
      console.log('Listing price fetch failed:', error);
      setPrices({ ...DEFAULT_PRICES, loading: false, unavailable: true });
    }
  }, [grade, displayGradingCompany, listingSubjectType]);

  const fetchProductPrices = useCallback(async (name: string, type: ListingSubjectType = listingSubjectType) => {
    setPrices({ ...DEFAULT_PRICES, loading: true });
    try {
      const lookupType = getListingCategoryConfig(type).catalogueProductType;
      if (!lookupType) {
        setPrices({ ...DEFAULT_PRICES, loading: false, unavailable: true });
        return;
      }
      const data = await getProductPriceWithFallback(name, lookupType);
      setPrices({
        market: data?.average ?? null,
        low: data?.low ?? null,
        high: data?.high ?? null,
        graded: null,
        loading: false,
        unavailable: data?.average == null,
      });
    } catch {
      setPrices({ ...DEFAULT_PRICES, loading: false, unavailable: true });
    }
  }, [listingSubjectType]);

  useEffect(() => {
    if (selectedCard && listingSubjectType === 'graded_slab') {
      void fetchPrices(selectedCard, listingSubjectType);
    }
  }, [fetchPrices, grade, displayGradingCompany, listingSubjectType, selectedCard]);

  const clearListingSearchState = useCallback((options: { keepQuery?: boolean } = {}) => {
    searchRequestIdRef.current += 1;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!options.keepQuery) setSearchQuery('');
    setCollectionSearchQuery('');
    setSearchResults([]);
    setProductResults([]);
    setSearching(false);
  }, []);

  const openListingScanner = useCallback(() => {
    const listingScanIntent = listingSubjectType === 'graded_slab' ? 'graded_slab' : 'raw_listing';
    router.push({
      pathname: '/scan',
      params: buildScanRouteParamsForIntent(listingScanIntent, { flow: 'listing' }),
    } as any);
  }, [listingSubjectType]);

  const runSearch = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSearchResults([]);
      return;
    }

    const requestId = ++photoCatalogueSuggestionRef.current;
    setSearching(true);
    try {
      const data = await searchLocalPokemonCards<any>(trimmed, {
        language: 'all',
        limit: 60,
        select: 'id, name, language, number, rarity, image_small, image_large, set_id, raw_data',
      });
      if (requestId !== searchRequestIdRef.current) return;
      let mappedResults = (data ?? []).map(mapCardRow);
      if (!mappedResults.length) {
        const language = normalizePokemonCardLanguage(listingLanguage);
        const foreignCards = await searchForeignPokemonCards({
          query: trimmed,
          language,
          limit: 60,
          includeDetails: true,
        }).catch((error) => {
          console.log('Foreign card search failed:', error);
          return [];
        });
        if (requestId !== photoCatalogueSuggestionRef.current) return;
        mappedResults = foreignCards.map(mapForeignCardRow);
      }
      setSearchResults(mappedResults);
      setRecentSearches((previous) => [trimmed, ...previous.filter((item) => item !== trimmed)].slice(0, 6));
    } catch (error) {
      console.log('Listing search failed:', error);
      if (requestId !== searchRequestIdRef.current) return;
      setSearchResults([]);
    } finally {
      if (requestId === searchRequestIdRef.current) setSearching(false);
    }
  }, [listingLanguage]);

  useEffect(() => {
    const listingAction = typeof params.listingAction === 'string' ? params.listingAction : null;
    if (!draftLoaded || listingAction !== 'manual') return;

    const query = typeof params.q === 'string' ? params.q : '';
    const typeParam = isListingSubjectType(params.type) ? params.type : 'raw_card';
    const signature = `${listingAction}:${typeParam}:${query}`;
    if (listingActionHandledRef.current === signature) return;
    listingActionHandledRef.current = signature;

    clearListingSearchState({ keepQuery: Boolean(query.trim()) });
    setListingSubjectType(typeParam);
    setIdentificationMethod('search');
    setStep('identify');
    if (query.trim()) {
      setSearchQuery(query);
      void runSearch(query);
    }
  }, [clearListingSearchState, draftLoaded, params.listingAction, params.q, params.type, runSearch]);

  const runProductSearch = useCallback(async (query: string, type: ListingSubjectType = listingSubjectType) => {
    const trimmed = query.trim();
    if (!trimmed) {
      setProductResults([]);
      return;
    }

    const lookupType = getListingCategoryConfig(type).catalogueProductType;
    if (!lookupType) {
      setProductResults([]);
      return;
    }

    const requestId = ++searchRequestIdRef.current;
    setSearching(true);
    try {
      const data = await searchMarketProducts(trimmed, lookupType, 24, { language: listingLanguage });
      if (requestId !== searchRequestIdRef.current) return;
      setProductResults(data);
      setRecentSearches((previous) => [trimmed, ...previous.filter((item) => item !== trimmed)].slice(0, 6));
    } catch (error) {
      console.log('Listing product search failed:', error);
      if (requestId !== searchRequestIdRef.current) return;
      setProductResults([]);
    } finally {
      if (requestId === searchRequestIdRef.current) setSearching(false);
    }
  }, [listingLanguage, listingSubjectType]);

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      if (isCardSubject(listingSubjectType)) void runSearch(text);
      else void runProductSearch(text, listingSubjectType);
    }, 300);
  };

  const loadOwnedCards = useCallback(async (
    expectedUserId = draftAuthUserIdRef.current,
    expectedGeneration = draftAuthGenerationRef.current,
  ) => {
    const requestId = ++ownedCardsRequestIdRef.current;
    const isCurrentRequest = () => (
      Boolean(expectedUserId)
      && draftAuthUserIdRef.current === expectedUserId
      && draftAuthGenerationRef.current === expectedGeneration
      && ownedCardsRequestIdRef.current === requestId
    );
    if (!expectedUserId || !isCurrentRequest()) {
      setOwnedCards([]);
      setCollectionLoading(false);
      return;
    }
    setCollectionLoading(true);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (user?.id !== expectedUserId || !isCurrentRequest()) return;

      const ownershipRows = await fetchOwnedCardRows();
      if (!isCurrentRequest()) return;
      const ownershipByCard = new Map<string, { setId: string | null; quantity: number }>();

      ownershipRows.forEach((row) => {
        if (!row.card_id) return;
        const current = ownershipByCard.get(row.card_id) ?? { setId: row.set_id ?? null, quantity: 0 };
        ownershipByCard.set(row.card_id, {
          setId: current.setId ?? row.set_id ?? null,
          quantity: current.quantity + Math.max(1, Number(row.quantity ?? 1) || 1),
        });
      });

      const ids = Array.from(ownershipByCard.keys());
      if (!ids.length) {
        if (isCurrentRequest()) setOwnedCards([]);
        return;
      }

      const [cardDetails, priceSnapshots] = await Promise.all([
        fetchCachedPokemonCardDetails(ids),
        fetchLatestMarketSnapshots(ids),
      ]);
      if (!isCurrentRequest()) return;

      const nextCards = ids.map((cardId) => {
        const ownership = ownershipByCard.get(cardId);
        const row = cardDetails.get(cardId);
        const snapshot = priceSnapshots.get(cardId);
        const raw = row?.raw_data ?? {};
        const foreignPreferredPrice = typeof raw?.pricing?.preferredGbp === 'number'
          ? Number(raw.pricing.preferredGbp)
          : null;
        const preferred = getPreferredMarketPrice(snapshot, {
          tcg: getTcgFallbackValue(raw),
          cardmarket: getCardmarketFallbackValue(raw),
        });
        const estimatedValue = preferred.value ?? foreignPreferredPrice;

        return mapCardRow({
          ...(row ?? {}),
          id: row?.id ?? cardId,
          name: row?.name ?? cardId,
          set_id: row?.set_id ?? ownership?.setId ?? '',
          ownedQuantity: ownership?.quantity ?? 1,
          estimatedValue,
          estimatedValueSource: preferred.source ?? (foreignPreferredPrice != null ? 'provider' : null),
        });
      });

      if (isCurrentRequest()) setOwnedCards(sortOwnedCardsByValue(nextCards));
    } catch (error) {
      console.log('Owned listing cards load failed:', error);
      if (isCurrentRequest()) setOwnedCards([]);
    } finally {
      if (isCurrentRequest()) setCollectionLoading(false);
    }
  }, []);

  const filteredOwnedCards = useMemo(() => {
    const query = collectionSearchQuery.trim().toLowerCase();
    if (!query) return ownedCards;
    const terms = query.split(/\s+/).filter(Boolean);
    return ownedCards.filter((card) => {
      const text = getOwnedCardSearchText(card);
      return terms.every((term) => text.includes(term));
    });
  }, [collectionSearchQuery, ownedCards]);

  const selectCard = async (card: SelectedCard) => {
    setSelectedCard(card);
    setSelectedProduct(null);
    setManualIdentity(DEFAULT_MANUAL_IDENTITY);
    setListingLanguage(normalizePokemonCardLanguage(card.language));
    setListingSubjectType(listingSubjectType === 'graded_slab' ? 'graded_slab' : 'raw_card');
    setStep('confirm');
    await Haptics.selectionAsync();
    void fetchPrices(card, listingSubjectType);
  };

  const selectSlabCardForManualEntry = async (card: SelectedCard) => {
    setSelectedCard(card);
    setSelectedProduct(null);
    setManualIdentity((current) => ({
      ...current,
      cardName: card.name,
      setName: card.set_name ?? card.set_id,
      cardNumber: card.number ?? '',
      language: card.language ?? current.language,
      variant: card.variant ?? 'Graded slab',
      state: 'graded_slab',
    }));
    setListingSubjectType('graded_slab');
    setListingLanguage(normalizePokemonCardLanguage(card.language));
    setSearchQuery(card.name);
    setSearchResults([]);
    setSellerCondition(getSlabConditionLabel(displayGradingCompany, grade));
    await Haptics.selectionAsync();
    void fetchPrices(card, 'graded_slab');
  };

  const handleManualSlabCardNameChange = (value: string) => {
    setManualIdentity((current) => ({ ...current, cardName: value }));
    if (selectedCard && value.trim().toLowerCase() !== selectedCard.name.toLowerCase()) {
      setSelectedCard(null);
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      void runSearch(value);
    }, 260);
  };

  const selectProduct = async (product: MarketProduct) => {
    const productSubjectType = getListingSubjectTypeForProduct(product);
    const productCategoryConfig = getListingCategoryConfig(productSubjectType);
    setSelectedProduct(product);
    setSelectedCard(null);
    setListingSubjectType(productSubjectType);
    setSelectedProtectionTier(null);
    setEvidencePhotos({});
    setActiveEvidenceIndex(0);
    setCertificationNumber('');
    setSlabCertification(null);
    setSlabCaseCondition('Clean');
    setManualIdentity((current) => ({
      ...current,
      cardName: product.name,
      setName: product.set_name ?? '',
      cardNumber: '',
      variant: productCategoryConfig.title,
      state: productSubjectType,
    }));
    setPrices({
      market: product.latest_price?.average ?? null,
      low: product.latest_price?.low ?? null,
      high: product.latest_price?.high ?? null,
      graded: null,
      loading: false,
      unavailable: product.latest_price?.average == null,
    });
    setStep('condition');
    await Haptics.selectionAsync();
  };

  const selectSellingType = async (type: ListingSubjectType) => {
    clearListingSearchState();
    setListingSubjectType(type);
    setSelectedCard(null);
    setSelectedProduct(null);
    setSelectedProtectionTier(null);
    setEvidencePhotos({});
    setActiveEvidenceIndex(0);
    setCertificationNumber('');
    setSlabCertification(null);
    setManualIdentity((current) => ({
      ...current,
      state: type,
      variant: type === 'graded_slab' ? 'Graded slab' : getListingCategoryConfig(type).title,
    }));
    if (type === 'graded_slab') {
      setSellerCondition(getSlabConditionLabel(displayGradingCompany, grade));
    } else if (type === 'raw_card') {
      setSellerCondition('');
    }
    setStep('entry');
    await Haptics.selectionAsync();
  };

  const selectIdentificationMethod = (method: IdentificationMethod) => {
    clearListingSearchState();
    setIdentificationMethod(method);
    if (method === 'scan') {
      openListingScanner();
      return;
    }
    if (method === 'collection') {
      void loadOwnedCards(draftAuthUserIdRef.current, draftAuthGenerationRef.current);
    }
    setStep(method === 'manual' ? 'manual' : 'identify');
  };

  const handleListingLanguageChange = (language: ForeignPokemonLanguageCode) => {
    if (language === listingLanguage) return;
    setListingLanguage(language);
    clearListingSearchState();
    setManualIdentity((current) => ({
      ...current,
      language: getPokemonCardLanguageLabel(language),
    }));
  };

  const resetListingFlowToCategory = useCallback(() => {
    resetListingDraftState();
  }, [resetListingDraftState]);

  const returnToMarketHome = useCallback(() => {
    router.replace('/(tabs)/market' as any);
  }, []);

  const returnToMyListings = useCallback(() => {
    router.replace({ pathname: '/(tabs)/market', params: { segment: 'myListings' } } as any);
  }, []);

  const saveAndExitDraft = useCallback(async () => {
    try {
      if (!draftSessionUserId || !draftStorageKey) throw new Error('Listing draft session is unavailable.');
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      if (user?.id !== draftSessionUserId || getCreateListingDraftKey(user.id) !== draftStorageKey) {
        throw new Error('Your account changed while this listing draft was open.');
      }
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      await AsyncStorage.setItem(draftStorageKey, JSON.stringify(buildDraftState()));
      setDraftSaved(true);
      Alert.alert('Listing saved as a draft', 'You can resume it from My Listings when you are ready.', [
        { text: 'OK', onPress: returnToMyListings },
      ]);
    } catch {
      Alert.alert('Could not save draft', 'Please keep editing and try again.');
    }
  }, [buildDraftState, draftSessionUserId, draftStorageKey, returnToMyListings]);

  const discardAndExitDraft = useCallback(async () => {
    try {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      if (
        draftSessionUserId
        && draftStorageKey
        && user?.id === draftSessionUserId
        && getCreateListingDraftKey(user.id) === draftStorageKey
      ) {
        await AsyncStorage.removeItem(draftStorageKey);
      }
    } catch (error) {
      console.log('Listing draft discard failed:', error);
    } finally {
      resetListingFlowToCategory();
      returnToMarketHome();
    }
  }, [draftSessionUserId, draftStorageKey, resetListingFlowToCategory, returnToMarketHome]);

  const saveExitDraft = useCallback(() => {
    Alert.alert(
      'Discard this listing?',
      'Your listing details will be lost unless you save this as a draft.',
      [
        { text: 'Keep Editing', style: 'cancel' },
        { text: 'Discard Listing', style: 'destructive', onPress: () => void discardAndExitDraft() },
        { text: 'Save Draft', onPress: () => void saveAndExitDraft() },
      ]
    );
  }, [discardAndExitDraft, saveAndExitDraft]);

  const goBack = useCallback(() => {
    if (step === 'category') {
      saveExitDraft();
      return;
    }
    const previous: Record<FlowStep, FlowStep> = {
      category: 'category',
      entry: 'category',
      identify: 'entry',
      confirm: 'identify',
      manual: 'entry',
      condition: selectedCard ? 'confirm' : 'manual',
      value: 'condition',
      protection: 'value',
      evidence: usesProtectionTier ? 'protection' : 'value',
      ai: 'evidence',
      gold: verificationRequirements.requiresXimilar ? 'ai' : 'evidence',
      details: verificationRequirements.requiresXimilar ? 'ai' : 'evidence',
      review: 'details',
      success: 'review',
    };
    setStep(previous[step] ?? 'category');
  }, [requiresGoldReview, saveExitDraft, selectedCard, step, usesProtectionTier, verificationRequirements.requiresXimilar]);

  useEffect(() => {
    if (!isFocused || step === 'success') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      goBack();
      return true;
    });
    return () => subscription.remove();
  }, [goBack, isFocused, step]);

  const goToStage = (stage: ListingFlowStage) => {
    const stepByStage: Partial<Record<ListingFlowStage, FlowStep>> = {
      card: selectedCard ? 'confirm' : identityPendingReview ? 'manual' : 'category',
      condition: 'condition',
      value: 'value',
      protection: usesProtectionTier ? 'protection' : undefined,
      evidence: 'evidence',
      ai: 'ai',
      gold: 'gold',
      details: 'details',
      review: 'review',
    };
    const next = stepByStage[stage];
    if (next) setStep(next);
  };

  const maybeConfirmSlabCertification = (photo: EvidencePhoto) => {
    if (listingSubjectType !== 'graded_slab') return;
    if (photo.evidenceKey !== 'slab_label' && photo.evidenceKey !== 'slab_cert') return;

    const candidate = photo.certificationCandidate
      ?? extractCertificationNumberFromText(photo.barcodeData)
      ?? extractCertificationNumberFromText(photo.ocrText);
    if (!candidate || candidate === certificationNumber.trim()) return;

    Alert.alert(
      'Confirm certification number',
      `Grader: ${displayGradingCompany}\nGrade: ${grade || 'Not set'}\nCertification number: ${candidate}`,
      [
        { text: 'Edit', onPress: () => setStep('condition') },
        {
          text: 'Confirm details',
          onPress: () => {
            setCertificationNumber(candidate);
            setSlabCertification({
              grader: displayGradingCompany,
              grade: grade.trim() || undefined,
              certificationNumber: candidate,
              captureMethod: getCertificationCaptureMethod(photo),
              confidence: photo.barcodeData ? 0.92 : photo.ocrText ? 0.74 : undefined,
              labelImageId: photo.requirementId ?? photo.evidenceKey ?? 'slab_label',
              verifiedByUser: true,
              capturedAt: new Date().toISOString(),
            });
          },
        },
      ]
    );
  };

  const getNextOpenCaptureRequirement = (completedRequirementId: string) => {
    const currentSlotIndex = captureRequirements.findIndex((item) => item.id === completedRequirementId);
    const nextRequired = captureRequirements.findIndex((item, index) => (
      index > currentSlotIndex
      && item.required
      && item.id !== completedRequirementId
      && !evidencePhotos[item.id]
    ));
    if (nextRequired >= 0) {
      return { requirement: captureRequirements[nextRequired], index: nextRequired };
    }

    const firstMissingRequired = captureRequirements.findIndex((item) => item.required && item.id !== completedRequirementId && !evidencePhotos[item.id]);
    if (firstMissingRequired >= 0) {
      return { requirement: captureRequirements[firstMissingRequired], index: firstMissingRequired };
    }

    const nextMissing = captureRequirements.findIndex((item, index) => (
      index > currentSlotIndex
      && item.id !== completedRequirementId
      && !evidencePhotos[item.id]
    ));
    if (nextMissing >= 0) {
      return { requirement: captureRequirements[nextMissing], index: nextMissing };
    }

    const firstMissing = captureRequirements.findIndex((item) => item.id !== completedRequirementId && !evidencePhotos[item.id]);
    if (firstMissing >= 0) {
      return { requirement: captureRequirements[firstMissing], index: firstMissing };
    }

    return null;
  };

  const moveToNextCaptureRequirement = (completedRequirementId: string) => {
    const nextOpen = getNextOpenCaptureRequirement(completedRequirementId);
    if (nextOpen) {
      setActiveEvidenceIndex(nextOpen.index);
      return nextOpen.requirement;
    }

    const currentSlotIndex = captureRequirements.findIndex((item) => item.id === completedRequirementId);
    if (currentSlotIndex >= 0) setActiveEvidenceIndex(currentSlotIndex);
    return null;
  };

  const shouldReadPhotoText = (requirement: CaptureRequirement) => (
    requirement.captureType === 'full_front'
    || requirement.captureType === 'full_back'
    || requirement.captureType === 'slab_label'
    || requirement.captureType === 'slab_qr'
  );

  const readPhotoTextForRequirement = async (uri: string, requirement: CaptureRequirement) => {
    if (!shouldReadPhotoText(requirement)) return { ocrText: null, candidate: null };
    try {
      const result = await TextRecognition.recognize(uri);
      const ocrText = result?.text?.trim() ?? '';
      return {
        ocrText,
        candidate: requirement.captureType === 'slab_label' || requirement.captureType === 'slab_qr'
          ? extractCertificationNumberFromText(ocrText)
          : null,
      };
    } catch {
      return { ocrText: null, candidate: null };
    }
  };

  const getQualityRetakeCopy = (quality: GuidedCaptureQuality) => (
    quality.warning ?? quality.highestPriorityIssue?.message ?? 'Use a sharper, brighter image with the item inside the guide.'
  );

  const confirmPhotoQuality = (quality: GuidedCaptureQuality): Promise<GuidedCaptureQuality | null> => {
    if (!quality.warning && !quality.requiresRetake) return Promise.resolve(quality);

    if (quality.requiresRetake || !quality.canOverride) {
      return new Promise((resolve) => {
        Alert.alert(
          'Retake needed',
          getQualityRetakeCopy(quality),
          [{ text: 'OK', onPress: () => resolve(null) }]
        );
      });
    }

    return new Promise((resolve) => {
      Alert.alert(
        'Photo warning',
        `${getQualityRetakeCopy(quality)}\n\nYou can continue if the item is still clearly identifiable and the issue does not hide condition detail.`,
        [
          { text: 'Retake', style: 'cancel', onPress: () => resolve(null) },
          {
            text: 'Use photo',
            onPress: () => resolve({
              ...quality,
              overrideAccepted: true,
              overrideReason: quality.warning ?? quality.highestPriorityIssue?.code ?? 'manual-quality-override',
            }),
          },
        ]
      );
    });
  };

  const assessPickerAssetQuality = async (
    requirement: CaptureRequirement,
    asset: ImagePicker.ImagePickerAsset,
    source: ListingPhotoSource
  ) => {
    const text = await readPhotoTextForRequirement(asset.uri, requirement);
    return {
      ...text,
      quality: assessGuidedCaptureQuality(asset.base64, requirement.captureType, {
        purpose: requirement.photoPurpose,
        tier: evidenceTier,
        required: requirement.required,
        source,
        fileName: asset.fileName ?? null,
        width: asset.width,
        height: asset.height,
        ocrText: text.ocrText,
      }),
    };
  };

  const addDuplicatePhotoIssue = (
    quality: GuidedCaptureQuality,
    duplicateLabel: string,
    block: boolean
  ): GuidedCaptureQuality => {
    const issue: ListingPhotoQualityIssue = {
      code: 'duplicate_photo',
      severity: block ? 'block' : 'warning',
      message: block
        ? `Retake needed: this appears to be the same photograph already used for ${duplicateLabel}.`
        : `This appears to be the same photograph already used for ${duplicateLabel}.`,
      guidance: 'Use a different photograph for this requested angle.',
      priority: 1,
      canOverride: !block,
    };
    return {
      ...quality,
      issues: [issue, ...(quality.issues ?? [])],
      highestPriorityIssue: issue,
      severity: block ? 'block' : quality.severity === 'retake' || quality.severity === 'block' ? quality.severity : 'warning',
      requiresRetake: block || quality.requiresRetake,
      canOverride: !block && Boolean(quality.canOverride),
      warning: issue.message,
    };
  };

  const getCatalogueSearchTextFromPhoto = (photo: EvidencePhoto) => {
    const ocrTerms = String(photo.ocrText ?? '')
      .replace(/[^\p{L}\p{N}#/\\\-\s]/gu, ' ')
      .split(/\s+/)
      .map((term) => term.trim())
      .filter((term) => term.length >= 2 && !/^(hp|psa|cgc|bgs|ace|tag|grade|near|mint)$/i.test(term))
      .slice(0, 10)
      .join(' ');
    return [
      manualIdentity.cardName.trim(),
      manualIdentity.cardNumber.trim(),
      ocrTerms,
    ].filter(Boolean).join(' ').trim();
  };

  const maybeSuggestCardMatchFromPhoto = (photo: EvidencePhoto) => {
    if (selectedCard || !isCardSubject(listingSubjectType)) return;
    if (photo.captureType !== 'full_front' && photo.evidenceKey !== 'front') return;
    const query = getCatalogueSearchTextFromPhoto(photo);
    if (query.length < 3) return;

    const signature = `${photo.requirementId ?? photo.evidenceKey ?? 'front'}:${photo.quality.imageFingerprint ?? query}`;
    if (photoCatalogueMatchRef.current === signature) return;
    photoCatalogueMatchRef.current = signature;
    const requestId = ++searchRequestIdRef.current;

    void (async () => {
      try {
        const data = await searchLocalPokemonCards<any>(query, {
          language: 'all',
          limit: 5,
          select: 'id, name, language, number, rarity, image_small, image_large, set_id, raw_data',
        });
        let matches = (data ?? []).map(mapCardRow);
        if (!matches.length) {
          const foreignCards = await searchForeignPokemonCards({
            query,
            language: normalizePokemonCardLanguage(listingLanguage),
            limit: 5,
            includeDetails: true,
          }).catch((error) => {
            console.log('Photo foreign catalogue suggestion failed:', error);
            return [];
          });
          matches = foreignCards.map(mapForeignCardRow);
        }
        if (requestId !== searchRequestIdRef.current) return;
        if (!matches.length) return;
        setIdentificationMethod('search');
        setSearchQuery(query);
        setSearchResults(matches);
        Alert.alert(
          'Catalogue matches found',
          'Stackr found possible catalogue records from this card photo. Confirm the exact card so the listing appears on the card page and marketplace search.',
          [
            { text: 'Keep adding photos', style: 'cancel' },
            { text: 'Review matches', onPress: () => setStep('identify') },
          ]
        );
      } catch (error) {
        console.log('Photo catalogue suggestion failed:', error);
      }
    })();
  };

  const storeRequirementPhoto = (
    requirement: CaptureRequirement,
    result: GuidedCaptureResult | ImagePicker.ImagePickerAsset,
    captureSource: ListingPhotoSource = 'guided_camera'
  ) => {
    const base64 = 'base64' in result ? result.base64 ?? null : null;
    const guidedResult = result as GuidedCaptureResult;
    const quality = 'quality' in result
      ? guidedResult.quality
      : assessGuidedCaptureQuality(base64, requirement.captureType, {
        purpose: requirement.photoPurpose,
        tier: evidenceTier,
        required: requirement.required,
        source: captureSource,
        width: 'width' in result ? result.width : undefined,
        height: 'height' in result ? result.height : undefined,
      });
    const duplicate = Object.values(evidencePhotos).find((existing) => (
      existing?.requirementId !== requirement.id
      && existing?.quality.imageFingerprint
      && quality.imageFingerprint
      && isLikelyDuplicateListingPhoto(existing.quality.imageFingerprint, quality.imageFingerprint)
    ));
    const qualityWithDuplicate = duplicate
      ? addDuplicatePhotoIssue(quality, duplicate.requirementLabel ?? duplicate.requirementId ?? 'another angle', requirement.required)
      : quality;

    if (qualityWithDuplicate.requiresRetake || qualityWithDuplicate.severity === 'block') {
      Alert.alert('Different photo needed', getQualityRetakeCopy(qualityWithDuplicate));
      return false;
    }

    const photo: EvidencePhoto = {
      uri: result.uri,
      sourceUri: 'sourceUri' in result ? guidedResult.sourceUri ?? result.uri : result.uri,
      previewUri: 'previewUri' in result ? guidedResult.previewUri ?? result.uri : result.uri,
      width: 'width' in result ? result.width : undefined,
      height: 'height' in result ? result.height : undefined,
      base64,
      crop: 'crop' in result ? guidedResult.crop ?? null : null,
      captureFrame: 'captureFrame' in result ? guidedResult.captureFrame ?? null : null,
      requirementId: requirement.id,
      requirementLabel: requirement.label,
      captureType: requirement.captureType,
      evidenceKey: requirement.evidenceKey,
      captureSource,
      localStatus: 'saved_locally',
      barcodeData: 'barcodeData' in result ? guidedResult.barcodeData ?? null : null,
      barcodeType: 'barcodeType' in result ? guidedResult.barcodeType ?? null : null,
      ocrText: 'ocrText' in result ? guidedResult.ocrText ?? null : null,
      certificationCandidate: 'certificationCandidate' in result ? guidedResult.certificationCandidate ?? null : null,
      quality: {
        purpose: qualityWithDuplicate.purpose,
        purposeLabel: qualityWithDuplicate.purposeLabel,
        fullCardVisible: qualityWithDuplicate.fullCardVisible,
        steady: qualityWithDuplicate.steady,
        lighting: qualityWithDuplicate.lighting,
        singleCard: qualityWithDuplicate.singleCard,
        glareOk: qualityWithDuplicate.glareOk,
        warning: qualityWithDuplicate.warning ?? null,
        issues: qualityWithDuplicate.issues ?? [],
        highestPriorityIssue: qualityWithDuplicate.highestPriorityIssue ?? null,
        severity: qualityWithDuplicate.severity,
        requiresRetake: qualityWithDuplicate.requiresRetake,
        canOverride: qualityWithDuplicate.canOverride,
        overrideAccepted: qualityWithDuplicate.overrideAccepted,
        overrideReason: qualityWithDuplicate.overrideReason ?? null,
        imageFingerprint: qualityWithDuplicate.imageFingerprint ?? null,
        metrics: qualityWithDuplicate.metrics ?? null,
      },
    };

    setEvidencePhotos((current) => ({ ...current, [requirement.id]: photo }));
    maybeConfirmSlabCertification(photo);
    maybeSuggestCardMatchFromPhoto(photo);
    const nextRequirement = moveToNextCaptureRequirement(requirement.id);
    if (activeCaptureRequirement?.id === requirement.id) {
      setActiveCaptureRequirement(nextRequirement);
    }
    return true;
  };

  const findCaptureRequirement = (idOrSlot: string) => (
    getRequirementById(captureRequirements, idOrSlot)
    ?? captureRequirements.find((item) => item.evidenceKey === idOrSlot && !evidencePhotos[item.id])
    ?? captureRequirements.find((item) => item.evidenceKey === idOrSlot)
    ?? null
  );

  const captureRequirementWithSystemCamera = async (requirement: CaptureRequirement) => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera permission needed', 'Allow camera access to take listing photos.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.84,
        allowsEditing: false,
        base64: true,
      });
      if (result.canceled || !result.assets[0]) return;

      const assessment = await assessPickerAssetQuality(requirement, result.assets[0], 'system_camera');
      const resolvedQuality = await confirmPhotoQuality(assessment.quality);
      if (!resolvedQuality) {
        return;
      }

      const saved = storeRequirementPhoto(requirement, {
        ...result.assets[0],
        quality: resolvedQuality,
        ocrText: assessment.ocrText,
        certificationCandidate: assessment.candidate,
      } as any, 'system_camera');
      if (!saved) return;
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (error: any) {
      Alert.alert('Photo not captured', error?.message ?? 'Try again with the full item visible and good lighting.');
    }
  };

  const capturePhoto = async (slot: string, fromCamera = true) => {
    try {
      const requirement = findCaptureRequirement(slot);
      if (!requirement) {
        Alert.alert('Photo step unavailable', 'This photo is not needed for the current listing tier.');
        return;
      }

      if (fromCamera) {
        setActiveCaptureRequirement(requirement);
        await Haptics.selectionAsync().catch(() => {});
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        quality: 0.84,
        allowsEditing: false,
        base64: true,
      });
      if (result.canceled || !result.assets[0]) return;

      const assessment = await assessPickerAssetQuality(requirement, result.assets[0], 'library');
      const resolvedQuality = await confirmPhotoQuality(assessment.quality);
      if (!resolvedQuality) {
        return;
      }

      const saved = storeRequirementPhoto(requirement, {
        ...result.assets[0],
        quality: resolvedQuality,
        ocrText: assessment.ocrText,
        certificationCandidate: assessment.candidate,
      } as any, 'library');
      if (!saved) return;
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      Alert.alert('Photo not captured', error?.message ?? 'Try again with the full card visible and good lighting.');
    }
  };

  const selectProtectionTier = (tier: ListingProtectionTier) => {
    const nextOverride = tier === recommendedProtectionTier ? null : tier;
    const nextManualSilver = tier === 'silver' && nextOverride != null;

    if (nextManualSilver) {
      Alert.alert(
        'Silver requires agreement',
        silverAgreementDisclosure,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Use Silver',
            onPress: () => {
              setSelectedProtectionTier('silver');
              setSilverLiabilityAccepted(false);
              void Haptics.selectionAsync();
            },
          },
        ]
      );
      return;
    }

    setSelectedProtectionTier(nextOverride);
    setSilverLiabilityAccepted(false);
    void Haptics.selectionAsync();
  };

  const readPhotoBase64 = async (photo: EvidencePhoto) => {
    if (photo.base64) return photo.base64;
    return FileSystem.readAsStringAsync(photo.sourceUri ?? photo.uri, { encoding: 'base64' });
  };

  const runXimilarAnalysis = async () => {
    const analysisSlots = ['front', 'back', 'surface_front', 'surface_back'] as EvidenceSlotKey[];
    const images = analysisSlots
      .map((slot) => evidencePhotos[slot])
      .filter(Boolean) as EvidencePhoto[];
    const frontPhoto = evidencePhotos.front ?? evidencePhotos.surface_front ?? images[0] ?? null;

    if (images.length < 2) {
      Alert.alert('More images needed', 'Add at least front and back photographs before starting the AI-assisted condition check.');
      return;
    }

    setXimilarStatus('processing');
    setXimilarError(null);
    try {
      const frontBase64 = frontPhoto ? await readPhotoBase64(frontPhoto) : null;
      const centeringAssessment = frontBase64 ? assessCardCenteringFromJpeg(frontBase64) : null;
      const payload: XimilarGradeImage[] = [];
      for (const [index, image] of images.entries()) {
        payload.push({
          base64: image === frontPhoto && frontBase64 ? frontBase64 : await readPhotoBase64(image),
          side: index === 1 ? 'Back' : 'Front',
        });
      }

      const result = await gradeCardWithXimilar(payload);
      const record = result.records?.[0];
      const grades = record?.grades;
      const finalScore = grades?.final ?? null;
      const estimate: XimilarEstimate = {
        condition: mapXimilarScoreToCondition(finalScore),
        confidence: finalScore != null && images.length >= 4 ? 'High confidence' : finalScore != null ? 'Moderate confidence' : 'Limited confidence',
        rawFinalScore: finalScore,
        centeringAssessment,
        breakdown: [
          { label: 'Visible centering', value: centeringAssessment ? formatCardCenteringAssessment(centeringAssessment) : grades?.centering != null ? `Provider centering score ${grades.centering.toFixed(1)}. Visual guidance only; not a professional grade.` : 'Visible centering guidance unavailable.' },
          { label: 'Corners', value: grades?.corners != null ? `Corners score ${grades.corners.toFixed(1)}` : 'Review the corner photographs manually.' },
          { label: 'Edges', value: grades?.edges != null ? `Edges score ${grades.edges.toFixed(1)}` : 'Review edge whitening manually.' },
          { label: 'Surface', value: grades?.surface != null ? `Surface score ${grades.surface.toFixed(1)}` : 'Surface estimate unavailable.' },
        ],
      };
      setXimilarEstimate(estimate);
      setXimilarStatus('complete');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      setXimilarStatus('failed');
      setXimilarError(error?.message ?? 'AI condition checking is temporarily unavailable. Your photos and draft are safe.');
    }
  };

  const generateDescription = () => {
    const title = cardTitle || categoryConfig.title;
    const parts = [
      `${title}${cardSubtitle ? ` from ${cardSubtitle}` : ''}.`,
      declaredCondition ? `Seller-declared condition: ${declaredCondition}.` : null,
      selectedProduct ? 'Catalogue image is provided as product reference; seller photos show the actual item.' : null,
      knownDefects.trim() ? `Known defects: ${knownDefects.trim()}.` : null,
      usesProtectionTier ? `Includes ${formatProtectionTier(protectionTier)} requirements.` : null,
    ].filter(Boolean);
    setDescription(parts.join(' '));
  };

  const uploadPhotos = async (userId: string): Promise<{ urls: string[]; bySlot: Partial<Record<string, string>> }> => {
    const urls: string[] = [];
    const bySlot: Partial<Record<string, string>> = {};
    for (const [photoId, photo] of Object.entries(evidencePhotos) as [string, EvidencePhoto][]) {
      const base64 = await readPhotoBase64(photo);
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let index = 0; index < binaryString.length; index += 1) {
        bytes[index] = binaryString.charCodeAt(index);
      }

      const safePhotoId = slugify(photoId) || 'photo';
      const path = `${userId}/${safePhotoId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.jpg`;
      const { data, error } = await supabase.storage
        .from('trade-listings')
        .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
      if (error) throw error;

      const { data: publicData } = supabase.storage
        .from('trade-listings')
        .getPublicUrl(data.path);
      urls.push(publicData.publicUrl);
      bySlot[photoId] = publicData.publicUrl;
      if (photo.evidenceKey && !bySlot[photo.evidenceKey]) bySlot[photo.evidenceKey] = publicData.publicUrl;
    }

    return { urls, bySlot };
  };

  const publishListing = async (skipDuplicateWarning = false, skipCertificationWarning = false) => {
    const missing = missingPublicationRequirements;
    if (missing.length) {
      Alert.alert('Listing not ready', missing[0].label);
      return;
    }

    setPublishing(true);
    try {
      const resolvedName = selectedCard?.name ?? selectedProduct?.name ?? manualIdentity.cardName.trim();
      for (const [field, value] of [
        ['Listing title', resolvedName],
        ['Card name', manualIdentity.cardName],
        ['Set name', manualIdentity.setName],
        ['Listing description', description],
        ['Known defects', knownDefects],
        ['Wanted cards', wantedCards],
        ['Listing notes', manualIdentity.notes],
      ] as const) {
        assertGate0UserCopyAllowed(value, field);
      }

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error('You must be signed in to publish a listing.');
      assertPremiumSellerWriteAccess(user);
      const authenticatedDraftKey = getCreateListingDraftKey(user.id);
      if (draftStorageKey !== authenticatedDraftKey) {
        throw new Error('Your account changed while this listing draft was open. Reopen the listing flow.');
      }

      let certificationReviewWarning: string | null = null;
      if (isGradedSlabListing && resolvedSlabCertification) {
        const duplicateReview = await fetchCertificationDuplicateReview(user.id, resolvedSlabCertification.certificationNumber);
        if (duplicateReview?.total) {
          certificationReviewWarning = 'Certification number matched an existing StackR record and the seller continued after review warning.';
          if (!skipCertificationWarning) {
            setPublishing(false);
            Alert.alert(
              'Check certification number',
              'This certification number may already be associated with another StackR item. Check the number before continuing.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Continue',
                  onPress: () => void publishListing(skipDuplicateWarning, true),
                },
              ]
            );
            return;
          }
        }
      }

      if (selectedCard) {
        const availability = await fetchUserCardAvailability({
          userId: user.id,
          cardId: selectedCard.id,
          setId: selectedCard.set_id,
        });

        if (availability.listedQuantity > 0 && !skipDuplicateWarning) {
          setPublishing(false);
          Alert.alert(
            'Possible duplicate listing',
            'This card already has an active Market listing. If you own another copy, you can continue with that copy.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Continue with another copy',
                onPress: () => void publishListing(true, skipCertificationWarning),
              },
            ]
          );
          return;
        }

        if (availability.ownedQuantity > 0) {
          assertCanCommitQuantity({
            ownedQuantity: availability.ownedQuantity,
            activeListedQuantity: availability.listedQuantity,
            pendingTransactionQuantity: availability.pendingTransactionQuantity,
          }, Number.parseInt(quantity, 10) || 1, 'copy');
        }
      }

      setUploading(true);
      const uploadResult = await uploadPhotos(user.id);
      setUploading(false);

      const cardId = selectedCard
        ? selectedCard.id
        : selectedProduct
          ? `product:${selectedProduct.id}`
          : `manual:${manualIdentity.state}:${slugify(resolvedName) || Date.now()}`;
      const setId = selectedCard?.set_id ?? selectedProduct?.set_name ?? null;
      const stockImageUrl = selectTcgdexReferencePersistenceImage(
        selectedCard ? getCardImageUrl(selectedCard) : catalogueImageUrl,
      );
      const frontUrl = uploadResult.bySlot.front ?? uploadResult.bySlot.packaging_front ?? uploadResult.bySlot.slab_front ?? null;
      const backUrl = uploadResult.bySlot.back ?? uploadResult.bySlot.packaging_back ?? uploadResult.bySlot.slab_back ?? null;
      const listingMedia: ListingMediaItem[] = [
        ...(stockImageUrl
          ? [{
              role: 'stock' as const,
              slot: 'stock',
              label: selectedProduct ? 'Catalogue image' : 'Official card image',
              url: stockImageUrl,
              required: false,
            }]
          : []),
        ...captureRequirements
          .filter((requirement) => uploadResult.bySlot[requirement.id])
          .map((requirement) => ({
            role: 'seller' as const,
            slot: requirement.id,
            label: requirement.label,
            url: uploadResult.bySlot[requirement.id]!,
            required: requirement.required,
            metadata: {
              evidenceKey: requirement.evidenceKey,
              captureType: requirement.captureType,
              photoPurpose: requirement.photoPurpose,
              state: requirement.state,
              groupLabel: requirement.groupLabel ?? null,
              grader: requirement.grader ?? null,
              slabProfile: requirement.slabProfile ?? null,
              qualityWarning: evidencePhotos[requirement.id]?.quality.warning ?? null,
              quality: {
                purpose: evidencePhotos[requirement.id]?.quality.purpose ?? requirement.photoPurpose,
                purposeLabel: evidencePhotos[requirement.id]?.quality.purposeLabel ?? null,
                severity: evidencePhotos[requirement.id]?.quality.severity ?? null,
                warning: evidencePhotos[requirement.id]?.quality.warning ?? null,
                requiresRetake: evidencePhotos[requirement.id]?.quality.requiresRetake ?? false,
                canOverride: evidencePhotos[requirement.id]?.quality.canOverride ?? false,
                overrideAccepted: evidencePhotos[requirement.id]?.quality.overrideAccepted ?? false,
                overrideReason: evidencePhotos[requirement.id]?.quality.overrideReason ?? null,
                issues: evidencePhotos[requirement.id]?.quality.issues ?? [],
                metrics: evidencePhotos[requirement.id]?.quality.metrics ?? null,
                imageFingerprint: evidencePhotos[requirement.id]?.quality.imageFingerprint ?? null,
                captureSource: evidencePhotos[requirement.id]?.captureSource ?? null,
              },
              visibleCenteringGuidance: requirement.evidenceKey === 'front'
                ? ximilarEstimate?.centeringAssessment ?? null
                : null,
              certification: resolvedSlabCertification && (
                requirement.id === resolvedSlabCertification.labelImageId
                || (requirement.evidenceKey === 'slab_label' && resolvedSlabCertification.labelImageId === 'manual')
                || (requirement.evidenceKey === 'slab_cert' && resolvedSlabCertification.captureMethod !== 'manual')
              )
                ? resolvedSlabCertification
                : null,
              captureFrame: evidencePhotos[requirement.id]?.captureFrame
                ? {
                    scanSessionId: evidencePhotos[requirement.id]?.captureFrame?.scanSessionId,
                    capturedAt: evidencePhotos[requirement.id]?.captureFrame?.capturedAt,
                    pixelWidth: evidencePhotos[requirement.id]?.captureFrame?.pixelWidth,
                    pixelHeight: evidencePhotos[requirement.id]?.captureFrame?.pixelHeight,
                    orientation: evidencePhotos[requirement.id]?.captureFrame?.orientation,
                    rotationDegrees: evidencePhotos[requirement.id]?.captureFrame?.rotationDegrees,
                    mirrored: evidencePhotos[requirement.id]?.captureFrame?.mirrored,
                    previewDimensions: evidencePhotos[requirement.id]?.captureFrame?.previewDimensions,
                    previewResizeMode: evidencePhotos[requirement.id]?.captureFrame?.previewResizeMode,
                    detectedCardQuadrilateral: evidencePhotos[requirement.id]?.captureFrame?.detectedCardQuadrilateral,
                  }
                : null,
              crop: evidencePhotos[requirement.id]?.crop ?? null,
            },
          })),
      ];
      const listingImages = stockImageUrl
        ? [stockImageUrl, ...uploadResult.urls.filter((url) => url !== stockImageUrl)]
        : uploadResult.urls;
      const selectedPrice = listingMode === 'trade' ? null : listingValueNumber;
      const transactionValue = tierDecision.calculationValue ?? listingValueNumber ?? tradeValueNumber ?? null;
      const resolvedListingSubjectType = resolveListingSubjectTypeForSelection({
        requested: listingSubjectType,
        selectedCard,
        selectedProduct,
      });
      const reviewRequired = identityPendingReview || protectionTierIsDowngraded || Boolean(valueWarning) || Boolean(certificationReviewWarning);
      const adminReasons = [
        identityPendingReview ? 'Card identity pending Stackr review' : null,
        protectionTierIsDowngraded ? `Seller selected ${formatProtectionTier(protectionTier)} below Stackr recommendation ${formatProtectionTier(recommendedProtectionTier)}` : null,
        valueWarning ? valueWarning : null,
        certificationReviewWarning,
      ].filter(Boolean).join(' · ');

      const listingPayload = {
        user_id: user.id,
        card_id: cardId,
        set_id: setId,
        flag_type: 'trade',
        condition: declaredCondition,
        value: transactionValue != null ? String(transactionValue) : null,
        asking_price: selectedPrice,
        market_estimate: prices.market,
        trade_only: listingMode === 'trade',
        product_type: resolvedListingSubjectType,
        product_name: resolvedName,
        pricing_mode: resolvedListingSubjectType === 'graded_slab' ? 'graded' : resolvedListingSubjectType === 'raw_card' ? 'raw' : isSealedLikeCategory(resolvedListingSubjectType) ? 'sealed' : 'manual',
        grade_company: resolvedListingSubjectType === 'graded_slab' ? displayGradingCompany : null,
        grade: resolvedListingSubjectType === 'graded_slab' ? grade.trim() || '10' : null,
        admin_review_required: reviewRequired,
        admin_review_reason: reviewRequired ? adminReasons : null,
        listing_notes: [
          description.trim(),
          knownDefects.trim() ? `Known defects: ${knownDefects.trim()}` : null,
          wantedCards.trim() ? `Wanted in trade: ${wantedCards.trim()}` : null,
          selectedProduct ? 'Catalogue media attached as reference imagery. Seller photos show the actual item.' : null,
          resolvedListingSubjectType === 'graded_slab' ? `Certification number: ${certificationNumber || 'seller-confirmed, not provided'}. Slab case condition: ${slabCaseCondition}.` : null,
          resolvedListingSubjectType === 'graded_slab' && resolvedSlabCertification ? `Certification capture: ${resolvedSlabCertification.captureMethod.toUpperCase()} confirmed by seller.` : null,
          isSealedLikeCategory(resolvedListingSubjectType) ? `Sealed status: ${sealedStatus}. Packaging condition: ${packagingCondition}.` : null,
          usesProtectionTier ? `Protection selected: ${formatProtectionTier(protectionTier)}. Stackr recommendation: ${formatProtectionTier(recommendedProtectionTier)}.` : null,
          silverAgreementRequired
            ? `Silver agreement required: ${silverAgreementDisclosure}`
            : null,
          protectionTierIsDowngraded
            ? 'Protection disclosure: selected protection is lower than Stackr recommendation for this value.'
            : null,
          usesProtectionTier && protectionTier === 'silver'
            ? `Seller condition: ${declaredCondition}. Stackr AI estimate: ${ximilarEstimate?.condition ?? 'pending'}.`
            : null,
          ximilarEstimate?.centeringAssessment
            ? `Visible centering guidance: ${ximilarEstimate.centeringAssessment.summary} ${ximilarEstimate.centeringAssessment.disclaimer}`
            : null,
        ].filter(Boolean).join('\n\n') || null,
        notes: manualIdentity.notes.trim() || null,
        listing_images: listingImages,
        listing_media: listingMedia,
        official_image_url: stockImageUrl,
        seller_front_image_url: frontUrl,
        seller_back_image_url: backUrl,
        listing_status: 'active',
      };

      const { error: insertError } = await supabase.from('user_card_flags').insert(listingPayload);
      let error = insertError;
      if (isMissingListingMediaColumnError(insertError)) {
        const { error: legacyError } = await supabase
          .from('user_card_flags')
          .insert(toLegacyListingPayload(listingPayload));
        error = legacyError;
      }
      if (error) throw error;

      await AsyncStorage.removeItem(authenticatedDraftKey);
      setStep('success');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      Alert.alert('Could not publish listing', error?.message ?? 'Something went wrong. Your draft is still saved.');
    } finally {
      setPublishing(false);
      setUploading(false);
    }
  };

  const footer = () => {
    if (step === 'category' || step === 'entry' || step === 'identify' || step === 'success') return null;

    if (step === 'confirm') {
      return (
        <PrimaryFooter
          compact={keyboardVisible}
          label="Yes, this is my card"
          onPress={() => setStep('condition')}
          secondaryLabel="Choose another match"
          onSecondaryPress={() => setStep('identify')}
        />
      );
    }

    if (step === 'manual') {
      const missing: MissingRequirement[] = [];
      if (!manualIdentity.cardName.trim()) {
        missing.push({ key: 'manual-name', label: 'Add the card or product name to continue' });
      }
      if (listingSubjectType === 'graded_slab') {
        if (!gradingCompany.trim() || !grade.trim()) {
          missing.push({ key: 'slab-grade', label: 'Confirm the grading company and grade' });
        }
      }
      return (
        <PrimaryFooter
          compact={keyboardVisible}
          label={listingSubjectType === 'graded_slab' ? 'Continue to case condition' : isCardSubject(listingSubjectType) ? 'Continue with pending review' : 'Continue with product details'}
          onPress={() => {
            if (!isCardSubject(listingSubjectType)) {
              void fetchProductPrices(manualIdentity.cardName.trim(), listingSubjectType);
            } else if (listingSubjectType === 'graded_slab') {
              setSellerCondition(getSlabConditionLabel(displayGradingCompany, grade));
              if (selectedCard) void fetchPrices(selectedCard, 'graded_slab');
            }
            setStep('condition');
          }}
          disabled={missing.length > 0}
          missing={missing}
        />
      );
    }

    if (step === 'condition') {
      const missing: MissingRequirement[] = conditionSelected ? [] : [{
        key: 'condition',
        label: listingSubjectType === 'graded_slab'
          ? 'Confirm the grading company, grade, certification and slab case condition'
          : isSealedLikeCategory(listingSubjectType)
            ? 'Confirm sealed status and packaging condition'
            : listingSubjectType === 'accessories' || listingSubjectType === 'other'
              ? 'Choose the item condition'
              : 'Choose a quick condition estimate',
      }];
      return <PrimaryFooter compact={keyboardVisible} label="Continue to value" onPress={() => {
        if (listingSubjectType === 'graded_slab') setSellerCondition(slabConditionLabel);
        setStep('value');
      }} disabled={missing.length > 0} missing={missing} />;
    }

    if (step === 'value') {
      const missing: MissingRequirement[] = valueEntered ? [] : [{ key: 'value', label: 'Add the listing or trade value to continue' }];
      const nextLabel = usesProtectionTier
        ? 'Reveal protection level'
        : listingSubjectType === 'graded_slab'
          ? 'Continue to slab photos'
          : isSealedLikeCategory(listingSubjectType)
            ? 'Continue to product photos'
            : 'Continue to item photos';
      return (
        <PrimaryFooter
          compact={keyboardVisible}
          label={nextLabel}
          onPress={() => setStep(usesProtectionTier ? 'protection' : 'evidence')}
          disabled={missing.length > 0}
          missing={missing}
        />
      );
    }

    if (step === 'protection') {
      const label = protectionTier === 'silver' && verificationRequirements.requiresXimilar
        ? 'Begin condition check'
        : 'Capture listing photos';
      return <PrimaryFooter compact={keyboardVisible} label={label} onPress={() => setStep('evidence')} />;
    }

    if (step === 'evidence') {
      const requiredDone = captureProgress.requiredDone;
      const nextLabel = verificationRequirements.requiresXimilar
        ? protectionTier === 'silver'
          ? 'Begin AI condition check'
          : 'Continue to AI condition check'
        : 'Continue to listing details';
      return (
        <PrimaryFooter
          compact={keyboardVisible}
          label={requiredDone ? nextLabel : currentCaptureRequirement ? `Capture ${currentCaptureRequirement.label.toLowerCase()}` : 'Capture evidence'}
          onPress={() => {
            if (requiredDone) {
              setStep(verificationRequirements.requiresXimilar ? 'ai' : 'details');
            } else if (currentCaptureRequirement) {
              void capturePhoto(currentCaptureRequirement.id, true);
            }
          }}
          secondaryLabel={currentCaptureRequirement && !requiredDone ? 'Upload' : undefined}
          onSecondaryPress={currentCaptureRequirement && !requiredDone ? () => void capturePhoto(currentCaptureRequirement.id, false) : undefined}
        />
      );
    }

    if (step === 'ai') {
      if (ximilarStatus === 'complete') {
        return <PrimaryFooter compact={keyboardVisible} label="Accept estimate" onPress={() => setStep('details')} />;
      }
      return (
        <PrimaryFooter
          compact={keyboardVisible}
          label={ximilarStatus === 'failed' ? 'Try condition check again' : 'Start AI condition check'}
          onPress={runXimilarAnalysis}
          loading={ximilarStatus === 'processing'}
          secondaryLabel={ximilarStatus === 'failed' ? 'Save and continue later' : undefined}
          onSecondaryPress={ximilarStatus === 'failed' ? saveExitDraft : undefined}
        />
      );
    }

    if (step === 'gold') {
      return <PrimaryFooter compact={keyboardVisible} label="Continue to listing details" onPress={() => setStep('details')} />;
    }

    if (step === 'details') {
      const missing: MissingRequirement[] = detailsComplete ? [] : [{ key: 'details', label: 'Complete quantity and item details' }];
      return <PrimaryFooter compact={keyboardVisible} label="Review listing" onPress={() => setStep('review')} disabled={missing.length > 0} missing={missing} />;
    }

    if (step === 'review') {
      const label = !usesProtectionTier
        ? 'Publish listing'
        : protectionTier === 'silver'
          ? 'Publish Silver listing'
          : 'Publish listing';
      return <PrimaryFooter compact={keyboardVisible} label={label} onPress={() => void publishListing()} disabled={missingPublicationRequirements.length > 0} loading={publishing || uploading} missing={missingPublicationRequirements} />;
    }

    return null;
  };

  const renderCategory = () => (
    <View style={styles.stepContent}>
      <View style={[styles.introPanel, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <StackrCardActionIcon source={stackrIcons.sellCard} frameSize={74} artworkSize={60} accessibilityLabel="Create Listing" />
        <View style={{ flex: 1 }}>
          <Text style={[styles.stepTitle, { color: theme.colors.text }]}>What are you selling?</Text>
          <Text style={[styles.stepBody, { color: theme.colors.textSoft }]}>Choose a product type to build the right listing.</Text>
        </View>
      </View>

      <View style={styles.sellingTypeGrid}>
        {LISTING_CATEGORIES.map((category) => {
          const type = category.key;
          const active = listingSubjectType === type;
          return (
            <TouchableOpacity
              key={type}
              onPress={() => void selectSellingType(type)}
              activeOpacity={0.84}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${category.title}, ${category.description}`}
              style={[
                styles.sellingTypeTile,
                {
                  backgroundColor: active ? theme.colors.primary + '10' : theme.colors.card,
                  borderColor: active ? theme.colors.primary : theme.colors.border,
                },
              ]}
            >
              <StackrCardActionIcon
                source={category.asset}
                frameSize={stackrSellCategoryIconSizes.categoryTileFrame}
                artworkSize={stackrSellCategoryIconSizes.categoryTileArtwork}
                style={[styles.sellingTypeIconFrame, { backgroundColor: theme.colors.surface }]}
              />
              <Text style={[styles.sellingTypeTitle, { color: theme.colors.text }]} numberOfLines={2}>{category.title}</Text>
              <Text style={[styles.sellingTypeBody, { color: theme.colors.textSoft }]} numberOfLines={2}>{category.description}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderEntry = () => (
    <View style={styles.stepContent}>
      <View style={[styles.introPanel, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <StackrCardActionIcon
          source={categoryIcon}
          frameSize={stackrSellCategoryIconSizes.categoryTileFrame}
          artworkSize={stackrSellCategoryIconSizes.categoryTileArtwork}
          accessibilityLabel="Create Listing"
        />
        <View style={{ flex: 1 }}>
          <Text style={[styles.stepTitle, { color: theme.colors.text }]}>Create Listing</Text>
          <Text style={[styles.stepBody, { color: theme.colors.textSoft }]}>
            {listingSubjectType === 'graded_slab'
              ? 'Choose the exact printed card first, then add the grader, grade and certification from the slab label.'
              : isCardSubject(listingSubjectType)
                ? 'Identify your card and build a trusted listing.'
                : canUseProductCatalogue(listingSubjectType)
                  ? 'Find the exact product so Stackr can attach approved catalogue imagery.'
                  : 'Add the item details and Stackr will flag it for catalogue review where needed.'}
          </Text>
        </View>
      </View>

      {listingSubjectType === 'graded_slab' ? (
        <>
          <CardIdentificationTile
            title="Scan slab"
            body="Capture the slab label and enclosed card, then confirm the exact printing."
            source={stackrIcons.scanCard}
            primary
            onPress={() => selectIdentificationMethod('scan')}
          />
          <CardIdentificationTile
            title="Select card name"
            body="Search a Pokémon name, choose the exact printed card, and Stackr will fill the set."
            source={categoryIcon}
            onPress={() => selectIdentificationMethod('manual')}
          />
          <CardIdentificationTile
            title="Choose another item type"
            body="Go back if this is a sealed product, raw card or accessory."
            source={stackrIcons.searchCard}
            onPress={() => setStep('category')}
          />
          <InlineRequirementMessage
            message="Graded slab prices use the selected card, grading company and grade. Certification remains seller-confirmed until a live grader lookup is available."
          />
        </>
      ) : isCardSubject(listingSubjectType) ? (
        <>
          <CardIdentificationTile
            title="Scan card"
            body="Use Stackr scanner, then select the matching card for this listing."
            source={stackrIcons.scanCard}
            primary
            onPress={() => selectIdentificationMethod('scan')}
          />
          <CardIdentificationTile
            title="Add manually"
            body="Search by Pokemon name, set, card number or rarity. If it is missing, create a pending record."
            source={stackrIcons.searchCard}
            onPress={() => selectIdentificationMethod('search')}
          />
        </>
      ) : (
        <>
          <CardIdentificationTile
            title={canUseProductCatalogue(listingSubjectType) ? 'Search product catalogue' : 'Enter product details'}
            body={canUseProductCatalogue(listingSubjectType)
              ? 'Select the exact product and attach catalogue images automatically.'
              : 'Add the product name, set and evidence manually.'}
            source={categoryIcon}
            primary
            onPress={() => selectIdentificationMethod(canUseProductCatalogue(listingSubjectType) ? 'search' : 'manual')}
          />
          <CardIdentificationTile
            title="Choose another item type"
            body="Go back if this is a raw card, graded slab or a different sealed product."
            icon="grid-outline"
            onPress={() => setStep('category')}
          />
        </>
      )}
    </View>
  );

  const renderListingLanguageSelector = () => (
    <View style={{ gap: 8 }}>
      <FieldLabel label="Catalogue language" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingRight: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        {LISTING_LANGUAGE_OPTIONS.map((option) => {
          const active = option.key === listingLanguage;
          const descriptor = getPokemonLanguageDescriptor(option.key);
          return (
            <TouchableOpacity
              key={option.key}
              activeOpacity={0.82}
              onPress={() => handleListingLanguageChange(option.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${descriptor?.label ?? option.label} catalogue`}
              style={[
                styles.recentChip,
                {
                  minHeight: 40,
                  paddingHorizontal: 14,
                  backgroundColor: active ? theme.colors.primary : theme.colors.surface,
                  borderColor: active ? theme.colors.primary : theme.colors.border,
                },
              ]}
            >
              {descriptor ? (
                <PokemonLanguageFlagIcon language={descriptor.code} size={18} decorative />
              ) : (
                <Text style={{ color: active ? '#FFFFFF' : theme.colors.text, fontSize: 12, fontWeight: '900' }}>
                  {option.shortLabel}
                </Text>
              )}
              <Text style={{ color: active ? 'rgba(255,255,255,0.88)' : theme.colors.textSoft, fontSize: 12, fontWeight: '800' }}>
                {descriptor?.label ?? option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  const renderIdentify = () => {
    if (!isCardSubject(listingSubjectType)) {
      const supportsCatalogue = canUseProductCatalogue(listingSubjectType);
      return (
        <View style={styles.stepContent}>
          <Text style={[styles.stepTitle, { color: theme.colors.text }]}>
            {supportsCatalogue ? `Find the exact ${categoryConfig.title.toLowerCase()}` : 'Product details'}
          </Text>
          <Text style={[styles.stepBody, { color: theme.colors.textSoft }]}>
            {supportsCatalogue
              ? 'Select a catalogue result so Stackr can attach approved reference imagery. You will still add photos of your actual item later.'
              : 'This category does not have a dedicated catalogue lookup yet. Continue with manual product details and seller photos.'}
          </Text>
          {supportsCatalogue ? (
            <>
              {renderListingLanguageSelector()}
              <StackrTextInput
                value={searchQuery}
                onChangeText={handleSearchChange}
                placeholder={`Search ${categoryConfig.title.toLowerCase()}, set or product line`}
                autoCapitalize="words"
              />
              {searching ? <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 8 }} /> : null}
              {productResults.map((product) => {
                const isSetFallback = product.source === 'set_catalog';
                const productImageUrl = product.image_large_url ?? product.image_url;
                const productMeta = [
                  product.set_name,
                  product.language,
                  product.release_year,
                  categoryConfig.title,
                ].filter(Boolean);
                return (
                <TouchableOpacity
                  key={product.id}
                  onPress={() => void selectProduct(product)}
                  activeOpacity={0.82}
                  style={[styles.searchResult, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
                >
                  <StackrImage
                    uri={productImageUrl}
                    fallbackSource={isSetFallback ? stackrIcons.setDiscovery : stackrIcons.marketplace}
                    contentFit="contain"
                    rounded={12}
                    style={[styles.productResultImage, { backgroundColor: theme.colors.surface }]}
                    showFallbackIcon={false}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 15, lineHeight: 19, fontWeight: '900' }} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.78}>{product.name}</Text>
                    {isSetFallback ? (
                      <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 16, marginTop: 3 }} numberOfLines={2}>
                        {[...productMeta, 'Set match - add seller photos'].filter(Boolean).join(' · ')}
                      </Text>
                    ) : (
                    <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 16, marginTop: 3 }} numberOfLines={2}>
                      {[...productMeta, product.latest_price?.average != null ? `Est. ${formatCurrency(product.latest_price.average)}` : 'Catalogue media'].filter(Boolean).join(' · ')}
                    </Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textSoft} />
                </TouchableOpacity>
                );
              })}
              {selectedProduct ? (
                <InlineRequirementMessage message={catalogueImageUrl ? 'Catalogue images added. Seller photos of your actual item are still required.' : 'Catalogue image unavailable. Seller photos of your actual item are still required.'} />
              ) : null}
              {searchQuery.trim() && !searching && !productResults.length ? (
                <View style={{ gap: 10 }}>
                  <InlineRequirementMessage message="No catalogue product found. You can continue manually and Stackr will flag the product for catalogue review." tone="warning" />
                  <CardIdentificationTile
                    title="Product not found"
                    body="Enter the product manually and add seller photos."
                    icon="create-outline"
                    onPress={() => setStep('manual')}
                  />
                </View>
              ) : null}
            </>
          ) : (
            <CardIdentificationTile
              title="Product not found"
              body="Enter the product manually and continue with review."
              icon="create-outline"
              primary
              onPress={() => setStep('manual')}
            />
          )}
        </View>
      );
    }

    if (identificationMethod === 'scan') {
      const isSlabScan = listingSubjectType === 'graded_slab';
      return (
        <View style={styles.stepContent}>
          <Text style={[styles.stepTitle, { color: theme.colors.text }]}>
            {isSlabScan ? 'Scan the slab' : 'Choose how to add the card'}
          </Text>
          <Text style={[styles.stepBody, { color: theme.colors.textSoft }]}>
            {isSlabScan
              ? 'Capture the full slab and label, then choose the enclosed card for this listing.'
              : 'Scan the card or search for it manually. Once a scan finds matches, choose the exact card for this listing.'}
          </Text>
          <CardIdentificationTile
            title={isSlabScan ? 'Open slab scanner' : 'Scan card'}
            body={isSlabScan ? 'Use the slab scan path for label, grader and card identification.' : 'Open the camera scanner and select the matching card.'}
            source={stackrIcons.scanCard}
            primary
            onPress={openListingScanner}
          />
          <CardIdentificationTile
            title="Add manually"
            body="Search the catalogue, or create a pending card record if it is not there yet."
            source={stackrIcons.searchCard}
            onPress={() => setIdentificationMethod('search')}
          />
        </View>
      );
    }

    const list = identificationMethod === 'collection' ? filteredOwnedCards : searchResults;
    return (
      <View style={styles.stepContent}>
        <Text style={[styles.stepTitle, { color: theme.colors.text }]}>{identificationMethod === 'collection' ? 'Choose from my collection' : 'Search for card'}</Text>
        <Text style={[styles.stepBody, { color: theme.colors.textSoft }]}>
          {identificationMethod === 'collection'
            ? 'Your owned cards are shown highest estimated value first. Search if you already know which card you want to list.'
            : 'Tap a result to use it in this listing. You will confirm the exact version before continuing.'}
        </Text>

        {identificationMethod !== 'collection' ? (
          <>
            {renderListingLanguageSelector()}
            <StackrTextInput
              value={searchQuery}
              onChangeText={handleSearchChange}
              placeholder="Search Pokemon, set, number or rarity"
              autoCapitalize="words"
              autoCorrect={false}
              spellCheck={false}
            />
            {recentSearches.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {recentSearches.map((item) => (
                  <TouchableOpacity key={item} onPress={() => { setSearchQuery(item); void runSearch(item); }} style={[styles.recentChip, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                    <Ionicons name="time-outline" size={13} color={theme.colors.primary} />
                    <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: '800' }}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : null}
          </>
        ) : (
          <View style={{ gap: 8 }}>
            <StackrTextInput
              value={collectionSearchQuery}
              onChangeText={setCollectionSearchQuery}
              placeholder="Search your collection by card, set, number or rarity"
              autoCapitalize="words"
              autoCorrect={false}
              spellCheck={false}
            />
            <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 16, fontWeight: '800' }}>
              {collectionLoading
                ? 'Loading your collection...'
                : `${filteredOwnedCards.length} of ${ownedCards.length} owned card${ownedCards.length === 1 ? '' : 's'} - highest value first`}
            </Text>
          </View>
        )}

        {searching || collectionLoading ? <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 8 }} /> : null}
        {identificationMethod === 'collection' && !collectionLoading && !ownedCards.length ? (
          <InlineRequirementMessage message="No owned cards were found for this account. You can search manually or create a temporary card record." tone="warning" />
        ) : null}
        {identificationMethod === 'collection' && !collectionLoading && ownedCards.length > 0 && !list.length ? (
          <InlineRequirementMessage message="No owned cards match that search. Try the Pokemon name, set, number or rarity." tone="warning" />
        ) : null}
        {list.map((card) => (
          <TouchableOpacity
            key={card.id}
            onPress={() => void selectCard(card)}
            activeOpacity={0.82}
            style={[styles.searchResult, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
          >
            <View style={[styles.resultImage, styles.resultImageFrame, { backgroundColor: theme.colors.surface }]}>
              {card.image_small ? (
                <Image source={{ uri: card.image_small }} style={StyleSheet.absoluteFill} resizeMode="contain" />
              ) : null}
              <RaritySymbol
                rarity={card.rarity}
                size={12}
                style={RARITY_SYMBOL_CARD_OVERLAY}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontSize: 15, lineHeight: 19, fontWeight: '900' }} numberOfLines={1}>{card.name}</Text>
              <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 16, marginTop: 3 }} numberOfLines={2}>
                {[card.set_name, card.number ? `#${card.number}` : null, getPokemonCardLanguageLabel(card.language), card.ownedQuantity ? `Owned x${card.ownedQuantity}` : null].filter(Boolean).join(' · ')}
              </Text>
            </View>
            {identificationMethod === 'collection' ? (
              <View style={{ alignItems: 'flex-end', gap: 3, maxWidth: 82 }}>
                <Text style={{ color: theme.colors.text, fontSize: 12.5, lineHeight: 16, fontWeight: '900' }} numberOfLines={1}>
                  {formatCurrency(card.estimatedValue)}
                </Text>
                {card.estimatedValueSource ? (
                  <Text style={{ color: theme.colors.textSoft, fontSize: 10.5, lineHeight: 13, fontWeight: '800', textTransform: 'uppercase' }} numberOfLines={1}>
                    {card.estimatedValueSource}
                  </Text>
                ) : null}
              </View>
            ) : null}
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textSoft} />
          </TouchableOpacity>
        ))}
        {identificationMethod !== 'collection' && searchQuery.trim() && !searching && !list.length ? (
          <View style={{ gap: 10 }}>
            <InlineRequirementMessage message="No matches found. Check the spelling, try fewer words, or continue with a pending review." tone="warning" />
            <CardIdentificationTile
              title="Card not found"
              body="Create a temporary record for Stackr review."
              icon="create-outline"
              onPress={() => setStep('manual')}
            />
          </View>
        ) : null}
      </View>
    );
  };

  const renderConfirm = () => (
    <View style={styles.stepContent}>
      <Text style={[styles.stepTitle, { color: theme.colors.text }]}>Confirm the card</Text>
      <Text style={[styles.stepBody, { color: theme.colors.textSoft }]}>Check the set, card number, language and version before continuing.</Text>
      <CardMatchConfirmation
        imageUrl={cardImageUrl}
        name={selectedCard?.name ?? ''}
        setName={selectedCard?.set_name}
        number={selectedCard?.number}
        rarity={selectedCard?.rarity}
        language={getPokemonCardLanguageLabel(selectedCard?.language)}
        variant={selectedCard?.variant ?? (listingSubjectType === 'graded_slab' ? 'Graded' : 'Raw')}
        rawValue={prices.market}
        gradedValue={prices.graded}
      />
      <View style={[styles.sectionCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <FieldLabel label="Version" />
        <View style={styles.segmentRow}>
          <TouchableOpacity onPress={() => {
            setListingSubjectType('raw_card');
            setSellerCondition('');
            if (selectedCard) void fetchPrices(selectedCard, 'raw_card');
          }} style={[styles.segmentButton, { backgroundColor: listingSubjectType === 'raw_card' ? theme.colors.primary : theme.colors.surface, borderColor: listingSubjectType === 'raw_card' ? theme.colors.primary : theme.colors.border }]}>
            <Text style={{ color: listingSubjectType === 'raw_card' ? '#FFFFFF' : theme.colors.text, fontSize: 12, fontWeight: '900' }}>Raw</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => {
            setListingSubjectType('graded_slab');
            setSellerCondition(getSlabConditionLabel(displayGradingCompany, grade));
            if (selectedCard) void fetchPrices(selectedCard, 'graded_slab');
          }} style={[styles.segmentButton, { backgroundColor: listingSubjectType === 'graded_slab' ? theme.colors.primary : theme.colors.surface, borderColor: listingSubjectType === 'graded_slab' ? theme.colors.primary : theme.colors.border }]}>
            <Text style={{ color: listingSubjectType === 'graded_slab' ? '#FFFFFF' : theme.colors.text, fontSize: 12, fontWeight: '900' }}>Graded slab</Text>
          </TouchableOpacity>
        </View>
        {listingSubjectType === 'graded_slab' ? renderSlabFields() : null}
      </View>
      {prices.loading ? <InlineRequirementMessage message="Fetching Stackr market data..." /> : null}
      {prices.unavailable ? <InlineRequirementMessage message="We do not currently have enough pricing data for this card. Stackr will use your transaction value and may review the tier." tone="warning" /> : null}
    </View>
  );

  const renderManual = () => (
    listingSubjectType === 'graded_slab' ? (
      <View style={styles.stepContent}>
        <Text style={[styles.stepTitle, { color: theme.colors.text }]}>Identify the graded card</Text>
        <Text style={[styles.stepBody, { color: theme.colors.textSoft }]}>
          Search the card name first. Choose the exact printed card so Stackr can auto-fill the set and fetch grader-specific sales prices.
        </Text>
        <InlineRequirementMessage message="Certification is seller-confirmed until Stackr has a live lookup for that grading company." />

        <View style={[styles.sectionCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <FieldLabel label="Card name" required />
          <StackrTextInput
            value={manualIdentity.cardName}
            onChangeText={handleManualSlabCardNameChange}
            placeholder="e.g. Pikachu"
            autoCapitalize="words"
          />

          {searching ? <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 8 }} /> : null}
          {searchResults.slice(0, 10).map((card) => (
            <TouchableOpacity
              key={card.id}
              onPress={() => void selectSlabCardForManualEntry(card)}
              activeOpacity={0.82}
              style={[styles.searchResult, { backgroundColor: theme.colors.surface, borderColor: selectedCard?.id === card.id ? theme.colors.primary : theme.colors.border }]}
            >
              <View style={[styles.resultImage, styles.resultImageFrame, { backgroundColor: theme.colors.card }]}>
                {card.image_small ? (
                  <Image source={{ uri: card.image_small }} style={StyleSheet.absoluteFill} resizeMode="contain" />
                ) : null}
                <RaritySymbol
                  rarity={card.rarity}
                  size={12}
                  style={RARITY_SYMBOL_CARD_OVERLAY}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.text, fontSize: 15, lineHeight: 19, fontWeight: '900' }} numberOfLines={1}>{card.name}</Text>
                <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 16, marginTop: 3 }} numberOfLines={2}>
                  {[card.set_name, card.number ? `#${card.number}` : null, getPokemonCardLanguageLabel(card.language)].filter(Boolean).join(' · ')}
                </Text>
              </View>
              {selectedCard?.id === card.id ? (
                <Ionicons name="checkmark-circle" size={20} color={theme.colors.primary} />
              ) : (
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textSoft} />
              )}
            </TouchableOpacity>
          ))}

          {manualIdentity.cardName.trim() && !searching && !selectedCard && !searchResults.length ? (
            <InlineRequirementMessage message="No exact card selected yet. You can continue as pending review, but graded pricing is most accurate after choosing the printed card." tone="warning" />
          ) : null}

          <View style={styles.twoColumn}>
            <View style={{ flex: 1 }}>
              <FieldLabel label="Set" />
              <StackrTextInput
                value={manualIdentity.setName}
                onChangeText={(value) => setManualIdentity((current) => ({ ...current, setName: value }))}
                placeholder="Auto-filled after selection"
                autoCapitalize="words"
              />
            </View>
            <View style={{ flex: 1 }}>
              <FieldLabel label="Card number" />
              <StackrTextInput
                value={manualIdentity.cardNumber}
                onChangeText={(value) => setManualIdentity((current) => ({ ...current, cardNumber: value }))}
                placeholder="e.g. 025/165"
                autoCapitalize="characters"
              />
            </View>
          </View>

          {renderSlabFields()}

          <View style={[styles.valueMiniCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <Text style={{ color: theme.colors.text, fontSize: 13, lineHeight: 17, fontWeight: '900' }}>
              {displayGradingCompany} {grade || 'grade'} sales estimate
            </Text>
            <Text style={{ color: theme.colors.text, fontSize: 22, lineHeight: 27, fontWeight: '900', marginTop: 3 }}>
              {prices.loading ? 'Checking...' : formatCurrency(prices.market)}
            </Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 11.5, lineHeight: 16, fontWeight: '700', marginTop: 2 }}>
              {selectedCard
                ? 'Based on the selected card, grading company and grade where sales data is available.'
                : 'Choose the exact printed card for accurate graded sales pricing.'}
            </Text>
          </View>
        </View>

        <FieldLabel label="Notes for Stackr review" />
        <StackrTextInput value={manualIdentity.notes} onChangeText={(value) => setManualIdentity((current) => ({ ...current, notes: value }))} placeholder="Anything unusual about the label, variant or slab." multiline />
      </View>
    ) : (
    <View style={styles.stepContent}>
      <Text style={[styles.stepTitle, { color: theme.colors.text }]}>
        {isCardSubject(listingSubjectType) ? 'Card not found' : 'Product details'}
      </Text>
      <Text style={[styles.stepBody, { color: theme.colors.textSoft }]}>
        {isCardSubject(listingSubjectType)
          ? 'You can continue, but Stackr will review its identity before the listing receives full verification.'
          : 'Add the exact product name and set so buyers can recognise what is being listed.'}
      </Text>
      {isCardSubject(listingSubjectType) ? <InlineRequirementMessage message="Card identity pending review" tone="warning" /> : null}
      <View style={[styles.sectionCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <FieldLabel label={isCardSubject(listingSubjectType) ? 'Card name' : 'Product name'} required />
        <StackrTextInput
          value={manualIdentity.cardName}
          onChangeText={(value) => setManualIdentity((current) => ({ ...current, cardName: value }))}
          placeholder={isCardSubject(listingSubjectType) ? 'e.g. Charizard ex' : 'e.g. Surging Sparks Booster Box'}
          autoCapitalize="words"
        />
        <FieldLabel label={isCardSubject(listingSubjectType) ? 'Set' : 'Associated set'} />
        <StackrTextInput value={manualIdentity.setName} onChangeText={(value) => setManualIdentity((current) => ({ ...current, setName: value }))} placeholder="e.g. Obsidian Flames" autoCapitalize="words" />
        {isCardSubject(listingSubjectType) ? (
          <>
            <FieldLabel label="Card number" />
            <StackrTextInput value={manualIdentity.cardNumber} onChangeText={(value) => setManualIdentity((current) => ({ ...current, cardNumber: value }))} placeholder="e.g. 223/197" autoCapitalize="characters" />
            <View style={styles.twoColumn}>
              <View style={{ flex: 1 }}>
                <FieldLabel label="Language" />
                <StackrTextInput value={manualIdentity.language} onChangeText={(value) => setManualIdentity((current) => ({ ...current, language: value }))} placeholder="English" autoCapitalize="words" />
              </View>
              <View style={{ flex: 1 }}>
                <FieldLabel label="Variant" />
                <StackrTextInput value={manualIdentity.variant} onChangeText={(value) => setManualIdentity((current) => ({ ...current, variant: value }))} placeholder="Holo, reverse..." autoCapitalize="words" />
              </View>
            </View>
          </>
        ) : (
          <>
            <View style={styles.twoColumn}>
              <View style={{ flex: 1 }}>
                <FieldLabel label="Language or region" />
                <StackrTextInput value={manualIdentity.language} onChangeText={(value) => setManualIdentity((current) => ({ ...current, language: value }))} placeholder="English / UK" autoCapitalize="words" />
              </View>
              <View style={{ flex: 1 }}>
                <FieldLabel label="Variant" />
                <StackrTextInput value={manualIdentity.variant} onChangeText={(value) => setManualIdentity((current) => ({ ...current, variant: value }))} placeholder="Artwork, edition..." autoCapitalize="words" />
              </View>
            </View>
            <InlineRequirementMessage message="Manual products are flagged for catalogue review. Do not use another product's image as a catalogue match." tone="warning" />
          </>
        )}
        <FieldLabel label="Notes for Stackr review" />
        <StackrTextInput value={manualIdentity.notes} onChangeText={(value) => setManualIdentity((current) => ({ ...current, notes: value }))} placeholder="Anything that helps identify this item." multiline />
      </View>
    </View>
    )
  );

  const renderCondition = () => (
    <View style={styles.stepContent}>
      <Text style={[styles.stepTitle, { color: theme.colors.text }]}>
        {listingSubjectType === 'graded_slab'
          ? 'Confirm the slab case'
          : isSealedLikeCategory(listingSubjectType)
            ? 'Is it sealed?'
            : listingSubjectType === 'accessories' || listingSubjectType === 'other'
              ? 'Describe the item condition'
              : 'How does the card look?'}
      </Text>
      <Text style={[styles.stepBody, { color: theme.colors.textSoft }]}>
        {listingSubjectType === 'graded_slab'
          ? 'The card grade stays exactly as stated by the grading company. This step only describes the physical slab holder.'
          : isSealedLikeCategory(listingSubjectType)
            ? 'Capture sealed status and packaging condition. Catalogue images do not prove the actual item is sealed.'
            : listingSubjectType === 'accessories' || listingSubjectType === 'other'
              ? 'Keep this factual and use seller photos to show the actual item.'
              : 'This gives buyers an initial expectation. It is not a professional grade.'}
      </Text>
      <MarketplaceListingPreview
        imageUrl={cardImageUrl}
        title={cardTitle || manualIdentity.cardName || 'Temporary card record'}
        subtitle={cardSubtitle}
        condition={declaredCondition || 'Not selected'}
        tier={usesProtectionTier ? protectionTier : undefined}
        trustLabel={!usesProtectionTier ? (isGradedSlabListing ? 'Grade' : 'Evidence') : undefined}
        trustValue={!usesProtectionTier ? (isGradedSlabListing ? slabConditionLabel : 'Seller photos') : undefined}
        value={activeTransactionValue}
      />
      {listingSubjectType === 'graded_slab' ? (
        <>
          <View style={[styles.sectionCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <Text style={{ color: theme.colors.text, fontSize: 15, lineHeight: 19, fontWeight: '900' }}>Slab label</Text>
            <ReviewRow label="Grader" value={displayGradingCompany} />
            <ReviewRow label="Grade" value={grade} />
            <ReviewRow label="Certification" value={slabCertificationDisplay} />
          </View>
          <View style={[styles.sectionCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <FieldLabel label="Certification number" required />
            <StackrTextInput value={certificationNumber} onChangeText={handleCertificationNumberChange} placeholder="As printed on the slab label" autoCapitalize="characters" />
            <FieldLabel label="Slab case condition" required />
            <View style={styles.optionWrap}>
              {SLAB_CASE_CONDITION_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option}
                  onPress={() => setSlabCaseCondition(option)}
                  style={[styles.smallChip, { backgroundColor: slabCaseCondition === option ? theme.colors.primary : theme.colors.surface, borderColor: slabCaseCondition === option ? theme.colors.primary : theme.colors.border }]}
                >
                  <Text style={{ color: slabCaseCondition === option ? '#FFFFFF' : theme.colors.text, fontSize: 12, fontWeight: '900' }}>{option}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <InlineRequirementMessage message={`Buyer-facing grade will be shown as ${slabConditionLabel}. Case condition is listed separately.`} />
        </>
      ) : isSealedLikeCategory(listingSubjectType) ? (
        <>
          {selectedProduct ? (
            <InlineRequirementMessage message="Catalogue images added as product reference. Photos of your actual item are still required for condition and seals." />
          ) : null}
          <View style={[styles.sectionCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <FieldLabel label="Sealed status" required />
            <View style={styles.optionWrap}>
              {SEALED_STATUS_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option}
                  onPress={() => setSealedStatus(option)}
                  style={[styles.smallChip, { backgroundColor: sealedStatus === option ? theme.colors.primary : theme.colors.surface, borderColor: sealedStatus === option ? theme.colors.primary : theme.colors.border }]}
                >
                  <Text style={{ color: sealedStatus === option ? '#FFFFFF' : theme.colors.text, fontSize: 12, fontWeight: '900' }}>{option}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <FieldLabel label="Packaging condition" required />
            <View style={styles.optionWrap}>
              {PACKAGING_CONDITION_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option}
                  onPress={() => setPackagingCondition(option)}
                  style={[styles.smallChip, { backgroundColor: packagingCondition === option ? theme.colors.primary : theme.colors.surface, borderColor: packagingCondition === option ? theme.colors.primary : theme.colors.border }]}
                >
                  <Text style={{ color: packagingCondition === option ? '#FFFFFF' : theme.colors.text, fontSize: 12, fontWeight: '900' }}>{option}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </>
      ) : listingSubjectType === 'accessories' || listingSubjectType === 'other' ? (
        <>
          <View style={[styles.sectionCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <FieldLabel label="Condition" required />
            <View style={styles.optionWrap}>
              {PACKAGING_CONDITION_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option}
                  onPress={() => setPackagingCondition(option)}
                  style={[styles.smallChip, { backgroundColor: packagingCondition === option ? theme.colors.primary : theme.colors.surface, borderColor: packagingCondition === option ? theme.colors.primary : theme.colors.border }]}
                >
                  <Text style={{ color: packagingCondition === option ? '#FFFFFF' : theme.colors.text, fontSize: 12, fontWeight: '900' }}>{option}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </>
      ) : (
        <>
          <ConditionSelector value={sellerCondition} onChange={setSellerCondition} />
          <TouchableOpacity onPress={() => setConditionGuideVisible(true)} style={[styles.helpButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <Ionicons name="help-circle-outline" size={17} color={theme.colors.primary} />
            <Text style={{ color: theme.colors.primary, fontSize: 13, fontWeight: '900' }}>Help me choose</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );

  const renderValue = () => (
    <View style={styles.stepContent}>
      <Text style={[styles.stepTitle, { color: theme.colors.text }]}>How are you listing it?</Text>
      <Text style={[styles.stepBody, { color: theme.colors.textSoft }]}>
        {isGradedSlabListing
          ? 'Stackr checks comparable sales using the selected card, grading company and grade.'
          : usesProtectionTier
            ? 'Stackr uses the highest relevant value to assign the raw-card protection tier automatically.'
            : isSealedLikeCategory(listingSubjectType)
              ? 'Set the price or trade value using clear actual-item and seal photos as evidence.'
              : 'Set the price or trade value. This item will be listed from seller photos and factual details.'}
      </Text>
      <InlineRequirementMessage message="This publishes a browse-only listing. It does not create a Stackr transaction." />
      <View style={styles.modeGrid}>
        <ToggleCard active={listingMode === 'sell'} title="Price & offers" body="Publish a guide price and invite offers. No checkout." icon="pricetag-outline" onPress={() => setListingMode('sell')} />
        <ToggleCard active={listingMode === 'trade'} title="Trade proposals" body="Set an indicative trade value and what you want." icon="swap-horizontal-outline" onPress={() => setListingMode('trade')} />
        <ToggleCard active={listingMode === 'both'} title="Offers or trade" body="Invite offer or trade proposals. No Stackr transaction." icon="git-compare-outline" onPress={() => setListingMode('both')} />
      </View>
      <ValueComparisonCard
        estimate={prices.market}
        listingValue={listingValueNumber}
        tradeValue={tradeValueNumber}
        mode={listingMode}
        warning={valueWarning}
      />
      {(listingMode === 'sell' || listingMode === 'both') ? (
        <View style={[styles.sectionCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <FieldLabel label="Guide price (no checkout)" required />
          <StackrTextInput value={askingPrice} onChangeText={setAskingPrice} placeholder="0.00" keyboardType="decimal-pad" />
          <PressableChecklistItem label="Offers accepted" checked={offersAccepted} onPress={() => setOffersAccepted((value) => !value)} />
          {offersAccepted ? (
            <>
              <FieldLabel label="Minimum offer" />
              <StackrTextInput value={minimumOffer} onChangeText={setMinimumOffer} placeholder="Optional" keyboardType="decimal-pad" />
            </>
          ) : null}
        </View>
      ) : null}
      {(listingMode === 'trade' || listingMode === 'both') ? (
        <View style={[styles.sectionCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <FieldLabel label="Expected trade value" required />
          <StackrTextInput value={tradeValue} onChangeText={setTradeValue} placeholder="0.00" keyboardType="decimal-pad" />
          <FieldLabel label="Cards or sets wanted" />
          <StackrTextInput value={wantedCards} onChangeText={setWantedCards} placeholder="e.g. Gengar, Team Rocket, similar-value slabs" multiline />
        </View>
      ) : null}
      {prices.unavailable ? (
        <InlineRequirementMessage message="Market value unavailable. Stackr will use your entered guide value and may review the listing." tone="warning" />
      ) : null}
    </View>
  );

  const renderProtection = () => (
    <View style={styles.stepContent}>
      <ProtectionTierReveal
        tier={protectionTier}
        decisionValue={tierDecision.calculationValue}
        reason={protectionTierIsManual
          ? `Stackr recommends ${formatProtectionTier(recommendedProtectionTier)} from the card and transaction value. You selected ${formatProtectionTier(protectionTier)}.`
          : tierDecision.reason}
        thresholdNote={protectionTierIsDowngraded
          ? 'This is lower than Stackr recommends. Buyer or trader agreement is required before proceeding.'
          : tierDecision.thresholdNote}
        message={protectionRevealCopy?.message}
        requirements={protectionRevealCopy?.requirements}
      />
      <View style={[styles.sectionCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <View style={styles.protectionChoiceHeader}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontSize: 15, lineHeight: 20, fontWeight: '900' }}>Choose protection</Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 17, marginTop: 2 }}>
              Stackr recommends {formatProtectionTier(recommendedProtectionTier)}. You can opt into another available tier with the right disclosures.
            </Text>
          </View>
          <View style={[styles.recommendedPill, { backgroundColor: theme.colors.primary + '12', borderColor: theme.colors.primary + '30' }]}>
            <Text style={{ color: theme.colors.primary, fontSize: 10, fontWeight: '900' }}>Recommended</Text>
          </View>
        </View>
        <View style={styles.modeGrid}>
          {allowedProtectionTiers.map((tier) => {
            const selected = tier === protectionTier;
            const isRecommended = tier === recommendedProtectionTier;
            return (
              <ToggleCard
                key={tier}
                active={selected}
                title={`${formatProtectionTier(tier)}${isRecommended ? ' (recommended)' : ''}`}
                body={PROTECTION_TIER_CHOICE_COPY[tier]}
                source={PROTECTION_TIER_ARTWORK[tier]}
                onPress={() => selectProtectionTier(tier)}
                compact
              />
            );
          })}
        </View>
      </View>
      {silverAgreementRequired ? (
        <InlineRequirementMessage
          tone="warning"
          message={silverAgreementDisclosure}
        />
      ) : null}
    </View>
  );

  const renderEvidence = () => {
    const captured = currentCaptureRequirement ? evidencePhotos[currentCaptureRequirement.id] : null;
    const currentCaptureIndex = currentCaptureRequirement
      ? captureRequirements.findIndex((item) => item.id === currentCaptureRequirement.id)
      : -1;
    const nextCaptureRequirement = currentCaptureRequirement
      ? captureRequirements.find((item, index) => (
          index > currentCaptureIndex
          && item.required
          && !evidencePhotos[item.id]
          && item.id !== currentCaptureRequirement.id
        ))
        ?? captureRequirements.find((item) => (
          item.required
          && !evidencePhotos[item.id]
          && item.id !== currentCaptureRequirement.id
        ))
        ?? captureRequirements.find((item, index) => (
          index > currentCaptureIndex
          && !evidencePhotos[item.id]
          && item.id !== currentCaptureRequirement.id
        ))
      : null;
    const visibleCaptureQueue = [currentCaptureRequirement, nextCaptureRequirement]
      .filter((item, index, array): item is CaptureRequirement => Boolean(item) && array.findIndex((candidate) => candidate?.id === item?.id) === index);
    const subjectLabel = listingSubjectType === 'graded_slab'
      ? 'slab'
      : isSealedLikeCategory(listingSubjectType) || listingSubjectType === 'accessories' || listingSubjectType === 'other'
        ? 'item'
        : 'card';
    const capturedPreviewUrl = getEvidencePhotoUrl(captured);
    const placeholderCopy = currentCaptureRequirement
      ? getCapturePlaceholderCopy(currentCaptureRequirement, subjectLabel)
      : null;
    const capturedResizeMode = currentCaptureRequirement
      ? getCapturedPhotoResizeMode(currentCaptureRequirement.captureType)
      : 'cover';
    return (
      <View style={styles.stepContent}>
        <Text style={[styles.stepTitle, { color: theme.colors.text }]}>
          {evidenceTier === 'bronze'
            ? isSealedLikeCategory(listingSubjectType) ? 'Add product photos' : listingSubjectType === 'graded_slab' ? 'Add slab photos' : 'Add clear card photos'
            : 'Capture evidence'}
        </Text>
        <Text style={[styles.stepBody, { color: theme.colors.textSoft }]}>
          Capture the current view, then Stackr will move you to the next required photo.
        </Text>
        <View style={[styles.captureProgressPanel, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <View style={styles.captureProgressLine}>
            <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '900' }}>Required photographs</Text>
            <Text style={{ color: theme.colors.primary, fontSize: 13, fontWeight: '900' }}>
              {captureProgress.requiredComplete} of {captureProgress.requiredTotal} complete
            </Text>
          </View>
          <View style={styles.captureProgressLine}>
            <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '800' }}>Optional photographs</Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '800' }}>
              {captureProgress.optionalComplete} of {captureProgress.optionalTotal} complete
            </Text>
          </View>
          {currentCaptureRequirement ? (
            <View style={styles.captureQueueLine}>
              <Text style={[styles.captureQueueLabel, { color: theme.colors.textSoft }]}>
                {currentCaptureRequirement.required ? 'Current required' : 'Current optional'}
              </Text>
              <Text style={[styles.captureQueueValue, { color: theme.colors.text }]} numberOfLines={1}>
                {currentCaptureRequirement.label}
              </Text>
            </View>
          ) : null}
          {nextCaptureRequirement ? (
            <View style={styles.captureQueueLine}>
              <Text style={[styles.captureQueueLabel, { color: theme.colors.textSoft }]}>Next</Text>
              <Text style={[styles.captureQueueValue, { color: theme.colors.primary }]} numberOfLines={1}>
                {nextCaptureRequirement.label}
              </Text>
            </View>
          ) : null}
        </View>
        {visibleCaptureQueue.length > 0 ? (
          <EvidenceChecklist
            requirements={visibleCaptureQueue}
            captured={capturedPhotoIds}
            activeKey={currentCaptureRequirement?.id}
            onSelect={(key) => {
              const index = captureRequirements.findIndex((item) => item.id === key);
              if (index >= 0) setActiveEvidenceIndex(index);
            }}
          />
        ) : null}
        {currentCaptureRequirement ? (
          <View style={[styles.captureCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <View style={styles.captureCardHeader}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: theme.colors.text, fontSize: 17, lineHeight: 22, fontWeight: '900' }}>{currentCaptureRequirement.label}</Text>
                <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 17, marginTop: 4 }}>{currentCaptureRequirement.instruction}</Text>
              </View>
              <View style={[styles.requirementBadge, { backgroundColor: currentCaptureRequirement.required ? theme.colors.primary + '12' : theme.colors.surface, borderColor: currentCaptureRequirement.required ? theme.colors.primary + '35' : theme.colors.border }]}>
                <Text style={{ color: currentCaptureRequirement.required ? theme.colors.primary : theme.colors.textSoft, fontSize: 10, fontWeight: '900' }}>
                  {currentCaptureRequirement.required ? 'Required' : 'Optional'}
                </Text>
              </View>
            </View>
            {currentCaptureRequirement.reason ? <InlineRequirementMessage message={currentCaptureRequirement.reason} /> : null}
            <TouchableOpacity
              onPress={() => void capturePhoto(currentCaptureRequirement.id, true)}
              activeOpacity={0.86}
              accessibilityRole="button"
              accessibilityLabel={`${captured ? 'Retake' : 'Capture'} ${currentCaptureRequirement.label.toLowerCase()} photo`}
              style={[styles.capturePreview, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
            >
              {capturedPreviewUrl ? (
                <View style={styles.evidenceImageStage}>
                  <Image source={{ uri: capturedPreviewUrl }} style={StyleSheet.absoluteFill} resizeMode={capturedResizeMode} />
                  <View pointerEvents="none" style={styles.evidenceImageShade} />
                  <View pointerEvents="none" style={[styles.evidenceCorner, styles.evidenceCornerTopLeft]} />
                  <View pointerEvents="none" style={[styles.evidenceCorner, styles.evidenceCornerTopRight]} />
                  <View pointerEvents="none" style={[styles.evidenceCorner, styles.evidenceCornerBottomLeft]} />
                  <View pointerEvents="none" style={[styles.evidenceCorner, styles.evidenceCornerBottomRight]} />
                  <View pointerEvents="none" style={styles.evidenceRetakePill}>
                    <Ionicons name="refresh" size={15} color={theme.colors.primary} />
                    <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '900' }}>Retake photo</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.capturePlaceholder}>
                  <View style={[styles.evidenceTargetStage, { backgroundColor: theme.colors.primary + '08' }]}>
                    <View style={[styles.evidenceGuideCard, { borderColor: theme.colors.primary + '88' }]}>
                      <View style={[styles.evidenceGuideShine, { backgroundColor: theme.colors.primary + '10' }]} />
                      <View style={[styles.evidenceGuideLine, { backgroundColor: theme.colors.primary + '70' }]} />
                      <View style={[styles.evidenceGuideCorner, styles.evidenceGuideCornerTopLeft, { borderColor: theme.colors.primary }]} />
                      <View style={[styles.evidenceGuideCorner, styles.evidenceGuideCornerTopRight, { borderColor: theme.colors.primary }]} />
                      <View style={[styles.evidenceGuideCorner, styles.evidenceGuideCornerBottomLeft, { borderColor: theme.colors.primary }]} />
                      <View style={[styles.evidenceGuideCorner, styles.evidenceGuideCornerBottomRight, { borderColor: theme.colors.primary }]} />
                    </View>
                  </View>
                  <Text style={{ color: theme.colors.text, fontSize: 15, lineHeight: 19, fontWeight: '900', marginTop: 14, textAlign: 'center' }}>
                    {placeholderCopy?.title ?? 'Actual item photo'}
                  </Text>
                  <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 17, fontWeight: '800', marginTop: 5, textAlign: 'center' }}>
                    {placeholderCopy?.body ?? 'Use a real seller photo, not catalogue art.'}
                  </Text>
                  <View style={[styles.actualPhotoPill, { backgroundColor: theme.colors.primary + '10', borderColor: theme.colors.primary + '25' }]}>
                    <Ionicons name="shield-checkmark-outline" size={14} color={theme.colors.primary} />
                    <Text style={{ color: theme.colors.primary, fontSize: 11, fontWeight: '900' }}>Actual seller photo only</Text>
                  </View>
                </View>
              )}
            </TouchableOpacity>
            <ImageQualityIndicator
              checks={[
                { label: captured?.quality.purposeLabel ? `${captured.quality.purposeLabel} captured` : currentCaptureRequirement.captureType.startsWith('slab') ? 'Slab area visible' : subjectLabel === 'item' ? 'Item area visible' : 'Card area visible', ok: Boolean(captured?.quality.fullCardVisible) },
                { label: 'Single requested item', ok: Boolean(captured?.quality.singleCard) },
                { label: 'Not excessively blurred', ok: Boolean(captured?.quality.steady) },
                { label: 'Sufficient lighting', ok: Boolean(captured?.quality.lighting) },
                { label: currentCaptureRequirement.captureType === 'slab_label' || currentCaptureRequirement.captureType === 'slab_qr' ? 'Label glare controlled' : 'No major glare', ok: captured ? captured.quality.glareOk !== false : false },
              ]}
            />
            {captured?.quality.warning ? <InlineRequirementMessage message={captured.quality.warning} tone="warning" /> : null}
            {captured?.quality.overrideAccepted ? <InlineRequirementMessage message="Accepted with seller quality override. The reason is saved with the listing evidence." tone="warning" /> : null}
            {captured?.localStatus ? <InlineRequirementMessage message={captured.localStatus === 'saved_locally' ? 'Saved locally. It will upload when you publish.' : captured.localStatus} tone="success" /> : null}
            <View style={styles.dualActions}>
              <TouchableOpacity onPress={() => void capturePhoto(currentCaptureRequirement.id, true)} style={[styles.primaryAction, { backgroundColor: theme.colors.primary }]}>
                <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '900' }}>{captured ? 'Retake' : 'Capture'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => void capturePhoto(currentCaptureRequirement.id, false)} style={[styles.secondaryAction, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
                <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '900' }}>Upload</Text>
              </TouchableOpacity>
            </View>
            {captured && !currentCaptureRequirement.required ? (
              <TouchableOpacity
                onPress={() => setEvidencePhotos((current) => {
                  const next = { ...current };
                  delete next[currentCaptureRequirement.id];
                  return next;
                })}
                style={[styles.secondaryActionFull, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
              >
                <Text style={{ color: theme.colors.textSoft, fontSize: 13, fontWeight: '900' }}>Remove optional photo</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

  const renderAi = () => (
    <View style={styles.stepContent}>
      <Text style={[styles.stepTitle, { color: theme.colors.text }]}>AI-assisted condition check</Text>
      <Text style={[styles.stepBody, { color: theme.colors.textSoft }]}>Capture a few clear views so Stackr can estimate the visible condition.</Text>
      <XimilarAnalysisStatus state={ximilarStatus} error={ximilarError} />
      {ximilarStatus === 'complete' ? (
        <>
          <ConditionEstimateCard
            estimate={ximilarEstimate?.condition}
            confidence={ximilarEstimate?.confidence}
            breakdown={ximilarEstimate?.breakdown}
          />
          <InlineRequirementMessage message="The buyer-facing listing will distinguish seller-declared condition, Stackr AI estimate and photographs." />
          {ximilarEstimate?.centeringAssessment ? (
            <InlineRequirementMessage message={ximilarEstimate.centeringAssessment.disclaimer} />
          ) : null}
          {listingSubjectType !== 'graded_slab' && sellerCondition && ximilarEstimate?.condition && !ximilarEstimate.condition.toLowerCase().includes(sellerCondition.toLowerCase()) ? (
            <View style={[styles.sectionCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
              <FieldLabel label="Condition discrepancy note" />
              <StackrTextInput
                value={conditionDiscrepancyReason}
                onChangeText={setConditionDiscrepancyReason}
                placeholder="Explain why your declared condition differs, if needed."
                multiline
              />
            </View>
          ) : null}
        </>
      ) : null}
      {ximilarStatus === 'failed' ? (
        <InlineRequirementMessage message="AI condition checking is temporarily unavailable. Your photos and listing details are preserved. Stackr will not downgrade this listing to Bronze." tone="warning" />
      ) : null}
    </View>
  );

  const renderDetails = () => (
    <View style={styles.stepContent}>
      <Text style={[styles.stepTitle, { color: theme.colors.text }]}>Listing details</Text>
      <Text style={[styles.stepBody, { color: theme.colors.textSoft }]}>Stackr pre-fills what it already knows. Add the practical details buyers need.</Text>
      <View style={[styles.sectionCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <FieldLabel label="Quantity" required />
        <StackrTextInput value={quantity} onChangeText={setQuantity} placeholder="1" keyboardType="numeric" />
        <FieldLabel label="Known defects" />
        <StackrTextInput value={knownDefects} onChangeText={setKnownDefects} placeholder="Disclose whitening, scratches, bends or dents." multiline />
        <View style={styles.descriptionHeader}>
          <FieldLabel label="Description" />
          <TouchableOpacity onPress={generateDescription} style={[styles.generateButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '900' }}>Create description</Text>
          </TouchableOpacity>
        </View>
        <StackrTextInput value={description} onChangeText={setDescription} placeholder="Concise factual description." multiline />
      </View>
    </View>
  );

  const renderReview = () => {
    const reviewPhotoSlots: { key: EvidenceSlotKey; label: string }[] = isGradedSlabListing
      ? [
          { key: 'slab_front', label: 'Front' },
          { key: 'slab_back', label: 'Back' },
        ]
      : isSealedLikeCategory(listingSubjectType)
        ? [
            { key: 'packaging_front', label: 'Front' },
            { key: 'packaging_back', label: 'Back' },
          ]
        : [
            { key: 'front', label: 'Front' },
            { key: 'back', label: 'Back' },
          ];

    return (
    <View style={styles.stepContent}>
      <Text style={[styles.stepTitle, { color: theme.colors.text }]}>Review your listing</Text>
      <Text style={[styles.stepBody, { color: theme.colors.textSoft }]}>This preview shows the key information a buyer or trader will see.</Text>
      <MarketplaceListingPreview
        imageUrl={sellerPreviewPhotoUrl ?? cardImageUrl}
        title={cardTitle || manualIdentity.cardName}
        subtitle={cardSubtitle}
        condition={declaredCondition}
        tier={usesProtectionTier ? protectionTier : undefined}
        trustLabel={!usesProtectionTier ? (isGradedSlabListing ? 'Grade' : 'Evidence') : undefined}
        trustValue={!usesProtectionTier ? (isGradedSlabListing ? slabConditionLabel : 'Seller photos') : undefined}
        value={tierDecision.calculationValue}
      />
      <ListingReviewSection title="Product" onEdit={() => setStep(selectedCard ? 'confirm' : selectedProduct ? 'identify' : 'manual')}>
        <ReviewRow label="Name" value={cardTitle || manualIdentity.cardName} />
        <ReviewRow label="Type" value={categoryConfig.title} />
        <ReviewRow label="Set or line" value={(selectedCard?.set_name ?? selectedProduct?.set_name ?? manualIdentity.setName) || 'Pending review'} />
        {isCardSubject(listingSubjectType) ? <ReviewRow label="Number" value={(selectedCard?.number ?? manualIdentity.cardNumber) || 'Not provided'} /> : null}
        {identityPendingReview ? <InlineRequirementMessage message="Card identity pending Stackr review" tone="warning" /> : null}
      </ListingReviewSection>
      <ListingReviewSection title="Catalogue media" onEdit={() => setStep(selectedProduct ? 'identify' : 'manual')}>
        <ReviewRow label="Reference image" value={cardImageUrl ? 'Reference image attached' : 'Reference image unavailable'} />
        <ReviewRow label="Actual-item proof" value="Seller photos required separately" />
      </ListingReviewSection>
      <ListingReviewSection title="Seller photos" onEdit={() => setStep('evidence')}>
        <View style={styles.sellerPhotoRow}>
          {reviewPhotoSlots.map((slot) => {
            const photoUrl = getEvidencePhotoUrl(evidencePhotos[slot.key]);
            return (
              <View key={slot.key} style={[styles.sellerPhotoTile, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                {photoUrl ? (
                  <Image source={{ uri: photoUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                ) : (
                  <View style={styles.sellerPhotoEmpty}>
                    <Ionicons name="camera-outline" size={22} color={theme.colors.primary} />
                  </View>
                )}
                <View style={[styles.sellerPhotoBadge, { backgroundColor: photoUrl ? 'rgba(7,7,17,0.72)' : theme.colors.card }]}>
                  <Text style={{ color: photoUrl ? '#FFFFFF' : theme.colors.textSoft, fontSize: 11, fontWeight: '900' }}>
                    {slot.label}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
        <ReviewRow label="Photos" value={`${capturedPhotoIds.length} attached`} />
        <ReviewRow label="Required" value={`${captureProgress.requiredComplete} of ${captureProgress.requiredTotal} complete`} />
        <ReviewRow label="Optional" value={`${captureProgress.optionalComplete} of ${captureProgress.optionalTotal} complete`} />
      </ListingReviewSection>
      <ListingReviewSection title="Condition, grade or sealed status" onEdit={() => setStep('condition')}>
        <ReviewRow label={listingSubjectType === 'graded_slab' ? 'Grader grade' : isSealedLikeCategory(listingSubjectType) ? 'Sealed status' : 'Seller condition'} value={declaredCondition} />
        {listingSubjectType === 'graded_slab' ? <ReviewRow label="Certification" value={slabCertificationDisplay} /> : null}
        {ximilarEstimate?.condition ? <ReviewRow label="Stackr AI estimate" value={ximilarEstimate.condition} /> : null}
        {ximilarEstimate?.centeringAssessment ? <ReviewRow label="Visible centering" value={ximilarEstimate.centeringAssessment.label} /> : null}
      </ListingReviewSection>
      <ListingReviewSection title="Offers and trade" onEdit={() => setStep('value')}>
        <ReviewRow label="Mode" value={listingMode === 'both' ? 'Offers or trade' : listingMode === 'sell' ? 'Price & offers' : 'Trade proposals'} />
        {listingMode !== 'trade' ? <ReviewRow label="Guide price (no checkout)" value={formatCurrency(listingValueNumber)} /> : null}
        {listingMode !== 'sell' ? <ReviewRow label="Trade value" value={formatCurrency(tradeValueNumber)} /> : null}
        {wantedCards.trim() ? <ReviewRow label="Wanted" value={wantedCards.trim()} /> : null}
        <ReviewRow label="Stackr transaction" value="Not available in this release" />
      </ListingReviewSection>
      {usesProtectionTier ? (
        <ListingReviewSection title="Protection" onEdit={() => setStep('protection')}>
          <ReviewRow label="Assigned tier" value={formatProtectionTier(protectionTier)} />
          <ReviewRow label="Stackr recommendation" value={formatProtectionTier(recommendedProtectionTier)} />
          <ReviewRow label="Value used" value={formatCurrency(tierDecision.calculationValue)} />
          {silverAgreementRequired ? <ReviewRow label="Buyer agreement" value="Required for Silver" /> : null}
        </ListingReviewSection>
      ) : isGradedSlabListing ? (
        <ListingReviewSection title="Professional grade" onEdit={() => setStep('condition')}>
          <ReviewRow label="Grading company" value={displayGradingCompany} />
          <ReviewRow label="Grade" value={grade} />
          <ReviewRow label="Certification" value={slabCertificationDisplay} />
          <ReviewRow label="Case condition" value={slabCaseCondition} />
        </ListingReviewSection>
      ) : isSealedLikeCategory(listingSubjectType) ? (
        <ListingReviewSection title="Item evidence" onEdit={() => setStep('evidence')}>
          <ReviewRow label="Basis" value="Seller photos and sealed-product disclosure" />
          <ReviewRow label="Seal photos" value="Encouraged where visible" />
          <ReviewRow label="Protection tier" value="Not applied to sealed products" />
        </ListingReviewSection>
      ) : (
        <ListingReviewSection title="Item evidence" onEdit={() => setStep('evidence')}>
          <ReviewRow label="Basis" value="Seller photos and item disclosure" />
          <ReviewRow label="Protection tier" value="Not applied to this product type" />
        </ListingReviewSection>
      )}
      <ListingReviewSection title="Seller declaration">
        <PressableChecklistItem
          checked={sellerDeclarationAccepted}
          onPress={() => setSellerDeclarationAccepted((value) => !value)}
          label="I confirm that these photos show the exact item being listed and that I have disclosed any damage or significant defects I am aware of."
        />
        {verificationRequirements.requiresXimilar ? (
          <PressableChecklistItem
            checked={aiDeclarationAccepted}
            onPress={() => setAiDeclarationAccepted((value) => !value)}
            label="I understand that the AI condition result is an estimate and may differ from professional grading."
          />
        ) : null}
        {silverAgreementRequired ? (
          <PressableChecklistItem
            checked={silverLiabilityAccepted}
            onPress={() => setSilverLiabilityAccepted((value) => !value)}
            label={`I understand that ${silverAgreementDisclosure.charAt(0).toLowerCase()}${silverAgreementDisclosure.slice(1)}`}
          />
        ) : null}
      </ListingReviewSection>
    </View>
    );
  };

  const renderSuccess = () => {
    const successTier = evidenceTier;
    const tierTone = SUCCESS_TIER_TONES[successTier];
    const successTitle = usesProtectionTier && protectionTier === 'silver'
      ? 'Silver listing published'
      : 'Listing published';
    const successBody = usesProtectionTier && protectionTier === 'silver'
      ? verificationRequirements.requiresXimilar
        ? 'Your condition evidence and AI estimate are attached for collectors to review.'
        : 'Your Silver evidence is attached for collectors to review.'
      : 'Your listing evidence is attached and ready for collectors to review in The Market.';
    const successStatus = 'Live in Market';
    const successProtectionLabel = usesProtectionTier ? 'Tier' : 'Evidence';
    const successProtection = usesProtectionTier ? formatProtectionTier(protectionTier) : 'Seller photos';
    const successMode = listingMode === 'both' ? 'Offers or trade' : listingMode === 'trade' ? 'Trade proposals' : 'Price & offers';
    const successValue = listingMode === 'trade' ? formatCurrency(tradeValueNumber) : formatCurrency(listingValueNumber);
    const successItemName = cardTitle || categoryConfig.title;

    return (
      <View style={[styles.successContent, { backgroundColor: theme.colors.bg }]}>
        <ScrollView
          style={styles.successScroll}
          contentContainerStyle={[
            styles.successScrollContent,
            { paddingBottom: Math.max(insets.bottom, 20) + 24 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.successCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <View style={styles.successArtworkStage}>
              <View style={[styles.successArtworkGlow, { backgroundColor: `${tierTone}18` }]} />
              <Image source={SUCCESS_TIER_ARTWORK[successTier]} style={styles.successArtwork} resizeMode="contain" />
              <View style={[styles.successReadyBadge, { backgroundColor: theme.colors.primary, borderColor: theme.colors.card }]}>
                <Ionicons name="checkmark" size={22} color="#FFFFFF" />
              </View>
            </View>

            <Text variant="micro" style={[styles.successEyebrow, { color: tierTone }]}>LISTING COMPLETE</Text>
            <Text variant="sectionTitle" style={[styles.successTitle, { color: theme.colors.text }]}>{successTitle}</Text>
            <Text variant="body" style={[styles.successBody, { color: theme.colors.textSoft }]}>{successBody}</Text>

            <View style={styles.successSummary}>
              <View style={[styles.successSummaryRow, { borderColor: theme.colors.border }]}>
                <Text variant="caption" style={[styles.successSummaryLabel, { color: theme.colors.textSoft }]}>Item</Text>
                <Text variant="cardTitle" style={[styles.successSummaryValue, { color: theme.colors.text }]} numberOfLines={2}>{successItemName}</Text>
              </View>
              <View style={[styles.successSummaryRow, { borderColor: theme.colors.border }]}>
                <Text variant="caption" style={[styles.successSummaryLabel, { color: theme.colors.textSoft }]}>Status</Text>
                <Text variant="cardTitle" style={[styles.successSummaryValue, { color: theme.colors.text }]}>{successStatus}</Text>
              </View>
              <View style={[styles.successSummaryRow, { borderColor: theme.colors.border }]}>
                <Text variant="caption" style={[styles.successSummaryLabel, { color: theme.colors.textSoft }]}>{successProtectionLabel}</Text>
                <Text variant="cardTitle" style={[styles.successSummaryValue, { color: tierTone }]}>{successProtection}</Text>
              </View>
              <View style={[styles.successSummaryRow, { borderColor: theme.colors.border }]}>
                <Text variant="caption" style={[styles.successSummaryLabel, { color: theme.colors.textSoft }]}>{successMode}</Text>
                <Text variant="cardTitle" style={[styles.successSummaryValue, { color: theme.colors.text }]}>{successValue}</Text>
              </View>
            </View>
          </View>

          <View style={styles.successActions}>
            <TouchableOpacity onPress={() => router.replace('/(tabs)/market' as any)} style={[styles.primaryActionFull, styles.successActionButton, { backgroundColor: theme.colors.primary }]}>
              <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '900' }}>Return to The Market</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={resetListingFlowToCategory}
              style={[styles.secondaryActionFull, styles.successActionButton, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
            >
              <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: '900' }}>Create another listing</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  };

  const renderStep = () => {
    if (step === 'category') return renderCategory();
    if (step === 'entry') return renderEntry();
    if (step === 'identify') return renderIdentify();
    if (step === 'confirm') return renderConfirm();
    if (step === 'manual') return renderManual();
    if (step === 'condition') return renderCondition();
    if (step === 'value') return renderValue();
    if (step === 'protection') return renderProtection();
    if (step === 'evidence') return renderEvidence();
    if (step === 'ai') return renderAi();
    if (step === 'gold') return renderDetails();
    if (step === 'details') return renderDetails();
    if (step === 'review') return renderReview();
    return renderSuccess();
  };

  const renderSlabFields = () => (
    <View style={[styles.slabPanel, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <FieldLabel label="Grading company" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {SLAB_GRADING_COMPANIES.map((company) => {
          const active = gradingCompany === company;
          return (
            <TouchableOpacity key={company} onPress={() => setGradingCompany(company)} style={[styles.smallChip, { backgroundColor: active ? theme.colors.primary : theme.colors.card, borderColor: active ? theme.colors.primary : theme.colors.border }]}>
              <Text style={{ color: active ? '#FFFFFF' : theme.colors.text, fontSize: 12, fontWeight: '900' }}>{company}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <FieldLabel label="Grade" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {SLAB_GRADE_SHORTCUTS.map((value) => {
          const active = grade === value;
          return (
            <TouchableOpacity key={value} onPress={() => setGrade(value)} style={[styles.smallChip, { backgroundColor: active ? theme.colors.primary : theme.colors.card, borderColor: active ? theme.colors.primary : theme.colors.border }]}>
              <Text style={{ color: active ? '#FFFFFF' : theme.colors.text, fontSize: 12, fontWeight: '900' }}>{value}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <StackrTextInput value={grade} onChangeText={setGrade} placeholder="Exact grade" autoCapitalize="characters" />
    </View>
  );

  if (!draftLoaded) {
    return (
      <StackrScreen variant="form">
        <View style={styles.loadingShell}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={{ color: theme.colors.textSoft, marginTop: 10, fontWeight: '800' }}>Loading listing draft...</Text>
        </View>
      </StackrScreen>
    );
  }

  const headerRight = <DraftSavedIndicator visible={draftSaved} />;
  const hasPrimaryFooter = !(step === 'category' || step === 'entry' || step === 'identify' || step === 'success');
  const scrollBottomPadding = keyboardVisible
    ? hasPrimaryFooter ? 22 : 18
    : hasPrimaryFooter ? 112 : 18;

  if (step === 'success') {
    return (
      <StackrScreen variant="form">
        {renderSuccess()}
      </StackrScreen>
    );
  }

  return (
    <StackrScreen variant="form" contentStyle={{ paddingHorizontal: 0 }}>
      <StackrBackdrop />
      <ListingFlowHeader
        stages={progressStages}
        activeStage={flowStepToStage(step)}
        completedStages={completedStages}
        onBack={goBack}
        onStagePress={goToStage}
        stageLabels={progressLabels}
        rightAccessory={headerRight}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'height' : undefined}
        keyboardVerticalOffset={0}
        style={styles.keyboardShell}
      >
        <ScrollView
          automaticallyAdjustKeyboardInsets={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: scrollBottomPadding },
          ]}
        >
          {renderStep()}
        </ScrollView>
        {isFocused ? footer() : null}
      </KeyboardAvoidingView>

      {Platform.OS === 'ios' ? (
        <InputAccessoryView nativeID={STACKR_LISTING_INPUT_ACCESSORY_ID}>
          <View
            style={[
              styles.keyboardAccessory,
              {
                backgroundColor: theme.colors.bg,
                borderTopColor: theme.colors.border,
              },
            ]}
          >
            <TouchableOpacity
              onPress={Keyboard.dismiss}
              accessibilityRole="button"
              accessibilityLabel="Dismiss keyboard"
              activeOpacity={0.82}
              style={[
                styles.keyboardAccessoryButton,
                {
                  backgroundColor: theme.colors.card,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <Ionicons name="chevron-down" size={17} color={theme.colors.primary} />
              <Text style={{ color: theme.colors.primary, fontSize: 13, lineHeight: 17, fontWeight: '900' }}>
                Done
              </Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      ) : null}

      <GuidedListingCamera
        visible={Boolean(activeCaptureRequirement)}
        requirement={activeCaptureRequirement}
        requirements={captureRequirements}
        capturedRequirementIds={Object.keys(evidencePhotos)}
        previewUri={activeCaptureRequirement
          ? evidencePhotos[activeCaptureRequirement.id]?.previewUri ?? evidencePhotos[activeCaptureRequirement.id]?.uri
          : null}
        validationTier={evidenceTier}
        onCaptured={(result) => {
          if (activeCaptureRequirement) storeRequirementPhoto(activeCaptureRequirement, result);
        }}
        onSelectRequirement={(requirement) => {
          const index = captureRequirements.findIndex((item) => item.id === requirement.id);
          if (index >= 0) setActiveEvidenceIndex(index);
          setActiveCaptureRequirement(requirement);
        }}
        onUseSystemCamera={() => {
          const requirement = activeCaptureRequirement;
          if (!requirement) return;
          setActiveCaptureRequirement(null);
          setTimeout(() => {
            void captureRequirementWithSystemCamera(requirement);
          }, 260);
        }}
        onClose={() => setActiveCaptureRequirement(null)}
      />

      <Modal visible={conditionGuideVisible} transparent animationType="slide" onRequestClose={() => setConditionGuideVisible(false)}>
        <View style={styles.modalRoot}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setConditionGuideVisible(false)} />
          <View style={[styles.modalSheet, { backgroundColor: theme.colors.bg, paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.modalHeader}>
              <Text style={{ color: theme.colors.text, fontSize: 18, lineHeight: 23, fontWeight: '900' }}>Condition guide</Text>
              <TouchableOpacity onPress={() => setConditionGuideVisible(false)} style={styles.modalClose}>
                <Ionicons name="close" size={20} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            {[
              ['Corners', 'Look for whitening, bends, dents or lifted edges.'],
              ['Edges', 'Check each side for whitening, fraying or chips.'],
              ['Surface', 'Tilt the card to catch scratches, dents, print lines and residue.'],
              ['Centring', 'Compare border thickness on every side.'],
              ['Creases', 'Any bend or crease should be disclosed clearly.'],
            ].map(([title, body]) => (
              <View key={title} style={[styles.guideRow, { borderColor: theme.colors.border }]}>
                <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '900' }}>{title}</Text>
                <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 17, marginTop: 2 }}>{body}</Text>
              </View>
            ))}
          </View>
        </View>
      </Modal>

    </StackrScreen>
  );
}

function ReviewRow({ label, value }: { label: string; value?: string | null }) {
  const { theme } = useTheme();
  return (
    <View style={styles.reviewRow}>
      <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 16, fontWeight: '800' }}>{label}</Text>
      <Text style={{ color: theme.colors.text, fontSize: 13, lineHeight: 18, fontWeight: '900', flex: 1, textAlign: 'right' }} numberOfLines={3}>
        {value || 'Not set'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingShell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyboardShell: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  keyboardAccessory: {
    minHeight: 46,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 6,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  keyboardAccessoryButton: {
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  stepContent: {
    gap: 14,
  },
  stepTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '900',
  },
  stepBody: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
  },
  introPanel: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  sectionCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    gap: 10,
  },
  valueMiniCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
  },
  scanGuide: {
    height: 360,
    borderWidth: 1,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  scanCardFrame: {
    width: 178,
    height: 248,
    borderWidth: 1,
    borderRadius: 18,
    borderStyle: 'dashed',
  },
  scanCorner: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderWidth: 4,
  },
  scanCornerTopLeft: {
    top: -4,
    left: -4,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 18,
  },
  scanCornerTopRight: {
    top: -4,
    right: -4,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 18,
  },
  scanCornerBottomLeft: {
    bottom: -4,
    left: -4,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 18,
  },
  scanCornerBottomRight: {
    bottom: -4,
    right: -4,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 18,
  },
  scanGuideText: {
    marginTop: 18,
    fontSize: 13,
    fontWeight: '800',
  },
  dualActions: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryAction: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryAction: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionFull: {
    minHeight: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionFull: {
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentChip: {
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  searchResult: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  resultImage: {
    width: 50,
    height: 70,
    borderRadius: 8,
  },
  resultImageFrame: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  productResultImage: {
    width: 70,
    height: 70,
    borderRadius: 12,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slabPanel: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
    gap: 8,
  },
  smallChip: {
    minHeight: 38,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sellingTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  sellingTypeTile: {
    width: '48%',
    minHeight: 178,
    borderRadius: 22,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
  },
  sellingTypeIconFrame: {
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sellingTypeTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  sellingTypeBody: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  twoColumn: {
    flexDirection: 'row',
    gap: 10,
  },
  helpButton: {
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  protectionChoiceHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  recommendedPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginTop: 1,
  },
  modeGrid: {
    gap: 10,
  },
  captureProgressPanel: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
    gap: 8,
  },
  captureProgressLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  captureQueueLine: {
    minHeight: 34,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: 'rgba(105,56,245,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  captureQueueLabel: {
    width: 92,
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  captureQueueValue: {
    flex: 1,
    minWidth: 0,
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: '900',
  },
  captureCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 14,
    gap: 12,
  },
  captureCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  requirementBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  capturePreview: {
    minHeight: 330,
    borderWidth: 1,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  capturePlaceholder: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  evidenceImageStage: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#070711',
  },
  evidenceImageShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7,7,17,0.08)',
  },
  evidenceCorner: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderColor: '#FFFFFF',
    borderWidth: 4,
  },
  evidenceCornerTopLeft: {
    top: 22,
    left: 22,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 8,
  },
  evidenceCornerTopRight: {
    top: 22,
    right: 22,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 8,
  },
  evidenceCornerBottomLeft: {
    bottom: 22,
    left: 22,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 8,
  },
  evidenceCornerBottomRight: {
    bottom: 22,
    right: 22,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 8,
  },
  evidenceRetakePill: {
    position: 'absolute',
    bottom: 18,
    alignSelf: 'center',
    minHeight: 34,
    borderRadius: 999,
    paddingHorizontal: 13,
    backgroundColor: 'rgba(255,255,255,0.94)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  evidenceTargetStage: {
    width: '78%',
    maxWidth: 230,
    aspectRatio: 0.716,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  evidenceGuideCard: {
    width: '82%',
    height: '82%',
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  evidenceGuideShine: {
    position: 'absolute',
    top: '10%',
    width: '82%',
    height: '38%',
    borderRadius: 16,
  },
  evidenceGuideLine: {
    width: '74%',
    height: 1.5,
    borderRadius: 999,
    opacity: 0.7,
  },
  evidenceGuideCorner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderWidth: 4,
  },
  evidenceGuideCornerTopLeft: {
    top: -2,
    left: -2,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 15,
  },
  evidenceGuideCornerTopRight: {
    top: -2,
    right: -2,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 15,
  },
  evidenceGuideCornerBottomLeft: {
    bottom: -2,
    left: -2,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 15,
  },
  evidenceGuideCornerBottomRight: {
    bottom: -2,
    right: -2,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 15,
  },
  actualPhotoPill: {
    marginTop: 12,
    minHeight: 30,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sellerPhotoRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 6,
  },
  sellerPhotoTile: {
    flex: 1,
    height: 126,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerPhotoEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerPhotoBadge: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  descriptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  generateButton: {
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
    justifyContent: 'center',
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
    paddingVertical: 4,
  },
  successContent: {
    flex: 1,
  },
  successScroll: {
    flex: 1,
  },
  successScrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingTop: 28,
    gap: 18,
  },
  successCard: {
    width: '100%',
    maxWidth: 430,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 20,
    gap: 12,
    shadowColor: '#1B2A4B',
    shadowOpacity: 0.1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
  successArtworkStage: {
    width: 150,
    height: 136,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  successArtworkGlow: {
    position: 'absolute',
    width: 132,
    height: 132,
    borderRadius: 66,
  },
  successArtwork: {
    width: 118,
    height: 118,
  },
  successReadyBadge: {
    position: 'absolute',
    right: 14,
    bottom: 12,
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successEyebrow: {
    fontWeight: '900',
    textAlign: 'center',
  },
  successTitle: {
    textAlign: 'center',
    maxWidth: 330,
  },
  successBody: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '700',
    textAlign: 'center',
    maxWidth: 340,
  },
  successSummary: {
    width: '100%',
    gap: 0,
    marginTop: 8,
  },
  successSummaryRow: {
    minHeight: 56,
    borderTopWidth: 1,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  successSummaryLabel: {
    minWidth: 92,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  successSummaryValue: {
    flex: 1,
    textAlign: 'right',
    fontWeight: '900',
  },
  successActions: {
    width: '100%',
    maxWidth: 430,
    gap: 10,
  },
  successActionButton: {
    width: '100%',
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(7,20,95,0.32)',
  },
  modalSheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 18,
    paddingBottom: 34,
    gap: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  modalClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideRow: {
    borderTopWidth: 1,
    paddingTop: 11,
    paddingBottom: 4,
  },
});
