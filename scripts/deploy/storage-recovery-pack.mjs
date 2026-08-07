import { createHash } from 'node:crypto';

const PACK_MAGIC = Buffer.from('STACKR_STORAGE_PACK_V1\n', 'ascii');
const RECORD_HEADER_BYTES = 8;
const MAX_METADATA_BYTES = 1024 * 1024;
const MAX_OBJECT_BYTES = 100 * 1024 * 1024;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function objectIdentity(object) {
  return `${object.bucket_id}\0${object.name}`;
}

function objectSize(object) {
  const size = Number(object.byteSize ?? object.metadata?.size ?? 0);
  return Number.isFinite(size) && size >= 0 ? size : 0;
}

function objectMimeType(object) {
  return object.metadata?.mimetype ?? 'application/octet-stream';
}

export function encodeStoragePack(records) {
  const parts = [PACK_MAGIC];
  for (const record of records) {
    const bytes = Buffer.from(record.bytes);
    const contentSha256 = record.sha256 ?? sha256(bytes);
    if (bytes.length > MAX_OBJECT_BYTES) throw new Error('storage_pack_object_too_large');
    if (sha256(bytes) !== contentSha256) throw new Error('storage_pack_source_checksum_mismatch');
    const metadata = Buffer.from(stableJson({
      bucketId: record.bucket_id,
      name: record.name,
      metadata: record.metadata ?? null,
      userMetadata: record.user_metadata ?? null,
      byteSize: bytes.length,
      sha256: contentSha256,
    }), 'utf8');
    if (metadata.length > MAX_METADATA_BYTES) throw new Error('storage_pack_metadata_too_large');
    const header = Buffer.allocUnsafe(RECORD_HEADER_BYTES);
    header.writeUInt32BE(metadata.length, 0);
    header.writeUInt32BE(bytes.length, 4);
    parts.push(header, metadata, bytes);
  }
  return Buffer.concat(parts);
}

export function decodeStoragePack(packBytes) {
  const bytes = Buffer.from(packBytes);
  if (bytes.length < PACK_MAGIC.length || !bytes.subarray(0, PACK_MAGIC.length).equals(PACK_MAGIC)) {
    throw new Error('invalid_storage_pack_magic');
  }
  const records = [];
  let offset = PACK_MAGIC.length;
  while (offset < bytes.length) {
    if (offset + RECORD_HEADER_BYTES > bytes.length) throw new Error('truncated_storage_pack_header');
    const metadataLength = bytes.readUInt32BE(offset);
    const bodyLength = bytes.readUInt32BE(offset + 4);
    offset += RECORD_HEADER_BYTES;
    if (metadataLength < 2 || metadataLength > MAX_METADATA_BYTES) {
      throw new Error('invalid_storage_pack_metadata_length');
    }
    if (bodyLength > MAX_OBJECT_BYTES) throw new Error('invalid_storage_pack_object_length');
    if (offset + metadataLength + bodyLength > bytes.length) throw new Error('truncated_storage_pack_record');
    const metadata = JSON.parse(bytes.subarray(offset, offset + metadataLength).toString('utf8'));
    offset += metadataLength;
    const body = bytes.subarray(offset, offset + bodyLength);
    offset += bodyLength;
    if (metadata.byteSize !== body.length || sha256(body) !== metadata.sha256) {
      throw new Error('storage_pack_record_checksum_mismatch');
    }
    records.push({
      bucket_id: metadata.bucketId,
      name: metadata.name,
      metadata: metadata.metadata,
      user_metadata: metadata.userMetadata,
      byteSize: metadata.byteSize,
      sha256: metadata.sha256,
      bytes: Buffer.from(body),
    });
  }
  return records;
}

export function inventoryManifestSha256(objects) {
  const digest = createHash('sha256');
  const ordered = [...objects].sort((left, right) => objectIdentity(left).localeCompare(objectIdentity(right)));
  for (const object of ordered) {
    digest.update(stableJson({
      bucketId: object.bucket_id,
      name: object.name,
      metadata: object.metadata ?? null,
      userMetadata: object.user_metadata ?? null,
    }));
    digest.update('\n');
  }
  return digest.digest('hex');
}

export function selectRestoreSample(objects, buckets, limit) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('invalid_storage_restore_sample_size');
  const bucketById = new Map(buckets.map((bucket) => [bucket.id, bucket]));
  const selected = new Map();
  const add = (object) => {
    if (object) selected.set(objectIdentity(object), object);
  };
  const byBucket = new Map();
  for (const object of objects) {
    const rows = byBucket.get(object.bucket_id) ?? [];
    rows.push(object);
    byBucket.set(object.bucket_id, rows);
    if (bucketById.get(object.bucket_id)?.public === false) add(object);
  }
  for (const rows of byBucket.values()) {
    rows.sort((left, right) => left.name.localeCompare(right.name));
    for (const object of rows.slice(0, 4)) add(object);
    for (const object of rows.slice(-4)) add(object);
    const bySize = [...rows].sort((left, right) => objectSize(left) - objectSize(right));
    for (const object of bySize.slice(0, 4)) add(object);
    for (const object of bySize.slice(-4)) add(object);
    const mimeRepresentative = new Map();
    for (const object of rows) {
      const mimeType = objectMimeType(object);
      if (!mimeRepresentative.has(mimeType)) mimeRepresentative.set(mimeType, object);
    }
    for (const object of mimeRepresentative.values()) add(object);
  }
  const hashRanked = [...objects].sort((left, right) => (
    sha256(Buffer.from(objectIdentity(left))).localeCompare(sha256(Buffer.from(objectIdentity(right))))
  ));
  for (const object of hashRanked) {
    if (selected.size >= limit) break;
    add(object);
  }
  return [...selected.values()];
}

export const storageRecoveryPackInternals = {
  PACK_MAGIC,
  objectIdentity,
  objectMimeType,
  objectSize,
  sha256,
  stableJson,
};
