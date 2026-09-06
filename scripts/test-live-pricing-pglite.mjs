import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { runRehearsal } from './test-live-pricing-migrations.mjs';

function splitSqlStatements(sql) {
  const statements = [];
  let start = 0;
  let quote = null;
  let dollarQuote = null;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < sql.length; index += 1) {
    const current = sql[index];
    const next = sql[index + 1];
    if (lineComment) {
      if (current === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (current === '*' && next === '/') { blockComment = false; index += 1; }
      continue;
    }
    if (dollarQuote) {
      if (sql.startsWith(dollarQuote, index)) { index += dollarQuote.length - 1; dollarQuote = null; }
      continue;
    }
    if (quote) {
      if (current === quote && next === quote && quote === "'") { index += 1; continue; }
      if (current === quote) quote = null;
      continue;
    }
    if (current === '-' && next === '-') { lineComment = true; index += 1; continue; }
    if (current === '/' && next === '*') { blockComment = true; index += 1; continue; }
    if (current === "'" || current === '"') { quote = current; continue; }
    if (current === '$') {
      const match = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(index));
      if (match) { dollarQuote = match[0]; index += dollarQuote.length - 1; continue; }
    }
    if (current === ';') {
      const statement = sql.slice(start, index + 1).trim();
      if (statement) statements.push(statement);
      start = index + 1;
    }
  }
  const trailing = sql.slice(start).trim();
  if (trailing) statements.push(trailing);
  return statements;
}

function modulePath(argv) {
  const index = argv.indexOf('--module-path');
  if (index < 0 || !argv[index + 1]) throw new Error('pass --module-path with the local PGlite dist/index.js path');
  const candidate = path.resolve(argv[index + 1]);
  if (!path.isAbsolute(candidate) || !existsSync(candidate) || path.basename(candidate) !== 'index.js') {
    throw new Error('--module-path must be an existing absolute local PGlite dist/index.js path');
  }
  return candidate;
}

async function main() {
  const entry = modulePath(process.argv.slice(2));
  const cryptoEntry = path.join(path.dirname(entry), 'contrib', 'pgcrypto.js');
  if (!existsSync(cryptoEntry)) throw new Error('the local PGlite pgcrypto extension is missing beside --module-path');
  const { PGlite } = await import(pathToFileURL(entry).href);
  const { pgcrypto } = await import(pathToFileURL(cryptoEntry).href);
  const db = await PGlite.create('memory://', { extensions: { pgcrypto } });
  const client = {
    query: (text, values = []) => db.query(text, values),
    exec: async (text) => {
      for (const [index, statement] of splitSqlStatements(text).entries()) {
        try {
          await db.query(statement);
        } catch (error) {
          error.message = `statement ${index + 1}, ${statement.length} chars (${statement.slice(0, 90).replace(/\s+/g, ' ')}): ${error.message}`;
          throw error;
        }
      }
    },
  };
  try {
    const version = await client.query('select version() as version');
    const database = await client.query('select current_database() as name');
    const rehearsal = await runRehearsal(client, {
      fixture: true,
      // PGlite versions choose different names for their isolated in-memory
      // database. The real CLI remains pinned to stackr_live_pricing_test.
      expectedDatabase: database.rows[0]?.name,
    });
    console.log(JSON.stringify({
      status: 'passed',
      runtime: version.rows[0]?.version ?? 'PGlite PostgreSQL compatibility rehearsal',
      migrations: rehearsal.migrations,
    }));
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
