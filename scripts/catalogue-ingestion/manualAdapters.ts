import { readFileSync } from 'node:fs';
import {
  cleanText,
  collectorNumberParts,
  normaliseFinishCode,
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

type ManualAdapterOptions = {
  filePath: string;
  sourceCode?: string;
  displayName?: string;
  licenceStatus?: 'approved' | 'under_review' | 'restricted' | 'denied' | 'unknown';
};

const MANUAL_SOURCE_CODE = 'stackr_manual';

function manualIdentity(options: ManualAdapterOptions): SourceIdentity {
  return {
    code: options.sourceCode ?? MANUAL_SOURCE_CODE,
    displayName: options.displayName ?? 'Stackr manually curated dataset',
    sourceType: 'manual',
    baseUrl: null,
    termsUrl: null,
    licenceStatus: options.licenceStatus ?? 'approved',
    attributionRequired: false,
    robotsPolicy: 'not_applicable_manual_dataset',
    rateLimitConfig: {},
    capabilities: ['sets', 'cards', 'variants', 'assets', 'manual_import'],
    automatedRefreshAllowed: false,
  };
}

function valueAt(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    if (row[key] != null && String(row[key]).trim() !== '') return row[key];
  }
  return null;
}

function recordTypeFromRow(row: Record<string, unknown>) {
  const explicit = cleanText(valueAt(row, 'record_type', 'recordType', 'type'));
  if (explicit) return explicit;
  if (cleanText(valueAt(row, 'image_url', 'imageUrl', 'asset_url', 'assetUrl'))) return 'card';
  if (cleanText(valueAt(row, 'collector_number', 'collectorNumber', 'number'))) return 'card';
  if (cleanText(valueAt(row, 'set_code', 'setCode', 'provider_set_id', 'providerSetId'))) return 'set';
  return 'other';
}

function providerRecordId(row: Record<string, unknown>, index: number) {
  return cleanText(valueAt(
    row,
    'provider_record_id',
    'providerRecordId',
    'external_id',
    'externalId',
    'id',
    'card_id',
    'cardId',
  )) ?? `manual-row-${index + 1}`;
}

function rowToProviderRecord(
  row: Record<string, unknown>,
  index: number,
  identity: SourceIdentity,
): ProviderRecord {
  const recordType = recordTypeFromRow(row);
  const languageCode = normaliseLanguageCode(valueAt(row, 'language_code', 'languageCode', 'language', 'lang'));
  return {
    provider: identity.code,
    providerRecordId: providerRecordId(row, index),
    recordType: recordType as ProviderRecord['recordType'],
    languageCode,
    sourceUrl: cleanText(valueAt(row, 'source_url', 'sourceUrl', 'url')),
    sourceEndpoint: cleanText(valueAt(row, 'source_endpoint', 'sourceEndpoint')),
    providerUpdatedAt: cleanText(valueAt(row, 'provider_updated_at', 'providerUpdatedAt', 'updated_at', 'updatedAt')),
    licenceStatus: (cleanText(valueAt(row, 'licence_status', 'license_status', 'licenceStatus', 'licenseStatus')) as ProviderRecord['licenceStatus'])
      ?? identity.licenceStatus,
    attributionText: cleanText(valueAt(row, 'attribution_text', 'attributionText', 'attribution')),
    httpMetadata: { manualDataset: true, rowIndex: index },
    payload: row,
  };
}

