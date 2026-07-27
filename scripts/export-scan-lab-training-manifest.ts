import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  buildScanLabTrainingManifest,
  type ScanLabReviewedCaptureRow,
} from '../lib/scanLabManifest';

const DEFAULT_OUTPUT = path.join('ml', 'data_manifests', 'scan-lab-reviewed-training-manifest.json');

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function parseOutputArg() {
  const index = process.argv.findIndex((arg) => arg === '--output');
  if (index >= 0) return process.argv[index + 1] ?? DEFAULT_OUTPUT;
  return DEFAULT_OUTPUT;
}

async function main() {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY is required.');
  }

  const outputPath = parseOutputArg();
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await supabase
    .from('scan_lab_captures')
    .select(`
      id,
      created_by,
      physical_card_session_id,
      captured_at,
      expected_identity,
      user_confirmed_identity,
      review_status,
      label_verification_status,
      original_photo_storage_path,
      rectified_card_storage_path,
      original_photo_checksum_sha256,
      rectified_card_checksum_sha256,
      image_upload_consent,
      image_upload_status,
      deleted_at,
      capture_quality,
      ocr_evidence,
      rectification,
      device_info,
      lighting_category,
      sleeve_state,
      holder_state,
      card_side
    `)
    .in('label_verification_status', ['reviewed', 'verified'])
    .is('deleted_at', null);

  if (error) throw error;

  const manifest = buildScanLabTrainingManifest((data ?? []) as ScanLabReviewedCaptureRow[]);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    outputPath,
    examples: manifest.examples.length,
    rejectedRows: manifest.rejectedRows.length,
    splitCounts: manifest.splitCounts,
    physicalCardSessionLeakage: manifest.leakageChecks.physicalCardSessionLeakage,
    limitations: manifest.limitations,
  }, null, 2));

  if (manifest.leakageChecks.physicalCardSessionLeakage) {
    throw new Error('Physical-card session leakage detected in Scan Lab manifest.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
