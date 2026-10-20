-- Exact three-row Simplified Chinese catalogue-membership repair.
-- Scope: catalog.catalogue_version_variants only. It preserves variant, printing,
-- set, artwork, provider-price and ownership records. Default terminator ROLLBACK.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create temporary table chinese_membership_repair_expected (
  variant_id uuid primary key,
  old_printing_id uuid not null,
  old_set_id uuid not null,
  corrected_printing_id uuid not null,
  corrected_set_id uuid not null,
  collector_number text not null,
  native_name text not null
) on commit drop;

insert into chinese_membership_repair_expected values
  ('7d02957d-9876-420a-81f0-0bc347eb012e','258e3d35-f4ce-4f5e-a201-50452ddfbad3','a702fde2-d188-4521-9127-0287f79fc1fc','9cb82b70-c6cf-4c7e-a2bf-0bd3fe44a45e','7bf1e1c6-2caf-46cc-8a0f-ba85abec5ed2','013','圆陆鲨'),
  ('a7f6873d-5d84-44ec-ac47-cf376061f3bf','7a60470a-5110-4b41-9c97-c3d9b524a648','a702fde2-d188-4521-9127-0287f79fc1fc','e1d5d9a4-87be-42f3-bd07-828b81434fe6','7bf1e1c6-2caf-46cc-8a0f-ba85abec5ed2','014','尖牙陆鲨'),
  ('5bff5571-a70e-4c7f-a834-430ebc3178f1','a4e135fb-8cb6-4164-9fff-011e987be52b','a702fde2-d188-4521-9127-0287f79fc1fc','360afabc-341c-4a5b-94e4-f56776fe9dc8','7bf1e1c6-2caf-46cc-8a0f-ba85abec5ed2','015','烈咬陆鲨');

-- Lock only the exact membership rows and the exact physical targets needed to
-- establish their immutable identity. Do not take a table-wide catalogue lock.
select cvv.variant_id
from catalog.catalogue_version_variants cvv
join chinese_membership_repair_expected e on e.variant_id=cvv.variant_id
where cvv.catalogue_version_id='79f43e8f-7062-4d29-8571-569eccb7c249'::uuid
for update of cvv;

select v.id,p.id,s.id
from catalog.card_variants v
join catalog.card_printings p on p.id=v.printing_id
join catalog.sets s on s.id=p.set_id
join chinese_membership_repair_expected e on e.variant_id=v.id
for share of v,p,s;

do $guard$
begin
  if (select count(*) from chinese_membership_repair_expected)<>3
    or (select md5(string_agg(variant_id::text||':'||old_printing_id::text||':'||old_set_id::text||':'||corrected_printing_id::text||':'||corrected_set_id::text,',' order by variant_id)) from chinese_membership_repair_expected)<>'447d442ec003e1bf1cb0dca3726cc6b4' then
    raise exception 'Reviewed three-card membership cohort drifted';
  end if;
  if (select count(*) from catalog.catalogue_versions where id='79f43e8f-7062-4d29-8571-569eccb7c249'::uuid
      and language_code='zh-cn' and version_key='zh-cn:api-launch-2026-08-09-v1'
      and status='published' and deprecated_at is null)<>1 then
    raise exception 'Expected exact current published Simplified Chinese catalogue version';
  end if;
  if (select count(*) from catalog.catalogue_versions where language_code='zh-cn' and status='published' and deprecated_at is null)<>1 then
    raise exception 'Expected exactly one published Simplified Chinese catalogue version';
  end if;
  if (select count(*) from catalog.catalogue_version_variants cvv join chinese_membership_repair_expected e on e.variant_id=cvv.variant_id
      where cvv.catalogue_version_id='79f43e8f-7062-4d29-8571-569eccb7c249'::uuid
        and cvv.language_code='zh-cn' and cvv.printing_id=e.old_printing_id and cvv.set_id=e.old_set_id)<>3 then
    raise exception 'Membership rows no longer match the exact reviewed old IDs';
  end if;
  if (select count(*) from catalog.card_variants v join catalog.card_printings p on p.id=v.printing_id
      join catalog.sets s on s.id=p.set_id join chinese_membership_repair_expected e on e.variant_id=v.id
      where v.game_code='pokemon' and s.game_code='pokemon' and lower(s.set_code)='csmpic'
        and v.language_code='zh-cn' and v.deprecated_at is null and p.language_code='zh-cn' and p.deprecated_at is null
        and s.language_code='zh-cn' and s.deprecated_at is null and p.id=e.corrected_printing_id
        and p.set_id=e.corrected_set_id and p.collector_number=e.collector_number and p.native_name=e.native_name)<>3 then
    raise exception 'Physical target identity/native name/collector/status guard failed';
  end if;
  if exists(select 1 from chinese_membership_repair_expected where old_printing_id=corrected_printing_id or old_set_id=corrected_set_id) then
    raise exception 'Repair must correct, not restate, every membership relationship';
  end if;
