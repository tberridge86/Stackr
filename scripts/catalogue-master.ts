import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { createSourceAdapter } from './catalogue-ingestion/adapters';
import { CatalogueIngestionRunner, ensureSource } from './catalogue-ingestion/pipeline';
import {
  SUPPORTED_CATALOGUE_LANGUAGE_CODES,
  cleanText,
  normaliseFinishCode,
  normaliseLanguageCode,
  normaliseVariantCode,
  proposedCanonicalKey,
  type SupportedCatalogueLanguageCode,
} from './catalogue-ingestion/sourceAdapter';

const STAGING_SUPABASE_REF = 'lmwfhvexfcoyeuoyrlco';
const PRODUCTION_SUPABASE_REFS = new Set(['oakdbbzdqwurpjnoqhmu']);
const REPORT_DIR = 'reports/catalogue';
const REPORT_FILES = {
  masterCoverage: `${REPORT_DIR}/master-coverage.csv`,
  pikaqianCoverage: `${REPORT_DIR}/pikaqian-coverage.csv`,
  missingCardRecords: `${REPORT_DIR}/missing-card-records.csv`,
  missingCardImages: `${REPORT_DIR}/missing-card-images.csv`,
  missingSetArt: `${REPORT_DIR}/missing-set-art.csv`,
  imageLeftovers: `${REPORT_DIR}/image-leftovers.csv`,
  sameArtworkReferences: `${REPORT_DIR}/same-artwork-references.csv`,
  scanAcquisitionQueue: `${REPORT_DIR}/scan-acquisition-queue.csv`,
  conflicts: `${REPORT_DIR}/conflicts.csv`,
  rightsBlocked: `${REPORT_DIR}/rights-blocked.csv`,
  summary: `${REPORT_DIR}/summary.json`,
};

type Command = 'discover' | 'apply' | 'report' | 'validate' | 'missing' | 'publish';
type ProviderCode = 'tcgdex' | 'pikaqian' | 'ximilar_residual_scans';
type AssetKind = 'card-images' | 'set-art' | 'all';
type SetCompletionStatus =
  | 'Metadata incomplete'
  | 'Images incomplete'
  | 'Set art incomplete'
  | 'Under review'
  | 'Complete';

type Args = {
  command: Command;
  apply: boolean;
  dryRun: boolean;
  target: string | null;
  provider: ProviderCode | null;
  includeImages: boolean;
  metadataOnly: boolean;
  assetsOnly: boolean;
  assetKind: AssetKind;
  approvedOnly: boolean;
  languages: SupportedCatalogueLanguageCode[];
  setId: string | null;
  setIds: string[];
  maxSets: number | null;
  setOffset: number;
  writeConcurrency: number;
  reportDir: string;
  setArtRoot: string;
  version: string | null;
  controlledStaging: boolean;
  coverageLimited: boolean;
  pikaqianFile: string | null;
  pikaqianApiConfigured: boolean;
  pikaqianBaseUrl: string | null;
  tcgdexSnapshotRoot: string | null;
  tcgdexSnapshotVersion: string | null;
  ximilarScanFile: string | null;
  licenceStatus: 'approved' | 'under_review' | 'restricted' | 'denied' | 'unknown';
  assetLicenceStatus: 'approved' | 'under_review' | 'restricted' | 'denied' | 'unknown';
};

type Stage = {
  id: string;
  phase: 'metadata' | 'images' | 'recognition';
  provider: ProviderCode;
  language: SupportedCatalogueLanguageCode;
  command: 'run_source' | 'run_set';
  setId?: string | null;
  file?: string | null;
  baseUrl?: string | null;
  allowImageAssets: boolean;
  setsOnly?: boolean;
  assetsOnly?: boolean;
  approvedOnly?: boolean;
  writes: boolean;
  reason: string;
  blocked?: boolean;
};

type SetScopeProvider = Extract<ProviderCode, 'tcgdex' | 'pikaqian'>;

type SetScope = {
  provider: SetScopeProvider;
  language: SupportedCatalogueLanguageCode;
  setId: string;
};

type SetScopeSetRow = {
  id: string;
  language_code: string;
};

type SetScopeSourceRow = {
  id: string;
  code: string;
};

type SetScopeIdentifierRow = {
  source_id: string;
  source_entity_type: string;
  external_id: string;
  language_code: string | null;
  set_id: string | null;
  is_current: boolean;
  deprecated_at: string | null;
};

type SupabaseClientLike = {
  schema: (schema: string) => { from: (tableName: string) => any };
};

type SetRow = {
  id: string;
  language_code: string;
  set_code: string | null;
  provider_set_code: string | null;
  native_name: string;
  english_display_name: string | null;
  release_date: string | null;
  total: number | null;
  deprecated_at?: string | null;
};

type PrintingRow = {
  id: string;
  set_id: string;
  language_code: string;
  collector_number: string;
  deprecated_at?: string | null;
};

type VariantRow = {
  id: string;
  printing_id: string;
  set_id: string;
  language_code: string;
  collector_number: string;
  variant_code: string;
  finish_code: string | null;
  canonical_key: string;
  artwork_key?: string | null;
  deprecated_at?: string | null;
};

type AssetRow = {
  id: string;
  set_id: string | null;
  printing_id: string | null;
  variant_id: string | null;
  asset_type: string;
  url: string | null;
  rights_status: string;
  permission_status?: string | null;
  publicly_servable: boolean;
  original_source_url?: string | null;
  original_source_identifier?: string | null;
  source_attribution?: string | null;
  storage_provider?: string | null;
  storage_path?: string | null;
  storage_key?: string | null;
  content_sha256?: string | null;
  perceptual_hash?: string | null;
  deprecated_at?: string | null;
};

type RawRecordRow = {
  id: string;
  source_id: string;
  record_type: string;
  external_id: string;
  language_code: string | null;
  source_url: string | null;
  licence_status: string;
  validation_status?: string | null;
  raw_payload: Record<string, unknown>;
  deprecated_at?: string | null;
};

type ExternalIdentifierRow = {
  id: string;
  source_id: string;
  source_entity_type: string;
  external_id: string;
  external_uri: string | null;
  language_code: string | null;
  set_id: string | null;
  printing_id: string | null;
  variant_id: string | null;
  confidence: number;
  is_current: boolean;
  deprecated_at: string | null;
};

type ConflictRow = {
  id: string;
  conflict_type: string;
  severity: string;
  status: string;
  entity_schema: string | null;
  entity_table: string | null;
  entity_id: string | null;
  canonical_key: string | null;
  proposed_payload: Record<string, unknown> | null;
  existing_payload: Record<string, unknown> | null;
  internal_notes: string | null;
};

type ExpectedCardRecord = {
  language: string;
  setRef: string;
  setCode: string;
  collectorNumber: string;
  variant: string;
  finish: string;
  provider: string;
  providerId: string;
  sourceUrl: string | null;
  rightsStatus: string;
  canonicalKey: string;
};

type ImageCandidate = {
  provider: string;
  providerGroup: 'tcgdex' | 'pikaqian' | 'approved_commercial_provider' | 'existing_stackr_catalogue_assets';
  providerId: string;
  sourceUrl: string | null;
  rightsStatus: string;
  permissionStatus: string;
  language: string;
  setCode: string;
  collectorNumber: string;
  variant: string;
  finish: string;
  canonicalKey: string;
};

type MissingVariantImage = {
  variant: VariantRow;
  set: SetRow | undefined;
  canonicalKey: string;
  language: string;
  setCode: string;
  collectorNumber: string;
  variantCode: string;
  finish: string;
};

type ImageLeftoverClassification = {
  leftovers: Record<string, unknown>[];
  groupA: Record<string, unknown>[];
  groupB: Record<string, unknown>[];
  groupC: Record<string, unknown>[];
  conflicts: Record<string, unknown>[];
};

type SetCompletionGates = {
  missingCardRecords: number;
  missingRequiredVariants: number;
  missingExactNativeImages: number;
  missingLogo: number;
  missingSymbol: number;
  unresolvedIdentityConflicts: number;
  unvalidatedImages: number;
};

type SetArtFile = {
  language: SupportedCatalogueLanguageCode;
  setCode: string;
  assetType: 'set_logo' | 'set_symbol';
  localKind: 'logo' | 'symbol';
  relativePath: string;
  absolutePath: string;
  sha256: string;
  byteSize: number;
};

function valueAt(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value != null && String(value).trim() !== '') return value;
  }
  return null;
}

function normaliseProviderFilter(value: unknown): ProviderCode | null {
  const raw = cleanText(value);
  if (!raw) return null;
  const compact = raw.toLowerCase().replace(/-/g, '_');
  if (compact === 'tcgdex') return 'tcgdex';
  if (compact === 'pikaqian') return 'pikaqian';
  if (compact === 'ximilar' || compact === 'ximilar_residual_scans') return 'ximilar_residual_scans';
  throw new Error(`Unsupported catalogue provider: ${raw}. Use tcgdex, pikaqian, or ximilar_residual_scans.`);
}

function normaliseAssetKind(value: unknown): AssetKind {
  const raw = cleanText(value);
  if (!raw) return 'all';
  const compact = raw.toLowerCase().replace(/_/g, '-');
  if (compact === 'card-image' || compact === 'card-images' || compact === 'images') return 'card-images';
  if (compact === 'set-art' || compact === 'setart' || compact === 'set-assets') return 'set-art';
  if (compact === 'all') return 'all';
  throw new Error(`Unsupported catalogue asset kind: ${raw}. Use card-images, set-art, or all.`);
}

function providerSelected(args: Args, provider: ProviderCode) {
  return !args.provider || args.provider === provider;
}

function parseArgv(argv: string[]): Args {
  const [rawCommand = 'discover', ...rest] = argv;
  const command = rawCommand as Command;
  if (!['discover', 'apply', 'report', 'validate', 'missing', 'publish'].includes(command)) {
    throw new Error(`Unknown catalogue command: ${rawCommand}`);
  }

  const arg = (name: string, fallback = '') => {
    const prefix = `--${name}=`;
    const match = rest.find((entry) => entry.startsWith(prefix));
    return match ? match.slice(prefix.length) : fallback;
  };
  const hasFlag = (name: string) => rest.includes(`--${name}`);
  const dryRun = hasFlag('dry-run') || hasFlag('dryRun');
  const metadataOnly = hasFlag('metadata-only') || hasFlag('metadataOnly');
  const assetsOnly = hasFlag('assets') || hasFlag('asset-only') || hasFlag('assetOnly');
  const assetKind = normaliseAssetKind(arg('asset-kind') || arg('assetKind'));
  const languages = (arg('language') || arg('languages') || SUPPORTED_CATALOGUE_LANGUAGE_CODES.join(','))
    .split(',')
    .map((entry) => normaliseLanguageCode(entry.trim()) as SupportedCatalogueLanguageCode);
  const writeConcurrency = Number(arg('writeConcurrency') || arg('write-concurrency') || 1);
  if (!Number.isInteger(writeConcurrency) || writeConcurrency < 1 || writeConcurrency > 16) {
    throw new Error('--writeConcurrency must be an integer from 1 to 16.');
  }
  const setId = cleanText(arg('setId') || arg('set'));
  const setIds = [...new Set([
    ...(setId ? [setId] : []),
    ...(arg('setIds') || arg('set-ids'))
      .split(',')
      .map(cleanText)
      .filter(Boolean) as string[],
  ])];

  return {
    command,
    apply: command === 'publish' ? !dryRun : hasFlag('apply') && !dryRun,
    dryRun,
    target: cleanText(arg('target')) ?? cleanText(process.env.STACKR_CATALOGUE_IMPORT_TARGET ?? process.env.STACKR_IMPORT_TARGET),
    provider: normaliseProviderFilter(arg('provider')),
    includeImages: !metadataOnly && (
      (assetsOnly && assetKind !== 'set-art')
      || hasFlag('includeImages')
      || hasFlag('include-images')
      || hasFlag('images')
    ),
    metadataOnly,
    assetsOnly,
    assetKind,
    approvedOnly: hasFlag('approved-only') || hasFlag('approvedOnly'),
    languages: [...new Set(languages)],
    setId,
    setIds,
    maxSets: arg('maxSets') ? Number(arg('maxSets')) : null,
    setOffset: Number(arg('setOffset') || arg('set-offset') || 0),
    writeConcurrency,
    reportDir: cleanText(arg('reportDir')) ?? REPORT_DIR,
    setArtRoot: cleanText(arg('setArtRoot') || arg('set-art-root') || process.env.STACKR_SET_ART_ROOT) ?? 'catalogue',
    version: cleanText(arg('version') || process.env.STACKR_CATALOGUE_PUBLISH_VERSION),
    controlledStaging: hasFlag('controlled-staging') || hasFlag('controlledStaging'),
    coverageLimited: hasFlag('coverage-limited') || hasFlag('coverageLimited'),
    pikaqianFile: cleanText(arg('pikaqianFile') || process.env.PIKAQIAN_CATALOGUE_FILE),
    pikaqianApiConfigured: Boolean(cleanText(process.env.PIKAQIAN_API_KEY)),
    pikaqianBaseUrl: cleanText(arg('pikaqianBaseUrl') || process.env.PIKAQIAN_BASE_URL),
    tcgdexSnapshotRoot: cleanText(arg('tcgdexSnapshotRoot') || arg('tcgdex-snapshot-root') || process.env.TCGDEX_SNAPSHOT_ROOT),
    tcgdexSnapshotVersion: cleanText(arg('tcgdexSnapshotVersion') || arg('tcgdex-snapshot-version') || process.env.TCGDEX_SNAPSHOT_VERSION),
    ximilarScanFile: cleanText(arg('ximilarScanFile') || process.env.XIMILAR_RESIDUAL_SCAN_FILE),
    licenceStatus: (cleanText(arg('licenceStatus')) as Args['licenceStatus']) ?? 'under_review',
    assetLicenceStatus: (cleanText(arg('assetLicenceStatus') || arg('asset-licence-status')) as Args['assetLicenceStatus']) ?? 'under_review',
  };
}

function reportFiles(reportDir: string) {
  return {
    masterCoverage: `${reportDir}/master-coverage.csv`,
    pikaqianCoverage: `${reportDir}/pikaqian-coverage.csv`,
    missingCardRecords: `${reportDir}/missing-card-records.csv`,
    missingCardImages: `${reportDir}/missing-card-images.csv`,
    missingSetArt: `${reportDir}/missing-set-art.csv`,
    imageLeftovers: `${reportDir}/image-leftovers.csv`,
    sameArtworkReferences: `${reportDir}/same-artwork-references.csv`,
    scanAcquisitionQueue: `${reportDir}/scan-acquisition-queue.csv`,
    conflicts: `${reportDir}/conflicts.csv`,
    rightsBlocked: `${reportDir}/rights-blocked.csv`,
    summary: `${reportDir}/summary.json`,
  };
}

function assertStagingTarget(args: Args) {
  if (args.target !== 'staging') {
    throw new Error('Master catalogue commands must target staging. Pass --target=staging or set STACKR_CATALOGUE_IMPORT_TARGET=staging.');
  }
  const url = process.env.SUPABASE_URL ?? '';
  if (!url.includes(STAGING_SUPABASE_REF)) {
    throw new Error(`Master catalogue commands must use the canonical staging Supabase project ${STAGING_SUPABASE_REF}. Set SUPABASE_URL=https://${STAGING_SUPABASE_REF}.supabase.co.`);
  }
  for (const ref of PRODUCTION_SUPABASE_REFS) {
    if (url.includes(ref)) {
      throw new Error(`Refusing to use production Supabase project ${ref}. Configure the staging Supabase URL before running the master importer.`);
    }
  }
}

function createStagingSupabase(args: Args) {
  assertStagingTarget(args);
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    ?? process.env.SUPABASE_SECRET_KEY
    ?? process.env.SUPABASE_SERVICE_KEY
    ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Set SUPABASE_URL and a staging Supabase key before reading or applying the master catalogue.');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as SupabaseClientLike;
}

function toPosixPath(path: string) {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/');
}

function setArtFolderCode(set: Pick<SetRow, 'id' | 'set_code' | 'provider_set_code'>) {
  return cleanText(set.set_code) ?? cleanText(set.provider_set_code) ?? cleanText(set.id) ?? '';
}

function setArtExpectedPath(language: string, setCode: string, localKind: 'logo' | 'symbol', root = 'catalogue') {
  return toPosixPath(`${root}/${language}/${setCode}/${localKind}.webp`);
}

function setLookupKeys(set: SetRow) {
  const language = normaliseLanguageCode(set.language_code);
  return [
    set.id,
    set.set_code,
    set.provider_set_code,
  ].map(cleanText)
    .filter(Boolean)
    .map((value) => `${language}:${String(value).toLowerCase()}`);
}

function hashFile(path: string) {
  const body = readFileSync(path);
  return {
    sha256: createHash('sha256').update(body).digest('hex'),
    byteSize: body.byteLength,
  };
}

