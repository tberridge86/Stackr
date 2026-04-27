import { supabase } from './supabase';

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

  profile?: {
    collector_name: string | null;
    avatar_preset: string | null;
  } | null;

  reactions?: Record<string, number>;
  my_reactions?: string[];
  is_following?: boolean;
};

export type ReactionType = 'like' | 'want' | 'watching';

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
    .from('profiles')
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
}) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  const { error } = await supabase.from('activity_feed').insert({
    user_id: user.id,
    type: input.type ?? 'generic',
    title: input.title,
    subtitle: input.subtitle ?? null,
    card_id: input.cardId ?? null,
    set_id: input.setId ?? null,
    value_change: input.valueChange ?? null,
    is_positive: input.isPositive ?? null,
  });

  if (error) {
    console.log('Failed to create activity post', error);
  }
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