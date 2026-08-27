import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  canPublishPremiumSellerModeChange,
  assertPremiumSellerWriteAccess,
  getPremiumSellerAccess,
  hasPremiumSellerEntitlement,
  isPremiumSellerModeEnabled,
} from '../lib/premiumSellerAccess';
import { isSellerTrialModeEnabled } from '../lib/sellerTrial';
import { isPremiumSellerInventoryScan } from '../lib/sellerScanAccess';
import { isVerifiedSellerSessionIdentity, sellerBatchRequestId, sellerCacheKey } from '../lib/sellerCache';
import { loadRemoteWithCache } from '../lib/sellerRemoteCache';
import {
  canStartSellerInventoryCommit,
  executeSellerBatchWithIdentity,
  isSellerInventoryCommitReconciliationRequired,
} from '../lib/sellerBatchCommit';

async function main() {

const entitledUser = { app_metadata: { stackr_premium_seller: true } };
const unentitledUser = { app_metadata: {} };
const trialUser = { id: 'trial-user', app_metadata: {} };
const sellerTrialEnvironment = {
  APP_VARIANT: 'staging',
  EXPO_PUBLIC_APP_VARIANT: 'staging',
  EXPO_PUBLIC_PREMIUM_SELLER_MODE_ENABLED: 'false',
  EXPO_PUBLIC_SELLER_TRIAL_MODE: 'true',
};

assert.equal(isPremiumSellerModeEnabled({}), false);
assert.equal(isPremiumSellerModeEnabled({ EXPO_PUBLIC_PREMIUM_SELLER_MODE_ENABLED: 'false' }), false);
assert.equal(isPremiumSellerModeEnabled({ EXPO_PUBLIC_PREMIUM_SELLER_MODE_ENABLED: 'true' }), true);
assert.equal(hasPremiumSellerEntitlement(entitledUser), true);
assert.equal(hasPremiumSellerEntitlement(unentitledUser), false);
assert.equal(isSellerTrialModeEnabled(sellerTrialEnvironment), true);
assert.equal(isSellerTrialModeEnabled({
  ...sellerTrialEnvironment,
  EXPO_PUBLIC_APP_VARIANT: 'production',
}), false);
assert.deepEqual(getPremiumSellerAccess(trialUser, sellerTrialEnvironment), {
  enabled: false,
  entitled: false,
  allowed: true,
  reason: 'available',
});
assert.throws(
  () => assertPremiumSellerWriteAccess(trialUser, sellerTrialEnvironment),
  /Premium Seller Mode is not available/,
  'local trial UI access must never unlock the live seller write boundary',
);
assert.equal(getPremiumSellerAccess(null, sellerTrialEnvironment).allowed, false);
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
assert.deepEqual(
  getPremiumSellerAccess(entitledUser, { EXPO_PUBLIC_PREMIUM_SELLER_MODE_ENABLED: 'true' }),
  { enabled: true, entitled: true, allowed: true, reason: 'available' },
);

const inventoryRoute = fs.readFileSync('app/(tabs)/inventory.tsx', 'utf8');
const scanRoute = fs.readFileSync('app/scan/index.tsx', 'utf8');
const sellerDashboard = fs.readFileSync('app/seller/index.tsx', 'utf8');
const sellerOrders = fs.readFileSync('app/seller/orders.tsx', 'utf8');
const routes = fs.readFileSync('lib/routes.ts', 'utf8');
const inventoryLibrary = fs.readFileSync('lib/inventory.ts', 'utf8');
const listingScreen = fs.readFileSync('features/listing/CreateListingScreen.tsx', 'utf8');
const scanScreen = fs.readFileSync('features/scan/ScanScreen.tsx', 'utf8');
const sellerOnboarding = fs.readFileSync('app/seller/onboarding.tsx', 'utf8');
const inventoryScreen = fs.readFileSync('features/inventory/InventoryScreen.tsx', 'utf8');

assert.match(inventoryRoute, /PremiumSellerGate/);
assert.match(scanRoute, /isPremiumSellerFlow/);
assert.match(scanRoute, /PremiumSellerGate/);
assert.match(scanRoute, /isPremiumSellerInventoryScan/);
assert.match(scanScreen, /isPremiumSellerInventoryScan/);
assert.match(sellerDashboard, /PremiumSellerGate/);
assert.match(sellerDashboard, /const disabled = item\.status === 'backend_required'/);
assert.match(sellerOrders, /PremiumSellerGate/);
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
assert.doesNotMatch(listingScreen, /PremiumSellerGate|getPremiumSellerAccess/);
assert.doesNotMatch(sellerOnboarding, /api\/stripe|create-connect-account|account-status/);
assert.match(inventoryScreen, /Promise\.allSettled/);
assert.match(inventoryScreen, /reconciliationRequired: reconciliationRequiredRef\.current/);
assert.match(inventoryScreen, /Refresh Premium Seller Mode before changing stock/);
assert.match(inventoryScreen, /last verified cache in read-only mode/);

const easConfig = JSON.parse(fs.readFileSync('eas.json', 'utf8')) as {
  build: Record<string, { env?: Record<string, string> }>;
};
for (const [profileName, profile] of Object.entries(easConfig.build)) {
  const sellerTrialProfile = profileName === 'seller-canary' || profileName === 'seller-trial';
  assert.equal(
    profile.env?.EXPO_PUBLIC_PREMIUM_SELLER_MODE_ENABLED,
    'false',
    `unexpected Premium Seller flag for ${profileName}`,
  );
  assert.equal(
    profile.env?.EXPO_PUBLIC_SELLER_TRIAL_MODE,
    sellerTrialProfile ? 'true' : undefined,
    `unexpected Seller Trial flag for ${profileName}`,
  );
  if (sellerTrialProfile) {
    assert.equal(profile.env?.EXPO_PUBLIC_APP_VARIANT, 'staging');
    assert.equal(profile.env?.EXPO_PUBLIC_BETA_TRADE_DEMO_MODE, 'true');
    assert.equal(profile.env?.EXPO_PUBLIC_STACKR_API_ENABLED, 'false');
    assert.equal(profile.env?.EXPO_PUBLIC_ON_DEVICE_EMBEDDING_ENABLED, 'false');
    assert.equal(profile.env?.EXPO_PUBLIC_SCAN_FEEDBACK_ENABLED, 'false');
    assert.equal(profile.env?.EXPO_PUBLIC_RECOGNITION_FEEDBACK_ENABLED, 'false');
  }
}
const appConfigSource = fs.readFileSync('app.config.js', 'utf8');
assert.match(appConfigSource, /const googleServicesFile = fs\.existsSync\(resolvedGoogleServicesFile\)/);
assert.match(appConfigSource, /googleServicesFile,/);
assert.match(appConfigSource, /slug: config\.slug/);
assert.doesNotMatch(appConfigSource, /slug: isDevApp|slug: isStagingApp/);

console.log('Premium Seller access tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
