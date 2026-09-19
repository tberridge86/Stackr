import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadHomeRequest() {
  const source = readFileSync('features/home/HubScreen.tsx', 'utf8');
  const start = source.indexOf('export const getHomeCatalogueInspectionRequest =');
  const end = source.indexOf('\n};', start) + 3;
  assert.ok(start >= 0 && end > start, 'Home must expose a canonical artwork request builder');
  const compiled = ts.transpileModule(source.slice(start, end), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} as any };
  vm.runInNewContext(compiled, { module, exports: module.exports });
  return module.exports.getHomeCatalogueInspectionRequest as (value: any) => any;
}

function loadHoldThreshold() {
  const source = readFileSync('lib/cardInspection.ts', 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} as any };
  vm.runInNewContext(compiled, { module, exports: module.exports });
  return module.exports.CARD_INSPECTION_LONG_PRESS_MS as number;
}

function jsxElements(file: string, name: string) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: (ts.JsxOpeningElement | ts.JsxSelfClosingElement)[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(source) === name) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function attribute(element: ts.JsxOpeningElement | ts.JsxSelfClosingElement, name: string) {
  return element.attributes.properties.find((property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText() === name);
}

function executeHandler(element: ts.JsxOpeningElement | ts.JsxSelfClosingElement, name: string, scope: Record<string, unknown>) {
  const value = attribute(element, name);
  assert.ok(value?.initializer && ts.isJsxExpression(value.initializer) && value.initializer.expression, `${name} must be executable`);
  const compiled = ts.transpileModule(`module.exports.handler = (${value.initializer.expression.getText()});`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} as any };
  vm.runInNewContext(compiled, { module, exports: module.exports, ...scope });
  return module.exports.handler as (...args: any[]) => void;
}

const buildRequest = loadHomeRequest();
assert.equal(loadHoldThreshold(), 400, 'Home uses the shared 400ms inspection threshold');
const raw = {
  stackr: { cardId: 'canonical-card' },
  images: { small: 'https://catalogue.example/small.jpg', large: 'https://catalogue.example/large.jpg' },
};
const trusted = buildRequest({ name: 'Pikachu', language: 'en', rawData: raw, imageUrl: raw.images.small, selectedVariantId: 'owned-foil' });
assert.equal(trusted?.card.id, 'canonical-card');
assert.equal(trusted?.imageUri, raw.images.small);
assert.equal(trusted?.fullImageUri, raw.images.large);
assert.equal(trusted?.selectedVariantId, 'owned-foil', 'Home preserves an owned canonical variant when one is supplied');
assert.equal(buildRequest({ rawData: raw, imageUrl: 'https://saved.example/capture.jpg' }), null, 'saved/captured artwork never becomes inspectable');
assert.equal(buildRequest({ rawData: { images: raw.images }, imageUrl: raw.images.small }), null, 'raw artwork without canonical Stackr identity is rejected');
assert.equal(buildRequest({ rawData: raw, imageUrl: 'https://listing.example/official.jpg' }), null, 'an opaque listing fallback cannot be masked by canonical raw art');

const homeCards = jsxElements('components/HomeCommandCenter.tsx', 'TouchableOpacity')
  .filter((element) => attribute(element, 'onLongPress') && attribute(element, 'accessibilityActions'));
const collectionCards = jsxElements('components/HomeCollectorSections.tsx', 'TouchableOpacity')
  .filter((element) => attribute(element, 'onLongPress') && attribute(element, 'accessibilityActions'));
assert.ok(homeCards.length >= 1, 'the Home card rail supports the accessible inspection action');
assert.ok(collectionCards.length >= 1, 'Home collection tiles support the accessible inspection action');
for (const card of [...homeCards, ...collectionCards]) assert.ok(attribute(card, 'delayLongPress'), 'all Home inspection controls use the shared hold threshold');

const inspected: any[] = [];
const opened: any[] = [];
const item = { inspectionRequest: trusted };
const rail = homeCards[0];
executeHandler(rail, 'onLongPress', { item, inspectionRequest: trusted, inspectCard: (value: any) => inspected.push(value), onItemPress: (value: any) => opened.push(value) })();
assert.equal(inspected.length, 1, 'a trusted Home long press opens inspection');
executeHandler(rail, 'onAccessibilityAction', { item, inspectionRequest: trusted, inspectCard: (value: any) => inspected.push(value), onItemPress: (value: any) => opened.push(value) })({ nativeEvent: { actionName: 'inspect' } });
assert.equal(inspected.length, 2, 'the Home accessibility action opens the same trusted request');
executeHandler(rail, 'onPress', { item, inspectCard: (value: any) => inspected.push(value), onItemPress: (value: any) => opened.push(value) })();
assert.deepEqual(opened, [item], 'a normal Home tap keeps its existing detail callback');
assert.equal(attribute(rail, 'onLongPress')?.initializer?.getText().includes('inspectionRequest ?'), true, 'unknown Home artwork retains no inspection long-press handler');

console.log('Home inspection accepts only exact canonical raw artwork and preserves normal Home card taps.');
