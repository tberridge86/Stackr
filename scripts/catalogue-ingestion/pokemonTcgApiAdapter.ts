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

const DEFAULT_BASE_URL = 'https://api.pokemontcg.io/v2';
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const MAX_PAGE_SIZE = 250;
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

type PokemonTcgApiAdapterOptions = {
  language?: string;
  baseUrl?: string;
  apiKey?: string;
  licenceStatus?: LicenceStatus;
  assetLicenceStatus?: LicenceStatus;
};

type PageEnvelope = {
  data: Record<string, unknown>[];
  page: number;
  pageSize: number;
  count: number;
  totalCount: number | null;
  metadata: Record<string, unknown>;
  url: string;
};

function optionalPositiveInteger(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.trunc(parsed);
}

function scopeOffset(scope: FetchScope) {
  return optionalPositiveInteger(scope.cursor?.offset) ?? 0;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(response: Response | null, attempt: number) {
  const raw = response?.headers.get('retry-after');
  if (raw) {
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(Math.max(seconds * 1000, 250), 30_000);
    const at = Date.parse(raw);
    if (Number.isFinite(at)) return Math.min(Math.max(at - Date.now(), 250), 30_000);
  }
  return Math.min(500 * (2 ** Math.max(0, attempt - 1)), 10_000);
}

function apiLanguage(value: unknown) {
  const language = normaliseLanguageCode(value ?? 'en');
  if (language !== 'en') {
    const error = new Error('Pokemon TCG API is an English reconciliation source and cannot populate non-English identities.');
    Object.assign(error, { code: 'pokemon_tcg_api_english_only', fatal: true });
    throw error;
  }
  return language;
}

function escapedQueryValue(value: unknown) {
  return String(value ?? '').replace(/([+\-!(){}\[\]^"~*?:\\/])/g, '\\$1');
}

function priceVariantCodes(card: Record<string, unknown>) {
  const tcgplayer = card.tcgplayer && typeof card.tcgplayer === 'object'
    ? card.tcgplayer as Record<string, unknown>
    : {};
  const prices = tcgplayer.prices && typeof tcgplayer.prices === 'object'
    ? tcgplayer.prices as Record<string, unknown>
    : {};
  const variants = Object.keys(prices).map((key) => normaliseVariantCode(key));
  return [...new Set(variants.length ? variants : ['normal'])];
}

function imageUrl(card: Record<string, unknown>) {
  const images = card.images && typeof card.images === 'object'
    ? card.images as Record<string, unknown>
    : {};
  return cleanText(card.image_url ?? images.large ?? images.small);
}

export class PokemonTcgApiSourceAdapter implements SourceAdapter {
  readonly language: string;
  readonly baseUrl: string;
  readonly apiKey: string | null;
  readonly licenceStatus: LicenceStatus;
  readonly assetLicenceStatus: LicenceStatus;
  readonly cardCache = new Map<string, Promise<ProviderRecord[]>>();

  constructor(options: PokemonTcgApiAdapterOptions = {}) {
    this.language = apiLanguage(options.language ?? 'en');
    this.baseUrl = String(options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.apiKey = cleanText(options.apiKey ?? process.env.POKEMON_TCG_API_KEY);
    this.licenceStatus = options.licenceStatus ?? 'under_review';
    this.assetLicenceStatus = options.assetLicenceStatus ?? 'under_review';
  }

  identifySource(): SourceIdentity {
    return {
      code: 'pokemon-tcg-api',
      displayName: 'Pokemon TCG API',
      sourceType: 'catalogue',
      baseUrl: this.baseUrl,
      termsUrl: 'https://pokemontcg.io/',
      licenceStatus: this.licenceStatus,
      attributionRequired: true,
      robotsPolicy: 'api_only_no_scraping',
      rateLimitConfig: {
        authentication: this.apiKey ? 'x-api-key-configured' : 'anonymous-limits',
        pageSize: MAX_PAGE_SIZE,
      },
      capabilities: ['sets', 'cards', 'variants', 'assets'],
      automatedRefreshAllowed: false,
    };
  }

  async request(path: string, query: Record<string, unknown> = {}) {
    const url = new URL(`${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`);
    for (const [key, value] of Object.entries(query)) {
      if (value == null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.apiKey) headers['X-Api-Key'] = this.apiKey;

    let response: Response | null = null;
    let lastError: unknown = null;
    const startedAt = Date.now();
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        response = await fetch(url, {
          headers,
          signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
        });
        if (!RETRYABLE_STATUSES.has(response.status) || attempt === MAX_ATTEMPTS) {
          const text = response.status === 204 ? '' : await response.text();
          const metadata = {
            status: response.status,
            endpoint: url.toString(),
            attempts: attempt,
            responseTimeMs: Date.now() - startedAt,
            etag: response.headers.get('etag'),
            lastModified: response.headers.get('last-modified'),
            retryAfter: response.headers.get('retry-after'),
          };
          if (response.status === 401 || response.status === 403) {
            const error = new Error(`Pokemon TCG API request forbidden for ${url}`);
            Object.assign(error, { responseStatus: response.status, metadata });
            throw error;
          }
          if (!response.ok) {
            const error = new Error(`Pokemon TCG API request failed (${response.status}) for ${url}: ${text.slice(0, 240)}`);
            Object.assign(error, { responseStatus: response.status, metadata });
            throw error;
          }
          return {
            url: url.toString(),
            value: text ? JSON.parse(text) : null,
            metadata,
          };
        }
        await response.body?.cancel().catch(() => undefined);
        await sleep(retryDelayMs(response, attempt));
      } catch (error) {
        lastError = error;
        const responseStatus = Number((error as { responseStatus?: number }).responseStatus ?? 0);
        if (responseStatus && !RETRYABLE_STATUSES.has(responseStatus)) throw error;
        if (attempt === MAX_ATTEMPTS) throw error;
        await sleep(retryDelayMs(null, attempt));
      }
    }
    throw lastError ?? new Error(`Pokemon TCG API request failed before receiving a response for ${url}.`);
  }

  async page(resource: 'cards' | 'sets', page: number, query?: string): Promise<PageEnvelope> {
    const result = await this.request(`/${resource}`, {
      q: query,
      page,
      pageSize: MAX_PAGE_SIZE,
      orderBy: 'id',
    });
    const body = result.value;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error(`Pokemon TCG API returned an invalid ${resource} response.`);
    }
    const record = body as Record<string, unknown>;
    const data = Array.isArray(record.data) ? record.data as Record<string, unknown>[] : null;
    if (!data) throw new Error(`Pokemon TCG API ${resource} response is missing data[].`);
    const responsePage = optionalPositiveInteger(record.page) ?? page;
    const pageSize = optionalPositiveInteger(record.pageSize) ?? MAX_PAGE_SIZE;
    const count = optionalPositiveInteger(record.count) ?? data.length;
    const totalCount = optionalPositiveInteger(record.totalCount);
    if (responsePage !== page || count !== data.length || pageSize > MAX_PAGE_SIZE || (totalCount != null && totalCount < count)) {
      throw new Error(`Pokemon TCG API returned inconsistent pagination metadata for ${resource}.`);
    }
    return { data, page: responsePage, pageSize, count, totalCount, metadata: result.metadata, url: result.url };
  }

  async collection(resource: 'cards' | 'sets', scope: FetchScope, query?: string) {
    const offset = scopeOffset(scope);
    const requestedLimit = scope.limit == null ? Number.MAX_SAFE_INTEGER : Math.max(0, Number(scope.limit));
    if (requestedLimit === 0) return { rows: [], metadata: {}, url: this.baseUrl };
    const firstPage = Math.floor(offset / MAX_PAGE_SIZE) + 1;
    let skip = offset % MAX_PAGE_SIZE;
    const rows: Record<string, unknown>[] = [];
    const seenIds = new Set<string>();
    let expectedTotal: number | null = null;
    let latestMetadata: Record<string, unknown> = {};
    let latestUrl = this.baseUrl;

    for (let page = firstPage; page < firstPage + 2000 && rows.length < requestedLimit; page += 1) {
      const batch = await this.page(resource, page, query);
      latestMetadata = batch.metadata;
      latestUrl = batch.url;
      if (expectedTotal == null) expectedTotal = batch.totalCount;
      if (expectedTotal != null && batch.totalCount != null && expectedTotal !== batch.totalCount) {
        throw new Error(`Pokemon TCG API totalCount changed while mirroring ${resource}.`);
      }
      const selected = skip ? batch.data.slice(skip) : batch.data;
      skip = 0;
      for (const item of selected) {
        const id = cleanText(item.id);
        if (!id) throw new Error(`Pokemon TCG API returned a ${resource} record without an id.`);
        if (seenIds.has(id)) throw new Error(`Pokemon TCG API returned duplicate ${resource} id ${id}.`);
        seenIds.add(id);
        rows.push(item);
        if (rows.length >= requestedLimit) break;
      }
      if (batch.count === 0 || batch.count < batch.pageSize) break;
      if (batch.totalCount != null && page * batch.pageSize >= batch.totalCount) break;
    }
    return { rows, metadata: latestMetadata, url: latestUrl };
  }

  async healthCheck(): Promise<SourceHealth> {
    try {
      const result = await this.page('sets', 1);
      return {
        status: 'ok',
        responseStatus: Number(result.metadata.status),
        responseTimeMs: Number(result.metadata.responseTimeMs),
        capabilities: { sets: true, cards: true, variants: true, assets: true },
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
    if (scope.setId) {
      const result = await this.request(`/sets/${encodeURIComponent(scope.setId)}`);
      const set = result.value && typeof result.value === 'object' && !Array.isArray(result.value)
        ? (result.value as Record<string, unknown>).data as Record<string, unknown> | undefined
        : undefined;
      return set ? [this.providerRecord('set', set, result.url, result.metadata)] : [];
    }
    const result = await this.collection('sets', scope);
    return result.rows.map((set) => this.providerRecord('set', set, result.url, result.metadata));
  }

  async fetchCards(scope: FetchScope = {}) {
    const cacheKey = JSON.stringify(scope);
    const cached = this.cardCache.get(cacheKey);
    if (cached) return cached;
    const pending = this.fetchCardsUncached(scope);
    this.cardCache.set(cacheKey, pending);
    try {
      return await pending;
    } catch (error) {
      this.cardCache.delete(cacheKey);
      throw error;
    }
  }

  async fetchCardsUncached(scope: FetchScope = {}) {
    if (scope.providerRecordId) {
      const result = await this.request(`/cards/${encodeURIComponent(scope.providerRecordId)}`);
      const card = result.value && typeof result.value === 'object' && !Array.isArray(result.value)
        ? (result.value as Record<string, unknown>).data as Record<string, unknown> | undefined
        : undefined;
      return card ? [this.providerRecord('card', { ...card, variant: priceVariantCodes(card)[0] }, result.url, result.metadata)] : [];
    }
    const query = scope.setId ? `set.id:${escapedQueryValue(scope.setId)}` : undefined;
    const result = await this.collection('cards', scope, query);
    return result.rows.map((card) => this.providerRecord('card', { ...card, variant: priceVariantCodes(card)[0] }, result.url, result.metadata));
  }

  async fetchVariants(scope?: FetchScope) {
    const cards = await this.fetchCards(scope);
    return cards.flatMap((card) => priceVariantCodes(card.payload).slice(1).map((variant) => ({
      ...card,
      providerRecordId: `${card.providerRecordId}:${variant}`,
      recordType: 'variant' as const,
      payload: { ...card.payload, variant },
    })));
  }

  async fetchAssets(scope?: FetchScope) {
    const cards = await this.fetchCards(scope);
    return cards.flatMap((card) => {
      const image = imageUrl(card.payload);
      if (!image) return [];
      return [{
        ...card,
        providerRecordId: `${card.providerRecordId}:normal:image`,
        recordType: 'asset' as const,
        licenceStatus: this.assetLicenceStatus,
        sourceUrl: image,
        payload: {
          ...card.payload,
          variant: 'normal',
          finish: 'normal',
          image_url: image,
          image_language_code: 'en',
          asset_type: 'card_image',
        },
      }];
    });
  }

  providerRecord(recordType: 'set' | 'card', payload: Record<string, unknown>, url: string, metadata: Record<string, unknown>): ProviderRecord {
    return {
      provider: 'pokemon-tcg-api',
      providerRecordId: cleanText(payload.id) ?? `unknown-${recordType}`,
      recordType,
      languageCode: 'en',
      sourceUrl: url,
      sourceEndpoint: url,
      providerUpdatedAt: cleanText(payload.updatedAt ?? payload.updated_at),
      licenceStatus: this.licenceStatus,
      attributionText: 'Pokemon TCG API',
      httpMetadata: metadata,
      payload,
    };
  }

  normaliseRecord(record: ProviderRecord): NormalisedRecord {
    const payload = record.payload;
    const set = payload.set && typeof payload.set === 'object' ? payload.set as Record<string, unknown> : {};
    const sourceSet = record.recordType === 'set' ? payload : set;
    const collector = collectorNumberParts(payload.number);
    const variant = normaliseVariantCode(payload.variant ?? 'normal');
    const image = cleanText(payload.image_url) ?? imageUrl(payload);
    return {
      provider: record.provider,
      providerRecordId: record.providerRecordId,
      recordType: record.recordType,
      gameCode: 'pokemon',
      languageCode: 'en',
      setCode: cleanText(sourceSet.id ?? sourceSet.ptcgoCode),
      providerSetId: cleanText(sourceSet.id),
      collectorNumber: collector.collectorNumber || null,
      collectorNumberPrefix: collector.collectorNumberPrefix,
      collectorNumberSort: collector.collectorNumberSort,
      collectorNumberSuffix: collector.collectorNumberSuffix,
      collectorNumberSortKey: collector.collectorNumberSortKey,
      nativeName: cleanText(payload.name),
      englishDisplayName: cleanText(payload.name),
      printedTotal: optionalPositiveInteger(sourceSet.printedTotal),
      total: optionalPositiveInteger(sourceSet.total),
      rarityCode: cleanText(payload.rarity)?.toLowerCase().replace(/[^a-z0-9]+/g, '_') ?? null,
      variantCode: variant,
      finishCode: variant,
      artworkKey: image ? `pokemon-tcg-api:${image}` : null,
      imageUrl: image,
      imageLanguageCode: 'en',
      assetType: cleanText(payload.asset_type) as NormalisedRecord['assetType'] ?? 'card_image',
      sourceConfidence: 0.8,
      sourceUpdatedAt: record.providerUpdatedAt,
      licenceStatus: record.licenceStatus,
      raw: payload,
    };
  }

  validateRecord(record: ProviderRecord) {
    return validateProviderRecord(record);
  }
}

export const pokemonTcgApiAdapterInternals = {
  apiLanguage,
  escapedQueryValue,
  imageUrl,
  priceVariantCodes,
  scopeOffset,
};
