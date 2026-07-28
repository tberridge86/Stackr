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
  rarityCode?: string | null;
  variantCode?: string | null;
  finishCode?: string | null;
  artworkKey?: string | null;
  imageUrl?: string | null;
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

export function normaliseLanguageCode(value: unknown): string {
  const raw = String(value ?? 'en').trim();
  const lower = raw.toLowerCase().replace('_', '-');
  if (['jp', 'jpn', 'ja-jp', 'japanese'].includes(lower)) return 'ja';
  if (['zh', 'zh-cn', 'zh-hans', 'zh-simplified', 'simplified-chinese'].includes(lower)) return 'zh-Hans';
  if (['zh-tw', 'zh-hant', 'zh-traditional', 'traditional-chinese', 'zhtw'].includes(lower)) return 'zh-Hant';
  if (['ko', 'kor', 'ko-kr', 'korean'].includes(lower)) return 'ko';
  return 'en';
}

export function normaliseVariantCode(value: unknown): string {
  const raw = String(value ?? 'normal').trim().toLowerCase();
  const compact = raw.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const aliases: Record<string, string> = {
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
  gameCode: string;
  languageCode: string;
  setId: string;
  collectorNumber: string;
  variantCode: string;
}) {
  return [
    input.gameCode,
    input.languageCode,
    input.setId,
    input.collectorNumber,
    input.variantCode,
  ].join(':').toLowerCase();
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
