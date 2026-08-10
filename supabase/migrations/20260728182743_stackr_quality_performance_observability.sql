begin;

create schema if not exists audit;

revoke all on schema audit from public, anon, authenticated;
grant usage on schema audit to service_role;

create function audit.quality_observability_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function audit.quality_observability_set_updated_at() from public, anon, authenticated;
grant execute on function audit.quality_observability_set_updated_at() to service_role;

create table audit.quality_gold_sets (
  id uuid primary key default gen_random_uuid(),
  gold_set_key text not null unique,
  schema_version text not null,
  status text not null default 'draft'
    check (status in ('draft', 'locked', 'retired')),
  manifest_sha256 text not null,
  source_commit_sha text,
  split_strategy jsonb not null default '{}'::jsonb,
  evidence_counts jsonb not null default '{}'::jsonb,
  strata_coverage jsonb not null default '{}'::jsonb,
  leakage_report jsonb not null default '{}'::jsonb,
  limitations text[] not null default array[]::text[],
  synthetic_only boolean not null default true,
  approved_for_claims boolean not null default false,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (gold_set_key ~ '^[a-z0-9][a-z0-9._-]{2,159}$'),
  check (manifest_sha256 ~ '^[a-f0-9]{64}$'),
  check (source_commit_sha is null or source_commit_sha ~ '^[a-f0-9]{7,64}$'),
  check (
    not approved_for_claims
    or (status = 'locked' and not synthetic_only and approved_at is not null)
  )
);

create table audit.quality_evaluation_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique,
  gold_set_id uuid references audit.quality_gold_sets(id) on delete restrict,
  environment text not null
    check (environment in ('development', 'test', 'staging', 'production')),
  status text not null default 'running'
    check (status in ('running', 'completed', 'blocked', 'failed')),
  claim_status text not null default 'blocked'
    check (claim_status in ('blocked', 'internal_only', 'release_candidate')),
  service_version text,
  gateway_version text,
  model_version text,
  index_version text,
  scoring_config_version text,
  catalogue_version text,
  source_commit_sha text,
  real_world_evidence boolean not null default false,
  synthetic_only boolean not null default true,
  evidence_counts jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  breakdowns jsonb not null default '{}'::jsonb,
  leakage_report jsonb not null default '{}'::jsonb,
  limitations text[] not null default array[]::text[],
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (run_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,191}$'),
  check (source_commit_sha is null or source_commit_sha ~ '^[a-f0-9]{7,64}$'),
  check (
    claim_status <> 'release_candidate'
    or (status = 'completed' and real_world_evidence and not synthetic_only and gold_set_id is not null)
  )
);

create table audit.quality_release_gate_results (
  id bigint generated always as identity primary key,
  evaluation_run_id uuid not null references audit.quality_evaluation_runs(id) on delete cascade,
  gate_key text not null,
  target_operator text not null
    check (target_operator in ('lte', 'gte', 'eq', 'zero')),
  target_value numeric,
  actual_value numeric,
  unit text not null,
  status text not null
    check (status in ('pass', 'fail', 'insufficient_data', 'not_applicable')),
  evidence_count integer not null default 0 check (evidence_count >= 0),
  reason text not null,
  created_at timestamptz not null default now(),
  unique (evaluation_run_id, gate_key)
);

