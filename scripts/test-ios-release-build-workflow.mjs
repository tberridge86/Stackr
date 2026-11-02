import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const workflow = readFileSync('.github/workflows/build-owner-ios-release.yml', 'utf8').replace(/\r\n/gu, '\n');
const eas = JSON.parse(readFileSync('eas.json', 'utf8'));
const config = JSON.parse(readFileSync('app.json', 'utf8')).expo;

// Preserve shell indentation after YAML removes the ten-space block prefix.
// bash -n parses both profile branches without executing commands or requesting a build.
const shellBlocks = [...workflow.matchAll(/^        run: \|\n((?:(?:          [^\n]*|)\n)+)/gmu)]
  .map((match) => match[1].split('\n').map((line) => line.slice(10)).join('\n'));
assert.ok(shellBlocks.length >= 4, 'Extract every multiline release shell block.');
function checkBashSyntax(script) {
  const result = spawnSync(process.env.BASH || 'bash', ['--noprofile', '--norc', '-n'], {
    input: script, encoding: 'utf8', timeout: 10_000,
    env: { ...process.env, BASH_ENV: '' },
  });
  assert.ifError(result.error);
  return result;
}
for (const script of shellBlocks) {
  const result = checkBashSyntax(script);
  assert.equal(result.status, 0, `Release shell syntax must pass: ${result.stderr}`);
  assert.equal(result.stderr, '', 'Heredoc warnings must not pass silently.');
}
const profileShell = shellBlocks.find((script) => script.includes('scripts/verify-owner-recognition-build.mjs'));
assert.ok(profileShell?.includes('\nNODE\n'), 'The profile heredoc terminator must be at shell column zero.');
const brokenProfileShell = profileShell.replace('\nNODE\n', '\n  NODE\n');
assert.notEqual(checkBashSyntax(brokenProfileShell).status, 0, 'Reintroduced indented terminator must fail Bash parsing.');

