import {
  cleanText,
  collectorNumberParts,
  normaliseFinishCode,
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

const DEFAULT_BASE_URL = 'https://api.pikaqian.com/v1';
const PIKAQIAN_LANGUAGE = 'zh-cn';

type PikaQianAdapterOptions = {
  apiKey?: string | null;
  baseUrl?: string | null;
  language?: string | null;
  licenceStatus?: LicenceStatus;
  assetLicenceStatus?: LicenceStatus;
};

function assertPikaQianLanguage(language: unknown, context = 'language') {
  const normalised = normaliseLanguageCode(language ?? PIKAQIAN_LANGUAGE);
  if (normalised !== PIKAQIAN_LANGUAGE) {
    throw new Error(`PikaQian only supports zh-cn catalogue ${context}; received ${normalised}.`);
  }
  return normalised;
}

function valueAt(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value != null && String(value).trim() !== '') return value;
  }
  return null;
}

function unwrapList(value: unknown) {
  if (Array.isArray(value)) return { data: value, pagination: null };
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return {
      data: Array.isArray(object.data) ? object.data : [],
      pagination: object.pagination && typeof object.pagination === 'object'
        ? object.pagination as Record<string, unknown>
        : null,
    };
  }
  return { data: [], pagination: null };
}

function nextCursorFrom(value: Record<string, unknown> | null) {
  return cleanText(value?.next_cursor ?? value?.nextCursor);
}

function setIdFromCard(card: Record<string, unknown>) {
  const nestedSet = card.set && typeof card.set === 'object' ? card.set as Record<string, unknown> : {};
  return cleanText(valueAt(card, 'set_id', 'setId') ?? valueAt(nestedSet, 'id', 'set_id', 'setId'));
}

function imageUrlFrom(card: Record<string, unknown>) {
  return cleanText(valueAt(card, 'image_url', 'imageUrl', 'image', 'card_image_url', 'cardImageUrl'));
}

function optionalPositiveInteger(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.trunc(parsed);
}

function actualCardCountFrom(set: Record<string, unknown>) {
  const cardCount = set.card_count && typeof set.card_count === 'object'
    ? set.card_count as Record<string, unknown>
    : set.cardCount && typeof set.cardCount === 'object'
    ? set.cardCount as Record<string, unknown>
    : {};
  return optionalPositiveInteger(
    valueAt(set, 'actual_total', 'actualTotal', 'total')
      ?? valueAt(cardCount, 'actual', 'total'),
  );
}

function variantFrom(card: Record<string, unknown>) {
  return normaliseVariantCode(valueAt(card, 'variant_code', 'variantCode', 'variant', 'finish') ?? 'normal');
}

function finishFrom(card: Record<string, unknown>) {
  const variant = variantFrom(card);
  return normaliseFinishCode(valueAt(card, 'finish_code', 'finishCode', 'finish', 'variant') ?? variant) ?? 'normal';
}

function sourceUrlFrom(baseUrl: string, path: string, query?: URLSearchParams) {
  const suffix = query?.toString();
  return `${baseUrl}${path}${suffix ? `?${suffix}` : ''}`;
}

function providerErrorFrom(text: string) {
  try {
    const body = JSON.parse(text) as Record<string, unknown>;
    const providerError = body.error && typeof body.error === 'object'
      ? body.error as Record<string, unknown>
      : {};
    return {
      code: cleanText(providerError.code),
      message: cleanText(providerError.message),
      requestId: cleanText(providerError.request_id ?? providerError.requestId),
    };
  } catch {
    return { code: null, message: null, requestId: null };
  }
}

export class PikaQianApiSourceAdapter implements SourceAdapter {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly licenceStatus: LicenceStatus;
  readonly assetLicenceStatus: LicenceStatus;
  readonly language = PIKAQIAN_LANGUAGE;
  readonly cardRecordCache = new Map<string, Promise<ProviderRecord[]>>();

