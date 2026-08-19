import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const read = (file: string) => readFile(path.join(root, file), 'utf8');

async function main() {
  const [
    theme,
    routes,
    appConfig,
    rootLayout,
    tabLayout,
    home,
    collection,
    scanner,
    market,
  ] = await Promise.all([
    read('lib/theme.ts'),
    read('lib/routes.ts'),
    read('app.json'),
    read('app/_layout.tsx'),
    read('app/(tabs)/_layout.tsx'),
    read('features/home/HubScreen.tsx'),
    read('app/(tabs)/binder.tsx'),
    read('features/scan/ScanScreen.tsx'),
    read('features/market/MarketTabScreen.tsx'),
  ]);

  const requiredTokens = [
    '#FFFFFF',
    '#F7F3FF',
    '#EEE7FF',
    '#07145F',
    '#36306F',
    '#716BA8',
    '#E8E1FF',
    '#6938F5',
    '#FFBE35',
  ];
  for (const token of requiredTokens) {
    assert.match(theme, new RegExp(token.replace('#', '\\#'), 'i'), `Missing approved StackR colour token ${token}`);
  }

  const config = JSON.parse(appConfig);
  assert.equal(config.expo?.name, 'Stackr', 'Rendered application name must remain Stackr');
  assert.equal(config.expo?.scheme, 'stackr', 'Deep-link scheme must remain stackr');
  assert.equal(config.expo?.userInterfaceStyle, 'light', 'StackR Rev 2 remains light-only until separately approved');
  assert.match(String(config.expo?.icon ?? ''), /assets\/rev2\/01-brand\/app\/icon\.png$/);
  assert.match(JSON.stringify(config.expo?.plugins ?? []), /splash-ultra-hd\.png/);

  const collectorLabels = [...routes.matchAll(/\{ key: '(home|collection|scan|market|search)', label: '([^']+)'/g)]
    .map((match) => match[2]);
  assert.deepEqual(
    collectorLabels,
    ['Home', 'Collection', 'Scan', 'The Market', 'Search'],
    'Collector navigation changed from the approved five-item order',
  );

  const sellerLabels = [...routes.matchAll(/\{ key: '(dashboard|inventory|scan|listings)', label: '([^']+)'/g)]
    .map((match) => match[2]);
  assert.deepEqual(
    sellerLabels,
    ['Home', 'Inventory', 'Scan', 'The Market'],
    'Seller navigation changed from the approved four-item order',
  );

  assert.match(tabLayout, /tabBarStyle:\s*\{\s*display:\s*'none'\s*\}/, 'Native tab bar must remain hidden behind the controlled StackR shell');
  for (const hiddenRoute of ['profile', 'trade', 'explore', 'pokedex']) {
    assert.match(tabLayout, new RegExp(`name="${hiddenRoute}"[\\s\\S]*?href:\\s*null`), `${hiddenRoute} must not silently become a primary tab`);
  }

  assert.match(rootLayout, /function PersistentTabBar\(/, 'Persistent StackR navigation shell is missing');
  assert.match(rootLayout, /pathname\.startsWith\('\/scan'\)/, 'Focused scanner must hide ordinary shell controls');
  assert.match(rootLayout, /pathname\.startsWith\('\/listing'\)/, 'Focused listing creation must hide ordinary shell controls');

  for (const homeContract of [
    'ValueTrackerCard',
    'HomeActionsRow',
    'ContinueBinderCard',
    'HomeOpportunitiesSection',
    'RecentActivitySection',
  ]) {
    assert.match(home, new RegExp(`\\b${homeContract}\\b`), `Home lost required section ${homeContract}`);
  }
  assert.match(home, /stackrBrand\.spelt/, 'Home lost the approved StackR wordmark');
  assert.match(home, /Collect\.\\nTrade\.\\nProtect\./, 'Home lost the approved Collect. Trade. Protect. strapline');

  assert.match(collection, /BinderArtwork/, 'Collection must remain binder-artwork led');
  assert.match(collection, /Discover Sets/, 'Collection set-discovery shortcut disappeared');
  assert.match(collection, /Pok\\u00E9dex/, 'Collection Pokédex shortcut disappeared');
  assert.match(collection, /Duplicates/, 'Collection duplicate shortcut disappeared');
  assert.match(collection, /getBinderProgressPercent/, 'Collection lost binder completion logic');

  assert.match(scanner, /one central card guide|CARD_ASPECT_RATIO|cardFrame/i, 'Scanner lost the card-first capture guide');
  assert.match(scanner, /scannerFrameReady/, 'Scanner ready-state haptic is not embedded');
  assert.match(scanner, /scannerCaptureLocked/, 'Scanner capture-lock haptic is not embedded');
  assert.match(scanner, /scannerExactMatch/, 'Scanner exact-match haptic is not embedded');
  assert.match(scanner, /scannerAmbiguous/, 'Scanner ambiguous-state warning haptic is not embedded');
  assert.match(scanner, /Manual search/, 'Scanner lost its in-context manual fallback');

  for (const marketContract of [
    'MarketHeader',
    'MarketModeSelector',
    'MarketSearch',
    'MarketFilterSheet',
    'MarketListingCard',
  ]) {
    assert.match(market, new RegExp(`\\b${marketContract}\\b`), `Market lost required component ${marketContract}`);
  }
  assert.match(market, /Seller photo/, 'Market must distinguish seller imagery from catalogue imagery');
  assert.match(market, /Catalogue image/, 'Market must retain explicit catalogue-image labelling');

  console.log(JSON.stringify({
    ok: true,
    contract: 'stackr-visual-source-of-truth-2026-06-16',
    checked: {
      brandTokens: requiredTokens.length,
      collectorNavigation: collectorLabels,
      sellerNavigation: sellerLabels,
      screens: ['home', 'collection', 'scanner', 'market'],
    },
    note: 'This is a source contract, not rendered screenshot approval.',
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
