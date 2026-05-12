/* eslint-env node */
import express from 'express';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Public base URL for Stripe redirect pages (set this in your .env)
const BASE_URL = (process.env.API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');

// Platform fee percentage (e.g. 0.05 = 5%)
const PLATFORM_FEE_PERCENT = parseFloat(process.env.PLATFORM_FEE_PERCENT || '0.05');

// ===============================
// CREATE / RESUME CONNECT ACCOUNT
// ===============================
// Creates a Stripe Express account if none exists, then returns an onboarding URL.
// If an account already exists but onboarding is incomplete, returns a fresh link.

router.post('/create-connect-account', async (req, res) => {
  const { userId, email } = req.body;
  if (!userId || !email) {
    return res.status(400).json({ error: 'userId and email are required' });
  }

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

router.get('/account-status', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId required' });

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

router.post('/create-account-link', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });

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

router.post('/create-payment-intent', async (req, res) => {
  const { listingId, buyerId } = req.body;
  if (!listingId || !buyerId) {
    return res.status(400).json({ error: 'listingId and buyerId required' });
  }

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
