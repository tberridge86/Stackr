function assertForeignKeyShape(foreignKey, tableName) {
  if (!foreignKey || typeof foreignKey !== 'object'
    || !foreignKey.constraintName || !foreignKey.parentTable
    || !Array.isArray(foreignKey.columnNames) || foreignKey.columnNames.length === 0) {
    throw new Error(`invalid_excluded_parent_foreign_key:${tableName}`);
  }
}

function declarationKey(value) {
  return `${value.table}:${value.constraintName}`;
}

export function validateCatalogueExcludedParentForeignKeys({
  foreignKeys,
  transferColumns,
  selectedTables,
  tableName,
  rows,
  declaredProjections,
}) {
  const transferredColumns = new Set(transferColumns);
  const selectedTableNames = new Set(selectedTables);
  const declarationsByKey = new Map(
    declaredProjections.map((declaration) => [declarationKey(declaration), declaration]),
  );
  if (declarationsByKey.size !== declaredProjections.length) {
    throw new Error('duplicate_excluded_parent_reference_projection_declaration');
  }
  const projectedForeignKeys = [];

  for (const foreignKey of foreignKeys) {
    assertForeignKeyShape(foreignKey, tableName);
    if (selectedTableNames.has(foreignKey.parentTable)) continue;

    const selectedColumns = foreignKey.columnNames.filter((column) => transferredColumns.has(column));
    if (selectedColumns.length === 0) continue;
    if (selectedColumns.length !== foreignKey.columnNames.length) {
      throw new Error(
        `excluded_parent_reference_transfer_columns_incomplete:${tableName}`
        + `:${foreignKey.constraintName}`,
      );
    }
    let populatedRowCount = 0;
    for (const row of rows) {
      if (selectedColumns.some((column) => row[column] !== null && row[column] !== undefined)) {
        populatedRowCount += 1;
      }
    }
    const key = declarationKey({ table: tableName, constraintName: foreignKey.constraintName });
    const declaration = declarationsByKey.get(key);
    if (populatedRowCount === 0 && !declaration) continue;
    if (!declaration) {
      throw new Error(
        `undeclared_excluded_parent_reference_projection:${tableName}`
        + `:${foreignKey.constraintName}:${populatedRowCount}`,
      );
    }
    if (foreignKey.columnNames.length !== 1
      || declaration.parentTable !== foreignKey.parentTable
      || declaration.action !== 'set_null'
      || JSON.stringify(declaration.columnNames) !== JSON.stringify(foreignKey.columnNames)) {
      throw new Error(
        `excluded_parent_reference_projection_contract_mismatch:${tableName}`
        + `:${foreignKey.constraintName}`,
      );
    }
    if (!foreignKey.allColumnsNullable) {
      throw new Error(
        `excluded_parent_reference_requires_nullable_columns:${tableName}`
        + `:${foreignKey.constraintName}`,
      );
    }
    if (foreignKey.deleteAction !== 'SET NULL') {
      throw new Error(
        `excluded_parent_reference_requires_on_delete_set_null:${tableName}`
        + `:${foreignKey.constraintName}:${foreignKey.deleteAction}`,
      );
    }
    projectedForeignKeys.push({
      constraintName: foreignKey.constraintName,
      parentTable: foreignKey.parentTable,
      columnNames: [...foreignKey.columnNames],
      deleteAction: foreignKey.deleteAction,
      reason: declaration.reason,
    });
    declarationsByKey.delete(key);
  }

  const unmatchedDeclarations = [...declarationsByKey.values()].filter(
    (declaration) => declaration.table === tableName,
  );
  if (unmatchedDeclarations.length) {
    throw new Error(
      `excluded_parent_reference_projection_declaration_not_matched:${tableName}`
      + `:${unmatchedDeclarations.map((declaration) => declaration.constraintName).join(',')}`,
    );
  }
  return projectedForeignKeys;
}

export function projectCatalogueExcludedParentReferences(rows, foreignKeys, tableName) {
  const projectedColumns = [...new Set(foreignKeys.flatMap((foreignKey) => {
    assertForeignKeyShape(foreignKey, tableName);
    return foreignKey.columnNames;
  }))].sort();
  if (projectedColumns.length === 0) {
    return { rows, projectedColumns, projectedRowCount: 0, projectedValueCount: 0 };
  }

  let projectedRowCount = 0;
  let projectedValueCount = 0;
  const projectedRows = rows.map((row) => {
    const populatedColumns = projectedColumns.filter((column) => (
      row[column] !== null && row[column] !== undefined
    ));
    if (populatedColumns.length === 0) return row;
    projectedRowCount += 1;
    projectedValueCount += populatedColumns.length;
    return {
      ...row,
      ...Object.fromEntries(projectedColumns.map((column) => [column, null])),
    };
  });
  return { rows: projectedRows, projectedColumns, projectedRowCount, projectedValueCount };
}