function discoverSetArtFiles(
  root = 'catalogue',
  languages: readonly SupportedCatalogueLanguageCode[] = SUPPORTED_CATALOGUE_LANGUAGE_CODES,
): SetArtFile[] {
  const files: SetArtFile[] = [];
  for (const language of languages) {
    const languageDir = join(root, language);
    if (!existsSync(languageDir)) continue;
    for (const entry of readdirSync(languageDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const setCode = cleanText(entry.name);
      if (!setCode) continue;
      for (const localKind of ['logo', 'symbol'] as const) {
        const absolutePath = join(languageDir, entry.name, `${localKind}.webp`);
        if (!existsSync(absolutePath)) continue;
        const { sha256, byteSize } = hashFile(absolutePath);
        files.push({
          language,
          setCode,
          assetType: localKind === 'logo' ? 'set_logo' : 'set_symbol',
          localKind,
          relativePath: setArtExpectedPath(language, setCode, localKind, root),
          absolutePath,
          sha256,
          byteSize,
        });
      }
    }
  }
  return files.sort((a, b) => `${a.language}:${a.setCode}:${a.localKind}`.localeCompare(`${b.language}:${b.setCode}:${b.localKind}`));
}

function buildSetArtPlan(args: Args) {
  const discoveredFiles = discoverSetArtFiles(args.setArtRoot, args.languages);
  const sets = [...new Set(discoveredFiles.map((file) => `${file.language}:${file.setCode}`))].length;
  return [{
    id: 'stackr:set-art:approved-local-files',
    phase: 'set_art',
    provider: 'stackr_set_art',
    languages: args.languages,
    assetKind: 'set-art',
    root: args.setArtRoot,
    discoveredFiles: discoveredFiles.length,
    discoveredSets: sets,
    approvedOnly: args.approvedOnly,
    writes: args.apply,
    reason: 'Import approved native set logos and symbols from catalogue/<language>/<set_code>/logo.webp and symbol.webp.',
  }];
}

export function buildMasterPlan(args: Args, setIds: string[] = []): Stage[] {
  if (args.assetKind === 'set-art') return [];
  const selectedSets = args.setIds.length
    ? args.setIds
    : args.setId
    ? [args.setId]
    : setIds.slice(0, args.maxSets ?? setIds.length);
  const plannedTcgdexSets = args.apply ? [] : selectedSets;
  const pikaqianConfigured = Boolean(args.pikaqianFile || args.pikaqianApiConfigured);
  const refreshTcgdexSetList = !args.setId && args.setIds.length === 0 && args.setOffset === 0;
  const tcgdexMetadata = providerSelected(args, 'tcgdex') && !args.assetsOnly && refreshTcgdexSetList ? args.languages.map((language) => ({
    id: `tcgdex:${language}:sets`,
    phase: 'metadata' as const,
    provider: 'tcgdex' as const,
    language,
    command: 'run_source' as const,
    setId: null,
    allowImageAssets: false,
    setsOnly: true,
    writes: args.apply,
    reason: 'Import set metadata before card identities or images.',
  })) : [];
  const tcgdexCards = providerSelected(args, 'tcgdex') && !args.assetsOnly ? plannedTcgdexSets.flatMap((setId) => args.languages.map((language) => ({
    id: `tcgdex:${language}:${setId}:cards`,
    phase: 'metadata' as const,
    provider: 'tcgdex' as const,
    language,
    command: 'run_set' as const,
    setId,
    allowImageAssets: false,
    writes: args.apply,
    reason: 'Import card identities with variant and finish before images.',
  }))) : [];
  const pikaqian = providerSelected(args, 'pikaqian') && args.languages.includes('zh-cn') && !args.assetsOnly ? [{
    id: 'pikaqian:zh-cn:gaps',
    phase: 'metadata' as const,
    provider: 'pikaqian' as const,
    language: 'zh-cn' as const,
    command: 'run_source' as const,
    file: args.pikaqianFile,
    baseUrl: args.pikaqianBaseUrl,
    setId: null,
    allowImageAssets: false,
    writes: args.apply,
    blocked: !pikaqianConfigured,
    reason: args.pikaqianFile
      ? 'Reviewed Simplified Chinese gap filling from PikaQian file.'
      : args.pikaqianApiConfigured
      ? 'Simplified Chinese gap filling through the PikaQian metadata API.'
      : 'Skipped until PIKAQIAN_API_KEY or --pikaqianFile is supplied; no scraping or guessing.',
  }] : [];
  const ximilar = providerSelected(args, 'ximilar_residual_scans') && !args.assetsOnly ? [{
    id: 'ximilar:residual-scans',
    phase: 'recognition' as const,
    provider: 'ximilar_residual_scans' as const,
    language: args.languages.find((language) => language !== 'en') ?? 'ja',
    command: 'run_source' as const,
    file: args.ximilarScanFile,
    setId: null,
    allowImageAssets: false,
    writes: args.apply,
    blocked: !args.ximilarScanFile,
    reason: args.ximilarScanFile
      ? 'Use supplied residual scan identifications only; Ximilar is not an image source.'
      : 'Skipped until --ximilarScanFile is supplied; Ximilar bulk image download is forbidden.',
  }] : [];
  const tcgdexImageStages = args.includeImages && providerSelected(args, 'tcgdex')
    ? plannedTcgdexSets.flatMap((setId) => args.languages.map((language) => ({
      id: `tcgdex:${language}:${setId}:images`,
      phase: 'images' as const,
      provider: 'tcgdex' as const,
      language,
      command: 'run_set' as const,
      setId,
      allowImageAssets: true,
      assetsOnly: args.assetsOnly,
      approvedOnly: args.approvedOnly,
      writes: args.apply,
      reason: 'Import native-language card images only after card metadata is present.',
    })))
    : [];
  const pikaqianImageStages = args.includeImages && providerSelected(args, 'pikaqian') && args.languages.includes('zh-cn')
    ? selectedSets.map((setId) => ({
      id: `pikaqian:zh-cn:${setId}:images`,
      phase: 'images' as const,
      provider: 'pikaqian' as const,
      language: 'zh-cn' as const,
      command: 'run_set' as const,
      file: args.pikaqianFile,
      baseUrl: args.pikaqianBaseUrl,
      setId,
      allowImageAssets: true,
      assetsOnly: args.assetsOnly,
      approvedOnly: args.approvedOnly,
      writes: args.apply,
      blocked: !pikaqianConfigured,
      reason: 'Attach exact Simplified Chinese PikaQian image URLs only after staged provider rights are known.',
    }))
    : [];
  return [...tcgdexMetadata, ...tcgdexCards, ...pikaqian, ...ximilar, ...tcgdexImageStages, ...pikaqianImageStages];
}

function buildSetScopedStages(args: Args, setScopes: SetScope[]): Stage[] {
  const pikaqianConfigured = Boolean(args.pikaqianFile || args.pikaqianApiConfigured);
  const hasExplicitSets = Boolean(args.setId || args.setIds.length);
  const availableScopes = hasExplicitSets ? explicitSetScopes(args) : setScopes;
  const start = hasExplicitSets ? 0 : Math.max(0, Math.trunc(args.setOffset));
  const selectedScopes = availableScopes.slice(start, start + (args.maxSets ?? availableScopes.length));
  const tcgdexScopes = selectedScopes.filter((scope) => scope.provider === 'tcgdex');
  const tcgdexCards = providerSelected(args, 'tcgdex') && !args.assetsOnly ? tcgdexScopes.map((scope) => ({
    id: `tcgdex:${scope.language}:${scope.setId}:cards`,
    phase: 'metadata' as const,
    provider: 'tcgdex' as const,
    language: scope.language,
    command: 'run_set' as const,
    setId: scope.setId,
    allowImageAssets: args.includeImages,
    approvedOnly: args.approvedOnly,
    writes: args.apply,
    reason: args.includeImages
      ? 'Import card identities, variants, finishes, and approved native images in one provider pass.'
      : 'Import card identities with variant and finish before images.',
  })) : [];
  const pikaqianScopes = selectedScopes.filter((scope) => (
    providerSelected(args, 'pikaqian')
    && scope.provider === 'pikaqian'
    && scope.language === 'zh-cn'
    && pikaqianConfigured
  ));
  const pikaqianCards = !args.assetsOnly ? pikaqianScopes.map((scope) => ({
    id: `pikaqian:${scope.language}:${scope.setId}:cards`,
    phase: 'metadata' as const,
    provider: 'pikaqian' as const,
    language: 'zh-cn' as const,
    command: 'run_set' as const,
    file: args.pikaqianFile,
    baseUrl: args.pikaqianBaseUrl,
    setId: scope.setId,
    allowImageAssets: args.includeImages,
    approvedOnly: args.approvedOnly,
    writes: args.apply,
    reason: 'Fill Simplified Chinese card metadata gaps after staging set identity exists.',
  })) : [];
  const imageStages = args.includeImages
    ? [
      ...(args.assetsOnly && providerSelected(args, 'tcgdex') ? tcgdexScopes.map((scope) => ({
      id: `tcgdex:${scope.language}:${scope.setId}:images`,
      phase: 'images' as const,
      provider: 'tcgdex' as const,
      language: scope.language,
      command: 'run_set' as const,
      setId: scope.setId,
      allowImageAssets: true,
      assetsOnly: args.assetsOnly,
      approvedOnly: args.approvedOnly,
      writes: args.apply,
      reason: 'Import native-language card images only after card metadata is present.',
      })) : []),
      ...(args.assetsOnly ? pikaqianScopes.map((scope) => ({
        id: `pikaqian:${scope.language}:${scope.setId}:images`,
        phase: 'images' as const,
        provider: 'pikaqian' as const,
        language: 'zh-cn' as const,
        command: 'run_set' as const,
        file: args.pikaqianFile,
        baseUrl: args.pikaqianBaseUrl,
        setId: scope.setId,
        allowImageAssets: true,
        assetsOnly: args.assetsOnly,
        approvedOnly: args.approvedOnly,
        writes: args.apply,
        reason: 'Attach PikaQian Simplified Chinese image URLs only after exact zh-cn card identity exists.',
      })) : []),
    ]
    : [];
  return [...tcgdexCards, ...pikaqianCards, ...imageStages];
}

function explicitSetScopes(args: Args): SetScope[] {
  const setIds = args.setIds.length ? args.setIds : args.setId ? [args.setId] : [];
  if (!setIds.length) return [];
  const scopes: SetScope[] = [];
  for (const setId of setIds) {
    if (providerSelected(args, 'tcgdex')) {
      scopes.push(...args.languages.map((language) => ({ provider: 'tcgdex' as const, language, setId })));
    }
    if (providerSelected(args, 'pikaqian') && args.languages.includes('zh-cn')) {
      scopes.push({ provider: 'pikaqian', language: 'zh-cn', setId });
    }
  }
  return scopes;
}

function deriveProviderSetScopes(
  args: Pick<Args, 'languages' | 'provider'>,
  sets: SetScopeSetRow[],
  sources: SetScopeSourceRow[],
  identifiers: SetScopeIdentifierRow[],
): SetScope[] {
  const sourceProviders = new Map<string, SetScopeProvider>();
  for (const source of sources) {
    if (source.code === 'tcgdex' || source.code === 'pikaqian') sourceProviders.set(source.id, source.code);
  }
  const setLanguages = new Map(sets.map((set) => [
    set.id,
    normaliseLanguageCode(set.language_code) as SupportedCatalogueLanguageCode,
  ]));
  const scopes = identifiers.flatMap((identifier): SetScope[] => {
    if (identifier.source_entity_type !== 'set' || !identifier.is_current || identifier.deprecated_at != null) return [];
    const provider = sourceProviders.get(identifier.source_id);
    const language = identifier.set_id ? setLanguages.get(identifier.set_id) : null;
    const identifierLanguage = identifier.language_code
      ? normaliseLanguageCode(identifier.language_code) as SupportedCatalogueLanguageCode
      : language;
    const setId = cleanText(identifier.external_id);
    if (!provider || !language || identifierLanguage !== language || !setId) return [];
    if (!args.languages.includes(language) || (args.provider && args.provider !== provider)) return [];
    if (provider === 'pikaqian' && language !== 'zh-cn') return [];
    return [{ provider, language, setId }];
  });
  const unique = new Map(scopes.map((scope) => [`${scope.provider}:${scope.language}:${scope.setId}`, scope]));
  return [...unique.values()].sort((a, b) => (
    `${a.provider}:${a.language}:${a.setId}`.localeCompare(`${b.provider}:${b.language}:${b.setId}`)
  ));
}

async function executeStage(db: SupabaseClientLike, stage: Stage, args: Args) {
  if (stage.blocked) {
    return { stage: stage.id, ok: true, skipped: true, reason: stage.reason };
  }
  const source = stage.provider === 'ximilar_residual_scans' ? 'ximilar-residual-scans' : stage.provider;
  const adapter = createSourceAdapter({
    source,
    file: stage.file ?? undefined,
    language: stage.language,
    baseUrl: stage.baseUrl ?? undefined,
    snapshotRoot: stage.provider === 'tcgdex' ? args.tcgdexSnapshotRoot ?? undefined : undefined,
    snapshotVersion: stage.provider === 'tcgdex' ? args.tcgdexSnapshotVersion ?? undefined : undefined,
    licenceStatus: args.licenceStatus,
    assetLicenceStatus: args.assetLicenceStatus,
  });
  const runner = new CatalogueIngestionRunner(db, adapter);
  const result = await runner.run({
    command: stage.command,
    importType: stage.provider === 'tcgdex' ? 'delta' : 'manual',
    language: stage.language,
    setId: stage.setId ?? undefined,
    dryRun: !args.apply,
    allowImageAssets: stage.allowImageAssets,
    setsOnly: stage.setsOnly,
    assetsOnly: stage.assetsOnly,
    approvedOnlyAssets: stage.approvedOnly,
    writeConcurrency: args.writeConcurrency,
    requestId: `master-catalogue:${stage.id}`,
  });
  return { stage: stage.id, ok: result.ok, result };
}

async function fetchStagingSetScopes(db: SupabaseClientLike, args: Args): Promise<SetScope[]> {
  if (args.setId || args.setIds.length) return explicitSetScopes(args);
  const [sets, sources, identifiers] = await Promise.all([
    fetchAll(db, 'catalog', 'sets', 'id,language_code'),
    fetchAll(db, 'ingest', 'sources', 'id,code'),
    fetchAll(
      db,
      'ingest',
      'external_identifiers',
      'source_id,source_entity_type,external_id,language_code,set_id,is_current,deprecated_at',
    ),
  ]);
  return deriveProviderSetScopes(args, sets, sources, identifiers);
}

function providerUnavailable(result: Record<string, any>) {
  const status = cleanText(result?.result?.health?.status);
  return result.ok === false && Boolean(status) && status !== 'ok';
}

async function applyMaster(args: Args) {
  assertStagingTarget(args);
  if (args.assetKind === 'set-art') return applySetArt(args);
  const db = args.apply ? createStagingSupabase(args) : null;
  const plan = buildMasterPlan(args, args.setId ? [args.setId] : []);
  if (!args.apply) {
    return {
      ok: true,
      dryRun: true,
      writes: false,
      message: 'Dry-run only. Re-run with --apply to write to staging.',
      plan,
    };
  }
  const results = [];
  const executed = new Set<string>();
  const unavailableProviders = new Set<ProviderCode>();
  for (const stage of plan) {
    const result = await executeStage(db!, stage, args);
    results.push(result);
    if (providerUnavailable(result)) unavailableProviders.add(stage.provider);
    executed.add(stage.id);
  }
  const setScopes = await fetchStagingSetScopes(db!, args);
  const setScopedStages = buildSetScopedStages(args, setScopes);
  for (const stage of setScopedStages) {
    if (executed.has(stage.id)) continue;
    if (unavailableProviders.has(stage.provider)) {
      results.push({
        stage: stage.id,
        ok: false,
        skipped: true,
        reason: 'Provider was unavailable during its initial source stage.',
      });
      continue;
    }
    results.push(await executeStage(db!, stage, args));
    executed.add(stage.id);
  }
  return {
    ok: results.every((result) => result.ok),
    dryRun: false,
    writes: true,
    plan: [...plan, ...setScopedStages.filter((stage) => !plan.some((planned) => planned.id === stage.id))],
    results,
  };
}

function csvEscape(value: unknown) {
  const text = value == null ? '' : String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function writeCsv(path: string, rows: Record<string, unknown>[], headers: string[]) {
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')),
  ];
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf8');
}

async function fetchAllFiltered(
  db: SupabaseClientLike,
  schema: string,
  tableName: string,
  columns: string,
  configure: (query: any) => any = (query) => query,
  pageSize = 1000,
) {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
    throw new Error(`Invalid page size for ${schema}.${tableName}: ${pageSize}`);
  }
  const rows: any[] = [];
  const selectedColumns = columns.split(',').map((column) => column.trim()).includes('id')
    ? columns
    : `${columns},id`;
  let afterId: string | null = null;
  for (;;) {
    let query = configure(db.schema(schema)
      .from(tableName)
      .select(selectedColumns))
      .order('id', { ascending: true })
      .limit(pageSize);
    if (afterId) query = query.gt('id', afterId);
    const { data, error } = await query;
    if (error) {
      const message = typeof error.message === 'string' ? error.message : String(error);
      throw {
        ...error,
        message: `${schema}.${tableName}: ${message}`,
      };
    }
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
    const nextAfterId = data.at(-1)?.id;
    if (!nextAfterId || nextAfterId === afterId) {
      throw new Error(`Keyset pagination stalled for ${schema}.${tableName}.`);
    }
    afterId = nextAfterId;
  }
  return rows;
}

