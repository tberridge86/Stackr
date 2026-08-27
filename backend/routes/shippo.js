import express from 'express';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';
import { createRequireAuthenticatedUser } from '../lib/requestAuth.js';
import { commerceReleaseApprovals } from '../lib/releaseApprovals.js';
import { createRequireReleaseFeature } from '../lib/releaseFeatureGate.js';

const router = express.Router();

const SHIPPO_API_BASE_URL = process.env.SHIPPO_API_BASE_URL || 'https://api.goshippo.com';
const SHIPPO_API_TOKEN = process.env.SHIPPO_API_TOKEN || process.env.SHIPPO_API_KEY || '';
const SHIPPO_ALLOW_LABEL_PURCHASES = process.env.SHIPPO_ALLOW_LABEL_PURCHASES === 'true';
const authSupabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_PUBLISHABLE_KEY
    || process.env.SUPABASE_ANON_KEY
    || process.env.SUPABASE_SECRET_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  },
);
const requireAuthenticatedUser = createRequireAuthenticatedUser({ supabase: authSupabase });
// Keep the source approval false until labels are order-bound, authorised and rate-limited.
const requireLiveShippingEnabled = createRequireReleaseFeature({
  flagName: 'STACKR_LIVE_SHIPPING_ENABLED',
  releaseApproved: commerceReleaseApprovals.liveShipping,
  code: 'shipping_disabled',
  message: 'Shipping is disabled for this release.',
});

router.use(requireLiveShippingEnabled, requireAuthenticatedUser);

const DEFAULT_CARD_PARCEL = {
  length: '9',
  width: '6',
  height: '1',
  distance_unit: 'in',
  weight: '3',
  mass_unit: 'oz',
};

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function hasShippoConfig() {
  return Boolean(SHIPPO_API_TOKEN.trim());
}

function isTestToken() {
  return SHIPPO_API_TOKEN.trim().startsWith('shippo_test_');
}

function toSnakeAddress(address = {}) {
  return {
    name: address.name,
    company: address.company,
    street1: address.street1,
    street2: address.street2,
    city: address.city,
    state: address.state,
    zip: address.zip ?? address.postcode ?? address.postalCode,
    country: address.country,
    phone: address.phone,
    email: address.email,
  };
}

function toSnakeParcel(parcel = DEFAULT_CARD_PARCEL) {
  return {
    length: String(parcel.length ?? DEFAULT_CARD_PARCEL.length),
    width: String(parcel.width ?? DEFAULT_CARD_PARCEL.width),
    height: String(parcel.height ?? DEFAULT_CARD_PARCEL.height),
    distance_unit: parcel.distance_unit ?? parcel.distanceUnit ?? DEFAULT_CARD_PARCEL.distance_unit,
    weight: String(parcel.weight ?? DEFAULT_CARD_PARCEL.weight),
    mass_unit: parcel.mass_unit ?? parcel.massUnit ?? DEFAULT_CARD_PARCEL.mass_unit,
  };
}

function hasMinimumAddress(address) {
  return Boolean(address?.name && address?.street1 && address?.city && (address?.zip || address?.postcode || address?.postalCode) && address?.country);
}

