/** Builds a hash-checked local baseline from dated provider and canonical evidence snapshots. */
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildFourLanguageCatalogueCoverage, FOUR_CATALOGUE_LANGUAGES } from './audit-four-language-catalogue-coverage';

type Row = Record<string, unknown>;
const SHA = /^[a-f0-9]{64}$/;
function isRow(value: unknown): value is Row { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function text(value: unknown) { return typeof value === 'string' && value.trim() ? value.trim() : null; }
function sha(value: Buffer | string) { return createHash('sha256').update(value).digest('hex'); }
function regular(path: string, label: string) { if (!existsSync(path) || lstatSync(path).isSymbolicLink() || !lstatSync(path).isFile()) throw new Error(`${label} must be a regular file.`); return readFileSync(path); }
function json(path: string, label: string): unknown { try { return JSON.parse(regular(path, label).toString('utf8')); } catch { throw new Error(`${label} is invalid JSON.`); } }
function stable(value: unknown): unknown { if (Array.isArray(value)) return value.map(stable); if (isRow(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])); return value; }
function stableJson(value: unknown) { return `${JSON.stringify(stable(value), null, 2)}\n`; }
function language(value: unknown) { const code = String(value ?? '').trim().toLowerCase().replace(/_/g, '-'); return FOUR_CATALOGUE_LANGUAGES.includes(code as any) ? code : null; }
function args() { return new Map(process.argv.slice(2).filter((arg) => arg.startsWith('--') && arg.includes('=')).map((arg) => { const [key, ...rest] = arg.slice(2).split('='); return [key, rest.join('=')]; })); }

function manifestFile(root: string, manifest: Row, relativePath: string) {
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  const entry = files.find((value) => isRow(value) && value.path === relativePath) as Row | undefined;
  const expected = text(entry?.sha256)?.toLowerCase(); const path = resolve(root, relativePath);
  if (!expected || !SHA.test(expected) || sha(regular(path, relativePath)) !== expected) throw new Error(`Provider baseline hash mismatch: ${relativePath}`);
  return path;
}

