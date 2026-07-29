import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function sqlStatementEnds(sql) {
  const ends = [];
  let mode = 'normal';
  let dollarTag = '';

  for (let index = 0; index < sql.length;) {
    const current = sql[index];
    const next = sql[index + 1];

    if (mode === 'line-comment') {
      if (current === '\n') mode = 'normal';
      index += 1;
      continue;
    }
    if (mode === 'block-comment') {
      if (current === '*' && next === '/') {
        mode = 'normal';
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }
    if (mode === 'single-quote') {
      if (current === "'") {
        if (next === "'") index += 2;
        else {
          mode = 'normal';
          index += 1;
        }
      } else {
        index += 1;
      }
      continue;
    }
    if (mode === 'double-quote') {
      if (current === '"') {
        if (next === '"') index += 2;
        else {
          mode = 'normal';
          index += 1;
        }
      } else {
        index += 1;
      }
      continue;
    }
    if (mode === 'dollar-quote') {
      if (sql.startsWith(dollarTag, index)) {
        index += dollarTag.length;
        mode = 'normal';
      } else {
        index += 1;
      }
      continue;
    }

    if (current === '-' && next === '-') {
      mode = 'line-comment';
      index += 2;
      continue;
    }
    if (current === '/' && next === '*') {
      mode = 'block-comment';
      index += 2;
      continue;
    }
    if (current === "'") {
      mode = 'single-quote';
      index += 1;
      continue;
    }
    if (current === '"') {
      mode = 'double-quote';
      index += 1;
      continue;
    }
    if (current === '$') {
      const match = sql.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/);
      if (match) {
        dollarTag = match[0];
        mode = 'dollar-quote';
        index += dollarTag.length;
        continue;
      }
    }
    if (current === ';') ends.push(index + 1);
    index += 1;
  }

  if (!ends.length || ends.at(-1) < sql.length) ends.push(sql.length);
  return ends;
}

export function sqlChunks(sql, maxChars = 12_000) {
  if (!Number.isInteger(maxChars) || maxChars < 1) {
    throw new TypeError('maxChars must be a positive integer.');
  }

  const chunks = [];
  let start = 0;
  let previousEnd = 0;

  for (const end of sqlStatementEnds(sql)) {
    if (end - start > maxChars && previousEnd > start) {
      chunks.push({ start, length: previousEnd - start });
      start = previousEnd;
    }
    previousEnd = end;
  }

  if (previousEnd > start) chunks.push({ start, length: previousEnd - start });
  return chunks;
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  const filePath = process.argv[2];
  const maxChars = Number(process.argv[3] ?? 12_000);
  if (!filePath) throw new Error('Usage: node sqlChunks.mjs <migration.sql> [maxChars]');
  const sql = readFileSync(filePath, 'utf8');
  process.stdout.write(JSON.stringify(sqlChunks(sql, maxChars)));
}
