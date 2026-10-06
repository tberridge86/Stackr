import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const previous = readFileSync('supabase/migrations/20261004172210_bounded_catalogue_bulk_price_coverage.sql', 'utf8');
const pageSource = readFileSync('supabase/migrations/20261004181314_catalogue_bulk_price_coverage_page.sql', 'utf8');
const db = new PGlite();

const countFields = ['total','supported','mapped','unmapped','priced','stale','missing_quote','retry','unsupported'] as const;
const sortCards = (cards: any[]) => [...cards].sort((a, b) => `${a.language_code}:${a.set_id}`.localeCompare(`${b.language_code}:${b.set_id}`));

function mergeCards(pages: any[][]) {
  const merged = new Map<string, any>();
  for (const card of pages.flat()) {
    const key = `${card.language_code}:${card.set_id}`;
    const target = merged.get(key) ?? { language_code: card.language_code, set_id: card.set_id };
    for (const field of countFields) target[field] = (target[field] ?? 0) + card[field];
    merged.set(key, target);
  }
  return sortCards([...merged.values()]);
}

async function page(after: string | null, limit: number | null = 2) {
  return (await db.query<any>('select api.catalogue_bulk_price_coverage_page($1,$2,$3) value', [id(90), after, limit])).rows[0].value;
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
    const en=id(1), ja=id(2), ko=id(3), setEn=id(10), setJa=id(11), setKo=id(12), setWrong=id(13);
    const a=id(20), b=id(21), c=id(22), d=id(23), deprecated=id(24), wrongPrinting=id(25), wrongSet=id(26);
    const pa=id(30), pb=id(31), pc=id(32), pd=id(33), px=id(34), py=id(35);
    await db.query('insert into catalog.languages values($1),($2),($3)', ['en','ja','ko']);
    await db.query(`insert into catalog.catalogue_versions values
      ($1,'en','published',null,'2026-02-01','2026-02-01'),($2,'ja','published',null,'2026-02-01','2026-02-01'),($3,'ko','published',null,'2026-02-01','2026-02-01')`, [en,ja,ko]);
    await db.query('insert into catalog.sets values($1,$2,null),($3,$4,null),($5,$6,null),($7,$2,null)', [setEn,'en',setJa,'ja',setKo,'ko',setWrong]);
    for (const [printing,set,language] of [[pa,setEn,'en'],[pb,setEn,'en'],[pc,setJa,'ja'],[pd,setKo,'ko'],[px,setEn,'en'],[py,setWrong,'en']] as const)
      await db.query('insert into catalog.card_printings values($1,$2,$3,null)', [printing,set,language]);
    for (const [variant,printing,language,code,finish,isDeprecated] of [
      [a,pa,'en','normal','normal',false],[b,pb,'en','reverse_holo','reverse_holo',false],[c,pc,'ja','normal','normal',false],[d,pd,'ko','normal','normal',false],
      [deprecated,px,'en','normal','normal',true],[wrongPrinting,px,'en','normal','normal',false],[wrongSet,py,'en','normal','normal',false],
    ] as const) await db.query('insert into catalog.card_variants values($1,$2,$3,$4,$5,$6)', [variant,printing,language,code,finish,isDeprecated ? '2026-01-01' : null]);
    const member = (version: string, variant: string, printing: string, set: string, language: string) =>
      db.query('insert into catalog.catalogue_version_variants values($1,$2,$3,$4,$5)', [version,variant,printing,set,language]);
    await member(en,a,pa,setEn,'en'); await member(en,a,pa,setEn,'en'); // Duplicate raw UUID retains both memberships in its page.
    await member(ja,a,pa,setEn,'ja'); // Cross-language pollution shares the raw UUID but fails the physical language guard.
    await member(en,b,pb,setEn,'en'); await member(ja,c,pc,setJa,'ja'); await member(ko,d,pd,setKo,'ko');
    await member(en,deprecated,px,setEn,'en'); await member(en,wrongPrinting,pa,setEn,'en'); await member(en,wrongSet,py,setEn,'en');
    await db.query('insert into market.catalogue_provider_cards values($1,$2,$3,$4,$5),($6,$7,$3,$4,$8),($9,$10,$11,$12,$13)', [a,pa,setEn,'en','Normal',b,px,'Reverse Holofoil',c,pc,setJa,'ja','Normal']);
    await db.query(`insert into market.catalogue_general_prices values
      ($1,$2,$3,'en',$4,now()+interval '1 day','cardmarket'),($5,$6,$3,'en',$4,now()-interval '1 day','cardmarket')`, [a,pa,setEn,en,b,pb]);
    await db.query('insert into market.catalogue_price_outcomes values($1,$2,$3),($4,$5,$6)', [b,en,'provider_backoff',c,ja,'no_provider_quote']);
    await db.query('insert into market.catalogue_bulk_runs values($1,now())', [id(90)]);
    await db.query('insert into market.catalogue_bulk_groups values($1,3,$2)', [id(90),'complete']);
    await db.exec(`begin; ${previous} commit; set role service_role;`);
    const whole = (await db.query<any>('select api.catalogue_bulk_price_coverage($1) value', [id(90)])).rows[0].value;
    await db.exec(`reset role; begin; ${pageSource} commit; set role service_role;`);

    const firstRaw = await page(null, 1);
    assert.equal(firstRaw.cards.find((row: any) => row.language_code === 'en').total, 2, 'all current memberships for a duplicated raw UUID stay in the same page');
    assert.deepEqual(firstRaw.catalogueVersions, [{ language_code: 'en', id: en }, { language_code: 'ja', id: ja }, { language_code: 'ko', id: ko }]);
    assert.equal(firstRaw.runId, id(90)); assert.ok(Number.isFinite(Date.parse(firstRaw.observedAt)));
    const pages: any[] = []; let after: string | null = null;
    do {
      const result = await page(after, 2); pages.push(result);
      assert.ok(result.scanned <= 2 && result.scanned >= 0, 'page limit bounds raw UUID work');
      assert.deepEqual(result.catalogueVersions, firstRaw.catalogueVersions, 'every page reports the same latest-catalogue context');
      if (after) assert.ok(result.nextAfter === null || result.nextAfter > after, 'cursor advances strictly by raw UUID');
      after = result.nextAfter;
    } while (!pages.at(-1).complete);
    assert.deepEqual(pages.map(result => result.scanned), [2,2,2,1], 'raw UUIDs are ordered and paged independently of physical validity');
    assert.deepEqual(mergeCards(pages.map(result => result.cards)), sortCards(whole.cards), 'summed page cards exactly reproduce the previous whole-report cards');
    assert.equal(whole.cards.reduce((total: number, row: any) => total + row.total, 0), 5, 'invalid physical rows do not enter the denominator');
    let unitAfter: string | null = null;
    for (let rawIndex = 0; rawIndex < 7; rawIndex += 1) {
      const unit = await page(unitAfter, 1);
      assert.equal(unit.complete, false, 'a full one-UUID page requires one final cursor probe');
      if (rawIndex >= 4) {
        assert.deepEqual(unit.cards, [], 'an invalid physical UUID still advances the raw cursor without card rows');
        assert.notEqual(unit.nextAfter, unitAfter);
      }
      unitAfter = unit.nextAfter;
    }
    const empty = await page(unitAfter, 1);
    assert.deepEqual({ cards: empty.cards, scanned: empty.scanned, nextAfter: empty.nextAfter, complete: empty.complete }, { cards: [], scanned: 0, nextAfter: null, complete: true }, 'an exact-multiple client can terminate on an empty cursor page');
    assert.equal((await page(null, 0)).scanned, 1, 'non-positive limits clamp to one raw UUID');
    await db.exec('reset role');
    const enReplacement = id(4);
    await db.query("insert into catalog.catalogue_versions values($1,'en','published',null,'2026-03-01','2026-03-01')", [enReplacement]);
    await db.exec('set role service_role');
    const changedContext = await page(null, 1);
    assert.notDeepEqual(changedContext.catalogueVersions, firstRaw.catalogueVersions, 'a later publication changes the page context for a client to reject mixed merges');
    assert.equal(changedContext.catalogueVersions.find((row: any) => row.language_code === 'en').id, enReplacement);
    await db.exec('reset role; set role anon');
    await assert.rejects(() => page(null), /permission denied/);
    console.log('Catalogue bulk coverage pages preserve whole-report card counts, cursor safety, and service-only access.');
  } finally { await db.close(); }
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