async function fetchAll(db: SupabaseClientLike, schema: string, tableName: string, columns: string) {
  return fetchAllFiltered(db, schema, tableName, columns);
}

function payloadChecksum(payload: unknown) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function setArtExternalId(file: SetArtFile) {
  return `stackr_set_art:${file.language}:${file.setCode}:${file.localKind}`;
}

function setArtAssetId(file: SetArtFile) {
  return `stackr-set-art:${file.language}:${file.setCode}:${file.localKind}`;
}

async function upsertSetArtRawRecord(
  db: SupabaseClientLike,
  input: {
    sourceId: string;
    importRunId: string;
    file: SetArtFile;
  },
) {
  const payload = {
    provider: 'stackr_set_art',
    language_code: input.file.language,
    set_code: input.file.setCode,
    asset_type: input.file.assetType,
    local_kind: input.file.localKind,
    storage_path: input.file.relativePath,
    content_sha256: input.file.sha256,
    byte_size: input.file.byteSize,
    rights_status: 'approved',
  };
  const externalId = setArtExternalId(input.file);
  const base = {
    source_id: input.sourceId,
    import_run_id: input.importRunId,
    record_type: 'asset',
    external_id: externalId,
    provider_record_id: externalId,
    language_code: input.file.language,
    source_url: null,
    source_endpoint: input.file.relativePath,
    licence_status: 'approved',
    attribution_text: 'Stackr approved set art',
    payload_hash: payloadChecksum(payload),
    raw_payload: payload,
    http_metadata: {
      file_structure: 'catalogue/<language>/<set_code>/(logo|symbol).webp',
      relative_path: input.file.relativePath,
    },
    validation_status: 'valid',
    validation_errors: [],
  };

  const { data: existing, error: lookupError } = await db.schema('ingest')
    .from('raw_source_records')
    .select('id')
    .eq('source_id', input.sourceId)
    .eq('record_type', 'asset')
    .eq('external_id', externalId)
    .eq('language_code', input.file.language)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (existing?.id) {
    const { data, error } = await db.schema('ingest')
      .from('raw_source_records')
      .update(base)
      .eq('id', existing.id)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    return data.id as string;
  }

  const { data, error } = await db.schema('ingest')
    .from('raw_source_records')
    .insert(base)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return data.id as string;
}

async function recordSetArtConflict(
  db: SupabaseClientLike,
  input: {
    sourceId: string;
    importRunId: string;
    rawRecordId: string;
    file: SetArtFile;
    reason: string;
    matches: SetRow[];
  },
) {
  const { error } = await db.schema('ingest')
    .from('data_conflicts')
    .insert({
      source_id: input.sourceId,
      import_run_id: input.importRunId,
      raw_record_id: input.rawRecordId,
      conflict_type: input.matches.length > 1 ? 'set_code_conflict' : 'schema_conflict',
      severity: 'high',
      entity_schema: 'catalog',
      entity_table: 'sets',
      canonical_key: `${input.file.language}:${input.file.setCode}:${input.file.localKind}`,
      proposed_payload: {
        language_code: input.file.language,
        set_code: input.file.setCode,
        asset_type: input.file.assetType,
        storage_path: input.file.relativePath,
      },
      existing_payload: {
        matches: input.matches.map((set) => ({
          id: set.id,
          language_code: set.language_code,
          set_code: set.set_code,
          provider_set_code: set.provider_set_code,
          native_name: set.native_name,
        })),
      },
      status: 'open',
      internal_notes: input.reason,
    });
  if (error) throw error;
}

async function upsertSetArtExternalIdentifier(
  db: SupabaseClientLike,
  input: {
    sourceId: string;
    rawRecordId: string;
    file: SetArtFile;
    setId: string;
    assetId: string;
  },
) {
  const externalId = setArtExternalId(input.file);
  const base = {
    raw_record_id: input.rawRecordId,
    external_uri: input.file.relativePath,
    game_code: 'pokemon',
    language_code: input.file.language,
    asset_id: input.assetId,
    confidence: 1,
    is_current: true,
    deprecated_at: null,
    deprecated_reason: null,
  };
  const { data: existing, error: lookupError } = await db.schema('ingest')
    .from('external_identifiers')
    .select('id')
    .eq('source_id', input.sourceId)
    .eq('source_entity_type', 'asset')
    .eq('external_id', externalId)
    .eq('language_code', input.file.language)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (existing?.id) {
    const { error } = await db.schema('ingest')
      .from('external_identifiers')
      .update(base)
      .eq('id', existing.id);
    if (error) throw error;
    return;
  }

  const { error } = await db.schema('ingest')
    .from('external_identifiers')
    .insert({
      source_id: input.sourceId,
      source_entity_type: 'asset',
      external_id: externalId,
      ...base,
    });
  if (error) throw error;
}

async function upsertSetArtAsset(
  db: SupabaseClientLike,
  input: {
    sourceId: string;
    rawRecordId: string;
    file: SetArtFile;
    set: SetRow;
  },
) {
  const assetId = setArtAssetId(input.file);
  const { data: healthy, error: healthyError } = await db.schema('catalog')
    .from('assets')
    .select('id,asset_id,storage_path,content_sha256')
    .eq('set_id', input.set.id)
    .eq('asset_type', input.file.assetType)
    .eq('rights_status', 'approved')
    .eq('permission_status', 'approved')
    .eq('publicly_servable', true)
    .is('deprecated_at', null)
    .limit(1);
  if (healthyError) throw healthyError;
  if ((healthy ?? []).length > 0) {
    return {
      status: 'skipped_healthy_existing' as const,
      assetId: healthy[0].id as string,
    };
  }

  const base = {
    asset_id: assetId,
    asset_type: input.file.assetType,
    game_code: 'pokemon',
    set_id: input.set.id,
    source_id: input.sourceId,
    url: null,
    storage_provider: 'local_dev',
    storage_path: input.file.relativePath,
    storage_key: input.file.relativePath,
    mime_type: 'image/webp',
    sha256: input.file.sha256,
    content_sha256: input.file.sha256,
    byte_size: input.file.byteSize,
    rights_status: 'approved',
    permission_status: 'approved',
    publicly_servable: true,
    asset_visibility: 'public_catalogue',
    attribution_text: 'Stackr approved set art',
    source_attribution: 'Stackr approved set art',
    original_source_url: null,
    original_source_identifier: setArtExternalId(input.file),
    externally_referenced: false,
    acquisition_source: 'existing_stackr_catalogue_asset',
  };

  const { data: existing, error: lookupError } = await db.schema('catalog')
    .from('assets')
    .select('id')
    .eq('asset_id', assetId)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (existing?.id) {
    const { data, error } = await db.schema('catalog')
      .from('assets')
      .update(base)
      .eq('id', existing.id)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    await upsertSetArtExternalIdentifier(db, {
      sourceId: input.sourceId,
      rawRecordId: input.rawRecordId,
      file: input.file,
      setId: input.set.id,
      assetId: data.id,
    });
    return { status: 'updated' as const, assetId: data.id as string };
  }

  const { data, error } = await db.schema('catalog')
    .from('assets')
    .insert(base)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  await upsertSetArtExternalIdentifier(db, {
    sourceId: input.sourceId,
    rawRecordId: input.rawRecordId,
    file: input.file,
    setId: input.set.id,
    assetId: data.id,
  });
  return { status: 'inserted' as const, assetId: data.id as string };
}

async function applySetArt(args: Args) {
  assertStagingTarget(args);
  const plan = buildSetArtPlan(args);
  const files = discoverSetArtFiles(args.setArtRoot, args.languages);
  if (!args.apply) {
    return {
      ok: true,
      dryRun: true,
      writes: false,
      message: 'Dry-run only. Re-run with --apply --approved-only to import approved set logos and symbols to staging.',
      plan,
      discoveredFiles: files.length,
    };
  }
  if (!args.approvedOnly) {
    throw new Error('Set-art imports require --approved-only so only reviewed logo/symbol files are staged.');
  }

  const db = createStagingSupabase(args);
  const source = await ensureSource(db, {
    code: 'stackr_set_art',
    displayName: 'Stackr approved set art',
    sourceType: 'manual',
    baseUrl: null,
    termsUrl: null,
    licenceStatus: 'approved',
    attributionRequired: false,
    robotsPolicy: 'Approved local set-art files only. Folder identity is language + set_code, never translated set name.',
    capabilities: ['assets', 'manual_import'],
    automatedRefreshAllowed: false,
  });
  const runKey = `set-art:${new Date().toISOString()}`;
  const { data: run, error: runError } = await db.schema('ingest')
    .from('import_runs')
    .insert({
      source_id: source.id,
      run_key: runKey,
      import_type: 'manual',
      status: 'running',
      request_id: 'master-catalogue:set-art',
      records_requested: files.length,
      records_retrieved: files.length,
      metadata: {
        asset_kind: 'set-art',
        root: args.setArtRoot,
        languages: args.languages,
      },
    })
    .select('id')
    .maybeSingle();
  if (runError) throw runError;

  const sets = await fetchAll(db, 'catalog', 'sets', 'id,language_code,set_code,provider_set_code,native_name,english_display_name,release_date,total') as SetRow[];
  const setLookup = new Map<string, SetRow[]>();
  for (const set of sets) {
    for (const key of setLookupKeys(set)) {
      const list = setLookup.get(key) ?? [];
      list.push(set);
      setLookup.set(key, list);
    }
  }

  const results = [];
  const stats = {
    inserted: 0,
    updated: 0,
    skipped: 0,
    conflicted: 0,
  };
  for (const file of files) {
    const rawRecordId = await upsertSetArtRawRecord(db, {
      sourceId: source.id,
      importRunId: run.id,
      file,
    });
    const matches = setLookup.get(`${file.language}:${file.setCode.toLowerCase()}`) ?? [];
    if (matches.length !== 1) {
      stats.conflicted += 1;
      const reason = matches.length === 0
        ? 'set_art_file_has_no_exact_language_set_code_match'
        : 'set_art_file_matches_multiple_sets_refusing_to_guess';
      await recordSetArtConflict(db, {
        sourceId: source.id,
        importRunId: run.id,
        rawRecordId,
        file,
        reason,
        matches,
      });
      results.push({ file: file.relativePath, status: 'conflicted', reason });
      continue;
    }

    const outcome = await upsertSetArtAsset(db, {
      sourceId: source.id,
      rawRecordId,
      file,
      set: matches[0],
    });
    if (outcome.status === 'inserted') stats.inserted += 1;
    if (outcome.status === 'updated') stats.updated += 1;
    if (outcome.status === 'skipped_healthy_existing') stats.skipped += 1;
    results.push({ file: file.relativePath, status: outcome.status, assetId: outcome.assetId });
  }

  const { error: completeError } = await db.schema('ingest')
    .from('import_runs')
    .update({
      status: 'completed',
      finished_at: new Date().toISOString(),
      records_inserted: stats.inserted,
      records_updated: stats.updated,
      records_skipped: stats.skipped,
      records_conflicted: stats.conflicted,
      metadata: {
        asset_kind: 'set-art',
        root: args.setArtRoot,
        languages: args.languages,
        production_modified: false,
      },
    })
    .eq('id', run.id);
  if (completeError) throw completeError;

  return {
    ok: stats.conflicted === 0,
    dryRun: false,
    writes: true,
    productionModified: false,
    plan,
    stats,
    results,
  };
}

function setRef(row: Record<string, unknown>) {
  return cleanText(valueAt(row, 'provider_set_id', 'providerSetId', 'set_code', 'setCode', 'set_id', 'setId'));
}

function expectedFromRaw(row: RawRecordRow, sourceCode?: string | null): ExpectedCardRecord | null {
  const payload = row.raw_payload ?? {};
  const language = normaliseLanguageCode(row.language_code ?? valueAt(payload, 'language_code', 'languageCode', 'language'));
  const rawSetRef = setRef(payload);
  const collectorNumber = cleanText(valueAt(payload, 'collector_number', 'collectorNumber', 'localId', 'number'));
  if (!rawSetRef || !collectorNumber) return null;
  const variant = normaliseVariantCode(valueAt(payload, 'variant_code', 'variantCode', 'variant', 'finish') ?? 'normal');
  const finish = normaliseFinishCode(valueAt(payload, 'finish_code', 'finishCode', 'finish', 'variant') ?? variant) ?? 'normal';
  const canonicalKey = proposedCanonicalKey({
    languageCode: language,
    setCode: rawSetRef,
    collectorNumber,
    variantCode: variant,
    finishCode: finish,
  });
  return {
    language,
    setRef: rawSetRef,
    setCode: rawSetRef,
    collectorNumber,
    variant,
    finish,
    provider: cleanText(sourceCode) ?? cleanText(valueAt(payload, 'provider')) ?? 'unknown',
    providerId: row.external_id,
    sourceUrl: row.source_url,
    rightsStatus: row.licence_status,
    canonicalKey,
  };
}

function rawPayloadProvider(row: RawRecordRow, sourceCode?: string | null) {
  return cleanText(sourceCode)
    ?? cleanText(valueAt(row.raw_payload ?? {}, 'provider', 'source', 'source_code', 'sourceCode'))
    ?? 'unknown';
}

function providerGroup(provider: string): ImageCandidate['providerGroup'] | null {
  const compact = provider.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  if (compact === 'tcgdex') return 'tcgdex';
  if (compact === 'pikaqian') return 'pikaqian';
  if (compact === 'stackr_catalogue' || compact === 'stackr_existing_assets' || compact === 'existing_stackr_catalogue_assets') {
    return 'existing_stackr_catalogue_assets';
  }
  if (compact.includes('commercial') || compact.includes('licensed_provider') || compact.includes('partner_provider')) {
    return 'approved_commercial_provider';
  }
  return null;
}

function imageUrlFromPayload(payload: Record<string, unknown>) {
  return cleanText(valueAt(
    payload,
    'image_url',
    'imageUrl',
    'asset_url',
    'assetUrl',
    'url',
    'card_image_url',
    'cardImageUrl',
  ));
}

function identityFromParts(input: {
  language: unknown;
  setCode: unknown;
  collectorNumber: unknown;
  variant: unknown;
  finish: unknown;
}) {
  const language = normaliseLanguageCode(input.language);
  const setCode = cleanText(input.setCode);
  const collectorNumber = cleanText(input.collectorNumber);
  if (!setCode || !collectorNumber) return null;
  const variant = normaliseVariantCode(input.variant ?? 'normal');
  const finish = normaliseFinishCode(input.finish ?? variant) ?? 'normal';
  return {
    language,
    setCode,
    collectorNumber,
    variant,
    finish,
    canonicalKey: proposedCanonicalKey({
      languageCode: language,
      setCode,
      collectorNumber,
      variantCode: variant,
      finishCode: finish,
    }),
  };
}

function identityForVariant(variant: VariantRow, set?: SetRow): MissingVariantImage | null {
  const identity = identityFromParts({
    language: variant.language_code,
    setCode: set?.set_code ?? set?.provider_set_code ?? variant.set_id,
    collectorNumber: variant.collector_number,
    variant: variant.variant_code,
    finish: variant.finish_code ?? 'normal',
  });
  if (!identity) return null;
  return {
    variant,
    set,
    canonicalKey: identity.canonicalKey,
    language: identity.language,
    setCode: identity.setCode,
    collectorNumber: identity.collectorNumber,
    variantCode: identity.variant,
    finish: identity.finish,
  };
}

function imageCandidateFromRaw(row: RawRecordRow): ImageCandidate | null {
  const provider = rawPayloadProvider(row);
  const group = providerGroup(provider);
  if (!group || row.licence_status !== 'approved') return null;
  const payload = row.raw_payload ?? {};
  const sourceUrl = imageUrlFromPayload(payload) ?? row.source_url;
  if (!sourceUrl) return null;
  const rawVariant = valueAt(payload, 'variant_code', 'variantCode', 'variant');
  const rawFinish = valueAt(payload, 'finish_code', 'finishCode', 'finish');
  if (!cleanText(rawVariant) || !cleanText(rawFinish)) return null;
  const identity = identityFromParts({
    language: row.language_code ?? valueAt(payload, 'language_code', 'languageCode', 'language'),
    setCode: setRef(payload),
    collectorNumber: valueAt(payload, 'collector_number', 'collectorNumber', 'localId', 'number'),
    variant: rawVariant,
    finish: rawFinish,
  });
  if (!identity) return null;
  return {
    provider,
    providerGroup: group,
    providerId: row.external_id,
    sourceUrl,
    rightsStatus: row.licence_status,
    permissionStatus: 'approved',
    language: identity.language,
    setCode: identity.setCode,
    collectorNumber: identity.collectorNumber,
    variant: identity.variant,
    finish: identity.finish,
    canonicalKey: identity.canonicalKey,
  };
}

function candidateSummary(candidates: ImageCandidate[]) {
  return candidates.map((candidate) => [
    candidate.provider,
    candidate.providerId,
    candidate.sourceUrl,
  ].filter(Boolean).join('|')).join('; ');
}

function assetRightsAreApproved(asset: AssetRow) {
  return asset.rights_status === 'approved'
    && (asset.permission_status == null || asset.permission_status === 'approved')
    && !asset.deprecated_at;
}

function assetIsApproved(asset: AssetRow) {
  return asset.asset_type === 'card_image' && assetRightsAreApproved(asset);
}

