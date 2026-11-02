-- Search selectors vary by language, name, exact identity and set. A generic
-- plan made bounded name pages substantially slower in production probes.
-- Scope parameter-aware planning to this existing service-only RPC. Its SQL,
-- publication rules, ordering, cursor revision checks and grants stay intact.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
alter function api.catalogue_search_identity_page_v1(jsonb,jsonb,integer,text,jsonb)
  set plan_cache_mode = 'force_custom_plan';
commit;
