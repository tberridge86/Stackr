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

const DEFAULT_BASE_URL = 'https://api.tcgdex.net/v2';
const DEFAULT_DETAIL_CONCURRENCY = 8;

type TcgdexAdapterOptions = {
  language?: string;
  baseUrl?: string;
  licenceStatus?: LicenceStatus;
  assetLicenceStatus?: LicenceStatus;
};

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

function tcgdexVariantCode(value: unknown) {
  const raw = cleanText(value);
  if (!raw) return null;
  return TCGDEX_VARIANT_CODES[raw] ?? normaliseVariantCode(raw);
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
  return [...variants];
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
    { assetType: 'set_logo' as const, imageUrl: cleanText(set.logo) },
    { assetType: 'set_symbol' as const, imageUrl: cleanText(set.symbol) },
  ]).filter((candidate): candidate is { assetType: 'set_logo' | 'set_symbol'; imageUrl: string } => Boolean(candidate.imageUrl));
}

export class TcgdexSourceAdapter implements SourceAdapter {
  readonly language: string;
  readonly baseUrl: string;
  readonly licenceStatus: LicenceStatus;
  readonly assetLicenceStatus: LicenceStatus;
  readonly cardRecordCache = new Map<string, Promise<ProviderRecord[]>>();

  constructor(options: TcgdexAdapterOptions = {}) {
    this.language = tcgdexLanguage(options.language ?? 'en');
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
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
      rateLimitConfig: { source: 'provider_terms_required_before_scheduling' },
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
    const response = await fetch(url, { headers });
    const text = await response.text();
    const metadata = {
      ...headerMetadata(response),
      responseTimeMs: Date.now() - startedAt,
      endpoint: url,
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
    const result = await this.fetchJson('/sets', scope);
    const sets = Array.isArray(result.value) ? result.value : [];
    const offset = scopeOffset(scope);
    const limit = scope.limit ?? sets.length;
    return sets.slice(offset, offset + limit).map((set: Record<string, unknown>) => ({
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
    const offset = scopeOffset(scope);
    const limit = scope.limit ?? cardRefs.length;
    const selectedRefs = cardRefs.slice(offset, offset + limit);
    const batches = await mapWithConcurrency<unknown, ProviderRecord | null>(
      selectedRefs,
      DEFAULT_DETAIL_CONCURRENCY,
      async (ref) => {
      const refId = cleanText(typeof ref === 'object' && ref ? (ref as Record<string, unknown>).id : ref);
      if (!refId) return null;
      const cardResult = await this.fetchJson(`/cards/${encodeURIComponent(refId)}`, scope);
      const card = cardResult.value as Record<string, unknown> | null;
      if (!card) return null;
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
          variant: variantCandidates(card)[0],
          image_variant: imageVariantCandidate(card),
        },
        } satisfies ProviderRecord;
      },
    );
    return batches.filter((record): record is ProviderRecord => record !== null);
  }

  async fetchVariants(scope?: FetchScope) {
    const cards = await this.fetchCards(scope);
    return cards.flatMap((card) => variantCandidates(card.payload).map((variant) => ({
      ...card,
      providerRecordId: `${card.providerRecordId}:${variant}`,
      recordType: 'variant' as const,
      payload: { ...card.payload, variant },
    })));
  }

  async fetchAssets(scope?: FetchScope) {
    if (!scope?.setId) return [];
    const setResult = await this.fetchJson(`/sets/${encodeURIComponent(scope.setId)}`, scope);
    const setPayload = setResult.value && typeof setResult.value === 'object' && !Array.isArray(setResult.value)
      ? setResult.value as Record<string, unknown>
      : {};
    const setId = cleanText(setPayload.id) ?? scope.setId;
    const setAssets: ProviderRecord[] = setAssetCandidates(setPayload).map(({ assetType, imageUrl }) => ({
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
    }));
    const cards = await this.fetchCards(scope);
    const cardAssets = cards.flatMap((card) => {
      const image = cleanText(card.payload.image);
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
    const recordVariant = payload.variant ?? 'normal';
    return {
      provider: record.provider,
      providerRecordId: record.providerRecordId,
      recordType: record.recordType,
      gameCode: 'pokemon',
      languageCode: stackrLanguage(record.languageCode ?? this.language),
      setCode: cleanText(sourceSet.id ?? sourceSet.code),
      providerSetId: cleanText(sourceSet.id ?? payload.setId),
      collectorNumber: collector.collectorNumber || null,
      collectorNumberPrefix: collector.collectorNumberPrefix,
      collectorNumberSort: collector.collectorNumberSort,
      collectorNumberSuffix: collector.collectorNumberSuffix,
      collectorNumberSortKey: collector.collectorNumberSortKey,
      nativeName: cleanText(payload.name ?? payload.localName),
      englishDisplayName: cleanText(payload.englishName ?? payload.name),
      printedTotal: optionalPositiveInteger(payload.printedTotal ?? cardCount.official),
      total: optionalPositiveInteger(payload.total ?? cardCount.total),
      rarityCode: cleanText(payload.rarity)?.toLowerCase().replace(/[^a-z0-9]+/g, '_') ?? null,
      variantCode: normaliseVariantCode(recordVariant),
      finishCode: normaliseVariantCode(recordVariant),
      artworkKey: cleanText(payload.image) ? `tcgdex:${payload.image}` : null,
      imageUrl: cleanText(payload.image ?? payload.image_url),
      imageLanguageCode: stackrLanguage(record.languageCode ?? this.language),
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
  variantCandidates,
};
