import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const endpoint = 'https://api.supabase.com/v1/projects/lmwfhvexfcoyeuoyrlco/database/backups';

// Fixed staging target; an already configured alternative is tried only when
// the primary credential is rejected. No service failure or backup gate is bypassed.
export async function listStagingPricingBackups({ token, fallbackToken, fetchImpl = fetch }) {
  const credentials = [...new Set([token, fallbackToken].filter(value => typeof value === 'string' && value.trim()))];
  if (!credentials.length) throw new Error('staging_backup_credential_missing');
  for (const [index, credential] of credentials.entries()) {
    let response;
    try {
      response = await fetchImpl(endpoint, {
        headers: { Authorization: `Bearer ${credential}` },
        signal: AbortSignal.timeout(30_000), redirect: 'error',
      });
    } catch {
      throw new Error('staging_backup_transport_failure');
    }
    if (response.status === 401 || response.status === 403) continue;
    if (!response.ok) throw new Error(`staging_backup_list_http_${response.status}`);
    let manifest;
    try { manifest = await response.json(); } catch { throw new Error('staging_backup_manifest_invalid'); }
    if (!manifest || !Array.isArray(manifest.backups)) throw new Error('staging_backup_manifest_invalid');
    return { manifest, usedFallback: index > 0 };
  }
  throw new Error('staging_backup_credentials_rejected');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const output = process.argv.find(argument => argument.startsWith('--output='))?.slice(9);
  if (!output) throw new Error('staging_backup_output_required');
  listStagingPricingBackups({ token: process.env.SUPABASE_ACCESS_TOKEN,
    fallbackToken: process.env.SUPABASE_BACKUP_FALLBACK_ACCESS_TOKEN })
    .then(({ manifest, usedFallback }) => {
      writeFileSync(output, JSON.stringify(manifest), { mode: 0o600 });
      console.log(JSON.stringify({ backupListVerified: true, backupCount: manifest.backups.length, usedFallback }));
    }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
