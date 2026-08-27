export function assertActivityPostIdentity(
  expectedUserId: string | undefined,
  currentUserId: string | null,
) {
  if (expectedUserId !== undefined && currentUserId !== expectedUserId) {
    throw new Error('activity_post_identity_changed');
  }
}
