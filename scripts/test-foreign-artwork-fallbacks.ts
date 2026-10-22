import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { getApprovedArtworkFallbackUris, getCardArtworkPresentation, resolveCardArtwork } from '../lib/cardArtworkPresentation';
import * as editionImages from '../lib/editionImages';
import { nextStackrImageCandidate, stackrImageCandidates } from '../lib/stackrImageCandidates';

const cardId = '00000000-0000-4000-8000-000000000001';
const variantId = '00000000-0000-4000-8000-000000000002';
const setId = '00000000-0000-4000-8000-000000000003';
const original = 'https://approved.example/native-original.jpg';
const grid = 'https://approved.example/native-grid.webp';
const detail = 'https://approved.example/native-detail.webp';
function fixture(language = 'ja', printingFace = false) {
  const asset = { assetId: 'native-front', assetType: 'card_image', game: 'pokemon', cardId, setId, variantId: printingFace ? null : variantId,
    permissionStatus: 'approved', unavailableReason: null, deliveryUrl: original, derivatives: [
      { role: 'card-grid', deliveryUrl: grid, width: 250, height: 350 },
      { role: 'detail-page', deliveryUrl: detail, width: 1000, height: 1400 },
    ] };
  const card: any = { cardId, game: 'pokemon', languageCode: language, set: { setId },
    defaultVariantId: variantId, variants: [{ variantId, variantCode: 'normal', finishCode: 'normal', image: asset }] };
  const artwork = resolveCardArtwork(card);
  return { id: cardId, language, set: { id: setId },
    stackr: { canonical: true, cardId, defaultVariantId: variantId, variants: card.variants },
    presentation: { artwork } };
}

const StackrImage = () => null;
const React = {
  memo: (value: unknown) => value,
  useMemo: (callback: () => unknown) => callback(),
  useCallback: (callback: unknown) => callback,
  createElement: (type: unknown, props: any, ...children: unknown[]) => ({ type, props: { ...props, children } }),
};
const componentSource = process.env.FOREIGN_ARTWORK_BASELINE === '1'
  ? execFileSync('git', ['show', 'HEAD:components/EditionAwareCardImage.tsx'], { encoding: 'utf8' })
  : readFileSync('components/EditionAwareCardImage.tsx', 'utf8');
const compiled = ts.transpileModule(componentSource, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
} }).outputText;
const componentModule = { exports: {} as any };
runInNewContext(compiled, { module: componentModule, exports: componentModule.exports, require: (name: string) => {
  if (name === 'react') return React;
  if (name === 'react-native') return { View: 'View', StyleSheet: { create: (value: unknown) => value, absoluteFillObject: {} } };
  if (name === '../lib/cardArtworkPresentation') return { getApprovedArtworkFallbackUris, getCardArtworkPresentation };
  if (name === '../lib/editionImages') return editionImages;
  if (name === './StackrImage') return { StackrImage };
  if (name === './Text') return { Text: 'Text' };
  if (name === './CardFinishArtwork') return { CardFinishArtwork: 'CardFinishArtwork' };
  throw new Error('Unexpected component dependency: ' + name);
} });
function imageProps(rawData: any, extra: Record<string, unknown> = {}) {
  const tree = componentModule.exports.default({ cardId, language: rawData.language ?? rawData.raw_data?.language,
    uri: grid, fullUri: detail, rawData, ...extra });
  const pending = [tree];
  while (pending.length) {
    const node = pending.pop();
    if (node?.type === StackrImage) return node.props;
    if (node?.props?.children) pending.push(...node.props.children.flat().filter(Boolean));
  }
  return null;
}

for (const language of ['ja', 'zh-cn', 'zh-tw', 'ko']) {
  const raw = fixture(language);
  const props = imageProps(raw);
  assert.ok(props, language + ': approved catalogue artwork renders');
  assert.deepEqual(Array.from(props.fallbackUris ?? []), [grid, detail, original],
    language + ': the actual component must preserve the approved original after failed renditions');
  const candidates = stackrImageCandidates([props.fullUri, props.uri, props.thumbnailUri, ...props.fallbackUris]
    .filter(Boolean).map((uri: string) => ({ uri })));
  const failed = candidates.filter((candidate) => candidate.uri !== original).map((candidate) => candidate.key);
  assert.equal(nextStackrImageCandidate(candidates, failed)?.uri, original,
    language + ': after thumbnail/detail failure the same image candidate engine reaches the native original');
  assert.deepEqual(getApprovedArtworkFallbackUris({ cardId, language, rawData: { id: cardId, language, raw_data: raw } }),
    [grid, detail, original], 'whole-card snapshots retain the same exact scope');
  const front = fixture(language, true);
  assert.deepEqual(Array.from(imageProps(front).fallbackUris), [grid, detail, original],
    language + ': approved same-printing fronts use the shared resolver rules too');
  front.stackr.variants[0].variantCode = 'first_edition';
  assert.deepEqual(getApprovedArtworkFallbackUris({ cardId, language, rawData: front }), [],
    language + ': a printing front cannot stand in for a special edition');
}
assert.ok(imageProps(fixture(), { uri: undefined, fullUri: undefined }), 'approved exact candidates can recover a snapshot without primary URL props');
const nested = fixture();
assert.deepEqual(Array.from(imageProps({ raw_data: nested }, { language: undefined }).fallbackUris), [grid, detail, original],
  'nested language uses the foreign identity predicate and cache namespace');
