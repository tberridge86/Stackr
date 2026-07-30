-- Stage 6: model benchmark registry and guarded vector-index activation.
--
-- This migration intentionally does not create a concrete vector(n) table.
-- The repository benchmark currently has no approved production model,
-- no approved real-phone test captures, and no selected embedding dimension.
-- A dimension-specific vector table and HNSW index must be generated only
-- after ml.embedding_models.selection_status = 'selected' and the model is
-- legally deployable for Stackr production use.

create schema if not exists ml;
create schema if not exists api;
create schema if not exists audit;

revoke all on schema ml from public;
grant usage on schema ml, audit to service_role;
grant usage on schema api to service_role;

create table if not exists ml.embedding_models (
  model_id text primary key,
  display_name text not null,
  model_family text not null
    check (model_family in ('mobileclip', 'dino', 'clip', 'stackr_metric_learning', 'non_neural_visual', 'other')),
  source_url text not null,
  source_name text not null,
  source_revision text,
  license_name text not null,
  license_url text,
  license_status text not null default 'needs_review'
    check (license_status in ('production_allowed', 'research_only', 'needs_review', 'rejected')),
  deployment_target text not null default 'benchmark_only'
    check (deployment_target in ('mobile', 'server', 'mobile_and_server', 'benchmark_only')),
  input_width integer,
  input_height integer,
  input_channels integer not null default 3,
  embedding_dimensions integer,
  parameter_count integer,
  model_size_bytes bigint,
  preprocessing jsonb not null default '{}'::jsonb,
  normalisation jsonb not null default '{}'::jsonb,
  onnx_export_status text not null default 'not_tested'
    check (onnx_export_status in ('compatible', 'blocked', 'not_tested', 'unsupported')),
  quantisation_status text not null default 'not_tested'
    check (quantisation_status in ('accepted', 'rejected', 'not_tested', 'blocked')),
  selection_status text not null default 'candidate'
    check (selection_status in ('candidate', 'benchmarking', 'selected', 'active', 'rejected', 'blocked', 'retired')),
  selection_notes text,
  checksum_sha256 text,
  checksum_verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deprecated_at timestamptz,
  deprecated_reason text,
  check (input_width is null or input_width > 0),
  check (input_height is null or input_height > 0),
  check (embedding_dimensions is null or embedding_dimensions > 0),
  check (model_size_bytes is null or model_size_bytes > 0),
  check (checksum_sha256 is null or checksum_sha256 ~ '^[0-9a-f]{64}$')
);

