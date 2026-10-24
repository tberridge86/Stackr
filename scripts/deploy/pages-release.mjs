import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { mobileReleaseFlagsForEnvironment, resolveMobileRuntimeConfig, targets } = require('../../config/mobile-runtime.cjs');
export const PAGES_TARGET = Object.freeze({ accountId: 'b4c23b0834cc5a113aa4a98fd904b281', project: 'stackr-web', branch: 'main', hostname: 'stackr-web.pages.dev' });
const hash = (value) => createHash('sha256').update(value).digest('hex');
const fail = (code) => { throw new Error(code); };

export function assertReleaseSource(env) {
  if (env.GITHUB_REPOSITORY !== 'tberridge86/Stackr' || env.GITHUB_REF !== 'refs/heads/main') fail('pages_source_scope_mismatch');
  if (!/^[a-f0-9]{40}$/.test(env.EXPECTED_MAIN_SHA ?? '') || env.GITHUB_SHA !== env.EXPECTED_MAIN_SHA) fail('pages_source_sha_mismatch');
  return env.EXPECTED_MAIN_SHA;
}

export function assertStaticConfiguration(source) {
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
  const expected = new Set(['name="stackr-web"', 'pages_build_output_dir="../../dist"', 'compatibility_date="2026-10-23"']);
  if (lines.length !== expected.size || lines.some((line) => { const match = /^([a-z_]+)\s*=\s*("[^"]*")$/.exec(line); return !match || !expected.delete(match[1] + '=' + match[2]); })) fail('pages_static_config_mismatch');
}
export function productionBuildEnvironment(env) {
  // Only reviewed public targets and release flags enter the exported application.
  for (const name of Object.keys(env)) {
    if (/^(CLOUDFLARE_API_TOKEN|RAILWAY_(API_)?TOKEN|SUPABASE_((PRODUCTION|STAGING)_)?(SECRET_KEY|SERVICE_ROLE_KEY|DB_URL)|STACKR_R2_(ACCESS_KEY_ID|SECRET_ACCESS_KEY)|BACKEND_ORIGIN_KEY)$/.test(name) && env[name]) fail('pages_build_contains_server_secret');
  }
  const target = targets.production;
  const result = {
    ...env, ...mobileReleaseFlagsForEnvironment('production'), EXPO_NO_DOTENV: '1', STACKR_IPHONE_PREVIEW: '0', STACKR_OWNER_RECOGNITION_BUILD: 'false',
    STACKR_MOBILE_APP_VARIANT: 'production', STACKR_MOBILE_ENVIRONMENT: 'production',
    STACKR_MOBILE_SUPABASE_URL: target.supabaseUrl, STACKR_MOBILE_SUPABASE_PUBLISHABLE_KEY: target.supabasePublishableKey,
    STACKR_MOBILE_PRICE_API_URL: target.priceApiUrl, STACKR_MOBILE_API_URL: target.stackrApiUrl,
  };
  resolveMobileRuntimeConfig(result);
  return result;
}

export function inventoryExport(directory) {
  const root = path.resolve(directory);
  if (!lstatSync(root).isDirectory()) fail('pages_export_missing');
  const files = [];
  const walk = (current) => {
    for (const name of readdirSync(current).sort()) {
      const absolute = path.join(current, name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) fail('pages_export_symlink');
      if (name.startsWith('.env') || name === '_worker.js' || relative === 'functions') fail('pages_export_not_static');
      if (stat.isDirectory()) walk(absolute);
      else if (stat.isFile()) {
        if (stat.size > 25 * 1024 * 1024) fail('pages_export_file_too_large');
        files.push({ path: relative, bytes: stat.size, sha256: hash(readFileSync(absolute)) });
        if (files.length > 20000) fail('pages_export_too_many_files');
      } else fail('pages_export_special_file');
    }
  };
  walk(root);
  if (!files.some((file) => file.path === 'index.html' && file.bytes > 0)) fail('pages_export_index_missing');
  const html = readFileSync(path.join(root, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map((match) => match[1]);
  const script = scripts.find((value) => /^\/?_expo\/[A-Za-z0-9/_.-]+\.js$/.test(value));
  if (!script || !files.some((file) => file.path === script.replace(/^\//, ''))) fail('pages_export_script_missing');
  return { files, totalBytes: files.reduce((sum, file) => sum + file.bytes, 0), manifestSha256: hash(JSON.stringify(files)), probePaths: ['index.html', script.replace(/^\//, '')] };
}

export function assertProject(project, expectedProjectId, expectedPreviousDeployment) {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(expectedProjectId ?? '') || project?.id !== expectedProjectId) fail('pages_project_id_mismatch');
  if (project.name !== PAGES_TARGET.project || project.subdomain !== PAGES_TARGET.hostname || project.production_branch !== PAGES_TARGET.branch) fail('pages_project_target_mismatch');
  // This first rollout is limited to pages.dev. Custom-domain promotion is separate.
  if (!Array.isArray(project.domains) || project.domains.some((domain) => domain !== PAGES_TARGET.hostname)) fail('pages_custom_domain_present');
  if (project.uses_functions === true) fail('pages_project_uses_functions');
  if (project.source && project.source.config?.production_deployments_enabled !== false) fail('pages_competing_git_deployment');
  const previous = project.canonical_deployment?.id ?? 'NONE';
  if (!/^(NONE|[A-Za-z0-9_-]{8,128})$/.test(expectedPreviousDeployment ?? '') || previous !== expectedPreviousDeployment) fail('pages_previous_deployment_mismatch');
  return { projectId: project.id, previousDeploymentId: previous, hostname: project.subdomain };
}

export function assertDeployment(project, expectedProjectId, sha, previousDeploymentId) {
  assertProject(project, expectedProjectId, project.canonical_deployment?.id ?? 'NONE');
  const deployment = project.canonical_deployment;
  const metadata = deployment?.deployment_trigger?.metadata;
  if (!deployment || deployment.id === previousDeploymentId || deployment.environment !== 'production'
    || deployment.project_id !== expectedProjectId || deployment.project_name !== PAGES_TARGET.project
    || metadata?.commit_hash !== sha || metadata?.branch !== PAGES_TARGET.branch || metadata?.commit_dirty !== false
    || deployment.is_skipped === true || deployment.latest_stage?.name !== 'deploy' || deployment.latest_stage?.status !== 'success') fail('pages_deployment_not_verified');
  let url;
  try { url = new URL(deployment.url); } catch { fail('pages_deployment_url_invalid'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash
    || !/^[a-z0-9-]+\.stackr-web\.pages\.dev$/.test(url.hostname) || url.pathname !== '/') fail('pages_deployment_url_invalid');
  return { id: deployment.id, url: url.origin, status: 'success', sourceSha: sha };
}

async function projectRead(token, fetchImpl = fetch) {
  const response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${PAGES_TARGET.accountId}/pages/projects/${PAGES_TARGET.project}`, {
    headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) fail('pages_project_read_failed');
  const body = await response.json();
  if (body.success !== true || !body.result) fail('pages_project_read_failed');
  // Raw project responses can include environment values: never persist or print them.
  return body.result;
}

export async function verifyPublicFiles(origin, inventory, fetchImpl = fetch) {
  const checked = [];
  for (const relative of inventory.probePaths) {
    const expected = inventory.files.find((file) => file.path === relative);
    if (!expected) fail('pages_probe_manifest_missing');
    const requestPath = relative === 'index.html' ? '/' : `/${relative}`;
    const response = await fetchImpl(new URL(requestPath, origin), { redirect: 'error', signal: AbortSignal.timeout(20000), headers: { 'Cache-Control': 'no-cache' } });
    if (!response.ok) fail('pages_public_probe_failed');
    const mime = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const allowed = relative === 'index.html' ? ['text/html'] : ['application/javascript', 'text/javascript'];
    if (!allowed.includes(mime)) fail('pages_public_probe_mime_mismatch');
    const reader = response.body?.getReader();
    if (!reader) fail('pages_public_probe_body_missing');
    const digest = createHash('sha256');
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > expected.bytes) fail('pages_public_probe_size_mismatch');
        digest.update(value);
      }
    } finally { await reader.cancel(); }
    if (size !== expected.bytes || digest.digest('hex') !== expected.sha256) fail('pages_public_probe_hash_mismatch');
    checked.push({ path: requestPath, bytes: size, sha256: expected.sha256 });
  }
  return checked;
}

function runNode(args, env = process.env) {
  const result = spawnSync(process.execPath, args, { env, stdio: 'inherit', timeout: 15 * 60 * 1000 });
  if (result.status !== 0) fail('pages_child_command_failed');
}
function writeReceipt(name, receipt) {
  mkdirSync('reports/pages', { recursive: true });
  writeFileSync(`reports/pages/${name}.json`, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
}

export async function main(args = process.argv.slice(2), env = process.env) {
  if (args.length !== 1 || !['build', 'publish'].includes(args[0])) fail('pages_mode_invalid');
  const sha = assertReleaseSource(env);
  assertStaticConfiguration(readFileSync('deploy/pages/wrangler.toml', 'utf8'));
  if (existsSync('deploy/pages/functions')) fail('pages_functions_directory_present');
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  if (head.status !== 0 || head.stdout.trim() !== sha) fail('pages_checkout_sha_mismatch');
  if (args[0] === 'build') {
    const buildEnv = productionBuildEnvironment(env);
    runNode(['scripts/deploy/verify-mobile-runtime-config.mjs', '--expected-environment=production', '--expected-app-variant=production', '--require-explicit', '--require-safe-release-flags'], buildEnv);
    runNode(['node_modules/expo/bin/cli', 'export', '--platform', 'web', '--output-dir', 'dist'], buildEnv);
    runNode(['scripts/deploy/secret-scan.mjs', '--directory=dist']);
    const inventory = inventoryExport('dist');
    writeReceipt('build', { sourceSha: sha, target: PAGES_TARGET, runtimeEnvironment: 'production', ...inventory, liveDeploymentVerified: false });
    console.log(`Validated Pages export: ${inventory.files.length} files, ${inventory.totalBytes} bytes.`);
    return;
  }
  if (!env.CLOUDFLARE_API_TOKEN || env.CLOUDFLARE_ACCOUNT_ID !== PAGES_TARGET.accountId) fail('pages_credentials_or_account_missing');
  const recorded = JSON.parse(readFileSync('reports/pages/build.json', 'utf8'));
  const inventory = inventoryExport('dist');
  if (recorded.sourceSha !== sha || recorded.runtimeEnvironment !== 'production' || recorded.manifestSha256 !== inventory.manifestSha256
    || JSON.stringify(recorded.target) !== JSON.stringify(PAGES_TARGET)) fail('pages_artifact_mismatch');
  runNode(['scripts/deploy/secret-scan.mjs', '--directory=dist']);
  const before = assertProject(await projectRead(env.CLOUDFLARE_API_TOKEN), env.EXPECTED_PAGES_PROJECT_ID, env.PREVIOUS_PAGES_DEPLOYMENT_ID);
  writeReceipt('before', { sourceSha: sha, target: PAGES_TARGET, ...before, observedAt: new Date().toISOString() });
  // A timeout can leave a completed upload. Stop and reconcile rather than retry automatically.
  runNode(['gateway/node_modules/wrangler/bin/wrangler.js', 'pages', 'deploy', '--cwd', 'deploy/pages', '--project-name', PAGES_TARGET.project,
    '--branch', PAGES_TARGET.branch, '--commit-hash', sha, '--commit-dirty=false'], { ...env, CI: 'true', WRANGLER_SEND_METRICS: 'false' });
  const deployed = assertDeployment(await projectRead(env.CLOUDFLARE_API_TOKEN), before.projectId, sha, before.previousDeploymentId);
  writeReceipt('published', { target: PAGES_TARGET, ...deployed, previousDeploymentId: before.previousDeploymentId, publicFilesVerified: false });
  const deploymentFiles = await verifyPublicFiles(deployed.url, inventory);
  const canonicalFiles = await verifyPublicFiles(`https://${PAGES_TARGET.hostname}`, inventory);
  const final = assertDeployment(await projectRead(env.CLOUDFLARE_API_TOKEN), before.projectId, sha, before.previousDeploymentId);
  if (final.id !== deployed.id) fail('pages_deployment_changed_during_verification');
  writeReceipt('verified', { target: PAGES_TARGET, ...deployed, previousDeploymentId: before.previousDeploymentId,
    manifestSha256: inventory.manifestSha256, deploymentFiles, canonicalFiles, publicFilesVerified: true, appSessionVerified: false, dnsChanged: false });
  console.log(`Verified static Pages delivery: ${deployed.url}. Authenticated app and device acceptance remain separate.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(/^pages_[a-z_]+$/.test(error.message) ? error.message : 'pages_release_failed'); process.exitCode = 1; });
}
