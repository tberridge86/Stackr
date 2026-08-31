import {
  cleanText,
  collectorNumberParts,
  normaliseLanguageCode,
  type FetchScope,
  type LicenceStatus,
  type NormalisedRecord,
  type ProviderRecord,
  type SourceAdapter,
  type SourceHealth,
  type SourceIdentity,
  type ValidationIssue,
  validateProviderRecord,
} from './sourceAdapter';
import { resolvePokeDataJapaneseSetCode } from '../../lib/pokedataJapaneseSetIdentity';

const DEFAULT_BASE_URL = 'https://www.pokedata.io';
const POKEDATA_JAPANESE_LANGUAGE = 'ja';
const POKEDATA_CARD_IMAGE_HOST = 'pokemoncardimages.pokedata.io';
const POKEDATA_PLACEHOLDER_PATH = '/images/placeholder.webp';
const DEFAULT_SET_LIMIT = 10;
const MAX_SET_LIMIT = 50;
const DEFAULT_REQUEST_DELAY_MS = 750;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_REQUEST_ATTEMPTS = 4;
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type SleepLike = (milliseconds: number) => Promise<void>;

type PokeDataJapaneseImageAdapterOptions = {
  language?: string | null;
  baseUrl?: string | null;
  licenceStatus?: LicenceStatus;
  assetLicenceStatus?: LicenceStatus;
  fetchImpl?: FetchLike | null;
  sleepImpl?: SleepLike | null;
  requestDelayMs?: number;
  requestTimeoutMs?: number;
  requestAttempts?: number;
};

type PokeDataSet = Record<string, unknown> & {
  id: unknown;
  code: unknown;
  name: unknown;
  language: unknown;
  tcg: unknown;
};

type PokeDataFinish = {
  variantCode: string;
  finishCode: string;
  baseName: string | null;
  evidence: string;
};

export type PokeDataJapaneseSetDescriptor = Readonly<{
  providerSetId: string;
  setCode: string | null;
  setName: string;
}>;

type RequestResult = {
  url: string;
  value: unknown;
  metadata: Record<string, unknown>;
};

const FINISH_PATTERNS: Array<{
  variantCode: string;
  finishCode: string;
  evidence: string;
  suffix: RegExp;
}> = [
  {
    variantCode: 'energy_symbol_holo',
    finishCode: 'energy_symbol_holo',
    evidence: 'energy_symbol_pattern_holofoil_suffix',
    suffix: /\s+energy symbol pattern holofoil$/iu,
  },
  {
    variantCode: 'poke_ball',
    finishCode: 'poke_ball',
    evidence: 'poke_ball_pattern_holofoil_suffix',
    suffix: /\s+pok[eé]\s*ball pattern holofoil$/iu,
  },
  {
    variantCode: 'master_ball',
    finishCode: 'master_ball',
    evidence: 'master_ball_pattern_holofoil_suffix',
    suffix: /\s+master ball pattern holofoil$/iu,
  },
  {
    variantCode: 'master_ball',
    finishCode: 'master_ball',
    evidence: 'master_ball_holo_suffix',
    suffix: /\s+master ball holo$/iu,
  },
  ...(['quick', 'love', 'dusk', 'friend'] as const).map((ball) => ({
    variantCode: `${ball}_ball`,
    finishCode: `${ball}_ball`,
    evidence: `${ball}_ball_pattern_holofoil_suffix`,
    suffix: new RegExp(`\\s+${ball} ball pattern holofoil$`, 'iu'),
  })),
  {
    variantCode: 'speckled_holo',
    finishCode: 'speckled_holo',
    evidence: 'speckled_holofoil_suffix',
    suffix: /\s+(?:speckled|star pattern|stars?)\s+holofoil$/iu,
  },
  {
    variantCode: 'line_holo',
    finishCode: 'line_holo',
    evidence: 'line_holofoil_suffix',
    suffix: /\s+(?:line|prism|cracked ice)\s+holofoil$/iu,
  },
  {
    variantCode: 'stamped',
    finishCode: 'stamped',
    evidence: 'stamped_suffix',
    suffix: /\s+(?:stamped|stamp|logo stamp)(?:\s+holofoil)?$/iu,
  },
  {
    variantCode: 'reverse_holo',
    finishCode: 'reverse_holo',
    evidence: 'reverse_holofoil_suffix',
    suffix: /\s+reverse(?:\s+holo(?:foil)?)?$/iu,
  },
  {
    variantCode: 'holo',
    finishCode: 'holo',
    evidence: 'holofoil_suffix',
    suffix: /\s+holofoil$/iu,
  },
  {
    variantCode: 'holo',
    finishCode: 'holo',
    evidence: 'holo_suffix',
    suffix: /\s+holo$/iu,
  },
  {
    variantCode: 'normal',
    finishCode: 'normal',
    evidence: 'non_holo_suffix',
    suffix: /\s+non[-\s]?holo$/iu,
  },
];