async function shippoFetch(path, options = {}) {
  if (!hasShippoConfig()) {
    const error = new Error('SHIPPO_API_TOKEN is not configured');
    error.status = 500;
    throw error;
  }

  const response = await fetch(`${SHIPPO_API_BASE_URL.replace(/\/$/, '')}${path}`, {
    ...options,
    headers: {
      Authorization: `ShippoToken ${SHIPPO_API_TOKEN}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const error = new Error(data?.detail || data?.message || data?.error || `Shippo request failed: ${response.status}`);
    error.status = response.status;
    error.detail = data;
    throw error;
  }

  return data;
}

function normaliseRate(rate) {
  const amount = Number(rate?.amount);
  return {
    id: rate?.object_id ?? rate?.id ?? null,
    provider: rate?.provider ?? null,
    service: rate?.servicelevel?.name ?? rate?.servicelevel_name ?? rate?.service ?? null,
    serviceToken: rate?.servicelevel?.token ?? rate?.servicelevel_token ?? null,
    amount: Number.isFinite(amount) ? amount : null,
    currency: rate?.currency ?? null,
    estimatedDays: rate?.estimated_days ?? null,
    durationTerms: rate?.duration_terms ?? null,
    trackable: rate?.trackable ?? null,
    insurance: rate?.insurance ?? null,
    attributes: rate?.attributes ?? [],
    raw: rate,
  };
}

router.get('/status', (_req, res) => {
  res.json({
    configured: hasShippoConfig(),
    mode: isTestToken() ? 'test' : hasShippoConfig() ? 'live_or_custom' : 'missing',
    labelPurchasesEnabled: SHIPPO_ALLOW_LABEL_PURCHASES,
  });
});

router.post('/rates', async (req, res) => {
  try {
    const addressFrom = req.body.addressFrom ?? req.body.address_from;
    const addressTo = req.body.addressTo ?? req.body.address_to;
    const parcel = req.body.parcel ?? req.body.parcels?.[0] ?? DEFAULT_CARD_PARCEL;

    if (!hasMinimumAddress(addressFrom) || !hasMinimumAddress(addressTo)) {
      return res.status(400).json({
        error: 'addressFrom and addressTo must include name, street1, city, zip/postcode and country.',
      });
    }

    const shipment = await shippoFetch('/shipments/', {
      method: 'POST',
      body: JSON.stringify({
        address_from: toSnakeAddress(addressFrom),
        address_to: toSnakeAddress(addressTo),
        parcels: [toSnakeParcel(parcel)],
        async: false,
        metadata: req.body.metadata ?? undefined,
        extra: req.body.extra ?? undefined,
      }),
    });

    const rates = Array.isArray(shipment?.rates) ? shipment.rates.map(normaliseRate) : [];
    rates.sort((a, b) => (a.amount ?? Number.POSITIVE_INFINITY) - (b.amount ?? Number.POSITIVE_INFINITY));

    return res.json({
      shipmentId: shipment?.object_id ?? null,
      status: shipment?.status ?? null,
      testMode: isTestToken(),
      rates,
      raw: shipment,
    });
  } catch (error) {
    return res.status(error.status ?? 500).json({
      error: 'Shippo rates failed',
      detail: error.detail ?? getErrorMessage(error),
    });
  }
});

router.post('/labels', async (req, res) => {
  try {
    const rateId = String(req.body.rateId ?? req.body.rate ?? '').trim();
    if (!rateId) return res.status(400).json({ error: 'rateId is required.' });

    if (!isTestToken() && !SHIPPO_ALLOW_LABEL_PURCHASES) {
      return res.status(403).json({
        error: 'Live Shippo label purchase is disabled.',
        detail: 'Set SHIPPO_ALLOW_LABEL_PURCHASES=true only when you are ready to buy live labels.',
      });
    }

    const transaction = await shippoFetch('/transactions/', {
      method: 'POST',
      body: JSON.stringify({
        rate: rateId,
        label_file_type: req.body.labelFileType ?? req.body.label_file_type ?? 'PDF',
        async: false,
        metadata: req.body.metadata ?? undefined,
      }),
    });

    return res.json({
      id: transaction?.object_id ?? null,
      status: transaction?.status ?? null,
      labelUrl: transaction?.label_url ?? null,
      commercialInvoiceUrl: transaction?.commercial_invoice_url ?? null,
      trackingNumber: transaction?.tracking_number ?? null,
      trackingUrl: transaction?.tracking_url_provider ?? null,
      eta: transaction?.eta ?? null,
      messages: transaction?.messages ?? [],
      testMode: isTestToken(),
      raw: transaction,
    });
  } catch (error) {
    return res.status(error.status ?? 500).json({
      error: 'Shippo label purchase failed',
      detail: error.detail ?? getErrorMessage(error),
    });
  }
});

router.get('/track/:carrier/:trackingNumber', async (req, res) => {
  try {
    const carrier = encodeURIComponent(req.params.carrier);
    const trackingNumber = encodeURIComponent(req.params.trackingNumber);
    const tracking = await shippoFetch(`/tracks/${carrier}/${trackingNumber}`);
    return res.json({ tracking });
  } catch (error) {
    return res.status(error.status ?? 500).json({
      error: 'Shippo tracking lookup failed',
      detail: error.detail ?? getErrorMessage(error),
    });
  }
});

export default router;
