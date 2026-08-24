-- The role-wide PostgREST timeout remains eight seconds. A read-only vector
-- comparison against the complete 49k candidate index can legitimately take
-- longer, so scope the exception to the existing service-role-only search RPC.
alter function api.search_recognition_candidate_index(uuid, jsonb, text, integer)
  set statement_timeout = '60s';
