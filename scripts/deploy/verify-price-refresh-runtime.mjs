import { readFile } from 'node:fs/promises';

const API_TIMEOUT_MS = 15_000;

function requiredEnvironmentValue(name, environment) {
  const value = String(environment[name] ?? '').trim();
  if (!value) throw new Error(`Missing required price refresh binding: ${name}.`);
  return value;
}

function parseHttpsUrl(name, value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }

  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error(`${name} must be a credential-free HTTPS URL without query or fragment data.`);
  }
  return url;
}

function serverSideSupabaseCredentialKind(value) {
  if (/^sb_secret_[A-Za-z0-9_-]{20,}$/.test(value)) return 'secret';
  const [, encodedPayload] = value.split('.');
  if (!encodedPayload) return null;
  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    return payload?.role === 'service_role' ? 'service_role' : null;
  } catch {
    return null;
  }
}

async function readProductionProjectRef() {
  const manifest = JSON.parse(await readFile(new URL('../../deploy/release-manifest.json', import.meta.url), 'utf8'));
  const projectRef = String(manifest?.components?.database?.projectRef ?? '').trim();
  if (!/^[a-z0-9]{20}$/.test(projectRef)) {
    throw new Error('The release manifest does not contain a valid production Supabase project ref.');
  }
  return projectRef;
}

async function readJsonResponse(response, label) {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status}.`);
  }
  return body;
}

export async function verifyPriceRefreshRuntime({
  environment = process.env,
  request = fetch,
} = {}) {
  const projectRef = await readProductionProjectRef();
  const expectedSupabaseOrigin = `https://${projectRef}.supabase.co`;
  const supabaseUrl = parseHttpsUrl(
    'SUPABASE_URL',
    requiredEnvironmentValue('SUPABASE_URL', environment),
  );
  const serviceRoleKey = requiredEnvironmentValue('SUPABASE_SERVICE_ROLE_KEY', environment);
  const credentialKind = serverSideSupabaseCredentialKind(serviceRoleKey);
  const priceApiUrl = parseHttpsUrl(
    'PRICE_API_URL',
    requiredEnvironmentValue('PRICE_API_URL', environment),
  );

  if (supabaseUrl.origin !== expectedSupabaseOrigin || supabaseUrl.pathname !== '/') {
    throw new Error(`SUPABASE_URL must target the release-manifest production project ${projectRef}.`);
  }
  if (!credentialKind) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not a server-side Supabase credential.');
  }
  if (priceApiUrl.pathname !== '/') {
    throw new Error('PRICE_API_URL must be the production backend origin without a path.');
  }

  const catalogueResponse = await request(
    new URL('/rest/v1/catalogue_languages?select=code&limit=1', supabaseUrl),
    {
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
      headers: {
        Accept: 'application/json',
        'Accept-Profile': 'api',
        apikey: serviceRoleKey,
        ...(credentialKind === 'service_role'
          ? { Authorization: `Bearer ${serviceRoleKey}` }
          : {}),
      },
    },
  );
  const catalogueLanguages = await readJsonResponse(
    catalogueResponse,
    'Production Supabase credential check',
  );
  if (!Array.isArray(catalogueLanguages) || catalogueLanguages.length === 0) {
    throw new Error('Production Supabase credential check returned no catalogue language rows.');
  }

  const healthResponse = await request(new URL('/health', priceApiUrl), {
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
    headers: { Accept: 'application/json' },
  });
  const health = await readJsonResponse(healthResponse, 'Production price API health check');
  if (
    health?.ok !== true
    || health?.runtime?.railwayEnvironment !== 'production'
    || health?.runtime?.supabaseProjectRef !== projectRef
  ) {
    throw new Error('PRICE_API_URL is not the approved production backend runtime.');
  }

  return {
    priceApiOrigin: priceApiUrl.origin,
    projectRef,
    supabaseOrigin: supabaseUrl.origin,
  };
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  verifyPriceRefreshRuntime()
    .then(({ priceApiOrigin, projectRef }) => {
      console.log(`Verified price refresh runtime for production project ${projectRef} via ${priceApiOrigin}.`);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
