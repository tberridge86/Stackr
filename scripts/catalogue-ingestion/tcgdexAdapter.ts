import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  cleanText,
  collectorNumberParts,
  normaliseLanguageCode,
  normaliseVariantCode,
  type FetchScope,
  type LicenceStatus,
  type NormalisedRecord,
  type ProviderRecord,
  type SourceAdapter,
  type SourceHealth,
  type SourceIdentity,
  validateProviderRecord,
} from './sourceAdapter';
import {
  canonicalTcgdexCardId,
  canonicalTcgdexSetId,
  sortTcgdexCardRows,
  sortTcgdexSetRows,
} from './tcgdexOrdering';

const DEFAULT_BASE_URL = 'https://api.tcgdex.net/v2';
const DEFAULT_DETAIL_CONCURRENCY = 8;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const MAX_REQUEST_ATTEMPTS = 3;

type TcgdexAdapterOptions = {
  language?: string;
  baseUrl?: string;
  snapshotRoot?: string;
  snapshotVersion?: string;
  licenceStatus?: LicenceStatus;
  assetLicenceStatus?: LicenceStatus;
};

const snapshotListCache = new Map<string, Promise<Record<string, unknown>[]>>();
const snapshotIndexCache = new Map<string, Promise<Map<string, Record<string, unknown>>>>();

async function snapshotList(root: string, language: string, kind: 'sets' | 'cards') {
  const key = `${root}:${language}:${kind}`;
  let pending = snapshotListCache.get(key);
  if (!pending) {
    pending = readFile(join(root, language, `${kind}.json`), 'utf8')
      .then((body) => JSON.parse(body))
      .then((value) => {
        if (!Array.isArray(value)) throw new Error(`TCGdex snapshot ${language}/${kind}.json must be an array.`);
        return value as Record<string, unknown>[];
      });
    snapshotListCache.set(key, pending);
  }
  return pending;
}

async function snapshotIndex(root: string, language: string, kind: 'sets' | 'cards') {
  const key = `${root}:${language}:${kind}`;
  let pending = snapshotIndexCache.get(key);
  if (!pending) {
    pending = snapshotList(root, language, kind).then((items) => {
      const orderedItems = kind === 'cards'
        ? sortTcgdexCardRows(items)
        : sortTcgdexSetRows(items);
      return new Map(orderedItems.map((item) => [
        kind === 'cards' ? canonicalTcgdexCardId(item)! : canonicalTcgdexSetId(item)!,
        item,
      ]));
    });
    snapshotIndexCache.set(key, pending);
  }
  return pending;
}

function tcgdexLanguage(value: unknown) {
  return normaliseLanguageCode(value);
}

function stackrLanguage(value: unknown) {
  return normaliseLanguageCode(value);
}

function headerMetadata(response: Response) {
  return {
    status: response.status,
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified'),
    cacheControl: response.headers.get('cache-control'),
    retryAfter: response.headers.get('retry-after'),
  };
}

const TCGDEX_VARIANT_CODES: Record<string, string> = {
  normal: 'normal',
  holo: 'holo',
  reverse: 'reverse_holo',
  reverseHolo: 'reverse_holo',
  firstEdition: 'first_edition',
  wPromo: 'promo',
  promo: 'promo',
};

const TCGDEX_VARIANT_PRIORITY: Record<string, number> = {
  normal: 0,
  holo: 1,
  reverse_holo: 2,
  first_edition: 3,
  promo: 4,
};

function tcgdexVariantCode(value: unknown) {
  const raw = cleanText(value);
  if (!raw) return null;
  return TCGDEX_VARIANT_CODES[raw] ?? normaliseVariantCode(raw);
}

