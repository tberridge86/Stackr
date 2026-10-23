import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';
import { buildCatalogueAssetRepairFromStoredOriginal } from '../../backend/lib/assetPipeline.js';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { safePath } from '../artwork3303-publish-20260928/publish.mjs';

const require = createRequire(new URL('../../backend/package.json', import.meta.url));
const sharp = require('sharp');
export const ARTIFACT_ID = 'japanese-artwork-release-20261023';
const MIME = { webp: 'image/webp', jpeg: 'image/jpeg', png: 'image/png' };
const EXT = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };
const ROLES = ['original', 'card-grid', 'search-result', 'detail-page'];

export async function inspectOriginal(buffer, expected) {
  check(buffer.length > 0 && buffer.length < 12_000_000 && digest(buffer) === expected.sha256, 'Original byte hash or bounded size changed');
  const metadata = await sharp(buffer, { failOn: 'warning' }).metadata();
  check((metadata.pages ?? 1) === 1 && metadata.width === expected.width && metadata.height === expected.height && MIME[metadata.format] === expected.mime_type && buffer.length === expected.byte_size, 'Original static image, MIME or dimensions changed');
  await sharp(buffer, { failOn: 'warning' }).raw().toBuffer();
  return metadata;
}

export function assertSourceUrl(value) {
  const url = new URL(value);
  check(url.protocol === 'https:' && url.hostname === 'static.tcgcollector.com' && !url.username && !url.password && !url.port && !url.search && !url.hash && /^\/content\/images\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{64}\.(webp|jpg|png)$/u.test(url.pathname), 'Literal frozen TCGCollector image URL required');
  return url;
}

export async function downloadOriginal(row, fetchImage = fetch) {
  assertSourceUrl(row.image_url);
  const response = await fetchImage(row.image_url, { redirect: 'error', signal: AbortSignal.timeout(45_000), headers: { 'User-Agent': 'Stackr finite approved artwork release', Accept: 'image/webp,image/jpeg,image/png' } });
  check(response.ok && response.url === row.image_url, 'Exact source response failed or redirected');
  const expected = row.objects[0];
  check((response.headers.get('content-type') ?? '').split(';')[0].trim() === expected.mime_type, 'Source response MIME changed');
  const length = response.headers.get('content-length');
  if (length !== null) check(Number(length) === expected.byte_size, 'Source response length changed');
  const reader = response.body?.getReader();
  check(reader, 'Source body required');
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      check(size <= expected.byte_size && size < 12_000_000, 'Source body exceeded frozen size');
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel(); }
  const buffer = Buffer.concat(chunks);
  await inspectOriginal(buffer, expected);
  return buffer;
}

export async function buildObjects(buffer) {
  const metadata = await sharp(buffer).metadata();
  check((metadata.pages ?? 1) === 1 && MIME[metadata.format], 'Supported static source image required');
  const original = { role: 'original', buffer, mime_type: MIME[metadata.format], width: metadata.width, height: metadata.height, byte_size: buffer.length, sha256: digest(buffer) };
  await inspectOriginal(buffer, original);
  const derivatives = [];
  await buildCatalogueAssetRepairFromStoredOriginal({
    assetType: 'card_image', buffer, mimeType: original.mime_type,
    permissionStatus: 'approved', rightsStatus: 'approved',
    storage: { id: 'local_preparation', async putObject(input) {
      const image = await sharp(input.body).metadata();
      derivatives.push({ role: path.basename(input.key).split('.')[0], buffer: input.body, mime_type: input.contentType, width: image.width, height: image.height, byte_size: input.body.length, sha256: digest(input.body) });
      return { key: input.key };
    } },
  });
  return [original, ...derivatives].map(({ buffer: bytes, ...object }) => ({ ...object, artifact_id: ARTIFACT_ID, file: `objects/${object.sha256}/${object.role}.${EXT[object.mime_type]}`, buffer: bytes }));
}

export async function prepareRow(row, root, { localOriginal = null, fetchImage = fetch } = {}) {
  assertSourceUrl(row.image_url);
  check(row.objects.length === 4 && isDeepStrictEqual(row.objects.map(object => object.role), ROLES), 'Four frozen object roles required');
  const original = localOriginal ? await readFile(localOriginal) : await downloadOriginal(row, fetchImage);
  await inspectOriginal(original, row.objects[0]);
  const objects = await buildObjects(original);
  check(objects.length === 4, 'Original and all derivatives required');
  for (let index = 0; index < objects.length; index++) {
    const { buffer, ...actual } = objects[index];
    check(isDeepStrictEqual(actual, row.objects[index]), 'Pinned derivative bytes or object metadata changed');
    check(actual.artifact_id === ARTIFACT_ID && actual.width <= row.objects[0].width && actual.height <= row.objects[0].height, 'Original dimensions cannot be enlarged');
    const file = safePath(root, `${ARTIFACT_ID}/${actual.file}`);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, buffer);
  }
  return { printing_id: row.printing_id, original_sha256: row.objects[0].sha256, objects: objects.length, original_bytes_unchanged: true };
}

export async function prepareCohort(rows, root, { localFiles = null, fetchImage = fetch } = {}) {
  check(rows.length === 71 && new Set(rows.map(row => row.printing_id)).size === 71, 'Exactly71 frozen printing fronts required');
  if (localFiles !== null) check(localFiles instanceof Map && localFiles.size === rows.length && rows.every(row => typeof localFiles.get(row.printing_id) === 'string' && path.isAbsolute(localFiles.get(row.printing_id))), 'Complete absolute local source paths required; local mode cannot fall back to network');
  const results = new Array(rows.length);
  let cursor = 0, nextStart = 0;
  const worker = async () => {
    for (;;) {
      const index = cursor++;
      if (index >= rows.length) return;
      if (!localFiles) {
        const start = Math.max(Date.now(), nextStart);
        nextStart = start + 750;
        await new Promise(resolve => setTimeout(resolve, Math.max(0, start - Date.now())));
      }
      results[index] = await prepareRow(rows[index], root, { localOriginal: localFiles?.get(rows[index].printing_id) ?? null, fetchImage });
    }
  };
  await Promise.all([worker(), worker()]);
  return { fronts: results.length, object_references: results.length * 4, original_bytes_unchanged: true, source_requests_concurrent_max: localFiles ? 0 : 2, cards: results };
}

async function main() {
  const { loadFrozen } = await import('./frozen.mjs');
  const { rows, receipt } = await loadFrozen();
  const root = process.argv[2];
  check(root && path.isAbsolute(root), 'Absolute package output directory required');
  const result = await prepareCohort(rows, root);
  await writeFile(path.join(root, 'preparation-receipt.json'), JSON.stringify({ ...result, cohort_sha256: receipt.cohort_sha256 }, null, 2));
  console.log(JSON.stringify({ fronts: result.fronts, object_references: result.object_references, status: 'all_frozen_source_and_derivative_bytes_verified' }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
