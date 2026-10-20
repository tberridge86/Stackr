import { getCardFinishMetadata, type CardFinishMetadata } from './cardFinishProfiles';

export type ProfileShowcaseSlot = 'favorite' | 'chase' | 'grail' | 'slab';
export type ProfileShowcaseCard = CardFinishMetadata & {
  id: string;
  setId: string | null;
  name: string;
  setName?: string | null;
  number?: string | null;
  imageUri?: string | null;
  estimatedValueGbp?: number | null;
  showcaseKind?: 'card' | 'graded';
  updatedAt: string;
};
export type ProfileShowcaseState = Partial<Record<ProfileShowcaseSlot, ProfileShowcaseCard>>;

export function normaliseShowcaseState(value: unknown): ProfileShowcaseState {
  if (!value || typeof value !== 'object') return {};
  const input = value as Record<string, unknown>;
  const next: ProfileShowcaseState = {};
  for (const key of ['favorite', 'chase', 'grail', 'slab'] as const) {
    const card = input[key];
    if (!card || typeof card !== 'object') continue;
    const row = card as Partial<ProfileShowcaseCard>;
    if (!row.id || !row.name) continue;
    next[key] = {
      ...getCardFinishMetadata(row),
      id: String(row.id),
      setId: row.setId == null ? null : String(row.setId),
      name: String(row.name),
      setName: row.setName == null ? null : String(row.setName),
      number: row.number == null ? null : String(row.number),
      imageUri: row.imageUri == null ? null : String(row.imageUri),
      estimatedValueGbp: typeof row.estimatedValueGbp === 'number' ? row.estimatedValueGbp : null,
      showcaseKind: row.showcaseKind === 'graded' ? 'graded' : 'card',
      updatedAt: row.updatedAt ? String(row.updatedAt) : new Date().toISOString(),
    };
  }
  return next;
}
