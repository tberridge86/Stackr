/* eslint-env node */
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { requestIdFrom, sendRequestError } from '../lib/requestAuth.js';

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
const defaultWebhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET ?? '').trim();

const SUPPORTED_PAYMENT_EVENTS = new Set([
  'payment_intent.processing',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'payment_intent.canceled',
]);
const METADATA_KEYS = new Set([
  'listingId',
  'buyerId',
  'sellerId',
  'type',
]);

function clean(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function stripeSignature(req) {
  const value = req.headers?.['stripe-signature'];
  return clean(Array.isArray(value) ? value[0] : value);
}

function boundedMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const metadata = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (!METADATA_KEYS.has(key)) continue;
    const text = clean(rawValue);
    if (text) metadata[key] = text.slice(0, 200);
  }
  return metadata;
}

function eventCreatedAt(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const timestamp = new Date(Math.trunc(seconds) * 1000);
  return Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : null;
}

function paymentFailureCode(paymentIntent, eventType) {
  if (eventType === 'payment_intent.canceled') {
    return clean(paymentIntent?.cancellation_reason)?.slice(0, 160) ?? null;
  }
  return clean(paymentIntent?.last_payment_error?.code)?.slice(0, 160) ?? null;
}

function logWebhookError(logger, req, event, error) {
  logger.error?.({
    event: 'stripe_webhook_reconciliation_failed',
    requestId: requestIdFrom(req),
    stripeEventId: clean(event?.id),
    stripeEventType: clean(event?.type),
    paymentIntentId: clean(event?.data?.object?.id),
    error: error instanceof Error ? error.message : String(error),
  });
}

export function createStripeWebhookHandler({
  stripeClient = defaultStripe,
  supabaseClient = defaultSupabase,
  webhookSecret = defaultWebhookSecret,
  logger = console,
} = {}) {
  return async function stripeWebhookHandler(req, res) {
    if (!stripeClient?.webhooks?.constructEvent || !supabaseClient?.rpc || !clean(webhookSecret)) {
      return sendRequestError(
        req,
        res,
        503,
        'stripe_webhook_unavailable',
        'Payment settlement is temporarily unavailable.',
      );
    }

    const signature = stripeSignature(req);
    if (!signature) {
      return sendRequestError(
        req,
        res,
        400,
        'stripe_signature_required',
        'Stripe-Signature is required.',
      );
    }
    if (!Buffer.isBuffer(req.body)) {
      logger.error?.({
        event: 'stripe_webhook_raw_body_missing',
        requestId: requestIdFrom(req),
      });
      return sendRequestError(
        req,
        res,
        500,
        'stripe_webhook_misconfigured',
        'Payment settlement is temporarily unavailable.',
      );
    }

    let event;
    try {
      event = stripeClient.webhooks.constructEvent(req.body, signature, webhookSecret);
    } catch (error) {
      logger.warn?.({
        event: 'stripe_webhook_signature_rejected',
        requestId: requestIdFrom(req),
        error: error instanceof Error ? error.message : String(error),
      });
      return sendRequestError(
        req,
        res,
        400,
        'invalid_stripe_signature',
        'Stripe webhook signature verification failed.',
      );
    }

    const eventId = clean(event?.id);
    const eventType = clean(event?.type);
    const createdAt = eventCreatedAt(event?.created);
    if (!eventId || !eventType || !createdAt || typeof event?.livemode !== 'boolean') {
      return sendRequestError(
        req,
        res,
        400,
        'invalid_stripe_event',
        'Stripe webhook event is incomplete.',
      );
    }

    if (!SUPPORTED_PAYMENT_EVENTS.has(eventType)) {
      return res.status(200).json({
        received: true,
        ignored: true,
        eventId,
        eventType,
        requestId: requestIdFrom(req),
      });
    }

    const paymentIntent = event?.data?.object;
    const paymentIntentId = clean(paymentIntent?.id);
    if (!paymentIntentId || !paymentIntentId.startsWith('pi_')) {
      return sendRequestError(
        req,
        res,
        400,
        'payment_intent_id_required',
        'Stripe PaymentIntent identity is missing.',
      );
    }

    try {
      const { data, error } = await supabaseClient.rpc('reconcile_stripe_payment_event', {
        p_event_id: eventId,
        p_event_type: eventType,
        p_event_created_at: createdAt,
        p_livemode: event.livemode,
        p_payment_intent_id: paymentIntentId,
        p_payment_status: clean(paymentIntent?.status),
        p_metadata: boundedMetadata(paymentIntent?.metadata),
        p_failure_code: paymentFailureCode(paymentIntent, eventType),
      });
      if (error) throw error;

      return res.status(200).json({
        received: true,
        eventId,
        eventType,
        reconciliation: data ?? null,
        requestId: requestIdFrom(req),
      });
    } catch (error) {
      logWebhookError(logger, req, event, error);
      return sendRequestError(
        req,
        res,
        500,
        'stripe_reconciliation_failed',
        'Payment settlement could not be completed.',
      );
    }
  };
}

export const stripeWebhookInternals = {
  boundedMetadata,
  eventCreatedAt,
  paymentFailureCode,
  stripeSignature,
};

export default createStripeWebhookHandler();
