import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

type NativeCall = {
  kind: 'impact' | 'selection';
  style?: string;
};

function loadHaptics(options: { os?: string; rejectImpact?: boolean } = {}) {
  const calls: NativeCall[] = [];
  let now = 10_000;
  const source = require('node:fs').readFileSync('lib/haptics.ts', 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const haptics = {
    ImpactFeedbackStyle: { Medium: 'medium', Light: 'light', Soft: 'soft', Rigid: 'rigid' },
    NotificationFeedbackType: { Warning: 'warning', Error: 'error', Success: 'success' },
    impactAsync: async (style: string) => {
      calls.push({ kind: 'impact', style });
      if (options.rejectImpact) throw new Error('native feedback unavailable');
    },
    selectionAsync: async () => { calls.push({ kind: 'selection' }); },
    notificationAsync: async () => {},
  };
  const module = { exports: {} as Record<string, unknown> };
  vm.runInNewContext(`(function (require, module, exports) { ${compiled}\n})`, {
    Date: { now: () => now },
  }).call(null, (name: string) => {
    if (name === 'expo-haptics') return haptics;
    if (name === 'react-native') return { Platform: { OS: options.os ?? 'ios' } };
    throw new Error(`Unexpected dependency: ${name}`);
  }, module, module.exports);
  return {
    api: module.exports as {
      stackrHaptics: { cardPreview: () => Promise<void>; selection: () => Promise<void> };
      setStackrHapticsEnabled: (next: boolean) => void;
    },
    calls,
    advance: (milliseconds: number) => { now += milliseconds; },
  };
}

function cardPressHandler(sourceText: string, componentName: string) {
  const source = ts.createSourceFile('SearchResults.tsx', sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let component: ts.FunctionDeclaration | undefined;
  const findComponent = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === componentName) component = node;
    ts.forEachChild(node, findComponent);
  };
  findComponent(source);
  assert.ok(component, `${componentName} must remain an exported component`);

  let handler: ts.ArrowFunction | undefined;
  const findHandler = (node: ts.Node): void => {
    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && node.name.text === 'onPress'
      && node.initializer && ts.isJsxExpression(node.initializer)
      && node.initializer.expression && ts.isArrowFunction(node.initializer.expression)) {
      handler = node.initializer.expression;
    }
    ts.forEachChild(node, findHandler);
  };
  findHandler(component);
  assert.ok(handler, `${componentName} must provide an executable card press handler`);
  return handler.getText(source);
}

function constArrowHandler(sourceText: string, name: string) {
  const source = ts.createSourceFile('BinderDetailScreen.tsx', sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler: ts.ArrowFunction | undefined;
  const findHandler = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name
      && node.initializer && ts.isArrowFunction(node.initializer)) {
      handler = node.initializer;
    }
    ts.forEachChild(node, findHandler);
  };
  findHandler(source);
  assert.ok(handler, `${name} must remain an executable binder card handler`);
  return handler.getText(source);
}