function sleep(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function assertJapaneseLanguage(value: unknown, context = 'language') {
  const language = normaliseLanguageCode(value ?? POKEDATA_JAPANESE_LANGUAGE);
  if (language !== POKEDATA_JAPANESE_LANGUAGE) {
    throw new Error(`PokeData Japanese image ingestion only supports ja ${context}; received ${language}.`);
  }
  return language;
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number, label: string) {
  const parsed = value == null ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}.`);
  }
  return parsed;
}

function scopeWindow(scope: FetchScope) {
  return {
    offset: boundedInteger(scope.cursor?.offset, 0, 0, Number.MAX_SAFE_INTEGER, 'PokeData set offset'),
    limit: boundedInteger(scope.limit, DEFAULT_SET_LIMIT, 1, MAX_SET_LIMIT, 'PokeData set limit'),
  };
}

function numericProviderId(value: unknown) {
  const id = cleanText(value);
  return id && /^[1-9][0-9]*$/u.test(id) ? id : null;
}

function exactJapaneseLabel(value: unknown) {
  return cleanText(value)?.toUpperCase() === 'JAPANESE';
}

function setSort(left: PokeDataSet, right: PokeDataSet) {
  const leftId = numericProviderId(left.id) ?? '';
  const rightId = numericProviderId(right.id) ?? '';
  return leftId.localeCompare(rightId, 'en', { numeric: true })
    || (cleanText(left.code) ?? '').localeCompare(cleanText(right.code) ?? '');
}

function normalisedGroupPart(value: unknown) {
  return String(value ?? '').normalize('NFKC').trim().toLowerCase();
}

function retryDelayMs(response: Response | null, attempt: number) {
  const retryAfter = response?.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(Math.max(seconds * 1000, 250), 30_000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.min(Math.max(date - Date.now(), 250), 30_000);
  }
  return Math.min(500 * (2 ** (attempt - 1)), 10_000);
}

function validatedPokeDataImageUrl(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  if (url.hostname !== POKEDATA_CARD_IMAGE_HOST) return null;
  if (!url.pathname.startsWith('/images/')) return null;
  if (!/\.(?:avif|jpe?g|png|webp)$/iu.test(url.pathname)) return null;
  if (url.pathname.toLowerCase() === POKEDATA_PLACEHOLDER_PATH) return null;
  return url.href;
}

function parsePokeDataFinish(value: unknown): PokeDataFinish | null {
  const name = cleanText(value);
  if (!name) return null;
  const declaresPatternFinish = /\s+[^\s]+(?:\s+[^\s]+)*\s+pattern holofoil$/iu.test(name);
  const recognisedPatternFinish = FINISH_PATTERNS
    .filter((pattern) => pattern.evidence.includes('pattern') || pattern.evidence === 'speckled_holofoil_suffix')
    .some((pattern) => pattern.suffix.test(name));
  if (declaresPatternFinish && !recognisedPatternFinish) return null;
  for (const pattern of FINISH_PATTERNS) {
    if (!pattern.suffix.test(name)) continue;
    const baseName = cleanText(name.replace(pattern.suffix, ''));
    if (!baseName) return null;
    return {
      variantCode: pattern.variantCode,
      finishCode: pattern.finishCode,
      baseName,
      evidence: pattern.evidence,
    };
  }
  if (/\b(?:pattern|reverse|holofoil|non[-\s]?holo|stamp(?:ed)?)\b/iu.test(name)) return null;
  return {
    variantCode: 'normal',
    finishCode: 'normal',
    baseName: name,
    evidence: 'no_finish_suffix',
  };
}

function imageOnlyError() {
  return new Error('PokeData Japanese is an image-only source. Run it with --assetsOnly --allowImageAssets.');
}

export class PokeDataJapaneseImageSourceAdapter implements SourceAdapter {
  readonly language = POKEDATA_JAPANESE_LANGUAGE;
  readonly baseUrl: string;
  readonly licenceStatus: LicenceStatus;
  readonly assetLicenceStatus: LicenceStatus;
  readonly fetchImpl: FetchLike | null;
  readonly sleepImpl: SleepLike;
  readonly requestDelayMs: number;
  readonly requestTimeoutMs: number;
  readonly requestAttempts: number;
  private setCache: Promise<PokeDataSet[]> | null = null;

  constructor(options: PokeDataJapaneseImageAdapterOptions = {}) {
    assertJapaneseLanguage(options.language);
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/u, '');
    this.licenceStatus = options.licenceStatus ?? 'approved';
    this.assetLicenceStatus = options.assetLicenceStatus ?? 'approved';
    this.fetchImpl = options.fetchImpl ?? null;
    this.sleepImpl = options.sleepImpl ?? sleep;
    this.requestDelayMs = boundedInteger(
      options.requestDelayMs,
      DEFAULT_REQUEST_DELAY_MS,
      0,
      30_000,
      'PokeData request delay',
    );
    this.requestTimeoutMs = boundedInteger(
      options.requestTimeoutMs,
      DEFAULT_REQUEST_TIMEOUT_MS,
      1_000,
      120_000,
      'PokeData request timeout',
    );
    this.requestAttempts = boundedInteger(
      options.requestAttempts,
      DEFAULT_REQUEST_ATTEMPTS,
      1,
      6,
      'PokeData request attempts',
    );
  }

  identifySource(): SourceIdentity {
    return {
      code: 'pokedata_japanese',
      displayName: 'PokeData Japanese card images',
      sourceType: 'image',
      baseUrl: this.baseUrl,
      termsUrl: `${this.baseUrl}/api-terms`,
      licenceStatus: this.licenceStatus,
      attributionRequired: true,
      robotsPolicy: 'approved bounded per-set API image refresh only',
      rateLimitConfig: {
        endpoint: '/api/cards?set_id=<immutable>&set_name=<exact>&tcg=Pokemon&stats=kwan',
        defaultSetLimit: DEFAULT_SET_LIMIT,
        maximumSetLimit: MAX_SET_LIMIT,
        sequentialSetRequests: true,
        delayMs: this.requestDelayMs,
        attempts: this.requestAttempts,
      },
      capabilities: ['assets', 'conditional_requests'],
      automatedRefreshAllowed: true,
    };
  }

  private fetcher() {
    const implementation = this.fetchImpl ?? globalThis.fetch;
    if (!implementation) throw new Error('No fetch implementation is available for PokeData Japanese images.');
    return implementation;
  }

  private endpoint(path: string, query?: URLSearchParams) {
    const base = new URL(this.baseUrl);
    const url = new URL(path, `${this.baseUrl}/`);
    if (url.origin !== base.origin) throw new Error(`Refusing non-PokeData API endpoint: ${url.href}`);
    if (query) url.search = query.toString();
    if (url.pathname === '/api/cards'
      && (!numericProviderId(url.searchParams.get('set_id')) || !cleanText(url.searchParams.get('set_name')))) {
      throw new Error('Refusing unbounded PokeData /api/cards request without an immutable set_id and exact set_name.');
    }
    return url.href;
  }

  private async requestJson(path: string, query?: URLSearchParams): Promise<RequestResult> {
    const url = this.endpoint(path, query);
    let response: Response | null = null;
    let lastError: unknown = null;
    const startedAt = Date.now();
    let attempts = 0;
    for (let attempt = 1; attempt <= this.requestAttempts; attempt += 1) {
      attempts = attempt;
      try {
        response = await this.fetcher()(url, {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'Stackr-Catalogue-Ingestion/1.0 (+https://stackrtcg.com)',
          },
          signal: AbortSignal.timeout(this.requestTimeoutMs),
        });
        if (!RETRYABLE_STATUSES.has(response.status) || attempt === this.requestAttempts) break;
        await response.body?.cancel().catch(() => undefined);
        await this.sleepImpl(retryDelayMs(response, attempt));
      } catch (error) {
        lastError = error;
        response = null;
        if (attempt === this.requestAttempts) throw error;
        await this.sleepImpl(retryDelayMs(null, attempt));
      }
    }
    if (!response) throw lastError ?? new Error(`PokeData request failed before receiving ${url}.`);
    const text = await response.text();
    const metadata = {
      status: response.status,
      responseTimeMs: Date.now() - startedAt,
      endpoint: url,
      attempts,
      etag: response.headers.get('etag'),
      lastModified: response.headers.get('last-modified'),
      retryAfter: response.headers.get('retry-after'),
      contentType: response.headers.get('content-type'),
    };
    if (!response.ok) {
      const error = new Error(`PokeData request failed (${response.status}) for ${url}: ${text.slice(0, 240)}`);
      Object.assign(error, { responseStatus: response.status, metadata });
      throw error;
    }
    let value: unknown;
    try {
      value = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(`PokeData returned invalid JSON for ${url}.`);
    }
    return { url, value, metadata };
  }

  private async japaneseSets() {
    this.setCache ??= this.requestJson('/api/sets').then((result) => {
      if (!Array.isArray(result.value)) throw new Error('PokeData /api/sets response must be an array.');
      return (result.value as PokeDataSet[])
        .filter((set) => cleanText(set.tcg)?.toLowerCase() === 'pokemon')
        .filter((set) => exactJapaneseLabel(set.language))
        .filter((set) => Boolean(numericProviderId(set.id) && cleanText(set.name)))
        .sort(setSort);
    });
    return this.setCache;
  }

  async fetchExactSetIndex(): Promise<readonly PokeDataJapaneseSetDescriptor[]> {
    const sets = await this.japaneseSets();
    return Object.freeze(sets.flatMap((set) => {
      const providerSetId = numericProviderId(set.id);
      const setCode = cleanText(set.code);
      const setName = cleanText(set.name);
      if (!providerSetId || !setName) return [];
      resolvePokeDataJapaneseSetCode(providerSetId, setCode);
      return [Object.freeze({ providerSetId, setCode, setName })];
    }));
  }

  async healthCheck(): Promise<SourceHealth> {
    const startedAt = Date.now();
    try {
      const sets = await this.japaneseSets();
      return {
        status: sets.length > 0 ? 'ok' : 'degraded',
        responseStatus: 200,
        responseTimeMs: Date.now() - startedAt,
        message: sets.length > 0 ? undefined : 'PokeData returned no Japanese Pokémon sets.',
        capabilities: { assets: sets.length > 0, conditional_requests: true },
        httpMetadata: { japaneseSetCount: sets.length },
      };
    } catch (error) {
      const responseStatus = Number((error as { responseStatus?: number }).responseStatus ?? 0) || null;
      return {
        status: responseStatus === 401 || responseStatus === 403 ? 'forbidden' : 'unavailable',
        responseStatus,
        responseTimeMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : String(error),
        capabilities: { assets: false, conditional_requests: false },
        httpMetadata: (error as { metadata?: Record<string, unknown> }).metadata ?? {},
      };
    }
  }

  async fetchSets(): Promise<ProviderRecord[]> {
    throw imageOnlyError();
  }

  async fetchCards(): Promise<ProviderRecord[]> {
    throw imageOnlyError();
  }

  async fetchVariants(): Promise<ProviderRecord[]> {
    throw imageOnlyError();
  }

  async fetchAssets(scope: FetchScope = {}) {
    assertJapaneseLanguage(scope.language, 'fetch scope');
    const { offset, limit } = scopeWindow(scope);
    const requestedSet = cleanText(scope.setId);
    const allSets = await this.japaneseSets();
    const setCodeGroups = new Map<string, string[]>();
    for (const set of allSets) {
      const providerSetId = numericProviderId(set.id);
      const setCode = providerSetId
        ? resolvePokeDataJapaneseSetCode(providerSetId, set.code).effectiveCode
        : null;
      if (!providerSetId || !setCode) continue;
      const key = normalisedGroupPart(setCode);
      const ids = setCodeGroups.get(key);
      if (ids) ids.push(providerSetId);
      else setCodeGroups.set(key, [providerSetId]);
    }
    const matchingSets = requestedSet
      ? allSets.filter((set) => {
        const providerSetId = numericProviderId(set.id);
        const effectiveSetCode = providerSetId
          ? resolvePokeDataJapaneseSetCode(providerSetId, set.code).effectiveCode
          : null;
        return [providerSetId, cleanText(set.code), effectiveSetCode, cleanText(set.name)].includes(requestedSet);
      })
      : allSets;
    const selectedSets = matchingSets.slice(offset, offset + limit);
    const records: ProviderRecord[] = [];

    for (const [index, set] of selectedSets.entries()) {
      const providerSetId = numericProviderId(set.id);
      const reportedSetCode = cleanText(set.code);
      const setCodeResolution = providerSetId
        ? resolvePokeDataJapaneseSetCode(providerSetId, reportedSetCode)
        : null;
      const setCode = setCodeResolution?.effectiveCode ?? null;
      const setName = cleanText(set.name);
      if (!providerSetId || !setCodeResolution || !setCode || !setName) continue;
      const duplicateSetCodeIds = setCodeGroups.get(normalisedGroupPart(setCode)) ?? [];
      if (index > 0 && this.requestDelayMs > 0) await this.sleepImpl(this.requestDelayMs);
      const query = new URLSearchParams({
        set_id: providerSetId,
        set_name: setName,
        tcg: 'Pokemon',
        stats: 'kwan',
      });
      const result = await this.requestJson('/api/cards', query);
      if (!Array.isArray(result.value)) {
        throw new Error(`PokeData card response for set ${providerSetId} must be an array.`);
      }
      const candidates = (result.value as Array<Record<string, unknown>>).flatMap((card) => {
        const providerCardId = numericProviderId(card.id);
        const collectorNumber = cleanText(card.num);
        const imageUrl = validatedPokeDataImageUrl(card.img_url);
        const finish = parsePokeDataFinish(card.name);
        if (!providerCardId || !collectorNumber || !imageUrl || !finish) return [];
        if (!exactJapaneseLabel(card.language)) return [];
        if (cleanText(card.tcg)?.toLowerCase() !== 'pokemon') return [];
        if (numericProviderId(card.set_id) !== providerSetId) return [];
        if (cleanText(card.set_name) !== setName) return [];
        return [{ card, providerCardId, collectorNumber, imageUrl, finish }];
      });
      const grouped = new Map<string, typeof candidates>();
      for (const candidate of candidates) {
        const groupKey = [setCode, candidate.collectorNumber, candidate.finish.variantCode]
          .map(normalisedGroupPart)
          .join(':');
        const group = grouped.get(groupKey);
        if (group) group.push(candidate);
        else grouped.set(groupKey, [candidate]);
      }
      for (const group of grouped.values()) {
        const ambiguousProviderCardIds = group.map((candidate) => candidate.providerCardId);
        for (const candidate of group) {
          if (scope.providerRecordId) {
            const requested = cleanText(scope.providerRecordId);
            if (requested !== candidate.providerCardId
              && requested !== `card:${candidate.providerCardId}:${candidate.finish.variantCode}:image`) continue;
          }
          records.push({
            provider: 'pokedata_japanese',
            providerRecordId: `card:${candidate.providerCardId}:${candidate.finish.variantCode}:image`,
            recordType: 'asset',
            languageCode: POKEDATA_JAPANESE_LANGUAGE,
            sourceUrl: result.url,
            sourceEndpoint: result.url,
            providerUpdatedAt: cleanText(candidate.card.updated_at),
            licenceStatus: this.assetLicenceStatus,
            attributionText: 'PokeData',
            httpMetadata: {
              ...result.metadata,
              providerSetId,
              providerSetCode: setCode,
              providerReportedSetCode: reportedSetCode,
              setCodeResolution: setCodeResolution.identityPolicy,
              providerSetName: setName,
            },
            payload: {
              provider: 'pokedata_japanese',
              id: candidate.providerCardId,
              pokedata_card_id: candidate.providerCardId,
              set_id: providerSetId,
              set_code: setCode,
              set_name: setName,
              num: candidate.collectorNumber,
              name: cleanText(candidate.card.name),
              base_name: candidate.finish.baseName,
              language: 'JAPANESE',
              image_url: candidate.imageUrl,
              image_language_code: POKEDATA_JAPANESE_LANGUAGE,
              asset_type: 'card_image',
              variant: candidate.finish.variantCode,
              finish: candidate.finish.finishCode,
              finish_evidence: candidate.finish.evidence,
              source_set_numeric_id: providerSetId,
              source_set_code: setCode,
              source_set_reported_code: reportedSetCode,
              set_code_resolution: setCodeResolution.identityPolicy,
              source_collector_number: candidate.collectorNumber,
              ambiguous_set_code: duplicateSetCodeIds.length > 1,
              ambiguous_set_code_provider_ids: duplicateSetCodeIds.length > 1 ? duplicateSetCodeIds : [],
              ambiguous_identity_group: group.length > 1,
              ambiguous_provider_card_ids: group.length > 1 ? ambiguousProviderCardIds : [],
            },
          });
        }
      }
    }
    return records;
  }

  normaliseRecord(record: ProviderRecord): NormalisedRecord {
    const payload = record.payload;
    const collector = collectorNumberParts(payload.num);
    const providerCardId = numericProviderId(payload.pokedata_card_id ?? payload.id);
    const imageUrl = validatedPokeDataImageUrl(payload.image_url);
    return {
      provider: record.provider,
      providerRecordId: record.providerRecordId,
      recordType: record.recordType,
      gameCode: 'pokemon',
      languageCode: POKEDATA_JAPANESE_LANGUAGE,
      setCode: cleanText(payload.set_code),
      providerSetId: numericProviderId(payload.set_id),
      collectorNumber: collector.collectorNumber || null,
      collectorNumberPrefix: collector.collectorNumberPrefix,
      collectorNumberSort: collector.collectorNumberSort,
      collectorNumberSuffix: collector.collectorNumberSuffix,
      collectorNumberSortKey: collector.collectorNumberSortKey,
      nativeName: null,
      englishDisplayName: null,
      rarityCode: null,
      variantCode: cleanText(payload.variant),
      finishCode: cleanText(payload.finish),
      artworkKey: providerCardId ? `pokedata_japanese:${providerCardId}` : null,
      imageUrl,
      imageLanguageCode: imageUrl ? POKEDATA_JAPANESE_LANGUAGE : null,
      assetType: 'card_image',
      sourceConfidence: 0.95,
      sourceUpdatedAt: record.providerUpdatedAt,
      licenceStatus: record.licenceStatus,
      raw: payload,
    };
  }

  validateRecord(record: ProviderRecord) {
    const issues: ValidationIssue[] = [...validateProviderRecord(record).issues];
    const normalised = this.normaliseRecord(record);
    let resolvedSetIdentity: ReturnType<typeof resolvePokeDataJapaneseSetCode> | null = null;
    try {
      resolvedSetIdentity = resolvePokeDataJapaneseSetCode(
        normalised.providerSetId,
        record.payload.source_set_reported_code,
      );
    } catch (error) {
      issues.push({
        code: 'frozen_set_identity_drift',
        severity: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
    if (record.provider !== 'pokedata_japanese') {
      issues.push({ code: 'provider_mismatch', severity: 'error', message: 'PokeData Japanese records must retain the dedicated provider code.' });
    }
    if (record.recordType !== 'asset') {
      issues.push({ code: 'image_only_record_required', severity: 'error', message: 'PokeData Japanese ingestion accepts asset records only.' });
    }
    if (record.languageCode !== POKEDATA_JAPANESE_LANGUAGE || normalised.languageCode !== POKEDATA_JAPANESE_LANGUAGE) {
      issues.push({ code: 'japanese_language_required', severity: 'error', message: 'PokeData Japanese image records must remain language ja.' });
    }
    if (!numericProviderId(record.payload.pokedata_card_id ?? record.payload.id)) {
      issues.push({ code: 'immutable_card_id_missing', severity: 'error', message: 'PokeData immutable numeric card ID is required.' });
    }
    if (!normalised.setCode || !normalised.providerSetId || !normalised.collectorNumber) {
      issues.push({ code: 'exact_identity_missing', severity: 'error', message: 'Exact PokeData set code, numeric set ID, and collector number are required.' });
    }
    if (resolvedSetIdentity && (
      normalised.setCode !== resolvedSetIdentity.effectiveCode
      || cleanText(record.payload.source_set_code) !== resolvedSetIdentity.effectiveCode
      || cleanText(record.payload.source_set_numeric_id) !== resolvedSetIdentity.providerSetId
      || record.payload.set_code_resolution !== resolvedSetIdentity.identityPolicy
    )) {
      issues.push({
        code: 'set_identity_provenance_mismatch',
        severity: 'error',
        message: 'PokeData set code, immutable ID, or resolution policy does not match the frozen set identity evidence.',
      });
    }
    if (!normalised.variantCode || !normalised.finishCode) {
      issues.push({ code: 'finish_identity_missing', severity: 'error', message: 'A conservatively parsed variant and finish are required.' });
    }
    if (record.payload.ambiguous_identity_group === true) {
      issues.push({
        code: 'ambiguous_duplicate_group',
        severity: 'error',
        message: 'Multiple PokeData card IDs share this exact set, collector, and variant identity; every candidate is quarantined.',
      });
    }
    if (record.payload.ambiguous_set_code === true) {
      issues.push({
        code: 'ambiguous_set_code',
        severity: 'error',
        message: 'This PokeData Japanese set code belongs to multiple immutable set IDs; image attachment is quarantined.',
      });
    }
    if (!normalised.imageUrl) {
      issues.push({
        code: 'image_url_not_allowed',
        severity: 'error',
        message: `PokeData card images must use HTTPS on ${POKEDATA_CARD_IMAGE_HOST} and cannot be the placeholder.`,
      });
    }
    return { ok: issues.every((issue) => issue.severity !== 'error'), issues };
  }
}

export const pokedataJapaneseImageAdapterInternals = {
  DEFAULT_SET_LIMIT,
  MAX_SET_LIMIT,
  POKEDATA_CARD_IMAGE_HOST,
  POKEDATA_PLACEHOLDER_PATH,
  parsePokeDataFinish,
  scopeWindow,
  validatedPokeDataImageUrl,
};
