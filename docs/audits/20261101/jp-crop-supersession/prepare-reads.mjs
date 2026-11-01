import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const first = 'e8e16a23-fc7a-4ec8-abfe-b74448fa5f27';
const second = '7dbeff79-cfb7-4ac8-8a4f-d7c73a523349';
const sets = `'${first}'::uuid,'${second}'::uuid`;
const old = '34e5af6e-66d0-4fea-98ce-b1fa1ec1d1dd';
let links = fs.readFileSync(path.join(root, '../svp1/logo-first-complete-effective-links.sql'), 'utf8')
  .replace(`='${old}'::uuid`, ` in (${sets})`)
  .replace(/-- Exact SVP1[^\n]*\n/, '-- Two reviewed Japanese title crops; read-only complete effective link and immutable asset envelope.\n')
  .replace('stackr-svp1-native-title-read-part-v1', 'stackr-jp-crop-complete-links-v1')
  .replace(`'setId','${old}'`, `'setIds',jsonb_build_array('${first}','${second}')`)
  .replace('select a.id,a.asset_id,a.asset_type,a.game_code,a.set_id,a.printing_id,a.variant_id,a.source_id,a.url,a.storage_path,a.mime_type,a.width,a.height,a.sha256,a.content_sha256,a.byte_size,a.rights_status,a.permission_status,a.publicly_servable,a.asset_visibility,a.storage_provider,a.storage_bucket,a.storage_key,a.original_source_url,a.original_source_identifier,a.source_attribution,a.derivative_list,a.cache_control,a.externally_referenced,a.unavailable_reason,a.retention_status,a.deleted_at,a.deprecated_at,a.acquisition_source,a.recognition_reference_eligible,a.licensing_review_notes,a.updated_at', 'select a.*');
fs.writeFileSync(path.join(root, 'complete-effective-links.sql'), links, {flag:'wx'});
const targets = [
  [first, '7dcfb743b476c6cba7771d20a6ace737ba67201c1fa53b8b260d0079967c0383'],
  [second, 'f11661657260c1c19e1da24ceeeb5ef69fd59a16f436fedfa204a473da103add'],
];
const lanes = targets.flatMap(([id, hash])=>[
  `select id from catalog.assets where asset_id='reviewed:set-logo:${id}:${hash}'`,
  `select id from catalog.assets where storage_provider='s3_compatible' and storage_bucket='stackr-catalogue-public' and storage_key='public/set_logo/${hash.slice(0,2)}/${hash.slice(2,4)}/${hash}/original.png' and deleted_at is null`,
  `select id from catalog.assets where content_sha256='${hash}' and deleted_at is null and set_id='${id}'::uuid and asset_type='set_logo'`,
]);
const envelope = `begin read only;
set local statement_timeout='5s'; set local lock_timeout='1s';
with candidate_ids as materialized (${lanes.join('\nunion\n')}), candidates as (
 select a.* from candidate_ids wanted join catalog.assets a on a.id=wanted.id order by a.id limit 1001
)
select jsonb_build_object('schemaVersion','stackr-jp-crop-publication-envelope-v1',
 'declaredProjectRef','oakdbbzdqwurpjnoqhmu','capturedAt',now(),
 'sets',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'game_code',s.game_code,'language_code',s.language_code,
   'set_code',s.set_code,'provider_set_code',s.provider_set_code,'native_name',s.native_name,
   'english_display_name',s.english_display_name,'deprecated_at',s.deprecated_at) order by s.id)
   from catalog.sets s where s.id in (${sets})),'[]'::jsonb),
 'publishedMemberships',coalesce((select jsonb_agg(to_jsonb(p) order by p.set_id,p.catalogue_version_id)
   from (select set_id,catalogue_version_id,language_code from api.catalogue_sets where set_id in (${sets}) limit 101) p),'[]'::jsonb),
 'candidateAssets',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from candidates a),'[]'::jsonb),
 'sources',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'code',s.code)) from ingest.sources s where s.code='stackr_manual'),'[]'::jsonb)
) as publication_envelope;
rollback;
`;
fs.writeFileSync(path.join(root, 'publication-envelope.sql'), envelope, {flag:'wx'});
console.log('Prepared two read-only, bounded SQL inputs. No remote effects.');
