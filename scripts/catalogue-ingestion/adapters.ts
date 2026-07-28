import { ManualCsvSourceAdapter, ManualJsonSourceAdapter } from './manualAdapters';
import { TcgdexSourceAdapter } from './tcgdexAdapter';
import type { SourceAdapter } from './sourceAdapter';

type AdapterOptions = {
  source: string;
  file?: string;
  language?: string;
  licenceStatus?: 'approved' | 'under_review' | 'restricted' | 'denied' | 'unknown';
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
      licenceStatus: options.licenceStatus ?? 'under_review',
    });
  }
  throw new Error(`Unsupported source adapter: ${options.source}`);
}

export const supportedSourceAdapters = ['manual-csv', 'manual-json', 'tcgdex'];
