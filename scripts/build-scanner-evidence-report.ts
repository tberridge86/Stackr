import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_SCANNER_RELEASE_REQUIREMENTS,
  evaluateScannerReleaseReadiness,
  summarizeBenchmarkObservations,
  type ScannerBenchmarkObservation,
  type ScannerEvidenceSummary,
} from '../lib/scannerCalibration';
import {
  summarizeScannerAnalyticsRows,
  type ScannerAnalyticsEventRow,
} from '../lib/scannerAnalytics';

type BenchmarkResultRow = {
  id: string;
  scan_session_id: string | null;
  predicted_stackr_card_id: string | null;
  correct_stackr_card_id: string | null;
  top_candidate_ids: unknown;
  confidence: number | null;
  no_match: boolean | null;
  incorrect_confident_match: boolean | null;
  first_attempt_success: boolean | null;
  camera_ready_ms: number | null;
  capture_ms: number | null;
  crop_ms: number | null;
  first_candidate_ms: number | null;
  final_result_ms: number | null;
  total_scan_ms: number | null;
  remote_request_count: number | null;
  correction_required: boolean | null;
  rescan_count: number | null;
  duplicate_prevented: boolean | null;
  duplicate_added: boolean | null;
  crash: boolean | null;
  failure_category: string | null;
  scanner_benchmark_runs: {
    scanner_variant: 'production_baseline' | 'candidate';
    threshold_version: string;
    run_label: string;
  } | null;
  scanner_benchmark_cases: {
    case_key: string;
    language: string | null;
    era: string | null;
    lighting: string | null;
    item_type: string | null;
    capture_type: string | null;
    sleeve_status: string | null;
  } | null;
};

function getArg(name: string, fallback?: string) {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function formatPercent(value: number) {
  return `${value.toFixed(1).replace('.0', '')}%`;
}

function formatMs(value: number | null) {
  if (value == null) return 'n/a';
  return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${value}ms`;
}

function metricRows(title: string, summary: ScannerEvidenceSummary) {
  return [
    `### ${title}`,
    '',
    `- Cases: ${summary.sampleSize}`,
    `- Top-one accuracy: ${formatPercent(summary.topOneAccuracy)}`,
    `- Top-three accuracy: ${formatPercent(summary.topThreeAccuracy)}`,
    `- Top-five accuracy: ${formatPercent(summary.topFiveAccuracy)}`,
    `- No-match rate: ${formatPercent(summary.noMatchRate)}`,
    `- Confident wrong-match rate: ${formatPercent(summary.incorrectConfidentMatchRate)}`,
    `- First-attempt success: ${formatPercent(summary.firstAttemptSuccessRate)}`,
    `- Correction rate: ${formatPercent(summary.correctionRate)}`,
    `- Rescan rate: ${formatPercent(summary.rescanRate)}`,
    `- Remote request rate: ${formatPercent(summary.remoteRequestRate)}`,
    `- Average remote requests: ${summary.averageRemoteRequests}`,
    `- Failure rate: ${formatPercent(summary.failureRate)}`,
    `- Duplicate addition rate: ${formatPercent(summary.duplicateAdditionRate)}`,
    `- Crash rate: ${formatPercent(summary.crashRate)}`,
    `- Median camera readiness: ${formatMs(summary.medianCameraReadyMs)}`,
    `- Median capture: ${formatMs(summary.medianCaptureMs)}`,
    `- Median crop: ${formatMs(summary.medianCropMs)}`,
    `- Median first candidate: ${formatMs(summary.medianFirstCandidateMs)}`,
    `- Median final result: ${formatMs(summary.medianFinalResultMs)}`,
    `- Median scan time: ${formatMs(summary.medianTotalScanMs)}`,
    `- 95th percentile scan time: ${formatMs(summary.p95TotalScanMs)}`,
    '',
  ];
}

