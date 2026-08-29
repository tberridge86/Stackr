import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function main() {
  const [components, marketScreen] = await Promise.all([
    readFile('components/market/MarketComponents.tsx', 'utf8'),
    readFile('features/market/MarketTabScreen.tsx', 'utf8'),
  ]);

  assert.match(
    marketScreen,
    /price:\s*listing\.asking_price/,
    'Marketplace cards must receive the seller asking price',
  );
  assert.match(
    components,
    /badge: 'Offers only',\s*primary: price \?\? 'Offers invited',/,
    'A buy listing must show its asking price instead of replacing it with offers-only copy',
  );
  assert.match(
    components,
    /primary: price \?\? 'Offers invited',[\s\S]*?state: 'Make offer'/,
    'Showing the asking price must not bypass the offer-only commerce lock',
  );
  assert.doesNotMatch(
    components,
    /case 'buy':\s*return \{ label: 'For sale'/,
    'Buy cards must not imply that direct checkout is enabled',
  );

  console.log('Marketplace listing-card pricing checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
