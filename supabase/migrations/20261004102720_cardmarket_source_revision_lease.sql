set local lock_timeout='5s';
set local statement_timeout='60s';
create function api.claim_cardmarket_source_revision(p_kind text,p_source_created_at timestamptz,p_sha256 text) returns uuid
language plpgsql security invoker set search_path='' as $function$
declare token uuid; latest timestamptz;
begin
 if p_kind is null or p_kind not in ('products','price_guide') or p_source_created_at is null or p_source_created_at>now()+interval '5 minutes' or p_source_created_at<now()-interval '365 days' or p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'invalid Cardmarket source revision'; end if;
 insert into market.cardmarket_public_feed_leases(feed_kind) values(p_kind) on conflict do nothing;
 perform 1 from market.cardmarket_public_feed_leases where feed_kind=p_kind for update;
 if exists(select 1 from market.cardmarket_public_feed_leases where feed_kind=p_kind and (lease_until>now() or retry_after>now())) then return null; end if;
 if exists(select 1 from market.cardmarket_public_feed_revisions where feed_kind=p_kind and sha256=p_sha256) then return null; end if;
 select max(source_created_at) into latest from market.cardmarket_public_feed_revisions where feed_kind=p_kind;
 if latest is not null and p_source_created_at<=latest then return null; end if;
 token=gen_random_uuid(); update market.cardmarket_public_feed_leases set lease_token=token,lease_until=now()+interval '15 minutes' where feed_kind=p_kind; return token;
end;
$function$;
revoke all on function api.claim_cardmarket_source_revision(text,timestamptz,text) from public,anon,authenticated;
grant execute on function api.claim_cardmarket_source_revision(text,timestamptz,text) to service_role;
