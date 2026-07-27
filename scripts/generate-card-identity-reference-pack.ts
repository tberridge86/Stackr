import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  CARD_IDENTITY_CATALOGUE_GENERATED_AT,
  CARD_IDENTITY_CATALOGUE_PACK_VERSION,
  CARD_IDENTITY_EMBEDDING_DIMENSIONS,
  buildCardIdentityCatalogueManifest,
  createEmptyEmbeddingBinaryHeader,
  type CardIdentityCatalogueCard,
} from '../lib/cardIdentityCataloguePack';
import type { CardIdentityOnnxManifest } from '../lib/cardIdentityOnnxExport';

const OUT_DIR = 'assets/catalogue';
const SQLITE_PATH = path.join(OUT_DIR, 'card-catalogue.sqlite');
const EMBEDDINGS_PATH = path.join(OUT_DIR, 'card-embeddings.bin');
const MANIFEST_PATH = path.join(OUT_DIR, 'catalogue-manifest.json');
const COMPLETE_PACKAGE_PATH = path.join(OUT_DIR, 'complete-package.json');
const DELTA_PACKAGE_PATH = path.join(OUT_DIR, 'delta-package.json');
const SCANNER_PACK_MANIFEST = 'backend/data/scanner-packs/en-clip-base-v1/manifest.json';
const PROVIDER_PROBES = 'tmp/foreign-card-audit/provider-image-probes.json';
const HARD_NEGATIVE_PATH = 'ml/data_manifests/hard-negative-groups.json';
const MODEL_MANIFEST_PATH = 'assets/models/card_identity/model-manifest.json';

type ScannerPackCard = {
  id: string;
  name: string;
  language?: string | null;
  setId?: string | null;
  setName?: string | null;
  number?: string | null;
  printedTotal?: number | null;
  rarity?: string | null;
  imageSmall?: string | null;
};

type SourceImage = {
  sourceImageId: string;
  cardId: string;
  cardName: string;
  setId: string;
  setName: string;
  language: string;
  collectorNumber: string;
  printedTotal: string;
  variant: string;
  sourceUri: string;
  sourceUriKind: 'remote_url';
};

function sha256(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath: string) {
  return sha256(readFileSync(filePath));
}

function stableId(prefix: string, value: string) {
  return `${prefix}_${sha256(value).slice(0, 16)}`;
}

function normalizeName(value?: string | null) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function classifyEra(setId?: string | null) {
  const id = String(setId ?? '').toLowerCase();
  if (/^(base|gym|neo|ecard|ex|np|si)/.test(id)) return 'vintage_wotc_ex';
  if (/^(dp|pl|hgss|col|bw)/.test(id)) return 'mid_era_dp_bw';
  if (/^(xy|sm)/.test(id)) return 'xy_sun_moon';
  if (/^(swsh|cel|pgo|svp|sv)/.test(id)) return 'sword_shield_scarlet_violet';
  if (/^(s|sm|xy|bw|d|m|sv|pokedata)/.test(id)) return 'japanese_or_asian_modern';
  return 'unknown';
}

function classifyVariant(card: Pick<ScannerPackCard, 'rarity' | 'setId' | 'name'>) {
  const text = `${card.rarity ?? ''} ${card.setId ?? ''} ${card.name ?? ''}`.toLowerCase();
  if (/master.?ball/.test(text)) return 'masterball_holo';
  if (/poke.?ball/.test(text)) return 'pokeball_holo';
  if (/promo|^svp|swshp|smp|xyp|basep/.test(text)) return 'promo';
  if (/reverse/.test(text)) return 'reverse_holo';
  if (/first.?edition|1st/.test(text)) return 'first_edition';
  if (/holo/.test(text)) return 'holo';
  if (/illustration|full art|secret|ultra|hyper|rainbow|rare holo v|rare holo gx|rare holo ex/.test(text)) {
    return 'high_rarity_art';
  }
  return 'standard';
}

function cardToSource(card: ScannerPackCard): SourceImage {
  return {
    sourceImageId: stableId('src', `${card.id}:${card.imageSmall ?? ''}`),
    cardId: card.id,
    cardName: card.name,
    setId: card.setId ?? '',
    setName: card.setName ?? card.setId ?? '',
    language: card.language ?? 'en',
    collectorNumber: card.number ?? '',
    printedTotal: card.printedTotal == null ? '' : String(card.printedTotal),
    variant: classifyVariant(card),
    sourceUri: card.imageSmall ?? '',
    sourceUriKind: 'remote_url',
  };
}

