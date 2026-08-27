/* eslint-env node */
import express from 'express';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import {
  authenticatedUserId,
  createRequireAuthenticatedUser,
  requireMatchingAuthenticatedUser,
} from '../lib/requestAuth.js';
import { createRequireReleaseFeature } from '../lib/releaseFeatureGate.js';

const router = express.Router();

const stripeSecretKey = String(process.env.STRIPE_SECRET_KEY ?? '').trim();
const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' })
  : null;

function requireStripeConfigured(_req, res, next) {
  if (!stripe) {
    return res.status(503).json({
      error: 'Payments are temporarily unavailable.',
    });
  }

  return next();
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  },
);
const requireAuthenticatedUser = createRequireAuthenticatedUser({ supabase });
// Keep unset until payment reservation, settlement and retry handling are atomic and idempotent.
const requireLivePaymentsEnabled = createRequireReleaseFeature({
  flagName: 'STACKR_LIVE_PAYMENTS_ENABLED',
  code: 'payments_disabled',
  message: 'Payments are disabled for this release.',
});
const protectedStripeRoute = [
  requireLivePaymentsEnabled,
  requireAuthenticatedUser,
  requireStripeConfigured,
];

// Public base URL for Stripe redirect pages (set this in your .env)
const BASE_URL = (process.env.API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');

// Platform fee percentage (e.g. 0.05 = 5%)
const PLATFORM_FEE_PERCENT = parseFloat(process.env.PLATFORM_FEE_PERCENT || '0.05');
const BETA_TRADE_DEMO_MODE = process.env.BETA_TRADE_DEMO_MODE !== 'false';

// ===============================
// CREATE / RESUME CONNECT ACCOUNT
// ===============================
// Creates a Stripe Express account if none exists, then returns an onboarding URL.
// If an account already exists but onboarding is incomplete, returns a fresh link.

router.post('/create-connect-account', ...protectedStripeRoute, async (req, res) => {
  const suppliedUserId = req.body?.userId;
  if (!requireMatchingAuthenticatedUser(req, res, suppliedUserId, 'userId')) return;

  const userId = authenticatedUserId(req);
  const email = String(req.stackrUser?.email ?? '').trim();
  if (!email) return res.status(400).json({ error: 'The signed-in account must have an email address.' });

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_account_id')
      .eq('id', userId)
      .single();

    let accountId = profile?.stripe_account_id ?? null;

    if (!accountId) {
      const account = await stripe.accounts.create({
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
      });
      accountId = account.id;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ stripe_account_id: accountId })
        .eq('id', userId);

      if (updateError) {
        console.error('Failed to save stripe_account_id:', updateError);
      }
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${BASE_URL}/api/stripe/onboarding-refresh`,
      return_url: `${BASE_URL}/api/stripe/onboarding-complete`,
      type: 'account_onboarding',
    });

    res.json({ url: accountLink.url, accountId });
  } catch (err) {
    console.error('Stripe Connect error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===============================
// ACCOUNT STATUS CHECK
// ===============================

router.get('/account-status', ...protectedStripeRoute, async (req, res) => {
  const suppliedUserId = req.query?.userId;
  if (!requireMatchingAuthenticatedUser(req, res, suppliedUserId, 'userId')) return;
  const userId = authenticatedUserId(req);

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_account_id')
      .eq('id', userId)
      .single();

    if (!profile?.stripe_account_id) {
      return res.json({ connected: false });
    }

    const account = await stripe.accounts.retrieve(profile.stripe_account_id);

    res.json({
      connected: true,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      accountId: account.id,
    });
  } catch (err) {
    console.error('Stripe status error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===============================
// FRESH ACCOUNT LINK (resume incomplete onboarding)
// ===============================

router.post('/create-account-link', ...protectedStripeRoute, async (req, res) => {
  const suppliedUserId = req.body?.userId;
  if (!requireMatchingAuthenticatedUser(req, res, suppliedUserId, 'userId')) return;
  const userId = authenticatedUserId(req);

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_account_id')
      .eq('id', userId)
      .single();

    if (!profile?.stripe_account_id) {
      return res.status(404).json({ error: 'No Stripe account found. Set up payouts first.' });
    }

    const accountLink = await stripe.accountLinks.create({
      account: profile.stripe_account_id,
      refresh_url: `${BASE_URL}/api/stripe/onboarding-refresh`,
      return_url: `${BASE_URL}/api/stripe/onboarding-complete`,
      type: 'account_onboarding',
    });

    res.json({ url: accountLink.url });
  } catch (err) {
    console.error('Stripe account link error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===============================
// CREATE PAYMENT INTENT (Buy Now)
// ===============================
// Called when a buyer taps Buy Now. Holds funds with Stripe until delivery confirmed.

router.post('/create-payment-intent', ...protectedStripeRoute, async (req, res) => {
  const { listingId, buyerId: suppliedBuyerId } = req.body;
  if (!requireMatchingAuthenticatedUser(req, res, suppliedBuyerId, 'buyerId')) return;
  const buyerId = authenticatedUserId(req);
  if (!listingId) return res.status(400).json({ error: 'listingId is required' });

  try {
    const { data: listing } = await supabase
      .from('user_card_flags')
      .select('*, profiles!user_id(stripe_account_id)')
      .eq('id', listingId)
      .single();

    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    if (listing.listing_status !== 'active') {
      return res.status(400).json({ error: 'Listing is no longer available' });
    }

    const sellerAccountId = listing.profiles?.stripe_account_id;
    if (!sellerAccountId) {
      return res.status(400).json({ error: 'Seller has not set up payouts yet' });
    }

    const amountPence = Math.round(listing.asking_price * 100);
    const platformFeePence = Math.round(amountPence * PLATFORM_FEE_PERCENT);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountPence,
      currency: 'gbp',
      application_fee_amount: platformFeePence,
      transfer_data: { destination: sellerAccountId },
      metadata: { listingId, buyerId, sellerId: listing.user_id },
    });

    // Mark listing as reserved
    await supabase
      .from('user_card_flags')
      .update({ listing_status: 'reserved', payment_intent_id: paymentIntent.id })
      .eq('id', listingId);

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error('PaymentIntent error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===============================
// CREATE TRADE CASH PAYMENT INTENT
// ===============================
// Creates a Stripe PaymentIntent for a trade offer cash term.
// The payer/recipient are determined from trade_cash_terms.
// Recipient must have Stripe Connect set up.

router.post('/create-trade-cash-payment-intent', ...protectedStripeRoute, async (req, res) => {
  if (BETA_TRADE_DEMO_MODE) {
    return res.status(403).json({
      error: 'Demo trade mode is enabled. No real trade cash payment can be started during beta.',
    });
  }

  const { offerId, payerId: suppliedPayerId } = req.body;
  if (!requireMatchingAuthenticatedUser(req, res, suppliedPayerId, 'payerId')) return;
  const payerId = authenticatedUserId(req);
  if (!offerId) return res.status(400).json({ error: 'offerId is required' });

  try {
    const { data: cashTerm, error: cashTermError } = await supabase
      .from('trade_cash_terms')
      .select('*')
      .eq('offer_id', offerId)
      .maybeSingle();

    if (cashTermError) return res.status(500).json({ error: cashTermError.message });
    if (!cashTerm) return res.status(404).json({ error: 'Trade cash terms not found' });

    if (cashTerm.payer_id !== payerId) {
      return res.status(403).json({ error: 'Only the designated payer can initiate this payment' });
    }

    if (!cashTerm.amount || Number(cashTerm.amount) <= 0) {
      return res.status(400).json({ error: 'Invalid cash amount' });
    }

    const { data: recipientProfile, error: recipientError } = await supabase
      .from('profiles')
      .select('stripe_account_id')
      .eq('id', cashTerm.recipient_id)
      .maybeSingle();

    if (recipientError) return res.status(500).json({ error: recipientError.message });

    const recipientStripeAccountId = recipientProfile?.stripe_account_id;
    if (!recipientStripeAccountId) {
      return res.status(400).json({ error: 'Recipient has not set up Stripe payouts yet' });
    }

    const amountPence = Math.round(Number(cashTerm.amount) * 100);
    const platformFeePence = Math.round(amountPence * PLATFORM_FEE_PERCENT);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountPence,
      currency: (cashTerm.currency ?? 'GBP').toLowerCase(),
      application_fee_amount: platformFeePence,
      transfer_data: { destination: recipientStripeAccountId },
      metadata: {
        offerId: String(offerId),
        payerId: String(cashTerm.payer_id),
        recipientId: String(cashTerm.recipient_id),
        type: 'trade_cash',
      },
    });

    const { error: updateError } = await supabase
      .from('trade_cash_terms')
      .update({
        payment_intent_id: paymentIntent.id,
        payment_status: 'required',
        updated_at: new Date().toISOString(),
      })
      .eq('offer_id', offerId);

    if (updateError) return res.status(500).json({ error: updateError.message });

    return res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error('Trade cash PaymentIntent error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ===============================
// ONBOARDING REDIRECT PAGES
// ===============================

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
  <p>Your seller account is set up. Return to Stackr to start listing cards.</p>
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
  <p>Return to Stackr and tap "Set up payouts" again to continue.</p>
</body>
</html>`);
});

export default router;
