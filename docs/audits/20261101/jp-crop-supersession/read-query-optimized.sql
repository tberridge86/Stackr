-- Two reviewed Japanese title crops; read-only complete effective link and immutable asset envelope.
begin read only;
set local statement_timeout='5s'; set local lock_timeout='1s';
with active_versions as materialized (
  select id from catalog.catalogue_versions where status='published' and deprecated_at is null
), explicit_logo_pairs as materialized (
  -- Filter explicit logo memberships once, before joining active versions.
  -- Preserve orphan/mistyped assets and every language/version in this lane.
  select catalogue_version_id,asset_id
    from catalog.catalogue_version_assets where asset_type='set_logo'
), candidate_pairs as materialized (
  -- First lane covers every explicit logo link, including orphan/mistyped assets.
  select wanted.catalogue_version_id,wanted.asset_id
    from explicit_logo_pairs wanted join active_versions cv on cv.id=wanted.catalogue_version_id
  union all
  -- Second lane covers asset-typed logos whose link is not already in lane one.
  -- IS DISTINCT FROM retains null link types; no deleted/permission filter is added.
  select cva.catalogue_version_id,cva.asset_id
    from catalog.assets a
    join catalog.catalogue_version_assets cva on cva.asset_id=a.id
    join active_versions cv on cv.id=cva.catalogue_version_id
    where a.asset_type='set_logo' and cva.asset_type is distinct from 'set_logo'
), links as materialized (
  select cva.* from candidate_pairs wanted
  join catalog.catalogue_version_assets cva
    on cva.catalogue_version_id=wanted.catalogue_version_id and cva.asset_id=wanted.asset_id
  join catalog.catalogue_versions cv on cv.id=cva.catalogue_version_id
  left join catalog.assets linked on linked.id=cva.asset_id
  left join catalog.card_variants av on av.id=coalesce(cva.variant_id,linked.variant_id)
  left join catalog.card_printings ap on ap.id=coalesce(cva.printing_id,linked.printing_id,av.printing_id)
  where cv.status='published' and cv.deprecated_at is null
    and coalesce(cva.set_id,linked.set_id,av.set_id,ap.set_id) in ('e8e16a23-fc7a-4ec8-abfe-b74448fa5f27'::uuid,'7dbeff79-cfb7-4ac8-8a4f-d7c73a523349'::uuid)
    and (cva.asset_type='set_logo' or linked.asset_type='set_logo')
  order by cva.catalogue_version_id,cva.asset_id limit 1001),
 linked_assets as(select a.* from catalog.assets a where a.id in(select asset_id from links) order by a.id limit 1001)
select jsonb_build_object('schemaVersion','stackr-jp-crop-complete-links-v1',
 'ordinal',2,'label','complete-effective-logo-links-and-assets','declaredProjectRef','oakdbbzdqwurpjnoqhmu','setIds',jsonb_build_array('e8e16a23-fc7a-4ec8-abfe-b74448fa5f27','7dbeff79-cfb7-4ac8-8a4f-d7c73a523349'),'capturedAt',now(),
 'publishedLinks',coalesce((select jsonb_agg(to_jsonb(l) order by l.catalogue_version_id,l.asset_id) from links l),'[]'::jsonb),
 'linkedAssets',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from linked_assets a),'[]'::jsonb)) as snapshot_part;
rollback;
