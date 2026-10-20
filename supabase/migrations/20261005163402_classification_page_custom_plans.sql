-- Parameterised page cardinalities require a custom plan. Scope this setting
-- to these new service-only functions rather than changing database defaults.
set local lock_timeout='5s';
set local statement_timeout='60s';
alter function api.pricing_classification_page(uuid,integer) set plan_cache_mode='force_custom_plan';
alter function api.store_pricing_classification_page(uuid,integer) set plan_cache_mode='force_custom_plan';
