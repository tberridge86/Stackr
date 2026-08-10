import AsyncStorage from '@react-native-async-storage/async-storage';
import { PRICE_API_URL, STACKR_API_URL } from './config';
import { supabase } from './supabase';

export type StackrApiLanguageCode = 'en' | 'ja' | 'zh-Hans' | 'zh-Hant' | 'ko';

export type StackrApiEnvelope<T> = {
  data: T;
  meta: {
    requestId: string;
    apiVersion: '1';
    generatedAt: string;
    pagination?: {
      limit: number;
      nextCursor: string | null;
    };
  };
};

export type StackrApiErrorEnvelope = {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
  meta: {
    apiVersion: '1';
    generatedAt: string;
  };
};

export type StackrCatalogueManifest = {
  currentCatalogueVersion: string;
  catalogueVersionId: string | null;
  minCompatibleAppSchemaVersion: string;
  latestChangeSequence: number;
  availableLanguageShards: Array<{
    languageCode: StackrApiLanguageCode;
    bcp47Code: string;
    nativeName: string;
    englishName: string;
    shardPath: string;
    deltaPath: string;
  }>;
  assetBaseUrl: string | null;
  modelIndexVersion: string | null;
  generatedAt: string;
  etag: string;
};

export type StackrLanguage = {
  code: StackrApiLanguageCode;
  bcp47Code: string;
  englishName: string;
  nativeName: string;
  scriptCode: string | null;
  sortOrder: number;
};

export type StackrSeries = {
  seriesId: string;
  game: string;
  languageCode: StackrApiLanguageCode;
  nativeName: string;
  englishDisplayName: string | null;
  seriesCode: string | null;
  releaseDate: string | null;
  endDate: string | null;
  displayOrder: number | null;
  updatedAt: string | null;
};

export type StackrSet = {
  setId: string;
  game: string;
  languageCode: StackrApiLanguageCode;
  language?: {
    englishName: string | null;
    nativeName: string | null;
  };
  seriesId: string | null;
  seriesNativeName: string | null;
  seriesEnglishDisplayName: string | null;
  setCode: string | null;
  nativeName: string | null;
  englishDisplayName: string | null;
  releaseDate: string | null;
  printedTotal: number | null;
  total: number | null;
  regionCode: string | null;
  updatedAt: string | null;
  sourceUpdatedAt: string | null;
};

export type StackrCardVariant = {
  variantId: string;
  canonicalId: string;
  variantCode: string;
  variantLabel: string | null;
  finishCode: string | null;
  finishLabel: string | null;
  artworkKey: string | null;
  updatedAt: string | null;
};

export type StackrCard = {
  cardId: string;
  game: string;
  languageCode: StackrApiLanguageCode;
  language?: {
    englishName: string | null;
    nativeName: string | null;
  };
  set: {
    setId: string;
    setCode: string | null;
    nativeName: string | null;
    englishDisplayName: string | null;
  };
  collectorNumber: {
    value: string;
    prefix: string | null;
    sort: number | null;
    suffix: string | null;
    sortKey: string | null;
  };
  names: {
    native: string;
    englishDisplay: string | null;
  };
  rarity: {
    code: string | null;
    label: string | null;
  };
  defaultVariantId: string;
  variants: StackrCardVariant[];
  updatedAt: string | null;
};

export type StackrCatalogueAsset = {
  assetId: string;
  assetType: string;
  game: string | null;
  setId: string | null;
  cardId: string | null;
  variantId: string | null;
  deliveryPath: string | null;
  deliveryUrl: string | null;
  sourceAttribution: string | null;
  permissionStatus: string;
  contentSha256: string | null;
  perceptualHash: string | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  byteSize: number | null;
  derivatives: Array<Record<string, unknown>>;
  cacheControl: string | null;
  externallyReferenced: boolean;
  unavailableReason: string | null;
  lastVerifiedAt: string | null;
  updatedAt: string | null;
};

export type StackrDeltaChange = {
  sequence: number;
  operation: 'insert' | 'update' | 'deprecation' | 'correct' | 'delete_marker';
  entityType: string;
  entityId: string | null;
  entityKey: string | null;
  changedAt: string;
  summary: Record<string, unknown>;
};