create table audit.observability_events (
  id bigint generated always as identity primary key,
  event_id uuid not null default gen_random_uuid() unique,
  trace_id text,
  span_id text,
  parent_span_id text,
  request_id text,
  source_component text not null
    check (source_component in ('gateway', 'backend', 'database', 'recognition', 'ingestion', 'pricing', 'catalogue', 'provider')),
  event_type text not null
    check (event_type in ('request', 'request.completed', 'dependency', 'recognition_result', 'ingestion_run', 'pricing_refresh', 'catalogue_snapshot', 'provider_request')),
  route_id text,
  method text check (method is null or method in ('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD')),
  status_code integer check (status_code is null or status_code between 100 and 599),
  duration_ms numeric check (duration_ms is null or duration_ms >= 0),
  cache_status text check (cache_status is null or cache_status in ('HIT', 'MISS', 'STALE', 'BYPASS', 'NONE')),
  model_version text,
  index_version text,
  catalogue_version text,
  metric_summary jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  check (trace_id is null or trace_id ~ '^[a-f0-9]{32}$'),
  check (span_id is null or span_id ~ '^[a-f0-9]{16}$'),
  check (parent_span_id is null or parent_span_id ~ '^[a-f0-9]{16}$'),
  check (route_id is null or route_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
  check (expires_at > observed_at)
);

create table audit.observability_trace_spans (
  id bigint generated always as identity primary key,
  trace_id text not null,
  span_id text not null,
  parent_span_id text,
  service_name text not null,
  operation_name text not null,
  span_kind text not null
    check (span_kind in ('server', 'client', 'database', 'internal')),
  status text not null
    check (status in ('ok', 'error', 'unset')),
  duration_ms numeric not null check (duration_ms >= 0),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  request_id text,
  safe_attributes jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now(),
  unique (trace_id, span_id),
  check (trace_id ~ '^[a-f0-9]{32}$'),
  check (span_id ~ '^[a-f0-9]{16}$'),
  check (parent_span_id is null or parent_span_id ~ '^[a-f0-9]{16}$'),
  check (ended_at >= started_at),
  check (expires_at > ended_at)
);

create table audit.provider_cost_observations (
  id uuid primary key default gen_random_uuid(),
  provider_code text not null,
  currency_code text not null,
  cost_minor_units bigint not null check (cost_minor_units >= 0),
  request_count bigint not null default 0 check (request_count >= 0),
  scan_count bigint not null default 0 check (scan_count >= 0),
  cost_basis text not null
    check (cost_basis in ('invoice', 'actual_usage', 'manual_verified', 'estimated')),
  source_reference text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  retrieved_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (provider_code ~ '^[a-z0-9][a-z0-9._-]{1,95}$'),
  check (currency_code ~ '^[A-Z]{3}$'),
  check (period_end > period_start)
);

create table audit.observability_dashboard_snapshots (
  id uuid primary key default gen_random_uuid(),
  dashboard_key text not null
    check (dashboard_key in (
      'api_health',
      'ingestion_health',
      'catalogue_coverage',
      'scanner_funnel',
      'recognition_quality',
      'pricing_freshness',
      'cost_per_1000_scans',
      'provider_dependency',
      'model_index_versions'
    )),
  status text not null
    check (status in ('healthy', 'degraded', 'critical', 'unavailable')),
  window_start timestamptz not null,
  window_end timestamptz not null,
  summary jsonb not null default '{}'::jsonb,
  evidence_count integer not null default 0 check (evidence_count >= 0),
  limitations text[] not null default array[]::text[],
  source_updated_at timestamptz,
  generated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (window_end > window_start),
  check (expires_at > generated_at),
  unique (dashboard_key, window_start, window_end)
);

create index quality_evaluation_runs_completed_idx
  on audit.quality_evaluation_runs(completed_at desc, status, claim_status);

create index quality_evaluation_runs_versions_idx
  on audit.quality_evaluation_runs(model_version, index_version, completed_at desc);

create index quality_release_gates_status_idx
  on audit.quality_release_gate_results(status, gate_key, evaluation_run_id);

create index observability_events_time_idx
  on audit.observability_events(observed_at desc, source_component, event_type);

create index observability_events_route_idx
  on audit.observability_events(route_id, observed_at desc)
  where route_id is not null;

create index observability_events_trace_idx
  on audit.observability_events(trace_id, observed_at)
  where trace_id is not null;

create index observability_events_expiry_idx
  on audit.observability_events(expires_at);

create index observability_trace_spans_trace_idx
  on audit.observability_trace_spans(trace_id, started_at, span_id);

create index observability_trace_spans_expiry_idx
  on audit.observability_trace_spans(expires_at);

create index provider_cost_observations_period_idx
  on audit.provider_cost_observations(currency_code, period_end desc, provider_code);

create index observability_dashboard_latest_idx
  on audit.observability_dashboard_snapshots(dashboard_key, generated_at desc);

drop trigger if exists quality_gold_sets_set_updated_at on audit.quality_gold_sets;
create trigger quality_gold_sets_set_updated_at
before update on audit.quality_gold_sets
for each row execute function audit.quality_observability_set_updated_at();

drop trigger if exists quality_evaluation_runs_set_updated_at on audit.quality_evaluation_runs;
create trigger quality_evaluation_runs_set_updated_at
before update on audit.quality_evaluation_runs
for each row execute function audit.quality_observability_set_updated_at();

drop trigger if exists provider_cost_observations_set_updated_at on audit.provider_cost_observations;
create trigger provider_cost_observations_set_updated_at
before update on audit.provider_cost_observations
for each row execute function audit.quality_observability_set_updated_at();

alter table audit.quality_gold_sets enable row level security;
alter table audit.quality_evaluation_runs enable row level security;
alter table audit.quality_release_gate_results enable row level security;
alter table audit.observability_events enable row level security;
alter table audit.observability_trace_spans enable row level security;
alter table audit.provider_cost_observations enable row level security;
alter table audit.observability_dashboard_snapshots enable row level security;

create policy "service role manages quality gold sets"
  on audit.quality_gold_sets for all to service_role using (true) with check (true);
create policy "service role manages quality evaluation runs"
  on audit.quality_evaluation_runs for all to service_role using (true) with check (true);
create policy "service role manages quality release gates"
  on audit.quality_release_gate_results for all to service_role using (true) with check (true);
create policy "service role manages observability events"
  on audit.observability_events for all to service_role using (true) with check (true);
create policy "service role manages observability trace spans"
  on audit.observability_trace_spans for all to service_role using (true) with check (true);
create policy "service role manages provider cost observations"
  on audit.provider_cost_observations for all to service_role using (true) with check (true);
create policy "service role manages observability dashboards"
  on audit.observability_dashboard_snapshots for all to service_role using (true) with check (true);

revoke all on table audit.quality_gold_sets from public, anon, authenticated;
revoke all on table audit.quality_evaluation_runs from public, anon, authenticated;
revoke all on table audit.quality_release_gate_results from public, anon, authenticated;
revoke all on table audit.observability_events from public, anon, authenticated;
revoke all on table audit.observability_trace_spans from public, anon, authenticated;
revoke all on table audit.provider_cost_observations from public, anon, authenticated;
revoke all on table audit.observability_dashboard_snapshots from public, anon, authenticated;

grant select, insert, update, delete on table audit.quality_gold_sets to service_role;
grant select, insert, update, delete on table audit.quality_evaluation_runs to service_role;
grant select, insert, update, delete on table audit.quality_release_gate_results to service_role;
grant select, insert, update, delete on table audit.observability_events to service_role;
grant select, insert, update, delete on table audit.observability_trace_spans to service_role;
grant select, insert, update, delete on table audit.provider_cost_observations to service_role;
grant select, insert, update, delete on table audit.observability_dashboard_snapshots to service_role;
grant usage, select on all sequences in schema audit to service_role;

create or replace function api.observability_record_event(p_event jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_id uuid;
begin
  if jsonb_typeof(p_event) <> 'object' then
    raise exception 'observability event must be an object';
  end if;
  insert into audit.observability_events (
    request_id, trace_id, span_id, source_component, event_type, route_id,
    method, status_code, duration_ms, cache_status, model_version,
    index_version, catalogue_version, metric_summary, observed_at
  ) values (
    nullif(p_event ->> 'requestId', ''),
    nullif(p_event ->> 'traceId', ''),
    nullif(p_event ->> 'spanId', ''),
    p_event ->> 'sourceComponent',
    p_event ->> 'eventType',
    nullif(p_event ->> 'routeId', ''),
    nullif(p_event ->> 'method', ''),
    nullif(p_event ->> 'statusCode', '')::integer,
    nullif(p_event ->> 'durationMs', '')::numeric,
    nullif(p_event ->> 'cacheStatus', ''),
    nullif(p_event ->> 'modelVersion', ''),
    nullif(p_event ->> 'indexVersion', ''),
    nullif(p_event ->> 'catalogueVersion', ''),
    coalesce(p_event -> 'metricSummary', '{}'::jsonb),
    coalesce(nullif(p_event ->> 'observedAt', '')::timestamptz, now())
  )
  returning event_id into inserted_id;
  return inserted_id;
end;
$$;

create or replace function api.observability_store_dashboard_snapshot(
  p_dashboard_key text,
  p_status text,
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_summary jsonb,
  p_evidence_count integer,
  p_limitations text[],
  p_source_updated_at timestamptz default null,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot_id uuid;
begin
  insert into audit.observability_dashboard_snapshots (
    dashboard_key, status, window_start, window_end, summary, evidence_count,
    limitations, source_updated_at, expires_at
  ) values (
    p_dashboard_key, p_status, p_window_start, p_window_end,
    coalesce(p_summary, '{}'::jsonb), greatest(coalesce(p_evidence_count, 0), 0),
    coalesce(p_limitations, array[]::text[]), p_source_updated_at,
    coalesce(p_expires_at, now() + interval '15 minutes')
  )
  on conflict (dashboard_key, window_start, window_end) do update set
    status = excluded.status,
    summary = excluded.summary,
    evidence_count = excluded.evidence_count,
    limitations = excluded.limitations,
    source_updated_at = excluded.source_updated_at,
    generated_at = now(),
    expires_at = excluded.expires_at
  returning id into snapshot_id;
  return snapshot_id;
end;
$$;

create or replace function api.observability_store_quality_report(
  p_run_key text,
  p_manifest_sha256 text,
  p_environment text,
  p_report jsonb,
  p_source_commit_sha text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  gold_id uuid;
  run_id uuid;
  gate jsonb;
  is_release_candidate boolean := false;
begin
  if jsonb_typeof(p_report) <> 'object' or jsonb_typeof(p_report -> 'releaseGates') <> 'array' then
    raise exception 'invalid Stackr quality report';
  end if;
  if p_report ->> 'claimStatus' = 'release_candidate' then
    select count(*) = 7
      and count(distinct gate ->> 'key') = 7
      and bool_and(gate ->> 'status' = 'pass')
      and bool_and(case gate ->> 'key'
        when 'cached_catalogue_p95_ms' then gate ->> 'targetOperator' = 'lte' and (gate ->> 'targetValue')::numeric = 150
        when 'structured_search_p95_ms' then gate ->> 'targetOperator' = 'lte' and (gate ->> 'targetValue')::numeric = 300
        when 'recognition_embedding_p95_ms' then gate ->> 'targetOperator' = 'lte' and (gate ->> 'targetValue')::numeric = 350
        when 'warm_image_fallback_p95_ms' then gate ->> 'targetOperator' = 'lte' and (gate ->> 'targetValue')::numeric = 1200
        when 'auto_confirm_precision' then gate ->> 'targetOperator' = 'gte' and (gate ->> 'targetValue')::numeric = 0.995
        when 'real_world_top5_accuracy' then gate ->> 'targetOperator' = 'gte' and (gate ->> 'targetValue')::numeric = 0.98
        when 'auto_confirm_below_threshold' then gate ->> 'targetOperator' = 'zero' and (gate ->> 'targetValue')::numeric = 0
        else false end)
    into is_release_candidate
    from jsonb_array_elements(p_report -> 'releaseGates') gate;
    is_release_candidate := is_release_candidate
      and coalesce((p_report #>> '{evidencePolicy,approved}')::boolean, false)
      and coalesce((p_report #>> '{evidenceCounts,realImages}')::integer, 0) > 0
      and coalesce((p_report #>> '{observationCoverage,missingFinalCases}')::integer, 1) = 0
      and coalesce((p_report #>> '{observationCoverage,eligibleFinalCases}')::integer, 0)
        = coalesce((p_report #>> '{observationCoverage,observedFinalCases}')::integer, -1)
      and not coalesce((p_report #>> '{leakage,physicalCardLeakage}')::boolean, true)
      and not coalesce((p_report #>> '{leakage,captureSessionLeakage}')::boolean, true)
      and coalesce(jsonb_array_length(p_report #> '{strataCoverage,missing}'), 1) = 0;
    if not is_release_candidate then
      raise exception 'release candidate report does not satisfy immutable evidence and gate requirements';
    end if;
  end if;
  insert into audit.quality_gold_sets (
    gold_set_key, schema_version, status, manifest_sha256, source_commit_sha,
    evidence_counts, strata_coverage, leakage_report, limitations,
    synthetic_only, approved_for_claims, approved_at
  ) values (
    p_report ->> 'datasetKey', p_report ->> 'schemaVersion',
    case when is_release_candidate then 'locked' else 'draft' end,
    p_manifest_sha256, p_source_commit_sha,
    coalesce(p_report -> 'evidenceCounts', '{}'::jsonb),
    coalesce(p_report -> 'strataCoverage', '{}'::jsonb),
    coalesce(p_report -> 'leakage', '{}'::jsonb),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_report -> 'limitations', '[]'::jsonb))), array[]::text[]),
    coalesce((p_report #>> '{evidenceCounts,realImages}')::integer, 0) = 0,
    is_release_candidate,
    case when is_release_candidate then now() else null end
  )
  on conflict (gold_set_key) do update set
    schema_version = excluded.schema_version,
    status = excluded.status,
    manifest_sha256 = excluded.manifest_sha256,
    source_commit_sha = excluded.source_commit_sha,
    evidence_counts = excluded.evidence_counts,
    strata_coverage = excluded.strata_coverage,
    leakage_report = excluded.leakage_report,
    limitations = excluded.limitations,
    synthetic_only = excluded.synthetic_only,
    approved_for_claims = excluded.approved_for_claims,
    approved_at = excluded.approved_at
  returning id into gold_id;

  insert into audit.quality_evaluation_runs (
    run_key, gold_set_id, environment, status, claim_status, model_version,
    index_version, source_commit_sha, real_world_evidence, synthetic_only,
    evidence_counts, metrics, breakdowns, leakage_report, limitations, completed_at
  ) values (
    p_run_key, gold_id, p_environment, 'completed', p_report ->> 'claimStatus',
    p_report #>> '{modelVersions,0}', p_report #>> '{indexVersions,0}', p_source_commit_sha,
    coalesce((p_report #>> '{evidenceCounts,realImages}')::integer, 0) > 0,
    coalesce((p_report #>> '{evidenceCounts,realImages}')::integer, 0) = 0,
    coalesce(p_report -> 'evidenceCounts', '{}'::jsonb),
    coalesce(p_report -> 'metrics', '{}'::jsonb) || jsonb_build_object('performance', coalesce(p_report -> 'performance', '{}'::jsonb)),
    coalesce(p_report -> 'breakdowns', '{}'::jsonb),
    coalesce(p_report -> 'leakage', '{}'::jsonb),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_report -> 'limitations', '[]'::jsonb))), array[]::text[]),
    coalesce(nullif(p_report ->> 'generatedAt', '')::timestamptz, now())
  )
  on conflict (run_key) do update set
    gold_set_id = excluded.gold_set_id,
    status = excluded.status,
    claim_status = excluded.claim_status,
    model_version = excluded.model_version,
    index_version = excluded.index_version,
    source_commit_sha = excluded.source_commit_sha,
    real_world_evidence = excluded.real_world_evidence,
    synthetic_only = excluded.synthetic_only,
    evidence_counts = excluded.evidence_counts,
    metrics = excluded.metrics,
    breakdowns = excluded.breakdowns,
    leakage_report = excluded.leakage_report,
    limitations = excluded.limitations,
    completed_at = excluded.completed_at
  returning id into run_id;

  delete from audit.quality_release_gate_results where evaluation_run_id = run_id;
  for gate in select value from jsonb_array_elements(p_report -> 'releaseGates') loop
    insert into audit.quality_release_gate_results (
      evaluation_run_id, gate_key, target_operator, target_value, actual_value,
      unit, status, evidence_count, reason
    ) values (
      run_id, gate ->> 'key', gate ->> 'targetOperator',
      nullif(gate ->> 'targetValue', '')::numeric,
      nullif(gate ->> 'actualValue', '')::numeric,
      gate ->> 'unit', gate ->> 'status',
      greatest(coalesce((gate ->> 'evidenceCount')::integer, 0), 0), gate ->> 'reason'
    );
  end loop;
  return run_id;
end;
$$;

create or replace function api.observability_dashboard()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with latest_snapshots as (
    select distinct on (dashboard_key)
      dashboard_key, status, window_start, window_end, summary, evidence_count,
      limitations, source_updated_at, generated_at, expires_at
    from audit.observability_dashboard_snapshots
    order by dashboard_key, generated_at desc
  ), latest_run as (
    select id, run_key, claim_status, model_version, index_version, evidence_counts,
      metrics, limitations, completed_at
    from audit.quality_evaluation_runs
    where status = 'completed'
    order by completed_at desc nulls last
    limit 1
  )
  select jsonb_build_object(
    'dashboards', coalesce((select jsonb_agg(to_jsonb(s) order by s.dashboard_key) from latest_snapshots s), '[]'::jsonb),
    'latestQualityRun', (select to_jsonb(r) from latest_run r),
    'releaseGates', coalesce((
      select jsonb_agg(to_jsonb(g) order by g.gate_key)
      from audit.quality_release_gate_results g
      where g.evaluation_run_id = (select id from latest_run)
    ), '[]'::jsonb),
    'generatedAt', now()
  );
$$;

create or replace function api.observability_apply_retention()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_events integer;
  deleted_spans integer;
  deleted_snapshots integer;
begin
  delete from audit.observability_events where expires_at <= now();
  get diagnostics deleted_events = row_count;
  delete from audit.observability_trace_spans where expires_at <= now();
  get diagnostics deleted_spans = row_count;
  delete from audit.observability_dashboard_snapshots where generated_at < now() - interval '90 days';
  get diagnostics deleted_snapshots = row_count;
  return jsonb_build_object(
    'deletedEvents', deleted_events,
    'deletedTraceSpans', deleted_spans,
    'deletedDashboardSnapshots', deleted_snapshots
  );
end;
$$;

create or replace function api.observability_refresh_dashboard_snapshots(p_window_hours integer default 24)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  window_start_at timestamptz;
  window_end_at timestamptz := now();
  row_count_value integer := 0;
  summary_value jsonb := '{}'::jsonb;
  status_value text := 'unavailable';
  limitations_value text[] := array[]::text[];
  quality_run_id uuid;
begin
  if p_window_hours < 1 or p_window_hours > 720 then
    raise exception 'window hours must be between 1 and 720';
  end if;
  window_start_at := window_end_at - make_interval(hours => p_window_hours);
  perform api.observability_apply_retention();

  select count(*)::integer, jsonb_build_object(
    'requestCount', count(*),
    'errorCount', count(*) filter (where status_code >= 500),
    'errorRate', case when count(*) = 0 then null else (count(*) filter (where status_code >= 500))::numeric / count(*) end,
    'cacheHitRate', case when count(*) filter (where cache_status is not null) = 0 then null
      else (count(*) filter (where cache_status = 'HIT'))::numeric / (count(*) filter (where cache_status is not null)) end,
    'p50LatencyMs', percentile_cont(0.50) within group (order by duration_ms) filter (where duration_ms is not null),
    'p95LatencyMs', percentile_cont(0.95) within group (order by duration_ms) filter (where duration_ms is not null),
    'p99LatencyMs', percentile_cont(0.99) within group (order by duration_ms) filter (where duration_ms is not null)
  ) into row_count_value, summary_value
  from audit.observability_events
  where source_component = 'gateway' and event_type = 'request.completed'
    and observed_at >= window_start_at and observed_at < window_end_at;
  status_value := case
    when row_count_value = 0 then 'unavailable'
    when coalesce((summary_value ->> 'errorRate')::numeric, 0) > 0.05 then 'critical'
    when coalesce((summary_value ->> 'errorRate')::numeric, 0) > 0.01 then 'degraded'
    else 'healthy' end;
  limitations_value := case when row_count_value = 0 then array['No gateway events were recorded in this window.'] else array[]::text[] end;
  perform api.observability_store_dashboard_snapshot('api_health', status_value, window_start_at, window_end_at, summary_value, row_count_value, limitations_value, window_end_at, window_end_at + interval '15 minutes');

  select (select count(*) from ingest.sources)::integer + (select count(*) from ingest.work_queue where created_at >= window_start_at)::integer,
    jsonb_build_object(
      'providerCount', (select count(*) from ingest.sources),
      'healthyProviderCount', (select count(*) from ingest.source_health_current where status = 'ok'),
      'degradedProviderCount', (select count(*) from ingest.source_health_current where status = 'degraded'),
      'unavailableProviderCount', (select count(*) from ingest.source_health_current where status in ('unavailable', 'forbidden', 'failed')),
      'pendingJobs', (select count(*) from ingest.work_queue where status in ('pending', 'leased', 'failed')),
      'deadLetterJobs', (select count(*) from ingest.work_queue where status = 'dead_letter'),
      'failedImports', (select count(*) from ingest.import_runs where status = 'failed' and started_at >= window_start_at)
    ) into row_count_value, summary_value;
  status_value := case
    when row_count_value = 0 then 'unavailable'
    when coalesce((summary_value ->> 'deadLetterJobs')::integer, 0) > 0 or coalesce((summary_value ->> 'unavailableProviderCount')::integer, 0) > 0 then 'critical'
    when coalesce((summary_value ->> 'degradedProviderCount')::integer, 0) > 0 or coalesce((summary_value ->> 'failedImports')::integer, 0) > 0 then 'degraded'
    else 'healthy' end;
  limitations_value := case when row_count_value = 0 then array['No ingestion providers or queue records exist.'] else array[]::text[] end;
  perform api.observability_store_dashboard_snapshot('ingestion_health', status_value, window_start_at, window_end_at, summary_value, row_count_value, limitations_value, window_end_at, window_end_at + interval '15 minutes');

  select count(*)::integer, jsonb_build_object(
    'setCount', count(*),
    'importedCardCount', coalesce(sum(imported_card_total), 0),
    'expectedCardCount', coalesce(sum(expected_card_total), 0),
    'cardsMissingImages', coalesce(sum(cards_missing_images), 0),
    'setsMissingLogos', count(*) filter (where set_missing_logo),
    'duplicateCanonicalKeys', coalesce(sum(duplicate_canonical_keys), 0),
    'unresolvedVariants', coalesce(sum(unresolved_variants), 0),
    'conflictingNames', coalesce(sum(conflicting_names), 0),
    'staleSourceRecords', coalesce(sum(stale_source_records), 0),
    'recordsWithoutLegalUseStatus', coalesce(sum(records_without_legal_use_status), 0),
    'languages', coalesce(jsonb_agg(distinct language_code) filter (where language_code is not null), '[]'::jsonb)
  ) into row_count_value, summary_value from ingest.catalogue_quality_report;
  status_value := case
    when row_count_value = 0 then 'unavailable'
    when coalesce((summary_value ->> 'duplicateCanonicalKeys')::integer, 0) > 0 or coalesce((summary_value ->> 'recordsWithoutLegalUseStatus')::integer, 0) > 0 then 'critical'
    when coalesce((summary_value ->> 'cardsMissingImages')::integer, 0) > 0 or coalesce((summary_value ->> 'unresolvedVariants')::integer, 0) > 0 then 'degraded'
    else 'healthy' end;
  limitations_value := case when row_count_value = 0 then array['No canonical catalogue rows are available for coverage measurement.'] else array[]::text[] end;
  perform api.observability_store_dashboard_snapshot('catalogue_coverage', status_value, window_start_at, window_end_at, summary_value, row_count_value, limitations_value, window_end_at, window_end_at + interval '15 minutes');

  select count(*)::integer, jsonb_build_object(
    'captureSessions', count(distinct scan_session_id),
    'attempts', count(*) filter (where event_type = 'attempt'),
    'candidateSelections', count(*) filter (where event_type = 'candidate_selected'),
    'manualCorrections', count(*) filter (where event_type = 'match_incorrect'),
    'noCorrectCandidate', count(*) filter (where event_type = 'none_correct'),
    'manualSearches', count(*) filter (where event_type = 'manual_search'),
    'rescans', count(*) filter (where event_type = 'rescan'),
    'addedToBinder', count(*) filter (where event_type = 'added_to_binder'),
    'recognitionScans', (select count(*) from ml.recognition_scan_diagnostics where created_at >= window_start_at and created_at < window_end_at),
    'fastPathScans', (select count(*) from ml.recognition_scan_diagnostics where requested_path = 'fast_path' and created_at >= window_start_at and created_at < window_end_at),
    'fallbackPathScans', (select count(*) from ml.recognition_scan_diagnostics where requested_path = 'fallback_path' and created_at >= window_start_at and created_at < window_end_at),
    'ambiguousResults', (select count(*) from ml.recognition_scan_diagnostics where match_status = 'ambiguous' and created_at >= window_start_at and created_at < window_end_at),
    'autoConfirmAllowed', (select count(*) from ml.recognition_scan_diagnostics where requested_next_action = 'auto_confirm_allowed' and created_at >= window_start_at and created_at < window_end_at)
    , 'manualCorrectionRate', case when count(*) filter (where event_type = 'attempt') = 0 then null
      else (count(*) filter (where event_type = 'match_incorrect'))::numeric / (count(*) filter (where event_type = 'attempt')) end
    , 'resolvedWithoutImageUploadRate', case when (select count(*) from ml.recognition_scan_diagnostics where created_at >= window_start_at and created_at < window_end_at) = 0 then null
      else (select count(*) from ml.recognition_scan_diagnostics where requested_path = 'fast_path' and created_at >= window_start_at and created_at < window_end_at)::numeric
        / (select count(*) from ml.recognition_scan_diagnostics where created_at >= window_start_at and created_at < window_end_at) end
  ) into row_count_value, summary_value
  from public.scan_learning_events
  where created_at >= window_start_at and created_at < window_end_at;
  row_count_value := row_count_value + coalesce((summary_value ->> 'recognitionScans')::integer, 0);
  status_value := case when row_count_value = 0 then 'unavailable' else 'healthy' end;
  limitations_value := array['Ximilar fallback rate is unavailable until its feature-flag outcome is emitted as an aggregate event.'];
  if row_count_value = 0 then limitations_value := limitations_value || 'No scanner or recognition events were recorded in this window.'; end if;
  perform api.observability_store_dashboard_snapshot('scanner_funnel', status_value, window_start_at, window_end_at, summary_value, row_count_value, limitations_value, window_end_at, window_end_at + interval '15 minutes');

  select id into quality_run_id from audit.quality_evaluation_runs
  where status = 'completed' order by completed_at desc nulls last limit 1;
  if quality_run_id is null then
    row_count_value := 0;
    summary_value := '{}'::jsonb;
    status_value := 'unavailable';
    limitations_value := array['No completed leakage-controlled quality evaluation has been stored.'];
  else
    select coalesce((evidence_counts ->> 'images')::integer, 0), jsonb_build_object(
      'runKey', run_key,
      'claimStatus', claim_status,
      'modelVersion', model_version,
      'indexVersion', index_version,
      'evidenceCounts', evidence_counts,
      'metrics', metrics,
      'failedGates', (select count(*) from audit.quality_release_gate_results where evaluation_run_id = quality_run_id and status = 'fail'),
      'insufficientGates', (select count(*) from audit.quality_release_gate_results where evaluation_run_id = quality_run_id and status = 'insufficient_data')
    ) into row_count_value, summary_value from audit.quality_evaluation_runs where id = quality_run_id;
    status_value := case
      when coalesce((summary_value ->> 'failedGates')::integer, 0) > 0 then 'critical'
      when coalesce((summary_value ->> 'insufficientGates')::integer, 0) > 0 then 'degraded'
      else 'healthy' end;
    limitations_value := (select limitations from audit.quality_evaluation_runs where id = quality_run_id);
  end if;
  perform api.observability_store_dashboard_snapshot('recognition_quality', status_value, window_start_at, window_end_at, summary_value, row_count_value, coalesce(limitations_value, array[]::text[]), window_end_at, window_end_at + interval '15 minutes');

  select count(*)::integer, jsonb_build_object(
    'estimateCount', count(*),
    'freshEstimateCount', count(*) filter (where freshness = 'fresh' and (stale_after is null or stale_after > window_end_at)),
    'staleEstimateCount', count(*) filter (where freshness in ('stale', 'expired') or stale_after <= window_end_at),
    'unavailableEstimateCount', count(*) filter (where evidence_status = 'unavailable'),
    'averageSampleCount', avg(sample_count),
    'minimumSampleCount', min(sample_count),
    'latestCalculatedAt', max(calculated_at)
  ) into row_count_value, summary_value from api.market_price_estimates;
  status_value := case
    when row_count_value = 0 then 'unavailable'
    when coalesce((summary_value ->> 'staleEstimateCount')::integer, 0) > row_count_value / 2 then 'critical'
    when coalesce((summary_value ->> 'staleEstimateCount')::integer, 0) > 0 then 'degraded'
    else 'healthy' end;
  limitations_value := case when row_count_value = 0 then array['No provider-neutral price estimates are available.'] else array[]::text[] end;
  perform api.observability_store_dashboard_snapshot('pricing_freshness', status_value, window_start_at, window_end_at, summary_value, row_count_value, limitations_value, window_end_at, window_end_at + interval '15 minutes');

  select count(*)::integer, jsonb_build_object(
    'byCurrency', coalesce(jsonb_agg(currency_summary order by currency_code), '[]'::jsonb),
    'estimatedObservationCount', coalesce(sum(estimated_count), 0)
  ) into row_count_value, summary_value from (
    select currency_code,
      jsonb_build_object(
        'currency', currency_code,
        'totalCostMinorUnits', sum(cost_minor_units),
        'scanCount', sum(scan_count),
        'requestCount', sum(request_count),
        'costPer1000ScansMinorUnits', case when sum(scan_count) > 0 then sum(cost_minor_units)::numeric * 1000 / sum(scan_count) else null end
      ) as currency_summary,
      count(*) filter (where cost_basis = 'estimated') as estimated_count
    from audit.provider_cost_observations
    where period_end > window_start_at and period_start < window_end_at
    group by currency_code
  ) costs;
  status_value := case when row_count_value = 0 then 'unavailable' else 'healthy' end;
  limitations_value := case when row_count_value = 0 then array['No attributed provider cost observations exist for this window.'] else array['Estimated costs remain labelled separately from invoiced costs.'] end;
  perform api.observability_store_dashboard_snapshot('cost_per_1000_scans', status_value, window_start_at, window_end_at, summary_value, row_count_value, limitations_value, window_end_at, window_end_at + interval '15 minutes');

  select count(*)::integer, jsonb_build_object(
    'providers', coalesce(jsonb_agg(jsonb_build_object(
      'code', s.code,
      'sourceType', s.source_type,
      'licenceStatus', s.licence_status,
      'healthStatus', coalesce(h.status, 'unknown'),
      'checkedAt', h.checked_at
    ) order by s.code), '[]'::jsonb),
    'unhealthyProviderCount', count(*) filter (where coalesce(h.status, 'unknown') in ('degraded', 'unavailable', 'forbidden', 'failed', 'unknown')),
    'licenceReviewCount', count(*) filter (where s.licence_status <> 'approved')
  ) into row_count_value, summary_value
  from ingest.sources s left join ingest.source_health_current h on h.source_id = s.id;
  status_value := case
    when row_count_value = 0 then 'unavailable'
    when coalesce((summary_value ->> 'unhealthyProviderCount')::integer, 0) > 0 then 'critical'
    when coalesce((summary_value ->> 'licenceReviewCount')::integer, 0) > 0 then 'degraded'
    else 'healthy' end;
  limitations_value := case when row_count_value = 0 then array['No provider registry records are available.'] else array[]::text[] end;
  perform api.observability_store_dashboard_snapshot('provider_dependency', status_value, window_start_at, window_end_at, summary_value, row_count_value, limitations_value, window_end_at, window_end_at + interval '15 minutes');

  select count(*)::integer, jsonb_build_object(
    'indexes', coalesce(jsonb_agg(jsonb_build_object(
      'modelId', model_id,
      'indexVersion', index_version,
      'language', coalesce(language_code, 'all'),
      'status', status,
      'embeddingDimensions', embedding_dimensions,
      'referenceEmbeddingCount', reference_embedding_count,
      'missingEmbeddingCount', missing_embedding_count,
      'activatedAt', activated_at
    ) order by model_id, language_code nulls first, index_version), '[]'::jsonb),
    'activeIndexCount', count(*) filter (where status = 'active'),
    'failedIndexCount', count(*) filter (where status in ('failed', 'blocked')),
    'missingEmbeddingCount', coalesce(sum(missing_embedding_count), 0)
    , 'latestQualityModelVersion', (select model_version from audit.quality_evaluation_runs where status = 'completed' order by completed_at desc nulls last limit 1)
    , 'modelVersionDriftDetected', exists (
      select 1
      from (
        select model_version from audit.quality_evaluation_runs
        where status = 'completed'
        order by completed_at desc nulls last
        limit 1
      ) qr
      join ml.embedding_index_versions ai on ai.status = 'active'
      where qr.model_version is not null and ai.model_id <> qr.model_version
    )
  ) into row_count_value, summary_value from ml.embedding_index_versions;
  status_value := case
    when row_count_value = 0 then 'unavailable'
    when coalesce((summary_value ->> 'failedIndexCount')::integer, 0) > 0 then 'critical'
    when coalesce((summary_value ->> 'activeIndexCount')::integer, 0) = 0 or coalesce((summary_value ->> 'missingEmbeddingCount')::integer, 0) > 0 then 'degraded'
    else 'healthy' end;
  limitations_value := case when row_count_value = 0 then array['No embedding index version has been registered.'] else array[]::text[] end;
  perform api.observability_store_dashboard_snapshot('model_index_versions', status_value, window_start_at, window_end_at, summary_value, row_count_value, limitations_value, window_end_at, window_end_at + interval '15 minutes');

  return api.observability_dashboard();
end;
$$;

revoke all on function api.observability_record_event(jsonb) from public, anon, authenticated;
revoke all on function api.observability_store_dashboard_snapshot(text, text, timestamptz, timestamptz, jsonb, integer, text[], timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function api.observability_store_quality_report(text, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function api.observability_dashboard() from public, anon, authenticated;
revoke all on function api.observability_apply_retention() from public, anon, authenticated;
revoke all on function api.observability_refresh_dashboard_snapshots(integer) from public, anon, authenticated;
grant execute on function api.observability_record_event(jsonb) to service_role;
grant execute on function api.observability_store_dashboard_snapshot(text, text, timestamptz, timestamptz, jsonb, integer, text[], timestamptz, timestamptz) to service_role;
grant execute on function api.observability_store_quality_report(text, text, text, jsonb, text) to service_role;
grant execute on function api.observability_dashboard() to service_role;
grant execute on function api.observability_apply_retention() to service_role;
grant execute on function api.observability_refresh_dashboard_snapshots(integer) to service_role;

comment on table audit.quality_gold_sets is
  'Private manifests and evidence counts for leakage-controlled Stackr gold test sets. Image pixels and storage paths do not belong here.';

comment on table audit.quality_evaluation_runs is
  'Versioned quality evaluation reports. A release_candidate requires real-world evidence and a locked gold set; metrics alone cannot imply production readiness.';

comment on table audit.observability_events is
  'Minimised operational events. Do not store card images, OCR text, query strings, user IDs, device IDs, access tokens or provider payloads.';

comment on table audit.observability_trace_spans is
  'Short-retention distributed trace metadata containing only service operations, timing, status and allowlisted safe attributes.';

comment on table audit.provider_cost_observations is
  'Attributed provider cost evidence used for cost-per-1,000-scans reporting. Estimated costs must remain labelled estimated.';

comment on table audit.observability_dashboard_snapshots is
  'Protected pre-aggregated dashboard data. Missing evidence is represented as unavailable rather than zero.';

commit;
