-- Supabase is changing public-schema Data API exposure defaults. Keep the
-- app explicit about which API roles can reach each table; RLS still decides
-- which rows are visible or writable.

grant usage on schema public to anon, authenticated, service_role;

do $$
declare
  table_name text;
  anon_select_tables text[] := array[
    'pokemon_sets',
    'pokemon_cards',
    'market_price_snapshots',
    'market_products',
    'market_product_price_snapshots',
    'local_stores',
    'local_featured_events',
    'local_meetups',
    'local_meetup_attendees',
    'community_news',
    'profiles',
    'binders',
    'binder_cards',
    'user_card_flags'
  ];
  authenticated_select_tables text[] := anon_select_tables;
  authenticated_write_tables text[] := array[
    'profiles',
    'binders',
    'binder_cards',
    'user_card_flags',
    'user_pokedex_cards',
    'seller_inventory_items',
    'seller_sale_transactions',
    'seller_sale_transaction_items',
    'market_products',
    'market_product_price_snapshots',
    'local_stores',
    'local_featured_events',
    'local_meetups',
    'local_meetup_attendees',
    'community_news'
  ];
  service_role_tables text[] := array[
    'pokemon_sets',
    'pokemon_cards',
    'market_price_snapshots',
    'market_products',
    'market_product_price_snapshots',
    'profiles',
    'binders',
    'binder_cards',
    'user_card_flags',
    'user_card_variants',
    'user_pokedex_cards',
    'seller_inventory_items',
    'seller_sale_transactions',
    'seller_sale_transaction_items',
    'local_stores',
    'local_featured_events',
    'local_meetups',
    'local_meetup_attendees',
    'community_news',
    'card_fingerprints',
    'card_clip_embeddings'
  ];
begin
  foreach table_name in array anon_select_tables loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('grant select on table public.%I to anon', table_name);
    end if;
  end loop;

  foreach table_name in array authenticated_select_tables loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('grant select on table public.%I to authenticated', table_name);
    end if;
  end loop;

  foreach table_name in array authenticated_write_tables loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('grant select, insert, update, delete on table public.%I to authenticated', table_name);
    end if;
  end loop;

  foreach table_name in array service_role_tables loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
    end if;
  end loop;
end $$;

grant usage, select on all sequences in schema public to authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;

alter default privileges in schema public
  grant usage, select on sequences to service_role;
