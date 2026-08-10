#!/usr/bin/env node
import 'dotenv/config';

const apiUrl = (
  process.env.PRICE_API_URL ||
  process.env.EXPO_PUBLIC_PRICE_API_URL ||
  'https://pocketvault-production.up.railway.app'
).replace(/\/$/, '');
const adminKey = process.env.STACKR_ADMIN_API_KEY || process.env.ADMIN_API_KEY;

if (!adminKey) {
  console.error('Missing STACKR_ADMIN_API_KEY or ADMIN_API_KEY.');
  process.exit(1);
}

const response = await fetch(`${apiUrl}/admin/catalogue/ja/health`, {
  headers: {
    Authorization: `Bearer ${adminKey}`,
    Accept: 'application/json',
  },
});

const bodyText = await response.text();
let body;
try {
  body = bodyText ? JSON.parse(bodyText) : null;
} catch {
  body = bodyText;
}

if (!response.ok) {
  console.error(JSON.stringify({ ok: false, status: response.status, body }, null, 2));
  process.exit(1);
}

function summariseHealth(payload) {
  const rows = Array.isArray(payload?.health)
    ? payload.health
    : Array.isArray(payload?.health?.rows)
      ? payload.health.rows
      : [];
  const japanese = rows.find((row) => row.language === 'ja') ?? rows[0] ?? {};
  return {
    japaneseSetsStored: japanese.japanese_sets_stored ?? 0,
    cardsStored: japanese.cards_stored ?? 0,
    cardsWithResolvedImages: japanese.cards_with_resolved_images ?? 0,
    cardsUsingSecondaryImages: japanese.cards_using_secondary_images ?? 0,
    cardsMissingImages: japanese.cards_missing_images ?? 0,
    cardsWithCurrentPrices: japanese.cards_with_current_prices ?? 0,
    cardsWithStalePrices: japanese.cards_with_stale_prices ?? 0,
    cardsWithoutProviderMappings: japanese.cards_without_provider_mappings ?? 0,
    cardsWithNoPricingSupport: japanese.cards_with_no_pricing_support ?? 0,
    imageResolutionFailures: japanese.image_resolution_failures ?? 0,
    pricingProviderFailures: japanese.pricing_provider_failures ?? 0,
    duplicateRecords: japanese.duplicate_records ?? 0,
    lastSuccessfulSync: japanese.last_successful_sync ?? null,
    lastRepairRun: japanese.last_repair_run ?? null,
  };
}

console.log(JSON.stringify({
  ok: true,
  source: body?.source ?? 'tcgdex',
  region: 'japan',
  language: 'ja',
  ...summariseHealth(body),
}, null, 2));
