import assert from 'node:assert/strict';

export const BENCHMARK_IDENTITIES = Object.freeze({
  search: Object.freeze({
    cardId: 'ba65f365-abcb-40dd-9486-ba24014f33d5',
    languageCode: 'ja',
    setId: 'e42556b8-3e82-44bb-8c52-c06b893ee4a3',
    setCode: 'SV2a',
    collectorNumber: '157',
  }),
  asset: Object.freeze({
    variantId: '61459941-7744-431e-99ef-2b4c5fa26bef',
    derivativeRoles: Object.freeze(['card-grid', 'search-result', 'detail-page']),
  }),
});

function assertEnvelope(body, scenario) {
  assert(body && typeof body === 'object' && !Array.isArray(body), `${scenario}_json_envelope_missing`);
  assert(body.error == null, `${scenario}_api_error`);
  assert(body.data && typeof body.data === 'object', `${scenario}_data_missing`);
}

function assertSecureDeliveryUrl(value, message) {
  assert.equal(typeof value, 'string', message);
  const url = new URL(value);
  assert.equal(url.protocol, 'https:', message);
  assert.equal(url.username, '', message);
  assert.equal(url.password, '', message);
}

export function validatePublicApiBenchmarkResponse(scenario, body) {
  assertEnvelope(body, scenario);

  if (scenario === 'health') {
    assert.equal(body.data.status, 'ok', 'health_status_not_ok');
    assert(['stackr-api', 'stackr-api-gateway'].includes(body.data.service), 'health_service_identity_mismatch');
    return { usefulCount: 1, expectedIdentityFound: true, languageVerified: null };
  }

  if (scenario === 'sets') {
    const sets = body.data.sets;
    assert(Array.isArray(sets) && sets.length > 0, 'sets_unexpectedly_empty');
    assert(sets.every((set) => set?.languageCode === 'en'), 'sets_wrong_language');
    assert(sets.every((set) => typeof set?.setId === 'string' && set.setId.length > 0), 'sets_identity_missing');
    assert.equal(new Set(sets.map((set) => set.setId)).size, sets.length, 'sets_duplicate_identity');
    return { usefulCount: sets.length, expectedIdentityFound: true, languageVerified: 'en' };
  }

  if (scenario === 'search') {
    const results = body.data.results;
    assert(Array.isArray(results) && results.length > 0, 'search_unexpectedly_empty');
    assert(results.every((result) => result?.languageCode === BENCHMARK_IDENTITIES.search.languageCode), 'search_wrong_language');
    // Exact set/number searches must put the expected printing first. The app
    // renders result.card, so validate that payload as well as the index fields.
    const expected = results[0];
    assert((
      expected?.type === 'card'
      && expected.reason === 'exact_set_code_collector_number'
      && expected.cardId === BENCHMARK_IDENTITIES.search.cardId
      && String(expected.setCode ?? '').toLowerCase() === BENCHMARK_IDENTITIES.search.setCode.toLowerCase()
      && String(expected.collectorNumber ?? '').split('/')[0] === BENCHMARK_IDENTITIES.search.collectorNumber
    ), 'search_expected_identity_missing');
    const card = expected.card;
    assert(card?.cardId === expected.cardId, 'search_rendered_card_identity_mismatch');
    assert(card.languageCode === BENCHMARK_IDENTITIES.search.languageCode, 'search_rendered_card_language_mismatch');
    assert(expected.setId === BENCHMARK_IDENTITIES.search.setId
      && card.set?.setId === expected.setId
      && String(card.set?.setCode ?? '').toLowerCase() === BENCHMARK_IDENTITIES.search.setCode.toLowerCase(),
    'search_rendered_card_set_mismatch');
    assert(String(card.collectorNumber?.value ?? '').split('/')[0] === BENCHMARK_IDENTITIES.search.collectorNumber,
      'search_rendered_card_number_mismatch');
    assert(typeof expected.variantId === 'string' && expected.variantId.length > 0
      && card.defaultVariantId === expected.variantId
      && Array.isArray(card.variants)
      && card.variants.some((variant) => variant?.variantId === expected.variantId),
    'search_rendered_card_variant_missing');
    return {
      usefulCount: results.length,
      expectedIdentityFound: true,
      languageVerified: BENCHMARK_IDENTITIES.search.languageCode,
    };
  }

  if (scenario === 'assets') {
    const assets = body.data.assets;
    assert(Array.isArray(assets) && assets.length > 0, 'assets_unexpectedly_empty');
    const expected = assets.find((asset) => asset?.variantId === BENCHMARK_IDENTITIES.asset.variantId);
    assert(expected, 'assets_expected_identity_missing');
    assertSecureDeliveryUrl(expected.deliveryUrl, 'assets_original_delivery_url_invalid');
    const derivatives = Array.isArray(expected.derivatives) ? expected.derivatives : [];
    for (const role of BENCHMARK_IDENTITIES.asset.derivativeRoles) {
      const matching = derivatives.filter((derivative) => derivative?.role === role);
      assert.equal(matching.length, 1, `assets_${role}_derivative_missing_or_duplicate`);
      assertSecureDeliveryUrl(matching[0].deliveryUrl, `assets_${role}_delivery_url_invalid`);
    }
    return { usefulCount: assets.length, expectedIdentityFound: true, languageVerified: null };
  }

  throw new Error(`unknown_benchmark_scenario:${scenario}`);
}

