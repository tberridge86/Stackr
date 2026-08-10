begin;

drop function if exists api.observability_refresh_dashboard_snapshots(integer);
drop function if exists api.observability_apply_retention();
drop function if exists api.observability_dashboard();
drop function if exists api.observability_store_quality_report(text, text, text, jsonb, text);
drop function if exists api.observability_store_dashboard_snapshot(text, text, timestamptz, timestamptz, jsonb, integer, text[], timestamptz, timestamptz);
drop function if exists api.observability_record_event(jsonb);

drop table if exists audit.observability_dashboard_snapshots;
drop table if exists audit.provider_cost_observations;
drop table if exists audit.observability_trace_spans;
drop table if exists audit.observability_events;
drop table if exists audit.quality_release_gate_results;
drop table if exists audit.quality_evaluation_runs;
drop table if exists audit.quality_gold_sets;
drop function if exists audit.quality_observability_set_updated_at();

commit;
