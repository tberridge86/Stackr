import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync('features/home/HubScreen.tsx', 'utf8');
const parsed = ts.createSourceFile('HubScreen.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = new Set([
  'HomeOwnedPricingUnit',
  'HomePricingDefaults',
  'PendingHomePriceRefresh',
  'HOME_MANUAL_PRICE_REFRESH_FOLLOW_UP_MS',
  'homeCardKey',
  'reconcileManualPriceRefreshes',
  'buildHomeOwnedPricingUnits',
  'pricingInputForHomeUnit',
]);
const statements = parsed.statements.filter((statement) => {
  if (ts.isTypeAliasDeclaration(statement)) return names.has(statement.name.text);
  if (ts.isVariableStatement(statement)) return statement.declarationList.declarations.some((declaration) => (
    ts.isIdentifier(declaration.name) && names.has(declaration.name.text)
  ));
  return false;
});
assert.equal(statements.length, names.size, 'Home ownership pricing helpers must remain extractable for behavioural checks.');

const helperSource = statements.map((statement) => statement.getText(parsed)).join('\n');
const compiled = ts.transpileModule([
  'const getOwnedQuantity = (card: any) => Math.max(1, Number(card.quantity ?? 1));',
  helperSource,
  'module.exports = { buildHomeOwnedPricingUnits, pricingInputForHomeUnit, reconcileManualPriceRefreshes };',
].join('\n'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
type HomePricingHelpers = {
  buildHomeOwnedPricingUnits: (cards: any[], ownedRows: any[], binders?: any[]) => any[];
  pricingInputForHomeUnit: (unit: any) => any;
  reconcileManualPriceRefreshes: (pending: Map<string, number>, priceResults: any[], now?: number) => { nextPending: Map<string, number>; warning: string | null };
};

// Evaluate the extracted production helpers with the smallest possible runtime stub.
const moduleBox = { exports: {} as HomePricingHelpers };
vm.runInNewContext(compiled, { module: moduleBox, exports: moduleBox.exports });
const { buildHomeOwnedPricingUnits, pricingInputForHomeUnit, reconcileManualPriceRefreshes } = moduleBox.exports;

const sharedCard = {
  set_id: 'set-a', card_id: 'card-a', api_card_id: 'canonical-card-a', api_set_id: 'canonical-set-a',
  language: 'en', condition: 'Near Mint', __binderCardMode: 'raw', __binderDefaultCondition: 'Near Mint',
  __binderDefaultGradeCompany: null, __binderDefaultGrade: null,
};
const crossBinder = [
  { ...sharedCard, __binderId: 'binder-one' },
  { ...sharedCard, __binderId: 'binder-two' },
];
const canonical = [{ set_id: 'set-a', card_id: 'card-a', quantity: 2, variant: 'normal', condition: null, grade_company: null, grade: null }];
const deduped = buildHomeOwnedPricingUnits(crossBinder, canonical, []);
assert.equal(deduped.length, 1, 'Canonical ownership must suppress duplicate legacy units across binders.');
assert.deepEqual(Array.from(deduped[0].binderIds), ['binder-one', 'binder-two']);
assert.equal(deduped[0].quantity, 2);
assert.deepEqual(Array.from(pricingInputForHomeUnit(deduped[0]).references), ['canonical-card-a', 'card-a']);

const standalone = buildHomeOwnedPricingUnits([], [{
  set_id: 'set-ja', card_id: 'card-ja', quantity: 1, variant: 'reverse', condition: null, grade_company: null, grade: null,
}], [{
  id: 'binder-ja', type: 'official', source_set_id: 'set-ja', language: 'ja', card_mode: 'graded',
  default_condition: 'Light Played', default_grade_company: 'PSA', default_grade: '9',
}]);
assert.equal(standalone.length, 1, 'Standalone ownership must still create a price unit.');
assert.equal(standalone[0].language, 'ja');
assert.equal(standalone[0].productType, 'graded_card');
assert.equal(standalone[0].gradeCompany, 'PSA');
assert.equal(standalone[0].grade, '9');
assert.equal(standalone[0].identityExact, true);

const explicitGrade = buildHomeOwnedPricingUnits([sharedCard], [{
  set_id: 'set-a', card_id: 'card-a', quantity: 1, variant: 'normal', condition: 'Excellent', grade_company: 'CGC', grade: '8.5',
}], []);
assert.equal(explicitGrade[0].productType, 'graded_card');
assert.equal(explicitGrade[0].condition, 'Excellent');
assert.equal(explicitGrade[0].gradeCompany, 'CGC');
assert.equal(explicitGrade[0].grade, '8.5');
assert.equal(explicitGrade[0].identityExact, true, 'An explicit grade identity resolves mixed binder-mode ambiguity.');

const ambiguous = buildHomeOwnedPricingUnits([], [{
  set_id: 'shared-set', card_id: 'unmatched-card', quantity: 1, variant: null, condition: null, grade_company: null, grade: null,
}], [
  { id: 'en-binder', type: 'official', source_set_id: 'shared-set', language: 'en', card_mode: 'raw', default_condition: 'Near Mint' },
  { id: 'ja-binder', type: 'official', source_set_id: 'shared-set', language: 'ja', card_mode: 'graded', default_condition: 'Light Played', default_grade_company: 'PSA', default_grade: '10' },
]);
assert.equal(ambiguous[0].identityExact, false, 'Mixed language and grading defaults must not imply an exact card identity.');
assert.equal(ambiguous[0].language, null);
assert.equal(ambiguous[0].condition, null);
assert.deepEqual(Array.from(pricingInputForHomeUnit(ambiguous[0]).references), []);

const queuedAt = Date.parse('2026-09-10T12:00:00.000Z');
const oldQuote = reconcileManualPriceRefreshes(new Map([['variant-a', queuedAt]]), [{
  variantId: 'variant-a', central: 12, calculatedAt: '2026-09-10T11:59:59.000Z',
}], queuedAt + 60_000);
assert.equal(oldQuote.nextPending.size, 1, 'An older stored quote must not be presented as completion of a queued refresh.');
assert.match(oldQuote.warning ?? '', /Checking 1 queued price/, 'Pending refreshes keep a clear stored-price follow-up notice.');

const sameQuote = reconcileManualPriceRefreshes(new Map([['variant-a', queuedAt]]), [{
  variantId: 'variant-a', central: 12, calculatedAt: '2026-09-10T12:00:00.000Z',
}], queuedAt + 60_000);
assert.equal(sameQuote.nextPending.size, 1, 'A quote at the queue timestamp cannot prove the queued work completed later.');

const refreshedQuote = reconcileManualPriceRefreshes(new Map([['variant-a', queuedAt]]), [{
  variantId: 'variant-a', central: 12, calculatedAt: '2026-09-10T12:01:00.000Z',
}], queuedAt + 60_000);
assert.equal(refreshedQuote.nextPending.size, 0);
assert.match(refreshedQuote.warning ?? '', /now reflected/, 'Only a newer stored exact quote completes the Home follow-up.');

const noResult = reconcileManualPriceRefreshes(new Map([['variant-a', queuedAt]]), [], queuedAt + 35 * 60 * 1000);
assert.equal(noResult.nextPending.size, 0, 'The focused Home follow-up remains bounded when no exact quote appears.');
assert.match(noResult.warning ?? '', /may still be queued or lack an exact provider quote/, 'No result remains explicitly uncertain rather than being reported as a failed or refreshed price.');

console.log('Home owned pricing units retain canonical ownership, defaults and ambiguity safeguards.');
