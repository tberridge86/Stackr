import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const STAGING_SUPABASE_REF = 'lmwfhvexfcoyeuoyrlco';
const PRODUCTION_SUPABASE_REF = 'oakdbbzdqwurpjnoqhmu';

function diagnostic(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      cause: error.cause instanceof Error ? error.cause.message : null,
    };
  }
  if (error && typeof error === 'object') {
    const value = error as Record<string, unknown>;
    return {
      name: typeof value.name === 'string' ? value.name : null,
      message: typeof value.message === 'string' ? value.message : String(error),
      code: value.code ?? null,
      details: value.details ?? null,
      hint: value.hint ?? null,
      status: value.status ?? value.statusCode ?? null,
    };
  }
  return { message: String(error) };
}

function keyMetadata(key: string) {
  const result: Record<string, unknown> = {
    configured: Boolean(key),
    format: key.startsWith('sb_secret_')
      ? 'secret-key'
      : key.split('.').length === 3
        ? 'jwt'
        : 'unknown',
    jwtProjectRef: null,
    jwtRole: null,
  };
  if (result.format !== 'jwt') return result;
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')) as Record<string, unknown>;
    result.jwtProjectRef = payload.ref ?? null;
    result.jwtRole = payload.role ?? null;
  } catch {
    result.format = 'invalid-jwt';
  }
  return result;
}

async function main() {
  const url = String(process.env.SUPABASE_URL ?? '').trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? '').trim();
  const target = String(process.env.STACKR_CATALOGUE_IMPORT_TARGET ?? '').trim().toLowerCase();

  if (!url.includes(STAGING_SUPABASE_REF) || url.includes(PRODUCTION_SUPABASE_REF) || target !== 'staging') {
    throw new Error('Catalogue ingest access probe refuses any target other than canonical StackR staging.');
  }
  if (!key) throw new Error('A backend-only Supabase credential is required.');

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error, status, statusText } = await client
    .schema('ingest')
    .from('sources')
    .select('id, code')
    .limit(1);

  const result = {
    ok: !error,
    projectRef: STAGING_SUPABASE_REF,
    target,
    credential: keyMetadata(key),
    http: { status, statusText },
    rowCount: Array.isArray(data) ? data.length : null,
    error: error ? diagnostic(error) : null,
  };
  console.log(JSON.stringify(result, null, 2));
  if (error) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: diagnostic(error),
  }, null, 2));
  process.exitCode = 1;
});
