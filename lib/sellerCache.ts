export function sellerCacheKey(base: string, userId: string) {
  return `${base}:${userId}`;
}

export function isVerifiedSellerSessionIdentity(
  sessionUserId: string | null | undefined,
  verifiedUserId: string | null | undefined,
) {
  return Boolean(sessionUserId && verifiedUserId && sessionUserId === verifiedUserId);
}

export function sellerBatchRequestId(userId: string, requestToken: string) {
  const requestId = `seller-batch:${userId}:${requestToken}`;
  if (!/^[A-Za-z0-9:_-]{16,128}$/.test(requestId)) {
    throw new Error('Seller inventory request ID is invalid.');
  }
  return requestId;
}
