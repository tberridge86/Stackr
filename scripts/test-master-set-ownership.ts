// Execute the existing screen handlers against a persistent in-memory API double.
// This exercises their real writes/reloads without touching a collector's account.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { getCatalogueVariantKeys, catalogueVariantLabel } from '../lib/catalogueVariantPresentation';

const source = fs.readFileSync('features/binder/BinderDetailScreen.tsx', 'utf8');
const tree = ts.createSourceFile('binder.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ['getOwnedQuantity', 'getVariantKey', 'getVariantCardKey', 'getVariantQuantityFromMap', 'getDefaultOwnedVariant', 'handleSetVariantQuantity', 'toggleMasterSet'];
const definitions = new Map<string, string>();
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && names.includes(node.name.text) && node.initializer) {
    definitions.set(node.name.text, `const ${node.name.text} = ${node.initializer.getText(tree)};`);
  }
  ts.forEachChild(node, visit);
}
visit(tree);
for (const name of names) assert(definitions.has(name), name);
const compiled = ts.transpileModule([...definitions.values(), 'globalThis.actions = { handleSetVariantQuantity, toggleMasterSet };'].join('\n'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

async function main() {
  const db = new Map<string, any>(); let failWrites = false; let loads = 0; const alerts: string[] = [];
  const cards = [{ id: 'saved-row', card_id: 'canonical-printing', set_id: 'canonical-set', owned: true, owned_quantity: 4,
    notes: 'Do not lose me', ebay_price: 42, card: { raw_data: { stackr: { canonical: true, variants: [
      { variantId: 'base-id', variantCode: 'normal' }, { variantId: 'reverse-id', variantCode: 'reverse_holo' },
    ] } } } }];
  const context: any = { Map, Set, Math, Number, console, userId: 'owner', binderId: 'binder', isReadOnly: false,
    cards, selectedCard: cards[0], ownedVariants: new Map(), variantManagedCards: new Set(), updatingMasterSet: false,
    masterSetEnabled: true, binder: { id: 'binder', master_set_enabled: true },
    useCallback: (fn: any) => fn, getVariants: (card: any) => getCatalogueVariantKeys(card) ?? [],
    VARIANT_LABELS: {}, catalogueVariantLabel, getBinderCardDisplayName: () => 'Fixture',
    createActivityPost: async () => {}, recordAchievementEvent: async () => {},
    getMasterSetStorageKey: (id: string) => `master:${id}`, AsyncStorage: { setItem: async () => {} },
    Alert: { alert: (_: string, text: string) => alerts.push(text) }, load: async () => { loads++; reload(); },
  };
  for (const name of ['Cards', 'SelectedCard', 'OwnedVariants', 'VariantManagedCards', 'UpdatingMasterSet', 'MasterSetEnabled', 'Binder']) {
    const field = name[0].toLowerCase() + name.slice(1);
    context[`set${name}`] = (value: any) => { context[field] = typeof value === 'function' ? value(context[field]) : value; };
  }
  const writes: any[] = [];
  context.supabase = { from: (table: string) => {
    let action = 'read'; let payload: any; let options: any; const filters: any = {};
    const query: any = {
      select: () => query, eq: (k: string, v: any) => { filters[k] = v; return query; }, in: () => query,
      upsert: (v: any, o: any) => { action = 'upsert'; payload = v; options = o; return query; },
      update: (v: any) => { action = 'update'; payload = v; return query; }, delete: () => { action = 'delete'; return query; },
      then: (resolve: any, reject: any) => {
        if (action !== 'read') writes.push({ table, action, payload, filters });
        if (failWrites && action !== 'read') return Promise.resolve({ error: new Error('write failed') }).then(resolve, reject);
        if (table === 'user_card_variants') {
          if (action === 'upsert') {
            const key = `${payload.set_id}:${payload.card_id}:${payload.variant}`;
            assert.equal(payload.user_id, 'owner');
            if (!options.ignoreDuplicates || !db.has(key)) db.set(key, { ...db.get(key), ...payload });
          } else if (action === 'delete') db.delete(`${filters.set_id}:${filters.card_id}:${filters.variant}`);
        }
        return Promise.resolve({ data: table === 'binders' ? [{ id: 'binder' }] : null, error: null }).then(resolve, reject);
      },
    }; return query;
  } };
  function reload() {
    context.ownedVariants = new Map([...db.entries()].map(([key, row]) => [key, row.quantity]));
    context.variantManagedCards = new Set([...db.values()].map(row => `${row.set_id}:${row.card_id}`));
  }
  vm.createContext(context); vm.runInContext(compiled, context);
  await context.actions.handleSetVariantQuantity('canonical-printing', 'canonical-set', 'reverseHolofoil', 2);
  assert.equal(db.get('canonical-set:canonical-printing:normal').quantity, 4, 'first Reverse edit retains four existing Base copies');
  assert.equal(db.get('canonical-set:canonical-printing:reverseHolofoil').quantity, 2);
  assert.equal(db.has('canonical-set:canonical-printing:holofoil'), false);
  await context.actions.toggleMasterSet(false); reload(); await context.actions.toggleMasterSet(true);
  assert.equal(context.ownedVariants.get('canonical-set:canonical-printing:normal'), 4);
  assert.equal(context.ownedVariants.get('canonical-set:canonical-printing:reverseHolofoil'), 2);
  assert.equal(context.cards[0].notes, 'Do not lose me'); assert.equal(context.cards[0].ebay_price, 42); assert.equal(context.cards[0].id, 'saved-row');
  const count = writes.length;
  await context.actions.handleSetVariantQuantity('canonical-printing', 'canonical-set', 'holofoil', 1);
  assert.equal(writes.length, count, 'unavailable Holo cannot write or count');
  await context.actions.handleSetVariantQuantity('canonical-printing', 'canonical-set', 'reverseHolofoil', 0); reload();
  assert.equal(context.ownedVariants.get('canonical-set:canonical-printing:normal'), 4);
  assert.equal(context.ownedVariants.has('canonical-set:canonical-printing:reverseHolofoil'), false);
  context.cards.push({ ...cards[0], id: 'three-finish-row', card_id: 'three-finish-printing', owned: false, owned_quantity: 1,
    card: { images: {}, raw_data: { stackr: { canonical: true, variants: [
      { variantId: 'three-base-id', variantCode: 'normal' }, { variantId: 'three-reverse-id', variantCode: 'reverse_holo' },
      { variantId: 'three-holo-id', variantCode: 'holo' },
    ] } } } });
  await context.actions.handleSetVariantQuantity('three-finish-printing', 'canonical-set', 'reverseHolofoil', 2);
  assert.equal(db.has('canonical-set:three-finish-printing:normal'), false, 'Reverse alone never marks Base');
  assert.equal(db.has('canonical-set:three-finish-printing:holofoil'), false, 'Reverse alone never marks Holo');
  await context.actions.handleSetVariantQuantity('three-finish-printing', 'canonical-set', 'holofoil', 3);
  await context.actions.handleSetVariantQuantity('three-finish-printing', 'canonical-set', 'normal', 1);
  reload(); await context.actions.toggleMasterSet(false); await context.actions.toggleMasterSet(true); reload();
  assert.deepEqual(['normal', 'reverseHolofoil', 'holofoil'].map(v => context.ownedVariants.get(`canonical-set:three-finish-printing:${v}`)), [1, 2, 3],
    'three finish quantities survive reload and both mode transitions even with no image');
  failWrites = true;
  await context.actions.handleSetVariantQuantity('canonical-printing', 'canonical-set', 'normal', 9);
  assert.equal(alerts.length, 1); assert.equal(loads, 1);
  assert.equal(context.ownedVariants.get('canonical-set:canonical-printing:normal'), 4, 'a rejected write reloads saved quantity');
  assert(writes.filter(w => w.table === 'user_card_variants' && w.payload).every(w => !('image' in w.payload) && !('price' in w.payload) && !('notes' in w.payload)));
  console.log('Existing binder handlers preserve independent finish quantities through reload/mode toggles, protect metadata and reject unavailable finishes/write failures.');
}
void main();
