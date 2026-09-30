// Bounded native-language artwork publisher for the independently reviewed 96
// fronts. This wrapper performs no provider fetches and changes no catalogue data.
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { assertConfig as baseConfig, assertNoConflictingFronts, publishFrozenCohort, safePath } from '../artwork3303-publish-20260928/publish.mjs';

const HERE = new URL('.', import.meta.url);
const constantsFile = new URL('./frozen-constants.json', HERE);
const exceptionsFile = new URL('../../docs/releases/artwork3777-exceptions-20260930.json.gz', HERE);
const priorFiles = ['artwork3303-publish-20260928', 'english49-publish-20260930', 'tw200-publish-20260930', 'english45-publish-20260930', 'sh33-publish-20260930', 'residual146-publish-20260930'].map((name) => new URL(`../${name}/cohort.json.gz`, HERE));

export const FRONTS = 96;
export const SOURCES = Object.freeze({ en: 'tcgplayer_card_artwork', ja: 'tcgplayer_card_artwork' });
export const LANGUAGE_COUNTS = Object.freeze({ en: 16, ja: 80 });
export const EXCLUDED_PRINTING_ID = '9c2a3998-0250-4337-ac12-526484543921';
export const TCGPLAYER_SOURCE = Object.freeze({ code: 'tcgplayer_card_artwork', display_name: 'TCGplayer card artwork', source_type: 'image', base_url: 'https://tcgplayer-cdn.tcgplayer.com', licence_status: 'under_review', attribution_required: true, active: false, internal_notes: 'Frozen-cohort artwork approval only; no source-wide acquisition approval.' });

export function frozenConstants() {
  const value = JSON.parse(readFileSync(constantsFile, 'utf8'));
  check(/^[a-f0-9]{64}$/.test(value.cohort_sha256), 'Invalid native96 cohort SHA');
  check(Array.isArray(value.artifacts) && value.artifacts.length === 3, 'Native96 must have three frozen archives');
  const ids = new Set([601835903, 601835898, 601835899]);
  for (const artifact of value.artifacts) check(ids.has(artifact.id) && artifact.source_code === TCGPLAYER_SOURCE.code && ['en', 'ja'].includes(artifact.language_code) && /^[a-f0-9]{64}$/.test(artifact.sha256) && Number.isInteger(artifact.size_in_bytes) && artifact.size_in_bytes > 0, 'Invalid native96 frozen archive');
  check(new Set(value.artifacts.map((a) => a.id)).size === 3, 'Native96 archive identities changed');
  check(JSON.stringify(value.language_counts) === JSON.stringify(LANGUAGE_COUNTS), 'Native96 language counts changed');
  check(value.set_counts && typeof value.set_counts === 'object', 'Native96 set counts missing');
  return value;
}

export function exceptionLedger() {
  const rows = JSON.parse(gunzipSync(readFileSync(exceptionsFile))).filter((row) => row.category === 'Exact source needed' && ['en', 'ja'].includes(row.language_code));
  check(new Set(rows.map((row) => row.printing_id)).size === rows.length, 'Native96 exception identities are not unique');
  return new Map(rows.map((row) => [row.printing_id, row]));
}
function cohortIds(file) { return JSON.parse(gunzipSync(readFileSync(file))).map((row) => row.printing_id); }
export function assertDisjointWithCompleted(rows) {
  const completed = new Set(priorFiles.flatMap(cohortIds));
  check(rows.every((row) => !completed.has(row.printing_id)), 'Native96 overlaps a previous frozen artwork cohort');
}
function sourceUrlIsExact(row) {
  const image = new URL(row.image_url); const providerId = String(row.provider_id ?? ''); const evidence = row.evidence ?? {};
  const category = row.language_code === 'en' ? 3 : 85;
  return ['en', 'ja'].includes(row.language_code) && row.source_code === TCGPLAYER_SOURCE.code && /^\d+$/.test(providerId)
    && evidence.provider_id === providerId && evidence.provider_category_id === category && /^\d+$/.test(String(evidence.provider_group_id ?? ''))
    && evidence.metadata_url === `https://tcgcsv.com/tcgplayer/${category}/${evidence.provider_group_id}/products`
    && evidence.product_url?.startsWith(`https://www.tcgplayer.com/product/${providerId}/`) && evidence.source_url === row.image_url
    && image.protocol === 'https:' && image.hostname === 'tcgplayer-cdn.tcgplayer.com' && image.pathname === `/product/${providerId}_in_1000x1000.jpg`;
}
function normaliseCollectorPart(value) {
  const text = String(value ?? '').trim();
  // Only discard presentation zeros before a numeric leading component. The
  // remainder (for example the `a` in 054a) remains part of the identity.
  return text.replace(/^0+(?=\d)/, '');
}
export function validateVisualReview(row) {
  const review = row.evidence?.independent_visual_review;
  const original = row.objects?.find((object) => object.role === 'original');
  check(review?.passed === true && review.reviewer === 'root' && original?.sha256 && review.original_sha256 === original.sha256 && typeof review.observed_native_title === 'string' && review.observed_native_title.trim() && typeof review.observed_printed_number === 'string' && review.observed_printed_number.trim(), 'Native96 requires root literal visual review evidence');
  const sourceCollector = row.evidence?.source_collector_number;
  check(typeof sourceCollector === 'string' && sourceCollector === review.observed_printed_number, 'Native96 source and visual collector evidence differ');
  const [observedLeft] = review.observed_printed_number.split('/', 1);
  check(normaliseCollectorPart(observedLeft) === normaliseCollectorPart(row.collector_number), 'Native96 visual collector prefix changed');
  const suffixOnly = row.set_code === 'E2' && row.collector_number === '008' && row.card_native_name === 'アリアドス-008/092' && review.observed_native_title === 'アリアドス' && review.accepted_title_suffix === '-008/092';
  check(review.observed_native_title === row.card_native_name || suffixOnly, 'Native96 visual title identity changed');
}
export function validateRow(row, ledger, frozen) {
  check(ledger && row.printing_id !== EXCLUDED_PRINTING_ID, 'Native96 contains an explicitly excluded printing');
  check(sourceUrlIsExact(row), 'Wrong native96 source URL, category, or language'); validateVisualReview(row);
  for (const key of ['set_id', 'set_code', 'catalogue_version_id', 'collector_number', 'card_native_name', 'language_code']) check(row[key] === ledger[key], `Native96 frozen identity differs from reviewed ledger: ${key}`);
  for (const key of ['printing_id', 'set_id', 'catalogue_version_id']) check(/^[a-f0-9-]{36}$/.test(row[key] ?? ''), 'Invalid catalogue identity');
  check(row.objects?.length === 4 && row.objects[0].role === 'original' && new Set(row.objects.map((object) => object.role)).size === 4, 'Incomplete native96 derivatives');
  for (const object of row.objects) { check(['original', 'card-grid', 'search-result', 'detail-page'].includes(object.role), 'Unexpected object role'); check(frozen.artifacts.some((a) => a.id === object.artifact_id && a.language_code === row.language_code) && /^[a-f0-9]{64}$/.test(object.sha256 ?? '') && object.byte_size > 0 && object.byte_size < 12_000_000 && object.width > 0 && object.height > 0, 'Invalid frozen object evidence'); check(object.mime_type === (object.role === 'original' ? 'image/jpeg' : 'image/webp'), 'Wrong native96 object format'); safePath('/packages', `${object.artifact_id}/${object.file}`); }
}

