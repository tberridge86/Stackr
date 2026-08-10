create extension if not exists pgcrypto with schema extensions;

create table if not exists public.scanner_threshold_sets (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  status text not null default 'draft' check (status in ('draft', 'internal', 'uat', 'production', 'rolled_back')),
  rollout_stage text not null default 'internal_testers' check (
    rollout_stage in ('internal_testers', 'dev_accounts', 'uat_partners', 'production_small', 'production_wide')
  ),
  thresholds jsonb not null default '{}'::jsonb,
  evidence_report jsonb not null default '{}'::jsonb,
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  activated_at timestamptz
);

create table if not exists public.scanner_benchmark_cases (
  id uuid primary key default gen_random_uuid(),
  case_key text not null unique,
  correct_stackr_card_id text not null,
  correct_set_id text,
  language text not null check (language in ('en', 'ja', 'unknown')),
  era text,
  item_type text not null default 'raw_card' check (item_type in ('raw_card', 'graded_slab', 'binder_page', 'sealed_product')),
  finish text,
  lighting text not null default 'normal',
  device_tier text not null default 'middle' check (device_tier in ('low', 'middle', 'high')),
  scan_intent text not null default 'quick_collection',
  layout text,
  expected_difficulty text not null default 'normal' check (expected_difficulty in ('easy', 'normal', 'hard', 'near_identical')),
  metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scanner_benchmark_runs (
  id uuid primary key default gen_random_uuid(),
  threshold_version text not null,
  scanner_variant text not null check (scanner_variant in ('production_baseline', 'candidate')),
  run_label text not null,
  app_version text,
  device_family text,
  device_tier text check (device_tier in ('low', 'middle', 'high', 'unknown')),
  os_name text,
  os_version text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  metrics jsonb not null default '{}'::jsonb,
  notes text
);

create table if not exists public.scanner_benchmark_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.scanner_benchmark_runs(id) on delete cascade,
  case_id uuid references public.scanner_benchmark_cases(id) on delete set null,
  scan_session_id text,
  predicted_stackr_card_id text,
  correct_stackr_card_id text,
  top_candidate_ids jsonb not null default '[]'::jsonb,
  top_one_correct boolean,
  top_three_correct boolean,
  first_attempt_success boolean not null default false,
  total_scan_ms integer,
  remote_request_count integer not null default 0,
  correction_required boolean not null default false,
  rescan_count integer not null default 0,
  duplicate_prevented boolean not null default false,
  duplicate_added boolean not null default false,
  crash boolean not null default false,
  failure_category text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists scanner_threshold_sets_active_idx
  on public.scanner_threshold_sets(status, activated_at desc, updated_at desc);

create index if not exists scanner_benchmark_cases_active_idx
  on public.scanner_benchmark_cases(active, language, item_type, expected_difficulty);

create index if not exists scanner_benchmark_runs_variant_idx
  on public.scanner_benchmark_runs(scanner_variant, threshold_version, started_at desc);

create index if not exists scanner_benchmark_results_run_idx
  on public.scanner_benchmark_results(run_id, created_at);

create index if not exists scanner_benchmark_results_failure_idx
  on public.scanner_benchmark_results(failure_category, created_at desc)
  where failure_category is not null;

alter table public.scanner_threshold_sets enable row level security;
alter table public.scanner_benchmark_cases enable row level security;
alter table public.scanner_benchmark_runs enable row level security;
alter table public.scanner_benchmark_results enable row level security;

drop policy if exists "Admins can manage scanner threshold sets" on public.scanner_threshold_sets;
create policy "Admins can manage scanner threshold sets"
  on public.scanner_threshold_sets
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can manage scanner benchmark cases" on public.scanner_benchmark_cases;
create policy "Admins can manage scanner benchmark cases"
  on public.scanner_benchmark_cases
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can manage scanner benchmark runs" on public.scanner_benchmark_runs;
create policy "Admins can manage scanner benchmark runs"
  on public.scanner_benchmark_runs
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can manage scanner benchmark results" on public.scanner_benchmark_results;
create policy "Admins can manage scanner benchmark results"
  on public.scanner_benchmark_results
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.get_active_scanner_threshold_set()
returns table (
  version text,
  status text,
  rollout_stage text,
  thresholds jsonb,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    sts.version,
    sts.status,
    sts.rollout_stage,
    sts.thresholds,
    sts.updated_at
  from public.scanner_threshold_sets sts
  where sts.status in ('internal', 'uat', 'production')
  order by
    case sts.status when 'production' then 1 when 'uat' then 2 when 'internal' then 3 else 4 end,
    sts.activated_at desc nulls last,
    sts.updated_at desc
  limit 1;
$$;

grant execute on function public.get_active_scanner_threshold_set() to authenticated;
grant select, insert, update, delete on table public.scanner_threshold_sets to authenticated, service_role;
grant select, insert, update, delete on table public.scanner_benchmark_cases to authenticated, service_role;
grant select, insert, update, delete on table public.scanner_benchmark_runs to authenticated, service_role;
grant select, insert, update, delete on table public.scanner_benchmark_results to authenticated, service_role;

insert into public.scanner_threshold_sets (
  version,
  status,
  rollout_stage,
  thresholds,
  evidence_report,
  notes
) values (
  'stackr-scanner-calibration-v1',
  'draft',
  'internal_testers',
  '{
    "autoCapture": {
      "requiredStableFrames": 2,
      "duplicateCooldownMs": 2500,
      "highConfidenceSingleFrameScore": 0.74,
      "minStabilityScore": 0.58
    },
    "scanQualityProfiles": {
      "balanced": {
        "minFocusScore": 0.42,
        "minExposureScore": 0.42,
        "minGlareScore": 0.3,
        "minFramingScore": 0.6,
        "minStabilityScore": 0.58,
        "minObstructionScore": 0.72,
        "minPerspectiveScore": 0.46,
        "minCardCoverage": 0.08,
        "maxCardCoverage": 0.84,
        "maxBrightRatio": 0.22,
        "maxGlareRatio": 0.24,
        "maxSkinRatio": 0.13,
        "maxCenterShiftRatio": 0.085,
        "maxAreaChangeRatio": 0.18,
        "maxPerspectiveDistortion": 0.34
      },
      "low-end": {
        "minFocusScore": 0.34,
        "minExposureScore": 0.36,
        "minGlareScore": 0.24,
        "minFramingScore": 0.56,
        "minStabilityScore": 0.5,
        "minObstructionScore": 0.68,
        "minPerspectiveScore": 0.42,
        "minCardCoverage": 0.07,
        "maxCardCoverage": 0.88,
        "maxBrightRatio": 0.28,
        "maxGlareRatio": 0.3,
        "maxSkinRatio": 0.15,
        "maxCenterShiftRatio": 0.12,
        "maxAreaChangeRatio": 0.24,
        "maxPerspectiveDistortion": 0.42
      },
      "high-end": {
        "minFocusScore": 0.48,
        "minExposureScore": 0.46,
        "minGlareScore": 0.36,
        "minFramingScore": 0.64,
        "minStabilityScore": 0.64,
        "minObstructionScore": 0.76,
        "minPerspectiveScore": 0.5,
        "minCardCoverage": 0.09,
        "maxCardCoverage": 0.8,
        "maxBrightRatio": 0.18,
        "maxGlareRatio": 0.2,
        "maxSkinRatio": 0.11,
        "maxCenterShiftRatio": 0.065,
        "maxAreaChangeRatio": 0.14,
        "maxPerspectiveDistortion": 0.28
      }
    },
    "recognition": {
      "localAutoConfirmConfidence": 0.84,
      "localTopThreeMinConfidence": 0.62,
      "ambiguousVariantMaxGap": 0.08,
      "visualSimilarityMin": 0.72,
      "visualFinalScoreMin": 0.76,
      "fallbackCandidateMinConfidence": 0.62,
      "remoteFallbackBelowLocalConfidence": 0.84
    },
    "binderPage": {
      "autoConfirmConfidence": 82,
      "possibleMatchConfidence": 55,
      "maxRemoteConcurrency": 2
    },
    "duplicateDetection": {
      "exactCardSetMatchConfidence": 0.98,
      "visualSimilarityConfidence": 0.9,
      "allowSameCardMultiplePockets": false
    }
  }'::jsonb,
  '{"status":"not_benchmarked","message":"Draft calibration mirrors current scanner defaults. Do not activate without benchmark evidence."}'::jsonb,
  'Initial scanner threshold baseline for controlled calibration.'
) on conflict (version) do update
set
  thresholds = excluded.thresholds,
  evidence_report = excluded.evidence_report,
  notes = excluded.notes,
  updated_at = now();

comment on table public.scanner_threshold_sets is
  'Versioned scanner threshold sets and rollout status. No raw scan images are stored here.';

comment on table public.scanner_benchmark_cases is
  'Controlled scanner benchmark cases with known correct Stackr card IDs. Use metadata for fixture notes, not raw images.';

comment on table public.scanner_benchmark_runs is
  'Physical-device scanner benchmark runs comparing production baseline and candidate scanner variants.';

comment on table public.scanner_benchmark_results is
  'Per-case scanner benchmark outcomes used to prove threshold changes before rollout.';
