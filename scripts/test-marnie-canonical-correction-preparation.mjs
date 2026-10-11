/**
 * Keeps the Marnie correction cohort reviewable while it is pending a separately
 * authorised canonical write. This does not assert the app is corrected: the
 * existing runtime still reflects the captured, known-bad Pikachu alias.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import {
  OWNER_APPROVED_CARD_ENGLISH_NAME_RECORDS,
} from '../backend/lib/generated/ownerApprovedCardEnglishNames.js';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const canonicalHash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const proposal = readJson('docs/audits/20261010/marnie-alias-correction.json');
const before = readJson('docs/audits/20261011/marnie-before-image.receipt.json');

assert.equal(proposal.status, 'source_supported_proposal_pending_canonical_review');
assert.equal(proposal.canonicalDatabaseWriteAuthorized, false);
assert.equal(proposal.runtimeGenerationPerformed, false);
assert.equal(canonicalHash(proposal), '4e45815a9eb6abcb8ac94c1986808557110fb1821559af30e0222510ba26b13b');
assert.equal(canonicalHash(before), '1c472427d8cff2f506a58d79cb975565e6af2231e86ecb744922430def533677');

const ids = proposal.candidates.map(({ printingId }) => printingId).sort();
const variants = proposal.candidates.flatMap(({ variants: rows }) => rows.map(({ variantId }) => variantId)).sort();
assert.equal(ids.length, 12);
assert.equal(new Set(ids).size, 12);
assert.equal(variants.length, 13);
assert.equal(new Set(variants).size, 13);
assert.deepEqual([...before.cohort.printingIds].sort(), ids);
for (const candidate of proposal.candidates) {
  assert.equal(candidate.language, 'zh-tw');
  assert.equal(candidate.nativeName, '瑪俐');
  assert.equal(candidate.expectedEnglishDisplayName, 'Pikachu');
  assert.equal(candidate.proposedEnglishDisplayName, 'Marnie');
  assert.equal(candidate.supertype, 'Trainer');
  assert.ok(candidate.expectedPublicUpdatedAt);
}

assert.equal(before.printingBefore.length, 12);
assert.equal(before.variantBefore.length, 13);
assert.equal(before.nameBefore.length, 26);
assert.deepEqual(before.printingBefore.map(({ printingId }) => printingId).sort(), ids);
assert.deepEqual(before.variantBefore.map(({ variantId }) => variantId).sort(), variants);
for (const row of before.printingBefore) {
  assert.equal(row.language, 'zh-tw');
  assert.equal(row.nativeName, '瑪俐');
  assert.equal(row.supertype, 'Trainer');
  assert.equal(row.englishDisplayName, 'Pikachu');
  assert.equal(row.deprecatedAt, null);
  assert.equal(row.correctedByPrintingId, null);
}
const englishAliases = before.nameBefore.filter(({ language, nameType }) => language === 'en' && nameType === 'english_display');
const nativeAliases = before.nameBefore.filter(({ language, nameType }) => language === 'zh-tw' && nameType === 'native');
assert.equal(englishAliases.length, 13);
assert.equal(nativeAliases.length, 13);
for (const alias of englishAliases) {
  assert.equal(alias.name, 'Pikachu');
  assert.equal(alias.normalizedName, 'pikachu');
  assert.equal(alias.deprecatedAt, null);
  assert.ok(variants.includes(alias.variantId));
}
for (const alias of nativeAliases) {
  assert.equal(alias.name, '瑪俐');
  assert.equal(alias.normalizedName, '瑪俐');
  assert.equal(alias.deprecatedAt, null);
  assert.ok(variants.includes(alias.variantId));
}

const appliedReadbackPath = 'docs/audits/20261011/marnie-canonical-commit.readback.json';
const hasAppliedReadback = existsSync(appliedReadbackPath) && readJson(appliedReadbackPath).runtimeGenerationPerformed === true;
if (hasAppliedReadback) await import('./test-marnie-applied-runtime-readback.mjs');
const marnieRuntimeGroups = OWNER_APPROVED_CARD_ENGLISH_NAME_RECORDS
  .filter(([language, nativeName]) => language === 'zh-tw' && nativeName === '瑪俐');
assert.deepEqual(marnieRuntimeGroups, [['zh-tw', '瑪俐', hasAppliedReadback ? 'Marnie' : 'Pikachu', ids]],
  hasAppliedReadback
    ? 'Applied runtime requires the separate receipt-bound Marnie check.'
    : 'Without an applied receipt, the runtime must remain the known-bad historical baseline.');
const genuinePikachuIds = new Set(OWNER_APPROVED_CARD_ENGLISH_NAME_RECORDS
  .filter(([language, nativeName, englishName]) => language === 'zh-tw' && nativeName === '皮卡丘' && englishName === 'Pikachu')
  .flatMap(([, , , cardIds]) => cardIds));
assert.ok(genuinePikachuIds.size > 0, 'The unrelated genuine Pikachu cohort must remain independently represented.');
assert.equal(ids.some((id) => genuinePikachuIds.has(id)), false);

const forward = readFileSync('supabase/manual/marnie_canonical_correction_rehearsal_20261011.sql', 'utf8');
const reverse = readFileSync('supabase/manual/marnie_canonical_correction_rollback_rehearsal_20261011.sql', 'utf8');
const expectedLockedTables = new Set([
  'catalog.card_printings', 'catalog.card_variants', 'catalog.card_names', 'catalog.catalogue_versions',
  'catalog.catalogue_version_printings', 'catalog.catalogue_version_variants', 'catalog.catalogue_change_log',
]);
for (const [sql, expectedTables] of [
  [forward, expectedLockedTables],
  [reverse, new Set([...expectedLockedTables].filter((table) => table !== 'catalog.card_variants'))],
]) {
  const match = sql.match(/lock table\s+([\s\S]*?)\s+in share row exclusive mode;/iu);
  assert.ok(match, 'each rehearsal must take the bounded publication-membership lock');
  assert.deepEqual(new Set(match[1].split(',').map((table) => table.trim())), expectedTables);
}
const committed = (sql) => sql.replace(/rollback;\s*select '[^']+' result;\s*$/u, 'commit;');
async function runForward(db, sql) {
  const guardStart = sql.indexOf('do $guard$');
  const guardEnd = sql.indexOf('end $guard$;') + 'end $guard$;'.length;
  await db.exec(sql.slice(0, guardStart));
  await db.exec(sql.slice(guardStart, guardEnd));
  await db.exec(sql.slice(guardEnd));
}

async function createFixture({ drift = null } = {}) {
  const db = new PGlite();
  await db.exec(`create schema catalog; create schema api;
    create table catalog.card_printings(id uuid primary key, set_id uuid, collector_number text, language_code text, native_name text, supertype text, english_display_name text, source_updated_at timestamptz, deprecated_at timestamptz, corrected_by_printing_id uuid, updated_at timestamptz);
    create table catalog.card_variants(id uuid primary key, printing_id uuid, set_id uuid, collector_number text, language_code text, variant_code text, finish_code text, source_updated_at timestamptz, deprecated_at timestamptz);
    create table catalog.card_names(id uuid primary key, printing_id uuid, variant_id uuid, language_code text, name_type text, name text, normalized_name text, source_confidence numeric, source_updated_at timestamptz, deprecated_at timestamptz, deprecated_reason text, updated_at timestamptz);
    create table catalog.catalogue_versions(id uuid primary key, language_code text, status text, deprecated_at timestamptz, max_change_sequence bigint, updated_at timestamptz);
    create table catalog.catalogue_version_printings(catalogue_version_id uuid, language_code text, set_id uuid, printing_id uuid, created_at timestamptz default now(), primary key(catalogue_version_id, printing_id));
    create table catalog.catalogue_version_variants(catalogue_version_id uuid, language_code text, set_id uuid, printing_id uuid, variant_id uuid, canonical_key text not null default '', created_at timestamptz default now(), primary key(catalogue_version_id, variant_id));
    create table catalog.catalogue_change_log(change_sequence bigserial primary key,catalogue_version_id uuid,entity_schema text,entity_table text,entity_id uuid,entity_key text,change_type text,mobile_syncable boolean,public_change_summary jsonb,changed_at timestamptz default now());
    create view api.catalogue_delta_changes as
      select ccl.change_sequence,ccl.catalogue_version_id,ccl.entity_schema,ccl.entity_table,ccl.entity_id,ccl.entity_key,ccl.change_type,ccl.public_change_summary,ccl.changed_at
      from catalog.catalogue_change_log ccl join catalog.catalogue_versions cv on cv.id=ccl.catalogue_version_id
      where ccl.mobile_syncable=true and cv.status='published' and cv.deprecated_at is null;`);
  await db.query(`insert into catalog.catalogue_versions values($1,'zh-tw','published',null,null,now())`, [before.publicationBefore.id]);
  for (const p of before.printingBefore) await db.query('insert into catalog.card_printings values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [p.printingId, p.setId, p.collectorNumber, p.language, p.nativeName, p.supertype, p.englishDisplayName, p.sourceUpdatedAt, p.deprecatedAt, p.correctedByPrintingId, p.updatedAt]);
  for (const p of before.printingBefore) {
    await db.query('insert into catalog.catalogue_version_printings(catalogue_version_id,language_code,set_id,printing_id) values($1,$2,$3,$4)', [before.publicationBefore.id, 'zh-tw', p.setId, p.printingId]);
  }
  for (const v of before.variantBefore) {
    const p = before.printingBefore.find(({ printingId }) => printingId === v.printingId);
    await db.query('insert into catalog.card_variants values($1,$2,$3,$4,$5,$6,$7,null,null)', [v.variantId, v.printingId, p.setId, p.collectorNumber, 'zh-tw', v.variantCode, v.finishCode]);
    await db.query('insert into catalog.catalogue_version_variants(catalogue_version_id,language_code,set_id,printing_id,variant_id,canonical_key) values($1,$2,$3,$4,$5,$6)', [before.publicationBefore.id, 'zh-tw', p.setId, v.printingId, v.variantId, `${v.printingId}:${v.variantId}`]);
  }
  for (const n of before.nameBefore) await db.query('insert into catalog.card_names values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [n.nameId, n.printingId, n.variantId, n.language, n.nameType, n.name, n.normalizedName, n.sourceConfidence, n.sourceUpdatedAt, n.deprecatedAt, n.deprecatedReason, n.updatedAt]);
  if (drift === 'publication') await db.query("update catalog.catalogue_versions set status='draft'");
  if (drift === 'set') await db.query('update catalog.card_printings set set_id=$1 where id=$2', ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ids[0]]);
  if (drift === 'collector') await db.query('update catalog.card_printings set collector_number=$1 where id=$2', ['999', ids[0]]);
  if (drift === 'finish') await db.query('update catalog.card_variants set finish_code=$1 where id=$2', ['holo', variants[0]]);
  if (drift === 'extra-alias') { const v = before.variantBefore[0]; await db.query('insert into catalog.card_names values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', v.printingId, v.variantId, 'en', 'english_display', 'Pika', 'pika', 0.85, null, null, null, before.nameBefore[0].updatedAt]); }
  if (drift === 'null-variant-alias') { const p = before.printingBefore[0]; await db.query('insert into catalog.card_names values($1,$2,null,$3,$4,$5,$6,$7,$8,$9,$10,$11)', ['cccccccc-cccc-4ccc-8ccc-cccccccccccc', p.printingId, 'en', 'english_display', 'Pika', 'pika', 0.85, null, null, null, p.updatedAt]); }
  if (drift === 'extra-variant') { const p = before.printingBefore[0]; await db.query('insert into catalog.card_variants values($1,$2,$3,$4,$5,$6,$7,null,null)', ['dddddddd-dddd-4ddd-8ddd-dddddddddddd', p.printingId, p.setId, p.collectorNumber, 'zh-tw', 'holo', 'holo']); }
  if (drift === 'printing-membership') await db.query('delete from catalog.catalogue_version_printings where printing_id=$1', [ids[0]]);
  if (drift === 'variant-membership') await db.query('delete from catalog.catalogue_version_variants where variant_id=$1', [variants[0]]);
  return db;
}

const count = async (db, sql) => (await db.query(sql)).rows[0].count;
const expectedFailure = async (drift) => {
  const db = await createFixture({ drift });
  try {
    await assert.rejects(() => runForward(db, forward), undefined, drift);
    await db.exec('rollback');
    assert.equal(await count(db, "select count(*)::int as count from catalog.card_printings where english_display_name='Pikachu'"), 12);
    assert.equal(await count(db, 'select count(*)::int as count from catalog.catalogue_change_log'), 0);
  } finally { await db.close(); }
};

// Default forward rehearsal leaves the captured baseline untouched.
let db = await createFixture();
try {
  assert.equal(await count(db, "select count(*)::int as count from catalog.card_printings where language_code='zh-tw' and native_name='瑪俐' and supertype='Trainer' and english_display_name='Pikachu' and source_updated_at is null and deprecated_at is null and corrected_by_printing_id is null"), 12);
  assert.equal(await count(db, "select count(*)::int as count from catalog.card_names where language_code='en' and name_type='english_display' and name='Pikachu' and normalized_name='pikachu' and source_confidence=0.85 and source_updated_at is null and deprecated_at is null and deprecated_reason is null"), 13);
  for (const p of before.printingBefore) assert.equal((await db.query('select updated_at=$2::timestamptz as matches from catalog.card_printings where id=$1', [p.printingId, p.updatedAt])).rows[0].matches, true, p.printingId);
  for (const n of englishAliases) assert.equal((await db.query('select updated_at=$2::timestamptz as matches from catalog.card_names where id=$1', [n.nameId, n.updatedAt])).rows[0].matches, true, n.nameId);
  await runForward(db, forward);
  assert.equal(await count(db, "select count(*)::int as count from catalog.card_printings where english_display_name='Pikachu'"), 12);
  assert.equal(await count(db, "select count(*)::int as count from catalog.card_names where language_code='en' and name='Pikachu'"), 13);
  assert.equal(await count(db, 'select count(*)::int as count from catalog.catalogue_change_log'), 0);
} finally { await db.close(); }

// A local commit substitution proves the intended 12/13 mutation and the real
// published/mobile-syncable predicate exposes all 25 scoped receipts.
db = await createFixture();
try {
  assert.equal(await count(db, "select count(*)::int as count from catalog.card_printings where language_code='zh-tw' and native_name='瑪俐' and supertype='Trainer' and english_display_name='Pikachu' and source_updated_at is null and deprecated_at is null and corrected_by_printing_id is null"), 12);
  assert.equal(await count(db, "select count(*)::int as count from catalog.card_names where language_code='en' and name_type='english_display' and name='Pikachu' and normalized_name='pikachu' and source_confidence=0.85 and source_updated_at is null and deprecated_at is null and deprecated_reason is null"), 13);
  await runForward(db, committed(forward));
  assert.equal(await count(db, "select count(*)::int as count from catalog.card_printings where english_display_name='Marnie'"), 12);
  assert.equal(await count(db, "select count(*)::int as count from catalog.card_names where language_code='en' and name='Marnie'"), 13);
  assert.equal(await count(db, "select count(*)::int as count from api.catalogue_delta_changes where entity_key like 'marnie-canonical-correction-20261011:%'"), 25);
  const forwardReceipts = (await db.query("select catalogue_version_id,entity_table,entity_id,entity_key,change_type,mobile_syncable,public_change_summary from catalog.catalogue_change_log where entity_key like 'marnie-canonical-correction-20261011:%' order by entity_key")).rows;
  assert.equal(forwardReceipts.length, 25);
  assert.deepEqual(new Set(forwardReceipts.map(({ catalogue_version_id }) => catalogue_version_id)), new Set([before.publicationBefore.id]));
  assert.deepEqual(new Set(forwardReceipts.filter(({ entity_table }) => entity_table === 'card_printings').map(({ entity_id }) => entity_id)), new Set(ids));
  assert.deepEqual(new Set(forwardReceipts.filter(({ entity_table }) => entity_table === 'card_names').map(({ entity_id }) => entity_id)), new Set(englishAliases.map(({ nameId }) => nameId)));
  for (const receipt of forwardReceipts) {
    assert.equal(receipt.change_type, 'correct'); assert.equal(receipt.mobile_syncable, true);
    const summary = receipt.public_change_summary;
    assert.equal(summary.previous, 'Pikachu'); assert.equal(summary.current, 'Marnie');
    if (receipt.entity_table === 'card_printings') {
      assert.equal(summary.field, 'english_display_name');
      assert.equal(summary.beforeImageCanonicalSha256, '1c472427d8cff2f506a58d79cb975565e6af2231e86ecb744922430def533677');
    } else assert.equal(summary.field, 'english_display_alias');
  }
  assert.equal((await db.query('select max_change_sequence=(select max(change_sequence) from catalog.catalogue_change_log) as matches from catalog.catalogue_versions where id=$1', [before.publicationBefore.id])).rows[0].matches, true);
  await db.exec(reverse);
  assert.equal(await count(db, "select count(*)::int as count from catalog.card_printings where english_display_name='Marnie'"), 12);
  await db.exec(committed(reverse));
  assert.equal(await count(db, "select count(*)::int as count from catalog.card_printings where english_display_name='Pikachu'"), 12);
  assert.equal(await count(db, "select count(*)::int as count from catalog.card_names where language_code='en' and name='Pikachu'"), 13);
  assert.equal(await count(db, "select count(*)::int as count from api.catalogue_delta_changes where entity_key like 'marnie-canonical-correction%-20261011:%'"), 50);
  const reverseReceipts = (await db.query("select catalogue_version_id,entity_table,entity_id,entity_key,change_type,mobile_syncable,public_change_summary from catalog.catalogue_change_log where entity_key like 'marnie-canonical-correction-rollback-20261011:%' order by entity_key")).rows;
  assert.equal(reverseReceipts.length, 25);
  assert.deepEqual(new Set(reverseReceipts.filter(({ entity_table }) => entity_table === 'card_printings').map(({ entity_id }) => entity_id)), new Set(ids));
  assert.deepEqual(new Set(reverseReceipts.filter(({ entity_table }) => entity_table === 'card_names').map(({ entity_id }) => entity_id)), new Set(englishAliases.map(({ nameId }) => nameId)));
  for (const receipt of reverseReceipts) {
    assert.equal(receipt.catalogue_version_id, before.publicationBefore.id); assert.equal(receipt.change_type, 'correct'); assert.equal(receipt.mobile_syncable, true);
    assert.equal(receipt.public_change_summary.previous, 'Marnie'); assert.equal(receipt.public_change_summary.current, 'Pikachu');
    assert.equal(receipt.public_change_summary.field, receipt.entity_table === 'card_printings' ? 'english_display_name' : 'english_display_alias');
  }
  assert.equal((await db.query('select max_change_sequence=(select max(change_sequence) from catalog.catalogue_change_log) as matches from catalog.catalogue_versions where id=$1', [before.publicationBefore.id])).rows[0].matches, true);
} finally { await db.close(); }

// A later canonical update must make the inverse rehearsal refuse to overwrite it.
db = await createFixture();
try {
  await runForward(db, committed(forward));
  await db.query('update catalog.card_printings set updated_at=now()+interval \'1 second\' where id=$1', [ids[0]]);
  await assert.rejects(() => db.exec(reverse));
  await db.exec('rollback');
} finally { await db.close(); }
for (const column of ['set_id', 'collector_number']) {
  db = await createFixture();
  try {
    await runForward(db, committed(forward));
    await db.query(`update catalog.card_printings set ${column}=$1 where id=$2`, [column === 'set_id' ? 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' : '999', ids[0]]);
    await assert.rejects(() => db.exec(reverse));
    await db.exec('rollback');
  } finally { await db.close(); }
}

for (const drift of ['publication', 'set', 'collector', 'finish', 'extra-alias', 'null-variant-alias', 'extra-variant', 'printing-membership', 'variant-membership']) await expectedFailure(drift);

console.log(hasAppliedReadback
  ? 'Marnie historical preparation guards passed; applied canonical capture and generated runtime are separately verified. Backend/device delivery is not established here.'
  : 'Marnie canonical correction preparation passed: 12 printings, 13 variants/English aliases, native aliases and genuine Pikachu cohort preserved; canonical write remains pending.');
