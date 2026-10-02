#!/usr/bin/env node
'use strict';
/** Local, read-only intake plus one explicitly named new output. No downloads. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const roles = ['coverage', 'surface', 'pattern', 'optical'];
const fields = ['cardId', 'languageCode', 'variantId', 'variantCode', 'finishCode'];
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function ensure(ok, message) { if (!ok) throw new Error(message); }
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function paeth(a, b, c) {
  const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}
/** Strict 8-bit, non-interlaced PNG decode with CRC, filters and bounded inflate. */
function decodeDataPng(bytes) {
  ensure(bytes.length >= 45 && bytes.length <= 6_000_000, 'PNG byte budget exceeded or truncated');
  ensure(bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')), 'Not a PNG');
  let offset = 8; let header; let ended = false; let dataEnded = false; const idat = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset); const kind = bytes.toString('ascii', offset + 4, offset + 8);
    ensure(offset + length + 12 <= bytes.length, 'Truncated PNG chunk');
    const content = bytes.subarray(offset + 8, offset + 8 + length);
    ensure(crc32(bytes.subarray(offset + 4, offset + 8 + length)) === bytes.readUInt32BE(offset + 8 + length), 'PNG CRC mismatch');
    if (!header) ensure(kind === 'IHDR', 'IHDR must be first');
    if (kind === 'IHDR') {
      ensure(!header && length === 13, 'Invalid or duplicate IHDR');
      header = { width: content.readUInt32BE(0), height: content.readUInt32BE(4), colour: content[9] };
      ensure(header.width > 0 && header.height > 0 && header.width <= 2048 && header.height <= 2048, 'PNG dimensions out of bounds');
      ensure(content[8] === 8 && [0, 2, 6].includes(header.colour), 'Only 8-bit grayscale/RGB/RGBA data PNGs are accepted');
      ensure(content[10] === 0 && content[11] === 0 && content[12] === 0, 'Unsupported PNG compression/filter/interlace');
    } else if (kind === 'IDAT') {
      ensure(!dataEnded, 'Non-consecutive IDAT chunks'); idat.push(content);
    } else if (kind === 'IEND') {
      ensure(length === 0 && idat.length > 0, 'Invalid IEND'); ended = true; offset += 12; break;
    } else {
      if (idat.length) dataEnded = true;
      ensure(!['gAMA', 'sRGB', 'iCCP', 'cHRM', 'tRNS', 'acTL', 'fcTL', 'fdAT', 'eXIf'].includes(kind), 'Data-map colour transforms, transparency and animation are not accepted');
      ensure(kind[0] === kind[0].toLowerCase(), `Unsupported critical chunk ${kind}`);
    }
    offset += length + 12;
  }
  ensure(ended && offset === bytes.length, 'PNG missing IEND or has trailing data');
  const channels = header.colour === 0 ? 1 : header.colour === 2 ? 3 : 4;
  const stride = header.width * channels; const expected = (stride + 1) * header.height;
  const packed = zlib.inflateSync(Buffer.concat(idat), { maxOutputLength: expected });
  ensure(packed.length === expected, 'PNG decoded byte count mismatch');
  const pixels = Buffer.alloc(stride * header.height);
  for (let y = 0; y < header.height; y++) {
    const row = y * (stride + 1); const filter = packed[row];
    ensure(filter <= 4, 'Invalid PNG row filter');
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[y * stride + x - channels] : 0;
      const b = y ? pixels[(y - 1) * stride + x] : 0;
      const c = y && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      const prediction = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter];
      pixels[y * stride + x] = (packed[row + 1 + x] + prediction) & 255;
    }
  }
  if (channels === 4) for (let i = 3; i < pixels.length; i += 4) ensure(pixels[i] === 255, 'Data maps must be opaque; use coverage.R, not alpha');
  return { ...header, channels, pixels };
}
function readBoundFile(root, entry) {
  ensure(entry && typeof entry.file === 'string' && /^[a-f0-9]{64}$/.test(entry.sha256), 'Missing file/hash binding');
  const resolved = fs.realpathSync(path.resolve(root, entry.file));
  ensure(resolved.startsWith(root + path.sep), 'Reference escapes pack root');
  ensure(fs.statSync(resolved).isFile(), 'Reference is not a regular file');
  ensure(fs.statSync(resolved).size <= 80 * 1024 * 1024, 'Reference file exceeds intake budget');
  const bytes = fs.readFileSync(resolved);
  ensure(sha256(bytes) === entry.sha256, `Checksum mismatch: ${entry.file}`);
  return bytes;
}
function preparePack(manifestPath) {
  const root = fs.realpathSync(path.dirname(manifestPath));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  ensure(manifest.schemaVersion === 1 && typeof manifest.materialVersion === 'string' && manifest.materialVersion.trim(), 'Invalid material version');
  ensure(manifest.identity && fields.every(key => typeof manifest.identity[key] === 'string' && manifest.identity[key].trim()), 'Exact canonical printing/language/variant/finish required');
  ensure(manifest.review?.status === 'reference-reviewed', 'Physical-reference review missing; no runtime pack created');
  ensure(typeof manifest.review.reviewer === 'string' && manifest.review.reviewer.trim() && Number.isFinite(Date.parse(manifest.review.reviewedAt)), 'Review attribution missing');
  ensure(manifest.evidence?.sha256 === manifest.review.evidenceSha256, 'Evidence digest not bound to review');
  const evidence = JSON.parse(readBoundFile(root, manifest.evidence).toString('utf8'));
  ensure(evidence.sourceType === 'physical-reference' && typeof evidence.rightsRecord === 'string' && evidence.rightsRecord.trim(), 'Physical-reference provenance missing');
  ensure(fields.every(key => evidence.identity?.[key] === manifest.identity[key]), 'Evidence printing mismatch');
  for (const role of ['front', 'tilt', 'macro']) readBoundFile(root, evidence[role]);
  for (const gate of ['identityMatch', 'foilBoundaryMatch', 'angularResponseMatch', 'textureMatch', 'artworkAlignmentMatch']) ensure(evidence.review?.[gate] === true, `Unreviewed material gate: ${gate}`);
  ensure(typeof manifest.artwork?.uri === 'string' && manifest.artwork.uri.startsWith('https://'), 'Exact catalogue artwork URI missing');
  const art = decodeDataPng(readBoundFile(root, manifest.artwork));
  const maps = {}; let dimensions = null; let pixels = 0;
  for (const role of roles) {
    const bytes = readBoundFile(root, manifest.maps?.[role]); const decoded = decodeDataPng(bytes);
    const dimensionsKey = `${decoded.width}x${decoded.height}`;
    ensure(!dimensions || dimensionsKey === dimensions, 'All four maps must share dimensions'); dimensions = dimensionsKey;
    ensure(Math.abs(decoded.width / decoded.height - art.width / art.height) <= 0.002, 'Artwork/map aspect mismatch');
    if (role !== 'coverage') ensure(decoded.channels >= 3, `${role} requires RGB channels`);
    if (role === 'surface') {
      for (let i = 0; i < decoded.pixels.length; i += decoded.channels) {
        const nx = decoded.pixels[i] / 127.5 - 1; const ny = decoded.pixels[i + 1] / 127.5 - 1; const nz = decoded.pixels[i + 2] / 127.5 - 1;
        ensure(nz >= 0 && Math.abs(Math.hypot(nx, ny, nz) - 1) < 0.08, 'Invalid +Z tangent-space unit normal');
      }
    }
    pixels += decoded.width * decoded.height;
    maps[role] = { encoding: 'png-base64', base64: bytes.toString('base64'), sha256: sha256(bytes), width: decoded.width, height: decoded.height };
  }
  ensure(pixels * 4 <= 24 * 1024 * 1024, 'Decoded material exceeds 24 MiB budget');
  ensure(Number.isFinite(manifest.gain) && manifest.gain > 0 && manifest.gain <= 1, 'Gain must be in (0,1]');
  return { schemaVersion: 1, materialVersion: manifest.materialVersion, identity: manifest.identity,
    artwork: { uri: manifest.artwork.uri, sha256: manifest.artwork.sha256, width: art.width, height: art.height },
    review: { ...manifest.review, physicalReference: manifest.evidence.file }, maps, gain: manifest.gain };
}
if (require.main === module) {
  try {
    const [manifestPath, output] = process.argv.slice(2);
    ensure(manifestPath && output, 'Usage: node scripts/prepare-printing-material-pack.cjs MANIFEST.json NEW_OUTPUT.json');
    const result = preparePack(path.resolve(manifestPath));
    fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.log(`Prepared one reference-bound material pack. No registry, catalogue or deployment was changed. Output: ${output}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { preparePack, decodeDataPng, crc32, sha256 };
