import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildRecognitionMetadataFingerprint } from './catalogue-ingestion/internetEvidence';

const STAGING_SUPABASE_REF = 'lmwfhvexfcoyeuoyrlco';
const PRODUCTION_SUPABASE_REF = 'oakdbbzdqwurpjnoqhmu';
const LAUNCH_LANGUAGES = ['en', 'ja', 'zh-cn', 'zh-tw'] as const;
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;

type Row = Record<string, unknown>;

function arg(name: string, fallback = '') {
  const prefix = `--${name}=`;
  const match = process.argv.find((item) => item.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function clean(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text || null;
}

function stableJson(value: unknown): string {
  if (value == null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`;
}

function sha256(value: unknown) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function requireStagingConfiguration() {
  const url = clean(process.env.SUPABASE_URL);
  const key = clean(
    process.env.SUPABASE_PUBLISHABLE_KEY
      ?? process.env.SUPABASE_ANON_KEY
      ?? process.env.SUPABASE_SERVICE_ROLE_KEY
      ?? process.env.SUPABASE_SECRET_KEY,
  );
  if (!url || !key) throw new Error('SUPABASE_URL and a staging Data API key are required.');
  if (!url.includes(STAGING_SUPABASE_REF) || url.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error(`Recognition evidence manifests may only be exported from staging project ${STAGING_SUPABASE_REF}.`);
  }
  return { url: url.replace(/\/$/, ''), key };
}

function unique(values: unknown[]) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const text = clean(value);
    if (!text) continue;
    const key = text.normalize('NFKC').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(text);
  }
  return output;
}

async function fetchFingerprintContext(
  config: { url: string; key: string },
  languageCode: typeof LAUNCH_LANGUAGES[number],
  pageSize: number,
  maximumRows?: number,
) {
  const rows: Row[] = [];
  let cursor: string | null = null;
  for (;;) {
    const remaining = maximumRows == null ? pageSize : Math.max(0, maximumRows - rows.length);
    if (remaining === 0) break;
    const limit = Math.min(pageSize, remaining);
    const response = await fetch(`${config.url}/rest/v1/rpc/list_recognition_fingerprint_context`, {
      method: 'POST',
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        'Content-Profile': 'api',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_language_code: languageCode,
        p_after_variant_id: cursor,
        p_limit: limit,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(payload)) {
      const detail = payload && typeof payload === 'object' && !Array.isArray(payload)
        ? clean((payload as Row).message ?? (payload as Row).code)
        : null;
      throw new Error(`Staging recognition fingerprint export failed with status ${response.status}${detail ? `: ${detail.slice(0, 240)}` : ''}.`);
    }
    rows.push(...payload as Row[]);
    if (payload.length < limit) break;
    const nextCursor = clean((payload[payload.length - 1] as Row).variant_id);
    if (!nextCursor || nextCursor === cursor) {
      throw new Error('Staging recognition fingerprint cursor did not advance.');
    }
    cursor = nextCursor;
  }
  return rows;
}

export async function exportRecognitionInternetEvidenceManifest() {
  if (hasFlag('help')) {
    console.log(`Export StackR recognition internet-evidence fingerprints from staging.

Usage:
  npm run recognition:export-internet-fingerprints -- --output=reports/recognition/internet-fingerprints.json
  npm run recognition:export-internet-fingerprints -- --output=pilot.json --maxVariants=20 --pageSize=20

The output is immutable by default. Pass --overwrite only to replace an explicitly named local file.
Use --maxVariants for a deterministic, balanced four-language pilot.
Production Supabase is always rejected.`);
    return null;
  }

  const config = requireStagingConfiguration();
  const outputPath = path.resolve(arg('output', 'reports/recognition/internet-fingerprints.json'));
  const maximumVariants = Number(arg('maxVariants', '0'));
  if (!Number.isInteger(maximumVariants) || maximumVariants < 0) {
    throw new Error('--maxVariants must be a non-negative integer.');
  }
  const pageSize = Number(arg('pageSize', String(DEFAULT_PAGE_SIZE)));
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new Error(`--pageSize must be an integer between 1 and ${MAX_PAGE_SIZE}.`);
  }
  const perLanguageMaximum = maximumVariants > 0
    ? Math.max(1, Math.ceil(maximumVariants / LAUNCH_LANGUAGES.length))
    : undefined;

  const rowsByLanguage = await Promise.all(LAUNCH_LANGUAGES.map((language) => (
    fetchFingerprintContext(config, language, pageSize, perLanguageMaximum)
  )));
  const rows = rowsByLanguage.flat().slice(0, maximumVariants || undefined);
  const fingerprints = rows.map((row) => buildRecognitionMetadataFingerprint({
    variantId: String(row.variant_id),
    printingId: clean(row.printing_id),
    languageCode: String(row.language_code),
    setCode: String(row.set_code),
    collectorNumber: String(row.collector_number),
    nativeName: String(row.card_native_name),
    englishDisplayName: clean(row.card_english_display_name),
    aliases: unique(Array.isArray(row.aliases) ? row.aliases : []),
    setNames: unique([row.set_native_name, row.set_english_display_name]),
    variantCode: clean(row.variant_code),
    finishCode: clean(row.finish_code),
    rarityCode: clean(row.rarity_code),
    referenceImageSha256: clean(row.reference_image_sha256),
    referenceImagePerceptualHash: clean(row.reference_image_perceptual_hash),
  })).sort((left, right) => left.variantId.localeCompare(right.variantId));

  const languageCounts = Object.fromEntries(LAUNCH_LANGUAGES.map((language) => [
    language,
    fingerprints.filter((fingerprint) => fingerprint.languageCode === language).length,
  ]));
  const manifestCore = {
    schemaVersion: 'stackr-recognition-internet-fingerprint-manifest-v1.0.0',
    sourceProjectRef: STAGING_SUPABASE_REF,
    productionModified: false,
    generatedAt: new Date().toISOString(),
    variantCount: fingerprints.length,
    languageCounts,
    fingerprints,
  };
  const manifest = { ...manifestCore, manifestSha256: sha256(manifestCore) };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: 'utf8',
    flag: hasFlag('overwrite') ? 'w' : 'wx',
  });
  console.log(JSON.stringify({
    ok: true,
    outputPath,
    variantCount: fingerprints.length,
    languageCounts,
    manifestSha256: manifest.manifestSha256,
    productionModified: false,
  }, null, 2));
  return manifest;
}

exportRecognitionInternetEvidenceManifest().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exitCode = 1;
});
