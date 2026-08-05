-- Strict foreign Pokemon catalogue import safety.
-- Repository migration only. Do not apply to production until the staging
-- import and quarantine counts have been reviewed.

create extension if not exists pgcrypto;

alter table if exists catalog.languages
  drop constraint if exists languages_code_check;

alter table if exists catalog.languages
  add constraint languages_code_check
  check (code in ('en', 'ja', 'zh-tw', 'zh-cn', 'ko', 'zh-Hans', 'zh-Hant'));

insert into catalog.languages (code, bcp47_code, english_name, native_name, script_code, sort_order)
values
  ('zh-cn', 'zh-CN', 'Chinese (Simplified)', 'Chinese (Simplified)', 'Hans', 30),
  ('zh-tw', 'zh-TW', 'Chinese (Traditional)', 'Chinese (Traditional)', 'Hant', 40)
on conflict (code) do update
set
  bcp47_code = excluded.bcp47_code,
  english_name = excluded.english_name,
  native_name = excluded.native_name,
  script_code = excluded.script_code,
  sort_order = excluded.sort_order,
  active = true,
  deprecated_at = null,
  deprecated_reason = null,
  updated_at = now();

update catalog.languages
set
  active = false,
  deprecated_at = coalesce(deprecated_at, now()),
  deprecated_reason = coalesce(deprecated_reason, 'Replaced by strict importer language codes zh-cn and zh-tw.'),
  updated_at = now()
where code in ('zh-Hans', 'zh-Hant');

insert into ingest.sources (
  code,
  display_name,
  source_type,
  base_url,
  terms_url,
  licence_status,
  attribution_required,
  robots_policy,
  rate_limit_config,
  active,
  internal_notes
)
values (
  'stackr_legacy_tcgdex_quarantine',
  'Stackr legacy TCGdex quarantine',
  'internal',
  null,
  null,
  'unknown',
  false,
  'not_applicable_internal_quarantine',
  '{}'::jsonb,
  true,
  'Flags suspicious legacy Japanese catalogue rows for manual review without deleting source data.'
)
on conflict (code) do update
set
  display_name = excluded.display_name,
  source_type = excluded.source_type,
  licence_status = excluded.licence_status,
  attribution_required = excluded.attribution_required,
  robots_policy = excluded.robots_policy,
  active = true,
  internal_notes = excluded.internal_notes,
  updated_at = now();

alter table if exists public.tcg_sets
  add column if not exists sync_status text default 'partial';

alter table if exists public.tcg_cards
  add column if not exists provider_set_id text,
  add column if not exists record_status text default 'partial',
  add column if not exists raw_source jsonb;

alter table if exists public.provider_card_records
  add column if not exists response_status text default 'complete';

do $$
begin
  if to_regclass('public.tcg_sets') is not null then
    insert into ingest.data_conflicts (
      source_id,
      conflict_type,
      severity,
      entity_schema,
      entity_table,
      canonical_key,
      proposed_payload,
      existing_payload,
      internal_notes
    )
    select
      quarantine_source.id,
      'identity_collision',
      'critical',
      'public',
      'tcg_sets',
      lower(concat_ws(':', 'legacy_set', s.language, coalesce(s.set_code, s.source_id, s.id))),
      jsonb_build_object(
        'id', s.id,
        'language', s.language,
        'set_code', s.set_code,
        'source_id', s.source_id,
        'pattern', 'ja:CS*, ja:SV4a, ja:CP5'
      ),
      to_jsonb(s),
      'Suspicious legacy Japanese catalogue identity quarantined before additional foreign imports.'
    from public.tcg_sets s
    cross join ingest.sources quarantine_source
    where quarantine_source.code = 'stackr_legacy_tcgdex_quarantine'
      and lower(coalesce(s.language, '')) = 'ja'
      and (
        upper(coalesce(s.id, '')) like 'JA:CS%'
        or upper(coalesce(s.source_id, '')) like 'CS%'
        or upper(coalesce(s.set_code, '')) like 'CS%'
        or upper(coalesce(s.raw_payload->>'id', '')) like 'CS%'
        or upper(coalesce(s.id, '')) in ('JA:SV4A', 'JA:CP5')
        or upper(coalesce(s.source_id, '')) in ('SV4A', 'CP5')
        or upper(coalesce(s.set_code, '')) in ('SV4A', 'CP5')
        or upper(coalesce(s.raw_payload->>'id', '')) in ('SV4A', 'CP5')
      )
      and not exists (
        select 1
        from ingest.data_conflicts existing
        where existing.source_id = quarantine_source.id
          and existing.conflict_type = 'identity_collision'
          and existing.entity_schema = 'public'
          and existing.entity_table = 'tcg_sets'
          and existing.canonical_key = lower(concat_ws(':', 'legacy_set', s.language, coalesce(s.set_code, s.source_id, s.id)))
      );

    update public.tcg_sets s
    set
      data_completeness = 'quarantined',
      sync_status = 'quarantined',
      raw_payload = coalesce(s.raw_payload, '{}'::jsonb) || jsonb_build_object(
        'stackr_quarantine',
        jsonb_build_object(
          'reason', 'suspicious_legacy_foreign_identity',
          'patterns', jsonb_build_array('ja:CS*', 'ja:SV4a', 'ja:CP5'),
          'quarantined_at', now()
        )
      ),
      updated_at = now()
    where lower(coalesce(s.language, '')) = 'ja'
      and (
        upper(coalesce(s.id, '')) like 'JA:CS%'
        or upper(coalesce(s.source_id, '')) like 'CS%'
        or upper(coalesce(s.set_code, '')) like 'CS%'
        or upper(coalesce(s.raw_payload->>'id', '')) like 'CS%'
        or upper(coalesce(s.id, '')) in ('JA:SV4A', 'JA:CP5')
        or upper(coalesce(s.source_id, '')) in ('SV4A', 'CP5')
        or upper(coalesce(s.set_code, '')) in ('SV4A', 'CP5')
        or upper(coalesce(s.raw_payload->>'id', '')) in ('SV4A', 'CP5')
      );
  end if;
