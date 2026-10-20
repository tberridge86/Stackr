import type { ActivityPost } from './activity';
import { ACTIVITY_BASE_COLUMNS, ACTIVITY_SNAPSHOT_COLUMNS, isMissingActivitySnapshotColumn } from './activitySchema';

type ActivityReader = { from: (table: string) => any };

/** Owner-scoped bounded history reads support the existing and additive schemas. */
export async function readRecentHomeActivityRows(
  client: ActivityReader,
  ownerUserId: string,
  isCurrentRequest: () => boolean,
): Promise<ActivityPost[]> {
  if (!ownerUserId.trim()) throw new Error('A verified owner is required for Home history.');
  const assertCurrent = () => {
    if (!isCurrentRequest()) throw new Error('activity_read_identity_changed');
  };
  const read = (columns: string) => client.from('activity_feed').select(columns)
    .eq('user_id', ownerUserId).order('created_at', { ascending: false }).limit(20);
  assertCurrent();
  let result = await read(ACTIVITY_SNAPSHOT_COLUMNS);
  assertCurrent();
  if (isMissingActivitySnapshotColumn(result.error)) {
    result = await read(ACTIVITY_BASE_COLUMNS);
    assertCurrent();
  }
  if (result.error) throw result.error;
  return result.data ?? [];
}
