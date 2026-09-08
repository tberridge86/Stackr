export const PROFILE_LOAD_ERROR = 'We could not load your profile. Please try again. Your saved profile has not been changed.';

export type ProfileLoadState<T> = {
  accountId: string | null;
  requestId: number;
  profile: T | null;
  loading: boolean;
  error: string | null;
};

export function beginProfileLoad<T>(previous: ProfileLoadState<T>, accountId: string | null, requestId: number): ProfileLoadState<T> {
  return {
    accountId,
    requestId,
    profile: accountId && accountId === previous.accountId ? previous.profile : null,
    loading: Boolean(accountId),
    error: null,
  };
}

export function finishProfileLoad<T extends { id: string }>(
  previous: ProfileLoadState<T>,
  result: { accountId: string; requestId: number; data: T | null; error: unknown },
): ProfileLoadState<T> {
  // A delayed request or another account must never replace current profile data.
  if (previous.accountId !== result.accountId || previous.requestId !== result.requestId) return previous;
  if (result.error || (result.data && result.data.id !== result.accountId)) {
    return { ...previous, loading: false, error: PROFILE_LOAD_ERROR };
  }
  // A successful zero-row result, unlike an error, is the only setup state.
  return { ...previous, profile: result.data, loading: false, error: null };
}
