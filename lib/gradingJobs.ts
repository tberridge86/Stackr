import { supabase } from './supabase';
import type { ScanIntent } from './scanIntent';

export type GradingJobStatus =
  | 'queued'
  | 'processing'
  | 'complete'
  | 'failed'
  | 'requires_rescan';

export type GradingJobRecord = {
  id: string;
  user_id: string;
  scan_session_id?: string | null;
  intent: ScanIntent;
  status: GradingJobStatus;
  provider?: string | null;
  photo_count: number;
  photo_stages: string[];
  result?: Record<string, unknown> | null;
  error_code?: string | null;
  error_message?: string | null;
  queued_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  updated_at?: string | null;
};

export type CreateGradingJobInput = {
  scanSessionId?: string | null;
  intent?: Extract<ScanIntent, 'condition_check' | 'full_pregrade'>;
  provider?: string | null;
  photoStages: string[];
};

export type UpdateGradingJobInput = {
  status: GradingJobStatus;
  provider?: string | null;
  result?: Record<string, unknown> | null;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export async function createGradingJob(input: CreateGradingJobInput): Promise<GradingJobRecord> {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error('Sign in to submit a pre-grade job.');

  const { data, error } = await supabase
    .from('scan_grading_jobs')
    .insert({
      user_id: user.id,
      scan_session_id: input.scanSessionId ?? null,
      intent: input.intent ?? 'full_pregrade',
      status: 'queued',
      provider: input.provider ?? null,
      photo_count: input.photoStages.length,
      photo_stages: input.photoStages,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as GradingJobRecord;
}

export async function updateGradingJob(
  jobId: string,
  input: UpdateGradingJobInput
): Promise<GradingJobRecord | null> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: input.status,
    updated_at: now,
  };

  if (input.provider !== undefined) patch.provider = input.provider;
  if (input.result !== undefined) patch.result = input.result;
  if (input.errorCode !== undefined) patch.error_code = input.errorCode;
  if (input.errorMessage !== undefined) patch.error_message = input.errorMessage;
  if (input.status === 'processing') patch.started_at = now;
  if (input.status === 'complete' || input.status === 'failed' || input.status === 'requires_rescan') {
    patch.completed_at = now;
  }

  const { data, error } = await supabase
    .from('scan_grading_jobs')
    .update(patch)
    .eq('id', jobId)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return data as GradingJobRecord | null;
}
