const IDENTIFIER_START = /[A-Za-z_]/;
const IDENTIFIER_PART = /[A-Za-z0-9_$]/;

export class UnsafeMigrationSqlError extends Error {
  constructor(violations) {
    super(`unsafe_migration_sql:${violations.map(({ code }) => code).join(',')}`);
    this.name = 'UnsafeMigrationSqlError';
    this.code = 'UNSAFE_MIGRATION_SQL';
    this.violations = violations;
  }
}

function isIdentifierStart(character) {
  return character !== undefined && IDENTIFIER_START.test(character);
}

function isIdentifierPart(character) {
  return character !== undefined && IDENTIFIER_PART.test(character);
}

function syntaxError(kind, offset) {
  const error = new SyntaxError(`unterminated_migration_sql_${kind}:${offset}`);
  error.code = 'INVALID_MIGRATION_SQL';
  return error;
}

function dollarQuoteDelimiterAt(sql, offset) {
  if (sql[offset] !== '$' || isIdentifierPart(sql[offset - 1])) return null;
  const closingDollar = sql.indexOf('$', offset + 1);
  if (closingDollar === -1) return null;
  const tag = sql.slice(offset + 1, closingDollar);
  if (tag !== '' && (!isIdentifierStart(tag[0])
    || [...tag.slice(1)].some((character) => !isIdentifierPart(character)))) {
    return null;
  }
  return sql.slice(offset, closingDollar + 1);
}

function isEscapeStringQuote(sql, quoteOffset) {
  if (!/[eE]/.test(sql[quoteOffset - 1] ?? '')) return false;
  return !isIdentifierPart(sql[quoteOffset - 2]);
}

function readTopLevelStatements(sql) {
  if (typeof sql !== 'string') throw new TypeError('migration_sql_must_be_a_string');

  const statements = [];
  let tokens = [];
  let statementOffset = null;
  let offset = 0;

  const finishStatement = () => {
    if (tokens.length > 0) {
      statements.push({
        index: statements.length,
        offset: statementOffset,
        tokens,
      });
    }
    tokens = [];
    statementOffset = null;
  };

  while (offset < sql.length) {
    const character = sql[offset];
    const next = sql[offset + 1];

    if (character === '-' && next === '-') {
      const newline = sql.indexOf('\n', offset + 2);
      offset = newline === -1 ? sql.length : newline + 1;
      continue;
    }

    if (character === '/' && next === '*') {
      const commentOffset = offset;
      let depth = 1;
      offset += 2;
      while (offset < sql.length && depth > 0) {
        if (sql[offset] === '/' && sql[offset + 1] === '*') {
          depth += 1;
          offset += 2;
        } else if (sql[offset] === '*' && sql[offset + 1] === '/') {
          depth -= 1;
          offset += 2;
        } else {
          offset += 1;
        }
      }
      if (depth !== 0) throw syntaxError('block_comment', commentOffset);
      continue;
    }

    if (character === '\'') {
      const quoteOffset = offset;
      const escapeBackslashes = isEscapeStringQuote(sql, quoteOffset);
      offset += 1;
      let closed = false;
      while (offset < sql.length) {
        if (escapeBackslashes && sql[offset] === '\\') {
          offset += Math.min(2, sql.length - offset);
        } else if (sql[offset] === '\'' && sql[offset + 1] === '\'') {
          offset += 2;
        } else if (sql[offset] === '\'') {
          offset += 1;
          closed = true;
          break;
        } else {
          offset += 1;
        }
      }
      if (!closed) throw syntaxError('string', quoteOffset);
      continue;
    }

    if (character === '"') {
      const quoteOffset = offset;
      offset += 1;
      let closed = false;
      while (offset < sql.length) {
        if (sql[offset] === '"' && sql[offset + 1] === '"') {
          offset += 2;
        } else if (sql[offset] === '"') {
          offset += 1;
          closed = true;
          break;
        } else {
          offset += 1;
        }
      }
      if (!closed) throw syntaxError('quoted_identifier', quoteOffset);
      continue;
    }

    const dollarDelimiter = dollarQuoteDelimiterAt(sql, offset);
    if (dollarDelimiter) {
      const bodyOffset = offset;
      const closingDelimiter = sql.indexOf(
        dollarDelimiter,
        offset + dollarDelimiter.length,
      );
      if (closingDelimiter === -1) throw syntaxError('dollar_quote', bodyOffset);
      offset = closingDelimiter + dollarDelimiter.length;
      continue;
    }

    if (character === ';') {
      finishStatement();
      offset += 1;
      continue;
    }

    if (isIdentifierStart(character)) {
      const tokenOffset = offset;
      offset += 1;
      while (isIdentifierPart(sql[offset])) offset += 1;
      if (statementOffset === null) statementOffset = tokenOffset;
      tokens.push({
        offset: tokenOffset,
        value: sql.slice(tokenOffset, offset).toUpperCase(),
      });
      continue;
    }

    offset += 1;
  }

  finishStatement();
  return statements;
}

