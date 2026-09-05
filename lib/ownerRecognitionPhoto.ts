import { buildCardRectificationRequest, type CardRectificationRequest, type CardRectificationResult } from './cardRectification';
import { localiseCardFromJpegBase64, type CardLocalisationResult } from './cardLocalisation';

type Photo = { uri: string; width: number; height: number };
type GeneratedPhoto = Photo & { base64?: string | null };
export type OwnerPhotoEnvironment = {
  resize(photo: Photo, maxEdge: number, base64?: boolean): Promise<GeneratedPhoto>;
  localise(base64: string): CardLocalisationResult;
  rectify(request: CardRectificationRequest): CardRectificationResult;
  deleteRectification(scanId: string): void;
  deletePhoto(uri: string): Promise<void>;
};

async function nativeEnvironment(): Promise<OwnerPhotoEnvironment> {
  const [manipulator, filesystem, native] = await Promise.all([
    import('expo-image-manipulator'), import('expo-file-system/legacy'), import('./stackrCardVision'),
  ]);
  return {
    resize: (photo, maxEdge, base64 = false) => manipulator.manipulateAsync(photo.uri,
      Math.max(photo.width, photo.height) > maxEdge
        ? [photo.width > photo.height ? { resize: { width: maxEdge } } : { resize: { height: maxEdge } }]
        : [],
      { compress: 0.9, format: manipulator.SaveFormat.JPEG, base64 }),
    localise: localiseCardFromJpegBase64,
    rectify: native.rectifyCapturedCard,
    deleteRectification: (scanId) => { native.deleteCardRectificationOutputs(scanId); },
    deletePhoto: async (uri) => {
      if (filesystem.cacheDirectory && uri.startsWith(filesystem.cacheDirectory)) {
        await filesystem.deleteAsync(uri, { idempotent: true });
      }
    },
  };
}

/** Return a complete perspective-corrected card. Never silently send background/full frame. */
export async function prepareOwnerRecognitionPhoto(photo: Photo, environment?: OwnerPhotoEnvironment) {
  if (!photo.uri.startsWith('file://') || !Number.isFinite(photo.width) || !Number.isFinite(photo.height)
    || photo.width <= 0 || photo.height <= 0) throw new Error('Use a local camera photograph.');
  const env = environment ?? await nativeEnvironment();
  const temporary = new Set<string>();
  const scanId = `owner-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  let outputUri: string | null = null;
  try {
    // Re-encode first so pixel dimensions and orientation agree for analysis and rectification.
    const normalized = await env.resize(photo, 1600);
    if (normalized.uri !== photo.uri) temporary.add(normalized.uri);
    const analysis = await env.resize(normalized, 448, true);
    if (analysis.uri !== photo.uri) temporary.add(analysis.uri);
    const detection = env.localise(analysis.base64 ?? '');
    if (detection.status !== 'confident' || !detection.quadrilateral || detection.requiresManualAdjustment) {
      throw new Error('Card edges were not clear. Retake with all four corners visible, a plain contrasting background, and the card upright.');
    }
    const size = detection.imageSize;
    if (size.width <= 0 || size.height <= 0) throw new Error('Card edge detection failed. Please retake.');
    const quad = detection.quadrilateral;
    const normalize = (point: { x: number; y: number }) => ({ x: point.x / size.width, y: point.y / size.height });
    const request = buildCardRectificationRequest({
      scanId, sourcePhotoUri: normalized.uri, photoWidth: normalized.width, photoHeight: normalized.height,
      photoOrientation: 'portrait', mirrored: false, cameraPosition: 'back',
      previewWidth: normalized.width, previewHeight: normalized.height, previewResizeMode: 'contain',
      acceptedCorners: { topLeft: normalize(quad.topLeft), topRight: normalize(quad.topRight),
        bottomLeft: normalize(quad.bottomLeft), bottomRight: normalize(quad.bottomRight) },
    });
    const rectified = env.rectify(request);
    if (rectified.status !== 'success' || !rectified.rectifiedFull) {
      throw new Error('Card rectification is unavailable in this build. Install the current native owner build and retry.');
    }
    // Preserve full card detail; the server performs the pinned 256-square resize.
    const output = await env.resize(rectified.rectifiedFull, 1600);
    if (output.uri === rectified.rectifiedFull.uri) {
      throw new Error('Could not create a private card photo. Please retry.');
    }
    outputUri = output.uri;
    return { uri: output.uri, width: output.width, height: output.height,
      preparation: 'local_edge_native_full_card_rectification_v1' as const };
  } finally {
    env.deleteRectification(scanId);
    await Promise.all([...temporary].filter((uri) => uri !== outputUri)
      .map((uri) => env.deletePhoto(uri).catch(() => {})));
  }
}
