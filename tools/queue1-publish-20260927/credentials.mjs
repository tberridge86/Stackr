const PROJECTS = new Set(['lmwfhvexfcoyeuoyrlco', 'oakdbbzdqwurpjnoqhmu']);
// Existing names verified in the owner's Supabase dashboard on 2026-09-27.
const KEY_NAMES = { lmwfhvexfcoyeuoyrlco: 'stackr_catalogue_operator', oakdbbzdqwurpjnoqhmu: 'default' };
const modernSecret = value => typeof value === 'string' && /^sb_secret_[A-Za-z0-9_-]+$/.test(value);

// Read existing server credentials only. Never enable legacy keys or create keys.
export async function resolveServerKey({ project, configuredKey, accessToken, fetchImpl = fetch, mask = () => {} }) {
  if (!PROJECTS.has(project)) throw new Error('Unexpected credential project');
  if (modernSecret(configuredKey)) return configuredKey;
  if (!accessToken) throw new Error('An active server key or Supabase management token is required');
  let response;
  try {
    response = await fetchImpl(`https://api.supabase.com/v1/projects/${project}/api-keys?reveal=true`, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });
  } catch {
    throw new Error('Could not read existing Supabase server keys');
  }
  // Never include a response body, token, or key in diagnostics.
  if (!response.ok) throw new Error(`Server key lookup failed (HTTP ${response.status})`);
  let keys;
  try { keys = await response.json(); } catch { throw new Error('Invalid server key response'); }
  if (!Array.isArray(keys)) throw new Error('Invalid server key response');
  const candidates = keys.filter(key => key.name === KEY_NAMES[project] && key.type === 'secret' && modernSecret(key.api_key)
    && (!key.secret_jwt_template?.role || key.secret_jwt_template.role === 'service_role'));
  if (candidates.length !== 1) throw new Error(`Expected exactly one existing modern server key named ${KEY_NAMES[project]} for ${project}`);
  mask(candidates[0].api_key);
  return candidates[0].api_key;
}