function normaliseManualRecord(record: ProviderRecord): NormalisedRecord {
  const row = record.payload;
  const collector = collectorNumberParts(valueAt(row, 'collector_number', 'collectorNumber', 'number'));
  const variantCode = normaliseVariantCode(valueAt(row, 'variant_code', 'variantCode', 'variant', 'finish') ?? 'normal');
  const printedTotal = Number(valueAt(row, 'printed_total', 'printedTotal', 'official_total', 'officialTotal') ?? NaN);
  const total = Number(valueAt(row, 'total', 'actual_total', 'actualTotal', 'expected_card_total', 'expectedCardTotal') ?? NaN);
  return {
    provider: record.provider,
    providerRecordId: record.providerRecordId,
    recordType: record.recordType,
    gameCode: cleanText(valueAt(row, 'game_code', 'gameCode', 'game')) ?? 'pokemon',
    languageCode: normaliseLanguageCode(record.languageCode ?? valueAt(row, 'language_code', 'languageCode', 'language')),
    setCode: cleanText(valueAt(row, 'set_code', 'setCode')),
    providerSetId: cleanText(valueAt(row, 'provider_set_id', 'providerSetId', 'set_id', 'setId')),
    collectorNumber: collector.collectorNumber || null,
    collectorNumberPrefix: collector.collectorNumberPrefix,
    collectorNumberSort: collector.collectorNumberSort,
    collectorNumberSuffix: collector.collectorNumberSuffix,
    collectorNumberSortKey: collector.collectorNumberSortKey,
    nativeName: cleanText(valueAt(row, 'native_name', 'nativeName', 'name', 'card_name', 'cardName', 'set_name', 'setName')),
    englishDisplayName: cleanText(valueAt(row, 'english_display_name', 'englishDisplayName', 'english_name', 'englishName')),
    printedTotal: Number.isFinite(printedTotal) && printedTotal >= 0 ? printedTotal : null,
    total: Number.isFinite(total) && total >= 0 ? total : null,
    rarityCode: cleanText(valueAt(row, 'rarity_code', 'rarityCode', 'rarity'))?.toLowerCase().replace(/[^a-z0-9]+/g, '_') ?? null,
    variantCode,
    finishCode: normaliseFinishCode(valueAt(row, 'finish_code', 'finishCode', 'finish', 'variant')),
    artworkKey: cleanText(valueAt(row, 'artwork_key', 'artworkKey', 'image_signature', 'imageSignature')),
    imageUrl: cleanText(valueAt(row, 'image_url', 'imageUrl', 'asset_url', 'assetUrl')),
    imageLanguageCode: cleanText(valueAt(row, 'image_language_code', 'imageLanguageCode', 'image_language', 'imageLanguage')),
    imageSha256: cleanText(valueAt(row, 'image_sha256', 'imageSha256', 'content_sha256', 'contentSha256', 'sha256')),
    imagePerceptualHash: cleanText(valueAt(row, 'image_perceptual_hash', 'imagePerceptualHash', 'perceptual_hash', 'perceptualHash')),
    assetType: (cleanText(valueAt(row, 'asset_type', 'assetType')) as NormalisedRecord['assetType']) ?? 'card_image',
    sourceConfidence: Number(valueAt(row, 'source_confidence', 'sourceConfidence', 'confidence') ?? 0.95),
    sourceUpdatedAt: record.providerUpdatedAt,
    licenceStatus: record.licenceStatus,
    raw: row,
  };
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

export function parseManualCsv(input: string): Record<string, unknown>[] {
  const lines = input.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? '';
    });
    return row;
  });
}

async function* toAsyncIterable(records: ProviderRecord[]) {
  for (const record of records) yield record;
}

export class ManualCsvSourceAdapter implements SourceAdapter {
  readonly options: ManualAdapterOptions;

  constructor(options: ManualAdapterOptions) {
    this.options = options;
  }

  identifySource() {
    return manualIdentity(this.options);
  }

  async healthCheck(): Promise<SourceHealth> {
    try {
      readFileSync(this.options.filePath, 'utf8');
      return { status: 'ok', message: 'Manual CSV file is readable.', capabilities: { manual_import: true } };
    } catch (error) {
      return { status: 'unavailable', message: error instanceof Error ? error.message : String(error) };
    }
  }