function providerSetRefsByCanonicalSetId(
  sources: SetScopeSourceRow[],
  identifiers: SetScopeIdentifierRow[],
  provider: string,
) {
  const providerSourceIds = new Set(sources
    .filter((source) => source.code === provider)
    .map((source) => source.id));
  const result = new Map<string, Set<string>>();
  for (const identifier of identifiers) {
    if (identifier.source_entity_type !== 'set'
      || !providerSourceIds.has(identifier.source_id)
      || !identifier.is_current
      || identifier.deprecated_at != null
      || !identifier.set_id) continue;
    const externalId = cleanText(identifier.external_id)?.toLowerCase();
    if (!externalId) continue;
    const refs = result.get(identifier.set_id) ?? new Set<string>();
    refs.add(externalId);
    result.set(identifier.set_id, refs);
  }
  return result;
}

function classifyImageLeftovers(input: {
  sets: SetRow[];
  variants: VariantRow[];
  assets: AssetRow[];
  rawRecords: RawRecordRow[];
}): ImageLeftoverClassification {
  const setsById = new Map(input.sets.map((set) => [set.id, set]));
  const variantsById = new Map(input.variants.map((variant) => [variant.id, variant]));
  const approvedNativeImagesByVariant = new Set(input.assets
    .filter((asset) => assetIsApproved(asset) && asset.publicly_servable)
    .map((asset) => asset.variant_id)
    .filter(Boolean) as string[]);

  const candidatesByIdentity = new Map<string, ImageCandidate[]>();
  const addCandidate = (candidate: ImageCandidate | null) => {
    if (!candidate) return;
    const list = candidatesByIdentity.get(candidate.canonicalKey) ?? [];
    list.push(candidate);
    candidatesByIdentity.set(candidate.canonicalKey, list);
  };
  for (const row of input.rawRecords) addCandidate(imageCandidateFromRaw(row));
  for (const asset of input.assets.filter(assetIsApproved)) {
    const variant = asset.variant_id ? variantsById.get(asset.variant_id) : null;
    if (!variant) continue;
    const identity = identityForVariant(variant, setsById.get(variant.set_id));
    if (!identity) continue;
    addCandidate({
      provider: 'existing_stackr_catalogue_assets',
      providerGroup: 'existing_stackr_catalogue_assets',
      providerId: asset.original_source_identifier ?? asset.id,
      sourceUrl: asset.original_source_url ?? asset.url,
      rightsStatus: asset.rights_status,
      permissionStatus: asset.permission_status ?? 'approved',
      language: identity.language,
      setCode: identity.setCode,
      collectorNumber: identity.collectorNumber,
      variant: identity.variantCode,
      finish: identity.finish,
      canonicalKey: identity.canonicalKey,
    });
  }

  const sameArtworkCandidates = new Map<string, Array<{ variant: VariantRow; asset: AssetRow; set?: SetRow }>>();
  for (const asset of input.assets.filter((entry) => assetIsApproved(entry) && entry.publicly_servable)) {
    const variant = asset.variant_id ? variantsById.get(asset.variant_id) : null;
    if (!variant?.artwork_key) continue;
    const list = sameArtworkCandidates.get(variant.artwork_key) ?? [];
    list.push({ variant, asset, set: setsById.get(variant.set_id) });
    sameArtworkCandidates.set(variant.artwork_key, list);
  }

  const leftovers: Record<string, unknown>[] = [];
  const groupA: Record<string, unknown>[] = [];
  const groupB: Record<string, unknown>[] = [];
  const groupC: Record<string, unknown>[] = [];
  const conflicts: Record<string, unknown>[] = [];

  for (const variant of input.variants) {
    if (approvedNativeImagesByVariant.has(variant.id)) continue;
    const identity = identityForVariant(variant, setsById.get(variant.set_id));
    if (!identity) continue;
    const exactCandidates = (candidatesByIdentity.get(identity.canonicalKey) ?? [])
      .filter((candidate) => candidate.language === identity.language
        && candidate.setCode.toLowerCase() === identity.setCode.toLowerCase()
        && candidate.collectorNumber === identity.collectorNumber
        && candidate.variant === identity.variantCode
        && candidate.finish === identity.finish);
    const sameArtwork = (variant.artwork_key ? sameArtworkCandidates.get(variant.artwork_key) ?? [] : [])
      .filter((candidate) => candidate.variant.id !== variant.id && candidate.variant.language_code !== variant.language_code);

    const base = {
      language: identity.language,
      set_id: variant.set_id,
      set_code: identity.setCode,
      set_name: identity.set?.native_name ?? '',
      collector_number: identity.collectorNumber,
      variant: identity.variantCode,
      finish: identity.finish,
      variant_id: variant.id,
      canonical_key: identity.canonicalKey,
      native_image_status: 'missing',
    };

    if (exactCandidates.length === 1) {
      const first = exactCandidates[0];
      const row = {
        ...base,
        group: 'A',
        status: 'exact_approved_candidate_found',
        candidate_count: exactCandidates.length,
        candidate_provider: first.provider,
        candidate_provider_group: first.providerGroup,
        candidate_provider_id: first.providerId,
        candidate_source_url: first.sourceUrl,
        same_artwork_as_variant_id: '',
        scan_queue_required: false,
        conflict_required: false,
      };
      leftovers.push(row);
      groupA.push(row);
      continue;
    }

    if (exactCandidates.length > 1) {
      const row = {
        ...base,
        group: 'A',
        status: 'exact_approved_candidate_conflict',
        candidate_count: exactCandidates.length,
        candidate_provider: 'multiple',
        candidate_provider_group: 'multiple',
        candidate_provider_id: exactCandidates.map((candidate) => candidate.providerId).join(';'),
        candidate_source_url: exactCandidates.map((candidate) => candidate.sourceUrl).filter(Boolean).join(';'),
        same_artwork_as_variant_id: '',
        scan_queue_required: false,
        conflict_required: true,
        conflict_type: 'image_candidate_conflict',
      };
      leftovers.push(row);
      groupA.push(row);
      conflicts.push({
        conflict_id: `generated:image_candidate_conflict:${identity.canonicalKey}`,
        language: identity.language,
        set_ref: identity.setCode,
        collector_number: identity.collectorNumber,
        variant: identity.variantCode,
        finish: identity.finish,
        conflict_type: 'image_candidate_conflict',
        severity: 'high',
        status: 'open',
        provider: 'multiple',
        provider_id: exactCandidates.map((candidate) => candidate.providerId).join(';'),
        reason: 'Multiple exact approved image candidates share the same language/set/collector/variant/finish. Record conflict instead of guessing.',
        candidate_count: exactCandidates.length,
        candidate_summary: candidateSummary(exactCandidates),
      });
      continue;
    }

    if (sameArtwork.length === 1) {
      const first = sameArtwork[0];
      const row = {
        ...base,
        group: 'B',
        status: 'other_language_artwork_only',
        candidate_count: sameArtwork.length,
        candidate_provider: 'existing_stackr_catalogue_assets',
        candidate_provider_group: 'existing_stackr_catalogue_assets',
        candidate_provider_id: first.asset.original_source_identifier ?? first.asset.id,
        candidate_source_url: first.asset.original_source_url ?? first.asset.url,
        same_artwork_as_variant_id: first.variant.id,
        same_artwork_as_language: first.variant.language_code,
        same_artwork_as_set_code: first.set?.set_code ?? first.set?.provider_set_code ?? '',
        scan_queue_required: false,
        conflict_required: false,
      };
      leftovers.push(row);
      groupB.push(row);
      continue;
    }

    if (sameArtwork.length > 1) {
      const row = {
        ...base,
        group: 'B',
        status: 'same_artwork_reference_conflict',
        candidate_count: sameArtwork.length,
        candidate_provider: 'existing_stackr_catalogue_assets',
        candidate_provider_group: 'existing_stackr_catalogue_assets',
        candidate_provider_id: sameArtwork.map((candidate) => candidate.asset.original_source_identifier ?? candidate.asset.id).join(';'),
        candidate_source_url: sameArtwork.map((candidate) => candidate.asset.original_source_url ?? candidate.asset.url).filter(Boolean).join(';'),
        same_artwork_as_variant_id: '',
        same_artwork_as_language: 'multiple',
        same_artwork_as_set_code: '',
        scan_queue_required: false,
        conflict_required: true,
        conflict_type: 'same_artwork_reference_conflict',
      };
      leftovers.push(row);
      groupB.push(row);
      conflicts.push({
        conflict_id: `generated:same_artwork_reference_conflict:${identity.canonicalKey}`,
        language: identity.language,
        set_ref: identity.setCode,
        collector_number: identity.collectorNumber,
        variant: identity.variantCode,
        finish: identity.finish,
        conflict_type: 'same_artwork_reference_conflict',
        severity: 'medium',
        status: 'open',
        provider: 'existing_stackr_catalogue_assets',
        provider_id: sameArtwork.map((candidate) => candidate.asset.original_source_identifier ?? candidate.asset.id).join(';'),
        reason: 'Multiple other-language same-artwork assets exist. Leave native_image_status missing and resolve the reference manually.',
        candidate_count: sameArtwork.length,
        candidate_summary: sameArtwork.map((candidate) => [
          candidate.variant.language_code,
          candidate.variant.id,
          candidate.asset.original_source_identifier ?? candidate.asset.id,
          candidate.asset.original_source_url ?? candidate.asset.url,
        ].filter(Boolean).join('|')).join('; '),
      });
      continue;
    }

    const row = {
      ...base,
      group: 'C',
      status: 'scan_acquisition_required',
      candidate_count: 0,
      candidate_provider: '',
      candidate_provider_group: '',
      candidate_provider_id: '',
      candidate_source_url: '',
      same_artwork_as_variant_id: '',
      scan_queue_required: true,
      conflict_required: false,
      required_sources: 'own_scan;partner_shop_scan;collector_submitted_scan_with_written_permission',
      process: 'upload_front > ximilar_identify > stackr_identity_check > contributor_permission > crop_correct > human_review > store_own_scan_or_user_licensed',
    };
    leftovers.push(row);
    groupC.push(row);
  }

  return { leftovers, groupA, groupB, groupC, conflicts };
}

function coveragePercent(row: {
  expected_cards: number;
  stored_card_records: number;
  exact_native_images: number;
  image_completion_percentage: number;
  set_art_completion_percentage: number;
  unresolved_identity_conflicts: number;
  unvalidated_images: number;
}) {
  const expected = Math.max(1, row.expected_cards);
  const metadataScore = Math.min(row.stored_card_records, expected) / expected;
  const imageScore = row.image_completion_percentage / 100;
  const setArtScore = row.set_art_completion_percentage / 100;
  const conflictPenalty = (row.unresolved_identity_conflicts > 0 || row.unvalidated_images > 0) ? 0.9 : 1;
  return Number((((metadataScore * 0.55) + (imageScore * 0.35) + (setArtScore * 0.10)) * conflictPenalty * 100).toFixed(2));
}

function percentComplete(complete: number, expected: number) {
  if (expected <= 0) return 100;
  return Number(((Math.min(Math.max(complete, 0), expected) / expected) * 100).toFixed(2));
}

function deriveSetCompletionStatus(gates: SetCompletionGates): SetCompletionStatus {
  if (gates.missingCardRecords > 0 || gates.missingRequiredVariants > 0) return 'Metadata incomplete';
  if (gates.missingExactNativeImages > 0) return 'Images incomplete';
  if (gates.missingLogo > 0 || gates.missingSymbol > 0) return 'Set art incomplete';
  if (gates.unresolvedIdentityConflicts > 0 || gates.unvalidatedImages > 0) return 'Under review';
  return 'Complete';
}

const IDENTITY_CONFLICT_TYPES = new Set([
  'duplicate_external_id',
  'identity_collision',
  'set_code_conflict',
  'variant_conflict',
]);

const LANGUAGE_PUBLISH_ORDER: SupportedCatalogueLanguageCode[] = ['en', 'ja', 'zh-tw', 'zh-cn', 'ko'];

function publicationVersionKey(language: SupportedCatalogueLanguageCode, version: string) {
  const cleaned = cleanText(version);
  if (!cleaned) throw new Error('catalogue:publish requires --version, for example --version=2026-08-01.');
  if (!/^[0-9A-Za-z._:-]+$/.test(cleaned)) {
    throw new Error('Catalogue publish version may contain only letters, numbers, dots, dashes, underscores, and colons.');
  }
  return `${language}:${cleaned}`;
}

function previousPublishLanguages(language: SupportedCatalogueLanguageCode) {
  const index = LANGUAGE_PUBLISH_ORDER.indexOf(language);
  if (index < 0) throw new Error(`Unsupported publish language: ${language}`);
  return LANGUAGE_PUBLISH_ORDER.slice(0, index);
}

