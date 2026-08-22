import { readFile } from 'node:fs/promises';

import {
  assessInternetListingEvidence,
  buildListingQueries,
  buildRecognitionMetadataFingerprint,
  type InternetListingSummary,
  type RecognitionMetadataFingerprint,
  type RecognitionMetadataFingerprintInput,
} from './internetEvidence';
import {
  cleanText,
  type FetchScope,
  type NormalisedRecord,
  type ProviderRecord,
  type SourceAdapter,
  type SourceHealth,
  type SourceIdentity,
  validateProviderRecord,
  type ValidationResult,
} from './sourceAdapter';

const DEFAULT_OAUTH_BASE_URL = 'https://api.ebay.com';
const DEFAULT_BROWSE_BASE_URL = 'https://api.ebay.com';
const DEFAULT_MARKETPLACE_ID = 'EBAY_GB';
const DEFAULT_OAUTH_SCOPE = 'https://api.ebay.com/oauth/api_scope';
const DEFAULT_TIMEOUT_MS = 15_000;

type EbayListingEvidenceAdapterOptions = {
  manifestPath: string;
  clientId?: string;
  clientSecret?: string;
  marketplaceId?: string;
  oauthScope?: string;
  oauthBaseUrl?: string;
  browseBaseUrl?: string;
  queriesPerVariant?: number;
  listingsPerQuery?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

type ManifestEnvelope = {
  fingerprints?: RecognitionMetadataFingerprintInput[];
};

function arrayPayload(value: unknown): RecognitionMetadataFingerprintInput[] {
  const rows = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? (value as ManifestEnvelope).fingerprints
      : null;
  if (!Array.isArray(rows)) {
    throw new Error('Recognition internet-evidence manifest must be an array or an object containing fingerprints[].');
  }
  return rows;
}

function safeListingSummary(item: Record<string, unknown>, query: string): InternetListingSummary | null {
  const sourceItemId = cleanText(item.itemId ?? item.legacyItemId);
  const title = cleanText(item.title);
  if (!sourceItemId || !title) return null;
  const primaryImage = item.image && typeof item.image === 'object'
    ? cleanText((item.image as Record<string, unknown>).imageUrl)
    : null;
  const additionalImages = Array.isArray(item.additionalImages)
    ? item.additionalImages.map((image) => (
      image && typeof image === 'object' ? cleanText((image as Record<string, unknown>).imageUrl) : null
    ))
    : [];
  const aspects = Array.isArray(item.localizedAspects)
    ? item.localizedAspects.flatMap((aspect) => {
      if (!aspect || typeof aspect !== 'object') return [];
      const row = aspect as Record<string, unknown>;
      const name = cleanText(row.name);
      const value = cleanText(row.value);
      return name || value ? [{ name, value }] : [];
    })
    : [];
  return {
    sourceItemId,
    sourceUrl: cleanText(item.itemWebUrl),
    title,
    condition: cleanText(item.condition),
    imageUrls: [primaryImage, ...additionalImages].filter((value): value is string => Boolean(value)),
    aspects,
    itemCreationDate: cleanText(item.itemCreationDate),
    query,
  };
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string | URL,
  init: RequestInit,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export class EbayListingEvidenceSourceAdapter implements SourceAdapter {
  readonly options: Required<Omit<EbayListingEvidenceAdapterOptions, 'clientId' | 'clientSecret' | 'fetchImpl'>> & {
    clientId: string | null;
    clientSecret: string | null;
    fetchImpl: typeof fetch;
  };
  private manifestPromise: Promise<RecognitionMetadataFingerprint[]> | null = null;
  private token: string | null = null;
  private tokenExpiresAt = 0;

  constructor(options: EbayListingEvidenceAdapterOptions) {
    const manifestPath = cleanText(options.manifestPath);
    if (!manifestPath) throw new Error('eBay listing evidence requires a recognition fingerprint manifest path.');
    this.options = {
      manifestPath,
      clientId: cleanText(options.clientId ?? process.env.EBAY_CLIENT_ID),
      clientSecret: cleanText(options.clientSecret ?? process.env.EBAY_CLIENT_SECRET),
      marketplaceId: cleanText(options.marketplaceId ?? process.env.EBAY_MARKETPLACE_ID) ?? DEFAULT_MARKETPLACE_ID,
      oauthScope: cleanText(options.oauthScope ?? process.env.EBAY_OAUTH_SCOPES) ?? DEFAULT_OAUTH_SCOPE,
      oauthBaseUrl: (cleanText(options.oauthBaseUrl) ?? DEFAULT_OAUTH_BASE_URL).replace(/\/$/, ''),
      browseBaseUrl: (cleanText(options.browseBaseUrl) ?? DEFAULT_BROWSE_BASE_URL).replace(/\/$/, ''),
      queriesPerVariant: Math.max(1, Math.min(4, options.queriesPerVariant ?? 2)),
      listingsPerQuery: Math.max(1, Math.min(200, options.listingsPerQuery ?? 30)),
      timeoutMs: Math.max(1_000, options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      fetchImpl: options.fetchImpl ?? fetch,
    };
  }

  identifySource(): SourceIdentity {
    return {
      code: 'ebay_browse_recognition_evidence',
      displayName: 'eBay Browse recognition evidence',
      sourceType: 'recognition',
      baseUrl: this.options.browseBaseUrl,
      termsUrl: 'https://developer.ebay.com/api-docs/buy/browse/overview.html',
      licenceStatus: 'approved',
      attributionRequired: true,
      robotsPolicy: 'official_api_only_no_scraping',
      rateLimitConfig: {
        marketplaceId: this.options.marketplaceId,
        queriesPerVariant: this.options.queriesPerVariant,
        listingsPerQuery: this.options.listingsPerQuery,
      },
      capabilities: ['cards'],
      automatedRefreshAllowed: true,
    };
  }

  private async fingerprints() {
    if (!this.manifestPromise) {
      this.manifestPromise = readFile(this.options.manifestPath, 'utf8')
        .then((body) => JSON.parse(body))
        .then(arrayPayload)
        .then((rows) => rows.map(buildRecognitionMetadataFingerprint));
    }
    return this.manifestPromise;
  }

  async healthCheck(): Promise<SourceHealth> {
    try {
      const fingerprints = await this.fingerprints();
      if (fingerprints.length === 0) {
        return { status: 'unavailable', message: 'Recognition fingerprint manifest is empty.' };
      }
      if (!this.options.clientId || !this.options.clientSecret) {
        return { status: 'unavailable', message: 'Missing eBay Browse API client credentials.' };
      }
      return {
        status: 'ok',
        message: `eBay Browse evidence source is configured for ${fingerprints.length} recognition fingerprints.`,
        capabilities: { cards: true },
      };
    } catch (error) {
      return {
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
        capabilities: { cards: false },
      };
    }
  }

  private async applicationToken() {
    const now = Date.now();
    if (this.token && now < this.tokenExpiresAt - 60_000) return this.token;
    if (!this.options.clientId || !this.options.clientSecret) {
      throw new Error('Missing eBay Browse API client credentials.');
    }
    const basic = Buffer.from(`${this.options.clientId}:${this.options.clientSecret}`).toString('base64');
    const response = await fetchWithTimeout(
      this.options.fetchImpl,
      `${this.options.oauthBaseUrl}/identity/v1/oauth2/token`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          scope: this.options.oauthScope,
        }),
      },
      this.options.timeoutMs,
    );
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok || !cleanText(payload?.access_token)) {
      throw new Error(`eBay OAuth token request failed with status ${response.status}.`);
    }
    this.token = cleanText(payload?.access_token);
    this.tokenExpiresAt = now + Math.max(60, Number(payload?.expires_in ?? 3600)) * 1000;
    return this.token!;
  }

  private async browse(query: string) {
    const token = await this.applicationToken();
    const url = new URL('/buy/browse/v1/item_summary/search', this.options.browseBaseUrl);
    url.searchParams.set('q', query);
    url.searchParams.set('limit', String(this.options.listingsPerQuery));
    const response = await fetchWithTimeout(
      this.options.fetchImpl,
      url,
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          'X-EBAY-C-MARKETPLACE-ID': this.options.marketplaceId,
        },
      },
      this.options.timeoutMs,
    );
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok) {
      throw new Error(`eBay Browse evidence query failed with status ${response.status}.`);
    }
    return Array.isArray(payload?.itemSummaries)
      ? payload.itemSummaries.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      : [];
  }

  async *fetchCards(scope: FetchScope = {}): AsyncIterable<ProviderRecord> {
    const fingerprints = await this.fingerprints();
    const offset = Number(scope.cursor?.offset ?? 0);
    const limit = Math.max(1, scope.limit ?? fingerprints.length);
    const scoped = fingerprints
      .filter((fingerprint) => !scope.language || fingerprint.languageCode === scope.language)
      .filter((fingerprint) => !scope.setId || fingerprint.setCode.toLowerCase() === scope.setId.toLowerCase())
      .filter((fingerprint) => !scope.providerRecordId || fingerprint.variantId === scope.providerRecordId)
      .slice(offset, offset + limit);

    for (const fingerprint of scoped) {
      const seenItems = new Set<string>();
      for (const query of buildListingQueries(fingerprint, this.options.queriesPerVariant)) {
        const items = await this.browse(query);
        for (const item of items) {
          const listing = safeListingSummary(item, query);
          if (!listing || listing.imageUrls?.length === 0 || seenItems.has(listing.sourceItemId)) continue;
          seenItems.add(listing.sourceItemId);
          const assessment = assessInternetListingEvidence(fingerprint, listing);
          const providerRecordId = `${listing.sourceItemId}:${fingerprint.variantId}`;
          yield {
            provider: 'ebay_browse_recognition_evidence',
            providerRecordId,
            recordType: 'other',
            languageCode: fingerprint.languageCode,
            sourceUrl: listing.sourceUrl,
            sourceEndpoint: `${this.options.browseBaseUrl}/buy/browse/v1/item_summary/search`,
            providerUpdatedAt: listing.itemCreationDate,
            licenceStatus: 'approved',
            attributionText: 'eBay Browse API listing evidence',
            httpMetadata: {
              marketplaceId: this.options.marketplaceId,
              fingerprintSha256: fingerprint.fingerprintSha256,
            },
            payload: {
              schemaVersion: assessment.schemaVersion,
              evidencePurpose: 'recognition_independent_query_candidate',
              sourceItemId: listing.sourceItemId,
              sourceUrl: listing.sourceUrl ?? null,
              title: listing.title,
              condition: listing.condition ?? null,
              imageUrls: assessment.imageUrls,
              aspects: listing.aspects ?? [],
              itemCreationDate: listing.itemCreationDate ?? null,
              query,
              fingerprint,
              assessment,
              sellerDataRetained: false,
              automaticCatalogueMutationAllowed: false,
            },
          };
        }
      }
    }
  }

  async fetchSets(): Promise<ProviderRecord[]> {
    return [];
  }

  async fetchVariants(): Promise<ProviderRecord[]> {
    return [];
  }

  async fetchAssets(): Promise<ProviderRecord[]> {
    return [];
  }

  normaliseRecord(record: ProviderRecord): NormalisedRecord {
    const payload = record.payload;
    const fingerprint = payload.fingerprint as RecognitionMetadataFingerprint;
    const assessment = payload.assessment as ReturnType<typeof assessInternetListingEvidence>;
    return {
      provider: record.provider,
      providerRecordId: record.providerRecordId,
      recordType: 'other',
      gameCode: 'pokemon',
      languageCode: fingerprint.languageCode,
      setCode: fingerprint.setCode,
      collectorNumber: fingerprint.collectorNumber,
      nativeName: fingerprint.nativeName,
      englishDisplayName: fingerprint.englishDisplayName,
      variantCode: fingerprint.variantCode,
      finishCode: fingerprint.finishCode,
      sourceConfidence: assessment.confidenceBand === 'high'
        ? 0.9
        : assessment.confidenceBand === 'medium'
          ? 0.7
          : assessment.confidenceBand === 'low'
            ? 0.4
            : 0,
      sourceUpdatedAt: record.providerUpdatedAt,
      licenceStatus: record.licenceStatus,
      evidenceOnly: true,
      raw: payload,
    };
  }

  validateRecord(record: ProviderRecord): ValidationResult {
    const base = validateProviderRecord(record);
    const issues = [...base.issues];
    const fingerprint = record.payload?.fingerprint;
    const assessment = record.payload?.assessment;
    if (!fingerprint || typeof fingerprint !== 'object') {
      issues.push({ code: 'recognition_fingerprint_required', severity: 'error', message: 'Listing evidence requires a recognition fingerprint.' });
    }
    if (!assessment || typeof assessment !== 'object') {
      issues.push({ code: 'recognition_assessment_required', severity: 'error', message: 'Listing evidence requires a deterministic assessment.' });
    }
    if (record.payload?.automaticCatalogueMutationAllowed !== false) {
      issues.push({ code: 'catalogue_mutation_must_be_disabled', severity: 'error', message: 'Internet listing evidence may not mutate canonical catalogue identity automatically.' });
    }
    return { ok: issues.every((issue) => issue.severity !== 'error'), issues };
  }
}
