import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { auditJapaneseSetEnglishRuntimeCoverage } from './audit-japanese-set-english-runtime-coverage';

const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const root = mkdtempSync(resolve(tmpdir(), 'ja-runtime-coverage-'));
try {
  const planDir = resolve(root, 'plan'); const evidenceDir = resolve(root, 'evidence'); mkdirSync(planDir); mkdirSync(evidenceDir);
  const queueName = 'set-english-display-name-repair-queue.csv';
  const queue = [
    'target_entity_type,target_entity_id,canonical_column,language',
    'set,00000000-0000-4000-8000-000000000001,english_display_name,ja',
    'set,00000000-0000-4000-8000-000000000002,english_display_name,ja',
    'set,00000000-0000-4000-8000-000000000003,english_display_name,ja',
    'set,00000000-0000-4000-8000-000000000004,english_display_name,ja',
    '',
  ].join('\n');
  const plan = JSON.stringify({ databaseWriteAuthorized: false, productionModified: false, outputFiles: { queues: { set_english_display_name: queueName } } });
  writeFileSync(resolve(planDir, queueName), queue); writeFileSync(resolve(planDir, 'canonical-metadata-repair-plan.json'), plan);
  writeFileSync(resolve(planDir, 'manifest.json'), JSON.stringify({ sideEffects: 'local_report_files_only', productionModified: false, outputSha256: { [queueName]: sha(queue), 'canonical-metadata-repair-plan.json': sha(plan) } }));
  const ledger = [
    ['00000000-0000-4000-8000-000000000001', 'M3'],
    ['00000000-0000-4000-8000-000000000002', 'SGG'],
    ['00000000-0000-4000-8000-000000000003', 'not-a-runtime-code'],
    ['00000000-0000-4000-8000-000000000004', 'PCG1'],
  ].map(([entityId, setCode]) => JSON.stringify({ entityType: 'set_art_slot', dimension: 'set_logo', entityId, language: 'ja', facts: { setCode } })).join('\n') + '\n';
  writeFileSync(resolve(evidenceDir, 'canonical-catalogue-row-evidence.jsonl'), ledger); writeFileSync(resolve(evidenceDir, 'manifest.json'), JSON.stringify({ outputSha256: { 'canonical-catalogue-row-evidence.jsonl': sha(ledger) } }));
  const output = resolve(root, 'out'); const result = auditJapaneseSetEnglishRuntimeCoverage({ planDir, evidenceDir, runtimeSourcePath: resolve('lib/pokemonDisplayNames.ts'), outputDir: output });
  if (result.target_count !== 4 || result.coverage_counts.manual_runtime_map !== 1 || result.coverage_counts.pinned_tcgdex_runtime_map !== 1 || result.coverage_counts.reviewed_display_translation_draft !== 1 || result.coverage_counts.unresolved !== 1) throw new Error('Expected the manual, green TCGdex, and owner-approved editorial runtime lanes to be counted separately.');
  if (result.activation_authorized !== true || result.canonical_database_write_authorized !== false || result.quarantined_review_candidate_counts.pinned_tcgdex_runtime_map !== 0 || result.quarantined_review_candidate_counts.reviewed_display_translation_draft !== 0) throw new Error('Expected approved runtime supplements with database writes and unreviewed imports still disabled.');
  const rows = JSON.parse(readFileSync(resolve(output, 'japanese-set-english-runtime-coverage.json'), 'utf8')) as Array<Record<string, unknown>>;
  if (!rows.some((row) => row.set_code === 'M3' && row.runtime_english_display_name === 'Munikisu Zero' && row.coverage === 'manual_runtime_map')) throw new Error('Manual map must keep precedence over a pinned conflict.');
  if (!rows.some((row) => row.set_code === 'SGG' && row.runtime_english_display_name === null && row.runtime_display_supplement === 'High-Class Deck Gengar VMAX' && row.runtime_display_supplement_status === 'provider_metadata_english_supplement' && row.coverage === 'pinned_tcgdex_runtime_map')) throw new Error('Pinned TCGdex metadata must activate only as a non-authoritative display supplement.');
  if (!rows.some((row) => row.set_code === 'PCG1' && row.runtime_english_display_name === null && row.runtime_display_supplement === 'Flight of Legends' && row.runtime_display_supplement_status === 'model_translation_draft' && row.coverage === 'reviewed_display_translation_draft')) throw new Error('The exact owner-approved editorial value must be counted only as a labelled runtime supplement.');
  let rejected = false; try { auditJapaneseSetEnglishRuntimeCoverage({ planDir, evidenceDir, runtimeSourcePath: resolve('lib/pokemonDisplayNames.ts'), outputDir: output }); } catch { rejected = true; }
  if (!rejected) throw new Error('Audit output must never be overwritten.');
  process.stdout.write('Japanese set English runtime coverage audit tests passed.\n');
} finally { rmSync(root, { recursive: true, force: true }); }
