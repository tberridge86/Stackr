import assert from 'node:assert/strict';
import { beginProfileLoad, finishProfileLoad, PROFILE_LOAD_ERROR, type ProfileLoadState } from '../lib/profileLoadState';

type SampleProfile = { id: string; name: string };
const profile = { id: 'collector-a', name: 'Collector A' };
const empty: ProfileLoadState<SampleProfile> = { accountId: null, requestId: 0, profile: null, loading: false, error: null };

const loading = beginProfileLoad(empty, profile.id, 1);
assert.equal(loading.loading, true);
const failed = finishProfileLoad(loading, { accountId: profile.id, requestId: 1, data: null, error: new Error('network failure') });
assert.equal(failed.error, PROFILE_LOAD_ERROR);
assert.equal(failed.loading, false);
const absent = finishProfileLoad(loading, { accountId: profile.id, requestId: 1, data: null, error: null });
assert.equal(absent.profile, null);
assert.equal(absent.error, null);
const loaded = finishProfileLoad(loading, { accountId: profile.id, requestId: 1, data: profile, error: null });
const refreshing = beginProfileLoad(loaded, profile.id, 2);
assert.equal(refreshing.profile, profile);
const stale = finishProfileLoad(refreshing, { accountId: profile.id, requestId: 1, data: null, error: null });
assert.equal(stale, refreshing);
const failedRefresh = finishProfileLoad(refreshing, { accountId: profile.id, requestId: 2, data: null, error: 'permission denied' });
assert.equal(failedRefresh.profile, profile);
assert.equal(failedRefresh.error, PROFILE_LOAD_ERROR);
const switched = beginProfileLoad(loaded, 'collector-b', 3);
assert.equal(switched.profile, null);
assert.equal(finishProfileLoad(switched, { accountId: profile.id, requestId: 1, data: profile, error: null }), switched);
assert.equal(finishProfileLoad(switched, { accountId: 'collector-b', requestId: 3, data: profile, error: null }).error, PROFILE_LOAD_ERROR);
const signedOut = beginProfileLoad(loaded, null, 4);
assert.equal(signedOut.profile, null);
assert.equal(signedOut.loading, false);

console.log('Profile state checks passed: missing/error, retry, retained details, stale responses, account isolation, sign-out.');
