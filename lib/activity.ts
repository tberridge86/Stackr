import { supabase } from './supabase';
import { assertActivityPostIdentity } from './activityIdentity';
import { isMissingActivitySnapshotColumn } from './activitySchema';

export type ActivityPost = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  subtitle: string | null;
  card_id?: string | null;
  set_id?: string | null;
  value_change?: number | null;
  is_positive?: boolean | null;
  created_at: string;
  card_name_snapshot?: string | null;
  card_number_snapshot?: string | null;
  card_language_snapshot?: string | null;
  card_image_small_snapshot?: string | null;
  card_image_large_snapshot?: string | null;
  canonical_printing_id?: string | null;
  canonical_variant_id?: string | null;

  profile?: {
    collector_name: string | null;
    avatar_preset: string | null;
  } | null;

  reactions?: Record<string, number>;
  my_reactions?: string[];
  is_following?: boolean;
};

export type ReactionType = 'like' | 'want' | 'watching';

export type CreateActivityPostOptions = {
  expectedUserId?: string;
  /** Stable UUID for a recoverable operation; an existing event is verified. */
  eventId?: string;
};

export type ActivityPostWriteResult =
  | { status: 'created'; snapshotStored: boolean }
  | { status: 'failed'; error: unknown }
  | { status: 'signed_out' };

function activityWriteFailure(error: unknown): ActivityPostWriteResult {
  console.warn('Collection activity could not be recorded', error);
  return { status: 'failed', error };
}

export async function fetchActivityFeed(): Promise<{
  posts: ActivityPost[];
  currentUserId: string | null;
}> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const currentUserId = user?.id ?? null;

  const { data, error } = await supabase
    .from('activity_feed')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;

  const posts = (data ?? []) as ActivityPost[];

  if (!posts.length) {
    return { posts: [], currentUserId };
  }

  const userIds = [...new Set(posts.map((post) => post.user_id).filter(Boolean))];
  const activityIds = posts.map((post) => post.id);

  const { data: profiles } = await supabase
    .from('profile_public_directory')
    .select('id, collector_name, avatar_preset')
    .in('id', userIds);

  const profileMap = Object.fromEntries(
    (profiles ?? []).map((profile: any) => [profile.id, profile])
  );

  const { data: reactions } = await supabase
    .from('activity_reactions')
    .select('activity_id, user_id, reaction')
    .in('activity_id', activityIds);

  const reactionCountMap: Record<string, Record<string, number>> = {};
  const myReactionMap: Record<string, string[]> = {};

  for (const reaction of reactions ?? []) {
    if (!reactionCountMap[reaction.activity_id]) {
      reactionCountMap[reaction.activity_id] = {};
    }

    reactionCountMap[reaction.activity_id][reaction.reaction] =
      (reactionCountMap[reaction.activity_id][reaction.reaction] ?? 0) + 1;

    if (currentUserId && reaction.user_id === currentUserId) {
      if (!myReactionMap[reaction.activity_id]) {
        myReactionMap[reaction.activity_id] = [];
      }

      myReactionMap[reaction.activity_id].push(reaction.reaction);
    }
  }

  let followingIds: string[] = [];

  if (currentUserId) {
    const { data: follows } = await supabase
      .from('user_follows')
      .select('following_id')
      .eq('follower_id', currentUserId);

    followingIds = (follows ?? []).map((follow: any) => follow.following_id);
  }

  const enrichedPosts = posts.map((post) => ({
    ...post,
    profile: profileMap[post.user_id] ?? null,
    reactions: reactionCountMap[post.id] ?? {},
    my_reactions: myReactionMap[post.id] ?? [],
    is_following: followingIds.includes(post.user_id),
  }));

  return {
    posts: enrichedPosts,
    currentUserId,
  };
}

