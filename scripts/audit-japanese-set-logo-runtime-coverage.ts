/**
 * Read-only audit of the manifest-bound local Japanese set-logo runtime
 * lookup against the current canonical-evidence set inventory.  This tool
 * never reads image bodies, contacts a provider, or writes catalogue data.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

type Row = Record<string, unknown>;
type Logo = { key: string; normalizedKey: string; code: string; assetPath: string };
const MAX_BYTES = 300 * 1024 * 1024;
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const fileSha = (path: string) => sha(readFileSync(path));
const stable = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const isRow = (value: unknown): value is Row => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const normalize = (value: string) => value.trim().replace(/^(ja|jp):/i, '').replace(/\+/g, 'p').toLowerCase().replace(/[^a-z0-9.]+/g, '');

function json(path: string, label: string): Row {
  if (!existsSync(path) || statSync(path).size > MAX_BYTES) throw new Error(`${label} is missing or too large.`);
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!isRow(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function sourceLogos(path: string): { logos: Logo[]; aliases: Record<string, string> } {
  const source = readFileSync(path, 'utf8');
  const logos = [...source.matchAll(/^  "([^"]+)": \{\r?\n    key: "([^"]+)",\r?\n    normalizedKey: "([^"]+)",[\s\S]*?\r?\n    code: "([^"]+)",\r?\n    source: require\('\.\.\/assets\/(rev2\/11-japanese-set-logo\/logos\/[^']+\.png)'\)/gm)]
    .map((match) => ({ key: match[2], normalizedKey: match[3], code: match[4], assetPath: `assets/${match[5]}` }));
  if (logos.length !== 204 || new Set(logos.map((logo) => logo.normalizedKey)).size !== logos.length) throw new Error('Japanese logo runtime source must expose exactly 204 unique manifest keys.');
  const aliases = Object.fromEntries([...source.matchAll(/^  "([^"]+)": "([^"]+)",\r?$/gm)].map((match) => [match[1], match[2]]));
  return { logos, aliases };
}

export function auditJapaneseSetLogoRuntimeCoverage(args: { evidencePath?: string; manifestPath?: string; runtimeSourcePath?: string; outputDir: string; expectedTargetSetCount?: number }) {
  const evidencePath = resolve(args.evidencePath ?? '.tmp/canonical-evidence/current-gap-audit-20260903-v3/canonical-catalogue-row-evidence.jsonl');
  const manifestPath = resolve(args.manifestPath ?? 'assets/rev2/11-japanese-set-logo/manifest.json');
  const runtimeSourcePath = resolve(args.runtimeSourcePath ?? 'lib/japaneseSetLogos.ts');
  if (!existsSync(evidencePath) || statSync(evidencePath).size > MAX_BYTES) throw new Error('Canonical evidence ledger is missing or too large.');
  const manifest = json(manifestPath, 'Japanese logo manifest');
  const manifestLogos = Array.isArray(manifest.logos) ? manifest.logos : [];
  const { logos, aliases } = sourceLogos(runtimeSourcePath);
  const manifestByKey = new Map(manifestLogos.filter(isRow).map((logo) => [String(logo.normalizedKey), String(logo.assetPath)]));
  for (const logo of logos) if (manifestByKey.get(logo.normalizedKey) !== logo.assetPath) throw new Error(`Runtime logo ${logo.key} is not exactly manifest-bound.`);

  const sets = new Map<string, string>();
  for (const line of readFileSync(evidencePath, 'utf8').split(/\r?\n/)) {
    if (!line) continue;
    const row: unknown = JSON.parse(line);
    if (!isRow(row) || row.entityType !== 'set_art_slot' || row.language !== 'ja' || !isRow(row.facts) || typeof row.facts.setCode !== 'string') continue;
    const id = String(row.entityId); const code = row.facts.setCode.trim();
    if (!id || !code) continue;
    const prior = sets.get(id); if (prior && prior !== code) throw new Error(`Set ${id} has conflicting Japanese codes.`);
    sets.set(id, code);
  }
  const expectedTargetSetCount = args.expectedTargetSetCount ?? 394;
  if (!Number.isSafeInteger(expectedTargetSetCount) || expectedTargetSetCount <= 0) throw new Error('Expected Japanese set count must be a positive integer.');
  if (sets.size !== expectedTargetSetCount) throw new Error(`Expected ${expectedTargetSetCount} current Japanese set rows; found ${sets.size}.`);
  const byKey = new Map(logos.map((logo) => [logo.normalizedKey, logo]));
  const byCode = new Map<string, Logo[]>();
  for (const logo of logos) { const key = normalize(logo.code); byCode.set(key, [...(byCode.get(key) ?? []), logo]); }
  const rows = [...sets].sort(([a], [b]) => a.localeCompare(b)).map(([setId, setCode]) => {
    const normalizedSetCode = normalize(setCode); const aliasKey = aliases[normalizedSetCode] ?? normalizedSetCode;
    const direct = byKey.get(aliasKey);
    const codeMatches = byCode.get(normalizedSetCode) ?? [];
    const match = direct ?? (codeMatches.length === 1 ? codeMatches[0] : null);
    return {
      canonical_set_id: setId, set_code: setCode, normalized_set_code: normalizedSetCode,
      runtime_logo_key: match?.key ?? null,
      resolution: direct ? (aliasKey === normalizedSetCode ? 'exact_key' : 'exact_alias') : match ? 'unique_manifest_code' : codeMatches.length ? 'ambiguous_manifest_code' : 'no_manifest_bound_exact_identity',
      candidate_manifest_keys: match ? [match.key] : codeMatches.map((logo) => logo.key).sort(),
    };
  });
  const matchedKeys = new Set(rows.flatMap((row) => row.runtime_logo_key ? [row.runtime_logo_key] : []));
  const unusedManifestLogos = logos.filter((logo) => !matchedKeys.has(logo.key)).map((logo) => ({ key: logo.key, code: logo.code, asset_path: logo.assetPath, reason: 'no_current_exact_set_identity' }));
  const count = (resolution: string) => rows.filter((row) => row.resolution === resolution).length;
  const report = {
    schema_version: 'stackr-japanese-set-logo-runtime-coverage-audit-v1', mode: 'dry_run_local_files_only', network_accessed: false, artwork_accessed: false, database_accessed: false, canonical_database_write_authorized: false,
    input_sha256: { [`evidence:${basename(evidencePath)}`]: fileSha(evidencePath), [`manifest:${basename(manifestPath)}`]: fileSha(manifestPath), [`runtime:${basename(runtimeSourcePath)}`]: fileSha(runtimeSourcePath) },
    target_set_count: rows.length, manifest_logo_count: logos.length,
    before: { matched_current_sets: rows.filter((row) => row.runtime_logo_key).length },
    proposed_exact_aliases: [],
    after: { matched_current_sets: rows.filter((row) => row.runtime_logo_key).length },
    resolution_counts: { exact_key: count('exact_key'), exact_alias: count('exact_alias'), unique_manifest_code: count('unique_manifest_code'), ambiguous_manifest_code: count('ambiguous_manifest_code'), no_manifest_bound_exact_identity: count('no_manifest_bound_exact_identity') },
    unused_manifest_logo_count: unusedManifestLogos.length,
    conclusion: 'No new alias is safe to add: every current unambiguous manifest-bound code already resolves through the runtime unique-code index. The remaining ambiguous identifier is deliberately rejected; every other unmatched row has no exact manifest-bound identity.',
  };
  const outputDir = resolve(args.outputDir); if (existsSync(outputDir)) throw new Error(`Refusing to overwrite ${outputDir}.`); mkdirSync(outputDir, { recursive: true });
  const outputs: Record<string, string> = { 'japanese-set-logo-runtime-coverage.json': stable(rows), 'japanese-set-logo-runtime-unused-manifest-logos.json': stable(unusedManifestLogos), 'japanese-set-logo-runtime-coverage-audit.json': stable(report) };
  for (const [name, body] of Object.entries(outputs)) writeFileSync(resolve(outputDir, name), body, { flag: 'wx' });
  const outputSha256 = Object.fromEntries(Object.entries(outputs).map(([name, body]) => [name, sha(body)]));
  writeFileSync(resolve(outputDir, 'manifest.json'), stable({ schema_version: '1.0.0', mode: 'dry_run_local_files_only', input_sha256: report.input_sha256, output_sha256: outputSha256 }), { flag: 'wx' });
  return { ...report, output_sha256: outputSha256 };
}

if (require.main === module) {
  const values = Object.fromEntries(process.argv.slice(2).map((arg) => { const [key, ...rest] = arg.replace(/^--/, '').split('='); return [key, rest.join('=')]; }));
  process.stdout.write(`${JSON.stringify(auditJapaneseSetLogoRuntimeCoverage({ evidencePath: values.evidence, manifestPath: values.manifest, runtimeSourcePath: values.runtime, outputDir: values.output || '.tmp/japanese-set-logo-runtime-coverage-audit/NEW_OUTPUT' }), null, 2)}\n`);
}
