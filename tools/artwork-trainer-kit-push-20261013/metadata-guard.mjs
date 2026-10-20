import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { check } from '../queue1-publish-20260927/publish.mjs';
import { BINDING_FIELDS } from './frozen.mjs';
import { assertBindings, assertSourcePolicies, compareSnapshots } from '../artwork-followup-push-20261013/metadata-guard.mjs';
export { assertBindings, assertSourcePolicies, compareSnapshots };

export async function readSnapshot(db, rows, expected) {
  const ids = rows.map(row => row.printing_id);
  const setIds = [...new Set(rows.map(row => row.set_id))];
  const read = async (scope, sql, parameters, identity = row => row.id) => (await db.query(sql, parameters)).rows.map(payload => ({ scope, identity: String(identity(payload)), payload }));
  const printings = await read('printings', 'select * from catalog.card_printings where id=any($1::uuid[]) for share', [ids]);
  const variants = await read('variants', `select * from catalog.card_variants where printing_id=any($1::uuid[]) limit ${expected.variants + 1} for share`, [ids]);
  const variantIds = variants.map(row => row.payload.id);
  const names = await read('names', `select * from catalog.card_names where printing_id=any($1::uuid[]) limit ${expected.names + 1} for share`, [ids]);
  const sets = await read('sets', 'select * from catalog.sets where id=any($1::uuid[]) for share', [setIds]);
  const assets = await read('assets', 'select * from catalog.assets where printing_id=any($1::uuid[]) or variant_id=any($2::uuid[]) or (printing_id is null and variant_id is null and set_id=any($3::uuid[])) limit 201 for share', [ids, variantIds, setIds]);
  const links = await read('links', 'select * from catalog.catalogue_version_assets where printing_id=any($1::uuid[]) or variant_id=any($2::uuid[]) or asset_id=any($3::uuid[]) or (printing_id is null and variant_id is null and set_id=any($4::uuid[])) limit 201 for share', [ids, variantIds, assets.map(row => row.payload.id), setIds], row => `${row.catalogue_version_id}:${row.asset_id}`);
  const sources = await read('sources', 'select * from ingest.sources where code=any($1::text[]) for share', [['scrydex']]);
  check(printings.length === expected.printings && variants.length === expected.variants && names.length === expected.names && sets.length === expected.sets && assets.length <= 200 && links.length <= 200, 'Scoped snapshot counts changed');
  return [...printings, ...variants, ...names, ...sets, ...assets, ...links, ...sources].sort((a, b) => `${a.scope}:${a.identity}`.localeCompare(`${b.scope}:${b.identity}`));
}

export function createMetadataGuard(plan, { privateOutput = null } = {}) {
  const sequences = new Map();
  const save = async (environment, sequence, phase, snapshot) => {
    if (!privateOutput) return;
    await mkdir(privateOutput, { recursive: true });
    await writeFile(path.join(privateOutput, `${environment}-${sequence}-${phase}.json`), JSON.stringify(snapshot, null, 2));
  };
  return {
    async before(db, rows, environment) {
      const sequence = (sequences.get(environment) ?? 0) + 1;
      sequences.set(environment, sequence);
      const snapshot = await readSnapshot(db, rows, plan.scope_counts[environment]);
      const cards = (await db.query(`select ${BINDING_FIELDS.join(',')} from api.catalogue_cards where printing_id=any($1::uuid[]) limit ${plan.scope_counts[environment].variants + 1}`, [rows.map(row => row.printing_id)])).rows;
      assertBindings(plan, cards, environment);
      assertSourcePolicies(plan, snapshot.filter(row => row.scope === 'sources').map(row => row.payload), environment);
      await save(environment, sequence, 'before', snapshot);
      return { snapshot, sequence };
    },
    async after(db, rows, environment, before, journal) {
      const snapshot = await readSnapshot(db, rows, plan.scope_counts[environment]);
      const result = compareSnapshots(before.snapshot, snapshot, journal, plan, environment);
      await save(environment, before.sequence, 'after', snapshot);
      return result;
    },
  };
}
