import { ManualJsonSourceAdapter } from './manualAdapters';
import {
  cleanText,
  type FetchScope,
  type ProviderRecord,
  type SourceHealth,
  type SourceIdentity,
} from './sourceAdapter';

type ProviderFileAdapterOptions = {
  filePath: string;
  licenceStatus?: 'approved' | 'under_review' | 'restricted' | 'denied' | 'unknown';
};

async function* emptyRecords() {
  return;
}

async function* streamRecords(records: ProviderRecord[]) {
  for (const record of records) yield record;
}

export class PikaQianSourceAdapter extends ManualJsonSourceAdapter {
  constructor(options: ProviderFileAdapterOptions) {
    super({
      filePath: options.filePath,
      sourceCode: 'pikaqian',
      displayName: 'PikaQian reviewed Simplified Chinese gap file',
      licenceStatus: options.licenceStatus ?? 'under_review',
    });
  }

  identifySource(): SourceIdentity {
    return {
      code: 'pikaqian',
      displayName: 'PikaQian',
      sourceType: 'catalogue',
      baseUrl: null,
      termsUrl: null,
      licenceStatus: this.options.licenceStatus ?? 'under_review',
      attributionRequired: true,
      robotsPolicy: 'reviewed_file_only_no_scraping',
      rateLimitConfig: {},
      capabilities: ['cards', 'variants', 'assets', 'manual_import'],
      automatedRefreshAllowed: false,
    };
  }

  fetchCards(scope: FetchScope = {}) {
    return scope.setId ? super.fetchCards(scope) : emptyRecords();
  }

  fetchVariants(scope: FetchScope = {}) {
    return scope.setId ? super.fetchVariants(scope) : emptyRecords();
  }

  fetchAssets(scope: FetchScope = {}) {
    const records = this.records(scope);
    const cardAssets = scope.setId ? records.filter((record) => Boolean(
      record.payload.image_url
      ?? record.payload.imageUrl
      ?? record.payload.asset_url
      ?? record.payload.assetUrl,
    )) : [];
    const setCovers = records.flatMap((record) => {
      const imageUrl = cleanText(record.payload.pack_image_url ?? record.payload.packImageUrl);
      if (record.recordType !== 'set' || !imageUrl) return [];
      return [{
        ...record,
        providerRecordId: `${record.providerRecordId}:set-cover`,
        recordType: 'asset' as const,
        payload: {
          ...record.payload,
          image_url: imageUrl,
          image_language_code: record.languageCode,
          asset_type: 'sealed_product_image',
          asset_role: 'set_cover',
        },
      }];
    });
    return streamRecords([...cardAssets, ...setCovers]);
  }
}

export class XimilarResidualScanSourceAdapter extends ManualJsonSourceAdapter {
  constructor(options: ProviderFileAdapterOptions) {
    super({
      filePath: options.filePath,
      sourceCode: 'ximilar_residual_scans',
      displayName: 'Ximilar supplied residual scan identifications',
      licenceStatus: options.licenceStatus ?? 'under_review',
    });
  }

  identifySource(): SourceIdentity {
    return {
      code: 'ximilar_residual_scans',
      displayName: 'Ximilar residual scan identifications',
      sourceType: 'recognition',
      baseUrl: 'https://api.ximilar.com/',
      termsUrl: 'https://www.ximilar.com/',
      licenceStatus: this.options.licenceStatus ?? 'under_review',
      attributionRequired: true,
      robotsPolicy: 'supplied_scans_only_no_bulk_image_download',
      rateLimitConfig: { source: 'manual_residual_scan_file_only' },
      capabilities: ['cards', 'variants', 'manual_import'],
      automatedRefreshAllowed: false,
    };
  }

  async healthCheck(): Promise<SourceHealth> {
    const health = await super.healthCheck();
    return {
      ...health,
      capabilities: { cards: true, variants: true, assets: false, manual_import: true },
      message: health.status === 'ok'
        ? 'Ximilar residual scan file is readable. Asset fetching is disabled by policy.'
        : health.message,
    };
  }

  fetchAssets(_scope?: FetchScope) {
    return emptyRecords();
  }
}
