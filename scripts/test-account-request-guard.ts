import assert from 'node:assert/strict';
import { isCurrentAccountRequest, type AccountRequestToken } from '../lib/accountRequestGuard';

const firstRequest: AccountRequestToken = { accountGeneration: 4, requestId: 12 };
assert.equal(isCurrentAccountRequest(firstRequest, firstRequest), true);

const refreshedRequest: AccountRequestToken = { accountGeneration: 4, requestId: 13 };
assert.equal(isCurrentAccountRequest(refreshedRequest, firstRequest), false);

const switchedAccount: AccountRequestToken = { accountGeneration: 5, requestId: 14 };
assert.equal(isCurrentAccountRequest(switchedAccount, firstRequest), false);
assert.equal(isCurrentAccountRequest(switchedAccount, refreshedRequest), false);
assert.equal(isCurrentAccountRequest(switchedAccount, switchedAccount), true);

console.log('Account request guard checks passed: refresh and account-switch responses stay stale.');
