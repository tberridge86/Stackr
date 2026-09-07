import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/deploy-gateway-privacy.yml', 'utf8');
const runbook = readFileSync('deploy/production-runbook.md', 'utf8');

assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
assert.match(workflow, /group: stackr-production-deployment/);
assert.match(workflow, /environment: production/);
assert.match(workflow, /CLOUDFLARE_ACCOUNT_ID: b4c23b0834cc5a113aa4a98fd904b281/);
assert.match(workflow, /STACKR_BACKEND_URL: https:\/\/pocketvault-production\.up\.railway\.app/);
assert.match(workflow, /STACKR_SUPABASE_URL: https:\/\/oakdbbzdqwurpjnoqhmu\.supabase\.co/);
assert.match(workflow, /test "\$EXPECTED_MAIN_SHA" = '8aed4b2c99bec40ba0fce37e360d552c7074c852'/);
assert.match(workflow, /test "\$PREVIOUS_GATEWAY_VERSION_ID" = 'ab809fc2-d0da-484f-a5b7-908f76013c1d'/);
assert.match(workflow, /test "\$PREVIOUS_GATEWAY_DEPLOYMENT_ID" = '5105e13b-2b9c-4e3f-a2e0-392c2694cb37'/);
assert.match(workflow, /--keep-vars/);
assert.match(workflow, /--secrets-file/);
assert.match(workflow, /--name stackr-api-gateway/);
assert.match(workflow, /BACKEND_ORIGIN_KEY', 'BACKEND_ADMIN_KEY/);
assert.match(workflow, /STACKR_PRICING_ACCESS_MODE:personal/);
assert.match(workflow, /versions deploy[\s\S]*"\$release_tag@100"/);
assert.match(workflow, /Restore exact previous gateway version after a failed privacy release[\s\S]*"\$PREVIOUS_GATEWAY_VERSION_ID@100"/);
assert.match(workflow, /gateway-privacy-smoke\.mjs/);
assert.match(workflow, /test-gateway-privacy-deployment\.mjs/);
assert.doesNotMatch(workflow, /(?:npx|npm).*?(?:railway|supabase@|eas-cli|price-refresh)/i);
assert.doesNotMatch(workflow, /catalogue.*promot|recognition-service/i);
assert.match(runbook, /Gateway-only personal-pricing privacy release/);
assert.match(runbook, /does not create a Worker, namespace, backend service, or staging deployment/);

console.log('Gateway-only privacy deployment guards passed.');
