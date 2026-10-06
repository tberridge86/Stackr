import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createVerifiedSupabasePostgresClient } from './verified-supabase-postgres.mjs';
import { PRICE_GUARD_STAGING_PROJECT, rehearsePriceIdentityGuard } from './rehearse-price-identity-guard-core.mjs';

const plan = JSON.parse(readFileSync('docs/releases/pricing-identity-guard-canonical-baseline-20261006.json', 'utf8'));
const source = readFileSync(plan.candidate.path, 'utf8');
const baseline = plan.targetBaselines.find(row => row.project === PRICE_GUARD_STAGING_PROJECT);
// Use the reviewed ten-ID stage cohort, never infer IDs from unrelated prices.
const shadow = readFileSync('docs/releases/pricing-identity-guard-staging-shadow-20261006.sql', 'utf8');
const array = shadow.match(/array\[([^\]]+)\]/i)?.[1];
const ids = [...(array ?? '').matchAll(/'([a-f0-9-]{36})'/g)].map(match => match[1]);
assert.equal(ids.length, 10, 'price_guard_reviewed_canary_ids_missing');
assert.equal(new Set(ids).size, 10, 'price_guard_duplicate_canary_ids');
assert.equal(process.env.SUPABASE_PROJECT_REF, PRICE_GUARD_STAGING_PROJECT, 'price_guard_target_mismatch');
assert.equal(process.env.STACKR_DEPLOYMENT_ENVIRONMENT, 'staging', 'price_guard_environment_mismatch');
assert(process.env.STACKR_SOURCE_DB_URL, 'price_guard_database_url_missing');
let address;
try { address = new URL(process.env.STACKR_SOURCE_DB_URL); }
catch { throw Error('price_guard_database_address_invalid'); }
const username = decodeURIComponent(address.username);
assert(address.hostname === 'db.' + PRICE_GUARD_STAGING_PROJECT + '.supabase.co'
  || (address.hostname.endsWith('.pooler.supabase.com') && username.endsWith('.' + PRICE_GUARD_STAGING_PROJECT)), 'price_guard_database_address_mismatch');
const connection = createVerifiedSupabasePostgresClient(process.env.STACKR_SOURCE_DB_URL,
  'stackr-price-identity-guard-rehearsal', { statement_timeout: 8000, query_timeout: 10000 });
const client = { query: (...args) => connection.query(...args), exec: text => connection.query(text) };
let connected = false;
try {
  await connection.connect(); connected = true;
  const result = await rehearsePriceIdentityGuard({ client, projectRef: PRICE_GUARD_STAGING_PROJECT,
    candidate: plan.candidate, baseline, migrationSql: source,
    readCanary: async client => {
      // These failures must remain failures before and after the candidate.
      for (const role of ['anon', 'authenticated']) {
        await client.exec('savepoint price_guard_denial');
        let denied = false;
        try {
          await client.exec('set local role ' + role);
          await client.query('select * from api.read_catalogue_printing_general_prices($1::uuid[])', [ids]);
        } catch (error) { denied = error.code === '42501'; }
        finally { await client.exec('rollback to savepoint price_guard_denial; release savepoint price_guard_denial'); }
        assert(denied, 'price_guard_public_read_access_drift');
      }
      await client.exec('set local role service_role');
      let failed = false;
      try {
        const invalidIdentity = await client.query('select api.english_exact_price_set_is_current(0,$1::uuid) valid', ['00000000-0000-0000-0000-000000000000']);
        assert.equal(invalidIdentity.rows[0].valid, false, 'price_guard_invalid_identity_accepted');
        await client.exec('savepoint price_guard_limit');
        let limited = false;
        try {
          await client.query('select * from api.read_catalogue_printing_general_prices($1::uuid[])', [Array(101).fill(ids[0])]);
        } catch (error) { limited = error.code === '22023'; }
        finally { await client.exec('rollback to savepoint price_guard_limit; release savepoint price_guard_limit'); }
        assert(limited, 'price_guard_read_limit_drift');
        const result = await client.query('select printing_id,quote from api.read_catalogue_printing_general_prices($1::uuid[]) order by printing_id', [ids]);
        assert.equal(result.rows.length, ids.length, 'price_guard_canary_incomplete');
        for (const row of result.rows) {
          assert(ids.includes(row.printing_id), 'price_guard_unrequested_printing');
          assert(row.quote?.centralEstimate > 0 && row.quote?.originalPrice > 0, 'price_guard_canary_nonpositive');
          assert(Date.parse(row.quote.staleAfter) > Date.now(), 'price_guard_canary_expired');
          assert.equal(row.quote.priceScope, 'printing_general_estimate', 'price_guard_scope_drift');
          assert.equal(row.quote.usableForExactVariant, false, 'price_guard_exact_scope_drift');
          assert.equal(row.quote.usableForHoldingsValuation, false, 'price_guard_holdings_scope_drift');
          assert.equal(row.quote.language, 'en', 'price_guard_native_language_drift');
          for (const field of ['condition','finish','grade']) assert.equal(row.quote[field], null, 'price_guard_exact_fields_drift');
        }
        return result.rows;
      } catch (error) { failed = true; throw error; }
      finally { if (!failed) await client.exec('reset role'); }
    } });
  console.log(JSON.stringify(result));
} catch (error) {
  // Query text and connection details can contain credentials. Keep live
  // failure receipts to a bounded machine-readable code; never dump errors.
  const code = /^[A-Z0-9_]{1,32}$/.test(String(error?.code)) ? String(error.code) : 'PRICE_GUARD_REHEARSAL_FAILED';
  const message = String(error?.message ?? '').split('\n')[0];
  const gate = /^price_guard_[a-z0-9_]{1,80}$/.test(message) ? message : 'unknown';
  console.error(JSON.stringify({ ok: false, rollbackOnly: true, projectRef: PRICE_GUARD_STAGING_PROJECT, code, gate }));
  process.exitCode = 1;
} finally {
  if (connected) await connection.end();
}
