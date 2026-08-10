begin;

select plan(17);

select ok(to_regnamespace('catalog') is not null, 'catalog schema exists');
select ok(to_regnamespace('ingest') is not null, 'ingest schema exists');
select ok(to_regnamespace('market') is not null, 'market schema exists');
select ok(to_regnamespace('ml') is not null, 'ml schema exists');
select ok(to_regnamespace('api') is not null, 'api schema exists');
select ok(to_regnamespace('audit') is not null, 'audit schema exists');

select is((select count(*) from catalog.languages where active), 5::bigint, 'five supported languages are active');
select is((select count(*) from catalog.variant_taxonomy where active and code in (
  'normal', 'holo', 'reverse_holo', 'first_edition', 'unlimited', 'promo', 'stamped', 'poke_ball', 'master_ball'
)), 9::bigint, 'required variant taxonomy is seeded');

select ok(to_regprocedure('catalog.activate_catalogue_version(uuid,text,text)') is not null, 'catalogue activation function exists');
select ok(to_regprocedure('catalog.rollback_catalogue_version(uuid,text,text)') is not null, 'catalogue rollback function exists');
select ok(to_regprocedure('ml.activate_embedding_index_version(uuid,text)') is not null, 'embedding activation function exists');
select ok(to_regprocedure('ml.rollback_embedding_index_version(uuid,text,text)') is not null, 'embedding rollback function exists');

select ok(not has_schema_privilege('anon', 'ingest', 'usage'), 'anon cannot use ingest schema');
select ok(not has_schema_privilege('authenticated', 'ml', 'usage'), 'authenticated cannot use ml schema');
select ok(not has_schema_privilege('anon', 'audit', 'usage'), 'anon cannot use audit schema');
select ok(not has_table_privilege('anon', 'audit.release_activation_events', 'select'), 'anon cannot read release audit events');
select ok(has_function_privilege('service_role', 'catalog.activate_catalogue_version(uuid,text,text)', 'execute'), 'service role can activate catalogue versions');

select * from finish();
rollback;
