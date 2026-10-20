-- Non-destructive, idempotent source-conflict registration.
-- No canonical identity, publication, identifier, ownership, image or price writes.
-- Caller supplies the authorized staging/production project; schema unchanged.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
lock table ingest.data_conflicts in share row exclusive mode;
lock table audit.catalogue_events in share row exclusive mode;

create temporary table chinese_language_pairs on commit drop as
select s.id as simplified_set_id, s.set_code, p.id as printing_id,
  p.collector_number, p.native_name,
  coalesce(to_jsonb(p)->>'printing_discriminator','') as printing_discriminator,
  t.id as traditional_printing_id, ts.id as traditional_set_id
from catalog.sets s
join catalog.card_printings p on p.set_id=s.id and p.language_code='zh-cn' and p.deprecated_at is null
join catalog.sets ts on ts.game_code=s.game_code and ts.set_code=s.set_code
  and ts.language_code='zh-tw' and ts.deprecated_at is null
join catalog.card_printings t on t.set_id=ts.id and t.language_code='zh-tw'
  and t.collector_number=p.collector_number and t.native_name=p.native_name
  and coalesce(to_jsonb(t)->>'printing_discriminator','')=coalesce(to_jsonb(p)->>'printing_discriminator','')
  and t.deprecated_at is null
where s.language_code='zh-cn' and s.deprecated_at is null
  and (s.id,s.set_code) in (
    ('4719ccc9-35c0-406a-b2c2-989af15d77b0'::uuid,'SV7a'),
    ('66d9e865-7d40-4b2e-8ef0-ae24fca87673'::uuid,'SV8'),
    ('a16f8d4c-d648-4bee-a219-9abc2aae49a6'::uuid,'SV8a'),
    ('b67bee5b-da76-4575-a263-ab9cb69d4d7b'::uuid,'SV9'),
    ('1dbfe92e-8914-49b2-974c-47683cf51d4d'::uuid,'SV10'));

do $guard$
begin
  if (select count(*) from chinese_language_pairs)<>605
    or (select count(distinct printing_id) from chinese_language_pairs)<>605
    or (select count(distinct traditional_printing_id) from chinese_language_pairs)<>605 then
    raise exception 'Expected 605 unique exact language-conflict pairs; aborting';
  end if;
  if exists (
    select 1 from (values ('SV7a',64),('SV8',106),('SV8a',237),('SV9',100),('SV10',98)) e(code,total)
    where (select count(*) from chinese_language_pairs p where p.set_code=e.code)<>e.total
  ) then raise exception 'Per-set cohort changed'; end if;
  if (select count(*) from catalog.card_printings p where p.set_id in (select distinct simplified_set_id from chinese_language_pairs) and p.deprecated_at is null)<>605
    or (select count(*) from catalog.card_variants v where v.set_id in (select distinct simplified_set_id from chinese_language_pairs) and v.deprecated_at is null)<>750 then
    raise exception 'Canonical cohort differs from reviewed 605 printings / 750 variants';
  end if;
  if exists (select 1 from catalog.assets a
    where a.set_id in (select distinct simplified_set_id from chinese_language_pairs)
      or a.printing_id in (select printing_id from chinese_language_pairs)
      or a.variant_id in (select v.id from catalog.card_variants v
        where v.set_id in (select distinct simplified_set_id from chinese_language_pairs)))
    or exists (select 1 from catalog.catalogue_version_assets a
    where a.set_id in (select distinct simplified_set_id from chinese_language_pairs)
      or a.printing_id in (select printing_id from chinese_language_pairs)
      or a.variant_id in (select v.id from catalog.card_variants v
        where v.set_id in (select distinct simplified_set_id from chinese_language_pairs))) then
    raise exception 'Artwork attached since review; requires a new asset-specific assessment';
  end if;
  if (select count(*) from ingest.sources where code='tcgdex')<>1 then
    raise exception 'Missing or ambiguous TCGdex source';
  end if;
end $guard$;

insert into ingest.data_conflicts
  (source_id,conflict_type,severity,entity_schema,entity_table,entity_id,canonical_key,
   proposed_payload,existing_payload,status,internal_notes)
select src.id,'identity_collision','high','catalog','card_printings',p.printing_id,
  'chinese-language-conflict-20261010:'||p.printing_id::text,
  jsonb_build_object('cohort','chinese-language-conflicts-20261010',
    'decision','reject_tcgdex_zh_cn_source_identity',
    'traditional_printing_id',p.traditional_printing_id,'traditional_set_id',p.traditional_set_id,
    'replacement_authoritative_zh_cn_source_required',true,
    'canonical_retag_or_redirect_authorized',false),
  jsonb_build_object('simplified_set_id',p.simplified_set_id,'printing_id',p.printing_id,
    'set_code',p.set_code,'declared_language','zh-cn','collector_number',p.collector_number,
    'native_name',p.native_name,'printing_discriminator',p.printing_discriminator),
  'open','Exact Traditional Chinese counterpart verified. Reject future TCGdex imports for this cohort; preserve published identities, ownership and history pending authoritative Simplified Chinese replacement.'
from chinese_language_pairs p cross join ingest.sources src
where src.code='tcgdex' and not exists (
  select 1 from ingest.data_conflicts c where c.source_id=src.id
    and c.conflict_type='identity_collision'
    and c.canonical_key='chinese-language-conflict-20261010:'||p.printing_id::text);

insert into audit.catalogue_events
  (request_id,actor_role,event_type,entity_schema,entity_table,event_payload,internal_notes)
select 'chinese-language-conflicts-20261010','catalogue_repair',
  'chinese_language_source_conflict_registered','catalog','card_printings',
  jsonb_build_object('printing_count',605,'variant_count',750,'set_count',5,
    'canonical_rows_changed',0,'publication_rows_changed',0,'identifier_rows_changed',0,
    'source_guard_required',true,'language_reconciliation_complete',false),
  'User-requested Chinese mismatch repair; exact pairs registered without changing user-visible identities.'
where not exists (select 1 from audit.catalogue_events where request_id='chinese-language-conflicts-20261010'
  and event_type='chinese_language_source_conflict_registered');

do $verify$
begin
  if (select count(*) from ingest.data_conflicts c join ingest.sources s on s.id=c.source_id
      where s.code='tcgdex' and c.conflict_type='identity_collision'
      and c.canonical_key like 'chinese-language-conflict-20261010:%')<>605 then
    raise exception 'Conflict receipt must contain exactly 605 records';
  end if;
end $verify$;
commit;
select count(*) as registered_pairs from ingest.data_conflicts
where canonical_key like 'chinese-language-conflict-20261010:%';