const mismatchedNested = { ...fixture(), language: 'en' };
assert.deepEqual(Array.from(imageProps({ raw_data: mismatchedNested }, { language: 'ja' }).fallbackUris), [],
  'a nested snapshot cannot borrow the outer language');
const japaneseWithEnglishProp = fixture();
japaneseWithEnglishProp.presentation.artwork.candidates.push({
  uri: 'https://unrelated.example/card.jpg', kind: 'shared', assetId: 'other-asset', sourceVariantId: 'other-variant',
});
const conflicted = imageProps(japaneseWithEnglishProp, { language: 'en' });
assert.deepEqual(Array.from(conflicted.fallbackUris), [], 'an English prop cannot bypass the Japanese record identity');
assert.ok(conflicted.cacheKey.startsWith('ja:'), 'the canonical recorded language scopes the image cache');
assert.deepEqual(Array.from(imageProps(fixture('en')).fallbackUris), [grid, detail, original], 'English recovery is unchanged');
assert.deepEqual(getApprovedArtworkFallbackUris({ cardId, language: 'jp', rawData: fixture() }), [grid, detail, original]);

function rejected(label: string, change: (raw: ReturnType<typeof fixture>) => void) {
  const raw = fixture();
  change(raw);
  assert.deepEqual(getApprovedArtworkFallbackUris({ cardId, language: 'ja', rawData: raw }), [], label);
}
rejected('another printing cannot lend an image', (raw) => { raw.stackr.cardId = setId; });
rejected('another raw card cannot lend its snapshot', (raw) => { raw.id = setId; });
rejected('another set cannot lend an image', (raw) => { raw.set.id = variantId; });
rejected('another language cannot lend an image', (raw) => { raw.language = 'en'; });
rejected('unresolved legacy snapshots cannot lend candidates', (raw) => { raw.stackr.canonical = false; });
rejected('another selected finish cannot lend candidates', (raw) => { raw.presentation.artwork.selectedVariantId = setId; });
rejected('ambiguous variant snapshots cannot lend candidates', (raw) => { raw.stackr.variants.push(raw.stackr.variants[0]); });
rejected('unapproved images cannot become fallback artwork', (raw) => { raw.stackr.variants[0].image.permissionStatus = 'pending'; });
rejected('unavailable images cannot become fallback artwork', (raw) => { raw.stackr.variants[0].image.unavailableReason = 'source_missing'; });
rejected('another asset cannot lend its candidate', (raw) => { raw.presentation.artwork.candidates.forEach((candidate) => { candidate.assetId = 'unrelated'; }); });
rejected('shared presentation is not exact-variant evidence', (raw) => { raw.presentation.artwork.candidates.forEach((candidate) => { candidate.kind = 'shared'; }); });
rejected('unsupplied URLs cannot become artwork', (raw) => { raw.presentation.artwork.candidates.forEach((candidate) => { candidate.uri = 'https://unrelated.example/card.jpg'; }); });
rejected('another image variant cannot lend artwork', (raw) => { raw.stackr.variants[0].image.variantId = setId; });
rejected('another image printing cannot lend artwork', (raw) => { raw.stackr.variants[0].image.cardId = setId; });
rejected('another game cannot lend artwork', (raw) => { raw.stackr.variants[0].image.game = 'other'; });
const malformed = fixture();
malformed.stackr.variants.unshift(null);
malformed.stackr.variants[1].image.derivatives.unshift(null);
malformed.presentation.artwork.candidates.unshift(null as any);
assert.deepEqual(getApprovedArtworkFallbackUris({ cardId, language: 'ja', rawData: malformed }), [grid, detail, original],
  'malformed optional entries neither crash rendering nor become candidates');

const edition = { ...fixture(), variants: [{ edition: 'first edition', image: 'https://approved.example/specific-edition.jpg' }] };
const exactEditionProps = imageProps(edition, { editionHint: '1st_edition' });
assert.equal(exactEditionProps.uri, 'https://approved.example/specific-edition.jpg');
assert.equal(exactEditionProps.fallbackUris, undefined, 'explicit edition artwork keeps its isolated candidate chain');
console.log('Foreign artwork recovery passed: actual JA/SC/TC/KO component failure chains, exact snapshot identity, approved originals and edition isolation.');
