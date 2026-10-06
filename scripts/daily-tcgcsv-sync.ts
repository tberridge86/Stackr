/**
 * Compatibility entry point for the former daily TCGCSV card sync.
 *
 * The old implementation read prices back through the Stackr API and wrote
 * them again as snapshots. Keep this command name for deployment tooling,
 * but delegate to the Node-only provider importer instead. Importing this
 * module has no database or provider side effects.
 */
export async function runDailyTcgcsvSync(args = process.argv.slice(2)) {
  const { mainCatalogueBulkPrices } = await import('./refresh-catalogue-bulk-prices.mjs');
  return mainCatalogueBulkPrices(args);
}
if (process.argv[1]?.replace(/\\/g, '/').endsWith('/daily-tcgcsv-sync.ts')) {
  runDailyTcgcsvSync().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
