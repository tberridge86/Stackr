-- Expose existing printing metadata through the existing published-card API.
-- Preserve identities, publication filters, privileges and security-invoker behavior.
CREATE OR REPLACE VIEW api.catalogue_cards WITH (security_invoker = true) AS
SELECT v.id AS variant_id,
    cv.id AS catalogue_version_id,
    cv.version_key AS catalogue_version,
    v.canonical_key,
    v.game_code,
    v.language_code,
    l.english_name AS language_english_name,
    l.native_name AS language_native_name,
    p.set_id,
    s.set_code,
    s.native_name AS set_native_name,
    s.english_display_name AS set_english_display_name,
    p.id AS printing_id,
    p.collector_number,
    p.collector_number_prefix,
    p.collector_number_sort,
    p.collector_number_suffix,
    p.collector_number_sort_key,
    p.native_name AS card_native_name,
    p.english_display_name AS card_english_display_name,
    r.code AS rarity_code,
    r.english_label AS rarity_label,
    v.variant_code,
    vt.english_label AS variant_label,
    v.finish_code,
    f.english_label AS finish_label,
    v.artwork_key,
    p.updated_at,
    GREATEST(p.updated_at, v.updated_at, s.updated_at) AS changed_at,
    v.native_image_status,
    v.same_artwork_as_variant_id,
    p.card_concept_id,
    cc.default_english_name AS concept_english_display_name,
    p.supertype,
    p.subtypes,
    p.artist
   FROM catalog.catalogue_version_variants cvv
     JOIN catalog.catalogue_versions cv ON cv.id = cvv.catalogue_version_id
     JOIN catalog.card_variants v ON v.id = cvv.variant_id
     JOIN catalog.card_printings p ON p.id = v.printing_id
     JOIN catalog.sets s ON s.id = p.set_id
     JOIN catalog.languages l ON l.code = v.language_code
     LEFT JOIN catalog.card_concepts cc ON cc.id = p.card_concept_id AND cc.deprecated_at IS NULL
     LEFT JOIN catalog.rarities r ON r.id = p.rarity_id
     LEFT JOIN catalog.variant_taxonomy vt ON vt.code = v.variant_code
     LEFT JOIN catalog.finishes f ON f.code = v.finish_code
  WHERE cv.status = 'published'::text AND cv.deprecated_at IS NULL AND v.deprecated_at IS NULL AND p.deprecated_at IS NULL AND s.deprecated_at IS NULL;
NOTIFY pgrst, 'reload schema';