function probeToSource(input: {
  provider: string;
  language: string;
  cardId: string;
  name: string;
  setId: string;
  setName?: string | null;
  collectorNumber: string;
  sourceUri: string;
}): SourceImage {
  const normalizedLanguage = input.language === 'zh-tw' ? 'zh-Hant' : input.language;
  return {
    sourceImageId: stableId('src', `${input.provider}:${input.language}:${input.cardId}:${input.sourceUri}`),
    cardId: `${input.provider}:${input.language}:${input.cardId}`,
    cardName: input.name,
    setId: input.setId,
    setName: input.setName ?? input.setId,
    language: normalizedLanguage,
    collectorNumber: input.collectorNumber,
    printedTotal: '',
    variant: classifyVariant({ rarity: '', setId: input.setId, name: input.name }),
    sourceUri: input.sourceUri,
    sourceUriKind: 'remote_url',
  };
}

function readScannerPackCards() {
  const manifest = JSON.parse(readFileSync(SCANNER_PACK_MANIFEST, 'utf8')) as { cards?: ScannerPackCard[] };
  return (manifest.cards ?? []).filter((card) => card.id && card.name && card.imageSmall);
}

function addUniqueSource(sources: SourceImage[], source: SourceImage | null | undefined) {
  if (!source?.sourceUri) return;
  if (sources.some((existing) => existing.sourceImageId === source.sourceImageId || existing.cardId === source.cardId)) {
    return;
  }
  sources.push(source);
}

function cardsByName(cards: ScannerPackCard[], name: string) {
  const normalized = normalizeName(name);
  return cards
    .filter((card) => normalizeName(card.name) === normalized && Boolean(card.imageSmall))
    .sort((a, b) => String(a.setId).localeCompare(String(b.setId)) || String(a.number).localeCompare(String(b.number)));
}

function selectDiverseByName(cards: ScannerPackCard[], name: string, limit: number) {
  const selected: ScannerPackCard[] = [];
  const seenSets = new Set<string>();
  for (const card of cardsByName(cards, name)) {
    const setId = card.setId ?? '';
    if (seenSets.has(setId)) continue;
    selected.push(card);
    seenSets.add(setId);
    if (selected.length >= limit) break;
  }
  return selected;
}

function selectByBucket(cards: ScannerPackCard[], predicate: (card: ScannerPackCard) => boolean, limit: number) {
  const selected: ScannerPackCard[] = [];
  const seenNames = new Set<string>();
  for (const card of cards) {
    if (!predicate(card)) continue;
    const key = normalizeName(card.name);
    if (seenNames.has(key)) continue;
    selected.push(card);
    seenNames.add(key);
    if (selected.length >= limit) break;
  }
  return selected;
}

function loadProviderProbeSources() {
  if (!existsSync(PROVIDER_PROBES)) return [];
  const probes = JSON.parse(readFileSync(PROVIDER_PROBES, 'utf8')) as {
    tcgdex_samples?: any[];
    pokedata_samples?: any[];
  };
  const tcgdex = (probes.tcgdex_samples ?? [])
    .filter((sample) => sample.card_image_base)
    .map((sample) => probeToSource({
      provider: 'tcgdex',
      language: sample.language,
      cardId: sample.card_id,
      name: sample.card_name,
      setId: sample.set_id,
      collectorNumber: sample.collector_number,
      sourceUri: `${sample.card_image_base}/high.webp`,
    }));
  const pokedata = (probes.pokedata_samples ?? [])
    .filter((sample) => sample.entity_type === 'card_image' && sample.requested_url)
    .map((sample) => probeToSource({
      provider: 'pokedata',
      language: sample.language,
      cardId: sample.card_internal_id,
      name: sample.card_internal_id,
      setId: sample.set_id,
      setName: sample.set_name,
      collectorNumber: sample.collector_number,
      sourceUri: sample.requested_url,
    }));
  return [...tcgdex, ...pokedata];
}

