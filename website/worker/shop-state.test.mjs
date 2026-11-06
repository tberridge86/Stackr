import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createShopService } from './shop-state.mjs';

const migration = readFileSync(new URL('../drizzle/0000_shop_stock_interest.sql', import.meta.url), 'utf8');
const products = [
  { id: 'black-bundle', name: 'Black Bolt', language: 'English' },
  { id: 'jp-black-box', name: 'Black Bolt', language: 'Japanese' },
  { id: 'ko-black-box', name: 'Black Bolt', language: 'Korean' },
];
const owner = { id: 'site-owner-id', email: 'owner@example.com' };
const alice = { id: 'alice-site-id', email: 'alice@example.com' };
const bob = { id: 'bob-site-id', email: 'bob@example.com' };
const origin = 'https://stackr.test';
function fixture() {
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec(migration);
  let clock = Date.parse('2026-11-01T19:30:00Z'); let calls = 0; let failure = false;
  const DB = {
    prepare(query) {
      calls++; if (failure) throw Error('Database binding failure');
      let bindings = [];
      const statement = {
        bind(...values) { bindings = values; return statement; },
        async all() { return { success: true, results: sqlite.prepare(query).all(...bindings) }; },
        async run() { const result = sqlite.prepare(query).run(...bindings); return { success: true, meta: { changes: Number(result.changes) } }; },
      }; return statement;
    },
  };
  const env = { DB, SHOP_OWNER_EMAIL: owner.email };
  const service = createShopService({ products, inventory: { customerLimit: 3, products: {} }, now: () => clock });
  function request(path, { user, method = 'GET', body, requestOrigin = origin, type = 'application/json', headers = {} } = {}) {
    const h = new Headers(headers);
    if (user) { h.set('oai-authenticated-user-id', user.id); h.set('oai-authenticated-user-email', user.email); }
    if (requestOrigin !== null) h.set('Origin', requestOrigin);
    if (type !== null) h.set('Content-Type', type);
    return new Request(origin + path, { method, headers: h, ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
  }
  const call = (path, options, override = env) => service.handleRequest(request(path, options), override);
  return { sqlite, DB, env, service, request, call, tick: () => { clock += 1000; }, get calls() { return calls; }, fail() { failure = true; } };
}
const interest = (productId = 'black-bundle', quantity = 1) => ({ productId, quantity, consent: true });

test('initial catalogue stock is unknown and GET never invents inventory or private interest', async () => {
  const f = fixture();
  try {
    const r = await f.call('/api/shop'); const body = await r.json();
    assert.equal(r.status, 200); assert.equal(r.headers.get('Cache-Control'), 'private, no-store');
    assert.deepEqual(body.visitor, { signedIn: false, isOwner: false, email: null });
    assert.deepEqual(body.interests, []);
    assert.equal(Object.keys(body.products).length, products.length);
    for (const row of Object.values(body.products)) assert.deepEqual(row, { status: 'unknown', quantity: null, updatedAt: null });
  } finally { f.sqlite.close(); }
});

test('all writes require trusted signed-in identity and admin operations require configured owner', async () => {
  const f = fixture();
  try {
    for (const method of ['POST', 'DELETE']) assert.equal((await f.call('/api/interests', { method, body: interest() })).status, 401);
    assert.equal((await f.call('/api/admin/stock', { method: 'PATCH', body: { productId: 'black-bundle', status: 'in_stock' } })).status, 401);
    assert.equal((await f.call('/api/admin/stock', { user: alice, method: 'PATCH', body: { productId: 'black-bundle', status: 'in_stock' } })).status, 403);
    assert.equal((await f.call('/api/admin/interests', { user: alice })).status, 403);
    assert.equal((await f.call('/api/admin/interests', { user: owner }, { DB: f.DB })).status, 403);
    assert.equal(f.calls, 0);
  } finally { f.sqlite.close(); }
});

test('owner stock declarations survive new service instances and notes remain owner-only', async () => {
  const f = fixture();
  try {
    const saved = await f.call('/api/admin/stock', { user: owner, method: 'PATCH', body: { productId: 'black-bundle', status: 'in_stock', quantity: 12, note: 'Private supplier receipt' } });
    assert.equal(saved.status, 200); assert.equal((await saved.json()).product.quantity, 12);
    const second = createShopService({ products, now: () => Date.parse('2026-11-01T20:00:00Z') });
    const publicRead = await (await second.handleRequest(f.request('/api/shop', { user: alice }), f.env)).json();
    assert.equal(publicRead.products['black-bundle'].status, 'in_stock');
    assert.equal(publicRead.products['black-bundle'].quantity, 12); assert.equal(publicRead.products['black-bundle'].note, undefined);
    const ownRead = await (await f.call('/api/shop', { user: owner })).json(); assert.equal(ownRead.products['black-bundle'].note, 'Private supplier receipt');
    f.tick();
    await f.call('/api/admin/stock', { user: owner, method: 'PATCH', body: { productId: 'black-bundle', status: 'out_of_stock', quantity: null } });
    assert.equal((await (await f.call('/api/shop')).json()).products['black-bundle'].quantity, 0);
    f.tick();
    await f.call('/api/admin/stock', { user: owner, method: 'PATCH', body: { productId: 'black-bundle', status: 'unknown', quantity: null } });
    assert.equal((await (await f.call('/api/shop')).json()).products['black-bundle'].status, 'unknown');
  } finally { f.sqlite.close(); }
});

test('in-stock can be declared without a numeric quantity; incompatible states and quantities reject', async () => {
  const f = fixture();
  try {
    assert.equal((await f.call('/api/admin/stock', { user: owner, method: 'PATCH', body: { productId: 'jp-black-box', status: 'in_stock', quantity: null } })).status, 200);
    const bad = [{ status: 'in_stock', quantity: 0 }, { status: 'unknown', quantity: 1 }, { status: 'out_of_stock', quantity: 4 }, { status: 'in_stock', quantity: 1.5 }, { status: 'in_stock', quantity: -1 }, { status: 'in_stock', quantity: 1000000 }, { status: 'in_stock', quantity: '3' }, { status: 'preorder', quantity: null }];
    for (const body of bad) assert.equal((await f.call('/api/admin/stock', { user: owner, method: 'PATCH', body: { productId: 'black-bundle', ...body } })).status, 400);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM shop_inventory').get().n, 1);
  } finally { f.sqlite.close(); }
});

test('mutations reject cross-origin, absent origin, non-JSON, oversized and forged fields before DB', async () => {
  const f = fixture();
  try {
    const cases = [
      [{ requestOrigin: 'https://evil.test' }, 403], [{ requestOrigin: null }, 403], [{ headers: { 'Sec-Fetch-Site': 'cross-site' } }, 403],
      [{ type: 'application/x-www-form-urlencoded' }, 415], [{ type: null }, 415],
      [{ body: '{' }, 400], [{ body: [] }, 400], [{ body: { ...interest(), email: 'someone-else@example.com' } }, 400],
      [{ body: { ...interest(), isOwner: true } }, 400], [{ body: JSON.stringify({ ...interest(), padding: 'a'.repeat(5000) }) }, 413],
      [{ headers: { 'Content-Length': '99999' } }, 413],
    ];
    for (const [options, expected] of cases) {
      const r = await f.call('/api/interests', { user: alice, method: 'POST', body: interest(), ...options });
      assert.equal(r.status, expected, JSON.stringify(options));
    }
    assert.equal(f.calls, 0);
  } finally { f.sqlite.close(); }
});

test('interest requires explicit consent, exact current product identity and quantity 1–3', async () => {
  const f = fixture();
  try {
    const invalid = [{ ...interest(), consent: false }, { ...interest(), consent: 'true' }, { productId: 'black-bundle', quantity: 1 }, interest('missing'), interest('black-bundle', 0), interest('black-bundle', 4), interest('black-bundle', 1.5), interest('black-bundle', '1')];
    for (const body of invalid) assert.equal((await f.call('/api/interests', { user: alice, method: 'POST', body })).status, 400);
    assert.equal(f.calls, 0);
  } finally { f.sqlite.close(); }
});

test('interest upserts are idempotent, quantity changes retain original registration, and counts are demand not stock', async () => {
  const f = fixture();
  try {
    await f.call('/api/interests', { user: alice, method: 'POST', body: interest('black-bundle', 2) });
    const initial = f.sqlite.prepare('SELECT * FROM shop_interests').get(); f.tick();
    await f.call('/api/interests', { user: alice, method: 'POST', body: interest('black-bundle', 2) });
    assert.deepEqual(f.sqlite.prepare('SELECT * FROM shop_interests').get(), initial);
    f.tick(); await f.call('/api/interests', { user: alice, method: 'POST', body: interest('black-bundle', 3) });
    await f.call('/api/interests', { user: bob, method: 'POST', body: interest('black-bundle', 1) });
    await f.call('/api/interests', { user: bob, method: 'POST', body: interest('ko-black-box', 2) });
    const report = await (await f.call('/api/admin/interests', { user: owner })).json();
    assert.deepEqual(report.products, [{ productId: 'black-bundle', people: 2, units: 4 }, { productId: 'ko-black-box', people: 1, units: 2 }]);
    const row = report.registrations.find(row => row.productId === 'black-bundle' && row.email === alice.email);
    assert.equal(row.createdAt, initial.created_at); assert.notEqual(row.updatedAt, initial.updated_at);
    const stock = await (await f.call('/api/shop', { user: alice })).json();
    assert.deepEqual(stock.interests, ['black-bundle']); assert.equal(stock.products['black-bundle'].status, 'unknown');
    assert.equal('registrations' in stock, false);
  } finally { f.sqlite.close(); }
});

test('withdrawal is scoped to the current account, is repeatable, and survives a new service', async () => {
  const f = fixture();
  try {
    for (const user of [alice, bob]) await f.call('/api/interests', { user, method: 'POST', body: interest() });
    assert.equal((await f.call('/api/interests', { user: alice, method: 'DELETE', body: { productId: 'black-bundle', userId: bob.id } })).status, 400);
    for (let i = 0; i < 2; i++) assert.equal((await f.call('/api/interests', { user: alice, method: 'DELETE', body: { productId: 'black-bundle' } })).status, 200);
    const second = createShopService({ products });
    const a = await (await second.handleRequest(f.request('/api/shop', { user: alice }), f.env)).json();
    const b = await (await second.handleRequest(f.request('/api/shop', { user: bob }), f.env)).json();
    assert.deepEqual(a.interests, []); assert.deepEqual(b.interests, ['black-bundle']);
  } finally { f.sqlite.close(); }
});

test('SQL constraints reject invalid persisted states even outside application validation', () => {
  const f = fixture();
  try {
    const statement = f.sqlite.prepare('INSERT INTO shop_inventory VALUES (?, ?, ?, ?, ?, ?)');
    for (const [status, quantity] of [['out_of_stock', null], ['in_stock', 0], ['unknown', 1], ['invalid', null]]) assert.throws(() => statement.run('black-bundle', status, quantity, '', '2026-11-01T19:30:00Z', owner.id));
    assert.throws(() => f.sqlite.prepare('INSERT INTO shop_interests VALUES (?, ?, ?, ?, ?, ?, ?)').run(alice.id, 'black-bundle', alice.email, 4, 'x', 'x', 'x'));
  } finally { f.sqlite.close(); }
});

test('CSV export is owner-only, quoted, formula-safe and does not expose account IDs', async () => {
  const f = fixture();
  try {
    const user = { id: 'private-site-id', email: '=formula@example.com' };
    await f.call('/api/interests', { user, method: 'POST', body: interest() });
    assert.equal((await f.call('/api/admin/interests?format=csv', { user: alice })).status, 403);
    const result = await f.call('/api/admin/interests?format=csv', { user: owner });
    assert.equal(result.headers.get('Content-Type'), 'text/csv; charset=utf-8');
    const text = await result.text(); assert.match(text, /"'=formula@example\.com"/); assert.doesNotMatch(text, /private-site-id/);
  } finally { f.sqlite.close(); }
});

test('storage failures cannot be returned as successful registration or stock writes', async () => {
  const f = fixture();
  try {
    f.fail();
    for (const [path, options] of [
      ['/api/shop', {}], ['/api/interests', { user: alice, method: 'POST', body: interest() }],
      ['/api/admin/stock', { user: owner, method: 'PATCH', body: { productId: 'black-bundle', status: 'in_stock' } }],
      ['/api/admin/interests', { user: owner }],
    ]) { const r = await f.call(path, options); assert.equal(r.status, 503); assert.equal((await r.json()).error, 'storage_unavailable'); }
    assert.equal((await f.call('/api/shop', {}, {})).status, 503);
  } finally { f.sqlite.close(); }
});

test('missing tables remain a storage error and never trigger request-time schema creation', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const queries = [], DB = { prepare(query) { queries.push(query); return { all: async () => ({ results: sqlite.prepare(query).all() }) }; } };
    const service = createShopService({ products });
    const result = await service.handleRequest(new Request(origin + '/api/shop'), { DB }); assert.equal(result.status, 503);
    assert(queries.every(query => !/CREATE|ALTER/i.test(query)));
  } finally { sqlite.close(); }
});

test('method/path handling, owner email normalization and absence of visitor identity are explicit', async () => {
  const f = fixture();
  try {
    assert.equal((await f.call('/api/other')).status, 404);
    assert.equal((await f.call('/api/shop', { method: 'POST', body: {} })).headers.get('Allow'), 'GET');
    assert.equal((await f.call('/api/admin/interests', { user: { id: owner.id, email: 'OWNER@EXAMPLE.COM' } })).status, 200);
    const r = await f.service.handleRequest(new Request(origin + '/api/shop', { headers: { 'oai-authenticated-user-email': owner.email } }), f.env);
    assert.equal((await r.json()).visitor.signedIn, false);
  } finally { f.sqlite.close(); }
});
