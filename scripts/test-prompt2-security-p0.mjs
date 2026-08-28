import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const emergency = read('supabase/manual/prompt2_emergency_profile_authority_containment.sql');
const cutover = read('supabase/manual/prompt2_trusted_admin_claim_cutover.sql');
const tradeNotifications = read(
  'supabase/manual/prompt2_trade_notification_write_containment.sql',
);

assert.match(emergency, /revoke all on table public\.profiles from public, anon, authenticated/i);
assert.match(emergency, /has_column_privilege\('authenticated', 'public\.profiles', 'role', 'update'\)/i);
assert.match(emergency, /new\.role is distinct from old\.role/i);
assert.match(emergency, /new\.stripe_account_id is distinct from old\.stripe_account_id/i);
assert.doesNotMatch(
  emergency.match(/grant update \(([\s\S]+?)\) on table public\.profiles to authenticated/i)?.[1] ?? '',
  /\b(?:id|email|role|stripe_account_id|created_at)\b/i,
);

assert.match(cutover, /raw_app_meta_data\s*->>\s*'stackr_admin'/i);
assert.doesNotMatch(cutover, /raw_user_meta_data|user_metadata/i);
assert.match(cutover, /no trusted admin claim exists/i);
assert.match(cutover, /profile admin lacks trusted claim/i);
assert.match(cutover, /create or replace function public\.is_admin\(\)[\s\S]+security invoker/i);
assert.match(cutover, /revoke all on function public\.admin_binder_directory\(\) from public, anon/i);

assert.match(tradeNotifications, /prompt2_trade_state_frozen/i);
assert.match(tradeNotifications, /before insert or update or delete/i);
assert.match(tradeNotifications, /before truncate/i);
assert.match(
  tradeNotifications,
  /revoke all on function public\.accept_trade_offer\(uuid\)[\s\S]+from public, anon, authenticated, service_role/i,
);
assert.match(tradeNotifications, /grant update \(read\) on table public\.notifications to authenticated/i);
assert.match(tradeNotifications, /with check \(\(select auth\.uid\(\)\) = user_id\)/i);
assert.doesNotMatch(
  tradeNotifications,
  /grant (?:insert|all)[^;]*on table public\.notifications to authenticated/i,
);

for (const route of [
  'backend/routes/recognitionFeedback.js',
  'backend/routes/recognitionShadowMode.js',
  'backend/routes/scanLab.js',
]) {
  const source = read(route);
  assert.match(source, /hasTrustedStackrAdminClaim\(/, route);
  assert.doesNotMatch(source, /from\(['"]profiles['"]\)[\s\S]{0,160}select\(['"]id, role['"]\)/, route);
}

console.log('Prompt 2 security P0 source contract passed.');
