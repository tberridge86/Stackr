import { Buffer } from 'node:buffer';

function stableCatalogueValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return { $bytea: value.toString('base64') };
  if (Array.isArray(value)) return value.map(stableCatalogueValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableCatalogueValue(value[key])]),
    );
  }
  return value;
}

export function stableCatalogueJson(value) {
  return JSON.stringify(stableCatalogueValue(value));
}

function catalogueRowKey(row, primaryKey) {
  return stableCatalogueJson(primaryKey.map((column) => row[column]));
}

export function verifyCatalogueRowsByPrimaryKey(
  tableName,
  sourceRows,
  targetRows,
  primaryKey,
) {
  const targetByKey = new Map(
    targetRows.map((row) => [catalogueRowKey(row, primaryKey), row]),
  );
  const matched = [];
  for (const sourceRow of sourceRows) {
    const key = catalogueRowKey(sourceRow, primaryKey);
    const targetRow = targetByKey.get(key);
    if (!targetRow) throw new Error(`transferred_row_missing:${tableName}:${key}`);
    if (stableCatalogueJson(sourceRow) !== stableCatalogueJson(targetRow)) {
      throw new Error(`transferred_row_mismatch:${tableName}:${key}`);
    }
    matched.push(targetRow);
  }
  return matched;
}

function requiredIdentityValue(row, column, context) {
  const value = row?.[column];
  if (value === null || value === undefined || String(value).length === 0) {
    throw new Error(`catalogue_source_identity_missing:${context}:${column}`);
  }
  return String(value);
}

function uniqueRowsBy(rows, column, context) {
  const byValue = new Map();
  for (const row of rows) {
    const value = requiredIdentityValue(row, column, context);
    if (byValue.has(value)) {
      throw new Error(`catalogue_source_identity_duplicate:${context}:${column}:${value}`);
    }
    byValue.set(value, row);
  }
  return byValue;
}

export function planCatalogueSourceIdentityMerge(sourceRows, targetRows) {
  if (!Array.isArray(sourceRows) || !Array.isArray(targetRows)) {
    throw new TypeError('catalogue_source_identity_rows_must_be_arrays');
  }

  const sourceByCode = uniqueRowsBy(sourceRows, 'code', 'source');
  const sourceById = uniqueRowsBy(sourceRows, 'id', 'source');
  const targetByCode = uniqueRowsBy(targetRows, 'code', 'target');
  const targetById = uniqueRowsBy(targetRows, 'id', 'target');
  const sourceIdMap = new Map();
  const mappedSourceRows = [];
  let preservedProductionSourceIdCount = 0;
  let insertedSourceCount = 0;

  for (const sourceRow of sourceRows) {
    const sourceId = requiredIdentityValue(sourceRow, 'id', 'source');
    const sourceCode = requiredIdentityValue(sourceRow, 'code', 'source');
    const matchingTarget = targetByCode.get(sourceCode);
    let targetId = sourceId;

    if (matchingTarget) {
      targetId = requiredIdentityValue(matchingTarget, 'id', 'target');
      preservedProductionSourceIdCount += 1;
    } else {
      const collidingTarget = targetById.get(sourceId);
      if (collidingTarget) {
        throw new Error(
          `catalogue_source_identity_id_collision:${sourceId}`
          + `:${requiredIdentityValue(collidingTarget, 'code', 'target')}:${sourceCode}`,
        );
      }
      insertedSourceCount += 1;
    }

    sourceIdMap.set(sourceId, targetId);
    mappedSourceRows.push({ ...sourceRow, id: targetId });
  }

  const preservedTargetOnlyRows = targetRows.filter((targetRow) => (
    !sourceByCode.has(requiredIdentityValue(targetRow, 'code', 'target'))
  ));

  return {
    sourceIdMap,
    mappedSourceRows,
    preservedTargetOnlyRows,
    sourceCount: sourceById.size,
    preservedProductionSourceIdCount,
    remappedSourceIdCount: [...sourceIdMap.entries()].filter(([sourceId, targetId]) => (
      sourceId !== targetId
    )).length,
    insertedSourceCount,
  };
}

export function remapCatalogueSourceForeignKeys(
  rows,
  foreignKeyColumns,
  sourceIdMap,
  tableName,
) {
  if (!Array.isArray(rows) || !Array.isArray(foreignKeyColumns) || !(sourceIdMap instanceof Map)) {
    throw new TypeError('invalid_catalogue_source_foreign_key_remap_arguments');
  }
  if (foreignKeyColumns.length === 0 || rows.length === 0) {
    return { rows, remappedRowCount: 0 };
  }

  let remappedRowCount = 0;
  const mappedRows = rows.map((row) => {
    let mappedRow = row;
    let rowChanged = false;
    for (const column of foreignKeyColumns) {
      const value = row[column];
      if (value === null || value === undefined) continue;
      const sourceId = String(value);
      if (!sourceIdMap.has(sourceId)) {
        throw new Error(
          `catalogue_source_identity_mapping_missing:${tableName}:${column}:${sourceId}`,
        );
      }
      const targetId = sourceIdMap.get(sourceId);
      if (targetId === sourceId) continue;
      if (!rowChanged) mappedRow = { ...row };
      mappedRow[column] = targetId;
      rowChanged = true;
    }
    if (rowChanged) remappedRowCount += 1;
    return mappedRow;
  });

  return { rows: mappedRows, remappedRowCount };
}

export function rewriteProductionCatalogueAssetUrls(
  rows,
  sourceProjectRef,
  targetProjectRef,
  rewrittenAt,
) {
  if (!Array.isArray(rows) || !sourceProjectRef || !targetProjectRef || !rewrittenAt) {
    throw new TypeError('invalid_production_catalogue_asset_rewrite_arguments');
  }

  let rewrittenRowCount = 0;
  const rewrittenRows = rows.map((row) => {
    const shouldRewrite = row.storage_provider === 'supabase_storage'
      && row.storage_bucket === 'stackr-catalogue-public'
      && typeof row.url === 'string'
      && row.url.includes(sourceProjectRef);
    if (!shouldRewrite) return row;
    rewrittenRowCount += 1;
    return {
      ...row,
      url: row.url.replaceAll(sourceProjectRef, targetProjectRef),
      updated_at: rewrittenAt,
    };
  });

  return { rows: rewrittenRows, rewrittenRowCount };
}