async function buildReports(db: SupabaseClientLike, args: Args) {
  const files = reportFiles(args.reportDir);
  mkdirSync(args.reportDir, { recursive: true });
  const sources = await fetchAll(
    db,
    'ingest',
    'sources',
    'id,code',
  ) as SetScopeSourceRow[];
  const selectedSourceIds = sources
    .filter((source) => !args.provider || source.code === args.provider)
    .map((source) => source.id);
  const configureLanguageQuery = (query: any) => query.in('language_code', args.languages);
  const configureProviderLanguageQuery = (query: any) => {
    const languageQuery = configureLanguageQuery(query);
    return args.provider ? languageQuery.in('source_id', selectedSourceIds) : languageQuery;
  };
  const configureActiveProviderLanguageQuery = (query: any) => (
    configureProviderLanguageQuery(query).is('deprecated_at', null)
  );
  const [sets, printings, variants, assets, rawRecords, conflicts, externalIdentifiers] = await Promise.all([
    fetchAllFiltered(db, 'catalog', 'sets', 'id,language_code,set_code,provider_set_code,native_name,english_display_name,release_date,total,deprecated_at', configureLanguageQuery) as Promise<SetRow[]>,
    fetchAllFiltered(db, 'catalog', 'card_printings', 'id,set_id,language_code,collector_number,deprecated_at', configureLanguageQuery) as Promise<PrintingRow[]>,
    fetchAllFiltered(db, 'catalog', 'card_variants', 'id,printing_id,set_id,language_code,collector_number,variant_code,finish_code,canonical_key,artwork_key,deprecated_at', configureLanguageQuery) as Promise<VariantRow[]>,
    fetchAll(db, 'catalog', 'assets', 'id,set_id,printing_id,variant_id,asset_type,url,rights_status,permission_status,publicly_servable,original_source_url,original_source_identifier,source_attribution,storage_provider,storage_path,storage_key,content_sha256,perceptual_hash,deprecated_at') as Promise<AssetRow[]>,
    fetchAllFiltered(
      db,
      'ingest',
      'raw_source_records',
      'id,source_id,record_type,external_id,language_code,source_url,licence_status,validation_status,raw_payload,deprecated_at',
      configureActiveProviderLanguageQuery,
      250,
    ) as Promise<RawRecordRow[]>,
    fetchAll(db, 'ingest', 'data_conflicts', 'id,conflict_type,severity,status,entity_schema,entity_table,entity_id,canonical_key,proposed_payload,existing_payload,internal_notes') as Promise<ConflictRow[]>,
    fetchAllFiltered(
      db,
      'ingest',
      'external_identifiers',
      'source_id,source_entity_type,external_id,language_code,set_id,is_current,deprecated_at',
      configureProviderLanguageQuery,
    ) as Promise<SetScopeIdentifierRow[]>,
  ]);
  const activeSets = sets.filter((set) => set.deprecated_at == null);
  const activePrintings = printings.filter((printing) => printing.deprecated_at == null);
  const activeVariants = variants.filter((variant) => variant.deprecated_at == null);
  const activeRawRecords = rawRecords.filter((row) => row.deprecated_at == null);
  const selectedLanguages = new Set(args.languages);
  const sourceCodeById = new Map(sources.map((source) => [source.id, source.code]));
  const selectedSourceIdSet = new Set(selectedSourceIds);
  const selectedProviderSetIds = new Set(externalIdentifiers
    .filter((identifier) => identifier.source_entity_type === 'set'
      && selectedSourceIdSet.has(identifier.source_id)
      && identifier.is_current
      && identifier.deprecated_at == null
      && identifier.set_id)
    .map((identifier) => identifier.set_id as string));
  const selectedProviderSetRefsBySetId = args.provider
    ? providerSetRefsByCanonicalSetId(sources, externalIdentifiers, args.provider)
    : new Map<string, Set<string>>();
  const pikaqianSourceIds = new Set(sources.filter((source) => source.code === 'pikaqian').map((source) => source.id));
  const pikaqianSetIds = new Set(externalIdentifiers
    .filter((identifier) => identifier.source_entity_type === 'set'
      && pikaqianSourceIds.has(identifier.source_id)
      && identifier.is_current
      && identifier.deprecated_at == null
      && identifier.set_id)
    .map((identifier) => identifier.set_id as string));
  const reportSets = activeSets.filter((set) => selectedLanguages.has(normaliseLanguageCode(set.language_code) as SupportedCatalogueLanguageCode)
    && (!args.provider || selectedProviderSetIds.has(set.id)));

  const printingsBySet = new Map<string, PrintingRow[]>();
  for (const printing of activePrintings) {
    const list = printingsBySet.get(printing.set_id) ?? [];
    list.push(printing);
    printingsBySet.set(printing.set_id, list);
  }
  const variantsBySet = new Map<string, VariantRow[]>();
  for (const variant of activeVariants) {
    const list = variantsBySet.get(variant.set_id) ?? [];
    list.push(variant);
    variantsBySet.set(variant.set_id, list);
  }
  const printingsById = new Map(activePrintings.map((printing) => [printing.id, printing]));
  const variantsById = new Map(activeVariants.map((variant) => [variant.id, variant]));
  const approvedImagesByVariant = new Set(assets
    .filter((asset) => assetIsApproved(asset) && asset.publicly_servable)
    .map((asset) => asset.variant_id)
    .filter(Boolean) as string[]);
  const unvalidatedImagesBySetId = new Map<string, number>();
  for (const asset of assets) {
    if (!['card_image', 'set_logo', 'set_symbol'].includes(asset.asset_type) || asset.deprecated_at) continue;
    const assetSetId = asset.set_id
      ?? (asset.variant_id ? variantsById.get(asset.variant_id)?.set_id : null)
      ?? (asset.printing_id ? printingsById.get(asset.printing_id)?.set_id : null);
    if (!assetSetId) continue;
    const permissionStatus = asset.permission_status ?? 'unknown';
    if (asset.rights_status !== 'approved' || permissionStatus !== 'approved') {
      unvalidatedImagesBySetId.set(assetSetId, (unvalidatedImagesBySetId.get(assetSetId) ?? 0) + 1);
    }
  }
  const unvalidatedRawImageRecordIdsBySetRef = new Map<string, Set<string>>();
  for (const row of activeRawRecords) {
    if (row.record_type !== 'asset' || (row.validation_status ?? 'valid') === 'valid') continue;
    const payload = row.raw_payload ?? {};
    const refs = [
      setRef(payload),
      cleanText(valueAt(payload, 'provider_set_code', 'providerSetCode', 'set_id', 'setId')),
      row.external_id?.split(':')[1],
    ].map(cleanText).filter(Boolean) as string[];
    for (const ref of refs) {
      const ids = unvalidatedRawImageRecordIdsBySetRef.get(ref) ?? new Set<string>();
      ids.add(row.id);
      unvalidatedRawImageRecordIdsBySetRef.set(ref, ids);
    }
  }
  const setLogoIds = new Set(assets
    .filter((asset) => asset.asset_type === 'set_logo' && asset.publicly_servable && asset.rights_status === 'approved' && !asset.deprecated_at)
    .map((asset) => asset.set_id)
    .filter(Boolean) as string[]);
  const setSymbolIds = new Set(assets
    .filter((asset) => asset.asset_type === 'set_symbol' && asset.publicly_servable && asset.rights_status === 'approved' && !asset.deprecated_at)
    .map((asset) => asset.set_id)
    .filter(Boolean) as string[]);
  const setCoverIds = new Set(assets
    .filter((asset) => asset.asset_type === 'sealed_product_image' && asset.publicly_servable && assetRightsAreApproved(asset))
    .map((asset) => asset.set_id)
    .filter(Boolean) as string[]);
  const openConflicts = conflicts.filter((conflict) => ['open', 'in_review'].includes(conflict.status));
  const conflictsBySetRef = new Map<string, ConflictRow[]>();
  for (const conflict of openConflicts) {
    const refs = [
      conflict.entity_id,
      conflict.proposed_payload?.set_id,
      conflict.proposed_payload?.setId,
      conflict.proposed_payload?.set_code,
      conflict.proposed_payload?.setCode,
      conflict.canonical_key?.split(':')[1],
    ].map(cleanText).filter(Boolean) as string[];
    for (const ref of refs) {
      const list = conflictsBySetRef.get(ref) ?? [];
      list.push(conflict);
      conflictsBySetRef.set(ref, list);
    }
  }

  const expectedCards = activeRawRecords
    .filter((row) => ['card', 'printing', 'variant'].includes(row.record_type))
    .map((row) => expectedFromRaw(row, sourceCodeById.get(row.source_id)))
    .filter(Boolean) as ExpectedCardRecord[];
  const expectedReportCards = expectedCards.filter((expected) => selectedLanguages.has(expected.language as SupportedCatalogueLanguageCode));
  const variantsByIdentity = new Set(activeVariants.map((variant) => proposedCanonicalKey({
    languageCode: variant.language_code,
    setCode: activeSets.find((set) => set.id === variant.set_id)?.set_code ?? variant.set_id,
    collectorNumber: variant.collector_number,
    variantCode: variant.variant_code,
    finishCode: variant.finish_code ?? 'normal',
  })));
  const missingCardRecords = expectedReportCards
    .filter((expected) => !variantsByIdentity.has(expected.canonicalKey))
    .map((expected) => ({
      language: expected.language,
      set_code: expected.setCode,
      collector_number: expected.collectorNumber,
      variant: expected.variant,
      finish: expected.finish,
      provider: expected.provider,
      provider_id: expected.providerId,
      source_url: expected.sourceUrl,
      rights_status: expected.rightsStatus,
      reason: 'raw_provider_identity_not_stored_in_catalog',
    }));

  const coverageRows = reportSets.map((set) => {
    const folderSetCode = setArtFolderCode(set);
    const setPrintings = printingsBySet.get(set.id) ?? [];
    const setVariants = variantsBySet.get(set.id) ?? [];
    const expectedSetRefs = args.provider
      ? selectedProviderSetRefsBySetId.get(set.id) ?? new Set<string>()
      : new Set([set.id, set.set_code, set.provider_set_code]
        .map(cleanText)
        .filter(Boolean)
        .map((ref) => String(ref).toLowerCase()));
    const expectedForSet = expectedCards.filter((expected) => expected.language === set.language_code
      && expectedSetRefs.has(expected.setRef.toLowerCase())
      && (!args.provider || expected.provider === args.provider));
    const expectedCollectorNumbers = new Set(expectedForSet.map((expected) => expected.collectorNumber));
    const expectedVariantKeys = new Set(expectedForSet.map((expected) => expected.canonicalKey));
    const setVariantKeys = new Set(setVariants.map((variant) => proposedCanonicalKey({
      languageCode: variant.language_code,
      setCode: folderSetCode,
      collectorNumber: variant.collector_number,
      variantCode: variant.variant_code,
      finishCode: variant.finish_code ?? 'normal',
    })));
    const hasPikaqianRecords = expectedForSet.some((expected) => expected.provider === 'pikaqian');
    const expectedCardCount = hasPikaqianRecords
      ? Math.max(expectedCollectorNumbers.size, setPrintings.length)
      : Math.max(Number(set.total ?? 0), expectedCollectorNumbers.size, setPrintings.length);
    const storedCardRecords = setPrintings.length;
    const missingCardRecords = Math.max(expectedCardCount - storedCardRecords, 0);
    const expectedRequiredVariantCount = Math.max(expectedVariantKeys.size, setVariants.length);
    const storedRequiredVariants = setVariants.length;
    const missingRequiredVariants = expectedVariantKeys.size > 0
      ? [...expectedVariantKeys].filter((key) => !setVariantKeys.has(key)).length
      : 0;
    const exactNativeImages = setVariants.filter((variant) => approvedImagesByVariant.has(variant.id)).length;
    const setConflictsById = new Map([
      ...(conflictsBySetRef.get(set.id) ?? []),
      ...(set.set_code ? conflictsBySetRef.get(set.set_code) ?? [] : []),
      ...(set.provider_set_code ? conflictsBySetRef.get(set.provider_set_code) ?? [] : []),
    ].map((conflict) => [conflict.id, conflict]));
    const setConflicts = [...setConflictsById.values()];
    const conflictCount = setConflicts.length;
    const unresolvedIdentityConflicts = setConflicts
      .filter((conflict) => IDENTITY_CONFLICT_TYPES.has(conflict.conflict_type))
      .length;
    const rawUnvalidatedIds = new Set<string>();
    for (const ref of [set.id, set.set_code, set.provider_set_code].map(cleanText).filter(Boolean) as string[]) {
      for (const id of unvalidatedRawImageRecordIdsBySetRef.get(ref) ?? []) rawUnvalidatedIds.add(id);
    }
    const unvalidatedImages = (unvalidatedImagesBySetId.get(set.id) ?? 0) + rawUnvalidatedIds.size;
    const missingExactNativeImages = Math.max(expectedRequiredVariantCount - exactNativeImages, 0);
    const missingLogo = setLogoIds.has(set.id) ? 0 : 1;
    const missingSymbol = setSymbolIds.has(set.id) ? 0 : 1;
    const isPikaqianSet = pikaqianSetIds.has(set.id);
    const setCoverAvailable = setCoverIds.has(set.id);
    const representativeCardCoverAvailable = exactNativeImages > 0;
    const setArtFallbackAvailable = setCoverAvailable || representativeCardCoverAvailable;
    const releaseBlockingMissingLogo = isPikaqianSet && setArtFallbackAvailable ? 0 : missingLogo;
    const releaseBlockingMissingSymbol = isPikaqianSet && setArtFallbackAvailable ? 0 : missingSymbol;
    const checklistCompletionPercentage = percentComplete(storedCardRecords, expectedCardCount);
    const variantCompletionPercentage = expectedRequiredVariantCount > 0
      ? percentComplete(storedRequiredVariants - missingRequiredVariants, expectedRequiredVariantCount)
      : 100;
    const imageCompletionPercentage = percentComplete(exactNativeImages, Math.max(expectedRequiredVariantCount, setVariants.length));
    const setArtCompletionPercentage = releaseBlockingMissingLogo === 0 && releaseBlockingMissingSymbol === 0
      ? 100
      : percentComplete(2 - missingLogo - missingSymbol, 2);
    const gates: SetCompletionGates = {
      missingCardRecords,
      missingRequiredVariants,
      missingExactNativeImages,
      missingLogo: releaseBlockingMissingLogo,
      missingSymbol: releaseBlockingMissingSymbol,
      unresolvedIdentityConflicts,
      unvalidatedImages,
    };
    const row = {
      set_status: deriveSetCompletionStatus(gates),
      language: set.language_code,
      set_id: set.id,
      set_code: folderSetCode,
      set_name: set.native_name,
      english_display_name: set.english_display_name ?? '',
      release_date: set.release_date ?? '',
      expected_cards: expectedCardCount,
      stored_card_records: storedCardRecords,
      missing_card_records: missingCardRecords,
      expected_required_variants: expectedRequiredVariantCount,
      stored_required_variants: storedRequiredVariants,
      missing_required_variants: missingRequiredVariants,
      exact_native_images: exactNativeImages,
      missing_exact_native_images: missingExactNativeImages,
      missing_native_images: missingExactNativeImages,
      missing_logo: missingLogo,
      missing_symbol: missingSymbol,
      missing_set_logo: missingLogo > 0,
      missing_set_symbol: missingSymbol > 0,
      native_logo_status: missingLogo === 0 ? 'approved' : 'missing',
      set_symbol_status: missingSymbol === 0 ? 'approved' : 'missing',
      set_cover_available: setCoverAvailable,
      representative_card_cover_available: representativeCardCoverAvailable,
      set_art_requirement: isPikaqianSet ? 'optional_source_unavailable_with_fallback' : 'native_logo_and_symbol_required',
      set_art_fallback_status: missingLogo === 0 || missingSymbol === 0
        ? 'native_set_art'
        : setCoverAvailable
        ? 'approved_pack_cover'
        : representativeCardCoverAvailable
        ? 'approved_representative_card'
        : 'unavailable',
      release_blocking_missing_logo: releaseBlockingMissingLogo,
      release_blocking_missing_symbol: releaseBlockingMissingSymbol,
      unresolved_identity_conflicts: unresolvedIdentityConflicts,
      unvalidated_images: unvalidatedImages,
      conflicts: conflictCount,
      checklist_completion_percentage: checklistCompletionPercentage,
      variant_completion_percentage: variantCompletionPercentage,
      image_completion_percentage: imageCompletionPercentage,
      set_art_completion_percentage: setArtCompletionPercentage,
      completion_percentage: 0,
    };
    return { ...row, completion_percentage: coveragePercent(row) };
  });

  const imageLeftovers = classifyImageLeftovers({
    sets: activeSets,
    variants: activeVariants,
    assets,
    rawRecords: activeRawRecords,
  });
  const missingCardImages = imageLeftovers.leftovers.map((row) => ({
    ...row,
    reason: row.group === 'A'
      ? 'missing_native_image_but_exact_approved_candidate_available'
      : row.group === 'B'
      ? 'missing_native_image_only_other_language_artwork_available'
      : 'missing_native_image_scan_acquisition_required',
  })).filter((row) => selectedLanguages.has(String((row as Record<string, unknown>).language) as SupportedCatalogueLanguageCode));

  const missingSetArt = reportSets
    .filter((set) => !setLogoIds.has(set.id) || !setSymbolIds.has(set.id))
    .flatMap((set) => {
      const language = normaliseLanguageCode(set.language_code);
      const setCode = setArtFolderCode(set);
      const base = {
        language,
        set_id: set.id,
        set_code: setCode,
        native_name: set.native_name,
        english_display_name: set.english_display_name ?? '',
        release_date: set.release_date ?? '',
      };
      return [
        !setLogoIds.has(set.id) ? {
          ...base,
          asset_kind: 'native_logo',
          asset_type: 'set_logo',
          expected_path: setArtExpectedPath(language, setCode, 'logo', args.setArtRoot),
          native_logo_status: 'missing',
          set_symbol_status: setSymbolIds.has(set.id) ? 'approved' : 'missing',
          missing_set_logo: true,
          missing_set_symbol: !setSymbolIds.has(set.id),
        } : null,
        !setSymbolIds.has(set.id) ? {
          ...base,
          asset_kind: 'set_symbol',
          asset_type: 'set_symbol',
          expected_path: setArtExpectedPath(language, setCode, 'symbol', args.setArtRoot),
          native_logo_status: setLogoIds.has(set.id) ? 'approved' : 'missing',
          set_symbol_status: 'missing',
          missing_set_logo: !setLogoIds.has(set.id),
          missing_set_symbol: true,
        } : null,
      ].filter(Boolean) as Record<string, unknown>[];
    });

  const pikaqianSetRefs = new Set<string>();
  for (const expected of expectedCards) {
    if (expected.provider === 'pikaqian') pikaqianSetRefs.add(expected.setRef);
  }
  for (const row of activeRawRecords) {
    if (rawPayloadProvider(row, sourceCodeById.get(row.source_id)) !== 'pikaqian') continue;
    const ref = setRef(row.raw_payload);
    if (ref) pikaqianSetRefs.add(ref);
  }
  const pikaqianCoverageRows = coverageRows
    .filter((row) => row.language === 'zh-cn'
      && (
        pikaqianSetIds.has(String(row.set_id))
        || pikaqianSetRefs.has(String(row.set_id))
        || pikaqianSetRefs.has(String(row.set_code))
      ))
    .map((row) => ({ provider: 'pikaqian', ...row }));

  const conflictRows = [
    ...openConflicts.map((conflict) => ({
      conflict_id: conflict.id,
      language: cleanText(valueAt(conflict.proposed_payload ?? {}, 'language_code', 'languageCode', 'language')) ?? '',
      set_ref: cleanText(valueAt(conflict.proposed_payload ?? {}, 'set_id', 'setId', 'set_code', 'setCode')) ?? conflict.entity_id ?? '',
      collector_number: cleanText(valueAt(conflict.proposed_payload ?? {}, 'collector_number', 'collectorNumber', 'number')) ?? '',
      variant: cleanText(valueAt(conflict.proposed_payload ?? {}, 'variant_code', 'variantCode', 'variant')) ?? '',
      finish: cleanText(valueAt(conflict.proposed_payload ?? {}, 'finish_code', 'finishCode', 'finish')) ?? '',
      conflict_type: conflict.conflict_type,
      severity: conflict.severity,
      status: conflict.status,
      provider: cleanText(valueAt(conflict.proposed_payload ?? {}, 'provider')) ?? '',
      provider_id: cleanText(valueAt(conflict.proposed_payload ?? {}, 'provider_record_id', 'providerRecordId', 'id')) ?? '',
      reason: conflict.internal_notes ?? '',
      candidate_count: '',
      candidate_summary: '',
    })),
    ...imageLeftovers.conflicts.filter((conflict) => (
      selectedLanguages.has(String(conflict.language) as SupportedCatalogueLanguageCode)
    )),
  ];

  const rightsBlockedRows = activeRawRecords
    .filter((row) => row.licence_status !== 'approved')
    .filter((row) => !args.provider || rawPayloadProvider(row) === args.provider)
    .map((row) => {
      const payload = row.raw_payload ?? {};
      const variant = normaliseVariantCode(valueAt(payload, 'variant_code', 'variantCode', 'variant', 'finish') ?? 'normal');
      const finish = normaliseFinishCode(valueAt(payload, 'finish_code', 'finishCode', 'finish', 'variant') ?? variant) ?? 'normal';
      return {
        provider: rawPayloadProvider(row, sourceCodeById.get(row.source_id)),
        language: normaliseLanguageCode(row.language_code ?? valueAt(payload, 'language_code', 'languageCode', 'language')),
        record_type: row.record_type,
        provider_id: row.external_id,
        set_ref: setRef(payload) ?? '',
        collector_number: cleanText(valueAt(payload, 'collector_number', 'collectorNumber', 'localId', 'number')) ?? '',
        variant,
        finish,
        source_url: row.source_url,
        rights_status: row.licence_status,
        reason: `rights_status_${row.licence_status}`,
      };
    });

  writeCsv(files.masterCoverage, coverageRows, [
    'set_status',
    'language',
    'set_id',
    'set_code',
    'set_name',
    'english_display_name',
    'release_date',
    'expected_cards',
    'stored_card_records',
    'missing_card_records',
    'expected_required_variants',
    'stored_required_variants',
    'missing_required_variants',
    'exact_native_images',
    'missing_exact_native_images',
    'missing_native_images',
    'missing_logo',
    'missing_symbol',
    'missing_set_logo',
    'missing_set_symbol',
    'native_logo_status',
    'set_symbol_status',
    'set_cover_available',
    'representative_card_cover_available',
    'set_art_requirement',
    'set_art_fallback_status',
    'release_blocking_missing_logo',
    'release_blocking_missing_symbol',
    'unresolved_identity_conflicts',
    'unvalidated_images',
    'conflicts',
    'checklist_completion_percentage',
    'variant_completion_percentage',
    'image_completion_percentage',
    'set_art_completion_percentage',
    'completion_percentage',
  ]);
  writeCsv(files.pikaqianCoverage, pikaqianCoverageRows, [
    'provider',
    'set_status',
    'language',
    'set_id',
    'set_code',
    'set_name',
    'english_display_name',
    'release_date',
    'expected_cards',
    'stored_card_records',
    'missing_card_records',
    'expected_required_variants',
    'stored_required_variants',
    'missing_required_variants',
    'exact_native_images',
    'missing_exact_native_images',
    'missing_native_images',
    'missing_logo',
    'missing_symbol',
    'missing_set_logo',
    'missing_set_symbol',
    'native_logo_status',
    'set_symbol_status',
    'set_cover_available',
    'representative_card_cover_available',
    'set_art_requirement',
    'set_art_fallback_status',
    'release_blocking_missing_logo',
    'release_blocking_missing_symbol',
    'unresolved_identity_conflicts',
    'unvalidated_images',
    'conflicts',
    'checklist_completion_percentage',
    'variant_completion_percentage',
    'image_completion_percentage',
    'set_art_completion_percentage',
    'completion_percentage',
  ]);
  writeCsv(files.missingCardRecords, missingCardRecords, [
    'language',
    'set_code',
    'collector_number',
    'variant',
    'finish',
    'provider',
    'provider_id',
    'source_url',
    'rights_status',
    'reason',
  ]);
  writeCsv(files.missingCardImages, missingCardImages, [
    'language',
    'set_id',
    'set_code',
    'set_name',
    'collector_number',
    'variant',
    'finish',
    'group',
    'native_image_status',
    'candidate_count',
    'candidate_provider',
    'candidate_provider_group',
    'candidate_provider_id',
    'candidate_source_url',
    'same_artwork_as_variant_id',
    'scan_queue_required',
    'conflict_required',
    'conflict_type',
    'reason',
  ]);
  writeCsv(files.missingSetArt, missingSetArt, [
    'language',
    'set_id',
    'set_code',
    'native_name',
    'english_display_name',
    'release_date',
    'asset_kind',
    'asset_type',
    'expected_path',
    'native_logo_status',
    'set_symbol_status',
    'missing_set_logo',
    'missing_set_symbol',
  ]);
  writeCsv(files.conflicts, conflictRows, [
    'conflict_id',
    'language',
    'set_ref',
    'collector_number',
    'variant',
    'finish',
    'conflict_type',
    'severity',
    'status',
    'provider',
    'provider_id',
    'reason',
    'candidate_count',
    'candidate_summary',
  ]);
  writeCsv(files.rightsBlocked, rightsBlockedRows, [
    'provider',
    'language',
    'record_type',
    'provider_id',
    'set_ref',
    'collector_number',
    'variant',
    'finish',
    'source_url',
    'rights_status',
    'reason',
  ]);
  writeCsv(files.imageLeftovers, imageLeftovers.leftovers, [
    'group',
    'status',
    'language',
    'set_id',
    'set_code',
    'set_name',
    'collector_number',
    'variant',
    'finish',
    'variant_id',
    'canonical_key',
    'native_image_status',
    'candidate_count',
    'candidate_provider',
    'candidate_provider_group',
    'candidate_provider_id',
    'candidate_source_url',
    'same_artwork_as_variant_id',
    'scan_queue_required',
    'conflict_required',
    'conflict_type',
  ]);
  writeCsv(files.sameArtworkReferences, imageLeftovers.groupB, [
    'language',
    'set_id',
    'set_code',
    'set_name',
    'collector_number',
    'variant',
    'finish',
    'variant_id',
    'native_image_status',
    'same_artwork_as_variant_id',
    'same_artwork_as_language',
    'same_artwork_as_set_code',
    'candidate_source_url',
    'scan_queue_required',
    'conflict_required',
    'conflict_type',
  ]);
  writeCsv(files.scanAcquisitionQueue, imageLeftovers.groupC, [
    'language',
    'set_id',
    'set_code',
    'set_name',
    'collector_number',
    'variant',
    'finish',
    'variant_id',
    'native_image_status',
    'scan_queue_required',
    'required_sources',
    'process',
  ]);

  const setStatusCounts = coverageRows.reduce((counts, row) => {
    counts[row.set_status] = (counts[row.set_status] ?? 0) + 1;
    return counts;
  }, {} as Record<SetCompletionStatus, number>);

  const summary = {
    generatedAt: new Date().toISOString(),
    sourceOfTruth: 'staging_supabase',
    productionModified: false,
    completionGates: [
      'missing_card_records',
      'missing_required_variants',
      'missing_exact_native_images',
      'release_blocking_missing_logo',
      'release_blocking_missing_symbol',
      'unresolved_identity_conflicts',
      'unvalidated_images',
    ],
    statuses: [
      'Metadata incomplete',
      'Images incomplete',
      'Set art incomplete',
      'Under review',
      'Complete',
    ],
    files,
    totals: {
      sets: coverageRows.length,
      setStatuses: setStatusCounts,
      expectedCards: coverageRows.reduce((sum, row) => sum + row.expected_cards, 0),
      storedCardRecords: coverageRows.reduce((sum, row) => sum + row.stored_card_records, 0),
      missingCardRecords: coverageRows.reduce((sum, row) => sum + row.missing_card_records, 0),
      missingCardRecordRows: missingCardRecords.length,
      expectedRequiredVariants: coverageRows.reduce((sum, row) => sum + row.expected_required_variants, 0),
      storedRequiredVariants: coverageRows.reduce((sum, row) => sum + row.stored_required_variants, 0),
      missingRequiredVariants: coverageRows.reduce((sum, row) => sum + row.missing_required_variants, 0),
      missingCardImages: missingCardImages.length,
      missingExactNativeImages: coverageRows.reduce((sum, row) => sum + row.missing_exact_native_images, 0),
      missingSetArt: missingSetArt.length,
      missingLogos: coverageRows.reduce((sum, row) => sum + row.missing_logo, 0),
      missingSymbols: coverageRows.reduce((sum, row) => sum + row.missing_symbol, 0),
      releaseBlockingMissingLogos: coverageRows.reduce((sum, row) => sum + row.release_blocking_missing_logo, 0),
      releaseBlockingMissingSymbols: coverageRows.reduce((sum, row) => sum + row.release_blocking_missing_symbol, 0),
      approvedSetCovers: coverageRows.reduce((sum, row) => sum + Number(row.set_cover_available), 0),
      representativeCardCoverFallbacks: coverageRows.reduce((sum, row) => sum + Number(row.representative_card_cover_available && !row.set_cover_available), 0),
      unresolvedIdentityConflicts: coverageRows.reduce((sum, row) => sum + row.unresolved_identity_conflicts, 0),
      unvalidatedImages: coverageRows.reduce((sum, row) => sum + row.unvalidated_images, 0),
      conflicts: conflictRows.length,
      rightsBlocked: rightsBlockedRows.length,
      imageLeftovers: imageLeftovers.leftovers.length,
      exactApprovedImageCandidates: imageLeftovers.groupA.length,
      sameArtworkReferences: imageLeftovers.groupB.length,
      scanAcquisitionQueue: imageLeftovers.groupC.length,
      imageCandidateConflicts: imageLeftovers.conflicts.length,
    },
    providerReports: {
      pikaqianCoverageRows: pikaqianCoverageRows.length,
    },
    byLanguage: SUPPORTED_CATALOGUE_LANGUAGE_CODES.map((language) => {
      const rows = coverageRows.filter((row) => row.language === language);
      return {
        language,
        sets: rows.length,
        setStatuses: rows.reduce((counts, row) => {
          counts[row.set_status] = (counts[row.set_status] ?? 0) + 1;
          return counts;
        }, {} as Record<SetCompletionStatus, number>),
        expectedCards: rows.reduce((sum, row) => sum + row.expected_cards, 0),
        storedCardRecords: rows.reduce((sum, row) => sum + row.stored_card_records, 0),
        missingCardRecords: rows.reduce((sum, row) => sum + row.missing_card_records, 0),
        missingRequiredVariants: rows.reduce((sum, row) => sum + row.missing_required_variants, 0),
        exactNativeImages: rows.reduce((sum, row) => sum + row.exact_native_images, 0),
        missingExactNativeImages: rows.reduce((sum, row) => sum + row.missing_exact_native_images, 0),
        missingLogos: rows.reduce((sum, row) => sum + row.missing_logo, 0),
        missingSymbols: rows.reduce((sum, row) => sum + row.missing_symbol, 0),
        releaseBlockingMissingLogos: rows.reduce((sum, row) => sum + row.release_blocking_missing_logo, 0),
        releaseBlockingMissingSymbols: rows.reduce((sum, row) => sum + row.release_blocking_missing_symbol, 0),
        unresolvedIdentityConflicts: rows.reduce((sum, row) => sum + row.unresolved_identity_conflicts, 0),
        unvalidatedImages: rows.reduce((sum, row) => sum + row.unvalidated_images, 0),
        conflicts: rows.reduce((sum, row) => sum + row.conflicts, 0),
      };
    }),
  };
  writeFileSync(files.summary, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  return { ...summary, coverageRows };
}

function publishLanguage(args: Args): SupportedCatalogueLanguageCode {
  if (args.languages.length !== 1) {
    throw new Error('catalogue:publish requires exactly one --language. Publish languages one at a time.');
  }
  return args.languages[0];
}

function buildPublishPlan(args: Args) {
  const language = publishLanguage(args);
  const version = cleanText(args.version);
  const controlledStaging = args.controlledStaging;
  const coverageLimited = args.coverageLimited;
  return {
    id: `catalogue:publish:${language}:${version ?? '<missing-version>'}`,
    language,
    version,
    versionKey: version ? publicationVersionKey(language, version) : null,
    controlledStaging,
    coverageLimited,
    releaseEligible: !controlledStaging,
    setRef: controlledStaging ? args.setId : null,
    publishOrder: LANGUAGE_PUBLISH_ORDER,
    previousLanguagesRequired: previousPublishLanguages(language),
    publishOrderEnforced: !controlledStaging,
    writes: args.apply,
    reason: controlledStaging
      ? 'Publish one explicitly incomplete, single-set staging snapshot for API verification; it is never production-release eligible.'
      : coverageLimited
      ? 'Publish all approved imported records for one language with measured provider gaps; identity, validation, and rights blockers still fail closed.'
      : 'Publish one complete language snapshot; app-facing API views read published snapshots only.',
  };
}

function publishReadinessFromSummary(summary: any, language: SupportedCatalogueLanguageCode) {
  const languageSummary = summary.byLanguage?.find((row: any) => row.language === language);
  if (!languageSummary || languageSummary.sets <= 0) {
    return {
      ok: false,
      blockers: ['no_sets_for_language'],
      languageSummary: languageSummary ?? null,
    };
  }
  const blockers: string[] = [];
  const statusCounts = languageSummary.setStatuses ?? {};
  if ((statusCounts.Complete ?? 0) !== languageSummary.sets) blockers.push('language_has_incomplete_sets');
  for (const [field, blocker] of [
    ['missingCardRecords', 'missing_card_records'],
    ['missingRequiredVariants', 'missing_required_variants'],
    ['missingExactNativeImages', 'missing_exact_native_images'],
    ['releaseBlockingMissingLogos', 'release_blocking_missing_logo'],
    ['releaseBlockingMissingSymbols', 'release_blocking_missing_symbol'],
    ['unresolvedIdentityConflicts', 'unresolved_identity_conflicts'],
    ['unvalidatedImages', 'unvalidated_images'],
  ] as const) {
    if (Number(languageSummary[field] ?? 0) > 0) blockers.push(blocker);
  }
  return {
    ok: blockers.length === 0,
    blockers,
    languageSummary,
  };
}

function coverageLimitedReadinessFromSummary(summary: any, language: SupportedCatalogueLanguageCode) {
  const strictReadiness = publishReadinessFromSummary(summary, language);
  const toleratedProviderGapBlockers = new Set([
    'language_has_incomplete_sets',
    'missing_card_records',
    'missing_required_variants',
    'missing_exact_native_images',
    'release_blocking_missing_logo',
    'release_blocking_missing_symbol',
  ]);
  const blockers = strictReadiness.blockers.filter(
    (blocker: string) => !toleratedProviderGapBlockers.has(blocker),
  );
  return {
    ok: blockers.length === 0,
    blockers,
    acknowledgedProviderGaps: strictReadiness.blockers.filter(
      (blocker: string) => toleratedProviderGapBlockers.has(blocker),
    ),
    languageSummary: strictReadiness.languageSummary,
  };
}

function controlledStagingReadinessFromSummary(
  summary: any,
  language: SupportedCatalogueLanguageCode,
  setRef: string | null,
) {
  const cleanedSetRef = cleanText(setRef)?.toLowerCase();
  if (!cleanedSetRef) {
    return { ok: false, blockers: ['controlled_staging_set_required'], setCoverage: null };
  }
  const matches = (summary.coverageRows ?? []).filter((row: any) => (
    row.language === language
    && [row.set_id, row.set_code].some((value) => cleanText(value)?.toLowerCase() === cleanedSetRef)
  ));
  if (matches.length === 0) {
    return { ok: false, blockers: ['controlled_staging_set_not_found'], setCoverage: null };
  }
  if (matches.length > 1) {
    return { ok: false, blockers: ['controlled_staging_set_ambiguous'], setCoverage: null };
  }

  const setCoverage = matches[0];
  const blockers: string[] = [];
  if (Number(setCoverage.stored_card_records ?? 0) <= 0) blockers.push('controlled_staging_set_has_no_cards');
  if (Number(setCoverage.stored_required_variants ?? 0) <= 0) blockers.push('controlled_staging_set_has_no_variants');
  if (Number(setCoverage.exact_native_images ?? 0) <= 0) blockers.push('controlled_staging_set_has_no_approved_images');
  if (Number(setCoverage.unresolved_identity_conflicts ?? 0) > 0) blockers.push('unresolved_identity_conflicts');
  if (Number(setCoverage.unvalidated_images ?? 0) > 0) blockers.push('unvalidated_images');
  return {
    ok: blockers.length === 0,
    blockers,
    setCoverage,
  };
}

async function buildControlledStagingReport(
  db: SupabaseClientLike,
  args: Args,
  language: SupportedCatalogueLanguageCode,
  requestedSetRef: string,
) {
  const sets = await fetchAllFiltered(
    db,
    'catalog',
    'sets',
    'id,language_code,set_code,provider_set_code,native_name,english_display_name,release_date,total,deprecated_at',
    (query) => query.eq('language_code', language).is('deprecated_at', null),
  ) as SetRow[];
  const cleanedSetRef = requestedSetRef.toLowerCase();
  const matchingSets = sets.filter((set) => [set.id, set.set_code, set.provider_set_code]
    .map(cleanText)
    .filter(Boolean)
    .some((value) => String(value).toLowerCase() === cleanedSetRef));
  if (matchingSets.length !== 1) {
    return {
      generatedAt: new Date().toISOString(),
      sourceOfTruth: 'staging_supabase',
      productionModified: false,
      controlledStagingSnapshot: true,
      byLanguage: [],
      coverageRows: matchingSets.map((set) => ({
        language: set.language_code,
        set_id: set.id,
        set_code: setArtFolderCode(set),
      })),
    };
  }

  const set = matchingSets[0];
  const [printings, variants, openConflicts] = await Promise.all([
    fetchAllFiltered(
      db,
      'catalog',
      'card_printings',
      'id,set_id,language_code,collector_number,deprecated_at',
      (query) => query.eq('set_id', set.id).is('deprecated_at', null),
    ) as Promise<PrintingRow[]>,
    fetchAllFiltered(
      db,
      'catalog',
      'card_variants',
      'id,printing_id,set_id,language_code,collector_number,variant_code,finish_code,canonical_key,artwork_key,deprecated_at',
      (query) => query.eq('set_id', set.id).is('deprecated_at', null),
    ) as Promise<VariantRow[]>,
    fetchAllFiltered(
      db,
      'ingest',
      'data_conflicts',
      'id,conflict_type,severity,status,entity_schema,entity_table,entity_id,canonical_key,proposed_payload,existing_payload,internal_notes',
      (query) => query.in('status', ['open', 'in_review']),
    ) as Promise<ConflictRow[]>,
  ]);

  const printingIds = printings.map((printing) => printing.id);
  const variantIds = variants.map((variant) => variant.id);
  const assetQueries = [
    fetchAllFiltered(
      db,
      'catalog',
      'assets',
      'id,set_id,printing_id,variant_id,asset_type,url,rights_status,permission_status,publicly_servable,original_source_url,original_source_identifier,source_attribution,storage_provider,storage_path,storage_key,content_sha256,perceptual_hash,deprecated_at',
      (query) => query.eq('set_id', set.id),
    ) as Promise<AssetRow[]>,
  ];
  if (printingIds.length) {
    assetQueries.push(fetchAllFiltered(
      db,
      'catalog',
      'assets',
      'id,set_id,printing_id,variant_id,asset_type,url,rights_status,permission_status,publicly_servable,original_source_url,original_source_identifier,source_attribution,storage_provider,storage_path,storage_key,content_sha256,perceptual_hash,deprecated_at',
      (query) => query.in('printing_id', printingIds),
    ) as Promise<AssetRow[]>);
  }
  if (variantIds.length) {
    assetQueries.push(fetchAllFiltered(
      db,
      'catalog',
      'assets',
      'id,set_id,printing_id,variant_id,asset_type,url,rights_status,permission_status,publicly_servable,original_source_url,original_source_identifier,source_attribution,storage_provider,storage_path,storage_key,content_sha256,perceptual_hash,deprecated_at',
      (query) => query.in('variant_id', variantIds),
    ) as Promise<AssetRow[]>);
  }
  const assets = [...new Map((await Promise.all(assetQueries)).flat()
    .map((asset) => [asset.id, asset] as const)).values()];

  const targetRefs = new Set([set.id, set.set_code, set.provider_set_code]
    .map(cleanText)
    .filter(Boolean)
    .map((value) => String(value).toLowerCase()));
  const entityIds = new Set([set.id, ...printingIds, ...variantIds]);
  const scopedConflicts = openConflicts.filter((conflict) => {
    if (conflict.entity_id && entityIds.has(conflict.entity_id)) return true;
    const refs = [
      conflict.proposed_payload?.set_id,
      conflict.proposed_payload?.setId,
      conflict.proposed_payload?.set_code,
      conflict.proposed_payload?.setCode,
      conflict.canonical_key?.split(':')[1],
    ].map(cleanText).filter(Boolean).map((value) => String(value).toLowerCase());
    return refs.some((ref) => targetRefs.has(ref));
  });

  const approvedImageVariantIds = new Set(assets
    .filter((asset) => assetIsApproved(asset) && asset.publicly_servable)
    .map((asset) => asset.variant_id)
    .filter(Boolean) as string[]);
  const exactNativeImages = variants.filter((variant) => approvedImageVariantIds.has(variant.id)).length;
  const unvalidatedImages = assets.filter((asset) => (
    ['card_image', 'set_logo', 'set_symbol'].includes(asset.asset_type)
    && !asset.deprecated_at
    && (
      asset.rights_status !== 'approved'
      || (asset.permission_status ?? 'unknown') !== 'approved'
    )
  )).length;
  const missingLogo = assets.some((asset) => (
    asset.asset_type === 'set_logo'
    && asset.publicly_servable
    && assetRightsAreApproved(asset)
  )) ? 0 : 1;
  const missingSymbol = assets.some((asset) => (
    asset.asset_type === 'set_symbol'
    && asset.publicly_servable
    && assetRightsAreApproved(asset)
  )) ? 0 : 1;
  const setCoverAvailable = assets.some((asset) => (
    asset.asset_type === 'sealed_product_image'
    && asset.publicly_servable
    && assetRightsAreApproved(asset)
  ));
  const isPikaqianSet = args.provider === 'pikaqian';
  const setArtFallbackAvailable = setCoverAvailable || exactNativeImages > 0;
  const releaseBlockingMissingLogo = isPikaqianSet && setArtFallbackAvailable ? 0 : missingLogo;
  const releaseBlockingMissingSymbol = isPikaqianSet && setArtFallbackAvailable ? 0 : missingSymbol;
  const expectedCardCount = Math.max(Number(set.total ?? 0), printings.length);
  const expectedRequiredVariantCount = variants.length;
  const unresolvedIdentityConflicts = scopedConflicts
    .filter((conflict) => IDENTITY_CONFLICT_TYPES.has(conflict.conflict_type))
    .length;
  const gates: SetCompletionGates = {
    missingCardRecords: Math.max(expectedCardCount - printings.length, 0),
    missingRequiredVariants: 0,
    missingExactNativeImages: Math.max(expectedRequiredVariantCount - exactNativeImages, 0),
    missingLogo: releaseBlockingMissingLogo,
    missingSymbol: releaseBlockingMissingSymbol,
    unresolvedIdentityConflicts,
    unvalidatedImages,
  };
  const row = {
    set_status: deriveSetCompletionStatus(gates),
    language,
    set_id: set.id,
    set_code: setArtFolderCode(set),
    set_name: set.native_name,
    english_display_name: set.english_display_name ?? '',
    release_date: set.release_date ?? '',
    expected_cards: expectedCardCount,
    stored_card_records: printings.length,
    missing_card_records: gates.missingCardRecords,
    expected_required_variants: expectedRequiredVariantCount,
    stored_required_variants: variants.length,
    missing_required_variants: gates.missingRequiredVariants,
    exact_native_images: exactNativeImages,
    missing_exact_native_images: gates.missingExactNativeImages,
    missing_native_images: gates.missingExactNativeImages,
    missing_logo: missingLogo,
    missing_symbol: missingSymbol,
    missing_set_logo: missingLogo > 0,
    missing_set_symbol: missingSymbol > 0,
    native_logo_status: missingLogo === 0 ? 'approved' : 'missing',
    set_symbol_status: missingSymbol === 0 ? 'approved' : 'missing',
    set_cover_available: setCoverAvailable,
    representative_card_cover_available: exactNativeImages > 0,
    set_art_requirement: isPikaqianSet ? 'optional_source_unavailable_with_fallback' : 'native_logo_and_symbol_required',
    set_art_fallback_status: missingLogo === 0 || missingSymbol === 0
      ? 'native_set_art'
      : setCoverAvailable
      ? 'approved_pack_cover'
      : exactNativeImages > 0
      ? 'approved_representative_card'
      : 'unavailable',
    release_blocking_missing_logo: releaseBlockingMissingLogo,
    release_blocking_missing_symbol: releaseBlockingMissingSymbol,
    unresolved_identity_conflicts: unresolvedIdentityConflicts,
    unvalidated_images: unvalidatedImages,
    conflicts: scopedConflicts.length,
    checklist_completion_percentage: percentComplete(printings.length, expectedCardCount),
    variant_completion_percentage: 100,
    image_completion_percentage: percentComplete(exactNativeImages, expectedRequiredVariantCount),
    set_art_completion_percentage: releaseBlockingMissingLogo === 0 && releaseBlockingMissingSymbol === 0
      ? 100
      : percentComplete(2 - missingLogo - missingSymbol, 2),
    completion_percentage: 0,
  };
  const coverageRow = { ...row, completion_percentage: coveragePercent(row) };
  return {
    generatedAt: new Date().toISOString(),
    sourceOfTruth: 'staging_supabase',
    productionModified: false,
    controlledStagingSnapshot: true,
    totals: {
      sets: 1,
      storedCardRecords: printings.length,
      storedRequiredVariants: variants.length,
      exactNativeImages,
      unresolvedIdentityConflicts,
      unvalidatedImages,
    },
    byLanguage: [{
      language,
      sets: 1,
      setStatuses: { [coverageRow.set_status]: 1 },
      storedCardRecords: printings.length,
      missingCardRecords: coverageRow.missing_card_records,
      missingRequiredVariants: coverageRow.missing_required_variants,
      exactNativeImages,
      missingExactNativeImages: coverageRow.missing_exact_native_images,
      missingLogos: missingLogo,
      missingSymbols: missingSymbol,
      releaseBlockingMissingLogos: releaseBlockingMissingLogo,
      releaseBlockingMissingSymbols: releaseBlockingMissingSymbol,
      unresolvedIdentityConflicts,
      unvalidatedImages,
      conflicts: scopedConflicts.length,
    }],
    coverageRows: [coverageRow],
  };
}

async function requirePreviousLanguagesPublished(
  db: SupabaseClientLike,
  language: SupportedCatalogueLanguageCode,
  version: string,
) {
  const previousLanguages = previousPublishLanguages(language);
  if (previousLanguages.length === 0) return { ok: true, missing: [] as SupportedCatalogueLanguageCode[] };
  const rows = await fetchAll(
    db,
    'catalog',
    'catalogue_versions',
    'id,version_key,version_label,language_code,status,deprecated_at,published_at',
  );
  const published = new Set(rows
    .filter((row) => row.status === 'published' && row.deprecated_at == null)
    .filter((row) => cleanText(row.version_label) === version || cleanText(row.version_key)?.endsWith(`:${version}`))
    .map((row) => cleanText(row.language_code))
    .filter(Boolean) as SupportedCatalogueLanguageCode[]);
  return {
    ok: previousLanguages.every((entry) => published.has(entry)),
    missing: previousLanguages.filter((entry) => !published.has(entry)),
  };
}

async function insertRowsInChunks(db: SupabaseClientLike, schema: string, tableName: string, rows: Record<string, unknown>[]) {
  const chunkSize = 500;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    if (!chunk.length) continue;
    const { error } = await db.schema(schema).from(tableName).insert(chunk);
    if (error) throw error;
  }
}

