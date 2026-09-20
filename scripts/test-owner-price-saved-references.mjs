import assert from 'node:assert/strict';
import test from 'node:test';
import { ownerIdentityLookupRows, resolveScopedOwnedProviderVariant } from './lib/owner-price-saved-references.mjs';

const setId = '11111111-1111-4111-8111-111111111111';
const variant = '22222222-2222-4222-8222-222222222222';
const printing = '33333333-3333-4333-8333-333333333333';
const other = '44444444-4444-4444-8444-444444444444';
const row = { card_id: 'ja:S12a-146', set_id: 'ja:S12a', variant: 'normal', quantity: 1, condition: 'Near Mint', grade_company: '', grade: '' };
const aliases = [
  { source_entity_type: 'set', external_id: 'S12a', language_code: 'ja', set_id: setId },
  { source_entity_type: 'card', external_id: 'S12a-146', language_code: 'ja', variant_id: variant },
];
const card = { variant_id: variant, printing_id: printing, set_id: setId, language_code: 'ja', variant_code: 'normal', finish_code: 'normal' };
const expected = { ok: true, variantId: variant };
const resolve = (saved = row, ids = aliases, cards = [card]) => resolveScopedOwnedProviderVariant(saved, ids, cards);

test('explicit Japanese prefix uses existing published card and set aliases', () => assert.deepEqual(resolve(), expected));
test('lookup enumeration preserves provider case, number and original references', () => {
  assert.deepEqual(ownerIdentityLookupRows(row), [row, { ...row, card_id: 'S12a-146', set_id: 'S12a' }]);
  assert.deepEqual(row.card_id, 'ja:S12a-146');
});
test('identical shared set/card aliases in other languages cannot contaminate the match', () => {
  assert.deepEqual(resolve(row, [...aliases, ...aliases.map((item) => ({ ...item, language_code: 'zh-tw', set_id: other, variant_id: other }))], [card, { ...card, language_code: 'zh-tw', variant_id: other, set_id: other }]), expected);
});
test('foreign-only aliases cannot satisfy a Japanese saved reference', () => {
  assert.equal(resolve(row, aliases.map((item) => ({ ...item, language_code: 'en' })), [{ ...card, language_code: 'en' }]).ok, false);
});
test('foreign catalogue language is rejected even when alias language matches', () => assert.equal(resolve(row, aliases, [{ ...card, language_code: 'ko' }]).ok, false));
test('card and set with contradictory language prefixes are rejected without a lookup', () => {
  const contradictory = { ...row, card_id: 'en:S12a-146' };
  assert.deepEqual(ownerIdentityLookupRows(contradictory), []);
  assert.equal(resolve(contradictory).reason, 'ambiguous_saved_identity');
});
test('card-only explicit language still scopes a bare saved set', () => assert.deepEqual(resolve({ ...row, set_id: 'S12a' }), expected));
test('set-only explicit language still scopes a bare saved card', () => assert.deepEqual(resolve({ ...row, card_id: 'S12a-146' }), expected));
test('unrecognised provider namespaces are never stripped', () => {
  const opaque = { ...row, card_id: 'pokedata:57932' };
  assert.equal(ownerIdentityLookupRows(opaque)[1].card_id, 'pokedata:57932');
  assert.equal(resolve(opaque).reason, 'unresolved_saved_card');
});
test('an exact opaque provider mapping can work inside the explicit set language', () => {
  assert.deepEqual(resolve({ ...row, card_id: 'pokedata:57932' }, [aliases[0], { ...aliases[1], external_id: 'pokedata:57932' }]), expected);
});
test('empty and nested recognised language prefixes never broaden lookup', () => {
  for (const card_id of ['ja:', 'ja:en:S12a-146', 'ja:ja:S12a-146']) {
    assert.deepEqual(ownerIdentityLookupRows({ ...row, card_id }), []);
    assert.equal(resolve({ ...row, card_id }).ok, false);
  }
});
test('a published literal alias takes precedence over its bare spelling', () => {
  assert.equal(resolve(row, [...aliases, { ...aliases[1], external_id: row.card_id, variant_id: other }]).ok, false);
});
test('a conflicting literal alias cannot be bypassed by stripping the language prefix', () => {
  assert.equal(resolve(row, [...aliases, { ...aliases[1], external_id: row.card_id, language_code: 'en' }]).ok, false);
});
test('an exact published prefixed set/card pair remains supported', () => {
  assert.deepEqual(resolve(row, aliases.map((item) => ({ ...item, external_id: `ja:${item.external_id}` }))), expected);
});
test('literal set and bare card can be resolved independently without broadening language', () => {
  assert.deepEqual(resolve(row, [{ ...aliases[0], external_id: row.set_id }, aliases[1]]), expected);
});
test('the prefix bridge retains printing-only alias resolution', () => {
  assert.deepEqual(resolve(row, [aliases[0], { ...aliases[1], variant_id: null, printing_id: printing }]), expected);
});
test('a missing or conflicting saved set stays unresolved', () => {
  assert.equal(resolve(row, [aliases[1]]).reason, 'unresolved_saved_set');
  assert.equal(resolve(row, [{ ...aliases[0], set_id: other }, aliases[1]]).ok, false);
});
test('explicit language does not authorise a different physical finish', () => {
  for (const code of ['holo', 'reverse_holo', 'master_ball']) assert.equal(resolve(row, aliases, [{ ...card, variant_code: code, finish_code: code }]).ok, false);
});
test('saved finish, grade and condition gates run before namespace mapping', () => {
  assert.equal(resolve({ ...row, variant: 'reverseHolofoil' }).reason, 'non_normal_saved_variant');
  assert.equal(resolve({ ...row, grade: '10' }).reason, 'graded_card');
  assert.equal(resolve({ ...row, condition: 'Lightly Played' }).reason, 'not_raw_near_mint');
});
test('unprefixed SV spellings are not assigned an English language', () => {
  const saved = { ...row, card_id: 'sv1-205', set_id: 'sv1' };
  assert.deepEqual(ownerIdentityLookupRows(saved), [saved]);
  assert.equal(resolve(saved).reason, 'unresolved_saved_set');
});
test('every accepted explicit language still requires that same published language', () => {
  for (const language of ['en', 'ja', 'ko', 'zh-cn', 'zh-tw']) {
    const saved = { ...row, card_id: `${language}:test-001`, set_id: `${language}:test` };
    const ids = aliases.map((item) => ({ ...item, language_code: language, external_id: item.source_entity_type === 'card' ? 'test-001' : 'test' }));
    assert.deepEqual(resolve(saved, ids, [{ ...card, language_code: language }]), expected);
  }
});
test('unknown aliases with no language evidence cannot satisfy a prefixed row', () => {
  assert.equal(resolve(row, aliases.map(({ language_code, ...rest }) => rest)).ok, false);
});

