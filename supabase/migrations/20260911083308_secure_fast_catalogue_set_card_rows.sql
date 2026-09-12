alter function api.catalogue_set_card_rows(uuid, text, uuid, integer) security invoker;
revoke all on function api.catalogue_set_card_rows(uuid, text, uuid, integer) from public, anon, authenticated;
grant execute on function api.catalogue_set_card_rows(uuid, text, uuid, integer) to service_role;
comment on function api.catalogue_set_card_rows(uuid, text, uuid, integer) is 'Bounded service-backend set-card read returning published card rows plus preferred approved artwork in one round trip.';

drop function if exists api.catalogue_set_cards_bundle(uuid, text, uuid, integer);