export type StackrSearchReason =
  | 'exact_canonical_id'
  | 'exact_external_id'
  | 'exact_set_code_collector_number'
  | 'exact_collector_number'
  | 'exact_collector_number_in_set'
  | 'exact_name_in_set'
  | 'exact_name'
  | 'exact_alias'
  | 'exact_translated_name'
  | 'fuzzy_name';

export type StackrSearchResult = {
  type: 'card' | 'set';
  reason: StackrSearchReason;
  cardId?: string;
  variantId?: string;
  canonicalId?: string;
  setId?: string;
  setCode?: string | null;
  collectorNumber?: string;
  nativeName?: string | null;
  englishDisplayName?: string | null;
  languageCode?: StackrApiLanguageCode;
  variantCode?: string;
  matchedName?: string | null;
  matchedNameType?: string | null;
  card?: StackrCard;
  set?: StackrSet;
};

export type StackrMarketProductType = 'raw_card' | 'graded_card' | 'sealed_product';
export type StackrMarketEvidenceStatus =
  | 'recent_sold_value'
  | 'thin_sold_value'
  | 'market_estimate'
  | 'asking_price_indication'
  | 'unavailable';

export type StackrCardPrice = {
  variantId: string;
  productType: StackrMarketProductType;
  identityKey: string | null;
  currency: string;
  status: StackrMarketEvidenceStatus;
  priceType: StackrMarketEvidenceStatus;
  estimates: {
    low: number | null;
    central: number | null;
    high: number | null;
  };
  sample: {
    total: number;
    sold: number;
    active: number;
    sources: number;
    dateRange: {
      from: string | null;
      to: string | null;
    };
  };
  confidence: {
    score: number;
    label: 'high' | 'medium' | 'low' | 'insufficient_evidence';
  };
  freshness: 'fresh' | 'stale' | 'expired' | 'unknown';
  sourceBreakdown: Array<Record<string, unknown>>;
  outliers: Record<string, unknown>;
  fallbackEstimate: {
    identityKey: string;
    reason: string;
    exact: false;
  } | null;
  unavailableReason: string | null;
  calculatedAt: string | null;
  staleAfter: string | null;
  estimateVersion: string;
};

export type StackrPriceHistoryObservation = {
  observationId: string;
  observationType: 'sold_observation' | 'active_listing';
  variantId: string | null;
  productType: StackrMarketProductType;
  providerCode: string;
  providerName: string;
  sourceItemId: string;
  observedPrice: number | null;
  shippingPrice: number | null;
  currency: string;
  saleOrListingType: string;
  conditionCode: string | null;
  graderCode: string | null;
  gradeLabel: string | null;
  observedAt: string | null;
  soldAt: string | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
  parsedMatchConfidence: number | null;
  duplicateGroupId: string | null;
};

export type StackrMarketMover = {
  variantId: string | null;
  sealedProductVariantId: string | null;
  productType: StackrMarketProductType;
  currency: string;
  currentEstimate: number | null;
  previousEstimate: number | null;
  percentageChange: number | null;
  confidence: {
    score: number;
    label: string;
  };
  calculatedAt: string | null;
  previousCalculatedAt: string | null;
};

export type StackrMarketOpportunity = {
  activeListingId: string;
  variantId: string | null;
  sealedProductVariantId: string | null;
  productType: StackrMarketProductType;
  providerCode: string;
  sourceItemId: string;
  sourceTitle: string;
  askingPrice: number | null;
  shippingPrice: number | null;
  currency: string;
  centralEstimate: number | null;
  lowEstimate: number | null;
  highEstimate: number | null;
  discountPercentage: number | null;
  sourceUrl: string | null;
  observedAt: string | null;
  estimateCalculatedAt: string | null;
  confidence: {
    score: number;
    label: string;
  };
  reason: 'active_listing_below_exact_variant_estimate';
};

export type StackrObservabilityStatus = 'healthy' | 'degraded' | 'critical' | 'unavailable';

export type StackrObservabilitySnapshot = {
  dashboardKey: string;
  status: StackrObservabilityStatus;
  summary: Record<string, unknown>;
  evidenceCount: number;
  limitations: string[];
  windowStart?: string | null;
  windowEnd?: string | null;
  sourceUpdatedAt?: string | null;
  generatedAt: string | null;
  expiresAt: string | null;
};

export type StackrQualityReleaseGate = {
  gate_key: string;
  target_operator: 'lte' | 'gte' | 'eq' | 'zero';
  target_value: number | null;
  actual_value: number | null;
  unit: string;
  status: 'pass' | 'fail' | 'insufficient_data' | 'not_applicable';
  evidence_count: number;
  reason: string;
};