function retryDelayMs(response: Response | null, attempt: number) {
  const retryAfter = response?.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(Math.max(seconds * 1000, 250), 30_000);
    const at = Date.parse(retryAfter);
    if (Number.isFinite(at)) return Math.min(Math.max(at - Date.now(), 250), 30_000);
  }
  return 500 * (2 ** (attempt - 1));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function variantCandidates(card: Record<string, unknown>) {
  const variants = new Set<string>();
  const image = cleanText(card.image);
  if (image?.toLowerCase().includes('reverse')) variants.add('reverse_holo');
  const variantsPayload = card.variants;
  if (Array.isArray(variantsPayload)) {
    for (const variant of variantsPayload) {
      const code = tcgdexVariantCode(variant);
      if (code) variants.add(code);
    }
  } else if (variantsPayload && typeof variantsPayload === 'object') {
    for (const [providerCode, available] of Object.entries(variantsPayload as Record<string, unknown>)) {
      if (available !== true) continue;
      const code = tcgdexVariantCode(providerCode);
      if (code) variants.add(code);
    }
  }
  const declaredVariant = tcgdexVariantCode(card.variant);
  if (declaredVariant) variants.add(declaredVariant);
  if (variants.size === 0) variants.add('normal');
  return [...variants].sort((left, right) => {
    const leftPriority = TCGDEX_VARIANT_PRIORITY[left] ?? Number.MAX_SAFE_INTEGER;
    const rightPriority = TCGDEX_VARIANT_PRIORITY[right] ?? Number.MAX_SAFE_INTEGER;
    return leftPriority - rightPriority || left.localeCompare(right);
  });
}

function imageVariantCandidate(card: Record<string, unknown>) {
  const variants = variantCandidates(card);
  if (variants.includes('normal')) return 'normal';
  return variants.length === 1 ? variants[0] : null;
}

function optionalPositiveInteger(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.trunc(parsed);
}

