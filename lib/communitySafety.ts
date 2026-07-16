import { supabase } from './supabase';

export type CommunityReportTarget = 'user' | 'post' | 'listing' | 'comment';
export type CommunityReportReason =
  | 'fraud'
  | 'impersonation'
  | 'harassment'
  | 'inappropriate_content'
  | 'counterfeit'
  | 'unsafe_trade'
  | 'other';

export type CommunitySafetyAction = 'report' | 'block' | 'mute' | 'remove_follower';

export type CommunitySafetyRequest = {
  action: CommunitySafetyAction;
  targetType: CommunityReportTarget;
  targetId: string;
  reason?: CommunityReportReason;
  note?: string | null;
};

export async function submitCommunitySafetyRequest(request: CommunitySafetyRequest) {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error('You must be signed in to use safety controls.');

  const table = request.action === 'report' ? 'community_reports' : 'community_user_safety_actions';
  const payload = {
    reporter_id: user.id,
    actor_id: user.id,
    action: request.action,
    target_type: request.targetType,
    target_id: request.targetId,
    reason: request.reason ?? null,
    note: request.note ?? null,
  };

  const { error } = await supabase.from(table).insert(payload);
  if (error) {
    if (error.code === '42P01' || /does not exist|schema cache/i.test(error.message ?? '')) {
      throw new Error('Community safety backend is not connected yet.');
    }
    throw error;
  }
}