function transactionControlCode(words) {
  const [first, second] = words;
  if (['BEGIN', 'COMMIT', 'ROLLBACK', 'END', 'ABORT', 'SAVEPOINT', 'RELEASE']
    .includes(first)) {
    return `transaction_control_${first.toLowerCase()}`;
  }
  if (first === 'START' && second === 'TRANSACTION') {
    return 'transaction_control_start_transaction';
  }
  if (first === 'PREPARE' && second === 'TRANSACTION') {
    return 'transaction_control_prepare_transaction';
  }
  if (first === 'SET' && second === 'TRANSACTION') {
    return 'transaction_control_set_transaction';
  }
  return null;
}

function nontransactionalCode(words) {
  const [first, second, third, fourth] = words;
  if (first === 'CALL') return 'nontransactional_call';
  if (first === 'VACUUM') return 'nontransactional_vacuum';
  if (first === 'ALTER' && second === 'SYSTEM') return 'nontransactional_alter_system';
  if (['CREATE', 'DROP'].includes(first)
    && ['DATABASE', 'TABLESPACE'].includes(second)) {
    return `nontransactional_${first.toLowerCase()}_${second.toLowerCase()}`;
  }
  if (first === 'CREATE') {
    const indexOffset = second === 'INDEX' ? 1 : (
      second === 'UNIQUE' && third === 'INDEX' ? 2 : -1
    );
    if (indexOffset !== -1 && words[indexOffset + 1] === 'CONCURRENTLY') {
      return 'nontransactional_create_index_concurrently';
    }
  }
  if (first === 'DROP' && second === 'INDEX' && third === 'CONCURRENTLY') {
    return 'nontransactional_drop_index_concurrently';
  }
  if (first === 'REINDEX') {
    if (words.includes('CONCURRENTLY')) {
      return 'nontransactional_reindex_concurrently';
    }
    const reindexScope = words.find((word) => (
      ['INDEX', 'TABLE', 'SCHEMA', 'DATABASE', 'SYSTEM'].includes(word)
    ));
    if (['SCHEMA', 'DATABASE', 'SYSTEM'].includes(reindexScope)) {
      return `nontransactional_reindex_${reindexScope.toLowerCase()}`;
    }
  }
  // Keep the fixed-position destructuring honest when this classifier expands.
  void fourth;
  return null;
}

export function findUnsafeTopLevelMigrationStatements(sql) {
  const violations = [];
  for (const statement of readTopLevelStatements(sql)) {
    const words = statement.tokens.map(({ value }) => value);
    const code = transactionControlCode(words) ?? nontransactionalCode(words);
    if (code) {
      violations.push({
        code,
        offset: statement.offset,
        statementIndex: statement.index,
      });
    }
  }
  return violations;
}

export function assertRollbackSafeMigrationSql(sql) {
  const violations = findUnsafeTopLevelMigrationStatements(sql);
  if (violations.length > 0) throw new UnsafeMigrationSqlError(violations);
}
