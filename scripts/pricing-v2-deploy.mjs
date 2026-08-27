const canonicalWorkflowUrl =
  'https://github.com/tberridge86/Stackr/actions/workflows/deploy-production.yml';
const planOnly = process.argv.includes('--plan');

const handoff = {
  ok: false,
  retired: true,
  productionMutationPerformed: false,
  reason: 'manual_pricing_v2_production_deploy_retired',
  replacement: {
    workflow: '.github/workflows/deploy-production.yml',
    url: canonicalWorkflowUrl,
    requiredRef: 'main',
    gate0Defaults: {
      apply_migrations: false,
      publish_mobile_update: false,
      promote_gateway: false,
    },
  },
};

console.log(JSON.stringify(handoff, null, 2));
console.log(
  'Pricing V2 production writes must be reviewed and incorporated into the canonical production deployment before they can run.'
);

if (planOnly) {
  console.log('Plan mode completed without reading credentials, calling providers, or writing data.');
} else {
  console.error(
    `Retired command blocked. Use the canonical production workflow: ${canonicalWorkflowUrl}`
  );
  process.exitCode = 1;
}
