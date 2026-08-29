export type SourceKind = 'catalogue' | 'pricing' | 'image' | 'recognition' | 'manual' | 'internal';

export type LicenceStatus = 'approved' | 'under_review' | 'restricted' | 'denied' | 'unknown';

export type ProviderRecordType =
  | 'game'
  | 'language'
  | 'series'
  | 'set'
  | 'card'
  | 'printing'
  | 'variant'
  | 'rarity'
  | 'finish'
  | 'asset'
  | 'sealed_product'
  | 'price'
  | 'other';

export type ProviderCapability =
  | 'sets'
  | 'cards'
  | 'variants'
  | 'assets'
  | 'prices'
  | 'conditional_requests'
  | 'manual_import';

export type SourceIdentity = {
  code: string;
  displayName: string;
  sourceType: SourceKind;
  baseUrl?: string | null;
  termsUrl?: string | null;
  licenceStatus: LicenceStatus;
  attributionRequired: boolean;
  robotsPolicy?: string | null;
  rateLimitConfig?: Record<string, unknown>;
  capabilities: ProviderCapability[];
  automatedRefreshAllowed: boolean;
};

export type SourceHealth = {
  status: 'ok' | 'degraded' | 'unavailable' | 'forbidden' | 'failed' | 'unknown';
  message?: string;
  responseStatus?: number | null;
  responseTimeMs?: number | null;
  nextRetryAt?: string | null;
  capabilities?: Partial<Record<ProviderCapability, boolean>>;
  httpMetadata?: Record<string, unknown>;
};

export type FetchScope = {
  language?: string;
  setId?: string;
  providerRecordId?: string;
  cursor?: Record<string, unknown>;
  limit?: number;
  conditionalHeaders?: {
    etag?: string | null;
    lastModified?: string | null;
  };
};

export type ProviderRecord = {
  provider: string;
  providerRecordId: string;
  recordType: ProviderRecordType;
  languageCode?: string | null;
  sourceUrl?: string | null;
  sourceEndpoint?: string | null;
  providerUpdatedAt?: string | null;
  licenceStatus: LicenceStatus;
  attributionText?: string | null;
  httpMetadata?: Record<string, unknown>;
  payload: Record<string, unknown>;
};

export type ValidationIssue = {
  code: string;
  severity: 'warning' | 'error';
  message: string;
  path?: string;
};

export type ValidationResult = {
  ok: boolean;
  issues: ValidationIssue[];
};

export type NormalisedRecord = {
  provider: string;
  providerRecordId: string;
  recordType: ProviderRecordType;
  gameCode: string;
  languageCode: string;
  setCode?: string | null;
  providerSetId?: string | null;
  collectorNumber?: string | null;
  collectorNumberPrefix?: string | null;
  collectorNumberSort?: number | null;
  collectorNumberSuffix?: string | null;
  collectorNumberSortKey?: string | null;
  nativeName?: string | null;
  englishDisplayName?: string | null;
  printedTotal?: number | null;
  total?: number | null;
  rarityCode?: string | null;
  variantCode?: string | null;
  finishCode?: string | null;
  artworkKey?: string | null;
  imageUrl?: string | null;
  imageLanguageCode?: string | null;
  imageSha256?: string | null;
  imagePerceptualHash?: string | null;
  assetType?: 'card_image' | 'set_symbol' | 'set_logo' | 'series_logo' | 'sealed_product_image' | 'other';
  sourceConfidence: number;
  sourceUpdatedAt?: string | null;
  licenceStatus: LicenceStatus;
  raw: Record<string, unknown>;
};

export type SourceAdapter = {
  identifySource(): SourceIdentity;
  healthCheck(scope?: FetchScope): Promise<SourceHealth>;
  fetchSets(scope?: FetchScope): AsyncIterable<ProviderRecord> | Promise<ProviderRecord[]>;
  fetchCards(scope?: FetchScope): AsyncIterable<ProviderRecord> | Promise<ProviderRecord[]>;
  fetchVariants(scope?: FetchScope): AsyncIterable<ProviderRecord> | Promise<ProviderRecord[]>;
  fetchAssets(scope?: FetchScope): AsyncIterable<ProviderRecord> | Promise<ProviderRecord[]>;
  fetchPrices?(scope?: FetchScope): AsyncIterable<ProviderRecord> | Promise<ProviderRecord[]>;
  normaliseRecord(record: ProviderRecord): Promise<NormalisedRecord> | NormalisedRecord;
  validateRecord(record: ProviderRecord): Promise<ValidationResult> | ValidationResult;
};

export function cleanText(value: unknown): string | null {
  const cleaned = String(value ?? '').trim();
  return cleaned.length ? cleaned : null;
}

export const SUPPORTED_CATALOGUE_LANGUAGE_CODES = ['en', 'ja', 'zh-tw', 'zh-cn', 'ko'] as const;

export const PRIMARY_CATALOGUE_LANGUAGE_CODES = ['en', 'ja', 'zh-cn', 'ko'] as const;

export type SupportedCatalogueLanguageCode = typeof SUPPORTED_CATALOGUE_LANGUAGE_CODES[number];