function runExtractedHandler(handlerText: string, stackrHaptics: { cardPreview: () => Promise<void> }, onPress: () => void) {
  const module = { exports: {} as { handler?: () => void } };
  const compiled = ts.transpileModule(`module.exports.handler = ${handlerText};`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(`(function (module, stackrHaptics, onPress) { ${compiled}\n})`, {})
    .call(null, module, stackrHaptics, onPress);
  assert.ok(module.exports.handler, 'extracted handler must be callable');
  return module.exports.handler!;
}

function runExtractedBinderHandler(handlerText: string, bindings: Record<string, unknown>) {
  const module = { exports: {} as { handler?: (item: unknown) => void } };
  const compiled = ts.transpileModule(`module.exports.handler = ${handlerText};`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const names = Object.keys(bindings);
  vm.runInNewContext(`(function (module, ${names.join(', ')}) { ${compiled}\n})`, {})
    .call(null, module, ...names.map((name) => bindings[name]));
  assert.ok(module.exports.handler, 'extracted binder handler must be callable');
  return module.exports.handler!;
}

async function main() {
  const native = loadHaptics();
  await native.api.stackrHaptics.cardPreview();
  assert.deepEqual(native.calls, [{ kind: 'impact', style: 'medium' }], 'a card preview must request a medium native impact');

  native.advance(119);
  await native.api.stackrHaptics.cardPreview();
  assert.equal(native.calls.length, 1, 'repeated card previews inside 120ms must be suppressed');
  native.advance(1);
  await native.api.stackrHaptics.cardPreview();
  assert.equal(native.calls.length, 2, 'card preview must resume at its cooldown boundary');
  await native.api.stackrHaptics.selection();
  assert.equal(native.calls.at(-1)?.kind, 'selection', 'selection feedback must retain an independent cooldown');

  const disabled = loadHaptics();
  disabled.api.setStackrHapticsEnabled(false);
  await disabled.api.stackrHaptics.cardPreview();
  assert.equal(disabled.calls.length, 0, 'disabled feedback must not call the native module');
  const web = loadHaptics({ os: 'web' });
  await web.api.stackrHaptics.cardPreview();
  assert.equal(web.calls.length, 0, 'web feedback must remain a no-op');
  const rejecting = loadHaptics({ rejectImpact: true });
  await assert.doesNotReject(rejecting.api.stackrHaptics.cardPreview(), 'a native haptic failure must be contained');
  assert.equal(rejecting.calls.length, 1, 'the failed native request should still have been attempted once');

  const searchSource = await readFile('components/search/SearchResults.tsx', 'utf8');
  for (const componentName of ['SearchCardRailItem', 'SearchCardResult']) {
    const trace: string[] = [];
    const rejectingForHandler = loadHaptics({ rejectImpact: true });
    const handler = runExtractedHandler(
      cardPressHandler(searchSource, componentName),
      { cardPreview: async () => {
        trace.push('haptic');
        await rejectingForHandler.api.stackrHaptics.cardPreview();
      } },
      () => { trace.push('action'); },
    );
    assert.equal(handler(), undefined, `${componentName} must preserve its ordinary press return value`);
    await Promise.resolve();
    assert.deepEqual(trace, ['haptic', 'action'], `${componentName} must request card feedback before navigating even if native feedback rejects`);
  }

  const binderSource = await readFile('features/binder/BinderDetailScreen.tsx', 'utf8');
  const binderTrace: string[] = [];
  const rejectingBinderHaptics = loadHaptics({ rejectImpact: true });
  const binderHaptics = {
    cardPreview: async () => {
      binderTrace.push('haptic');
      await rejectingBinderHaptics.api.stackrHaptics.cardPreview();
    },
  };
  const openDetail = runExtractedBinderHandler(constArrowHandler(binderSource, 'openCardDetail'), {
    cards: [],
    detailImageRequestRef: { current: 0 },
    getBinderCanonicalVariantId: () => '',
    setDetailFullImageUri: () => { binderTrace.push('clear-image'); },
    setSelectedCard: () => { binderTrace.push('select-card'); },
    setDetailVisible: () => { binderTrace.push('show-detail'); },
    stackrHaptics: binderHaptics,
    fetchModalEbayPrice: () => { binderTrace.push('price'); },
  });
  const fullImageItem = { id: 'row-1', card: { images: { small: 'small', large: 'large' } } };
  assert.doesNotThrow(() => openDetail(fullImageItem), 'binder detail must still open when native feedback rejects');
  await Promise.resolve();
  assert.deepEqual(binderTrace, ['clear-image', 'select-card', 'show-detail', 'haptic', 'price'], 'binder detail must request feedback and continue the original detail flow');

  const quickActionTrace: string[] = [];
  rejectingBinderHaptics.advance(120);
  const quickAction = runExtractedBinderHandler(constArrowHandler(binderSource, 'handleCardLongPress'), {
    stackrHaptics: {
      cardPreview: async () => {
        quickActionTrace.push('haptic');
        await rejectingBinderHaptics.api.stackrHaptics.cardPreview();
      },
    },
    setQuickActionCard: () => { quickActionTrace.push('show-actions'); },
  });
  assert.doesNotThrow(() => quickAction(fullImageItem), 'binder quick actions must still open when native feedback rejects');
  await Promise.resolve();
  assert.deepEqual(quickActionTrace, ['haptic', 'show-actions'], 'binder long-hold must request feedback before opening quick actions');
  assert.equal(rejectingBinderHaptics.calls.length, 2, 'Both binder paths must reach the rejecting native module, rather than pass through cooldown suppression.');

  console.log('Card haptic dispatch, cooldown, containment, search-card press and binder long-hold checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
