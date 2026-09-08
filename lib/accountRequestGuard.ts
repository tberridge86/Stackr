export type AccountRequestToken = {
  accountGeneration: number;
  requestId: number;
};

// A response is safe to apply only while it belongs to both the latest request
// and the same signed-in account generation that started it.
export function isCurrentAccountRequest(
  current: AccountRequestToken,
  token: AccountRequestToken,
): boolean {
  return current.accountGeneration === token.accountGeneration
    && current.requestId === token.requestId;
}
