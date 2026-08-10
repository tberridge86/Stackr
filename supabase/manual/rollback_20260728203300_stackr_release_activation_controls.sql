revoke all on function catalog.activate_catalogue_version(uuid, text, text) from service_role;
revoke all on function catalog.rollback_catalogue_version(uuid, text, text) from service_role;
revoke all on function ml.rollback_embedding_index_version(uuid, text, text) from service_role;

drop function if exists catalog.activate_catalogue_version(uuid, text, text);
drop function if exists catalog.rollback_catalogue_version(uuid, text, text);
drop function if exists ml.rollback_embedding_index_version(uuid, text, text);

drop table if exists audit.release_activation_events;
