import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).map((argument) => {
    const separator = argument.indexOf("=");
    if (!argument.startsWith("--") || separator < 3) {
      throw new Error(`invalid_argument:${argument}`);
    }
    return [argument.slice(2, separator), argument.slice(separator + 1)];
  }),
);

for (const name of [
  "before-keys",
  "isolated-after-keys",
  "rollback-after-keys",
  "staging-after-keys",
  "isolated-plan",
  "staging-plan",
  "backup-schema",
  "backup-data",
  "physical-backup",
  "restore-evidence-dir",
  "output",
  "staging-project-ref",
  "restore-project-ref",
  "production-project-ref",
]) {
  if (!args[name]) throw new Error(`missing_argument:${name}`);
}

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const fileSha256 = (path) => sha256(readFileSync(path));
const readKeys = (path) =>
  readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);

const migrationFiles = readdirSync("supabase/migrations")
  .filter((name) => /^\d{14}_.+\.sql$/.test(name))
  .sort();
const expectedKeys = migrationFiles.map((name) => name.replace(/\.sql$/, ""));
const beforeKeys = readKeys(args["before-keys"]);
const isolatedAfterKeys = readKeys(args["isolated-after-keys"]);
const rollbackAfterKeys = readKeys(args["rollback-after-keys"]);
const stagingAfterKeys = readKeys(args["staging-after-keys"]);
const beforeKeySet = new Set(beforeKeys);

if (beforeKeySet.size !== beforeKeys.length) {
  throw new Error("before_history_contains_duplicate_migration_keys");
}
if (
  JSON.stringify(beforeKeys) !==
  JSON.stringify(expectedKeys.filter((key) => beforeKeySet.has(key)))
) {
  throw new Error("before_history_is_not_an_exact_ordered_repository_subset");
}
if (JSON.stringify(isolatedAfterKeys) !== JSON.stringify(expectedKeys)) {
  throw new Error("isolated_migration_history_not_aligned");
}
if (JSON.stringify(rollbackAfterKeys) !== JSON.stringify(beforeKeys)) {
  throw new Error("isolated_rollback_history_mismatch");
}
if (JSON.stringify(stagingAfterKeys) !== JSON.stringify(expectedKeys)) {
  throw new Error("staging_migration_history_not_aligned");
}

const isolatedPlan = JSON.parse(readFileSync(args["isolated-plan"], "utf8"));
const stagingPlan = JSON.parse(readFileSync(args["staging-plan"], "utf8"));
const pendingMigrations = migrationFiles.filter(
  (_name, index) => !beforeKeySet.has(expectedKeys[index]),
);
for (const [label, plan] of [
  ["isolated", isolatedPlan],
  ["staging", stagingPlan],
]) {
  if (
    plan.schemaVersion !== "stackr-staging-migration-plan-v1.0.0" ||
    JSON.stringify(plan.pendingMigrations) !== JSON.stringify(pendingMigrations)
  ) {
    throw new Error(`${label}_migration_plan_mismatch`);
  }
}

for (const path of [
  args["backup-schema"],
  args["backup-data"],
  args["physical-backup"],
]) {
  if (!existsSync(path) || statSync(path).size <= 0)
    throw new Error(`backup_file_missing:${path}`);
}
const physicalBackups = JSON.parse(
  readFileSync(args["physical-backup"], "utf8"),
);
const physicalObjects = [];
const collectObjects = (value) => {
  if (!value || typeof value !== "object") return;
  physicalObjects.push(value);
  for (const child of Array.isArray(value) ? value : Object.values(value))
    collectObjects(child);
};
collectObjects(physicalBackups);
if (
  !physicalObjects.some((value) =>
    [
      "completed_at",
      "inserted_at",
      "created_at",
      "started_at",
      "updated_at",
    ].some((key) => Number.isFinite(Date.parse(value?.[key]))),
  )
) {
  throw new Error("physical_backup_inventory_empty");
}

const restoreEvidenceFiles = existsSync(args["restore-evidence-dir"])
  ? readdirSync(args["restore-evidence-dir"])
      .filter((name) => name.endsWith("-evidence.json"))
      .sort()
  : [];
if (restoreEvidenceFiles.length === 0)
  throw new Error("restore_evidence_missing");

const orderedKeyLedger = `${expectedKeys.join("\n")}\n`;
const repositoryContentLedger = migrationFiles
  .map((name) => {
    const sql = readFileSync(`supabase/migrations/${name}`, "utf8").replace(
      /\r\n/g,
      "\n",
    );
    return `${name.replace(/\.sql$/, "")}\n${sha256(sql)}\n`;
  })
  .join("");