// Execute the actual release validation blocks with local Git/provider fixtures.
// No release command or network request is reached by these attestation steps.
function releaseValidationStep(source, name) {
  const step = source.split(`      - name: ${name}\n`)[1]?.split('\n      - ')[0];
  const block = step?.match(/^        run: \|\n((?:(?:          [^\n]*|)\n)+)/mu)?.[1];
  assert.ok(block, `Find the actual ${name} shell step.`);
  return block.split('\n').map((line) => line.slice(10)).join('\n');
}
const releaseSha = 'a'.repeat(40);
const backendSha = 'b'.repeat(40);
const productionWorkflow = readFileSync('.github/workflows/deploy-production.yml', 'utf8').replace(/\r\n/gu, '\n');
const validations = [
  { name: 'backend', key: 'STACKR_EXPECTED_MAIN_SHA', source: productionWorkflow,
    step: 'Validate exact backend-only production release' },
  { name: 'native', key: 'FROZEN_SOURCE_SHA', source: workflow,
    step: 'Attest frozen source and approved profile' },
];
const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'stackr-release-inputs-'));
try {
  let caseNumber = 0;
  for (const validation of validations) {
    const step = releaseValidationStep(validation.source, validation.step);
    const cases = [
      ['plain', releaseSha, true, {}],
      ['outer whitespace', `\t ${releaseSha}\r\n`, true,
        validation.name === 'native' ? { EXPECTED_BACKEND_SHA: ` \t${backendSha}\n` } : {}],
      ['mismatched source', 'c'.repeat(40), false, {}],
      ['embedded space', `${releaseSha.slice(0, 20)} ${releaseSha.slice(20)}`, false, {}],
      ['embedded newline', `${releaseSha.slice(0, 20)}\n${releaseSha.slice(20)}`, false, {}],
      ['wrong checkout', releaseSha, false, { TEST_HEAD_SHA: 'c'.repeat(40) }],
      ...(validation.name === 'native'
        ? [['invalid backend SHA', releaseSha, false, { EXPECTED_BACKEND_SHA: `${backendSha}\nINJECTED=1` }]]
        : [['forbidden mobile flag', releaseSha, false, { PUBLISH_MOBILE_UPDATE: 'true' }]]),
    ];
    for (const [name, input, accepted, overrides] of cases) {
      const githubEnv = path.join(fixtureRoot, `${caseNumber++}.env`);
      writeFileSync(githubEnv, '');
      const result = spawnSync(process.env.BASH || 'bash', ['--noprofile', '--norc', '-s'], {
        input: `git() {\n  case "$*" in\n    'rev-parse HEAD') printf '%s\\n' "$TEST_HEAD_SHA" ;;\n    'diff --exit-code'|'status --porcelain') return 0 ;;\n    *) return 1 ;;\n  esac\n}\n${step}\nnode -e 'console.log(JSON.stringify({main:process.env.${validation.key},backend:process.env.EXPECTED_BACKEND_SHA}))'\n`,
        encoding: 'utf8', timeout: 10_000,
        env: {
          ...process.env, BASH_ENV: '', GITHUB_ENV: githubEnv.replaceAll('\\', '/'),
          RUNNER_TEMP: fixtureRoot.replaceAll('\\', '/'), GITHUB_REF: 'refs/heads/main',
          GITHUB_SHA: releaseSha, TEST_HEAD_SHA: releaseSha, EXPECTED_BACKEND_SHA: backendSha,
          RELEASE_BUILD_PROFILE: 'production', VERIFY_ONLY: 'false', EXPO_TOKEN: 'fixture',
          STACKR_PRICING_SMOKE_VARIANT_ID: '4d6b4549-6d6c-4ace-a4cc-72877ba29401',
          GATEWAY_BOOTSTRAP: 'false', APPLY_MIGRATIONS: 'false', PUBLISH_MOBILE_UPDATE: 'false', PROMOTE_GATEWAY: 'false',
          PREVIOUS_GATEWAY_TAG: '', PREVIOUS_RECOGNITION_DEPLOYMENT_ID: '', PREVIOUS_CATALOGUE_VERSION_ID: '',
          PREVIOUS_INDEX_VERSION_ID: '', CATALOGUE_VERSION_ID: '', CATALOGUE_RELEASE_LABEL: '', INDEX_VERSION_ID: '',
          RAILWAY_API_TOKEN: 'fixture', RAILWAY_PROJECT_ID: 'fixture', RAILWAY_ENVIRONMENT_ID: 'fixture',
          RAILWAY_BACKEND_SERVICE_ID: 'fixture', STACKR_BACKEND_URL: 'fixture', STACKR_GATEWAY_URL: 'fixture', BACKEND_ORIGIN_KEY: 'fixture',
          [validation.key]: input, ...overrides,
        },
      });
      assert.ifError(result.error);
      const persisted = readFileSync(githubEnv, 'utf8').replace(/\r\n/gu, '\n');
      if (accepted) {
        assert.equal(result.status, 0, `${validation.name}: ${name}: ${result.stderr}`);
        assert.equal(persisted, `${validation.key}=${releaseSha}\n${validation.name === 'native' ? `EXPECTED_BACKEND_SHA=${backendSha}\n` : ''}`);
        assert.deepEqual(JSON.parse(result.stdout), { main: releaseSha, backend: backendSha });
      } else {
        assert.notEqual(result.status, 0, `${validation.name}: reject ${name}.`);
        assert.equal(persisted, '', `${validation.name}: invalid inputs cannot enter GITHUB_ENV.`);
      }
    }
  }
} finally {
  assert.equal(path.dirname(fixtureRoot), path.resolve(tmpdir()));
  assert.ok(path.basename(fixtureRoot).startsWith('stackr-release-inputs-'));
  rmSync(fixtureRoot, { recursive: true, force: true });
}

