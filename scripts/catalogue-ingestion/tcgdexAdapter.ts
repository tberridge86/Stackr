import {
  cleanText,
  collectorNumberParts,
  normaliseLanguageCode,
  normaliseVariantCode,
  type FetchScope,
  type NormalisedRecord,
  type ProviderRecord,
  type SourceAdapter,
  type SourceHealth,
  type SourceIdentity,
  validateProviderRecord,
} from './sourceAdapter';

const DEFAULT_BASE_URL = 'https://api.tcgdex.net/v2';

type TcgdexAdapterOptions = {
  language?: string;
  baseUrl?: string;
  licenceStatus?: 'approved' | 'under_review' | 'restricted' | 'denied' | 'unknown';
};

function tcgdexLanguage(value: unknown) {
  const normalised = normaliseLanguageCode(value);
  if (normalised === 'zh-Hant') return 'zh-tw';
  if (normalised === 'zh-Hans') return 'zh-cn';
  return normalised;
}

function stackrLanguage(value: unknown) {
  const raw = String(value ?? '').toLowerCase();
  if (raw === 'zh-tw') return 'zh-Hant';
  if (raw === 'zh-cn') return 'zh-Hans';
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

function variantCandidates(card: Record<string, unknown>) {
  const variants = new Set<string>(['normal']);
  const image = cleanText(card.image);
  if (image?.toLowerCase().includes('reverse')) variants.add('reverse_holo');
  const variantsPayload = card.variants;
  if (Array.isArray(variantsPayload)) {
    for (const variant of variantsPayload) variants.add(normaliseVariantCode(variant));
  }
  return [...variants];
}

export class TcgdexSourceAdapter implements SourceAdapter {
  readonly language: string;
  readonly baseUrl: string;
  readonly licenceStatus: 'approved' | 'under_review' | 'restricted' | 'denied' | 'unknown';

  constructor(options: TcgdexAdapterOptions = {}) {
    this.language = tcgdexLanguage(options.language ?? 'en');
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.licenceStatus = options.licenceStatus ?? 'under_review';
  }

  identifySource(): SourceIdentity {
    return {
      code: 'tcgdex',
      displayName: 'TCGdex',
      sourceType: 'catalogue' as const,
      baseUrl: this.baseUrl,
      termsUrl: 'https://www.tcgdex.net/',
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
    return sets.slice(0, scope.limit).map((set: Record<string, unknown>) => ({
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
    if (!scope.setId) return [];
    const result = await this.fetchJson(`/sets/${encodeURIComponent(scope.setId)}`, scope);
    const setPayload = result.value as Record<string, unknown> | null;
    const cardRefs = Array.isArray(setPayload?.cards) ? setPayload.cards : [];
    const limit = scope.limit ?? cardRefs.length;
    const records: ProviderRecord[] = [];

    for (const ref of cardRefs.slice(0, limit)) {
      const refId = cleanText(typeof ref === 'object' && ref ? (ref as Record<string, unknown>).id : ref);
      if (!refId) continue;
      const cardResult = await this.fetchJson(`/cards/${encodeURIComponent(refId)}`, scope);
      const card = cardResult.value as Record<string, unknown> | null;
      if (!card) continue;
      records.push({
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
        payload: { ...card, set: setPayload },
      });
    }
    return records;
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
    const cards = await this.fetchCards(scope);
    return cards.flatMap((card) => {
      const image = cleanText(card.payload.image);
      if (!image) return [];
      return [{
        ...card,
        providerRecordId: `${card.providerRecordId}:image`,
        recordType: 'asset' as const,
        payload: { ...card.payload, image_url: image, asset_type: 'card_image' },
      }];
    });
  }

  normaliseRecord(record: ProviderRecord): NormalisedRecord {
    const payload = record.payload;
    const set = (payload.set && typeof payload.set === 'object') ? payload.set as Record<string, unknown> : {};
    const collector = collectorNumberParts(payload.localId ?? payload.number);
    const recordVariant = payload.variant ?? 'normal';
    return {
      provider: record.provider,
      providerRecordId: record.providerRecordId,
      recordType: record.recordType,
      gameCode: 'pokemon',
      languageCode: stackrLanguage(record.languageCode ?? this.language),
      setCode: cleanText(set.id ?? set.code),
      providerSetId: cleanText(set.id ?? payload.setId),
      collectorNumber: collector.collectorNumber || null,
      collectorNumberPrefix: collector.collectorNumberPrefix,
      collectorNumberSort: collector.collectorNumberSort,
      collectorNumberSuffix: collector.collectorNumberSuffix,
      collectorNumberSortKey: collector.collectorNumberSortKey,
      nativeName: cleanText(payload.name ?? payload.localName),
      englishDisplayName: cleanText(payload.englishName ?? payload.name),
      rarityCode: cleanText(payload.rarity)?.toLowerCase().replace(/[^a-z0-9]+/g, '_') ?? null,
      variantCode: normaliseVariantCode(recordVariant),
      finishCode: normaliseVariantCode(recordVariant),
      artworkKey: cleanText(payload.image) ? `tcgdex:${payload.image}` : null,
      imageUrl: cleanText(payload.image ?? payload.image_url),
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
