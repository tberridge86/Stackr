-- Checkpoint finalisation is on the hot path for every provider group.  The
-- original failure path joined api.catalogue_cards, a deliberately rich
-- presentation view, and could exceed the RPC statement budget before the
-- checkpoint committed.  Keep the exact published-card eligibility predicate
-- but use only its physical publication relations.  Product repair recording
-- is likewise one bounded set operation per cached group rather than an
-- upsert loop.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function api.finish_catalogue_bulk_sweep_group(
  p_run uuid,
  p_category integer,
  p_group bigint,
  p_token uuid,
  p_status text,
  p_stats jsonb,
  p_retry_seconds integer default 0
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  retry_at timestamptz;
begin
  if p_status is null
    or p_status not in ('complete','unmapped','failed')
    or jsonb_typeof(p_stats) is distinct from 'object' then
    raise exception 'invalid checkpoint' using errcode = '22023';
  end if;

  retry_at := case when p_status = 'failed'
    then now() + make_interval(secs => greatest(60, least(coalesce(p_retry_seconds, 600), 86400)))
  end;

  update market.catalogue_bulk_groups
  set status = p_status,
      stats = p_stats,
      lease_token = null,
      lease_until = null,
      completed_at = now(),
      retry_after = retry_at
  where run_id = p_run
    and category_id = p_category
    and group_id = p_group
    and lease_token = p_token
    and lease_until > now();
  if not found then
    return false;
  end if;

  if p_status = 'failed' then
    -- Equivalent to the published/deprecation/language predicate of
    -- api.catalogue_cards, without its display, taxonomy and artwork joins.
    insert into market.catalogue_price_outcomes(
      variant_id, catalogue_version_id, reason, checked_at, next_retry_at, provider
    )
    select
      v.id,
      cvv.catalogue_version_id,
      'provider_backoff',
      now(),
      retry_at,
      'tcgcsv'
    from market.catalogue_provider_set_members member
    join catalog.card_printings printing
      on printing.set_id = member.set_id
      and printing.deprecated_at is null
    join catalog.card_variants v
      on v.printing_id = printing.id
      and v.language_code = member.language_code
      and v.deprecated_at is null
    join catalog.catalogue_version_variants cvv
      on cvv.variant_id = v.id
    join catalog.catalogue_versions cv
      on cv.id = cvv.catalogue_version_id
      and cv.status = 'published'
      and cv.deprecated_at is null
    join catalog.sets catalogue_set
      on catalogue_set.id = printing.set_id
      and catalogue_set.deprecated_at is null
    join catalog.languages language
      on language.code = v.language_code
    where member.category_id = p_category
      and member.group_id = p_group
    on conflict (variant_id) do update
      set catalogue_version_id = excluded.catalogue_version_id,
          reason = excluded.reason,
          checked_at = excluded.checked_at,
          next_retry_at = excluded.next_retry_at;
  end if;

  if p_status in ('complete','unmapped') then
    -- Keep malformed cached provider products retryable.  The predecessor's
    -- bigint cast rejected them; silently skipping one would incorrectly make
    -- a finished group look complete.
    if exists (
      select 1
      from market.catalogue_bulk_feeds feed
      cross join lateral jsonb_array_elements(feed.payload -> 'results') as product(value)
      where feed.feed_key = 'tcgplayer/' || p_category || '/' || p_group || '/products'
        and exists (
          select 1
          from jsonb_array_elements(product.value -> 'extendedData') as extended(value)
          where extended.value ->> 'name' = 'Number'
            and length(extended.value ->> 'value') > 0
        )
        and coalesce(product.value ->> 'productId', '') !~ '^[1-9][0-9]*$'
    ) then
      raise exception 'invalid provider product' using errcode = '22023';
    end if;

    insert into market.catalogue_price_repairs(
      repair_key, category_id, group_id, product_id, reason, detail
    )
    select
      'product:' || p_category || ':' || (product.value ->> 'productId'),
      p_category,
      p_group,
      (product.value ->> 'productId')::bigint,
      'unmapped_provider_product',
      product.value
    from market.catalogue_bulk_feeds feed
    cross join lateral jsonb_array_elements(feed.payload -> 'results') as product(value)
    where feed.feed_key = 'tcgplayer/' || p_category || '/' || p_group || '/products'
      and product.value ->> 'productId' ~ '^[1-9][0-9]*$'
      and exists (
        select 1
        from jsonb_array_elements(product.value -> 'extendedData') as extended(value)
        where extended.value ->> 'name' = 'Number'
          and length(extended.value ->> 'value') > 0
      )
      and not exists (
        select 1
        from market.catalogue_provider_cards mapped
        where mapped.category_id = p_category
          and mapped.product_id = (product.value ->> 'productId')::bigint
      )
    on conflict (repair_key) do update
      set detail = excluded.detail,
          status = 'open',
          last_seen_at = now();
  end if;

  return true;
end;
$function$;

revoke all on function api.finish_catalogue_bulk_sweep_group(uuid,integer,bigint,uuid,text,jsonb,integer)
  from public, anon, authenticated;
grant execute on function api.finish_catalogue_bulk_sweep_group(uuid,integer,bigint,uuid,text,jsonb,integer)
  to service_role;
