#!/usr/bin/env node
/** Generate the per-set, currently-deliverable card-image link report. */
import 'dotenv/config';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const PRODUCTION = 'https://oakdbbzdqwurpjnoqhmu.supabase.co';
const PAGE = 1000;
function csvCell(value) { const text = String(value ?? ''); return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }
function client() {
  if (new URL(process.env.SUPABASE_URL || '').origin !== PRODUCTION) throw new Error('Report generation is locked to the canonical production project.');
  const key = process.env.SUPABASE_PRODUCTION_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('A production-only Supabase secret is required.');
  return createClient(PRODUCTION, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init = {}) => fetch(input, { ...init, signal: init.signal ?? AbortSignal.timeout(60_000) }) } });
}
async function allRows(queryFactory) {
  const result = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await queryFactory().range(from, from + PAGE - 1);
    if (error) throw error;
    result.push(...(data || []));
    if (!data || data.length < PAGE) return result;
  }
}
async function main() {
  const outputDir = path.resolve(process.env.CATALOGUE_REPORT_DIR || 'outputs/releases');
  const supabase = client();
  const sets = await allRows(() => supabase.schema('api').from('catalogue_sets')
    .select('catalogue_version_id,set_id,language_code,set_code,native_name,english_display_name,release_date,printed_total,total')
    .order('catalogue_version_id', { ascending: true }).order('set_id', { ascending: true }));
  const cards = await allRows(() => supabase.schema('api').from('catalogue_cards').select('catalogue_version_id,set_id,variant_id,language_code')
    .order('catalogue_version_id', { ascending: true }).order('variant_id', { ascending: true }));
  const imageLinks = await allRows(() => supabase.schema('api').from('asset_manifest').select('catalogue_version_id,set_id,variant_id,asset_row_id')
    .eq('asset_type', 'card_image').not('variant_id', 'is', null)
    .order('catalogue_version_id', { ascending: true }).order('asset_row_id', { ascending: true }));
  const setByVersionAndId = new Map(sets.map((row) => [`${row.catalogue_version_id}:${row.set_id}`, row]));
  const variants = new Map();
  for (const card of cards) {
    if (!setByVersionAndId.has(`${card.catalogue_version_id}:${card.set_id}`)) continue;
    const key = `${card.catalogue_version_id}:${card.set_id}`;
    const values = variants.get(key) || new Set(); values.add(card.variant_id); variants.set(key, values);
  }
  const linked = new Map();
  for (const link of imageLinks) {
    if (!setByVersionAndId.has(`${link.catalogue_version_id}:${link.set_id}`)) continue;
    const key = `${link.catalogue_version_id}:${link.set_id}`;
    if (variants.get(key)?.has(link.variant_id)) { const values = linked.get(key) || new Set(); values.add(link.variant_id); linked.set(key, values); }
  }
  const rows = sets.map((set) => {
    const key = `${set.catalogue_version_id}:${set.set_id}`;
    const publishedVariants = variants.get(key)?.size || 0;
    const linkedPublicCardImageVariants = linked.get(key)?.size || 0;
    return { catalogue_version_id: set.catalogue_version_id, set_id: set.set_id, language: set.language_code, set_code: set.set_code || '', native_name: set.native_name || '', english_display_name: set.english_display_name || '', release_date: set.release_date || '', printed_total: set.printed_total || '', total: set.total || '', published_variants: publishedVariants, linked_public_card_image_variants: linkedPublicCardImageVariants, missing_public_card_image_variants: Math.max(0, publishedVariants - linkedPublicCardImageVariants), public_card_image_link_percentage: publishedVariants ? Number(((linkedPublicCardImageVariants / publishedVariants) * 100).toFixed(2)) : null, link_classification: publishedVariants === 0 ? 'no-published-variants' : linkedPublicCardImageVariants === 0 ? 'no-public-card-image-links' : linkedPublicCardImageVariants === publishedVariants ? 'all-published-variants-linked' : 'partial-public-card-image-links' };
  });
  const headers = Object.keys(rows[0]);
  const payload = { generatedAt: new Date().toISOString(), source: 'production api.catalogue_cards plus api.asset_manifest; approved/public/active current manifest rows only', setCount: rows.length, rows };
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, 'catalogue-public-set-link-completeness-20260909.json'), `${JSON.stringify(payload, null, 2)}\n`);
  await writeFile(path.join(outputDir, 'catalogue-public-set-link-completeness-20260909.csv'), `${headers.join(',')}\n${rows.map((row) => headers.map((header) => csvCell(row[header])).join(',')).join('\n')}\n`);
  console.log(JSON.stringify({ sets: rows.length, cards: cards.length, imageLinks: imageLinks.length, outputDir }, null, 2));
}
main().catch((error) => { console.error(JSON.stringify({ ok: false, command: 'audit-production-current-asset-links', error: error instanceof Error ? error.message : String(error) }, null, 2)); process.exitCode = 1; });
