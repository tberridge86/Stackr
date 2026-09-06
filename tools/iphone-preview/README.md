# iPhone 15 live preview

This small local host puts Expo Web inside an accurately sized iPhone 15 layout viewport (393 × 852 CSS pixels). The app remains an iframe, so Expo Fast Refresh continues to update it naturally as you edit.

This is a layout and interaction preview running in Chromium, not an iOS runtime. Camera behavior, native permissions, Safari-only quirks, and native safe-area values still need a physical iPhone or an iOS Simulator on macOS.

From the repository root, start it with:

```sh
node tools/iphone-preview/server.js
```

Then visit `http://127.0.0.1:4173` in your browser. Start Expo Web separately in the usual way, or let the host start it when needed:

```sh
node tools/iphone-preview/server.js --start-app
```

`npm run preview:iphone` uses the repository's local environment (which can be staging). To mirror the production mobile app instead, use:

```sh
npm run preview:iphone:production
```

The production command runs its own Expo instance on port 8083, clears Metro's old bundle cache, and reads only the public runtime settings from the existing production EAS profile. It does not change any remote data, credentials, or the local `.env.local` file.

The app code comes from the current local worktree, not a downloaded production build. Production refers to its connection settings; signing in still requires your real account. The launcher uses interactive single-page web output and two Metro workers. It skips Expo CLI online checks without disabling Stackr's own online services.

The right-hand source label shows the Git revision at which this host started its Expo child and that child’s environment only while it remains alive. Fast Refresh can include later local edits, so the label never claims to identify the currently rendered code exactly. A pre-existing Expo server, an app URL selected in the toolbar, or a server that replaces a stopped child is deliberately labelled `source/config unverified`: it may come from another worktree or use different settings. This host, its localhost URLs, and its frame are developer tooling; they are not imported by the app and are not bundled into an iOS archive. No account credentials are stored or supplied by the preview.

`--start-app` checks port 8081 first and can reuse an existing local Expo app, but reused apps are not attributed to this worktree or configuration. If it starts Expo itself, it streams that output and shuts down only that child process when the preview host exits.

Options:

```text
--port 4173                         Preview host port
--app-url http://127.0.0.1:8081     Initial Expo Web URL (localhost only)
--app-port 8081                     Expo port used with --start-app
--start-app                         Start Expo Web if its port is not already in use
--environment local|production      Local config (default) or the production mobile environment
```

Use the top controls to choose a route, reload, rotate between portrait and landscape, or show safe-area guides. The iPhone hardware overlays are decorative and deliberately do not intercept app touches.

The selected source and route are retained in the preview URL. The iframe waits for Expo's status endpoint before loading; a cold bundle can take longer after a cache reset. The host checks both Windows loopback families so an unrelated static server cannot silently replace the configured live Expo instance.

Validate the Windows watcher exclusions without building the app:

```sh
node tools/iphone-preview/test-watch-exclusions.js
```
