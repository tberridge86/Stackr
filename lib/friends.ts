import { supabase } from './supabase';

export async function sendFriendRequest(receiverId: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error('You must be logged in.');

  const { data, error } = await supabase
    .from('friendships')
    .insert({
      requester_id: user.id,
      receiver_id: receiverId,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function acceptFriendRequest(friendshipId: string) {
  const { data, error } = await supabase
    .from('friendships')
    .update({
      status: 'accepted',
      updated_at: new Date().toISOString(),
    })
    .eq('id', friendshipId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function declineFriendRequest(friendshipId: string) {
  const { data, error } = await supabase
    .from('friendships')
    .update({
      status: 'declined',
      updated_at: new Date().toISOString(),
    })
    .eq('id', friendshipId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function removeFriend(friendshipId: string) {
  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', friendshipId);

  if (error) throw error;
}

export async function getFriendStatus(otherUserId: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from('friendships')
    .select('*')
    .or(
      `and(requester_id.eq.${user.id},receiver_id.eq.${otherUserId}),and(requester_id.eq.${otherUserId},receiver_id.eq.${user.id})`
    )
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getPendingFriendRequests() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data: requests, error } = await supabase
    .from('friendships')
    .select('*')
    .eq('receiver_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw error;

  const requesterIds = [...new Set((requests ?? []).map((r) => r.requester_id))];

  if (requesterIds.length === 0) return [];

  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, collector_name, avatar_url, avatar_preset')
    .in('id', requesterIds);

  if (profileError) throw profileError;

  const profileMap = Object.fromEntries(
    (profiles ?? []).map((profile) => [profile.id, profile])
  );

  return (requests ?? []).map((request) => ({
    ...request,
    requester: profileMap[request.requester_id] ?? null,
  }));
}

export async function getMyFriends() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data: rows, error } = await supabase
    .from('friendships')
    .select('*')
    .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`)
    .eq('status', 'accepted')
    .order('updated_at', { ascending: false });

  if (error) throw error;

  const otherUserIds = [
    ...new Set(
      (rows ?? []).map((row) =>
        row.requester_id === user.id ? row.receiver_id : row.requester_id
      )
    ),
  ];

  if (otherUserIds.length === 0) return [];

  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, collector_name, avatar_url, avatar_preset')
    .in('id', otherUserIds);

  if (profileError) throw profileError;

  const profileMap = Object.fromEntries(
    (profiles ?? []).map((profile) => [profile.id, profile])
  );

  return (rows ?? []).map((row) => {
    const otherUserId =
      row.requester_id === user.id ? row.receiver_id : row.requester_id;

    return {
      ...row,
      friend: profileMap[otherUserId] ?? null,
      friend_id: otherUserId,
    };
  });
}
