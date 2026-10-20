import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadHandler(context: Record<string, unknown>) {
  const source = readFileSync('features/binder/BinderDetailScreen.tsx', 'utf8');
  const start = source.indexOf('const handleSetVariantQuantity = useCallback');
  const end = source.indexOf('const handleToggleVariant', start);
  assert.ok(start >= 0 && end > start, 'Binder Detail must retain the direct variant consumer');
  const exports: any = {};
  vm.runInNewContext(ts.transpileModule(`${source.slice(start, end)}\nexports.handler = handleSetVariantQuantity;`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { ...context, exports, Error, Map, Set, Math, console: { log: () => {} } });
  return exports.handler;
}

async function main() {
  let variants = new Map<string, number>();
  let cards = [{ card_id: 'card-a', set_id: 'set-a', owned: false, owned_quantity: 1, card: {} }];
  const accountGenerationRef = { current: 1 };
  const loadRequestRef = { current: 7 };
  const activeAccountIdRef = { current: 'owner-a' };
  const activityPayloads: any[] = [];
  const alerts: string[] = [];
  let variantWrites = 0;
  let binderWrites = 0;
  let switchDuringHistory = false;

  const query: any = {
    select: () => query,
    eq: () => query,
    in: () => query,
    update: () => { binderWrites += 1; return query; },
    upsert: () => { variantWrites += 1; return Promise.resolve({ error: null }); },
    delete: () => query,
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
  };
  const handler = loadHandler({
    useCallback: (fn: unknown) => fn,
    userId: 'owner-a', isReadOnly: false, binder: { language: 'en' },
    load: () => {},
    accountGenerationRef, loadRequestRef, activeAccountIdRef,
    ownedVariants: variants, cards, variantManagedCards: new Set<string>(),
    getVariantKey: (cardId: string, setId: string, variant: string) => `${setId}:${cardId}:${variant}`,
    getVariantCardKey: (cardId: string, setId: string) => `${setId}:${cardId}`,
    getVariantQuantityFromMap: (map: Map<string, number>, cardId: string, setId: string, variant: string) => map.get(`${setId}:${cardId}:${variant}`) ?? 0,
    getVariants: () => ['normal'], getDefaultOwnedVariant: () => 'normal', getOwnedQuantity: (card: any) => card.owned_quantity ?? 1,
    setOwnedVariants: (update: (current: Map<string, number>) => Map<string, number>) => { variants = update(variants); },
    setVariantManagedCards: () => {},
    setCards: (update: (current: any[]) => any[]) => { cards = update(cards); },
    setSelectedCard: () => {},
    supabase: { from: (table: string) => {
      if (table === 'user_card_variants') return query;
      if (table === 'binders') return { select: () => ({ eq: async () => ({ data: [{ id: 'binder-a' }], error: null }) }) };
      assert.equal(table, 'binder_cards');
      return query;
    } },
    getBinderCardDisplayName: () => 'Pikachu', VARIANT_LABELS: {}, catalogueVariantLabel: (value: string) => value,
    createDirectCollectionHistoryIntent: (input: any) => ({ ...input, eventId: 'stable-event-id' }),
    recordDirectCollectionHistory: async (intent: any) => {
      activityPayloads.push(intent);
      if (switchDuringHistory) {
        activeAccountIdRef.current = 'owner-b';
        accountGenerationRef.current += 1;
        loadRequestRef.current += 1;
        activeAccountIdRef.current = 'owner-a';
        accountGenerationRef.current += 1;
        loadRequestRef.current += 1;
      }
      return { status: 'pending' };
    },
    Alert: { alert: (_title: string, message: string) => alerts.push(message) },
  });

  await handler('card-a', 'set-a', 'normal', 1);
  assert.equal(variantWrites, 1, 'the real Binder Detail handler commits its quantity once');
  assert.equal(binderWrites, 1, 'the real Binder Detail handler updates matching binder state once');
  assert.equal(activityPayloads.length, 1);
  assert.equal(activityPayloads[0].ownerUserId, 'owner-a');
  assert.deepEqual(JSON.parse(JSON.stringify(activityPayloads[0].activity)), {
    title: 'Added to collection', subtitle: 'Pikachu · normal', cardId: 'card-a', setId: 'set-a', type: 'binder_add', isPositive: true,
    cardSnapshot: { name: 'Pikachu', number: null, language: 'en', imageSmall: null, imageLarge: null },
  });
  assert.match(alerts[0], /waiting to be recovered/);

  // A late A→B→A generation change cannot present an old account's result.
  variants = new Map([['set-a:card-a:normal', 1]]);
  cards = [{ card_id: 'card-a', set_id: 'set-a', owned: true, owned_quantity: 1, card: {} }];
  activeAccountIdRef.current = 'owner-a'; accountGenerationRef.current = 3; loadRequestRef.current = 12;
  switchDuringHistory = true;
  const alertsBeforeSwitch = alerts.length;
  await handler('card-a', 'set-a', 'normal', 2);
  assert.equal(variantWrites, 2, 'history waits never reapply the already committed Binder quantity');
  assert.equal(binderWrites, 2);
  assert.equal(alerts.length, alertsBeforeSwitch, 'late account history status remains quiet');

  console.log('Binder direct history consumer: committed quantity, frozen original history payload and late-account alert suppression passed.');
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
