import { existsSync, readFileSync, statSync } from 'node:fs';

function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function allObjects(value, output = []) {
  if (!value || typeof value !== 'object') return output;
  output.push(value);
  for (const child of Array.isArray(value) ? value : Object.values(value)) allObjects(child, output);
  return output;
}

function candidateTimestamp(value) {
  for (const key of ['completed_at', 'inserted_at', 'created_at', 'started_at', 'updated_at']) {
    const parsed = Date.parse(value?.[key]);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

const physicalPath = argument('physical');
const schemaPath = argument('schema');
const dataPath = argument('data');
const maxAgeHours = Number(argument('max-age-hours') ?? 36);
const requirePhysical = process.argv.includes('--require-physical');
const errors = [];
let latestBackupAt = null;

if (physicalPath) {
  const payload = JSON.parse(readFileSync(physicalPath, 'utf8'));
  const candidates = allObjects(payload)
    .filter((value) => {
      const status = String(value.status ?? value.state ?? '').toLowerCase();
      return !status || ['completed', 'success', 'succeeded', 'available'].includes(status);
    })
    .map(candidateTimestamp)
    .filter(Number.isFinite)
    .sort((a, b) => b - a);
  latestBackupAt = candidates[0] ?? null;
  if (!latestBackupAt) errors.push('no_completed_physical_backup_timestamp');
  if (latestBackupAt && Date.now() - latestBackupAt > maxAgeHours * 3_600_000) {
    errors.push('physical_backup_too_old');
  }
} else if (requirePhysical) {
  errors.push('physical_backup_manifest_missing');
}

for (const [label, filePath] of [['schema', schemaPath], ['data', dataPath]]) {
  if (!filePath || !existsSync(filePath)) {
    errors.push(`${label}_logical_backup_missing`);
    continue;
  }
  if (statSync(filePath).size < 1024) errors.push(`${label}_logical_backup_too_small`);
}

console.log(JSON.stringify({
  ok: errors.length === 0,
  latestPhysicalBackupAt: latestBackupAt ? new Date(latestBackupAt).toISOString() : null,
  logicalSchemaVerified: Boolean(schemaPath) && !errors.includes('schema_logical_backup_too_small'),
  logicalDataVerified: Boolean(dataPath) && !errors.includes('data_logical_backup_too_small'),
  errors,
}, null, 2));
if (errors.length) process.exit(1);
