import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ts from 'typescript';
import * as contract from '../lib/cardInspection';
import { stackrCardImageSizes } from '../lib/stackrSizing';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const hostNode = (name: string) => name as React.ElementType;
function load(file: string, dependencies: Record<string, unknown>) {
  const module = { exports: {} as any };
  const compiled = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  vm.runInNewContext(compiled, { module, exports: module.exports, require: (name: string) => {
    if (name === 'react') return React;
    if (name in dependencies) return dependencies[name];
    throw new Error(`Unexpected runtime dependency: ${name}`);
  } });
  return module.exports;
}

async function main() {
  let dimensions = { width: 375, height: 812, fontScale: 1, scale: 1 };
  const native = { View: 'View', Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView',
    Platform: { OS: 'web' }, StyleSheet: { create: (value: unknown) => value, absoluteFill: {} },
    useWindowDimensions: () => dimensions };
  const stage = load('components/CardInspectionStage.tsx', {
    'react-native': native,
    'react-native-svg': { __esModule: true, default: 'Svg', Defs: 'Defs', Ellipse: 'Ellipse', RadialGradient: 'RadialGradient', Rect: 'Rect', Stop: 'Stop' },
  });
  let verified = false;
  let profile = 'plain';
  let selectedArtwork: string | null = null;
  const viewer = load('components/CardInspectionViewer.tsx', {
    'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
    'expo-router': { useRouter: () => ({ push: () => {} }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    'expo-linear-gradient': { LinearGradient: 'Gradient' }, 'expo-status-bar': { StatusBar: 'StatusBar' },
    '../lib/cardInspection': contract,
    '../lib/cardHoloProfile': { resolveCardHoloProfile: () => ({ profile, identity: { finishCode: 'reverse_holo' } }) },
    '../lib/cardHoloMaskRegistry': { VERIFIED_CARD_HOLO_MASKS: [] },
    '../lib/cardPrintingMaterial': { resolvePrintingMaterial: (_: unknown, uri: string | null) => { selectedArtwork = uri; return verified ? { fixture: true } : null; } },
    '../lib/cardPrintingMaterialRegistry': { REVIEWED_PRINTING_MATERIALS: [] },
    '../lib/stackrSizing': { stackrCardImageSizes }, '../lib/haptics': { stackrHaptics: { selection: () => {} } },
    './InteractiveCardPreview': { InteractiveCardPreview: 'Preview' }, './CardInspectionStage': stage,
    './StackrImage': { StackrImage: 'Artwork' }, './Text': { Text: 'Text' },
    './CardFoilSurface': { __esModule: true, default: 'Material' },
  });
  const request: contract.CardInspectionRequest = {
    source: 'catalogue', card: { id: 'exact-card', name: 'Example card' },
    imageUri: 'https://example.invalid/thumbnail.png', fullImageUri: 'https://example.invalid/full.png',
  };
  let root!: ReactTestRenderer;
  const mount = async () => { await act(async () => { root = create(React.createElement(viewer.default, { request, onClose: () => {} })); }); };
  const texts = () => root.root.findAllByType(hostNode('Text')).map(node => node.children.join('')).join('\n');
  let checks = 0;
  await mount();
  for (const [width, height] of [[320, 568], [375, 812], [1024, 768], [812, 375], [1280, 800]]) {
    for (const fontScale of [1, 1.5, 2]) {
      dimensions = { width, height, fontScale, scale: 1 };
      await act(async () => { root.update(React.createElement(viewer.default, { request, onClose: () => {} })); });
      const stageNode = root.root.findByType(stage.CardInspectionStage);
      const frame = stageNode.findByType(hostNode('Preview')).parent!;
      const cardWidth = frame.props.style.width;
      const cardHeight = frame.props.style.height;
      assert.equal(stageNode.props.style.width, cardWidth + 48, 'the card fit reserves both horizontal stage insets');
      assert.ok(stageNode.props.style.width <= (width > height * 1.2 ? width * 0.48 - 32 : width - 32), 'the stage stays inside its viewport column');
      const available = height - (width > height * 1.2 ? 88 : Math.min(360, 292 * fontScale));
      assert.ok(cardHeight + 60 + 16 <= available + 0.01, 'vertical fitting includes stage padding and outer spacing');
      checks += 3;
    }
  }
  assert.match(texts(), /Catalogue artwork · non-foil card/); checks++;
  assert.equal(root.root.findAllByType(hostNode('Pressable')).find(node => node.props.accessibilityLabel === 'Simulated lighting')!.props.disabled, true); checks++;
  await act(async () => { root.unmount(); });

  verified = true; profile = 'reverse';
  await mount();
  assert.match(texts(), /Simulated lighting for this card version · reverse holo/); checks++;
  await act(async () => {
    root.root.findByType(hostNode('Preview')).props.onMotionPreference(false);
    root.root.findAllByType(hostNode('Artwork'))[0].props.onLoad();
  });
  assert.match(texts(), /Lighting on/); checks++;
  assert.equal(root.root.findByType(hostNode('Preview')).props.foilHaptics, true); checks++;
  assert.equal(root.root.findAllByType(hostNode('Artwork'))[0].props.fullUri, request.fullImageUri); checks++;
  await act(async () => { root.root.findAllByType(hostNode('Artwork'))[1].props.onLoad(); });
  assert.equal(selectedArtwork, request.fullImageUri, 'material identity follows the loaded full-resolution artwork'); checks++;
  await act(async () => { root.root.findByType(hostNode('Preview')).props.onMotionPreference(true); });
  assert.equal(root.root.findByType(hostNode('Preview')).props.motionPaused, false, 'the underlying preview retains responsibility for Reduce Motion');
  assert.equal(root.root.findAllByType(hostNode('Pressable')).find(node => node.props.accessibilityLabel === 'Simulated lighting')!.props.disabled, true); checks++;
  assert.match(texts(), /Lighting off/); checks++;
  await act(async () => { root.root.findByType(hostNode('Preview')).props.onMotionPreference(false); });
  const material = root.root.findByType(hostNode('Preview')).props.renderMaterial({});
  await act(async () => { material.props.onUnavailable(); });
  assert.match(texts(), /Lighting preview unavailable. Showing catalogue artwork./); checks++;
  assert.equal(root.root.findByType(hostNode('Preview')).props.foilHaptics, false); checks++;
  await act(async () => { root.unmount(); });
  verified = false; profile = 'reverse';
  await mount();
  assert.match(texts(), /Catalogue artwork · lighting preview unavailable/); checks++;
  await act(async () => { root.root.findAllByType(hostNode('Artwork'))[0].props.onError(); });
  assert.equal(root.root.findByType(hostNode('Preview')).props.motionPaused, true, 'failed artwork keeps motion suspended'); checks++;
  await act(async () => { root.unmount(); });
  console.log(`Card inspection stage: ${checks} checks passed for viewport fit, truthful states, full artwork and motion eligibility (mocked native/material boundaries).`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
