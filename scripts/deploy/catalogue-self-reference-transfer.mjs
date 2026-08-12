export function prepareCatalogueSelfReferenceTransfer(rows, columnNames, tableName) {
  const uniqueColumnNames = [...new Set(columnNames)];
  if (uniqueColumnNames.some((columnName) => !/^[a-z_][a-z0-9_]*$/.test(columnName))) {
    throw new Error(`invalid_self_reference_column:${tableName}`);
  }

  if (uniqueColumnNames.length === 0) {
    return {
      initialRows: rows,
      rowsToRestore: [],
      deferredRowCount: 0,
      deferredValueCount: 0,
    };
  }

  const rowsToRestore = [];
  let deferredValueCount = 0;
  const initialRows = rows.map((row) => {
    const populatedColumns = uniqueColumnNames.filter(
      (columnName) => row[columnName] !== null && row[columnName] !== undefined,
    );
    if (populatedColumns.length === 0) return row;

    rowsToRestore.push(row);
    deferredValueCount += populatedColumns.length;
    const initialRow = { ...row };
    for (const columnName of uniqueColumnNames) initialRow[columnName] = null;
    return initialRow;
  });

  return {
    initialRows,
    rowsToRestore,
    deferredRowCount: rowsToRestore.length,
    deferredValueCount,
  };
}
