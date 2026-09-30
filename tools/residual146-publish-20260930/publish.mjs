// Frozen 146-front residual release wrapper. It never fetches a provider and
// delegates validation, rollback rehearsals, immutable transfer and binding to
// the established bounded publisher.
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { assertConfig as baseConfig, assertNoConflictingFronts, publishFrozenCohort, safePath } from '../artwork3303-publish-20260928/publish.mjs';

const HERE = new URL('.', import.meta.url);
const constantsFile = new URL('./frozen-constants.json', HERE);
const exceptionsFile = new URL('../../docs/releases/artwork3923-exceptions-20260930.json.gz', HERE);
const priorFiles = [
  new URL('../artwork3303-publish-20260928/cohort.json.gz', HERE),
  new URL('../english49-publish-20260930/cohort.json.gz', HERE),
  new URL('../tw200-publish-20260930/cohort.json.gz', HERE),
  new URL('../english45-publish-20260930/cohort.json.gz', HERE),
  new URL('../sh33-publish-20260930/cohort.json.gz', HERE),
];
export const FRONTS = 146;
export const SOURCES = Object.freeze({ en: 'tcgplayer_card_artwork', 'zh-tw': 'pokemon_card_tw_official' });
export const SOURCE_COUNTS = Object.freeze({ tcgplayer_card_artwork: 138, pokemon_card_tw_official: 8 });
export const TW_SOURCE_NOTES = 'Provenance only; acquisition inactive. Exactly 4926 Taiwanese fronts in the frozen recovered-artwork cohort 20f4d3b1e5673f494c05c0330257296f78e3b35c21b06254523dfb066ea2f2cd; no source-wide approval.';
export const TCGPLAYER_SOURCE = Object.freeze({ code: SOURCES.en, display_name: 'TCGplayer card artwork', source_type: 'image', base_url: 'https://tcgplayer-cdn.tcgplayer.com', licence_status: 'under_review', attribution_required: true, active: false, internal_notes: 'Frozen-cohort artwork approval only; no source-wide acquisition approval.' });

export function frozenConstants() {
  const value = JSON.parse(readFileSync(constantsFile, 'utf8'));
  check(/^[a-f0-9]{64}$/.test(value.cohort_sha256), 'Invalid residual146 cohort SHA');
  check(Array.isArray(value.artifacts) && value.artifacts.length === 2, 'Residual146 must have two frozen archives');
  for (const archive of value.artifacts) check(Number.isInteger(archive.id) && archive.id > 0 && /^[a-f0-9]{64}$/.test(archive.sha256) && Number.isInteger(archive.size_in_bytes) && archive.size_in_bytes > 0 && Object.hasOwn(SOURCE_COUNTS, archive.source_code), 'Invalid frozen residual146 archive');
  check(new Set(value.artifacts.map((archive) => archive.source_code)).size === 2, 'Residual146 archives must be one per source');
  check(JSON.stringify(value.source_counts) === JSON.stringify(SOURCE_COUNTS), 'Residual146 source counts changed');
  check(value.set_counts && typeof value.set_counts === 'object', 'Residual146 set counts missing');
  return value;
}

