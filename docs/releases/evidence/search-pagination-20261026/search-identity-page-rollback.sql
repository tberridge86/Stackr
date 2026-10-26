-- Rollback for a FIRST installation only. Before any future approved rollout,
-- attest this signature was absent or retain/restore its exact prior definition
-- and ACL instead. No migration or production operation is authorized here.
begin;
drop function if exists api.catalogue_search_identity_page_v1(jsonb,jsonb,integer,text,jsonb);
commit;
