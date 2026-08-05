import { ManualJsonSourceAdapter } from './manualAdapters';
import type { FetchScope, ProviderRecord, SourceHealth, SourceIdentity } from './sourceAdapter';

type ProviderFileAdapterOptions = {
  filePath: string;
  licenceStatus?: 'approved' | 'under_review' | 'restricted' | 'denied' | 'unknown';
};

async function* emptyRecords() {
  return;
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
