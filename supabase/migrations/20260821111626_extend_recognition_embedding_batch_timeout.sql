-- The PostgREST authenticator role is capped at eight seconds. Near the end of
-- a 49k-row HNSW build, a controlled embedding insert can legitimately exceed
-- that cap. Keep the exemption scoped to the service-role-only batch function;
-- do not change the database or role-wide timeout.
alter function api.upsert_recognition_embedding_batch(uuid, jsonb)
  set statement_timeout = '60s';