function buildPilotSources(cards: ScannerPackCard[]) {
  const sources: SourceImage[] = [];
  const knownIds = [
    'base1-4',
    'base2-4',
    'base1-58',
    'base1-2',
    'base1-10',
    'basep-3',
    'swshp-SWSH020',
    'smp-SM04',
    'xy12-11',
    'xy12-35',
    'sv3pt5-1',
  ];
  const byId = new Map(cards.map((card) => [card.id, card]));
  for (const id of knownIds) addUniqueSource(sources, byId.get(id) ? cardToSource(byId.get(id)!) : null);

  for (const name of ['Charizard', 'Pikachu', 'Mew', 'Mewtwo', 'Eevee', 'Vaporeon', 'Blastoise', 'Gengar']) {
    for (const card of selectDiverseByName(cards, name, 3)) addUniqueSource(sources, cardToSource(card));
  }

  for (const card of selectByBucket(cards, (candidate) => /illustration|full art|secret|ultra|hyper/i.test(candidate.rarity ?? ''), 8)) {
    addUniqueSource(sources, cardToSource(card));
  }
  for (const card of selectByBucket(cards, (candidate) => classifyEra(candidate.setId) === 'mid_era_dp_bw', 4)) {
    addUniqueSource(sources, cardToSource(card));
  }
  for (const card of selectByBucket(cards, (candidate) => classifyEra(candidate.setId) === 'sword_shield_scarlet_violet', 5)) {
    addUniqueSource(sources, cardToSource(card));
  }
  for (const source of loadProviderProbeSources()) addUniqueSource(sources, source);
  return sources;
}

function readModelManifest() {
  return JSON.parse(readFileSync(MODEL_MANIFEST_PATH, 'utf8')) as CardIdentityOnnxManifest;
}

function readDatasetSummary() {
  const payload = JSON.parse(readFileSync(HARD_NEGATIVE_PATH, 'utf8')) as {
    summary?: {
      datasetVersion?: string;
      sourceImageCount?: number;
    };
  };
  return payload.summary ?? {};
}

function toCatalogueCards(sources: SourceImage[], modelManifest: CardIdentityOnnxManifest): CardIdentityCatalogueCard[] {
  const missingReason = modelManifest.status === 'blocked'
    ? 'no_approved_embedding_model'
    : 'embedding_generation_not_implemented';
  return sources
    .slice()
    .sort((a, b) => a.cardId.localeCompare(b.cardId))
    .map((source) => ({
      canonicalCardId: source.cardId,
      sourceImageId: source.sourceImageId,
      cardName: source.cardName,
      setId: source.setId,
      setName: source.setName,
      language: source.language,
      collectorNumber: source.collectorNumber,
      printedTotal: source.printedTotal,
      variant: source.variant,
      sourceUri: source.sourceUri,
      sourceUriSha256: sha256(source.sourceUri),
      imageHashSha256: null,
      embeddingStatus: 'missing' as const,
      missingEmbeddingReason: missingReason,
      embeddingOffsetBytes: null,
      embeddingLengthBytes: 0,
    }));
}

function assertNoApprovedPackOverwrite() {
  if (!existsSync(MANIFEST_PATH)) return;
  const existing = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Record<string, unknown>;
  if (existing.status === 'ready' || existing.approvedForInstall === true) {
    throw new Error('Refusing to overwrite an existing approved catalogue pack.');
  }
}

function writeEmbeddingBinary(filePath: string) {
  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, Buffer.from(createEmptyEmbeddingBinaryHeader()));
  renameSync(tmpPath, filePath);
}

