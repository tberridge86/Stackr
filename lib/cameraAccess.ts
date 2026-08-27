export type CameraPermissionLike = {
  granted: boolean;
  canAskAgain: boolean;
} | null | undefined;

export type CameraPermissionAction = 'loading' | 'ready' | 'request' | 'open-settings';

export function getCameraPermissionAction(
  permission: CameraPermissionLike,
): CameraPermissionAction {
  if (!permission) return 'loading';
  if (permission.granted) return 'ready';
  return permission.canAskAgain ? 'request' : 'open-settings';
}
