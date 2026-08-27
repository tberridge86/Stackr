import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  canPublishPremiumSellerModeChange,
  assertPremiumSellerWriteAccess,
  getPremiumSellerAccess,
  hasPremiumSellerEntitlement,
  isPremiumSellerModeEnabled,
} from '../lib/premiumSellerAccess';
import { isPremiumSellerInventoryScan } from '../lib/sellerScanAccess';
import { isListingScanRequest } from '../lib/scanIntent';
import { isVerifiedSellerSessionIdentity, sellerBatchRequestId, sellerCacheKey } from '../lib/sellerCache';
import { loadRemoteWithCache } from '../lib/sellerRemoteCache';
import { assertActivityPostIdentity } from '../lib/activityIdentity';
import {
  canStartSellerInventoryCommit,
  executeSellerBatchWithIdentity,
  isSellerInventoryCommitReconciliationRequired,
} from '../lib/sellerBatchCommit';

async function main() {

const entitledUser = { app_metadata: { stackr_premium_seller: true } };
const unentitledUser = { app_metadata: {} };
const selfFlaggedUser = {
  app_metadata: {},
  user_metadata: { stackr_premium_seller: true },
};

assert.equal(isPremiumSellerModeEnabled({}), false);
assert.equal(isPremiumSellerModeEnabled({ EXPO_PUBLIC_PREMIUM_SELLER_MODE_ENABLED: 'false' }), false);
assert.equal(isPremiumSellerModeEnabled({ EXPO_PUBLIC_PREMIUM_SELLER_MODE_ENABLED: 'true' }), true);
assert.equal(hasPremiumSellerEntitlement(entitledUser), true);
assert.equal(hasPremiumSellerEntitlement(unentitledUser), false);
assert.equal(hasPremiumSellerEntitlement(selfFlaggedUser), false);
assert.throws(
  () => assertPremiumSellerWriteAccess(entitledUser, { EXPO_PUBLIC_PREMIUM_SELLER_MODE_ENABLED: 'false' }),
  /Premium Seller Mode is not available/,
);
assert.throws(
  () => assertPremiumSellerWriteAccess(unentitledUser, { EXPO_PUBLIC_PREMIUM_SELLER_MODE_ENABLED: 'true' }),
  /Premium Seller Mode is not available/,
);
assert.equal(canPublishPremiumSellerModeChange({
  expectedUserId: 'user-one', currentUserId: 'user-two', accessAllowed: true, nextMode: 'seller',
}), false);
assert.equal(canPublishPremiumSellerModeChange({
  expectedUserId: 'user-one', currentUserId: 'user-one', accessAllowed: false, nextMode: 'seller',
}), false);
assert.equal(canPublishPremiumSellerModeChange({
  expectedUserId: 'user-one', currentUserId: 'user-one', accessAllowed: false, nextMode: 'collector',
}), true);

assert.deepEqual(getPremiumSellerAccess(entitledUser, {}), {
  enabled: false,
  entitled: true,
  allowed: false,
  reason: 'disabled',
});
assert.deepEqual(
  getPremiumSellerAccess(unentitledUser, { EXPO_PUBLIC_PREMIUM_SELLER_MODE_ENABLED: 'true' }),
  { enabled: true, entitled: false, allowed: false, reason: 'not_entitled' },
);

assert.equal(isPremiumSellerInventoryScan({ mode: 'inventory' }), true);
assert.equal(isPremiumSellerInventoryScan({ flow: 'stock_in' }), true);
assert.equal(isPremiumSellerInventoryScan({ flow: 'stock_out' }), true);
assert.equal(isPremiumSellerInventoryScan({ flow: 'listing' }), false);
assert.equal(isPremiumSellerInventoryScan({ flow: 'unexpected' }), false);
assert.equal(isListingScanRequest({ intent: 'raw_listing' }), true);
assert.equal(isListingScanRequest({ intent: 'graded_slab' }), true);
assert.equal(isListingScanRequest({ intent: 'quick_collection', mode: 'listing' }), true);
assert.equal(isListingScanRequest({ intent: 'quick_collection', flow: 'listing' }), true);
assert.equal(isListingScanRequest({ intent: 'quick_collection', mode: 'market' }), false);
assert.notEqual(
  sellerCacheKey('stackr:inventory-items:v2', 'user-one'),
  sellerCacheKey('stackr:inventory-items:v2', 'user-two'),
);
assert.equal(isVerifiedSellerSessionIdentity('user-one', 'user-one'), true);
assert.equal(isVerifiedSellerSessionIdentity('user-one', 'user-two'), false);
assert.equal(isVerifiedSellerSessionIdentity('user-one', null), false);
assert.equal(
  sellerBatchRequestId('00000000-0000-0000-0000-000000000001', 'qa-replay-001'),
  'seller-batch:00000000-0000-0000-0000-000000000001:qa-replay-001',
);
assert.throws(
  () => sellerBatchRequestId('00000000-0000-0000-0000-000000000001', 'x'.repeat(100)),
  /request ID is invalid/,
);

let staleCallbackCount = 0;
let cacheWriteErrorCount = 0;
const freshDespiteCacheFailure = await loadRemoteWithCache({
  cached: ['old'],
  fetchRemote: async () => ['fresh'],
  writeCache: async () => { throw new Error('cache unavailable'); },
  onStale: () => { staleCallbackCount += 1; },
  onCacheWriteError: () => { cacheWriteErrorCount += 1; },
});
assert.deepEqual(freshDespiteCacheFailure, {
  value: ['fresh'], stale: false, remoteError: null,
});
assert.equal(staleCallbackCount, 0);
assert.equal(cacheWriteErrorCount, 1);

const remoteFailure = new Error('remote unavailable');
const sameUserStaleFallback = await loadRemoteWithCache({
  cached: ['last-verified'],
  fetchRemote: async () => { throw remoteFailure; },
  writeCache: async () => { throw new Error('must not run'); },
  onStale: () => { staleCallbackCount += 1; },
});
assert.equal(sameUserStaleFallback.value[0], 'last-verified');
assert.equal(sameUserStaleFallback.stale, true);
assert.equal(sameUserStaleFallback.remoteError, remoteFailure);
assert.equal(staleCallbackCount, 1);

let retryIdentity = 'user-one';
let retryCalls = 0;
await assert.rejects(
  executeSellerBatchWithIdentity({
    requestId: 'seller-batch:user-one:account-switch-001',
    verifyIdentity: async () => retryIdentity === 'user-one',
    invoke: async () => {
      retryCalls += 1;
      return { data: null, error: new Error('network request failed') };
    },
    isRetryableError: () => true,
    waitBeforeRetry: async () => { retryIdentity = 'user-two'; },
  }),
  (error) => isSellerInventoryCommitReconciliationRequired(error),
);
assert.equal(retryCalls, 1, 'account switch must prevent the retry RPC');

let preflightCalls = 0;
await assert.rejects(
  executeSellerBatchWithIdentity({
    requestId: 'seller-batch:user-one:preflight-switch-001',
    verifyIdentity: async () => false,
    invoke: async () => {
      preflightCalls += 1;
      return { data: { replayed: false }, error: null };
    },
    isRetryableError: () => true,
    waitBeforeRetry: async () => {},
  }),
  (error: unknown) => (error as { code?: string }).code === 'seller_inventory_commit_account_changed',
);
assert.equal(preflightCalls, 0, 'an account mismatch must stop before the first RPC');

const retainedRequestId = 'seller-batch:user-one:unconfirmed-001';
const invokedRequestIds: string[] = [];
const committedRequestIds = new Set<string>();
await assert.rejects(
  executeSellerBatchWithIdentity({
    requestId: retainedRequestId,
    verifyIdentity: async () => true,
    invoke: async () => {
      invokedRequestIds.push(retainedRequestId);
      committedRequestIds.add(retainedRequestId);
      return { data: null, error: new Error('failed to fetch') };
    },
    isRetryableError: () => true,
    waitBeforeRetry: async () => {},
  }),
  (error: unknown) => (
    isSellerInventoryCommitReconciliationRequired(error)
    && (error as { requestId?: string }).requestId === retainedRequestId
  ),
);
assert.deepEqual(invokedRequestIds, [retainedRequestId, retainedRequestId]);
assert.equal(committedRequestIds.size, 1, 'the exact request identity must prevent a duplicate commit');

let recoveredAttempt = 0;
const recovered = await executeSellerBatchWithIdentity({
  requestId: 'seller-batch:user-one:recovered-replay-001',
  verifyIdentity: async () => true,
  invoke: async () => {
    recoveredAttempt += 1;
    return recoveredAttempt === 1
      ? { data: null, error: new Error('network request failed') }
      : { data: { replayed: true }, error: null };
  },
  isRetryableError: () => true,
  waitBeforeRetry: async () => {},
});
assert.deepEqual(recovered, { replayed: true });
assert.equal(canStartSellerInventoryCommit({ reconciliationRequired: true, loadError: null }), false);
assert.equal(canStartSellerInventoryCommit({ reconciliationRequired: false, loadError: 'unavailable' }), false);
assert.equal(canStartSellerInventoryCommit({ reconciliationRequired: false, loadError: null }), true);
assert.doesNotThrow(() => assertActivityPostIdentity('user-one', 'user-one'));
assert.throws(
  () => assertActivityPostIdentity('user-one', 'user-two'),
  /activity_post_identity_changed/,
);
assert.throws(
  () => assertActivityPostIdentity('user-one', null),
  /activity_post_identity_changed/,
);
assert.deepEqual(
  getPremiumSellerAccess(entitledUser, { EXPO_PUBLIC_PREMIUM_SELLER_MODE_ENABLED: 'true' }),
  { enabled: true, entitled: true, allowed: true, reason: 'available' },
);

const inventoryRoute = fs.readFileSync('app/(tabs)/inventory.tsx', 'utf8');
const premiumSellerGate = fs.readFileSync('components/PremiumSellerGate.tsx', 'utf8');
const scanRoute = fs.readFileSync('app/scan/index.tsx', 'utf8');
const scanResultRoute = fs.readFileSync('app/scan/result.tsx', 'utf8');
const sellerDashboard = fs.readFileSync('app/seller/index.tsx', 'utf8');
const sellerOrders = fs.readFileSync('app/seller/orders.tsx', 'utf8');
const routes = fs.readFileSync('lib/routes.ts', 'utf8');
const inventoryLibrary = fs.readFileSync('lib/inventory.ts', 'utf8');
const listingRoute = fs.readFileSync('app/listing/new.tsx', 'utf8');
const listingScreen = fs.readFileSync('features/listing/CreateListingScreen.tsx', 'utf8');
const scanScreen = fs.readFileSync('features/scan/ScanScreen.tsx', 'utf8');
const sellerOnboarding = fs.readFileSync('app/seller/onboarding.tsx', 'utf8');
const inventoryScreen = fs.readFileSync('features/inventory/InventoryScreen.tsx', 'utf8');
const marketplaceLibrary = fs.readFileSync('lib/marketplace.ts', 'utf8');
const tradeContext = fs.readFileSync('components/trade-context.tsx', 'utf8');
const settingsScreen = fs.readFileSync('app/settings.tsx', 'utf8');
const marketScreen = fs.readFileSync('features/market/MarketTabScreen.tsx', 'utf8');
const listingDrafts = fs.readFileSync('lib/listingDrafts.ts', 'utf8');
const searchScreen = fs.readFileSync('app/(tabs)/search.tsx', 'utf8');
const productScreen = fs.readFileSync('app/product/[id].tsx', 'utf8');
const activityLibrary = fs.readFileSync('lib/activity.ts', 'utf8');

assert.match(inventoryRoute, /PremiumSellerGate/);
assert.match(premiumSellerGate, /if \(!hydrated\) return null/);
assert.match(premiumSellerGate, /if \(!premiumSellerAccess\.allowed\) return <Redirect href=\{ROUTES\.home\} \/>/);
assert.doesNotMatch(premiumSellerGate, /Premium Seller|professional|seller cohort|StackrStateBlock/i);
assert.match(scanRoute, /isPremiumSellerFlow/);
assert.match(scanRoute, /PremiumSellerGate/);
assert.match(scanRoute, /isPremiumSellerInventoryScan/);
assert.match(scanRoute, /isTrustedListingFlow && !premiumSellerAccess\.allowed/);
assert.match(scanRoute, /<Redirect href="\/\(tabs\)\/market" \/>/);
assert.match(scanResultRoute, /requestedListingMode && !premiumSellerAccess\.allowed/);
assert.match(scanResultRoute, /return <ScanResultScreen \/>/);
assert.match(scanScreen, /isPremiumSellerInventoryScan/);
assert.match(sellerDashboard, /PremiumSellerGate/);
assert.match(sellerDashboard, /const disabled = item\.status === 'backend_required'/);
assert.match(sellerOrders, /<Redirect href="\/seller"/);
assert.doesNotMatch(sellerOrders, /PremiumSellerGate|payment|payout|checkout/i);
assert.doesNotMatch(routes, /key: 'orders', label: 'Orders'/);
assert.match(inventoryLibrary, /assertPremiumSellerWriteAccess\(user\)/);
assert.match(inventoryLibrary, /executeSellerBatchWithIdentity/);
assert.match(inventoryLibrary, /verifyIdentity: verifyCommitIdentity/);
assert.match(inventoryLibrary, /sellerBatchRequestId\(user\.id, requestToken\)/);
assert.match(inventoryScreen, /currentUserIdRef\.current !== committed\.userId/);
assert.match(inventoryScreen, /reconciliationRequiredRef\.current = true/);
assert.match(inventoryScreen, /unconfirmedRequestIdRef\.current/);
assert.match(inventoryScreen, /setSaleCart\(\[\]\)/);
assert.match(inventoryScreen, /setDrafts\(\[\]\)/);
assert.match(inventoryScreen, /canStartSellerInventoryCommit/);
assert.match(inventoryScreen, /Save status unconfirmed/);
assert.doesNotMatch(inventoryScreen, /Nothing was changed/);
assert.doesNotMatch(inventoryScreen, /Inventory was not changed/);
assert.match(inventoryLibrary, /sellerCacheKey\(STORAGE_KEY, user\.id\)/);
assert.match(inventoryLibrary, /sellerCacheKey\(SALES_STORAGE_KEY, user\.id\)/);
assert.match(inventoryLibrary, /sellerCacheKey\(MOVEMENTS_STORAGE_KEY, user\.id\)/);
assert.doesNotMatch(inventoryLibrary, /AsyncStorage\.getItem\(STORAGE_KEY\)/);
assert.doesNotMatch(inventoryLibrary, /AsyncStorage\.getItem\(SALES_STORAGE_KEY\)/);
assert.doesNotMatch(inventoryLibrary, /AsyncStorage\.getItem\(MOVEMENTS_STORAGE_KEY\)/);
assert.doesNotMatch(inventoryLibrary, /authenticatedUser\(\)\.catch\(\(\) => null\)/);
assert.doesNotMatch(inventoryLibrary, /export async function saveInventory(?:Sales|Movements)/);
assert.match(listingRoute, /useAppMode\(\)/);
assert.match(listingRoute, /if \(!hydrated\) return null/);
assert.match(
  listingRoute,
  /if \(!premiumSellerAccess\.allowed\) return <Redirect href="\/\(tabs\)\/market" \/>/,
);
assert.match(listingRoute, /return <CreateListingScreen \/>/);
assert.doesNotMatch(listingRoute, /user_metadata|AsyncStorage|searchParams/);
assert.match(
  listingScreen,
  /This publishes a browse-only listing\. It does not create a Stackr transaction\./,
);
assert.doesNotMatch(listingScreen, /title="Sell"|title="Open to either"|Set an asking price|Accept buy interest/);
assert.match(settingsScreen, /const showSellerSettings = hydrated && premiumSellerAccess\.allowed/);
assert.match(settingsScreen, /settingsSections\.filter\(\(section\) => !section\.sellerOnly \|\| showSellerSettings\)/);
assert.match(listingDrafts, /CREATE_LISTING_DRAFT_KEY_PREFIX = 'stackr:create-listing-draft:v3'/);
assert.match(listingDrafts, /getCreateListingDraftKey\(userId: string\)/);
assert.match(listingDrafts, /encodeURIComponent\(normalizedUserId\)/);
assert.match(listingDrafts, /readCreateListingDraftSummary\(userId: string\)/);
assert.match(listingDrafts, /clearCreateListingDraft\(userId: string\)/);
assert.doesNotMatch(listingDrafts, /AsyncStorage\.getItem\(CREATE_LISTING_DRAFT_KEY\)/);
assert.match(listingScreen, /setDraftStorageKey\(getCreateListingDraftKey|setDraftStorageKey\(scopedDraftKey\)/);
assert.match(listingScreen, /draftStorageKey !== authenticatedDraftKey/);
assert.doesNotMatch(listingScreen, /AsyncStorage\.(?:getItem|setItem|removeItem)\(DRAFT_KEY/);
assert.match(
  marketScreen,
  /onMore=\{item\.user_id === currentUserId\s*\? \(canPublishListing \? \(\) => handleArchive\(item\) : undefined\)/,
);
assert.match(marketScreen, /canManageOwnListing=\{canPublishListing\}/);
assert.match(marketScreen, /!isOwnedByCurrentUser \|\| canManageOwnListing/);
assert.match(marketScreen, /verified: false/);
assert.doesNotMatch(marketScreen, /verified: Boolean\(listing\.profiles\?\.collector_name\)/);

for (const clearedState of [
  'setTradeCardIds([])',
  'setWishlistCardIds([])',
  'setTradeKeys([])',
  'setWishlistKeys([])',
  'setTradeMeta({})',
  'setMarketplaceListings([])',
  'setMyListings([])',
]) {
  assert.ok(tradeContext.includes(clearedState), `TradeProvider must clear ${clearedState} at an auth boundary`);
}
assert.match(tradeContext, /supabase\.auth\.onAuthStateChange/);
assert.match(tradeContext, /verifyCurrentAuthIdentity\(generation, expectedUserId\)/);
assert.match(tradeContext, /authGenerationRef\.current !== expectedGeneration/);
assert.match(tradeContext, /trustedAuthUserIdRef\.current !== verifiedUserId/);
assert.match(tradeContext, /invalidateMarketplaceListingCaches\(\);/);
assert.match(tradeContext, /userId \? fetchMyListings\(\) : Promise\.resolve\(\[\]\)/);
const toggleFlagSection = tradeContext.slice(
  tradeContext.indexOf('const toggleFlag = useCallback'),
  tradeContext.indexOf('const createTradeListing = useCallback'),
);
assert.match(toggleFlagSection, /requireVerifiedSignedInIdentity\(\)/);
assert.match(toggleFlagSection, /\.eq\('user_id', userId\)[\s\S]*\.eq\('card_id', cardId\)[\s\S]*\.eq\('flag_type', flag\)[\s\S]*\.maybeSingle\(\)/);
assert.ok(
  toggleFlagSection.indexOf(".select('id, set_id')") < toggleFlagSection.indexOf('// Optimistic update'),
  'toggleFlag must read the freshly verified user row before its optimistic state decision',
);
assert.doesNotMatch(toggleFlagSection, /const currentKeys =|currentKeys\.includes/);
assert.match(activityLibrary, /assertActivityPostIdentity\(options\.expectedUserId, user\?\.id \?\? null\)/);
assert.match(activityLibrary, /user_id: options\.expectedUserId \?\? user\.id/);
const tradeSideEffectSection = toggleFlagSection.slice(
  toggleFlagSection.indexOf("if (!exists && flag === 'trade')"),
  toggleFlagSection.indexOf("if (flag === 'trade') {\n          invalidateMarketplaceCachesSoon()"),
);
assert.match(
  tradeSideEffectSection,
  /await createActivityPost\([\s\S]*expectedUserId: userId/,
  'trade activity creation must bind the expected verified owner',
);
assert.match(
  tradeSideEffectSection,
  /catch \(err\) \{[\s\S]*invalidateTrustedAuthIdentity\(\);[\s\S]*return;[\s\S]*if \(!isCurrentAuthIdentity\(userId, generation\)\) return;/,
  'an unverifiable activity owner must invalidate the local identity and abort wishlist side effects',
);
for (const [awaitedStep, nextStep] of [
  ['await createActivityPost(', 'const { data: wantedMatches'],
  ['await wantedQuery', 'const { data: profile }'],
  ['.maybeSingle();', 'const { error: notifyError }'],
  ['.insert(notifications);', null],
] as const) {
  const awaitedAt = tradeSideEffectSection.indexOf(awaitedStep);
  const guardAt = tradeSideEffectSection.indexOf(
    'if (!isCurrentAuthIdentity(userId, generation)) return;',
    awaitedAt + awaitedStep.length,
  );
  const nextAt = nextStep ? tradeSideEffectSection.indexOf(nextStep, awaitedAt + awaitedStep.length) : -1;
  assert.ok(awaitedAt >= 0 && guardAt > awaitedAt, `${awaitedStep} must be followed by an identity guard`);
  assert.ok(nextAt < 0 || guardAt < nextAt, `${awaitedStep} identity guard must precede the next side effect`);
}

assert.match(searchScreen, /RECENT_SEARCHES_KEY_PREFIX = '@stackr:search:recent-queries:v2:user'/);
assert.match(searchScreen, /getRecentSearchesKey\(userId: string\)/);
assert.match(searchScreen, /encodeURIComponent\(normalizedUserId\)/);
assert.match(searchScreen, /AsyncStorage\.removeItem\(LEGACY_RECENT_SEARCHES_KEY\)/);
assert.doesNotMatch(searchScreen, /AsyncStorage\.(?:getItem|setItem)\(LEGACY_RECENT_SEARCHES_KEY/);
assert.match(searchScreen, /supabase\.auth\.onAuthStateChange/);
assert.match(searchScreen, /verifyRecentSearchIdentity\(identity\.userId, identity\.generation\)/);
assert.match(searchScreen, /isCurrentRecentSearchIdentity\(identity\)\) setRecentSearches/);
assert.match(searchScreen, /recentSearchGenerationRef\.current !== generation/);

assert.match(productScreen, /SAVED_PRODUCTS_KEY_PREFIX = '@stackr:search:saved-products:v2:user'/);
assert.match(productScreen, /getSavedProductsKey\(userId: string\)/);
assert.match(productScreen, /encodeURIComponent\(normalizedUserId\)/);
assert.match(productScreen, /AsyncStorage\.removeItem\(LEGACY_SAVED_PRODUCTS_KEY\)/);
assert.doesNotMatch(productScreen, /AsyncStorage\.(?:getItem|setItem)\(LEGACY_SAVED_PRODUCTS_KEY/);
assert.match(productScreen, /supabase\.auth\.onAuthStateChange/);
assert.match(productScreen, /verifySavedProductIdentity\(identity\.userId, identity\.generation\)/);
assert.match(productScreen, /isCurrentSavedProductIdentity\(verifiedIdentity\)/);
assert.match(productScreen, /savedProductGenerationRef\.current !== generation/);

function assertWriteGateBeforeDatabase(source: string, startToken: string, endToken: string) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  const section = source.slice(start, end > start ? end : undefined);
  const auth = section.indexOf('supabase.auth.getUser()');
  const verifiedIdentity = section.indexOf('requireVerifiedSignedInIdentity()');
  const authBoundary = auth >= 0 ? auth : verifiedIdentity;
  const gate = section.indexOf('assertPremiumSellerWriteAccess(user)');
  const database = section.indexOf(".from('");
  assert.ok(start >= 0, `${startToken} must exist`);
  assert.ok(authBoundary >= 0 && gate > authBoundary, `${startToken} must authorize the authenticated user`);
  assert.ok(database < 0 || gate < database, `${startToken} must fail before any database operation`);
}

assertWriteGateBeforeDatabase(listingScreen, 'const publishListing = async', 'const footer = () =>');
assertWriteGateBeforeDatabase(marketplaceLibrary, 'export async function deleteMarketplaceListing', 'export async function createMarketplaceListing');
assertWriteGateBeforeDatabase(marketplaceLibrary, 'export async function createMarketplaceListing', 'export async function archiveMarketplaceListing');
assertWriteGateBeforeDatabase(marketplaceLibrary, 'export async function archiveMarketplaceListing', 'export async function fetchMarketplaceListingById');
assertWriteGateBeforeDatabase(tradeContext, 'const toggleFlag = useCallback', 'const createTradeListing = useCallback');
assertWriteGateBeforeDatabase(tradeContext, 'const createTradeListing = useCallback', 'const toggleTradeCard = useCallback');
assertWriteGateBeforeDatabase(tradeContext, 'const updateTradeMeta = useCallback', 'const value: TradeContextValue');
assert.doesNotMatch(sellerOnboarding, /api\/stripe|create-connect-account|account-status/);
assert.match(sellerOnboarding, /<Redirect href="\/seller"/);
assert.match(inventoryScreen, /Promise\.allSettled/);
assert.match(inventoryScreen, /reconciliationRequired: reconciliationRequiredRef\.current/);
assert.match(inventoryScreen, /Refresh Premium Seller Mode before changing stock/);
assert.match(inventoryScreen, /last verified cache in read-only mode/);

const easConfig = JSON.parse(fs.readFileSync('eas.json', 'utf8')) as {
  build: Record<string, { env?: Record<string, string> }>;
};
for (const [profileName, profile] of Object.entries(easConfig.build)) {
  assert.equal(
    profile.env?.EXPO_PUBLIC_PREMIUM_SELLER_MODE_ENABLED,
    profileName === 'seller-canary' ? 'true' : 'false',
    `unexpected Premium Seller flag for ${profileName}`,
  );
}
const appConfigSource = fs.readFileSync('app.config.js', 'utf8');
assert.match(appConfigSource, /googleServicesFile: variantSuffix \? undefined/);
assert.match(appConfigSource, /slug: config\.slug/);
assert.doesNotMatch(appConfigSource, /slug: isDevApp|slug: isStagingApp/);

console.log('Premium Seller access tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
