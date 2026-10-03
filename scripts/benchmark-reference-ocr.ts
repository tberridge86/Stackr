import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEFAULT_CARD_ROI_MANIFEST, roiToPixelRect } from '../lib/cardRectification';
import type { LocalOcrRegionText } from '../lib/localOcrCardMatcher';
import { downloadReferenceImage } from './reference-image-downloader';
import {
  REFERENCE_OCR_BENCHMARK_SCHEMA_VERSION,
  evaluateReferenceOcrCase,
  findDuplicateReferenceImages,
  resolveReferenceCardQuery,
  summariseReferenceOcrCases,
  toHiresReferenceUrl,
  validateReferenceImage,
  type ReferenceCatalogueCard,
  type ReferenceImageValidation,
  type ReferenceOcrCase,
} from './reference-ocr-benchmark-core';

const DEFAULT_SCANNER_PACK = 'backend/data/scanner-packs/en-clip-base-v1/manifest.json';
const DEFAULT_REPORT = 'tmp/reference-ocr-benchmark/report.json';
const DEFAULT_CACHE_DIR = 'tmp/reference-ocr-benchmark/images';
const DEFAULT_QUERIES = [
  'Charizard from Obsidian Flames',
  'base1-4',
  'base2-4',
  'base1-58',
  'base2-60',
];
const DEFAULT_VIEWS = ['clean', 'jpeg_60', 'focus_blur'];
const ALLOWED_VIEWS = new Set(['clean', 'jpeg_60', 'focus_blur', 'dim']);
const IMPLEMENTATION_PATHS = [
  'scripts/reference-ocr-benchmark-core.ts',
  'scripts/reference-image-downloader.ts',
  'scripts/benchmark-reference-ocr.ts',
];

const requireFromBackend = createRequire(path.resolve('backend/package.json'));
const sharp = requireFromBackend('sharp') as (input?: Buffer) => any;

type CliOptions = {
  scannerPack: string;
  reportPath: string;
  cacheDir: string;
  queries: string[];
  views: string[];
  maxCards: number;
};

type SelectedCard = {
  card: ReferenceCatalogueCard;
  query: string;
  queryScore: number;
  queryReasons: string[];
};

type DownloadedCard = SelectedCard & {
  status: 'ready' | 'error';
  sourceUrl: string | null;
  cachePath: string | null;
  cacheHit: boolean;
  body: Buffer | null;
  validation: ReferenceImageValidation | null;
  attempts: Awaited<ReturnType<typeof downloadReferenceImage>>['attempts'];
  error: string | null;
};

function argumentValues(name: string) {
  const prefix = `--${name}=`;
  return process.argv.slice(2).filter((arg) => arg.startsWith(prefix)).map((arg) => arg.slice(prefix.length));
}

function singleArgument(name: string, fallback: string) {
  return argumentValues(name).at(-1) ?? fallback;
}

function parsePositiveInteger(value: string, label: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new Error(`${label} must be a positive integer.`);
  return number;
}

function parseCliOptions(): CliOptions {
  const queries = argumentValues('query').map((value) => value.trim()).filter(Boolean);
  const views = singleArgument('views', DEFAULT_VIEWS.join(','))
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const unsupportedViews = views.filter((view) => !ALLOWED_VIEWS.has(view));
  if (unsupportedViews.length) throw new Error(`Unsupported views: ${unsupportedViews.join(', ')}`);

  return {
    scannerPack: singleArgument('scanner-pack', DEFAULT_SCANNER_PACK),
    reportPath: singleArgument('report', DEFAULT_REPORT),
    cacheDir: singleArgument('cache-dir', DEFAULT_CACHE_DIR),
    queries: queries.length ? queries : DEFAULT_QUERIES,
    views: [...new Set(views)],
    maxCards: parsePositiveInteger(singleArgument('max-cards', '8'), 'max-cards'),
  };
}

function sha256(body: Buffer | string) {
  return createHash('sha256').update(body).digest('hex');
}

async function implementationSha256() {
  const hash = createHash('sha256');
  for (const filePath of IMPLEMENTATION_PATHS) {
    hash.update(filePath).update('\0').update(await readFile(filePath)).update('\0');
  }
  return hash.digest('hex');
}

async function readScannerPack(filePath: string) {
  const body = await readFile(filePath);
  const payload = JSON.parse(body.toString('utf8')) as { cards?: ReferenceCatalogueCard[] };
  const cards = (payload.cards ?? []).filter((card) => card.id && card.name && card.imageSmall);
  if (!cards.length) throw new Error(`No usable cards found in ${filePath}.`);
  return { body, cards };
}

