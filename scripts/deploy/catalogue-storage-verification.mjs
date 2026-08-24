import { createHash } from 'node:crypto';

export function comparableObject(object) {
  return {
    name: object.name,
    size: Number(object.metadata?.size ?? 0),
    mimetype: object.metadata?.mimetype ?? null,
    etag: String(object.metadata?.eTag ?? '').replaceAll('"', '') || null,
    cacheControl: object.metadata?.cacheControl ?? null,
  };
}

export function objectIdentity(object) {
  const comparable = comparableObject(object);
  return `${comparable.name}\0${comparable.size}\0${comparable.mimetype ?? ''}`;
}

export function storageObjectPathHash(name) {
  return name.match(/\/([0-9a-f]{64})\/[^/]+$/)?.[1] ?? null;
}

async function mapWithConcurrency(items, concurrency, operation) {
  let cursor = 0;
  let failure = null;
  const results = new Array(items.length);
  async function worker() {
    while (!failure) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      try {
        results[index] = await operation(items[index]);
      } catch (error) {
        failure ??= error;
      }
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(concurrency, Math.max(items.length, 1)) },
    () => worker(),
  ));
  if (failure) throw failure;
  return results;
}

/**
 * Proves that objects which were already in production are byte-for-byte usable
 * copies of the source inventory.  Storage metadata alone is not evidence: the
 * target object is downloaded and hashed before promotion is marked complete.
 */
export async function verifyRetainedProductionObjects({
  sourceObjects,
  targetByName,
  downloadTargetObject,
  concurrency,
}) {
  // `sourceObjects` is the immutable list which existed in production before
  // this run.  Its members must still exist after copying; absence is a failure.
  const retained = sourceObjects;
  const verified = await mapWithConcurrency(retained, concurrency, async (sourceObject) => {
    const expectedHash = storageObjectPathHash(sourceObject.name);
    if (!expectedHash) throw new Error(`source_storage_key_not_content_addressed:${sourceObject.name}`);
    const targetObject = targetByName.get(sourceObject.name);
    if (!targetObject) throw new Error(`retained_production_object_missing:${sourceObject.name}`);
    if (objectIdentity(targetObject) !== objectIdentity(sourceObject)) {
      throw new Error(`retained_production_object_metadata_mismatch:${sourceObject.name}`);
    }
    const blob = await downloadTargetObject(sourceObject.name);
    const bytes = Buffer.from(await blob.arrayBuffer());
    const expectedSize = Number(sourceObject.metadata?.size ?? 0);
    if (bytes.length !== expectedSize) {
      throw new Error(`retained_production_object_size_mismatch:${sourceObject.name}`);
    }
    const actualHash = createHash('sha256').update(bytes).digest('hex');
    if (actualHash !== expectedHash) {
      throw new Error(`retained_production_object_content_hash_mismatch:${sourceObject.name}`);
    }
    return { bytes: bytes.length, sha256: actualHash };
  });
  return {
    retainedObjectCount: verified.length,
    retainedByteSize: verified.reduce((total, object) => total + object.bytes, 0),
    retainedContentHashVerifiedCount: verified.length,
  };
}
