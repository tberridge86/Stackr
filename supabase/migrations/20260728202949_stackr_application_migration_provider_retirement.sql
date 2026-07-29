-- Stage 14: application identity migration, shadow comparison and provider retirement evidence.
-- Additive only. Legacy identifiers remain authoritative until an evaluated mapping is applied.

create table if not exists audit.application_identity_migrations (
  id uuid primary key default gen_random_uuid(),
  migration_run_id uuid not null default gen_random_uuid(),
  entity_scope text not null
    check (entity_scope in ('binder_card', 'collection_card', 'inventory_item', 'listing', 'offer_card', 'local_cache', 'other')),
  source_table text not null,
  source_primary_key text not null,
  legacy_provider text not null,
  legacy_external_id text not null,
  legacy_language_code text,
  legacy_set_id text,
  legacy_collector_number text,
  legacy_variant_code text,
  canonical_printing_id uuid references catalog.card_printings(id) on delete restrict,
  canonical_variant_id uuid references catalog.card_variants(id) on delete restrict,
  match_method text
    check (match_method is null or match_method in ('exact_external_id', 'exact_canonical_id', 'exact_set_number_variant', 'manual_review')),
  match_confidence numeric check (match_confidence is null or match_confidence between 0 and 1),
  status text not null default 'pending'
    check (status in ('pending', 'mapped', 'quarantined', 'applied', 'rolled_back', 'superseded')),
  quarantine_reason text,
  previous_identity jsonb not null default '{}'::jsonb,
  proposed_identity jsonb not null default '{}'::jsonb,
  applied_identity jsonb,
  requested_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  applied_at timestamptz,
  rolled_back_at timestamptz,
  rollback_reason text,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (legacy_external_id <> ''),
  check (
    status not in ('mapped', 'applied')
    or (canonical_printing_id is not null and canonical_variant_id is not null and match_method is not null)
  ),
  check (status <> 'quarantined' or quarantine_reason is not null)
);

create unique index if not exists application_identity_migrations_current_uidx
  on audit.application_identity_migrations(source_table, source_primary_key)
  where status in ('pending', 'mapped', 'quarantined', 'applied');

create index if not exists application_identity_migrations_legacy_idx
  on audit.application_identity_migrations(legacy_provider, legacy_external_id, legacy_language_code);

create index if not exists application_identity_migrations_canonical_idx
  on audit.application_identity_migrations(canonical_variant_id, status);

create index if not exists application_identity_migrations_quarantine_idx
  on audit.application_identity_migrations(status, created_at desc)
  where status = 'quarantined';

create table if not exists audit.recognition_shadow_comparisons (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null,
  request_id text not null,
  primary_engine text not null,
  shadow_engine text not null,
  primary_card_id uuid references catalog.card_printings(id) on delete set null,
  primary_variant_id uuid references catalog.card_variants(id) on delete set null,
  shadow_card_id uuid references catalog.card_printings(id) on delete set null,
  shadow_variant_id uuid references catalog.card_variants(id) on delete set null,
  candidate_agreement boolean,
  variant_agreement boolean,
  language_agreement boolean,
  primary_latency_ms integer check (primary_latency_ms is null or primary_latency_ms >= 0),
  shadow_latency_ms integer check (shadow_latency_ms is null or shadow_latency_ms >= 0),
  visible_result_source text not null check (visible_result_source in ('stackr', 'legacy', 'none')),
  correction_outcome text
    check (correction_outcome is null or correction_outcome in ('pending', 'primary_confirmed', 'shadow_confirmed', 'different_card', 'no_match')),
  comparison jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scan_id, primary_engine, shadow_engine)
);

create index if not exists recognition_shadow_comparisons_created_idx
  on audit.recognition_shadow_comparisons(created_at desc, candidate_agreement, correction_outcome);

create table if not exists audit.provider_retirement_gate_evaluations (
  id uuid primary key default gen_random_uuid(),
  evaluation_version text not null,
  provider_code text not null,
  gate_key text not null,
  status text not null check (status in ('pass', 'fail', 'insufficient_data', 'not_applicable')),
  target jsonb not null default '{}'::jsonb,
  actual jsonb not null default '{}'::jsonb,
  evidence_count integer not null default 0 check (evidence_count >= 0),
  evidence_references jsonb not null default '[]'::jsonb
    check (jsonb_typeof(evidence_references) = 'array'),
  reason text not null,
  evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (evaluation_version, provider_code, gate_key)
);

alter table audit.application_identity_migrations enable row level security;
alter table audit.recognition_shadow_comparisons enable row level security;
alter table audit.provider_retirement_gate_evaluations enable row level security;

drop policy if exists "service role manages application identity migrations" on audit.application_identity_migrations;
create policy "service role manages application identity migrations"
  on audit.application_identity_migrations for all to service_role using (true) with check (true);

drop policy if exists "service role manages recognition shadow comparisons" on audit.recognition_shadow_comparisons;
create policy "service role manages recognition shadow comparisons"
  on audit.recognition_shadow_comparisons for all to service_role using (true) with check (true);

drop policy if exists "service role manages provider retirement evaluations" on audit.provider_retirement_gate_evaluations;
create policy "service role manages provider retirement evaluations"
  on audit.provider_retirement_gate_evaluations for all to service_role using (true) with check (true);

revoke all on table audit.application_identity_migrations from anon, authenticated;
revoke all on table audit.recognition_shadow_comparisons from anon, authenticated;
revoke all on table audit.provider_retirement_gate_evaluations from anon, authenticated;
grant select, insert, update on table audit.application_identity_migrations to service_role;
grant select, insert, update on table audit.recognition_shadow_comparisons to service_role;
grant select, insert, update on table audit.provider_retirement_gate_evaluations to service_role;

drop trigger if exists set_updated_at on audit.application_identity_migrations;
create trigger set_updated_at before update on audit.application_identity_migrations
  for each row execute function audit.set_updated_at();

drop trigger if exists set_updated_at on audit.recognition_shadow_comparisons;
create trigger set_updated_at before update on audit.recognition_shadow_comparisons
  for each row execute function audit.set_updated_at();

comment on table audit.application_identity_migrations is
  'Reversible migration ledger from legacy provider IDs to exact canonical Stackr printing and variant IDs. Ambiguous rows remain quarantined.';
comment on table audit.recognition_shadow_comparisons is
  'Private UAT comparison evidence. A unique scan/engine tuple prevents duplicate shadow observations.';
comment on table audit.provider_retirement_gate_evaluations is
  'Versioned evidence for provider retirement decisions. Missing evidence is recorded as insufficient_data, never inferred as passing.';
