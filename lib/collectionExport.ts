const PAGE_SIZE = 200;
const MAX_BINDERS = 500;
const MAX_CARDS = 10_000;
const EXPORT_TIMEOUT_MS = 20_000;

export class CollectionExportError extends Error {
  constructor(public readonly code: 'cancelled' | 'not_signed_in' | 'incomplete' | 'failed', message: string) {
    super(message);
  }
}

export type CollectionExport = Readonly<{
  schemaVersion: 'stackr-collection-export-v1';
  exportedAt: string;
  binders: readonly Record<string, unknown>[];
  cards: readonly Record<string, unknown>[];
}>;

type ExportOptions = Readonly<{
  client?: any;
  now?: () => number;
  signal?: AbortSignal;
  isCurrent?: () => boolean;
}>;

function cancelled(options: ExportOptions) {
  return Boolean(options.signal?.aborted || options.isCurrent?.() === false);
}

function assertCurrent(options: ExportOptions) {
  if (cancelled(options)) throw new CollectionExportError('cancelled', 'Collection export was cancelled because the active account changed.');
}

function exportBinder(row: any) {
  return {
    id: row.id, name: row.name, type: row.type, language: row.language ?? null,
    sourceSetId: row.source_set_id ?? null, edition: row.edition ?? null,
    cardMode: row.card_mode ?? null, defaultCondition: row.default_condition ?? null,
    defaultGradeCompany: row.default_grade_company ?? null, defaultGrade: row.default_grade ?? null,
    isPublic: row.is_public ?? null, sortOrder: row.sort_order ?? null, createdAt: row.created_at ?? null,
  };
}

function exportCard(row: any) {
  return {
    id: row.id, binderId: row.binder_id, cardId: row.card_id, setId: row.set_id,
    language: row.language ?? null, canonicalVariantId: row.owned_card_variant_id ?? null,
    apiCardId: row.api_card_id ?? null, apiSetId: row.api_set_id ?? null,
    cardName: row.card_name ?? null, cardNumber: row.card_number ?? null,
    setName: row.set_name ?? null, slotOrder: row.slot_order ?? null,
    owned: row.owned === true, quantity: row.owned_quantity ?? null,
    condition: row.condition ?? null, gradeCompany: row.grade_company ?? null,
    grade: row.grade ?? null, notes: row.notes ?? null, createdAt: row.created_at ?? null,
  };
}

async function verifiedUser(client: any, options: ExportOptions) {
  assertCurrent(options);
  const { data, error } = await client.auth.getUser();
  assertCurrent(options);
  if (error) throw new CollectionExportError('failed', 'Could not verify the signed-in account for export.');
  if (!data?.user?.id) throw new CollectionExportError('not_signed_in', 'Sign in before exporting your collection.');
  return data.user.id as string;
}

/** Read-only export of saved rows. It never asks catalogue, price, image or provider services for enrichment. */
export async function createCollectionExport(options: ExportOptions = {}): Promise<CollectionExport> {
  // Keep the testable pure export path free from React Native/Supabase module
  // initialization. The app resolves its normal authenticated client only when
  // a caller does not provide one.
  const client = options.client ?? require('./supabase').supabase;
  const startedAt = (options.now ?? Date.now)();
  const assertDeadline = () => {
    assertCurrent(options);
    if ((options.now ?? Date.now)() - startedAt > EXPORT_TIMEOUT_MS) {
      throw new CollectionExportError('incomplete', 'Collection export timed out before all saved rows were read. Nothing was shared.');
    }
  };
  const userId = await verifiedUser(client, options);
  const binders: any[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    assertDeadline();
    const { data, error } = await client.from('binders')
      .select('id,user_id,name,type,language,source_set_id,edition,card_mode,default_condition,default_grade_company,default_grade,is_public,sort_order,created_at')
      .eq('user_id', userId).order('sort_order', { ascending: true }).order('created_at', { ascending: true }).order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    assertDeadline();
    if (error) throw new CollectionExportError('failed', 'Could not read saved binders for export.');
    const page = data ?? [];
    if (page.some((row: any) => row.user_id !== userId)) throw new CollectionExportError('failed', 'Export stopped because a binder ownership check failed.');
    binders.push(...page);
    if (binders.length > MAX_BINDERS) throw new CollectionExportError('incomplete', 'Collection export exceeds the safe binder limit. Nothing was shared.');
    if (page.length < PAGE_SIZE) break;
  }

  const cards: any[] = [];
  for (const binder of binders) {
    for (let from = 0; ; from += PAGE_SIZE) {
      assertDeadline();
      const { data, error } = await client.from('binder_cards')
        .select('id,binder_id,card_id,set_id,language,owned_card_variant_id,api_card_id,api_set_id,card_name,card_number,set_name,slot_order,owned,owned_quantity,condition,grade_company,grade,notes,created_at')
        .eq('binder_id', binder.id).order('slot_order', { ascending: true }).order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      assertDeadline();
      if (error) throw new CollectionExportError('failed', `Could not read saved cards for binder ${binder.id}. Nothing was shared.`);
      const page = data ?? [];
      if (page.some((row: any) => row.binder_id !== binder.id)) throw new CollectionExportError('failed', 'Export stopped because a card-to-binder check failed.');
      cards.push(...page);
      if (cards.length > MAX_CARDS) throw new CollectionExportError('incomplete', 'Collection export exceeds the safe card limit. Nothing was shared.');
      if (page.length < PAGE_SIZE) break;
    }
  }
  const finalUserId = await verifiedUser(client, options);
  if (finalUserId !== userId) throw new CollectionExportError('cancelled', 'Collection export was cancelled because the active account changed.');
  return Object.freeze({ schemaVersion: 'stackr-collection-export-v1', exportedAt: new Date(startedAt).toISOString(), binders: binders.map(exportBinder), cards: cards.map(exportCard) });
}
