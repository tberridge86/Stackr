import { fetchTcgcsvUiCardPricesForSet } from '../lib/pricing';

function formatCardLine(card: {
  productId: number;
  name: string;
  number: string | null;
  variants: {
    subTypeName: string;
    marketPrice: number | null;
    midPrice: number | null;
    lowPrice: number | null;
  }[];
}) {
  const variantSummary = card.variants
    .map(
      (v) =>
        `${v.subTypeName}[market:${v.marketPrice ?? '-'} mid:${v.midPrice ?? '-'} low:${v.lowPrice ?? '-'}]`
    )
    .join(' | ');

  return `- ${card.name} (${card.number ?? '?'}) [${card.productId}] -> ${variantSummary || 'no variants'}`;
}

async function run() {
  const sets = ['Perfect Order', 'Ascended Heroes'];

  for (const setName of sets) {
    console.log(`\n=== ${setName} (TCGCSV cards-only) ===`);
    const cards = await fetchTcgcsvUiCardPricesForSet(setName);

    console.log(`cards returned: ${cards.length}`);

    const preview = cards.slice(0, 25);
    if (!preview.length) {
      console.log('No card prices found for this set query.');
      continue;
    }

    for (const card of preview) {
      console.log(formatCardLine(card));
    }
  }
}

run().catch((err) => {
  console.error('Failed to check set prices:', err);
  process.exit(1);
});