  constructor(options: PikaQianAdapterOptions = {}) {
    assertPikaQianLanguage(options.language);
    this.apiKey = cleanText(options.apiKey ?? process.env.PIKAQIAN_API_KEY) ?? '';
    if (!this.apiKey) {
      throw new Error('PikaQian API ingestion requires PIKAQIAN_API_KEY. Do not pass live keys on the command line.');
    }
    this.baseUrl = (options.baseUrl ?? process.env.PIKAQIAN_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.licenceStatus = options.licenceStatus ?? 'under_review';
    this.assetLicenceStatus = options.assetLicenceStatus ?? 'under_review';
  }

  identifySource(): SourceIdentity {
    return {
      code: 'pikaqian',
      displayName: 'PikaQian',
      sourceType: 'catalogue',
      baseUrl: this.baseUrl,
      termsUrl: 'https://pikaqian.com/',
      licenceStatus: this.licenceStatus,
      attributionRequired: true,
      robotsPolicy: 'api_key_required_metadata_first',
      rateLimitConfig: { authHeader: 'X-API-Key', tier: 'metadata_first' },
      capabilities: ['sets', 'cards', 'variants', 'assets', 'conditional_requests'],
      automatedRefreshAllowed: false,
    };
  }

  async fetchJson(path: string, query?: URLSearchParams) {
    const startedAt = Date.now();
    const url = sourceUrlFrom(this.baseUrl, path, query);
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'X-API-Key': this.apiKey,
        'User-Agent': 'Stackr-Catalogue-Ingestion/1.0 (+https://stackrtcg.com)',
      },
    });
    const text = await response.text();
    const metadata = {
      status: response.status,
      responseTimeMs: Date.now() - startedAt,
      endpoint: url,
      rateLimit: response.headers.get('x-ratelimit-limit'),
      rateLimitRemaining: response.headers.get('x-ratelimit-remaining'),
      rateLimitReset: response.headers.get('x-ratelimit-reset'),
      retryAfter: response.headers.get('retry-after'),
      contentType: response.headers.get('content-type'),
      edgeServer: response.headers.get('server'),
      edgeRequestId: response.headers.get('cf-ray'),
      edgeMitigation: response.headers.get('cf-mitigated'),
    };
    if (response.status === 401 || response.status === 403) {
      const providerError = providerErrorFrom(text);
      const suffix = providerError.code ? ` (${providerError.code})` : '';
      const error = new Error(`PikaQian request was forbidden${suffix}. Check the staging PIKAQIAN_API_KEY.`);
      Object.assign(metadata, {
        providerErrorCode: providerError.code,
        providerRequestId: providerError.requestId,
      });
      Object.assign(error, { responseStatus: response.status, metadata });
      throw error;
    }
    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      const error = new Error(
        `PikaQian quota exhausted. Stop this snapshot and resume after Retry-After${retryAfter ? ` (${retryAfter} seconds)` : ''}.`,
      );
      Object.assign(error, {
        code: 'pikaqian_quota_exhausted',
        responseStatus: response.status,
        retryAfter,
        metadata,
      });
      throw error;
    }
    if (!response.ok) {
      const error = new Error(`PikaQian request failed (${response.status}) for ${url}: ${text.slice(0, 240)}`);
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
      const query = new URLSearchParams({ page_size: '1' });
      const result = await this.fetchJson('/sets', query);
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

  async fetchPaged(path: string, initialQuery: Record<string, string>, scope: FetchScope = {}) {
    const records: Record<string, unknown>[] = [];
    let cursor = cleanText(scope.cursor?.nextCursor);
    const recordLimit = scope.limit ?? Number.POSITIVE_INFINITY;
    const pageSize = Math.min(Math.max(1, Number(scope.limit ?? 100)), 100);
    while (records.length < recordLimit) {
      const query = new URLSearchParams({ ...initialQuery, page_size: String(pageSize) });
      if (cursor) query.set('cursor', cursor);
      const result = await this.fetchJson(path, query);
      const { data, pagination } = unwrapList(result.value);
      const remaining = Number.isFinite(recordLimit)
        ? Math.max(0, recordLimit - records.length)
        : data.length;
      records.push(...data.slice(0, remaining) as Record<string, unknown>[]);
      cursor = nextCursorFrom(pagination);
      if (!cursor || data.length === 0) break;
    }
    return records;
  }

  async fetchSets(scope: FetchScope = {}) {
    assertPikaQianLanguage(scope.language, 'fetch scope');
    const rows = await this.fetchPaged('/sets', {}, scope);
    return rows.map((set) => ({
      provider: 'pikaqian',
      providerRecordId: cleanText(valueAt(set, 'id', 'set_id', 'setId')) ?? 'unknown-set',
      recordType: 'set' as const,
      languageCode: PIKAQIAN_LANGUAGE,
      sourceUrl: `${this.baseUrl}/sets`,
      sourceEndpoint: `${this.baseUrl}/sets`,
      providerUpdatedAt: cleanText(valueAt(set, 'updated_at', 'updatedAt')),
      licenceStatus: this.licenceStatus,
      attributionText: 'PikaQian',
      httpMetadata: { provider: 'pikaqian' },
      payload: { ...set, provider: 'pikaqian', language_code: PIKAQIAN_LANGUAGE },
    }));
  }

  async fetchCards(scope: FetchScope = {}) {
    assertPikaQianLanguage(scope.language, 'fetch scope');
    const cacheKey = JSON.stringify({
      setId: scope.setId ?? null,
      limit: scope.limit ?? null,
      cursor: scope.cursor ?? null,
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
    if (!scope.setId) return [];
    const requestedSetId = scope.setId;
    const rows = await this.fetchPaged('/cards', { set_id: requestedSetId }, scope);
    return rows.map((card) => {
      const providerRecordId = cleanText(valueAt(card, 'id', 'card_id', 'cardId')) ?? `pikaqian-card:${requestedSetId}`;
      return {
        provider: 'pikaqian',
        providerRecordId,
        recordType: 'card' as const,
        languageCode: PIKAQIAN_LANGUAGE,
        sourceUrl: `${this.baseUrl}/cards?set_id=${encodeURIComponent(requestedSetId)}`,
        sourceEndpoint: `${this.baseUrl}/cards?set_id=${encodeURIComponent(requestedSetId)}`,
        providerUpdatedAt: cleanText(valueAt(card, 'updated_at', 'updatedAt')),
        licenceStatus: this.licenceStatus,
        attributionText: 'PikaQian',
        httpMetadata: { provider: 'pikaqian', setId: requestedSetId },
        payload: {
          ...card,
          provider: 'pikaqian',
          language_code: PIKAQIAN_LANGUAGE,
          set_id: setIdFromCard(card) ?? requestedSetId,
        },
      };
    });
  }

  async fetchCardDetail(card: ProviderRecord): Promise<ProviderRecord> {
    const providerRecordId = cleanText(valueAt(card.payload, 'id', 'card_id', 'cardId')) ?? card.providerRecordId;
    const result = await this.fetchJson(`/cards/${encodeURIComponent(providerRecordId)}`);
    const detail = result.value && typeof result.value === 'object' && !Array.isArray(result.value)
      ? result.value as Record<string, unknown>
      : {};
    return {
      ...card,
      sourceUrl: result.url,
      sourceEndpoint: result.url,
      providerUpdatedAt: cleanText(valueAt(detail, 'updated_at', 'updatedAt')) ?? card.providerUpdatedAt,
      httpMetadata: { ...card.httpMetadata, ...result.metadata },
      payload: {
        ...card.payload,
        ...detail,
        provider: 'pikaqian',
        language_code: PIKAQIAN_LANGUAGE,
        set_id: setIdFromCard(detail) ?? setIdFromCard(card.payload) ?? card.payload.set_id,
      },
    };
  }

  async fetchVariants(scope: FetchScope = {}) {
    assertPikaQianLanguage(scope.language, 'fetch scope');
    return [];
  }

  async fetchAssets(scope?: FetchScope) {
    const cards = await this.fetchCards(scope);
    return cards.flatMap((card) => {
      const imageUrl = imageUrlFrom(card.payload);
      if (!imageUrl) return [];
      const variant = variantFrom(card.payload);
      const finish = finishFrom(card.payload);
      return [{
        ...card,
        providerRecordId: `${card.providerRecordId}:${variant}:${finish}:image`,
        recordType: 'asset' as const,
        licenceStatus: this.assetLicenceStatus,
        payload: {
          ...card.payload,
          variant,
          finish,
          image_url: imageUrl,
          image_language_code: PIKAQIAN_LANGUAGE,
          asset_type: 'card_image',
        },
      }];
    });
  }

  normaliseRecord(record: ProviderRecord): NormalisedRecord {
    const payload = record.payload;
    const collector = collectorNumberParts(valueAt(
      payload,
      'collector_number',
      'collectorNumber',
      'card_number',
      'cardNumber',
      'local_id',
      'localId',
      'number',
    ));
    const setId = setIdFromCard(payload) ?? cleanText(valueAt(payload, 'id', 'set_id', 'setId'));
    const actualCardCount = actualCardCountFrom(payload);
    const variant = variantFrom(payload);
    const finish = finishFrom(payload);
    const imageUrl = imageUrlFrom(payload);
    return {
      provider: record.provider,
      providerRecordId: record.providerRecordId,
      recordType: record.recordType,
      gameCode: 'pokemon',
      languageCode: normaliseLanguageCode(record.languageCode ?? PIKAQIAN_LANGUAGE),
      setCode: setId,
      providerSetId: setId,
      collectorNumber: collector.collectorNumber || null,
      collectorNumberPrefix: collector.collectorNumberPrefix,
      collectorNumberSort: collector.collectorNumberSort,
      collectorNumberSuffix: collector.collectorNumberSuffix,
      collectorNumberSortKey: collector.collectorNumberSortKey,
      nativeName: cleanText(valueAt(payload, 'local_name', 'localName', 'name', 'card_name', 'cardName')),
      englishDisplayName: cleanText(valueAt(payload, 'english_name', 'englishName', 'name_en', 'nameEn', 'name')),
      printedTotal: actualCardCount,
      total: actualCardCount,
      rarityCode: cleanText(valueAt(payload, 'rarity_code', 'rarityCode', 'rarity'))?.toLowerCase().replace(/[^a-z0-9]+/g, '_') ?? null,
      variantCode: variant,
      finishCode: finish,
      artworkKey: imageUrl ? `pikaqian:${imageUrl}` : null,
      imageUrl,
      imageLanguageCode: cleanText(valueAt(payload, 'image_language_code', 'imageLanguageCode')) ?? PIKAQIAN_LANGUAGE,
      imageSha256: cleanText(valueAt(payload, 'image_sha256', 'imageSha256', 'content_sha256', 'contentSha256', 'sha256')),
      imagePerceptualHash: cleanText(valueAt(payload, 'image_perceptual_hash', 'imagePerceptualHash', 'perceptual_hash', 'perceptualHash')),
      assetType: cleanText(valueAt(payload, 'asset_type', 'assetType')) as NormalisedRecord['assetType'] ?? 'card_image',
      sourceConfidence: Number(valueAt(payload, 'source_confidence', 'sourceConfidence', 'confidence') ?? 0.84),
      sourceUpdatedAt: record.providerUpdatedAt,
      licenceStatus: record.licenceStatus,
      raw: payload,
    };
  }

  validateRecord(record: ProviderRecord) {
    return validateProviderRecord(record);
  }
}
