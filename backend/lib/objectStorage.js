import { createHmac, createHash } from 'node:crypto';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

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
        cacheControl: input.cacheControl,
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

  async getObject(bucket, key) {
    return readFile(path.join(this.rootDir, bucket, key));
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
    if (!this.endpoint || !this.accessKeyId || !this.secretAccessKey) {
      throw new Error('S3-compatible storage requires endpoint, access key and secret key.');
    }
  }

  createPresignedUpload(input) {
    const method = 'PUT';
    const expiresInSeconds = Math.max(60, Math.min(Number(input.expiresInSeconds ?? 900), 86_400));
    const date = new Date();
    const dateStamp = yyyymmdd(date);
    const timestamp = amzDate(date);
    const bucket = input.bucket;
    const key = encodePathPart(input.key);
    const host = new URL(this.endpoint).host;
    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const credential = `${this.accessKeyId}/${credentialScope}`;
    const signedHeaders = 'host';
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
      `host:${host}\n`,
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
      },
    };
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
    });
    const headers = {
      'content-type': input.contentType,
    };
    if (input.cacheControl) headers['cache-control'] = input.cacheControl;
    const response = await fetch(signed.signedUrl, {
      method: 'PUT',
      headers,
      body: input.body,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`S3-compatible upload failed: ${response.status} ${detail}`.trim());
    }
    return {
      provider: this.id,
      bucket: input.bucket,
      key: input.key,
      path: input.key,
      cacheControl: input.cacheControl ?? null,
    };
  }

  publicUrl(bucket, key) {
    const base = this.publicBaseUrl ?? `${this.endpoint}/${encodeURIComponent(bucket)}`;
    return `${base}/${encodePathPart(key)}`;
  }
}

export function createObjectStorageAdapter(kind, options = {}) {
  if (kind === 'local_dev') return new LocalObjectStorageAdapter(options);
  if (kind === 's3_compatible') return new S3CompatibleObjectStorageAdapter(options);
  if (kind === 'supabase_storage') return new SupabaseObjectStorageAdapter(options.supabase);
  throw new Error(`Unsupported object storage adapter: ${kind}`);
}

export { IMMUTABLE_CACHE_CONTROL };
