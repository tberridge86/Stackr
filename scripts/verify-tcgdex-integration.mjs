#!/usr/bin/env node
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createTCGdexClient, refreshCardPricing } from '../backend/lib/tcgdexCatalogue.js';

const requireFromBackend = createRequire(new URL('../backend/package.json', import.meta.url));
const sharp = requireFromBackend('sharp');

function readJson(path) {
  return JSON.parse(fs.readFileSync(new URL(path, import.meta.url), 'utf8'));
}

function hasDependency(pkg, name) {
  return Boolean(pkg.dependencies?.[name] || pkg.devDependencies?.[name]);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function fakeDb() {
  const writes = {
    card_prices: [],
    market_prices: [],
    card_price_checks: [],
    tcg_cards: [],
    card_printings: [],
    pokemon_cards: [],
  };

  return {
    writes,
    from(table) {
      return {
        insert(payload) {
          writes[table] ??= [];
          writes[table].push(payload);
          return Promise.resolve({ data: payload, error: null });
        },
        update(payload) {
          writes[table] ??= [];
          writes[table].push({ update: payload });
          return {
            eq() {
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
      };
    },
  };
}

async function probeImage(url) {
  const response = await fetch(url, {
    headers: { Accept: 'image/webp,image/png,image/jpeg,*/*' },
  });
  const contentType = response.headers.get('content-type') || '';
  let metadata = null;
  if (response.ok && contentType.startsWith('image/')) {
    const buffer = Buffer.from(await response.arrayBuffer());
    metadata = await sharp(buffer).metadata();
  }
  return {
    url,
    status: response.status,
    contentType,
    width: metadata?.width ?? null,
    height: metadata?.height ?? null,
  };
}

const rootPackage = readJson('../package.json');
const backendPackage = readJson('../backend/package.json');

const report = {
  versions: {
    tcgdexSdkInstalled: hasDependency(rootPackage, '@tcgdex/sdk') || hasDependency(backendPackage, '@tcgdex/sdk'),
    expo: rootPackage.dependencies?.expo ?? null,
    reactNative: rootPackage.dependencies?.['react-native'] ?? null,
    backendExpo: backendPackage.dependencies?.expo ?? null,
    backendReactNative: backendPackage.dependencies?.['react-native'] ?? null,
  },
  provider: {},
  images: [],
  pricing: {},
  database: {
    supabaseUrl: process.env.SUPABASE_URL ? 'present' : 'missing',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'present' : 'missing',
    liveHealth: process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? 'available' : 'skipped',
  },
};

assert(report.versions.tcgdexSdkInstalled === false, 'Expected TCGdex SDK to be absent; StackR uses REST.');
assert(report.versions.expo === '~54.0.36', `Unexpected Expo version ${report.versions.expo}`);
assert(report.versions.reactNative === '0.81.5', `Unexpected React Native version ${report.versions.reactNative}`);

const english = createTCGdexClient('en');
const japanese = createTCGdexClient('ja');
const [baseSet, jp151] = await Promise.all([
  english.set('base1'),
  japanese.set('sv2a'),
]);

report.provider.englishBaseSet = {
  name: baseSet?.name,
  cards: baseSet?.cards?.length ?? 0,
  firstCard: baseSet?.cards?.[0]?.id ?? null,
};
report.provider.japanese151 = {
  name: jp151?.name,
  cards: jp151?.cards?.length ?? 0,
  firstCard: jp151?.cards?.[0]?.id ?? null,
};

assert(report.provider.englishBaseSet.cards === 102, 'English Base Set should report 102 cards.');
assert(report.provider.japanese151.cards === 210, 'Japanese 151 should report 210 cards.');

const [englishCard, japaneseCard] = await Promise.all([
  english.card('base1-1'),
  japanese.card('SV2a-025'),
]);

assert(englishCard?.image?.includes('/en/'), 'English card image base should use the English namespace.');
assert(japaneseCard?.image?.includes('/ja/'), 'Japanese card image base should use the Japanese namespace.');
assert(englishCard?.pricing, 'English sample card should expose pricing.');
assert(japaneseCard?.pricing, 'Japanese sample card should expose pricing.');

report.images.push(await probeImage(`${englishCard.image}/high.webp`));
report.images.push(await probeImage(`${englishCard.image}/high.png`));
report.images.push(await probeImage(`${japaneseCard.image}/high.webp`));
report.images.push(await probeImage(`${japaneseCard.image}/high.png`));

for (const image of report.images) {
  assert(image.status === 200, `Expected image ${image.url} to load.`);
  assert(String(image.contentType).startsWith('image/'), `Expected ${image.url} to return image content.`);
  assert(Number(image.width) >= 120 && Number(image.height) >= 160, `Expected ${image.url} to meet minimum dimensions.`);
}

const englishDb = fakeDb();
const englishPrice = await refreshCardPricing(englishDb, {
  ...englishCard,
  stackrCardId: englishCard.id,
  providerCardId: englishCard.id,
  language: 'en',
});
const japaneseDb = fakeDb();
const japanesePrice = await refreshCardPricing(japaneseDb, {
  ...japaneseCard,
  stackrCardId: `ja:${japaneseCard.id}`,
  providerCardId: japaneseCard.id,
  language: 'ja',
});

report.pricing.english = {
  status: englishPrice.status,
  rows: englishDb.writes.card_prices[0]?.length ?? 0,
  providers: [...new Set((englishDb.writes.card_prices[0] ?? []).map((row) => row.provider))],
};
report.pricing.japanese = {
  status: japanesePrice.status,
  rows: japaneseDb.writes.card_prices[0]?.length ?? 0,
  providers: [...new Set((japaneseDb.writes.card_prices[0] ?? []).map((row) => row.provider))],
};

assert(['priced', 'partially_priced'].includes(report.pricing.english.status), 'English pricing should resolve.');
assert(['priced', 'partially_priced'].includes(report.pricing.japanese.status), 'Japanese pricing should resolve.');
assert(report.pricing.english.providers.some((provider) => provider.includes('tcgplayer') || provider.includes('cardmarket')), 'English pricing should use mapped provider data.');
assert(report.pricing.japanese.providers.every((provider) => provider !== 'tcgdex_tcgplayer'), 'Japanese pricing should not use English TCGplayer rows.');

console.log(JSON.stringify(report, null, 2));
