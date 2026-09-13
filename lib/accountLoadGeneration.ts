/**
 * A focus change, pull-to-refresh, or account switch supersedes every prior
 * saved-account read. This prevents one account's completed request from
 * updating a screen now owned by another account.
 */
export function createAccountLoadGeneration() {
  let latest = 0;
  return {
    begin() {
      const generation = ++latest;
      return () => generation === latest;
    },
    invalidate() {
      latest += 1;
    },
  };
}
