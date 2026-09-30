// Frozen 200-front Taiwanese release wrapper. It performs no provider request
// and delegates transfer, rehearsal and publication to the reviewed publisher.
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

const HERE = new URL('.', import.meta.url);
const constantsFile = new URL('./frozen-constants.json', HERE);
// This committed exception ledger is the reviewed membership boundary.  The
// detailed official identity evidence travels with each frozen cohort row and
// its archive, so a runner never depends on a workstation-only candidates file.
const exceptionsFile = new URL('../../docs/releases/artwork4250-exceptions-20260928.json.gz', HERE);
const prior7911File = new URL('../artwork3303-publish-20260928/cohort.json.gz', HERE);
const prior49File = new URL('../english49-publish-20260930/cohort.json.gz', HERE);
export const FRONTS = 200;
export const SOURCE = 'pokemon_card_tw_official';
export const LANGUAGE = 'zh-tw';
export const SET_COUNTS = Object.freeze({ SN: 5, SV4K: 46, SV4M: 46, SV5K: 26, SV5M: 77 });
export const TW_SOURCE_NOTES = 'Provenance only; acquisition inactive. Exactly 4926 Taiwanese fronts in the frozen recovered-artwork cohort 20f4d3b1e5673f494c05c0330257296f78e3b35c21b06254523dfb066ea2f2cd; no source-wide approval.';

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
  check(rows.length === FRONTS && new Set(rows.map((row) => row.printing_id)).size === FRONTS, 'TW200 exception-ledger membership drift');
  for (const [setCode, count] of Object.entries(SET_COUNTS)) {
    check(rows.filter((row) => row.set_code === setCode).length === count, 'TW200 exception-ledger set scope drift');
  }
  return new Map(rows.map((row) => [row.printing_id, row]));
}

export function assertDisjointWithCompleted(rows) {
  const completed = new Set(JSON.parse(gunzipSync(readFileSync(prior7911File))).map((row) => row.printing_id));
  const english49 = new Set(JSON.parse(gunzipSync(readFileSync(prior49File))).map((row) => row.printing_id));
  check(rows.every((row) => !completed.has(row.printing_id) && !english49.has(row.printing_id)), 'TW200 overlaps a completed artwork cohort');
}

export function validatePlan(bytes, receipt) {
  const frozen = frozenConstants();
  check(digest(bytes) === frozen.cohort_sha256 && receipt.cohort_sha256 === frozen.cohort_sha256, 'Frozen TW200 cohort changed');
  check(receipt.artifacts?.length === 1, 'TW200 must use exactly one frozen archive');
  const archive = receipt.artifacts[0];
  check(archive.id === frozen.archive_id && archive.sha256 === frozen.archive_sha256 && archive.size_in_bytes === frozen.archive_bytes, 'Frozen TW200 archive changed');
  const rows = JSON.parse(gunzipSync(bytes));
  const eligible = exceptionLedger();
  check(rows.length === FRONTS && new Set(rows.map((row) => row.printing_id)).size === FRONTS, 'Wrong TW200 front count');
  check(rows.every((row) => eligible.has(row.printing_id)), 'TW200 contains a printing outside the reviewed exception ledger');
  for (const [setCode, count] of Object.entries(SET_COUNTS)) check(rows.filter((row) => row.set_code === setCode).length === count, 'TW200 set cohort changed');
  for (const row of rows) {
    const ledger = eligible.get(row.printing_id);
    const image = new URL(row.image_url);
    check(row.source_code === SOURCE && row.language_code === LANGUAGE && image.protocol === 'https:' && image.hostname === 'asia.pokemon-card.com' && image.pathname.startsWith('/tw/card-img/'), 'Wrong Taiwanese image source');
    for (const key of ['set_id', 'set_code', 'catalogue_version_id', 'collector_number', 'card_native_name']) {
      check(row[key] === ledger[key], `TW200 frozen identity differs from reviewed ledger: ${key}`);
    }
    check(row.identity_url?.startsWith('https://asia.pokemon-card.com/tw/card-search/detail/'), 'Wrong Taiwanese identity source');
    for (const key of ['printing_id', 'set_id', 'catalogue_version_id']) check(/^[a-f0-9-]{36}$/.test(row[key] ?? ''), 'Invalid catalogue identity');
    check(row.objects?.length === 4 && row.objects[0].role === 'original' && new Set(row.objects.map((object) => object.role)).size === 4, 'Incomplete derivatives');
    for (const object of row.objects) {
      check(['original', 'card-grid', 'search-result', 'detail-page'].includes(object.role), 'Unexpected object role');
      check(object.artifact_id === frozen.archive_id && /^[a-f0-9]{64}$/.test(object.sha256 ?? '') && object.byte_size > 0 && object.byte_size < 12_000_000 && object.width > 0 && object.height > 0, 'Invalid frozen object evidence');
      check(object.mime_type === (object.role === 'original' ? 'image/png' : 'image/webp'), 'Wrong TW200 object format');
      safePath('/packages', `${object.artifact_id}/${object.file}`);
    }
  }
  assertNoConflictingFronts(rows);
  assertDisjointWithCompleted(rows);
  return rows;
}

export function validateApproval(approval) {
  const frozen = frozenConstants();
  check(approval.approved === true && approval.store_resize_display_official_tw === true && approval.fronts === FRONTS && approval.cohort_sha256 === frozen.cohort_sha256, 'TW200 publication approval is pending');
  check(approval.source_code === SOURCE && approval.language_code === LANGUAGE && approval.source_wide_approval === false, 'TW200 approval scope changed');
  check(typeof approval.owner_statement === 'string' && approval.owner_statement.trim() && approval.approved_at, 'TW200 owner evidence missing');
}

export function assertConfig(env) {
  check(env.STACKR_TW200_CONFIRMATION === 'PUBLISH TW200', 'TW200 release confirmation required');
  baseConfig({ ...env, STACKR_ARTWORK3303_CONFIRMATION: 'PUBLISH ARTWORK3303' });
}

export async function sourcesFor(db, _receipt, environment) {
  // Staging's missing provenance row is a rehearsal-only fixture. Production
  // only locks and reads its established inactive provenance record.
  if (environment === 'staging') {
    await db.query("insert into ingest.sources(code,display_name,source_type,base_url,licence_status,attribution_required,active,internal_notes) values('pokemon_card_tw_official','Pokémon Taiwan official artwork','image','https://asia.pokemon-card.com/tw','under_review',true,false,$1) on conflict(code) do nothing", [TW_SOURCE_NOTES]);
  }
  const rows = (await db.query("select * from ingest.sources where code='pokemon_card_tw_official' for share")).rows;
  const source = rows[0];
  check(rows.length === 1 && source.source_type === 'image' && source.base_url === 'https://asia.pokemon-card.com/tw' && source.active === false && source.licence_status === 'under_review' && !source.deprecated_at && source.internal_notes === TW_SOURCE_NOTES, 'Existing inactive Taiwan provenance changed');
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
    root: process.env.STACKR_TW200_PACKAGES,
    output: process.env.STACKR_TW200_OUTPUT,
    sourceResolver: sourcesFor,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
