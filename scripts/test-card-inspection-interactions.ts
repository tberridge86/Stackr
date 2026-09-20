import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadInspectionContract() {
  const source = readFileSync('lib/cardInspection.ts', 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} as any };
  vm.runInNewContext(compiled, { module, exports: module.exports });
  return module.exports as {
    CARD_INSPECTION_LONG_PRESS_MS: number;
    canInspectCatalogueCard: (value: unknown) => boolean;
  };
}

function loadBinderCataloguePresentation() {
  const source = readFileSync('lib/binderCataloguePresentation.ts', 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} as any };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require: () => ({ enforceTcgdexRuntimeImagePolicy: (value: unknown) => typeof value === 'string' && value.startsWith('https://') ? value : null }),
  });
  return module.exports as { getBinderCatalogueInspectionImages: (value: unknown) => { imageUri: string; fullImageUri: string } | null };
}

function jsxElements(file: string, name: string) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: (ts.JsxOpeningElement | ts.JsxSelfClosingElement)[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(source) === name) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { source, found };
}

function hasAttribute(element: ts.JsxOpeningElement | ts.JsxSelfClosingElement, name: string) {
  return element.attributes.properties.some((property) => ts.isJsxAttribute(property) && property.name.getText() === name);
}

function runAttribute(element: ts.JsxOpeningElement | ts.JsxSelfClosingElement, name: string, scope: Record<string, unknown>) {
  const attribute = element.attributes.properties.find((property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText() === name);
  assert.ok(attribute?.initializer && ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression, `${name} handler must be executable`);
  const compiled = ts.transpileModule(`module.exports.value = (${attribute.initializer.expression.getText()});`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} as any };
  vm.runInNewContext(compiled, { module, exports: module.exports, ...scope });
  return module.exports.value;
}

function loadLocalFunction(file: string, name: string) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let declaration: ts.FunctionDeclaration | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) declaration = node;
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(declaration, `${name} must be declared in ${file}`);
  const compiled = ts.transpileModule(`${declaration.getText(source)}; module.exports.value = ${name};`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} as any };
  vm.runInNewContext(compiled, { module, exports: module.exports });
  return module.exports.value as (...args: any[]) => any;
}

const contract = loadInspectionContract();
assert.equal(contract.CARD_INSPECTION_LONG_PRESS_MS, 400, 'the shared inspection hold threshold stays at 400ms');
assert.equal(contract.canInspectCatalogueCard({ source: 'catalogue', card: { id: 'card-1' }, imageUri: 'https://image.example/card.png' }), true);
assert.equal(contract.canInspectCatalogueCard({ source: 'condition-photo', card: { id: 'card-1' }, imageUri: 'file://seller-photo.jpg' }), false, 'seller and condition photos must never enter decorative inspection');
assert.equal(contract.canInspectCatalogueCard({ source: 'catalogue', card: { id: '' }, imageUri: 'https://image.example/card.png' }), false);
const binderImages = loadBinderCataloguePresentation();
assert.equal(binderImages.getBinderCatalogueInspectionImages({ image_url: 'https://seller.example/captured.jpg', card: { images: { small: 'https://seller.example/captured.jpg' } } }), null, 'a captured binder fallback is never eligible for holographic inspection');
assert.equal(binderImages.getBinderCatalogueInspectionImages({ image_url: 'https://seller.example/captured.jpg', card: { images: { small: 'https://seller.example/captured.jpg' }, raw_data: { images: {}, stackr: {} } } }), null, 'a presentation image cannot become catalogue art when canonical raw data is absent');
const catalogueImages = binderImages.getBinderCatalogueInspectionImages({ image_url: 'https://seller.example/captured.jpg', card: { images: { small: 'https://seller.example/captured.jpg' }, raw_data: { images: { small: 'https://catalogue.example/card-small.jpg', large: 'https://catalogue.example/card-large.jpg' }, stackr: { canonical: true, cardId: 'canonical-card' } } } });
assert.equal(catalogueImages?.imageUri, 'https://catalogue.example/card-small.jpg');
assert.equal(catalogueImages?.fullImageUri, 'https://catalogue.example/card-large.jpg');