export type StackrObservabilityDashboard = {
  generatedAt: string;
  dashboards: StackrObservabilitySnapshot[];
  latestQualityRun: Record<string, unknown> | null;
  releaseGates: StackrQualityReleaseGate[];
};

type FetchLike = typeof fetch;

export type StackrRecognitionLanguageCode = StackrApiLanguageCode | 'unknown';

export type StackrRecognitionScriptCode =
  | 'latin'
  | 'japanese'
  | 'korean'
  | 'chinese_simplified'
  | 'chinese_traditional'
  | 'unknown';

export type StackrCaptureQualityMetrics = {
  score: number | null;
  focusScore: number | null;
  glareScore: number | null;
  exposureScore: number | null;
  framingScore: number | null;
  stabilityScore: number | null;
  cardCoverage: number | null;
  failureReasons: string[];
};

export type StackrRecognitionClientContext = {
  appVersion?: string | null;
  platform?: 'ios' | 'android' | 'server' | 'unknown';
  deviceClass?: string | null;
  requestId?: string | null;
};

export type StackrRecognitionConsent = {
  retainImage?: boolean;
  useForTraining?: boolean;
  imageUploadConsent?: boolean;
  consentVersion?: string | null;
};

export type StackrRecognitionImageCorners = {
  topLeft: [number, number];
  topRight: [number, number];
  bottomRight: [number, number];
  bottomLeft: [number, number];
  coordinateSpace: 'normalized' | 'pixels';
};

export type StackrRecognitionIdentifyRequest = {
  modelVersion: string;
  embedding?: number[] | null;
  ocrText?: string | null;
  possibleCollectorNumber?: string | null;
  possibleSetCode?: string | null;
  possibleCardName?: string | null;
  detectedLanguage?: StackrRecognitionLanguageCode;
  detectedScript?: StackrRecognitionScriptCode;
  captureQuality: StackrCaptureQualityMetrics;
  privateImageKey?: string | null;
  imageMimeType?: string | null;
  corners?: StackrRecognitionImageCorners | null;
  consent?: StackrRecognitionConsent;
  client?: StackrRecognitionClientContext;
};

export type StackrRecognitionComponentScores = {
  image: number;
  ocr: number;
  setNumber: number;
  cardName: number;
  language: number;
  rarityVariant: number;
  perceptualHash: number;
};

export type StackrRecognitionCandidate = {
  rank: number;
  canonicalCardId: string | null;
  variantId: string | null;
  setId: string | null;
  setCode: string | null;
  collectorNumber: string | null;
  languageCode: string | null;
  variantCode: string | null;
  cardName: string | null;
  overallConfidence: number;
  imageScore: number;
  ocrScore: number;
  setAndNumberScore: number;
  componentScores: StackrRecognitionComponentScores;
  reasons: string[];
  uncertaintyFlags: string[];
};

export type StackrRecognitionIdentifyResponse = {
  scanId: string;
  matchStatus: 'exact' | 'probable' | 'ambiguous' | 'no_match' | 'rejected';
  topCandidates: StackrRecognitionCandidate[];
  canonicalCardId: string | null;
  variantId: string | null;
  overallConfidence: number;
  imageScore: number;
  ocrScore: number;
  setAndNumberScore: number;
  modelVersion: string;
  indexVersion: string | null;
  scoringConfigVersion: string;
  reasons: string[];
  uncertaintyFlags: string[];
  requestedNextAction:
    | 'auto_confirm_allowed'
    | 'confirm_candidate'
    | 'rescan'
    | 'upload_fallback_image'
    | 'manual_entry'
    | 'none';
  autoAddAllowed: boolean;
};

export type StackrRecognitionEmbedRequest = {
  modelVersion: string;
  privateImageKey: string;
  imageMimeType?: string | null;
  corners?: StackrRecognitionImageCorners | null;
  consent?: StackrRecognitionConsent;
  client?: StackrRecognitionClientContext;
};

export type StackrRecognitionEmbedResponse = {
  scanId: string;
  modelVersion: string;
  embedding: number[];
  embeddingDimensions: number;
  imageSha256: string;
  preprocessingVersion: string;
};

