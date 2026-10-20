-- Reuse verified retained revisions after a worker restart; an identical review
-- must preserve its last valid quote. New daily source revisions use UTC days.
set local lock_timeout='5s';
set local statement_timeout='60s';
create or replace function api.claim_cardmarket_public_feed(p_kind text) returns uuid
language plpgsql security invoker set search_path = '' as $function$
declare token uuid;
begin
  if p_kind not in ('products','price_guide') then raise exception 'invalid Cardmarket feed'; end if;
  insert into market.cardmarket_public_feed_leases(feed_kind) values(p_kind) on conflict do nothing;
  perform 1 from market.cardmarket_public_feed_leases where feed_kind = p_kind for update;
  if exists(select 1 from market.cardmarket_public_feed_leases where feed_kind = p_kind and (((last_succeeded_at at time zone 'UTC')::date >= (now() at time zone 'UTC')::date) or (lease_until > now()) or (retry_after > now()))) then return null; end if;
  token := gen_random_uuid();
  update market.cardmarket_public_feed_leases set lease_token = token, lease_until = now() + interval '15 minutes' where feed_kind = p_kind;
  return token;
end;
$function$;

create or replace function api.review_cardmarket_printing_mapping(p_mapping jsonb) returns boolean
language plpgsql security invoker set search_path = '' as $function$
declare prior market.cardmarket_printing_mappings; pid uuid; category integer; product bigint; version_id uuid;
begin
  if jsonb_typeof(p_mapping) <> 'object' or p_mapping ?| array['variantId','condition','grade','price','currency'] or p_mapping->>'method' <> 'reviewed_exact'
    or (p_mapping->>'printingId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or (p_mapping->>'catalogueVersionId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or (p_mapping->>'providerCategoryId') !~ '^[1-9][0-9]*$' or (p_mapping->>'providerProductId') !~ '^[1-9][0-9]*$'
    or jsonb_typeof(p_mapping->'languageEvidence') <> 'object' or p_mapping->'languageEvidence'='{}'::jsonb
    or jsonb_typeof(p_mapping->'variantEvidence') <> 'object' or p_mapping->'variantEvidence'='{}'::jsonb
    or jsonb_typeof(p_mapping->'finishEvidence') <> 'object' or p_mapping->'finishEvidence'='{}'::jsonb
    or length(btrim(p_mapping->>'reviewReference')) not between 5 and 1000 then raise exception 'invalid reviewed Cardmarket mapping'; end if;
  pid := (p_mapping->>'printingId')::uuid; category := (p_mapping->>'providerCategoryId')::integer; product := (p_mapping->>'providerProductId')::bigint; version_id := (p_mapping->>'catalogueVersionId')::uuid;
  select * into prior from market.cardmarket_printing_mappings where printing_id=pid;
  insert into market.cardmarket_printing_mappings(printing_id,catalogue_version_id,provider_category_id,provider_product_id,method,language_evidence,variant_evidence,finish_evidence,review_reference)
  values(pid,version_id,category,product,'reviewed_exact',p_mapping->'languageEvidence',p_mapping->'variantEvidence',p_mapping->'finishEvidence',btrim(p_mapping->>'reviewReference'))
  on conflict(printing_id) do update set catalogue_version_id=excluded.catalogue_version_id,provider_category_id=excluded.provider_category_id,provider_product_id=excluded.provider_product_id,language_evidence=excluded.language_evidence,variant_evidence=excluded.variant_evidence,finish_evidence=excluded.finish_evidence,review_reference=excluded.review_reference,reviewed_at=now()
  where (market.cardmarket_printing_mappings.catalogue_version_id, market.cardmarket_printing_mappings.provider_category_id, market.cardmarket_printing_mappings.provider_product_id, market.cardmarket_printing_mappings.language_evidence, market.cardmarket_printing_mappings.variant_evidence, market.cardmarket_printing_mappings.finish_evidence, market.cardmarket_printing_mappings.review_reference)
    is distinct from (excluded.catalogue_version_id, excluded.provider_category_id, excluded.provider_product_id, excluded.language_evidence, excluded.variant_evidence, excluded.finish_evidence, excluded.review_reference);
  update market.cardmarket_mapping_repairs set status='resolved',last_seen_at=now() where provider_category_id=category and provider_product_id=product;
  return true;
end;
$function$;

create function api.read_cardmarket_retained_feed_revision(p_kind text,p_sha256 text) returns uuid
language sql stable security invoker set search_path='' as $function$
 select id from market.cardmarket_public_feed_revisions where feed_kind=p_kind and sha256=p_sha256;
$function$;
revoke all on function api.read_cardmarket_retained_feed_revision(text,text) from public,anon,authenticated;
grant execute on function api.read_cardmarket_retained_feed_revision(text,text) to service_role;