  records(scope: FetchScope = {}): ProviderRecord[] {
    const identity = this.identifySource();
    const rows = parseManualCsv(readFileSync(this.options.filePath, 'utf8'));
    const filtered = rows.filter((row, index) => {
      const language = normaliseLanguageCode(valueAt(row, 'language_code', 'languageCode', 'language'));
      const setId = cleanText(valueAt(row, 'provider_set_id', 'providerSetId', 'set_id', 'setId', 'set_code', 'setCode'));
      if (scope.language && language !== normaliseLanguageCode(scope.language)) return false;
      if (scope.setId && setId !== scope.setId) return false;
      if (scope.providerRecordId && providerRecordId(row, index) !== scope.providerRecordId) return false;
      return true;
    }).slice(0, scope.limit);
    return filtered.map((row, index) => rowToProviderRecord(row, index, identity));
  }

  fetchSets(scope?: FetchScope) {
    return toAsyncIterable(this.records(scope).filter((record) => record.recordType === 'set'));
  }

  fetchCards(scope?: FetchScope) {
    return toAsyncIterable(this.records(scope).filter((record) => ['card', 'printing', 'variant'].includes(record.recordType)));
  }

  fetchVariants(scope?: FetchScope) {
    return this.fetchCards(scope);
  }

  fetchAssets(scope?: FetchScope) {
    return toAsyncIterable(this.records(scope).filter((record) => Boolean(record.payload.image_url ?? record.payload.imageUrl ?? record.payload.asset_url ?? record.payload.assetUrl)));
  }

  normaliseRecord(record: ProviderRecord) {
    return normaliseManualRecord(record);
  }

  validateRecord(record: ProviderRecord) {
    return validateProviderRecord(record);
  }
}

export class ManualJsonSourceAdapter implements SourceAdapter {
  readonly options: ManualAdapterOptions;

  constructor(options: ManualAdapterOptions) {
    this.options = options;
  }

  identifySource() {
    return manualIdentity(this.options);
  }

  async healthCheck(): Promise<SourceHealth> {
    try {
      readFileSync(this.options.filePath, 'utf8');
      return { status: 'ok', message: 'Manual JSON file is readable.', capabilities: { manual_import: true } };
    } catch (error) {
      return { status: 'unavailable', message: error instanceof Error ? error.message : String(error) };
    }
  }

  records(scope: FetchScope = {}): ProviderRecord[] {
    const identity = this.identifySource();
    const parsed = JSON.parse(readFileSync(this.options.filePath, 'utf8'));
    const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed.records) ? parsed.records : [];
    const filtered = rows.filter((row: Record<string, unknown>, index: number) => {
      const language = normaliseLanguageCode(valueAt(row, 'language_code', 'languageCode', 'language'));
      const setId = cleanText(valueAt(row, 'provider_set_id', 'providerSetId', 'set_id', 'setId', 'set_code', 'setCode'));
      if (scope.language && language !== normaliseLanguageCode(scope.language)) return false;
      if (scope.setId && setId !== scope.setId) return false;
      if (scope.providerRecordId && providerRecordId(row, index) !== scope.providerRecordId) return false;
      return true;
    }).slice(0, scope.limit);
    return filtered.map((row: Record<string, unknown>, index: number) => rowToProviderRecord(row, index, identity));
  }

  fetchSets(scope?: FetchScope) {
    return toAsyncIterable(this.records(scope).filter((record) => record.recordType === 'set'));
  }

  fetchCards(scope?: FetchScope) {
    return toAsyncIterable(this.records(scope).filter((record) => ['card', 'printing', 'variant'].includes(record.recordType)));
  }

  fetchVariants(scope?: FetchScope) {
    return this.fetchCards(scope);
  }

  fetchAssets(scope?: FetchScope) {
    return toAsyncIterable(this.records(scope).filter((record) => Boolean(record.payload.image_url ?? record.payload.imageUrl ?? record.payload.asset_url ?? record.payload.assetUrl)));
  }

  normaliseRecord(record: ProviderRecord) {
    return normaliseManualRecord(record);
  }

  validateRecord(record: ProviderRecord) {
    return validateProviderRecord(record);
  }
}
