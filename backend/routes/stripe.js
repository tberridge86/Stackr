/* eslint-env node */
import { createHash } from 'node:crypto';
import express from 'express';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import {
  authenticatedUserId,
  createRequireAuthenticatedUser,
  requestIdFrom,
  requireMatchingAuthenticatedUser,
  sendRequestError,
} from '../lib/requestAuth.js';
import { createStripeWebhookHandler } from './stripeWebhook.js';

const stripeSecretKey = String(process.env.STRIPE_SECRET_KEY ?? '').trim();
const defaultStripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' })
  : null;

const supabaseUrl = String(process.env.SUPABASE_URL ?? '').trim();
const supabaseServiceKey = String(
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
).trim();
const defaultSupabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

const DEFAULT_BASE_URL = (process.env.API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const DEFAULT_PLATFORM_FEE_PERCENT = Number(process.env.PLATFORM_FEE_PERCENT || '0.05');
const DEFAULT_MARKET_RESERVATION_MINUTES = Number(process.env.MARKET_RESERVATION_MINUTES || '30');
const IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;
const IDEMPOTENCY_INPUT_PATTERN = /^[A-Za-z0-9._:+\-/]{8,200}$/;

export class PaymentRouteError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'PaymentRouteError';
    this.status = status;
    this.code = code;
  }
}

function clean(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function requiredIdentifier(value, fieldName) {
  const identifier = clean(value);
  if (!identifier || !IDENTIFIER_PATTERN.test(identifier)) {
    throw new PaymentRouteError(400, `invalid_${fieldName}`, `${fieldName} is invalid.`);
  }
  return identifier;
}

export function amountToMinorUnits(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new PaymentRouteError(400, 'invalid_amount', 'Payment amount must be greater than zero.');
  }
  const amount = Math.round(numeric * 100);
  if (!Number.isSafeInteger(amount) || amount < 1) {
    throw new PaymentRouteError(400, 'invalid_amount', 'Payment amount is outside the supported range.');
  }
  return amount;
}

export function calculatePlatformFee(amount, percentage) {
  const feePercentage = Number(percentage);
  if (!Number.isFinite(feePercentage) || feePercentage < 0 || feePercentage >= 1) {
    throw new PaymentRouteError(503, 'invalid_platform_fee', 'Payments are temporarily unavailable.');
  }
  if (!Number.isSafeInteger(amount) || amount < 1) {
    throw new PaymentRouteError(400, 'invalid_amount', 'Payment amount is outside the supported range.');
  }
  return Math.min(amount - 1, Math.max(0, Math.round(amount * feePercentage)));
}

export function normalisePaymentCurrency(value = 'gbp') {
  const currency = String(value ?? 'gbp').trim().toLowerCase();
  if (currency !== 'gbp') {
    throw new PaymentRouteError(400, 'unsupported_currency', 'Only GBP payments are currently supported.');
  }
  return currency;
}

export function buildStripeIdempotencyKey(operation, ...parts) {
  const operationKey = String(operation ?? 'operation')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .slice(0, 40) || 'operation';
  const digest = createHash('sha256')
    .update(parts.map((part) => String(part ?? '')).join('\u001f'))
    .digest('hex')
    .slice(0, 48);
  return `stackr_${operationKey}_${digest}`;
}

function clientOperationKey(req) {
  const supplied = clean(req.headers?.['idempotency-key']);
  if (supplied && !IDEMPOTENCY_INPUT_PATTERN.test(supplied)) {
    throw new PaymentRouteError(
      400,
      'invalid_idempotency_key',
      'Idempotency-Key contains unsupported characters or has an invalid length.',
    );
  }
  return supplied ?? requestIdFrom(req) ?? 'request';
}

function stripeAccountIdFromListing(listing) {
  const profile = Array.isArray(listing?.profiles) ? listing.profiles[0] : listing?.profiles;
  return clean(profile?.stripe_account_id);
}

