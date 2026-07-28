import { createHash } from 'node:crypto';

export const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const PRIVATE_SCAN_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);

const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function normaliseMimeType(value) {
  return String(value ?? '').split(';')[0].trim().toLowerCase();
}

function sniffPng(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)) return null;
  return {
    mimeType: 'image/png',
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function sniffJpeg(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > buffer.length) break;
    if (JPEG_SOF_MARKERS.has(marker)) {
      return {
        mimeType: 'image/jpeg',
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }
  return { mimeType: 'image/jpeg', width: null, height: null };
}

function sniffWebp(buffer) {
  if (
    buffer.length < 30 ||
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    return null;
  }

  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8X' && buffer.length >= 30) {
    return {
      mimeType: 'image/webp',
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }
  if (chunk === 'VP8 ' && buffer.length >= 30) {
    return {
      mimeType: 'image/webp',
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === 'VP8L' && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21);
    return {
      mimeType: 'image/webp',
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  return { mimeType: 'image/webp', width: null, height: null };
}

function sniffHeic(buffer) {
  if (buffer.length < 12) return null;
  const box = buffer.toString('ascii', 4, 8);
  const brand = buffer.toString('ascii', 8, 12);
  if (box === 'ftyp' && /^(heic|heix|hevc|hevx|mif1|msf1)$/i.test(brand)) {
    return { mimeType: 'image/heic', width: null, height: null };
  }
  return null;
}

export function sniffImage(buffer) {
  return sniffPng(buffer) ?? sniffJpeg(buffer) ?? sniffWebp(buffer) ?? sniffHeic(buffer);
}

export function validateImageBuffer(buffer, options = {}) {
  const maxBytes = Number(options.maxBytes ?? 20 * 1024 * 1024);
  const allowedMimeTypes = options.allowedMimeTypes ?? IMAGE_MIME_TYPES;
  const declaredMimeType = normaliseMimeType(options.declaredMimeType);
  const requireDimensions = options.requireDimensions !== false;
  const maxWidth = Number(options.maxWidth ?? 10_000);
  const maxHeight = Number(options.maxHeight ?? 10_000);
  const minWidth = Number(options.minWidth ?? 1);
  const minHeight = Number(options.minHeight ?? 1);

  const reasons = [];
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) reasons.push('image_body_required');
  if (buffer.length > maxBytes) reasons.push('image_too_large');

  const sniffed = sniffImage(buffer);
  if (!sniffed) reasons.push('unsupported_or_corrupt_image_signature');
  if (sniffed && !allowedMimeTypes.has(sniffed.mimeType)) reasons.push('image_mime_not_allowed');
  if (declaredMimeType && sniffed && declaredMimeType !== sniffed.mimeType) reasons.push('declared_mime_mismatch');
  if (requireDimensions && sniffed && (!sniffed.width || !sniffed.height)) reasons.push('image_dimensions_unavailable');
  if (sniffed?.width && (sniffed.width < minWidth || sniffed.width > maxWidth)) reasons.push('image_width_out_of_range');
  if (sniffed?.height && (sniffed.height < minHeight || sniffed.height > maxHeight)) reasons.push('image_height_out_of_range');

  return {
    ok: reasons.length === 0,
    reasons,
    mimeType: sniffed?.mimeType ?? (declaredMimeType || null),
    width: sniffed?.width ?? null,
    height: sniffed?.height ?? null,
    byteSize: buffer.length,
    sha256: Buffer.isBuffer(buffer) ? sha256(buffer) : null,
  };
}

export function contentExtension(mimeType) {
  const normalised = normaliseMimeType(mimeType);
  if (normalised === 'image/jpeg') return 'jpg';
  if (normalised === 'image/png') return 'png';
  if (normalised === 'image/webp') return 'webp';
  if (normalised === 'image/heic') return 'heic';
  return 'bin';
}
