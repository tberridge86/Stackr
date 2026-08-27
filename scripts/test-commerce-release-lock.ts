import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  BETA_TRADE_DEMO_MODE,
  LIVE_COMMERCE_RELEASE_APPROVED,
  TRADE_CASH_TERMS_ENABLED,
  isBetaTradeDemoMode,
} from '../lib/config';

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
  /const canBuy = LIVE_COMMERCE_RELEASE_APPROVED\s*&&/,
  'checkout actions must be absent unless source approval is reviewed',
);
assert.match(
  marketScreen,
  /filter\.key !== 'buy' \|\| LIVE_COMMERCE_RELEASE_APPROVED/,
  'Buy now filters must remain hidden while live commerce is locked',
);
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
const buyNowStart = marketScreen.indexOf('const handleBuyNow = () =>');
const buyNowEnd = marketScreen.indexOf('const clearFilters', buyNowStart);
const buyNowHandler = marketScreen.slice(buyNowStart, buyNowEnd);
assert.ok(buyNowStart >= 0 && buyNowEnd > buyNowStart, 'Market Buy Now handler must remain explicit');
assert.match(buyNowHandler, /Checkout not yet enabled/);
assert.doesNotMatch(
  buyNowHandler,
  /fetch\(|api\/stripe|api\/shippo|createPaymentIntent|createShippoLabel/,
  'Market Buy Now must remain an inert unavailable-state alert',
);

const sellerOnboarding = fs.readFileSync('app/seller/onboarding.tsx', 'utf8');
assert.match(sellerOnboarding, /Stripe onboarding, checkout and payouts remain off/);
assert.doesNotMatch(
  sellerOnboarding,
  /fetch\(|api\/stripe|create-connect-account|create-account-link/,
  'seller onboarding must not call Stripe while commerce is locked',
);

const newOfferScreen = fs.readFileSync('app/offer/new.tsx', 'utf8');
assert.match(newOfferScreen, /const cashInvolved = TRADE_CASH_TERMS_ENABLED &&/);
assert.match(newOfferScreen, /\{TRADE_CASH_TERMS_ENABLED \? \(\s*<Section title="Cash top-up/s);
assert.match(newOfferScreen, /cash: TRADE_CASH_TERMS_ENABLED && cashInvolved/);

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
assert.match(marketComponents, /LIVE_COMMERCE_RELEASE_APPROVED \? 'Buy' : 'Offers only'/);
assert.match(marketComponents, /TRADE_CASH_TERMS_ENABLED \? 'Trade \+ cash' : 'Trade'/);

const createListingScreen = fs.readFileSync('features/listing/CreateListingScreen.tsx', 'utf8');
assert.doesNotMatch(createListingScreen, /Shippo-ready|Shippo preview|Shippo rate preview/);
assert.match(createListingScreen, /Live rates and label purchase are unavailable for this release/);

const communityScreen = fs.readFileSync('app/(tabs)/community/index.tsx', 'utf8');
assert.doesNotMatch(communityScreen, /cash top-up/i);

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
    /from\s+['"][^'"]*\/lib\/shippo['"]|fetchShippo(?:Status|Rates|Tracking)\(|createShippoLabel\(/,
    `${filePath} must not connect a user surface to Shippo while shipping is locked`,
  );
}

console.log('Commerce release lock checks passed.');
