import { pricingV2Config } from '../config.js';
import { normalizeCollectorNumber, normalizeIdentityPart, normalizeLanguage } from '../identity.js';
import { scoreObservationMatch } from '../matcher.js';
import { canonicalEbayListingUrl } from '../../marketPricing/soldProvenance.js';
import { checkPokeTraceActivationReadiness } from '../pokeTraceActivation.js';

const SCALE_COOLDOWN_MS = 15 * 60_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let scaleUnavailableUntil = 0;

function text(value) {
  const result = String(value ?? '').trim();
  return result || null;
}

function first(...values) {
  return values.map(text).find(Boolean) ?? null;
}

function arrayFromResponse(payload, keys) {
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return Array.isArray(payload) ? payload : [];
}

function sameText(left, right) {
  const a = normalizeIdentityPart(left, '');
  const b = normalizeIdentityPart(right, '');
  return Boolean(a && b && a === b);
}

function cardNumber(card) {
  return normalizeCollectorNumber(first(card?.cardNumber, card?.number, card?.collector_number, card?.collectorNumber, card?.local_id));
}

function pokeTraceGame(identity) {
  const language = normalizeLanguage(identity.language);
  if (language === 'ja') return 'pokemon-japanese';
  if (language === 'zh-CN' || language === 'zh-TW') return 'pokemon-chinese';
  return language === 'en' ? 'pokemon' : null;
}

function pokeTraceVariant(identity) {
  const explicit = normalizeIdentityPart(identity.variant, '');
  const explicitVariant = {
    normal: 'normal',
    non_holo: 'normal',
    holo: 'holofoil',
    holofoil: 'holofoil',
    reverse: 'reverse_holofoil',
    reverse_holo: 'reverse_holofoil',
    reverse_holofoil: 'reverse_holofoil',
    first_edition: '1st_edition',
    '1st_edition': '1st_edition',
    first_edition_holofoil: '1st_edition_holofoil',
    '1st_edition_holofoil': '1st_edition_holofoil',
    unlimited: 'unlimited',
  }[explicit];
  if (explicitVariant) return explicitVariant;
  const finish = normalizeIdentityPart(identity.finish, '');
  const edition = normalizeIdentityPart(identity.edition, '');
  if (edition === 'first_edition') return finish === 'holo' || finish === 'textured' ? '1st_edition_holofoil' : '1st_edition';
  if (edition === 'unlimited') return 'unlimited';
  if (finish === 'reverse' || finish === 'reverse_holo' || finish === 'reverse_holofoil') return 'reverse_holofoil';
  if (finish === 'holo' || finish === 'holofoil' || finish === 'textured') return 'holofoil';
  if (finish === 'normal' || finish === 'non_holo') return 'normal';
  return null;
}

function canonicalPokeTraceVariant(value) {
  return normalizeIdentityPart(value, '').replace(/^first_edition/, '1st_edition');
}

/** A card lookup must produce precisely one high-confidence provider card. */
export function resolveExactPokeTraceCard(cards, identity) {
  const targetNumber = normalizeCollectorNumber(identity.printedCardNumber || identity.cardNumber);
  const targetGame = pokeTraceGame(identity);
  const targetVariant = pokeTraceVariant(identity);
  if (!targetNumber || !targetGame || !targetVariant) return null;
  const matches = (cards ?? []).filter((card) => {
    const id = first(card?.id, card?.card_id, card?.cardId);
    const nameMatches = sameText(first(card?.name, card?.card_name, card?.title), identity.canonicalCardName)
      || sameText(first(card?.name, card?.card_name, card?.title), identity.localisedCardNames?.[identity.language]);
    const numberMatches = Boolean(targetNumber && cardNumber(card) === targetNumber);
    const cardSet = card?.set ?? {};
    const setMatches = sameText(first(card?.set_id, card?.setId, cardSet?.id, cardSet?.slug, card?.set_code, cardSet?.code, cardSet?.name, card?.set_name), identity.setId)
      || sameText(first(card?.set_name, cardSet?.name, cardSet?.display_name), identity.canonicalSetName)
      || sameText(first(card?.set_code, cardSet?.code), identity.setCode);
    const variant = canonicalPokeTraceVariant(first(card?.variant, card?.finish, card?.printing));
    const variantMatches = variant === targetVariant;
    const game = normalizeIdentityPart(first(card?.game, card?.game_name), '');
    const gameMatches = Boolean(targetGame && game === targetGame);
    const marketMatches = normalizeIdentityPart(card?.market, '') === 'us';
    const productTypeMatches = normalizeIdentityPart(card?.productType ?? card?.product_type, '') === 'single';
    const productFamilyMatches = normalizeIdentityPart(card?.productFamily ?? card?.product_family, '') === 'card';
    return Boolean(id && nameMatches && numberMatches && setMatches && variantMatches && gameMatches
      && marketMatches && productTypeMatches && productFamilyMatches);
  });
  return matches.length === 1 ? matches[0] : null;
}