export function exceptionLedger() {
  const rows = JSON.parse(gunzipSync(readFileSync(exceptionsFile))).filter((row) => row.category === 'Exact source needed' && ((row.language_code === 'en') || (row.language_code === 'zh-tw')));
  check(new Set(rows.map((row) => row.printing_id)).size === rows.length, 'Residual146 exception identities are not unique');
  return new Map(rows.map((row) => [row.printing_id, row]));
}
function cohortIds(file) { return JSON.parse(gunzipSync(readFileSync(file))).map((row) => row.printing_id); }
export function assertDisjointWithCompleted(rows) {
  const completed = new Set(priorFiles.flatMap(cohortIds));
  check(rows.every((row) => !completed.has(row.printing_id)), 'Residual146 overlaps a previous frozen artwork cohort');
}
function sourceUrlIsExact(row) {
  const image = new URL(row.image_url);
  if (row.source_code === SOURCES.en) {
    const productId = String(row.provider_id ?? '');
    const groupId = String(row.evidence?.provider_group_id ?? '');
    return row.language_code === 'en' && /^\d+$/.test(productId) && row.evidence?.provider_id === productId
      && row.evidence?.provider_category_id === 3 && /^\d+$/.test(groupId)
      && row.evidence?.metadata_url === `https://tcgcsv.com/tcgplayer/3/${groupId}/products`
      && row.evidence?.product_url?.startsWith(`https://www.tcgplayer.com/product/${productId}/`)
      && row.evidence?.source_url === row.image_url
      && image.protocol === 'https:' && image.hostname === 'tcgplayer-cdn.tcgplayer.com' && image.pathname === `/product/${productId}_in_1000x1000.jpg`;
  }
  return row.source_code === SOURCES['zh-tw'] && row.language_code === 'zh-tw' && image.protocol === 'https:' && image.hostname === 'asia.pokemon-card.com' && image.pathname.startsWith('/tw/card-img/');
}
export function validatePlan(bytes, receipt) {
  const frozen = frozenConstants();
  check(digest(bytes) === frozen.cohort_sha256 && receipt.cohort_sha256 === frozen.cohort_sha256, 'Frozen residual146 cohort changed');
  check(receipt.artifacts?.length === frozen.artifacts.length && frozen.artifacts.every((a) => receipt.artifacts.some((b) => b.id === a.id && b.sha256 === a.sha256 && b.size_in_bytes === a.size_in_bytes)), 'Frozen residual146 archive changed');
  const rows = JSON.parse(gunzipSync(bytes)); const eligible = exceptionLedger();
  check(rows.length === FRONTS && new Set(rows.map((row) => row.printing_id)).size === FRONTS, 'Wrong residual146 front count');
  check(rows.every((row) => eligible.has(row.printing_id)), 'Residual146 contains a printing outside its reviewed ledger');
  for (const [source, count] of Object.entries(SOURCE_COUNTS)) check(rows.filter((row) => row.source_code === source).length === count, 'Residual146 source cohort changed');
  check(Object.values(frozen.set_counts).reduce((sum, count) => sum + count, 0) === FRONTS, 'Residual146 set counts do not sum to cohort');
  for (const [setCode, count] of Object.entries(frozen.set_counts)) check(rows.filter((row) => row.set_code === setCode).length === count, 'Residual146 set cohort changed');
  for (const row of rows) {
    const ledger = eligible.get(row.printing_id);
    check(sourceUrlIsExact(row), 'Wrong residual146 source URL or language');
    for (const key of ['set_id', 'set_code', 'catalogue_version_id', 'collector_number', 'card_native_name']) check(row[key] === ledger[key], `Residual146 frozen identity differs from reviewed ledger: ${key}`);
    for (const key of ['printing_id', 'set_id', 'catalogue_version_id']) check(/^[a-f0-9-]{36}$/.test(row[key] ?? ''), 'Invalid catalogue identity');
    check(row.objects?.length === 4 && row.objects[0].role === 'original' && new Set(row.objects.map((o) => o.role)).size === 4, 'Incomplete residual146 derivatives');
    for (const object of row.objects) { check(['original', 'card-grid', 'search-result', 'detail-page'].includes(object.role), 'Unexpected object role'); check(frozen.artifacts.some((a) => a.id === object.artifact_id && a.source_code === row.source_code) && /^[a-f0-9]{64}$/.test(object.sha256 ?? '') && object.byte_size > 0 && object.byte_size < 12_000_000 && object.width > 0 && object.height > 0, 'Invalid frozen object evidence'); check(object.mime_type === (object.role === 'original' ? (row.source_code === SOURCES.en ? 'image/jpeg' : 'image/png') : 'image/webp'), 'Wrong residual146 object format'); safePath('/packages', `${object.artifact_id}/${object.file}`); }
  }
  assertNoConflictingFronts(rows); assertDisjointWithCompleted(rows); return rows;
}
export function validateApproval(approval) { const frozen = frozenConstants(); check(approval.approved === true && approval.store_resize_display === true && approval.fronts === FRONTS && approval.cohort_sha256 === frozen.cohort_sha256, 'Residual146 publication approval is pending'); check(approval.source_wide_approval === false && approval.source_counts?.tcgplayer_card_artwork === 138 && approval.source_counts?.pokemon_card_tw_official === 8, 'Residual146 approval scope changed'); check(typeof approval.owner_statement === 'string' && approval.owner_statement.trim() && approval.approved_at, 'Residual146 owner evidence missing'); }
export function assertConfig(env) { check(env.STACKR_RESIDUAL146_CONFIRMATION === 'PUBLISH RESIDUAL146', 'Residual146 release confirmation required'); baseConfig({ ...env, STACKR_ARTWORK3303_CONFIRMATION: 'PUBLISH ARTWORK3303' }); }
async function ensureTcgplayer(db) { await db.query("insert into ingest.sources(code,display_name,source_type,base_url,licence_status,attribution_required,active,internal_notes) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(code) do nothing", Object.values(TCGPLAYER_SOURCE)); }
export async function sourcesFor(db, _receipt, environment) {
  await ensureTcgplayer(db);
  // Staging needs an identical provenance row solely within the rollback rehearsal;
  // production must already contain its established inactive Taiwan record.
  if (environment === 'staging') await db.query("insert into ingest.sources(code,display_name,source_type,base_url,licence_status,attribution_required,active,internal_notes) values('pokemon_card_tw_official','Pokémon Taiwan official artwork','image','https://asia.pokemon-card.com/tw','under_review',true,false,$1) on conflict(code) do nothing", [TW_SOURCE_NOTES]);
  const rows = (await db.query("select * from ingest.sources where code=any($1::text[]) for share", [[SOURCES.en, SOURCES['zh-tw']]])).rows; const byCode = new Map(rows.map((r) => [r.code, r])); const en = byCode.get(SOURCES.en); const tw = byCode.get(SOURCES['zh-tw']); check(rows.length === 2 && en && Object.entries(TCGPLAYER_SOURCE).every(([key, value]) => en[key] === value) && !en.deprecated_at, 'TCGplayer image provenance changed'); check(tw && tw.source_type === 'image' && tw.base_url === 'https://asia.pokemon-card.com/tw' && tw.active === false && tw.licence_status === 'under_review' && tw.attribution_required === true && tw.internal_notes === TW_SOURCE_NOTES && !tw.deprecated_at, 'Existing Taiwan provenance changed'); return new Map([[SOURCES.en, en.id], [SOURCES['zh-tw'], tw.id]]); }
async function main() { assertConfig(process.env); check(process.argv.includes('--execute'), 'Explicit execution required'); const receipt = JSON.parse(await readFile(new URL('./plan-receipt.json', HERE))); const approval = JSON.parse(await readFile(new URL('./approval.json', HERE))); validateApproval(approval); const rows = validatePlan(await readFile(new URL('./cohort.json.gz', HERE)), receipt); await publishFrozenCohort({ rows, receipt, approval, root: process.env.STACKR_RESIDUAL146_PACKAGES, output: process.env.STACKR_RESIDUAL146_OUTPUT, sourceResolver: sourcesFor }); }
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error.message); process.exitCode = 1; });





