import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Image,
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
  LabelPreview,
  ListingFlowHeader,
  ListingReviewSection,
  MarketplaceListingPreview,
  PressableChecklistItem,
  PrimaryFooter,
  PrinterSelector,
  ProtectionTierReveal,
  StackrTextInput,
  ToggleCard,
  ValueComparisonCard,
  VerificationStatusTimeline,
  XimilarAnalysisStatus,
} from '../../components/listing/CreateListingFlowComponents';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SLAB_GRADE_SHORTCUTS, SLAB_GRADING_COMPANIES, formatSlabCompanyLabel } from '../../components/SlabStickerLabel';
import { StackrCardActionIcon, StackrPageTitle, StackrScreen } from '../../components/StackrScreen';
import { Text } from '../../components/Text';
import { useTheme } from '../../components/theme-context';
import { assertCanCommitQuantity, fetchUserCardAvailability } from '../../lib/cardOwnership';
import { searchLocalPokemonCards } from '../../lib/cardSearch';
import { USD_TO_GBP, EUR_TO_GBP } from '../../lib/config';
import { fetchEbayPrice } from '../../lib/ebay';
import { listingCategoryIcons } from '../../lib/listingCategoryIcons';
import { CREATE_LISTING_DRAFT_KEY } from '../../lib/listingDrafts';
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
  createVerificationId,
  formatCurrency,
  formatProtectionTier,
  getCategoryEvidenceRequirements,
  getEvidenceRequirementsForTier,
  getListingProgressLabels,
  getListingProgressStages,
  getMissingListingRequirements,
  getRequiredCategoryEvidence,
  getRequiredEvidenceForTier,
  getVerificationRequirements,
  type EvidenceSlotKey,
  type ListingFlowStage,
  type ListingProtectionTier,
  type MissingRequirement,
} from '../../lib/listingFlow';
import { getProductPriceWithFallback, searchMarketProducts, type MarketProduct, type ProductLookupType } from '../../lib/productSearch';
import { getPokemonCardImageUrls } from '../../lib/pokemonTcg';
import { fetchPokeTraceCardPrice } from '../../lib/pricing';
import {
  SHIPPO_DELIVERY_METHODS,
  getShippoDeliveryMethod,
  getShippoDeliveryMethodByName,
  type ShippoDeliveryMethod,
} from '../../lib/shippoDelivery';
import { stackrIcons } from '../../lib/stackrIcons';
import { supabase } from '../../lib/supabase';
import { gradeCardWithXimilar, type XimilarGradeImage } from '../../lib/ximilar';

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
type PrinterState = 'idle' | 'searching' | 'unavailable' | 'printed';

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
  base64?: string | null;
  quality: {
    fullCardVisible: boolean;
    steady: boolean;
    lighting: boolean;
    singleCard: boolean;
  };
};

type EvidencePhotoMap = Partial<Record<EvidenceSlotKey, EvidencePhoto>>;

type XimilarEstimate = {
  condition: string | null;
  confidence: 'High confidence' | 'Moderate confidence' | 'Limited confidence' | null;
  breakdown: { label: string; value: string }[];
  rawFinalScore?: number | null;
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
  shippingMethod: string;
  deliveryMethodId: string;
  postageCost: string;
  dispatchTime: string;
  selectedProtectionTier: ListingProtectionTier | null;
  silverLiabilityAccepted: boolean;
  quantity: string;
  gradingCompany: string;
  grade: string;
  evidencePhotos: EvidencePhotoMap;
  ximilarEstimate: XimilarEstimate | null;
  ximilarStatus: 'idle' | 'processing' | 'complete' | 'failed';
  conditionDiscrepancyReason: string;
  verificationId: string | null;
  printerState: PrinterState;
  packagingConfirmed: string[];
  trackingReference: string;
  sellerDeclarationAccepted: boolean;
  aiDeclarationAccepted: boolean;
  goldDeclarationAccepted: boolean;
  updatedAt?: string;
};

type ListingMediaItem = {
  role: 'stock' | 'seller' | 'verification';
  slot: string;
  label: string;
  url: string;
  required: boolean;
};

const DRAFT_KEY = CREATE_LISTING_DRAFT_KEY;
const AUTO_SAVE_DELAY_MS = 450;

const LISTING_CATEGORIES = getListingCategories();
const PRODUCT_TYPES: ListingSubjectType[] = LISTING_CATEGORIES.map((category) => category.key);
const PRODUCT_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  LISTING_CATEGORIES.map((category) => [category.key, category.title])
);

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

const PACKAGING_ITEMS = [
  'Sleeve the card.',
  'Place it in an appropriate rigid protector.',
  'Do not tape directly to the card holder.',
  'Protect it from movement and moisture.',
  'Attach the verification label securely.',
  'Retain proof of postage.',
];

const PROTECTION_TIER_RANK: Record<ListingProtectionTier, number> = {
  bronze: 1,
  silver: 2,
  gold: 3,
};

const PROTECTION_TIER_ICONS: Record<ListingProtectionTier, keyof typeof Ionicons.glyphMap> = {
  bronze: 'shield-outline',
  silver: 'shield-half-outline',
  gold: 'shield-checkmark-outline',
};

const PROTECTION_TIER_CHOICE_COPY: Record<ListingProtectionTier, string> = {
  bronze: 'Fastest evidence flow for lower-value cards.',
  silver: 'AI-assisted condition evidence. Buyer or trader agreement is required when Silver is manually selected.',
  gold: 'Full Gold preparation and AGS verification status only after confirmation.',
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
  if (recommended === 'gold') return ['gold', 'silver'];
  if (recommended === 'silver') return ['silver', 'gold'];
  return ['bronze', 'silver', 'gold'];
}

