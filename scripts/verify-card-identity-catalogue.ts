import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  CARD_IDENTITY_EMBEDDING_BINARY_MAGIC,
  parseEmbeddingBinaryHeader,
  type CardIdentityCatalogueManifest,
} from '../lib/cardIdentityCataloguePack';
import type { CardIdentityOnnxManifest } from '../lib/cardIdentityOnnxExport';

const SQLITE_PATH = 'assets/catalogue/card-catalogue.sqlite';
const EMBEDDINGS_PATH = 'assets/catalogue/card-embeddings.bin';
const MANIFEST_PATH = 'assets/catalogue/catalogue-manifest.json';
const MODEL_MANIFEST_PATH = 'assets/models/card_identity/model-manifest.json';

type Command =
  | 'verify-catalogue'
  | 'verify-embedding-count'
  | 'verify-model-compatibility'
  | 'verify-checksums'
  | 'inspect-card-neighbours';

function sha256File(filePath: string) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function getArg(name: string) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function fail(error: string, details?: Record<string, unknown>): never {
  console.error(JSON.stringify({ ok: false, error, ...(details ? { details } : {}) }, null, 2));
  process.exit(1);
}

function pass(payload: Record<string, unknown>) {
  console.log(JSON.stringify({ ok: true, ...payload }, null, 2));
}

function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) fail('catalogue_manifest_missing');
  return readJson<CardIdentityCatalogueManifest>(MANIFEST_PATH);
}

function openDb() {
  if (!existsSync(SQLITE_PATH)) fail('sqlite_catalogue_missing');
  return new DatabaseSync(SQLITE_PATH, { readOnly: true });
}

function scalarNumber(db: InstanceType<typeof DatabaseSync>, sql: string) {
  const row = db.prepare(sql).get() as { value?: number } | undefined;
  return Number(row?.value ?? 0);
}

function verifyCatalogue() {
  const manifest = loadManifest();
  if (!existsSync(EMBEDDINGS_PATH)) fail('embedding_binary_missing');
  const db = openDb();
  const cardCount = scalarNumber(db, 'SELECT COUNT(*) AS value FROM cards');
  const missingCount = scalarNumber(db, "SELECT COUNT(*) AS value FROM cards WHERE embedding_status = 'missing'");
  const undocumentedMissingCount = scalarNumber(
    db,
    "SELECT COUNT(*) AS value FROM cards WHERE embedding_status = 'missing' AND (missing_embedding_reason IS NULL OR missing_embedding_reason = '')"
  );
  db.close();

  if (cardCount !== manifest.canonicalCards.count) {
    fail('catalogue_card_count_mismatch', { cardCount, manifestCount: manifest.canonicalCards.count });
  }
  if (missingCount !== manifest.embeddings.missingCount) {
    fail('missing_embedding_count_mismatch', { missingCount, manifestMissingCount: manifest.embeddings.missingCount });
  }
  if (undocumentedMissingCount > 0) {
    fail('missing_embeddings_without_reason', { undocumentedMissingCount });
  }

  pass({
    command: 'verify-catalogue',
    status: manifest.status,
    cardCount,
    missingCount,
    installable: manifest.approvedForInstall,
  });
}

function verifyEmbeddingCount() {
  const manifest = loadManifest();
  const bytes = readFileSync(EMBEDDINGS_PATH);
  const header = parseEmbeddingBinaryHeader(bytes);
  const db = openDb();
  const readyCount = scalarNumber(db, "SELECT COUNT(*) AS value FROM cards WHERE embedding_status = 'ready'");
  db.close();

  if (header.magic !== CARD_IDENTITY_EMBEDDING_BINARY_MAGIC) {
    fail('embedding_binary_magic_mismatch', { magic: header.magic });
  }
  if (header.embeddingCount !== manifest.embeddings.count || readyCount !== manifest.embeddings.count) {
    fail('embedding_count_mismatch', {
      binaryCount: header.embeddingCount,
      sqliteReadyCount: readyCount,
      manifestCount: manifest.embeddings.count,
    });
  }
  if (header.dimensions !== manifest.embeddings.dimensions) {
    fail('embedding_dimension_mismatch', { binaryDimensions: header.dimensions, manifestDimensions: manifest.embeddings.dimensions });
  }

  pass({
    command: 'verify-embedding-count',
    embeddingCount: manifest.embeddings.count,
    missingCount: manifest.embeddings.missingCount,
    binaryHeader: header,
  });
}

function verifyModelCompatibility() {
  const manifest = loadManifest();
  const modelManifest = readJson<CardIdentityOnnxManifest>(MODEL_MANIFEST_PATH);
  if (manifest.requiredInstalledModelVersion !== modelManifest.modelVersion) {
    fail('model_version_mismatch', {
      requiredInstalledModelVersion: manifest.requiredInstalledModelVersion,
      installedModelVersion: modelManifest.modelVersion,
    });
  }
  pass({
    command: 'verify-model-compatibility',
    compatibleVersion: true,
    installable: manifest.approvedForInstall && modelManifest.status === 'exported',
    safeRejectionReason: manifest.approvedForInstall
      ? null
      : manifest.installRejectionReason ?? 'catalogue_pack_not_approved_for_install',
  });
}

function verifyChecksums() {
  const manifest = loadManifest();
  const sqliteSha256 = sha256File(SQLITE_PATH);
  const embeddingsSha256 = sha256File(EMBEDDINGS_PATH);
  if (sqliteSha256 !== manifest.files.sqlite.sha256) {
    fail('sqlite_checksum_mismatch', { expected: manifest.files.sqlite.sha256, actual: sqliteSha256 });
  }
  if (embeddingsSha256 !== manifest.files.embeddings.sha256) {
    fail('embedding_binary_checksum_mismatch', { expected: manifest.files.embeddings.sha256, actual: embeddingsSha256 });
  }
  pass({
    command: 'verify-checksums',
    sqliteSha256,
    embeddingsSha256,
  });
}

function inspectCardNeighbours() {
  const manifest = loadManifest();
  const cardId = getArg('cardId');
  if (!cardId) fail('card_id_required', { usage: 'npm run inspect-card-neighbours -- --cardId=<card-id>' });
  const db = openDb();
  const card = db.prepare(`
    SELECT canonical_card_id, card_name, set_id, collector_number, embedding_status, missing_embedding_reason
    FROM cards
    WHERE canonical_card_id = ?
  `).get(cardId) as Record<string, unknown> | undefined;
  db.close();
  if (!card) fail('card_not_found', { cardId });

  pass({
    command: 'inspect-card-neighbours',
    card,
    neighbours: [],
    status: manifest.embeddings.count > 0 ? 'ready' : 'blocked_no_embeddings',
    reason: manifest.embeddings.count > 0 ? null : 'No reference embeddings exist in this blocked pack.',
  });
}

const command = (process.argv[2] ?? '') as Command;
switch (command) {
  case 'verify-catalogue':
    verifyCatalogue();
    break;
  case 'verify-embedding-count':
    verifyEmbeddingCount();
    break;
  case 'verify-model-compatibility':
    verifyModelCompatibility();
    break;
  case 'verify-checksums':
    verifyChecksums();
    break;
  case 'inspect-card-neighbours':
    inspectCardNeighbours();
    break;
  default:
    fail('unknown_command', {
      command,
      validCommands: [
        'verify-catalogue',
        'verify-embedding-count',
        'verify-model-compatibility',
        'verify-checksums',
        'inspect-card-neighbours',
      ],
    });
}
