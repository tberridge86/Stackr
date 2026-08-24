import { createHash } from 'node:crypto';
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
  type ValidationIssue,
  validateProviderRecord,
} from './sourceAdapter';

const DEFAULT_BASE_URL = 'https://www.pokemon-card.com';
const SEARCH_PATH = '/card-search/resultAPI.php';
const DETAIL_PATH_PREFIX = '/card-search/details.php/card';
const OFFICIAL_PAGE_SIZE = 39;
const DEFAULT_BATCH_LIMIT = OFFICIAL_PAGE_SIZE;
const MAX_BATCH_LIMIT = 500;
const DEFAULT_DETAIL_CONCURRENCY = 2;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const MAX_REQUEST_ATTEMPTS = 3;
const ATTRIBUTION = 'Pokémon Card Game Trainers Website (Japan)';

type FetchLike = typeof fetch;

type PokemonCardJpAdapterOptions = {
  language?: string;
  baseUrl?: string;
  licenceStatus?: LicenceStatus;
  assetLicenceStatus?: LicenceStatus;
  fetchImpl?: FetchLike;
  detailConcurrency?: number;
};

type ResponseMetadata = {
  status: number;
  etag: string | null;
  lastModified: string | null;
  cacheControl: string | null;
  retryAfter: string | null;
  contentType: string | null;
  contentLength: number;
  responseSha256: string;
  responseTimeMs: number;
  endpoint: string;
  attempts: number;
};

type OfficialCardReference = {
  cardID: string;
  cardThumbFile?: string | null;
  cardNameAltText?: string | null;
  cardNameViewText?: string | null;
};

type OfficialSearchResponse = {
  result: number;
  errMsg?: string | null;
  thisPage: number;
  maxPage: number;
  hitCnt: number;
  regulation: string;
  searchCondition: string[];
  cardList: OfficialCardReference[];
};

type OfficialSearchBatch = {
  cards: OfficialCardReference[];
  hitCount: number;
  maxPage: number;
  regulation: string;
  searchCondition: string[];
  sourceEndpoint: string;
  httpMetadata: ResponseMetadata;
};

type ParsedProductLink = {
  name: string;
  url: string;
};

type ParsedOfficialCardDetail = {
  name: string | null;
  setCode: string | null;
  collectorNumber: string | null;
  printedTotal: number | null;
  imageUrl: string | null;
  artist: string | null;
  rarityProviderCode: string | null;
  supertype: 'pokemon' | 'trainer' | 'energy' | null;
  stage: string | null;
  hp: number | null;
  productLinks: ParsedProductLink[];
  detailParserVersion: string;
};

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function normaliseOfficialRarityCode(value: unknown): string | null {
  const cleaned = cleanText(value);
  if (!cleaned || /^none$/iu.test(cleaned)) return null;
  const code = cleaned.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return code || null;
}

function optionalNonNegativeInteger(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.trunc(parsed);
}

function positiveInteger(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
}

function scopeOffset(scope: FetchScope) {
  return optionalNonNegativeInteger(scope.cursor?.offset) ?? 0;
}

function boundedLimit(scope: FetchScope) {
  const limit = scope.limit == null ? DEFAULT_BATCH_LIMIT : optionalNonNegativeInteger(scope.limit);
  if (limit == null) throw new Error('Official Japanese catalogue --limit must be a non-negative integer.');
  if (limit > MAX_BATCH_LIMIT) {
    throw new Error(`Official Japanese catalogue batches are limited to ${MAX_BATCH_LIMIT} cards; use --offset to resume.`);
  }
  return limit;
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

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
) {
  if (values.length === 0) return [];
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

function decodeHtml(value: string) {
  const named: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  };
  return value
    .replace(/&#x([0-9a-f]+);/giu, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#([0-9]+);/gu, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&([a-z]+);/giu, (match, entity: string) => named[entity.toLowerCase()] ?? match);
}

function stripHtml(value: string) {
  return decodeHtml(value)
    .replace(/<br\s*\/?>/giu, '\n')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/[\t\r ]+/gu, ' ')
    .replace(/ *\n */gu, '\n')
    .trim();
}

function attribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'iu'));
  return match ? decodeHtml(match[2]).trim() : null;
}

function tagWithClass(html: string, tagName: string, classToken: string) {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>`, 'giu');
  for (const match of html.matchAll(pattern)) {
    const tag = match[0];
    const classes = attribute(tag, 'class')?.split(/\s+/u) ?? [];
    if (classes.includes(classToken)) return tag;
  }
  return null;
}

function contentWithClass(html: string, tagName: string, classToken: string) {
  const openingPattern = new RegExp(`<${tagName}\\b[^>]*>`, 'giu');
  for (const opening of html.matchAll(openingPattern)) {
    const classes = attribute(opening[0], 'class')?.split(/\s+/u) ?? [];
    if (!classes.includes(classToken) || opening.index == null) continue;
    const contentStart = opening.index + opening[0].length;
    const tokenPattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'giu');
    tokenPattern.lastIndex = contentStart;
    let depth = 1;
    for (let token = tokenPattern.exec(html); token; token = tokenPattern.exec(html)) {
      if (token[0].startsWith('</')) depth -= 1;
      else if (!token[0].endsWith('/>')) depth += 1;
      if (depth === 0) return html.slice(contentStart, token.index);
    }
  }
  return null;
}

function firstHeading(html: string, level: number, classToken?: string) {
  const tagName = `h${level}`;
  const pattern = new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}>`, 'giu');
  for (const match of html.matchAll(pattern)) {
    if (classToken) {
      const classes = attribute(`<${tagName}${match[1]}>`, 'class')?.split(/\s+/u) ?? [];
      if (!classes.includes(classToken)) continue;
    }
    return cleanText(stripHtml(match[2]));
  }
  return null;
}

function absoluteOfficialUrl(value: unknown, baseUrl: string) {
  const cleaned = cleanText(value);
  if (!cleaned) return null;
  try {
    const base = new URL(baseUrl);
    const resolved = new URL(cleaned, `${base.href.replace(/\/$/u, '')}/`);
    if (resolved.origin !== base.origin) return null;
    return resolved.href;
  } catch {
    return null;
  }
}

function parseCollectorText(value: string, logoCode: string | null) {
  const text = stripHtml(value).replace(/\s+/gu, ' ').trim();
  const fraction = text.match(/^([^/]+?)\s*\/\s*([^/]+?)(?:\s|$)/u);
  if (fraction) {
    const collectorNumber = cleanText(fraction[1]?.normalize('NFKC'));
    const denominator = cleanText(fraction[2]?.normalize('NFKC'));
    const printedTotal = denominator && /^\d+$/u.test(denominator) ? Number.parseInt(denominator, 10) : null;
    const setCode = denominator && !/^\d+$/u.test(denominator) ? denominator : logoCode;
    return { setCode, collectorNumber, printedTotal, displayText: text };
  }

  const standalonePromoCode = text.match(/^([A-Z0-9]+-P)$/iu)?.[1] ?? null;
  return {
    setCode: standalonePromoCode ?? logoCode,
    collectorNumber: null,
    printedTotal: null,
    displayText: text,
  };
}

