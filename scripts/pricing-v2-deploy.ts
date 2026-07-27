// @ts-nocheck
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function getArg(name: string, fallback = '') {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function splitArg(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function assertSupabaseAccess() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY) return;
  throw new Error(
    'Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY. Run this from the PowerShell window where your Supabase secret is already set.'
  );
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const planOnly = hasFlag('plan');

function runNpmScript(script: string, args: string[] = [], envPatch: Record<string, string> = {}) {
  const commandArgs = ['run', script];
  if (args.length) commandArgs.push('--', ...args);

  console.log(`\n> npm ${commandArgs.join(' ')}`);
  if (planOnly) return;

  const result = spawnSync(npmCommand, commandArgs, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: {
      ...process.env,
      SUPABASE_PROJECT_REF: process.env.SUPABASE_PROJECT_REF || 'oakdbbzdqwurpjnoqhmu',
      PRICING_ENGINE_V2_ENABLED: 'true',
      ...envPatch,
    },
  });

  if (result.status !== 0) {
    throw new Error(`${script} failed with exit code ${result.status ?? 'unknown'}`);
  }
}

function languageArgs(language: string) {
  return language === 'all' ? [] : [`--language=${language}`];
}

function runBackfill({
  language,
  productType,
  limit,
  delayMs,
  dryRun,
  includeActiveListings,
}: {
  language: string;
  productType: string;
  limit: number;
  delayMs: number;
  dryRun: boolean;
  includeActiveListings: boolean;
}) {
  const args = [
    ...languageArgs(language),
    `--productType=${productType}`,
    `--limit=${limit}`,
    `--delayMs=${delayMs}`,
    '--ignore-feature-flag',
  ];
  if (dryRun) args.push('--dry-run');

  runNpmScript('pricing-v2:backfill', args, {
    PRICING_V2_EBAY_ACTIVE_ENABLED: includeActiveListings ? 'true' : 'false',
  });
}

async function run() {
  if (!planOnly) assertSupabaseAccess();

  const stamp = timestampSlug();
  const outputDir = getArg('outputDir', 'docs');
  const languages = splitArg(getArg('languages', 'en,ja,zh-tw,zh-cn,ko'));
  const productTypes = splitArg(getArg('productTypes', 'raw_card,sealed_product'));
  const limitPerLanguage = Math.min(Math.max(Number(getArg('limitPerLanguage', '50000')), 1), 50000);
  const dryRunLimit = Math.min(Math.max(Number(getArg('dryRunLimit', '25')), 1), 1000);
  const compareLimit = Math.min(Math.max(Number(getArg('compareLimit', '1000')), 1), 5000);
  const refreshLimit = Math.min(Math.max(Number(getArg('refreshLimit', '500')), 0), 5000);
  const delayMs = Math.max(Number(getArg('delayMs', '150')), 0);
  const includeActiveListings = hasFlag('include-active-listings');
  const skipDryRun = hasFlag('skip-dry-run');
  const skipTests = hasFlag('skip-tests');

  fs.mkdirSync(path.resolve(outputDir), { recursive: true });

  console.log('Pricing V2 deployment starting');
  if (planOnly) console.log('Plan mode only: no commands will be executed.');
  console.log(JSON.stringify({
    languages,
    productTypes,
    limitPerLanguage,
    delayMs,
    includeActiveListings,
    outputDir,
  }, null, 2));

  if (!skipTests) {
    runNpmScript('test:pricing-v2');
  }

  runNpmScript('pricing-v2:baseline', [
    `--output=${outputDir}/pricing-v2-deploy-baseline-before-${stamp}.md`,
  ]);

  for (const productType of productTypes) {
    for (const language of languages) {
      if (!skipDryRun) {
        runBackfill({
          language,
          productType,
          limit: dryRunLimit,
          delayMs,
          dryRun: true,
          includeActiveListings,
        });
      }

      runBackfill({
        language,
        productType,
        limit: limitPerLanguage,
        delayMs,
        dryRun: false,
        includeActiveListings,
      });
    }
  }

  if (refreshLimit > 0) {
    runNpmScript('pricing-v2:refresh', [
      `--limit=${refreshLimit}`,
      `--delayMs=${delayMs}`,
      '--ignore-feature-flag',
    ], {
      PRICING_V2_EBAY_ACTIVE_ENABLED: includeActiveListings ? 'true' : 'false',
    });
  }

  runNpmScript('pricing-v2:baseline', [
    `--output=${outputDir}/pricing-v2-deploy-baseline-after-${stamp}.md`,
  ]);

  for (const language of languages) {
    if (language === 'all') continue;
    runNpmScript('pricing-v2:compare', [
      `--language=${language}`,
      `--limit=${compareLimit}`,
    ]);
  }

  console.log('\nPricing V2 deployment complete.');
  console.log(`Reports written to ${outputDir}/pricing-v2-deploy-baseline-before-${stamp}.md and ${outputDir}/pricing-v2-deploy-baseline-after-${stamp}.md`);
}

run().catch((error) => {
  console.error('Pricing V2 deployment failed:', error?.message ?? error);
  process.exit(1);
});
