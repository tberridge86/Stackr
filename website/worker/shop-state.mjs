/** Persistent stock declarations and opt-in interest records. Dispatch owns identity. */
const STOCK_STATES = new Set(['in_stock', 'out_of_stock', 'unknown']);
const MAX_BODY_BYTES = 4096;
const MAX_REGISTRATIONS = 1000;
const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  Vary: 'Cookie, Origin',
};

function response(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });
}
function emailAddress(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return email.length <= 254 && /^[^\s@<>"\\,;]+@[^\s@<>"\\,;]+\.[^\s@<>"\\,;]+$/.test(email) ? email : null;
}
function visitorIdentity(request, env) {
  const id = request.headers.get('oai-authenticated-user-id');
  const email = emailAddress(request.headers.get('oai-authenticated-user-email'));
  const signedIn = typeof id === 'string' && id.length > 0 && id.length <= 200 && id.trim() === id && !/[\x00-\x1f\x7f]/.test(id) && email !== null;
  return { signedIn, isOwner: signedIn && emailAddress(env?.SHOP_OWNER_EMAIL) === email, email: signedIn ? email : null, userId: signedIn ? id : null };
}
function publicVisitor(visitor) {
  return { signedIn: visitor.signedIn, isOwner: visitor.isOwner, email: visitor.email };
}
function httpError(code, status) { return Object.assign(new Error(code), { code, status }); }
async function jsonBody(request, allowedKeys) {
  if (request.headers.get('Origin') !== new URL(request.url).origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') throw httpError('same_origin_required', 403);
  if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get('Content-Type') || '')) throw httpError('json_required', 415);
  const declared = request.headers.get('Content-Length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY_BYTES)) throw httpError('body_too_large', 413);
  if (!request.body) throw httpError('invalid_json', 400);
  const reader = request.body.getReader(), chunks = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); throw httpError('body_too_large', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let body;
  try {
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { throw httpError('invalid_json', 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowedKeys.includes(key))) throw httpError('invalid_body', 400);
  return body;
}
function rows(result) {
  if (result?.success === false || !Array.isArray(result?.results)) throw Error('Storage read failed');
  return result.results;
}
async function run(statement) {
  const result = await statement.run();
  if (!result || result.success === false) throw Error('Storage write failed');
  return result;
}
function csvField(value) {
  let text = String(value ?? '');
  // Spreadsheet applications can execute formula-like cell values after CSV import.
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export function createShopService({ products, inventory = {}, now = Date.now }) {
  if (!Array.isArray(products) || !products.length) throw new TypeError('Expected catalogue products');
  const productMap = new Map();
  for (const product of products) {
    if (!product || !/^[a-zA-Z0-9_-]{1,100}$/.test(product.id || '') || productMap.has(product.id)) throw new TypeError('Expected unique product identities');
    productMap.set(product.id, product);
  }
  function timestamp() {
    const time = Number(now()); if (!Number.isFinite(time) || time < 0) throw Error('Invalid clock');
    return new Date(time).toISOString();
  }
  function knownProduct(id) {
    if (typeof id !== 'string' || !productMap.has(id)) throw httpError('unknown_product', 400);
    return id;
  }
  function baseProducts() {
    // A catalogue/retailer listing is not evidence that StackR holds stock.
    return Object.fromEntries([...productMap.keys()].map(id => [id, { status: 'unknown', quantity: null, updatedAt: null }]));
  }
  function stockRecord(row, owner) {
    const updated = typeof row.updated_at === 'string' ? Date.parse(row.updated_at) : NaN;
    if (!STOCK_STATES.has(row.status) || !Number.isFinite(updated) || new Date(updated).toISOString() !== row.updated_at || updated > Number(now())) return null;
    const quantity = row.quantity;
    if (quantity !== null && (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 999999)) return null;
    if (row.status === 'out_of_stock' && quantity !== 0 || row.status === 'unknown' && quantity !== null || row.status === 'in_stock' && quantity !== null && quantity < 1) return null;
    return { status: row.status, quantity, updatedAt: row.updated_at, ...(owner ? { note: String(row.note || '') } : {}) };
  }
  async function handleRequest(request, env = {}) {
    const url = new URL(request.url), path = url.pathname, visitor = visitorIdentity(request, env);
    const methods = { '/api/shop': 'GET', '/api/interests': 'POST, DELETE', '/api/admin/stock': 'PATCH', '/api/admin/interests': 'GET' };
    if (!Object.hasOwn(methods, path)) return response({ error: 'not_found' }, 404);
    if (!methods[path].split(', ').includes(request.method)) return response({ error: 'method_not_allowed' }, 405, { Allow: methods[path] });
    if (path.startsWith('/api/admin/') && !visitor.isOwner) return response({ error: visitor.signedIn ? 'owner_required' : 'sign_in_required' }, visitor.signedIn ? 403 : 401);
    if (path === '/api/interests' && !visitor.signedIn) return response({ error: 'sign_in_required', signInPath: '/signin-with-chatgpt?return_to=%2F%23shop' }, 401);
    try {
      // Validate all mutation input before touching storage.
      let body;
      if (path === '/api/interests') {
        body = await jsonBody(request, request.method === 'DELETE' ? ['productId'] : ['productId', 'quantity', 'consent']);
        knownProduct(body.productId);
        if (request.method === 'POST' && (body.consent !== true || !Number.isSafeInteger(body.quantity) || body.quantity < 1 || body.quantity > 3)) throw httpError('quantity_and_consent_required', 400);
      }
      if (path === '/api/admin/stock') {
        body = await jsonBody(request, ['productId', 'status', 'quantity', 'note']); knownProduct(body.productId);
        if (!STOCK_STATES.has(body.status)) throw httpError('invalid_stock_status', 400);
        body.quantity = body.quantity ?? null;
        if (body.quantity !== null && (!Number.isSafeInteger(body.quantity) || body.quantity < 0 || body.quantity > 999999)) throw httpError('invalid_quantity', 400);
        if (body.status === 'unknown' && body.quantity !== null || body.status === 'out_of_stock' && body.quantity !== null && body.quantity !== 0 || body.status === 'in_stock' && body.quantity !== null && body.quantity < 1) throw httpError('quantity_status_mismatch', 400);
        if (body.note !== undefined && (typeof body.note !== 'string' || body.note.length > 500 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(body.note))) throw httpError('invalid_note', 400);
        body.note = (body.note || '').trim(); if (body.status === 'out_of_stock') body.quantity = 0;
      }
      if (!env.DB || typeof env.DB.prepare !== 'function') throw Error('Storage unavailable');
      if (path === '/api/shop') {
        const records = rows(await env.DB.prepare('SELECT product_id, status, quantity, note, updated_at FROM shop_inventory').all());
        const result = baseProducts();
        for (const row of records) if (productMap.has(row.product_id)) { const record = stockRecord(row, visitor.isOwner); if (record) result[row.product_id] = record; }
        const interests = visitor.signedIn ? rows(await env.DB.prepare('SELECT product_id FROM shop_interests WHERE user_id = ? ORDER BY product_id').bind(visitor.userId).all()).map(row => row.product_id).filter(id => productMap.has(id)) : [];
        return response({ products: result, visitor: publicVisitor(visitor), interests, storageAvailable: true, generatedAt: timestamp(), customerLimit: inventory.customerLimit || 3 });
      }
      if (path === '/api/interests') {
        if (request.method === 'DELETE') {
          await run(env.DB.prepare('DELETE FROM shop_interests WHERE user_id = ? AND product_id = ?').bind(visitor.userId, body.productId));
          return response({ ok: true, interested: false, productId: body.productId });
        }
        const time = timestamp();
        await run(env.DB.prepare('INSERT INTO shop_interests (user_id, product_id, email, quantity, consent_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, product_id) DO UPDATE SET email = excluded.email, quantity = excluded.quantity, consent_at = excluded.consent_at, updated_at = excluded.updated_at WHERE shop_interests.email <> excluded.email OR shop_interests.quantity <> excluded.quantity').bind(visitor.userId, body.productId, visitor.email, body.quantity, time, time, time));
        return response({ ok: true, interested: true, productId: body.productId, quantity: body.quantity });
      }
      if (path === '/api/admin/stock') {
        const updatedAt = timestamp();
        await run(env.DB.prepare('INSERT INTO shop_inventory (product_id, status, quantity, note, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(product_id) DO UPDATE SET status = excluded.status, quantity = excluded.quantity, note = excluded.note, updated_at = excluded.updated_at, updated_by = excluded.updated_by').bind(body.productId, body.status, body.quantity, body.note, updatedAt, visitor.userId));
        return response({ ok: true, productId: body.productId, product: { status: body.status, quantity: body.quantity, note: body.note, updatedAt } });
      }
      if (path === '/api/admin/interests') {
        const aggregates = rows(await env.DB.prepare('SELECT product_id, COUNT(*) AS people, SUM(quantity) AS units FROM shop_interests GROUP BY product_id ORDER BY people DESC, units DESC, product_id').all()).filter(row => productMap.has(row.product_id));
        const saved = rows(await env.DB.prepare('SELECT product_id, email, quantity, created_at, updated_at FROM shop_interests ORDER BY updated_at DESC, product_id, user_id LIMIT ?').bind(MAX_REGISTRATIONS + 1).all());
        const hasMore = saved.length > MAX_REGISTRATIONS;
        const registrations = saved.slice(0, MAX_REGISTRATIONS).filter(row => productMap.has(row.product_id)).map(row => ({ productId: row.product_id, email: row.email, quantity: row.quantity, createdAt: row.created_at, updatedAt: row.updated_at }));
        const result = { products: aggregates.map(row => ({ productId: row.product_id, people: Number(row.people), units: Number(row.units) })), registrations, hasMore, registrationLimit: MAX_REGISTRATIONS };
        if (url.searchParams.get('format') === 'csv') {
          // Rows are bounded; callers can see hasMore via the JSON dashboard.
          const csv = [['Product ID', 'Product', 'Language', 'Email', 'Units', 'Registered', 'Updated'], ...registrations.map(row => [row.productId, productMap.get(row.productId).name, productMap.get(row.productId).language, row.email, row.quantity, row.createdAt, row.updatedAt])].map(row => row.map(csvField).join(',')).join('\r\n') + '\r\n';
          return new Response(csv, { headers: { ...JSON_HEADERS, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="stackr-product-interest.csv"', 'X-Export-Truncated': String(hasMore) } });
        }
        return response(result);
      }
    } catch (error) {
      if (String(error.message).includes('stock_reserved')) return response({error:'stock_reserved',message:'This product is held in an open checkout. Wait for the payment or expiry before recounting stock.'},409);
      if (error.status) return response({ error: error.code }, error.status);
      return response({ error: 'storage_unavailable', message: 'Stock and interest records are temporarily unavailable. No success is confirmed.' }, 503);
    }
    return response({ error: 'not_found' }, 404);
  }
  return { handleRequest };
}
