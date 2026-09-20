import assert from 'node:assert/strict';
import { CollectionExportError, createCollectionExport } from '../lib/collectionExport';

type Result = { data?: any[]; error?: unknown };
function clientHarness({ user = 'user-a', binders = [] as any[], cards = new Map<string, any[]>(), failures = new Map<string, unknown>() } = {}) {
  let activeUser = user;
  const calls: string[] = [];
  const query = (table: string) => {
    const filters: Record<string, unknown> = {};
    const chain: any = {
      select: () => chain, eq: (key: string, value: unknown) => { filters[key] = value; return chain; },
      order: () => chain,
      abortSignal: () => chain,
      range: (from: number, to: number) => {
        calls.push(`${table}:${from}-${to}`);
        const key = `${table}:${String(filters.binder_id ?? filters.user_id ?? '')}`;
        const error = failures.get(key) ?? null;
        const rows = table === 'binders' ? binders.filter((row: any) => row.user_id === filters.user_id) : (cards.get(String(filters.binder_id)) ?? []);
        return Promise.resolve({ data: rows.slice(from, to + 1), error } satisfies Result);
      },
    };
    return chain;
  };
  return {
    client: { auth: { getUser: async () => ({ data: { user: activeUser ? { id: activeUser } : null }, error: null }) }, from: query },
    calls, setUser: (next: string) => { activeUser = next; },
  };
}

const binders = [
  { id: 'b2', user_id: 'user-a', name: 'Second', type: 'custom', language: 'ja', created_at: '2026-01-02' },
  { id: 'b1', user_id: 'user-a', name: 'First', type: 'official', language: 'en', source_set_id: 'base1', created_at: '2026-01-01' },
];
const rows = new Map<string, any[]>([
  ['b1', [{ id: 'r2', binder_id: 'b1', card_id: 'two', set_id: 'base1', language: 'en', owned: true, owned_quantity: 2, condition: 'Near Mint', grade_company: null, grade: null, notes: 'owned', slot_order: 2, created_at: '2026-01-01', image_url: 'https://secret.example/image', tcg_price: 99 }, { id: 'r1', binder_id: 'b1', card_id: 'one', set_id: 'base1', language: 'en', owned_card_variant_id: 'variant-holo', owned: true, owned_quantity: 1, condition: 'Mint', grade_company: 'PSA', grade: '10', notes: '', slot_order: 1, created_at: '2026-01-01' }]],
  ['b2', [{ id: 'r3', binder_id: 'b2', card_id: 'three', set_id: 'ja:sv1', language: 'ja', owned: false, owned_quantity: 0, condition: 'Damaged', slot_order: 1, created_at: '2026-01-02' }]],
]);

async function main() {
  const h = clientHarness({ binders, cards: rows });
  const exported = await createCollectionExport({ client: h.client, now: () => Date.UTC(2026, 8, 20) });
  assert.equal(exported.binders.length, 2); assert.equal(exported.cards.length, 3);
  assert.equal('sortOrder' in exported.binders[0], false, 'binders use only verified schema columns');
  assert.equal(exported.cards.find((card) => card.id === 'r1')?.canonicalVariantId, 'variant-holo', 'actual saved canonical variant survives');
  assert.equal(exported.cards.find((card) => card.id === 'r2')?.slotOrder, 2, 'stored row ordering is retained');
  const serialized = JSON.stringify(exported);
  for (const forbidden of ['image_url', 'tcg_price', 'https://secret.example']) assert.equal(serialized.includes(forbidden), false, `export excludes ${forbidden}`);
  assert.deepEqual(h.calls, ['binders:0-199', 'binder_cards:0-199', 'binder_cards:0-199'], 'binders and their rows use bounded deterministic pages');

  const failed = clientHarness({ binders, cards: rows, failures: new Map([['binder_cards:b2', new Error('offline')]]) });
  await assert.rejects(createCollectionExport({ client: failed.client }), (error: unknown) => error instanceof CollectionExportError && error.code === 'failed', 'a failed page never produces a partial export');

  let current = true;
  const switched = clientHarness({ binders, cards: rows });
  const switchedExport = createCollectionExport({ client: switched.client, isCurrent: () => current });
  queueMicrotask(() => { current = false; switched.setUser('user-b'); });
  await assert.rejects(switchedExport, (error: unknown) => error instanceof CollectionExportError && error.code === 'cancelled', 'account generation change cancels before sharing');

  const controller = new AbortController(); controller.abort();
  await assert.rejects(createCollectionExport({ client: h.client, signal: controller.signal }), (error: unknown) => error instanceof CollectionExportError && error.code === 'cancelled', 'an unmounted settings screen cancels safely');

  let requestAborted = false;
  const stalled: any = {
    auth: { getUser: async () => ({ data: { user: { id: 'user-a' } }, error: null }) },
    from: () => {
      const chain: any = {
        select: () => chain, eq: () => chain, order: () => chain,
        abortSignal: (signal: AbortSignal) => { signal.addEventListener('abort', () => { requestAborted = true; }, { once: true }); return chain; },
        range: () => new Promise(() => {}),
      };
      return chain;
    },
  };
  await assert.rejects(createCollectionExport({ client: stalled, timeoutMs: 5 }), (error: unknown) => error instanceof CollectionExportError && error.code === 'incomplete', 'a hung PostgREST request reaches the hard deadline');
  assert.equal(requestAborted, true, 'the timed-out request receives an abort signal');

  const reopened = await createCollectionExport({ client: h.client, now: () => Date.UTC(2026, 8, 20) });
  assert.deepEqual(reopened, exported, 'a later export re-verifies the account and reads a fresh complete snapshot');
  console.log('Collection export: account isolation, schema-safe paging, failure, hard-deadline and re-open checks passed.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