end $guard$;

create temporary table chinese_membership_repair_before on commit drop as
select
  (select count(*) from catalog.assets a where a.variant_id in(select variant_id from chinese_membership_repair_expected)
    or a.printing_id in(select corrected_printing_id from chinese_membership_repair_expected)
    or a.set_id in(select corrected_set_id from chinese_membership_repair_expected)) asset_links,
  (select count(*) from catalog.catalogue_version_assets a where a.variant_id in(select variant_id from chinese_membership_repair_expected)
    or a.printing_id in(select corrected_printing_id from chinese_membership_repair_expected)
    or a.set_id in(select corrected_set_id from chinese_membership_repair_expected)) version_asset_links,
  (select count(*) from market.catalogue_general_prices p where p.variant_id in(select variant_id from chinese_membership_repair_expected)
    or p.printing_id in(select corrected_printing_id from chinese_membership_repair_expected)
    or p.set_id in(select corrected_set_id from chinese_membership_repair_expected)) price_rows,
  (select count(*) from market.catalogue_provider_cards p where p.variant_id in(select variant_id from chinese_membership_repair_expected)
    or p.printing_id in(select corrected_printing_id from chinese_membership_repair_expected)
    or p.set_id in(select corrected_set_id from chinese_membership_repair_expected)) provider_rows,
  (select count(*) from market.catalogue_price_outcomes p where p.variant_id in(select variant_id from chinese_membership_repair_expected)) outcome_rows,
  (select count(*) from public.user_card_variants u where u.card_id in(select variant_id::text from chinese_membership_repair_expected)
    or u.set_id in(select corrected_set_id::text from chinese_membership_repair_expected)) ownership_rows,
  (select count(*) from public.binder_cards b where b.card_id in(select variant_id::text from chinese_membership_repair_expected)
    or b.api_card_id in(select variant_id::text from chinese_membership_repair_expected)
    or b.set_id in(select corrected_set_id::text from chinese_membership_repair_expected)) binder_rows,
  (select md5(coalesce(string_agg(scope||':'||payload,',' order by scope,payload),'')) from (
    select 'asset' scope,to_jsonb(a)::text payload from catalog.assets a where a.variant_id in(select variant_id from chinese_membership_repair_expected) or a.printing_id in(select corrected_printing_id from chinese_membership_repair_expected) or a.set_id in(select corrected_set_id from chinese_membership_repair_expected)
    union all select 'version_asset',to_jsonb(a)::text from catalog.catalogue_version_assets a where a.variant_id in(select variant_id from chinese_membership_repair_expected) or a.printing_id in(select corrected_printing_id from chinese_membership_repair_expected) or a.set_id in(select corrected_set_id from chinese_membership_repair_expected)
    union all select 'general_price',to_jsonb(p)::text from market.catalogue_general_prices p where p.variant_id in(select variant_id from chinese_membership_repair_expected) or p.printing_id in(select corrected_printing_id from chinese_membership_repair_expected) or p.set_id in(select corrected_set_id from chinese_membership_repair_expected)
    union all select 'provider',to_jsonb(p)::text from market.catalogue_provider_cards p where p.variant_id in(select variant_id from chinese_membership_repair_expected) or p.printing_id in(select corrected_printing_id from chinese_membership_repair_expected) or p.set_id in(select corrected_set_id from chinese_membership_repair_expected)
    union all select 'outcome',to_jsonb(p)::text from market.catalogue_price_outcomes p where p.variant_id in(select variant_id from chinese_membership_repair_expected)
    union all select 'ownership',to_jsonb(u)::text from public.user_card_variants u where u.card_id in(select variant_id::text from chinese_membership_repair_expected) or u.set_id in(select corrected_set_id::text from chinese_membership_repair_expected)
    union all select 'binder',to_jsonb(b)::text from public.binder_cards b where b.card_id in(select variant_id::text from chinese_membership_repair_expected) or b.api_card_id in(select variant_id::text from chinese_membership_repair_expected) or b.set_id in(select corrected_set_id::text from chinese_membership_repair_expected)
  ) preserved_rows) preservation_fingerprint;

