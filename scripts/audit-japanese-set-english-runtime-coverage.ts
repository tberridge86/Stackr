/**
 * Audits the current Japanese set-English repair queue against the exact
 * client runtime lookup. This is a local, read-only coverage report: it does
 * not assert that any display supplement may be persisted to the catalogue.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import {
  TCGDEX_JAPANESE_SET_ENGLISH_LOOKUP_METADATA,
  TCGDEX_JAPANESE_SET_ENGLISH_NAMES,
} from '../lib/generated/tcgdexJapaneseSetEnglishNames.generated';
import {
  STACKR_JAPANESE_SET_IDENTITIES_BY_CODE,
  STACKR_JAPANESE_SET_IDENTITY_LOOKUP_METADATA,
} from '../lib/generated/stackrJapaneseSetIdentity.generated';
import {
  JAPANESE_SET_DISPLAY_DRAFT_LOOKUP_METADATA,
  JAPANESE_SET_DISPLAY_DRAFTS_BY_CODE,
} from '../lib/generated/japaneseSetDisplayDrafts.generated';
import { getEnglishSetDisplayName, getEnglishSetDisplaySupplement } from '../lib/pokemonDisplayNames';

type Row = Record<string, unknown>;
type Coverage = 'manual_runtime_map' | 'pinned_tcgdex_runtime_map' | 'reviewed_display_translation_draft' | 'unresolved';

const SHA = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const MAX_BYTES = 300 * 1024 * 1024;
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const fileSha = (path: string) => sha(readFileSync(path));
const isRow = (value: unknown): value is Row => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
  return value.trim();
};
const stable = (value: unknown): string => {
  const normalise = (item: unknown): unknown => Array.isArray(item) ? item.map(normalise)
    : isRow(item) ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, normalise(item[key])])) : item;
  return `${JSON.stringify(normalise(value), null, 2)}\n`;
};
function json(path: string, label: string): Row {
  if (!existsSync(path) || statSync(path).size > MAX_BYTES) throw new Error(`${label} is missing or too large.`);
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!isRow(parsed)) throw new Error(`${label} must be a JSON object.`);
  return parsed;
}
function csv(path: string): Row[] {
  const lines = readFileSync(path, 'utf8').replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  const headers = lines.shift()?.split(',') ?? [];
  if (!headers.length || new Set(headers).size !== headers.length) throw new Error('Set-English queue has an invalid CSV header.');
  return lines.filter(Boolean).map((line, index) => {
    const values = line.split(',');
    if (values.length !== headers.length) throw new Error(`Set-English queue row ${index + 2} is malformed.`);
    return Object.fromEntries(headers.map((header, i) => [header, values[i]]));
  });
}
function normalizeSetKey(value: string): string {
  return value.trim()
    .replace(/^(ja|jp|zh-cn|zh_cn|zhcn|zh-hans|zh-tw|zh_tw|zhtw|zh-hant|zh):/i, '')
    .replace(/\+/g, 'p')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '');
}
function objectBody(source: string, constant: string): string {
  const start = source.indexOf(`const ${constant}`);
  if (start < 0) throw new Error(`${constant} is absent from the runtime source.`);
  const open = source.indexOf('{', start);
  let depth = 0; let quote = ''; let escaped = false;
  for (let i = open; i < source.length; i += 1) {
    const char = source[i];
    if (quote) { if (!escaped && char === quote) quote = ''; escaped = !escaped && char === '\\'; if (char !== '\\') escaped = false; continue; }
    if (char === "'" || char === '"') { quote = char; continue; }
    if (char === '{') depth += 1;
    if (char === '}' && --depth === 0) return source.slice(open + 1, i);
  }
  throw new Error(`${constant} object literal is unterminated.`);
}
function manualRuntimeMap(path: string): Map<string, string> {
  const body = objectBody(readFileSync(path, 'utf8'), 'JAPANESE_SET_ENGLISH_NAMES_BY_ID');
  const map = new Map<string, string>();
  const matcher = /^\s*(?:'([^']+)'|([A-Za-z0-9_.-]+))\s*:\s*(?:'([^']+)'|"([^"]+)")\s*,?\s*$/gm;
  for (const match of body.matchAll(matcher)) {
    const key = normalizeSetKey(match[1] ?? match[2] ?? ''); const value = (match[3] ?? match[4] ?? '').trim();
    if (!key || !value) throw new Error('Manual Japanese set runtime map has an invalid entry.');
    map.set(key, value);
  }
  if (!map.size) throw new Error('Manual Japanese set runtime map yielded no entries.');
  return map;
}

export function auditJapaneseSetEnglishRuntimeCoverage(args: {
  planDir: string;
  evidenceDir: string;
  runtimeSourcePath: string;
  tcgdexGeneratedPath?: string;
  tcgdexBackendGeneratedPath?: string;
  displayDraftGeneratedPath?: string;
  displayDraftBackendGeneratedPath?: string;
  identityGeneratedPath?: string;
  identityBackendGeneratedPath?: string;
  identitySourcePath?: string;
  rightsReviewPath?: string;
  outputDir: string;
}) {
  const planDir = resolve(args.planDir); const evidenceDir = resolve(args.evidenceDir); const runtimeSourcePath = resolve(args.runtimeSourcePath);
  const tcgdexGeneratedPath = resolve(args.tcgdexGeneratedPath ?? 'lib/generated/tcgdexJapaneseSetEnglishNames.generated.ts');
  const tcgdexBackendGeneratedPath = resolve(args.tcgdexBackendGeneratedPath ?? 'backend/lib/generated/tcgdexJapaneseSetEnglishNames.generated.mjs');
  const displayDraftGeneratedPath = resolve(args.displayDraftGeneratedPath ?? 'lib/generated/japaneseSetDisplayDrafts.generated.ts');
  const displayDraftBackendGeneratedPath = resolve(args.displayDraftBackendGeneratedPath ?? 'backend/lib/generated/japaneseSetDisplayDrafts.generated.mjs');
  const identityGeneratedPath = resolve(args.identityGeneratedPath ?? 'lib/generated/stackrJapaneseSetIdentity.generated.ts');
  const identityBackendGeneratedPath = resolve(args.identityBackendGeneratedPath ?? 'backend/lib/generated/stackrJapaneseSetIdentity.generated.mjs');
  const identitySourcePath = resolve(args.identitySourcePath ?? STACKR_JAPANESE_SET_IDENTITY_LOOKUP_METADATA.sourcePath);
  const rightsReviewPath = resolve(args.rightsReviewPath ?? 'catalogue/rights-reviews/cjk-editorial-set-translation-owner-approved.2026-09-04.json');
  const rightsReview = json(rightsReviewPath, 'CJK display metadata rights review');
  if (rightsReview.status !== 'approved_active_runtime_only' || rightsReview.activationAuthorized !== true) throw new Error('Expected the owner-approved, runtime-only CJK editorial metadata review.');
  const reviewLanes = Array.isArray(rightsReview.lanes) ? rightsReview.lanes : [];
  if (!reviewLanes.length || reviewLanes.some((lane) => !isRow(lane) || lane.activationAuthorized !== true || lane.status !== 'approved_active_runtime_only')) throw new Error('Every lane in the selected editorial review must be explicitly approved for runtime-only display.');
  if (fileSha(identitySourcePath) !== STACKR_JAPANESE_SET_IDENTITY_LOOKUP_METADATA.sourceSha256) throw new Error('Japanese Stackr identity source hash changed.');
  const planPath = resolve(planDir, 'canonical-metadata-repair-plan.json'); const manifestPath = resolve(planDir, 'manifest.json');
  const plan = json(planPath, 'metadata plan'); const manifest = json(manifestPath, 'plan manifest');
  if (plan.databaseWriteAuthorized !== false || plan.productionModified !== false || manifest.sideEffects !== 'local_report_files_only' || manifest.productionModified !== false) throw new Error('Expected a local-only, write-disabled metadata plan.');
  const hashes = isRow(manifest.outputSha256) ? manifest.outputSha256 : null;
  const queues = isRow(plan.outputFiles) && isRow(plan.outputFiles.queues) ? plan.outputFiles.queues : null;
  const queueName = text(queues?.set_english_display_name, 'set English queue name'); const queuePath = resolve(planDir, queueName);
  for (const [name, path] of [['canonical-metadata-repair-plan.json', planPath], [basename(queuePath), queuePath]] as const) {
    const expected = text(hashes?.[name], `plan manifest ${name}`).toLowerCase();
    if (!SHA.test(expected) || expected !== fileSha(path)) throw new Error(`Plan hash mismatch for ${name}.`);
  }
  const targetIds = new Set<string>();
  for (const row of csv(queuePath)) {
    if (row.target_entity_type !== 'set' || row.canonical_column !== 'english_display_name' || row.language !== 'ja') continue;
    const id = text(row.target_entity_id, 'Japanese set target ID'); if (!UUID.test(id)) throw new Error(`Invalid Japanese set target ID: ${id}`);
    targetIds.add(id);
  }
  const evidenceManifestPath = resolve(evidenceDir, 'manifest.json'); const ledgerPath = resolve(evidenceDir, 'canonical-catalogue-row-evidence.jsonl'); const evidenceManifest = json(evidenceManifestPath, 'evidence manifest');
  const expectedLedger = text((isRow(evidenceManifest.outputSha256) ? evidenceManifest.outputSha256 : null)?.['canonical-catalogue-row-evidence.jsonl'], 'evidence ledger hash').toLowerCase();
  if (!SHA.test(expectedLedger) || expectedLedger !== fileSha(ledgerPath)) throw new Error('Evidence ledger hash mismatch.');
  const codes = new Map<string, string>();
  for (const line of readFileSync(ledgerPath, 'utf8').split(/\r?\n/)) {
    if (!line) continue;
    const item: unknown = JSON.parse(line); if (!isRow(item) || item.entityType !== 'set_art_slot' || item.language !== 'ja' || !targetIds.has(String(item.entityId))) continue;
    const facts = isRow(item.facts) ? item.facts : null; const code = typeof facts?.setCode === 'string' ? facts.setCode.trim() : '';
    if (!code) continue;
    const previous = codes.get(String(item.entityId)); if (previous && previous !== code) throw new Error(`Ambiguous set code for ${item.entityId}.`);
    codes.set(String(item.entityId), code);
  }
  const manual = manualRuntimeMap(runtimeSourcePath);
  const pinned = new Map(Object.entries(TCGDEX_JAPANESE_SET_ENGLISH_NAMES).map(([key, value]) => [normalizeSetKey(key), value]));
  const displayDrafts = new Map(Object.entries(JAPANESE_SET_DISPLAY_DRAFTS_BY_CODE).map(([key, value]) => [normalizeSetKey(key), value]));
  const rows = [...targetIds].sort().map((id) => {
    const setCode = codes.get(id) ?? null; const normalizedSetCode = setCode ? normalizeSetKey(setCode) : null;
    // Select an exact read-only first-party identity only to exercise the
    // runtime display gate; this audit neither mutates nor exports it.
    const draft = normalizedSetCode ? displayDrafts.get(normalizedSetCode) : null;
    const identities = normalizedSetCode ? STACKR_JAPANESE_SET_IDENTITIES_BY_CODE[normalizedSetCode] ?? [] : [];
    const identity = identities.length === 1 ? identities[0] : null;
    let coverage: Coverage = 'unresolved';
    if (normalizedSetCode && manual.has(normalizedSetCode)) coverage = 'manual_runtime_map';
    else if (normalizedSetCode
      && pinned.has(normalizedSetCode)
      && identity
      && TCGDEX_JAPANESE_SET_ENGLISH_LOOKUP_METADATA.rightsGate.activationAuthorized === true
      && TCGDEX_JAPANESE_SET_ENGLISH_LOOKUP_METADATA.rightsGate.publicRuntimeImportAuthorized === true) coverage = 'pinned_tcgdex_runtime_map';
    else if (draft
      && JAPANESE_SET_DISPLAY_DRAFT_LOOKUP_METADATA.rightsGate.activationAuthorized === true
      && JAPANESE_SET_DISPLAY_DRAFT_LOOKUP_METADATA.rightsGate.publicRuntimeImportAuthorized === true) coverage = 'reviewed_display_translation_draft';
    const localName = coverage === 'pinned_tcgdex_runtime_map'
      ? identity?.nativeName
      : coverage === 'reviewed_display_translation_draft'
        ? draft?.nativeName
        : identity?.nativeName ?? draft?.nativeName ?? '確認用セット';
    const displayInput = setCode ? { language: 'ja', setCode, localName } : null;
    const englishDisplayName = displayInput ? getEnglishSetDisplayName(displayInput) : null;
    const displaySupplement = displayInput ? getEnglishSetDisplaySupplement(displayInput) : null;
    const quarantinedReviewCandidateSources: string[] = [];
    if (coverage === 'unresolved' && (englishDisplayName || displaySupplement)) throw new Error(`Unclassified Japanese runtime result for ${id}.`);
    if (coverage === 'manual_runtime_map' && !englishDisplayName) throw new Error(`Mapped Japanese set code did not resolve at runtime: ${setCode}.`);
    if (coverage === 'pinned_tcgdex_runtime_map'
      && (englishDisplayName || displaySupplement?.status !== 'provider_metadata_english_supplement')) {
      throw new Error(`Pinned TCGdex set code did not resolve only as a provider supplement: ${setCode}.`);
    }
    if (coverage === 'reviewed_display_translation_draft'
      && (englishDisplayName || displaySupplement?.status !== 'model_translation_draft' || displaySupplement.value !== draft?.englishTranslation)) {
      throw new Error(`Reviewed editorial set code did not resolve only as a labelled translation supplement: ${setCode}.`);
    }
    return {
      canonical_set_id: id,
      language_code: 'ja',
      set_code: setCode,
      normalized_set_code: normalizedSetCode,
      runtime_english_display_name: englishDisplayName,
      runtime_display_supplement: displaySupplement?.value ?? null,
      runtime_display_supplement_status: displaySupplement?.status ?? null,
      quarantined_review_candidate_sources: quarantinedReviewCandidateSources,
      coverage,
    };
  });
  const count = (coverage: Coverage) => rows.filter((row) => row.coverage === coverage).length;
  const inputs = { 'plan-manifest:manifest.json': fileSha(manifestPath), 'plan:canonical-metadata-repair-plan.json': fileSha(planPath), [`plan-queue:${basename(queuePath)}`]: fileSha(queuePath), 'evidence-manifest:manifest.json': fileSha(evidenceManifestPath), 'evidence-ledger:canonical-catalogue-row-evidence.jsonl': fileSha(ledgerPath), [`runtime-source:${basename(runtimeSourcePath)}`]: fileSha(runtimeSourcePath), [`runtime-generated-client:${basename(tcgdexGeneratedPath)}`]: fileSha(tcgdexGeneratedPath), [`runtime-generated-backend:${basename(tcgdexBackendGeneratedPath)}`]: fileSha(tcgdexBackendGeneratedPath), [`editorial-generated-client:${basename(displayDraftGeneratedPath)}`]: fileSha(displayDraftGeneratedPath), [`editorial-generated-backend:${basename(displayDraftBackendGeneratedPath)}`]: fileSha(displayDraftBackendGeneratedPath), [`identity-generated-client:${basename(identityGeneratedPath)}`]: fileSha(identityGeneratedPath), [`identity-generated-backend:${basename(identityBackendGeneratedPath)}`]: fileSha(identityBackendGeneratedPath), [`identity-source:${basename(identitySourcePath)}`]: fileSha(identitySourcePath), [`rights-review:${basename(rightsReviewPath)}`]: fileSha(rightsReviewPath) };
  const report = { schema_version: 'stackr-japanese-set-english-runtime-coverage-audit-v5', mode: 'dry_run_local_files_only', write_authorized: false, activation_authorized: true, canonical_database_write_authorized: false, artwork_accessed: false, network_accessed: false, database_accessed: false, input_sha256: inputs, target_count: rows.length, coverage_counts: { manual_runtime_map: count('manual_runtime_map'), pinned_tcgdex_runtime_map: count('pinned_tcgdex_runtime_map'), reviewed_display_translation_draft: count('reviewed_display_translation_draft'), unresolved: count('unresolved') }, quarantined_review_candidate_counts: { pinned_tcgdex_runtime_map: rows.filter((row) => row.quarantined_review_candidate_sources.includes('pinned_tcgdex_runtime_map')).length, reviewed_display_translation_draft: rows.filter((row) => row.quarantined_review_candidate_sources.includes('reviewed_display_translation_draft')).length }, unresolved_with_no_set_code: rows.filter((row) => !row.set_code).length, note: 'Runtime display coverage only. Hash-bound TCGdex metadata and the exact owner-approved editorial Japanese candidates are active as native-primary, non-authoritative English supplements. Canonical database writes remain disabled; Wikidata and automated pokemon-card.com collection remain outside this lane.' };
  const outputDir = resolve(args.outputDir); if (existsSync(outputDir)) throw new Error(`Refusing to overwrite existing output directory: ${outputDir}`); mkdirSync(outputDir, { recursive: true });
  const rowsBody = stable(rows); const reportBody = stable(report); writeFileSync(resolve(outputDir, 'japanese-set-english-runtime-coverage.json'), rowsBody, { flag: 'wx' }); writeFileSync(resolve(outputDir, 'japanese-set-english-runtime-coverage-audit.json'), reportBody, { flag: 'wx' });
  const outputSha256 = { 'japanese-set-english-runtime-coverage.json': sha(rowsBody), 'japanese-set-english-runtime-coverage-audit.json': sha(reportBody) };
  writeFileSync(resolve(outputDir, 'manifest.json'), stable({ schema_version: '1.0.0', mode: 'dry_run_local_files_only', input_sha256: inputs, output_sha256: outputSha256 }), { flag: 'wx' });
  return { ...report, output_sha256: outputSha256 };
}

if (require.main === module) {
  const values = Object.fromEntries(process.argv.slice(2).map((arg) => { const [key, ...rest] = arg.replace(/^--/, '').split('='); return [key, rest.join('=')]; }));
  process.stdout.write(`${JSON.stringify(auditJapaneseSetEnglishRuntimeCoverage({ planDir: values['plan-dir'] || '.tmp/canonical-metadata-repair-plan/current-gap-audit-20260903-v3', evidenceDir: values['evidence-dir'] || '.tmp/canonical-evidence/current-gap-audit-20260903-v3', runtimeSourcePath: values['runtime-source'] || 'lib/pokemonDisplayNames.ts', tcgdexGeneratedPath: values['tcgdex-generated'], tcgdexBackendGeneratedPath: values['tcgdex-backend-generated'], displayDraftGeneratedPath: values['display-draft-generated'], displayDraftBackendGeneratedPath: values['display-draft-backend-generated'], identityGeneratedPath: values['identity-generated'], identityBackendGeneratedPath: values['identity-backend-generated'], identitySourcePath: values['identity-source'], rightsReviewPath: values['rights-review'], outputDir: values.output || '.tmp/japanese-set-english-runtime-coverage-audit/NEW_OUTPUT' }), null, 2)}\n`);
}
