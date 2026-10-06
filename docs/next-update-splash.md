# Startup and in-app loading

Startup uses the unchanged, bundled `assets/startup/stackr-loading-screen-exact.mp4`, supplied as `D:\stackr-loading-screen-exact.mp4`. It is a 720×720 H.264 clip lasting 5.534 seconds, 67,013 bytes. SHA-256: `14b82efa2bdf8bbf98debde5e0138f2a3b419e32e011e7d0d91faf0a57ab697c`.

`StackrStartupVideo` plays it once at original speed, muted, with contain sizing and no controls. Its square view fits portrait or landscape without cropping or black letterboxes. The video mounts before fonts finish; the app loads underneath. A frame extracted at 3 seconds supplies the native static launch image, decoder fallback and Reduce Motion still. Operating-system launch screens are static; video starts when React mounts.

Unknown motion preferences stay still; unreadable preferences bypass playback. A 12-second playback deadline and independent 12.5-second root guard prevent a trapped launch. Fonts retain their five-second fallback. Auth/profile recovery remains separate. Visiting the preview settles startup so leaving it does not replay the launch clip.

In-app loading uses a small themed ring or a simple three-pixel bar. Search, Market, Home sections, collection value and duplicates no longer build card-shaped loading placeholders. Ready content and error/retry controls remain. `/splash-preview` previews the same video. Unused hand-drawn startup artwork/motion helpers were removed from the release candidate; the uncompiled SwiftUI reference remains archived source.

Validation: startup routing, root font/video deadlines, completion, Reduce Motion, unmount cleanup and shared UX tests pass. An iOS Metro/Hermes export succeeds; the exported MP4 matches the supplied file's SHA-256. This proves asset bundling, not installed-device playback. Native cold/offline launch and visual acceptance on a phone remain pending.

Adding expo-video changes the native dependency set. Delivery requires a new binary and distinct compatible runtime/version; do not send this as an OTA to older binaries. No TestFlight upload or OTA has been performed while pricing, artwork and English-description readiness gates remain open.