assert.match(workflow, /build_profile:\s*\n[\s\S]*?default: production-owner[\s\S]*?type: choice[\s\S]*?options:[\s\S]*?- production-owner[\s\S]*?- production/m);
assert.match(workflow, /github\.ref == 'refs\/heads\/main' && github\.actor == github\.repository_owner/);
assert.match(workflow, /environment: production/);
assert.match(workflow, /group: stackr-owner-ios-release[\s\S]*?cancel-in-progress: false/);
assert.match(workflow, /test "\$GITHUB_SHA" = "\$FROZEN_SOURCE_SHA"[\s\S]*?test "\$\(git rev-parse HEAD\)" = "\$FROZEN_SOURCE_SHA"/);
assert.match(workflow, /actions\/checkout@11d5960a326750d5838078e36cf38b85af677262/);
assert.match(workflow, /eas-cli@23\.2\.0[\s\S]*?'build', '--platform', 'ios'/);
assert.doesNotMatch(workflow, /eas-cli@23\.2\.0'?,?\s*'submit'/);
assert.match(workflow, /STACKR_OWNER_RECOGNITION_BUILD: isOwner \? 'true' : 'false'/);
assert.match(workflow, /EXPO_PUBLIC_OWNER_RECOGNITION_ENABLED: isOwner \? 'true' : 'false'/);
assert.match(workflow, /scripts\/verify-owner-recognition-build\.mjs/);
assert.match(workflow, /scripts\/deploy\/verify-mobile-runtime-config\.mjs/);
assert.match(workflow, /expected_backend_sha:[\s\S]*?required: true/);
assert.match(workflow, /EXPECTED_BACKEND_SHA: \$\{\{ inputs\.expected_backend_sha \}\}/);
const deliveryGatePosition = workflow.indexOf('node scripts/verify-ios-release-delivery.mjs');
const nativeBuildPosition = workflow.indexOf('- name: Queue iOS build and production auto-submission');
assert.ok(deliveryGatePosition >= 0 && nativeBuildPosition > deliveryGatePosition);
for (const command of ['npm run test:mobile-recovery', 'npm run test:server-delivery', 'npm run test:home-activity']) {
  const position = workflow.indexOf(command);
  assert.ok(position >= 0 && position < deliveryGatePosition, `${command} must pass before live proof and native build.`);
}
assert.match(readFileSync('.github/workflows/platform-ci.yml', 'utf8'), /npm run test:home-activity/);
assert.match(workflow, /mobile-delivery-receipt\.json/);

assert.match(workflow, /verify_only:\s*\n\s*description:[^\n]*\n\s*required: false\n\s*default: false\n\s*type: boolean/);
assert.match(workflow, /VERIFY_ONLY: \$\{\{ inputs\.verify_only \}\}/);
assert.match(workflow, /if \[\[ "\$VERIFY_ONLY" != 'true' \]\]; then\s*test -n "\$EXPO_TOKEN"\s*fi/);
const buildStep = workflow.slice(nativeBuildPosition, workflow.indexOf('\n      - name:', nativeBuildPosition + 1));
assert.match(buildStep, /if: \$\{\{ !inputs\.verify_only \}\}/);
const buildScript = buildStep.match(/node <<'NODE'\n([\s\S]*?)\n\s*NODE/)[1]
  .split('\n').map((line) => line.replace(/^          /, '')).join('\n');
const reachedBuildBody = new Error('guard passed');
function checkBuildGuard(env, expected, mayReachBody) {
  let bodyReached = false;
  assert.throws(() => runInNewContext(buildScript, {
    process: { env },
    require: () => { bodyReached = true; throw reachedBuildBody; },
  }), expected);
  assert.equal(bodyReached, mayReachBody);
}
checkBuildGuard({ VERIFY_ONLY: 'true', EXPO_TOKEN: 'fixture' }, /Verification-only runs cannot request a native build/, false);
checkBuildGuard({ VERIFY_ONLY: 'true', EXPO_TOKEN: '' }, /Verification-only runs cannot request a native build/, false);
checkBuildGuard({ EXPO_TOKEN: 'fixture' }, /Verification-only runs cannot request a native build/, false);
checkBuildGuard({ VERIFY_ONLY: 'unexpected', EXPO_TOKEN: 'fixture' }, /Verification-only runs cannot request a native build/, false);
checkBuildGuard({ VERIFY_ONLY: 'false', EXPO_TOKEN: '' }, /EXPO_TOKEN is required/, false);
checkBuildGuard({ VERIFY_ONLY: 'false', EXPO_TOKEN: '  ' }, /EXPO_TOKEN is required/, false);
checkBuildGuard({ VERIFY_ONLY: 'false', EXPO_TOKEN: 'fixture' }, (error) => error === reachedBuildBody, true);

// Execute the actual embedded build script. Provider/file fixtures capture the
// outgoing EAS arguments and accepted receipt without requesting a real build.
function runBuildRequest(profileName, { expectedSource = releaseSha, rowOverrides = {}, commandStatus = 0 } = {}) {
  const calls = [];
  const files = new Map();
  const isOwner = profileName === 'production-owner';
  const row = {
    id: 'fixture-build', status: 'IN_QUEUE', gitCommitHash: releaseSha,
    appVersion: config.version, appBuildVersion: 'fixture', buildProfile: profileName,
    updateChannel: { name: eas.build[profileName]?.channel },
    runtime: { version: isOwner ? `${config.version}-owner-recognition-v1` : config.version },
    ...rowOverrides,
  };
  const fileSystem = {
    openSync: () => 1,
    closeSync: () => undefined,
    mkdirSync: () => undefined,
    readFileSync: (file) => file.endsWith('-ios-build.json') ? JSON.stringify([row])
      : file.endsWith('mobile-delivery-receipt.json') ? JSON.stringify({ backendSource: backendSha }) : '',
    writeFileSync: (file, value) => files.set(file, value),
  };
  let error;
  try {
    runInNewContext(buildScript, {
      process: { env: {
        VERIFY_ONLY: 'false', EXPO_TOKEN: 'fixture', FROZEN_SOURCE_SHA: expectedSource,
        RELEASE_BUILD_PROFILE: profileName, RUNNER_TEMP: '/fixture',
        STACKR_MOBILE_ENVIRONMENT: 'staging', STACKR_OWNER_RECOGNITION_BUILD: 'true',
        EXPO_PUBLIC_OWNER_RECOGNITION_ENABLED: 'true',
      } },
      console: { log: () => undefined, error: () => undefined },
      require: (module) => {
        if (module === 'node:fs') return fileSystem;
        if (module === './eas.json') return eas;
        if (module === './app.json') return { expo: config };
        if (module === 'node:child_process') return {
          execFileSync: (command, args) => {
            assert.equal(command, 'git');
            assert.deepEqual(Array.from(args), ['rev-parse', 'HEAD']);
            return releaseSha;
          },
          spawnSync: (command, args, options) => {
            calls.push({ command, args: Array.from(args), env: options.env });
            return { status: commandStatus };
          },
        };
        throw new Error(`Unexpected build dependency: ${module}`);
      },
    });
  } catch (caught) { error = caught; }
  const receipt = files.get('outputs/releases/frozen-ios-build-receipt.json');
  return { calls, receipt: receipt ? JSON.parse(receipt) : null, error };
}
for (const profile of ['production', 'production-owner']) {
  const result = runBuildRequest(profile);
  assert.ifError(result.error);
  assert.equal(result.calls.length, 1);
  const request = result.calls[0];
  assert.equal(request.command, 'npx');
  assert.ok(request.args.includes('eas-cli@23.2.0'));
  assert.equal(request.args[request.args.indexOf('--profile') + 1], profile);
  assert.ok(request.args.includes('--no-wait'));
  assert.ok(!request.args.includes('--groups'));
  const autoSubmit = request.args.indexOf('--auto-submit-with-profile');
  assert.equal(autoSubmit >= 0, profile === 'production');
  if (profile === 'production') {
    assert.equal(request.args[autoSubmit + 1], 'production');
    assert.equal(request.args.filter((argument) => argument.startsWith('--auto-submit')).length, 1);
  } else {
    assert.ok(!request.args.some((argument) => argument.startsWith('--auto-submit')));
  }
  assert.equal(request.env.STACKR_MOBILE_ENVIRONMENT, 'production');
  assert.equal(request.env.STACKR_OWNER_RECOGNITION_BUILD, String(profile === 'production-owner'));
  assert.equal(request.env.EXPO_PUBLIC_OWNER_RECOGNITION_ENABLED, String(profile === 'production-owner'));
  assert.equal(result.receipt.autoSubmissionRequested, profile === 'production');
  assert.equal(result.receipt.build.status, 'IN_QUEUE', 'Acceptance cannot claim build completion or upload.');
}
const wrongSource = runBuildRequest('production', { expectedSource: 'c'.repeat(40) });
assert.match(wrongSource.error?.message ?? '', /does not match the frozen release revision/);
assert.equal(wrongSource.calls.length, 0, 'Source mismatch cannot queue a build or submission.');
assert.equal(wrongSource.receipt, null);
const wrongReceipt = runBuildRequest('production', { rowOverrides: { gitCommitHash: 'c'.repeat(40) } });
assert.match(wrongReceipt.error?.message ?? '', /receipt does not match the frozen release identity/);
assert.equal(wrongReceipt.receipt, null, 'A different provider build cannot become the accepted release receipt.');
const failedCommand = runBuildRequest('production', { commandStatus: 1 });
assert.match(failedCommand.error?.message ?? '', /EAS did not complete the reviewed iOS release request/);
assert.match(failedCommand.error.message, /Check for an existing frozen-source build before retrying/);
assert.equal(failedCommand.calls.length, 1, 'An ambiguous provider failure cannot automatically queue another build.');
assert.equal(failedCommand.receipt, null, 'A failed provider command cannot create an accepted release receipt.');
const verificationUpload = workflow.slice(workflow.indexOf('- name: Upload verification-only receipt'));
assert.match(verificationUpload, /if: \$\{\{ success\(\) && inputs\.verify_only \}\}/);
assert.match(verificationUpload, /path: outputs\/releases\/mobile-delivery-receipt\.json/);
assert.doesNotMatch(verificationUpload, /frozen-ios-build-receipt|eas-cli/);
assert.match(workflow, /- name: Upload non-secret native build receipt\n\s*if: \$\{\{ success\(\) && !inputs\.verify_only \}\}/);

const before = { ...process.env };
try {
  Object.assign(process.env, eas.build.production.env, {
    STACKR_OWNER_RECOGNITION_BUILD: 'false',
    EXPO_PUBLIC_OWNER_RECOGNITION_ENABLED: 'false',
  });
  const resolved = require('../app.config.js')({ config });
  assert.equal(resolved.extra.stackrRuntime.environment, 'production');
  assert.equal(resolved.extra.stackrRuntime.appVariant, 'production');
  assert.deepEqual(resolved.runtimeVersion, config.runtimeVersion);
  assert.equal(resolved.ios.bundleIdentifier, config.ios.bundleIdentifier);
  assert.notEqual(process.env.STACKR_OWNER_RECOGNITION_BUILD, 'true');
  assert.notEqual(process.env.EXPO_PUBLIC_OWNER_RECOGNITION_ENABLED, 'true');
} finally {
  for (const key of Object.keys(process.env)) if (!(key in before)) delete process.env[key];
  Object.assign(process.env, before);
}

console.log('The frozen iOS workflow preserves owner controls and requests auto-submission only for normal production.');
