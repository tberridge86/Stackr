import { createHmac, createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

function supabaseCacheControlSeconds(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return undefined;
  if (/^\d+$/.test(raw)) return raw;
  return raw.match(/(?:^|,)\s*max-age=(\d+)/i)?.[1];
}

function encodePathPart(value) {
  return String(value).split('/').map(encodeURIComponent).join('/');
}

function hmac(key, value, encoding) {
  return createHmac('sha256', key).update(value).digest(encoding);
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function amzDate(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function yyyymmdd(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function signingKey(secretKey, date, region, service) {
  const kDate = hmac(`AWS4${secretKey}`, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

export class SupabaseObjectStorageAdapter {
  constructor(supabase) {
    this.id = 'supabase_storage';
    this.supabase = supabase;
  }

  async putObject(input) {
    const { data, error } = await this.supabase.storage
      .from(input.bucket)
      .upload(input.key, input.body, {
        contentType: input.contentType,
        cacheControl: supabaseCacheControlSeconds(input.cacheControl),
        upsert: input.upsert === true,
      });
    if (error) throw error;
    return {
      provider: this.id,
      bucket: input.bucket,
      key: input.key,
      path: data?.path ?? input.key,
      cacheControl: input.cacheControl ?? null,
    };
  }

  async getObject(bucket, key, options = {}) {
    const { data, error } = await this.supabase.storage.from(bucket).download(key);
    if (error) throw error;
    if (!data) throw new Error(`Supabase Storage returned no data for ${bucket}/${key}.`);

    const maxBytes = Number(options.maxBytes ?? 25 * 1024 * 1024);
    if (Number.isFinite(data.size) && data.size > maxBytes) {
      throw new Error(`Stored object exceeds ${maxBytes} bytes.`);
    }
    const buffer = Buffer.from(await data.arrayBuffer());
    if (buffer.byteLength > maxBytes) {
      throw new Error(`Stored object exceeds ${maxBytes} bytes.`);
    }
    return buffer;
  }

  async createSignedUpload(input) {
    const { data, error } = await this.supabase.storage
      .from(input.bucket)
      .createSignedUploadUrl(input.key, { upsert: input.upsert === true });
    if (error) throw error;
    const expiresInSeconds = Number(input.expiresInSeconds ?? 3600);
    return {
      provider: this.id,
      bucket: input.bucket,
      key: input.key,
      signedUrl: data?.signedUrl,
      token: data?.token,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    };
  }

  publicUrl(bucket, key) {
    const { data } = this.supabase.storage.from(bucket).getPublicUrl(key);
    return data.publicUrl;
  }

  async removeObject(bucket, key) {
    const { error } = await this.supabase.storage.from(bucket).remove([key]);
    if (error) throw error;
  }
}

export class LocalObjectStorageAdapter {
  constructor(options = {}) {
    this.id = 'local_dev';
    this.rootDir = options.rootDir ?? path.join(process.cwd(), '.tmp', 'stackr-object-storage');
    this.publicBaseUrl = options.publicBaseUrl ?? 'http://localhost:3001/local-object-storage';
  }

  async putObject(input) {
    const fullPath = path.join(this.rootDir, input.bucket, input.key);
    if (input.upsert !== true) {
      try {
        await access(fullPath);
        const error = new Error('Asset Already Exists');
        error.status = 409;
        throw error;
      } catch (error) {
        if (error?.status === 409) throw error;
        if (error?.code && error.code !== 'ENOENT') throw error;
      }
    }
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, input.body);
    return {
      provider: this.id,
      bucket: input.bucket,
      key: input.key,
      path: fullPath,
      cacheControl: input.cacheControl ?? null,
    };
  }

  async getObject(bucket, key, options = {}) {
    const buffer = await readFile(path.join(this.rootDir, bucket, key));
    const maxBytes = Number(options.maxBytes ?? 25 * 1024 * 1024);
    if (buffer.byteLength > maxBytes) {
      throw new Error(`Stored object exceeds ${maxBytes} bytes.`);
    }
    return buffer;
  }

  async removeObject(bucket, key) {
    await rm(path.join(this.rootDir, bucket, key), { force: true });
  }

  async createSignedUpload(input) {
    const expiresInSeconds = Number(input.expiresInSeconds ?? 900);
    return {
      provider: this.id,
      bucket: input.bucket,
      key: input.key,
      signedUrl: `${this.publicBaseUrl}/${encodePathPart(input.bucket)}/${encodePathPart(input.key)}?localSignedUpload=true`,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    };
  }

  publicUrl(bucket, key) {
    return `${this.publicBaseUrl}/${encodePathPart(bucket)}/${encodePathPart(key)}`;
  }
}

export class S3CompatibleObjectStorageAdapter {
  constructor(options) {
    this.id = 's3_compatible';
    this.endpoint = String(options.endpoint ?? '').replace(/\/$/, '');
    this.accessKeyId = options.accessKeyId;
    this.secretAccessKey = options.secretAccessKey;
    this.region = options.region ?? 'auto';
    this.publicBaseUrl = options.publicBaseUrl?.replace(/\/$/, '') ?? null;
    this.uploadTimeoutMs = options.uploadTimeoutMs ?? 60_000;
    if (!this.endpoint || !this.accessKeyId || !this.secretAccessKey) {
      throw new Error('S3-compatible storage requires endpoint, access key and secret key.');
    }
  }

  createPresignedRequest(input, method = 'PUT') {
    const expiresInSeconds = Math.max(60, Math.min(Number(input.expiresInSeconds ?? 900), 86_400));
    const date = new Date();
    const dateStamp = yyyymmdd(date);
    const timestamp = amzDate(date);
    const bucket = input.bucket;
    const key = encodePathPart(input.key);
    const host = new URL(this.endpoint).host;
    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const credential = `${this.accessKeyId}/${credentialScope}`;
    const createOnly = method === 'PUT' && input.upsert !== true;
    const signedHeaders = createOnly ? 'host;if-none-match' : 'host';
    const canonicalUri = `/${encodeURIComponent(bucket)}/${key}`;
    const canonicalQuery = [
      ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
      ['X-Amz-Credential', credential],
      ['X-Amz-Date', timestamp],
      ['X-Amz-Expires', String(expiresInSeconds)],
      ['X-Amz-SignedHeaders', signedHeaders],
    ]
      .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
      .sort()
      .join('&');
    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQuery,
      `host:${host}\n${createOnly ? 'if-none-match:*\n' : ''}`,
      signedHeaders,
      'UNSIGNED-PAYLOAD',
    ].join('\n');
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      timestamp,
      credentialScope,
      hash(canonicalRequest),
    ].join('\n');
    const signature = hmac(signingKey(this.secretAccessKey, dateStamp, this.region, 's3'), stringToSign, 'hex');
    return {
      provider: this.id,
      bucket,
      key: input.key,
      signedUrl: `${this.endpoint}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
      headers: {
        'content-type': input.contentType,
        'cache-control': input.cacheControl,
        ...(createOnly ? { 'if-none-match': '*' } : {}),
      },
    };
  }

  createPresignedUpload(input) {
    return this.createPresignedRequest(input, 'PUT');
  }

  async createSignedUpload(input) {
    return this.createPresignedUpload(input);
  }

  async putObject(input) {
    const signed = this.createPresignedUpload({
      bucket: input.bucket,
      key: input.key,
      contentType: input.contentType,
      cacheControl: input.cacheControl,
      expiresInSeconds: 900,
      upsert: input.upsert,
    });
    const headers = {
      'content-type': input.contentType,
    };
    if (input.cacheControl) headers['cache-control'] = input.cacheControl;
    if (input.upsert !== true) headers['if-none-match'] = '*';
    const response = await fetch(signed.signedUrl, {
      method: 'PUT',
      headers,
      body: input.body,
      signal: input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(this.uploadTimeoutMs)])
        : AbortSignal.timeout(this.uploadTimeoutMs),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      const error = new Error(`S3-compatible upload failed: ${response.status} ${detail}`.trim());
      error.status = response.status;
      throw error;
    }
    return {
      provider: this.id,
      bucket: input.bucket,
      key: input.key,
      path: input.key,
      cacheControl: input.cacheControl ?? null,
    };
  }

  async getObject(bucket, key, options = {}) {
    const maxBytes = Number(options.maxBytes ?? 25 * 1024 * 1024);
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('Invalid object read byte limit.');
    const signed = this.createPresignedRequest({ bucket, key, expiresInSeconds: 900 }, 'GET');
    const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(this.uploadTimeoutMs)])
      : AbortSignal.timeout(this.uploadTimeoutMs);
    const response = await fetch(signed.signedUrl, { signal });
    if (!response.ok) {
      await response.body?.cancel();
      const error = new Error(`S3-compatible object read failed: ${response.status}`);
      error.status = response.status;
      throw error;
    }
    if (Number(response.headers.get('content-length')) > maxBytes) {
      await response.body?.cancel();
      throw new Error(`Stored object exceeds ${maxBytes} bytes.`);
    }
    const chunks = [];
    let byteLength = 0;
    for await (const chunk of response.body ?? []) {
      byteLength += chunk.byteLength;
      if (byteLength > maxBytes) throw new Error(`Stored object exceeds ${maxBytes} bytes.`);
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks, byteLength);
  }

  publicUrl(bucket, key) {
    const base = this.publicBaseUrl ?? `${this.endpoint}/${encodeURIComponent(bucket)}`;
    return `${base}/${encodePathPart(key)}`;
  }
}

function configuredValue(value) {
  return String(value ?? '').trim();
}

function publicCatalogueBaseUrl(value) {
  const raw = configuredValue(value);
  if (!raw) throw new Error('STACKR_R2_PUBLIC_BASE_URL is required for catalogue delivery.');
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || url.hostname.endsWith('.r2.cloudflarestorage.com')) {
    throw new Error('STACKR_R2_PUBLIC_BASE_URL must be a public HTTPS CDN URL, separate from the R2 API endpoint.');
  }
  return url.toString().replace(/\/+$/, '');
}

function r2CatalogueLocation(env) {
  const bucket = configuredValue(env.STACKR_R2_BUCKET);
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) {
    throw new Error('STACKR_R2_BUCKET must name the public catalogue bucket.');
  }
  return { bucket, publicBaseUrl: publicCatalogueBaseUrl(env.STACKR_R2_PUBLIC_BASE_URL) };
}

/** R2 retains the existing s3_compatible metadata value; no schema rewrite is needed. */
export class CloudflareR2ObjectStorageAdapter extends S3CompatibleObjectStorageAdapter {
  constructor(options) {
    const endpoint = new URL(options.endpoint);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.port
      || endpoint.search || endpoint.hash || endpoint.pathname !== '/'
      || !/^[a-z0-9]+(?:\.(?:eu|fedramp))?\.r2\.cloudflarestorage\.com$/.test(endpoint.hostname)) {
      throw new Error('STACKR_R2_ENDPOINT must be an HTTPS Cloudflare R2 S3 API endpoint.');
    }
    super({ ...options, endpoint: endpoint.origin, region: 'auto' });
    this.catalogueBucket = options.bucket;
    this.publicBaseUrl = publicCatalogueBaseUrl(options.publicBaseUrl);
    this.catalogueStorage = true;
  }

  createPresignedUpload(input) {
    if (input.bucket !== this.catalogueBucket) {
      throw new Error('Public catalogue writes must use the configured R2 bucket.');
    }
    if (input.upsert === true) throw new Error('Public catalogue objects are immutable.');
    return super.createPresignedUpload({ ...input, upsert: false });
  }

  publicUrl(bucket, key) {
    return bucket === this.catalogueBucket ? `${this.publicBaseUrl}/${encodePathPart(key)}` : null;
  }

  async getObject(bucket, key, options = {}) {
    if (bucket !== this.catalogueBucket) throw new Error('Catalogue reads must use the configured R2 bucket.');
    return super.getObject(bucket, key, options);
  }
}

/** New public binaries never fall back to Supabase when R2 is absent or incomplete. */
export function createCatalogueObjectStorageAdapter(options = {}) {
  const env = options.env ?? process.env;
  const provider = configuredValue(env.STACKR_CATALOGUE_STORAGE_PROVIDER) || 'r2';
  if (provider === 'local_dev' && env.NODE_ENV !== 'production') {
    return new LocalObjectStorageAdapter(options);
  }
  if (provider !== 'r2' && provider !== 's3_compatible') {
    throw new Error('Public catalogue storage must use R2 (or explicit local_dev outside production).');
  }
  const location = r2CatalogueLocation(env);
  const accountId = configuredValue(env.STACKR_R2_ACCOUNT_ID);
  const endpoint = configuredValue(env.STACKR_R2_ENDPOINT)
    || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '');
  if (!endpoint) throw new Error('STACKR_R2_ENDPOINT or STACKR_R2_ACCOUNT_ID is required.');
  return new CloudflareR2ObjectStorageAdapter({
    ...location,
    endpoint,
    accessKeyId: configuredValue(env.STACKR_R2_ACCESS_KEY_ID),
    secretAccessKey: configuredValue(env.STACKR_R2_SECRET_ACCESS_KEY),
  });
}

export function assertCatalogueWriteStorage(storage) {
  if (!storage || typeof storage.putObject !== 'function'
    || storage.id === 'supabase_storage'
    || (process.env.NODE_ENV === 'production' && storage.catalogueStorage !== true
      && storage.id !== 'memory_dry_run')) {
    throw new Error('Public catalogue writes require configured R2 storage; Supabase is metadata-only.');
  }
  return storage;
}

/** Legacy reads retain their recorded provider while independently migrated R2 rows use the CDN. */
export function createPublicAssetStorageReaders(supabase, env = process.env) {
  const readers = { supabase_storage: new SupabaseObjectStorageAdapter(supabase) };
  if (env.STACKR_CATALOGUE_STORAGE_PROVIDER === 'local_dev' && env.NODE_ENV !== 'production') {
    readers.local_dev = new LocalObjectStorageAdapter();
  }
  if (configuredValue(env.STACKR_R2_BUCKET) || configuredValue(env.STACKR_R2_PUBLIC_BASE_URL)) {
    const { bucket: catalogueBucket, publicBaseUrl } = r2CatalogueLocation(env);
    readers.s3_compatible = {
      id: 's3_compatible',
      publicUrl(bucket, key) {
        return bucket === catalogueBucket ? `${publicBaseUrl}/${encodePathPart(key)}` : null;
      },
    };
  }
  return readers;
}

export function createObjectStorageAdapter(kind, options = {}) {
  if (kind === 'local_dev') return new LocalObjectStorageAdapter(options);
  if (kind === 's3_compatible') return new S3CompatibleObjectStorageAdapter(options);
  if (kind === 'supabase_storage') return new SupabaseObjectStorageAdapter(options.supabase);
  throw new Error(`Unsupported object storage adapter: ${kind}`);
}

export { IMMUTABLE_CACHE_CONTROL, supabaseCacheControlSeconds };
