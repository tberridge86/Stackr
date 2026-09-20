import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const endpoint = 'https://api.supabase.com/v1/projects/oakdbbzdqwurpjnoqhmu/database/backups';

export async function listProductionBackups({ token, fallbackToken, fetchImpl = fetch }) {
  const credentials = [...new Set([token, fallbackToken].filter(value => typeof value === 'string' && value.trim()))];
  if (!credentials.length) throw new Error('production_backup_credential_missing');
  for (const [index, credential] of credentials.entries()) {
    const response = await fetchImpl(endpoint, {
      headers: { Authorization: `Bearer ${credential}` },
      signal: AbortSignal.timeout(30_000),
      redirect: 'error',
    });
    // Only retry rejected credentials, and only with the already configured
    // alternative. Do not hide service errors or weaken the backup requirement.
    if (response.status === 401 || response.status === 403) continue;
    if (!response.ok) throw new Error(`production_backup_list_http_${response.status}`);
    const manifest = await response.json();
    if (!manifest || !Array.isArray(manifest.backups)) throw new Error('production_backup_manifest_invalid');
    return { manifest, usedFallback: index > 0 };
  }
  throw new Error('production_backup_credentials_rejected');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const output = process.argv.find(argument => argument.startsWith('--output='))?.slice(9);
  if (!output) throw new Error('production_backup_output_required');
  listProductionBackups({ token: process.env.SUPABASE_ACCESS_TOKEN,
    fallbackToken: process.env.SUPABASE_BACKUP_FALLBACK_ACCESS_TOKEN })
    .then(({ manifest, usedFallback }) => {
      writeFileSync(output, JSON.stringify(manifest), { mode: 0o600 });
      console.log(JSON.stringify({ backupListVerified: true, backupCount: manifest.backups.length, usedFallback }));
    }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