function normaliseTopCandidateIds(value: unknown) {
  if (Array.isArray(value)) return value.map((entry) => String(entry)).filter(Boolean).slice(0, 5);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map((entry) => String(entry)).filter(Boolean).slice(0, 5) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function toObservation(row: BenchmarkResultRow): ScannerBenchmarkObservation | null {
  const run = row.scanner_benchmark_runs;
  if (!run) return null;
  return {
    caseKey: row.scanner_benchmark_cases?.case_key ?? null,
    scannerVariant: run.scanner_variant,
    thresholdVersion: run.threshold_version,
    language: row.scanner_benchmark_cases?.language ?? null,
    era: row.scanner_benchmark_cases?.era ?? null,
    lighting: row.scanner_benchmark_cases?.lighting ?? null,
    itemType: row.scanner_benchmark_cases?.item_type ?? null,
    captureType: row.scanner_benchmark_cases?.capture_type ?? null,
    sleeveStatus: row.scanner_benchmark_cases?.sleeve_status ?? null,
    correctStackrCardId: row.correct_stackr_card_id,
    predictedStackrCardId: row.predicted_stackr_card_id,
    topCandidateIds: normaliseTopCandidateIds(row.top_candidate_ids),
    confidence: row.confidence,
    noMatch: row.no_match,
    incorrectConfidentMatch: row.incorrect_confident_match,
    firstAttemptSuccess: row.first_attempt_success,
    cameraReadyMs: row.camera_ready_ms,
    captureMs: row.capture_ms,
    cropMs: row.crop_ms,
    firstCandidateMs: row.first_candidate_ms,
    finalResultMs: row.final_result_ms,
    totalScanMs: row.total_scan_ms,
    correctionRequired: row.correction_required,
    rescanCount: row.rescan_count,
    remoteRequestCount: row.remote_request_count,
    failureCategory: row.failure_category,
    duplicatePrevented: row.duplicate_prevented,
    duplicateAdded: row.duplicate_added,
    crash: row.crash,
  };
}

function buildMarkdown(input: {
  benchmarkRows: BenchmarkResultRow[];
  analyticsRows: ScannerAnalyticsEventRow[];
  notes: string[];
}) {
  const observations = input.benchmarkRows
    .map(toObservation)
    .filter((entry): entry is ScannerBenchmarkObservation => Boolean(entry));
  const baseline = summarizeBenchmarkObservations(
    observations.filter((entry) => entry.scannerVariant === 'production_baseline')
  );
  const candidate = summarizeBenchmarkObservations(
    observations.filter((entry) => entry.scannerVariant === 'candidate')
  );
  const readiness = evaluateScannerReleaseReadiness(baseline, candidate, DEFAULT_SCANNER_RELEASE_REQUIREMENTS);
  const analytics = summarizeScannerAnalyticsRows(input.analyticsRows, 14);
  const generatedAt = new Date().toISOString();

  return [
    '# StackR Scanner Calibration Evidence Report',
    '',
    `Generated: ${generatedAt}`,
    '',
    'This report uses stored benchmark rows and scanner analytics only. It does not fabricate physical-device results.',
    '',
    '## Rollout Recommendation',
    '',
    `- Recommendation: ${readiness.recommendation}`,
    `- Ready for next rollout: ${readiness.readyForNextRollout ? 'yes' : 'no'}`,
    `- Minimum comparable cases required: ${DEFAULT_SCANNER_RELEASE_REQUIREMENTS.minComparableCases}`,
    '',
    '## Release Gates',
    '',
    '| Gate | Status | Baseline | Candidate | Requirement |',
    '| --- | --- | ---: | ---: | --- |',
    ...readiness.gates.map((entry) => [
      entry.label,
      entry.status,
      entry.baseline == null ? 'n/a' : String(entry.baseline),
      entry.candidate == null ? 'n/a' : String(entry.candidate),
      entry.requirement,
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |')),
    '',
    '## Controlled Benchmark',
    '',
    ...metricRows('Production baseline', baseline),
    ...metricRows('Candidate scanner', candidate),
    '## Recent Production Analytics',
    '',
    `- Scanner events: ${analytics.eventCount}`,
    `- Attempts: ${analytics.attemptCount}`,
    `- Median scan: ${formatMs(analytics.medianScanMs)}`,
    `- 95th percentile: ${formatMs(analytics.p95ScanMs)}`,
    `- Local match: ${formatPercent(analytics.localMatchPercentage)}`,
    `- Remote fallback: ${formatPercent(analytics.remoteFallbackPercentage)}`,
    `- First-attempt success: ${formatPercent(analytics.firstAttemptSuccessPercentage)}`,
    `- Correction rate: ${formatPercent(analytics.correctionRate)}`,
    `- Rescan rate: ${formatPercent(analytics.rescanRate)}`,
    `- Failure rate: ${formatPercent(analytics.failureRate)}`,
    `- Ximilar usage signal: ${analytics.estimatedXimilarUsage}`,
    '',
    '## Notes',
    '',
    ...(input.notes.length ? input.notes.map((note) => `- ${note}`) : ['- No notes.']),
    '',
    '## Required Before Wider Release',
    '',
    '- Run the same benchmark cases on low, middle and high-end physical devices.',
    '- Include English, Japanese, vintage, modern, holo, reverse-holo, textured, promo, slab and binder-page cases.',
    '- Confirm the candidate does not increase duplicate additions or crash rate.',
    '- Keep raw images out of the benchmark tables unless a user has explicitly consented to training-data retention.',
    '',
  ].join('\n');
}

async function main() {
  const output = getArg('output', 'reports/scanner-calibration-evidence.md') as string;
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to build scanner evidence from real data.');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const notes: string[] = [];

  const { data: benchmarkRows, error: benchmarkError } = await supabase
    .from('scanner_benchmark_results')
    .select(`
      id,
      scan_session_id,
      predicted_stackr_card_id,
      correct_stackr_card_id,
      top_candidate_ids,
      confidence,
      no_match,
      incorrect_confident_match,
      first_attempt_success,
      camera_ready_ms,
      capture_ms,
      crop_ms,
      first_candidate_ms,
      final_result_ms,
      total_scan_ms,
      remote_request_count,
      correction_required,
      rescan_count,
      duplicate_prevented,
      duplicate_added,
      crash,
      failure_category,
      scanner_benchmark_runs!inner(scanner_variant, threshold_version, run_label),
      scanner_benchmark_cases(case_key, language, era, lighting, item_type, capture_type, sleeve_status)
    `)
    .order('created_at', { ascending: false })
    .limit(5000);

  if (benchmarkError) {
    notes.push(`Benchmark rows could not be loaded: ${benchmarkError.message}`);
  }

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: analyticsRows, error: analyticsError } = await supabase
    .from('scan_learning_events')
    .select('id, created_at, event_type, scan_mode, route_context, frame_metrics, ocr_preview, candidate_count, candidates, selected_card_id, selected_set_id, selected_card_name, outcome, notes, client_version')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(5000);

  if (analyticsError) {
    notes.push(`Recent scanner analytics could not be loaded: ${analyticsError.message}`);
  }

  const markdown = buildMarkdown({
    benchmarkRows: (benchmarkRows ?? []) as unknown as BenchmarkResultRow[],
    analyticsRows: (analyticsRows ?? []) as ScannerAnalyticsEventRow[],
    notes,
  });

  const outputPath = path.resolve(process.cwd(), output);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown, 'utf8');
  console.log(`Scanner evidence report written to ${outputPath}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
