/**
 * Binds the reviewed TCGdex Japanese English supplements to an exact,
 * read-only Stackr catalog.sets identity snapshot.  This generator never
 * queries or writes the catalogue: its snapshot input is supplied separately
 * from an authorised read-only export.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TCGDEX_SOURCE_PATH = resolve('catalogue/tcgdex-japanese-set-english-display-source.json');
const IDENTITY_SOURCE_PATH = resolve('catalogue/stackr-japanese-set-identity-source.2026-09-04.json');
const CLIENT_OUTPUT = resolve('lib/generated/stackrJapaneseSetIdentity.generated.ts');
const BACKEND_OUTPUT = resolve('backend/lib/generated/stackrJapaneseSetIdentity.generated.mjs');
const SHA = /^[a-f0-9]{64}$/;

type SnapshotRow = { id: string; set_code: string; native_name: string; updated_at: string };
type Identity = { canonicalSetId: string; setCode: string; normalizedSetCode: string; nativeName: string; normalizedNativeName: string; updatedAt: string };
type IdentitySource = {
  schemaVersion: 'stackr-japanese-set-identity-source-v1';
  retrieval: { mode: 'authorized_read_only_snapshot'; schema: 'catalog'; relation: 'sets'; select: readonly ['id', 'set_code', 'native_name', 'updated_at']; languageCode: 'ja'; retrievedOn: '2026-09-04' };
  policy: { use: 'exact_runtime_identity_binding_only'; nativeNameRemainsPrimary: true; canonicalDatabaseWriteAuthorized: false };
  reviewedTcgdexEnglishSource: { path: 'catalogue/tcgdex-japanese-set-english-display-source.json'; sha256: string };
  entries: Identity[];
  exclusions: Array<{ normalizedSetCode: string; reason: 'missing_first_party_identity' | 'ambiguous_first_party_identity' }>;
};

const stable = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const clean = (value: unknown) => String(value ?? '').trim();
function normalizeSetCode(value: unknown) {
  return clean(value).replace(/^(?:ja|jp):/i, '').replace(/\+/g, 'p').toLowerCase().replace(/[^a-z0-9.]+/g, '');
}
function normalizeNativeName(value: unknown) {
  return String(value ?? '').normalize('NFKC').replace(/\s+/gu, '').trim();
}
function assertSha(value: unknown, label: string) {
  const result = clean(value).toLowerCase();
  if (!SHA.test(result)) throw new Error(`Invalid ${label} SHA-256.`);
  return result;
}

function readReviewedTcgdexSource() {
  const body = readFileSync(TCGDEX_SOURCE_PATH, 'utf8');
  const source = JSON.parse(body) as { schemaVersion?: unknown; entries?: Record<string, unknown> };
  if (source.schemaVersion !== 'stackr-tcgdex-japanese-set-english-display-source-v1') throw new Error('Unexpected reviewed TCGdex English source.');
  const codes = Object.keys(source.entries ?? {}).map(normalizeSetCode);
  if (codes.length < 200 || codes.some((code) => !code)) throw new Error('Reviewed TCGdex English source is invalid.');
  if (new Set(codes).size !== codes.length) throw new Error('Reviewed TCGdex English source has duplicate normalized codes.');
  return { codes: new Set(codes), sha256: sha256(body) };
}

function buildIdentitySource(snapshotPath: string): IdentitySource {
  const reviewed = readReviewedTcgdexSource();
  const rows = JSON.parse(readFileSync(resolve(snapshotPath), 'utf8')) as SnapshotRow[];
  if (!Array.isArray(rows) || rows.length < 300) throw new Error('Japanese first-party identity snapshot is unexpectedly small.');
  const grouped = new Map<string, SnapshotRow[]>();
  for (const row of rows) {
    const id = clean(row.id); const code = normalizeSetCode(row.set_code); const nativeName = clean(row.native_name); const updatedAt = clean(row.updated_at);
    if (!id || !code || !nativeName || !updatedAt) throw new Error('Japanese first-party identity snapshot contains an incomplete row.');
    const list = grouped.get(code) ?? []; list.push({ id, set_code: row.set_code, native_name: nativeName, updated_at: updatedAt }); grouped.set(code, list);
  }
  const entries: Identity[] = [];
  const exclusions: IdentitySource['exclusions'] = [];
  for (const code of [...reviewed.codes].sort()) {
    const matchingRows = grouped.get(code) ?? [];
    const byNativeName = new Map<string, SnapshotRow[]>();
    for (const row of matchingRows) {
      const native = normalizeNativeName(row.native_name);
      const list = byNativeName.get(native) ?? []; list.push(row); byNativeName.set(native, list);
    }
    if (!byNativeName.size) { exclusions.push({ normalizedSetCode: code, reason: 'missing_first_party_identity' }); continue; }
    if (matchingRows.length !== 1 || byNativeName.size !== 1) {
      exclusions.push({ normalizedSetCode: code, reason: 'ambiguous_first_party_identity' });
      continue;
    }
    const row = matchingRows[0];
    const normalizedNativeName = normalizeNativeName(row.native_name);
    entries.push({ canonicalSetId: row.id, setCode: clean(row.set_code), normalizedSetCode: code, nativeName: row.native_name, normalizedNativeName, updatedAt: row.updated_at });
  }
  entries.sort((a, b) => `${a.normalizedSetCode}\u0000${a.normalizedNativeName}`.localeCompare(`${b.normalizedSetCode}\u0000${b.normalizedNativeName}`));
  exclusions.sort((a, b) => `${a.normalizedSetCode}\u0000${a.reason}`.localeCompare(`${b.normalizedSetCode}\u0000${b.reason}`));
  if (entries.length < 200) throw new Error('Japanese first-party identity binding is unexpectedly small.');
  return {
    schemaVersion: 'stackr-japanese-set-identity-source-v1',
    retrieval: { mode: 'authorized_read_only_snapshot', schema: 'catalog', relation: 'sets', select: ['id', 'set_code', 'native_name', 'updated_at'], languageCode: 'ja', retrievedOn: '2026-09-04' },
    policy: { use: 'exact_runtime_identity_binding_only', nativeNameRemainsPrimary: true, canonicalDatabaseWriteAuthorized: false },
    reviewedTcgdexEnglishSource: { path: 'catalogue/tcgdex-japanese-set-english-display-source.json', sha256: reviewed.sha256 },
    entries, exclusions,
  };
}

function readIdentitySource() {
  const body = readFileSync(IDENTITY_SOURCE_PATH, 'utf8'); const source = JSON.parse(body) as IdentitySource;
  const reviewed = readReviewedTcgdexSource();
  if (source.schemaVersion !== 'stackr-japanese-set-identity-source-v1' || source.retrieval?.mode !== 'authorized_read_only_snapshot' || source.retrieval?.schema !== 'catalog' || source.retrieval?.relation !== 'sets' || source.retrieval?.languageCode !== 'ja' || source.policy?.use !== 'exact_runtime_identity_binding_only' || source.policy?.nativeNameRemainsPrimary !== true || source.policy?.canonicalDatabaseWriteAuthorized !== false || source.reviewedTcgdexEnglishSource?.path !== 'catalogue/tcgdex-japanese-set-english-display-source.json' || assertSha(source.reviewedTcgdexEnglishSource?.sha256, 'reviewed TCGdex source') !== reviewed.sha256) throw new Error('Japanese identity source provenance or policy is invalid.');
  const byCode: Record<string, Identity[]> = {};
  const seen = new Set<string>();
  for (const entry of source.entries ?? []) {
    const code = normalizeSetCode(entry.normalizedSetCode); const native = normalizeNativeName(entry.normalizedNativeName);
    if (!code || code !== entry.normalizedSetCode || !native || native !== entry.normalizedNativeName || !reviewed.codes.has(code) || !clean(entry.canonicalSetId) || !clean(entry.nativeName) || !clean(entry.updatedAt)) throw new Error('Japanese identity source contains an invalid binding.');
    const key = `${code}\u0000${native}`; if (seen.has(key)) throw new Error('Japanese identity source has an ambiguous binding.'); seen.add(key);
    (byCode[code] ??= []).push(entry);
  }
  for (const [code, identities] of Object.entries(byCode)) {
    if (identities.length !== 1) throw new Error(`Japanese identity source has more than one binding for ${code}.`);
  }
  const excludedCodes = new Set<string>();
  for (const exclusion of source.exclusions ?? []) {
    const code = normalizeSetCode(exclusion.normalizedSetCode);
    if (!code
      || code !== exclusion.normalizedSetCode
      || !reviewed.codes.has(code)
      || !['missing_first_party_identity', 'ambiguous_first_party_identity'].includes(exclusion.reason)) {
      throw new Error('Japanese identity source contains an invalid exclusion.');
    }
    if (excludedCodes.has(code) || byCode[code]) throw new Error(`Japanese identity source contains an overlapping exclusion for ${code}.`);
    excludedCodes.add(code);
  }
  if (seen.size + excludedCodes.size !== reviewed.codes.size) throw new Error('Japanese identity source does not account for every reviewed code exactly once.');
  if (seen.size < 200) throw new Error('Japanese identity source has too few bindings.');
  return { bodySha256: sha256(body), byCode, source };
}

function render(typeSyntax: string, readonlySyntax: string) {
  const { bodySha256, byCode, source } = readIdentitySource();
  const metadata = { schemaVersion: 'stackr-japanese-set-identity-runtime-lookup-v1', sourcePath: 'catalogue/stackr-japanese-set-identity-source.2026-09-04.json', sourceSha256: bodySha256, reviewedTcgdexEnglishSource: source.reviewedTcgdexEnglishSource, policy: source.policy, language: 'ja', count: Object.values(byCode).flat().length, excluded: source.exclusions.length };
  return [
    '// Generated from a read-only Stackr catalog.sets identity snapshot; never write this data back.',
    `export const STACKR_JAPANESE_SET_IDENTITY_LOOKUP_METADATA = ${stable(metadata).trimEnd()}${readonlySyntax};`,
    `export const STACKR_JAPANESE_SET_IDENTITIES_BY_CODE${typeSyntax} = ${stable(byCode).trimEnd()}${readonlySyntax};`,
    '',
  ].join('\n');
}

export function buildJapaneseSetEnglishIdentityLookup(args: { snapshotPath?: string; check?: boolean } = {}) {
  if (args.snapshotPath) writeFileSync(IDENTITY_SOURCE_PATH, stable(buildIdentitySource(args.snapshotPath)), 'utf8');
  if (!existsSync(IDENTITY_SOURCE_PATH)) throw new Error(`Missing Japanese identity source: ${IDENTITY_SOURCE_PATH}`);
  const client = render(': Record<string, readonly { canonicalSetId: string; setCode: string; normalizedSetCode: string; nativeName: string; normalizedNativeName: string; updatedAt: string }[]>', ' as const');
  const backend = render('', '');
  for (const [path, expected] of [[CLIENT_OUTPUT, client], [BACKEND_OUTPUT, backend]] as const) {
    if (args.check) { if (readFileSync(path, 'utf8') !== expected) throw new Error(`Generated Japanese identity lookup is stale: ${path}`); }
    else writeFileSync(path, expected, 'utf8');
  }
  return readIdentitySource();
}

if (require.main === module) {
  const snapshot = process.argv.find((arg) => arg.startsWith('--snapshot='))?.slice('--snapshot='.length);
  const result = buildJapaneseSetEnglishIdentityLookup({ snapshotPath: snapshot, check: process.argv.includes('--check') });
  process.stdout.write(`${JSON.stringify({ count: Object.values(result.byCode).flat().length, excluded: result.source.exclusions.length, sourceSha256: result.bodySha256 }, null, 2)}\n`);
}
