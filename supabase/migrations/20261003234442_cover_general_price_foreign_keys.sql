-- Cover canonical foreign keys for safe printing/version maintenance.
set local lock_timeout='5s';
set local statement_timeout='60s';
create index catalogue_general_prices_printing_idx on market.catalogue_general_prices(printing_id);
create index catalogue_general_prices_version_idx on market.catalogue_general_prices(catalogue_version_id);