export async function createActivityPost(input: {
  title: string;
  subtitle?: string | null;
  type?: string;
  cardId?: string | null;
  setId?: string | null;
  valueChange?: number | null;
  isPositive?: boolean | null;
  cardSnapshot?: {
    name?: string | null;
    number?: string | null;
    language?: string | null;
    imageSmall?: string | null;
    imageLarge?: string | null;
    canonicalPrintingId?: string | null;
    canonicalVariantId?: string | null;
  } | null;
}, options: CreateActivityPostOptions = {}): Promise<ActivityPostWriteResult> {
  let authenticated;
  try {
    authenticated = await supabase.auth.getUser();
  } catch (error) {
    return activityWriteFailure(error);
  }
  const {
    data: { user },
    error: userError,
  } = authenticated;

  if (userError) return activityWriteFailure(userError);
  assertActivityPostIdentity(options.expectedUserId, user?.id ?? null);
  if (!user) return { status: 'signed_out' };
  const ownerUserId = options.expectedUserId ?? user.id;

  // Artwork resolution and schema retries may cross an account change. Never
  // let a follow-up request use another account's session for this event.
  const verifyOwner = async () => {
    let verified;
    try {
      verified = await supabase.auth.getUser();
    } catch (error) {
      return error;
    }
    if (verified.error) return verified.error;
    assertActivityPostIdentity(ownerUserId, verified.data.user?.id ?? null);
    return null;
  };

  let snapshot = input.cardSnapshot ?? null;
  if (!snapshot && input.cardId) {
    // Exact legacy-id lookup only. Historical artwork must never be repaired by
    // a name/number fuzzy match because that can silently show another printing.
    const controller = new AbortController();
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      deadline = setTimeout(() => {
        resolve(null);
        controller.abort();
      }, 450);
    });
    // Keep the lookup rejection consumed even when it arrives after timeout.
    const lookup = (async () => {
      const { data } = await supabase.from('pokemon_cards')
        .select('id,name,number,language,image_small,image_large')
        .eq('id', input.cardId)
        .abortSignal(controller.signal)
        .maybeSingle();
      return data;
    })().catch((error) => {
      if (!controller.signal.aborted) console.warn('Activity artwork snapshot could not be resolved', error);
      return null;
    });
    try {
      const exactCard = await Promise.race([lookup, timeout]);
      if (exactCard?.id === input.cardId) snapshot = {
        name: exactCard.name ?? null,
        number: exactCard.number ?? null,
        language: exactCard.language ?? null,
        imageSmall: exactCard.image_small ?? null,
        imageLarge: exactCard.image_large ?? null,
      };
    } finally {
      if (deadline !== undefined) clearTimeout(deadline);
      controller.abort();
    }
  }

  const ownerError = await verifyOwner();
  if (ownerError) return activityWriteFailure(ownerError);
  const basePayload = {
    ...(options.eventId ? { id: options.eventId } : {}),
    user_id: options.expectedUserId ?? user.id,
    type: input.type ?? 'generic',
    title: input.title,
    subtitle: input.subtitle ?? null,
    card_id: input.cardId ?? null,
    set_id: input.setId ?? null,
    value_change: input.valueChange ?? null,
    is_positive: input.isPositive ?? null,
  };
  const snapshotPayload = {
    card_name_snapshot: snapshot?.name ?? null,
    card_number_snapshot: snapshot?.number ?? null,
    card_language_snapshot: snapshot?.language ?? null,
    card_image_small_snapshot: snapshot?.imageSmall ?? null,
    card_image_large_snapshot: snapshot?.imageLarge ?? null,
    canonical_printing_id: snapshot?.canonicalPrintingId ?? null,
    canonical_variant_id: snapshot?.canonicalVariantId ?? null,
  };
  const insert = async (payload: typeof basePayload | (typeof basePayload & typeof snapshotPayload)) => {
    try {
      return await supabase.from('activity_feed').insert(payload);
    } catch (error) {
      return { error };
    }
  };
  const verifyExistingEvent = async (error: unknown): Promise<ActivityPostWriteResult> => {
    if (!options.eventId || (error as { code?: string } | null)?.code !== '23505') {
      return activityWriteFailure(error);
    }
    const identityError = await verifyOwner();
    if (identityError) return activityWriteFailure(identityError);
    let existing;
    try {
      existing = await supabase.from('activity_feed')
        .select('*')
        .eq('id', options.eventId)
        .eq('user_id', ownerUserId)
        .maybeSingle();
    } catch (readError) {
      return activityWriteFailure(readError);
    }
    const readOwnerError = await verifyOwner();
    if (readOwnerError) return activityWriteFailure(readOwnerError);
    if (existing.error) return activityWriteFailure(existing.error);
    const row = existing.data;
    const exactBasePayload = row && Object.entries(basePayload).every(([field, value]) =>
      field === 'value_change' && value !== null
        ? row[field] != null && Number(row[field]) === value
        : row[field] === value,
    );
    const compatibleSnapshot = row && Object.entries(snapshotPayload).every(([field, value]) =>
      row[field] == null || row[field] === value,
    );
    if (!exactBasePayload || !compatibleSnapshot) return activityWriteFailure(error);
    const snapshotStored = Object.entries(snapshotPayload).every(([field, value]) =>
      field in row && row[field] === value,
    );
    return { status: 'created', snapshotStored };
  };

  const { error } = await insert({ ...basePayload, ...snapshotPayload });
  if (!error) return { status: 'created', snapshotStored: true };
  if (!isMissingActivitySnapshotColumn(error)) return verifyExistingEvent(error);

  // Only an explicit missing optional column permits this retry. Permission,
  // network and identity errors stay visible to the caller; a committed card
  // must not be reported as rolled back because recording its history failed.
  const retryOwnerError = await verifyOwner();
  if (retryOwnerError) return activityWriteFailure(retryOwnerError);
  const { error: retryError } = await insert(basePayload);
  if (retryError) {
    return verifyExistingEvent(retryError);
  }
  return { status: 'created', snapshotStored: false };
}

export async function toggleActivityReaction(
  activityId: string,
  reaction: ReactionType
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  const { data: existing } = await supabase
    .from('activity_reactions')
    .select('id')
    .eq('activity_id', activityId)
    .eq('user_id', user.id)
    .eq('reaction', reaction)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from('activity_reactions')
      .delete()
      .eq('id', existing.id);

    if (error) throw error;
    return;
  }

  const { error } = await supabase.from('activity_reactions').insert({
    activity_id: activityId,
    user_id: user.id,
    reaction,
  });

  if (error) throw error;
}

export async function toggleFollowUser(targetUserId: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;
  if (user.id === targetUserId) return;

  const { data: existing } = await supabase
    .from('user_follows')
    .select('id')
    .eq('follower_id', user.id)
    .eq('following_id', targetUserId)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from('user_follows')
      .delete()
      .eq('id', existing.id);

    if (error) throw error;
    return;
  }

  const { error } = await supabase.from('user_follows').insert({
    follower_id: user.id,
    following_id: targetUserId,
  });

  if (error) throw error;
}
