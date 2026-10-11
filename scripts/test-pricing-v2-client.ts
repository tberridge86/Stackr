import assert from 'node:assert/strict';
import * as chineseCatalogueCorrection from '../lib/chineseCatalogueCorrection';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as priceIdentity from '../lib/stackrPriceIdentity';
import type { StackrCard, StackrCardPrice } from '../lib/stackrApiV1';

function load<T>(file: string, mocks: Record<string, unknown>): T {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, process, Error,
    require: (id: string) => { assert.ok(id in mocks, `Unexpected dependency ${id}`); return mocks[id]; } });
  return module.exports as T;
}

async function staleComponentRequestsCannotReplaceSelectedPrice() {
  const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
  const slots: unknown[] = [];
  let cursor = 0;
  let nextEffect: (() => (() => void)) | undefined;
  let cleanup: (() => void) | undefined;
  const hooks = {
    createElement: () => null,
    useMemo: (factory: () => unknown) => factory(),
    useState: (initial: unknown) => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value: unknown) => { slots[index] = value; }];
    },
    useRef: (initial: unknown) => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useEffect: (effect: () => (() => void)) => { nextEffect = effect; },
  };
  const pending: { resolve: (result: unknown) => void; reject: (error: Error) => void }[] = [];
  const component = load<{ default: (props: { cardId: string; finish: string }) => unknown }>('components/PricingV2Summary.tsx', {
    react: hooks, 'react-native': { StyleSheet: { create: (styles: unknown) => styles } },
    './StackrLoadingIndicator': {}, './Text': {}, './theme-context': { useTheme: () => ({ theme: { colors: {} } }) },
    '../lib/pricingV2': { PRICING_ENGINE_V2_ENABLED: true, fetchStackrPricingV2: () => new Promise((resolve, reject) => {
      pending.push({ resolve, reject });
    }) },
  }).default;
  const renderNewIdentity = (finish: string) => {
    cursor = 0;
    component({ cardId: 'card', finish });
    cleanup?.();
    cleanup = nextEffect?.();
  };
  renderNewIdentity('normal');
  renderNewIdentity('reverse_holo');
  pending[0].resolve({ identityKey: 'old-normal' });
  await flush();
  assert.equal(slots[0], null, 'the old variant price must not replace the selected reverse variant');
  assert.equal(slots[1], true, 'an earlier request must not stop the selected variant loader');
  const selected = { identityKey: 'selected-reverse', state: 'market_value', marketPrice: 12,
    confidence: { label: 'low', explanation: 'Fixture' }, evidence: { compCount: 1 }, sourceBreakdown: [] };
  pending[1].resolve(selected);
  await flush();
  assert.equal(slots[0], selected);
  assert.equal(slots[1], false);
  renderNewIdentity('unmatched_finish');
  assert.equal(slots[0], null, 'changing variant must clear the previous price');
  pending[2].reject(new Error('No exact variant'));
  await flush();
  assert.equal(slots[0], null, 'a failed request must not leave a price from another variant visible');
  assert.equal(slots[2], 'No exact variant');
  renderNewIdentity('normal');
  cleanup?.();
  pending[3].resolve({ identityKey: 'after-unmount' });
  await flush();
  assert.equal(slots[0], null, 'an unmounted panel must ignore late price responses');
}

