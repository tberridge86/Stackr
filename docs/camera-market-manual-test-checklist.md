# Stackr Camera And Market Manual Test Checklist

Use this checklist after camera, scanner, or market listing changes. Automated tests cannot fully exercise native camera hardware, so this is the required device pass.

## Camera Scanning

- Fresh install or cleared permissions: open Scan and confirm the camera permission prompt appears once.
- Permission granted: Scan opens to a live preview and the camera frame is responsive.
- Permission denied: Scan shows a clear blocked state and does not crash.
- Navigate away from Scan, then return: the camera restarts without freezing.
- Background the app while Scan is open, then foreground it: the camera recovers or shows a clear retry state.
- Successful scan: one valid scan result is created and duplicate callbacks are debounced.
- Rapid repeated scans of the same card: the UI does not add repeated copies unless the user confirms the next scan.
- Torch/flash, if available on device: toggles without restarting or freezing the camera.

## Listing Camera

- Open Add Listing and move to photo capture: the camera opens only on the photo step.
- Capture front and back photos: both previews render and remain after moving between steps.
- Leave Add Listing while the camera is open, then return: camera resources are released and reopened cleanly.
- Device camera fallback: if VisionCamera capture fails, the system camera path still lets the user continue.

## Market Listings

- Create a new listing from card details or Add Listing: it appears in My Listings and the public marketplace.
- Legacy listing with `listing_status = null`: it appears as active.
- Archived listing: it disappears from public marketplace, homepage listing previews, and active My Listings.
- Sold/unavailable listing: it does not appear as active.
- Listing row: card name, image, price, condition, status, and seller info display correctly.
- Tap a listing: opens the correct listing/card detail flow.
- Pull to refresh with network available: refreshes without duplicate rows.
- Pull to refresh with poor network: preserves the last known good listings and shows a non-blocking error.
- Search, filters, and sorting: update the visible listing set without clearing valid data.
