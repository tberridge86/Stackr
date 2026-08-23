import { createHash } from 'node:crypto';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURRENCIES = new Set(['GBP', 'USD', 'EUR', 'JPY', 'CAD', 'AUD']);
const PRODUCT_KINDS = new Set(['raw_card', 'graded_card']);
const SALE_TYPES = new Set([
  'auction_result',
  'accepted_offer',
  'confirmed_sold_transaction',
  'manual_verified_sale',
  'provider_sold_observation',
]);
const REQUIRED_HEADERS = [
  'variant_id',
  'product_kind',
  'source_item_id',
  'source_url',
  'raw_title',
  'sold_price',
  'currency_code',
  'sold_at',
  'observed_at',
  'condition_code',
  'parsed_match_confidence',
];

function clean(value) {
  const text = String(value ?? '').normalize('NFKC').trim();
  return text || null;
}

function parseNumber(value, field, rowNumber, { nullable = false } = {}) {
  const text = clean(value);
  if (nullable && text == null) return null;
  const number = Number(text);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`Row ${rowNumber}: ${field} must be a non-negative number.`);
  }
  return number;
}

function parseTimestamp(value, field, rowNumber) {
  const text = clean(value);
  const timestamp = text ? new Date(text) : null;
  if (!timestamp || !Number.isFinite(timestamp.getTime())) {
    throw new Error(`Row ${rowNumber}: ${field} must be an explicit ISO-8601 timestamp.`);
  }
  return timestamp.toISOString();
}

function validateEbayUrl(value, rowNumber) {
  const text = clean(value);
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`Row ${rowNumber}: source_url must be a valid HTTPS eBay URL.`);
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || !(host === 'ebay.com' || host.endsWith('.ebay.com') || host === 'ebay.co.uk' || host.endsWith('.ebay.co.uk'))) {
    throw new Error(`Row ${rowNumber}: source_url must be an HTTPS URL on an eBay domain.`);
  }
  return url.toString();
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const input = String(text ?? '').replace(/^\uFEFF/, '');

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error('CSV contains an unterminated quoted field.');
  if (field || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  const nonEmpty = rows.filter((cells) => cells.some((cell) => clean(cell) != null));
  if (nonEmpty.length < 2) throw new Error('CSV must contain a header and at least one sold observation.');
  const headers = nonEmpty[0].map((value) => String(value).trim().toLowerCase());
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  if (missingHeaders.length) throw new Error(`CSV is missing required headers: ${missingHeaders.join(', ')}.`);
  if (new Set(headers).size !== headers.length) throw new Error('CSV contains duplicate headers.');
  return nonEmpty.slice(1).map((cells, index) => Object.fromEntries(headers.map((header, column) => [header, cells[column] ?? ''])));
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : stableJson(value)).digest('hex');
}