export function collectFourLanguageCoverageBaseline(input: { providerRoot: string; evidenceRoot: string; generatedAt?: string }) {
  const providerManifestPath = resolve(input.providerRoot, 'manifest.json'); const providerManifest = json(providerManifestPath, 'provider manifest');
  if (!isRow(providerManifest)) throw new Error('Provider manifest must be an object.');
  const evidenceManifestPath = resolve(input.evidenceRoot, 'manifest.json'); const evidenceManifest = json(evidenceManifestPath, 'canonical evidence manifest');
  if (!isRow(evidenceManifest) || !isRow(evidenceManifest.outputSha256)) throw new Error('Canonical evidence manifest is incomplete.');
  const ledgerPath = resolve(input.evidenceRoot, 'canonical-catalogue-row-evidence.jsonl');
  const expectedLedger = text(evidenceManifest.outputSha256['canonical-catalogue-row-evidence.jsonl'])?.toLowerCase();
  if (!expectedLedger || !SHA.test(expectedLedger) || sha(regular(ledgerPath, 'canonical evidence ledger')) !== expectedLedger) throw new Error('Canonical evidence ledger hash mismatch.');
  const reconciliationPath = manifestFile(input.providerRoot, providerManifest, 'provider-baseline-row-reconciliation.jsonl');
  const providerSets: Row[] = []; const inputs: Record<string, string> = { provider_manifest: sha(regular(providerManifestPath, 'provider manifest')), provider_reconciliation: sha(regular(reconciliationPath, 'reconciliation')), canonical_evidence_manifest: sha(regular(evidenceManifestPath, 'evidence manifest')), canonical_evidence_ledger: sha(regular(ledgerPath, 'evidence ledger')) };
  const rawSets = new Map<string, Row>();
  for (const code of FOUR_CATALOGUE_LANGUAGES) {
    const path = manifestFile(input.providerRoot, providerManifest, `raw/${code}.sets.json`); inputs[`provider_${code}_sets`] = sha(regular(path, `${code} sets`));
    const rows = json(path, `${code} sets`); if (!Array.isArray(rows) || !rows.every(isRow)) throw new Error(`${code} provider sets must be an array.`);
    for (const row of rows) { const setId = text(row.id); if (!setId) throw new Error(`${code} provider set has no id.`); rawSets.set(`${code}:${setId.toLowerCase()}`, row); }
  }
  const exactMappings = new Map<string, string>(); const ambiguous = new Set<string>();
  for (const line of regular(reconciliationPath, 'reconciliation').toString('utf8').split(/\r?\n/)) {
    if (!line) continue; const row = JSON.parse(line); if (!isRow(row) || row.entityType !== 'provider_set') continue;
    const code = language(row.language); const providerId = text(row.providerSetId) ?? text(row.providerId); const canonical = isRow(row.canonical) ? text(row.canonical.setId) : null;
    if (!code || !providerId || row.status !== 'matched_exact' || !canonical) continue;
    const mapKey = `${code}:${providerId.toLowerCase()}`; const prior = exactMappings.get(mapKey);
    if (prior && prior !== canonical) ambiguous.add(mapKey); else exactMappings.set(mapKey, canonical);
  }
  const resolution: Row[] = [];
  for (const [providerKey, raw] of rawSets) {
    const [code, ...parts] = providerKey.split(':'); const providerSetId = parts.join(':'); const canonicalSetId = ambiguous.has(providerKey) ? null : exactMappings.get(providerKey) ?? null;
    resolution.push({ language: code, providerSetId, canonicalSetId, status: ambiguous.has(providerKey) ? 'ambiguous_exact_mapping' : canonicalSetId ? 'matched_exact' : 'unrepresented_or_unmatched', providerDeclaredCardCount: isRow(raw.cardCount) ? raw.cardCount.total ?? raw.cardCount.official ?? null : null });
    providerSets.push({ id: canonicalSetId ?? `provider:${providerSetId}`, language: code, name: raw.name, cardCount: raw.cardCount, logoUrl: raw.logo, symbolUrl: raw.symbol });
  }
  const observed = new Map<string, { language: string; id: string; variants: number }>();
  for (const line of regular(ledgerPath, 'canonical evidence ledger').toString('utf8').split(/\r?\n/)) {
    if (!line) continue; const row = JSON.parse(line); if (!isRow(row)) continue; const code = language(row.language); const facts = isRow(row.facts) ? row.facts : null; const setId = facts && text(facts.setId);
    if (!code || !setId) continue; const key = `${code}:${setId.toLowerCase()}`; const current = observed.get(key) ?? { language: code, id: setId, variants: 0 };
    if (row.entityType === 'variant_identity') current.variants += 1;
    observed.set(key, current);
  }
  const report = buildFourLanguageCatalogueCoverage({
    // The evidence ledger identifies variants, not provider-card rows. Keeping
    // variants separate prevents a false card-completeness subtraction.
    catalogue: { sets: [...observed.values()].map((row) => ({ id: row.id, language: row.language, observedCardCount: null, observedVariantCount: row.variants, metadataEvidence: 'partial_evidence' })), cards: [] },
    provider: { sets: providerSets, cards: [] }, inputSha256: inputs, generatedAt: input.generatedAt,
  });
  return { ...report, baseline: { providerSnapshotGeneratedAt: providerManifest.generatedAt ?? null, canonicalEvidenceObservedAt: evidenceManifest.observedAt ?? null, productionModified: false, providerSnapshotScope: 'Dated provider snapshot only; it is not a claim of all historical or current releases.', canonicalEvidenceScope: 'Current canonical evidence provides set/variant identity aggregates; card counts, field-level card metadata, and image delivery remain unknown in this baseline.', providerSetResolution: resolution.sort((a, b) => `${a.language}:${a.providerSetId}`.localeCompare(`${b.language}:${b.providerSetId}`)) } };
}

function main() {
  const values = args(); const providerRoot = resolve(values.get('provider-root') ?? 'D:/Stackr-1/reports/catalogue/provider-baseline/2026-08-14'); const evidenceRoot = resolve(values.get('evidence-root') ?? 'D:/Stackr-1/.tmp/canonical-evidence/current-gap-audit-20260903-v3'); const output = resolve(values.get('output') ?? 'D:/Stackr-1/.tmp/four-language-coverage/20260905-baseline/report.json');
  if (existsSync(output)) throw new Error('Refusing to overwrite baseline report.'); const report = collectFourLanguageCoverageBaseline({ providerRoot, evidenceRoot }); mkdirSync(resolve(output, '..'), { recursive: true }); writeFileSync(output, stableJson(report), { flag: 'wx' }); process.stdout.write(`${JSON.stringify({ ok: true, output, providerSets: report.baseline.providerSetResolution.length, unresolvedOrAmbiguous: report.baseline.providerSetResolution.filter((row) => row.status !== 'matched_exact').length })}\n`);
}
if (require.main === module) { try { main(); } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; } }
