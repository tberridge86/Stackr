import assert from 'node:assert/strict';
import fs from 'node:fs';

import { LIVE_COMMERCE_RELEASE_APPROVED } from '../lib/config';
import {
  GATE0_HIDDEN_NOTIFICATION_MESSAGE,
  GATE0_HIDDEN_NOTIFICATION_TITLE,
  assertGate0OfferFreeTextDisabled,
  assertGate0UserCopyAllowed,
  gate0CopyContainsRestrictedCommerceLanguage,
  isGate0LegacyCommerceNotificationType,
  sanitizeGate0CommerceCopy,
  sanitizeGate0Notification,
  sanitizeGate0OfferFreeText,
} from '../lib/gate0CommerceCopy';
import {
  sanitizeGate0TradeOffer,
  sanitizeGate0TradeOfferEvent,
  type TradeOfferEvent,
} from '../lib/tradeGate0';
import {
  getHomeCollectionCacheKey,
  parseHomeCollectionCache,
  serializeHomeCollectionCache,
} from '../lib/homeCollectionCache';
import { isGate0CommerceActivity } from '../lib/mintyInsights';

const previousPngLoader = require.extensions['.png'];
require.extensions['.png'] = (module) => {
  module.exports = 'test-image-asset';
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const marketplacePresentation = require('../lib/marketplacePresentation') as typeof import('../lib/marketplacePresentation');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const listingCategoryRegistry = require('../lib/listingCategoryRegistry') as typeof import('../lib/listingCategoryRegistry');
const {
  getMarketplaceProductTypeLabel,
  sanitizeMarketplaceCondition,
  sanitizeMarketplaceGrade,
  sanitizeMarketplaceGradeCompany,
  sanitizeMarketplaceListingMedia,
  sanitizeMarketplaceListingPresentationFields,
  sanitizeMarketplacePricingMode,
  sanitizeMarketplaceProductType,
  sanitizeMarketplaceSetId,
} = marketplacePresentation;
if (previousPngLoader) require.extensions['.png'] = previousPngLoader;
else delete require.extensions['.png'];

assert.equal(
  LIVE_COMMERCE_RELEASE_APPROVED,
  false,
  'Gate 0 source approval must remain false',
);

const VALID_MARKETPLACE_PRODUCT_TYPES = [
  'raw_card',
  'graded_slab',
  'booster_pack',
  'sleeved_booster_pack',
  'booster_bundle',
  'booster_box',
  'elite_trainer_box',
  'collection_bundle',
  'collector_tin',
  'sealed_product',
  'accessories',
  'other',
] as const;
for (const productType of VALID_MARKETPLACE_PRODUCT_TYPES) {
  assert.equal(
    sanitizeMarketplaceProductType(productType),
    productType,
    `${productType} must remain an allowed marketplace product type`,
  );
}
for (const inheritedOrHostileType of [
  'toString',
  'constructor',
  '__proto__',
  'hasOwnProperty',
  'payment',
  'raw_card ',
  null,
  {},
]) {
  assert.equal(
    sanitizeMarketplaceProductType(inheritedOrHostileType),
    null,
    `${String(inheritedOrHostileType)} must not pass the product-type allowlist`,
  );
}
assert.equal(getMarketplaceProductTypeLabel('graded_slab'), 'Graded Slab');
assert.equal(getMarketplaceProductTypeLabel('constructor'), 'Product');
for (const inheritedCategory of ['toString', 'constructor', '__proto__']) {
  assert.equal(
    listingCategoryRegistry.getListingCategoryConfig(inheritedCategory).key,
    'raw_card',
    `${inheritedCategory} must fail closed to the default listing category`,
  );
}

for (const pricingMode of ['raw', 'graded', 'sealed', 'manual'] as const) {
  assert.equal(sanitizeMarketplacePricingMode(pricingMode), pricingMode);
}
for (const invalidPricingMode of ['payment', 'sold', 'RAW', ' raw', '', null, 1]) {
  assert.equal(sanitizeMarketplacePricingMode(invalidPricingMode), null);
}

for (const [input, expected] of [
  ['sv3pt5', 'sv3pt5'],
  [' base1:promo.2026-A ', 'base1:promo.2026-A'],
] as const) {
  assert.equal(sanitizeMarketplaceSetId(input), expected);
}
for (const unsafeSetId of [
  'Stripe',
  'shipping-label',
  'paymentLink',
  'bad set id',
  '<script>',
  `x${'a'.repeat(80)}`,
  null,
]) {
  assert.equal(
    sanitizeMarketplaceSetId(unsafeSetId),
    null,
    `${String(unsafeSetId)} must not render as a marketplace set identifier`,
  );
}

assert.equal(sanitizeMarketplaceGradeCompany('beckett'), 'BGS');
assert.equal(sanitizeMarketplaceGradeCompany('GetGraded UK'), 'GetGraded');
assert.equal(sanitizeMarketplaceGradeCompany('Stripe'), null);
assert.equal(sanitizeMarketplaceGrade('9.5', 'BGS'), '9.5');
assert.equal(sanitizeMarketplaceGrade(10, 'PSA'), '10');
assert.equal(sanitizeMarketplaceGrade('9.5', 'PSA'), null);
assert.equal(sanitizeMarketplaceGrade('8.2', 'BGS'), null);
assert.equal(sanitizeMarketplaceGrade('11', 'BGS'), null);

assert.equal(sanitizeMarketplaceCondition('near mint'), 'Near Mint');
assert.equal(
  sanitizeMarketplaceCondition('factory sealed - light shelf wear'),
  'Factory sealed - Light shelf wear',
);
assert.equal(
  sanitizeMarketplaceCondition('beckett 9.5 - case light surface marks'),
  'BGS 9.5 - case light surface marks',
);
for (const unsafeCondition of ['Stripe payment pending', 'Delivery included', 'PSA 9.5', {}, null]) {
  assert.equal(sanitizeMarketplaceCondition(unsafeCondition), null);
}

const validListingMedia = sanitizeMarketplaceListingMedia([{
  role: 'seller',
  slot: 'front',
  url: 'https://assets.stackr.example/cards/front.jpg?size=large',
  required: true,
  label: 'front',
  ignored: 'not copied',
}]);
assert.deepEqual(validListingMedia, [{
  role: 'seller',
  slot: 'front',
  url: 'https://assets.stackr.example/cards/front.jpg?size=large',
  required: true,
  label: 'Front',
}]);
for (const unsafeMediaUrl of [
  'http://assets.stackr.example/card.jpg',
  'javascript:alert(1)',
  'data:image/png;base64,AAAA',
  'file:///private/card.jpg',
  'https://user:password@assets.stackr.example/card.jpg',
  'https://assets.stackr.example/card image.jpg',
  'stripe',
  `https://assets.stackr.example/${'a'.repeat(2050)}`,
]) {
  assert.deepEqual(
    sanitizeMarketplaceListingMedia([{
      role: 'seller',
      slot: 'front',
      url: unsafeMediaUrl,
      label: 'Front',
    }]),
    [],
    `${unsafeMediaUrl.slice(0, 80)} must not survive marketplace media validation`,
  );
}
assert.deepEqual(
  sanitizeMarketplaceListingPresentationFields({
    set_id: 'shipping-label',
    product_type: 'constructor',
    product_name: 'Stripe payment requested',
    pricing_mode: 'checkout',
    grade_company: 'Unknown grader',
    grade: '11',
    condition: 'Delivery included',
    listing_media: [{ role: 'seller', slot: 'front', url: 'javascript:alert(1)' }],
  }),
  {
    set_id: null,
    product_type: null,
    product_name: 'Collector listing',
    pricing_mode: null,
    grade_company: null,
    grade: null,
    condition: null,
    listing_media: [],
  },
  'hostile structured listing fields must fail closed as one presentation row',
);

const homeCacheUserA = '00000000-0000-4000-8000-00000000000a';
const homeCacheUserB = '00000000-0000-4000-8000-00000000000b';
assert.notEqual(
  getHomeCollectionCacheKey(homeCacheUserA),
  getHomeCollectionCacheKey(homeCacheUserB),
  'Home cache keys must be account scoped',
);
assert.equal(
  getHomeCollectionCacheKey('user:with/slash'),
  'stackr:home-collection-cache:v2:user%3Awith%2Fslash',
);
assert.throws(() => getHomeCollectionCacheKey('  '), /verified user/i);
const homeSnapshot = {
  collectionTotal: 125.5,
  chartRange: '7D',
  chartData: [100, 125.5],
};
const serializedHomeSnapshot = serializeHomeCollectionCache(homeCacheUserA, homeSnapshot);
assert.deepEqual(
  parseHomeCollectionCache(serializedHomeSnapshot, homeCacheUserA),
  homeSnapshot,
);
assert.equal(parseHomeCollectionCache(serializedHomeSnapshot, homeCacheUserB), null);
for (const invalidHomeCache of [
  'not-json',
  JSON.stringify(homeSnapshot),
  JSON.stringify({ schemaVersion: 1, ownerUserId: homeCacheUserA, snapshot: homeSnapshot }),
  JSON.stringify({ schemaVersion: 2, ownerUserId: homeCacheUserA, snapshot: [] }),
  JSON.stringify({ schemaVersion: 2, ownerUserId: homeCacheUserA, snapshot: null }),
]) {
  assert.equal(
    parseHomeCollectionCache(invalidHomeCache, homeCacheUserA),
    null,
    'malformed, legacy or unbound Home cache data must fail closed',
  );
}

const HOSTILE_COPY = [
  'Please buy this card now.',
  'I am selling this outside Stackr.',
  'Complete the purchase today.',
  'Purchases close tonight.',
  'I purchased it already.',
  'We are purchasing the card.',
  'Open the checkout.',
  'The payment is due.',
  'Two payments are outstanding.',
  'I am paying now.',
  'I paid already.',
  'Your payout is ready.',
  'Payouts happen tomorrow.',
  'Create an order.',
  'Orders are open.',
  'I ordered the card.',
  'We are ordering it now.',
  'Ship it tomorrow.',
  'The cards shipped today.',
  'Shipping begins Monday.',
  'The shipment is ready.',
  'Two shipments are pending.',
  'Deliver this card.',
  'Delivery is included.',
  'Deliveries leave today.',
  'The card was delivered.',
  'We are delivering it.',
  'Print a shipping label.',
  'Use parcel tracking.',
  'Fulfil this trade.',
  'Fulfilment is underway.',
  'The offer was fulfilled.',
  'Stripe can take it.',
  'Create it through Shippo.',
  'Send it to PayPal.',
  'Use pay-pal for the transfer.',
  'Venmo works for me.',
  'Use CashApp.',
  'I can use ApplePay.',
  'Google Pay is fine.',
  'Make a bank transfer.',
  'Wire transfers are accepted.',
  'Send cash with the cards.',
  'Use a credit card.',
  'I will send a crypto payment.',
  'Open this payment-link.',
  'Pay using an off-platform link.',
  'The cards were received.',
  'Mark this as sent.',
  'The trade completed.',
  'The p\u200Bayments are ready.',
  'Use p.a.y.m.e.n.t outside the app.',
  'Open the paymentLink.',
  'ShippoTracking is ready.',
  'Use pay💸ment outside the app.',
  'p a y me £20.',
  'Send £20 via Zelle.',
  'Mail the card tomorrow.',
  'The trade is complete.',
  'Post the card tomorrow.',
  'Mail the card to me.',
  'Send the card by Royal Mail.',
  'Use DPD for the card.',
  'P.o.s.t the card tomorrow.',
  'M.a.i.l the card to me.',
  'Send the card by Royal M\u200Bail.',
  'Use D.P.D for the card.',
  'I will send the card tomorrow.',
  'I sent the card yesterday.',
  'I posted the card today.',
  'It is in the post.',
  'The card has arrived.',
  'Confirm it arrived.',
  'Revolut me £20.',
  'Send funds to account 12345678.',
  'Use my IBAN for this.',
  'I sent it today.',
  'I will send it tomorrow.',
  'Have you received it?',
  'I received it.',
  'It was sent yesterday.',
  'I posted it.',
  'The package arrived.',
  'The package is on the way.',
  'Send me 20 pounds.',
  'Send twenty GBP.',
  'Use my bank account.',
  'Transfer to @seller.',
  'Send funds.',
  'COD is fine.',
  'Use Str1pe.',
  'Create it in Shipp0.',
  'Send twenty quid.',
  'Transfer 20 quid.',
  'Deposit £20.',
  'Use royalmail.',
  'Send it RM48.',
  'Print label.',
  'shippinglabel',
  'orderready',
  'buynow',
  'For sale.',
  '£20 posted.',
  'Use str!pe.',
  'Use 5tripe.',
  'Use sh1ppo.',
  'Send by R0yal Mail.',
  'Twenty quid on top.',
  'Add a tenner.',
  'Bank me 20.',
  'Bank it over.',
  'Wire 20.',
  'Use c@sh app.',
  'Account no 12345678.',
  'Sortcode 12-34-56.',
  'Wallet address 0xabc.',
  'BTC accepted.',
  'USDT accepted.',
  'Label ready.',
  'Use evr1.',
  'Use d.p.d.',
  'P\u0430ypal: @seller.',
  'ca\u0455h app: @seller.',
  'Use bank acc\u043eunt 12345678.',
  'Use shipp\u043e.',
  'Use str\u0456pe.',
  'Send the card via R\u03bfyal Mail.',
  'Use Evr\u0456 for the card.',
  'Royal Mail.',
  'Evri.',
  'DPD.',
  'FedEx.',
  'UPS.',
  'DHL.',
  'USPS.',
  'InPost.',
  'R\u03bfyal Mail.',
  'Evr\u0456.',
] as const;

for (const hostile of HOSTILE_COPY) {
  assert.equal(
    gate0CopyContainsRestrictedCommerceLanguage(hostile),
    true,
    `restricted copy must be detected: ${hostile}`,
  );
  assert.throws(
    () => assertGate0UserCopyAllowed(hostile, 'Fixture'),
    /card-only negotiation/i,
    `restricted user copy must be rejected: ${hostile}`,
  );
  assert.equal(
    sanitizeGate0CommerceCopy(hostile, 'Hidden'),
    'Hidden',
    `restricted copy must be replaced: ${hostile}`,
  );
  assert.throws(
    () => assertGate0OfferFreeTextDisabled(hostile, 'Offer fixture'),
    /free-form offer messages/i,
    `all non-empty offer free text must be rejected: ${hostile}`,
  );
  assert.equal(sanitizeGate0OfferFreeText(hostile), null);

  const offer = sanitizeGate0TradeOffer({
    status: 'pending' as const,
    message: hostile,
    sender_sent: false,
    receiver_sent: false,
    sender_received: false,
    receiver_received: false,
    completed_at: null,
  });
  assert.equal(
    offer.message,
    null,
    `top-level offer message must be removed: ${hostile}`,
  );

  const event = sanitizeGate0TradeOfferEvent({
    id: 'event-fixture',
    offer_id: 'offer-fixture',
    user_id: 'user-fixture',
    event_type: 'message',
    note: hostile,
    proposed_cash_amount: null,
    created_at: '2026-08-27T00:00:00.000Z',
  });
  assert.equal(
    event,
    null,
    `free-form message events must be removed: ${hostile}`,
  );
}

const SAFE_LISTING_COPY = [
  'Would you trade my Pikachu and Bulbasaur for your Charizard?',
  'I can add two cards and remove Eevee from the offer.',
  'Card-only offer: one graded card for three raw cards.',
  'Can you send a clearer photo of the back?',
  'Seller photos and seller-confirmed condition',
  'Buyer or trader agreement for card-only offers.',
  'This copy came from a sold-card comparison.',
  'Recent sales evidence supports the condition estimate.',
  'The cards are worth about £20 together.',
  'I liked your post about the card condition.',
  'Royal Mail promotional card in my collection.',
  'R\u03bfyal Mail promotional card in my collection.',
  'DPD logo reference in the provenance notes.',
  'I sent the card photos from the grading report.',
  'Local pickup only.',
  'Meet in person.',
  'Arrange collection.',
  'I can drop it off.',
] as const;

for (const safe of SAFE_LISTING_COPY) {
  assert.equal(
    gate0CopyContainsRestrictedCommerceLanguage(safe),
    false,
    `safe card-only copy must remain visible: ${safe}`,
  );
  assert.doesNotThrow(
    () => assertGate0UserCopyAllowed(safe, 'Fixture'),
    `safe card-only copy must be accepted: ${safe}`,
  );
  assert.equal(
    sanitizeGate0CommerceCopy(safe, 'Hidden'),
    safe,
    `safe listing copy must not be rewritten: ${safe}`,
  );
  assert.throws(
    () => assertGate0OfferFreeTextDisabled(safe, 'Offer fixture'),
    /free-form offer messages/i,
    `even otherwise-safe offer free text must be disabled: ${safe}`,
  );
  assert.equal(sanitizeGate0OfferFreeText(safe), null);

  const offer = sanitizeGate0TradeOffer({
    status: 'pending' as const,
    message: safe,
    sender_sent: false,
    receiver_sent: false,
    sender_received: false,
    receiver_received: false,
    completed_at: null,
  });
  assert.equal(offer.message, null, `retained offer free text must be removed: ${safe}`);
}

assert.doesNotThrow(() => assertGate0OfferFreeTextDisabled(null));
assert.doesNotThrow(() => assertGate0OfferFreeTextDisabled('   '));
assert.equal(sanitizeGate0OfferFreeText('   '), null);

for (const eventType of ['message', 'counter_offer'] as const) {
  assert.equal(
    sanitizeGate0TradeOfferEvent({
      id: `event-${eventType}`,
      offer_id: 'offer-fixture',
      user_id: 'user-fixture',
      event_type: eventType,
      note: 'Card condition only.',
      proposed_cash_amount: null,
      created_at: '2026-08-27T00:00:00.000Z',
    }),
    null,
    `${eventType} events must be hidden completely in Gate 0`,
  );
}

const HIDDEN_NOTIFICATION_TYPES = [
  'payment_required',
  'payout-ready',
  'purchase_complete',
  'order_created',
  'shipment_update',
  'delivery_update',
  'shipping_label_created',
  'stripe_onboarding',
  'shippo_tracking',
  'sale_completed',
  'listing_sold',
  'trade_completed',
  'offer_completed',
  'card_received',
  'cards_sent',
  'tradeCompleted',
  'paymentRequired',
  'cashoutReady',
  'funds_sent',
] as const;

for (const type of HIDDEN_NOTIFICATION_TYPES) {
  assert.equal(
    isGate0LegacyCommerceNotificationType(type),
    true,
    `legacy commerce notification type must be hidden: ${type}`,
  );
  assert.equal(
    sanitizeGate0Notification({
      id: `notification-${type}`,
      type,
      title: 'A legacy update',
      message: 'Legacy details',
    }),
    null,
    `legacy commerce notification must be removed before state: ${type}`,
  );
}

for (const type of [
  'trade_offer',
  'offer_accepted',
  'offer_declined',
  'friend_request',
  'friend_accepted',
  'wishlist_match',
] as const) {
  assert.equal(
    isGate0LegacyCommerceNotificationType(type),
    false,
    `safe notification type must remain: ${type}`,
  );
}

for (const safeActivityType of ['binder_add', 'binder_remove', 'quantity_reduced', 'value_change']) {
  assert.equal(
    isGate0CommerceActivity({ type: safeActivityType, title: 'Collection update', subtitle: 'Card evidence changed.' }),
    false,
    `${safeActivityType} collection activity must remain visible`,
  );
}
for (const hiddenActivityType of [
  'cashout_ready',
  'funds_sent',
  'payment_required',
  'order_created',
  'shipment_update',
  'refund_requested',
  'return_requested',
  'trade_completed',
  'unknown_future_type',
]) {
  assert.equal(
    isGate0CommerceActivity({ type: hiddenActivityType, title: 'Your update is ready', subtitle: null }),
    true,
    `${hiddenActivityType} must fail closed even when its display copy is innocuous`,
  );
}

const sanitizedNotification = sanitizeGate0Notification({
  id: 'notification-hostile-copy',
  type: 'trade_offer',
  title: 'Stripe payment requested',
  message: 'Open checkout for delivery.',
});
assert.ok(sanitizedNotification, 'retained notification must remain in state');
assert.equal(sanitizedNotification.title, GATE0_HIDDEN_NOTIFICATION_TITLE);
assert.equal(sanitizedNotification.message, GATE0_HIDDEN_NOTIFICATION_MESSAGE);
assert.equal(
  gate0CopyContainsRestrictedCommerceLanguage(sanitizedNotification.title),
  false,
  'notification title replacement must be Gate 0 safe',
);
assert.equal(
  gate0CopyContainsRestrictedCommerceLanguage(sanitizedNotification.message),
  false,
  'notification message replacement must be Gate 0 safe',
);

const nonMessageEvent: TradeOfferEvent = {
  id: 'event-status-fixture',
  offer_id: 'offer-fixture',
  user_id: 'user-fixture',
  event_type: 'accepted',
  note: 'Use PayPal after accepting.',
  proposed_cash_amount: null,
  created_at: '2026-08-27T00:00:00.000Z',
};
assert.equal(
  sanitizeGate0TradeOfferEvent(nonMessageEvent)?.note,
  null,
  'unsafe non-message event notes must fail closed without display copy',
);

const tradeOffersSource = fs.readFileSync('lib/tradeOffers.ts', 'utf8');
const tradeOfferEventsSource = fs.readFileSync('lib/tradeOfferEvents.ts', 'utf8');

function assertGuardBeforeAuth(
  source: string,
  functionName: string,
  guardNeedle: string,
): void {
  const functionStart = source.indexOf(`export async function ${functionName}`);
  assert.notEqual(functionStart, -1, `${functionName}: function must exist`);
  const nextFunction = source.indexOf('export async function ', functionStart + 1);
  const body = source.slice(functionStart, nextFunction === -1 ? undefined : nextFunction);
  const guardIndex = body.indexOf(guardNeedle);
  const authIndex = body.indexOf('supabase.auth.getUser()');
  const dbIndex = body.indexOf("supabase.from('");
  assert.notEqual(guardIndex, -1, `${functionName}: copy guard must exist`);
  if (authIndex !== -1) {
    assert.ok(guardIndex < authIndex, `${functionName}: copy guard must run before auth`);
  }
  if (dbIndex !== -1) {
    assert.ok(guardIndex < dbIndex, `${functionName}: copy guard must run before DB`);
  }
}

assertGuardBeforeAuth(tradeOffersSource, 'createTradeOffer', 'assertGate0OfferFreeTextDisabled(input.message');
assertGuardBeforeAuth(tradeOffersSource, 'logTradeEvent', 'assertGate0OfferFreeTextDisabled(input.note');
assertGuardBeforeAuth(tradeOfferEventsSource, 'sendOfferMessage', 'assertGate0OfferFreeTextDisabled(note');
assertGuardBeforeAuth(tradeOfferEventsSource, 'sendCounterOffer', 'assertGate0OfferFreeTextDisabled(note');

const updateStatusStart = tradeOffersSource.indexOf('export async function updateTradeOfferStatus');
const updateStatusEnd = tradeOffersSource.indexOf('export async function ', updateStatusStart + 1);
const updateStatusBody = tradeOffersSource.slice(updateStatusStart, updateStatusEnd);
assert.doesNotMatch(
  updateStatusBody.slice(0, updateStatusBody.indexOf('): Promise<void>')),
  /note/,
  'allowed enum status transitions must not accept caller-authored notes',
);
assert.match(updateStatusBody, /eventType: status,[\s\S]*note: null/);

const offerDetailSource = fs.readFileSync('app/offer/index.tsx', 'utf8');
const newOfferSource = fs.readFileSync('app/offer/new.tsx', 'utf8');
const offersListSource = fs.readFileSync('app/offers.tsx', 'utf8');
assert.doesNotMatch(offerDetailSource, /sendOfferMessage|sendCounterOffer|placeholder="Message|handleSendMessage|handleCounter/);
assert.doesNotMatch(offerDetailSource, /protected trade flow/i);
assert.doesNotMatch(offersListSource, /protected trade flow/i);
assert.doesNotMatch(newOfferSource, /Message \(optional\)|Add a short message|message\.trim\(\)/);
assert.match(newOfferSource, /message: null/);
assert.doesNotMatch(
  newOfferSource,
  /router\.replace\(['"]\/offer['"]\)/,
  'invalid offer-builder routes must return to the offers list, not an id-less detail route',
);
assert.match(
  newOfferSource,
  /catch \(error: any\) \{[\s\S]*?Failed to load offer screen:[\s\S]*?router\.replace\(['"]\/offers['"]\)/,
  'offer-builder load failures must terminate on a safe route',
);
assert.match(
  newOfferSource,
  /const canSubmitOffer = Boolean\([\s\S]*?currentUserId[\s\S]*?listingOwnerId[\s\S]*?listingOwnerId !== currentUserId[\s\S]*?listingId[\s\S]*?targetCard\?\.card_id[\s\S]*?selectedTradeCards\.length > 0/,
  'offer submission must remain disabled until every bound identity and card selection is present',
);
assert.match(newOfferSource, /disabled=\{sending \|\| !canSubmitOffer\}/);
assert.match(newOfferSource, /name: sanitizeMarketplaceText\([\s\S]*?'Collector card'/);
assert.match(newOfferSource, /set_name: sanitizeMarketplaceText\(/);
assert.match(newOfferSource, /variant: sanitizeMarketplaceText\(owned\.variant, null\)/);
assert.match(newOfferSource, /condition: sanitizeMarketplaceCondition\(owned\.condition\)/);
assert.match(newOfferSource, /grade_company: sanitizeMarketplaceGradeCompany\(owned\.grade_company\)/);
assert.match(newOfferSource, /grade: sanitizeMarketplaceGrade\(owned\.grade, owned\.grade_company\)/);
assert.match(
  newOfferSource,
  /set_name \?\? sanitizeMarketplaceText\((?:targetCard|card)\.set_id, null\) \?\? 'Unknown set'/,
  'offer card set identifiers must be sanitized before they are used as display fallbacks',
);
assert.match(offerDetailSource, /name: sanitizeGate0CommerceCopy\(card\.name, 'Collector card'\)/);
assert.match(offerDetailSource, /set_name: sanitizeGate0CommerceCopy\(/);
assert.doesNotMatch(
  offerDetailSource,
  /preview\?\.name \?\? card\.card_id/,
  'unknown card identifiers must not be rendered as untrusted offer copy',
);

for (const [screenName, source] of [
  ['new offer', newOfferSource],
  ['offers list', offersListSource],
  ['offer detail', offerDetailSource],
] as const) {
  assert.match(source, /supabase\.auth\.onAuthStateChange/, `${screenName} must observe account switches`);
  assert.match(source, /authGenerationRef\.current \+= 1/, `${screenName} must invalidate old requests`);
  assert.match(source, /isCurrentIdentity\(userId, generation\)/, `${screenName} must guard async commits`);
}
for (const resetCall of [
  'setTargetCard(null)',
  'setMyTradeCards([])',
  'setSelectedCardIds([])',
  'setListingOwnerId(null)',
  'setTargetUserName(null)',
]) {
  assert.ok(newOfferSource.includes(resetCall), `new-offer auth switch must clear ${resetCall}`);
}
for (const resetCall of ['setOffers([])', 'setCardPreviews({})', 'setConfirmAction(null)']) {
  assert.ok(offersListSource.includes(resetCall), `offers-list auth switch must clear ${resetCall}`);
}
for (const resetCall of [
  'setOffer(null)',
  'setOfferCards([])',
  'setCardPreviews({})',
  'setEvents([])',
  'setConfirmAction(null)',
]) {
  assert.ok(offerDetailSource.includes(resetCall), `offer-detail auth switch must clear ${resetCall}`);
}
assert.match(
  offerDetailSource,
  /offerData\.sender_id !== userId && offerData\.receiver_id !== userId/,
  'offer detail must exit when the newly authenticated account is not a participant',
);

const notificationsSource = fs.readFileSync('app/notifications.tsx', 'utf8');
assert.match(
  notificationsSource,
  /\.map\(\(notification\) => sanitizeGate0Notification\(notification\)\)[\s\S]*setNotifications\(safeNotifications\)/,
  'notifications must be filtered and sanitized before entering state',
);
assert.match(
  notificationsSource,
  /isGate0LegacyCommerceNotificationType\(item\.type\)[\s\S]*switch \(item\.type\)/,
  'legacy notification types must fail closed before routing',
);
assert.match(notificationsSource, /supabase\.auth\.onAuthStateChange/);
assert.match(notificationsSource, /authGenerationRef\.current \+= 1/);
assert.match(notificationsSource, /isCurrentIdentity\(userId, generation\)/);
assert.match(
  notificationsSource,
  /bindIdentity[\s\S]*?setNotifications\(\[\]\)[\s\S]*?setMarkingAll\(false\)[\s\S]*?setRefreshing\(false\)/,
  'notification account switches must clear private rows and pending action state',
);
assert.match(
  notificationsSource,
  /\.eq\('id', item\.id\)[\s\S]*?\.eq\('user_id', userId\)/,
  'single-notification writes must remain bound to the authenticated account',
);
assert.match(
  notificationsSource,
  /const markAsRead[\s\S]*?supabase\.auth\.getUser\(\)[\s\S]*?user\?\.id !== userId[\s\S]*?setNotifications\([\s\S]*?from\('notifications'\)/,
  'single-notification actions must reverify auth before optimistic state or database writes',
);

const profileSource = fs.readFileSync('features/profile/ProfileScreen.tsx', 'utf8');
assert.match(
  profileSource,
  /from\('notifications'\)\.select\('id, type, title, message'\)[\s\S]*\.eq\('read', false\)/,
  'Profile unread badge must fetch notification copy needed for Gate 0 filtering',
);
assert.match(
  profileSource,
  /notificationsResult\.data[\s\S]*\.filter\(\(notification\) => \([\s\S]*sanitizeGate0Notification\(notification\) !== null[\s\S]*\)\)\.length/,
  'Profile unread badge must count only notifications that survive Gate 0 filtering',
);
assert.doesNotMatch(
  profileSource,
  /from\('notifications'\)\.select\('id', \{ count: 'exact', head: true \}\)/,
  'Profile unread badge must not use an unsanitized head-only notification count',
);

const homeScreenSource = fs.readFileSync('features/home/HubScreen.tsx', 'utf8');
assert.match(homeScreenSource, /AsyncStorage\.removeItem\(LEGACY_HOME_COLLECTION_CACHE_KEY\)/);
assert.match(homeScreenSource, /getHomeCollectionCacheKey\(trustedUserId\)/);
assert.match(
  homeScreenSource,
  /parseHomeCollectionCache<Partial<HomeCollectionCacheSnapshot>>\([\s\S]*?raw,[\s\S]*?trustedUserId,[\s\S]*?\)/,
  'Home cache hydration must bind the envelope to the verified user',
);
assert.match(
  homeScreenSource,
  /if \(confirmedUser\?\.id !== trustedUserId\) \{[\s\S]*?return false;/,
  'Home cache hydration must recheck auth before applying cached state',
);
assert.match(
  homeScreenSource,
  /const saveHomeCollectionCache = useCallback\(async \([\s\S]*?supabase\.auth\.getUser\(\)[\s\S]*?user\?\.id !== trustedUserId\) return[\s\S]*?serializeHomeCollectionCache\(trustedUserId/,
  'Home cache persistence must verify and bind the current account',
);
assert.doesNotMatch(
  homeScreenSource,
  /AsyncStorage\.(?:getItem|setItem)\(LEGACY_HOME_COLLECTION_CACHE_KEY/,
  'the unscoped Home cache must only be removed, never read or written',
);
assert.match(homeScreenSource, /condition: sanitizeMarketplaceCondition\(row\.condition\)/);
assert.match(homeScreenSource, /homeCollectionRequestRef\.current \+= 1/);
assert.match(homeScreenSource, /homeSessionUserIdRef\.current !== trustedUserId/);
assert.match(homeScreenSource, /LEGACY_MINTY_PERSONALISATION_STORAGE_KEY/);
assert.match(homeScreenSource, /MINTY_PERSONALISATION_STORAGE_KEY_PREFIX = 'stackr:minty-personalisation:v2'/);
assert.match(homeScreenSource, /getMintyPersonalisationStorageKey\(trustedUserId\)/);
assert.match(homeScreenSource, /mintyPreferenceGenerationRef\.current \+= 1/);
assert.match(homeScreenSource, /mintyInsightRequestRef\.current \+= 1/);
assert.match(homeScreenSource, /setApiMintyInsight\(null\)/);
assert.match(homeScreenSource, /confirmedUser\?\.id !== trustedUserId/);

const createListingSource = fs.readFileSync('features/listing/CreateListingScreen.tsx', 'utf8');
assert.match(createListingSource, /supabase\.auth\.onAuthStateChange/);
assert.match(createListingSource, /authEventEpoch \+= 1/);
assert.match(createListingSource, /initialAuthEventEpoch !== authEventEpoch/);
assert.match(createListingSource, /draftAuthGenerationRef\.current \+= 1/);
assert.match(createListingSource, /setDraftSessionUserId\(userId\)/);
assert.match(createListingSource, /resetListingDraftState\(\)/);
for (const accountReset of [
  'setOwnedCards([])',
  'setRecentSearches([])',
  'setCollectionLoading(false)',
]) {
  assert.ok(createListingSource.includes(accountReset), `listing auth switch must clear ${accountReset}`);
}
assert.match(createListingSource, /verifyCurrentDraftIdentity[\s\S]*?supabase\.auth\.getUser\(\)/);
assert.match(createListingSource, /const raw = await AsyncStorage\.getItem\(scopedDraftKey\)[\s\S]*?!await verifyCurrentDraftIdentity\(\)/);
assert.match(createListingSource, /loadOwnedCards = useCallback\(async \([\s\S]*?expectedUserId[\s\S]*?expectedGeneration/);
assert.match(createListingSource, /ownedCardsRequestIdRef\.current === requestId/);
assert.match(createListingSource, /user\?\.id !== draftSessionUserId/);
assert.match(createListingSource, /getCreateListingDraftKey\(user\.id\) !== draftStorageKey/);

const tradeContextSource = fs.readFileSync('components/trade-context.tsx', 'utf8');
assert.match(tradeContextSource, /supabase\.auth\.onAuthStateChange/);
assert.match(tradeContextSource, /authGenerationRef\.current \+= 1/);
assert.match(tradeContextSource, /clearAccountScopedTradeState\(\)/);
for (const clearedState of [
  'setTradeCardIds([])',
  'setWishlistCardIds([])',
  'setTradeKeys([])',
  'setWishlistKeys([])',
  'setTradeMeta({})',
  'setMyListings([])',
]) {
  assert.ok(tradeContextSource.includes(clearedState), `TradeProvider must clear ${clearedState} on identity change`);
}
assert.match(tradeContextSource, /if \(!isCurrentAuthIdentity\(userId, generation\)\) return;/);
assert.match(tradeContextSource, /refreshTradeInFlightRef\.current = \{ userId, generation, request \}/);

const marketSavedItemsSource = fs.readFileSync('lib/marketSavedItems.ts', 'utf8');
assert.match(marketSavedItemsSource, /SAVED_MARKET_LISTINGS_KEY_PREFIX = '@stackr:market:saved-listing-ids:v2'/);
assert.match(marketSavedItemsSource, /getSavedMarketListingsKey\(userId: string\)/);
assert.match(marketSavedItemsSource, /encodeURIComponent\(normalizeTrustedUserId\(userId\)\)/);
assert.match(marketSavedItemsSource, /AsyncStorage\.removeItem\(LEGACY_SAVED_MARKET_LISTINGS_KEY\)/);
assert.match(marketSavedItemsSource, /requireVerifiedCurrentUser\(userId\)/);
const persistSavedStart = marketSavedItemsSource.indexOf('async function persistSavedMarketListingIds');
const persistSavedEnd = marketSavedItemsSource.indexOf('function enqueueSavedMarketMutation', persistSavedStart);
const persistSavedBody = marketSavedItemsSource.slice(persistSavedStart, persistSavedEnd);
assert.ok(persistSavedStart >= 0, 'saved Market persistence helper must exist');
assert.ok(
  persistSavedBody.indexOf('requireVerifiedCurrentUser(userId)')
    < persistSavedBody.indexOf('AsyncStorage.setItem('),
  'saved Market writes must recheck the verified current user immediately before persistence',
);
assert.doesNotMatch(
  marketSavedItemsSource,
  /AsyncStorage\.(?:getItem|setItem)\(LEGACY_SAVED_MARKET_LISTINGS_KEY/,
  'legacy globally shared saved-listing state must never be read or written',
);

const marketScreenSource = fs.readFileSync('features/market/MarketTabScreen.tsx', 'utf8');
assert.match(marketScreenSource, /fetchSavedMarketListingIds\(userId\)/);
assert.match(marketScreenSource, /toggleSavedMarketListing\(currentUserId, listingId\)/);
assert.match(marketScreenSource, /supabase\.auth\.onAuthStateChange/);
assert.match(marketScreenSource, /marketAuthGenerationRef\.current \+= 1/);
for (const clearCall of [
  'setOffers([])',
  'setSavedListingIds([])',
  'setFavoriteBusyIds([])',
  'setListingDraft(null)',
  'setMenuListing(null)',
  'setSelectedListing(null)',
]) {
  assert.ok(marketScreenSource.includes(clearCall), `Market auth switch must clear ${clearCall}`);
}
assert.match(marketScreenSource, /marketAuthUserIdRef\.current !== userId/);
const watchlistSource = fs.readFileSync('app/watchlist.tsx', 'utf8');
assert.match(watchlistSource, /supabase\.auth\.getUser\(\)/);
assert.match(watchlistSource, /supabase\.auth\.onAuthStateChange/);
assert.match(watchlistSource, /authGenerationRef\.current \+= 1/);
assert.match(watchlistSource, /fetchSavedMarketListingIds\(userId\)/);
assert.match(watchlistSource, /toggleSavedMarketListing\(currentUserId, item\.id\)/);

const listingDraftsSource = fs.readFileSync('lib/listingDrafts.ts', 'utf8');
assert.match(listingDraftsSource, /clearCreateListingDraft\(userId: string\)[\s\S]*?supabase\.auth\.getUser\(\)/);
assert.match(listingDraftsSource, /user\?\.id !== userId/);

console.log(
  `Gate 0 dynamic copy tests passed (${HOSTILE_COPY.length} hostile fixtures, ${SAFE_LISTING_COPY.length} safe listing fixtures).`,
);