end $$;

do $$
begin
  if to_regclass('public.tcg_cards') is not null then
    insert into ingest.data_conflicts (
      source_id,
      conflict_type,
      severity,
      entity_schema,
      entity_table,
      canonical_key,
      proposed_payload,
      existing_payload,
      internal_notes
    )
    select
      quarantine_source.id,
      'identity_collision',
      'critical',
      'public',
      'tcg_cards',
      lower(concat_ws(':', 'legacy_card', c.language, coalesce(c.provider_set_id, c.set_id), c.collector_number, c.source_id, c.id)),
      jsonb_build_object(
        'id', c.id,
        'language', c.language,
        'set_id', c.set_id,
        'provider_set_id', c.provider_set_id,
        'collector_number', c.collector_number,
        'source_id', c.source_id,
        'pattern', 'ja:CS*, ja:SV4a, ja:CP5'
      ),
      to_jsonb(c),
      'Suspicious legacy Japanese catalogue identity quarantined before additional foreign imports.'
    from public.tcg_cards c
    cross join ingest.sources quarantine_source
    where quarantine_source.code = 'stackr_legacy_tcgdex_quarantine'
      and lower(coalesce(c.language, '')) = 'ja'
      and (
        upper(coalesce(c.set_id, '')) like 'JA:CS%'
        or upper(coalesce(c.provider_set_id, '')) like 'CS%'
        or upper(coalesce(c.raw_payload->'set'->>'id', '')) like 'CS%'
        or upper(coalesce(c.raw_payload->>'setId', '')) like 'CS%'
        or upper(coalesce(c.raw_payload->>'set_id', '')) like 'CS%'
        or upper(coalesce(c.set_id, '')) in ('JA:SV4A', 'JA:CP5')
        or upper(coalesce(c.provider_set_id, '')) in ('SV4A', 'CP5')
        or upper(coalesce(c.raw_payload->'set'->>'id', '')) in ('SV4A', 'CP5')
        or upper(coalesce(c.raw_payload->>'setId', '')) in ('SV4A', 'CP5')
        or upper(coalesce(c.raw_payload->>'set_id', '')) in ('SV4A', 'CP5')
      )
      and not exists (
        select 1
        from ingest.data_conflicts existing
        where existing.source_id = quarantine_source.id
          and existing.conflict_type = 'identity_collision'
          and existing.entity_schema = 'public'
          and existing.entity_table = 'tcg_cards'
          and existing.canonical_key = lower(concat_ws(':', 'legacy_card', c.language, coalesce(c.provider_set_id, c.set_id), c.collector_number, c.source_id, c.id))
      );

    update public.tcg_cards c
    set
      data_completeness = 'quarantined',
      record_status = 'quarantined',
      raw_payload = coalesce(c.raw_payload, '{}'::jsonb) || jsonb_build_object(
        'stackr_quarantine',
        jsonb_build_object(
          'reason', 'suspicious_legacy_foreign_identity',
          'patterns', jsonb_build_array('ja:CS*', 'ja:SV4a', 'ja:CP5'),
          'quarantined_at', now()
        )
      ),
      raw_source = coalesce(c.raw_source, '{}'::jsonb) || jsonb_build_object('stackr_quarantined', true),
      updated_at = now()
    where lower(coalesce(c.language, '')) = 'ja'
      and (
        upper(coalesce(c.set_id, '')) like 'JA:CS%'
        or upper(coalesce(c.provider_set_id, '')) like 'CS%'
        or upper(coalesce(c.raw_payload->'set'->>'id', '')) like 'CS%'
        or upper(coalesce(c.raw_payload->>'setId', '')) like 'CS%'
        or upper(coalesce(c.raw_payload->>'set_id', '')) like 'CS%'
        or upper(coalesce(c.set_id, '')) in ('JA:SV4A', 'JA:CP5')
        or upper(coalesce(c.provider_set_id, '')) in ('SV4A', 'CP5')
        or upper(coalesce(c.raw_payload->'set'->>'id', '')) in ('SV4A', 'CP5')
        or upper(coalesce(c.raw_payload->>'setId', '')) in ('SV4A', 'CP5')
        or upper(coalesce(c.raw_payload->>'set_id', '')) in ('SV4A', 'CP5')
      );
  end if;
