import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import printingEvidence from '../lib/generated/corocoroVerifiedPrintings.json';
import {
  corocoroIssueEvidence, getCorocoroIssueGroup, getCorocoroIssuesForCard, getCorocoroIssuesForSet,
  getCorocoroVerifiedPrinting, getCorocoroVerifiedPrintingArtwork, validateCorocoroVerifiedPrinting,
  type CorocoroVerifiedPrinting,
} from '../lib/corocoroIssueArchive';
import { getCuratedPokemonCardById } from '../lib/curatedPokemonCatalogue';
import type { PokemonCard } from '../lib/pokemonTcg';

function fixture(printing: CorocoroVerifiedPrinting): PokemonCard {
  const variantId = `variant:${printing.cardId}`;
  const image = {
    assetId: `asset:${printing.cardId}`, assetType: 'card_image', game: 'pokemon',
    cardId: printing.cardId, setId: printing.setId, variantId, permissionStatus: 'approved',
    deliveryUrl: `https://example.com/${printing.cardId}.jpg`, derivatives: [],
  };
  return {
    id: printing.cardId, set: { id: printing.setId }, language: 'ja', number: printing.collectorNumber,
    name: printing.referenceName, localName: printing.nativeName,
    images: { small: 'https://example.com/arbitrary-unsafe-image.jpg' },
    raw_data: {
      set: { set_code: printing.setCode },
      stackr: { cardId: printing.cardId, defaultVariantId: variantId, variants: [{
        variantId, variantCode: 'normal', finishCode: 'normal', imageVariantId: variantId, image,
      }] },
    },
  };
}

assert.equal(printingEvidence.printings.length, 11);
assert.equal(new Set(printingEvidence.printings.map(row => row.issueRecordId)).size, 11);
const baselineIds = new Set(corocoroIssueEvidence.issues.slice(0, 36).map(record => record.id));
const newRecords = corocoroIssueEvidence.issues.filter(record => !baselineIds.has(record.id));
assert.equal(newRecords.length, 10);

// Compile the unchanged collection helper with the real archive and curated
// identities. Navigation-only printings must not enter its account read cohort.
const collection = { exports: {} as Record<string, any> };
const dependencies: Record<string, unknown> = {
  './corocoroIssueArchive': { corocoroIssueEvidence },
  './curatedPokemonCatalogue': { getCuratedPokemonCardById },
  './supabase': { supabase: {} },
};
runInNewContext(ts.transpileModule(readFileSync('lib/corocoroIssueCollection.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, {
  module: collection, exports: collection.exports,
  require: (name: string) => { assert.ok(name in dependencies); return dependencies[name]; },
});

for (const printing of printingEvidence.printings) {
  const record = corocoroIssueEvidence.issues.find(row => row.id === printing.issueRecordId)!;
  const reference = record.cards.find(card => card.printedNumber === printing.printedNumber)!;
  assert.equal(getCorocoroVerifiedPrinting(record.id, reference), printing);
  assert.equal(printing.ownershipBindingAllowed, false);
  assert.equal(printing.physicalFinishStatus, 'unverified');
  assert.equal(reference.mappedStackrCardId, null, 'A numbered printing link must never become a collection alias');
  const card = fixture(printing);
  assert.equal(validateCorocoroVerifiedPrinting(printing, card), true);
  assert.equal(collection.exports.getCorocoroCollectionCard(reference, card), null);
  assert.deepEqual(getCorocoroIssuesForCard(printing.cardId).map(issue => issue.id), [printing.issueGroupId]);
  assert.ok(getCorocoroIssuesForSet(printing.setId).some(issue => issue.id === printing.issueGroupId));
  assert.ok(printing.sourceUrls.some(url => new URL(url).hostname === 'www.pokemon-card.com'));
  for (const wrong of [
    { ...card, id: 'other-card' }, { ...card, set: { id: 'other-set' } },
    { ...card, language: 'en' as const }, { ...card, number: '001' },
    { ...card, localName: 'another native name' }, { ...card, raw_data: { set: { set_code: 'other-family' } } },
    { ...card, raw_data: { stackr: { canonical: true, cardId: card.id } } },
  ]) {
    assert.equal(validateCorocoroVerifiedPrinting(printing, wrong), false,
      'A wrong printing field, or canonical flag without the fields, must keep the navigation unavailable');
    assert.equal(getCorocoroVerifiedPrintingArtwork(printing, wrong), null);
  }
  const artwork = getCorocoroVerifiedPrintingArtwork(printing, card)!;
  assert.equal(artwork.kind, 'exact');
  assert.notEqual(artwork.small, card.images?.small, 'Only the approved bound API asset supplies pocket artwork');
  assert.equal(artwork.small, `https://example.com/${printing.cardId}.jpg`);
  const variant = card.raw_data.stackr.variants[0];
  for (const image of [
    { ...variant.image, permissionStatus: 'unapproved' },
    { ...variant.image, cardId: 'other-card' }, { ...variant.image, setId: 'other-set' },
    { ...variant.image, game: 'other-game' }, { ...variant.image, unavailableReason: 'rights_pending' },
  ]) {
    const unavailable = { ...card, raw_data: { ...card.raw_data, stackr: {
      ...card.raw_data.stackr, variants: [{ ...variant, image }],
    } } };
    assert.equal(validateCorocoroVerifiedPrinting(printing, unavailable), true,
      'Unavailable artwork must not erase otherwise verified printing metadata');
    assert.equal(getCorocoroVerifiedPrintingArtwork(printing, unavailable)?.kind, 'missing');
  }
  assert.equal(getCorocoroVerifiedPrintingArtwork(printing, { ...card, raw_data: {
    ...card.raw_data, stackr: { ...card.raw_data.stackr, variants: [null] },
  } }), null, 'Partial variant data leaves artwork unavailable without crashing');
}

const snorlax = printingEvidence.printings.find(printing => printing.referenceName === 'Snorlax')!;
assert.match(snorlax.physicalFinishNote!, /foil/i, 'The publisher foil / API normal conflict remains explicit');
const tadbulb = getCorocoroIssueGroup('ichiban:2025-04')!.records[0];
assert.equal(getCorocoroVerifiedPrinting(tadbulb.id, tadbulb.cards[0]), null,
  'Finding 257/SV-P in the API cannot establish its missing issue-to-printing association');
assert.deepEqual(getCorocoroIssuesForCard('6946cc37-98cf-4152-a2ac-1ea264d8fbd4'), []);
const disputed = getCorocoroIssueGroup('monthly:2003-06')!.records[0];
assert.equal(getCorocoroVerifiedPrinting(disputed.id, disputed.cards[0]), null);
assert.deepEqual(getCorocoroIssuesForCard('SM3p-041'), []);
assert.deepEqual(getCorocoroIssuesForCard('Mew'), []);
assert.deepEqual(getCorocoroIssuesForCard('ja:corocoro-shining-mew-2001').map(issue => issue.id), ['monthly:2001-05']);
const ownership = collection.exports.getCorocoroIssueOwnership(newRecords, new Set(printingEvidence.printings.map(row => row.cardId)));
assert.equal(ownership.total, 10);
assert.equal(ownership.pending, 10);
assert.equal(ownership.owned, 0);
assert.equal(ownership.complete, false, 'Unknown physical finishes cannot complete new issues, even if a numbered printing is saved elsewhere');

console.log('CoroCoro printing bindings: 11 strict identities, approved bound artwork, preserved Mew/issue holds and 10 ownership holds passed.');