insert into audit.catalogue_events(request_id,actor_role,event_type,entity_schema,entity_table,event_payload)
select 'chinese-membership-repair-20261011','catalogue_repair','chinese_membership_repair_before','catalog','catalogue_version_variants',
  jsonb_build_object('catalogueVersionId','79f43e8f-7062-4d29-8571-569eccb7c249',
    'oldLinks',(select jsonb_agg(jsonb_build_object('variantId',variant_id,'printingId',old_printing_id,'setId',old_set_id) order by variant_id) from chinese_membership_repair_expected),
    'newLinks',(select jsonb_agg(jsonb_build_object('variantId',variant_id,'printingId',corrected_printing_id,'setId',corrected_set_id) order by variant_id) from chinese_membership_repair_expected),
    'preservation',(select to_jsonb(b) from chinese_membership_repair_before b));

create temporary table chinese_membership_repair_applied on commit drop as
with changed as (
  update catalog.catalogue_version_variants cvv
  set printing_id=e.corrected_printing_id,set_id=e.corrected_set_id
  from chinese_membership_repair_expected e
  where cvv.catalogue_version_id='79f43e8f-7062-4d29-8571-569eccb7c249'::uuid
    and cvv.variant_id=e.variant_id and cvv.language_code='zh-cn'
    and cvv.printing_id=e.old_printing_id and cvv.set_id=e.old_set_id
  returning cvv.variant_id,cvv.printing_id,cvv.set_id
) select * from changed;