test('database lookup includes the verified ME set spelling needed by the resolver', () => {
  for (const [savedSet, publishedSet] of [['me1', 'me01'], ['me2pt5', 'me02.5']]) {
    const saved = { ...row, card_id: `${savedSet}-001`, set_id: savedSet };
    const references = new Set(ownerIdentityLookupRows(saved).flatMap((item) => [item.card_id, item.set_id]));
    const published = [{ source_entity_type: 'set', external_id: publishedSet, language_code: 'en', set_id: setId }];
    const fetched = published.filter((item) => references.has(item.external_id));
    assert.deepEqual(resolve(saved, fetched, [{ ...card, language_code: 'en', collector_number: '001' }]), expected);
    assert.equal(ownerIdentityLookupRows(saved).every((item) => item.card_id === saved.card_id), true);
    assert.equal(resolve(saved, fetched, [{ ...card, language_code: 'ja', collector_number: '001' }]).ok, false);
    assert.equal(resolve(saved, fetched, [{ ...card, language_code: 'en', collector_number: '001', variant_code: 'holo', finish_code: 'holo' }]).ok, false);
  }
});

test('verified ME lookup does not rewrite foreign or mismatched saved pairs', () => {
  const foreign = { ...row, card_id: 'ja:me1-001', set_id: 'ja:me1' };
  assert.deepEqual(ownerIdentityLookupRows(foreign).map((item) => item.set_id), ['ja:me1', 'me1']);
  const mismatched = { ...row, card_id: 'me2-001', set_id: 'me1' };
  assert.deepEqual(ownerIdentityLookupRows(mismatched), [mismatched]);
});

test('explicit English SV rows fetch only their verified set aliases and keep the card literal', () => {
  const saved = { ...row, language: 'en', card_id: 'sv4-007', set_id: 'sv4' };
  assert.deepEqual(ownerIdentityLookupRows(saved), [saved, { ...saved, set_id: 'sv04' }]);
  const published = [{ source_entity_type: 'set', external_id: 'sv04', language_code: 'en', set_id: setId }];
  const cards = [{ ...card, language_code: 'en', collector_number: '007' }];
  assert.deepEqual(resolve(saved, published, cards), expected);
  assert.equal(resolve(saved, published, [{ ...cards[0], collector_number: '008' }]).reason, 'unresolved_saved_card');
  assert.equal(resolve(saved, published, [{ ...cards[0], variant_code: 'holo', finish_code: 'holo' }]).ok, false);
  assert.equal(resolve(saved, published, [...cards, { ...cards[0], variant_id: other }]).reason, 'ambiguous_saved_identity');
});

test('an explicit English namespace is sufficient evidence for the same SV alias bridge', () => {
  const saved = { ...row, card_id: 'en:sv4-007', set_id: 'en:sv4' };
  const published = [{ source_entity_type: 'set', external_id: 'sv04', language_code: 'en', set_id: setId }];
  const cards = [{ ...card, language_code: 'en', collector_number: '007' }];
  assert.deepEqual(ownerIdentityLookupRows(saved), [
    saved,
    { ...saved, card_id: 'sv4-007', set_id: 'sv4', language: 'en' },
    { ...saved, card_id: 'sv4-007', set_id: 'sv04', language: 'en' },
  ]);
  assert.deepEqual(resolve(saved, published, cards), expected);
});

test('SV/SWSH aliases refuse unknown or non-English saved scope', () => {
  const sv = { ...row, language: 'ja', card_id: 'sv4-007', set_id: 'sv4' };
  const unknown = { ...row, language: 'en', card_id: 'zsv10pt5-007', set_id: 'zsv10pt5' };
  const opaque = { ...row, language: 'en', card_id: 'svp-007', set_id: 'svp' };
  assert.deepEqual(ownerIdentityLookupRows(sv), [sv]);
  assert.deepEqual(ownerIdentityLookupRows(unknown), [unknown]);
  assert.deepEqual(ownerIdentityLookupRows(opaque), [opaque]);
});
