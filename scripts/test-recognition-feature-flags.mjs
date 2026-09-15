// Run directly with node, or via the existing recognition-orchestrator test gate.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const sourcePath = fileURLToPath(new URL('../lib/recognition/featureFlags.ts', import.meta.url));
const source = readFileSync(sourcePath, 'utf8');
const productionEnv = JSON.parse(readFileSync(new URL('../eas.json', import.meta.url), 'utf8')).build.production.env;
const envKeys = [
  'EXPO_PUBLIC_LOCAL_RECOGNITION_ENABLED',
  'EXPO_PUBLIC_LOCAL_RECOGNITION_SHADOW_MODE',
  'EXPO_PUBLIC_LEGACY_CLOUD_FALLBACK_ENABLED',
  'EXPO_PUBLIC_SCANNER_DIAGNOSTICS_ENABLED',
  'EXPO_PUBLIC_RECOGNITION_FEEDBACK_ENABLED',
  'EXPO_PUBLIC_STACKR_API_ENABLED',
  'EXPO_PUBLIC_ON_DEVICE_EMBEDDING_ENABLED',
  'EXPO_PUBLIC_STACKR_RECOGNITION_PRIMARY',
  'EXPO_PUBLIC_IMAGE_FALLBACK_ENABLED',
  'EXPO_PUBLIC_XIMILAR_EMERGENCY_FALLBACK',
  'EXPO_PUBLIC_SCAN_FEEDBACK_ENABLED',
];
const defaults = {
  localRecognitionEnabled: false,
  localRecognitionShadowMode: false,
  legacyCloudFallbackEnabled: false,
  scannerDiagnosticsEnabled: false,
  recognitionFeedbackEnabled: true,
  stackrApiEnabled: false,
  onDeviceEmbeddingEnabled: false,
  stackrRecognitionPrimary: false,
  imageFallbackEnabled: false,
  ximilarEmergencyFallback: false,
  scanFeedbackEnabled: true,
};
const productionExpected = { ...defaults, stackrApiEnabled: true, imageFallbackEnabled: true };
const allOn = Object.fromEntries(envKeys.map((key) => [key, 'true']));
const allTrue = Object.fromEntries(Object.keys(defaults).map((key) => [key, true]));
const allFalse = Object.fromEntries(Object.keys(defaults).map((key) => [key, false]));
const snapshot = (value) => JSON.parse(JSON.stringify(value));
let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS recognition flags: ${name}`);
}
function load(code, runtimeEnv) {
  const exports = {};
  // No process object at all for a compiled production module.
  const sandbox = { exports, module: { exports } };
  if (runtimeEnv !== undefined) sandbox.process = { env: runtimeEnv };
  vm.runInNewContext(code, sandbox, { filename: sourcePath, timeout: 5000 });
  return exports;
}
const javascript = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
const api = load(javascript, allOn);
const resolve = (env) => snapshot(api.getRecognitionFeatureFlags(env));

check('all public inputs use direct build-time member accesses', () => {
  const file = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true);
  const seen = new Set();
  function visit(node) {
    if (ts.isPropertyAccessExpression(node) && node.getText(file) === 'process.env') {
      assert.ok(ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node,
        'Do not alias, destructure or dynamically index process.env.');
      seen.add(node.parent.name.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.deepEqual([...seen].sort(), [...envKeys].sort());
});
check('empty injection never inherits enabled ambient flags', () => assert.deepEqual(resolve({}), defaults));
check('normal call and exported snapshot read the default environment', () => {
  assert.deepEqual(snapshot(api.getRecognitionFeatureFlags()), allTrue);
  assert.deepEqual(snapshot(api.defaultRecognitionFeatureFlags), allTrue);
});
check('explicit undefined selects the default reader', () => assert.deepEqual(resolve(undefined), allTrue));
check('current standard production profile resolves exactly', () => assert.deepEqual(resolve(productionEnv), productionExpected));
check('all explicit true and 1 values are accepted', () => {
  assert.deepEqual(resolve(allOn), allTrue);
  assert.deepEqual(resolve(Object.fromEntries(envKeys.map((key) => [key, '1']))), allTrue);
});
check('all explicit false and 0 values stay disabled', () => {
  for (const value of ['false', '0']) {
    assert.deepEqual(resolve(Object.fromEntries(envKeys.map((key) => [key, value]))), allFalse);
  }
});
check('blank and undefined configuration use safe defaults', () => {
  for (const value of ['', undefined]) {
    assert.deepEqual(resolve(Object.fromEntries(envKeys.map((key) => [key, value]))), defaults);
  }
});
check('malformed values do not enable any flag', () => {
  for (const value of ['TRUE', 'yes', ' true ', '2', 'undefined', 'null', ' ']) {
    assert.deepEqual(resolve(Object.fromEntries(envKeys.map((key) => [key, value]))), allFalse);
  }
});
for (const [name, env, expected] of [
  ['missing paid flags', {}, false],
  ['legacy opt-in', { EXPO_PUBLIC_LEGACY_CLOUD_FALLBACK_ENABLED: 'true' }, true],
  ['modern opt-in', { EXPO_PUBLIC_XIMILAR_EMERGENCY_FALLBACK: '1' }, true],
  ['modern off overrides legacy on', { EXPO_PUBLIC_XIMILAR_EMERGENCY_FALLBACK: 'false', EXPO_PUBLIC_LEGACY_CLOUD_FALLBACK_ENABLED: 'true' }, false],
  ['modern on overrides legacy off', { EXPO_PUBLIC_XIMILAR_EMERGENCY_FALLBACK: 'true', EXPO_PUBLIC_LEGACY_CLOUD_FALLBACK_ENABLED: 'false' }, true],
  ['invalid modern value overrides legacy on', { EXPO_PUBLIC_XIMILAR_EMERGENCY_FALLBACK: 'yes', EXPO_PUBLIC_LEGACY_CLOUD_FALLBACK_ENABLED: 'true' }, false],
  ['blank modern value preserves explicit legacy opt-in', { EXPO_PUBLIC_XIMILAR_EMERGENCY_FALLBACK: '', EXPO_PUBLIC_LEGACY_CLOUD_FALLBACK_ENABLED: '1' }, true],
]) {
  check(name, () => {
    assert.equal(resolve(env).ximilarEmergencyFallback, expected);
    assert.equal(resolve(env).legacyCloudFallbackEnabled, expected);
  });
}
check('embedding and feedback alias precedence is preserved', () => {
  const inherited = resolve({ EXPO_PUBLIC_LOCAL_RECOGNITION_ENABLED: 'true', EXPO_PUBLIC_RECOGNITION_FEEDBACK_ENABLED: 'false' });
  assert.equal(inherited.onDeviceEmbeddingEnabled, true);
  assert.equal(inherited.scanFeedbackEnabled, false);
  const overridden = resolve({ EXPO_PUBLIC_LOCAL_RECOGNITION_ENABLED: 'true', EXPO_PUBLIC_ON_DEVICE_EMBEDDING_ENABLED: 'false', EXPO_PUBLIC_RECOGNITION_FEEDBACK_ENABLED: 'false', EXPO_PUBLIC_SCAN_FEEDBACK_ENABLED: 'true' });
  assert.equal(overridden.onDeviceEmbeddingEnabled, false);
  assert.equal(overridden.scanFeedbackEnabled, true);
});
check('injected environments are not mutated', () => assert.deepEqual(resolve(Object.freeze({})), defaults));

if (process.argv.includes('--unit-only')) {
  console.log(`${passed} recognition flag checks passed; Expo production transform NOT RUN (--unit-only).`);
} else {
  // Resolve Expo's actual installed preset; do not simulate its env substitution.
  const expoRequire = createRequire(require.resolve('expo/package.json'));
  const presetPath = expoRequire.resolve('babel-preset-expo');
  const { transformSync } = require('@babel/core');
  const savedKeys = [...envKeys, 'NODE_ENV', 'EXPO_NO_CLIENT_ENV_VARS'];
  const saved = Object.fromEntries(savedKeys.map((key) => [key, process.env[key]]));
  try {
    for (const platform of ['ios', 'android']) {
      for (const [name, buildEnv, expected] of [
        ['production profile', productionEnv, productionExpected],
        ['missing configuration', {}, defaults],
        ['explicit opt-ins', allOn, allTrue],
      ]) {
        check(`${platform} production transform: ${name}`, () => {
          for (const key of envKeys) {
            if (buildEnv[key] === undefined) delete process.env[key];
            else process.env[key] = buildEnv[key];
          }
          process.env.NODE_ENV = 'production';
          delete process.env.EXPO_NO_CLIENT_ENV_VARS;
          const output = transformSync(source, {
            filename: sourcePath,
            configFile: false,
            babelrc: false,
            envName: 'production',
            presets: [presetPath],
            compact: true,
            comments: false,
            caller: { name: 'metro', bundler: 'metro', platform, isDev: false, isServer: false, isNodeModule: false, supportsStaticESM: false },
          });
          assert.ok(output?.code, 'Expo must emit executable JavaScript.');
          assert.doesNotMatch(output.code, /\bprocess\s*\.\s*env\b/, 'Release code must not read process.env at runtime.');
          const compiled = load(output.code);
          assert.deepEqual(snapshot(compiled.getRecognitionFeatureFlags()), expected);
          assert.deepEqual(snapshot(compiled.defaultRecognitionFeatureFlags), expected);
          assert.deepEqual(snapshot(compiled.getRecognitionFeatureFlags({})), defaults);
          assert.deepEqual(snapshot(compiled.getRecognitionFeatureFlags(allOn)), allTrue);
        });
      }
    }
  } finally {
    for (const key of savedKeys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
  console.log(`${passed} recognition flag checks passed, including real Expo production transforms for iOS and Android.`);
}