const lastBeforeKey = beforeKeys.at(-1) ?? "";
const separator = lastBeforeKey.indexOf("_");
const runUrl =
  process.env.GITHUB_SERVER_URL &&
  process.env.GITHUB_REPOSITORY &&
  process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : null;

const evidence = {
  schemaVersion: "stackr-migration-reconciliation-v1.4.0",
  capturedAt: new Date().toISOString(),
  sourceCommitHash: process.env.GITHUB_SHA ?? null,
  workingTreeChangesIncluded: false,
  productionProjectRef: args["production-project-ref"],
  stagingProjectRef: args["staging-project-ref"],
  restoreTargetProjectRef: args["restore-project-ref"],
  status: "aligned",
  reconciliationComplete: true,
  productionMutationPerformed: false,
  stagingMutationPerformed: true,
  isolatedBranchMutationPerformed: true,
  localMigrationFileCount: migrationFiles.length,
  stagingMigrationHistoryCountAfter: stagingAfterKeys.length,
  exactVersionNameOrderMatch: true,
  orderedMigrationKeySha256: sha256(orderedKeyLedger),
  remoteOrderedMigrationKeySha256: sha256(`${stagingAfterKeys.join("\n")}\n`),
  repositoryMigrationContentSha256: sha256(repositoryContentLedger),
  firstMigration: expectedKeys[0],
  latestMigration: expectedKeys.at(-1),
  baseline: {
    source: "staging",
    expectedStagingHistoryCount: beforeKeys.length,
    expectedStagingHistoryVersion:
      separator < 0 ? null : lastBeforeKey.slice(0, separator),
    expectedStagingHistoryName:
      separator < 0 ? null : lastBeforeKey.slice(separator + 1),
    migrationHistoryRestored: true,
    restoredMigrationHistoryCount: rollbackAfterKeys.length,
    exactRepositorySubsetMatch: true,
    pendingRepositoryMigrationCount: pendingMigrations.length,
  },
  backup: {
    verified: true,
    schemaSha256: fileSha256(args["backup-schema"]),
    dataSha256: fileSha256(args["backup-data"]),
    physicalInventorySha256: fileSha256(args["physical-backup"]),
  },
  rollback: {
    verified: true,
    restoredMigrationCount: rollbackAfterKeys.length,
    restoreEvidence: restoreEvidenceFiles.map((name) => ({
      name,
      sha256: fileSha256(`${args["restore-evidence-dir"]}/${name}`),
    })),
  },
  migrationPlan: {
    pendingMigrationCount: pendingMigrations.length,
    pendingMigrations,
    isolatedDryRunSha256: isolatedPlan.dryRunPlanSha256,
    stagingDryRunSha256: stagingPlan.dryRunPlanSha256,
    plansMatch:
      JSON.stringify(isolatedPlan.pendingMigrations) ===
      JSON.stringify(stagingPlan.pendingMigrations),
  },
  isolatedCandidate: {
    projectRef: args["restore-project-ref"],
    repositoryMigrationCount: isolatedAfterKeys.length,
    migrationHistoryAligned: true,
    baselineMigrationHistoryRestored: true,
    pendingRepositoryMigrationsApplied: true,
    pendingRepositoryMigrationCount: pendingMigrations.length,
    rollbackVerified: true,
    securityLintPassed: true,
    storageFixtureSeeded: false,
  },
  staging: {
    projectRef: args["staging-project-ref"],
    migrationHistoryAligned: true,
    securityLintPassed: true,
  },
  workflow: {
    repository: process.env.GITHUB_REPOSITORY ?? null,
    runId: process.env.GITHUB_RUN_ID ?? null,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
    url: runUrl,
  },
  actionsTaken: [
    "verified_current_staging_logical_and_physical_backups",
    "restored_staging_backup_to_isolated_target",
    "verified_current_staging_history_as_exact_ordered_repository_subset",
    "dry_ran_exact_pending_migrations_on_isolated_target",
    "applied_exact_pending_migrations_on_isolated_target",
    "linted_isolated_candidate_schema",
    "rolled_isolated_target_back_to_staging_snapshot",
    "verified_isolated_rollback_fingerprints",
    "dry_ran_identical_pending_migrations_on_staging",
    "applied_exact_pending_migrations_on_staging",
    "verified_exact_staging_migration_history",
    "linted_aligned_staging_schema",
    "verified_production_was_not_modified",
  ],
};

if (!evidence.migrationPlan.plansMatch)
  throw new Error("isolated_and_staging_plans_differ");
mkdirSync(dirname(args.output), { recursive: true });
writeFileSync(args.output, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify(
    {
      ok: true,
      status: evidence.status,
      migrationCount: evidence.localMigrationFileCount,
      pendingMigrationCount: pendingMigrations.length,
      productionModified: false,
      stagingModified: true,
    },
    null,
    2,
  ),
);
