/**
 * Builds a local-only, hash-bound CJK image candidate queue.  It never calls a
 * provider, downloads artwork, or writes catalogue/storage data.  A candidate
 * means that the pinned TCGdex card listing declared an exact provider image
 * URL for a current missing canonical variant; it is deliberately not a live
 * availability assertion.
 */
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, relative, resolve } from 'node:path';

type Row = Record<string, unknown>;
type Language = 'ja' | 'zh-tw' | 'zh-cn';
type Candidate = {
  canonical_variant_id: string;
  language: Language;
  canonical_set_id: string;
  collector_number: string;
  native_image_status: string;
  provider_card_id: string | null;
  provider_set_id: string | null;
  provider_image_url: string | null;
  disposition: 'candidate_url_declared_in_pinned_provider_snapshot' | 'no_exact_provider_mapping' | 'provider_row_has_no_image_url';
  live_availability_verified: false;
};

const LANGUAGES = new Set<Language>(['ja', 'zh-tw', 'zh-cn']);
const SHA256 = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const IMAGE_URL = /^https:\/\/assets\.tcgdex\.net\/(ja|zh-tw|zh-cn)\/[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+){2,}$/;

function hash(value: string | Buffer) { return createHash('sha256').update(value).digest('hex'); }
function isRow(value: unknown): value is Row { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function text(value: unknown) { return typeof value === 'string' && value.trim() ? value.trim() : null; }
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (isRow(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}
function stableJson(value: unknown) { return `${JSON.stringify(stable(value), null, 2)}\n`; }
function regularFile(path: string, label: string) {
  if (!existsSync(path) || lstatSync(path).isSymbolicLink() || !lstatSync(path).isFile()) throw new Error(`${label} must be a regular file: ${path}`);
  return readFileSync(path);
}
function json(path: string, label: string): Row {
  try {
    const value = JSON.parse(regularFile(path, label).toString('utf8'));
    if (!isRow(value)) throw new Error();
    return value;
  } catch { throw new Error(`${label} must be a JSON object.`); }
}
function verifiedManifestFile(root: string, name: string, label: string) {
  const manifest = json(resolve(root, 'manifest.json'), `${label} manifest`);
  const outputs = isRow(manifest.outputSha256) ? manifest.outputSha256 : null;
  const expected = text(outputs?.[name])?.toLowerCase();
  const path = resolve(root, name);
  if (!expected || !SHA256.test(expected) || hash(regularFile(path, `${label} ${name}`)) !== expected) throw new Error(`${label} ${name} hash mismatch.`);
  return path;
}
function parseJsonl(path: string, label: string): Row[] {
  return regularFile(path, label).toString('utf8').split(/\r?\n/).filter(Boolean).map((line, index) => {
    try { const value = JSON.parse(line); if (isRow(value)) return value; } catch { /* rejected below */ }
    throw new Error(`${label} line ${index + 1} must be a JSON object.`);
  });
}
function providerImage(raw: unknown, language: Language) {
  const value = text(raw);
  if (!value || !IMAGE_URL.test(value) || new URL(value).pathname.split('/')[1] !== language) return null;
  return value;
}

export function buildCurrentCjkProviderImageCoverageAudit(input: {
  canonicalLedgerPath: string;
  providerRowsPath: string;
  providerCardPaths: Record<Language, string>;
}) {
  const missing = new Map<string, { language: Language; setId: string; collectorNumber: string; status: string }>();
  for (const row of parseJsonl(input.canonicalLedgerPath, 'canonical ledger')) {
    const facts = isRow(row.facts) ? row.facts : null;
    const language = text(row.language) as Language | null;
    if (row.entityType !== 'variant_image_state' || row.dimension !== 'card_image_state' || !facts || !language || !LANGUAGES.has(language)) continue;
    if (facts.active !== true || facts.exactNativeCardImage !== false) continue;
    const id = text(row.entityId); const setId = text(facts.setId); const collectorNumber = text(facts.collectorNumber); const status = text(facts.nativeImageStatus);
    if (!id || !UUID.test(id) || !setId || !UUID.test(setId) || !collectorNumber || !status) throw new Error('Current CJK missing-image row is structurally invalid.');
    if (missing.has(id)) throw new Error(`Duplicate current CJK variant image row: ${id}`);
    missing.set(id, { language, setId, collectorNumber, status });
  }
  if (!missing.size) throw new Error('No current missing CJK image rows found.');

  const mappings = new Map<string, { providerId: string; providerSetId: string }>();
  for (const row of parseJsonl(input.providerRowsPath, 'provider reconciliation')) {
    const canonical = isRow(row.canonical) ? row.canonical : null;
    const language = text(row.language) as Language | null;
    if (!canonical || !language || !LANGUAGES.has(language) || row.status !== 'matched_exact' || row.entityType !== 'provider_printing') continue;
    const variantId = text(canonical.variantId); const mappingLanguage = text(canonical.mappingLanguage); const providerId = text(row.providerId); const providerSetId = text(row.providerSetId);
    if (!variantId || !UUID.test(variantId) || mappingLanguage !== language || !providerId || !providerSetId) throw new Error('Exact provider mapping is structurally invalid.');
    if (mappings.has(variantId)) throw new Error(`Duplicate exact provider mapping: ${variantId}`);
    mappings.set(variantId, { providerId, providerSetId });
  }

  const cards = new Map<Language, Map<string, string | null>>();
  for (const language of LANGUAGES) {
    let raw: unknown;
    try { raw = JSON.parse(regularFile(input.providerCardPaths[language], `${language} provider card snapshot`).toString('utf8')); } catch { throw new Error(`${language} provider card snapshot is invalid JSON.`); }
    if (!Array.isArray(raw)) throw new Error(`${language} provider card snapshot must be an array.`);
    const byId = new Map<string, string | null>();
    for (const value of raw) {
      if (!isRow(value)) throw new Error(`${language} provider card row must be an object.`);
      const id = text(value.id); if (!id) throw new Error(`${language} provider card ID is missing.`);
      if (byId.has(id)) throw new Error(`${language} provider card ID is duplicated: ${id}`);
      byId.set(id, providerImage(value.image, language));
    }
    cards.set(language, byId);
  }

  const candidates: Candidate[] = [...missing.entries()].map(([variantId, current]): Candidate => {
    const mapping = mappings.get(variantId);
    const image = mapping ? cards.get(current.language)?.get(mapping.providerId) ?? null : null;
    return {
      canonical_variant_id: variantId, language: current.language, canonical_set_id: current.setId,
      collector_number: current.collectorNumber, native_image_status: current.status,
      provider_card_id: mapping?.providerId ?? null, provider_set_id: mapping?.providerSetId ?? null,
      provider_image_url: image,
      disposition: !mapping ? 'no_exact_provider_mapping' : image ? 'candidate_url_declared_in_pinned_provider_snapshot' : 'provider_row_has_no_image_url',
      live_availability_verified: false,
    };
  }).sort((a, b) => a.language.localeCompare(b.language) || a.canonical_set_id.localeCompare(b.canonical_set_id) || a.collector_number.localeCompare(b.collector_number) || a.canonical_variant_id.localeCompare(b.canonical_variant_id));
  const count = (predicate: (candidate: Candidate) => boolean, language?: Language) => candidates.filter((candidate) => (!language || candidate.language === language) && predicate(candidate)).length;
  const byLanguage = Object.fromEntries([...LANGUAGES].sort().map((language) => [language, {
    missing_exact_native_image: count(() => true, language),
    candidate_url_declared_in_pinned_provider_snapshot: count((candidate) => candidate.disposition === 'candidate_url_declared_in_pinned_provider_snapshot', language),
    no_exact_provider_mapping: count((candidate) => candidate.disposition === 'no_exact_provider_mapping', language),
    provider_row_has_no_image_url: count((candidate) => candidate.disposition === 'provider_row_has_no_image_url', language),
  }]));
  return { candidates, summary: {
    schema_version: 'stackr-current-cjk-provider-image-coverage-audit-v1', local_only: true, network_accessed: false,
    image_bodies_downloaded: false, database_modified: false, storage_modified: false, live_availability_verified: false,
    missing_exact_native_image_count: candidates.length,
    candidate_url_declared_in_pinned_provider_snapshot_count: count((candidate) => candidate.disposition === 'candidate_url_declared_in_pinned_provider_snapshot'),
    no_exact_provider_mapping_count: count((candidate) => candidate.disposition === 'no_exact_provider_mapping'),
    provider_row_has_no_image_url_count: count((candidate) => candidate.disposition === 'provider_row_has_no_image_url'),
    by_language: byLanguage,
  }};
}

function args(argv: string[]) { return new Map(argv.filter((value) => value.startsWith('--') && value.includes('=')).map((value) => { const [key, ...rest] = value.slice(2).split('='); return [key, rest.join('=')]; })); }
function outputPath(output: string) {
  const root = resolve('.tmp/cjk-provider-image-coverage-audit'); const target = resolve(output); const contained = relative(root, target);
  if (!contained || contained.startsWith('..') || isAbsolute(contained) || existsSync(target)) throw new Error('Output must be a new child directory under .tmp/cjk-provider-image-coverage-audit.');
  return { root, target };
}
async function main() {
  const values = args(process.argv.slice(2));
  const evidenceDir = resolve(values.get('evidence-dir') ?? '.tmp/canonical-evidence/current-gap-audit-20260903-v3');
  const providerDir = resolve(values.get('provider-dir') ?? 'reports/catalogue/provider-baseline/2026-08-14');
  const canonicalLedger = verifiedManifestFile(evidenceDir, 'canonical-catalogue-row-evidence.jsonl', 'canonical evidence');
  const providerManifest = json(resolve(providerDir, 'manifest.json'), 'provider baseline manifest');
  const providerFiles = Array.isArray(providerManifest.files) ? providerManifest.files : null;
  if (!providerFiles) throw new Error('Provider baseline manifest.files must be an array.');
  const providerPath = (name: string) => {
    const entry = providerFiles.find((value) => isRow(value) && value.path === name);
    const expected = entry && text(entry.sha256)?.toLowerCase(); const path = resolve(providerDir, name);
    if (!expected || !SHA256.test(expected) || hash(regularFile(path, `provider ${name}`)) !== expected) throw new Error(`Provider baseline ${name} hash mismatch.`);
    return path;
  };
  const result = buildCurrentCjkProviderImageCoverageAudit({
    canonicalLedgerPath: canonicalLedger,
    providerRowsPath: providerPath('provider-baseline-row-reconciliation.jsonl'),
    providerCardPaths: Object.fromEntries([...LANGUAGES].map((language) => [language, providerPath(`raw/${language}.cards.json`)])) as Record<Language, string>,
  });
  const inputSha256 = { canonical_ledger: hash(regularFile(canonicalLedger, 'canonical ledger')), provider_manifest: hash(regularFile(resolve(providerDir, 'manifest.json'), 'provider manifest')), provider_reconciliation: hash(regularFile(providerPath('provider-baseline-row-reconciliation.jsonl'), 'provider reconciliation')), ...Object.fromEntries([...LANGUAGES].map((language) => [`provider_cards_${language}`, hash(regularFile(providerPath(`raw/${language}.cards.json`), `${language} cards`))])) };
  const summary = { ...result.summary, input_sha256: inputSha256 };
  if (values.has('output')) {
    const output = outputPath(values.get('output')!); mkdirSync(output.root, { recursive: true }); mkdirSync(output.target);
    const queue = result.candidates.map((candidate) => JSON.stringify(candidate)).join('\n') + '\n'; const report = stableJson(summary);
    writeFileSync(resolve(output.target, 'cjk-provider-image-candidates.jsonl'), queue, { encoding: 'utf8', flag: 'wx' }); writeFileSync(resolve(output.target, 'cjk-provider-image-coverage-report.json'), report, { encoding: 'utf8', flag: 'wx' });
    writeFileSync(resolve(output.target, 'manifest.json'), stableJson({ schema_version: '1.0.0', local_only: true, network_accessed: false, database_modified: false, storage_modified: false, input_sha256: inputSha256, output_sha256: { 'cjk-provider-image-candidates.jsonl': hash(queue), 'cjk-provider-image-coverage-report.json': hash(report) } }), { encoding: 'utf8', flag: 'wx' });
    process.stdout.write(`${JSON.stringify({ ok: true, ...summary, output: output.target })}\n`); return;
  }
  process.stdout.write(`${JSON.stringify({ ok: true, ...summary, output: null })}\n`);
}
if (require.main === module) main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