function logRouteError(logger, req, event, error, extra = {}) {
  logger.error?.({
    event,
    requestId: requestIdFrom(req),
    error: error instanceof Error ? error.message : String(error),
    ...extra,
  });
}

function handleRouteError(logger, req, res, event, error) {
  if (error instanceof PaymentRouteError) {
    return sendRequestError(req, res, error.status, error.code, error.message);
  }
  logRouteError(logger, req, event, error);
  return sendRequestError(
    req,
    res,
    500,
    'payment_request_failed',
    'The payment request could not be completed.',
  );
}

function mapReservationError(error) {
  const message = String(error?.message ?? error ?? '');
  if (/marketplace_listing_not_found/i.test(message)) {
    return new PaymentRouteError(404, 'listing_not_found', 'Listing was not found.');
  }
  if (/marketplace_self_purchase_not_allowed/i.test(message)) {
    return new PaymentRouteError(409, 'self_purchase_not_allowed', 'You cannot purchase your own listing.');
  }
  if (/marketplace_listing_amount_mismatch/i.test(message)) {
    return new PaymentRouteError(409, 'listing_price_changed', 'The listing price changed before checkout.');
  }
  if (/marketplace_listing_has_no_payable_price/i.test(message)) {
    return new PaymentRouteError(409, 'listing_not_payable', 'This listing does not have a payable price.');
  }
  if (/marketplace_listing_unavailable|marketplace_payment_idempotency_conflict/i.test(message)) {
    return new PaymentRouteError(409, 'listing_reservation_conflict', 'Another buyer reserved this listing first.');
  }
  return error;
}

async function loadProfile(supabase, userId, columns = 'id, stripe_account_id') {
  const { data, error } = await supabase
    .from('profiles')
    .select(columns)
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function safeCancelPaymentIntent(stripe, paymentIntent, logger, req, reason) {
  if (!paymentIntent?.id || paymentIntent.status === 'canceled' || paymentIntent.status === 'succeeded') return;
  try {
    await stripe.paymentIntents.cancel(paymentIntent.id);
  } catch (error) {
    logRouteError(logger, req, 'stripe_payment_intent_cleanup_failed', error, {
      paymentIntentId: paymentIntent.id,
      reason,
    });
  }
}

function paymentIntentResponse(req, paymentIntent, extra = {}) {
  if (!paymentIntent?.client_secret) {
    throw new PaymentRouteError(
      502,
      'payment_intent_incomplete',
      'The payment provider did not return a usable payment session.',
    );
  }
  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    paymentStatus: paymentIntent.status ?? null,
    requestId: requestIdFrom(req),
    ...extra,
  };
}

async function retrieveExistingPaymentIntent(stripe, paymentIntentId) {
  const id = clean(paymentIntentId);
  if (!id) return null;
  const paymentIntent = await stripe.paymentIntents.retrieve(id);
  if (!paymentIntent || paymentIntent.status === 'canceled') return null;
  return paymentIntent;
}

function reservationExpiry(minutes) {
  const numeric = Number(minutes);
  if (!Number.isFinite(numeric) || numeric < 2 || numeric > 1440) {
    throw new PaymentRouteError(503, 'invalid_reservation_window', 'Payments are temporarily unavailable.');
  }
  return new Date(Date.now() + Math.round(numeric * 60_000)).toISOString();
}

async function reserveMarketplacePayment({
  supabase,
  req,
  listingId,
  paymentIntentId,
  buyerId,
  amountMinor,
  currency,
  expiresAt,
}) {
  const requestId = requestIdFrom(req)
    ?? buildStripeIdempotencyKey('reservation-request', listingId, buyerId, paymentIntentId);
  const { data, error } = await supabase.rpc('reserve_marketplace_listing_payment', {
    p_listing_id: listingId,
    p_payment_intent_id: paymentIntentId,
    p_request_id: requestId,
    p_buyer_id: buyerId,
    p_amount_minor: amountMinor,
    p_currency: currency,
    p_reservation_expires_at: expiresAt,
  });
  if (error) throw mapReservationError(error);
  if (!data?.transactionId || data?.paymentIntentId !== paymentIntentId) {
    throw new Error('Payment reservation returned an incomplete result.');
  }
  return data;
}

