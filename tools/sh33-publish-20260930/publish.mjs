// Frozen SH33 release wrapper. It delegates byte transfer and publication to
// the reviewed publisher, while retaining the one reviewed set-total change.
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import {
  assertConfig as baseConfig,
  assertNoConflictingFronts,
  publishFrozenCohort,
  safePath,
} from '../artwork3303-publish-20260928/publish.mjs';
import { sourcesFor as taiwanSourcesFor } from '../tw200-publish-20260930/publish.mjs';
import { TARGET, catalogueCorrection } from './repair.mjs';

const HERE = new URL('.', import.meta.url);
const constantsFile = new URL('./frozen-constants.json', HERE);
const exceptionsFile = new URL('../../docs/releases/artwork4250-exceptions-20260928.json.gz', HERE);
const prior7911File = new URL('../artwork3303-publish-20260928/cohort.json.gz', HERE);
const prior49File = new URL('../english49-publish-20260930/cohort.json.gz', HERE);
const tw200File = new URL('../tw200-publish-20260930/cohort.json.gz', HERE);
const english45File = new URL('../english45-publish-20260930/cohort.json.gz', HERE);

export const FRONTS = 33;
export const SOURCE = 'pokemon_card_tw_official';
export const LANGUAGE = 'zh-tw';
export const SET_CODE = 'SH';
export const COLLECTORS = Object.freeze(Array.from({ length: FRONTS }, (_, index) => String(index + 21).padStart(3, '0')));

export function frozenConstants() {
  const value = JSON.parse(readFileSync(constantsFile, 'utf8'));
  check(/^[a-f0-9]{64}$/.test(value.cohort_sha256), 'Invalid frozen SH33 cohort SHA');
  check(/^[a-f0-9]{64}$/.test(value.archive_sha256), 'Invalid frozen SH33 archive SHA');
  check(Number.isInteger(value.archive_id) && value.archive_id > 0, 'Invalid frozen SH33 archive ID');
  check(Number.isInteger(value.archive_bytes) && value.archive_bytes > 0, 'Invalid frozen SH33 archive byte count');
  return value;
}

export function exceptionLedger() {
  const exceptions = JSON.parse(gunzipSync(readFileSync(exceptionsFile)));
  const rows = exceptions.filter((row) => row.language_code === LANGUAGE
    && row.category === 'Printed denominator conflict' && row.set_code === SET_CODE);
  check(rows.length === FRONTS && new Set(rows.map((row) => row.printing_id)).size === FRONTS, 'SH33 exception-ledger membership drift');
  check(rows.every((row) => row.set_id === TARGET.set_id && row.catalogue_version_id === TARGET.catalogue_version_id
    && COLLECTORS.includes(row.collector_number)), 'SH33 exception-ledger identity scope drift');
  return new Map(rows.map((row) => [row.printing_id, row]));
}

const cohortIds = (file) => new Set(JSON.parse(gunzipSync(readFileSync(file))).map((row) => row.printing_id));

export function assertDisjointWithCompleted(rows) {
  const completed = [prior7911File, prior49File, tw200File, english45File].map(cohortIds);
  check(rows.every((row) => completed.every((ids) => !ids.has(row.printing_id))), 'SH33 overlaps an earlier artwork cohort');
}

export function metadataCorrection(value) {
  check(value && value.table === 'catalog.sets' && value.id === TARGET.set_id
    && value.column === 'printed_total' && value.before === TARGET.before && value.after === TARGET.after
    && value.preserve_total === true, 'SH33 metadata correction scope changed');
  return value;
}