function scopeOffset(scope: FetchScope) {
  return optionalPositiveInteger(scope.cursor?.offset) ?? 0;
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function setAssetCandidates(set: Record<string, unknown>) {
  return ([
    { assetType: 'set_logo' as const, imageUrl: tcgdexAssetUrl(set.logo, 'set_logo') },
    { assetType: 'set_symbol' as const, imageUrl: tcgdexAssetUrl(set.symbol, 'set_symbol') },
  ]).filter((candidate): candidate is { assetType: 'set_logo' | 'set_symbol'; imageUrl: string } => Boolean(candidate.imageUrl));
}

function tcgdexAssetUrl(value: unknown, assetType: 'card_image' | 'set_logo' | 'set_symbol') {
  const base = cleanText(value)?.replace(/\/$/, '');
  if (!base) return null;
  if (/\.(?:png|jpe?g|webp)$/i.test(base)) return base;
  return assetType === 'card_image' ? `${base}/high.webp` : `${base}.webp`;
}

export class TcgdexSourceAdapter implements SourceAdapter {
  readonly language: string;
  readonly baseUrl: string;
  readonly snapshotRoot: string | null;
  readonly snapshotVersion: string | null;
  readonly licenceStatus: LicenceStatus;
  readonly assetLicenceStatus: LicenceStatus;
  readonly cardRecordCache = new Map<string, Promise<ProviderRecord[]>>();

  constructor(options: TcgdexAdapterOptions = {}) {
    this.language = tcgdexLanguage(options.language ?? 'en');
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.snapshotRoot = cleanText(options.snapshotRoot);
    this.snapshotVersion = cleanText(options.snapshotVersion);
    this.licenceStatus = options.licenceStatus ?? 'approved';
    this.assetLicenceStatus = options.assetLicenceStatus ?? 'under_review';
  }

  identifySource(): SourceIdentity {
    return {
      code: 'tcgdex',
      displayName: 'TCGdex',
      sourceType: 'catalogue' as const,
      baseUrl: this.baseUrl,
      termsUrl: 'https://github.com/tcgdex/cards-database/blob/master/LICENSE',
      licenceStatus: this.licenceStatus,
      attributionRequired: true,
      robotsPolicy: 'api_only_no_scraping',
      rateLimitConfig: this.snapshotRoot
        ? { source: 'pinned_local_snapshot', version: this.snapshotVersion }
        : { source: 'provider_terms_required_before_scheduling' },
      capabilities: ['sets', 'cards', 'variants', 'assets', 'conditional_requests'],
      automatedRefreshAllowed: false,
    };
  }

  endpoint(path: string) {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.baseUrl}/${this.language}${cleanPath}`;
  }

  async fetchJson(path: string, scope: FetchScope = {}) {
    const startedAt = Date.now();
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (scope.conditionalHeaders?.etag) headers['If-None-Match'] = scope.conditionalHeaders.etag;
    if (scope.conditionalHeaders?.lastModified) headers['If-Modified-Since'] = scope.conditionalHeaders.lastModified;

    const url = this.endpoint(path);
    if (this.snapshotRoot) {
      const match = path.match(/^\/(sets|cards)(?:\/([^/?#]+))?$/);
      if (!match) throw new Error(`Unsupported TCGdex snapshot path: ${path}`);
      const kind = match[1] as 'sets' | 'cards';
      const decodedId = match[2] ? decodeURIComponent(match[2]) : null;
      const id = decodedId
        ? kind === 'cards' ? canonicalTcgdexCardId(decodedId) : canonicalTcgdexSetId(decodedId)
        : null;
      const value = id
        ? (await snapshotIndex(this.snapshotRoot, this.language, kind)).get(id) ?? null
        : await snapshotList(this.snapshotRoot, this.language, kind);
      return {
        url,
        value,
        metadata: {
          status: value == null ? 404 : 200,
          responseTimeMs: Date.now() - startedAt,
          endpoint: url,
          source: 'pinned_local_snapshot',
          snapshotVersion: this.snapshotVersion,
        },
      };
    }
    let response: Response | null = null;
    let lastError: unknown = null;
    let attempts = 0;
    for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt += 1) {
      attempts = attempt;
      try {
        response = await fetch(url, {
          headers,
          signal: AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT_MS),
        });
        if (![408, 429, 500, 502, 503, 504].includes(response.status) || attempt === MAX_REQUEST_ATTEMPTS) break;
        await response.body?.cancel().catch(() => undefined);
        await sleep(retryDelayMs(response, attempt));
      } catch (error) {
        lastError = error;
        if (attempt === MAX_REQUEST_ATTEMPTS) throw error;
        await sleep(retryDelayMs(null, attempt));
      }
    }
    if (!response) throw lastError ?? new Error(`TCGdex request failed before receiving a response for ${url}.`);
    const text = await response.text();
    const metadata = {
      ...headerMetadata(response),
      responseTimeMs: Date.now() - startedAt,
      endpoint: url,
      attempts,
    };

    if (response.status === 304) return { url, value: null, metadata };
    if (response.status === 401 || response.status === 403) {
      const error = new Error(`TCGdex request forbidden for ${url}`);
      Object.assign(error, { responseStatus: response.status, metadata });
      throw error;
    }
    if (!response.ok) {
      const error = new Error(`TCGdex request failed (${response.status}) for ${url}: ${text.slice(0, 240)}`);
      Object.assign(error, { responseStatus: response.status, metadata });
      throw error;
    }

    return {
      url,
      value: text ? JSON.parse(text) : null,
      metadata,
    };
  }

  async healthCheck(): Promise<SourceHealth> {
    try {
      const result = await this.fetchJson('/sets', { limit: 1 });
      return {
        status: 'ok',
        responseStatus: Number(result.metadata.status),
        responseTimeMs: Number(result.metadata.responseTimeMs),
        capabilities: { sets: true, cards: true, variants: true, assets: true, conditional_requests: true },
        httpMetadata: result.metadata,
      };
    } catch (error) {
      const responseStatus = Number((error as { responseStatus?: number }).responseStatus ?? 0) || null;
      return {
        status: responseStatus === 401 || responseStatus === 403 ? 'forbidden' : 'unavailable',
        responseStatus,
        message: error instanceof Error ? error.message : String(error),
        httpMetadata: (error as { metadata?: Record<string, unknown> }).metadata ?? {},
      };
    }
  }

  async fetchSets(scope: FetchScope = {}) {
    const result = scope.setId
      ? await this.fetchJson(`/sets/${encodeURIComponent(scope.setId)}`, scope)
      : await this.fetchJson('/sets', scope);
    const sets = scope.setId
      ? (result.value && typeof result.value === 'object' && !Array.isArray(result.value) ? [result.value] : [])
      : (Array.isArray(result.value) ? result.value : []);
    const orderedSets = sortTcgdexSetRows(sets);
    const offset = scopeOffset(scope);
    const limit = scope.limit ?? orderedSets.length;
    return orderedSets.slice(offset, offset + limit).map((set: Record<string, unknown>) => ({
      provider: 'tcgdex',
      providerRecordId: cleanText(set.id) ?? cleanText(set.slug) ?? cleanText(set.name) ?? 'unknown-set',
      recordType: 'set' as const,
      languageCode: stackrLanguage(this.language),
      sourceUrl: result.url,
      sourceEndpoint: result.url,
      providerUpdatedAt: cleanText(set.updatedAt ?? set.updated_at),
      licenceStatus: this.licenceStatus,
      attributionText: 'TCGdex',
      httpMetadata: result.metadata,
      payload: set,
    }));
  }

  async fetchCards(scope: FetchScope = {}) {
    const cacheKey = JSON.stringify({
      setId: scope.setId ?? null,
      providerRecordId: scope.providerRecordId ?? null,
      limit: scope.limit ?? null,
      cursor: scope.cursor ?? null,
      conditionalHeaders: scope.conditionalHeaders ?? null,
    });
    const cached = this.cardRecordCache.get(cacheKey);
    if (cached) return cached;
    const pending = this.fetchCardsUncached(scope);
    this.cardRecordCache.set(cacheKey, pending);
    try {
      return await pending;
    } catch (error) {
      this.cardRecordCache.delete(cacheKey);
      throw error;
    }
  }

  async fetchCardsUncached(scope: FetchScope = {}) {
    const result = scope.setId
      ? await this.fetchJson(`/sets/${encodeURIComponent(scope.setId)}`, scope)
      : await this.fetchJson('/cards', scope);
    const setPayload = scope.setId ? result.value as Record<string, unknown> | null : null;
    const cardRefs = scope.setId
      ? (Array.isArray(setPayload?.cards) ? setPayload.cards : [])
      : (Array.isArray(result.value) ? result.value : []);
    const orderedCardRefs = sortTcgdexCardRows(cardRefs);
    const offset = scopeOffset(scope);
    const limit = scope.limit ?? orderedCardRefs.length;
    const selectedRefs = orderedCardRefs.slice(offset, offset + limit);
    return mapWithConcurrency<unknown, ProviderRecord>(
      selectedRefs,
      DEFAULT_DETAIL_CONCURRENCY,
      async (ref) => {
        const refId = cleanText(typeof ref === 'object' && ref ? (ref as Record<string, unknown>).id : ref);
        const expectedId = canonicalTcgdexCardId(ref);
        if (!refId || !expectedId) {
          throw new Error('TCGdex selected card reference has no stable provider ID.');
        }
        const cardResult = await this.fetchJson(`/cards/${encodeURIComponent(refId)}`, scope);
        const card = cardResult.value as Record<string, unknown> | null;
        if (!card) throw new Error(`TCGdex card detail ${refId} is missing from the selected snapshot.`);
        const actualId = canonicalTcgdexCardId(card);
        if (actualId !== expectedId) {
          throw new Error(`TCGdex card detail identity mismatch: expected ${expectedId}, received ${actualId ?? 'missing'}.`);
        }
        const cardVariants = variantCandidates(card);
        const imageVariant = imageVariantCandidate(card);
        return {
          provider: 'tcgdex',
          providerRecordId: cleanText(card.id) ?? refId,
          recordType: 'card',
          languageCode: stackrLanguage(this.language),
          sourceUrl: cardResult.url,
          sourceEndpoint: cardResult.url,
          providerUpdatedAt: cleanText(card.updatedAt ?? card.updated_at),
          licenceStatus: this.licenceStatus,
          attributionText: 'TCGdex',
          httpMetadata: cardResult.metadata,
          payload: {
            ...card,
            set: setPayload ?? card.set,
            variant: imageVariant ?? cardVariants[0],
            image_variant: imageVariant,
          },
        } satisfies ProviderRecord;
      },
    );
  }

  async fetchVariants(scope?: FetchScope) {
    const cards = await this.fetchCards(scope);
    return cards.flatMap((card) => {
      const [, ...additionalVariants] = variantCandidates(card.payload);
      return additionalVariants.map((variant) => ({
        ...card,
        providerRecordId: `${card.providerRecordId}:${variant}`,
        recordType: 'variant' as const,
        payload: { ...card.payload, variant },
      }));
    });
  }

  async fetchAssets(scope?: FetchScope) {
    const setAssets: ProviderRecord[] = [];
    if (scope?.setId) {
      const setResult = await this.fetchJson(`/sets/${encodeURIComponent(scope.setId)}`, scope);
      const setPayload = setResult.value && typeof setResult.value === 'object' && !Array.isArray(setResult.value)
        ? setResult.value as Record<string, unknown>
        : {};
      const setId = cleanText(setPayload.id) ?? scope.setId;
      setAssets.push(...setAssetCandidates(setPayload).map(({ assetType, imageUrl }) => ({
        provider: 'tcgdex',
        providerRecordId: `${setId}:${assetType}:image`,
        recordType: 'asset' as const,
        languageCode: stackrLanguage(this.language),
        sourceUrl: imageUrl,
        sourceEndpoint: setResult.url,
        providerUpdatedAt: cleanText(setPayload.updatedAt ?? setPayload.updated_at),
        licenceStatus: this.assetLicenceStatus,
        attributionText: 'TCGdex',
        httpMetadata: setResult.metadata,
        payload: {
          ...setPayload,
          set: setPayload,
          image_url: imageUrl,
          image_language_code: stackrLanguage(this.language),
          asset_type: assetType,
        },
      })));
    }
    const cards = await this.fetchCards(scope);
    const cardAssets = cards.flatMap((card) => {
      const image = tcgdexAssetUrl(card.payload.image, 'card_image');
      if (!image) return [];
      const variant = tcgdexVariantCode(card.payload.image_variant);
      if (!variant) return [];
      return [{
        ...card,
        providerRecordId: `${card.providerRecordId}:${variant}:${variant}:image`,
        recordType: 'asset' as const,
        licenceStatus: this.assetLicenceStatus,
        payload: {
          ...card.payload,
          variant,
          finish: variant,
          image_url: image,
          asset_type: 'card_image',
        },
      }];
    });
    return [...setAssets, ...cardAssets];
  }

  normaliseRecord(record: ProviderRecord): NormalisedRecord {
    const payload = record.payload;
    const set = (payload.set && typeof payload.set === 'object') ? payload.set as Record<string, unknown> : {};
    const sourceSet = record.recordType === 'set' ? payload : set;
    const cardCount = (payload.cardCount && typeof payload.cardCount === 'object')
      ? payload.cardCount as Record<string, unknown>
      : {};
    const collector = collectorNumberParts(payload.localId ?? payload.number);
    const recordVariant = record.recordType === 'card'
      ? payload.image_variant ?? payload.variant ?? 'normal'
      : payload.variant ?? payload.image_variant ?? 'normal';
    const imageUrl = tcgdexAssetUrl(payload.image_url ?? payload.image, 'card_image');
    const languageCode = stackrLanguage(record.languageCode ?? this.language);
    const nativeName = cleanText(payload.name ?? payload.localName);
    return {
      provider: record.provider,
      providerRecordId: record.providerRecordId,
      recordType: record.recordType,
      gameCode: 'pokemon',
      languageCode,
      setCode: cleanText(sourceSet.id ?? sourceSet.code),
      providerSetId: cleanText(sourceSet.id ?? payload.setId),
      collectorNumber: collector.collectorNumber || null,
      collectorNumberPrefix: collector.collectorNumberPrefix,
      collectorNumberSort: collector.collectorNumberSort,
      collectorNumberSuffix: collector.collectorNumberSuffix,
      collectorNumberSortKey: collector.collectorNumberSortKey,
      nativeName,
      englishDisplayName: cleanText(payload.englishName) ?? (languageCode === 'en' ? nativeName : null),
      releaseDate: cleanText(sourceSet.releaseDate ?? sourceSet.release_date),
      printedTotal: optionalPositiveInteger(payload.printedTotal ?? cardCount.official),
      total: optionalPositiveInteger(payload.total ?? cardCount.total),
      rarityCode: cleanText(payload.rarity)?.toLowerCase().replace(/[^a-z0-9]+/g, '_') ?? null,
      variantCode: normaliseVariantCode(recordVariant),
      finishCode: normaliseVariantCode(recordVariant),
      artworkKey: imageUrl ? `tcgdex:${imageUrl}` : null,
      imageUrl,
      imageLanguageCode: languageCode,
      assetType: cleanText(payload.asset_type) as NormalisedRecord['assetType'] ?? 'card_image',
      sourceConfidence: 0.85,
      sourceUpdatedAt: record.providerUpdatedAt,
      licenceStatus: record.licenceStatus,
      raw: payload,
    };
  }

  validateRecord(record: ProviderRecord) {
    return validateProviderRecord(record);
  }
}

export const tcgdexAdapterInternals = {
  imageVariantCandidate,
  scopeOffset,
  setAssetCandidates,
  tcgdexAssetUrl,
  variantCandidates,
};
