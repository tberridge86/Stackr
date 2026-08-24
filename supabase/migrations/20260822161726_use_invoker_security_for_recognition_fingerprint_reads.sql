alter function api.list_recognition_fingerprint_assets(uuid[]) security invoker;
alter function api.list_recognition_fingerprint_context(text, uuid, integer) security invoker;

comment on function api.list_recognition_fingerprint_assets(uuid[]) is
  'Returns one deterministic public recognition reference asset for each of at most 500 requested launch-language variants under caller RLS.';

comment on function api.list_recognition_fingerprint_context(text, uuid, integer) is
  'Pages public recognition metadata, aliases, and one canonical eligible reference hash under caller RLS.';
