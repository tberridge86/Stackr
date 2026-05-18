alter table public.seller_inventory_items
  drop constraint if exists seller_inventory_items_card_id_fkey;

alter table public.seller_sale_transaction_items
  drop constraint if exists seller_sale_transaction_items_card_id_fkey;

comment on column public.seller_inventory_items.card_id is
  'Pokemon card id for card stock, or product:<type>:<slug> for sealed products and accessories.';

comment on column public.seller_sale_transaction_items.card_id is
  'Pokemon card id for card sale lines, or product:<type>:<slug> for product sale lines.';
