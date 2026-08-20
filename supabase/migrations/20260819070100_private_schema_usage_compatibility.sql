-- Existing StackR migrations use authenticated, RLS-controlled objects in the
-- private schema. Schema USAGE alone exposes no table or function data, so
-- preserve that compatibility while keeping the Stripe event ledger itself
-- service-role only.
create schema if not exists private;

grant usage on schema private to authenticated, service_role;

revoke all on table private.stripe_webhook_events from public, anon, authenticated;
grant select, insert, update, delete on table private.stripe_webhook_events to service_role;