function listingValue(listing, ...keys) {
  for (const key of keys) {
    const value = listing?.[key];
    if (value != null && value !== '') return value;
  }
  return null;
}

function validPastTimestamp(value) {
  const timestamp = Date.parse(String(value ?? ''));
  return Number.isFinite(timestamp) && timestamp <= Date.now() + 5 * 60_000;
}

function listingHasExactGrade(listing, identity) {
  const grader = normalizeIdentityPart(listingValue(listing, 'grader', 'grading_company', 'gradingCompany'), '');
  const grade = normalizeIdentityPart(listingValue(listing, 'grade', 'grade_value', 'gradeValue'), '');
  if (identity.productType !== 'graded_card') return !grader && !grade;
  return Boolean(grader && grade && grader === identity.gradingCompany && grade === identity.grade);
}

function listingHasExactCondition(listing, identity) {
  if (identity.productType !== 'raw_card') return true;
  const conditionToken = (value) => normalizeIdentityPart(value, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^raw_/, '');
  const requested = conditionToken(identity.rawCondition);
  const observed = conditionToken(listingValue(listing, 'condition', 'raw_condition'));
  if (!observed) return false;
  const effectiveRequested = !requested || requested === 'condition_unknown' || requested === 'unknown'
    ? 'near_mint'
    : requested;
  return observed === effectiveRequested;
}

function listingUrlItemId(value) {
  const canonical = canonicalEbayListingUrl(value);
  if (!canonical) return { canonical: null, itemId: null };
  const segments = new URL(canonical).pathname.split('/').filter(Boolean);
  return { canonical, itemId: segments.at(-1) ?? null };
}

/**
 * Only accept a raw PokeTrace record when it remains a complete, exact eBay
 * transaction proof. It is re-checked by normaliseObservation before storage.
 */
