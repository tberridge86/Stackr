// Offline deterministic preparation. Does not open a database or network.
import { readFile, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { BINDING_FIELDS, selectFields, SOURCE_FIELDS, DECISION } from './frozen.mjs';

const root = process.argv[2];
check(root, 'Authoritative local handoff directory required');
const sourceBytes = await readFile(`${root}/trainer-kit35-source-manifest.json`);
check(digest(sourceBytes) === 'a6ab05c2933bd6d06fefef8452b7ab70d4f56f1bad2af7cab9644226d2ba51ec', 'Authoritative source manifest changed');
const source = JSON.parse(sourceBytes);
const snapshots = {};
for (const environment of ['production', 'staging']) {
  const saved = JSON.parse(await readFile(`${root}/publish-review/kit35-${environment}-bindings.json`));
  check(saved.length === 1 && saved[0].snapshot.cards.length === 35, 'Wrong source binding snapshot');
  snapshots[environment] = saved[0].snapshot;
}
const archive = { id: 638107947, kind: 'github_release_asset', artifact_directory: '638107947', sha256: '9bcc979f0ddb70dc64544c8cc592667fa19d570a12e295834600e459132ad862', byte_size: 32119253, file_count: 143 };
const rows = source.entries.map(entry => {
  for (const environment of ['production', 'staging']) {
    const found = snapshots[environment].cards.filter(card => card.printing_id === entry.printing_id);
    check(isDeepStrictEqual(found.map(card => card.variant_id).sort(), [...entry.variant_ids].sort()), 'Current variant IDs differ from source manifest');
    for (const card of found) for (const field of ['set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name', 'catalogue_version_id']) check(card[field] === entry[field], `Source/current binding changed: ${field}`);
  }
  const fields = ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name', 'catalogue_version_id', 'source_code', 'provider_id', 'image_url', 'batch_id', 'variant_ids'];
  return {
    ...selectFields(entry, fields),
    objects: entry.objects.map(object => ({ ...object, artifact_id: archive.id })),
    evidence: {
      source_url: entry.image_url, source_page_url: entry.source_page_url, provider_id: entry.provider_id,
      source_metadata_sha256: entry.source_metadata_sha256, collector_alias_evidence: entry.collector_alias_evidence,
      product_reference_used_for_binding: entry.product_reference_used_for_binding,
      cross_deck_reference_conflict: entry.cross_deck_reference_conflict,
      product_scope: entry.product_scope, pixel_identity: entry.pixel_identity,
      identity_checks: { savedMetadataMatched: true, currentProductionCardBindingMatched: true, physicalFinishVerified: false, printedCollectorOpticallyVerified: true },
      source_kind: entry.source_kind, artwork_scope: 'printing_front', exact_finish_verified: false, vendor_licence_verified: false,
      source_licence_facts: entry.source_licence_facts,
      owner_business_decision: { kind: DECISION, source_wide_approval: false, human_review_required: false, vendor_licence_verified: false },
    },
  };
});
const existing = snapshots.production.sources.map(policy => selectFields(policy, SOURCE_FIELDS));
check(existing.length === 1 && existing[0].code === 'scrydex' && !(snapshots.staging.sources?.length), 'Existing source scope changed');
const plan = {
  schemaVersion: 1, queue_id: source.queue_id, source_manifest_sha256: digest(sourceBytes), archive, rows,
  source_counts: source.source_counts,
  binding_expectations: Object.fromEntries(['production', 'staging'].map(environment => [environment, snapshots[environment].cards.map(card => selectFields(card, BINDING_FIELDS)).sort((a, b) => a.variant_id.localeCompare(b.variant_id))])),
  scope_counts: { production: { printings: 35, variants: 35, names: 70, sets: 2 }, staging: { printings: 35, variants: 35, names: 70, sets: 2 } },
  source_policies: { production: existing, staging: [] }, new_sources: { production: [], staging: existing },
};
const planBytes = Buffer.from(JSON.stringify(plan, null, 2) + '\n');
const previousDecision = JSON.parse(await readFile(new URL('../artwork-next-push-20261013/approval.json', import.meta.url)));
const approval = { ...previousDecision, fronts: 35, cohort_sha256: digest(planBytes), source_counts: source.source_counts, scope: 'Store, resize and display exactly these 35 trainer-kit source originals and 105 derivatives using automated identity, file and preservation checks. Exact source aliases and printed denominators are recorded; canonical names, numbers, variants and edition fields are unchanged. No per-batch owner review, production source insertion or source-wide activation. This is an owner business decision; no independent vendor licence, physical corner geometry or foil certification is asserted.' };
const approvalBytes = Buffer.from(JSON.stringify(approval, null, 2) + '\n');
await writeFile(new URL('./plan.json', import.meta.url), planBytes);
await writeFile(new URL('./approval.json', import.meta.url), approvalBytes);
const wanted = rows.map(row => `'${row.printing_id}'::uuid`).join(',');
const beforeQuery = `-- Read-only current before/after evidence for exactly 35 trainer-kit printings.\n-- Keep full returned metadata private, outside public workflow artifacts.\nBEGIN READ ONLY;\nSET LOCAL statement_timeout = '20s';\nWITH wanted AS (SELECT unnest(ARRAY[${wanted}]::uuid[]) AS id),\np AS MATERIALIZED (SELECT * FROM catalog.card_printings WHERE id IN (SELECT id FROM wanted)),\nv AS MATERIALIZED (SELECT * FROM catalog.card_variants WHERE printing_id IN (SELECT id FROM wanted) LIMIT 36),\nn AS MATERIALIZED (SELECT * FROM catalog.card_names WHERE printing_id IN (SELECT id FROM wanted) LIMIT 71),\na AS MATERIALIZED (\n SELECT * FROM catalog.assets\n WHERE printing_id IN (SELECT id FROM wanted) OR variant_id IN (SELECT id FROM v)\n OR (printing_id IS NULL AND variant_id IS NULL AND set_id IN (SELECT set_id FROM p)) LIMIT 201\n),\nl AS MATERIALIZED (\n SELECT * FROM catalog.catalogue_version_assets\n WHERE printing_id IN (SELECT id FROM wanted) OR variant_id IN (SELECT id FROM v)\n OR asset_id IN (SELECT id FROM a)\n OR (printing_id IS NULL AND variant_id IS NULL AND set_id IN (SELECT set_id FROM p)) LIMIT 201\n)\nSELECT 'printings' AS scope,id::text AS identity,to_jsonb(p) AS payload FROM p\nUNION ALL SELECT 'variants',id::text,to_jsonb(v) FROM v\nUNION ALL SELECT 'names',id::text,to_jsonb(n) FROM n\nUNION ALL SELECT 'sets',s.id::text,to_jsonb(s) FROM catalog.sets s WHERE id IN (SELECT set_id FROM p)\nUNION ALL SELECT 'assets',a.id::text,to_jsonb(a) FROM a\nUNION ALL SELECT 'links',l.catalogue_version_id::text||':'||l.asset_id::text,to_jsonb(l) FROM l\nUNION ALL SELECT 'sources',s.id::text,to_jsonb(s) FROM ingest.sources s WHERE code='scrydex'\nORDER BY scope,identity;\nROLLBACK;\n`;
await writeFile(new URL('./before-query.sql', import.meta.url), beforeQuery);
let frozen = await readFile(new URL('./frozen.mjs', import.meta.url), 'utf8');
for (const [name, value] of Object.entries({ COHORT_SHA: digest(planBytes), APPROVAL_SHA: digest(approvalBytes), ARCHIVE_SHA: archive.sha256, ARCHIVE_ID: archive.id, ARCHIVE_BYTES: archive.byte_size })) frozen = frozen.replace(new RegExp(`export const ${name} = [^;]+;`, 'u'), `export const ${name} = ${typeof value === 'number' ? value : `'${value}'`};`);
await writeFile(new URL('./frozen.mjs', import.meta.url), frozen);
const downloader = await readFile(new URL('./download-package.py', import.meta.url), 'utf8');
await writeFile(new URL('./download-package.py', import.meta.url), downloader.replace(/PLAN_SHA = "[^"]+"/u, `PLAN_SHA = "${digest(planBytes)}"`));
console.log(JSON.stringify({ cohort_sha256: digest(planBytes), approval_sha256: digest(approvalBytes), archive_id: archive.id, fronts: rows.length, derivative_references: rows.length * 3, database_requests: 0, network_requests: 0 }));
