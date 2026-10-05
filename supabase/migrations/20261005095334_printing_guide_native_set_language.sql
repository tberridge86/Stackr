-- Native provider identity must also match the physical SET language.
-- Keep the deployed guide migration immutable and repair both boundaries forward.
set local lock_timeout='5s';
set local statement_timeout='60s';
do $migration$
declare definition text; needle text; replacement text;
begin
 definition=pg_get_functiondef('api.store_catalogue_bulk_prices(jsonb)'::regprocedure);
 needle='join catalog.sets s on s.id=p.set_id and s.deprecated_at is null';
 replacement=needle||' and s.language_code=v.language_code';
 if position(needle in definition)=0 or position(replacement in definition)>0 then raise exception 'unexpected bulk store identity boundary'; end if;
 execute replace(definition,needle,replacement);
 definition=pg_get_functiondef('api.read_catalogue_printing_general_prices(uuid[])'::regprocedure);
 needle='join catalog.sets s on s.id=g.set_id and s.deprecated_at is null';
 replacement=needle||' and s.language_code=g.language_code';
 if position(needle in definition)=0 or position(replacement in definition)>0 then raise exception 'unexpected printing guide identity boundary'; end if;
 execute replace(definition,needle,replacement);
end;
$migration$;
notify pgrst,'reload schema';
