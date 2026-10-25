import assert from 'node:assert/strict';
import { createCollectionSummaryDatabase } from './test-fixtures/collection-summary-db.mjs';

// Local synthetic PostgreSQL only. This script never reads credentials or opens a hosted connection.
// The shared fixture models relevant columns, existing index shapes and owner/public RLS.
// Production row widths, policy definitions, distribution and execution costs are not attested.
const fixture = await createCollectionSummaryDatabase();
const { db, add, clear, asUser, binder, owned, saved, userA, userB } = fixture;
const pageSize = 50;
const cohorts = [
  { name: 'empty', count: 0, languages: ['en'] },
  { name: 'small', count: 24, languages: ['en'] },
  { name: 'large', count: 1702, languages: ['en'] },
  { name: 'multilingual', count: 250, languages: ['en', 'ja', 'zh-cn', 'zh-tw', 'ko'] },
];
const output = { environment: 'PGlite, in-memory synthetic schema/RLS fixture', pageSize,
  productionPlanVerified: false, newIndexes: [], queryChanges: [],
  limitation: 'No network or device time. Fixture columns/indexes/policies approximate the relevant source, not the entire live schema.',
  cohorts: [] };
try {
  for (const cohort of cohorts) {
    await clear();
    const binders = cohort.count ? cohort.languages.map((language, i) => binder(i + 1, { language })) : [];
    const foreign = binder(99, { user_id: userB });
    await add('binders', [...binders, foreign]);
    await add('binder_cards', [
      ...Array.from({ length: cohort.count }, (_, i) => saved(i + 100, binders[i % binders.length].id,
        cohort.languages[i % cohort.languages.length] + ':' + i, { language: cohort.languages[i % cohort.languages.length] })),
      ...Array.from({ length: 10000 }, (_, i) => saved(i + 100000, foreign.id, 'foreign:' + i)),
    ]);
    await add('user_card_variants', [
      ...Array.from({ length: cohort.count }, (_, i) => owned(i + 100, cohort.languages[i % cohort.languages.length] + ':' + i)),
      ...Array.from({ length: 10000 }, (_, i) => owned(i + 100000, 'foreign:' + i, { user_id: userB })),
    ]);
    await db.exec('analyze public.binders; analyze public.binder_cards; analyze public.user_card_variants');
    await asUser();
    const savedQuery = 'select * from public.binder_cards where binder_id = any($1::uuid[]) order by id limit 50 offset $2';
    const ownedQuery = 'select id,user_id,card_id,set_id,variant,quantity,condition,grade_company,grade from public.user_card_variants where user_id=$1::uuid order by id limit 50 offset $2';
    const result = { name: cohort.name, rowsPerSource: cohort.count, foreignRowsPerSource: 10000, sources: [] };
    for (const [name, query, scope, enabled] of [
      ['saved', savedQuery, binders.map(b => b.id), binders.length > 0],
      ['owned', ownedQuery, userA, true],
    ]) {
      const pages = [];
      let totalRows = 0;
      if (enabled) {
        for (let offset = 0; ;) {
          const plan = (await db.query('explain (analyze, buffers, format json) ' + query, [scope, offset])).rows[0]['QUERY PLAN'][0];
          pages.push({ offset, plan });
          totalRows += plan.Plan['Actual Rows'];
          if (plan.Plan['Actual Rows'] === 0) break;
          offset += plan.Plan['Actual Rows'];
        }
      }
      assert.equal(totalRows, cohort.count);
      result.sources.push({ name, query, returnedRows: totalRows, pageExecutions: pages.length,
        totalExecutionMs: pages.reduce((sum, p) => sum + p.plan['Execution Time'], 0),
        firstPage: pages[0] ?? null, lastDataPage: pages.length > 1 ? pages.at(-2) : null,
        emptyProofPage: pages.at(-1) ?? null });
    }
    output.cohorts.push(result);
  }
  console.log(JSON.stringify(output, null, 2));
} finally {
  await db.close();
}
