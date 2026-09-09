import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import type { ScannedVariantIdentity } from '../lib/scanVariantOwnershipCore';

const require = createRequire(import.meta.url);
const journals = new Map<string, string>();
const rows = new Map<string, { user_id: string; card_id: string; set_id: string; variant: string; condition: string; grade_company: string; grade: string; quantity: number }>();
const identityKey = (identity: Pick<ScannedVariantIdentity, 'userId' | 'cardId' | 'setId' | 'variant' | 'condition' | 'gradeCompany' | 'grade'>) => [identity.userId, identity.cardId, identity.setId, identity.variant, identity.condition, identity.gradeCompany, identity.grade].join(':');
const mock = (request: string, exports: unknown) => {
  const filename = require.resolve(request);
  require.cache[filename] = { id: filename, filename, loaded: true, exports } as any;
};

mock('@react-native-async-storage/async-storage', {
  getItem: async (key: string) => journals.get(key) ?? null,
  setItem: async (key: string, value: string) => { journals.set(key, value); },
});

const supabase = {
  auth: { getUser: async () => ({ data: { user: { id: 'owner-a' } }, error: null }) },
  from: () => ({
    select: () => {
      const filters: Record<string, unknown> = {};
      const query: any = {
        eq: (column: string, value: unknown) => { filters[column] = value; return query; },
        maybeSingle: async () => ({ data: [...rows.values()].find((row) => Object.entries(filters).every(([column, value]) => row[column as keyof typeof row] === value)) ?? null, error: null }),
      };
      return query;
    },
    update: (patch: { quantity: number }) => {
      const filters: Record<string, unknown> = {};
      const query: any = {
        eq: (column: string, value: unknown) => { filters[column] = value; return query; },
        select: () => ({ maybeSingle: async () => {
          const row = [...rows.values()].find((value) => Object.entries(filters).every(([column, expected]) => value[column as keyof typeof value] === expected));
          if (!row) return { data: null, error: null };
          row.quantity = patch.quantity;
          return { data: { quantity: row.quantity }, error: null };
        } }),
      };
      return query;
    },
    insert: (row: any) => ({ select: () => ({ single: async () => {
      const key = [row.user_id, row.card_id, row.set_id, row.variant, row.condition, row.grade_company, row.grade].join(':');
      if (rows.has(key)) return { data: null, error: { code: '23505' } };
      rows.set(key, row);
      return { data: { quantity: row.quantity }, error: null };
    } }) }),
  }),
};
mock('../lib/supabase', { supabase });

const { addScannedVariantCopy } = require('../lib/scanVariantOwnership') as typeof import('../lib/scanVariantOwnership');
const base = { userId: 'owner-a', cardId: 'card-a', setId: 'set-a', variant: 'holo' };
const seed = (condition: string, gradeCompany: string, grade: string, quantity: number) => {
  rows.set(identityKey({ ...base, condition, gradeCompany, grade }), {
    user_id: base.userId, card_id: base.cardId, set_id: base.setId, variant: base.variant, condition, grade_company: gradeCompany, grade, quantity,
  });
};

async function run() {
  seed('Near Mint', '', '', 2);
  seed('Played', '', '', 5);
  seed('Near Mint', 'PSA', '10', 1);
  await addScannedVariantCopy({ ...base, requestKey: 'raw-near-mint', condition: 'Near Mint', gradeCompany: '', grade: '' });
  assert.equal(rows.get(identityKey({ ...base, condition: 'Near Mint', gradeCompany: '', grade: '' }))?.quantity, 3);
  assert.equal(rows.get(identityKey({ ...base, condition: 'Played', gradeCompany: '', grade: '' }))?.quantity, 5);
  assert.equal(rows.get(identityKey({ ...base, condition: 'Near Mint', gradeCompany: 'PSA', grade: '10' }))?.quantity, 1);
  await addScannedVariantCopy({ ...base, requestKey: 'raw-played', condition: 'Played', gradeCompany: '', grade: '' });
  assert.equal(rows.get(identityKey({ ...base, condition: 'Near Mint', gradeCompany: '', grade: '' }))?.quantity, 3);
  assert.equal(rows.get(identityKey({ ...base, condition: 'Played', gradeCompany: '', grade: '' }))?.quantity, 6);
  assert.equal(rows.get(identityKey({ ...base, condition: 'Near Mint', gradeCompany: 'PSA', grade: '10' }))?.quantity, 1);
  await addScannedVariantCopy({ ...base, requestKey: 'graded', condition: 'Near Mint', gradeCompany: 'PSA', grade: '10' });
  assert.equal(rows.get(identityKey({ ...base, condition: 'Near Mint', gradeCompany: 'PSA', grade: '10' }))?.quantity, 2);
  await addScannedVariantCopy({ ...base, requestKey: 'missing', condition: 'Lightly Played', gradeCompany: '', grade: '' });
  assert.equal(rows.get(identityKey({ ...base, condition: 'Lightly Played', gradeCompany: '', grade: '' }))?.quantity, 1, 'Missing row insert retains full raw identity.');
  await addScannedVariantCopy({ ...base, requestKey: 'raw-near-mint', condition: 'Near Mint', gradeCompany: '', grade: '' });
  assert.equal(rows.get(identityKey({ ...base, condition: 'Near Mint', gradeCompany: '', grade: '' }))?.quantity, 3, 'Retry replays the same identity without another increment.');
  console.log('Scan variant adapter: condition and grading query filters, inserts and retry replay checks passed');
}
void run().catch((error) => { console.error(error); process.exitCode = 1; });