export function validatePlan(bytes, receipt) {
  const frozen = frozenConstants();
  check(digest(bytes) === frozen.cohort_sha256 && receipt.cohort_sha256 === frozen.cohort_sha256, 'Frozen native96 cohort changed');
  check(receipt.artifacts?.length === frozen.artifacts.length && frozen.artifacts.every((a) => receipt.artifacts.some((b) => b.id === a.id && b.sha256 === a.sha256 && b.size_in_bytes === a.size_in_bytes)), 'Frozen native96 archive changed');
  const rows = JSON.parse(gunzipSync(bytes)); const eligible = exceptionLedger();
  check(rows.length === FRONTS && new Set(rows.map((row) => row.printing_id)).size === FRONTS, 'Wrong native96 front count');
  check(rows.every((row) => eligible.has(row.printing_id) && row.printing_id !== EXCLUDED_PRINTING_ID), 'Native96 contains an unreviewed or explicitly excluded printing');
  for (const [language, count] of Object.entries(LANGUAGE_COUNTS)) check(rows.filter((row) => row.language_code === language).length === count, 'Native96 language cohort changed');
  check(Object.values(frozen.set_counts).reduce((sum, count) => sum + count, 0) === FRONTS, 'Native96 set counts do not sum to cohort');
  for (const [key, count] of Object.entries(frozen.set_counts)) { const [language, setCode] = key.split('/'); check(rows.filter((row) => row.language_code === language && row.set_code === setCode).length === count, 'Native96 set cohort changed'); }
  for (const row of rows) {
    validateRow(row, eligible.get(row.printing_id), frozen);
  }
  assertNoConflictingFronts(rows); assertDisjointWithCompleted(rows); return rows;
}
export function validateApproval(approval) { const frozen = frozenConstants(); check(approval.approved === true && approval.store_resize_display === true && approval.fronts === FRONTS && approval.cohort_sha256 === frozen.cohort_sha256, 'Native96 publication approval is pending'); check(approval.source_wide_approval === false && approval.source_counts?.tcgplayer_card_artwork === FRONTS, 'Native96 approval scope changed'); check(typeof approval.owner_statement === 'string' && approval.owner_statement.trim() && approval.approved_at, 'Native96 owner evidence missing'); }
export function assertConfig(env) { check(env.STACKR_NATIVE96_CONFIRMATION === 'PUBLISH NATIVE96', 'Native96 release confirmation required'); baseConfig({ ...env, STACKR_ARTWORK3303_CONFIRMATION: 'PUBLISH ARTWORK3303' }); }
async function insertStagingProvenance(db) { await db.query('insert into ingest.sources(code,display_name,source_type,base_url,licence_status,attribution_required,active,internal_notes) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(code) do nothing', Object.values(TCGPLAYER_SOURCE)); }
export async function sourcesFor(db, _receipt, environment) { if (environment === 'staging') await insertStagingProvenance(db); const rows = (await db.query('select * from ingest.sources where code=$1 for share', [TCGPLAYER_SOURCE.code])).rows; const source = rows[0]; check(rows.length === 1 && source && Object.entries(TCGPLAYER_SOURCE).every(([key, value]) => source[key] === value) && !source.deprecated_at, 'TCGplayer image provenance changed'); return new Map([[TCGPLAYER_SOURCE.code, source.id]]); }
async function main() { assertConfig(process.env); check(process.argv.includes('--execute'), 'Explicit execution required'); const receipt = JSON.parse(await readFile(new URL('./plan-receipt.json', HERE))); const approval = JSON.parse(await readFile(new URL('./approval.json', HERE))); validateApproval(approval); const rows = validatePlan(await readFile(new URL('./cohort.json.gz', HERE)), receipt); await publishFrozenCohort({ rows, receipt, approval, root: process.env.STACKR_NATIVE96_PACKAGES, output: process.env.STACKR_NATIVE96_OUTPUT, sourceResolver: sourcesFor }); }
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
