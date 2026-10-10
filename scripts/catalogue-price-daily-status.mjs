const MAX_GUIDE_AGE_MS = 48 * 60 * 60 * 1000;

/** Use provider publication time, never the time a cached file was read. */
export function dailyGuideFreshness(sourceAt, now = Date.now()) {
  const timestamp = Date.parse(sourceAt ?? '');
  const age = now - timestamp;
  const state = !Number.isFinite(timestamp) ? 'unknown'
    : age < -300000 ? 'future' : age > MAX_GUIDE_AGE_MS ? 'stale' : 'fresh';
  return { sourceAt: sourceAt ?? null, state, ageHours: Number.isFinite(age) ? Math.round(age / 36000) / 100 : null };
}

export function requireFreshDailyGuide(sourceAt, now = Date.now()) {
  const freshness = dailyGuideFreshness(sourceAt, now);
  if (freshness.state !== 'fresh') throw Error(`Daily price guide is ${freshness.state}; retained prices must not be republished as current.`);
  return freshness;
}

/** Keep logs bounded while preserving the full offline/returned report. */
export function summarizeCatalogueDailyRun(report, now = Date.now()) {
  const coverage = report.coverage;
  const languages = {};
  for (const row of coverage?.cards ?? []) {
    const counts = languages[row.language_code] ??= {};
    for (const field of ['total', 'supported', 'mapped', 'unmapped', 'priced', 'stale', 'missing_quote', 'retry', 'unsupported']) {
      counts[field] = (counts[field] ?? 0) + row[field];
    }
  }
  const provider = dailyGuideFreshness(report.datasetAt, now);
  const classifiedRows = Object.values(languages).reduce((sum, row) => sum + row.total, 0);
  const publishedRows = coverage?.diagnostics?.scanned;
  const denominatorVerified = Number.isSafeInteger(publishedRows) && publishedRows >= classifiedRows
    && Boolean(coverage?.diagnostics?.catalogueVersions?.length);
  const processingComplete = ['complete', 'needs_mapping'].includes(report.health?.runStatus)
    && report.health?.groups?.length > 0
    && report.health.groups.every(group => ['complete', 'unmapped'].includes(group.status) && Number.isSafeInteger(group.total) && group.total > 0);
  const fullCatalogueCurrent = Boolean(coverage?.cards?.length) && denominatorVerified && publishedRows === classifiedRows
    && processingComplete && provider.state === 'fresh'
    && coverage.openRepairs === 0 && Object.values(languages).every(row => row.priced === row.total && row.stale === 0);
  return { ...report, coverage: coverage ? { ...coverage, cards: undefined, languages } : null,
    dailyReadiness: { provider, processingComplete, coverageVerified: Boolean(coverage) && denominatorVerified,
      publishedRows: denominatorVerified ? publishedRows : null, classifiedRows,
      unclassifiedRows: denominatorVerified ? publishedRows - classifiedRows : null, fullCatalogueCurrent } };
}
