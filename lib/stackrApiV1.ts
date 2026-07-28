import { PRICE_API_URL } from './config';

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

type FetchLike = typeof fetch;

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
};

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

export class StackrApiV1Client {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly headers: Record<string, string>;

  constructor(options: StackrApiV1ClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? `${PRICE_API_URL}/v1`;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.headers = {
      'X-Stackr-Api-Version': '1',
      ...(options.headers ?? {}),
    };
  }

  private async request<T>(
    path: string,
    query?: Record<string, string | number | boolean | null | undefined>,
    init: RequestInit = {},
  ): Promise<StackrApiEnvelope<T>> {
    const response = await this.fetchImpl(buildUrl(this.baseUrl, path, query), {
      ...init,
      headers: {
        ...this.headers,
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

  search(query: { q: string; language?: StackrApiLanguageCode; setId?: string; limit?: number }) {
    return this.request<{ query: string; normalizedQuery: string; results: StackrSearchResult[] }>('/search', query);
  }
}

export const stackrApiV1 = new StackrApiV1Client();
