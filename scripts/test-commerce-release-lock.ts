import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.STACKR_NODE_TOOLING_RUNTIME = 'true';

const {
  BETA_TRADE_DEMO_MODE,
  LIVE_COMMERCE_RELEASE_APPROVED,
  TRADE_CASH_TERMS_ENABLED,
  TRADE_FULFILMENT_ENABLED,
  assertTradeFulfilmentEnabled,
  isBetaTradeDemoMode,
} = require('../lib/config') as typeof import('../lib/config');
const {
  isGate0TradeEventVisible,
  normalizeGate0TradeOfferStatus,
  sanitizeGate0TradeOffer,
  sanitizeGate0TradeOfferEvent,
} = require('../lib/tradeGate0') as typeof import('../lib/tradeGate0');

assert.equal(
  LIVE_COMMERCE_RELEASE_APPROVED,
  false,
  'live commerce must remain disabled in reviewed source',
);
assert.equal(
  isBetaTradeDemoMode('false'),
  true,
  'EXPO_PUBLIC_BETA_TRADE_DEMO_MODE=false must not override source approval',
);
assert.equal(isBetaTradeDemoMode('true'), true);
assert.equal(isBetaTradeDemoMode(undefined), true);
assert.equal(
  BETA_TRADE_DEMO_MODE,
  true,
  'the exported runtime mode must remain demo-only while source approval is false',
);
assert.equal(
  TRADE_CASH_TERMS_ENABLED,
  false,
  'cash terms must remain source-locked with live commerce',
);
assert.equal(TRADE_FULFILMENT_ENABLED, false, 'trade fulfilment must remain source-locked');
assert.throws(assertTradeFulfilmentEnabled, /Trade fulfilment is disabled/);

for (const status of ['payment_required', 'payment_sent', 'payment_confirmed', 'sent', 'received', 'completed']) {
  assert.equal(normalizeGate0TradeOfferStatus(status), 'unavailable', `${status} must not reach Gate 0 UI`);
}
for (const status of ['pending', 'accepted', 'declined', 'cancelled', 'disputed']) {
  assert.equal(normalizeGate0TradeOfferStatus(status), status, `${status} is a safe negotiation state`);
}

const hostileOffer = sanitizeGate0TradeOffer({
  id: 'legacy-offer',
  sender_id: 'sender',
  receiver_id: 'receiver',
  status: 'completed',
  message: null,
  listing_id: null,
  sender_sent: true,
  receiver_sent: true,
  sender_received: true,
  receiver_received: true,
  created_at: '2026-08-27T00:00:00.000Z',
  updated_at: '2026-08-27T00:00:00.000Z',
  completed_at: '2026-08-27T00:00:00.000Z',
  accepted_at: null,
  declined_at: null,
  trade_cash_terms: [{ amount: 50 }],
});
assert.equal(hostileOffer.status, 'unavailable');
assert.equal(hostileOffer.sender_sent, false);
assert.equal(hostileOffer.receiver_sent, false);
assert.equal(hostileOffer.sender_received, false);
assert.equal(hostileOffer.receiver_received, false);
assert.equal(hostileOffer.completed_at, null);
assert.equal(hostileOffer.trade_cash_terms, undefined);

for (const eventType of ['payment_required', 'payment_sent', 'payment_confirmed', 'sent', 'received', 'completed']) {
  assert.equal(isGate0TradeEventVisible(eventType), false, `${eventType} event must be hidden`);
  assert.equal(sanitizeGate0TradeOfferEvent({
    id: `event-${eventType}`,
    offer_id: 'legacy-offer',
    user_id: 'sender',
    event_type: eventType,
    note: 'Stripe label tracking fulfilment completed',
    proposed_cash_amount: 25,
    created_at: '2026-08-27T00:00:00.000Z',
  }), null);
}
const disputedEvent = sanitizeGate0TradeOfferEvent({
  id: 'event-disputed',
  offer_id: 'legacy-offer',
  user_id: 'sender',
  event_type: 'disputed',
  note: 'Card condition differs from the offer.',
  proposed_cash_amount: 25,
  created_at: '2026-08-27T00:00:00.000Z',
});
assert.equal(disputedEvent?.event_type, 'disputed');
assert.equal(disputedEvent?.proposed_cash_amount, null);
const hostileMessage = sanitizeGate0TradeOfferEvent({
  id: 'event-message',
  offer_id: 'legacy-offer',
  user_id: 'sender',
  event_type: 'message',
  note: 'Print the shipping label and add tracking.',
  proposed_cash_amount: null,
  created_at: '2026-08-27T00:00:00.000Z',
});
assert.equal(
  hostileMessage,
  null,
  'legacy free-form message events must be hidden completely during Gate 0',
);

