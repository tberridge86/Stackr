import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20260729055239_critical_security_containment.sql');
const legacyCatalogueHardening = read(
  'supabase/migrations/20260730144626_harden_legacy_catalogue_operational_access.sql',
);
const legacyCatalogueRollback = read(
  'supabase/manual/rollback_20260730144626_harden_legacy_catalogue_operational_access.sql',
);
const functionStorageHardening = read(
  'supabase/migrations/20260730145958_harden_function_and_storage_access.sql',
);
const functionStorageRollback = read(
  'supabase/manual/rollback_20260730145958_harden_function_and_storage_access.sql',
);
const profileCutover = read('supabase/manual/finalize_profile_privacy_cutover.sql');

assert.match(migration, /create table if not exists public\.profile_public_directory/i);
const publicDirectoryDefinition = migration.match(
  /create table if not exists public\.profile_public_directory\s*\(([^;]+)\);/i,
)?.[1] ?? '';
for (const privateColumn of ['email', 'expo_push_token', 'role', 'stripe_account_id']) {
  assert.doesNotMatch(publicDirectoryDefinition, new RegExp(`\\b${privateColumn}\\b`, 'i'));
}
assert.doesNotMatch(migration, /drop policy if exists "Public profiles are viewable" on public\.profiles/i);
assert.match(profileCutover, /drop policy if exists "Public profiles are viewable" on public\.profiles/i);
assert.match(profileCutover, /with check \(\(select auth\.uid\(\)\) = id\)/i);
assert.match(profileCutover, /revoke all on table public\.profiles from public, anon, authenticated/i);
assert.doesNotMatch(
  profileCutover.match(/grant update \(([^;]+)\) on public\.profiles to authenticated/i)?.[1] ?? '',
  /\b(?:email|role|stripe_account_id)\b/i,
);

assert.match(migration, /drop policy if exists "Allow authenticated users to read market snapshots"/i);
assert.match(migration, /user_id is null or \(select auth\.uid\(\)\) = user_id/i);

assert.match(migration, /update storage\.buckets[\s\S]+public = false/i);
assert.match(migration, /file_size_limit = 5242880/i);
assert.match(migration, /split_part\(name, '\/', 1\) = \(select auth\.uid\(\)\)::text/i);
assert.match(migration, /owner_id = \(select auth\.uid\(\)\)::text/i);
assert.doesNotMatch(migration, /create policy "Allow public read access to card scans"/i);

const publicProfileConsumers = [
  'features/home/HubScreen.tsx',
  'app/community/profile/[userId].tsx',
  'app/(tabs)/search.tsx',
  'app/(tabs)/community/index.tsx',
  'lib/activity.ts',
  'app/offer/index.tsx',
  'lib/globalSearch.ts',
  'lib/friends.ts',
  'lib/marketplace.ts',
];
for (const file of publicProfileConsumers) {
  assert.match(read(file), /from\('profile_public_directory'\)/, `${file} must use the public-safe directory`);
}
assert.match(read('app/offer/new.tsx'), /from\('profile_public_directory'\)/);

const profileContext = read('components/profile-context.tsx');
assert.match(profileContext, /email: _ignoredEmail/);
assert.match(profileContext, /role: _ignoredRole/);
assert.doesNotMatch(profileContext, /email: user\.email/);

const storage = read('lib/storage.ts');
assert.match(storage, /supabase\.auth\.getUser\(\)/);
assert.match(storage, /`\$\{authData\.user\.id\}\/scan_\$\{Date\.now\(\)\}\.jpg`/);
assert.match(storage, /createSignedUrl\(fileName, 300\)/);
assert.doesNotMatch(storage, /getPublicUrl/);

