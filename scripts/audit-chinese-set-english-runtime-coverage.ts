/**
 * Local, read-only coverage audit for the owner-approved Chinese English set
 * supplements. It never reads a database or network resource and deliberately
 * reports a supplement only when its language, canonical code, and native-name
 * binding can be proven from the hash-bound snapshot (or the two recorded
 * identity corrections).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import { CHINESE_SET_TRANSLATION_DRAFT_LOOKUP_METADATA, CHINESE_SET_TRANSLATION_DRAFTS_BY_LANGUAGE } from '../lib/generated/chineseSetTranslationDrafts.generated';
import { getChineseSetEnglishTranslationDraft } from '../lib/pokemonDisplayNames';

type Language = 'zh-cn' | 'zh-tw';
type Row = Record<string, unknown>;
type Coverage = 'runtime_covered_provider_baseline_exact_native_name' | 'runtime_covered_approved_identity_override' | 'draft_code_present_source_name_unverified' | 'unresolved';
const MAX_BYTES = 300 * 1024 * 1024;
const SHA = /^[a-f0-9]{64}$/;
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const fileSha = (path: string) => sha(readFileSync(path));
const isRow = (value: unknown): value is Row => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const stable = (value: unknown) => `${JSON.stringify(value, (_key, item) => isRow(item) ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item, 2)}\n`;
const normalizeCode = (value: unknown) => String(value ?? '').trim().replace(/^(zh-cn|zh_cn|zhcn|zh-hans|zh-tw|zh_tw|zhtw|zh-hant|zh):/i, '').replace(/\+/g, 'p').toLowerCase().replace(/[^a-z0-9.]+/g, '');
const normalizeNativeName = (value: unknown) => String(value ?? '').normalize('NFKC').replace(/\s+/gu, '').trim();
function json(path: string, label: string): Row {
  if (!existsSync(path) || statSync(path).size > MAX_BYTES) throw new Error(`${label} is missing or too large.`);
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!isRow(value)) throw new Error(`${label} must be a JSON object.`);
  return value;
}
function checkedManifestFile(manifest: Row, file: string, path: string, label: string) {
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  const record = files.find((item) => isRow(item) && item.path === file);
  const expected = isRow(record) && typeof record.sha256 === 'string' ? record.sha256 : null;
  if (!expected || !SHA.test(expected) || expected !== fileSha(path)) throw new Error(`${label} hash mismatch.`);
}

export function auditChineseSetEnglishRuntimeCoverage(args: {
  evidenceDir: string;
  providerBaselineDir: string;
  identitySourcePath?: string;
  nativeNameSourcePath?: string;
  runtimeSourcePath?: string;
  runtimeGeneratedPath?: string;
  backendRuntimeGeneratedPath?: string;
  rightsReviewPath?: string;
  outputDir: string;
}) {
  const evidenceDir = resolve(args.evidenceDir); const providerBaselineDir = resolve(args.providerBaselineDir);
  const ledgerPath = resolve(evidenceDir, 'canonical-catalogue-row-evidence.jsonl');
  const evidenceManifestPath = resolve(evidenceDir, 'manifest.json'); const evidenceManifest = json(evidenceManifestPath, 'evidence manifest');
  const ledgerExpected = isRow(evidenceManifest.outputSha256) ? evidenceManifest.outputSha256['canonical-catalogue-row-evidence.jsonl'] : null;
  if (typeof ledgerExpected !== 'string' || !SHA.test(ledgerExpected) || ledgerExpected !== fileSha(ledgerPath)) throw new Error('Evidence ledger hash mismatch.');
  const baselineManifestPath = resolve(providerBaselineDir, 'manifest.json'); const baselineManifest = json(baselineManifestPath, 'provider baseline manifest');
  const reconciliationPath = resolve(providerBaselineDir, 'provider-baseline-row-reconciliation.jsonl');
  checkedManifestFile(baselineManifest, 'provider-baseline-row-reconciliation.jsonl', reconciliationPath, 'Provider reconciliation');
  const rawPaths: Record<Language, string> = { 'zh-cn': resolve(providerBaselineDir, 'raw/zh-cn.sets.json'), 'zh-tw': resolve(providerBaselineDir, 'raw/zh-tw.sets.json') };
  for (const language of Object.keys(rawPaths) as Language[]) checkedManifestFile(baselineManifest, `raw/${language}.sets.json`, rawPaths[language], `${language} provider sets`);
  const identitySourcePath = resolve(args.identitySourcePath ?? 'catalogue/tcgdex-chinese-set-identity-display-source.json');
  const identitySource = json(identitySourcePath, 'Chinese identity display source');
  const nativeNameSourcePath = resolve(args.nativeNameSourcePath ?? CHINESE_SET_TRANSLATION_DRAFT_LOOKUP_METADATA.nativeNameSource);
  const runtimeSourcePath = resolve(args.runtimeSourcePath ?? 'lib/pokemonDisplayNames.ts');
  const runtimeGeneratedPath = resolve(args.runtimeGeneratedPath ?? 'lib/generated/chineseSetTranslationDrafts.generated.ts');
  const backendRuntimeGeneratedPath = resolve(args.backendRuntimeGeneratedPath ?? 'backend/lib/generated/chineseSetTranslationDrafts.generated.mjs');
  const rightsReviewPath = resolve(args.rightsReviewPath ?? 'catalogue/rights-reviews/cjk-editorial-set-translation-owner-approved.2026-09-04.json');
  const rightsReview = json(rightsReviewPath, 'CJK editorial rights review');
  const expectedIdentitySha = CHINESE_SET_TRANSLATION_DRAFT_LOOKUP_METADATA.tcgdexChineseIdentityDisplaySource.sha256;
  const expectedReviewSha = CHINESE_SET_TRANSLATION_DRAFT_LOOKUP_METADATA.rightsGate.reviewSha256;
  if (rightsReview.status !== 'approved_active_runtime_only' || rightsReview.activationAuthorized !== true
    || fileSha(identitySourcePath) !== expectedIdentitySha
    || fileSha(nativeNameSourcePath) !== CHINESE_SET_TRANSLATION_DRAFT_LOOKUP_METADATA.nativeNameSourceSha256
    || fileSha(rightsReviewPath) !== expectedReviewSha
    || CHINESE_SET_TRANSLATION_DRAFT_LOOKUP_METADATA.rightsGate.activationAuthorized !== true
    || CHINESE_SET_TRANSLATION_DRAFT_LOOKUP_METADATA.rightsGate.canonicalDatabaseWriteAuthorized !== false) throw new Error('Chinese editorial runtime lane is not safely approved.');

  const current = new Map<string, { id: string; language: Language; setCode: string | null }>();
  for (const line of readFileSync(ledgerPath, 'utf8').split(/\r?\n/)) {
    if (!line) continue; const item: unknown = JSON.parse(line);
    if (!isRow(item) || item.entityType !== 'set_art_slot' || (item.language !== 'zh-cn' && item.language !== 'zh-tw')) continue;
    const facts = isRow(item.facts) ? item.facts : {}; const id = String(item.entityId ?? ''); if (!id) throw new Error('Chinese set-art row lacks an entity ID.');
    const setCode = typeof facts.setCode === 'string' && facts.setCode.trim() ? facts.setCode.trim() : null;
    const key = `${item.language}:${id}`; const prior = current.get(key);
    if (prior && prior.setCode !== setCode) throw new Error(`Ambiguous canonical set code for ${key}.`);
    current.set(key, { id, language: item.language, setCode });
  }
  const providerSetByCanonical = new Map<string, string>();
  for (const line of readFileSync(reconciliationPath, 'utf8').split(/\r?\n/)) {
    if (!line) continue; const item: unknown = JSON.parse(line);
    if (!isRow(item) || item.entityType !== 'provider_set' || item.status !== 'matched_exact' || (item.language !== 'zh-cn' && item.language !== 'zh-tw')) continue;
    const canonical = isRow(item.canonical) ? item.canonical : {}; const id = String(canonical.setId ?? ''); const provider = String(item.providerSetId ?? item.providerId ?? '');
    if (!id || !provider) throw new Error('Matched Chinese provider-set row is incomplete.');
    const key = `${item.language}:${id}`; const prior = providerSetByCanonical.get(key);
    if (prior && normalizeCode(prior) !== normalizeCode(provider)) throw new Error(`Ambiguous provider-set binding for ${key}.`);
    providerSetByCanonical.set(key, provider);
  }
  const providerNames: Record<Language, Map<string, string[]>> = { 'zh-cn': new Map(), 'zh-tw': new Map() };
  for (const language of Object.keys(rawPaths) as Language[]) {
    const data: unknown = JSON.parse(readFileSync(rawPaths[language], 'utf8'));
    if (!Array.isArray(data)) throw new Error(`${language} provider snapshot must be an array.`);
    for (const item of data) {
      if (!isRow(item) || typeof item.id !== 'string' || typeof item.name !== 'string') throw new Error(`${language} provider set is malformed.`);
      const code = normalizeCode(item.id); const name = item.name.trim(); if (!code || !name) throw new Error(`${language} provider set lacks identity.`);
      providerNames[language].set(code, [...(providerNames[language].get(code) ?? []), name]);
    }
  }
  const overrides = isRow(identitySource.entries) ? identitySource.entries : {};
  const rows = [...current.values()].sort((a, b) => `${a.language}:${a.id}`.localeCompare(`${b.language}:${b.id}`)).map((set) => {
    const code = set.setCode ? normalizeCode(set.setCode) : null;
    const draft = code ? CHINESE_SET_TRANSLATION_DRAFTS_BY_LANGUAGE[set.language][code] : null;
    const providerSetId = providerSetByCanonical.get(`${set.language}:${set.id}`) ?? null;
    const snapshotNames = providerSetId ? providerNames[set.language].get(normalizeCode(providerSetId)) ?? [] : [];
    const override = set.language === 'zh-cn' && code !== null && isRow(overrides[code]) ? overrides[code] : null;
    const isOverride = Boolean(
      draft
      && override
      && normalizeCode(override.effectiveCode) === code
      && normalizeNativeName(override.nativeName) === draft.normalizedNativeName,
    );
    if (override && draft && !isOverride) throw new Error(`Approved Chinese identity override no longer matches runtime draft: ${code}.`);
    const sourceNativeNameMatched = Boolean(draft && snapshotNames.some((name) => normalizeNativeName(name) === draft.normalizedNativeName));
    const runtime = draft ? getChineseSetEnglishTranslationDraft({ language: set.language, setCode: set.setCode, localName: draft.nativeName }) : null;
    let coverage: Coverage = 'unresolved';
    if (draft && runtime?.value !== draft.englishTranslation) throw new Error(`Exact Chinese runtime draft failed for ${set.language}:${set.setCode}.`);
    if (draft && sourceNativeNameMatched) coverage = 'runtime_covered_provider_baseline_exact_native_name';
    else if (draft && isOverride) coverage = 'runtime_covered_approved_identity_override';
    else if (draft) coverage = 'draft_code_present_source_name_unverified';
    return { canonical_set_id: set.id, language_code: set.language, set_code: set.setCode, normalized_set_code: code, provider_set_id: providerSetId, provider_snapshot_native_names: snapshotNames, runtime_native_name: draft?.nativeName ?? null, runtime_english_translation: runtime?.value ?? null, runtime_translation_label: runtime?.label ?? null, source_native_name_matched: sourceNativeNameMatched, approved_identity_override: isOverride, coverage };
  });
  const count = (coverage: Coverage, language?: Language) => rows.filter((row) => row.coverage === coverage && (!language || row.language_code === language)).length;
  const inputs = { 'evidence-manifest:manifest.json': fileSha(evidenceManifestPath), 'evidence-ledger:canonical-catalogue-row-evidence.jsonl': fileSha(ledgerPath), 'provider-baseline-manifest:manifest.json': fileSha(baselineManifestPath), 'provider-reconciliation:provider-baseline-row-reconciliation.jsonl': fileSha(reconciliationPath), 'provider-raw:zh-cn.sets.json': fileSha(rawPaths['zh-cn']), 'provider-raw:zh-tw.sets.json': fileSha(rawPaths['zh-tw']), [`identity-source:${basename(identitySourcePath)}`]: fileSha(identitySourcePath), [`native-name-source:${basename(nativeNameSourcePath)}`]: fileSha(nativeNameSourcePath), [`runtime-source:${basename(runtimeSourcePath)}`]: fileSha(runtimeSourcePath), [`runtime-generated-client:${basename(runtimeGeneratedPath)}`]: fileSha(runtimeGeneratedPath), [`runtime-generated-backend:${basename(backendRuntimeGeneratedPath)}`]: fileSha(backendRuntimeGeneratedPath), [`rights-review:${basename(rightsReviewPath)}`]: fileSha(rightsReviewPath) };
  const counts = (language: Language) => Object.fromEntries((['runtime_covered_provider_baseline_exact_native_name', 'runtime_covered_approved_identity_override', 'draft_code_present_source_name_unverified', 'unresolved'] as Coverage[]).map((coverage) => [coverage, count(coverage, language)]));
  const report = { schema_version: 'stackr-chinese-set-english-runtime-coverage-audit-v1', mode: 'dry_run_local_files_only', network_accessed: false, database_accessed: false, stored_catalogue_rows_modified: false, canonical_database_write_authorized: false, native_name_remains_primary: true, input_sha256: inputs, target_count: rows.length, coverage_counts: { 'zh-cn': counts('zh-cn'), 'zh-tw': counts('zh-tw'), total: Object.fromEntries((['runtime_covered_provider_baseline_exact_native_name', 'runtime_covered_approved_identity_override', 'draft_code_present_source_name_unverified', 'unresolved'] as Coverage[]).map((coverage) => [coverage, count(coverage)])) }, note: 'Coverage requires exact language, canonical set code, and normalized native name. Provider snapshot rows with duplicate IDs are retained in the report; a matching native name is sufficient only for the exact mapped canonical provider set. The two approved identity rules can cover more than two current canonical set rows when the current ledger contains a duplicate normalized set code; they never rewrite canonical data.' };
  const outputDir = resolve(args.outputDir); if (existsSync(outputDir)) throw new Error(`Refusing to overwrite existing output directory: ${outputDir}`); mkdirSync(outputDir, { recursive: true });
  const rowsBody = stable(rows); const reportBody = stable(report); writeFileSync(resolve(outputDir, 'chinese-set-english-runtime-coverage.json'), rowsBody, { flag: 'wx' }); writeFileSync(resolve(outputDir, 'chinese-set-english-runtime-coverage-audit.json'), reportBody, { flag: 'wx' });
  const outputSha256 = { 'chinese-set-english-runtime-coverage.json': sha(rowsBody), 'chinese-set-english-runtime-coverage-audit.json': sha(reportBody) };
  writeFileSync(resolve(outputDir, 'manifest.json'), stable({ schema_version: '1.0.0', mode: 'dry_run_local_files_only', input_sha256: inputs, output_sha256: outputSha256 }), { flag: 'wx' });
  return { ...report, output_sha256: outputSha256 };
}
if (require.main === module) {
  const values = Object.fromEntries(process.argv.slice(2).map((arg) => { const [key, ...rest] = arg.replace(/^--/, '').split('='); return [key, rest.join('=')]; }));
  process.stdout.write(`${JSON.stringify(auditChineseSetEnglishRuntimeCoverage({ evidenceDir: values['evidence-dir'] || '.tmp/canonical-evidence/current-gap-audit-20260903-v3', providerBaselineDir: values['provider-baseline-dir'] || 'reports/catalogue/provider-baseline/2026-08-14', identitySourcePath: values['identity-source'], nativeNameSourcePath: values['native-name-source'], runtimeSourcePath: values['runtime-source'], runtimeGeneratedPath: values['runtime-generated'], backendRuntimeGeneratedPath: values['backend-runtime-generated'], rightsReviewPath: values['rights-review'], outputDir: values.output || '.tmp/chinese-set-english-runtime-coverage-audit/NEW_OUTPUT' }), null, 2)}\n`);
}
