const PROJECT_REF_PATTERN = /^[a-z]{20}$/;

function fail(message) {
  throw new Error(`Pricing V2 refresh blocked: ${message}`);
}

/**
 * Scheduled pricing work has a service-role credential and must name its
 * Supabase project explicitly. Do not accept a default production target or a
 * custom host here: either could turn a configuration typo into a write.
 */
export function resolvePricingV2SupabaseTarget(env = process.env) {
  const expectedProjectRef = String(env.STACKR_EXPECTED_SUPABASE_PROJECT_REF ?? '')
    .trim()
    .toLowerCase();
  if (!PROJECT_REF_PATTERN.test(expectedProjectRef)) {
    fail('STACKR_EXPECTED_SUPABASE_PROJECT_REF must be a 20-character Supabase project ref');
  }

  const suppliedUrl = String(env.SUPABASE_URL ?? '').trim();
  if (!suppliedUrl) fail('SUPABASE_URL is required; no default project is permitted');

  let parsed;
  try {
    parsed = new URL(suppliedUrl);
  } catch {
    fail('SUPABASE_URL must be a valid HTTPS Supabase project URL');
  }

  const expectedHost = `${expectedProjectRef}.supabase.co`;
  if (parsed.protocol !== 'https:'
    || parsed.hostname.toLowerCase() !== expectedHost
    || parsed.username
    || parsed.password
    || parsed.port
    || parsed.pathname !== '/'
    || parsed.search
    || parsed.hash) {
    fail(`SUPABASE_URL must exactly target https://${expectedHost}`);
  }

  return {
    projectRef: expectedProjectRef,
    url: `https://${expectedHost}`,
  };
}
