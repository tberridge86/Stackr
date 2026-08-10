import { supabase } from './supabase';
import { bumpCollectionSummaryVersion } from './collectionSummaryInvalidation';

export const DEFAULT_OWNED_VARIANT = 'normal';
export const DEFAULT_OWNED_CONDITION = 'Near Mint';

export type OwnedCardIdentity = {
  cardId: string;
  setId: string;
  variant?: string | null;
  condition?: string | null;
  gradeCompany?: string | null;
  grade?: string | null;
};

export type OwnedCardRow = {
  id?: string | null;
  user_id?: string | null;
  card_id: string;
  set_id: string;
  variant: string;
  quantity: number;
  condition?: string | null;
  grade_company?: string | null;
  grade?: string | null;
};

const FULL_OWNED_COLUMNS = 'id, user_id, card_id, set_id, variant, quantity, condition, grade_company, grade';
const LEGACY_OWNED_COLUMNS = 'card_id, set_id, variant, quantity';
const FULL_OWNED_CONFLICT = 'user_id,card_id,set_id,variant,condition,grade_company,grade';
const LEGACY_OWNED_CONFLICT = 'user_id,card_id,set_id,variant';
const OWNED_ROWS_PAGE_SIZE = 1000;

function isSchemaCacheError(error: any) {
  const message = String(error?.message ?? '').toLowerCase();
  return error?.code === 'PGRST204'
    || error?.code === 'PGRST205'
    || error?.code === '42703'
    || message.includes('schema cache')
    || message.includes('condition')
    || message.includes('grade_company')
    || message.includes('owned_card_variant_id');
}

export function normalizeOwnedIdentity(input: OwnedCardIdentity) {
  return {
    cardId: input.cardId,
    setId: input.setId,
    variant: input.variant || DEFAULT_OWNED_VARIANT,
    condition: input.condition || DEFAULT_OWNED_CONDITION,
    gradeCompany: input.gradeCompany || '',
    grade: input.grade || '',
  };
}

function normalizeOwnedRow(row: any): OwnedCardRow {
  return {
    id: row.id ?? null,
    user_id: row.user_id ?? null,
    card_id: row.card_id,
    set_id: row.set_id,
    variant: row.variant || DEFAULT_OWNED_VARIANT,
    quantity: Math.max(1, Number(row.quantity ?? 1) || 1),
    condition: row.condition || DEFAULT_OWNED_CONDITION,
    grade_company: row.grade_company || '',
    grade: row.grade || '',
  };
}

async function getCurrentUserId() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  return user?.id ?? null;
}

export async function fetchOwnedCardRows(options?: {
  cardIds?: string[];
  setIds?: string[];
}): Promise<OwnedCardRow[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const buildQuery = (columns: string) => {
    let query = supabase
      .from('user_card_variants')
      .select(columns)
      .eq('user_id', userId);

    const cardIds = [...new Set((options?.cardIds ?? []).filter(Boolean))];
    const setIds = [...new Set((options?.setIds ?? []).filter(Boolean))];
    if (cardIds.length) query = query.in('card_id', cardIds);
    if (setIds.length) query = query.in('set_id', setIds);
    return query;
  };

  const fetchAll = async (columns: string) => {
    const rows: any[] = [];
    for (let from = 0; ; from += OWNED_ROWS_PAGE_SIZE) {
      const to = from + OWNED_ROWS_PAGE_SIZE - 1;
      const { data, error } = await buildQuery(columns).range(from, to);
      if (error) return { data: rows, error };
      rows.push(...(data ?? []));
      if (!data || data.length < OWNED_ROWS_PAGE_SIZE) {
        return { data: rows, error: null };
      }
    }
  };

  let { data, error } = await fetchAll(FULL_OWNED_COLUMNS);
  if (error && isSchemaCacheError(error)) {
    const legacy = await fetchAll(LEGACY_OWNED_COLUMNS);
    data = legacy.data;
    error = legacy.error;
  }
  if (error) throw error;

  return (data ?? []).map(normalizeOwnedRow);
}