export function createStripeRouter({
  stripeClient = defaultStripe,
  supabaseClient = defaultSupabase,
  baseUrl = DEFAULT_BASE_URL,
  platformFeePercent = DEFAULT_PLATFORM_FEE_PERCENT,
  marketReservationMinutes = DEFAULT_MARKET_RESERVATION_MINUTES,
  logger = console,
} = {}) {
  const router = express.Router();
  const requireDependencies = (_req, res, next) => {
    if (!stripeClient || !supabaseClient) {
      return res.status(503).json({ error: 'Payments are temporarily unavailable.' });
    }
    try {
      calculatePlatformFee(100, platformFeePercent);
      reservationExpiry(marketReservationMinutes);
    } catch {
      return res.status(503).json({ error: 'Payments are temporarily unavailable.' });
    }
    return next();
  };
  const requireAuthenticatedUser = supabaseClient
    ? createRequireAuthenticatedUser({ supabase: supabaseClient, logger })
    : (_req, res) => res.status(503).json({ error: 'Payments are temporarily unavailable.' });

  router.post('/webhook', createStripeWebhookHandler({
    stripeClient,
    supabaseClient,
    logger,
  }));

  router.post(
    '/create-connect-account',
    requireDependencies,
    requireAuthenticatedUser,
    async (req, res) => {
      if (!requireMatchingAuthenticatedUser(req, res, req.body?.userId, 'userId')) return;
      const userId = authenticatedUserId(req);
      const authenticatedEmail = clean(req.stackrUser?.email);
      const suppliedEmail = clean(req.body?.email);
      if (suppliedEmail && authenticatedEmail && suppliedEmail.toLowerCase() !== authenticatedEmail.toLowerCase()) {
        return sendRequestError(
          req,
          res,
          403,
          'email_mismatch',
          'email does not match the signed-in account.',
        );
      }
      const email = authenticatedEmail ?? suppliedEmail;
      if (!email) {
        return sendRequestError(req, res, 400, 'email_required', 'A verified account email is required.');
      }

      try {
        const profile = await loadProfile(supabaseClient, userId);
        if (!profile) {
          throw new PaymentRouteError(404, 'profile_not_found', 'Seller profile was not found.');
        }

        let accountId = clean(profile.stripe_account_id);
        if (!accountId) {
          const account = await stripeClient.accounts.create({
            type: 'express',
            email,
            country: 'GB',
            capabilities: {
              transfers: { requested: true },
            },
            business_type: 'individual',
            settings: {
              payouts: {
                schedule: { interval: 'weekly', weekly_anchor: 'friday' },
              },
            },
            metadata: { stackrUserId: userId },
          }, {
            idempotencyKey: buildStripeIdempotencyKey('connect-account', userId),
          });
          accountId = account.id;

          const { data: updatedProfile, error: updateError } = await supabaseClient
            .from('profiles')
            .update({ stripe_account_id: accountId })
            .eq('id', userId)
            .select('id, stripe_account_id')
            .maybeSingle();
          if (updateError) throw updateError;
          if (!updatedProfile?.stripe_account_id) {
            throw new Error('Stripe account was created but could not be linked to the seller profile.');
          }
        }

        const accountLink = await stripeClient.accountLinks.create({
          account: accountId,
          refresh_url: `${baseUrl}/api/stripe/onboarding-refresh`,
          return_url: `${baseUrl}/api/stripe/onboarding-complete`,
          type: 'account_onboarding',
        }, {
          idempotencyKey: buildStripeIdempotencyKey(
            'connect-account-link',
            userId,
            accountId,
            clientOperationKey(req),
          ),
        });

        return res.json({
          url: accountLink.url,
          accountId,
          requestId: requestIdFrom(req),
        });
      } catch (error) {
        return handleRouteError(logger, req, res, 'stripe_connect_account_failed', error);
      }
    },
  );

  router.get(
    '/account-status',
    requireDependencies,
    requireAuthenticatedUser,
    async (req, res) => {
      if (!requireMatchingAuthenticatedUser(req, res, req.query?.userId, 'userId')) return;
      const userId = authenticatedUserId(req);

      try {
        const profile = await loadProfile(supabaseClient, userId);
        if (!profile?.stripe_account_id) {
          return res.json({ connected: false, requestId: requestIdFrom(req) });
        }

        const account = await stripeClient.accounts.retrieve(profile.stripe_account_id);
        return res.json({
          connected: true,
          chargesEnabled: Boolean(account.charges_enabled),
          payoutsEnabled: Boolean(account.payouts_enabled),
          detailsSubmitted: Boolean(account.details_submitted),
          accountId: account.id,
          requestId: requestIdFrom(req),
        });
      } catch (error) {
        return handleRouteError(logger, req, res, 'stripe_account_status_failed', error);
      }
    },
  );

  router.post(
    '/create-account-link',
    requireDependencies,
    requireAuthenticatedUser,
    async (req, res) => {
      if (!requireMatchingAuthenticatedUser(req, res, req.body?.userId, 'userId')) return;
      const userId = authenticatedUserId(req);

      try {
        const profile = await loadProfile(supabaseClient, userId);
        if (!profile?.stripe_account_id) {
          throw new PaymentRouteError(
            404,
            'stripe_account_not_found',
            'No Stripe account was found. Set up payouts first.',
          );
        }

        const accountLink = await stripeClient.accountLinks.create({
          account: profile.stripe_account_id,
          refresh_url: `${baseUrl}/api/stripe/onboarding-refresh`,
          return_url: `${baseUrl}/api/stripe/onboarding-complete`,
          type: 'account_onboarding',
        }, {
          idempotencyKey: buildStripeIdempotencyKey(
            'resume-account-link',
            userId,
            profile.stripe_account_id,
            clientOperationKey(req),
          ),
        });

        return res.json({ url: accountLink.url, requestId: requestIdFrom(req) });
      } catch (error) {
        return handleRouteError(logger, req, res, 'stripe_account_link_failed', error);
      }
    },
  );

  router.post(
    '/create-payment-intent',
    requireDependencies,
    requireAuthenticatedUser,
    async (req, res) => {
      if (!requireMatchingAuthenticatedUser(req, res, req.body?.buyerId, 'buyerId')) return;
      const buyerId = authenticatedUserId(req);

      try {
        const listingId = requiredIdentifier(req.body?.listingId, 'listing_id');
        const { data: listing, error: listingError } = await supabaseClient
          .from('user_card_flags')
          .select('*, profiles!user_id(stripe_account_id)')
          .eq('id', listingId)
          .maybeSingle();
        if (listingError) throw listingError;
        if (!listing) {
          throw new PaymentRouteError(404, 'listing_not_found', 'Listing was not found.');
        }
        if (clean(listing.user_id) === buyerId) {
          throw new PaymentRouteError(409, 'self_purchase_not_allowed', 'You cannot purchase your own listing.');
        }

        if (listing.listing_status !== 'active') {
          if (listing.listing_status === 'reserved' && listing.payment_intent_id) {
            const existing = await retrieveExistingPaymentIntent(stripeClient, listing.payment_intent_id);
            if (existing?.metadata?.buyerId === buyerId) {
              return res.json(paymentIntentResponse(req, existing, {
                listingId,
                idempotentReplay: true,
              }));
            }
          }
          throw new PaymentRouteError(409, 'listing_unavailable', 'Listing is no longer available.');
        }

        const sellerAccountId = stripeAccountIdFromListing(listing);
        if (!sellerAccountId) {
          throw new PaymentRouteError(
            409,
            'seller_payouts_unavailable',
            'Seller has not completed payout setup.',
          );
        }

        const amountPence = amountToMinorUnits(listing.asking_price);
        const platformFeePence = calculatePlatformFee(amountPence, platformFeePercent);
        const currency = 'gbp';
        const paymentIntent = await stripeClient.paymentIntents.create({
          amount: amountPence,
          currency,
          automatic_payment_methods: { enabled: true },
          application_fee_amount: platformFeePence,
          transfer_data: { destination: sellerAccountId },
          metadata: {
            listingId,
            buyerId,
            sellerId: String(listing.user_id),
            type: 'market_purchase',
          },
        }, {
          idempotencyKey: buildStripeIdempotencyKey(
            'market-purchase',
            listingId,
            buyerId,
            amountPence,
          ),
        });

        let reservation;
        try {
          reservation = await reserveMarketplacePayment({
            supabase: supabaseClient,
            req,
            listingId,
            paymentIntentId: paymentIntent.id,
            buyerId,
            amountMinor: amountPence,
            currency,
            expiresAt: reservationExpiry(marketReservationMinutes),
          });
        } catch (error) {
          await safeCancelPaymentIntent(
            stripeClient,
            paymentIntent,
            logger,
            req,
            'marketplace_reservation_failed',
          );
          throw error;
        }

        return res.json(paymentIntentResponse(req, paymentIntent, {
          listingId,
          transactionId: reservation.transactionId,
          reservationExpiresAt: reservation.reservationExpiresAt,
          idempotentReplay: Boolean(reservation.replayed),
        }));
      } catch (error) {
        return handleRouteError(logger, req, res, 'stripe_market_payment_failed', error);
      }
    },
  );

  router.post(
    '/create-trade-cash-payment-intent',
    requireDependencies,
    requireAuthenticatedUser,
    async (req, res) => {
      if (!requireMatchingAuthenticatedUser(req, res, req.body?.payerId, 'payerId')) return;
      return sendRequestError(
        req,
        res,
        403,
        'trade_payments_disabled',
        'Real trade cash payments remain disabled until their settlement and dispute contract is release-approved.',
      );
    },
  );

  router.get('/onboarding-complete', (_req, res) => {
    res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Setup complete — Stackr</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    body { font-family: -apple-system, sans-serif; text-align: center; padding: 60px 24px; background: #0D0F1A; color: #F0F2FF; margin: 0; }
    h1 { color: #7C5FFF; font-size: 24px; margin-bottom: 12px; }
    p { color: #8B92B8; font-size: 16px; line-height: 1.5; }
    .check { font-size: 56px; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="check">✓</div>
  <h1>Payout account connected</h1>
  <p>Your seller account is set up. Return to Stackr to continue.</p>
  <script>setTimeout(() => window.close(), 4000);</script>
</body>
</html>`);
  });

  router.get('/onboarding-refresh', (_req, res) => {
    res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Session expired — Stackr</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    body { font-family: -apple-system, sans-serif; text-align: center; padding: 60px 24px; background: #0D0F1A; color: #F0F2FF; margin: 0; }
    h1 { color: #F97316; font-size: 24px; margin-bottom: 12px; }
    p { color: #8B92B8; font-size: 16px; line-height: 1.5; }
    .icon { font-size: 56px; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="icon">⏱</div>
  <h1>Session expired</h1>
  <p>Return to Stackr and restart payout setup to continue.</p>
</body>
</html>`);
  });

  return router;
}

export const stripeRouteInternals = {
  clean,
  clientOperationKey,
  mapReservationError,
  requiredIdentifier,
  reservationExpiry,
  reserveMarketplacePayment,
  stripeAccountIdFromListing,
};

export default createStripeRouter();