export function validatePlan(bytes, receipt) {
  const frozen = frozenConstants();
  check(digest(bytes) === frozen.cohort_sha256 && receipt.cohort_sha256 === frozen.cohort_sha256, 'Frozen SH33 cohort changed');
  check(receipt.fronts === FRONTS && receipt.derivative_references === FRONTS * 3 && receipt.source === SOURCE && receipt.language === LANGUAGE, 'SH33 receipt scope changed');
  metadataCorrection(receipt.metadata_correction);
  check(receipt.artifacts?.length === 1, 'SH33 must use exactly one frozen archive');
  const archive = receipt.artifacts[0];
  check(archive.id === frozen.archive_id && archive.sha256 === frozen.archive_sha256 && archive.size_in_bytes === frozen.archive_bytes, 'Frozen SH33 archive changed');
  const rows = JSON.parse(gunzipSync(bytes));
  const eligible = exceptionLedger();
  check(rows.length === FRONTS && new Set(rows.map((row) => row.printing_id)).size === FRONTS, 'Wrong SH33 front count');
  check(rows.every((row) => eligible.has(row.printing_id)), 'SH33 contains a printing outside the reviewed exception ledger');
  check(JSON.stringify([...rows.map((row) => row.collector_number)].sort()) === JSON.stringify(COLLECTORS), 'SH33 collector scope changed');
  for (const row of rows) {
    const ledger = eligible.get(row.printing_id);
    const image = new URL(row.image_url);
    check(row.source_code === SOURCE && row.language_code === LANGUAGE && row.set_id === TARGET.set_id && row.set_code === SET_CODE
      && image.protocol === 'https:' && image.hostname === 'asia.pokemon-card.com' && image.pathname.startsWith('/tw/card-img/'), 'Wrong SH33 artwork source');
    for (const key of ['set_id', 'set_code', 'catalogue_version_id', 'collector_number', 'card_native_name']) {
      check(row[key] === ledger[key], `SH33 frozen identity differs from reviewed ledger: ${key}`);
    }
    check(row.identity_url?.startsWith('https://asia.pokemon-card.com/tw/card-search/detail/'), 'Wrong SH33 identity source');
    check(row.evidence?.proposed_printed_total === TARGET.after && row.evidence?.catalogue_printed_total_before === TARGET.before, 'SH33 denominator evidence changed');
    for (const key of ['printing_id', 'set_id', 'catalogue_version_id']) check(/^[a-f0-9-]{36}$/.test(row[key] ?? ''), 'Invalid SH33 catalogue identity');
    check(row.objects?.length === 4 && row.objects[0].role === 'original' && new Set(row.objects.map((object) => object.role)).size === 4, 'Incomplete SH33 derivatives');
    for (const object of row.objects) {
      check(['original', 'card-grid', 'search-result', 'detail-page'].includes(object.role), 'Unexpected SH33 object role');
      check(object.artifact_id === frozen.archive_id && /^[a-f0-9]{64}$/.test(object.sha256 ?? '')
        && object.byte_size > 0 && object.byte_size < 12_000_000 && object.width > 0 && object.height > 0, 'Invalid SH33 object evidence');
      check(object.mime_type === (object.role === 'original' ? 'image/png' : 'image/webp'), 'Wrong SH33 object format');
      safePath('/packages', `${object.artifact_id}/${object.file}`);
    }
  }
  assertNoConflictingFronts(rows);
  assertDisjointWithCompleted(rows);
  return rows;
}

export function validateApproval(approval) {
  const frozen = frozenConstants();
  check(approval.approved === true && approval.store_resize_display_official_tw === true
    && approval.fronts === FRONTS && approval.cohort_sha256 === frozen.cohort_sha256, 'SH33 publication approval is pending');
  check(approval.source_code === SOURCE && approval.language_code === LANGUAGE && approval.source_wide_approval === false, 'SH33 approval scope changed');
  metadataCorrection(approval.metadata_correction);
  check(typeof approval.owner_statement === 'string' && approval.owner_statement.trim() && approval.approved_at, 'SH33 owner evidence missing');
}

export function assertConfig(env) {
  check(env.STACKR_SH33_CONFIRMATION === 'PUBLISH SH33', 'SH33 release confirmation required');
  baseConfig({ ...env, STACKR_ARTWORK3303_CONFIRMATION: 'PUBLISH ARTWORK3303' });
}

// Reuse the reviewed inactive Taiwan provenance guard without broadening it.
export const sourcesFor = taiwanSourcesFor;

async function main() {
  assertConfig(process.env);
  check(process.argv.includes('--execute'), 'Explicit execution required');
  const receipt = JSON.parse(await readFile(new URL('./plan-receipt.json', HERE)));
  const approval = JSON.parse(await readFile(new URL('./approval.json', HERE)));
  validateApproval(approval);
  const rows = validatePlan(await readFile(new URL('./cohort.json.gz', HERE)), receipt);
  await publishFrozenCohort({
    rows,
    receipt,
    approval,
    root: process.env.STACKR_SH33_PACKAGES,
    output: process.env.STACKR_SH33_OUTPUT,
    sourceResolver: sourcesFor,
    catalogueCorrection,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
