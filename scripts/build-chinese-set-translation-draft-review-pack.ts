/**
 * Builds unsigned English wording drafts for Chinese set names.
 *
 * This is deliberately not a source-ingestion or importer lane.  The native
 * name remains primary; each proposed English string is a model translation
 * for a reviewer to accept, alter, or reject after checking an authorised
 * source.  No database, network, or artwork access occurs here.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, relative, resolve } from 'node:path';

import { readTcgdexChineseSetIdentityDisplaySource } from './build-tcgdex-chinese-set-identity-display-source';

type Row = Record<string, unknown>;
const SHA256 = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const MAX_BYTES = 256 * 1024 * 1024;
const CURRENT_ZH_TW_INVALID_TARGET_COUNT = 77;

// Code-specific wording avoids pretending that a literal translation is an
// official English release title. These strings are only reviewer starting
// points, and are intentionally kept separate from the native-source lookup.
export const CHINESE_SET_ENGLISH_MODEL_TRANSLATION_DRAFTS: Record<string, string> = {
  'zh-cn:CBB1C': 'Gem Pack Vol. 1',
  'zh-cn:CBB2C': 'Gem Pack Vol. 2', 'zh-cn:CBB3C': 'Gem Pack Vol. 3', 'zh-cn:CBB4C': 'Gem Pack Vol. 4', 'zh-cn:CBB5C': 'Gem Pack Vol. 5',
  'zh-cn:CS1.5C': 'Gigantamax Attack and Defense', 'zh-cn:CS1aC': 'Skyborne Emergence: Scarlet', 'zh-cn:CS1bC': 'Gigantamax Clash: Blaze',
  'zh-cn:CS2.5C': 'Brilliant Counterattack', 'zh-cn:CS2aC': 'Ink and Color: Dawn', 'zh-cn:CS2bC': 'Ink and Color: Indigo',
  'zh-cn:CS3.5C': 'Raging Flames Scorch the Sky', 'zh-cn:CS3aC': 'Primeval Battle: Verdant', 'zh-cn:CS3bC': 'Primeval Battle: Surge',
  'zh-cn:CS4.5C': 'Final Flame Dance', 'zh-cn:CS4aC': 'Nine-Color Convergence: Companion', 'zh-cn:CS4bC': 'Nine-Color Convergence: Origin',
  'zh-cn:CS5.5C': 'Shadow Seizes the Light', 'zh-cn:CS5aC': 'Courage and Charm Among the Stars: Charm', 'zh-cn:CS5bC': 'Courage and Charm Among the Stars: Courage',
  'zh-cn:CS6.5C': 'Triumphant Star Guidance', 'zh-cn:CS6aC': 'Azure Sea Shadow: Roar', 'zh-cn:CS6bC': 'Azure Sea Shadow: Pursuit',
  'zh-cn:CSM1.5C': 'Battle Elite', 'zh-cn:csm1a': 'Storm Surge', 'zh-cn:csm1b': 'Storm Surge', 'zh-cn:CSM1cC': 'Skyborne Emergence: Grace',
  'zh-cn:CSM2.5C': 'Dazzling Contest', 'zh-cn:CSM2aC': 'Interwoven Radiance: Bathing', 'zh-cn:csm2b': 'Shining Synergy', 'zh-cn:CSM2cC': 'Interwoven Radiance: Summoning',
  'zh-cn:CSMPiC': 'Battle Party Combination Reward Pack', 'zh-cn:CSV2C': 'Miracle Journey', 'zh-cn:CSV3C': 'Fearless Terastal',
  'zh-cn:CSV1C': 'Eternal Birth',
  'zh-cn:CSV4C': 'Prize Turn', 'zh-cn:CSV5C': 'Black Crystal Blaze', 'zh-cn:CSV6C': 'Reality and Illusion',
  'zh-cn:CSV7C': 'Awakening Blade', 'zh-cn:CSV8C': 'Dazzling Phantasm', 'zh-cn:CSV9C': 'Stellar Crystal Glass', 'zh-cn:CSV9.5C': 'Terastal Gathering',
  'zh-cn:SV10': 'Glory of Team Rocket', 'zh-cn:SV7': 'Stellar Miracle', 'zh-cn:SV7a': 'Paradise Dragona', 'zh-cn:SV8': 'Super Electric Breaker',
  'zh-cn:SV8a': 'Terastal Festival ex', 'zh-cn:SV9': 'Battle Partners', 'zh-cn:SV9a': 'Heat Wave Arena',
  'zh-tw:SVAM': 'Starter Set ex Sprigatito & Lucario ex', 'zh-tw:SV8': 'Super Electric Breaker', 'zh-tw:SVC': 'Pokémon Card Game Pikachu Special Set',
  'zh-tw:SV2P': 'Snow Hazard', 'zh-tw:SV3': 'Ruler of the Black Flame', 'zh-tw:SPZ': 'VSTAR & VMAX High-Class Deck Zeraora',
  'zh-tw:SP5': 'Mighty', 'zh-tw:SK': 'VSTAR Premium Trainer Box', 'zh-tw:SV4K': 'Ancient Roar', 'zh-tw:SV3a': 'Raging Surf',
  'zh-tw:SDM': 'Mewtwo', 'zh-tw:SC1b': 'Sword & Shield Set B', 'zh-tw:SV-P': 'Scarlet & Violet Promo Cards',
  'zh-tw:SV4M': 'Future Flash', 'zh-tw:SPD': 'VSTAR & VMAX High-Class Deck Deoxys', 'zh-tw:SVAW': 'Starter Set ex Quaxly & Mimikyu ex',
  'zh-tw:SVF': 'Ruler of the Black Flame', 'zh-tw:SVP1': 'ex Special Set', 'zh-tw:SV4a': 'Shiny Treasure ex',
  'zh-tw:S5I': 'Single Strike Master', 'zh-tw:SV2a': 'Pokémon Card 151', 'zh-tw:SCA': 'Partner', 'zh-tw:SVEL': 'Skeledirge ex',
  'zh-tw:SV1V': 'Violet ex', 'zh-tw:S7D': 'Skyscraping Perfection', 'zh-tw:SC1D': 'Sword & Shield',
  'zh-tw:S8a': '25th Anniversary Collection', 'zh-tw:S11a': 'Incandescent Arcana', 'zh-tw:SCB': 'Challenge',
  'zh-tw:S6K': 'Jet-Black Spirit', 'zh-tw:S6H': 'Silver Lance', 'zh-tw:SV9a': 'Heat Wave Arena', 'zh-tw:SV5M': 'Cyber Judge',
  'zh-tw:SJ': 'Zacian vs. Eternatus', 'zh-tw:SCD': 'Mighty', 'zh-tw:S10P': 'Space Juggler', 'zh-tw:SI': 'Start Deck 100',
  'zh-tw:S9a': 'Battle Region', 'zh-tw:SDL': 'Charizard', 'zh-tw:S8': 'Fusion Arts', 'zh-tw:SVB': 'Premium Trainer Box ex',
  'zh-tw:SC2a': 'Matchless Fighters Set A', 'zh-tw:SV5a': 'Crimson Haze', 'zh-tw:SV2D': 'Clay Burst',
  'zh-tw:S5a': 'Twin Warriors', 'zh-tw:SDP': 'Pikachu', 'zh-tw:SH': 'Pokémon Card Game Family Set',
  'zh-tw:SV1S': 'Scarlet ex', 'zh-tw:SN': 'Start Deck 100 Special Version', 'zh-tw:SLD': 'Starter Set VSTAR Darkrai',
  'zh-tw:S10a': 'Dark Phantasma', 'zh-tw:SC1a': 'Sword & Shield Set A', 'zh-tw:S11': 'Triplet Beat',
  'zh-tw:SV6a': 'Night Wanderer', 'zh-tw:SVD': 'ex Start Deck', 'zh-tw:SVEM': 'Mewtwo ex', 'zh-tw:SP6': 'VSTAR Special Set',
  'zh-tw:S6a': 'Eevee Heroes', 'zh-tw:SV6': 'Mask of Change', 'zh-tw:SVAL': 'Starter Set ex Fuecoco & Ampharos ex',
  'zh-tw:SV7': 'Stellar Miracle', 'zh-tw:SVHK': 'Future Miraidon ex', 'zh-tw:SLL': 'Starter Set VSTAR Lucario',
  'zh-tw:SV9': 'Battle Partners', 'zh-tw:SC2D': 'Matchless Fighters', 'zh-tw:SV8a': 'Terastal Festival ex',
  'zh-tw:SVHM': 'Shiny Treasure ex', 'zh-tw:S7R': 'Blue Sky Stream', 'zh-tw:SV7a': 'Paradise Dragona',
  'zh-tw:S12': 'Paradigm Trigger', 'zh-tw:S9': 'Star Birth', 'zh-tw:S12a': 'VSTAR Universe',
  'zh-tw:SC2b': 'Matchless Fighters Set B', 'zh-tw:SV1a': 'Triplet Beat', 'zh-tw:S5R': 'Rapid Strike Master',
  'zh-tw:S10D': 'Time Gazer', 'zh-tw:S10b': 'Pokémon GO',
};

function record(value: unknown, label: string): Row { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`); return value as Row; }
function text(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : null; }
function sha(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex'); }
function fileSha(path: string): string { return sha(readFileSync(path)); }
function stable(value: unknown): string { const walk = (v: unknown): unknown => Array.isArray(v) ? v.map(walk) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as Row).sort().map((k) => [k, walk((v as Row)[k])])) : v; return `${JSON.stringify(walk(value), null, 2)}\n`; }
function json(path: string, label: string): Row | Row[] { if (!existsSync(path) || statSync(path).size > MAX_BYTES) throw new Error(`${label} is missing or too large: ${path}`); try { const value = JSON.parse(readFileSync(path, 'utf8')); if (!value || typeof value !== 'object') throw new Error(); return value; } catch { throw new Error(`${label} is not valid JSON.`); } }
function csv(path: string): Row[] { const lines = readFileSync(path, 'utf8').replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/); const head = lines.shift()?.split(',') ?? []; if (!head.length || new Set(head).size !== head.length) throw new Error(`Invalid simple CSV header: ${path}`); return lines.filter(Boolean).map((line, index) => { const cells = line.split(','); if (cells.length !== head.length) throw new Error(`Malformed CSV row ${index + 2}: ${path}`); return Object.fromEntries(head.map((key, i) => [key, cells[i]])); }); }
function verifiedPlanQueue(planDir: string, manifest: Row, plan: Row): string {
  const queues = record(record(plan.outputFiles, 'plan.outputFiles').queues, 'plan queues'); const name = text(queues.set_english_display_name); if (!name) throw new Error('Missing set English queue.');
  const path = resolve(planDir, name); const rel = relative(planDir, path); if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Set English queue must remain inside plan directory.');
  const expected = text(record(manifest.outputSha256, 'plan manifest hashes')[basename(path)])?.toLowerCase(); if (!expected || !SHA256.test(expected) || expected !== fileSha(path)) throw new Error('Plan hash mismatch for set English queue.'); return path;
}

export function buildChineseSetTranslationDraftReviewPack(args: { planDir: string; evidenceDir: string; zhCnSource: string; zhTwSource: string; outputDir: string; expectedZhCnNullTargetCount?: number; expectedZhTwInvalidTargetCount?: number }) {
  const planDir = resolve(args.planDir); const evidenceDir = resolve(args.evidenceDir); const manifestPath = resolve(planDir, 'manifest.json'); const planPath = resolve(planDir, 'canonical-metadata-repair-plan.json');
  const manifest = record(json(manifestPath, 'plan manifest'), 'plan manifest'); const plan = record(json(planPath, 'metadata plan'), 'metadata plan');
  if (manifest.schemaVersion !== '1.0.0' || manifest.plannerId !== 'stackr-canonical-metadata-repair-plan-v1' || manifest.sideEffects !== 'local_report_files_only' || manifest.productionModified !== false || plan.databaseWriteAuthorized !== false || plan.productionModified !== false) throw new Error('The metadata plan must be the write-disabled reviewed v1 plan.');
  const expectedPlanHash = text(record(manifest.outputSha256, 'plan manifest hashes')['canonical-metadata-repair-plan.json'])?.toLowerCase(); if (!expectedPlanHash || expectedPlanHash !== fileSha(planPath)) throw new Error('Plan hash mismatch for metadata plan.');
  const queuePath = verifiedPlanQueue(planDir, manifest, plan); const zhCnTargets = new Set(csv(queuePath).flatMap((row) => row.target_entity_type === 'set' && row.language === 'zh-cn' && text(row.target_entity_id) && UUID.test(text(row.target_entity_id)!) ? [text(row.target_entity_id)!] : []));
  const expectedZhCn = args.expectedZhCnNullTargetCount ?? 49; if (zhCnTargets.size !== expectedZhCn) throw new Error(`Expected ${expectedZhCn} hash-bound zh-cn null targets, found ${zhCnTargets.size}.`);
  const evidenceManifestPath = resolve(evidenceDir, 'manifest.json'); const ledgerPath = resolve(evidenceDir, 'canonical-catalogue-row-evidence.jsonl'); const evidenceManifest = record(json(evidenceManifestPath, 'evidence manifest'), 'evidence manifest'); const expectedLedgerHash = text(record(evidenceManifest.outputSha256, 'evidence hashes')['canonical-catalogue-row-evidence.jsonl'])?.toLowerCase(); if (!expectedLedgerHash || expectedLedgerHash !== fileSha(ledgerPath)) throw new Error('Canonical evidence ledger hash mismatch.');
  const setCodes = new Map<string, string>(); const zhTwInvalid = new Set<string>();
  for (const line of readFileSync(ledgerPath, 'utf8').split(/\r?\n/)) { if (!line) continue; const row = record(JSON.parse(line), 'ledger row'); const id = text(row.entityId); const language = text(row.language); if (!id || !language) continue;
    if (row.entityType === 'set_art_slot' && (language === 'zh-cn' || language === 'zh-tw') && (zhCnTargets.has(id) || language === 'zh-tw')) { const code = text(record(row.facts, 'set-art facts').setCode); if (code) { const prior = setCodes.get(`${language}\u0000${id}`); if (prior && prior !== code) throw new Error(`Ambiguous current set code for ${id}.`); setCodes.set(`${language}\u0000${id}`, code); } }
    if (row.entityType === 'supplemental_metadata_diagnostic' && row.dimension === 'set_english_display_name' && language === 'zh-tw' && Array.isArray(row.issues) && row.issues.includes('supplemental:invalid_set_english_display_name')) { const facts = record(row.facts, 'zh-tw diagnostic facts'); if (facts.repairRequiresNonNullCleanup !== true || facts.targetEntityType !== 'set') throw new Error(`Invalid zh-tw diagnostic lacks non-null cleanup flag: ${id}`); zhTwInvalid.add(id); }
  }
  const expectedInvalid = args.expectedZhTwInvalidTargetCount ?? CURRENT_ZH_TW_INVALID_TARGET_COUNT; if (zhTwInvalid.size !== expectedInvalid) throw new Error(`Expected ${expectedInvalid} hash-bound zh-tw invalid replacement targets, found ${zhTwInvalid.size}.`);
  const loadSource = (path: string, language: 'zh-cn' | 'zh-tw') => { const rows = json(resolve(path), `${language} local set evidence`); if (!Array.isArray(rows)) throw new Error(`${language} local set evidence must be an array.`); const byCode = new Map<string, string[]>(); for (const raw of rows) { const item = record(raw, `${language} set evidence row`); const code = text(item.id); const name = text(item.name); if (!code || !name) continue; byCode.set(code, [...new Set([...(byCode.get(code) ?? []), name])]); } return { path: resolve(path), sha256: fileSha(resolve(path)), byCode }; };
  const cn = loadSource(args.zhCnSource, 'zh-cn'); const tw = loadSource(args.zhTwSource, 'zh-tw'); const candidates: Row[] = []; const exclusions: Row[] = [];
  const identityDisplaySource = readTcgdexChineseSetIdentityDisplaySource();
  const processTargets = (language: 'zh-cn' | 'zh-tw', ids: Set<string>, source: ReturnType<typeof loadSource>, targetState: 'null_fill' | 'invalid_non_null_replacement') => {
    for (const id of [...ids].sort()) {
      const code = setCodes.get(`${language}\u0000${id}`);
      if (!code) {
        exclusions.push({ canonical_set_id: id, language_code: language, exclusion: 'current_set_code_not_found_in_hash_bound_ledger' });
        continue;
      }
      const names = source.byCode.get(code) ?? [];
      const override = language === 'zh-cn'
        ? identityDisplaySource.entries[code.toLowerCase() as keyof typeof identityDisplaySource.entries]
        : undefined;
      let nativeName: string;
      let candidateSource: Row;
      if (names.length === 1) {
        if (override) throw new Error(`Pinned identity override now overlaps an unambiguous baseline row: ${language}:${code}`);
        [nativeName] = names;
        candidateSource = { local_evidence_path: relative(process.cwd(), source.path), sha256: source.sha256, exact_fields: ['id', 'name'] };
      } else if (override) {
        if (override.effectiveCode.toLowerCase() !== code.toLowerCase()
          || (names.length > 0 && !names.includes(override.nativeName))) {
          throw new Error(`Pinned identity override conflicts with baseline evidence: ${language}:${code}`);
        }
        nativeName = override.nativeName;
        candidateSource = {
          identity_display_source_path: relative(process.cwd(), identityDisplaySource.sourcePath),
          sha256: identityDisplaySource.bodySha256,
          upstream: identityDisplaySource.frozen.source,
          provider_path: override.providerPath,
          provider_source_sha256: override.sourceSha256,
          identity_resolution: override.resolution,
          reviewed_resolution_evidence: identityDisplaySource.frozen.reviewedResolutionEvidence,
          exact_fields: ['effectiveCode', 'nativeName'],
        };
      } else {
        exclusions.push({ canonical_set_id: id, language_code: language, set_code: code, exclusion: names.length ? 'ambiguous_native_name_in_local_evidence' : 'native_name_not_found_in_local_evidence' });
        continue;
      }
      const proposed = CHINESE_SET_ENGLISH_MODEL_TRANSLATION_DRAFTS[`${language}:${code}`];
      if (!proposed) {
        exclusions.push({ canonical_set_id: id, language_code: language, set_code: code, native_name: nativeName, exclusion: 'no_conservative_model_translation_draft' });
        continue;
      }
      candidates.push({ candidate_type: 'set_english_display_name_model_translation_draft', target_state: targetState, canonical_set_id: id, language_code: language, set_code: code, native_name: nativeName, proposed_english_display_name: proposed, proposal_class: 'model_translation_draft', native_name_remains_primary: true, english_display_is_supplement_only: true, human_review_required: true, unsigned: true, importer_ready: false, write_authorized: false, requires_authorized_current_value_reread: targetState === 'invalid_non_null_replacement', source: candidateSource });
    }
  };
  processTargets('zh-cn', zhCnTargets, cn, 'null_fill'); processTargets('zh-tw', zhTwInvalid, tw, 'invalid_non_null_replacement');
  const englishDraftByNativeName = new Map<string, string>();
  for (const candidate of candidates) {
    const language = text(candidate.language_code)!;
    const nativeName = text(candidate.native_name)!.normalize('NFKC').replace(/\s+/g, '');
    const englishDraft = text(candidate.proposed_english_display_name)!;
    const key = `${language}\u0000${nativeName}`;
    const previous = englishDraftByNativeName.get(key);
    if (previous && previous !== englishDraft) throw new Error(`Conflicting model drafts for the same native name: ${language}:${nativeName}`);
    englishDraftByNativeName.set(key, englishDraft);
  }
  candidates.sort((a, b) => `${a.language_code}\u0000${a.set_code}`.localeCompare(`${b.language_code}\u0000${b.set_code}`)); exclusions.sort((a, b) => `${a.language_code}\u0000${a.canonical_set_id}`.localeCompare(`${b.language_code}\u0000${b.canonical_set_id}`));
  const inputSha256 = { 'plan-manifest:manifest.json': fileSha(manifestPath), 'plan:canonical-metadata-repair-plan.json': fileSha(planPath), [`plan-queue:${basename(queuePath)}`]: fileSha(queuePath), 'canonical-evidence-manifest:manifest.json': fileSha(evidenceManifestPath), 'canonical-evidence-ledger:canonical-catalogue-row-evidence.jsonl': fileSha(ledgerPath), 'local-evidence:zh-cn-sets': cn.sha256, 'local-evidence:zh-tw-sets': tw.sha256, 'identity-display-source:tcgdex-chinese-set-identity-display-source.json': identityDisplaySource.bodySha256 };
  const report = { schema_version: 'stackr-chinese-set-translation-draft-review-pack-v1', mode: 'local_review_only', unsigned: true, importer_ready: false, write_authorized: false, network_accessed: false, database_accessed: false, artwork_accessed: false, native_name_remains_primary: true, english_display_is_supplement_only: true, required_before_any_write: 'A human reviewer must verify each draft against an authorised source. This pack authorises no mutation.', target_counts: { zh_cn_null_fill: zhCnTargets.size, zh_tw_invalid_non_null_replacement: zhTwInvalid.size }, candidate_counts: { zh_cn_model_translation_drafts: candidates.filter((row) => row.language_code === 'zh-cn').length, zh_tw_model_translation_drafts: candidates.filter((row) => row.language_code === 'zh-tw').length, total: candidates.length }, pinned_identity_override_count: candidates.filter((row) => record(row.source, 'candidate source').identity_resolution).length, exclusion_counts: Object.fromEntries([...new Set(exclusions.map((row) => String(row.exclusion)))].sort().map((reason) => [reason, exclusions.filter((row) => row.exclusion === reason).length])), input_sha256: inputSha256 };
  const output = resolve(args.outputDir); if (existsSync(output)) throw new Error(`Refusing to overwrite existing output directory: ${output}`); mkdirSync(output, { recursive: true }); const files: Record<string, unknown> = { 'chinese-set-english-model-translation-drafts.json': candidates, 'chinese-set-english-model-translation-draft-exclusions.json': exclusions, 'chinese-set-english-model-translation-draft-review-pack.json': report }; const outputSha256: Record<string, string> = {}; for (const [name, value] of Object.entries(files)) { const body = stable(value); writeFileSync(resolve(output, name), body, { encoding: 'utf8', flag: 'wx' }); outputSha256[name] = sha(body); } writeFileSync(resolve(output, 'manifest.json'), stable({ schema_version: '1.0.0', mode: 'local_review_only', unsigned: true, input_sha256: inputSha256, output_sha256: outputSha256 }), { encoding: 'utf8', flag: 'wx' }); return { ...report, output_sha256: outputSha256 };
}

if (require.main === module) { const values = Object.fromEntries(process.argv.slice(2).map((arg) => { const [key, ...rest] = arg.replace(/^--/, '').split('='); return [key, rest.join('=')]; })); process.stdout.write(`${JSON.stringify(buildChineseSetTranslationDraftReviewPack({ planDir: values['plan-dir'] || '.tmp/canonical-metadata-repair-plan/current-gap-audit-20260903-v3', evidenceDir: values['evidence-dir'] || '.tmp/canonical-evidence/current-gap-audit-20260903-v3', zhCnSource: values['zh-cn-source'] || 'reports/catalogue/provider-baseline/2026-08-14/raw/zh-cn.sets.json', zhTwSource: values['zh-tw-source'] || 'reports/catalogue/provider-baseline/2026-08-14/raw/zh-tw.sets.json', outputDir: values.output || '.tmp/chinese-set-translation-draft-review-pack/current-gap-audit-20260904-v4' }), null, 2)}\n`); }