function parseProductLinks(html: string, baseUrl: string) {
  const popupStart = html.search(/class=["'][^"']*\bPopupSub\b/iu);
  if (popupStart < 0) return [];
  const popup = html.slice(popupStart, html.indexOf('</section>', popupStart) >= 0
    ? html.indexOf('</section>', popupStart)
    : undefined);
  const links: ParsedProductLink[] = [];
  const pattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/giu;
  for (const match of popup.matchAll(pattern)) {
    const href = attribute(`<a${match[1]}>`, 'href');
    const name = cleanText(stripHtml(match[2]));
    const url = absoluteOfficialUrl(href, baseUrl);
    if (!url || !name || /javascript:/iu.test(href ?? '')) continue;
    links.push({ name, url });
  }
  return links;
}

function parseOfficialCardDetail(html: string, baseUrl = DEFAULT_BASE_URL): ParsedOfficialCardDetail {
  const name = firstHeading(html, 1, 'Heading1');
  const cardImageTag = tagWithClass(html, 'img', 'fit');
  const setImageTag = tagWithClass(html, 'img', 'img-regulation');
  const subtext = contentWithClass(html, 'div', 'subtext') ?? '';
  const logoCode = cleanText(attribute(setImageTag ?? '', 'alt'));
  const collector = parseCollectorText(subtext, logoCode);
  const imageUrl = absoluteOfficialUrl(attribute(cardImageTag ?? '', 'src'), baseUrl);
  const author = contentWithClass(html, 'div', 'author');
  const artist = author
    ? cleanText(stripHtml(author.replace(/<h4\b[^>]*>[\s\S]*?<\/h4>/iu, '')))
    : null;
  const rarityMatch = subtext.match(/\/rarity\/ic_rare_([^./"']+)\.(?:gif|png|webp)/iu);
  const rarityProviderCode = cleanText(rarityMatch?.[1]);
  const hpText = contentWithClass(html, 'span', 'hp-num');
  const hp = positiveInteger(stripHtml(hpText ?? ''));
  const stage = cleanText(stripHtml(contentWithClass(html, 'span', 'type') ?? ''));
  const category = firstHeading(contentWithClass(html, 'div', 'RightBox-inner') ?? html, 2);
  const supertype = hp != null
    ? 'pokemon'
    : category?.includes('エネルギー')
      ? 'energy'
      : category
        ? 'trainer'
        : null;

  return {
    name,
    setCode: collector.setCode,
    collectorNumber: collector.collectorNumber,
    printedTotal: collector.printedTotal,
    imageUrl,
    artist,
    rarityProviderCode,
    supertype,
    stage,
    hp,
    productLinks: parseProductLinks(html, baseUrl),
    detailParserVersion: 'pokemon-card-jp-html-v1',
  };
}

function parseSearchResponse(value: unknown): OfficialSearchResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Official Japanese catalogue returned a non-object search response.');
  }
  const payload = value as Record<string, unknown>;
  if (Number(payload.result) !== 1) {
    throw new Error(`Official Japanese catalogue search failed: ${cleanText(payload.errMsg) ?? 'unknown provider error'}`);
  }
  if (!Array.isArray(payload.cardList)) {
    throw new Error('Official Japanese catalogue search response is missing cardList.');
  }
  const cardList = payload.cardList.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const cardID = cleanText(record.cardID);
    if (!cardID) return [];
    return [{
      cardID,
      cardThumbFile: cleanText(record.cardThumbFile),
      cardNameAltText: cleanText(record.cardNameAltText),
      cardNameViewText: cleanText(record.cardNameViewText),
    }];
  });
  return {
    result: 1,
    errMsg: cleanText(payload.errMsg),
    thisPage: positiveInteger(payload.thisPage) ?? 1,
    maxPage: optionalNonNegativeInteger(payload.maxPage) ?? 0,
    hitCnt: optionalNonNegativeInteger(payload.hitCnt) ?? cardList.length,
    regulation: cleanText(payload.regulation) ?? 'all',
    searchCondition: Array.isArray(payload.searchCondition)
      ? payload.searchCondition.map(cleanText).filter((item): item is string => Boolean(item))
      : [],
    cardList,
  };
}

function httpDateToIso(value: string | null | undefined) {
  const cleaned = cleanText(value);
  if (!cleaned) return null;
  const parsed = Date.parse(cleaned);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function setPayloadFromCard(card: ProviderRecord) {
  const payload = card.payload;
  const set = payload.set && typeof payload.set === 'object' && !Array.isArray(payload.set)
    ? payload.set as Record<string, unknown>
    : {};
  const code = cleanText(set.code ?? set.id ?? payload.setCode);
  if (!code) return null;
  return {
    code,
    name: cleanText(set.name) ?? code,
    printedTotal: positiveInteger(set.printedTotal ?? payload.printedTotal),
    total: positiveInteger(set.total ?? payload.officialSearchHitCount),
    productNames: Array.isArray(set.productNames) ? set.productNames : [],
    productUrls: Array.isArray(set.productUrls) ? set.productUrls : [],
  };
}

export class PokemonCardJpOfficialSourceAdapter implements SourceAdapter {
  readonly language = 'ja';
  readonly baseUrl: string;
  readonly licenceStatus: LicenceStatus;
  readonly assetLicenceStatus: LicenceStatus;
  readonly fetchImpl: FetchLike | null;
  readonly detailConcurrency: number;
  readonly cardRecordCache = new Map<string, Promise<ProviderRecord[]>>();

  constructor(options: PokemonCardJpAdapterOptions = {}) {
    const language = normaliseLanguageCode(options.language ?? 'ja');
    if (language !== 'ja') throw new Error('The official Pokémon Card Game Japan adapter supports only language ja.');
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/u, '');
    this.licenceStatus = options.licenceStatus ?? 'under_review';
    this.assetLicenceStatus = options.assetLicenceStatus ?? 'under_review';
    this.fetchImpl = options.fetchImpl ?? null;
    const concurrency = options.detailConcurrency ?? DEFAULT_DETAIL_CONCURRENCY;
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) {
      throw new Error('Official Japanese detail concurrency must be an integer from 1 to 4.');
    }
    this.detailConcurrency = concurrency;
  }

  identifySource(): SourceIdentity {
    return {
      code: 'pokemon_card_jp_official',
      displayName: 'Pokémon Card Game Japan (official)',
      sourceType: 'catalogue',
      baseUrl: this.baseUrl,
      termsUrl: `${this.baseUrl}/policy.html`,
      licenceStatus: this.licenceStatus,
      attributionRequired: true,
      robotsPolicy: 'no_robots_file_observed; bounded official endpoints only',
      rateLimitConfig: {
        listEndpoint: 'JSON pagination',
        pageSize: OFFICIAL_PAGE_SIZE,
        maximumCardsPerRun: MAX_BATCH_LIMIT,
        detailConcurrency: this.detailConcurrency,
        scheduling: 'manual_approval_required',
      },
      capabilities: ['sets', 'cards', 'assets', 'conditional_requests'],
      automatedRefreshAllowed: false,
    };
  }

  private fetcher() {
    const implementation = this.fetchImpl ?? globalThis.fetch;
    if (!implementation) throw new Error('No fetch implementation is available for the official Japanese catalogue.');
    return implementation;
  }

  private endpoint(path: string) {
    const base = new URL(this.baseUrl);
    const url = new URL(path, `${this.baseUrl}/`);
    if (url.origin !== base.origin) throw new Error(`Refusing non-official Japanese catalogue endpoint: ${url.href}`);
    return url.href;
  }

  private async request(path: string, scope: FetchScope = {}, accept = 'text/html,application/xhtml+xml') {
    const url = this.endpoint(path);
    const headers: Record<string, string> = {
      Accept: accept,
      Referer: `${this.baseUrl}/card-search/`,
    };
    if (scope.conditionalHeaders?.etag) headers['If-None-Match'] = scope.conditionalHeaders.etag;
    if (scope.conditionalHeaders?.lastModified) headers['If-Modified-Since'] = scope.conditionalHeaders.lastModified;

    let response: Response | null = null;
    let lastError: unknown = null;
    let attempts = 0;
    const startedAt = Date.now();
    for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt += 1) {
      attempts = attempt;
      try {
        response = await this.fetcher()(url, {
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
    if (!response) throw lastError ?? new Error(`Official Japanese catalogue request failed before receiving ${url}.`);

    const body = response.status === 304 ? '' : await response.text();
    const metadata: ResponseMetadata = {
      status: response.status,
      etag: response.headers.get('etag'),
      lastModified: response.headers.get('last-modified'),
      cacheControl: response.headers.get('cache-control'),
      retryAfter: response.headers.get('retry-after'),
      contentType: response.headers.get('content-type'),
      contentLength: Buffer.byteLength(body),
      responseSha256: sha256(body),
      responseTimeMs: Date.now() - startedAt,
      endpoint: url,
      attempts,
    };
    if (response.status === 304) return { url, body, metadata };
    if (response.status === 401 || response.status === 403) {
      const error = new Error(`Official Japanese catalogue request forbidden for ${url}`);
      Object.assign(error, { responseStatus: response.status, metadata });
      throw error;
    }
    if (!response.ok) {
      const error = new Error(`Official Japanese catalogue request failed (${response.status}) for ${url}: ${body.slice(0, 240)}`);
      Object.assign(error, { responseStatus: response.status, metadata });
      throw error;
    }
    return { url, body, metadata };
  }

  private searchPath(page: number, setId?: string) {
    const query = new URLSearchParams({
      keyword: '',
      se_ta: '',
      regulation_sidebar_form: 'all',
      pg: setId ?? '',
      illust: '',
      sm_and_keyword: 'true',
      page: String(page),
    });
    return `${SEARCH_PATH}?${query.toString()}`;
  }

  private async searchPage(page: number, scope: FetchScope): Promise<OfficialSearchBatch> {
    const result = await this.request(this.searchPath(page, cleanText(scope.setId) ?? undefined), scope, 'application/json');
    if (result.metadata.status === 304) {
      return {
        cards: [],
        hitCount: 0,
        maxPage: 0,
        regulation: 'all',
        searchCondition: [],
        sourceEndpoint: result.url,
        httpMetadata: result.metadata,
      };
    }
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(result.body);
    } catch {
      throw new Error(`Official Japanese catalogue returned invalid JSON for ${result.url}.`);
    }
    const parsed = parseSearchResponse(parsedJson);
    return {
      cards: parsed.cardList,
      hitCount: parsed.hitCnt,
      maxPage: parsed.maxPage,
      regulation: parsed.regulation,
      searchCondition: parsed.searchCondition,
      sourceEndpoint: result.url,
      httpMetadata: result.metadata,
    };
  }

  private async selectedCardReferences(scope: FetchScope) {
    const providerRecordId = cleanText(scope.providerRecordId);
    if (providerRecordId) {
      return {
        cards: [{ cardID: providerRecordId }] as OfficialCardReference[],
        hitCount: 1,
        maxPage: 1,
        regulation: 'all',
        searchCondition: [],
        sourceEndpoint: this.endpoint(`${DETAIL_PATH_PREFIX}/${encodeURIComponent(providerRecordId)}/regu/all`),
        httpMetadata: null as ResponseMetadata | null,
      };
    }

    const limit = boundedLimit(scope);
    if (limit === 0) {
      return {
        cards: [] as OfficialCardReference[],
        hitCount: 0,
        maxPage: 0,
        regulation: 'all',
        searchCondition: [],
        sourceEndpoint: this.endpoint(this.searchPath(1, cleanText(scope.setId) ?? undefined)),
        httpMetadata: null as ResponseMetadata | null,
      };
    }
    const offset = scopeOffset(scope);
    let page = Math.floor(offset / OFFICIAL_PAGE_SIZE) + 1;
    const skipOnFirstPage = offset % OFFICIAL_PAGE_SIZE;
    const collected: OfficialCardReference[] = [];
    let firstBatch: OfficialSearchBatch | null = null;
    let lastBatch: OfficialSearchBatch | null = null;
    while (collected.length < skipOnFirstPage + limit) {
      const batch = await this.searchPage(page, scope);
      firstBatch ??= batch;
      lastBatch = batch;
      collected.push(...batch.cards);
      if (batch.cards.length === 0 || page >= batch.maxPage) break;
      page += 1;
    }
    const metadataBatch = firstBatch ?? lastBatch;
    return {
      cards: collected.slice(skipOnFirstPage, skipOnFirstPage + limit),
      hitCount: metadataBatch?.hitCount ?? 0,
      maxPage: metadataBatch?.maxPage ?? 0,
      regulation: metadataBatch?.regulation ?? 'all',
      searchCondition: metadataBatch?.searchCondition ?? [],
      sourceEndpoint: metadataBatch?.sourceEndpoint ?? this.endpoint(this.searchPath(page, cleanText(scope.setId) ?? undefined)),
      httpMetadata: metadataBatch?.httpMetadata ?? null,
    };
  }

  private async detailRecord(
    reference: OfficialCardReference,
    search: Awaited<ReturnType<PokemonCardJpOfficialSourceAdapter['selectedCardReferences']>>,
    scope: FetchScope,
  ): Promise<ProviderRecord> {
    const path = `${DETAIL_PATH_PREFIX}/${encodeURIComponent(reference.cardID)}/regu/all`;
    const result = await this.request(path, scope);
    const detail = parseOfficialCardDetail(result.body, this.baseUrl);
    const name = detail.name ?? reference.cardNameViewText ?? reference.cardNameAltText ?? null;
    const productNames = detail.productLinks.map((item) => item.name);
    const productUrls = detail.productLinks.map((item) => item.url);
    const productName = productNames[0] ?? search.searchCondition[0] ?? detail.setCode;
    const thumbnail = absoluteOfficialUrl(reference.cardThumbFile, this.baseUrl);
    const imageUrl = detail.imageUrl ?? thumbnail;
    const set = {
      id: detail.setCode,
      code: detail.setCode,
      name: productName,
      providerProductFilterId: cleanText(scope.setId),
      printedTotal: detail.printedTotal,
      total: scope.setId ? search.hitCount : null,
      productNames,
      productUrls,
    };
    return {
      provider: 'pokemon_card_jp_official',
      providerRecordId: reference.cardID,
      recordType: 'card',
      languageCode: 'ja',
      sourceUrl: result.url,
      sourceEndpoint: result.url,
      providerUpdatedAt: httpDateToIso(result.metadata.lastModified),
      licenceStatus: this.licenceStatus,
      attributionText: ATTRIBUTION,
      httpMetadata: {
        detail: result.metadata,
        search: search.httpMetadata,
        searchEndpoint: search.sourceEndpoint,
        searchHitCount: search.hitCount,
        searchMaxPage: search.maxPage,
        searchCondition: search.searchCondition,
      },
      payload: {
        id: reference.cardID,
        cardID: reference.cardID,
        name,
        localId: detail.collectorNumber,
        number: detail.collectorNumber,
        set,
        setCode: detail.setCode,
        printedTotal: detail.printedTotal,
        officialSearchHitCount: search.hitCount,
        image: imageUrl,
        imageUrl,
        artist: detail.artist,
        rarity: detail.rarityProviderCode,
        supertype: detail.supertype,
        stage: detail.stage,
        hp: detail.hp,
        productNames,
        productUrls,
        providerProductFilterId: cleanText(scope.setId),
        variant: 'normal',
        finish: 'normal',
        variants: { normal: true },
        detailParserVersion: detail.detailParserVersion,
        officialDetailUrl: result.url,
        officialSearchEndpoint: search.sourceEndpoint,
        providerThumbnailUrl: thumbnail,
      },
    };
  }

  async healthCheck(scope: FetchScope = {}): Promise<SourceHealth> {
    try {
      const result = await this.searchPage(1, { ...scope, setId: undefined });
      return {
        status: 'ok',
        responseStatus: result.httpMetadata.status,
        responseTimeMs: result.httpMetadata.responseTimeMs,
        capabilities: { sets: true, cards: true, variants: false, assets: true, conditional_requests: true },
        httpMetadata: {
          ...result.httpMetadata,
          hitCount: result.hitCount,
          maxPage: result.maxPage,
          pageSize: result.cards.length,
          regulation: result.regulation,
        },
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

  async fetchCards(scope: FetchScope = {}) {
    if (scope.language && normaliseLanguageCode(scope.language) !== 'ja') {
      throw new Error('The official Pokémon Card Game Japan adapter cannot fetch a non-Japanese scope.');
    }
    const cacheKey = JSON.stringify({
      setId: scope.setId ?? null,
      providerRecordId: scope.providerRecordId ?? null,
      limit: scope.limit ?? DEFAULT_BATCH_LIMIT,
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

  private async fetchCardsUncached(scope: FetchScope) {
    const search = await this.selectedCardReferences(scope);
    return mapWithConcurrency(search.cards, this.detailConcurrency, (reference) => this.detailRecord(reference, search, scope));
  }

  async fetchSets(scope: FetchScope = {}) {
    const cards = await this.fetchCards(scope);
    const sets = new Map<string, ProviderRecord>();
    for (const card of cards) {
      const parsed = setPayloadFromCard(card);
      if (!parsed) continue;
      const current = sets.get(parsed.code);
      const currentPayload = current?.payload ?? {};
      const printedTotal = Math.max(
        positiveInteger(currentPayload.printedTotal) ?? 0,
        parsed.printedTotal ?? 0,
      ) || null;
      const total = Math.max(
        positiveInteger(currentPayload.total) ?? 0,
        parsed.total ?? 0,
      ) || null;
      sets.set(parsed.code, {
        provider: 'pokemon_card_jp_official',
        providerRecordId: parsed.code,
        recordType: 'set',
        languageCode: 'ja',
        sourceUrl: card.sourceUrl,
        sourceEndpoint: card.sourceEndpoint,
        providerUpdatedAt: card.providerUpdatedAt,
        licenceStatus: this.licenceStatus,
        attributionText: ATTRIBUTION,
        httpMetadata: card.httpMetadata,
        payload: {
          id: parsed.code,
          code: parsed.code,
          name: cleanText(currentPayload.name) ?? parsed.name,
          printedTotal,
          total,
          productNames: parsed.productNames,
          productUrls: parsed.productUrls,
          derivedFromOfficialCardId: card.providerRecordId,
        },
      });
    }
    return [...sets.values()];
  }

  async fetchVariants(): Promise<ProviderRecord[]> {
    return [];
  }

  async fetchAssets(scope: FetchScope = {}) {
    const cards = await this.fetchCards(scope);
    return cards.flatMap((card) => {
      const imageUrl = cleanText(card.payload.imageUrl ?? card.payload.image);
      if (!imageUrl) return [];
      return [{
        ...card,
        providerRecordId: `${card.providerRecordId}:normal:normal:image`,
        recordType: 'asset' as const,
        licenceStatus: this.assetLicenceStatus,
        payload: {
          ...card.payload,
          image_url: imageUrl,
          image_language_code: 'ja',
          asset_type: 'card_image',
          variant: 'normal',
          finish: 'normal',
        },
      }];
    });
  }

  normaliseRecord(record: ProviderRecord): NormalisedRecord {
    const payload = record.payload;
    const set = payload.set && typeof payload.set === 'object' && !Array.isArray(payload.set)
      ? payload.set as Record<string, unknown>
      : {};
    const sourceSet = record.recordType === 'set' ? payload : set;
    const collector = collectorNumberParts(payload.localId ?? payload.number);
    const variant = normaliseVariantCode(payload.variant ?? 'normal');
    const imageUrl = absoluteOfficialUrl(payload.image_url ?? payload.imageUrl ?? payload.image, this.baseUrl);
    const printedTotal = positiveInteger(payload.printedTotal ?? sourceSet.printedTotal);
    const total = positiveInteger(payload.total ?? sourceSet.total);
    const providerRecordId = cleanText(payload.cardID ?? payload.id) ?? record.providerRecordId;
    return {
      provider: record.provider,
      providerRecordId: record.providerRecordId,
      recordType: record.recordType,
      gameCode: 'pokemon',
      languageCode: 'ja',
      setCode: cleanText(sourceSet.code ?? sourceSet.id ?? payload.setCode),
      providerSetId: cleanText(sourceSet.code ?? sourceSet.id ?? payload.setCode),
      collectorNumber: collector.collectorNumber || null,
      collectorNumberPrefix: collector.collectorNumberPrefix,
      collectorNumberSort: collector.collectorNumberSort,
      collectorNumberSuffix: collector.collectorNumberSuffix,
      collectorNumberSortKey: collector.collectorNumberSortKey,
      nativeName: cleanText(payload.name),
      englishDisplayName: null,
      printedTotal,
      total,
      rarityCode: normaliseOfficialRarityCode(payload.rarity),
      variantCode: variant,
      finishCode: normaliseVariantCode(payload.finish ?? variant),
      artworkKey: imageUrl ? `pokemon_card_jp_official:${providerRecordId}` : null,
      imageUrl,
      imageLanguageCode: imageUrl ? 'ja' : null,
      assetType: cleanText(payload.asset_type) as NormalisedRecord['assetType'] ?? 'card_image',
      sourceConfidence: 0.98,
      sourceUpdatedAt: record.providerUpdatedAt,
      licenceStatus: record.licenceStatus,
      raw: payload,
    };
  }

  validateRecord(record: ProviderRecord) {
    const base = validateProviderRecord(record);
    const issues: ValidationIssue[] = [...base.issues];
    let recordLanguage: string | null = null;
    try {
      recordLanguage = normaliseLanguageCode(record.languageCode ?? 'ja');
    } catch {
      recordLanguage = null;
    }
    if (recordLanguage !== 'ja') {
      issues.push({
        code: 'official_japanese_language_required',
        severity: 'error',
        message: 'Official Pokémon Card Game Japan records must remain language ja.',
        path: 'languageCode',
      });
    }
    if (['card', 'asset'].includes(record.recordType)) {
      const normalised = this.normaliseRecord(record);
      if (!normalised.nativeName) {
        issues.push({ code: 'native_name_missing', severity: 'error', message: 'Official Japanese card detail is missing its native name.' });
      }
      if (!normalised.setCode) {
        issues.push({ code: 'set_code_missing', severity: 'error', message: 'Official Japanese card detail is missing its printed set code.' });
      }
      if (!normalised.collectorNumber) {
        issues.push({
          code: 'collector_number_missing',
          severity: 'error',
          message: 'Official Japanese card detail has no printed collector number; no synthetic identity was created.',
        });
      }
      if (record.recordType === 'asset') {
        const image = cleanText(normalised.imageUrl);
        const officialOrigin = new URL(this.baseUrl).origin;
        if (!image || new URL(image).origin !== officialOrigin || !new URL(image).pathname.startsWith('/assets/images/card_images/')) {
          issues.push({
            code: 'official_image_url_invalid',
            severity: 'error',
            message: 'Japanese card image must use the official card-images path on the configured official origin.',
            path: 'payload.image_url',
          });
        }
      }
    }
    return {
      ok: issues.every((issue) => issue.severity !== 'error'),
      issues,
    };
  }
}

export const pokemonCardJpAdapterInternals = {
  boundedLimit,
  parseCollectorText,
  parseOfficialCardDetail,
  parseSearchResponse,
  scopeOffset,
};