export function normalizeSoldRows(records, { now = new Date() } = {}) {
  const seen = new Set();
  return records.map((record, index) => {
    const rowNumber = index + 2;
    const variantId = clean(record.variant_id)?.toLowerCase();
    if (!variantId || !UUID_PATTERN.test(variantId)) throw new Error(`Row ${rowNumber}: variant_id must be a canonical UUID.`);
    const productKind = clean(record.product_kind)?.toLowerCase();
    if (!productKind || !PRODUCT_KINDS.has(productKind)) throw new Error(`Row ${rowNumber}: product_kind must be raw_card or graded_card.`);
    const sourceItemId = clean(record.source_item_id);
    if (!sourceItemId) throw new Error(`Row ${rowNumber}: source_item_id is required.`);
    const rawTitle = clean(record.raw_title);
    if (!rawTitle) throw new Error(`Row ${rowNumber}: raw_title is required.`);
    const soldAt = parseTimestamp(record.sold_at, 'sold_at', rowNumber);
    const observedAt = parseTimestamp(record.observed_at, 'observed_at', rowNumber);
    if (new Date(soldAt).getTime() > new Date(observedAt).getTime()) throw new Error(`Row ${rowNumber}: observed_at cannot precede sold_at.`);
    if (new Date(observedAt).getTime() > now.getTime() + 5 * 60_000) throw new Error(`Row ${rowNumber}: observed_at cannot be in the future.`);
    const currencyCode = clean(record.currency_code)?.toUpperCase();
    if (!currencyCode || !CURRENCIES.has(currencyCode)) throw new Error(`Row ${rowNumber}: currency_code is unsupported.`);
    const conditionCode = clean(record.condition_code)?.toLowerCase();
    if (!conditionCode) throw new Error(`Row ${rowNumber}: condition_code is required.`);
    const graderCode = clean(record.grader_code)?.toUpperCase() ?? null;
    const gradeValue = clean(record.grade_value) ?? null;
    if (productKind === 'graded_card' && (!graderCode || !gradeValue || conditionCode !== 'graded')) {
      throw new Error(`Row ${rowNumber}: graded_card requires condition_code=graded, grader_code and grade_value.`);
    }
    if (productKind === 'raw_card' && (graderCode || gradeValue)) throw new Error(`Row ${rowNumber}: raw_card cannot include grader_code or grade_value.`);
    const confidence = parseNumber(record.parsed_match_confidence, 'parsed_match_confidence', rowNumber);
    if (confidence < 0.9 || confidence > 1) throw new Error(`Row ${rowNumber}: parsed_match_confidence must be between 0.9 and 1.`);
    const saleType = clean(record.sale_type)?.toLowerCase() ?? 'manual_verified_sale';
    if (!SALE_TYPES.has(saleType)) throw new Error(`Row ${rowNumber}: sale_type is unsupported.`);
    const normalized = {
      rowNumber,
      variantId,
      productKind,
      sourceItemId,
      sourceUrl: validateEbayUrl(record.source_url, rowNumber),
      rawTitle,
      soldPrice: parseNumber(record.sold_price, 'sold_price', rowNumber),
      shippingPrice: parseNumber(record.shipping_price, 'shipping_price', rowNumber, { nullable: true }),
      currencyCode,
      soldAt,
      observedAt,
      conditionCode,
      graderCode,
      gradeValue,
      saleType,
      parsedMatchConfidence: confidence,
      attributionText: clean(record.attribution_text) ?? 'eBay sold listing / Product Research',
    };
    const duplicateKey = `${sourceItemId}|${soldAt}`;
    if (seen.has(duplicateKey)) throw new Error(`Row ${rowNumber}: duplicate source_item_id and sold_at in manifest.`);
    seen.add(duplicateKey);
    return { ...normalized, payloadHash: sha256(normalized) };
  });
}

export function buildMarketIdentityKey(row) {
  return ['stackr-market-v1', row.productKind, row.variantId, row.conditionCode, row.graderCode ?? '_', row.gradeValue ?? '_'].join('|');
}

export function buildImportManifest(rows) {
  const payload = rows.map(({ rowNumber: _rowNumber, ...row }) => row);
  return { rows: payload, manifestSha256: sha256(payload) };
}

async function expectRows(query, context) {
  const { data, error } = await query;
  if (error) throw new Error(`${context}: ${error.message}`);
  return data ?? [];
}

async function expectOne(query, context) {
  const rows = await expectRows(query, context);
  if (rows.length !== 1) throw new Error(`${context}: expected exactly one row, received ${rows.length}.`);
  return rows[0];
}

