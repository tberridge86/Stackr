import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { auditChineseSetEnglishRuntimeCoverage } from './audit-chinese-set-english-runtime-coverage';
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const root = mkdtempSync(resolve(tmpdir(), 'zh-runtime-coverage-'));
try {
  const evidence = resolve(root, 'evidence'); const baseline = resolve(root, 'baseline'); mkdirSync(evidence); mkdirSync(resolve(baseline, 'raw'), { recursive: true });
  const ledger = [
    ['zh-cn', '00000000-0000-4000-8000-000000000001', 'CS5.5C'], ['zh-tw', '00000000-0000-4000-8000-000000000002', 'SVAM'], ['zh-cn', '00000000-0000-4000-8000-000000000003', 'unknown'],
  ].flatMap(([language, entityId, setCode]) => ['set_logo', 'set_symbol'].map((dimension) => JSON.stringify({ entityType: 'set_art_slot', dimension, entityId, language, facts: { setCode } }))).join('\n') + '\n';
  writeFileSync(resolve(evidence, 'canonical-catalogue-row-evidence.jsonl'), ledger); writeFileSync(resolve(evidence, 'manifest.json'), JSON.stringify({ outputSha256: { 'canonical-catalogue-row-evidence.jsonl': sha(ledger) } }));
  const cn = JSON.stringify([{ id: 'CS5.5C', name: '暗影夺辉' }]); const tw = JSON.stringify([{ id: 'SVAM', name: '起始組合ex 新葉喵&路卡利歐 ex' }]); const reconciliation = [
    ['zh-cn', '00000000-0000-4000-8000-000000000001', 'CS5.5C'], ['zh-tw', '00000000-0000-4000-8000-000000000002', 'SVAM'],
  ].map(([language, setId, providerSetId]) => JSON.stringify({ entityType: 'provider_set', status: 'matched_exact', language, canonical: { setId }, providerSetId })).join('\n') + '\n';
  writeFileSync(resolve(baseline, 'raw/zh-cn.sets.json'), cn); writeFileSync(resolve(baseline, 'raw/zh-tw.sets.json'), tw); writeFileSync(resolve(baseline, 'provider-baseline-row-reconciliation.jsonl'), reconciliation);
  writeFileSync(resolve(baseline, 'manifest.json'), JSON.stringify({ files: [
    { path: 'provider-baseline-row-reconciliation.jsonl', sha256: sha(reconciliation) }, { path: 'raw/zh-cn.sets.json', sha256: sha(cn) }, { path: 'raw/zh-tw.sets.json', sha256: sha(tw) },
  ] }));
  const output = resolve(root, 'out'); const result = auditChineseSetEnglishRuntimeCoverage({ evidenceDir: evidence, providerBaselineDir: baseline, outputDir: output });
  if (result.target_count !== 3 || result.coverage_counts['zh-cn'].runtime_covered_provider_baseline_exact_native_name !== 1 || result.coverage_counts['zh-tw'].runtime_covered_provider_baseline_exact_native_name !== 1 || result.coverage_counts['zh-cn'].unresolved !== 1) throw new Error('Expected exact native-name coverage and unresolved accounting.');
  const rows = JSON.parse(readFileSync(resolve(output, 'chinese-set-english-runtime-coverage.json'), 'utf8')) as Array<Record<string, unknown>>;
  if (!rows.some((row) => row.set_code === 'CS5.5C' && row.runtime_english_translation === 'Shadow Seizes the Light' && row.source_native_name_matched === true)) throw new Error('Simplified Chinese exact runtime supplement was not proved.');
  let rejected = false; try { auditChineseSetEnglishRuntimeCoverage({ evidenceDir: evidence, providerBaselineDir: baseline, outputDir: output }); } catch { rejected = true; }
  if (!rejected) throw new Error('Audit must refuse to overwrite output.');
  process.stdout.write('Chinese set English runtime coverage audit tests passed.\n');
} finally { rmSync(root, { recursive: true, force: true }); }
