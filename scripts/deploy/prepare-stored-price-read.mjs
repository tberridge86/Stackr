import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const STORED_PRICE_READ_MIGRATION = Object.freeze({
  version: '20260927165014', name: 'bound_stored_exact_price_catalogue_lookup',
  filename: '20260927165014_bound_stored_exact_price_catalogue_lookup.sql',
  sha256: "407cf590386c1b6e0200b1f9765e4c3a8429585e45369c7ead4a8c0db23a1430",
});
const signature = 'api.latest_stored_exact_prices(uuid[])';
export function storedPriceReadSource() {
  const sql = readFileSync(new URL(`../../supabase/migrations/${STORED_PRICE_READ_MIGRATION.filename}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  if (createHash('sha256').update(sql).digest('hex') !== STORED_PRICE_READ_MIGRATION.sha256) throw Error('stored_price_read_checksum_mismatch');
  return sql;
}
async function definition(client) {
  return (await client.query('select pg_get_functiondef($1::regprocedure) as definition', [signature])).rows[0].definition;
}
export async function prepareStoredPriceRead({client,apply,rehearse}) {
  if(apply && rehearse) throw Error('apply_and_rehearse_mutually_exclusive');
  const sql=storedPriceReadSource(), migration=STORED_PRICE_READ_MIGRATION;
  await client.connect();
  try {
    await client.query(apply||rehearse?'begin':'begin read only');
    try {
      await client.query("set local lock_timeout='1s'");
      await client.query("set local statement_timeout='30s'");
      await client.query("select pg_advisory_xact_lock(hashtext('stackr.personal_pricing_preparation.v1'))");
      const history=(await client.query('select version,name from supabase_migrations.schema_migrations order by version,name')).rows;
      if(!history.some(r=>r.version==='20260919100104'&&r.name==='catalogue_pricing_cycles')) throw Error('stored_price_read_prerequisite_missing');
      const ledger=history.filter(r=>r.version===migration.version);
      if(ledger.length>1||ledger.length===1&&ledger[0].name!==migration.name) throw Error('stored_price_read_ledger_conflict');
      const previous=await definition(client);
      const pending=!ledger.length;
      if(pending&&(apply||rehearse)) {
        // This migration changes only the bounded predicate. Refuse unseen drift.
        const expected=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION'),sql.indexOf('\nrevoke all'));
        const normal=s=>s.replace(/\s+/g,' ').trim().replace(/;$/,'');
        if(normal(previous.replace('where array_length(p_variants,1)<=200;', 'where array_length(p_variants,1)<=200\n   and c.variant_id = any(p_variants);'))!==normal(expected)) throw Error('stored_price_read_definition_drift');
        await client.query(sql);
        await client.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3::text[])',[migration.version,migration.name,[sql]]);
      }
      if(!pending||apply||rehearse) {
        const contract=(await client.query(`select not p.prosecdef as invoker,
          has_function_privilege('service_role',p.oid,'EXECUTE') as service_access,
          not has_function_privilege('anon',p.oid,'EXECUTE') and not has_function_privilege('authenticated',p.oid,'EXECUTE') as private,
          position('c.variant_id = any(p_variants)' in pg_get_functiondef(p.oid))>0 as bounded
          from pg_proc p where p.oid=$1::regprocedure`,[signature])).rows[0];
        if(!contract?.invoker||!contract.service_access||!contract.private||!contract.bounded)throw Error('stored_price_read_contract_failed');
      }
      await client.query(apply&&pending?'commit':'rollback');
      if(rehearse&&pending) {
        const restored=(await client.query('select version,name from supabase_migrations.schema_migrations order by version,name')).rows;
        if(JSON.stringify(restored)!==JSON.stringify(history)||await definition(client)!==previous)throw Error('stored_price_read_rehearsal_not_restored');
      }
      return {ok:true,scope:'stored-price-read',mode:rehearse?'rehearsed_rolled_back':apply?(pending?'applied':'already_applied'):'read_only_preparation',
        migration,previousFunction:previous,migrationHistoryCount:history.length+(apply&&pending?1:0)};
    }catch(error){await client.query('rollback').catch(()=>{});throw error;}
  }finally{await client.end();}
}