create table if not exists ml.embedding_benchmark_runs (
  id uuid primary key default gen_random_uuid(),
  benchmark_version text not null,
  dataset_version text,
  dataset_manifest_sha256 text,
  source_commit_hash text,
  source_tree_dirty boolean not null default false,
  status text not null
    check (status in ('blocked', 'ready_to_run', 'running', 'complete', 'failed')),
  selected_model_id text references ml.embedding_models(model_id) on delete restrict,
  selected_embedding_dimensions integer,
  selection_reason text not null,
  selection_weights jsonb not null default '{}'::jsonb,
  leakage_report jsonb not null default '{}'::jsonb,
  data_coverage jsonb not null default '{}'::jsonb,
  blockers jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (dataset_manifest_sha256 is null or dataset_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  check (selected_embedding_dimensions is null or selected_embedding_dimensions > 0)
);

create table if not exists ml.embedding_benchmark_results (
  id uuid primary key default gen_random_uuid(),
  benchmark_run_id uuid not null references ml.embedding_benchmark_runs(id) on delete cascade,
  model_id text not null references ml.embedding_models(model_id) on delete restrict,
  benchmark_split text not null
    check (benchmark_split in ('model_selection', 'protected_final_test', 'synthetic_supplement', 'device_latency')),
  metric_status text not null
    check (metric_status in ('measured', 'missing', 'blocked', 'not_applicable')),
  metrics jsonb not null default '{}'::jsonb,
  weighted_score numeric,
  rank integer,
  decision text,
  measured_at timestamptz,
  created_at timestamptz not null default now(),
  unique (benchmark_run_id, model_id, benchmark_split)
);

create table if not exists ml.embedding_index_versions (
  id uuid primary key default gen_random_uuid(),
  model_id text not null references ml.embedding_models(model_id) on delete restrict,
  index_version text not null,
  language_code text references catalog.languages(code) on delete restrict,
  embedding_dimensions integer not null,
  status text not null default 'candidate'
    check (status in ('candidate', 'building', 'complete', 'validated', 'active', 'failed', 'retired', 'blocked')),
  vector_table_name text,
  hnsw_index_name text,
  hnsw_parameters jsonb not null default '{"m":16,"ef_construction":64}'::jsonb,
  overfetch_multiplier integer not null default 5,
  reference_embedding_count integer not null default 0,
  missing_embedding_count integer not null default 0,
  completeness_report jsonb not null default '{}'::jsonb,
  health_report jsonb not null default '{}'::jsonb,
  checksum_sha256 text,
  built_at timestamptz,
  validated_at timestamptz,
  activated_at timestamptz,
  retired_at timestamptz,
  replaced_by uuid references ml.embedding_index_versions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (embedding_dimensions > 0),
  check (overfetch_multiplier between 1 and 50),
  check (reference_embedding_count >= 0),
  check (missing_embedding_count >= 0),
  check (checksum_sha256 is null or checksum_sha256 ~ '^[0-9a-f]{64}$')
);

create unique index if not exists embedding_index_versions_unique_scope_idx
  on ml.embedding_index_versions(model_id, index_version, coalesce(language_code, 'all'));

create unique index if not exists embedding_index_versions_single_active_idx
  on ml.embedding_index_versions(coalesce(language_code, 'all'))
  where status = 'active';

create table if not exists ml.embedding_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null,
  model_id text not null references ml.embedding_models(model_id) on delete restrict,
  index_version_id uuid references ml.embedding_index_versions(id) on delete set null,
  scope_type text not null
    check (scope_type in ('card', 'set', 'language', 'full')),
  scope_value text,
  status text not null default 'queued'
    check (status in ('queued', 'leased', 'running', 'succeeded', 'failed', 'dead_letter', 'cancelled')),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  next_run_at timestamptz not null default now(),
  leased_at timestamptz,
  lease_expires_at timestamptz,
  worker_id text,
  last_error text,
  input_checksum_sha256 text,
  output_summary jsonb not null default '{}'::jsonb,
  request_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_key),
  check (attempts >= 0),
  check (max_attempts > 0),
  check (input_checksum_sha256 is null or input_checksum_sha256 ~ '^[0-9a-f]{64}$')
);

