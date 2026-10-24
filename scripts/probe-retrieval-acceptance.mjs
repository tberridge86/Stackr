import { readFile, stat } from 'node:fs/promises';
import { probeRetrievalAcceptance } from './lib/retrieval-acceptance.mjs';

// Explicit invocation performs bounded public GETs. No credentials, write calls,
// cache flushes or automatic production defaults are accepted.
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--cohort') {
  console.error('Usage: node scripts/probe-retrieval-acceptance.mjs --cohort <approved-cohort.json>');
  process.exitCode = 2;
} else {
  try {
    if ((await stat(args[1])).size > 1024 * 1024) throw new Error('cohort_too_large');
    const file = await readFile(args[1]);
    if (file.length > 1024 * 1024) throw new Error('cohort_too_large');
    const report = await probeRetrievalAcceptance(JSON.parse(file.toString('utf8')), { surface: 'live_api' });
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  } catch {
    console.error('Retrieval probe failed: invalid cohort, configuration or unreadable input.');
    process.exitCode = 2;
  }
}