function selectCards(cards: ReferenceCatalogueCard[], queries: string[], maxCards: number) {
  const selected = new Map<string, SelectedCard>();
  const resolutions = queries.map((query) => {
    const matches = resolveReferenceCardQuery(cards, query);
    for (const match of matches) {
      if (selected.size >= maxCards) break;
      if (!selected.has(match.card.id)) {
        selected.set(match.card.id, {
          card: match.card,
          query,
          queryScore: match.score,
          queryReasons: match.reasons,
        });
      }
    }
    return {
      query,
      matchCount: matches.length,
      matchedCardIds: matches.map((match) => match.card.id),
    };
  });
  const unmatched = resolutions.filter((item) => item.matchCount === 0);
  if (unmatched.length) throw new Error(`Queries matched no cards: ${unmatched.map((item) => item.query).join(', ')}`);
  if (!selected.size) throw new Error('No benchmark cards were selected.');
  return { selected: [...selected.values()], resolutions };
}

function contentTypeForFormat(format?: string | null) {
  if (format === 'jpg' || format === 'jpeg') return 'image/jpeg';
  if (format === 'webp') return 'image/webp';
  if (format === 'avif') return 'image/avif';
  return 'image/png';
}

async function readValidCache(cachePath: string) {
  if (!existsSync(cachePath)) return null;
  try {
    const body = await readFile(cachePath);
    const metadata = await sharp(body).metadata();
    const validation = validateReferenceImage({
      responseStatus: 200,
      contentType: contentTypeForFormat(metadata.format),
      body,
      metadata,
    });
    return validation.valid ? { body, validation } : null;
  } catch {
    return null;
  }
}

async function downloadCard(selected: SelectedCard, cacheDir: string): Promise<DownloadedCard> {
  const hiresUrl = toHiresReferenceUrl(selected.card.imageSmall);
  const urls = [hiresUrl, selected.card.imageSmall].filter((value): value is string => Boolean(value));
  const sourceKey = sha256(urls.join('\n')).slice(0, 12);
  const cachePath = path.join(
    cacheDir,
    `${selected.card.id.replace(/[^a-z0-9_.-]+/gi, '_')}-${sourceKey}.image`,
  );
  const cached = await readValidCache(cachePath);
  if (cached) {
    return {
      ...selected,
      status: 'ready',
      sourceUrl: toHiresReferenceUrl(selected.card.imageSmall),
      cachePath,
      cacheHit: true,
      body: cached.body,
      validation: cached.validation,
      attempts: [],
      error: null,
    };
  }

  const result = await downloadReferenceImage({
    urls,
    decodeImage: async (body) => sharp(body).metadata(),
  });
  if (result.status !== 'ready' || !result.body || !result.validation) {
    return {
      ...selected,
      status: 'error',
      sourceUrl: result.url,
      cachePath: null,
      cacheHit: false,
      body: null,
      validation: result.validation,
      attempts: result.attempts,
      error: result.error,
    };
  }

  await mkdir(cacheDir, { recursive: true });
  await writeFile(cachePath, result.body);
  return {
    ...selected,
    status: 'ready',
    sourceUrl: result.url,
    cachePath,
    cacheHit: false,
    body: result.body,
    validation: result.validation,
    attempts: result.attempts,
    error: null,
  };
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(Math.max(concurrency, 1), items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function createViews(body: Buffer, views: string[]) {
  const output: { viewId: string; body: Buffer }[] = [];
  for (const viewId of views) {
    if (viewId === 'clean') output.push({ viewId, body });
    else if (viewId === 'jpeg_60') {
      output.push({ viewId, body: await sharp(body).jpeg({ quality: 60, chromaSubsampling: '4:2:0' }).toBuffer() });
    } else if (viewId === 'focus_blur') {
      output.push({ viewId, body: await sharp(body).blur(1.25).jpeg({ quality: 82 }).toBuffer() });
    } else if (viewId === 'dim') {
      output.push({ viewId, body: await sharp(body).modulate({ brightness: 0.68, saturation: 0.9 }).jpeg({ quality: 82 }).toBuffer() });
    }
  }
  return output;
}

function cropBox(width: number, height: number, box: { left: number; top: number; width: number; height: number }) {
  const left = Math.max(0, Math.min(width - 1, Math.floor(width * box.left)));
  const top = Math.max(0, Math.min(height - 1, Math.floor(height * box.top)));
  return {
    left,
    top,
    width: Math.max(1, Math.min(width - left, Math.floor(width * box.width))),
    height: Math.max(1, Math.min(height - top, Math.floor(height * box.height))),
  };
}

const OCR_REGION_ROLES = [
  { passId: 'cardTitle', roiId: 'cardTitle', role: 'name', psm: 6 },
  { passId: 'collectorNumber', roiId: 'collectorNumber', role: 'collector-number', psm: 7 },
  { passId: 'setRarity', roiId: 'setRarity', role: 'set-code', psm: 6 },
  { passId: 'regulationCopyright', roiId: 'regulationCopyright', role: 'copyright', psm: 6 },
  {
    passId: 'regulationCopyrightLeftPsm6',
    roiId: 'regulationCopyright',
    role: 'collector-number',
    psm: 6,
    subRect: { x: 0, y: 0, width: 0.45, height: 1 },
  },
  {
    passId: 'regulationCopyrightLeftPsm11',
    roiId: 'regulationCopyright',
    role: 'collector-number',
    psm: 11,
    subRect: { x: 0, y: 0, width: 0.45, height: 1 },
  },
] as const;

type BenchmarkOcrRegion = typeof OCR_REGION_ROLES[number];

async function prepareOcrCrop(body: Buffer, region: BenchmarkOcrRegion) {
  const metadata = await sharp(body).metadata();
  const width = Number(metadata.width);
  const height = Number(metadata.height);
  if (!width || !height) throw new Error('OCR view is missing decoded dimensions.');
  const roi = DEFAULT_CARD_ROI_MANIFEST.regions.find((item) => item.id === region.roiId);
  if (!roi) throw new Error(`Production ROI is missing ${region.roiId}.`);
  const parentRect = roiToPixelRect(roi, { width, height });
  const subRect = 'subRect' in region ? region.subRect : null;
  const rect = subRect ? {
    x: parentRect.x + Math.round(parentRect.width * subRect.x),
    y: parentRect.y + Math.round(parentRect.height * subRect.y),
    width: Math.round(parentRect.width * subRect.width),
    height: Math.round(parentRect.height * subRect.height),
  } : parentRect;
  return sharp(body)
    .flatten({ background: '#ffffff' })
    .extract(cropBox(width, height, {
      left: rect.x / width,
      top: rect.y / height,
      width: rect.width / width,
      height: rect.height / height,
    }))
    .resize({ width: 2200, withoutEnlargement: false })
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1 })
    .png()
    .toBuffer();
}