export type StackrRecognitionFeedbackRequest = {
  scanId: string;
  feedbackAction:
    | 'confirm_result'
    | 'choose_candidate'
    | 'manual_correction'
    | 'variant_correction'
    | 'missing_card'
    | 'bad_scan';
  selectedVariantId?: string | null;
  correctedVariantId?: string | null;
  notes?: string | null;
  consent?: StackrRecognitionConsent;
  client?: StackrRecognitionClientContext;
};

export type StackrRecognitionFeedbackResponse = {
  ok: boolean;
  scanId: string;
  feedbackStatus: 'recorded' | 'queued' | 'disabled';
};

export class StackrApiV1Error extends Error {
  status: number;
  code: string;
  requestId: string | null;
  details: unknown;

  constructor(status: number, envelope: StackrApiErrorEnvelope | null) {
    super(envelope?.error.message ?? `Stackr API request failed with status ${status}`);
    this.name = 'StackrApiV1Error';
    this.status = status;
    this.code = envelope?.error.code ?? 'request_failed';
    this.requestId = envelope?.error.requestId ?? null;
    this.details = envelope?.error.details;
  }
}

export type StackrApiV1ClientOptions = {
  baseUrl?: string;
  fetchImpl?: FetchLike;
  headers?: Record<string, string>;
  getAccessToken?: () => Promise<string | null>;
  getDeviceId?: () => Promise<string>;
  createIdempotencyKey?: () => string;
};

const STACKR_DEVICE_ID_STORAGE_KEY = 'stackr.gateway.device-id.v1';
let defaultDeviceIdPromise: Promise<string> | null = null;

