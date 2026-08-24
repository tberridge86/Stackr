import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const temporaryDirectory = mkdtempSync(
  join(tmpdir(), "stackr-staging-migration-release-"),
);
const run = (script, scriptArguments) =>
  spawnSync(process.execPath, [script, ...scriptArguments], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_SHA: "a".repeat(40),
      GITHUB_SERVER_URL: "https://github.com",
      GITHUB_REPOSITORY: "tberridge86/Stackr",
      GITHUB_RUN_ID: "123456",
      GITHUB_RUN_ATTEMPT: "1",
    },
  });

try {
  const migrationFiles = readdirSync("supabase/migrations")
    .filter((name) => /^\d{14}_.+\.sql$/.test(name))
    .sort();
  const pendingCount = 1;
  assert.ok(migrationFiles.length > pendingCount);
  const migrationKeys = migrationFiles.map((name) =>
    name.replace(/\.sql$/, ""),
  );
  const pendingMigrations = [
    "20260813135412_premium_seller_access_boundary.sql",
  ];
  assert.ok(migrationFiles.includes(pendingMigrations[0]));
  assert.notEqual(migrationFiles.at(-1), pendingMigrations[0]);
  const pendingKeySet = new Set(
    pendingMigrations.map((name) => name.replace(/\.sql$/, "")),
  );
  const beforeKeys = migrationKeys.filter((key) => !pendingKeySet.has(key));
  const beforePath = join(temporaryDirectory, "before-keys.txt");
  const allPath = join(temporaryDirectory, "all-keys.txt");
  const rollbackPath = join(temporaryDirectory, "rollback-keys.txt");
  const planPath = join(temporaryDirectory, "plan.txt");
  const isolatedPlanPath = join(temporaryDirectory, "isolated-plan.json");
  const stagingPlanPath = join(temporaryDirectory, "staging-plan.json");
  const schemaPath = join(temporaryDirectory, "schema.sql");
  const dataPath = join(temporaryDirectory, "data.sql");
  const physicalPath = join(temporaryDirectory, "physical.json");
  const restoreEvidencePath = join(
    temporaryDirectory,
    "postgres-restore-evidence.json",
  );
  const evidencePath = join(
    temporaryDirectory,
    "staging-migration-reconciliation-evidence.json",
  );

  writeFileSync(beforePath, `${beforeKeys.join("\n")}\n`);
  writeFileSync(allPath, `${migrationKeys.join("\n")}\n`);
  writeFileSync(rollbackPath, `${beforeKeys.join("\n")}\n`);
  writeFileSync(
    planPath,
    `Would push these migrations:\n${pendingMigrations.join("\n")}\n`,
  );
  writeFileSync(schemaPath, "x".repeat(2048));
  writeFileSync(dataPath, "y".repeat(2048));
  writeFileSync(
    physicalPath,
    JSON.stringify({
      backups: [{ status: "completed", created_at: new Date().toISOString() }],
    }),
  );
  writeFileSync(restoreEvidencePath, JSON.stringify({ status: "verified" }));

  for (const [target, output] of [
    ["krjttpmthxkfsbqksxci", isolatedPlanPath],
    ["lmwfhvexfcoyeuoyrlco", stagingPlanPath],
  ]) {
    const planResult = run("scripts/deploy/verify-staging-migration-plan.mjs", [
      `--plan=${planPath}`,
      `--before-keys=${beforePath}`,
      `--expected-count=${pendingCount}`,
      `--target-project-ref=${target}`,
      `--output=${output}`,
    ]);
    assert.equal(planResult.status, 0, planResult.stderr || planResult.stdout);
  }

  const evidenceResult = run(
    "scripts/deploy/create-staging-migration-release-evidence.mjs",
    [
      `--before-keys=${beforePath}`,
      `--isolated-after-keys=${allPath}`,
      `--rollback-after-keys=${rollbackPath}`,
      `--staging-after-keys=${allPath}`,
      `--isolated-plan=${isolatedPlanPath}`,
      `--staging-plan=${stagingPlanPath}`,
      `--backup-schema=${schemaPath}`,
      `--backup-data=${dataPath}`,
      `--physical-backup=${physicalPath}`,
      `--restore-evidence-dir=${temporaryDirectory}`,
      "--staging-project-ref=lmwfhvexfcoyeuoyrlco",
      "--restore-project-ref=krjttpmthxkfsbqksxci",
      "--production-project-ref=oakdbbzdqwurpjnoqhmu",
      `--output=${evidencePath}`,
    ],
  );
  assert.equal(
    evidenceResult.status,
    0,
    evidenceResult.stderr || evidenceResult.stdout,
  );

  const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  assert.equal(
    evidence.schemaVersion,
    "stackr-migration-reconciliation-v1.4.0",
  );
  assert.equal(evidence.status, "aligned");
  assert.equal(evidence.productionMutationPerformed, false);
  assert.equal(evidence.stagingMutationPerformed, true);
  assert.equal(evidence.rollback.verified, true);
  assert.deepEqual(evidence.migrationPlan.pendingMigrations, pendingMigrations);

  const verifyResult = run(
    "scripts/deploy/verify-staging-migration-reconciliation.mjs",
    [`--evidence=${evidencePath}`, "--require-aligned"],
  );
  assert.equal(
    verifyResult.status,
    0,
    verifyResult.stderr || verifyResult.stdout,
  );
  console.log("Staging migration release evidence tests passed.");
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
