// Frozen 45-front English release wrapper. It makes no provider request and
// delegates transfer, rehearsal and publication to the reviewed publisher.
import { readFileSync, existsSync } from 'node:fs';
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

const HERE = new URL('.', import.meta.url);
const constantsFile = new URL('./frozen-constants.json', HERE);
const exceptionsFile = new URL('../../docs/releases/artwork4250-exceptions-20260928.json.gz', HERE);
const prior7911File = new URL('../artwork3303-publish-20260928/cohort.json.gz', HERE);
const prior49File = new URL('../english49-publish-20260930/cohort.json.gz', HERE);
const tw200File = new URL('../tw200-publish-20260930/cohort.json.gz', HERE);

export const FRONTS = 45;
export const SOURCE = 'pokemon_tcg_api';
export const LANGUAGE = 'en';
export const SET_COUNTS = Object.freeze({ ecard2: 9, ecard3: 9, cel25cc: 24, bwp: 2, svp: 1 });
export const SOURCE_RECORD = Object.freeze({
  display_name: 'Pokemon TCG API',
  source_type: 'catalogue',
  base_url: 'https://api.pokemontcg.io/v2',
  licence_status: 'under_review',
  attribution_required: true,
  active: true,
  internal_notes: 'Automated refresh disabled until provider terms review explicitly allows it.',
});

export function frozenConstants() {
  const value = JSON.parse(readFileSync(constantsFile, 'utf8'));
  check(/^[a-f0-9]{64}$/.test(value.cohort_sha256), 'Invalid frozen cohort SHA');
  check(/^[a-f0-9]{64}$/.test(value.archive_sha256), 'Invalid frozen archive SHA');
  check(Number.isInteger(value.archive_id) && value.archive_id > 0, 'Invalid frozen archive ID');
  check(Number.isInteger(value.archive_bytes) && value.archive_bytes > 0, 'Invalid frozen archive byte count');
  return value;
}

export function exceptionLedger() {
  const exceptions = JSON.parse(gunzipSync(readFileSync(exceptionsFile)));
  const rows = exceptions.filter((row) => row.language_code === LANGUAGE
    && row.category === 'Exact source needed' && Object.hasOwn(SET_COUNTS, row.set_code));
  check(new Set(rows.map((row) => row.printing_id)).size === rows.length, 'English45 exception-ledger identities are not unique');
  return new Map(rows.map((row) => [row.printing_id, row]));
}

function completedIds(file) {
  return new Set(JSON.parse(gunzipSync(readFileSync(file))).map((row) => row.printing_id));
}

export function assertDisjointWithCompleted(rows) {
  const completed = new Set([...completedIds(prior7911File), ...completedIds(prior49File)]);
  // TW200 is a sibling release being frozen in parallel.  When its immutable
  // cohort exists it is included; it is never a dependency on a local source.
  if (existsSync(tw200File)) for (const id of completedIds(tw200File)) completed.add(id);
  check(rows.every((row) => !completed.has(row.printing_id)), 'English45 overlaps a completed or frozen artwork cohort');
}

