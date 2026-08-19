# Marketplace payment settlement verification matrix

| Gate | Evidence | Current state |
| --- | --- | --- |
| Supabase Bearer token verified server-side | `backend/test/request-auth.test.mjs` | Automated |
| Client identity mismatch rejected | `backend/test/stripe-route.test.mjs` | Automated |
| Self-purchase rejected | `backend/test/stripe-route.test.mjs` | Automated |
| Amount and platform fee derived server-side | `backend/test/stripe-route.test.mjs` | Automated |
| Stripe create request idempotent | `backend/test/stripe-route.test.mjs` | Automated |
| Listing reservation serialised in Postgres | `scripts/test-marketplace-payment-settlement-migration.mjs` | Automated in disposable Postgres |
| Losing buyer PaymentIntent canceled | `backend/test/stripe-route.test.mjs` | Automated |
| Authenticated clients cannot forge payment fields | `scripts/test-marketplace-payment-settlement-migration.mjs` | Automated in disposable Postgres |
| Buyer and seller can read their transaction | `scripts/test-marketplace-payment-settlement-migration.mjs` | Automated in disposable Postgres |
| Outsider cannot read transaction | `scripts/test-marketplace-payment-settlement-migration.mjs` | Automated in disposable Postgres |
| Stripe raw body retained | `backend/bootstrap.js`, `backend/test/stripe-webhook.test.mjs` | Automated route test; deployment smoke still required |
| Stripe signature required and verified | `backend/test/stripe-webhook.test.mjs` | Automated |
| Unsupported signed events acknowledged safely | `backend/test/stripe-webhook.test.mjs` | Automated |
| Duplicate event ID idempotent | HTTP + Postgres tests | Automated |
| Older events cannot regress newer state | Postgres migration test | Automated |
| Failed PaymentIntent does not prematurely release listing | Postgres migration test | Automated |
| Succeeded event marks exact listing sold | Postgres migration test | Automated |
| Canceled event releases only matching reservation | Postgres migration test | Automated |
| Reconciliation failure returns retryable 500 | `backend/test/stripe-webhook.test.mjs` | Automated |
| Trade cash cannot silently bypass settlement contract | `backend/test/stripe-route.test.mjs` | Disabled/fail closed |
| Stripe test-mode end-to-end purchase | Stripe + staging | Not yet evidenced |
| Staging migration applied | Supabase staging | Not yet evidenced |
| Staging webhook secret configured | Railway/Stripe | Not yet evidenced |
| Refund, dispute and chargeback handling | Separate backend tranche | Not yet implemented |
| Reservation expiry reconciler | Separate backend tranche | Not yet implemented |

The release gate is the evidence column, not the existence of a route or table.
