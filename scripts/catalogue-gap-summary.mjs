#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const STAGING_PROJECT_REF = 'lmwfhvexfcoyeuoyrlco';

function number(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percent(complete, total) {
  if (number(total) <= 0) return '100.00%';
  return `${Math.round((number(complete) / number(total)) * 10_000) / 100}%`;
}

function tableCell(value) {
  return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function inventoryMissingDerivatives(inventory) {
  if (inventory?.totals?.storedMissingRequiredDerivatives != null) {
    return number(inventory.totals.storedMissingRequiredDerivatives);
  }
  return Math.max(
    number(inventory?.totals?.withStorageObject) - number(inventory?.totals?.requiredDerivativesReady),
    0,
  );
}

export function validateCatalogueGapSummary(summary) {
  const failures = [];
  if (summary?.target !== 'staging') failures.push('target_must_be_staging');
  if (summary?.stagingProjectRef !== STAGING_PROJECT_REF) failures.push('unexpected_staging_project_ref');
  if (summary?.sourceOfTruth !== 'staging_supabase') failures.push('unexpected_source_of_truth');
  if (summary?.readOnly !== true) failures.push('report_must_be_read_only');
  if (summary?.productionModified !== false) failures.push('production_modified_contract_failed');
  if (!summary?.totals || !Array.isArray(summary?.byLanguage)) failures.push('report_shape_incomplete');
  if (failures.length) throw new Error(`Unsafe or incomplete catalogue gap summary: ${failures.join(', ')}`);
  return summary;
}

export function renderCatalogueGapSummary(input) {
  const summary = validateCatalogueGapSummary(input);
  const totals = summary.totals;
  const inventory = summary.cardImageInventory ?? { totals: {}, groups: [] };
  const groupRows = Array.isArray(inventory.groups) ? inventory.groups : [];
  const lines = [
    '# StackR catalogue gap report',
    '',
    `Generated ${summary.generatedAt ?? 'unknown'} from canonical staging \`${STAGING_PROJECT_REF}\`. This report is read-only; production was not modified.`,
    '',
    '## Action queues',
    '',
    '| Queue | Count | What it means |',
    '|---|---:|---|',
    `| Group A — exact approved image candidate | ${number(totals.exactApprovedImageCandidates)} | Safe first queue for bounded mirroring or linking after review. |`,
    `| Group B — other-language same artwork | ${number(totals.sameArtworkReferences)} | Needs native-language decision; do not silently substitute. |`,
    `| Group C — scan acquisition | ${number(totals.scanAcquisitionQueue)} | No approved provider candidate; acquisition is required. |`,
    `| Missing provider identities | ${number(totals.missingCardRecordRows)} | Raw provider identity exists but no canonical catalogue row is stored. |`,
    `| Missing required variants | ${number(totals.missingRequiredVariants)} | Canonical variant work remains. |`,
    `| Missing set art | ${number(totals.missingSetArt)} | Logo or symbol evidence remains. |`,
    `| Open conflicts | ${number(totals.conflicts)} | Identity or provider conflicts need resolution. |`,
    `| Rights blocked | ${number(totals.rightsBlocked)} | Asset cannot be made public until its rights state changes. |`,
    `| Stored images missing one or more required derivatives | ${inventoryMissingDerivatives(inventory)} | Repairable from controlled storage without fetching a new provider image. |`,
    '',
    '## Four-language coverage',
    '',
    '| Language | Sets | Metadata | Native images | Missing images | Conflicts |',
    '|---|---:|---:|---:|---:|---:|',
  ];

  for (const row of summary.byLanguage) {
    const expectedImages = number(row.exactNativeImages) + number(row.missingExactNativeImages);
    lines.push(`| ${tableCell(row.language)} | ${number(row.sets)} | ${percent(row.storedCardRecords, row.expectedCards)} | ${percent(row.exactNativeImages, expectedImages)} | ${number(row.missingExactNativeImages)} | ${number(row.conflicts)} |`);
  }

  lines.push(
    '',
    '## Card-image delivery inventory',
    '',
    `Active image assets in scope: **${number(inventory?.totals?.assets)}**; controlled storage objects: **${number(inventory?.totals?.withStorageObject)}**; content hashes: **${number(inventory?.totals?.withContentSha256)}**; all three required derivatives ready: **${number(inventory?.totals?.requiredDerivativesReady)}**.`,
    '',
    '| Provider | Storage | Unavailable reason | Assets | Stored | Hashed | Grid | Search | Detail | Fully ready |',
    '|---|---|---|---:|---:|---:|---:|---:|---:|---:|',
  );
  for (const row of groupRows.slice(0, 20)) {
    lines.push(`| ${tableCell(row.provider)} | ${tableCell(row.storageProvider)} | ${tableCell(row.unavailableReason)} | ${number(row.assets)} | ${number(row.withStorageObject)} | ${number(row.withContentSha256)} | ${number(row.derivativeRoleCounts?.['card-grid'])} | ${number(row.derivativeRoleCounts?.['search-result'])} | ${number(row.derivativeRoleCounts?.['detail-page'])} | ${number(row.requiredDerivativesReady)} |`);
  }
  if (groupRows.length > 20) {
    lines.push('', `_Showing the 20 largest inventory groups. All ${groupRows.length} groups are preserved in \`summary.json\`._`);
  }

  lines.push(
    '',
    `PikaQian coverage rows: **${number(summary.providerReports?.pikaqianCoverageRows)}**. Full CSV queues, conflicts, set art, PikaQian coverage and JSON inventory are attached to the workflow run.`,
    '',
  );
  return `${lines.join('\n')}\n`;
}

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((entry) => entry.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function main() {
  const reportDir = resolve(arg('report-dir', 'reports/catalogue/actionable-gap-report'));
  const output = resolve(arg('output', `${reportDir}/action-summary.md`));
  const summary = JSON.parse(readFileSync(resolve(reportDir, 'summary.json'), 'utf8'));
  writeFileSync(output, renderCatalogueGapSummary(summary), 'utf8');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
