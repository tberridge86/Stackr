#!/usr/bin/env node
/**
 * Offline deployment entry point for the runtime PokeTrace activation gate.
 * This performs no provider or database access.
 */
import { pathToFileURL } from 'node:url';
import { checkPokeTraceActivationReadiness } from '../backend/lib/pricingV2/pokeTraceActivation.js';

export {
  checkPokeTraceActivationReadiness,
  resolveReviewedPokeTraceReportPath,
  resolveReviewedTerapeakRightsReviewPath,
} from '../backend/lib/pricingV2/pokeTraceActivation.js';

function parseArgs(args) {
  const reportArg = args.find((arg) => arg.startsWith('--report='));
  return { report: reportArg ? reportArg.slice('--report='.length) : '' };
}

function main() {
  const { report } = parseArgs(process.argv.slice(2));
  const result = checkPokeTraceActivationReadiness({
    env: {
      ...process.env,
      POKETRACE_TERAPEAK_BENCHMARK_REPORT: report || process.env.POKETRACE_TERAPEAK_BENCHMARK_REPORT,
    },
  });
  console.log(JSON.stringify(result));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error?.message ?? String(error));
    process.exitCode = 1;
  }
}
