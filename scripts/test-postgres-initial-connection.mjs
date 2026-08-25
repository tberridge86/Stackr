import assert from 'node:assert/strict';
import {
  connectPostgresWithRetry,
  isRetryableInitialPostgresConnectionError,
} from './deploy/postgres-initial-connection.mjs';

assert.equal(isRetryableInitialPostgresConnectionError({
  code: 'ECHECKOUTTIMEOUT',
  message: 'unable to check out connection from the pool after 15000ms in Session mode',
}), true);
assert.equal(isRetryableInitialPostgresConnectionError(new Error(
  'authentication did not complete within 15000ms',
)), true);
assert.equal(isRetryableInitialPostgresConnectionError(new Error(
  'authentication did not complete within 15000ms in Session mode',
)), true);
assert.equal(isRetryableInitialPostgresConnectionError({
  code: 'XX000',
  message: '(EAUTHQUERY) authentication query failed: connection to database not available',
}), true);
assert.equal(isRetryableInitialPostgresConnectionError({
  code: 'XX000',
  message: 'unrelated internal database error',
}), false);
assert.equal(isRetryableInitialPostgresConnectionError({
  code: '23503',
  message: 'insert or update violates foreign key constraint',
}), false);
assert.equal(isRetryableInitialPostgresConnectionError(new Error(
  'target checksum mismatch',
)), false);

const clients = [];
class RetryThenConnectClient {
  constructor(config) {
    this.config = config;
    this.index = clients.length;
    this.ended = false;
    this.queries = [];
    clients.push(this);
  }

  async connect() {
    if (this.index === 0) {
      const error = new Error(
        'unable to check out connection from the pool after 15000ms in Session mode',
      );
      error.code = 'ECHECKOUTTIMEOUT';
      throw error;
    }
  }

  async query(sql, parameters) {
    this.queries.push({ sql, parameters });
  }

  async end() {
    this.ended = true;
  }
}

const retries = [];
const connected = await connectPostgresWithRetry({
  connectionString: 'postgresql://example.invalid/postgres',
  applicationName: 'stackr-test',
  statementTimeoutMs: 90_000,
  maxAttempts: 3,
  retryDelayMs: 20_000,
  ClientClass: RetryThenConnectClient,
  sleep: async () => {},
  onRetry: (retry) => retries.push(retry),
});
assert.equal(connected.attemptsUsed, 2);
assert.equal(clients.length, 2);
assert.equal(clients[0].ended, true);
assert.equal(clients[1].ended, false);
assert.equal(clients[1].config.application_name, 'stackr-test');
assert.deepEqual(clients[1].queries[0].parameters, ['90000']);
assert.deepEqual(retries, [{ attempt: 1, maxAttempts: 3, applicationName: 'stackr-test' }]);
await connected.client.end();

let nonRetryableAttempts = 0;
class NonRetryableClient {
  async connect() {
    nonRetryableAttempts += 1;
    const error = new Error('syntax error');
    error.code = '42601';
    throw error;
  }

  async end() {}
}
await assert.rejects(
  connectPostgresWithRetry({
    connectionString: 'postgresql://example.invalid/postgres',
    applicationName: 'stackr-test',
    statementTimeoutMs: 90_000,
    maxAttempts: 6,
    ClientClass: NonRetryableClient,
    sleep: async () => {},
  }),
  (error) => error.code === '42601',
);
assert.equal(nonRetryableAttempts, 1);

let exhaustedAttempts = 0;
class AlwaysTransientClient {
  async connect() {
    exhaustedAttempts += 1;
    const error = new Error(
      'unable to check out connection from the pool after 15000ms in Session mode',
    );
    error.code = 'ECHECKOUTTIMEOUT';
    throw error;
  }

  async end() {}
}
await assert.rejects(
  connectPostgresWithRetry({
    connectionString: 'postgresql://example.invalid/postgres',
    applicationName: 'stackr-test',
    statementTimeoutMs: 90_000,
    maxAttempts: 3,
    ClientClass: AlwaysTransientClient,
    sleep: async () => {},
  }),
  (error) => error.code === 'ECHECKOUTTIMEOUT',
);
assert.equal(exhaustedAttempts, 3);

console.log(JSON.stringify({
  ok: true,
  retryableErrorsTested: 4,
  nonRetryableErrorsTested: 3,
  boundedRetryAttemptsTested: 3,
}));
