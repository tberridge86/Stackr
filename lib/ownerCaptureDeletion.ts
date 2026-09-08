export type OwnerCaptureDeletionEnvironment = {
  verifiedLocalDirectory(ownerId: string): Promise<string>;
  assertCurrentOwner(ownerId: string): Promise<unknown>;
  deleteDirectory(directory: string): Promise<void>;
};

/** Server-verified identity can become stale while its request is in flight. */
export async function deleteOwnerCaptureWithEnvironment(
  ownerId: string, id: string, environment: OwnerCaptureDeletionEnvironment,
) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error('Invalid capture identifier.');
  const directory = await environment.verifiedLocalDirectory(ownerId);
  // Keep this immediately before deletion, with no intervening asynchronous work.
  await environment.assertCurrentOwner(ownerId);
  await environment.deleteDirectory(`${directory}${id}/`);
}
