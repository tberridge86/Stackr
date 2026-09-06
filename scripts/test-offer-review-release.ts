import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import {
  CARD_ONLY_RELEASE_NOTICE,
  TRADE_PROBLEM_NOTICE,
  getCardOnlyOfferWarning,
  getOfferConfirmCopy,
} from '../lib/tradeOfferReview';

const card = { quantity: 1 };
assert.equal(getCardOnlyOfferWarning([card], [{ quantity: 4 }]), null);
const givingOnly = getCardOnlyOfferWarning([card], []);
assert.match(givingOnly!, /receive no cards in return/);
assert.match(getCardOnlyOfferWarning([], [card])!, /offering no cards/);
assert.match(getCardOnlyOfferWarning([], [])!, /No cards are included/);
for (const quantity of [null, undefined, NaN, Infinity, -1, 0, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
  assert.match(getCardOnlyOfferWarning([{ quantity }], [card])!, /could not be confirmed/);
}
assert.match(getCardOnlyOfferWarning([{ quantity: Number.MAX_SAFE_INTEGER }, card], [card])!, /could not be confirmed/);
const confirmation = getOfferConfirmCopy('accept', givingOnly)!;
assert.ok(confirmation.body.startsWith(givingOnly!));
assert.match(confirmation.body, /does not authenticate cards, reserve stock or arrange delivery/);
assert.equal(getOfferConfirmCopy(null), null);
assert.equal(getOfferConfirmCopy('dispute')!.body, TRADE_PROBLEM_NOTICE);
assert.equal(getOfferConfirmCopy('dispute')!.actionLabel, 'Flag a problem');
assert.match(CARD_ONLY_RELEASE_NOTICE, /delivery tracking and free-form messages are unavailable/);
assert.match(TRADE_PROBLEM_NOTICE, /does not create a support ticket/);
for (const action of ['decline', 'withdraw', 'dispute'] as const) {
  assert.equal(getOfferConfirmCopy(action, givingOnly)!.destructive, true);
  assert.ok(!getOfferConfirmCopy(action, givingOnly)!.body.includes(givingOnly!));
}

// Check the actual screen wiring, not a separate recreation of its controls.
function source(file: string) {
  const text = readFileSync(file, 'utf8');
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
function controls(file: ts.SourceFile) {
  const result: ts.JsxAttributes[] = [];
  function visit(node: ts.Node) {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(file) === 'TouchableOpacity') result.push(node.attributes);
    ts.forEachChild(node, visit);
  }
  visit(file);
  return result;
}
function attribute(attrs: ts.JsxAttributes, name: string) {
  return attrs.properties.find((prop): prop is ts.JsxAttribute => ts.isJsxAttribute(prop) && prop.name.getText() === name)?.initializer?.getText();
}
const detail = source('app/offer/index.tsx');
for (const handler of ['handleAcceptOffer', 'handleDeclineOffer', 'handleWithdrawOffer', 'handleRaiseDispute', 'runConfirmedOfferAction']) {
  const attrs = controls(detail).find((value) => attribute(value, 'onPress') === `{${handler}}`);
  assert.ok(attrs, handler);
  assert.equal(attribute(attrs, 'accessibilityRole'), '"button"', handler);
  assert.ok(attribute(attrs, 'accessibilityLabel'), handler);
  assert.match(attribute(attrs, 'accessibilityState')!, /disabled: sending/, handler);
}
const detailText = detail.text;
assert.match(detailText, /getOfferConfirmCopy\(confirmAction, oneSidedWarning\)/);
assert.match(detailText, /getCardOnlyOfferWarning\(mySentCards, theirSentCards\)/);
assert.ok(detailText.indexOf('{oneSidedWarning ?? fairnessCopy}') < detailText.indexOf('onPress={handleAcceptOffer}'));
assert.ok(!detailText.includes('scrollToEnd'), 'The initial offer review must not jump past its warning and decision controls');
assert.ok(!detailText.includes('flagged for beta review'), 'A status flag is not a review queue');
assert.ok(detailText.includes("updateTradeOfferStatus(offerId, 'disputed')"), 'Keep the existing status contract');
assert.ok(!detailText.includes('markTradeSent') && !detailText.includes('markTradeReceived'));
const create = source('app/offer/new.tsx');
const send = controls(create).find((value) => attribute(value, 'onPress') === '{sendOffer}');
assert.ok(send);
assert.equal(attribute(send, 'accessibilityRole'), '"button"');
assert.match(attribute(send, 'accessibilityState')!, /busy: sending/);
assert.ok(controls(create).some((value) => attribute(value, 'accessibilityRole') === '"checkbox"' && attribute(value, 'accessibilityState') === '{{ checked: selected }}'));
assert.ok(create.text.includes('CARD_ONLY_RELEASE_NOTICE'));
console.log('Offer warning, honest confirmation/problem copy, decision accessibility and disabled fulfilment screen checks passed.');
