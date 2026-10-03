-- Issue #304: make the curated 2001 CoroCoro association explicit without
-- substituting the magazine cover for the missing card-front asset.
--
-- Evidence checked 2026-10-03:
-- Bulbapedia: Shining Mew (CoroCoro promo) -- unnumbered Japanese promo,
-- May 2001 CoroCoro Comic insert, released 2001-04-15, Hironobu Yoshida.
-- PokeBoon independently records the same May 2001 insert/distribution date.

update public.pokemon_cards
set raw_data = coalesce(raw_data,'{}'::jsonb) || jsonb_build_object(
      'association_evidence', jsonb_build_object(
        'publication','CoroCoro Comic',
        'issue','May 2001',
        'distribution_date','2001-04-15',
        'printing','Shining Mew / ひかるミュウ / unnumbered Japanese promo',
        'illustrator','Hironobu Yoshida',
        'verified_at','2026-10-03T09:46:00Z',
        'sources',jsonb_build_array(
          'https://bulbapedia.bulbagarden.net/wiki/Shining_Mew_(CoroCoro_promo)',
          'https://pokeboon.com/corocoro_shiningmew_promo/'
        )
      ),
      'artwork_binding', jsonb_build_object(
        'status','missing_authorised_card_front',
        'card_front_required',true,
        'magazine_cover_is_not_card_front',true,
        'expected_asset_identity','ja:corocoro-shining-mew-2001'
      )
    ),
    image_status = case when image_small is null and image_large is null then 'missing' else image_status end,
    last_image_checked_at = now()
where id='ja:corocoro-shining-mew-2001'
  and set_id='ja:corocoro-comic-may-2001-promo';

-- Guard the 1997 glossy Mew from being conflated with the 2001 Shining Mew.
update public.pokemon_cards
set raw_data = coalesce(raw_data,'{}'::jsonb) || jsonb_build_object(
      'artwork_binding', jsonb_build_object(
        'status',case when image_small is null and image_large is null then 'missing_authorised_card_front' else 'bound' end,
        'card_front_required',true,
        'magazine_cover_is_not_card_front',true,
        'expected_asset_identity','ja:corocoro-mew-1997'
      )
    )
where id='ja:corocoro-mew-1997'
  and set_id='ja:corocoro-comic-february-1997-promo';
