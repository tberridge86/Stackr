import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const moduleRoot = path.join(root, 'modules', 'stackr-card-vision');

const packageJson = JSON.parse(fs.readFileSync(path.join(moduleRoot, 'package.json'), 'utf8'));
assert.equal(packageJson.name, 'stackr-card-vision');
assert.equal(packageJson.version, '0.1.0');

const expoModuleConfig = JSON.parse(fs.readFileSync(path.join(moduleRoot, 'expo-module.config.json'), 'utf8'));
assert.deepEqual(expoModuleConfig.platforms, ['apple', 'android']);
assert.deepEqual(expoModuleConfig.apple.modules, ['StackrCardVisionModule']);
assert.equal(expoModuleConfig.apple.podspecPath, 'ios/StackrCardVision.podspec');
assert.deepEqual(expoModuleConfig.android.modules, ['com.stackr.cardvision.StackrCardVisionModule']);

const androidModule = fs.readFileSync(
  path.join(moduleRoot, 'android', 'src', 'main', 'java', 'com', 'stackr', 'cardvision', 'StackrCardVisionModule.kt'),
  'utf8'
);
assert.match(androidModule, /Name\("StackrCardVision"\)/);
assert.match(androidModule, /Function\("getCardVisionRuntimeInfo"\)/);
assert.match(androidModule, /onnxruntimejsi/);
assert.match(androidModule, /FrameProcessorPlugin/);

const iosModule = fs.readFileSync(
  path.join(moduleRoot, 'ios', 'StackrCardVisionModule.swift'),
  'utf8'
);
assert.match(iosModule, /Name\("StackrCardVision"\)/);
assert.match(iosModule, /Function\("getCardVisionRuntimeInfo"\)/);
assert.match(iosModule, /OnnxruntimeModule/);
assert.match(iosModule, /FrameProcessorPlugin/);

const healthCheckModel = fs.readFileSync(path.join(root, 'assets', 'models', 'stackr-card-vision-healthcheck.onnx'));
assert.ok(healthCheckModel.length > 64);
assert.ok(healthCheckModel.includes(Buffer.from('Identity', 'utf8')));
assert.ok(healthCheckModel.includes(Buffer.from('input', 'utf8')));
assert.ok(healthCheckModel.includes(Buffer.from('output', 'utf8')));

console.log('StackrCardVision native config checks passed');

