import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const screen = 'features/binder/BinderDetailScreen.tsx';
assert.equal(execFileSync('git', ['hash-object', screen], { encoding: 'utf8' }).trim(), 'fce741d26cb45b9095507a514e5440e6b052de61');
function replaceOnce(path, before, after) {
  const text = fs.readFileSync(path, 'utf8');
  assert.equal(text.split(before).length, 2, `${path}: source drift`);
  fs.writeFileSync(path, text.replace(before, after));
}
replaceOnce(screen,
  "      const incompleteRefresh = binderData.type === 'official' && (binderCards.some((card) => card.catalogue_incomplete)\n",
  "      const incompleteRefresh = binderData.type === 'official' && ((binderData.user_id === user?.id && !completeOwnerView)\n        || binderCards.some((card) => card.catalogue_incomplete)\n");
replaceOnce(screen, '{formatCurrency(binderValue)} est. value', "{reopenStatus ? 'Pricing awaits refresh' : `${formatCurrency(binderValue)} est. value`}");
const tests = 'scripts/test-binder-reopen.mjs';
const next = "await test('actual screen replaces saved data only after a complete refresh and never lets late disk results win', async () => {";
replaceOnce(tests, next, `await test('actual screen retains the saved view when a full-count refresh has a wrong-language identity', async () => {
  const h = screenHarness(); const pending = h.load(); h.disk.resolve(snapshot()); await tick();
  h.auth.resolve({ data: { user: { id: scope.accountId } } }); h.record.resolve(binder); await tick();
  const wrong = cards(); wrong[0].language = 'ja'; h.network.resolve(wrong); await pending;
  assert.equal(h.state.cards.length, 124); assert.equal(h.state.cards[0].language, 'en');
  assert.equal(h.state.status.state, 'incomplete'); assert.equal(h.saves, 0); assert.equal(h.state.ownershipReady, false);
});
` + next);
const assertion = String.raw`  assert.match(source, /const isReadOnly = routeReadOnly \|\| reopenStatus !== null/);`;
replaceOnce(tests, assertion, assertion + '\n' + String.raw`  assert(source.includes("{reopenStatus ? 'Pricing awaits refresh' : ` + '`' + String.raw`${formatCurrency(binderValue)} est. value` + '`' + String.raw`}"), 'saved views must not turn omitted price snapshots into a zero-valued estimate');`);
console.log('Complete refresh identities and truthful saved-view valuation guards added.');
