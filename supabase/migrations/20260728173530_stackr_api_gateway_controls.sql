begin;

create schema if not exists audit;

revoke all on schema audit from public, anon, authenticated;
grant usage on schema audit to service_role;

create function audit.gateway_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function audit.gateway_set_updated_at() from public, anon, authenticated;
grant execute on function audit.gateway_set_updated_at() to service_role;

create table if not exists audit.partner_api_clients (
  id uuid primary key default gen_random_uuid(),
  client_code text not null unique,
  display_name text not null,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'suspended', 'revoked')),
  api_access_enabled boolean not null default false,
  allowed_origins text[] not null default '{}',
  metadata jsonb not null default '{}',
  activated_at timestamptz,
  suspended_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (client_code ~ '^[a-z0-9][a-z0-9_-]{2,63}$'),
  check (not api_access_enabled or status = 'active')
);

create table if not exists audit.partner_api_scopes (
  scope_code text primary key,
  description text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scope_code ~ '^[a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*$')
);

create table if not exists audit.partner_api_keys (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references audit.partner_api_clients(id) on delete restrict,
  key_prefix text not null,
  key_hash text not null unique,
  hash_algorithm text not null default 'hmac_sha256_v1'
    check (hash_algorithm = 'hmac_sha256_v1'),
  status text not null default 'inactive'
    check (status in ('inactive', 'active', 'revoked', 'expired')),
  description text,
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (key_prefix ~ '^[A-Za-z0-9_-]{8,32}$'),
  check (key_hash ~ '^[a-f0-9]{64}$'),
  check (status <> 'active' or revoked_at is null)
);

create table if not exists audit.partner_api_key_scopes (
  key_id uuid not null references audit.partner_api_keys(id) on delete cascade,
  scope_code text not null references audit.partner_api_scopes(scope_code) on delete restrict,
  granted_at timestamptz not null default now(),
  granted_by uuid,
  primary key (key_id, scope_code)
);

create table if not exists audit.partner_api_usage_hourly (
  id bigint generated always as identity primary key,
  client_id uuid not null references audit.partner_api_clients(id) on delete restrict,
  key_id uuid not null references audit.partner_api_keys(id) on delete restrict,
  usage_hour_utc timestamp without time zone not null,
  route_id text not null,
  status_class smallint not null check (status_class between 1 and 5),
  request_count bigint not null default 0 check (request_count >= 0),
  request_bytes bigint not null default 0 check (request_bytes >= 0),
  response_bytes bigint not null default 0 check (response_bytes >= 0),
  rate_limited_count bigint not null default 0 check (rate_limited_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, key_id, usage_hour_utc, route_id, status_class),
  check (usage_hour_utc = date_trunc('hour', usage_hour_utc)),
  check (route_id ~ '^[a-z0-9][a-z0-9_-]{1,127}$')
);

create table if not exists audit.gateway_security_events (
  id bigint generated always as identity primary key,
  request_id text,
  event_type text not null
    check (event_type in (
      'jwt_rejected',
      'cors_rejected',
      'rate_limited',
      'payload_rejected',
      'replay_rejected',
      'idempotency_conflict',
      'circuit_opened',
      'admin_denied',
      'partner_key_rejected'
    )),
  route_id text,
  actor_hash text,
  device_hash text,
  ip_hash text,
  event_summary jsonb not null default '{}',
  occurred_at timestamptz not null default now(),
  check (actor_hash is null or actor_hash ~ '^[a-f0-9]{16,64}$'),
  check (device_hash is null or device_hash ~ '^[a-f0-9]{16,64}$'),
  check (ip_hash is null or ip_hash ~ '^[a-f0-9]{16,64}$')
);

create index if not exists partner_api_keys_client_status_idx
  on audit.partner_api_keys(client_id, status, expires_at);

create index if not exists partner_api_keys_prefix_active_idx
  on audit.partner_api_keys(key_prefix)
  where status = 'active' and revoked_at is null;

create index if not exists partner_api_key_scopes_scope_idx
  on audit.partner_api_key_scopes(scope_code, key_id);

create index if not exists partner_api_usage_hourly_client_time_idx
  on audit.partner_api_usage_hourly(client_id, usage_hour_utc desc);