export async function validateStagingRows(supabase, rows) {
  const provider = await expectOne(
    supabase.schema('market').from('source_providers').select('code,supports_sold_observations,data_licence_status').eq('code', 'ebay_sold_authorised'),
    'Could not validate the eBay sold provider',
  );
  if (!provider.supports_sold_observations) throw new Error('The configured eBay provider does not support sold observations.');

  const variants = new Map();
  const variantIds = [...new Set(rows.map((row) => row.variantId))];
  for (let index = 0; index < variantIds.length; index += 100) {
    const chunk = variantIds.slice(index, index + 100);
    const page = await expectRows(
      supabase.schema('api').from('catalogue_cards').select('variant_id,language_code').in('variant_id', chunk),
      'Could not validate published catalogue variants',
    );
    for (const row of page) variants.set(row.variant_id, row);
  }
  const missing = variantIds.filter((id) => !variants.has(id));
  if (missing.length) throw new Error(`Manifest contains unpublished or deprecated variant IDs: ${missing.join(', ')}.`);

  const conditionCodes = [...new Set(rows.map((row) => row.conditionCode))];
  const conditions = await expectRows(
    supabase.schema('market').from('conditions').select('code,product_kind,active').in('code', conditionCodes),
    'Could not validate market conditions',
  );
  const conditionMap = new Map(conditions.filter((row) => row.active).map((row) => [row.code, row]));
  for (const row of rows) {
    const condition = conditionMap.get(row.conditionCode);
    if (!condition || condition.product_kind !== row.productKind) throw new Error(`Row ${row.rowNumber}: condition_code does not match product_kind.`);
  }

  const gradedRows = rows.filter((row) => row.productKind === 'graded_card');
  const gradeMap = new Map();
  if (gradedRows.length) {
    const graderCodes = [...new Set(gradedRows.map((row) => row.graderCode))];
    const grades = await expectRows(
      supabase.schema('market').from('grades').select('id,grader_code,grade_value,active').in('grader_code', graderCodes),
      'Could not validate grades',
    );
    for (const grade of grades) if (grade.active) gradeMap.set(`${grade.grader_code}|${grade.grade_value}`, grade.id);
    for (const row of gradedRows) if (!gradeMap.has(`${row.graderCode}|${row.gradeValue}`)) throw new Error(`Row ${row.rowNumber}: grader_code and grade_value are not canonical.`);
  }

  return { provider, variants, gradeMap };
}

