begin;

drop table if exists audit.gateway_security_events;
drop table if exists audit.partner_api_usage_hourly;
drop table if exists audit.partner_api_key_scopes;
drop table if exists audit.partner_api_keys;
drop table if exists audit.partner_api_scopes;
drop table if exists audit.partner_api_clients;
drop function if exists audit.gateway_set_updated_at();

commit;
