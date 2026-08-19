# StackR marketplace payment settlement boundary

**Status:** Backend implementation candidate — not production approval

## Purpose

This boundary prevents the mobile client from deciding who is buying, whether a listing is reserved, or whether a payment succeeded. Those decisions are made by authenticated backend routes, atomic Postgres functions and signature-verified Stripe events.

## Trust boundaries

### Mobile client

The client may request checkout for a listing and present the returned Stripe client secret. It is not trusted to provide the buyer identity, final amount, seller destination, listing availability or settlement result.

### StackR backend

The backend:

- validates the Supabase Bearer token with `auth.getUser(token)`;
- derives buyer/payer identity from the validated user;
- reloads the listing and seller payout account;
- calculates the payable amount and platform fee server-side;
- creates Stripe operations with deterministic idempotency keys;
- calls the service-role-only reservation function;
- cancels an unused PaymentIntent when another buyer wins the reservation race;
- exposes only bounded error envelopes with a request ID.

### Postgres

Postgres:

- serialises reservations for one listing;
- rechecks seller, buyer, amount, currency and listing state;
- changes the listing to `reserved` and writes the payment transaction in one transaction;
- prevents authenticated clients from changing server-managed payment columns;
- exposes payment rows only to the buyer or seller;
- keeps the Stripe event ledger private and service-role only;
- applies settlement events idempotently and rejects stale state regression.

### Stripe webhook

The webhook:

- requires the exact raw request bytes;
- verifies `Stripe-Signature` using `STRIPE_WEBHOOK_SECRET`;
- accepts only the PaymentIntent event types used by the marketplace flow;
- forwards only a bounded metadata allowlist;
- returns a retryable server error when database reconciliation fails;
- treats duplicate event IDs as successful replays.

## Marketplace state transitions

```text
active
  -> reserved        PaymentIntent created and atomic reservation succeeds

reserved
  -> reserved        processing
  -> reserved        payment_failed (the same PaymentIntent may be retried)
  -> sold            succeeded
  -> active          canceled

sold
  -> sold            stale processing/failed/canceled events are ignored
```

A `payment_failed` event does not release a listing. Release occurs only after a verified cancellation or a future expiry reconciler that confirms the provider state.

## Deliberately disabled

Real cash settlement inside card-for-card trades remains disabled. Marketplace purchases and trade cash have different dispute, fulfilment and reversal requirements. The trade endpoint fails closed until a separate reviewed contract exists.

## Required deployment evidence

Before release:

1. Apply the migration to a disposable and then staging database.
2. Configure `STRIPE_WEBHOOK_SECRET` in the backend environment.
3. Register the staging webhook endpoint in Stripe.
4. Run the backend HTTP tests and disposable-Postgres migration tests.
5. Complete Stripe test-mode purchases for success, declined card, SCA, cancellation and duplicate webhook delivery.
6. Verify buyer/seller transaction visibility and outsider isolation.
7. Verify an interrupted request can be retried without duplicate charges or duplicate reservations.
8. Rehearse rollback without deleting payment/event audit records.

Passing source tests is not evidence that Stripe or staging configuration is complete.
