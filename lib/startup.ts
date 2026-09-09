export const STARTUP_REQUEST_TIMEOUT_MS = 10_000;
export const FONT_LOAD_TIMEOUT_MS = 5_000;

/** A late response must not keep the launch screen mounted indefinitely. */
export async function withStartupTimeout<T>(task: PromiseLike<T>, timeoutMs = STARTUP_REQUEST_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(task),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Loading is taking longer than expected. Please try again.')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function resolveStartupDestination(state: {
  authLoading: boolean;
  authError: string | null;
  user: unknown | null;
  profileLoading: boolean;
  profileError: string | null;
  collectorName: string | null | undefined;
}): '/(auth)/login' | '/profile/setup' | '/(tabs)' | null {
  if (state.authLoading || state.authError) return null;
  if (!state.user) return '/(auth)/login';
  if (state.profileLoading || state.profileError) return null;
  return state.collectorName ? '/(tabs)' : '/profile/setup';
}