async function presentationCachePreservesAccountAccess() {
  let account: string | null = 'owner-a';
  let calls = 0;
  let duringFetch: (() => void) | undefined;
  const pricing = load<typeof import('../lib/pricingV2')>('lib/pricingV2.ts', {
    './stackrApiV1': { stackrApiClient: { getPricingCacheScope: async () => {
      if (!account) throw new Error('Sign in to read saved prices.');
      return account;
    } } },
    './stackrDomainAdapter': { fetchStackrPrice: async () => {
      calls++;
      const value = account === 'owner-a' ? 42 : 84;
      duringFetch?.();
      return { resolved: { card: { cardId: 'card' }, variantId: 'normal' }, price: {
        currency: 'GBP', status: 'market_estimate', freshness: 'fresh',
        estimates: { central: value, low: null, high: null }, confidence: { score: 0.2, label: 'low' },
        sample: { total: 1, sold: 0, active: 0, sources: 1 }, sourceBreakdown: [{ provider: 'tcgdex',
          evidenceType: 'provider_market_estimate', originalCurrency: 'EUR', originalAmount: 50,
          fxRate: 0.84, fxDate: '2026-10-10', rawRecordRef: 'fixture-record' }],
        calculatedAt: null, staleAfter: null, estimateVersion: 'fixture', priceType: 'market_estimate',
      } };
    } },
  });
  const first = await pricing.fetchStackrPricingV2('card');
  assert.equal(first.marketPrice, 42);
  assert.equal(first.sourceBreakdown[0].source, 'tcgdex', 'preserve the API provider field');
  assert.equal(first.sourceBreakdown[0].originalCurrency, 'EUR');
  assert.equal(first.sourceBreakdown[0].originalAmount, 50);
  assert.equal(first.sourceBreakdown[0].fxRate, 0.84);
  assert.equal(first.sourceBreakdown[0].rawRecordRef, 'fixture-record', 'retain source provenance instead of reducing it to a label');
  assert.equal((await pricing.fetchStackrPricingV2('card')).marketPrice, 42);
  assert.equal(calls, 1, 'same-account cache hits avoid price requests');
  account = 'owner-b';
  assert.equal((await pricing.fetchStackrPricingV2('card')).marketPrice, 84, 'another account cannot reuse owner A pricing');
  assert.equal((await pricing.fetchStackrPricingV2('card', { accountScope: 'owner-a' } as never)).marketPrice, 84,
    'unexpected caller properties cannot override the resolved account namespace');
  assert.equal(calls, 2);
  account = null;
  await assert.rejects(pricing.fetchStackrPricingV2('card'), /Sign in/);
  assert.equal(calls, 2, 'signed-out cache reads fail before requesting prices');
  account = 'owner-a';
  duringFetch = () => { account = 'owner-b'; };
  await assert.rejects(pricing.fetchStackrPricingV2('other-card'), /account changed/);
  duringFetch = undefined;
  assert.equal((await pricing.fetchStackrPricingV2('other-card')).marketPrice, 84,
    'an old in-flight account response is neither returned nor cached for the new account');
  assert.equal(calls, 4);
  for (let i = 0; i < 200; i++) await pricing.fetchStackrPricingV2(`bounded-${i}`);
  const beforeEvictedRead = calls;
  await pricing.fetchStackrPricingV2('card');
  assert.equal(calls, beforeEvictedRead + 1, 'long sessions do not retain every historical cached card');
}

