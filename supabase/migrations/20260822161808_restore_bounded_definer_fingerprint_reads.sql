alter function api.list_recognition_fingerprint_assets(uuid[]) security definer;
alter function api.list_recognition_fingerprint_context(text, uuid, integer) security definer;

revoke all on function api.list_recognition_fingerprint_assets(uuid[]) from public;
revoke all on function api.list_recognition_fingerprint_context(text, uuid, integer) from public;
grant execute on function api.list_recognition_fingerprint_assets(uuid[])
  to anon, authenticated, service_role;
grant execute on function api.list_recognition_fingerprint_context(text, uuid, integer)
  to anon, authenticated, service_role;

comment on function api.list_recognition_fingerprint_assets(uuid[]) is
  'Bounded read-only definer function. Returns only public eligible asset metadata for at most 500 requested variants with a fixed empty search path.';

comment on function api.list_recognition_fingerprint_context(text, uuid, integer) is
  'Bounded read-only definer function. Returns only public launch-language catalogue context in pages of at most 500 with a fixed empty search path.';