end $$;

do $$
begin
  if to_regclass('public.provider_card_records') is not null then
    insert into ingest.data_conflicts (
      source_id,
      conflict_type,
      severity,
      entity_schema,
      entity_table,
      canonical_key,
      proposed_payload,
      existing_payload,
      internal_notes
    )
    select
      quarantine_source.id,
      'identity_collision',
      'critical',
      'public',
      'provider_card_records',
      lower(concat_ws(':', 'legacy_provider_record', p.language, p.provider, p.provider_record_id)),
      jsonb_build_object(
        'id', p.id,
        'provider', p.provider,
        'language', p.language,
        'provider_record_id', p.provider_record_id,
        'pattern', 'ja:CS*, ja:SV4a, ja:CP5'
      ),
      to_jsonb(p),
      'Suspicious legacy Japanese catalogue identity quarantined before additional foreign imports.'
    from public.provider_card_records p
    cross join ingest.sources quarantine_source
    where quarantine_source.code = 'stackr_legacy_tcgdex_quarantine'
      and lower(coalesce(p.language, '')) = 'ja'
      and (
        upper(coalesce(p.provider_record_id, '')) like 'JA:CS%'
        or upper(coalesce(p.provider_record_id, '')) like 'CS%'
        or upper(coalesce(p.raw_payload->'set'->>'id', '')) like 'CS%'
        or upper(coalesce(p.raw_payload->>'setId', '')) like 'CS%'
        or upper(coalesce(p.raw_payload->>'set_id', '')) like 'CS%'
        or upper(coalesce(p.provider_record_id, '')) in ('JA:SV4A', 'JA:CP5', 'SV4A', 'CP5')
        or upper(coalesce(p.raw_payload->'set'->>'id', '')) in ('SV4A', 'CP5')
        or upper(coalesce(p.raw_payload->>'setId', '')) in ('SV4A', 'CP5')
        or upper(coalesce(p.raw_payload->>'set_id', '')) in ('SV4A', 'CP5')
      )
      and not exists (
        select 1
        from ingest.data_conflicts existing
        where existing.source_id = quarantine_source.id
          and existing.conflict_type = 'identity_collision'
          and existing.entity_schema = 'public'
          and existing.entity_table = 'provider_card_records'
          and existing.canonical_key = lower(concat_ws(':', 'legacy_provider_record', p.language, p.provider, p.provider_record_id))
      );

    update public.provider_card_records p
    set
      response_status = 'quarantined',
      raw_payload = coalesce(p.raw_payload, '{}'::jsonb) || jsonb_build_object(
        'stackr_quarantine',
        jsonb_build_object(
          'reason', 'suspicious_legacy_foreign_identity',
          'patterns', jsonb_build_array('ja:CS*', 'ja:SV4a', 'ja:CP5'),
          'quarantined_at', now()
        )
      ),
      updated_at = now()
    where lower(coalesce(p.language, '')) = 'ja'
      and (
        upper(coalesce(p.provider_record_id, '')) like 'JA:CS%'
        or upper(coalesce(p.provider_record_id, '')) like 'CS%'
        or upper(coalesce(p.raw_payload->'set'->>'id', '')) like 'CS%'
        or upper(coalesce(p.raw_payload->>'setId', '')) like 'CS%'
        or upper(coalesce(p.raw_payload->>'set_id', '')) like 'CS%'
        or upper(coalesce(p.provider_record_id, '')) in ('JA:SV4A', 'JA:CP5', 'SV4A', 'CP5')
        or upper(coalesce(p.raw_payload->'set'->>'id', '')) in ('SV4A', 'CP5')
        or upper(coalesce(p.raw_payload->>'setId', '')) in ('SV4A', 'CP5')
        or upper(coalesce(p.raw_payload->>'set_id', '')) in ('SV4A', 'CP5')
      );
  end if;
end $$;
