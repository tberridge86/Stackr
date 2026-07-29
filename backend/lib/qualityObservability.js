export const OBSERVABILITY_DASHBOARD_KEYS = Object.freeze([
  'api_health',
  'ingestion_health',
  'catalogue_coverage',
  'scanner_funnel',
  'recognition_quality',
  'pricing_freshness',
  'cost_per_1000_scans',
  'provider_dependency',
  'model_index_versions',
]);

const EVENT_KEYS = new Set([
  'requestId', 'traceId', 'spanId', 'sourceComponent', 'eventType', 'routeId',
  'method', 'statusCode', 'durationMs', 'cacheStatus', 'modelVersion',
  'indexVersion', 'catalogueVersion', 'metricSummary', 'observedAt',
]);
const PROHIBITED_KEY = /^(?:(?:raw)?image(?:path|url|key|bytes|payload)|ocr(?:text|payload)|query(?:string|text)|user(?:id|email)|accountId|deviceId|accessToken|refreshToken|secret|authorization|providerPayload|email)$/i;

function assertSafeObject(value, path = 'payload') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafeObject(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (PROHIBITED_KEY.test(key)) throw new Error(`Sensitive observability field is forbidden at ${path}.${key}.`);
    assertSafeObject(child, `${path}.${key}`);
  }
}

export function validateOperationalEvent(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Operational event must be an object.');
  for (const key of Object.keys(input)) if (!EVENT_KEYS.has(key)) throw new Error(`Unsupported operational event field: ${key}.`);
  assertSafeObject(input.metricSummary ?? {});
  if (!/^[a-z][a-z0-9_-]{1,63}$/.test(String(input.sourceComponent ?? ''))) throw new Error('Invalid event source component.');
  if (!/^[a-z][a-z0-9_.-]{1,95}$/.test(String(input.eventType ?? ''))) throw new Error('Invalid event type.');
  return input;
}

export function validateQualityReportPayload(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Quality report payload must be an object.');
  if (!/^[a-f0-9]{64}$/.test(String(input.manifestSha256 ?? ''))) throw new Error('manifestSha256 must be a lowercase SHA-256.');
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,191}$/.test(String(input.runKey ?? ''))) throw new Error('Invalid quality run key.');
  if (!['development', 'test', 'staging', 'production'].includes(input.environment)) throw new Error('Invalid quality environment.');
  if (!input.report || !Array.isArray(input.report.releaseGates)) throw new Error('A Stackr quality report with release gates is required.');
  assertSafeObject(input.report);
  return input;
}

function unavailableDashboard(key) {
  return {
    dashboardKey: key,
    status: 'unavailable',
    summary: {},
    evidenceCount: 0,
    limitations: ['No dashboard snapshot has been recorded.'],
    generatedAt: null,
    expiresAt: null,
  };
}

export function assembleProtectedDashboard(payload, now = new Date()) {
  const rows = Array.isArray(payload?.dashboards) ? payload.dashboards : [];
  const byKey = new Map(rows.map((row) => [row.dashboard_key, row]));
  return {
    generatedAt: payload?.generatedAt ?? now.toISOString(),
    dashboards: OBSERVABILITY_DASHBOARD_KEYS.map((key) => {
      const row = byKey.get(key);
      if (!row) return unavailableDashboard(key);
      const expired = row.expires_at && new Date(row.expires_at).getTime() <= now.getTime();
      return {
        dashboardKey: key,
        status: expired ? 'unavailable' : row.status,
        summary: row.summary ?? {},
        evidenceCount: Number(row.evidence_count ?? 0),
        limitations: expired ? [...(row.limitations ?? []), 'The latest snapshot has expired.'] : (row.limitations ?? []),
        windowStart: row.window_start ?? null,
        windowEnd: row.window_end ?? null,
        sourceUpdatedAt: row.source_updated_at ?? null,
        generatedAt: row.generated_at ?? null,
        expiresAt: row.expires_at ?? null,
      };
    }),
    latestQualityRun: payload?.latestQualityRun ?? null,
    releaseGates: Array.isArray(payload?.releaseGates) ? payload.releaseGates : [],
  };
}

function apiRpc(supabase, name, args = {}) {
  return supabase.schema('api').rpc(name, args);
}

export async function loadProtectedDashboard(supabase) {
  const { data, error } = await apiRpc(supabase, 'observability_dashboard');
  if (error) throw new Error(`Observability dashboard unavailable: ${error.message}`);
  return assembleProtectedDashboard(data);
}

export async function refreshProtectedDashboard(supabase, windowHours = 24) {
  if (!Number.isInteger(windowHours) || windowHours < 1 || windowHours > 720) {
    throw new Error('windowHours must be an integer between 1 and 720.');
  }
  const { data, error } = await apiRpc(supabase, 'observability_refresh_dashboard_snapshots', {
    p_window_hours: windowHours,
  });
  if (error) throw new Error(`Observability refresh failed: ${error.message}`);
  return assembleProtectedDashboard(data);
}

export async function recordOperationalEvent(supabase, input) {
  const event = validateOperationalEvent(input);
  const { data, error } = await apiRpc(supabase, 'observability_record_event', { p_event: event });
  if (error) throw new Error(`Operational event was not recorded: ${error.message}`);
  return data;
}

export async function storeQualityReport(supabase, input) {
  const payload = validateQualityReportPayload(input);
  const { data, error } = await apiRpc(supabase, 'observability_store_quality_report', {
    p_run_key: payload.runKey,
    p_manifest_sha256: payload.manifestSha256,
    p_environment: payload.environment,
    p_report: payload.report,
    p_source_commit_sha: payload.sourceCommitSha ?? null,
  });
  if (error) throw new Error(`Quality report was not stored: ${error.message}`);
  return data;
}