export function validatePlan(bytes, receipt) {
  const frozen = frozenConstants();
  check(digest(bytes) === frozen.cohort_sha256 && receipt.cohort_sha256 === frozen.cohort_sha256, 'Frozen English45 cohort changed');
  check(receipt.artifacts?.length === 1, 'English45 must use exactly one frozen archive');
  const archive = receipt.artifacts[0];
  check(archive.id === frozen.archive_id && archive.sha256 === frozen.archive_sha256 && archive.size_in_bytes === frozen.archive_bytes, 'Frozen English45 archive changed');
  const rows = JSON.parse(gunzipSync(bytes));
  const eligible = exceptionLedger();
  check(rows.length === FRONTS && new Set(rows.map((row) => row.printing_id)).size === FRONTS, 'Wrong English45 front count');
  check(rows.every((row) => eligible.has(row.printing_id)), 'English45 contains a printing outside the reviewed exception ledger');
  for (const [setCode, count] of Object.entries(SET_COUNTS)) check(rows.filter((row) => row.set_code === setCode).length === count, 'English45 set cohort changed');
  for (const row of rows) {
    const ledger = eligible.get(row.printing_id);
    const image = new URL(row.image_url);
    check(row.source_code === SOURCE && row.language_code === LANGUAGE && image.protocol === 'https:' && image.hostname === 'images.pokemontcg.io' && image.pathname.endsWith('_hires.png'), 'Wrong English45 image source');
    for (const key of ['set_id', 'set_code', 'catalogue_version_id', 'collector_number', 'card_native_name']) {
      check(row[key] === ledger[key], `English45 frozen identity differs from reviewed ledger: ${key}`);
    }
    check(typeof row.provider_id === 'string' && row.provider_id.length > 0, 'English45 provider ID missing');
    check(row.evidence?.provider_id === row.provider_id && row.evidence?.source_url === row.image_url, 'English45 provider alias evidence changed');
    check(row.evidence?.metadata_repository === 'PokemonTCG/pokemon-tcg-data' && /^[a-f0-9]{40}$/.test(row.evidence?.metadata_revision ?? ''), 'English45 metadata provenance changed');
    for (const key of ['printing_id', 'set_id', 'catalogue_version_id']) check(/^[a-f0-9-]{36}$/.test(row[key] ?? ''), 'Invalid catalogue identity');
    check(row.objects?.length === 4 && row.objects[0].role === 'original' && new Set(row.objects.map((object) => object.role)).size === 4, 'Incomplete derivatives');
    for (const object of row.objects) {
      check(['original', 'card-grid', 'search-result', 'detail-page'].includes(object.role), 'Unexpected object role');
      check(object.artifact_id === frozen.archive_id && /^[a-f0-9]{64}$/.test(object.sha256 ?? '') && object.byte_size > 0 && object.byte_size < 12_000_000 && object.width > 0 && object.height > 0, 'Invalid frozen object evidence');
      check(object.mime_type === (object.role === 'original' ? 'image/png' : 'image/webp'), 'Wrong English45 object format');
      safePath('/packages', `${object.artifact_id}/${object.file}`);
    }
  }
  assertNoConflictingFronts(rows);
  assertDisjointWithCompleted(rows);
  return rows;
}

export function validateApproval(approval) {
  const frozen = frozenConstants();
  check(approval.approved === true && approval.store_resize_display === true && approval.fronts === FRONTS && approval.cohort_sha256 === frozen.cohort_sha256, 'English45 publication approval is pending');
  check(approval.source_code === SOURCE && approval.language_code === LANGUAGE && approval.source_wide_approval === false, 'English45 approval scope changed');
  check(typeof approval.owner_statement === 'string' && approval.owner_statement.trim() && approval.approved_at, 'English45 owner evidence missing');
}

export function assertConfig(env) {
  check(env.STACKR_ENGLISH45_CONFIRMATION === 'PUBLISH ENGLISH45', 'English45 release confirmation required');
  baseConfig({ ...env, STACKR_ARTWORK3303_CONFIRMATION: 'PUBLISH ARTWORK3303' });
}

export async function sourcesFor(db) {
  const rows = (await db.query("select * from ingest.sources where code='pokemon_tcg_api' for share")).rows;
  const source = rows[0];
  check(rows.length === 1 && source.code === SOURCE && source.deprecated_at == null
    && Object.entries(SOURCE_RECORD).every(([key, value]) => source[key] === value), 'Existing Pokemon TCG API provenance changed');
  return new Map([[SOURCE, source.id]]);
}

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
    root: process.env.STACKR_ENGLISH45_PACKAGES,
    output: process.env.STACKR_ENGLISH45_OUTPUT,
    sourceResolver: sourcesFor,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
