import { randomBytes } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED_REHEARSAL_PROJECT_REF = 'isfybjkwvcuqpqtmkujo';
const EXPECTED_REHEARSAL_REGION = 'eu-west-1';
const DEFAULT_POOLER_HOST = 'aws-0-eu-west-1.pooler.supabase.com';
const MANAGEMENT_API_ORIGIN = 'https://api.supabase.com';

export function buildRehearsalDatabaseUrl({ projectRef, password, poolerHost }) {
  if (projectRef !== EXPECTED_REHEARSAL_PROJECT_REF) {
    throw new Error('rehearsal_project_ref_mismatch');
  }
  if (poolerHost !== DEFAULT_POOLER_HOST) {
    throw new Error('rehearsal_pooler_host_mismatch');
  }
  return `postgresql://${encodeURIComponent(`postgres.${projectRef}`)}`
    + `:${encodeURIComponent(password)}@${poolerHost}:5432/postgres`
    + '?sslmode=require&connect_timeout=30';
}

export async function configureEphemeralRehearsalConnection({
  env = process.env,
  fetchImpl = fetch,
  randomBytesImpl = randomBytes,
  appendEnvironment = (filePath, value) => appendFileSync(filePath, value, 'utf8'),
  maskSecret = (value) => process.stdout.write(`::add-mask::${value}\n`),
} = {}) {
  const projectRef = env.SUPABASE_RESTORE_PROJECT_REF;
  const stagingProjectRef = env.SUPABASE_STAGING_PROJECT_REF;
  const productionProjectRef = env.SUPABASE_PRODUCTION_PROJECT_REF;
  const accessToken = env.SUPABASE_ACCESS_TOKEN;
  const githubEnvironmentPath = env.GITHUB_ENV;
  const poolerHost = env.STACKR_REHEARSAL_POOLER_HOST ?? DEFAULT_POOLER_HOST;

  if (projectRef !== EXPECTED_REHEARSAL_PROJECT_REF) {
    throw new Error('rehearsal_project_ref_mismatch');
  }
  if (projectRef === stagingProjectRef || projectRef === productionProjectRef) {
    throw new Error('rehearsal_project_not_isolated');
  }
  if (stagingProjectRef !== 'lmwfhvexfcoyeuoyrlco') {
    throw new Error('staging_project_ref_mismatch');
  }
  if (productionProjectRef !== 'oakdbbzdqwurpjnoqhmu') {
    throw new Error('production_project_ref_mismatch');
  }
  if (!accessToken) throw new Error('supabase_access_token_missing');
  if (!githubEnvironmentPath) throw new Error('github_environment_path_missing');

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
  const projectResponse = await fetchImpl(
    `${MANAGEMENT_API_ORIGIN}/v1/projects/${projectRef}`,
    { method: 'GET', headers },
  );
  if (!projectResponse.ok) {
    throw new Error(`rehearsal_project_lookup_failed:${projectResponse.status}`);
  }
  const project = await projectResponse.json();
  if (project.id !== projectRef || project.ref !== projectRef) {
    throw new Error('rehearsal_project_identity_mismatch');
  }
  if (project.region !== EXPECTED_REHEARSAL_REGION) {
    throw new Error('rehearsal_project_region_mismatch');
  }
  if (project.status !== 'ACTIVE_HEALTHY') {
    throw new Error(`rehearsal_project_not_healthy:${project.status}`);
  }

  const password = `StackrR1!${randomBytesImpl(48).toString('base64url')}`;
  const resetResponse = await fetchImpl(
    `${MANAGEMENT_API_ORIGIN}/v1/projects/${projectRef}/database/password`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ password }),
    },
  );
  if (!resetResponse.ok) {
    throw new Error(`rehearsal_password_reset_failed:${resetResponse.status}`);
  }

  const databaseUrl = buildRehearsalDatabaseUrl({ projectRef, password, poolerHost });
  maskSecret(password);
  maskSecret(databaseUrl);
  appendEnvironment(githubEnvironmentPath, `SUPABASE_RESTORE_DB_URL=${databaseUrl}\n`);

  return {
    projectRef,
    projectStatus: project.status,
    databasePasswordReset: true,
    ephemeralConnectionPrepared: true,
  };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  const result = await configureEphemeralRehearsalConnection();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
