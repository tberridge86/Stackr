import assert from 'node:assert/strict';
import { resolvePricingV2SupabaseTarget } from './pricing-v2-supabase-target.mjs';

const productionRef = 'oakdbbzdqwurpjnoqhmu';
const baseEnvironment = {
  STACKR_EXPECTED_SUPABASE_PROJECT_REF: productionRef,
  SUPABASE_URL: `https://${productionRef}.supabase.co`,
};

assert.deepEqual(resolvePricingV2SupabaseTarget(baseEnvironment), {
  projectRef: productionRef,
  url: `https://${productionRef}.supabase.co`,
});

for (const [label, environment, message] of [
  ['missing expected ref', { SUPABASE_URL: baseEnvironment.SUPABASE_URL }, /EXPECTED_SUPABASE_PROJECT_REF/],
  ['missing URL', { STACKR_EXPECTED_SUPABASE_PROJECT_REF: productionRef }, /SUPABASE_URL is required/],
  ['wrong project', { ...baseEnvironment, SUPABASE_URL: 'https://lmwfhvexfcoyeuoyrlco.supabase.co' }, /must exactly target/],
  ['custom host', { ...baseEnvironment, SUPABASE_URL: 'https://supabase.example.test' }, /must exactly target/],
  ['unsafe URL path', { ...baseEnvironment, SUPABASE_URL: `${baseEnvironment.SUPABASE_URL}/rest/v1` }, /must exactly target/],
  ['non HTTPS URL', { ...baseEnvironment, SUPABASE_URL: `http://${productionRef}.supabase.co` }, /must exactly target/],
]) {
  assert.throws(
    () => resolvePricingV2SupabaseTarget(environment),
    message,
    `${label} must fail closed`,
  );
}

console.log('Pricing V2 Supabase target tests passed.');