async function main() {
  const cardId = '00000000-0000-4000-8000-000000000001';
  const normalId = '00000000-0000-4000-8000-000000000002';
  const reverseId = '00000000-0000-4000-8000-00000000000a';
  const unlimitedReverseId = '00000000-0000-4000-8000-000000000004';
  const setId = '00000000-0000-4000-8000-000000000005';
  const card = {
    cardId, languageCode: 'zh-tw', set: { setId }, defaultVariantId: normalId,
    variants: [
      { variantId: normalId, canonicalId: 'tw-card-normal', variantCode: 'normal', finishCode: 'normal' },
      { variantId: reverseId, canonicalId: 'tw-card-first-reverse', variantCode: 'first_edition', finishCode: 'reverse_holo' },
      { variantId: unlimitedReverseId, canonicalId: 'tw-card-unlimited-reverse', variantCode: 'unlimited', finishCode: 'reverse_holo' },
    ],
  } as unknown as StackrCard;
  let priceCurrency = 'GBP';
  let wrongPriceVariant = false;
  const requests: { variantId: string; condition?: string; grader?: string; grade?: string; force?: boolean }[] = [];
  const quote = (variantId: string, productType = 'raw_card') => ({
    variantId: wrongPriceVariant ? normalId : variantId, currency: priceCurrency, productType, status: 'market_estimate', freshness: 'fresh',
    estimates: { central: variantId === reverseId ? 12 : 4, low: null, high: null },
    confidence: { score: 0.2, label: 'low' }, sample: { total: 1, sold: 0, active: 0, sources: 1 },
    sourceBreakdown: [], calculatedAt: null, staleAfter: null, estimateVersion: 'fixture', priceType: 'market_estimate',
  } as unknown as StackrCardPrice);
  const client = {
    card: async () => ({ data: { card } }),
    cardPrice: async (variantId: string, query: Record<string, string>) => {
      requests.push({ variantId, ...query }); return { data: quote(variantId, query.productType) };
    },
  };
  const adapter = load<typeof import('../lib/stackrDomainAdapter')>('lib/stackrDomainAdapter.ts', {
    './chineseCatalogueCorrection': chineseCatalogueCorrection,
    './stackrSetRetrieval': {},
    './stackrPreferredSetArtwork': {},
    './cardArtworkPresentation': {},
    './publishedSetLogoFallbacks': {},
    './stackrCatalogueCache': {},
    './foreignCardPresentation': {},
    './englishSetIdentity': {},
    './pokemonSetSeries': {},
    './optionalCatalogueEnrichment': {},
    './stackrApiV1': { stackrApiClient: {} }, './supabase': {},
    './stackrDomainMappings': { toStackrApiLanguage: (language: string) => language === 'tw' ? 'zh-tw' : language },
    './tcgdexControlledCardReference': {}, './providerSetMarkRuntimePolicy': {}, './homePriceRefreshCore': {},
    './stackrPriceIdentity': priceIdentity, './pokemonSetIdentity': {}, './resilientCatalogueRead': {},
    './pokemonDisplayNames': {}, './cardNameTranslations.js': {}, './optionalSearchEnrichment': {},
    './cataloguePrices': { fetchCachedRawDetailPrice: async (identity: { variantId: string }, query: Record<string, string>, _client: unknown, force: boolean) => {
      requests.push({ variantId: identity.variantId, ...query, force }); return quote(identity.variantId);
    } },
  });
  const pricing = load<typeof import('../lib/pricingV2')>('lib/pricingV2.ts', {
    './stackrApiV1': { stackrApiClient: { getPricingCacheScope: async () => 'fixture-owner' } },
    './stackrDomainAdapter': { fetchStackrPrice: (reference: string, options: Parameters<typeof adapter.fetchStackrPrice>[1]) => (
      adapter.fetchStackrPrice(reference, options, client as never)
    ) },
  });
  const reverse = await pricing.fetchStackrPricingV2(cardId, {
    language: 'tw', variant: reverseId, finish: 'reverseHolofoil', edition: '1st_edition',
    condition: 'near_mint', forceRefresh: true,
  });
  assert.equal(reverse.identityKey, reverseId);
  assert.equal(reverse.marketPrice, 12, 'the selected reverse variant must not use the normal price');
  assert.equal(requests[0].condition, 'near_mint');
  assert.equal(requests[0].force, true);
  const directVariant = await pricing.fetchStackrPricingV2(unlimitedReverseId, { language: 'zh-tw' });
  assert.equal(directVariant.identityKey, unlimitedReverseId, 'an explicit variant UUID must survive a card endpoint returning its default');
  assert.equal((await pricing.fetchStackrPricingV2(reverseId.toUpperCase())).identityKey, reverseId,
    'case-insensitive UUID references must retain the exact variant');
  const ordinary = await pricing.fetchStackrPricingV2(cardId, { language: 'zh-tw' });
  assert.equal(ordinary.identityKey, normalId, 'an unconstrained printing may use its published default');

  const beforeRejected = requests.length;
  for (const options of [
    { language: 'zh-tw', finish: 'reverse_holo' }, // Two editions; insufficient identity.
    { language: 'zh-tw', variant: normalId, finish: 'reverse_holo' },
    { language: 'zh-tw', finish: 'master_ball_reverse' },
    { language: 'zh-cn', variant: reverseId },
    { language: 'zh-tw', variant: reverseId, edition: 'shadowless' },
  ]) await assert.rejects(pricing.fetchStackrPricingV2(cardId, options), /exact canonical variant/);
  assert.equal(await adapter.fetchStackrPrice(cardId, {
    setId: '00000000-0000-4000-8000-000000000099',
  }, client as never), null);
  assert.equal(await adapter.fetchStackrPrice(normalId, { variant: reverseId }, client as never), null);
  assert.equal(await adapter.fetchStackrPrice(cardId, { language: 'made-up' }, client as never), null);
  assert.equal(await adapter.fetchStackrPrice(cardId, { setId: 'wrong-external-code' }, client as never), null);
  assert.equal(requests.length, beforeRejected, 'ambiguous, conflicting or wrong-language/set identities must make no price/cache request');

  await pricing.fetchStackrPricingV2(cardId, {
    language: 'zh-tw', variant: reverseId, productType: 'graded_card', gradingCompany: 'PSA', grade: 10,
  });
  assert.equal(requests.at(-1)?.variantId, reverseId);
  assert.equal(requests.at(-1)?.grader, 'PSA');
  assert.equal(requests.at(-1)?.grade, '10');
  priceCurrency = 'USD';
  await assert.rejects(pricing.fetchStackrPricingV2(cardId), /unexpected currency/,
    'a USD price must never be relabelled or rendered as GBP');
  priceCurrency = 'GBP';
  wrongPriceVariant = true;
  await assert.rejects(pricing.fetchStackrPricingV2(cardId, { variant: reverseId }), /different card variant/,
    'a cached or returned price from a sibling finish must never enter the selected price panel');
  const detail = readFileSync('app/card/[id].tsx', 'utf8');
  assert.match(detail, /<PricingV2Summary[\s\S]{0,400}variant=\{typeof params\.variant[\s\S]{0,200}finish=\{typeof params\.finish/);
  await staleComponentRequestsCannotReplaceSelectedPrice();
  await presentationCachePreservesAccountAccess();
  console.log('Pricing client tests passed: exact identity, forced refresh, currency, late UI responses, account/sign-out isolation, provider labels and bounded presentation cache.');
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
