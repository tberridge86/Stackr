type RarityCard = { card?: { rarity?: string | null; raw_data?: any } | null };

const levels = [
  ['common', 'Common', ['common', 'c']],
  ['uncommon', 'Uncommon', ['uncommon', 'u']],
  ['rare', 'Rare', ['rare', 'r']],
  ['holo', 'Holo rare', ['rare holo', 'holo rare', 'holographic rare']],
  ['double', 'Double rare', ['double rare', 'rare double', 'rr']],
  ['triple', 'Triple rare', ['triple rare', 'rrr']],
  ['ultra', 'Ultra rare', ['ultra rare', 'rare ultra', 'full art', 'sr']],
  ['illustration', 'Illustration rare', ['illustration rare', 'rare illustration', 'art rare', 'ar', 'ir']],
  ['special', 'Special illustration rare', ['special illustration rare', 'rare special illustration', 'special art rare', 'sar', 'sir']],
  ['secret', 'Secret rare', ['secret rare', 'rare secret']],
  ['hyper', 'Hyper rare', ['hyper rare', 'rare hyper', 'hr']],
  ['promo', 'Promo', ['promo']],
] as const;

export function binderCardRarity(card: RarityCard): { key: string; label: string } {
  const value = String(card.card?.rarity ?? card.card?.raw_data?.rarity ?? '').trim();
  if (!value) return { key: 'unknown', label: 'Not listed' };
  const normalized = value.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  const level = levels.find(([, , aliases]) => (aliases as readonly string[]).includes(normalized));
  return level ? { key: level[0], label: level[1] } : { key: normalized, label: value };
}

export function binderRarityChoices(cards: readonly RarityCard[]) {
  const entries = new Map<string, { key: string; label: string; count: number }>();
  for (const card of cards) {
    const rarity = binderCardRarity(card);
    const current = entries.get(rarity.key);
    entries.set(rarity.key, { ...rarity, count: (current?.count ?? 0) + 1 });
  }
  const order = (key: string) => {
    const index = levels.findIndex(([level]) => level === key);
    return index < 0 ? levels.length : index;
  };
  return [{ key: 'all', label: 'All rarities', count: cards.length }, ...Array.from(entries.values())
    .sort((a, b) => order(a.key) - order(b.key) || a.label.localeCompare(b.label))];
}