create table if not exists ml.embedding_activation_events (
  id uuid primary key default gen_random_uuid(),
  request_id text,
  index_version_id uuid references ml.embedding_index_versions(id) on delete set null,
  previous_index_version_id uuid references ml.embedding_index_versions(id) on delete set null,
  event_type text not null
    check (event_type in ('activation_blocked', 'activated', 'retired', 'rollback')),
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists embedding_models_selection_idx
  on ml.embedding_models(selection_status, license_status, model_family)
  where deprecated_at is null;

create index if not exists embedding_benchmark_runs_status_idx
  on ml.embedding_benchmark_runs(status, generated_at desc);

create index if not exists embedding_benchmark_results_model_idx
  on ml.embedding_benchmark_results(model_id, benchmark_split, metric_status);

create index if not exists embedding_index_versions_model_status_idx
  on ml.embedding_index_versions(model_id, status, language_code);

create index if not exists embedding_generation_jobs_runnable_idx
  on ml.embedding_generation_jobs(next_run_at, status)
  where status in ('queued', 'failed');

create index if not exists embedding_generation_jobs_scope_idx
  on ml.embedding_generation_jobs(model_id, scope_type, scope_value);

insert into ml.embedding_models (
  model_id,
  display_name,
  model_family,
  source_url,
  source_name,
  license_name,
  license_url,
  license_status,
  deployment_target,
  input_width,
  input_height,
  input_channels,
  embedding_dimensions,
  parameter_count,
  preprocessing,
  normalisation,
  onnx_export_status,
  quantisation_status,
  selection_status,
  selection_notes,
  metadata
)
values
  (
    'mobileclip2_s0',
    'Apple MobileCLIP2-S0',
    'mobileclip',
    'https://github.com/apple/ml-mobileclip',
    'Apple ml-mobileclip / Apple MobileCLIP2-S0',
    'Apple ML Research Model License',
    'https://raw.githubusercontent.com/apple/ml-mobileclip/main/LICENSE_MODELS',
    'research_only',
    'benchmark_only',
    224,
    224,
    3,
    null,
    11400000,
    '{"status":"not_verified_in_stackr"}'::jsonb,
    '{"l2Normalised":true,"status":"not_verified_in_stackr"}'::jsonb,
    'not_tested',
    'not_tested',
    'blocked',
    'Included for benchmark comparison only; published model-weight terms are not approved for Stackr production use.',
    '{"upstream_reported_ios_image_encoder_latency_ms":1.5}'::jsonb
  ),
  (
    'mobileclip2_s2',
    'Apple MobileCLIP2-S2',
    'mobileclip',
    'https://github.com/apple/ml-mobileclip',
    'Apple ml-mobileclip / Apple MobileCLIP2-S2',
    'Apple ML Research Model License',
    'https://raw.githubusercontent.com/apple/ml-mobileclip/main/LICENSE_MODELS',
    'research_only',
    'benchmark_only',
    224,
    224,
    3,
    null,
    35700000,
    '{"status":"not_verified_in_stackr"}'::jsonb,
    '{"l2Normalised":true,"status":"not_verified_in_stackr"}'::jsonb,
    'not_tested',
    'not_tested',
    'blocked',
    'Included for benchmark comparison only; published model-weight terms are not approved for Stackr production use.',
    '{"upstream_reported_ios_image_encoder_latency_ms":3.6}'::jsonb
  ),
  (
    'dinov2_vits14',
    'Meta DINOv2 ViT-S/14',
    'dino',
    'https://github.com/facebookresearch/dinov2',
    'facebookresearch/dinov2',
    'Apache License 2.0',
    'https://raw.githubusercontent.com/facebookresearch/dinov2/main/LICENSE',
    'production_allowed',
    'server',
    224,
    224,
    3,
    384,
    21000000,
    '{"status":"not_verified_in_stackr"}'::jsonb,
    '{"l2Normalised":true,"status":"not_verified_in_stackr"}'::jsonb,
    'not_tested',
    'not_tested',
    'candidate',
    'Candidate only. Requires Stackr benchmark measurements, ONNX export validation and quantisation validation before selection.',
    '{}'::jsonb
  ),
  (
    'clip_vit_base_patch32_current_pack',
    'Current Stackr CLIP reference-pack baseline',
    'clip',
    'backend/data/scanner-packs/en-clip-base-v1/manifest.json',
    'Existing Stackr scanner-pack baseline',
    'Needs review',
    null,
    'needs_review',
    'benchmark_only',
    224,
    224,
    3,
    512,
    null,
    '{"status":"existing_pack_needs_review"}'::jsonb,
    '{"l2Normalised":true,"status":"existing_pack_needs_review"}'::jsonb,
    'not_tested',
    'not_tested',
    'blocked',
    'Retained as the existing fallback/reference comparison; not selected for the permanent Stackr index.',
    '{}'::jsonb
  ),
  (
    'stackr_embedding_v0_blocked',
    'Stackr embedding V0 blocked training plan',
    'stackr_metric_learning',
    'ml/models/stackr-embedding-v0/metrics.json',
    'Stackr local embedding V0 guard',
    'Internal blocked artifact',
    null,
    'rejected',
    'benchmark_only',
    224,
    320,
    3,
    128,
    null,
    '{"preservesFullCardRatio":true}'::jsonb,
    '{"l2Normalised":true}'::jsonb,
    'blocked',
    'blocked',
    'blocked',
    'No approved training pixels or real phone captures exist, and no weights were produced.',
    '{}'::jsonb
  )
on conflict (model_id) do nothing;

create or replace function ml.card_embedding_vector_table_sql(p_model_id text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_model record;
  table_name text;
  index_name text;
begin
  select *
    into selected_model
  from ml.embedding_models
  where model_id = p_model_id
    and selection_status in ('selected', 'active')
    and deprecated_at is null;

  if not found then
    raise exception 'Model % is not selected for vector-table generation.', p_model_id
      using errcode = 'P0001';
  end if;

  if selected_model.license_status <> 'production_allowed' then
    raise exception 'Model % is not production deployable.', p_model_id
      using errcode = 'P0001';
  end if;

  if selected_model.embedding_dimensions is null then
    raise exception 'Model % has no selected embedding dimension.', p_model_id
      using errcode = 'P0001';
  end if;

  table_name := 'card_embeddings_' ||
    regexp_replace(lower(selected_model.model_id), '[^a-z0-9]+', '_', 'g') ||
    '_' || selected_model.embedding_dimensions::text;
  index_name := table_name || '_embedding_hnsw_idx';

  return format($ddl$
create table if not exists ml.%1$I (
  id uuid primary key default gen_random_uuid(),
  model_id text not null references ml.embedding_models(model_id) on delete restrict,
  index_version_id uuid not null references ml.embedding_index_versions(id) on delete cascade,
  variant_id uuid not null references catalog.card_variants(id) on delete cascade,
  reference_asset_id uuid references catalog.assets(id) on delete set null,
  source_image_id text not null,
  language_code text not null references catalog.languages(code) on delete restrict,
  embedding vector(%2$s) not null,
  embedding_norm numeric not null,
  preprocessing_checksum_sha256 text not null,
  source_image_checksum_sha256 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deprecated_at timestamptz,
  unique (model_id, index_version_id, variant_id, source_image_id),
  check (embedding_norm > 0.98 and embedding_norm < 1.02),
  check (preprocessing_checksum_sha256 ~ '^[0-9a-f]{64}$'),
  check (source_image_checksum_sha256 is null or source_image_checksum_sha256 ~ '^[0-9a-f]{64}$')
);

create index if not exists %3$I
  on ml.%1$I
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

create index if not exists %4$I
  on ml.%1$I(model_id, language_code, variant_id)
  where deprecated_at is null;

alter table ml.%1$I enable row level security;

drop policy if exists "card embeddings service role manages rows" on ml.%1$I;
create policy "card embeddings service role manages rows"
  on ml.%1$I
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table ml.%1$I from anon, authenticated;
grant select, insert, update, delete on table ml.%1$I to service_role;
$ddl$,
    table_name,
    selected_model.embedding_dimensions,
    index_name,
    table_name || '_metadata_idx'
  );
end;
$$;

create or replace function ml.activate_embedding_index_version(p_index_version_id uuid, p_request_id text default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  candidate record;
  previous_id uuid;
begin
  select i.*, m.license_status, m.selection_status
    into candidate
  from ml.embedding_index_versions i
  join ml.embedding_models m on m.model_id = i.model_id
  where i.id = p_index_version_id
  for update;

  if not found then
    raise exception 'Embedding index version not found.'
      using errcode = 'P0001';
  end if;

  if candidate.status <> 'validated' then
    insert into ml.embedding_activation_events(request_id, index_version_id, event_type, event_payload)
    values (p_request_id, p_index_version_id, 'activation_blocked', jsonb_build_object('reason', 'index_not_validated', 'status', candidate.status));
    raise exception 'Embedding index must be validated before activation.'
      using errcode = 'P0001';
  end if;

  if candidate.license_status <> 'production_allowed' then
    insert into ml.embedding_activation_events(request_id, index_version_id, event_type, event_payload)
    values (p_request_id, p_index_version_id, 'activation_blocked', jsonb_build_object('reason', 'model_not_production_allowed', 'license_status', candidate.license_status));
    raise exception 'Embedding model is not production deployable.'
      using errcode = 'P0001';
  end if;

  if candidate.selection_status not in ('selected', 'active') then
    insert into ml.embedding_activation_events(request_id, index_version_id, event_type, event_payload)
    values (p_request_id, p_index_version_id, 'activation_blocked', jsonb_build_object('reason', 'model_not_selected', 'selection_status', candidate.selection_status));
    raise exception 'Embedding model is not selected.'
      using errcode = 'P0001';
  end if;

  if candidate.reference_embedding_count <= 0 or candidate.missing_embedding_count <> 0 then
    insert into ml.embedding_activation_events(request_id, index_version_id, event_type, event_payload)
    values (
      p_request_id,
      p_index_version_id,
      'activation_blocked',
      jsonb_build_object(
        'reason', 'index_incomplete',
        'reference_embedding_count', candidate.reference_embedding_count,
        'missing_embedding_count', candidate.missing_embedding_count
      )
    );
    raise exception 'Embedding index is incomplete.'
      using errcode = 'P0001';
  end if;

  select id into previous_id
  from ml.embedding_index_versions
  where status = 'active'
    and coalesce(language_code, 'all') = coalesce(candidate.language_code, 'all')
  limit 1;

  update ml.embedding_index_versions
  set status = 'retired',
      retired_at = now(),
      replaced_by = p_index_version_id,
      updated_at = now()
  where id = previous_id;

  update ml.embedding_index_versions
  set status = 'active',
      activated_at = now(),
      updated_at = now()
  where id = p_index_version_id;

  update ml.embedding_models
  set selection_status = 'active',
      updated_at = now()
  where model_id = candidate.model_id;

  insert into ml.embedding_activation_events(
    request_id,
    index_version_id,
    previous_index_version_id,
    event_type,
    event_payload
  )
  values (
    p_request_id,
    p_index_version_id,
    previous_id,
    'activated',
    jsonb_build_object('model_id', candidate.model_id, 'language_code', candidate.language_code)
  );

  return p_index_version_id;
end;
$$;

create or replace view api.embedding_index_manifest
with (security_invoker = true)
as
select
  i.id as index_version_id,
  i.index_version,
  i.model_id,
  m.display_name as model_display_name,
  m.model_family,
  m.embedding_dimensions,
  i.language_code,
  i.status,
  i.reference_embedding_count,
  i.missing_embedding_count,
  i.overfetch_multiplier,
  i.health_report,
  i.activated_at,
  i.updated_at
from ml.embedding_index_versions i
join ml.embedding_models m on m.model_id = i.model_id
where i.status = 'active'
  and m.selection_status = 'active'
  and m.license_status = 'production_allowed';

do $$
begin
  if to_regprocedure('audit.set_updated_at()') is not null then
    drop trigger if exists set_embedding_models_updated_at on ml.embedding_models;
    create trigger set_embedding_models_updated_at
      before update on ml.embedding_models
      for each row execute function audit.set_updated_at();

    drop trigger if exists set_embedding_benchmark_runs_updated_at on ml.embedding_benchmark_runs;
    create trigger set_embedding_benchmark_runs_updated_at
      before update on ml.embedding_benchmark_runs
      for each row execute function audit.set_updated_at();

    drop trigger if exists set_embedding_index_versions_updated_at on ml.embedding_index_versions;
    create trigger set_embedding_index_versions_updated_at
      before update on ml.embedding_index_versions
      for each row execute function audit.set_updated_at();

    drop trigger if exists set_embedding_generation_jobs_updated_at on ml.embedding_generation_jobs;
    create trigger set_embedding_generation_jobs_updated_at
      before update on ml.embedding_generation_jobs
      for each row execute function audit.set_updated_at();
  end if;
end $$;

alter table ml.embedding_models enable row level security;
alter table ml.embedding_benchmark_runs enable row level security;
alter table ml.embedding_benchmark_results enable row level security;
alter table ml.embedding_index_versions enable row level security;
alter table ml.embedding_generation_jobs enable row level security;
alter table ml.embedding_activation_events enable row level security;

drop policy if exists "embedding models service role manages rows" on ml.embedding_models;
create policy "embedding models service role manages rows"
  on ml.embedding_models for all to service_role using (true) with check (true);

drop policy if exists "embedding benchmark runs service role manages rows" on ml.embedding_benchmark_runs;
create policy "embedding benchmark runs service role manages rows"
  on ml.embedding_benchmark_runs for all to service_role using (true) with check (true);

drop policy if exists "embedding benchmark results service role manages rows" on ml.embedding_benchmark_results;
create policy "embedding benchmark results service role manages rows"
  on ml.embedding_benchmark_results for all to service_role using (true) with check (true);

drop policy if exists "embedding index versions service role manages rows" on ml.embedding_index_versions;
create policy "embedding index versions service role manages rows"
  on ml.embedding_index_versions for all to service_role using (true) with check (true);

drop policy if exists "embedding generation jobs service role manages rows" on ml.embedding_generation_jobs;
create policy "embedding generation jobs service role manages rows"
  on ml.embedding_generation_jobs for all to service_role using (true) with check (true);

drop policy if exists "embedding activation events service role manages rows" on ml.embedding_activation_events;
create policy "embedding activation events service role manages rows"
  on ml.embedding_activation_events for all to service_role using (true) with check (true);

revoke all on table
  ml.embedding_models,
  ml.embedding_benchmark_runs,
  ml.embedding_benchmark_results,
  ml.embedding_index_versions,
  ml.embedding_generation_jobs,
  ml.embedding_activation_events
from anon, authenticated;

grant select, insert, update, delete on table
  ml.embedding_models,
  ml.embedding_benchmark_runs,
  ml.embedding_benchmark_results,
  ml.embedding_index_versions,
  ml.embedding_generation_jobs,
  ml.embedding_activation_events
to service_role;

grant usage, select on all sequences in schema ml to service_role;

revoke all on function ml.card_embedding_vector_table_sql(text) from public, anon, authenticated;
grant execute on function ml.card_embedding_vector_table_sql(text) to service_role;

revoke all on function ml.activate_embedding_index_version(uuid, text) from public, anon, authenticated;
grant execute on function ml.activate_embedding_index_version(uuid, text) to service_role;

revoke all on table api.embedding_index_manifest from anon, authenticated;
grant select on table api.embedding_index_manifest to service_role;

comment on table ml.embedding_models is
  'Private registry of candidate, selected and active Stackr embedding models with licence, dimensions, preprocessing and checksum metadata.';

comment on table ml.embedding_benchmark_runs is
  'Private benchmark-run records. A run must record split integrity, blockers and weighted selection before a model can be selected.';

comment on table ml.embedding_benchmark_results is
  'Private per-model benchmark metrics. Synthetic supplement results must not be presented as real-camera validation.';

comment on table ml.embedding_index_versions is
  'Private versioned embedding-index activation records. Active indexes are switched only after complete validation.';

comment on function ml.card_embedding_vector_table_sql(text) is
  'Returns the dimension-specific vector table and HNSW SQL for a selected production-allowed model. The returned SQL must be reviewed and applied as a later migration after benchmark selection.';

comment on function ml.activate_embedding_index_version(uuid, text) is
  'Atomically marks a validated complete embedding index active and retires the previous active index for the same language shard.';
