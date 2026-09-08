'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const config = require('../../metro.config.js');

const rules = [config.resolver.blockList].flat().filter(Boolean);
const projectRoot = path.resolve(__dirname, '..', '..');
const blocked = (value) => rules.some((rule) => rule.test(value));

for (const directory of ['.git', '.worktrees', '.tmp', 'catalogue', 'data', 'backend', 'outputs', 'reports']) {
  for (const suffix of ['', '/nested/file.json']) {
    const absolute = path.resolve(projectRoot, `${directory}${suffix}`);
    // Metro's crawler checks native paths; its Windows watcher checks POSIX
    // paths. Both must reject the directory before walking its descendants.
    assert(blocked(absolute), `Native path must be excluded: ${absolute}`);
    assert(blocked(absolute.replaceAll('\\', '/')), `Normalized path must be excluded: ${absolute}`);
  }
}

for (const relative of [
  'app/index.tsx',
  'components/Card.tsx',
  'assets/icon.png',
  'node_modules/react/index.js',
  '.tmpx/file.js',
  'catalogue-helper.ts',
  'data-source/index.ts',
]) {
  const absolute = path.resolve(projectRoot, relative);
  assert(!blocked(absolute), `App paths and lookalike siblings must remain visible: ${absolute}`);
  assert(!blocked(absolute.replaceAll('\\', '/')), `Normalized app paths must remain visible: ${absolute}`);
}

console.log('PASS Metro native/normalized exclusions, early directory pruning, and app-path retention');