export async function importStagingRows(supabase, rows, validation, { manifestSha256, actor = 'STACKR DELIVERY' }) {
  const source = await expectOne(
    supabase.schema('ingest').from('sources').select('id,code').eq('code', 'ebay'),
    'Could not resolve the eBay provenance source',
  );
  const runKey = `ebay-sold-manual-${manifestSha256}`;
  const priorRuns = await expectRows(
    supabase.schema('ingest').from('import_runs').select('id,status,records_inserted').eq('source_id', source.id).eq('run_key', runKey),
    'Could not check prior import runs',
  );
  const run = priorRuns[0] ?? await expectOne(
    supabase.schema('ingest').from('import_runs').insert({
      source_id: source.id,
      run_key: runKey,
      import_type: 'manual',
      status: 'running',
      records_requested: rows.length,
      records_retrieved: rows.length,
      metadata: { manifest_sha256: manifestSha256, provider_code: 'ebay_sold_authorised', actor },
    }).select('id,status,records_inserted'),
    'Could not create the sold-data import run',
  );
  if (priorRuns[0]) {
    await expectRows(
      supabase.schema('ingest').from('import_runs').update({ status: 'running', finished_at: null, error_message: null }).eq('id', run.id),
      'Could not resume the sold-data import run',
    );
  }

  try {
    const identitiesByKey = new Map();
    for (const row of rows) {
      const identityKey = buildMarketIdentityKey(row);
      if (identitiesByKey.has(identityKey)) continue;
      const variant = validation.variants.get(row.variantId);
      const identity = await expectOne(
        supabase.schema('market').from('market_identities').upsert({
          identity_key: identityKey,
          product_kind: row.productKind,
          variant_id: row.variantId,
          condition_code: row.conditionCode,
          grader: row.graderCode,
          grade: row.gradeValue,
          certification_number: null,
          language_code: variant.language_code,
        }, { onConflict: 'identity_key' }).select('id,identity_key'),
        `Could not create market identity for row ${row.rowNumber}`,
      );
      identitiesByKey.set(identityKey, identity.id);
    }

    let inserted = 0;
    let reused = 0;
    for (const row of rows) {
      const existing = await expectRows(
        supabase.schema('market').from('sold_observations').select('id,sold_price,shipping_price,currency_code,variant_id,source_url,raw_title').eq('provider_code', 'ebay_sold_authorised').eq('source_item_id', row.sourceItemId).eq('sold_at', row.soldAt),
        `Could not check existing sold observation for row ${row.rowNumber}`,
      );
      if (existing.length) {
        const current = existing[0];
        const exact = Number(current.sold_price) === row.soldPrice
          && (current.shipping_price == null ? null : Number(current.shipping_price)) === row.shippingPrice
          && current.currency_code === row.currencyCode
          && current.variant_id === row.variantId
          && current.source_url === row.sourceUrl
          && current.raw_title === row.rawTitle;
        if (!exact) throw new Error(`Row ${row.rowNumber}: an existing source item conflicts with this evidence.`);
        reused += 1;
        continue;
      }

      const variant = validation.variants.get(row.variantId);
      const rawExternalId = `${row.sourceItemId}|${row.soldAt}`;
      const existingRawRecords = await expectRows(
        supabase.schema('ingest').from('raw_source_records').select('id,payload_hash,source_url').eq('source_id', source.id).eq('import_run_id', run.id).eq('record_type', 'price').eq('external_id', rawExternalId),
        `Could not check preserved provenance for row ${row.rowNumber}`,
      );
      let rawRecord = existingRawRecords[0] ?? null;
      if (rawRecord && (rawRecord.payload_hash !== row.payloadHash || rawRecord.source_url !== row.sourceUrl)) {
        throw new Error(`Row ${row.rowNumber}: existing provenance conflicts with this evidence.`);
      }
      if (!rawRecord) rawRecord = await expectOne(
        supabase.schema('ingest').from('raw_source_records').insert({
          source_id: source.id,
          import_run_id: run.id,
          record_type: 'price',
          external_id: rawExternalId,
          provider_record_id: row.sourceItemId,
          language_code: variant.language_code,
          source_url: row.sourceUrl,
          source_endpoint: 'ebay_seller_hub_product_research',
          retrieved_at: row.observedAt,
          source_updated_at: row.soldAt,
          licence_status: 'approved',
          attribution_text: row.attributionText,
          payload_hash: row.payloadHash,
          raw_payload: row,
          validation_status: 'valid',
          validation_errors: [],
          http_metadata: {},
          internal_notes: `Verified manual eBay sold evidence imported by ${actor}.`,
        }).select('id'),
        `Could not preserve provenance for row ${row.rowNumber}`,
      );

      await expectOne(
        supabase.schema('market').from('sold_observations').insert({
          market_identity_id: identitiesByKey.get(buildMarketIdentityKey(row)),
          variant_id: row.variantId,
          sealed_product_variant_id: null,
          provider_code: 'ebay_sold_authorised',
          source_item_id: row.sourceItemId,
          sold_price: row.soldPrice,
          shipping_price: row.shippingPrice,
          currency_code: row.currencyCode,
          sale_type: row.saleType,
          condition_code: row.conditionCode,
          grader_code: row.graderCode,
          grade_id: row.productKind === 'graded_card' ? validation.gradeMap.get(`${row.graderCode}|${row.gradeValue}`) : null,
          observed_at: row.observedAt,
          sold_at: row.soldAt,
          source_url: row.sourceUrl,
          raw_title: row.rawTitle,
          parsed_match_confidence: row.parsedMatchConfidence,
          ingestion_run_id: run.id,
          raw_record_id: rawRecord.id,
          source_updated_at: row.soldAt,
        }).select('id'),
        `Could not insert sold observation for row ${row.rowNumber}`,
      );
      inserted += 1;
    }

    await expectRows(
      supabase.schema('ingest').from('import_runs').update({
        status: 'completed',
        finished_at: new Date().toISOString(),
        records_inserted: inserted,
        records_skipped: reused,
        error_message: null,
      }).eq('id', run.id),
      'Could not finalise the sold-data import run',
    );
    return { runId: run.id, inserted, reused, idempotent: inserted === 0 };
  } catch (error) {
    await supabase.schema('ingest').from('import_runs').update({
      status: 'failed',
      finished_at: new Date().toISOString(),
      error_message: String(error?.message ?? error).slice(0, 1000),
    }).eq('id', run.id);
    throw error;
  }
}
