import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { buildChineseSetTranslationDraftReviewPack } from './build-chinese-set-translation-draft-review-pack';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const cnId = '00000000-0000-4000-8000-000000000001';
const twId = '00000000-0000-4000-8000-000000000002';
const root = mkdtempSync(resolve(tmpdir(), 'chinese-set-translation-draft-'));
try {
  const planDir = resolve(root, 'plan'); const evidenceDir = resolve(root, 'evidence'); mkdirSync(planDir); mkdirSync(evidenceDir);
  const queue = `target_entity_type,target_entity_id,language\nset,${cnId},zh-cn\n`;
  const plan = JSON.stringify({ schemaVersion: '1.0.0', databaseWriteAuthorized: false, productionModified: false, outputFiles: { queues: { set_english_display_name: 'set-english.csv' } } });
  writeFileSync(resolve(planDir, 'set-english.csv'), queue); writeFileSync(resolve(planDir, 'canonical-metadata-repair-plan.json'), plan);
  writeFileSync(resolve(planDir, 'manifest.json'), JSON.stringify({ schemaVersion: '1.0.0', plannerId: 'stackr-canonical-metadata-repair-plan-v1', sideEffects: 'local_report_files_only', productionModified: false, outputSha256: { 'canonical-metadata-repair-plan.json': sha(plan), 'set-english.csv': sha(queue) } }));
  const ledger = [
    { entityType: 'set_art_slot', dimension: 'set_logo', entityId: cnId, language: 'zh-cn', facts: { setCode: 'CBB2C' } },
    { entityType: 'set_art_slot', dimension: 'set_logo', entityId: twId, language: 'zh-tw', facts: { setCode: 'SVC' } },
    { entityType: 'supplemental_metadata_diagnostic', dimension: 'set_english_display_name', entityId: twId, language: 'zh-tw', facts: { repairRequiresNonNullCleanup: true, targetEntityType: 'set' }, issues: ['supplemental:invalid_set_english_display_name'] },
  ].map((row) => JSON.stringify(row)).join('\n') + '\n';
  writeFileSync(resolve(evidenceDir, 'canonical-catalogue-row-evidence.jsonl'), ledger); writeFileSync(resolve(evidenceDir, 'manifest.json'), JSON.stringify({ outputSha256: { 'canonical-catalogue-row-evidence.jsonl': sha(ledger) } }));
  const cnSource = resolve(root, 'cn.json'); const twSource = resolve(root, 'tw.json'); writeFileSync(cnSource, JSON.stringify([{ id: 'CBB2C', name: '宝石包Vol.2' }])); writeFileSync(twSource, JSON.stringify([{ id: 'SVC', name: '皮卡丘特別組合' }]));
  const options = { planDir, evidenceDir, zhCnSource: cnSource, zhTwSource: twSource, expectedZhCnNullTargetCount: 1, expectedZhTwInvalidTargetCount: 1 }; const output = resolve(root, 'out'); const result = buildChineseSetTranslationDraftReviewPack({ ...options, outputDir: output });
  if (result.candidate_counts.total !== 2 || result.candidate_counts.zh_cn_model_translation_drafts !== 1 || result.candidate_counts.zh_tw_model_translation_drafts !== 1) throw new Error('Expected one draft in each Chinese lane.');
  const drafts = JSON.parse(readFileSync(resolve(output, 'chinese-set-english-model-translation-drafts.json'), 'utf8')); if (drafts.some((row: Record<string, unknown>) => row.importer_ready !== false || row.proposal_class !== 'model_translation_draft' || row.native_name_remains_primary !== true)) throw new Error('Draft safety flags are missing.');
  if (drafts.some((row: Record<string, unknown>) => row.human_review_required !== true || row.write_authorized !== false || row.english_display_is_supplement_only !== true)) throw new Error('Draft review/write safety flags are missing.');
  let rejectedOverwrite = false; try { buildChineseSetTranslationDraftReviewPack({ ...options, outputDir: output }); } catch (error) { rejectedOverwrite = String(error).includes('Refusing to overwrite'); } if (!rejectedOverwrite) throw new Error('Expected output overwrite rejection.');
  const ambiguousTwSource = resolve(root, 'tw-ambiguous.json'); writeFileSync(ambiguousTwSource, JSON.stringify([{ id: 'SVC', name: '皮卡丘特別組合' }, { id: 'SVC', name: '另一個名稱' }])); const ambiguityOutput = resolve(root, 'ambiguous'); const ambiguityResult = buildChineseSetTranslationDraftReviewPack({ ...options, zhTwSource: ambiguousTwSource, outputDir: ambiguityOutput }); if (ambiguityResult.candidate_counts.total !== 1 || ambiguityResult.exclusion_counts.ambiguous_native_name_in_local_evidence !== 1) throw new Error('Ambiguous native evidence must be excluded, not drafted.');
  writeFileSync(resolve(planDir, 'set-english.csv'), `${queue}set,00000000-0000-4000-8000-000000000003,zh-cn\n`); let rejectedTamper = false; try { buildChineseSetTranslationDraftReviewPack({ ...options, outputDir: resolve(root, 'tampered') }); } catch (error) { rejectedTamper = String(error).includes('Plan hash mismatch'); } if (!rejectedTamper) throw new Error('Expected hash-bound queue tamper rejection.');
  process.stdout.write('Chinese set translation draft review pack tests passed.\n');
} finally { rmSync(root, { recursive: true, force: true }); }
