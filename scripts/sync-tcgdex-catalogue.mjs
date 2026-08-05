#!/usr/bin/env node

console.error(JSON.stringify({
  ok: false,
  error: 'Legacy TCGdex direct catalogue sync is disabled. Provider records must be imported through the staging ingest pipeline before reconciliation.',
  replacement: 'npm run catalogue:ingest -- run-language --source=tcgdex --language=<en|ja|zh-tw|zh-cn|ko> --target=staging',
}, null, 2));
process.exit(1);