const appLayout = fs.readFileSync('app/_layout.tsx', 'utf8');
const stripeProviderBranch = appLayout.match(
  /BETA_TRADE_DEMO_MODE\s*\?\s*\(\s*<AppNavigation\s*\/>\s*\)\s*:\s*\(\s*<StripeAppProvider>/s,
);
assert.ok(
  stripeProviderBranch,
  'StripeAppProvider must remain on the non-demo branch guarded by BETA_TRADE_DEMO_MODE',
);

const tradeOffers = fs.readFileSync('lib/tradeOffers.ts', 'utf8');
const createOfferStart = tradeOffers.indexOf('export async function createTradeOffer');
const createOfferCashLock = tradeOffers.indexOf(
  'if (input.cash != null && !TRADE_CASH_TERMS_ENABLED)',
  createOfferStart,
);
const createOfferAuth = tradeOffers.indexOf('supabase.auth.getUser()', createOfferStart);
const cashStatusStart = tradeOffers.indexOf('export async function updateCashPaymentStatus');
const cashStatusLock = tradeOffers.indexOf('if (!TRADE_CASH_TERMS_ENABLED)', cashStatusStart);
const cashStatusWrite = tradeOffers.indexOf(".from('trade_cash_terms')", cashStatusStart);
assert.ok(
  createOfferCashLock > createOfferStart && createOfferCashLock < createOfferAuth,
  'cash offers must fail before any Supabase auth or database operation',
);
assert.ok(
  cashStatusLock > cashStatusStart && cashStatusLock < cashStatusWrite,
  'cash payment-status changes must fail before the database update',
);
const genericStatusStart = tradeOffers.indexOf('export async function updateTradeOfferStatus');
const genericPaymentStatusLock = tradeOffers.indexOf(
  '!TRADE_CASH_TERMS_ENABLED && PAYMENT_TRADE_STATUSES.has(status)',
  genericStatusStart,
);
const genericStatusAuth = tradeOffers.indexOf('supabase.auth.getUser()', genericStatusStart);
assert.ok(
  genericPaymentStatusLock > genericStatusStart && genericPaymentStatusLock < genericStatusAuth,
  'generic status changes must reject payment states before any Supabase operation',
);
const logEventStart = tradeOffers.indexOf('export async function logTradeEvent');
const logEventCashLock = tradeOffers.indexOf('input.proposedCashAmount != null', logEventStart);
const logEventPaymentLock = tradeOffers.indexOf('PAYMENT_TRADE_STATUSES.has(input.eventType', logEventStart);
const logEventWrite = tradeOffers.indexOf(".from('trade_offer_events')", logEventStart);
assert.ok(
  logEventCashLock > logEventStart && logEventCashLock < logEventWrite,
  'event logging must reject every supplied cash value before the database insert',
);
assert.ok(
  logEventPaymentLock > logEventStart && logEventPaymentLock < logEventWrite,
  'event logging must reject payment events before the database insert',
);
const paymentHelperStart = tradeOffers.indexOf('export async function createTradeCashPaymentIntent');
const demoGuard = tradeOffers.indexOf('if (BETA_TRADE_DEMO_MODE)', paymentHelperStart);
const paymentFetch = tradeOffers.indexOf('/api/stripe/create-trade-cash-payment-intent', paymentHelperStart);

assert.ok(paymentHelperStart >= 0, 'trade cash payment helper must exist');
assert.ok(demoGuard > paymentHelperStart, 'trade cash payment helper must check demo mode');
assert.ok(paymentFetch > demoGuard, 'demo-mode guard must run before the payment network request');

const marketScreen = fs.readFileSync('features/market/MarketTabScreen.tsx', 'utf8');
assert.match(
  marketScreen,
  /filter\.key !== 'tradePlusCash' \|\| TRADE_CASH_TERMS_ENABLED/,
  'trade-plus-cash filters must remain hidden while cash terms are locked',
);
assert.match(
  marketScreen,
  /if \(TRADE_CASH_TERMS_ENABLED && listing\.trade_only && listing\.asking_price != null\)/,
  'legacy trade-plus-cash listing copy must fall back to card-for-card wording while locked',
);
assert.doesNotMatch(
  marketScreen,
  /Buy now|Make purchase offer|Checkout not yet enabled|Delivery method|Delivery data pending|Read seller reviews|Report listing|Hide this listing|Block seller|MARKET_AVAILABILITY_FILTERS/,
  'Market must not advertise commerce, delivery, dead availability, or unpersisted trust actions',
);

const sellerOnboarding = fs.readFileSync('app/seller/onboarding.tsx', 'utf8');
assert.match(sellerOnboarding, /<Redirect href="\/seller"/);
assert.doesNotMatch(
  sellerOnboarding,
  /fetch\(|api\/stripe|create-connect-account|create-account-link|Stripe|payment|payout/i,
  'seller onboarding must redirect without rendering a payment teaser while commerce is locked',
);

const newOfferScreen = fs.readFileSync('app/offer/new.tsx', 'utf8');
assert.doesNotMatch(
  newOfferScreen,
  /TRADE_CASH_TERMS_ENABLED|cashAmount|cashPayer|Cash top-up|paymentStatus|Stripe/,
  'offer creation must remain strictly card-only with no dormant payment UI',
);

const tradeOfferEvents = fs.readFileSync('lib/tradeOfferEvents.ts', 'utf8');
const counterStart = tradeOfferEvents.indexOf('export async function sendCounterOffer');
const counterLock = tradeOfferEvents.indexOf('!TRADE_CASH_TERMS_ENABLED', counterStart);
const counterAuth = tradeOfferEvents.indexOf('supabase.auth.getUser()', counterStart);
assert.ok(
  counterLock > counterStart && counterLock < counterAuth,
  'cash counter-offers must fail before any Supabase operation',
);
assert.match(
  tradeOfferEvents.slice(counterStart, counterAuth),
  /cash != null && !TRADE_CASH_TERMS_ENABLED/,
  'zero, negative and non-finite supplied cash values must not bypass the source lock',
);

const marketComponents = fs.readFileSync('components/market/MarketComponents.tsx', 'utf8');
assert.doesNotMatch(
  marketComponents,
  /Buy now|Make purchase offer|completed sale|Identity verified|LIVE_COMMERCE_RELEASE_APPROVED|TRADE_CASH_TERMS_ENABLED|Delivery costs may apply|\bSold\b|Do not ship|transaction proceeds/,
  'Market cards must use offer-only copy and neutral collector identity',
);
assert.match(marketComponents, /Collector listing owner/);

const settingsScreen = fs.readFileSync('app/settings.tsx', 'utf8');
assert.doesNotMatch(
  settingsScreen,
  /Payment methods|payout|title: 'Payments'|Seller payout settings/i,
  'settings must not advertise hidden payment or payout surfaces',
);

const sellerWorkspace = fs.readFileSync('lib/sellerWorkspace.ts', 'utf8');
assert.doesNotMatch(sellerWorkspace, /key: 'orders'|key: 'payouts'/);
assert.match(
  sellerWorkspace,
  /Record purchased, traded or store intake stock in reviewable inventory batches/,
  'seller purchase labels must remain inventory bookkeeping, not payment execution',
);

for (const routePath of ['app/orders.tsx', 'app/seller/orders.tsx']) {
  const hiddenRoute = fs.readFileSync(routePath, 'utf8');
  assert.match(hiddenRoute, /<Redirect href=/, `${routePath} must fail closed to an exposed surface`);
  assert.doesNotMatch(
    hiddenRoute,
    /MarketEmptyState|StackrStateBlock|PremiumSellerGate|checkout|payment|payout/i,
    `${routePath} must not render an order or payment teaser`,
  );
}

const tradeReviewRoute = fs.readFileSync('app/offer/review.tsx', 'utf8');
assert.match(tradeReviewRoute, /<Redirect href="\/offers" \/>/);
assert.doesNotMatch(
  tradeReviewRoute,
  /createTradeReview|trade completed|Submit Review|reviewUserId/i,
  'post-fulfilment review must be a strict hidden redirect during Gate 0',
);

const offersScreen = fs.readFileSync('app/offers.tsx', 'utf8');
assert.doesNotMatch(
  offersScreen,
  /Completed and declined offers will appear here/i,
  'offer history copy must not advertise a hidden completed state',
);

const cardDetail = fs.readFileSync('app/card/[id].tsx', 'utf8');
const productDetail = fs.readFileSync('app/product/[id].tsx', 'utf8');
const watchlist = fs.readFileSync('app/watchlist.tsx', 'utf8');
assert.doesNotMatch(cardDetail, />Buy listings<|buy listing\{/);
assert.doesNotMatch(productDetail, /\} buy,|purchase: number|summary\.purchase/);
assert.doesNotMatch(watchlist, /Purchase listing|variantType: [^\n]*'buy'/);
assert.match(cardDetail, /\{premiumSellerAccess\.allowed \? existingActiveListing \? \(/);
assert.match(productDetail, /\{premiumSellerAccess\.allowed \? \(\s*<TouchableOpacity/s);

const marketTabSource = fs.readFileSync('features/market/MarketTabScreen.tsx', 'utf8');
assert.match(marketTabSource, /showMyListings=\{canPublishListing\}/);
assert.match(marketTabSource, /\{canPublishListing \? \(\s*<TouchableOpacity[\s\S]*Create Beta Listing/);
assert.match(marketTabSource, /if \(!canPublishListing\) setWorkspace\('discover'\)/);

const searchScreen = fs.readFileSync('app/(tabs)/search.tsx', 'utf8');
const searchResults = fs.readFileSync('components/search/SearchResults.tsx', 'utf8');
assert.match(searchScreen, /modeLabel: isTrade \? 'Trade' : 'Offers'/);
assert.doesNotMatch(searchScreen, /modeLabel: isTrade \? 'Trade' : 'Buy'/);
assert.match(searchResults, /modeLabel === 'Trade' \? 'Trade' : modeLabel \? 'Offers' : modeLabel/);
assert.doesNotMatch(searchResults, /['"]Buy['"]/);

const homeCommandCenter = fs.readFileSync('components/HomeCommandCenter.tsx', 'utf8');
assert.doesNotMatch(homeCommandCenter, /Sell, trade, or organise|listing\.tradeOnly \? 'Trade' : 'Buy'/);
assert.match(homeCommandCenter, /browse-only listing/);

const profileScreen = fs.readFileSync('features/profile/ProfileScreen.tsx', 'utf8');
assert.match(profileScreen, /\{premiumSellerAccess\.allowed \? \(\s*<View[^>]*>\s*<SectionHeader title="Trusted seller beta"/s);

const hubScreen = fs.readFileSync('features/home/HubScreen.tsx', 'utf8');
assert.match(hubScreen, /\{premiumSellerAccess\.allowed \? \(\s*<Modal visible=\{roleModalOpen\}/s);
assert.doesNotMatch(hubScreen, /ordinary Market listings remain available outside|create ordinary listings/);
assert.doesNotMatch(hubScreen, /Use purchase history/);
assert.match(
  hubScreen,
  /const visibleFeed = \(feedResult\.data \?\? \[\]\)\s*\.filter\(\(post: any\) => !isGate0CommerceActivity\(post\)\)/s,
);
assert.doesNotMatch(hubScreen, /premiumSellerAccess\.allowed\s*\?\s*\(feedResult\.data/);

const duplicatesScreen = fs.readFileSync('app/duplicates.tsx', 'utf8');
assert.match(duplicatesScreen, /\{canCreateListing \? \(\s*<StackrButton\s*label="Create beta listing"/s);
assert.match(duplicatesScreen, /canCreateListing=\{premiumSellerAccess\.allowed\}/);

for (const scanPath of ['app/scan/index.tsx', 'app/scan/result.tsx']) {
  const scanEntry = fs.readFileSync(scanPath, 'utf8');
  assert.match(scanEntry, /premiumSellerAccess\.allowed/);
  assert.match(scanEntry, /isListingScanRequest\(params\)/);
  assert.match(scanEntry, /<Redirect href="\/\(tabs\)\/market" \/>/);
}

const createListingScreen = fs.readFileSync('features/listing/CreateListingScreen.tsx', 'utf8');
const createListingRoute = fs.readFileSync('app/listing/new.tsx', 'utf8');
assert.match(createListingRoute, /premiumSellerAccess\.allowed/);
assert.match(createListingRoute, /<Redirect href="\/\(tabs\)\/market" \/>/);
assert.doesNotMatch(createListingScreen, /Shippo-ready|Shippo preview|Shippo rate preview/);
assert.doesNotMatch(
  createListingScreen,
  /lib\/shippoDelivery|SHIPPO_DELIVERY_METHODS|deliveryPickerVisible|postageCost|deliveryPostageLabel|Royal Mail|Evri|InPost|DPD/,
  'listing UI must not expose dormant carrier choices or static postage quotes while shipping is hidden',
);
const listingCopyGate = createListingScreen.indexOf('assertGate0UserCopyAllowed(value, field)');
const listingAuth = createListingScreen.indexOf('supabase.auth.getUser()', createListingScreen.indexOf('const publishListing = async'));
assert.ok(
  listingCopyGate > createListingScreen.indexOf('const publishListing = async')
    && listingCopyGate < listingAuth,
  'user-authored listing copy must be rejected before auth, upload or database access',
);

const marketplaceLibrary = fs.readFileSync('lib/marketplace.ts', 'utf8');
assert.match(marketplaceLibrary, /const presentation = sanitizeMarketplaceListingPresentationFields\(row\)/);
assert.match(marketplaceLibrary, /product_name: presentation\.product_name/);
assert.match(marketplaceLibrary, /listing_notes: sanitizeGate0CommerceCopy/);
assert.match(marketplaceLibrary, /collector_name: sanitizeGate0CommerceCopy/);

assert.match(marketScreen, /gate0MarketText\(/);
assert.doesNotMatch(marketScreen, /Shop listings|Sold as seen|verified: Boolean\(/);
assert.doesNotMatch(
  marketScreen,
  /Delivery and fulfilment|Collectors agree delivery directly/i,
  'Market detail must not promote an off-platform delivery or fulfilment path',
);
assert.match(
  marketScreen,
  /Checkout, payment, shipping and fulfilment are unavailable\./,
  'Market detail must disclose the Gate 0 boundary without promoting execution',
);

const searchScreenSource = fs.readFileSync('app\/(tabs)\/search.tsx', 'utf8');
assert.match(searchScreenSource, /title: sanitizeGate0CommerceCopy\(/);
assert.match(searchScreenSource, /name: sanitizeGate0CommerceCopy\(profile\.collector_name/);

const homeScreen = fs.readFileSync('features/home/HubScreen.tsx', 'utf8');
assert.match(homeScreen, /\.map\(\(notification: any\) => sanitizeGate0Notification\(notification\)\)/);
assert.match(homeScreen, /sanitizeGate0CommerceCopy\(profile\.collector_name/);

const latestFeatures = fs.readFileSync('components/LatestFeaturesModal.tsx', 'utf8');
assert.doesNotMatch(latestFeatures, /in progress|debug logging|being refined|Market value work/i);
assert.match(
  createListingScreen,
  /This publishes a browse-only listing\. It does not create a Stackr transaction\./,
  'trusted-cohort listings must be presented as browse-only with no Stackr transaction',
);
assert.doesNotMatch(
  createListingScreen,
  /Sold as seen evidence/i,
  'listing review must use neutral evidence copy while transaction workflows are unavailable',
);
assert.match(createListingScreen, /const GOLD_VERIFICATION_ENABLED = false/);
assert.doesNotMatch(
  createListingScreen,
  /trackingReference|PrinterSelector|LabelPreview|VerificationStatusTimeline|renderGold|Send to AGS|purchase shipping|purchase labels/,
  'Gold outbound fulfilment and label-generation controls must be absent during Gate 0',
);

const communityScreen = fs.readFileSync('app/(tabs)/community/index.tsx', 'utf8');
assert.doesNotMatch(communityScreen, /cash top-up/i);
assert.doesNotMatch(communityScreen, /Trade history coming soon|Slab support coming soon/);

const offerDetail = fs.readFileSync('app/offer/index.tsx', 'utf8');
assert.match(offerDetail, /fetchTradeOfferById\(offerId\)/);
assert.match(offerDetail, /sanitizeGate0TradeOfferEvent\(payload\.new as TradeOfferEvent\)/);
assert.match(
  offerDetail,
  /sanitizeGate0TradeOffer\(\{ \.\.\.(?:offer|prev), \.\.\.payload\.new \} as TradeOffer\)/,
  'offer realtime updates must pass through the Gate 0 sanitizer before state',
);
assert.doesNotMatch(
  offerDetail,
  /trade_cash_terms|Trade Progress|Mark sent|Mark received|sender_sent|receiver_sent|sender_received|receiver_received|completed_at/,
  'offer detail must sanitize initial and realtime rows without rendering payment or fulfilment state',
);
assert.match(offerDetail, /disputed: 'Problem flagged'/, 'The existing disputed state is a flag, not a support case');
assert.match(offerDetail, /updateTradeOfferStatus\(offerId, 'disputed'\)/, 'Keep the existing backend status contract');

const tradeContext = fs.readFileSync('components/trade-context.tsx', 'utf8');
for (const functionName of ['markTradeSent', 'markTradeReceived']) {
  const start = tradeContext.indexOf(`const ${functionName} = useCallback`);
  const gate = tradeContext.indexOf('assertTradeFulfilmentEnabled();', start);
  const database = tradeContext.indexOf(".from('trade_offers')", start);
  assert.ok(start >= 0 && gate > start && gate < database, `${functionName} must fail before Supabase`);
}

const clientSource = ['app', 'components', 'features', 'lib']
  .flatMap(sourceFiles)
  .map((filePath) => fs.readFileSync(filePath, 'utf8'))
  .join('\n');
assert.doesNotMatch(
  clientSource,
  /\/api\/notify(?:\/|['"`])|\/api\/discord\/(?:new-trade-listing|new-review)/,
  'Gate 0 clients must not call retired unauthenticated side-effect routes',
);

function sourceFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = `${root}/${entry.name}`;
    if (entry.isDirectory()) files.push(...sourceFiles(entryPath));
    else if (entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name)) files.push(entryPath);
  }
  return files;
}

for (const filePath of ['app', 'components', 'features'].flatMap(sourceFiles)) {
  const source = fs.readFileSync(filePath, 'utf8');
  assert.doesNotMatch(
    source,
    /from\s+['"][^'"]*\/lib\/shippo(?:Delivery)?['"]|fetchShippo(?:Status|Rates|Tracking)\(|createShippoLabel\(/,
    `${filePath} must not connect a user surface to Shippo while shipping is locked`,
  );
}

console.log('Commerce release lock checks passed.');
