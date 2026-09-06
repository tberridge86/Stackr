import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  getValueTrackerChartWidth,
  VALUE_TRACKER_CHART_HEIGHT,
} from '../lib/valueTrackerChartLayout';

assert.equal(VALUE_TRACKER_CHART_HEIGHT, 96, 'phone charts should remain readable without becoming oversized');
assert.equal(getValueTrackerChartWidth(343, 375), 323, 'measured card width should drive the SVG width');
assert.equal(getValueTrackerChartWidth(0, 375), 307, 'first render should use a safe phone-width fallback');
assert.equal(getValueTrackerChartWidth(0, 320), 252, 'compact phones should still receive a usable full-width chart');
assert.equal(getValueTrackerChartWidth(-1, 20), 1, 'invalid measurements must never produce an invalid SVG size');

const cardSource = readFileSync(resolve(import.meta.dirname, '../components/ValueTrackerCard.tsx'), 'utf8');
assert.match(cardSource, /valueMovement:\s*\{[\s\S]*?maxWidth: '100%',[\s\S]*?minWidth: 0,/,
  'narrow phones must constrain the movement row to its badge');
assert.match(cardSource, /valueMovementStack:\s*\{[\s\S]*?minWidth: 88,[\s\S]*?flexShrink: 1,/,
  'long movement labels must shrink before they can overflow a narrow phone');
assert.match(cardSource, /vaultTouchable:\s*\{[\s\S]*?width: '100%',[\s\S]*?minWidth: 0,/,
  'the tracker card must not expand beyond a narrow parent');
assert.match(cardSource, /vaultTopCopyCompact:\s*\{\s*flexBasis: '100%',/,
  'compact headers must reserve a full line for collection coverage text');

console.log('value tracker chart layout checks passed');
