-- Rollback for 20260728171416_stackr_market_pricing_service.sql.
-- This removes only the Stage 10 market-pricing additions.
-- Review before applying anywhere with live pricing data.

drop view if exists api.market_opportunities;
drop view if exists api.market_movers;
drop view if exists api.market_price_history;
drop view if exists api.market_price_estimates;

drop table if exists market.refresh_jobs;
drop table if exists market.outlier_decisions;
drop table if exists market.price_estimates;
drop table if exists market.price_estimate_versions;
drop table if exists market.sold_observations;
drop table if exists market.active_listings;
drop table if exists market.duplicate_groups;
drop table if exists market.grades;
drop table if exists market.graders;
drop table if exists market.conditions;
drop table if exists market.exchange_rate_snapshots;
drop table if exists market.currencies;
drop table if exists market.source_providers;

alter table if exists market.price_observations
  drop column if exists observation_kind,
  drop column if exists ingestion_run_id,
  drop column if exists duplicate_group_id,
  drop column if exists parsed_match_confidence,
  drop column if exists raw_title,
  drop column if exists source_url,
  drop column if exists sold_at,
  drop column if exists grade_id,
  drop column if exists grader_code,
  drop column if exists condition_code,
  drop column if exists sale_or_listing_type,
  drop column if exists currency_code,
  drop column if exists shipping_price,
  drop column if exists observed_price,
  drop column if exists source_item_id,
  drop column if exists provider_code;
