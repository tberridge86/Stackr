export const ACTIVITY_BASE_COLUMNS = 'id,user_id,type,title,subtitle,card_id,set_id,value_change,is_positive,created_at';

export const ACTIVITY_SNAPSHOT_FIELDS = [
  'card_name_snapshot', 'card_number_snapshot', 'card_language_snapshot',
  'card_image_small_snapshot', 'card_image_large_snapshot',
  'canonical_printing_id', 'canonical_variant_id',
] as const;

export const ACTIVITY_SNAPSHOT_COLUMNS = `${ACTIVITY_BASE_COLUMNS},${ACTIVITY_SNAPSHOT_FIELDS.join(',')}`;

/** Only the known additive fields are optional; permission/transport errors are not. */
export function isMissingActivitySnapshotColumn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return ['42703', 'PGRST204'].includes(String(code ?? ''))
    && typeof message === 'string'
    && ACTIVITY_SNAPSHOT_FIELDS.some((field) => new RegExp(`\\b${field}\\b`).test(message));
}
