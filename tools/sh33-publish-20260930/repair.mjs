// Future SH33 metadata repair primitive.  It performs no connection or
// transaction management; a reviewed caller must provide its transaction.
import { check } from '../queue1-publish-20260927/publish.mjs';
import { createHash } from 'node:crypto';

export const TARGET = Object.freeze({
  set_id: '929a6c13-5b43-4aba-b887-1f86cc94ce31',
  game_code: 'pokemon',
  language_code: 'zh-tw',
  set_code: 'SH',
  provider_set_code: 'SH',
  before: 38,
  after: 53,
  printings: 59,
  numeric_printings: 53,
  energies: ['DAR', 'FIG', 'FIR', 'GRA', 'LIG', 'WAT'],
  catalogue_version_id: 'f15e8ee8-c3ae-43e8-bc06-7cbd4adac70e',
});

export function assertSetScope(set) {
  check(set?.id === TARGET.set_id && set.game_code === TARGET.game_code
    && set.language_code === TARGET.language_code && set.set_code === TARGET.set_code
    && set.provider_set_code === TARGET.provider_set_code && set.deprecated_at == null,
  'SH33 set identity changed');
  check([TARGET.before, TARGET.after].includes(Number(set.printed_total)), 'SH33 printed total changed outside the reviewed transition');
  check(Number.isInteger(Number(set.total)) && Number(set.total) >= TARGET.printings, 'SH33 total is not a preserved set value');
}

export function assertPrintingScope(summary) {
  check(Number(summary?.printings) === TARGET.printings && Number(summary.numeric_printings) === TARGET.numeric_printings,
    'SH33 printing count changed');
  check(summary.numeric_min === '001' && summary.numeric_max === '053', 'SH33 numeric collectors changed');
  check(JSON.stringify(summary.non_numeric_collectors) === JSON.stringify(TARGET.energies), 'SH33 energy identities changed');
  check(summary.catalogue_version_id === TARGET.catalogue_version_id, 'SH33 catalogue version changed');
}

export const identityHash = identities => createHash('sha256').update(JSON.stringify([...identities].sort((a,b)=>a.printing_id.localeCompare(b.printing_id)))).digest('hex');
const preservedSet = set => Object.fromEntries(Object.entries(set).filter(([key])=>!['printed_total','updated_at'].includes(key)));

export function assertScope(scope) {
  assertSetScope(scope.set);
  assertPrintingScope(scope.printings);
  check(Array.isArray(scope.identities) && scope.identities.length===TARGET.printings&&new Set(scope.identities.map(x=>x.printing_id)).size===TARGET.printings&&scope.identity_sha256===identityHash(scope.identities),'SH33 full printing snapshot changed');
  check(scope.identities.every(x=>x.set_id===TARGET.set_id&&x.language_code===TARGET.language_code&&x.set_code===TARGET.set_code&&x.catalogue_version_id===TARGET.catalogue_version_id),'SH33 printing identity changed');
  return scope;
}

export async function readScope(db) {
  const sets = (await db.query(`select *
    from catalog.sets where id=$1 for share`, [TARGET.set_id])).rows;
  const printingRows = (await db.query(`select catalogue_version_id,count(*) as printings,
    count(*) filter (where collector_number ~ '^[0-9]{3}$') as numeric_printings,
    min(collector_number) filter (where collector_number ~ '^[0-9]{3}$') as numeric_min,
    max(collector_number) filter (where collector_number ~ '^[0-9]{3}$') as numeric_max,
    array_agg(collector_number order by collector_number) filter (where collector_number !~ '^[0-9]{3}$') as non_numeric_collectors
    from api.catalogue_cards where set_id=$1 group by catalogue_version_id`, [TARGET.set_id])).rows;
  const identities=(await db.query(`select printing_id,set_id,language_code,set_code,collector_number,card_native_name,catalogue_version_id from api.catalogue_cards where set_id=$1 order by printing_id`,[TARGET.set_id])).rows;
  check(sets.length === 1 && printingRows.length === 1, 'SH33 scope is not singular');
  return assertScope({ set: sets[0], printings: printingRows[0],identities,identity_sha256:identityHash(identities) });
}

// Call only after readScope in an existing serializable transaction.  This is
// deliberately a one-column update and has an optimistic total precondition:
// it cannot silently overwrite a concurrently changed total.
export async function repairWithinTransaction(db, scope) {
  assertScope(scope);
  if (Number(scope.set.printed_total) === TARGET.after) return { changed: false, fields:['printed_total'],metadata_changes:0,set: scope.set,identity_sha256:scope.identity_sha256 };
  const rows = (await db.query(`update catalog.sets set printed_total=$2
    where id=$1 and game_code=$3 and language_code=$4 and set_code=$5 and provider_set_code=$5
      and deprecated_at is null and printed_total=$6 and total=$7
    returning *`, [
    TARGET.set_id, TARGET.after, TARGET.game_code, TARGET.language_code, TARGET.set_code,
    TARGET.before, scope.set.total,
  ])).rows;
  check(rows.length === 1, 'SH33 denominator update precondition failed');
  const set = rows[0];
  assertSetScope(set);
  check(Number(set.printed_total) === TARGET.after && Number(set.total) === Number(scope.set.total), 'SH33 update changed an unapproved field');
  const after=await readScope(db);check(after.identity_sha256===scope.identity_sha256&&JSON.stringify(preservedSet(after.set))===JSON.stringify(preservedSet(scope.set)),'SH33 correction changed printing identities or a preserved set field');
  return { changed: true,fields:['printed_total'],metadata_changes:1,set,identity_sha256:after.identity_sha256 };
}

// Optional shared-publisher hook. It is invoked inside the publisher's
// existing serializable rehearsal or production transaction.
export async function catalogueCorrection(db,_environment) {
  const before=await readScope(db);
  const result=await repairWithinTransaction(db,before);
  return [{table:'catalog.sets',id:TARGET.set_id,column:'printed_total',before:Number(before.set.printed_total),after:TARGET.after,changed:result.changed,preserved_total:Number(before.set.total),preserved_printing_identity_sha256:before.identity_sha256,catalogue_version_id:TARGET.catalogue_version_id}];
}
