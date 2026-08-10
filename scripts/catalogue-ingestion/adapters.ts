import { ManualCsvSourceAdapter, ManualJsonSourceAdapter } from './manualAdapters';
import { PikaQianApiSourceAdapter } from './pikaqianAdapter';
import { PikaQianSourceAdapter, XimilarResidualScanSourceAdapter } from './providerFileAdapters';
import { TcgdexSourceAdapter } from './tcgdexAdapter';
import type { SourceAdapter } from './sourceAdapter';
import type { LicenceStatus } from './sourceAdapter';

type AdapterOptions = {
  source: string;
  file?: string;
  language?: string;
  baseUrl?: string;
  snapshotRoot?: string;
  snapshotVersion?: string;
  licenceStatus?: LicenceStatus;
  assetLicenceStatus?: LicenceStatus;
};

export function createSourceAdapter(options: AdapterOptions): SourceAdapter {
  const source = options.source.trim().toLowerCase();
  if (source === 'manual-csv' || source === 'csv') {
    if (!options.file) throw new Error('Manual CSV ingestion requires --file=path/to/dataset.csv');
    return new ManualCsvSourceAdapter({
      filePath: options.file,
      licenceStatus: options.licenceStatus ?? 'approved',
    });
  }
  if (source === 'manual-json' || source === 'json') {
    if (!options.file) throw new Error('Manual JSON ingestion requires --file=path/to/dataset.json');
    return new ManualJsonSourceAdapter({
      filePath: options.file,
      licenceStatus: options.licenceStatus ?? 'approved',
    });
  }
  if (source === 'tcgdex') {
    return new TcgdexSourceAdapter({
      language: options.language,
      baseUrl: options.baseUrl,
      snapshotRoot: options.snapshotRoot,
      snapshotVersion: options.snapshotVersion,
      licenceStatus: options.licenceStatus ?? 'approved',
      assetLicenceStatus: options.assetLicenceStatus ?? 'under_review',
    });
  }
  if (source === 'pikaqian') {
    if (!options.file) {
      return new PikaQianApiSourceAdapter({
        baseUrl: options.baseUrl,
        licenceStatus: options.licenceStatus ?? 'under_review',
        assetLicenceStatus: options.assetLicenceStatus ?? 'under_review',
      });
    }
    return new PikaQianSourceAdapter({
      filePath: options.file,
      licenceStatus: options.licenceStatus ?? 'under_review',
    });
  }
  if (source === 'ximilar-residual-scans' || source === 'ximilar') {
    if (!options.file) throw new Error('Ximilar residual ingestion requires --file=path/to/supplied-scan-identifications.json');
    return new XimilarResidualScanSourceAdapter({
      filePath: options.file,
      licenceStatus: options.licenceStatus ?? 'under_review',
    });
  }
  throw new Error(`Unsupported source adapter: ${options.source}`);
}

export const supportedSourceAdapters = ['manual-csv', 'manual-json', 'tcgdex', 'pikaqian', 'ximilar-residual-scans'];
