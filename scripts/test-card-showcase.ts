import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ts from 'typescript';
import * as inspection from '../lib/cardInspection';
import * as profiles from '../lib/cardHoloProfile';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let reduced = false;
let preview: any;
let selections = 0;
const routes: unknown[] = [];
const closed: (((() => void) | undefined))[] = [];
const dependencies: Record<string, unknown> = {
  react: React,
  'react-native': {
    Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView', View: 'View', Platform: { OS: 'ios' },
    StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {} },
    useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }),
  },
  '@expo/vector-icons': { Ionicons: 'Icon' },
  'expo-router': { useRouter: () => ({ push: (route: unknown) => routes.push(route) }) },
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 47, bottom: 34 }) },
  'expo-linear-gradient': { LinearGradient: 'Gradient' },
  'expo-status-bar': { StatusBar: 'StatusBar' },
  '../lib/cardInspection': inspection,
  '../lib/cardHoloProfile': profiles,
  '../lib/cardHoloMaskRegistry': { VERIFIED_CARD_HOLO_MASKS: [] },
  '../lib/stackrSizing': { stackrCardImageSizes: { cardAspectRatio: 630 / 880 } },
  '../lib/haptics': { stackrHaptics: { selection: () => { selections++; } } },
  './StackrImage': { StackrImage: 'Image' },
  './Text': { Text: 'Text' },
  './InteractiveCardPreview': { InteractiveCardPreview: (props: any) => {
    preview = props;
    const { onMotionPreference } = props;
    const reducedForRender = reduced;
    React.useEffect(() => onMotionPreference(reducedForRender), [onMotionPreference, reducedForRender]);
    return React.createElement('Preview', {}, props.children);
  } },
};
const module = { exports: {} as any };
const compiled = ts.transpileModule(readFileSync('components/CardInspectionViewer.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;
vm.runInNewContext(compiled, { module, exports: module.exports, require: (name: string) => {
  assert.ok(name in dependencies, `unexpected dependency ${name}`); return dependencies[name];
} });
const Viewer = module.exports.default;
const raw = { language: 'ja', stackr: { canonical: true, cardId: 'printing-ja', defaultVariantId: 'foil-ja',
  variants: [{ variantId: 'foil-ja', variantCode: 'holo', finishCode: 'holo' }] } };
const request: inspection.CardInspectionRequest = { source: 'catalogue',
  card: { id: 'printing-ja', name: 'Study', language: 'ja', setId: 'set-ja', raw_data: raw },
  selectedVariantId: 'foil-ja', imageUri: 'https://example.invalid/card.webp', onDetails: () => {}, onQuickActions: () => {},
};

async function main() {
  let root!: ReactTestRenderer; let cases = 0;
  const render = (value = request) => React.createElement(Viewer, { request: value, onClose: (callback?: () => void) => closed.push(callback) });
  const control = (label: string) => root.root.findAllByType('Pressable' as React.ElementType).find(button => button.props.accessibilityLabel === label)!;
  const click = async (label: string) => { await act(async () => control(label).props.onPress()); };
  await act(async () => { root = create(render()); });
  assert.equal(preview.motionPaused, true, 'no sensor work before the card image loads');
  assert.equal(preview.foilHaptics, false); cases++;
  await act(async () => root.root.findByType('Image' as React.ElementType).props.onLoad());
  assert.equal(preview.motionPaused, false); assert.equal(preview.foilHaptics, true); cases++;
  assert.equal(control('Simulated lighting').props.accessibilityState.checked, true); cases++;
  await click('Simulated lighting');
  assert.equal(preview.foilHaptics, false, 'turning off simulated light silences foil cues');
  assert.equal(preview.renderMaterial({}), null, 'light off leaves original artwork only'); cases++;
  await click('Simulated lighting');
  await click('Card motion');
  assert.equal(preview.motionPaused, true);
  assert.equal(control('Recenter card and light').props.disabled, true);
  assert.equal(control('Simulated lighting').props.disabled, true); cases++;
  await click('Card motion');
  await click('Recenter card and light');
  assert.equal(preview.resetKey, 1); assert.equal(selections, 5); cases++;
  await act(async () => root.root.findByType('Image' as React.ElementType).props.onError());
  assert.equal(preview.motionPaused, true); assert.equal(preview.foilHaptics, false); cases++;
  await act(async () => root.root.findByType('Image' as React.ElementType).props.onLoad());
  reduced = true;
  await act(async () => root.update(render()));
  assert.equal(control('Card motion').props.disabled, true);
  assert.equal(control('Card motion').props.accessibilityState.checked, false);
  assert.equal(control('Simulated lighting').props.disabled, true); cases++;
  const details = root.root.findAllByType('Pressable' as React.ElementType).find(button => button.findAllByType('Text' as React.ElementType).some(text => text.props.children === 'Card details'))!;
  await act(async () => details.props.onPress());
  assert.equal(closed.at(-1), request.onDetails, 'navigation remains deferred until viewer dismissal'); cases++;
  await click('Card quick actions'); assert.equal(closed.at(-1), request.onQuickActions); cases++;
  await click('Report a card issue');
  closed.at(-1)?.();
  const params = (routes[0] as any).params;
  assert.equal(params.cardId, 'printing-ja'); assert.equal(params.language, 'ja'); assert.equal(params.variantId, 'foil-ja'); cases++;
  await act(async () => root.update(render({ ...request, selectedVariantId: 'stale-variant' })));
  assert.equal(preview.foilHaptics, false, 'a stale variant selection cannot gain a foil cue'); cases++;
  await act(async () => root.update(render({ ...request, source: 'condition-photo' })));
  assert.equal(root.toJSON(), null, 'owned-condition photos cannot enter the decorative viewer'); cases++;
  await act(async () => root.unmount());
  console.log(`Card showcase: ${cases} behavior cases passed (mocked native boundaries).`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