const parseCurrency = (value: string) => {
  const parsed = Number(String(value ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const isCardSubject = (type: ListingSubjectType) => isCardCatalogueCategory(type);
const canUseProductCatalogue = (type: ListingSubjectType): type is ProductLookupType => {
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
  const official = getPokemonCardImageUrls(card.id, card.set_id, card.number);
  return (
    official.large ??
    official.small ??
    card.image_large ??
    card.image_small ??
    card.raw_data?.images?.large ??
    card.raw_data?.images?.small ??
    null
  );
};

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
    language: row.raw_data?.language ?? null,
    variant: row.raw_data?.subtypes?.join(', ') ?? null,
    raw_data: row.raw_data ?? null,
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

export default function CreateListingScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ cardId?: string; setId?: string; type?: string; productName?: string }>();
  const isFocused = useIsFocused();
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
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
  const [conditionGuideVisible, setConditionGuideVisible] = useState(false);
  const [askingPrice, setAskingPrice] = useState('');
  const [tradeValue, setTradeValue] = useState('');
  const [offersAccepted, setOffersAccepted] = useState(true);
  const [minimumOffer, setMinimumOffer] = useState('');
  const [wantedCards, setWantedCards] = useState('');
  const [description, setDescription] = useState('');
  const [knownDefects, setKnownDefects] = useState('');
  const [shippingMethod, setShippingMethod] = useState('Royal Mail tracked');
  const [deliveryMethodId, setDeliveryMethodId] = useState('royal-mail-tracked-48');
  const [deliveryPickerVisible, setDeliveryPickerVisible] = useState(false);
  const [postageCost, setPostageCost] = useState('3.49');
  const [dispatchTime, setDispatchTime] = useState('2 working days');
  const [selectedProtectionTier, setSelectedProtectionTier] = useState<ListingProtectionTier | null>(null);
  const [silverLiabilityAccepted, setSilverLiabilityAccepted] = useState(false);
  const [quantity, setQuantity] = useState('1');
  const [gradingCompany, setGradingCompany] = useState('PSA');
  const [grade, setGrade] = useState('10');
  const [prices, setPrices] = useState<PriceState>(DEFAULT_PRICES);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SelectedCard[]>([]);
  const [productResults, setProductResults] = useState<MarketProduct[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [ownedCards, setOwnedCards] = useState<SelectedCard[]>([]);
  const [searching, setSearching] = useState(false);
  const [collectionLoading, setCollectionLoading] = useState(false);
  const [scanReferencePhoto, setScanReferencePhoto] = useState<EvidencePhoto | null>(null);
  const [evidencePhotos, setEvidencePhotos] = useState<EvidencePhotoMap>({});
  const [activeEvidenceIndex, setActiveEvidenceIndex] = useState(0);
  const [ximilarStatus, setXimilarStatus] = useState<'idle' | 'processing' | 'complete' | 'failed'>('idle');
  const [ximilarError, setXimilarError] = useState<string | null>(null);
  const [ximilarEstimate, setXimilarEstimate] = useState<XimilarEstimate | null>(null);
  const [conditionDiscrepancyReason, setConditionDiscrepancyReason] = useState('');
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [printerState, setPrinterState] = useState<PrinterState>('idle');
  const [packagingConfirmed, setPackagingConfirmed] = useState<string[]>([]);
  const [trackingReference, setTrackingReference] = useState('');
  const [sellerDeclarationAccepted, setSellerDeclarationAccepted] = useState(false);
  const [aiDeclarationAccepted, setAiDeclarationAccepted] = useState(false);
  const [goldDeclarationAccepted, setGoldDeclarationAccepted] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressNextAutoSaveRef = useRef(false);
  const routeHasPrefill = Boolean(params.cardId || params.productName);
  const listingSubjectType = resolveListingSubjectTypeForSelection({
    requested: storedListingSubjectType,
    selectedCard,
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
  const recommendedProtectionTier = tierDecision.tier;
  const allowedProtectionTiers = useMemo(
    () => getSelectableProtectionTiers(recommendedProtectionTier),
    [recommendedProtectionTier]
  );
  const protectionTier = selectedProtectionTier && allowedProtectionTiers.includes(selectedProtectionTier)
    ? selectedProtectionTier
    : recommendedProtectionTier;
  const evidenceTier: ListingProtectionTier = isGradedSlabListing ? 'bronze' : protectionTier;
  const usesProtectionTier = !isGradedSlabListing;
  const protectionTierIsManual = selectedProtectionTier != null && selectedProtectionTier !== recommendedProtectionTier;
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
      agsLabel: listingSubjectType === 'raw_card',
      humanReview: !isGradedSlabListing,
    },
  }), [categoryProductFamily, evidenceTier, gradingCompany, isGradedSlabListing, listingSubjectType, sealedStatus]);
  const requiresGoldReview = usesProtectionTier && protectionTier === 'gold'
    && (verificationRequirements.requiresAGSLabel || verificationRequirements.requiresHumanReview);
  const silverAgreementDisclosure = verificationRequirements.requiresXimilar
    ? 'Silver uses AI-assisted condition evidence and seller photos. It does not include Gold AGS verification, so it is less secure for condition disputes than Gold. The listing will show that buyer or trader agreement is required before proceeding.'
    : isSealedLikeCategory(listingSubjectType)
      ? 'Silver was manually selected for this sealed item. Front and back photos remain the required seller evidence; seal and wrap photos are encouraged but not mandatory. Buyer or trader agreement is required before proceeding.'
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
  const capturedEvidenceKeys = useMemo(() => Object.keys(evidencePhotos), [evidencePhotos]);
  const currentEvidence = evidenceRequirements[Math.min(activeEvidenceIndex, evidenceRequirements.length - 1)] ?? evidenceRequirements[0];
  const identityConfirmed = Boolean(selectedCard || selectedProduct || manualIdentity.cardName.trim());
  const identityPendingReview = Boolean(!selectedCard && !selectedProduct && manualIdentity.cardName.trim());
  const detailsComplete = Boolean(
    quantity.trim()
    && (listingMode === 'trade' || shippingMethod.trim())
    && (listingMode === 'trade' || dispatchTime.trim())
  );
  const goldReady = !requiresGoldReview
    || (verificationRequirements.requiresAGSLabel
      ? Boolean(verificationId && packagingConfirmed.length === PACKAGING_ITEMS.length)
      : Boolean(verificationId));
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
        && (!verificationRequirements.requiresXimilar || aiDeclarationAccepted)
        && (!requiresGoldReview || goldDeclarationAccepted),
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
    goldDeclarationAccepted,
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
    if (requiredEvidence.every((slot) => evidencePhotos[slot.key])) completed.push('evidence');
    if (verificationRequirements.requiresXimilar && aiComplete) completed.push('ai');
    if (goldReady && requiresGoldReview) completed.push('gold');
    if (detailsComplete) completed.push('details');
    if (sellerDeclarationAccepted) completed.push('review');
    return completed;
  }, [aiComplete, conditionSelected, detailsComplete, evidencePhotos, goldReady, identityConfirmed, requiredEvidence, requiresGoldReview, sellerDeclarationAccepted, step, usesProtectionTier, valueEntered, verificationRequirements.requiresXimilar]);

  const catalogueImageUrl = selectedProduct?.image_large_url ?? selectedProduct?.image_url ?? null;
  const cardTitle = selectedCard?.name ?? selectedProduct?.name ?? manualIdentity.cardName.trim() ?? '';
  const cardSubtitle = selectedCard
    ? [selectedCard.set_name, selectedCard.number ? `#${selectedCard.number}` : null, selectedCard.rarity].filter(Boolean).join(' · ')
    : selectedProduct
      ? [selectedProduct.set_name, categoryConfig.title, selectedProduct.source ? `Source: ${selectedProduct.source}` : null].filter(Boolean).join(' · ')
      : [manualIdentity.setName.trim(), manualIdentity.cardNumber.trim() ? `#${manualIdentity.cardNumber.trim()}` : null, manualIdentity.variant.trim()].filter(Boolean).join(' · ');
  const cardImageUrl = getCardImageUrl(selectedCard) ?? catalogueImageUrl;
  const valueWarning = getValueWarning(prices.market, activeTransactionValue);
  const selectedDeliveryMethod = useMemo(
    () => getShippoDeliveryMethod(deliveryMethodId),
    [deliveryMethodId]
  );
  const deliveryPostageLabel = selectedDeliveryMethod.priceGbp <= 0
    ? 'No postage'
    : formatCurrency(parseCurrency(postageCost) ?? selectedDeliveryMethod.priceGbp);

  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, []);

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

  useEffect(() => {
    let cancelled = false;
    const restoreDraft = async () => {
      if (routeHasPrefill) {
        setDraftLoaded(true);
        return;
      }

      try {
        const raw = await AsyncStorage.getItem(DRAFT_KEY);
        if (!raw || cancelled) {
          setDraftLoaded(true);
          return;
        }

        const draft = JSON.parse(raw) as DraftState;
        const restoredSelectedCard = draft.selectedCard ?? null;
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
        setAskingPrice(draft.askingPrice ?? '');
        setTradeValue(draft.tradeValue ?? '');
        setOffersAccepted(draft.offersAccepted ?? true);
        setMinimumOffer(draft.minimumOffer ?? '');
        setWantedCards(draft.wantedCards ?? '');
        setDescription(draft.description ?? '');
        setKnownDefects(draft.knownDefects ?? '');
        setShippingMethod(draft.shippingMethod ?? 'Royal Mail tracked');
        setDeliveryMethodId(draft.deliveryMethodId ?? getShippoDeliveryMethodByName(draft.shippingMethod).id);
        setPostageCost(draft.postageCost ?? '3.49');
        setDispatchTime(draft.dispatchTime ?? '2 working days');
        setSelectedProtectionTier(draft.selectedProtectionTier ?? null);
        setSilverLiabilityAccepted(draft.silverLiabilityAccepted ?? false);
        setQuantity(draft.quantity ?? '1');
        setGradingCompany(formatSlabCompanyLabel(draft.gradingCompany ?? 'PSA'));
        setGrade(draft.grade ?? '10');
        setEvidencePhotos(draft.evidencePhotos ?? {});
        setXimilarEstimate(draft.ximilarEstimate ?? null);
        setXimilarStatus(draft.ximilarStatus ?? 'idle');
        setConditionDiscrepancyReason(draft.conditionDiscrepancyReason ?? '');
        setVerificationId(draft.verificationId ?? null);
        setPrinterState(draft.printerState ?? 'idle');
        setPackagingConfirmed(draft.packagingConfirmed ?? []);
        setTrackingReference(draft.trackingReference ?? '');
        setSellerDeclarationAccepted(draft.sellerDeclarationAccepted ?? false);
        setAiDeclarationAccepted(draft.aiDeclarationAccepted ?? false);
        setGoldDeclarationAccepted(draft.goldDeclarationAccepted ?? false);
      } catch (error) {
        console.log('Listing draft restore failed:', error);
      } finally {
        if (!cancelled) setDraftLoaded(true);
      }
    };

    void restoreDraft();
    return () => {
      cancelled = true;
    };
  }, [routeHasPrefill]);

  const buildDraftState = useCallback((): DraftState => ({
    step,
    identificationMethod,
    selectedCard,
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
    shippingMethod,
    deliveryMethodId,
    postageCost,
    dispatchTime,
    selectedProtectionTier,
    silverLiabilityAccepted,
    quantity,
    gradingCompany: displayGradingCompany,
    grade,
    evidencePhotos,
    ximilarEstimate,
    ximilarStatus,
    conditionDiscrepancyReason,
    verificationId,
    printerState,
    packagingConfirmed,
    trackingReference,
    sellerDeclarationAccepted,
    aiDeclarationAccepted,
    goldDeclarationAccepted,
    updatedAt: new Date().toISOString(),
  }), [
    aiDeclarationAccepted,
    askingPrice,
    certificationNumber,
    conditionDiscrepancyReason,
    description,
    deliveryMethodId,
    dispatchTime,
    evidencePhotos,
    goldDeclarationAccepted,
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
    packagingConfirmed,
    postageCost,
    printerState,
    quantity,
    selectedCard,
    selectedProduct,
    selectedProtectionTier,
    sealedStatus,
    sellerCondition,
    sellerDeclarationAccepted,
    shippingMethod,
    silverLiabilityAccepted,
    slabCaseCondition,
    step,
    trackingReference,
    tradeValue,
    verificationId,
    wantedCards,
    ximilarEstimate,
    ximilarStatus,
  ]);

  useEffect(() => {
    if (!draftLoaded || step === 'success') return;
    if (suppressNextAutoSaveRef.current) {
      suppressNextAutoSaveRef.current = false;
      return;
    }
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(buildDraftState()))
        .then(() => {
          setDraftSaved(true);
          setTimeout(() => setDraftSaved(false), 1400);
        })
        .catch((error) => console.log('Listing draft save failed:', error));
    }, AUTO_SAVE_DELAY_MS);
  }, [buildDraftState, draftLoaded, step]);

  useEffect(() => {
    setSelectedProtectionTier((current) => (
      current && !allowedProtectionTiers.includes(current) ? null : current
    ));
  }, [allowedProtectionTiers]);

  useEffect(() => {
    if (!silverAgreementRequired) setSilverLiabilityAccepted(false);
  }, [silverAgreementRequired]);

  useEffect(() => {
    if (isGradedSlabListing && (step === 'protection' || step === 'ai' || step === 'gold')) {
      setStep('evidence');
    }
  }, [isGradedSlabListing, step]);

  useEffect(() => {
    if (!selectedProduct) return;
    const productSubjectType = getListingSubjectTypeForProduct(selectedProduct);
    if (storedListingSubjectType === productSubjectType) return;

    setListingSubjectType(productSubjectType);
    setSelectedProtectionTier(null);
    setEvidencePhotos({});
    setActiveEvidenceIndex(0);
    setCertificationNumber('');
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
        const { data, error } = await supabase
          .from('pokemon_cards')
          .select('id, name, number, rarity, image_small, image_large, set_id, raw_data')
          .eq('id', cardId)
          .maybeSingle();
        if (error) throw error;
        if (!data || cancelled) return;

        const card = mapCardRow(data);
        setSelectedCard(card);
        setSearchQuery(card.name);
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
        identifier: card.name,
        setName,
        number: card.number ?? null,
        language: card.language ?? null,
        market: 'US',
        gradingCompany: displayGradingCompany,
        grade: grade.trim() || '10',
      });

      const ebay = subjectType === 'graded_slab'
        ? pokeTrace?.graded_average ?? null
        : pokeTrace?.ebay_average ?? null;
      const ebayLow = subjectType === 'graded_slab'
        ? pokeTrace?.graded_low ?? null
        : pokeTrace?.ebay_low ?? null;
      const ebayHigh = subjectType === 'graded_slab'
        ? pokeTrace?.graded_high ?? null
        : pokeTrace?.ebay_high ?? null;

      let fallbackEbay: number | null = null;
      let fallbackEbayLow: number | null = null;
      let fallbackEbayHigh: number | null = null;
      if (subjectType === 'graded_slab' && ebay == null) {
        const fallback = await fetchEbayPrice({
          cardId: card.id,
          name: card.name,
          setName,
          number: card.number ?? '',
          setTotal: card.raw_data?.set?.printedTotal ?? card.raw_data?.set?.total ?? null,
          rarity: card.rarity ?? '',
          pricingMode: 'graded',
          gradingCompany: displayGradingCompany,
          grade: grade.trim() || '10',
        }).catch(() => null);
        fallbackEbay = fallback?.average ?? null;
        fallbackEbayLow = fallback?.low ?? null;
        fallbackEbayHigh = fallback?.high ?? null;
      }

      if (subjectType === 'raw_card' && ebay == null) {
        const fallback = await fetchEbayPrice({
          cardId: card.id,
          name: card.name,
          setName,
          number: card.number ?? '',
          setTotal: card.raw_data?.set?.printedTotal ?? card.raw_data?.set?.total ?? null,
          rarity: card.rarity ?? '',
        }).catch(() => null);
        fallbackEbay = fallback?.average ?? null;
        fallbackEbayLow = fallback?.low ?? null;
        fallbackEbayHigh = fallback?.high ?? null;
      }

      const tcgPrices = card.raw_data?.tcgplayer?.prices;
      let tcg: number | null = pokeTrace?.tcg_mid ?? pokeTrace?.tcg_low ?? null;
      if (tcgPrices) {
        for (const key of ['holofoil', 'reverseHolofoil', 'normal', '1stEditionHolofoil', '1stEditionNormal']) {
          const val = tcgPrices[key]?.market ?? tcgPrices[key]?.mid;
          if (tcg == null && typeof val === 'number') {
            tcg = Math.round(val * USD_TO_GBP * 100) / 100;
            break;
          }
        }
      }

      const cardmarketPrices = card.raw_data?.cardmarket?.prices;
      const cardmarket = pokeTrace?.cardmarket_trend
        ?? (cardmarketPrices?.trendPrice != null ? Math.round(cardmarketPrices.trendPrice * EUR_TO_GBP * 100) / 100 : null);
      const market = subjectType === 'graded_slab'
        ? ebay ?? fallbackEbay ?? null
        : ebay ?? fallbackEbay ?? tcg ?? cardmarket ?? null;

      setPrices({
        market,
        low: ebayLow ?? fallbackEbayLow ?? null,
        high: ebayHigh ?? fallbackEbayHigh ?? null,
        graded: pokeTrace?.graded_average ?? fallbackEbay ?? null,
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

  const runSearch = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const data = await searchLocalPokemonCards<any>(trimmed, {
        limit: 60,
        select: 'id, name, number, rarity, image_small, image_large, set_id, raw_data',
      });
      setSearchResults((data ?? []).map(mapCardRow));
      setRecentSearches((previous) => [trimmed, ...previous.filter((item) => item !== trimmed)].slice(0, 6));
    } catch (error) {
      console.log('Listing search failed:', error);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

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

    setSearching(true);
    try {
      const data = await searchMarketProducts(trimmed, lookupType, 24);
      setProductResults(data);
      setRecentSearches((previous) => [trimmed, ...previous.filter((item) => item !== trimmed)].slice(0, 6));
    } catch (error) {
      console.log('Listing product search failed:', error);
      setProductResults([]);
    } finally {
      setSearching(false);
    }
  }, [listingSubjectType]);

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      if (isCardSubject(listingSubjectType)) void runSearch(text);
      else void runProductSearch(text, listingSubjectType);
    }, 300);
  };

  const loadOwnedCards = useCallback(async () => {
    setCollectionLoading(true);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) {
        setOwnedCards([]);
        return;
      }
      const { data: ownershipRows, error: ownershipError } = await supabase
        .from('user_card_variants')
        .select('card_id, set_id, quantity')
        .eq('user_id', user.id)
        .limit(80);
      if (ownershipError) throw ownershipError;

      const ids = Array.from(new Set((ownershipRows ?? []).map((row: any) => row.card_id).filter(Boolean)));
      if (!ids.length) {
        setOwnedCards([]);
        return;
      }
      const { data: cards, error: cardError } = await supabase
        .from('pokemon_cards')
        .select('id, name, number, rarity, image_small, image_large, set_id, raw_data')
        .in('id', ids)
        .limit(80);
      if (cardError) throw cardError;
      setOwnedCards((cards ?? []).map(mapCardRow));
    } catch (error) {
      console.log('Owned listing cards load failed:', error);
      setOwnedCards([]);
    } finally {
      setCollectionLoading(false);
    }
  }, []);

  const selectCard = async (card: SelectedCard) => {
    setSelectedCard(card);
    setSelectedProduct(null);
    setManualIdentity(DEFAULT_MANUAL_IDENTITY);
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
    setListingSubjectType(type);
    setSelectedCard(null);
    setSelectedProduct(null);
    setSelectedProtectionTier(null);
    setEvidencePhotos({});
    setActiveEvidenceIndex(0);
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
    setIdentificationMethod(method);
    if (method === 'collection') void loadOwnedCards();
    setStep(method === 'manual' ? 'manual' : 'identify');
  };

  const resetListingFlowToCategory = useCallback(() => {
    suppressNextAutoSaveRef.current = true;
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
    setAskingPrice('');
    setTradeValue('');
    setOffersAccepted(true);
    setMinimumOffer('');
    setWantedCards('');
    setDescription('');
    setKnownDefects('');
    setShippingMethod('Royal Mail tracked');
    setDeliveryMethodId('royal-mail-tracked-48');
    setPostageCost('3.49');
    setDispatchTime('2 working days');
    setSelectedProtectionTier(null);
    setSilverLiabilityAccepted(false);
    setQuantity('1');
    setGradingCompany('PSA');
    setGrade('10');
    setPrices(DEFAULT_PRICES);
    setSearchQuery('');
    setSearchResults([]);
    setProductResults([]);
    setEvidencePhotos({});
    setActiveEvidenceIndex(0);
    setXimilarStatus('idle');
    setXimilarError(null);
    setXimilarEstimate(null);
    setConditionDiscrepancyReason('');
    setVerificationId(null);
    setPrinterState('idle');
    setPackagingConfirmed([]);
    setTrackingReference('');
    setSellerDeclarationAccepted(false);
    setAiDeclarationAccepted(false);
    setGoldDeclarationAccepted(false);
    setDraftSaved(false);
  }, []);

  const returnToMarketHome = useCallback(() => {
    router.replace('/(tabs)/market' as any);
  }, []);

  const returnToMyListings = useCallback(() => {
    router.replace({ pathname: '/(tabs)/market', params: { segment: 'myListings' } } as any);
  }, []);

  const saveAndExitDraft = useCallback(async () => {
    try {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(buildDraftState()));
      setDraftSaved(true);
      Alert.alert('Listing saved as a draft', 'You can resume it from My Listings when you are ready.', [
        { text: 'OK', onPress: returnToMyListings },
      ]);
    } catch (error) {
      Alert.alert('Could not save draft', 'Please keep editing and try again.');
    }
  }, [buildDraftState, returnToMyListings]);

  const discardAndExitDraft = useCallback(async () => {
    try {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      await AsyncStorage.removeItem(DRAFT_KEY);
    } catch (error) {
      console.log('Listing draft discard failed:', error);
    } finally {
      resetListingFlowToCategory();
      returnToMarketHome();
    }
  }, [resetListingFlowToCategory, returnToMarketHome]);

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
      details: requiresGoldReview ? 'gold' : verificationRequirements.requiresXimilar ? 'ai' : 'evidence',
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

  const capturePhoto = async (slot: EvidenceSlotKey | 'scan_reference', fromCamera = true) => {
    try {
      const aspect: [number, number] = isSealedLikeCategory(listingSubjectType)
        ? (listingSubjectType === 'booster_pack' || listingSubjectType === 'sleeved_booster_pack' ? [2, 3] : [1, 1])
        : listingSubjectType === 'graded_slab'
          ? [4, 5]
          : [3, 4];
      const options: ImagePicker.ImagePickerOptions = {
        quality: 0.84,
        allowsEditing: true,
        aspect,
        base64: true,
      };
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);

      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const photo: EvidencePhoto = {
        uri: asset.uri,
        base64: asset.base64 ?? null,
        quality: {
          fullCardVisible: true,
          steady: true,
          lighting: true,
          singleCard: true,
        },
      };

      if (slot === 'scan_reference') {
        setScanReferencePhoto(photo);
      } else {
        setEvidencePhotos((current) => ({ ...current, [slot]: photo }));
        const currentSlotIndex = evidenceRequirements.findIndex((item) => item.key === slot);
        const nextMissing = evidenceRequirements.findIndex((item, index) => index > currentSlotIndex && !item.optional && !evidencePhotos[item.key]);
        if (nextMissing >= 0) setActiveEvidenceIndex(nextMissing);
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      Alert.alert('Photo not captured', error?.message ?? 'Try again with the full card visible and good lighting.');
    }
  };

  const selectDeliveryMethod = (method: ShippoDeliveryMethod) => {
    setDeliveryMethodId(method.id);
    setShippingMethod(method.displayName);
    setPostageCost(method.priceGbp > 0 ? method.priceGbp.toFixed(2) : '');
    setDispatchTime(method.eta);
    setDeliveryPickerVisible(false);
    void Haptics.selectionAsync();
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
    return FileSystem.readAsStringAsync(photo.uri, { encoding: 'base64' });
  };

  const runXimilarAnalysis = async () => {
    const analysisSlots = ['front', 'back', 'surface_front', 'surface_back'] as EvidenceSlotKey[];
    const images = analysisSlots
      .map((slot) => evidencePhotos[slot])
      .filter(Boolean) as EvidencePhoto[];

    if (images.length < 2) {
      Alert.alert('More images needed', 'Add at least front and back photographs before starting the AI-assisted condition check.');
      return;
    }

    setXimilarStatus('processing');
    setXimilarError(null);
    try {
      const payload: XimilarGradeImage[] = [];
      for (const [index, image] of images.entries()) {
        payload.push({
          base64: await readPhotoBase64(image),
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
        breakdown: [
          { label: 'Centring', value: grades?.centering != null ? `Visible centring score ${grades.centering.toFixed(1)}` : 'No centring score returned.' },
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

  const togglePackaging = (item: string) => {
    setPackagingConfirmed((current) => current.includes(item)
      ? current.filter((entry) => entry !== item)
      : [...current, item]
    );
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

  const uploadPhotos = async (userId: string): Promise<{ urls: string[]; bySlot: Partial<Record<EvidenceSlotKey, string>> }> => {
    const urls: string[] = [];
    const bySlot: Partial<Record<EvidenceSlotKey, string>> = {};
    for (const [slot, photo] of Object.entries(evidencePhotos) as [EvidenceSlotKey, EvidencePhoto][]) {
      const base64 = await readPhotoBase64(photo);
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let index = 0; index < binaryString.length; index += 1) {
        bytes[index] = binaryString.charCodeAt(index);
      }

      const path = `${userId}/${slot}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.jpg`;
      const { data, error } = await supabase.storage
        .from('trade-listings')
        .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
      if (error) throw error;

      const { data: publicData } = supabase.storage
        .from('trade-listings')
        .getPublicUrl(data.path);
      urls.push(publicData.publicUrl);
      bySlot[slot] = publicData.publicUrl;
    }

    return { urls, bySlot };
  };

  const publishListing = async (skipDuplicateWarning = false) => {
    const missing = missingPublicationRequirements;
    if (missing.length) {
      Alert.alert('Listing not ready', missing[0].label);
      return;
    }

    setPublishing(true);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error('You must be signed in to publish a listing.');

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
                onPress: () => void publishListing(true),
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

      const resolvedName = selectedCard?.name ?? selectedProduct?.name ?? manualIdentity.cardName.trim();
      const cardId = selectedCard
        ? selectedCard.id
        : selectedProduct
          ? `product:${selectedProduct.id}`
          : `manual:${manualIdentity.state}:${slugify(resolvedName) || Date.now()}`;
      const setId = selectedCard?.set_id ?? selectedProduct?.set_name ?? null;
      const stockImageUrl = selectedCard ? getCardImageUrl(selectedCard) : catalogueImageUrl;
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
        ...evidenceRequirements
          .filter((slot) => uploadResult.bySlot[slot.key])
          .map((slot) => ({
            role: 'seller' as const,
            slot: slot.key,
            label: slot.label,
            url: uploadResult.bySlot[slot.key]!,
            required: !slot.optional && slot.requiredFor.includes(evidenceTier),
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
      const goldPending = usesProtectionTier && requiresGoldReview;
      const reviewRequired = identityPendingReview || goldPending || protectionTierIsDowngraded || Boolean(valueWarning);
      const adminReasons = [
        identityPendingReview ? 'Card identity pending Stackr review' : null,
        goldPending ? 'Gold verification pending confirmation' : null,
        protectionTierIsDowngraded ? `Seller selected ${formatProtectionTier(protectionTier)} below Stackr recommendation ${formatProtectionTier(recommendedProtectionTier)}` : null,
        valueWarning ? valueWarning : null,
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
          listingMode !== 'trade'
            ? `Delivery: ${shippingMethod} · ${dispatchTime} · ${deliveryPostageLabel}${selectedDeliveryMethod.source === 'shippo_preview' ? ' · Shippo rate preview' : ''}.`
            : null,
          selectedProduct ? 'Catalogue media attached as reference imagery. Seller photos show the actual item.' : null,
          resolvedListingSubjectType === 'graded_slab' ? `Certification number: ${certificationNumber || 'seller-confirmed, not provided'}. Slab case condition: ${slabCaseCondition}.` : null,
          isSealedLikeCategory(resolvedListingSubjectType) ? `Sealed status: ${sealedStatus}. Packaging condition: ${packagingCondition}.` : null,
          usesProtectionTier ? `Protection selected: ${formatProtectionTier(protectionTier)}. Stackr recommendation: ${formatProtectionTier(recommendedProtectionTier)}.` : null,
          silverAgreementRequired
            ? `Silver agreement required: ${silverAgreementDisclosure}`
            : null,
          protectionTierIsDowngraded
            ? 'Protection disclosure: selected protection is lower than Stackr recommendation for this value.'
            : null,
          usesProtectionTier && (protectionTier === 'silver' || protectionTier === 'gold')
            ? `Seller condition: ${declaredCondition}. Stackr AI estimate: ${ximilarEstimate?.condition ?? 'pending'}.`
            : null,
          usesProtectionTier && protectionTier === 'gold'
            ? `Verification ID: ${verificationId}. Status: verification pending.`
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

      await AsyncStorage.removeItem(DRAFT_KEY);
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
      return <PrimaryFooter label="Continue to value" onPress={() => {
        if (listingSubjectType === 'graded_slab') setSellerCondition(slabConditionLabel);
        setStep('value');
      }} disabled={missing.length > 0} missing={missing} />;
    }

    if (step === 'value') {
      const missing: MissingRequirement[] = valueEntered ? [] : [{ key: 'value', label: 'Add the listing or trade value to continue' }];
      return (
        <PrimaryFooter
          label={usesProtectionTier ? 'Reveal protection level' : 'Continue to slab photos'}
          onPress={() => setStep(usesProtectionTier ? 'protection' : 'evidence')}
          disabled={missing.length > 0}
          missing={missing}
        />
      );
    }

    if (step === 'protection') {
      const label = requiresGoldReview
        ? verificationRequirements.requiresAGSLabel ? 'Start Gold verification' : 'Start verification review'
        : protectionTier === 'silver' && verificationRequirements.requiresXimilar
          ? 'Begin condition check'
          : 'Capture listing photos';
      return <PrimaryFooter label={label} onPress={() => setStep('evidence')} />;
    }

    if (step === 'evidence') {
      const requiredDone = requiredEvidence.every((slot) => evidencePhotos[slot.key]);
      const nextLabel = verificationRequirements.requiresXimilar
        ? protectionTier === 'silver'
          ? 'Begin AI condition check'
          : 'Continue to AI condition check'
        : requiresGoldReview
          ? 'Continue to verification review'
          : 'Continue to listing details';
      return (
        <PrimaryFooter
          label={requiredDone ? nextLabel : currentEvidence ? `Capture ${currentEvidence.label.toLowerCase()}` : 'Capture evidence'}
          onPress={() => {
            if (requiredDone) {
              setStep(verificationRequirements.requiresXimilar ? 'ai' : requiresGoldReview ? 'gold' : 'details');
            } else if (currentEvidence) {
              void capturePhoto(currentEvidence.key, true);
            }
          }}
          secondaryLabel={currentEvidence && !requiredDone ? 'Upload' : undefined}
          onSecondaryPress={currentEvidence && !requiredDone ? () => void capturePhoto(currentEvidence.key, false) : undefined}
        />
      );
    }

    if (step === 'ai') {
      if (ximilarStatus === 'complete') {
        return <PrimaryFooter label={requiresGoldReview ? 'Prepare Gold verification' : 'Accept estimate'} onPress={() => setStep(requiresGoldReview ? 'gold' : 'details')} />;
      }
      return (
        <PrimaryFooter
          label={ximilarStatus === 'failed' ? 'Try condition check again' : 'Start AI condition check'}
          onPress={runXimilarAnalysis}
          loading={ximilarStatus === 'processing'}
          secondaryLabel={ximilarStatus === 'failed' ? 'Save and continue later' : undefined}
          onSecondaryPress={ximilarStatus === 'failed' ? saveExitDraft : undefined}
        />
      );
    }

    if (step === 'gold') {
      const missing: MissingRequirement[] = goldReady ? [] : [{
        key: 'gold',
        label: verificationRequirements.requiresAGSLabel
          ? 'Create the verification record and confirm packaging steps'
          : 'Create the verification review record',
      }];
      return <PrimaryFooter label="Continue to listing details" onPress={() => setStep('details')} disabled={missing.length > 0} missing={missing} />;
    }

    if (step === 'details') {
      const missing: MissingRequirement[] = detailsComplete ? [] : [{ key: 'details', label: 'Complete quantity, delivery and dispatch details' }];
      return <PrimaryFooter label="Review listing" onPress={() => setStep('review')} disabled={missing.length > 0} missing={missing} />;
    }

    if (step === 'review') {
      const label = !usesProtectionTier
        ? 'Publish listing'
        : requiresGoldReview
        ? 'Publish as verification pending'
        : protectionTier === 'silver'
          ? 'Publish Silver listing'
          : 'Publish listing';
      return <PrimaryFooter label={label} onPress={() => void publishListing()} disabled={missingPublicationRequirements.length > 0} loading={publishing || uploading} missing={missingPublicationRequirements} />;
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
                ? 'Let us identify your card and build a trusted listing.'
                : canUseProductCatalogue(listingSubjectType)
                  ? 'Find the exact product so Stackr can attach approved catalogue imagery.'
                  : 'Add the item details and Stackr will flag it for catalogue review where needed.'}
          </Text>
        </View>
      </View>

      {listingSubjectType === 'graded_slab' ? (
        <>
          <CardIdentificationTile
            title="Select card name"
            body="Search a Pokémon name, choose the exact printed card, and Stackr will fill the set."
            source={categoryIcon}
            primary
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
            body="Use your camera to identify the card."
            source={stackrIcons.scanCard}
            primary
            onPress={() => selectIdentificationMethod('scan')}
          />
          <CardIdentificationTile
            title="Search for card"
            body="Search by Pokemon name, set, card number, rarity or expansion."
            source={stackrIcons.searchCard}
            onPress={() => selectIdentificationMethod('search')}
          />
          <CardIdentificationTile
            title="Choose from my collection"
            body="List an existing owned card without identifying it again."
            source={stackrIcons.binders}
            onPress={() => selectIdentificationMethod('collection')}
          />
          <CardIdentificationTile
            title="Card not found"
            body="Create a temporary card record for Stackr review."
            icon="create-outline"
            onPress={() => selectIdentificationMethod('manual')}
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
              <StackrTextInput
                value={searchQuery}
                onChangeText={handleSearchChange}
                placeholder={`Search ${categoryConfig.title.toLowerCase()}, set or product line`}
                autoCapitalize="words"
              />
              {searching ? <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 8 }} /> : null}
              {productResults.map((product) => {
                const isSetFallback = product.source === 'set_catalog';
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
                  {product.image_url ? (
                    <Image source={{ uri: product.image_url }} style={styles.productResultImage} resizeMode="contain" />
                  ) : (
                    <View style={[styles.productResultImage, { backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }]}>
                      <Ionicons name={isSetFallback ? 'albums-outline' : 'image-outline'} size={24} color={theme.colors.textSoft} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 15, lineHeight: 19, fontWeight: '900' }} numberOfLines={2}>{product.name}</Text>
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
                <InlineRequirementMessage message="Catalogue images added. Seller photos of your actual item are still required." />
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
      return (
        <View style={styles.stepContent}>
          <Text style={[styles.stepTitle, { color: theme.colors.text }]}>Scan card</Text>
          <Text style={[styles.stepBody, { color: theme.colors.textSoft }]}>Place the full card inside the frame. If recognition is uncertain, choose a match manually.</Text>
          <View style={[styles.scanGuide, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            {scanReferencePhoto ? (
              <Image source={{ uri: scanReferencePhoto.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <>
                <View style={[styles.scanCardFrame, { borderColor: theme.colors.primary }]}>
                  <View style={[styles.scanCorner, styles.scanCornerTopLeft, { borderColor: theme.colors.primary }]} />
                  <View style={[styles.scanCorner, styles.scanCornerTopRight, { borderColor: theme.colors.primary }]} />
                  <View style={[styles.scanCorner, styles.scanCornerBottomLeft, { borderColor: theme.colors.primary }]} />
                  <View style={[styles.scanCorner, styles.scanCornerBottomRight, { borderColor: theme.colors.primary }]} />
                </View>
                <Text style={[styles.scanGuideText, { color: theme.colors.textSoft }]}>Place the full card inside the frame.</Text>
              </>
            )}
          </View>
          <View style={styles.dualActions}>
            <TouchableOpacity onPress={() => void capturePhoto('scan_reference', true)} style={[styles.secondaryAction, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
              <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '900' }}>{scanReferencePhoto ? 'Retake' : 'Capture'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push({ pathname: '/scan', params: { mode: 'market' } } as any)} style={[styles.primaryAction, { backgroundColor: theme.colors.primary }]}>
              <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '900' }}>Open scanner</Text>
            </TouchableOpacity>
          </View>
          <InlineRequirementMessage
            message="Card recognition for listing uses the main Stackr scanner. If the scan is uncertain, continue with Search for card or Card not found here."
          />
          <CardIdentificationTile
            title="Search for card instead"
            body="Select the card from the Stackr database and continue without leaving the listing flow."
            source={stackrIcons.searchCard}
            onPress={() => setIdentificationMethod('search')}
          />
          <CardIdentificationTile
            title="Card not found"
            body="Continue with a pending identity review."
            icon="create-outline"
            onPress={() => setStep('manual')}
          />
        </View>
      );
    }

    const list = identificationMethod === 'collection' ? ownedCards : searchResults;
    return (
      <View style={styles.stepContent}>
        <Text style={[styles.stepTitle, { color: theme.colors.text }]}>{identificationMethod === 'collection' ? 'Choose from my collection' : 'Search for card'}</Text>
        <Text style={[styles.stepBody, { color: theme.colors.textSoft }]}>Tap a result to use it in this listing. You will confirm the exact version before continuing.</Text>

        {identificationMethod !== 'collection' ? (
          <>
            <StackrTextInput
              value={searchQuery}
              onChangeText={handleSearchChange}
              placeholder="Search Pokemon, set, number or rarity"
              autoCapitalize="words"
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
        ) : null}

        {searching || collectionLoading ? <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 8 }} /> : null}
        {identificationMethod === 'collection' && !collectionLoading && !ownedCards.length ? (
          <InlineRequirementMessage message="No owned cards were found for this account. You can search manually or create a temporary card record." tone="warning" />
        ) : null}
        {list.map((card) => (
          <TouchableOpacity
            key={card.id}
            onPress={() => void selectCard(card)}
            activeOpacity={0.82}
            style={[styles.searchResult, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
          >
            {card.image_small ? (
              <Image source={{ uri: card.image_small }} style={styles.resultImage} resizeMode="contain" />
            ) : (
              <View style={[styles.resultImage, { backgroundColor: theme.colors.surface }]} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontSize: 15, lineHeight: 19, fontWeight: '900' }} numberOfLines={1}>{card.name}</Text>
              <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 16, marginTop: 3 }} numberOfLines={2}>
                {[card.set_name, card.number ? `#${card.number}` : null, card.rarity].filter(Boolean).join(' · ')}
              </Text>
            </View>
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
        language={selectedCard?.language ?? 'English'}
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
              {card.image_small ? (
                <Image source={{ uri: card.image_small }} style={styles.resultImage} resizeMode="contain" />
              ) : (
                <View style={[styles.resultImage, { backgroundColor: theme.colors.card }]} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.text, fontSize: 15, lineHeight: 19, fontWeight: '900' }} numberOfLines={1}>{card.name}</Text>
                <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 16, marginTop: 3 }} numberOfLines={2}>
                  {[card.set_name, card.number ? `#${card.number}` : null, card.rarity].filter(Boolean).join(' · ')}
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
        <FieldLabel label="Listing type" />
        <View style={styles.productGrid}>
          {PRODUCT_TYPES.map((type) => {
            const active = manualIdentity.state === type || listingSubjectType === type;
            const icon = listingCategoryIcons[type];
            return (
              <TouchableOpacity
                key={type}
                onPress={() => {
                  setListingSubjectType(type);
                  setManualIdentity((current) => ({ ...current, state: type }));
                  if (type === 'graded_slab') setSellerCondition(getSlabConditionLabel(displayGradingCompany, grade));
                  if (type === 'raw_card') setSellerCondition('');
                }}
                style={[styles.productTypeTile, { backgroundColor: active ? theme.colors.primary + '10' : theme.colors.surface, borderColor: active ? theme.colors.primary : theme.colors.border }]}
              >
                {icon ? (
                  <StackrCardActionIcon
                    source={icon}
                    frameSize={stackrSellCategoryIconSizes.manualTileFrame}
                    artworkSize={stackrSellCategoryIconSizes.manualTileArtwork}
                  />
                ) : (
                  <Ionicons name="cube-outline" size={24} color={theme.colors.primary} />
                )}
              <Text style={{ color: theme.colors.text, fontSize: 10, lineHeight: 13, fontWeight: '900', textAlign: 'center' }}>{PRODUCT_TYPE_LABELS[type] ?? type}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
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
        trustLabel={!usesProtectionTier ? 'Grade' : undefined}
        trustValue={!usesProtectionTier ? slabConditionLabel : undefined}
        value={activeTransactionValue}
      />
      {listingSubjectType === 'graded_slab' ? (
        <>
          <View style={[styles.sectionCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <Text style={{ color: theme.colors.text, fontSize: 15, lineHeight: 19, fontWeight: '900' }}>Slab label</Text>
            <ReviewRow label="Grader" value={displayGradingCompany} />
            <ReviewRow label="Grade" value={grade} />
            <ReviewRow label="Certification" value={certificationNumber || 'Seller-confirmed'} />
          </View>
          <View style={[styles.sectionCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <FieldLabel label="Certification number" required />
            <StackrTextInput value={certificationNumber} onChangeText={setCertificationNumber} placeholder="As printed on the slab label" autoCapitalize="characters" />
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
          : 'Stackr uses the highest relevant value to assign the protection tier automatically.'}
      </Text>
      <View style={styles.modeGrid}>
        <ToggleCard active={listingMode === 'sell'} title="Sell" body="Set an asking price and optional offers." icon="pricetag-outline" onPress={() => setListingMode('sell')} />
        <ToggleCard active={listingMode === 'trade'} title="Trade" body="Set a trade value and what you want." icon="swap-horizontal-outline" onPress={() => setListingMode('trade')} />
        <ToggleCard active={listingMode === 'both'} title="Open to either" body="Accept buy interest or trade proposals." icon="git-compare-outline" onPress={() => setListingMode('both')} />
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
          <FieldLabel label="Asking price" required />
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
        <InlineRequirementMessage message="Market value unavailable. Stackr will use your entered transaction value and may review the listing." tone="warning" />
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
                icon={PROTECTION_TIER_ICONS[tier]}
                onPress={() => selectProtectionTier(tier)}
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
      <InlineRequirementMessage message="Protection level based on the card and transaction value." />
    </View>
  );

  const renderEvidence = () => {
    const captured = currentEvidence ? evidencePhotos[currentEvidence.key] : null;
    return (
      <View style={styles.stepContent}>
        <Text style={[styles.stepTitle, { color: theme.colors.text }]}>
          {evidenceTier === 'bronze'
            ? isSealedLikeCategory(listingSubjectType) ? 'Add product photos' : listingSubjectType === 'graded_slab' ? 'Add slab photos' : 'Add clear card photos'
            : 'Capture evidence'}
        </Text>
        <Text style={[styles.stepBody, { color: theme.colors.textSoft }]}>
          {isSealedLikeCategory(listingSubjectType)
            ? 'Photograph the exact sealed item. Front and back are required; seal, wrap and crimp close-ups are optional but recommended.'
            : listingSubjectType === 'graded_slab'
              ? 'Photograph the exact slab, including the label and holder condition. The grader label remains the card grade.'
              : 'Photograph the exact card the buyer will receive. Silver and Gold use guided evidence for condition review.'}
        </Text>
        <EvidenceChecklist
          requirements={evidenceRequirements}
          captured={capturedEvidenceKeys}
          activeKey={currentEvidence?.key}
          onSelect={(key) => {
            const index = evidenceRequirements.findIndex((item) => item.key === key);
            if (index >= 0) setActiveEvidenceIndex(index);
          }}
        />
        {currentEvidence ? (
          <View style={[styles.captureCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <Text style={{ color: theme.colors.text, fontSize: 17, lineHeight: 22, fontWeight: '900' }}>{currentEvidence.label}</Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 17, marginTop: 4 }}>{currentEvidence.instruction}</Text>
            <View style={[styles.capturePreview, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              {captured ? (
                <Image source={{ uri: captured.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              ) : (
                <View style={styles.capturePlaceholder}>
                  <Ionicons name="camera-outline" size={34} color={theme.colors.primary} />
                  <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '800', marginTop: 8 }}>
                    {isSealedLikeCategory(listingSubjectType)
                      ? 'Product visible, sharp and evenly lit.'
                      : listingSubjectType === 'graded_slab'
                        ? 'Slab visible, sharp and evenly lit.'
                        : 'Full card visible, sharp and evenly lit.'}
                  </Text>
                </View>
              )}
            </View>
            <ImageQualityIndicator
              checks={[
                { label: 'Full card visible', ok: Boolean(captured?.quality.fullCardVisible) },
                { label: 'Not excessively blurred', ok: Boolean(captured?.quality.steady) },
                { label: 'Sufficient lighting', ok: Boolean(captured?.quality.lighting) },
                { label: 'Appears to contain one card', ok: Boolean(captured?.quality.singleCard) },
              ]}
            />
            <View style={styles.dualActions}>
              <TouchableOpacity onPress={() => void capturePhoto(currentEvidence.key, true)} style={[styles.primaryAction, { backgroundColor: theme.colors.primary }]}>
                <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '900' }}>{captured ? 'Retake' : 'Capture'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => void capturePhoto(currentEvidence.key, false)} style={[styles.secondaryAction, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
                <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '900' }}>Upload</Text>
              </TouchableOpacity>
            </View>
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

  const renderGold = () => {
    if (!verificationRequirements.requiresAGSLabel) {
      const checklist = [
        { label: 'Product confirmed', complete: identityConfirmed },
        { label: 'Seller photos complete', complete: requiredEvidence.every((slot) => evidencePhotos[slot.key]) },
        { label: listingSubjectType === 'graded_slab' ? 'Certification seller-confirmed' : 'Packaging evidence complete', complete: conditionSelected },
        { label: 'Verification review ID created', complete: Boolean(verificationId), current: !verificationId },
      ];
      return (
        <View style={styles.stepContent}>
          <Text style={[styles.stepTitle, { color: theme.colors.text }]}>Prepare verification review</Text>
          <Text style={[styles.stepBody, { color: theme.colors.textSoft }]}>
            {listingSubjectType === 'graded_slab'
              ? 'High-value slabs are sent to Stackr review with seller photos and certification evidence. They are not described as verified until review is complete.'
              : 'High-value sealed products use seller photos, sealed status and packaging notes. Seal close-ups stay optional unless Stackr separately requests a review.'}
          </Text>
          <VerificationStatusTimeline items={checklist} />
          {!verificationId ? (
            <TouchableOpacity onPress={() => setVerificationId(createVerificationId())} style={[styles.primaryActionFull, { backgroundColor: theme.colors.primary }]}>
              <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '900' }}>Create review record</Text>
            </TouchableOpacity>
          ) : (
            <InlineRequirementMessage message={`Verification review ID: ${verificationId}. Listing can be created as pending verification.`} />
          )}
        </View>
      );
    }

    const checklist = [
      { label: 'Card confirmed', complete: identityConfirmed },
      { label: 'Listing photos complete', complete: requiredEvidence.every((slot) => evidencePhotos[slot.key]) },
      { label: 'Ximilar condition estimate complete', complete: ximilarStatus === 'complete' },
      { label: 'Seller details confirmed', complete: detailsComplete || Boolean(quantity) },
      { label: 'Verification ID created', complete: Boolean(verificationId), current: !verificationId },
      { label: 'Label printed or saved', complete: printerState === 'printed', current: Boolean(verificationId) && printerState !== 'printed' },
      { label: 'Packaging confirmed', complete: packagingConfirmed.length === PACKAGING_ITEMS.length, current: printerState === 'printed' && packagingConfirmed.length < PACKAGING_ITEMS.length },
    ];
    return (
      <View style={styles.stepContent}>
        <Text style={[styles.stepTitle, { color: theme.colors.text }]}>Prepare for AGS verification</Text>
        <Text style={[styles.stepBody, { color: theme.colors.textSoft }]}>Gold Verified status is applied only after AGS confirmation is complete.</Text>
        <VerificationStatusTimeline items={checklist} />
        {!verificationId ? (
          <TouchableOpacity onPress={() => setVerificationId(createVerificationId())} style={[styles.primaryActionFull, { backgroundColor: theme.colors.primary }]}>
            <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '900' }}>Create verification record</Text>
          </TouchableOpacity>
        ) : (
          <>
            <LabelPreview verificationId={verificationId} cardName={cardTitle || manualIdentity.cardName} setName={selectedCard?.set_name ?? manualIdentity.setName} number={selectedCard?.number ?? manualIdentity.cardNumber} />
            <PrinterSelector state={printerState} onStateChange={setPrinterState} />
            <View style={[styles.sectionCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
              <Text style={{ color: theme.colors.text, fontSize: 15, lineHeight: 20, fontWeight: '900', marginBottom: 8 }}>Packaging checklist</Text>
              {PACKAGING_ITEMS.map((item) => (
                <PressableChecklistItem key={item} label={item} checked={packagingConfirmed.includes(item)} onPress={() => togglePackaging(item)} />
              ))}
              <FieldLabel label="Tracking reference" />
              <StackrTextInput value={trackingReference} onChangeText={setTrackingReference} placeholder="Optional until sent" autoCapitalize="characters" />
            </View>
            <InlineRequirementMessage message="Gold verification pending listings must not be described as AGS Verified until confirmation is returned." tone="warning" />
          </>
        )}
      </View>
    );
  };

  const renderDetails = () => (
    <View style={styles.stepContent}>
      <Text style={[styles.stepTitle, { color: theme.colors.text }]}>Listing details</Text>
      <Text style={[styles.stepBody, { color: theme.colors.textSoft }]}>Stackr pre-fills what it already knows. Add the practical details buyers need.</Text>
      <View style={[styles.sectionCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <FieldLabel label="Quantity" required />
        <StackrTextInput value={quantity} onChangeText={setQuantity} placeholder="1" keyboardType="numeric" />
        {listingMode !== 'trade' ? (
          <>
            <FieldLabel label="Delivery method" required />
            <TouchableOpacity
              onPress={() => setDeliveryPickerVisible(true)}
              activeOpacity={0.84}
              accessibilityRole="button"
              accessibilityLabel="Choose delivery method"
              style={[styles.deliverySelectCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
            >
              <View style={[styles.deliveryCarrierMark, { backgroundColor: theme.colors.primary + '12', borderColor: theme.colors.primary + '25' }]}>
                <Text style={{ color: theme.colors.primary, fontSize: 13, fontWeight: '900' }}>
                  {selectedDeliveryMethod.carrier.slice(0, 2).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.deliveryTitleRow}>
                  <Text style={{ color: theme.colors.text, fontSize: 15, lineHeight: 19, fontWeight: '900' }} numberOfLines={1}>
                    {selectedDeliveryMethod.displayName}
                  </Text>
                  {selectedDeliveryMethod.recommended ? (
                    <View style={[styles.deliveryBadge, { backgroundColor: theme.colors.primary + '14', borderColor: theme.colors.primary + '30' }]}>
                      <Text style={{ color: theme.colors.primary, fontSize: 10, fontWeight: '900' }}>Recommended</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 17, marginTop: 3 }} numberOfLines={2}>
                  {selectedDeliveryMethod.eta} · {selectedDeliveryMethod.tracked ? 'Tracked' : 'Manual'} · {deliveryPostageLabel}
                </Text>
                <Text style={{ color: theme.colors.textSoft, fontSize: 11, lineHeight: 15, marginTop: 4 }} numberOfLines={2}>
                  {selectedDeliveryMethod.protectionHint}
                </Text>
              </View>
              <Ionicons name="chevron-down" size={20} color={theme.colors.primary} />
            </TouchableOpacity>
            <InlineRequirementMessage
              message="Shippo-ready delivery options are shown as preview rates. Live Shippo rates and label purchase need a backend Shippo endpoint."
            />
          </>
        ) : null}
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

  const renderReview = () => (
    <View style={styles.stepContent}>
      <Text style={[styles.stepTitle, { color: theme.colors.text }]}>Review your listing</Text>
      <Text style={[styles.stepBody, { color: theme.colors.textSoft }]}>This preview shows the key information a buyer or trader will see.</Text>
      <MarketplaceListingPreview
        imageUrl={cardImageUrl ?? evidencePhotos.front?.uri}
        title={cardTitle || manualIdentity.cardName}
        subtitle={cardSubtitle}
        condition={declaredCondition}
        tier={usesProtectionTier ? protectionTier : undefined}
        trustLabel={!usesProtectionTier ? 'Grade' : undefined}
        trustValue={!usesProtectionTier ? slabConditionLabel : undefined}
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
        <ReviewRow label="Reference image" value={catalogueImageUrl ? 'Catalogue image attached' : 'Catalogue image unavailable'} />
        <ReviewRow label="Actual-item proof" value="Seller photos required separately" />
      </ListingReviewSection>
      <ListingReviewSection title="Seller photos" onEdit={() => setStep('evidence')}>
        <ReviewRow label="Photos" value={`${capturedEvidenceKeys.length} attached`} />
        <ReviewRow label="Required" value={`${requiredEvidence.length} required`} />
      </ListingReviewSection>
      <ListingReviewSection title="Condition, grade or sealed status" onEdit={() => setStep('condition')}>
        <ReviewRow label={listingSubjectType === 'graded_slab' ? 'Grader grade' : isSealedLikeCategory(listingSubjectType) ? 'Sealed status' : 'Seller condition'} value={declaredCondition} />
        {listingSubjectType === 'graded_slab' ? <ReviewRow label="Certification" value={certificationNumber || 'Seller-confirmed'} /> : null}
        {ximilarEstimate?.condition ? <ReviewRow label="Stackr AI estimate" value={ximilarEstimate.condition} /> : null}
      </ListingReviewSection>
      <ListingReviewSection title="Price and trade" onEdit={() => setStep('value')}>
        <ReviewRow label="Mode" value={listingMode === 'both' ? 'Sell or trade' : listingMode === 'sell' ? 'Sell' : 'Trade'} />
        {listingMode !== 'trade' ? <ReviewRow label="Asking price" value={formatCurrency(listingValueNumber)} /> : null}
        {listingMode !== 'sell' ? <ReviewRow label="Trade value" value={formatCurrency(tradeValueNumber)} /> : null}
        {wantedCards.trim() ? <ReviewRow label="Wanted" value={wantedCards.trim()} /> : null}
      </ListingReviewSection>
      <ListingReviewSection title="Delivery" onEdit={() => setStep('details')}>
        <ReviewRow label="Shipping" value={listingMode === 'trade' ? 'Agreed during trade' : shippingMethod} />
        <ReviewRow label="Postage" value={listingMode === 'trade' ? 'Agreed during trade' : deliveryPostageLabel} />
        <ReviewRow label="Dispatch" value={listingMode === 'trade' ? 'Agreed during trade' : dispatchTime} />
        {listingMode !== 'trade' ? (
          <ReviewRow label="Rate source" value={selectedDeliveryMethod.source === 'shippo_preview' ? 'Shippo preview' : 'Manual'} />
        ) : null}
      </ListingReviewSection>
      {usesProtectionTier ? (
        <ListingReviewSection title="Protection" onEdit={() => setStep('protection')}>
          <ReviewRow label="Assigned tier" value={formatProtectionTier(protectionTier)} />
          <ReviewRow label="Stackr recommendation" value={formatProtectionTier(recommendedProtectionTier)} />
          <ReviewRow label="Value used" value={formatCurrency(tierDecision.calculationValue)} />
          {silverAgreementRequired ? <ReviewRow label="Buyer agreement" value="Required for Silver" /> : null}
          {requiresGoldReview ? <ReviewRow label="Verification status" value="Gold verification pending" /> : null}
        </ListingReviewSection>
      ) : (
        <ListingReviewSection title="Professional grade" onEdit={() => setStep('condition')}>
          <ReviewRow label="Grading company" value={displayGradingCompany} />
          <ReviewRow label="Grade" value={grade} />
          <ReviewRow label="Certification" value={certificationNumber || 'Seller-confirmed'} />
          <ReviewRow label="Case condition" value={slabCaseCondition} />
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
        {requiresGoldReview ? (
          <PressableChecklistItem
            checked={goldDeclarationAccepted}
            onPress={() => setGoldDeclarationAccepted((value) => !value)}
            label="I understand that Gold Verified status is applied only after AGS verification is completed."
          />
        ) : null}
      </ListingReviewSection>
    </View>
  );

  const renderSuccess = () => (
    <View style={[styles.successContent, { backgroundColor: theme.colors.bg }]}>
      <View style={[styles.successShield, { backgroundColor: theme.colors.primary + '12', borderColor: theme.colors.primary + '35' }]}>
        <Ionicons name="shield-checkmark-outline" size={52} color={theme.colors.primary} />
      </View>
      <StackrPageTitle
        title={usesProtectionTier && requiresGoldReview ? 'Gold verification created' : usesProtectionTier && protectionTier === 'silver' ? 'Silver listing published' : 'Listing published'}
        accentText={requiresGoldReview ? 'created' : 'published'}
        style={{ textAlign: 'center' }}
      />
      <Text style={[styles.successBody, { color: theme.colors.textSoft }]}>
        {usesProtectionTier && requiresGoldReview
          ? 'Print the label and send the card to AGS to continue verification.'
          : usesProtectionTier && protectionTier === 'silver'
            ? verificationRequirements.requiresXimilar
              ? 'Your condition evidence and AI estimate are now attached.'
              : 'Your listing evidence is attached and ready for buyers to review.'
            : 'Your listing evidence is attached and ready for buyers to review.'}
      </Text>
      <TouchableOpacity onPress={() => router.replace('/(tabs)/market' as any)} style={[styles.primaryActionFull, { backgroundColor: theme.colors.primary }]}>
        <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '900' }}>Return to The Market</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => {
          setStep('category');
          setSelectedCard(null);
          setManualIdentity(DEFAULT_MANUAL_IDENTITY);
          setEvidencePhotos({});
          setSellerDeclarationAccepted(false);
          setAiDeclarationAccepted(false);
          setGoldDeclarationAccepted(false);
        }}
        style={[styles.secondaryActionFull, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
      >
        <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: '900' }}>Create another listing</Text>
      </TouchableOpacity>
    </View>
  );

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
    if (step === 'gold') return renderGold();
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

  if (step === 'success') {
    return (
      <StackrScreen variant="form">
        {renderSuccess()}
      </StackrScreen>
    );
  }

  return (
    <StackrScreen variant="form" contentStyle={{ paddingHorizontal: 0 }}>
      <ListingFlowHeader
        stages={progressStages}
        activeStage={flowStepToStage(step)}
        completedStages={completedStages}
        onBack={goBack}
        onStagePress={goToStage}
        stageLabels={progressLabels}
        rightAccessory={headerRight}
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingBottom: keyboardVisible || step === 'category' || step === 'entry' || step === 'identify'
                ? 34
                : 132,
            },
          ]}
        >
          {renderStep()}
        </ScrollView>
        {isFocused && !keyboardVisible ? footer() : null}
      </KeyboardAvoidingView>

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

      <Modal visible={deliveryPickerVisible} transparent animationType="slide" onRequestClose={() => setDeliveryPickerVisible(false)}>
        <View style={styles.modalRoot}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setDeliveryPickerVisible(false)} />
          <View style={[styles.modalSheet, { backgroundColor: theme.colors.bg, paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.text, fontSize: 18, lineHeight: 23, fontWeight: '900' }}>Choose delivery</Text>
                <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 17, marginTop: 2 }}>
                  Shippo-ready methods. Rates are preview values until live Shippo labels are connected.
                </Text>
              </View>
              <TouchableOpacity onPress={() => setDeliveryPickerVisible(false)} style={styles.modalClose}>
                <Ionicons name="close" size={20} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 9, paddingBottom: 8 }}>
              {SHIPPO_DELIVERY_METHODS.map((method) => {
                const selected = method.id === deliveryMethodId;
                const postageLabel = method.priceGbp <= 0 ? 'No postage' : formatCurrency(method.priceGbp);
                return (
                  <TouchableOpacity
                    key={method.id}
                    onPress={() => selectDeliveryMethod(method)}
                    activeOpacity={0.84}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={[
                      styles.deliveryOptionRow,
                      {
                        backgroundColor: selected ? theme.colors.primary + '10' : theme.colors.card,
                        borderColor: selected ? theme.colors.primary : theme.colors.border,
                      },
                    ]}
                  >
                    <View style={[styles.deliveryCarrierMark, { backgroundColor: selected ? theme.colors.primary : theme.colors.surface, borderColor: selected ? theme.colors.primary : theme.colors.border }]}>
                      <Text style={{ color: selected ? '#FFFFFF' : theme.colors.primary, fontSize: 13, fontWeight: '900' }}>
                        {method.carrier.slice(0, 2).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={styles.deliveryTitleRow}>
                        <Text style={{ color: theme.colors.text, fontSize: 14, lineHeight: 18, fontWeight: '900' }} numberOfLines={1}>
                          {method.displayName}
                        </Text>
                        {method.recommended ? (
                          <View style={[styles.deliveryBadge, { backgroundColor: theme.colors.primary + '14', borderColor: theme.colors.primary + '30' }]}>
                            <Text style={{ color: theme.colors.primary, fontSize: 10, fontWeight: '900' }}>Best fit</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 16, marginTop: 3 }}>
                        {method.service} · {method.eta} · {method.tracked ? 'Tracked' : 'Manual'}
                      </Text>
                      <Text style={{ color: theme.colors.textSoft, fontSize: 11, lineHeight: 15, marginTop: 4 }} numberOfLines={2}>
                        {method.protectionHint}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '900' }}>{postageLabel}</Text>
                      <Ionicons
                        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                        size={20}
                        color={selected ? theme.colors.primary : theme.colors.textSoft}
                      />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
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
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
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
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
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
  productTypeTile: {
    width: '31%',
    minHeight: 86,
    borderRadius: 16,
    borderWidth: 1,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
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
  deliverySelectCard: {
    minHeight: 92,
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  deliveryOptionRow: {
    minHeight: 92,
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  deliveryCarrierMark: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deliveryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  deliveryBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
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
  captureCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 14,
    gap: 12,
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
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  successShield: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successBody: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
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
