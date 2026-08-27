// Node-side scripts must opt in explicitly before importing mobile configuration.
// This preloader keeps that opt-in cross-platform and visible in package.json.
process.env.STACKR_NODE_TOOLING_RUNTIME = 'true';