function writeCatalogueSqlite(filePath: string, cards: CardIdentityCatalogueCard[], modelManifest: CardIdentityOnnxManifest) {
  const tmpPath = `${filePath}.tmp`;
  if (existsSync(tmpPath)) rmSync(tmpPath);
  const db = new DatabaseSync(tmpPath);
  db.exec(`
    PRAGMA journal_mode = DELETE;
    PRAGMA synchronous = FULL;
    PRAGMA user_version = 1;
    CREATE TABLE pack_info (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE cards (
      canonical_card_id TEXT PRIMARY KEY,
      source_image_id TEXT NOT NULL,
      card_name TEXT NOT NULL,
      set_id TEXT NOT NULL,
      set_name TEXT NOT NULL,
      language TEXT NOT NULL,
      collector_number TEXT NOT NULL,
      printed_total TEXT NOT NULL,
      variant TEXT NOT NULL,
      source_uri TEXT NOT NULL,
      source_uri_sha256 TEXT NOT NULL,
      image_hash_sha256 TEXT,
      embedding_status TEXT NOT NULL CHECK (embedding_status IN ('ready', 'missing')),
      missing_embedding_reason TEXT,
      embedding_offset_bytes INTEGER,
      embedding_length_bytes INTEGER NOT NULL,
      model_version TEXT NOT NULL
    );
    CREATE INDEX cards_embedding_status_idx ON cards (embedding_status);
    CREATE INDEX cards_set_number_idx ON cards (set_id, collector_number);
  `);
  const insertInfo = db.prepare('INSERT INTO pack_info (key, value) VALUES (?, ?)');
  const insertCard = db.prepare(`
    INSERT INTO cards (
      canonical_card_id,
      source_image_id,
      card_name,
      set_id,
      set_name,
      language,
      collector_number,
      printed_total,
      variant,
      source_uri,
      source_uri_sha256,
      image_hash_sha256,
      embedding_status,
      missing_embedding_reason,
      embedding_offset_bytes,
      embedding_length_bytes,
      model_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  db.exec('BEGIN');
  insertInfo.run('schemaVersion', 'stackr-card-identity-catalogue-sqlite-v1');
  insertInfo.run('packVersion', CARD_IDENTITY_CATALOGUE_PACK_VERSION);
  insertInfo.run('generatedAt', CARD_IDENTITY_CATALOGUE_GENERATED_AT);
  insertInfo.run('modelVersion', modelManifest.modelVersion);
  insertInfo.run('embeddingDimensions', String(CARD_IDENTITY_EMBEDDING_DIMENSIONS));
  for (const card of cards) {
    insertCard.run(
      card.canonicalCardId,
      card.sourceImageId,
      card.cardName,
      card.setId,
      card.setName,
      card.language,
      card.collectorNumber,
      card.printedTotal,
      card.variant,
      card.sourceUri,
      card.sourceUriSha256,
      card.imageHashSha256,
      card.embeddingStatus,
      card.missingEmbeddingReason,
      card.embeddingOffsetBytes,
      card.embeddingLengthBytes,
      modelManifest.modelVersion
    );
  }
  db.exec('COMMIT');
  db.close();
  renameSync(tmpPath, filePath);
}

function writePackageFiles(manifest: ReturnType<typeof buildCardIdentityCatalogueManifest>) {
  writeFileSync(COMPLETE_PACKAGE_PATH, `${JSON.stringify({
    packVersion: manifest.packVersion,
    status: manifest.packages.complete.status,
    files: manifest.packages.complete.files,
    checksums: manifest.files,
    atomicInstallInstructions: manifest.packages.complete.atomicInstallInstructions,
  }, null, 2)}\n`, 'utf8');
  writeFileSync(DELTA_PACKAGE_PATH, `${JSON.stringify({
    packVersion: manifest.packVersion,
    status: manifest.packages.delta.status,
    fromPackVersion: manifest.packages.delta.fromPackVersion,
    files: manifest.packages.delta.files,
    atomicInstallInstructions: manifest.packages.delta.atomicInstallInstructions,
  }, null, 2)}\n`, 'utf8');
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  assertNoApprovedPackOverwrite();

  const modelManifest = readModelManifest();
  const datasetSummary = readDatasetSummary();
  const sources = buildPilotSources(readScannerPackCards());
  const cards = toCatalogueCards(sources, modelManifest);

  writeEmbeddingBinary(EMBEDDINGS_PATH);
  writeCatalogueSqlite(SQLITE_PATH, cards, modelManifest);

  const manifest = buildCardIdentityCatalogueManifest({
    cards,
    modelVersion: modelManifest.modelVersion,
    datasetVersion: datasetSummary.datasetVersion ?? null,
    datasetManifestSha256: modelManifest.sourceModel.datasetManifestSha256,
    expectedPilotSourceImageCount: datasetSummary.sourceImageCount ?? null,
    sqliteSha256: sha256File(SQLITE_PATH),
    sqliteBytes: statSync(SQLITE_PATH).size,
    embeddingsSha256: sha256File(EMBEDDINGS_PATH),
    embeddingsBytes: statSync(EMBEDDINGS_PATH).size,
  });
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  writePackageFiles(manifest);

  console.log(JSON.stringify({
    status: manifest.status,
    packVersion: manifest.packVersion,
    canonicalCards: manifest.canonicalCards.count,
    embeddings: manifest.embeddings.count,
    missingEmbeddings: manifest.embeddings.missingCount,
    everyActivePilotCardDocumented: manifest.canonicalCards.everyActivePilotCardDocumented,
    files: [SQLITE_PATH, EMBEDDINGS_PATH, MANIFEST_PATH, COMPLETE_PACKAGE_PATH, DELTA_PACKAGE_PATH],
  }, null, 2));
}

main();
