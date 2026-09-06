import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Static source contract only: this does not compile Swift or exercise UIKit.
// An iPhone smoke test must still compare each output's decoded pixel dimensions
// with the native result's width/height, especially on a 3x display.
const source = readFileSync(new URL('../modules/stackr-card-vision/ios/StackrCardRectifier.swift', import.meta.url), 'utf8');
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\r\n]*/g, '');
const factory = code.match(/private static func pixelRenderer\(width: Int, height: Int\) -> UIGraphicsImageRenderer\s*\{([\s\S]*?)\n  \}/)?.[1];
assert(factory, 'Missing shared pixel renderer');
assert.match(factory, /let format = UIGraphicsImageRendererFormat\(\)/);
assert.match(factory, /format\.scale = 1\s+return UIGraphicsImageRenderer\(size: CGSize\(width: width, height: height\), format: format\)/);
assert.equal((code.match(/UIGraphicsImageRenderer\(/g) ?? []).length, 1,
  'Every renderer must use the shared explicit pixel-scale factory');
for (const name of ['render', 'resize']) {
  const body = code.match(new RegExp(`private static func ${name}\\([^]*?\\n  \\}`))?.[0];
  assert(body, `Missing ${name} implementation`);
  assert.match(body, /pixelRenderer\(width: width, height: height\)\.image/,
    `${name} must preserve nominal dimensions at one pixel per point`);
}
console.log('Native rectifier scale=1 source contract passed (static; not an iOS runtime test).');
