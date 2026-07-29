import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20260729055239_critical_security_containment.sql');
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

console.log('Critical security containment contract passed.');
