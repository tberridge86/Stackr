import {
  cleanText,
  collectorNumberParts,
  normaliseVariantCode,
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

const DEFAULT_BASE_URL = 'https://api.pokemontcg.io/v2';
const PAGE_SIZE = 250;

type PokemonTcgAdapterOptions = {
  apiKey?: string;
  baseUrl?: string;
  licenceStatus?: LicenceStatus;
  assetLicenceStatus?: LicenceStatus;
  maxAttempts?: number;
  retryBaseMs?: number;
  capturedSetResponse?: PokemonTcgCapturedResponse;
  capturedCardPageResponses?: PokemonTcgCapturedResponse[];
};

export type PokemonTcgCapturedResponse = {
  url: string;
  envelope: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

function headerMetadata(response: Response, responseTimeMs: number) {
  return {
    status: response.status,
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified'),
    cacheControl: response.headers.get('cache-control'),
    retryAfter: response.headers.get('retry-after'),
    responseDate: response.headers.get('date'),
    responseTimeMs,
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function responseData(payload: Record<string, unknown>) {
  return objectValue(payload.data);
}

function codeValue(value: unknown) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function isoDate(value: unknown) {
  const raw = cleanText(value);
  if (!raw) return null;
  const normalized = raw.replaceAll('/', '-');
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function integerValue(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function errorIssue(code: string, message: string, path: string): ValidationIssue {
  return { code, severity: 'error', message, path };
}

export class PokemonTcgSourceAdapter implements SourceAdapter {
  readonly apiKey?: string;
  readonly baseUrl: string;
  readonly licenceStatus: LicenceStatus;
  readonly assetLicenceStatus: LicenceStatus;
  readonly maxAttempts: number;
  readonly retryBaseMs: number;
  private readonly setResponses = new Map<string, Promise<PokemonTcgCapturedResponse>>();
  private readonly cardPageResponses = new Map<string, Promise<PokemonTcgCapturedResponse[]>>();

  constructor(options: PokemonTcgAdapterOptions = {}) {
    this.apiKey = cleanText(options.apiKey) ?? undefined;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.licenceStatus = options.licenceStatus ?? 'under_review';
    this.assetLicenceStatus = options.assetLicenceStatus ?? 'under_review';
    this.maxAttempts = Math.max(1, Math.trunc(options.maxAttempts ?? 3));
    this.retryBaseMs = Math.max(0, Math.trunc(options.retryBaseMs ?? 1_000));
    if (options.capturedSetResponse) {
      const setId = cleanText(responseData(options.capturedSetResponse.envelope).id);
      if (!setId) throw new Error('Captured Pokemon TCG set response is missing data.id.');
      this.setResponses.set(setId, Promise.resolve(options.capturedSetResponse));
      if (options.capturedCardPageResponses?.length) {
        this.cardPageResponses.set(setId, Promise.resolve(options.capturedCardPageResponses));
      }
    }
  }

  identifySource(): SourceIdentity {
    return {
      code: 'pokemon_tcg_api',
      displayName: 'Pokemon TCG API',
      sourceType: 'catalogue',
      baseUrl: this.baseUrl,
      termsUrl: 'https://docs.pokemontcg.io/',
      licenceStatus: this.licenceStatus,
      attributionRequired: true,
      robotsPolicy: 'official_api_only_no_scraping',
      rateLimitConfig: {
        documentation: 'https://docs.pokemontcg.io/getting-started/rate-limits',
        explicitSetOnly: true,
      },
      capabilities: ['sets', 'cards', 'conditional_requests'],
      automatedRefreshAllowed: false,
    };
  }

  private setId(scope: FetchScope) {
    const setId = cleanText(scope.setId ?? scope.providerRecordId);
    if (!setId) throw new Error('Pokemon TCG API ingestion requires an explicit setId.');
    return setId;
  }

  private async fetchJson(path: string, scope: FetchScope = {}): Promise<PokemonTcgCapturedResponse> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.apiKey) headers['X-Api-Key'] = this.apiKey;
    if (scope.conditionalHeaders?.etag) headers['If-None-Match'] = scope.conditionalHeaders.etag;
    if (scope.conditionalHeaders?.lastModified) headers['If-Modified-Since'] = scope.conditionalHeaders.lastModified;

    const attempts: Record<string, unknown>[] = [];
    for (let attempt = 0; attempt < this.maxAttempts; attempt += 1) {
      const startedAt = Date.now();
      const response = await fetch(url, { headers });
      const text = await response.text();
      const currentMetadata = {
        ...headerMetadata(response, Date.now() - startedAt),
        endpoint: url,
        attempt: attempt + 1,
      };
      attempts.push(currentMetadata);
      const metadata = { ...currentMetadata, attempts };
      if (response.status === 401 || response.status === 403) {
        const error = new Error(`Pokemon TCG API request forbidden for ${url}`);
        Object.assign(error, { responseStatus: response.status, metadata });
        throw error;
      }
      if (response.ok) {
        const envelope = text ? JSON.parse(text) as Record<string, unknown> : {};
        return { url, envelope, metadata };
      }

      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt + 1 < this.maxAttempts) {
        const retryAfterSeconds = Number(response.headers.get('retry-after'));
        const delayMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? retryAfterSeconds * 1_000
          : this.retryBaseMs * (2 ** attempt);
        if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      const error = new Error(`Pokemon TCG API request failed (${response.status}) for ${url}: ${text.slice(0, 240)}`);
      Object.assign(error, { responseStatus: response.status, metadata });
      throw error;
    }
    throw new Error(`Pokemon TCG API retry loop exhausted for ${url}`);
  }

  private setResponse(scope: FetchScope) {
    const setId = this.setId(scope);
    const existing = this.setResponses.get(setId);
    if (existing) return existing;
    const response = this.fetchJson(`/sets/${encodeURIComponent(setId)}`, scope);
    this.setResponses.set(setId, response);
    return response;
  }

  private cardPages(scope: FetchScope) {
    const setId = this.setId(scope);
    const existing = this.cardPageResponses.get(setId);
    if (existing) return existing;
    const response = (async () => {
      const pages: PokemonTcgCapturedResponse[] = [];
      let page = 1;
      let retrieved = 0;
      while (true) {
        const query = new URLSearchParams({
          q: `set.id:${setId}`,
          pageSize: String(PAGE_SIZE),
          page: String(page),
          orderBy: 'number',
        });
        const current = await this.fetchJson(`/cards?${query.toString()}`, scope);
        pages.push(current);
        const data = Array.isArray(current.envelope.data) ? current.envelope.data : [];
        retrieved += data.length;
        const totalCount = Number(current.envelope.totalCount ?? retrieved);
        if (data.length === 0 || retrieved >= totalCount) break;
        page += 1;
      }
      return pages;
    })();
    this.cardPageResponses.set(setId, response);
    return response;
  }

  async healthCheck(scope: FetchScope = {}): Promise<SourceHealth> {
    try {
      const result = await this.setResponse(scope);
      return {
        status: 'ok',
        responseStatus: Number(result.metadata.status),
        responseTimeMs: Number(result.metadata.responseTimeMs),
        capabilities: {
          sets: true,
          cards: true,
          variants: false,
          assets: this.assetLicenceStatus === 'approved',
          conditional_requests: true,
        },
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
    const result = await this.setResponse(scope);
    const set = responseData(result.envelope);
    const setId = cleanText(set.id) ?? this.setId(scope);
    return [{
      provider: 'pokemon_tcg_api',
      providerRecordId: setId,
      recordType: 'set' as const,
      languageCode: 'en',
      sourceUrl: result.url,
      sourceEndpoint: result.url,
      providerUpdatedAt: cleanText(set.updatedAt),
      licenceStatus: this.licenceStatus,
      attributionText: 'Pokemon TCG API',
      httpMetadata: result.metadata,
      payload: result.envelope,
    }];
  }

  async fetchCards(scope: FetchScope = {}) {
    const set = responseData((await this.setResponse(scope)).envelope);
    const pages = await this.cardPages(scope);
    const setId = this.setId(scope);
    const records: ProviderRecord[] = [];
    let remaining = scope.limit ?? Number.POSITIVE_INFINITY;

    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index];
      records.push({
        provider: 'pokemon_tcg_api',
        providerRecordId: `${setId}:cards:page:${index + 1}`,
        recordType: 'other',
        languageCode: 'en',
        sourceUrl: page.url,
        sourceEndpoint: page.url,
        providerUpdatedAt: cleanText(set.updatedAt),
        licenceStatus: this.licenceStatus,
        attributionText: 'Pokemon TCG API',
        httpMetadata: { ...page.metadata, page: index + 1 },
        payload: page.envelope,
      });

      const cards = Array.isArray(page.envelope.data) ? page.envelope.data : [];
      for (const value of cards.slice(0, remaining)) {
        const card = objectValue(value);
        const providerRecordId = cleanText(card.id);
        if (!providerRecordId) continue;
        records.push({
          provider: 'pokemon_tcg_api',
          providerRecordId,
          recordType: 'card',
          languageCode: 'en',
          sourceUrl: page.url,
          sourceEndpoint: page.url,
          providerUpdatedAt: cleanText(card.updatedAt ?? objectValue(card.set).updatedAt ?? set.updatedAt),
          licenceStatus: this.licenceStatus,
          attributionText: 'Pokemon TCG API',
          httpMetadata: { ...page.metadata, page: index + 1 },
          payload: card,
        });
        remaining -= 1;
        if (remaining <= 0) break;
      }
      if (remaining <= 0) break;
    }
    return records;
  }

  async fetchVariants(_scope: FetchScope = {}) {
    // The provider does not expose independent finish/parallel records.
    // Each card response already creates the base canonical variant.
    return [];
  }

  async fetchAssets(scope: FetchScope = {}) {
    if (this.assetLicenceStatus !== 'approved') return [];
    const records = await this.fetchCards(scope);
    return records
      .filter((record) => record.recordType === 'card')
      .flatMap((record) => {
        const images = objectValue(record.payload.images);
        return ['small', 'large'].flatMap((size) => {
          const url = cleanText(images[size]);
          if (!url) return [];
          return [{
            ...record,
            providerRecordId: `${record.providerRecordId}:image:${size}`,
            recordType: 'asset' as const,
            licenceStatus: this.assetLicenceStatus,
            payload: {
              ...record.payload,
              _stackrAssetType: 'card_image',
              _stackrAssetSize: size,
              _stackrAssetUrl: url,
            },
          }];
        });
      });
  }

  normaliseRecord(record: ProviderRecord): NormalisedRecord {
    const payload = record.recordType === 'set' ? responseData(record.payload) : record.payload;
    const set = record.recordType === 'set' ? payload : objectValue(payload.set);
    const collector = collectorNumberParts(payload.number);
    const seriesName = cleanText(set.series);
    const variantCode = normaliseVariantCode(payload._stackrVariantCode ?? 'normal');
    const imageUrl = record.recordType === 'asset' ? cleanText(payload._stackrAssetUrl) : null;
    return {
      provider: record.provider,
      providerRecordId: record.providerRecordId,
      recordType: record.recordType,
      gameCode: 'pokemon',
      languageCode: 'en',
      seriesCode: seriesName ? codeValue(seriesName) : null,
      seriesNativeName: seriesName,
      seriesEnglishDisplayName: seriesName,
      setCode: cleanText(set.ptcgoCode ?? set.id),
      providerSetId: cleanText(set.id),
      setReleaseDate: isoDate(set.releaseDate),
      setPrintedTotal: integerValue(set.printedTotal),
      setTotal: integerValue(set.total),
      collectorNumber: collector.collectorNumber || null,
      collectorNumberPrefix: collector.collectorNumberPrefix,
      collectorNumberSort: collector.collectorNumberSort,
      collectorNumberSuffix: collector.collectorNumberSuffix,
      collectorNumberSortKey: collector.collectorNumberSortKey,
      nativeName: cleanText(payload.name),
      englishDisplayName: cleanText(payload.name),
      rarityCode: cleanText(payload.rarity) ? codeValue(payload.rarity) : null,
      variantCode,
      finishCode: null,
      artworkKey: null,
      imageUrl,
      assetType: cleanText(payload._stackrAssetType) as NormalisedRecord['assetType'] ?? 'card_image',
      sourceConfidence: 0.95,
      sourceUpdatedAt: record.providerUpdatedAt,
      licenceStatus: record.licenceStatus,
      raw: record.payload,
    };
  }

  validateRecord(record: ProviderRecord) {
    const result = validateProviderRecord(record);
    const issues = [...result.issues];
    const payload = record.recordType === 'set' ? responseData(record.payload) : record.payload;
    if (record.recordType === 'set') {
      if (!cleanText(payload.id)) issues.push(errorIssue('set_id_required', 'Set ID is required.', 'data.id'));
      if (!cleanText(payload.name)) issues.push(errorIssue('set_name_required', 'Set name is required.', 'data.name'));
    }
    if (['card', 'variant', 'asset'].includes(record.recordType)) {
      if (!cleanText(payload.id)) issues.push(errorIssue('card_id_required', 'Card ID is required.', 'id'));
      if (!cleanText(payload.number)) issues.push(errorIssue('collector_number_required', 'Collector number is required.', 'number'));
      if (!cleanText(payload.name)) issues.push(errorIssue('card_name_required', 'Card name is required.', 'name'));
      if (!cleanText(objectValue(payload.set).id)) issues.push(errorIssue('card_set_id_required', 'Card set ID is required.', 'set.id'));
    }
    if (record.recordType === 'other' && !Array.isArray(record.payload.data)) {
      issues.push(errorIssue('response_data_required', 'Card page response must contain a data array.', 'data'));
    }
    return { ok: issues.every((issue) => issue.severity !== 'error'), issues };
  }
}
