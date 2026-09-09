export type CommunityShareBinder = Readonly<{ is_public?: boolean | null }>;

export const PRIVATE_BINDER_SHARE_MESSAGE =
  'This binder is still private. Change its visibility in Binder settings, then return here to share it.';

/** A community post must only ever reference a binder already made public by its owner. */
export function canShareBinderInCommunity(binder: CommunityShareBinder | null | undefined) {
  return binder?.is_public === true;
}

export function publicCommunityShareBinders<T extends CommunityShareBinder>(binders: readonly T[]) {
  return binders.filter(canShareBinderInCommunity);
}