export function normalizePokeTraceListing(listing, card, identity) {
  const sourceItemId = first(listingValue(listing, 'sourceItemId', 'source_item_id', 'ebay_item_id', 'ebayItemId'));
  const title = first(listingValue(listing, 'title', 'listing_title', 'name'));
  const finalPrice = listingValue(listing, 'price', 'sold_price', 'soldPrice', 'final_price', 'finalPrice');
  const currency = first(listingValue(listing, 'currency', 'price_currency', 'priceCurrency'));
  const sourceUrl = first(listingValue(listing, 'url', 'listing_url', 'listingUrl', 'source_url', 'sourceUrl'));
  const soldAt = first(listingValue(listing, 'sold_at', 'soldAt'));
  const rawCondition = first(listingValue(listing, 'condition', 'raw_condition'));
  const anomalyFlag = listingValue(listing, 'anomalyFlag', 'anomaly_flag');
  const listingType = normalizeIdentityPart(listingValue(listing, 'listingType', 'listing_type'), '');
  // PokeTrace documents this endpoint as completed eBay sales. Its optional
  // listingType describes the sale mechanism (for example, "auction"), not a
  // sold/active state, so requiring the literal value "sold" would reject the
  // provider's documented response. Still fail closed if a contradictory
  // active/unsold classification ever appears on the sold-listings endpoint.
  const contradictsCompletedSale = new Set([
    'active',
    'active_listing',
    'unsold',
    'ended_unsold',
    'cancelled',
    'canceled',
  ]).has(listingType);
  const match = scoreObservationMatch({ title, language: listingValue(listing, 'language', 'lang') ?? identity.language }, identity);
  const listingUrl = listingUrlItemId(sourceUrl);

  if (!sourceItemId || !title || !Number.isFinite(Number(finalPrice)) || Number(finalPrice) <= 0
    || !/^[A-Z]{3}$/.test(String(currency ?? '').toUpperCase()) || !listingUrl.canonical
    || listingUrl.itemId !== sourceItemId
    || !validPastTimestamp(soldAt) || contradictsCompletedSale || anomalyFlag !== false || !listingHasExactGrade(listing, identity)
    || !listingHasExactCondition(listing, identity)
    || !match.accepted) return null;

  return {
    sourceId: 'poketrace_sold',
    sourceType: 'sold_transaction',
    externalReference: sourceItemId,
    sourceItemId,
    title,
    itemPrice: Number(finalPrice),
    finalPrice: Number(finalPrice),
    // The reviewed PokeTrace v1.7 listing contract does not document shipping.
    // Ignore similarly named payload fields rather than allowing an
    // undocumented amount to change Stackr's delivered-price estimate.
    shippingPrice: null,
    currency: String(currency).toUpperCase(),
    soldAt: new Date(soldAt).toISOString(),
    language: listingValue(listing, 'language', 'lang') ?? identity.language,
    gradingCompany: listingValue(listing, 'grader', 'grading_company', 'gradingCompany'),
    grade: listingValue(listing, 'grade', 'grade_value', 'gradeValue'),
    condition: rawCondition,
    rawCondition,
    sourceUrl: listingUrl.canonical,
    saleStatus: 'completed',
    saleVerificationState: 'completed',
    observedAt: new Date().toISOString(),
    metadata: {
      providerCardId: first(card?.id, card?.card_id, card?.cardId),
      providerObservationState: 'provider_observed',
      anomalyFlag: false,
      sourceItemId,
      listingUrl: listingUrl.canonical,
      listingType: listingType || null,
      providerEndpointSemantics: 'ebay_completed_sale',
    },
    rawPayload: { card, listing },
  };
}

function joinUrl(baseUrl, path) {
  return new URL(String(path).replace(/^\/+/, ''), `${String(baseUrl).replace(/\/+$/, '')}/`).toString();
}

