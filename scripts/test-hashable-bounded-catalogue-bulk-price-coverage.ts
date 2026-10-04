import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const previous = readFileSync('supabase/migrations/20261004172210_bounded_catalogue_bulk_price_coverage.sql', 'utf8');
const replacement = readFileSync('supabase/migrations/20261004174213_hashable_bounded_catalogue_bulk_price_coverage.sql', 'utf8');
const db = new PGlite();

async function coverage(run: string) {
  return (await db.query<any>('select api.catalogue_bulk_price_coverage($1) value', [run])).rows[0].value;
}

async function main() {
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema api; create schema catalog; create schema market;
      create table catalog.catalogue_versions(id uuid primary key,language_code text,status text,deprecated_at timestamptz,published_at timestamptz,created_at timestamptz);
      create table catalog.catalogue_version_variants(catalogue_version_id uuid,variant_id uuid,printing_id uuid,set_id uuid,language_code text);
      create table catalog.languages(code text primary key); create table catalog.sets(id uuid primary key,language_code text,deprecated_at timestamptz);
      create table catalog.card_printings(id uuid primary key,set_id uuid,language_code text,deprecated_at timestamptz);
      create table catalog.card_variants(id uuid primary key,printing_id uuid,language_code text,variant_code text,finish_code text,deprecated_at timestamptz);
      create table market.catalogue_provider_cards(variant_id uuid,printing_id uuid,set_id uuid,language_code text,subtype text);
      create table market.catalogue_general_prices(variant_id uuid,printing_id uuid,set_id uuid,language_code text,catalogue_version_id uuid,stale_after timestamptz,provider text);
      create table market.catalogue_price_outcomes(variant_id uuid,catalogue_version_id uuid,reason text);
      create table market.catalogue_bulk_runs(id uuid,dataset_at timestamptz); create table market.catalogue_bulk_groups(run_id uuid,category_id int,status text);
      create table market.catalogue_price_repairs(status text);
      create function api.catalogue_provider_subtype(variant text,finish text) returns text language sql immutable as $$
        select case when variant='normal' and finish='normal' then 'Normal' when variant='reverse_holo' and finish='reverse_holo' then 'Reverse Holofoil' end
      $$;
      grant usage on schema api,catalog,market to service_role; grant select on all tables in schema api,catalog,market to service_role;
    `);

    const enOld=id(1), en=id(2), ja=id(3), ko=id(4), setEn=id(10), setJa=id(11), setKo=id(12), setWrong=id(13);
    const a=id(20), b=id(21), c=id(22), d=id(23), deprecated=id(24), wrongPrinting=id(25), wrongSet=id(26);
    const pa=id(30), pb=id(31), pc=id(32), pd=id(33), px=id(34), py=id(35), run=id(90);
    await db.query('insert into catalog.languages values($1),($2),($3)', ['en', 'ja', 'ko']);
    await db.query(`insert into catalog.catalogue_versions values
      ($1,'en','published',null,'2026-01-01','2026-01-01'),($2,'en','published',null,'2026-02-01','2026-02-01'),
      ($3,'ja','published',null,'2026-02-01','2026-02-01'),($4,'ko','published',null,'2026-02-01','2026-02-01')`, [enOld,en,ja,ko]);
    await db.query('insert into catalog.sets values($1,$2,null),($3,$4,null),($5,$6,null),($7,$2,null)', [setEn,'en',setJa,'ja',setKo,'ko',setWrong]);
    for (const [p, s, language] of [[pa,setEn,'en'],[pb,setEn,'en'],[pc,setJa,'ja'],[pd,setKo,'ko'],[px,setEn,'en'],[py,setWrong,'en']] as const)
      await db.query('insert into catalog.card_printings values($1,$2,$3,null)', [p,s,language]);
    for (const [v,p,language,variant,finish,isDeprecated] of [
      [a,pa,'en','normal','normal',false], [b,pb,'en','reverse_holo','reverse_holo',false], [c,pc,'ja','normal','normal',false], [d,pd,'ko','normal','normal',false],
      [deprecated,px,'en','normal','normal',true], [wrongPrinting,px,'en','normal','normal',false], [wrongSet,py,'en','normal','normal',false],
    ] as const) await db.query('insert into catalog.card_variants values($1,$2,$3,$4,$5,$6)', [v,p,language,variant,finish,isDeprecated ? '2026-01-01' : null]);
    const member = async (version: string, variant: string, printing: string, set: string, language: string) =>
      db.query('insert into catalog.catalogue_version_variants values($1,$2,$3,$4,$5)', [version,variant,printing,set,language]);
    await member(enOld,a,pa,setEn,'en'); // Previous English publication is excluded.
    await member(en,a,pa,setEn,'en'); await member(en,b,pb,setEn,'en'); await member(ja,c,pc,setJa,'ja'); await member(ko,d,pd,setKo,'ko');
    await member(en,deprecated,px,setEn,'en'); // Deprecated physical variant is excluded.
    await member(en,wrongPrinting,pa,setEn,'en'); // Version/variant printing mismatch is excluded.
    await member(en,wrongSet,py,setEn,'en'); // Version/printing set mismatch is excluded.
    await member(en,a,pa,setEn,'ja'); // A foreign-language membership on an English version is excluded.

    await db.query('insert into market.catalogue_provider_cards values($1,$2,$3,$4,$5),($6,$7,$3,$4,$8),($9,$10,$11,$12,$13)',
      [a,pa,setEn,'en','Normal',b,px,'Reverse Holofoil',c,pc,setJa,'ja','Normal']);
    await db.query(`insert into market.catalogue_general_prices values
      ($1,$2,$3,'en',$4,now()+interval '1 day','cardmarket'),
      ($5,$6,$3,'en',$4,now()-interval '1 day','cardmarket'),
      ($7,$8,$9,'ja',$4,now()+interval '1 day','cardmarket')`, [a,pa,setEn,en,b,pb,c,pc,setJa]);
    await db.query('insert into market.catalogue_price_outcomes values($1,$2,$3),($4,$5,$6)', [b,en,'provider_backoff',c,ja,'no_provider_quote']);
    await db.query('insert into market.catalogue_bulk_runs values($1,now())', [run]);
    await db.query('insert into market.catalogue_bulk_groups values($1,3,$2),($1,3,$3),($1,85,$4)', [run,'pending','running','failed']);
    await db.query('insert into market.catalogue_price_repairs values($1)', ['open']);

    await db.exec(`begin; ${previous} commit; set role service_role;`);
    const before = await coverage(run);
    await db.exec(`reset role; begin; ${replacement} commit; set role service_role;`);
    const after = await coverage(run);
    assert.deepEqual(after, before, 'hashable physical coverage preserves the prior helper JSON exactly');
    assert.equal(after.cards.reduce((total: number, row: any) => total + row.total, 0), 4, 'latest physical membership remains the full denominator, including Korean');
    const enCard = after.cards.find((row: any) => row.language_code === 'en');
    assert.deepEqual({ total: enCard.total, mapped: enCard.mapped, unmapped: enCard.unmapped, priced: enCard.priced, stale: enCard.stale, retry: enCard.retry }, { total: 2, mapped: 1, unmapped: 1, priced: 2, stale: 1, retry: 1 });
    assert.equal(after.cards.find((row: any) => row.language_code === 'ja').missing_quote, 1, 'an unavailable outcome does not count as priced');
    assert.equal(after.cards.find((row: any) => row.language_code === 'ko').unsupported, 1, 'foreign languages remain in the denominator');
    assert.deepEqual(after.groups, [{ category_id: 3, status: 'pending', total: 1 }, { category_id: 3, status: 'running', total: 1 }, { category_id: 85, status: 'failed', total: 1 }]);
    assert.equal(after.openRepairs, 1); assert.equal(after.runStatus, 'partial');
    await db.exec('reset role; set role anon');
    await assert.rejects(() => coverage(run), /permission denied/);
    console.log('Hashable bounded catalogue bulk coverage passed: previous JSON, physical guards, status, and ACL agree.');
  } finally {
    await db.close();
  }
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