create index if not exists partner_api_usage_hourly_key_idx
  on audit.partner_api_usage_hourly(key_id);

create index if not exists gateway_security_events_type_time_idx
  on audit.gateway_security_events(event_type, occurred_at desc);

create index if not exists gateway_security_events_request_idx
  on audit.gateway_security_events(request_id)
  where request_id is not null;

drop trigger if exists partner_api_clients_set_updated_at on audit.partner_api_clients;
create trigger partner_api_clients_set_updated_at
before update on audit.partner_api_clients
for each row execute function audit.gateway_set_updated_at();

drop trigger if exists partner_api_scopes_set_updated_at on audit.partner_api_scopes;
create trigger partner_api_scopes_set_updated_at
before update on audit.partner_api_scopes
for each row execute function audit.gateway_set_updated_at();

drop trigger if exists partner_api_keys_set_updated_at on audit.partner_api_keys;
create trigger partner_api_keys_set_updated_at
before update on audit.partner_api_keys
for each row execute function audit.gateway_set_updated_at();

drop trigger if exists partner_api_usage_set_updated_at on audit.partner_api_usage_hourly;
create trigger partner_api_usage_set_updated_at
before update on audit.partner_api_usage_hourly
for each row execute function audit.gateway_set_updated_at();

alter table audit.partner_api_clients enable row level security;
alter table audit.partner_api_scopes enable row level security;
alter table audit.partner_api_keys enable row level security;
alter table audit.partner_api_key_scopes enable row level security;
alter table audit.partner_api_usage_hourly enable row level security;
alter table audit.gateway_security_events enable row level security;

create policy "service role manages partner api clients"
  on audit.partner_api_clients for all to service_role using (true) with check (true);
create policy "service role manages partner api scopes"
  on audit.partner_api_scopes for all to service_role using (true) with check (true);
create policy "service role manages partner api keys"
  on audit.partner_api_keys for all to service_role using (true) with check (true);
create policy "service role manages partner api key scopes"
  on audit.partner_api_key_scopes for all to service_role using (true) with check (true);
create policy "service role manages partner api usage"
  on audit.partner_api_usage_hourly for all to service_role using (true) with check (true);
create policy "service role manages gateway security events"
  on audit.gateway_security_events for all to service_role using (true) with check (true);

revoke all on audit.partner_api_clients from public, anon, authenticated;
revoke all on audit.partner_api_scopes from public, anon, authenticated;
revoke all on audit.partner_api_keys from public, anon, authenticated;
revoke all on audit.partner_api_key_scopes from public, anon, authenticated;
revoke all on audit.partner_api_usage_hourly from public, anon, authenticated;
revoke all on audit.gateway_security_events from public, anon, authenticated;

grant select, insert, update, delete on audit.partner_api_clients to service_role;
grant select, insert, update, delete on audit.partner_api_scopes to service_role;
grant select, insert, update, delete on audit.partner_api_keys to service_role;
grant select, insert, update, delete on audit.partner_api_key_scopes to service_role;
grant select, insert, update, delete on audit.partner_api_usage_hourly to service_role;
grant select, insert, update, delete on audit.gateway_security_events to service_role;
grant usage, select on all sequences in schema audit to service_role;

insert into audit.partner_api_scopes(scope_code, description, active)
values
  ('catalogue:read', 'Read public-safe catalogue records.', true),
  ('search:read', 'Search public-safe catalogue records.', true),
  ('market:read', 'Read public aggregate market estimates.', true),
  ('recognition:identify', 'Submit recognition identification requests.', true),
  ('recognition:feedback', 'Submit recognition feedback.', true)
on conflict (scope_code) do update set
  description = excluded.description,
  active = excluded.active,
  updated_at = now();

comment on table audit.partner_api_clients is
  'Future partner API client registry. api_access_enabled defaults false; no public partner routes are activated by this migration.';

comment on column audit.partner_api_keys.key_hash is
  'One-way HMAC-SHA256 fingerprint only. Raw partner API keys and hashing peppers must never be stored in Postgres.';

comment on table audit.partner_api_usage_hourly is
  'Hourly partner usage accounting without request payloads, user identifiers or raw API keys.';

commit;
