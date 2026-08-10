-- Rollback for 20260728064400_embedding_model_registry_and_index_gates.sql.
-- This removes only the Stage 6 benchmark registry and activation gates.
-- It does not drop the ml, api or audit schemas because earlier stages may
-- own other objects in those schemas.

drop view if exists api.embedding_index_manifest;

drop function if exists ml.activate_embedding_index_version(uuid, text);
drop function if exists ml.card_embedding_vector_table_sql(text);

drop table if exists ml.embedding_activation_events;
drop table if exists ml.embedding_generation_jobs;
drop table if exists ml.embedding_index_versions;
drop table if exists ml.embedding_benchmark_results;
drop table if exists ml.embedding_benchmark_runs;
drop table if exists ml.embedding_models;