function randomRequestKey(prefix: string) {
  const randomUuid = globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${randomUuid}`;
}

async function defaultAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function defaultDeviceId() {
  if (!defaultDeviceIdPromise) {
    defaultDeviceIdPromise = (async () => {
      const existing = await AsyncStorage.getItem(STACKR_DEVICE_ID_STORAGE_KEY);
      if (existing) return existing;
      const created = randomRequestKey('device');
      await AsyncStorage.setItem(STACKR_DEVICE_ID_STORAGE_KEY, created);
      return created;
    })();
  }
  try {
    return await defaultDeviceIdPromise;
  } catch (error) {
    defaultDeviceIdPromise = null;
    throw error;
  }
}

function buildUrl(baseUrl: string, path: string, query?: Record<string, string | number | boolean | null | undefined>) {
  const url = new URL(`${baseUrl.replace(/\/$/, '')}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === null || value === undefined || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function parseError(response: Response): Promise<StackrApiErrorEnvelope | null> {
  try {
    return await response.json() as StackrApiErrorEnvelope;
  } catch {
    return null;
  }
}

function valueContainsImagePayload(value: unknown): boolean {
  if (typeof value === 'string') {
    return /^data:image\//i.test(value) || value.length > 5000 && /^[A-Za-z0-9+/=\s]+$/.test(value);
  }
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(valueContainsImagePayload);
  return Object.entries(value).some(([key, nested]) => {
    const lowerKey = key.toLowerCase();
    return lowerKey.includes('base64') || lowerKey.includes('imagebytes') || valueContainsImagePayload(nested);
  });
}

function assertNoImagePayload(value: unknown) {
  if (valueContainsImagePayload(value)) {
    throw new Error('Stackr recognition requests must use embeddings or private image keys, not base64 image payloads.');
  }
}

export class StackrApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly headers: Record<string, string>;
  private readonly getAccessToken: () => Promise<string | null>;
  private readonly getDeviceId: () => Promise<string>;
  private readonly createIdempotencyKey: () => string;

  constructor(options: StackrApiV1ClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? `${STACKR_API_URL || PRICE_API_URL}/v1`;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.headers = {
      'X-Stackr-Api-Version': '1',
      ...(options.headers ?? {}),
    };
    this.getAccessToken = options.getAccessToken ?? defaultAccessToken;
    this.getDeviceId = options.getDeviceId ?? defaultDeviceId;
    this.createIdempotencyKey = options.createIdempotencyKey ?? (() => randomRequestKey('mutation'));
  }

  private async request<T>(
    path: string,
    query?: Record<string, string | number | boolean | null | undefined>,
    init: RequestInit = {},
  ): Promise<StackrApiEnvelope<T>> {
    const deviceId = await this.getDeviceId();
    const response = await this.fetchImpl(buildUrl(this.baseUrl, path, query), {
      ...init,
      headers: {
        ...this.headers,
        'X-Stackr-Device-Id': deviceId,
        ...(init.headers as Record<string, string> | undefined),
      },
    });

    if (response.status === 304) {
      throw new StackrApiV1Error(304, {
        error: {
          code: 'not_modified',
          message: 'Resource has not changed.',
          requestId: response.headers.get('X-Request-Id') ?? '',
        },
        meta: {
          apiVersion: '1',
          generatedAt: new Date().toISOString(),
        },
      });
    }

    if (!response.ok) {
      throw new StackrApiV1Error(response.status, await parseError(response));
    }

    return await response.json() as StackrApiEnvelope<T>;
  }

  private post<T>(path: string, body: Record<string, unknown>, init: RequestInit = {}) {
    return this.request<T>(path, undefined, {
      ...init,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers as Record<string, string> | undefined),
      },
      body: JSON.stringify(body),
    });
  }

  private async authenticatedPost<T>(path: string, body: Record<string, unknown>, init: RequestInit = {}) {
    const accessToken = await this.getAccessToken();
    if (!accessToken) {
      throw new StackrApiV1Error(401, {
        error: {
          code: 'authentication_required',
          message: 'Sign in is required for this Stackr API request.',
          requestId: '',
        },
        meta: {
          apiVersion: '1',
          generatedAt: new Date().toISOString(),
        },
      });
    }
    return this.post<T>(path, body, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Idempotency-Key': this.createIdempotencyKey(),
        ...(init.headers as Record<string, string> | undefined),
      },
    });
  }

  private async authenticatedGet<T>(
    path: string,
    query?: Record<string, string | number | boolean | null | undefined>,
  ) {
    const accessToken = await this.getAccessToken();
    if (!accessToken) {
      throw new StackrApiV1Error(401, {
        error: {
          code: 'authentication_required',
          message: 'Sign in is required for this Stackr API request.',
          requestId: '',
        },
        meta: { apiVersion: '1', generatedAt: new Date().toISOString() },
      });
    }
    return this.request<T>(path, query, { headers: { Authorization: `Bearer ${accessToken}` } });
  }

  private async authenticatedPatch<T>(path: string, body: Record<string, unknown>) {
    const accessToken = await this.getAccessToken();
    if (!accessToken) {
      throw new StackrApiV1Error(401, {
        error: {
          code: 'authentication_required',
          message: 'Sign in is required for this Stackr API request.',
          requestId: '',
        },
        meta: { apiVersion: '1', generatedAt: new Date().toISOString() },
      });
    }
    return this.request<T>(path, undefined, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': this.createIdempotencyKey(),
      },
      body: JSON.stringify(body),
    });
  }

  health() {
    return this.request<{ status: 'ok'; service: string; apiVersion: '1'; generatedAt: string }>('/health');
  }

  ready() {
    return this.request<{ status: string; checks: Record<string, unknown>; generatedAt: string }>('/ready');
  }

  catalogManifest(etag?: string) {
    return this.request<StackrCatalogueManifest>('/catalog/manifest', undefined, {
      headers: etag ? { 'If-None-Match': etag } : undefined,
    });
  }

  catalogDelta(query: { since?: number; cursor?: string | null; limit?: number } = {}) {
    return this.request<{ sinceChangeSequence: number; changes: StackrDeltaChange[] }>('/catalog/delta', query);
  }

  languages() {
    return this.request<{ languages: StackrLanguage[] }>('/languages');
  }

  series(query: { language?: StackrApiLanguageCode; game?: string; cursor?: string | null; limit?: number } = {}) {
    return this.request<{ series: StackrSeries[] }>('/series', query);
  }

  sets(query: {
    language?: StackrApiLanguageCode;
    game?: string;
    seriesId?: string;
    setCode?: string;
    region?: string;
    cursor?: string | null;
    limit?: number;
  } = {}) {
    return this.request<{ sets: StackrSet[] }>('/sets', query);
  }

  set(setId: string) {
    return this.request<{ set: StackrSet }>(`/sets/${encodeURIComponent(setId)}`);
  }

  setCards(setId: string, query: { language?: StackrApiLanguageCode; cursor?: string | null; limit?: number } = {}) {
    return this.request<{ cards: StackrCard[] }>(`/sets/${encodeURIComponent(setId)}/cards`, query);
  }

  card(cardId: string) {
    return this.request<{ card: StackrCard }>(`/cards/${encodeURIComponent(cardId)}`);
  }

  cardVariants(cardId: string) {
    return this.request<{ cardId: string; variants: StackrCardVariant[] }>(`/cards/${encodeURIComponent(cardId)}/variants`);
  }

  assetManifest(query: {
    assetType?: string;
    setId?: string;
    printingId?: string;
    variantId?: string;
    cursor?: string | null;
    limit?: number;
  } = {}) {
    return this.request<{ assets: StackrCatalogueAsset[] }>('/assets/manifest', query);
  }

  cardPrice(variantId: string, query: {
    productType?: StackrMarketProductType;
    currency?: string;
    condition?: string;
    grader?: string;
    grade?: string;
  } = {}) {
    return this.request<StackrCardPrice>(`/cards/${encodeURIComponent(variantId)}/price`, query);
  }

  cardPriceHistory(variantId: string, query: {
    productType?: StackrMarketProductType;
    currency?: string;
    condition?: string;
    grader?: string;
    grade?: string;
    observationType?: 'sold_observation' | 'active_listing';
    cursor?: string | null;
    limit?: number;
  } = {}) {
    return this.request<{ variantId: string; observations: StackrPriceHistoryObservation[] }>(
      `/cards/${encodeURIComponent(variantId)}/price-history`,
      query,
    );
  }

  marketMovers(query: { productType?: StackrMarketProductType; currency?: string; limit?: number } = {}) {
    return this.request<{ movers: StackrMarketMover[] }>('/market/movers', query);
  }

  marketOpportunities(query: { productType?: StackrMarketProductType; currency?: string; limit?: number } = {}) {
    return this.request<{ opportunities: StackrMarketOpportunity[] }>('/market/opportunities', query);
  }

  search(query: { q: string; language?: StackrApiLanguageCode; setId?: string; limit?: number }) {
    return this.request<{ query: string; normalizedQuery: string; results: StackrSearchResult[] }>('/search', query);
  }

  recognitionIdentify(payload: StackrRecognitionIdentifyRequest) {
    assertNoImagePayload(payload);
    return this.authenticatedPost<StackrRecognitionIdentifyResponse>('/recognition/identify', payload as Record<string, unknown>);
  }

  recognitionEmbed(payload: StackrRecognitionEmbedRequest) {
    assertNoImagePayload(payload);
    return this.authenticatedPost<StackrRecognitionEmbedResponse>('/recognition/embed', payload as Record<string, unknown>);
  }

  recognitionFeedback(payload: StackrRecognitionFeedbackRequest) {
    assertNoImagePayload(payload);
    return this.authenticatedPost<StackrRecognitionFeedbackResponse>('/recognition/feedback', payload as Record<string, unknown>);
  }

  submitRecognitionShadowComparison(record: Record<string, unknown>) {
    assertNoImagePayload(record);
    return this.authenticatedPost<{
      ok: true;
      itemId: string;
      disagreementCategory: string;
    }>('/recognition/shadow-comparisons', { record });
  }

  adminRecognitionShadowComparisons<T extends object = Record<string, unknown>>(query: {
    status?: 'pending_review' | 'reviewed' | 'ignored' | 'all';
    category?: string;
    limit?: number;
  } = {}) {
    return this.authenticatedGet<{
      ok: true;
      items: T[];
      summary: Record<string, unknown>;
    }>('/admin/recognition-shadow-comparisons', query);
  }

  reviewRecognitionShadowComparison(itemId: string, payload: {
    reviewStatus: 'pending_review' | 'reviewed' | 'ignored';
    disagreementCategory?: string;
    reviewerNotes?: string;
  }) {
    return this.authenticatedPatch<{ ok: true; item: Record<string, unknown> }>(
      `/admin/recognition-shadow-comparisons/${encodeURIComponent(itemId)}`,
      payload,
    );
  }

  adminObservabilityDashboard() {
    return this.authenticatedGet<StackrObservabilityDashboard>('/admin/observability/dashboard');
  }

  refreshAdminObservabilityDashboard(windowHours = 24) {
    return this.authenticatedPost<StackrObservabilityDashboard>('/admin/observability/refresh', { windowHours });
  }
}

export class StackrApiV1Client extends StackrApiClient {}

export const stackrApiClient = new StackrApiClient();
export const stackrApiV1 = stackrApiClient;