async function upsertDraftCatalogueVersion(
  db: SupabaseClientLike,
  input: {
      language: SupportedCatalogueLanguageCode;
      version: string;
      summary: Record<string, unknown>;
      controlledStaging?: boolean;
      coverageLimited?: boolean;
  },
) {
  const versionKey = publicationVersionKey(input.language, input.version);
  const row = {
    version_key: versionKey,
    version_label: input.version,
    language_code: input.language,
    status: 'draft',
      description: input.controlledStaging
        ? `Stackr controlled staging catalogue ${input.language} ${input.version}`
        : input.coverageLimited
        ? `Stackr coverage-limited catalogue ${input.language} ${input.version}`
        : `Stackr ${input.language} catalogue ${input.version}`,
    coverage_summary: input.summary,
    deprecated_at: null,
    deprecated_reason: null,
    superseded_by_version_id: null,
    updated_at: new Date().toISOString(),
  };
  const { data: existing, error: lookupError } = await db.schema('catalog')
    .from('catalogue_versions')
    .select('id,status')
    .eq('version_key', versionKey)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (existing?.id) {
    const { data, error } = await db.schema('catalog')
      .from('catalogue_versions')
      .update(row)
      .eq('id', existing.id)
      .select('id,status')
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  const { data, error } = await db.schema('catalog')
    .from('catalogue_versions')
    .insert(row)
    .select('id,status')
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function clearVersionSnapshot(db: SupabaseClientLike, versionId: string) {
  for (const tableName of [
    'catalogue_version_external_identifiers',
    'catalogue_version_assets',
    'catalogue_version_variants',
    'catalogue_version_printings',
    'catalogue_version_sets',
  ]) {
    const { error } = await db.schema('catalog')
      .from(tableName)
      .delete()
      .eq('catalogue_version_id', versionId);
    if (error) throw error;
  }
}

async function snapshotPublishedLanguage(
  db: SupabaseClientLike,
  input: {
    versionId: string;
    language: SupportedCatalogueLanguageCode;
    summary: any;
    includedSetIds?: string[];
  },
) {
  const includedSetIds = input.includedSetIds?.length
    ? [...new Set(input.includedSetIds)]
    : null;
  const sets = await fetchAllFiltered(
    db,
    'catalog',
    'sets',
    'id,language_code,set_code,provider_set_code,native_name,english_display_name,release_date,total,deprecated_at',
    (query) => {
      const activeLanguageQuery = query
        .eq('language_code', input.language)
        .is('deprecated_at', null);
      return includedSetIds ? activeLanguageQuery.in('id', includedSetIds) : activeLanguageQuery;
    },
  );
  const setIds = new Set(sets.map((set) => set.id));
  const printings = sets.length === 0
    ? []
    : (await fetchAllFiltered(
        db,
        'catalog',
        'card_printings',
        'id,set_id,language_code,collector_number,deprecated_at',
        (query) => {
          const activeLanguageQuery = query
            .eq('language_code', input.language)
            .is('deprecated_at', null);
          return includedSetIds
            ? activeLanguageQuery.in('set_id', [...setIds])
            : activeLanguageQuery;
        },
      )).filter((printing) => setIds.has(printing.set_id));
  const printingIds = new Set(printings.map((printing) => printing.id));
  const variants = sets.length === 0
    ? []
    : (await fetchAllFiltered(
        db,
        'catalog',
        'card_variants',
        'id,printing_id,set_id,language_code,canonical_key,deprecated_at',
        (query) => {
          const activeLanguageQuery = query
            .eq('language_code', input.language)
            .is('deprecated_at', null);
          return includedSetIds
            ? activeLanguageQuery.in('set_id', [...setIds])
            : activeLanguageQuery;
        },
      )).filter((variant) => setIds.has(variant.set_id) && printingIds.has(variant.printing_id));
  const variantIds = new Set(variants.map((variant) => variant.id));
  const assetColumns = 'id,set_id,printing_id,variant_id,asset_type,rights_status,permission_status,publicly_servable,asset_visibility,retention_status,deleted_at,deprecated_at';
  const activePublicAssets = (query: any) => query
    .is('deprecated_at', null)
    .is('deleted_at', null)
    .eq('publicly_servable', true)
    .eq('asset_visibility', 'public_catalogue')
    .eq('retention_status', 'active')
    .eq('rights_status', 'approved')
    .eq('permission_status', 'approved');
  let assets: any[];
  if (includedSetIds) {
    const assetQueries: Promise<any[]>[] = [];
    if (setIds.size) {
      assetQueries.push(fetchAllFiltered(
        db,
        'catalog',
        'assets',
        assetColumns,
        (query) => activePublicAssets(query).in('set_id', [...setIds]),
      ));
    }
    if (printingIds.size) {
      assetQueries.push(fetchAllFiltered(
        db,
        'catalog',
        'assets',
        assetColumns,
        (query) => activePublicAssets(query).in('printing_id', [...printingIds]),
      ));
    }
    if (variantIds.size) {
      assetQueries.push(fetchAllFiltered(
        db,
        'catalog',
        'assets',
        assetColumns,
        (query) => activePublicAssets(query).in('variant_id', [...variantIds]),
      ));
    }
    assets = [...new Map((await Promise.all(assetQueries)).flat()
      .map((asset) => [asset.id, asset] as const)).values()];
  } else {
    const allAssets = await fetchAllFiltered(
      db,
      'catalog',
      'assets',
      assetColumns,
      activePublicAssets,
    );
    assets = allAssets.filter((asset) => (
      (asset.set_id && setIds.has(asset.set_id))
      || (asset.printing_id && printingIds.has(asset.printing_id))
      || (asset.variant_id && variantIds.has(asset.variant_id))
    ));
  }

  const identifierColumns = 'id,source_id,source_entity_type,external_id,external_uri,language_code,set_id,printing_id,variant_id,confidence,is_current,deprecated_at';
  let candidateExternalIdentifiers: ExternalIdentifierRow[];
  if (includedSetIds) {
    const identifierQueries: Promise<ExternalIdentifierRow[]>[] = [];
    const activeIdentifiers = (query: any) => query
      .eq('is_current', true)
      .is('deprecated_at', null);
    if (setIds.size) {
      identifierQueries.push(fetchAllFiltered(
        db,
        'ingest',
        'external_identifiers',
        identifierColumns,
        (query) => activeIdentifiers(query).in('set_id', [...setIds]),
      ) as Promise<ExternalIdentifierRow[]>);
    }
    if (printingIds.size) {
      identifierQueries.push(fetchAllFiltered(
        db,
        'ingest',
        'external_identifiers',
        identifierColumns,
        (query) => activeIdentifiers(query).in('printing_id', [...printingIds]),
      ) as Promise<ExternalIdentifierRow[]>);
    }
    if (variantIds.size) {
      identifierQueries.push(fetchAllFiltered(
        db,
        'ingest',
        'external_identifiers',
        identifierColumns,
        (query) => activeIdentifiers(query).in('variant_id', [...variantIds]),
      ) as Promise<ExternalIdentifierRow[]>);
    }
    candidateExternalIdentifiers = [...new Map((await Promise.all(identifierQueries)).flat()
      .map((identifier) => [identifier.id, identifier] as const)).values()];
  } else {
    candidateExternalIdentifiers = await fetchAllFiltered(
      db,
      'ingest',
      'external_identifiers',
      identifierColumns,
      (query) => query.eq('is_current', true).is('deprecated_at', null),
    ) as ExternalIdentifierRow[];
  }
  const externalIdentifiers = candidateExternalIdentifiers.filter((identifier) => (
    identifier.is_current
    && identifier.deprecated_at == null
    && (
      identifier.language_code == null
      || normaliseLanguageCode(identifier.language_code) === input.language
    )
    && (
      (identifier.set_id && setIds.has(identifier.set_id))
      || (identifier.printing_id && printingIds.has(identifier.printing_id))
      || (identifier.variant_id && variantIds.has(identifier.variant_id))
    )
  ));
  const coverageBySet = new Map<string, Record<string, any>>((input.summary.coverageRows ?? [])
    .filter((row: any) => row.language === input.language)
    .map((row: any) => [row.set_id, row]));

  await clearVersionSnapshot(db, input.versionId);
  await insertRowsInChunks(db, 'catalog', 'catalogue_version_sets', sets.map((set) => {
    const coverage = coverageBySet.get(set.id) ?? {};
    return {
      catalogue_version_id: input.versionId,
      language_code: input.language,
      set_id: set.id,
      set_code: set.set_code ?? set.provider_set_code ?? null,
      set_status: coverage.set_status ?? 'Complete',
      checklist_completion_percentage: coverage.checklist_completion_percentage ?? 100,
      image_completion_percentage: coverage.image_completion_percentage ?? 100,
      set_art_completion_percentage: coverage.set_art_completion_percentage ?? 100,
      snapshot_summary: coverage,
    };
  }));
  await insertRowsInChunks(db, 'catalog', 'catalogue_version_printings', printings.map((printing) => ({
    catalogue_version_id: input.versionId,
    language_code: input.language,
    set_id: printing.set_id,
    printing_id: printing.id,
  })));
  await insertRowsInChunks(db, 'catalog', 'catalogue_version_variants', variants.map((variant) => ({
    catalogue_version_id: input.versionId,
    language_code: input.language,
    set_id: variant.set_id,
    printing_id: variant.printing_id,
    variant_id: variant.id,
    canonical_key: variant.canonical_key,
  })));
  await insertRowsInChunks(db, 'catalog', 'catalogue_version_assets', assets.map((asset) => ({
    catalogue_version_id: input.versionId,
    language_code: input.language,
    set_id: asset.set_id ?? null,
    printing_id: asset.printing_id ?? null,
    variant_id: asset.variant_id ?? null,
    asset_id: asset.id,
    asset_type: asset.asset_type,
  })));
  await insertRowsInChunks(db, 'catalog', 'catalogue_version_external_identifiers', externalIdentifiers.map((identifier) => ({
    catalogue_version_id: input.versionId,
    language_code: input.language,
    source_id: identifier.source_id,
    source_entity_type: identifier.source_entity_type,
    external_id: identifier.external_id,
    external_uri: identifier.external_uri ?? null,
    set_id: identifier.set_id ?? null,
    printing_id: identifier.printing_id ?? null,
    variant_id: identifier.variant_id ?? null,
    confidence: identifier.confidence ?? 0,
  })));

  return {
    sets: sets.length,
    printings: printings.length,
    variants: variants.length,
    assets: assets.length,
    externalIdentifiers: externalIdentifiers.length,
  };
}

async function activateCatalogueVersion(db: SupabaseClientLike, input: {
  versionId: string;
  language: SupportedCatalogueLanguageCode;
  version: string;
  controlledStaging?: boolean;
  coverageLimited?: boolean;
}) {
  const catalogClient = (db as any).schema('catalog');
  if (typeof catalogClient.rpc === 'function') {
    const { error } = await catalogClient.rpc('activate_catalogue_version', {
      p_catalogue_version_id: input.versionId,
      p_request_id: input.controlledStaging
        ? `catalogue:publish:controlled-staging:${input.language}:${input.version}`
        : `catalogue:publish:${input.language}:${input.version}`,
      p_reason: input.controlledStaging
        ? `Published controlled staging ${input.language} catalogue ${input.version}`
        : input.coverageLimited
        ? `Published coverage-limited ${input.language} catalogue ${input.version}`
        : `Published ${input.language} catalogue ${input.version}`,
    });
    if (error) throw error;
    return;
  }
  const { error: deprecatedError } = await db.schema('catalog')
    .from('catalogue_versions')
    .update({
      status: 'deprecated',
      deprecated_at: new Date().toISOString(),
      deprecated_reason: `Superseded by ${input.language}:${input.version}`,
      updated_at: new Date().toISOString(),
    })
    .eq('language_code', input.language)
    .eq('status', 'published')
    .is('deprecated_at', null);
  if (deprecatedError) throw deprecatedError;
  const { error: publishError } = await db.schema('catalog')
    .from('catalogue_versions')
    .update({
      status: 'published',
      published_at: new Date().toISOString(),
      deprecated_at: null,
      deprecated_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.versionId);
  if (publishError) throw publishError;
}

async function runPublicationStage<T>(stage: string, operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    const message = error && typeof error === 'object' && typeof (error as Record<string, unknown>).message === 'string'
      ? String((error as Record<string, unknown>).message)
      : String(error);
    if (error && typeof error === 'object') {
      throw {
        ...(error as Record<string, unknown>),
        message: `${stage}: ${message}`,
        publicationStage: stage,
      };
    }
    throw {
      message: `${stage}: ${message}`,
      publicationStage: stage,
    };
  }
}

async function publishMaster(args: Args) {
  assertStagingTarget(args);
  const language = publishLanguage(args);
  const version = cleanText(args.version);
  const plan = buildPublishPlan(args);
  if (!version) {
    return {
      ok: false,
      dryRun: args.dryRun,
      writes: false,
      productionModified: false,
      blockers: ['version_required'],
      plan,
    };
  }
  if (args.setId && !args.controlledStaging) {
    return {
      ok: false,
      dryRun: args.dryRun,
      writes: false,
      productionModified: false,
      blockers: ['publish_set_scope_requires_controlled_staging'],
      plan,
    };
  }
  if (args.controlledStaging && (!args.setId || !version.startsWith('staging-'))) {
    return {
      ok: false,
      dryRun: args.dryRun,
      writes: false,
      productionModified: false,
      blockers: [
        ...(!args.setId ? ['controlled_staging_set_required'] : []),
        ...(!version.startsWith('staging-') ? ['controlled_staging_version_prefix_required'] : []),
      ],
      plan,
    };
  }
  if (args.controlledStaging && args.coverageLimited) {
    return {
      ok: false,
      dryRun: args.dryRun,
      writes: false,
      productionModified: false,
      blockers: ['controlled_staging_and_coverage_limited_are_mutually_exclusive'],
      plan,
    };
  }

  const db = createStagingSupabase(args);
  const reportSummary = args.controlledStaging
    ? await runPublicationStage(
        'build_publication_report',
        () => buildControlledStagingReport(db, args, language, args.setId!),
      )
    : await runPublicationStage(
        'build_publication_report',
        () => buildReports(db, { ...args, languages: [language] }),
      );
  const fullLanguageReadiness = args.controlledStaging
    ? {
        ok: false,
        blockers: ['controlled_staging_snapshot_not_full_language'],
        languageSummary: null,
      }
    : publishReadinessFromSummary(reportSummary, language);
  const coverageLimitedReadiness = args.coverageLimited
    ? coverageLimitedReadinessFromSummary(reportSummary, language)
    : null;
  const controlledReadiness = args.controlledStaging
    ? controlledStagingReadinessFromSummary(reportSummary, language, args.setId)
    : null;
  const readiness = controlledReadiness ?? coverageLimitedReadiness ?? fullLanguageReadiness;
  if (!readiness.ok) {
    return {
      ok: false,
      dryRun: args.dryRun,
      writes: false,
      productionModified: false,
      blockers: readiness.blockers,
      readiness: 'setCoverage' in readiness ? readiness.setCoverage : readiness.languageSummary,
      plan,
    };
  }

  const order = args.controlledStaging
    ? { ok: true, missing: [] as SupportedCatalogueLanguageCode[] }
    : await runPublicationStage(
        'verify_publication_order',
        () => requirePreviousLanguagesPublished(db, language, version),
      );
  if (!order.ok) {
    return {
      ok: false,
      dryRun: args.dryRun,
      writes: false,
      productionModified: false,
      blockers: ['publish_order_violation'],
      missingPreviousLanguages: order.missing,
      plan,
    };
  }

  if (args.dryRun) {
    return {
      ok: true,
      dryRun: true,
      writes: false,
      productionModified: false,
      readiness: 'setCoverage' in readiness ? readiness.setCoverage : readiness.languageSummary,
      acknowledgedPublicationBlockers: args.controlledStaging
        ? fullLanguageReadiness.blockers
        : coverageLimitedReadiness?.acknowledgedProviderGaps ?? [],
      plan,
    };
  }

  const setCoverage = controlledReadiness?.setCoverage ?? null;
  const coverageSummary = args.controlledStaging
    ? {
        controlledStagingSnapshot: true,
        releaseEligible: false,
        scope: {
          language,
          setRef: args.setId,
          setId: setCoverage?.set_id ?? null,
        },
        acknowledgedPublicationBlockers: fullLanguageReadiness.blockers,
        setCoverage,
      }
    : args.coverageLimited
    ? {
        ...fullLanguageReadiness.languageSummary,
        coverageLimitedSnapshot: true,
        releaseEligible: true,
        publicationPolicy: 'measured_provider_coverage',
        acknowledgedPublicationBlockers: coverageLimitedReadiness?.acknowledgedProviderGaps ?? [],
      }
    : {
        ...fullLanguageReadiness.languageSummary,
        coverageLimitedSnapshot: false,
        releaseEligible: true,
        publicationPolicy: 'complete_language',
        acknowledgedPublicationBlockers: [],
      };

  const versionRow = await runPublicationStage('upsert_draft_version', () => upsertDraftCatalogueVersion(db, {
    language,
    version,
    summary: coverageSummary,
    controlledStaging: args.controlledStaging,
    coverageLimited: args.coverageLimited,
  }));
  const snapshot = await runPublicationStage('snapshot_catalogue_membership', () => snapshotPublishedLanguage(db, {
    versionId: versionRow.id,
    language,
    summary: {
      ...reportSummary,
      coverageRows: reportSummary.coverageRows,
    },
    includedSetIds: setCoverage?.set_id ? [setCoverage.set_id] : undefined,
  }));
  await runPublicationStage('activate_catalogue_version', () => activateCatalogueVersion(db, {
    versionId: versionRow.id,
    language,
    version,
    controlledStaging: args.controlledStaging,
    coverageLimited: args.coverageLimited,
  }));

  return {
    ok: true,
    dryRun: false,
    writes: true,
    productionModified: false,
    language,
    version,
    versionKey: publicationVersionKey(language, version),
    catalogueVersionId: versionRow.id,
    snapshot,
    releaseEligible: !args.controlledStaging,
    acknowledgedPublicationBlockers: args.controlledStaging
      ? fullLanguageReadiness.blockers
      : coverageLimitedReadiness?.acknowledgedProviderGaps ?? [],
    plan,
  };
}

async function discoverMaster(args: Args) {
  const plan: any[] = args.assetKind === 'set-art'
    ? buildSetArtPlan(args)
    : buildMasterPlan(args, args.setId ? [args.setId] : []);
  return {
    ok: true,
    dryRun: true,
    writes: false,
    providers: {
      tcgdex: providerSelected(args, 'tcgdex') ? ['en', 'ja', 'zh-tw', 'zh-cn', 'ko'] : [],
      pikaqian: providerSelected(args, 'pikaqian') && (args.pikaqianFile || args.pikaqianApiConfigured) ? ['zh-cn'] : [],
      ximilarResidualScans: providerSelected(args, 'ximilar_residual_scans') && args.ximilarScanFile ? ['ja', 'zh-tw', 'zh-cn', 'ko'] : [],
    },
    rules: [
      'metadata_before_images',
      'dry_run_default',
      'apply_flag_required_for_writes',
      'provider_filter_supported',
      'metadata_only_and_assets_are_separate_modes',
      'pikaqian_assets_require_approved_only',
      'set_art_requires_approved_only_for_apply',
      'set_art_uses_language_and_set_code_folder_identity',
      'no_english_image_on_foreign_printing',
      'no_set_name_only_match',
      'collector_numbers_are_opaque',
      'variants_and_finishes_are_separate',
      'record_conflicts_instead_of_guessing',
      'ximilar_not_bulk_image_source',
    ],
    plan,
  };
}

async function validateMaster(args: Args) {
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (args.target !== 'staging') blockers.push('target_not_staging');
  if (args.metadataOnly && args.assetsOnly) blockers.push('metadata_only_assets_mode_conflict');
  if (args.metadataOnly && args.assetKind === 'set-art') blockers.push('metadata_only_set_art_mode_conflict');
  if (args.assetsOnly && args.provider === 'pikaqian' && !args.approvedOnly) {
    blockers.push('pikaqian_asset_import_requires_approved_only');
  }
  if (args.command === 'apply' && args.assetKind === 'set-art' && args.apply && !args.approvedOnly) {
    blockers.push('set_art_import_requires_approved_only');
  }
  const url = process.env.SUPABASE_URL ?? '';
  if (!url.includes(STAGING_SUPABASE_REF)) blockers.push('staging_supabase_url_not_configured');
  for (const ref of PRODUCTION_SUPABASE_REFS) {
    if (url.includes(ref)) blockers.push('production_supabase_url_configured');
  }
  if (!args.pikaqianFile && !args.pikaqianApiConfigured) warnings.push('pikaqian_api_key_or_gap_file_not_configured');
  if (!args.ximilarScanFile) warnings.push('ximilar_residual_scan_file_not_configured');
  if (args.command === 'publish') {
    if (args.languages.length !== 1) blockers.push('publish_requires_single_language');
    if (!cleanText(args.version)) blockers.push('publish_version_required');
    if (args.setId && !args.controlledStaging) blockers.push('publish_set_scope_requires_controlled_staging');
    if (args.controlledStaging && !args.setId) blockers.push('controlled_staging_set_required');
    if (args.controlledStaging && !cleanText(args.version)?.startsWith('staging-')) {
      blockers.push('controlled_staging_version_prefix_required');
    }
    if (args.controlledStaging && args.coverageLimited) {
      blockers.push('controlled_staging_and_coverage_limited_are_mutually_exclusive');
    }
    return {
      ok: blockers.length === 0,
      dryRunDefault: false,
      productionModified: false,
      blockers,
      warnings,
      plan: args.languages.length === 1 ? [buildPublishPlan(args)] : [],
    };
  }
  const plan: any[] = args.assetKind === 'set-art'
    ? buildSetArtPlan(args)
    : buildMasterPlan(args, args.setId ? [args.setId] : []);
  if (args.provider && plan.length === 0 && !args.assetsOnly && args.assetKind !== 'set-art') {
    blockers.push('selected_provider_has_no_matching_language_stage');
  }
  if (plan.some((stage) => stage.phase === 'images' && stage.provider === 'ximilar_residual_scans')) {
    blockers.push('ximilar_image_stage_forbidden');
  }
  if (plan.some((stage) => stage.phase === 'images' && !stage.allowImageAssets)) {
    blockers.push('image_stage_without_allow_image_assets');
  }
  return {
    ok: blockers.length === 0,
    dryRunDefault: true,
    productionModified: false,
    blockers,
    warnings,
    plan,
  };
}

async function main() {
  const args = parseArgv(process.argv.slice(2));
  let result: unknown;
  if (args.command === 'discover') {
    result = await discoverMaster(args);
  } else if (args.command === 'apply') {
    result = await applyMaster(args);
  } else if (args.command === 'publish') {
    result = await publishMaster(args);
  } else if (args.command === 'validate') {
    result = await validateMaster(args);
  } else {
    const db = createStagingSupabase(args);
    result = await buildReports(db, args);
  }
  console.log(JSON.stringify(result, null, 2));
  if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
    process.exitCode = 1;
  }
}

function serialiseCliError(error: unknown) {
  if (error instanceof Error) {
    const publicationStage = (error as Error & { publicationStage?: unknown }).publicationStage;
    return {
      name: error.name,
      message: error.message,
      publicationStage: typeof publicationStage === 'string' ? publicationStage : null,
    };
  }
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    return {
      message: typeof record.message === 'string' ? record.message : String(error),
      code: record.code ?? null,
      details: record.details ?? null,
      hint: record.hint ?? null,
      status: record.status ?? record.statusCode ?? null,
      publicationStage: record.publicationStage ?? null,
    };
  }
  return {
    message: String(error),
  };
}

if (require.main === module) {
  main().catch((error) => {
    const serialised = serialiseCliError(error);
    console.error(JSON.stringify({
      ok: false,
      error: serialised.message,
      details: serialised,
      productionModified: false,
    }, null, 2));
    process.exit(1);
  });
}

export const masterCatalogueInternals = {
  REPORT_FILES,
  parseArgv,
  reportFiles,
  buildPublishPlan,
  buildMasterPlan,
  buildSetArtPlan,
  buildSetScopedStages,
  deriveProviderSetScopes,
  providerUnavailable,
  discoverSetArtFiles,
  classifyImageLeftovers,
  coveragePercent,
  deriveSetCompletionStatus,
  expectedFromRaw,
  assetRightsAreApproved,
  providerSetRefsByCanonicalSetId,
  LANGUAGE_PUBLISH_ORDER,
  percentComplete,
  previousPublishLanguages,
  publicationVersionKey,
  publishReadinessFromSummary,
  coverageLimitedReadinessFromSummary,
  controlledStagingReadinessFromSummary,
  setArtExpectedPath,
  setArtFolderCode,
  validateMaster,
};
