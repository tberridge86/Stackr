import assert from 'node:assert/strict';

export const BENCHMARK_IDENTITIES = Object.freeze({
  search: Object.freeze({
    cardId: 'ba65f365-abcb-40dd-9486-ba24014f33d5',
    languageCode: 'ja',
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
    assert.equal(body.data.service, 'stackr-api', 'health_service_identity_mismatch');
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
    const expected = results.find((result) => (
      result?.type === 'card'
      && result.reason === 'exact_set_code_collector_number'
      && result.cardId === BENCHMARK_IDENTITIES.search.cardId
      && String(result.setCode ?? '').toLowerCase() === BENCHMARK_IDENTITIES.search.setCode.toLowerCase()
      && String(result.collectorNumber ?? '').split('/')[0] === BENCHMARK_IDENTITIES.search.collectorNumber
    ));
    assert(expected, 'search_expected_identity_missing');
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
