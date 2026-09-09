#!/usr/bin/env node
/** Generate bounded per-set public delivery evidence from the production API views. */
import 'dotenv/config';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createVerifiedSupabasePostgresClient } from './verified-supabase-postgres.mjs';

const PRODUCTION_REF = 'oakdbbzdqwurpjnoqhmu';
function safeError(error) { return error instanceof Error ? error.message : error && typeof error === 'object' ? [error.code, error.message, error.detail].filter(Boolean).join(': ') || 'database_error' : String(error); }
function databaseUrl() {
  const value = String(process.env.SUPABASE_DB_URL || '').trim();
  if (!value) throw new Error('SUPABASE_DB_URL is required.');
  const parsed = new URL(value); let username = parsed.username; try { username = decodeURIComponent(username); } catch { /* scope check below */ }
  const trustedHost = parsed.hostname.endsWith('.supabase.co') || parsed.hostname.endsWith('.pooler.supabase.com');
  if (!trustedHost || (!parsed.hostname.includes(PRODUCTION_REF) && !username.includes(PRODUCTION_REF))) throw new Error('SUPABASE_DB_URL is not pinned to production.');
  return value;
}
function csvCell(value) { const text = String(value ?? ''); return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }
const QUERY = `
with sets as (
  select catalogue_version_id,set_id,language_code,set_code,native_name,english_display_name,release_date,printed_total,total
  from api.catalogue_sets
), variants as (
  select ac.catalogue_version_id,ac.set_id,count(distinct ac.variant_id)::int as published_variants
  from api.catalogue_cards ac join sets s on s.catalogue_version_id=ac.catalogue_version_id and s.set_id=ac.set_id
  group by ac.catalogue_version_id,ac.set_id
), links as (
  select ac.catalogue_version_id,ac.set_id,count(distinct ac.variant_id)::int as linked_public_card_image_variants
  from api.catalogue_cards ac
  join api.asset_manifest am on am.catalogue_version_id=ac.catalogue_version_id and am.variant_id=ac.variant_id and am.asset_type='card_image'
  join sets s on s.catalogue_version_id=ac.catalogue_version_id and s.set_id=ac.set_id
  group by ac.catalogue_version_id,ac.set_id
)
select s.catalogue_version_id,s.set_id,s.language_code as language,s.set_code,s.native_name,s.english_display_name,s.release_date,s.printed_total,s.total,
  coalesce(v.published_variants,0)::int as published_variants,
  coalesce(l.linked_public_card_image_variants,0)::int as linked_public_card_image_variants
from sets s
left join variants v on v.catalogue_version_id=s.catalogue_version_id and v.set_id=s.set_id
left join links l on l.catalogue_version_id=s.catalogue_version_id and l.set_id=s.set_id
order by s.language_code,s.set_code,s.set_id`;
async function main() {
  const outputDir = path.resolve(process.env.CATALOGUE_REPORT_DIR || 'outputs/releases');
  const db = createVerifiedSupabasePostgresClient(databaseUrl(), 'stackr-current-public-asset-link-audit', { connectionTimeoutMillis: 15_000, statement_timeout: 90_000 });
  await db.connect(); let rows;
  try { rows = (await db.query(QUERY)).rows; } finally { await db.end(); }
  const completed = rows.map((row) => {
    const published = Number(row.published_variants || 0); const linked = Number(row.linked_public_card_image_variants || 0);
    return { ...row, missing_public_card_image_variants: Math.max(0, published - linked), public_card_image_link_percentage: published ? Number(((linked / published) * 100).toFixed(2)) : null, link_classification: published === 0 ? 'no-published-variants' : linked === 0 ? 'no-public-card-image-links' : linked === published ? 'all-published-variants-linked' : 'partial-public-card-image-links' };
  });
  const headers = Object.keys(completed[0] || {});
  const payload = { generatedAt: new Date().toISOString(), source: 'production api.catalogue_sets, api.catalogue_cards and api.asset_manifest; aggregated before joins', setCount: completed.length, rows: completed };
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, 'catalogue-public-set-link-completeness-20260909.json'), `${JSON.stringify(payload, null, 2)}\n`);
  await writeFile(path.join(outputDir, 'catalogue-public-set-link-completeness-20260909.csv'), `${headers.join(',')}\n${completed.map((row) => headers.map((header) => csvCell(row[header])).join(',')).join('\n')}\n`);
  console.log(JSON.stringify({ sets: completed.length, outputDir }, null, 2));
}
main().catch((error) => { console.error(JSON.stringify({ ok: false, command: 'audit-production-current-asset-links', error: safeError(error) }, null, 2)); process.exitCode = 1; });