const search = jsxElements('components/search/SearchResults.tsx', 'TouchableOpacity');
const inspectableSearchCards = search.found.filter((element) => hasAttribute(element, 'onLongPress') && hasAttribute(element, 'accessibilityActions'));
assert.ok(inspectableSearchCards.length >= 1, 'search card controls expose both a hold gesture and an Inspect card accessibility action');
const inspected: any[] = [];
const request = { source: 'catalogue', card: { id: 'card-1' }, imageUri: 'https://image.example/card.png' };
const hold = runAttribute(inspectableSearchCards[0], 'onLongPress', { inspectionRequest: request, inspectCard: (value: any) => inspected.push(value) });
hold();
assert.deepEqual(inspected, [request], 'a completed hold opens the supplied catalogue request without changing the normal press callback');
const accessibleInspect = runAttribute(inspectableSearchCards[0], 'onAccessibilityAction', { inspectionRequest: request, inspectCard: (value: any) => inspected.push(value) });
accessibleInspect({ nativeEvent: { actionName: 'inspect' } });
assert.equal(inspected.length, 2, 'the custom accessibility action invokes the same inspection request');
const normalPress = inspectableSearchCards[0].attributes.properties.find((property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText() === 'onPress');
assert.ok(normalPress?.initializer?.getText().includes('onPress()') && !normalPress.initializer.getText().includes('inspectCard'), 'normal search tap remains its existing open-card behavior');

const binder = jsxElements('features/binder/BinderDetailScreen.tsx', 'TouchableOpacity');
const inspectableBinderCards = binder.found.filter((element) => hasAttribute(element, 'onLongPress') && hasAttribute(element, 'accessibilityActions'));
assert.ok(inspectableBinderCards.length >= 2, 'binder grid and showcase controls expose inspection without replacing normal taps');
let afterOptionsClose: (() => void) | undefined;
const showcaseEvents: string[] = [];
const showcaseHold = runAttribute(inspectableBinderCards[0], 'onLongPress', {
  item: { id: 'showcase-card' },
  runAfterBinderOptionsClose: (action: () => void) => { afterOptionsClose = action; },
  inspectBinderCard: () => { showcaseEvents.push('inspect'); return true; },
  handleCardLongPress: () => showcaseEvents.push('actions'),
});
showcaseHold();
assert.equal(showcaseEvents.length, 0, 'showcase inspection waits for the existing options sheet dismissal protocol');
afterOptionsClose?.();
assert.deepEqual(showcaseEvents, ['inspect'], 'inspection opens after the previous native sheet has closed');

const detail = jsxElements('app/card/[id].tsx', 'StackrButton');
assert.ok(detail.found.some((element) => element.attributes.properties.some((property) => ts.isJsxAttribute(property) && property.name.getText() === 'label' && property.initializer?.getText(detail.source).includes('Inspect card'))), 'card details retain a visible Inspect card action');

const providerSource = ts.createSourceFile('components/CardInspectionProvider.tsx', readFileSync('components/CardInspectionProvider.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const providerText = providerSource.getFullText();
assert.ok(providerText.includes('setRequest(null)'), 'closing or leaving a surface dismisses inspection instead of navigating away');
assert.ok(!providerText.includes('router.push') && !providerText.includes('router.replace'), 'inspection itself must not change the current route');
const marketSource = readFileSync('components/market/MarketComponents.tsx', 'utf8');
assert.ok(marketSource.includes('item.imageIsCatalogue === true'), 'Market inspection is gated by explicit catalogue-image provenance');

for (const file of ['app/pokemon/[id].tsx', 'app/binder/add-cards.tsx']) {
  const catalogueImage = loadLocalFunction(file, 'getCatalogueInspectionImage');
  assert.equal(catalogueImage({ raw_data: { stackr: { cardId: 'canonical' }, images: {} } }), null, `${file} keeps its prior detail hold when canonical art is missing`);
  const resolved = catalogueImage({ raw_data: { stackr: { cardId: 'canonical' }, images: { small: 'https://catalogue.example/small.jpg', large: 'https://catalogue.example/large.jpg' } } });
  assert.equal(resolved?.canonicalId, 'canonical');
  assert.equal(resolved?.imageUri, 'https://catalogue.example/small.jpg');
  assert.equal(resolved?.fullImageUri, 'https://catalogue.example/large.jpg');
  const elementName = file.includes('add-cards') ? 'TouchableOpacity' : 'Pressable';
  const presses = jsxElements(file, elementName).found.filter((element) => hasAttribute(element, 'onLongPress') && hasAttribute(element, 'onPress'));
  assert.ok(presses.length >= 1, `${file} has a single control that retains tap and hold behavior`);
  assert.ok(hasAttribute(presses[0], 'delayLongPress'), `${file} uses the shared inspection hold threshold`);
  const tap = presses[0].attributes.properties.find((property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText() === 'onPress');
  assert.ok(tap?.initializer?.getText().includes(file.includes('add-cards') ? 'toggleCard' : 'toggleCardOwned') && !tap.initializer.getText().includes('inspectCard'), `${file} preserves normal ownership/selection taps`);
}

const getCatalogueImage = loadLocalFunction('features/market/MarketTabScreen.tsx', 'getCatalogueImage');
assert.equal(getCatalogueImage({ official_image_url: 'https://listing.example/official.jpg' }, null), 'https://listing.example/official.jpg', 'normal Market display retains listing official artwork');
const getDecorativeCatalogueInspectionCard = loadLocalFunction('features/market/MarketTabScreen.tsx', 'getDecorativeCatalogueInspectionCard');
const marketCard = { name: 'Card', language: 'en', rawData: { stackr: { cardId: 'canonical', defaultVariantId: 'variant' }, images: { small: 'https://catalogue.example/small.jpg', large: 'https://catalogue.example/large.jpg' } } };
assert.equal(getDecorativeCatalogueInspectionCard(marketCard, { uri: 'https://listing.example/official.jpg', isCatalogue: true }, { uri: 'https://catalogue.example/large.jpg', isCatalogue: true }), undefined, 'an official listing image cannot be decorated when it does not exactly match canonical raw art');
assert.equal(getDecorativeCatalogueInspectionCard(marketCard, { uri: 'https://catalogue.example/small.jpg', isCatalogue: false }, { uri: 'https://catalogue.example/large.jpg', isCatalogue: false }), undefined, 'seller lead images block inspection even when catalogue URLs are available');
assert.equal(getDecorativeCatalogueInspectionCard(marketCard, { uri: 'https://catalogue.example/small.jpg', isCatalogue: true }, { uri: 'https://catalogue.example/large.jpg', isCatalogue: true })?.id, 'canonical');
assert.equal(getDecorativeCatalogueInspectionCard(marketCard, { uri: 'https://catalogue.example/small.jpg', isCatalogue: true }, { uri: 'https://seller.example/condition.jpg', isCatalogue: true }), undefined, 'a canonical thumbnail cannot authorize an untrusted high-resolution image');
assert.equal(getDecorativeCatalogueInspectionCard(marketCard, { uri: 'https://catalogue.example/large.jpg', isCatalogue: true }, { uri: 'https://catalogue.example/large.jpg', isCatalogue: true })?.id, 'canonical', 'an already displayed canonical large image does not need to be replaced by a thumbnail');

console.log('Card inspection uses the shared 400ms threshold, preserves normal navigation, and exposes accessible inspection actions.');
