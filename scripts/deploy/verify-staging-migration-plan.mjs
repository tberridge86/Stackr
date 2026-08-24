import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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
  "plan",
  "before-keys",
  "output",
  "target-project-ref",
  "expected-count",
]) {
  if (!args[name]) throw new Error(`missing_argument:${name}`);
}

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const readKeys = (path) =>
  readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);

const expectedCount = Number(args["expected-count"]);
if (!Number.isSafeInteger(expectedCount) || expectedCount < 1) {
  throw new Error("invalid_expected_count");
}

const migrationFiles = readdirSync("supabase/migrations")
  .filter((name) => /^\d{14}_.+\.sql$/.test(name))
  .sort();
const migrationKeys = migrationFiles.map((name) => name.replace(/\.sql$/, ""));
const beforeKeys = readKeys(args["before-keys"]);

if (
  JSON.stringify(beforeKeys) !==
  JSON.stringify(migrationKeys.slice(0, beforeKeys.length))
) {
  throw new Error("staging_history_is_not_an_exact_repository_prefix");
}

const pendingMigrations = migrationFiles.slice(beforeKeys.length);
if (pendingMigrations.length !== expectedCount) {
  throw new Error(
    `unexpected_pending_migration_count:${pendingMigrations.length}`,
  );
}

const rawPlan = readFileSync(args.plan, "utf8");
const cleanPlan = rawPlan.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
const plannedMigrations = [
  ...new Set(
    [...cleanPlan.matchAll(/\b(\d{14}_[A-Za-z0-9_]+\.sql)\b/g)].map(
      (match) => match[1],
    ),
  ),
];

if (JSON.stringify(plannedMigrations) !== JSON.stringify(pendingMigrations)) {
  throw new Error(`unexpected_migration_plan:${plannedMigrations.join(",")}`);
}

const manifest = {
  schemaVersion: "stackr-staging-migration-plan-v1.0.0",
  generatedAt: new Date().toISOString(),
  sourceCommitHash: process.env.GITHUB_SHA ?? null,
  targetProjectRef: args["target-project-ref"],
  repositoryMigrationCount: migrationFiles.length,
  beforeMigrationCount: beforeKeys.length,
  pendingMigrationCount: pendingMigrations.length,
  pendingMigrations,
  beforeOrderedKeySha256: sha256(`${beforeKeys.join("\n")}\n`),
  repositoryOrderedKeySha256: sha256(`${migrationKeys.join("\n")}\n`),
  dryRunPlanSha256: sha256(rawPlan.replace(/\r\n/g, "\n")),
};

mkdirSync(dirname(args.output), { recursive: true });
writeFileSync(args.output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ok: true, ...manifest }, null, 2));