export async function findOwnedCardRows(identity: OwnedCardIdentity): Promise<OwnedCardRow[]> {
  const normalized = normalizeOwnedIdentity(identity);
  const rows = await fetchOwnedCardRows({
    cardIds: [normalized.cardId],
    setIds: [normalized.setId],
  });

  return rows.filter((row) =>
    row.card_id === normalized.cardId
    && row.set_id === normalized.setId
    && row.variant === normalized.variant
    && (row.condition || DEFAULT_OWNED_CONDITION) === normalized.condition
    && (row.grade_company || '') === normalized.gradeCompany
    && (row.grade || '') === normalized.grade
  );
}

export async function getOwnedCardQuantity(identity: OwnedCardIdentity): Promise<number> {
  const rows = await findOwnedCardRows(identity);
  return rows.reduce((total, row) => total + Math.max(1, Number(row.quantity ?? 1)), 0);
}

export async function ensureOwnedCardQuantity(
  identity: OwnedCardIdentity,
  options?: {
    minimumQuantity?: number;
    increaseBy?: number;
  }
): Promise<OwnedCardRow | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const normalized = normalizeOwnedIdentity(identity);
  const currentRows = await findOwnedCardRows(identity);
  const current = currentRows[0] ?? null;
  const currentQuantity = current ? Math.max(1, Number(current.quantity ?? 1)) : 0;
  const minimumQuantity = Math.max(1, Math.floor(Number(options?.minimumQuantity ?? 1) || 1));
  const increaseBy = Math.max(0, Math.floor(Number(options?.increaseBy ?? 0) || 0));
  const nextQuantity = increaseBy > 0
    ? Math.max(1, currentQuantity + increaseBy)
    : Math.max(currentQuantity || 1, minimumQuantity);

  const fullPayload = {
    user_id: userId,
    card_id: normalized.cardId,
    set_id: normalized.setId,
    variant: normalized.variant,
    condition: normalized.condition,
    grade_company: normalized.gradeCompany,
    grade: normalized.grade,
    quantity: nextQuantity,
  };

  const legacyPayload = {
    user_id: userId,
    card_id: normalized.cardId,
    set_id: normalized.setId,
    variant: normalized.variant,
    quantity: nextQuantity,
  };

  if (current?.id) {
    const fullResult = await supabase
      .from('user_card_variants')
      .update({ quantity: nextQuantity })
      .eq('id', current.id)
      .select(FULL_OWNED_COLUMNS)
      .maybeSingle();
    let data: any = fullResult.data;
    let error: any = fullResult.error;

    if (error && isSchemaCacheError(error)) {
      const legacy = await supabase
        .from('user_card_variants')
        .update({ quantity: nextQuantity })
        .eq('user_id', userId)
        .eq('card_id', normalized.cardId)
        .eq('set_id', normalized.setId)
        .eq('variant', normalized.variant)
        .select(LEGACY_OWNED_COLUMNS)
        .maybeSingle();
      data = legacy.data;
      error = legacy.error;
    }
    if (error) throw error;
    bumpCollectionSummaryVersion();
    return data ? normalizeOwnedRow(data) : { ...fullPayload, id: current.id };
  }

  const fullResult = await supabase
    .from('user_card_variants')
    .upsert(fullPayload, { onConflict: FULL_OWNED_CONFLICT })
    .select(FULL_OWNED_COLUMNS)
    .maybeSingle();
  let data: any = fullResult.data;
  let error: any = fullResult.error;

  if (error && isSchemaCacheError(error)) {
    const legacy = await supabase
      .from('user_card_variants')
      .upsert(legacyPayload, { onConflict: LEGACY_OWNED_CONFLICT })
      .select(LEGACY_OWNED_COLUMNS)
      .maybeSingle();
    data = legacy.data;
    error = legacy.error;
  }
  if (error) throw error;

  bumpCollectionSummaryVersion();
  return data ? normalizeOwnedRow(data) : normalizeOwnedRow(fullPayload);
}

export function buildOwnedRowsByCardKey(rows: OwnedCardRow[]) {
  const map = new Map<string, OwnedCardRow[]>();
  for (const row of rows) {
    const key = `${row.set_id}:${row.card_id}`;
    const current = map.get(key) ?? [];
    current.push(row);
    map.set(key, current);
  }
  return map;
}