async function fetchJson(url, config) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 8000);
  try {
    return await fetch(url, {
      headers: { Accept: 'application/json', 'X-API-Key': config.apiKey },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function createPokeTraceSoldAdapter(config = pricingV2Config.sources.poketrace_sold, context = {}) {
  const hasAuthorisedAccess = Boolean(config.enabled && config.authorisedSoldData === true && config.apiBaseUrl && config.apiKey);
  const checkActivationReadiness = context.checkActivationReadiness ?? (() => checkPokeTraceActivationReadiness());
  const isProviderUseAuthorised = context.isProviderUseAuthorised ?? (async () => {
    if (!context.supabase) throw new Error('PokeTrace provider rights check requires the server-side database client.');
    const { data, error } = await context.supabase
      .schema('api')
      .rpc('is_poketrace_data_use_authorised', {});
    if (error) throw new Error(`PokeTrace provider rights check failed: ${error.message}`);
    if (data !== true) throw new Error('PokeTrace has no active recorded amber rights review.');
    return true;
  });
  const assertRuntimeAuthorised = async () => {
    const activation = await checkActivationReadiness();
    if (activation?.active !== true) {
      throw new Error('PokeTrace activation artifacts are not approved and active.');
    }
    if (await isProviderUseAuthorised() !== true) {
      throw new Error('PokeTrace has no active recorded amber rights review.');
    }
  };
  return {
    id: 'poketrace_sold',
    displayName: 'PokeTrace completed eBay sales',
    capabilities: { soldTransactions: hasAuthorisedAccess, activeListings: false, marketEstimate: false, rawCards: true, gradedCards: true, sealedProducts: false, supportedLanguages: ['en', 'ja', 'zh-CN', 'zh-TW'], supportedCurrencies: ['GBP', 'USD', 'EUR', 'JPY', 'CAD', 'AUD'] },
    async healthCheck() {
      if (!config.enabled) return { status: 'disabled', message: 'PokeTrace sold adapter is disabled by PRICING_V2_POKETRACE_SOLD_ENABLED.' };
      if (!hasAuthorisedAccess) return { status: 'unavailable', message: 'PokeTrace Scale requires an API base URL, API key, and explicit sold-data authorisation.' };
      if (Date.now() < scaleUnavailableUntil) return { status: 'unavailable', message: 'PokeTrace Scale access is unavailable (403 cooldown).' };
      try {
        await assertRuntimeAuthorised();
      } catch (error) {
        return { status: 'unavailable', message: error?.message ?? String(error) };
      }
      return { status: 'ok', message: 'Authorised PokeTrace Scale completed-sales access configured.' };
    },
    async searchPrices(identity, context = {}) {
      if (!hasAuthorisedAccess || Date.now() < scaleUnavailableUntil) return [];
      await assertRuntimeAuthorised();
      const game = pokeTraceGame(identity);
      if (!game) return [];
      const cardsUrl = new URL(joinUrl(config.apiBaseUrl, '/cards'));
      cardsUrl.searchParams.set('limit', '20');
      cardsUrl.searchParams.set('search', identity.canonicalCardName ?? '');
      const providerSet = identity.setCode || (!UUID_PATTERN.test(identity.setId ?? '') ? identity.setId : null);
      if (providerSet) cardsUrl.searchParams.set('set', providerSet);
      cardsUrl.searchParams.set('card_number', identity.printedCardNumber || identity.cardNumber || '');
      const variant = pokeTraceVariant(identity);
      if (variant) {
        const apiVariant = {
          normal: 'Normal',
          holofoil: 'Holofoil',
          reverse_holofoil: 'Reverse_Holofoil',
          '1st_edition': '1st_Edition',
          '1st_edition_holofoil': '1st_Edition_Holofoil',
          unlimited: 'Unlimited',
        }[variant];
        cardsUrl.searchParams.set('variant', apiVariant);
      }
      cardsUrl.searchParams.set('game', game);
      // PokeTrace documents eBay sold coverage on its US card surface; its EU
      // surface is Cardmarket and is not an ebay.co.uk selector.
      cardsUrl.searchParams.set('market', 'US');
      cardsUrl.searchParams.set('product_type', 'single');
      let response = await fetchJson(cardsUrl, config);
      if (response.status === 403) { scaleUnavailableUntil = Date.now() + SCALE_COOLDOWN_MS; return []; }
      if (!response.ok) throw new Error(`PokeTrace card lookup failed (${response.status}).`);
      const card = resolveExactPokeTraceCard(arrayFromResponse(await response.json(), ['cards', 'results', 'data']), identity);
      if (!card) return [];

      const providerCardId = first(card.id, card.card_id, card.cardId);
      const listingsUrl = new URL(joinUrl(config.apiBaseUrl, `/cards/${encodeURIComponent(providerCardId)}/listings`));
      listingsUrl.searchParams.set('sort', 'sold_at_desc');
      listingsUrl.searchParams.set('limit', String(Math.max(1, Math.min(20, config.listingsLimit ?? 20, context.limit ?? 20))));
      if (identity.productType === 'graded_card') {
        listingsUrl.searchParams.set('grader', String(identity.gradingCompany).toUpperCase());
        listingsUrl.searchParams.set('grade', String(identity.grade));
      }
      response = await fetchJson(listingsUrl, config);
      if (response.status === 403) { scaleUnavailableUntil = Date.now() + SCALE_COOLDOWN_MS; return []; }
      if (!response.ok) throw new Error(`PokeTrace listings lookup failed (${response.status}).`);
      return arrayFromResponse(await response.json(), ['listings', 'results', 'data'])
        .map((listing) => normalizePokeTraceListing(listing, card, identity))
        .filter(Boolean);
    },
  };
}
