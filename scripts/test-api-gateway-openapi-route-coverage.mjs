import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROUTES, matchRoute } from '../gateway/src/routes.js';

const source = readFileSync('docs/stackr-api/openapi.v1.yaml', 'utf8');
const operations = [];
let currentPath = null;

for (const line of source.split(/\r?\n/)) {
  const pathMatch = line.match(/^  (\/[^:]+):\s*$/);
  if (pathMatch) {
    currentPath = pathMatch[1];
    continue;
  }
  const methodMatch = line.match(/^    (get|post|put|patch|delete):\s*$/i);
  if (currentPath && methodMatch) operations.push({ path: currentPath, method: methodMatch[1].toUpperCase() });
}

const replacements = {
  setId: '11111111-1111-4111-8111-111111111111',
  cardId: '22222222-2222-4222-8222-222222222222',
  variantId: '33333333-3333-4333-8333-333333333333',
  itemId: '44444444-4444-4444-8444-444444444444',
  command: 'run-source',
};

function samplePath(contractPath) {
  return `/v1${contractPath.replace(/\{([^}]+)\}/g, (_match, name) => {
    assert.ok(replacements[name], `No route-coverage sample exists for OpenAPI parameter {${name}}.`);
    return replacements[name];
  })}`;
}

assert.ok(operations.length > 0, 'No OpenAPI operations were discovered.');

const matchedRouteIds = new Set();
for (const operation of operations) {
  const pathname = samplePath(operation.path);
  const route = matchRoute(pathname);
  assert.ok(route, `${operation.method} ${operation.path} has no gateway route.`);
  assert.ok(
    route.methods.includes(operation.method),
    `${operation.method} ${operation.path} resolves to ${route.id}, which allows ${route.methods.join(', ')}.`,
  );
  matchedRouteIds.add(route.id);
}

const undocumented = ROUTES.filter((route) => !matchedRouteIds.has(route.id));
assert.deepEqual(
  undocumented.map((route) => route.id),
  [],
  'Gateway routes must be represented in the OpenAPI contract.',
);

assert.equal(
  matchedRouteIds.size,
  operations.length,
  'Each OpenAPI operation must resolve to a distinct gateway route.',
);

console.log(`OpenAPI route coverage passed: ${operations.length}/${operations.length} operations.`);
