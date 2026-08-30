#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const MAX_TARGETED_RETRY_ASSETS = 1_500;

const TERMINAL_STATUSES = new Set([
  'mirrored',
  'reused_existing',
  'source_unavailable',
  'would_mirror',
]);

function argument(name, fallback = '') {
  const prefix = `--${name}=`;
  const match = process.argv.find((item) => item.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Expected an integer from ${min} to ${max}, received ${value}.`);
  }
  return parsed;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function validateAttemptReport(report, index) {
  if (!report || typeof report !== 'object' || !Array.isArray(report.results)) {
    throw new Error(`Mirror attempt ${index + 1} does not contain a results array.`);
  }
  for (const result of report.results) {
    if (!result || typeof result.id !== 'string' || typeof result.status !== 'string') {
      throw new Error(`Mirror attempt ${index + 1} contains an invalid asset result.`);
    }
  }
  return report;
}

export function parseMirrorAttemptJsonLines(contents) {
  return String(contents)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => validateAttemptReport(JSON.parse(line), index));
}

export function finalAssetResults(reports) {
  const finalByAssetId = new Map();
  reports.forEach((report, reportIndex) => {
    validateAttemptReport(report, reportIndex);
    for (const result of report.results) {
      finalByAssetId.set(result.id, {
        ...result,
        attemptPhase: report.workflowAttempt?.phase ?? null,
        attemptOrdinal: report.workflowAttempt?.ordinal ?? null,
      });
    }
  });
  return [...finalByAssetId.values()];
}

export function deferredAssetIds(reports, maxAssets = MAX_TARGETED_RETRY_ASSETS) {
  const boundedMax = boundedInteger(maxAssets, MAX_TARGETED_RETRY_ASSETS, 1, MAX_TARGETED_RETRY_ASSETS);
  const ids = finalAssetResults(reports)
    .filter((result) => result.status === 'deferred')
    .map((result) => result.id);
  if (ids.length > boundedMax) {
    throw new Error(`Refusing to retry ${ids.length} assets; the bounded maximum is ${boundedMax}.`);
  }
  return ids;
}

function statusCounts(results) {
  return results.reduce((counts, result) => {
    counts[result.status] = (counts[result.status] ?? 0) + 1;
    return counts;
  }, {});
}

export function aggregateMirrorAttempts(reports, { provider, language } = {}) {
  if (!provider || !language) throw new Error('Provider and language are required.');
  reports.forEach(validateAttemptReport);
  const scanReports = reports.filter((report) => report.workflowAttempt?.phase === 'scan');
  const retryReports = reports.filter((report) => report.workflowAttempt?.phase === 'retry');
  if (scanReports.length === 0) throw new Error('At least one cursor scan report is required.');

  const attemptedResults = reports.flatMap((report) => report.results);
  const finalResults = finalAssetResults(reports);
  const scanFinalResults = finalAssetResults(scanReports);
  const retryResults = retryReports.flatMap((report) => report.results);
  const initiallyDeferred = new Set(
    scanFinalResults.filter((result) => result.status === 'deferred').map((result) => result.id),
  );
  const finalCounts = statusCounts(finalResults);
  const attemptCounts = statusCounts(attemptedResults);
  const retriedAssets = new Set(retryResults.map((result) => result.id));
  const retryRounds = new Set(retryReports.map((report) => report.workflowAttempt?.ordinal));
  const unresolvedAssetIds = finalResults
    .filter((result) => result.status === 'deferred' || result.status === 'failed')
    .map((result) => result.id);
  const resolvedAfterRetry = finalResults.filter(
    (result) => initiallyDeferred.has(result.id) && TERMINAL_STATUSES.has(result.status),
  ).length;
  const scanExhausted = scanReports.at(-1)?.cursor?.exhausted === true;
  const finalDeferred = finalCounts.deferred ?? 0;
  const finalFailed = finalCounts.failed ?? 0;

  return {
    schemaVersion: 2,
    provider,
    language,
    batchesAttempted: scanReports.length,
    scanBatchesAttempted: scanReports.length,
    retryRoundsAttempted: retryRounds.size,
    retryBatchesAttempted: retryReports.length,
    assetAttemptsInspected: attemptedResults.length,
    uniqueAssetsInspected: finalResults.length,
    retriedAssets: retriedAssets.size,
    resolvedAfterRetry,
    scanExhausted,
    queueDrained: scanExhausted && finalDeferred === 0 && finalFailed === 0,
    mirrored: finalCounts.mirrored ?? 0,
    reusedExisting: finalCounts.reused_existing ?? 0,
    sourceUnavailable: finalCounts.source_unavailable ?? 0,
    deferred: finalDeferred,
    failed: finalFailed,
    attemptSummary: {
      mirrored: attemptCounts.mirrored ?? 0,
      reusedExisting: attemptCounts.reused_existing ?? 0,
      sourceUnavailable: attemptCounts.source_unavailable ?? 0,
      deferred: attemptCounts.deferred ?? 0,
      failed: attemptCounts.failed ?? 0,
    },
    unresolvedAssetIds,
    finalResults,
    stagingOnly: true,
    releasePercent: 0,
  };
}

async function readReports(input) {
  if (!input) throw new Error('--input=<json-lines-file> is required.');
  return parseMirrorAttemptJsonLines(await readFile(input, 'utf8'));
}

async function main() {
  const command = process.argv[2];
  if (!['pending', 'aggregate'].includes(command)) {
    throw new Error('Use pending or aggregate.');
  }
  if (argument('target') !== 'staging') {
    throw new Error('Mirror attempt processing is restricted to --target=staging.');
  }
  const reports = await readReports(argument('input'));
  if (command === 'pending') {
    const maxAssets = boundedInteger(
      argument('maxAssets', String(MAX_TARGETED_RETRY_ASSETS)),
      MAX_TARGETED_RETRY_ASSETS,
      1,
      MAX_TARGETED_RETRY_ASSETS,
    );
    const ids = deferredAssetIds(reports, maxAssets);
    process.stdout.write(ids.length ? `${ids.join('\n')}\n` : '');
    return;
  }
  const report = aggregateMirrorAttempts(reports, {
    provider: argument('provider'),
    language: argument('language'),
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