do $verify$
declare before_state chinese_membership_repair_before;
begin
  select * into before_state from chinese_membership_repair_before;
  if (select count(*) from chinese_membership_repair_applied)<>3
    or (select count(*) from catalog.catalogue_version_variants cvv join chinese_membership_repair_expected e on e.variant_id=cvv.variant_id
      where cvv.catalogue_version_id='79f43e8f-7062-4d29-8571-569eccb7c249'::uuid
        and cvv.language_code='zh-cn' and cvv.printing_id=e.corrected_printing_id and cvv.set_id=e.corrected_set_id)<>3 then
    raise exception 'Expected exactly three corrected membership rows';
  end if;
  if before_state.asset_links<>(select count(*) from catalog.assets a where a.variant_id in(select variant_id from chinese_membership_repair_expected)
      or a.printing_id in(select corrected_printing_id from chinese_membership_repair_expected) or a.set_id in(select corrected_set_id from chinese_membership_repair_expected))
    or before_state.version_asset_links<>(select count(*) from catalog.catalogue_version_assets a where a.variant_id in(select variant_id from chinese_membership_repair_expected)
      or a.printing_id in(select corrected_printing_id from chinese_membership_repair_expected) or a.set_id in(select corrected_set_id from chinese_membership_repair_expected))
    or before_state.price_rows<>(select count(*) from market.catalogue_general_prices p where p.variant_id in(select variant_id from chinese_membership_repair_expected)
      or p.printing_id in(select corrected_printing_id from chinese_membership_repair_expected) or p.set_id in(select corrected_set_id from chinese_membership_repair_expected))
    or before_state.provider_rows<>(select count(*) from market.catalogue_provider_cards p where p.variant_id in(select variant_id from chinese_membership_repair_expected)
      or p.printing_id in(select corrected_printing_id from chinese_membership_repair_expected) or p.set_id in(select corrected_set_id from chinese_membership_repair_expected))
    or before_state.outcome_rows<>(select count(*) from market.catalogue_price_outcomes p where p.variant_id in(select variant_id from chinese_membership_repair_expected))
    or before_state.ownership_rows<>(select count(*) from public.user_card_variants u where u.card_id in(select variant_id::text from chinese_membership_repair_expected)
      or u.set_id in(select corrected_set_id::text from chinese_membership_repair_expected))
    or before_state.binder_rows<>(select count(*) from public.binder_cards b where b.card_id in(select variant_id::text from chinese_membership_repair_expected)
      or b.api_card_id in(select variant_id::text from chinese_membership_repair_expected) or b.set_id in(select corrected_set_id::text from chinese_membership_repair_expected)) then
    raise exception 'Artwork, provider, price, ownership or binder preservation receipt changed';
  end if;
  if before_state.preservation_fingerprint<>(select md5(coalesce(string_agg(scope||':'||payload,',' order by scope,payload),'')) from (
    select 'asset' scope,to_jsonb(a)::text payload from catalog.assets a where a.variant_id in(select variant_id from chinese_membership_repair_expected) or a.printing_id in(select corrected_printing_id from chinese_membership_repair_expected) or a.set_id in(select corrected_set_id from chinese_membership_repair_expected)
    union all select 'version_asset',to_jsonb(a)::text from catalog.catalogue_version_assets a where a.variant_id in(select variant_id from chinese_membership_repair_expected) or a.printing_id in(select corrected_printing_id from chinese_membership_repair_expected) or a.set_id in(select corrected_set_id from chinese_membership_repair_expected)
    union all select 'general_price',to_jsonb(p)::text from market.catalogue_general_prices p where p.variant_id in(select variant_id from chinese_membership_repair_expected) or p.printing_id in(select corrected_printing_id from chinese_membership_repair_expected) or p.set_id in(select corrected_set_id from chinese_membership_repair_expected)
    union all select 'provider',to_jsonb(p)::text from market.catalogue_provider_cards p where p.variant_id in(select variant_id from chinese_membership_repair_expected) or p.printing_id in(select corrected_printing_id from chinese_membership_repair_expected) or p.set_id in(select corrected_set_id from chinese_membership_repair_expected)
    union all select 'outcome',to_jsonb(p)::text from market.catalogue_price_outcomes p where p.variant_id in(select variant_id from chinese_membership_repair_expected)
    union all select 'ownership',to_jsonb(u)::text from public.user_card_variants u where u.card_id in(select variant_id::text from chinese_membership_repair_expected) or u.set_id in(select corrected_set_id::text from chinese_membership_repair_expected)
    union all select 'binder',to_jsonb(b)::text from public.binder_cards b where b.card_id in(select variant_id::text from chinese_membership_repair_expected) or b.api_card_id in(select variant_id::text from chinese_membership_repair_expected) or b.set_id in(select corrected_set_id::text from chinese_membership_repair_expected)
  ) preserved_rows) then
    raise exception 'Preserved full-row fingerprint changed';
  end if;
end $verify$;

insert into audit.catalogue_events(request_id,actor_role,event_type,entity_schema,entity_table,event_payload)
select 'chinese-membership-repair-20261011','catalogue_repair','chinese_membership_repair_after','catalog','catalogue_version_variants',
  jsonb_build_object('changedLinks',(select jsonb_agg(to_jsonb(a) order by a.variant_id) from chinese_membership_repair_applied a),
    'preservation',(select to_jsonb(b) from chinese_membership_repair_before b),
    'mobileDelta','not emitted: public api.catalogue_cards derives physical set/printing from the unchanged variant, while the repaired membership is a pricing-integrity-only correction',
    'priceSignal','not emitted: all three rows are zh-cn and unsupported by the configured TCGCSV price provider');

select jsonb_build_object(
  'result','REHEARSAL_READY',
  'catalogueVersionId','79f43e8f-7062-4d29-8571-569eccb7c249',
  'changedRows',(select count(*) from chinese_membership_repair_applied),
  'changedVariantIds',(select jsonb_agg(variant_id order by variant_id) from chinese_membership_repair_applied),
  'preserved',(select to_jsonb(b) from chinese_membership_repair_before b),
  'undo','Restore each exact old_printing_id and old_set_id from chinese_membership_repair_expected; no other table was changed'
) receipt;

-- Rehearsal defaults to rollback. Replace only this terminator with COMMIT after
-- staging rehearsal, production precheck and coordinator approval have been recorded.
rollback;
select 'REHEARSAL_ROLLED_BACK' result;
