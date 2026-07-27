import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { buildRecognitionFeedbackDatasetManifest } from '../lib/recognitionFeedbackCore';

const DEFAULT_OUTPUT_DIR = path.join('ml', 'data_manifests');

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function parseArg(name: string) {
  const index = process.argv.findIndex((arg) => arg === name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function datasetVersion() {
  return parseArg('--dataset-version')
    ?? `recognition-feedback-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
}

async function main() {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY is required.');
  }

  const version = datasetVersion();
  const outputPath = parseArg('--output')
    ?? path.join(DEFAULT_OUTPUT_DIR, `${version}.json`);
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await supabase
    .from('recognition_feedback_items')
    .select(`
      id,
      anonymous_scan_id,
      feedback_action,
      predicted_identity,
      corrected_identity,
      reviewed_identity,
      review_status,
      user_label_status,
      image_upload_status,
      consent_state,
      rectified_image_storage_path,
      rectified_image_checksum_sha256,
      capture_quality,
      ocr_evidence_summary,
      model_version,
      catalogue_version,
      device_class,
      physical_card_session_id,
      deleted_at,
      created_at
    `)
    .in('review_status', ['approved_identity', 'changed_identity'])
    .in('user_label_status', ['reviewed', 'verified'])
    .is('deleted_at', null);

  if (error) throw error;

  const rows = (data ?? []).map((row: any) => ({
    ...row,
    action: row.feedback_action,
  }));
  const manifest = buildRecognitionFeedbackDatasetManifest(rows, {
    datasetVersion: version,
  });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    outputPath,
    datasetVersion: manifest.datasetVersion,
    examples: manifest.examples.length,
    rejectedRows: manifest.rejectedRows.length,
    splitCounts: manifest.splitCounts,
    physicalCardSessionLeakage: manifest.leakageChecks.physicalCardSessionLeakage,
    deploymentAction: manifest.deploymentAction,
    limitations: manifest.limitations,
  }, null, 2));

  if (manifest.leakageChecks.physicalCardSessionLeakage) {
    throw new Error('Physical-card session leakage detected in recognition-feedback manifest.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