const backendServer = read('backend/server.js');
assert.match(backendServer, /app\.disable\('x-powered-by'\)/);
assert.match(backendServer, /app\.use\(cors\(\{/);
assert.match(backendServer, /express\.json\(\{ limit: '8mb' \}\)/);
for (const route of [
  '/debug-serpapi',
  '/debug-env',
  '/ebay-rate-limits',
  '/test-ebay-token',
  '/price/debug',
  '/debug-ximilar',
  '/api/sync/set',
]) {
  assert.match(
    backendServer,
    new RegExp(`app\\.get\\('${route.replaceAll('/', '\\/')}', gatewayOriginAuth,`),
    `${route} must require gateway origin authentication`,
  );
}
assert.match(backendServer, /app\.post\('\/api\/fingerprints\/reload', gatewayOriginAuth,/);
assert.doesNotMatch(backendServer, /req\.query\.adminKey/);
assert.doesNotMatch(read('backend/routes/assets.js'), /req\.query\.adminKey/);
assert.doesNotMatch(read('backend/routes/catalogueIngestion.js'), /req\.query\.adminKey/);

for (const view of [
  'catalogue_health',
  'japanese_catalogue_health',
  'tcg_card_printings',
  'tcg_set_cover_images',
]) {
  assert.match(
    legacyCatalogueHardening,
    new RegExp(`alter view public\\.${view}\\s+set \\(security_invoker = true\\)`, 'i'),
    `${view} must run with caller permissions`,
  );
  assert.match(
    legacyCatalogueRollback,
    new RegExp(`alter view public\\.${view}\\s+set \\(security_invoker = false\\)`, 'i'),
    `${view} must have an explicit compatibility rollback`,
  );
}

for (const table of [
  'achievement_coin_rewards',
  'price_refresh_queue',
  'price_refresh_runs',
]) {
  assert.match(
    legacyCatalogueHardening,
    new RegExp(`alter table public\\.${table} enable row level security`, 'i'),
    `${table} must have RLS enabled`,
  );
  assert.match(
    legacyCatalogueHardening,
    new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, 'i'),
    `${table} must not be directly accessible from client roles`,
  );
  assert.match(
    legacyCatalogueHardening,
    new RegExp(`grant select, insert, update, delete on table public\\.${table} to service_role`, 'i'),
    `${table} must remain available to backend workers`,
  );
}

for (const table of [
  'card_images',
  'card_image_checks',
  'card_prices',
  'card_price_checks',
  'catalogue_sync_runs',
]) {
  assert.match(
    legacyCatalogueHardening,
    new RegExp(`create policy "[^"]+"\\s+on public\\.${table}[\\s\\S]+?to authenticated[\\s\\S]+?using \\(\\(select public\\.is_admin\\(\\)\\)\\)`, 'i'),
    `${table} diagnostics must be restricted to authenticated admins`,
  );
}

assert.doesNotMatch(
  legacyCatalogueHardening,
  /create policy[^;]+on public\.(?:achievement_coin_rewards|price_refresh_queue|price_refresh_runs)/i,
  'service-owned operational tables must not gain client RLS policies',
);

for (const signature of [
  'accept_trade_offer\\(uuid\\)',
  'enforce_wanted_card_limit\\(\\)',
  'recalculate_binder_values\\(uuid\\)',
  'set_updated_at\\(\\)',
  'touch_updated_at\\(\\)',
  'trigger_recalculate_binder_values\\(\\)',
  'update_binder_card_prices\\(\\)',
  'touch_scan_lab_capture_updated_at\\(\\)',
  'touch_recognition_feedback_updated_at\\(\\)',
  'touch_recognition_shadow_mode_updated_at\\(\\)',
]) {
  assert.match(
    functionStorageHardening,
    new RegExp(`alter function public\\.${signature}\\s+set search_path = pg_catalog, public, pg_temp`, 'i'),
    `${signature} must have a fixed search path`,
  );
}

assert.match(
  functionStorageHardening,
  /drop policy if exists "Stackr catalogue public assets are readable" on storage\.objects/i,
);
assert.doesNotMatch(functionStorageHardening, /create policy "Stackr catalogue public assets are readable"/i);

for (const signature of [
  'award_achievement_unlock_coins\\(\\)',
  'handle_new_user\\(\\)',
  'prevent_user_feedback_review_field_changes\\(\\)',
  'queue_scanner_feedback_review\\(\\)',
]) {
  assert.match(
    functionStorageHardening,
    new RegExp(`revoke all on function public\\.${signature} from public, anon, authenticated`, 'i'),
    `${signature} must not be callable as a client RPC`,
  );
}

for (const signature of [
  'accept_trade_offer\\(uuid\\)',
  'admin_binder_directory\\(\\)',
  'is_recognition_feedback_reviewer\\(\\)',
  'is_scan_lab_admin\\(\\)',
  'purchase_cosmetic\\(text\\)',
]) {
  assert.match(
    functionStorageHardening,
    new RegExp(`revoke all on function public\\.${signature} from public, anon`, 'i'),
    `${signature} must reject anonymous RPC access`,
  );
  assert.match(
    functionStorageHardening,
    new RegExp(`grant execute on function public\\.${signature} to authenticated, service_role`, 'i'),
    `${signature} must preserve authenticated and backend access`,
  );
}

assert.match(functionStorageRollback, /create policy "Stackr catalogue public assets are readable"/i);

console.log('Critical security containment contract passed.');
