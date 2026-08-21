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

export function catalogueTargetOnlyRows(sourceRows, targetRows, primaryKey) {
  if (!Array.isArray(sourceRows)
    || !Array.isArray(targetRows)
    || !Array.isArray(primaryKey)
    || primaryKey.length === 0) {
    throw new TypeError('invalid_catalogue_target_only_row_arguments');
  }
  const sourceKeys = new Set(sourceRows.map((row) => catalogueRowKey(row, primaryKey)));
  if (sourceKeys.size !== sourceRows.length) {
    throw new Error('catalogue_source_primary_key_overlap');
  }
  return targetRows.filter((row) => !sourceKeys.has(catalogueRowKey(row, primaryKey)));
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

export function expectedCatalogueOwnedSequenceStates(sequenceStates, rows) {
  if (!Array.isArray(sequenceStates) || !Array.isArray(rows)) {
    throw new TypeError('invalid_catalogue_sequence_state_arguments');
  }
  return sequenceStates.map((sequence) => {
    const values = rows
      .map((row) => row[sequence.column])
      .filter((value) => value !== null && value !== undefined)
      .map((value) => BigInt(value));
    const restartValue = values.length
      ? values.reduce((left, right) => (left > right ? left : right)) + 1n
      : BigInt(sequence.startValue);
    return {
      ...sequence,
      lastValue: restartValue.toString(),
      isCalled: false,
    };
  });
}

export function catalogueTransferTargetMatch({
  tableName,
  sourceRows,
  preservedTargetRows,
  targetRows,
  primaryKey,
  targetSequenceStates,
}) {
  if (typeof tableName !== 'string'
    || !Array.isArray(sourceRows)
    || !Array.isArray(preservedTargetRows)
    || !Array.isArray(targetRows)
    || !Array.isArray(primaryKey)
    || primaryKey.length === 0
    || !Array.isArray(targetSequenceStates)) {
    throw new TypeError('invalid_catalogue_target_match_arguments');
  }
  const expectedRows = [...sourceRows, ...preservedTargetRows];
  if (targetRows.length !== expectedRows.length) return { matches: false, reason: 'row_count' };
  const expectedKeys = new Set(expectedRows.map((row) => catalogueRowKey(row, primaryKey)));
  if (expectedKeys.size !== expectedRows.length) {
    return { matches: false, reason: 'expected_primary_key_overlap' };
  }
  try {
    verifyCatalogueRowsByPrimaryKey(tableName, sourceRows, targetRows, primaryKey);
    verifyCatalogueRowsByPrimaryKey(tableName, preservedTargetRows, targetRows, primaryKey);
  } catch (error) {
    return {
      matches: false,
      reason: error instanceof Error ? error.message.split(':')[0] : 'verification_error',
    };
  }
  const expectedSequenceStates = expectedCatalogueOwnedSequenceStates(
    targetSequenceStates,
    expectedRows,
  );
  if (stableCatalogueJson(targetSequenceStates) !== stableCatalogueJson(expectedSequenceStates)) {
    return { matches: false, reason: 'sequence_state' };
  }
  return { matches: true, reason: null };
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

function optionalIdentityValue(row, column) {
  const value = row?.[column];
  if (value === null || value === undefined || String(value).length === 0) return null;
  return String(value);
}

function uniqueRowsByOptionalIdentity(rows, column, context) {
  const byValue = new Map();
  for (const row of rows) {
    const value = optionalIdentityValue(row, column);
    if (value === null) continue;
    if (byValue.has(value)) {
      throw new Error(`catalogue_asset_identity_duplicate:${context}:${column}:${value}`);
    }
    byValue.set(value, row);
  }
  return byValue;
}

function activeStorageObjectKey(row) {
  if (row?.deleted_at !== null && row?.deleted_at !== undefined) return null;
  const provider = optionalIdentityValue(row, 'storage_provider');
  const bucket = optionalIdentityValue(row, 'storage_bucket');
  const key = optionalIdentityValue(row, 'storage_key');
  if (provider === null || bucket === null || key === null) return null;
  return stableCatalogueJson([provider, bucket, key]);
}

function uniqueRowsByActiveStorageObject(rows, context) {
  const byValue = new Map();
  for (const row of rows) {
    const value = activeStorageObjectKey(row);
    if (value === null) continue;
    if (byValue.has(value)) {
      throw new Error(`catalogue_asset_storage_identity_duplicate:${context}:${value}`);
    }
    byValue.set(value, row);
  }
  return byValue;
}

function sourceRowsByActiveStorageObject(rows) {
  const byValue = new Map();
  for (const row of rows) {
    const value = activeStorageObjectKey(row);
    if (value === null) continue;
    const group = byValue.get(value) ?? [];
    group.push(row);
    byValue.set(value, group);
  }
  return byValue;
}

function canonicalSourceAssetRows(sourceRows) {
  const groups = sourceRowsByActiveStorageObject(sourceRows);
  const aliases = new Map();
  const canonicalIds = new Set();

  for (const [storageKey, rows] of groups) {
    if (rows.length === 1) {
      canonicalIds.add(requiredIdentityValue(rows[0], 'id', 'asset_source'));
      continue;
    }
    const stableRows = rows.filter((row) => optionalIdentityValue(row, 'asset_id') !== null);
    if (stableRows.length !== 1) {
      throw new Error(
        `catalogue_asset_storage_identity_ambiguous_source:${storageKey}:${rows.length}`,
      );
    }
    if (rows.some((row) => optionalIdentityValue(row, 'variant_id') !== null
      || optionalIdentityValue(row, 'printing_id') !== null)) {
      throw new Error(
        `catalogue_asset_storage_identity_card_identity_conflict:${storageKey}:${rows.length}`,
      );
    }
    for (const column of [
      'asset_type',
      'sha256',
      'content_sha256',
      'mime_type',
      'width',
      'height',
      'byte_size',
    ]) {
      const values = new Set(rows.map((row) => optionalIdentityValue(row, column))
        .filter((value) => value !== null));
      if (values.size > 1) {
        throw new Error(
          `catalogue_asset_storage_identity_metadata_conflict:${storageKey}:${column}`,
        );
      }
    }
    const canonicalRow = stableRows[0];
    const canonicalId = requiredIdentityValue(canonicalRow, 'id', 'asset_source');
    canonicalIds.add(canonicalId);
    for (const row of rows) {
      const sourceId = requiredIdentityValue(row, 'id', 'asset_source');
      if (sourceId !== canonicalId) aliases.set(sourceId, canonicalId);
    }
  }

  for (const row of sourceRows) {
    const sourceId = requiredIdentityValue(row, 'id', 'asset_source');
    if (!aliases.has(sourceId)) canonicalIds.add(sourceId);
  }
  return {
    canonicalRows: sourceRows.filter((row) => canonicalIds.has(String(row.id))),
    aliases,
  };
}

export function planCatalogueAssetIdentityMerge(sourceRows, targetRows) {
  if (!Array.isArray(sourceRows) || !Array.isArray(targetRows)) {
    throw new TypeError('catalogue_asset_identity_rows_must_be_arrays');
  }
  uniqueRowsBy(sourceRows, 'id', 'asset_source');
  const targetById = uniqueRowsBy(targetRows, 'id', 'asset_target');
  const sourceByAssetId = uniqueRowsByOptionalIdentity(sourceRows, 'asset_id', 'source');
  const targetByAssetId = uniqueRowsByOptionalIdentity(targetRows, 'asset_id', 'target');
  const targetByStorageObject = uniqueRowsByActiveStorageObject(targetRows, 'target');
  const sourceCanonicalization = canonicalSourceAssetRows(sourceRows);
  const sourceIdMap = new Map();
  const mappedSourceRowEntries = [];
  const sourceAliasIds = new Set(sourceCanonicalization.aliases.keys());
  const sourceIdsThatMustReleaseStorageFirst = new Set();
  let preservedProductionAssetIdCount = 0;
  let insertedAssetCount = 0;
  let storageObjectMatchedAssetCount = 0;
  let preservedProductionStableAssetIdCount = 0;

  for (const sourceRow of sourceCanonicalization.canonicalRows) {
    const sourceId = requiredIdentityValue(sourceRow, 'id', 'asset_source');
    const storageObjectKey = activeStorageObjectKey(sourceRow);
    const matchingTargetByStorage = storageObjectKey === null
      ? null
      : targetByStorageObject.get(storageObjectKey);
    const storageTargetAssetId = matchingTargetByStorage === null
      ? null
      : optionalIdentityValue(matchingTargetByStorage, 'asset_id');
    const stableSourceRow = storageTargetAssetId === null
      ? null
      : sourceByAssetId.get(storageTargetAssetId);
    if (stableSourceRow
      && requiredIdentityValue(stableSourceRow, 'id', 'asset_source') !== sourceId) {
      sourceIdsThatMustReleaseStorageFirst.add(
        requiredIdentityValue(stableSourceRow, 'id', 'asset_source'),
      );
    }
  }

  for (const [sourceIndex, sourceRow] of sourceCanonicalization.canonicalRows.entries()) {
    const sourceId = requiredIdentityValue(sourceRow, 'id', 'asset_source');
    const assetId = optionalIdentityValue(sourceRow, 'asset_id');
    const matchingTargetByAssetId = assetId === null ? null : targetByAssetId.get(assetId);
    const storageObjectKey = activeStorageObjectKey(sourceRow);
    const rawMatchingTargetByStorage = storageObjectKey === null
      ? null
      : targetByStorageObject.get(storageObjectKey);
    const storageTargetAssetId = rawMatchingTargetByStorage === null
      ? null
      : optionalIdentityValue(rawMatchingTargetByStorage, 'asset_id');
    const storageTargetClaimedByAnotherSource = storageTargetAssetId !== null
      && sourceByAssetId.has(storageTargetAssetId)
      && requiredIdentityValue(
        sourceByAssetId.get(storageTargetAssetId),
        'id',
        'asset_source',
      ) !== sourceId;
    const matchingTargetByStorage = storageTargetClaimedByAnotherSource
      ? null
      : rawMatchingTargetByStorage;
    if (matchingTargetByAssetId && matchingTargetByStorage
      && String(matchingTargetByAssetId.id) !== String(matchingTargetByStorage.id)) {
      throw new Error(
        `catalogue_asset_identity_storage_conflict:${sourceId}`
        + `:${matchingTargetByAssetId.id}:${matchingTargetByStorage.id}`,
      );
    }
    if (assetId !== null && matchingTargetByStorage) {
      const targetAssetId = optionalIdentityValue(matchingTargetByStorage, 'asset_id');
      if (targetAssetId !== null && targetAssetId !== assetId) {
        throw new Error(
          `catalogue_asset_storage_stable_identity_conflict:${sourceId}`
          + `:${assetId}:${targetAssetId}`,
        );
      }
    }
    const matchingTarget = matchingTargetByAssetId
      ?? matchingTargetByStorage
      ?? (assetId === null ? targetById.get(sourceId) : null);
    let targetId = sourceId;
    let mappedSourceRow = sourceRow;

    if (matchingTarget) {
      targetId = requiredIdentityValue(matchingTarget, 'id', 'asset_target');
      if (matchingTargetByStorage && !matchingTargetByAssetId) {
        storageObjectMatchedAssetCount += 1;
      }
      const targetAssetId = optionalIdentityValue(matchingTarget, 'asset_id');
      if (assetId === null && targetAssetId !== null) {
        mappedSourceRow = { ...mappedSourceRow, asset_id: targetAssetId };
        preservedProductionStableAssetIdCount += 1;
      }
      preservedProductionAssetIdCount += 1;
    } else {
      const collidingTarget = targetById.get(sourceId);
      if (collidingTarget) {
        throw new Error(
          `catalogue_asset_identity_id_collision:${sourceId}`
          + `:${optionalIdentityValue(collidingTarget, 'asset_id') ?? 'null'}`
          + `:${assetId ?? 'null'}`,
        );
      }
      insertedAssetCount += 1;
    }

    sourceIdMap.set(sourceId, targetId);
    mappedSourceRowEntries.push({
      row: targetId === sourceId
        ? mappedSourceRow
        : { ...mappedSourceRow, id: targetId },
      // A stable row that deprecates/releases an old storage assignment must be
      // updated before a corrected variant claims that same storage object.
      priority: sourceIdsThatMustReleaseStorageFirst.has(sourceId) ? -1 : 0,
      sourceIndex,
    });
  }

  for (const [aliasId, canonicalId] of sourceCanonicalization.aliases) {
    const targetId = sourceIdMap.get(canonicalId);
    if (!targetId) {
      throw new Error(`catalogue_asset_storage_alias_target_missing:${aliasId}:${canonicalId}`);
    }
    sourceIdMap.set(aliasId, targetId);
  }

  const representedTargetIds = new Set(sourceIdMap.values());
  const preservedTargetOnlyRows = targetRows.filter((targetRow) => (
    !representedTargetIds.has(requiredIdentityValue(targetRow, 'id', 'asset_target'))
  ));

  const mappedSourceRows = mappedSourceRowEntries
    .sort((left, right) => left.priority - right.priority || left.sourceIndex - right.sourceIndex)
    .map(({ row }) => row);

  return {
    sourceIdMap,
    sourceAliasIds,
    mappedSourceRows,
    preservedTargetOnlyRows,
    sourceCount: sourceRows.length,
    canonicalSourceCount: mappedSourceRows.length,
    sourceStorageAliasCount: sourceAliasIds.size,
    sourceStableAssetIdCount: sourceByAssetId.size,
    preservedProductionAssetIdCount,
    storageObjectMatchedAssetCount,
    preservedProductionStableAssetIdCount,
    remappedAssetIdCount: [...sourceIdMap.entries()].filter(([sourceId, targetId]) => (
      sourceId !== targetId
    )).length,
    insertedAssetCount,
  };
}

export function projectCatalogueAssetAliasReferences(
  rows,
  foreignKeyColumns,
  sourceAliasIds,
  tableName,
) {
  if (!Array.isArray(rows)
    || !Array.isArray(foreignKeyColumns)
    || !(sourceAliasIds instanceof Set)) {
    throw new TypeError('invalid_catalogue_asset_alias_projection_arguments');
  }
  if (foreignKeyColumns.length === 0 || sourceAliasIds.size === 0 || rows.length === 0) {
    return { rows, projectedRowCount: 0, projectedValueCount: 0 };
  }
  let projectedRowCount = 0;
  let projectedValueCount = 0;
  const projectedRows = rows.filter((row) => {
    const matches = foreignKeyColumns.filter((column) => {
      const value = row[column];
      return value !== null && value !== undefined && sourceAliasIds.has(String(value));
    });
    if (matches.length === 0) return true;
    projectedRowCount += 1;
    projectedValueCount += matches.length;
    return false;
  });
  if (projectedRows.length + projectedRowCount !== rows.length) {
    throw new Error(`catalogue_asset_alias_projection_mismatch:${tableName}`);
  }
  return { rows: projectedRows, projectedRowCount, projectedValueCount };
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

export function remapCatalogueIdentityForeignKeys(
  rows,
  foreignKeyColumns,
  sourceIdMap,
  tableName,
  identityKind = 'source',
) {
  if (!Array.isArray(rows) || !Array.isArray(foreignKeyColumns) || !(sourceIdMap instanceof Map)) {
    throw new TypeError('invalid_catalogue_identity_foreign_key_remap_arguments');
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
          `catalogue_${identityKind}_identity_mapping_missing:${tableName}:${column}:${sourceId}`,
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

export function remapCatalogueSourceForeignKeys(
  rows,
  foreignKeyColumns,
  sourceIdMap,
  tableName,
) {
  return remapCatalogueIdentityForeignKeys(
    rows,
    foreignKeyColumns,
    sourceIdMap,
    tableName,
    'source',
  );
}

export function rewriteProductionCatalogueAssetUrls(
  rows,
  sourceProjectRef,
  targetProjectRef,
  rewrittenAt,
  targetRows = [],
  primaryKey = ['id'],
  transferColumns = null,
) {
  if (!Array.isArray(rows) || !sourceProjectRef || !targetProjectRef || !rewrittenAt) {
    throw new TypeError('invalid_production_catalogue_asset_rewrite_arguments');
  }
  if (!Array.isArray(targetRows) || !Array.isArray(primaryKey) || primaryKey.length === 0) {
    throw new TypeError('invalid_production_catalogue_asset_rewrite_target_arguments');
  }

  const comparableColumns = Array.isArray(transferColumns) && transferColumns.length > 0
    ? transferColumns
    : null;
  const rowKey = (row) => stableCatalogueJson(primaryKey.map((column) => row[column]));
  const comparableRow = (row) => Object.fromEntries(
    (comparableColumns ?? Object.keys(row)).filter((column) => column !== 'updated_at')
      .map((column) => [column, row[column]]),
  );
  const targetByKey = new Map(targetRows.map((row) => [rowKey(row), row]));

  let rewrittenRowCount = 0;
  let reusedProductionTimestampCount = 0;
  const rewrittenRows = rows.map((row) => {
    const shouldRewrite = row.storage_provider === 'supabase_storage'
      && row.storage_bucket === 'stackr-catalogue-public'
      && typeof row.url === 'string'
      && row.url.includes(sourceProjectRef);
    if (!shouldRewrite) return row;
    rewrittenRowCount += 1;
    const rewrittenRow = {
      ...row,
      url: row.url.replaceAll(sourceProjectRef, targetProjectRef),
      updated_at: rewrittenAt,
    };
    const matchingTarget = targetByKey.get(rowKey(row));
    if (matchingTarget
      && matchingTarget.updated_at !== null
      && matchingTarget.updated_at !== undefined
      && stableCatalogueJson(comparableRow(matchingTarget))
        === stableCatalogueJson(comparableRow(rewrittenRow))) {
      rewrittenRow.updated_at = matchingTarget.updated_at;
      reusedProductionTimestampCount += 1;
    }
    return rewrittenRow;
  });

  return { rows: rewrittenRows, rewrittenRowCount, reusedProductionTimestampCount };
}