function runTesseract(body: Buffer, region: BenchmarkOcrRegion) {
  const binary = process.env.STACKR_TESSERACT_BIN || 'tesseract';
  const startedAt = Date.now();
  const result = spawnSync(binary, [
    'stdin',
    'stdout',
    '--dpi',
    '300',
    '-l',
    'eng',
    '--oem',
    '1',
    '--psm',
    String(region.psm),
    '-c',
    'preserve_interword_spaces=1',
  ], {
    input: body,
    encoding: 'utf8',
    timeout: 20_000,
    maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, OMP_THREAD_LIMIT: process.env.OMP_THREAD_LIMIT || '1' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Tesseract exited ${result.status}: ${String(result.stderr ?? '').trim().slice(0, 240)}`);
  }
  return {
    text: String(result.stdout ?? '').replace(/\s+$/g, '').trim(),
    durationMs: Date.now() - startedAt,
  };
}

async function ocrView(body: Buffer) {
  const regions: LocalOcrRegionText[] = [];
  const durations: Record<string, number> = {};
  for (const region of OCR_REGION_ROLES) {
    const crop = await prepareOcrCrop(body, region);
    const result = runTesseract(crop, region);
    regions.push({ role: region.role, text: result.text });
    durations[region.passId] = result.durationMs;
  }
  return { regions, durations };
}

function verifyTesseract() {
  const binary = process.env.STACKR_TESSERACT_BIN || 'tesseract';
  const result = spawnSync(binary, ['--version'], { encoding: 'utf8', timeout: 5_000 });
  if (result.error || result.status !== 0) {
    throw new Error(`Tesseract is required for this desktop proxy benchmark (${result.error?.message ?? result.stderr}).`);
  }
  return String(result.stdout ?? '').split(/\r?\n/)[0]?.trim() || 'unknown';
}

function gitValue(args: string[], fallback: string) {
  const result = spawnSync('git', args, { encoding: 'utf8', timeout: 5_000 });
  return result.status === 0 ? String(result.stdout).trim() : fallback;
}

export async function runReferenceOcrBenchmark(options = parseCliOptions()) {
  const tesseractVersion = verifyTesseract();
  const scannerPack = await readScannerPack(options.scannerPack);
  const selection = selectCards(scannerPack.cards, options.queries, options.maxCards);
  const downloaded = await mapWithConcurrency(selection.selected, 2, (card) => downloadCard(card, options.cacheDir));
  const ready = downloaded.filter((card): card is DownloadedCard & { body: Buffer; validation: ReferenceImageValidation } => (
    card.status === 'ready' && Boolean(card.body) && Boolean(card.validation)
  ));
  const duplicateImages = findDuplicateReferenceImages(ready.map((card) => ({
    cardId: card.card.id,
    validation: card.validation,
  })));
  const cases: ReferenceOcrCase[] = [];
  const ocrDurations: { cardId: string; viewId: string; durations: Record<string, number> }[] = [];

  for (const downloadedCard of ready) {
    for (const view of await createViews(downloadedCard.body, options.views)) {
      const ocr = await ocrView(view.body);
      cases.push(evaluateReferenceOcrCase({
        expectedCard: downloadedCard.card,
        catalogue: scannerPack.cards,
        viewId: view.viewId,
        regions: ocr.regions,
      }));
      ocrDurations.push({ cardId: downloadedCard.card.id, viewId: view.viewId, durations: ocr.durations });
    }
  }

  const failures = downloaded.filter((card) => card.status === 'error');
  const status = failures.length || duplicateImages.length || cases.length === 0 ? 'incomplete' : 'measured';
  const report = {
    schemaVersion: REFERENCE_OCR_BENCHMARK_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    status,
    scope: 'offline_recognition_tooling_only',
    productionCatalogueChanges: 0,
    automaticCatalogueMutationAllowed: false,
    releaseEvidence: false,
    source: {
      scannerPackPath: options.scannerPack,
      scannerPackSha256: sha256(scannerPack.body),
      scannerPackCardCount: scannerPack.cards.length,
      imageProvider: 'PokemonTCG.io URLs already recorded in the local scanner-pack snapshot',
      downloadedPixelsPersistedOutsideTemporaryCache: false,
      implementationSha256: await implementationSha256(),
      sourceCommit: gitValue(['rev-parse', 'HEAD'], 'unknown'),
      sourceTreeDirty: Boolean(gitValue(['status', '--short'], 'unknown')),
    },
    runtime: {
      ocrEngine: tesseractVersion,
      ocrRole: 'desktop_proxy_not_mobile_runtime',
      roiManifestVersion: DEFAULT_CARD_ROI_MANIFEST.version,
      ocrPasses: OCR_REGION_ROLES.map((region) => region.passId),
      views: options.views,
    },
    queryResolutions: selection.resolutions,
    cards: downloaded.map((item) => ({
      id: item.card.id,
      name: item.card.name,
      language: item.card.language ?? 'en',
      setId: item.card.setId ?? null,
      setName: item.card.setName ?? null,
      collectorNumber: item.card.number ?? null,
      printedTotal: item.card.printedTotal ?? null,
      rarity: item.card.rarity ?? null,
      query: item.query,
      queryScore: item.queryScore,
      queryReasons: item.queryReasons,
      status: item.status,
      sourceUrl: item.sourceUrl,
      cacheHit: item.cacheHit,
      validation: item.validation,
      attempts: item.attempts,
      error: item.error,
    })),
    duplicateImages,
    cases,
    ocrDurations,
    summary: summariseReferenceOcrCases(cases),
    blockers: [
      'The mobile ML Kit OCR runtime has not been measured by this tool.',
      'Real phone captures are not represented by canonical art plus synthetic distortions.',
      'No visual embedding score is fused here, so OCR results cannot be automatically accepted.',
    ],
  };

  await mkdir(path.dirname(options.reportPath), { recursive: true });
  await writeFile(options.reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: report.status,
    selectedCards: selection.selected.length,
    validImages: ready.length,
    cases: report.summary.caseCount,
    top1Pct: report.summary.top1Pct,
    top3Pct: report.summary.top3Pct,
    collectorNumberPct: report.summary.collectorNumberPct,
    automaticAcceptanceCount: report.summary.automaticAcceptanceCount,
    report: options.reportPath,
  }, null, 2));
  if (status !== 'measured') process.exitCode = 1;
  return report;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  runReferenceOcrBenchmark().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