export class UnsupportedCatalogueLanguageError extends Error {
  readonly code = 'unsupported_catalogue_language';
  readonly fatal = true;

  constructor(value: unknown, context = 'language') {
    const allowed = SUPPORTED_CATALOGUE_LANGUAGE_CODES.join(', ');
    super(`Unsupported catalogue ${context}: ${String(value ?? '') || '<missing>'}. Use one of: ${allowed}.`);
    this.name = 'UnsupportedCatalogueLanguageError';
  }
}

export function isSupportedCatalogueLanguageCode(value: string): value is SupportedCatalogueLanguageCode {
  return (SUPPORTED_CATALOGUE_LANGUAGE_CODES as readonly string[]).includes(value);
}

export function normaliseLanguageCode(value: unknown): string {
  const raw = value == null ? 'en' : String(value).trim();
  const lower = raw.toLowerCase().replace(/_/g, '-');
  if (isSupportedCatalogueLanguageCode(lower)) return lower;
  throw new UnsupportedCatalogueLanguageError(value);
}

export function normaliseVariantCode(value: unknown): string {
  const raw = String(value ?? 'normal').trim().toLowerCase();
  const compact = raw.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const aliases: Record<string, string> = {
    standard: 'normal',
    regular: 'normal',
    non_holo: 'normal',
    non_holofoil: 'normal',
    reverse: 'reverse_holo',
    reverse_holofoil: 'reverse_holo',
    reverse_holo: 'reverse_holo',
    holofoil: 'holo',
    holographic: 'holo',
    first_edition: 'first_edition',
    first: 'first_edition',
    unlimited: 'unlimited',
    pokeball: 'poke_ball',
    poke_ball: 'poke_ball',
    masterball: 'master_ball',
    master_ball: 'master_ball',
  };
  return aliases[compact] ?? (compact || 'normal');
}

export function normaliseFinishCode(value: unknown): string | null {
  const cleaned = normaliseVariantCode(value);
  if (/(^|_)stamp(?:_|$)/.test(cleaned)) return 'stamped';
  return cleaned === 'regional_other' ? null : cleaned;
}

export function normaliseName(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function collectorNumberParts(value: unknown) {
  const collectorNumber = String(value ?? '').trim();
  const match = collectorNumber.match(/^([^0-9]*)([0-9]+)(.*)$/u);
  if (!match) {
    return {
      collectorNumber,
      collectorNumberPrefix: null,
      collectorNumberSort: null,
      collectorNumberSuffix: collectorNumber || null,
      collectorNumberSortKey: collectorNumber.toLowerCase(),
    };
  }

  const [, prefix, numeric, suffix] = match;
  return {
    collectorNumber,
    collectorNumberPrefix: prefix || null,
    collectorNumberSort: Number.parseInt(numeric, 10),
    collectorNumberSuffix: suffix || null,
    collectorNumberSortKey: `${prefix || ''}${numeric.padStart(12, '0')}${suffix || ''}`.toLowerCase(),
  };
}

export function proposedCanonicalKey(input: {
  languageCode: string;
  setCode: string;
  collectorNumber: string;
  variantCode: string;
  finishCode: string;
}) {
  return [
    normaliseLanguageCode(input.languageCode),
    cleanText(input.setCode),
    cleanText(input.collectorNumber),
    normaliseVariantCode(input.variantCode),
    normaliseFinishCode(input.finishCode) ?? 'normal',
  ].map((part) => {
    if (!part) throw new Error('Canonical card identity requires language, set_code, collector_number, variant, and finish.');
    return part;
  }).join(':').toLowerCase();
}

export function validateProviderRecord(record: ProviderRecord): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!cleanText(record.provider)) {
    issues.push({ code: 'provider_required', severity: 'error', message: 'Provider code is required.' });
  }
  if (!cleanText(record.providerRecordId)) {
    issues.push({ code: 'provider_record_id_required', severity: 'error', message: 'Provider record ID is required.' });
  }
  if (!cleanText(record.recordType)) {
    issues.push({ code: 'record_type_required', severity: 'error', message: 'Record type is required.' });
  }
  if (record.languageCode != null) {
    try {
      normaliseLanguageCode(record.languageCode);
    } catch (error) {
      issues.push({
        code: 'unsupported_language',
        severity: 'error',
        message: error instanceof Error ? error.message : String(error),
        path: 'languageCode',
      });
    }
  }
  if (!record.payload || typeof record.payload !== 'object' || Array.isArray(record.payload)) {
    issues.push({ code: 'payload_object_required', severity: 'error', message: 'Raw payload must be an object.' });
  }
  if (record.licenceStatus !== 'approved') {
    issues.push({
      code: 'legal_use_not_approved',
      severity: record.licenceStatus === 'denied' || record.licenceStatus === 'restricted' ? 'error' : 'warning',
      message: `Licence status is ${record.licenceStatus}; automatic upsert is not allowed unless approved.`,
    });
  }
  return {
    ok: issues.every((issue) => issue.severity !== 'error'),
    issues,
  };
}
