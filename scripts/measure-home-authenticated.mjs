import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createMeasuredTransport, loadHomeReader, measureDependencyLoad, MeasurementError, publicKeyOnly,
  safeFailure, summarizeHttp, pinHomeReaderSource, assertFrozenSource, TARGETS, validateCredentials } from './lib/home-authenticated-measurement.mjs';

// Opt-in desktop service experiment. It does not render Home or mutate holdings.
// The prepared GET can update existing generation metadata; it needs its own acknowledgement.
export async function run(argv = process.argv.slice(2), { root = process.cwd(), fetchImpl = globalThis.fetch } = {}) {
  const values = new Map(), flags = new Set();
  const valueNames = new Set(['credentials-file', 'output', 'samples']);
  const flagNames = new Set(['execute', 'designated-qa-account', 'allow-prepared-generation-get', 'include-actions', 'help']);
  for (const argument of argv) {
    const match = argument.match(/^--([a-z-]+)(?:=(.*))?$/);
    if (!match || values.has(match[1]) || flags.has(match[1])) throw new MeasurementError('arguments_invalid');
    if (match[2] !== undefined && valueNames.has(match[1])) values.set(match[1], match[2]);
    else if (match[2] === undefined && flagNames.has(match[1])) flags.add(match[1]);
    else throw new MeasurementError('arguments_invalid');
  }
  const receipt = { kind: 'authenticated_home_service_dependency_comparison',
    startedAt: new Date().toISOString(), renderedScreen: false, networkPerformed: false,
    limitations: ['Desktop HTTPS service harness, not actual Home rendering or phone acceptance.',
      'Client-memory cold/warm only; origin/CDN/database cache state is not reset.',
      'Serial/concurrent schedules use the same shipped readers; they are not two installed application builds.',
      'Hub confirmation/auth sequence, partial/update price fallback, optional sections, images, local settings and persisted display are not measured.',
      'No real holding/binder edits, offline navigation or account switching are performed.',
      'The existing prepared GET may update/queue valuation generation metadata; no refresh POST is permitted.'] };
  if (flags.has('help')) return { ...receipt, state: 'preflight',
    usage: 'node scripts/measure-home-authenticated.mjs --credentials-file=<local-email-password-json> [--execute --designated-qa-account --allow-prepared-generation-get] [--samples=1..3] [--include-actions] [--output=<sanitized-receipt>]' };
  const credentialsPath = values.get('credentials-file');
  if (credentialsPath && values.has('output') && resolve(credentialsPath).toLowerCase() === resolve(values.get('output')).toLowerCase()) {
    throw new MeasurementError('output_credentials_collision');
  }
  let credentials = null;
  if (credentialsPath) {
    try {
      if (!statSync(credentialsPath).isFile() || statSync(credentialsPath).size > 16_384) throw new MeasurementError('credentials_invalid');
      credentials = validateCredentials(JSON.parse(readFileSync(credentialsPath, 'utf8')));
    } catch (error) { throw error instanceof MeasurementError ? error : new MeasurementError('credentials_unreadable'); }
  }
  if (!flags.has('execute') || !credentials) return { ...receipt, state: 'blocked',
    reason: credentials ? 'execution_not_requested' : 'designated_credentials_missing' };
  if (!flags.has('designated-qa-account')) throw new MeasurementError('designated_account_acknowledgement_required');
  if (!flags.has('allow-prepared-generation-get')) throw new MeasurementError('prepared_get_acknowledgement_required');
  const samples = Number(values.get('samples') ?? '1');
  if (!Number.isSafeInteger(samples) || samples < 1 || samples > 3) throw new MeasurementError('sample_budget_invalid');
  const environment = JSON.parse(readFileSync(resolve(root, 'eas.json'), 'utf8')).build.production.env;
  if (environment.STACKR_MOBILE_ENVIRONMENT !== 'production'
    || environment.STACKR_MOBILE_SUPABASE_URL !== TARGETS.supabase
    || environment.STACKR_MOBILE_API_URL.replace(/\/v1\/?$/, '') !== 'https://api.stackrtcg.com') throw new MeasurementError('production_config_mismatch');
  const key = publicKeyOnly(environment.STACKR_MOBILE_SUPABASE_PUBLISHABLE_KEY);
  const require = createRequire(resolve(root, 'package.json'));
  const { createClient } = require('@supabase/supabase-js');
  const pin = pinHomeReaderSource(root);
  const measurementDeviceId = randomUUID();
  const transport = createMeasuredTransport({ fetchImpl });
  const allHttp = () => { const totals = summarizeHttp(transport.records);
    return { requests: totals.requests, decodedBodyBytes: totals.decodedBodyBytes, categories: totals.categories }; };
  receipt.sourceRevision = pin.revision;
  let sdkFetch = transport.fetch;
  const supabase = createClient(TARGETS.supabase, key, { global: { fetch: (...args) => sdkFetch(...args) },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, debug: false } });
  const transportReader = loadHomeReader(root, supabase, pin);
  sdkFetch = transportReader.load('supabaseReadFetch').createSupabaseReadFetch({ supabaseUrl: TARGETS.supabase, fetchImpl: transport.fetch });
  try {
    const signed = await supabase.auth.signInWithPassword(credentials);
    credentials = null;
    if (signed.error || !signed.data.session) throw new MeasurementError('qa_sign_in_failed');
    const session = signed.data.session;
    transport.bindSession(session);
    const verified = await supabase.auth.getUser();
    if (verified.error || verified.data.user?.id !== session.user.id) throw new MeasurementError('qa_identity_verification_failed');
    const authenticatedCalls = [];
    const sdk = new Proxy(supabase, { get(target, name) {
      if (name !== 'auth') return Reflect.get(target, name);
      return new Proxy(target.auth, { get(auth, method) {
        const value = Reflect.get(auth, method);
        if (typeof value !== 'function') return value;
        return (...args) => { if (['getUser', 'getSession'].includes(method)) authenticatedCalls.push(method); return value.apply(auth, args); };
      } });
    } });
    receipt.networkPerformed = true;
    receipt.sourceRevision = pin.revision;
    receipt.samples = []; receipt.moduleBlobs = {};
    receipt.environment = { node: process.version, platform: process.platform, samplePairs: samples };
    receipt.unmeasuredActions = ['real-holding-edit', 'real-binder-edit', 'account-switch', 'offline-device', 'rendered-screen'];
    const scenarios = ['cold-client-memory', 'immediate-warm-return', ...(flags.has('include-actions') ? ['force-facts', 'local-invalidation'] : [])];
    for (let sample = 0; sample < samples; sample++) {
      const privateCold = new Map();
      const order = sample % 2 ? ['concurrent', 'serial'] : ['serial', 'concurrent'];
      for (const mode of order) {
        const reader = loadHomeReader(root, sdk, pin);
        try {
          const api = new (reader.load('stackrApiV1').StackrApiClient)({ baseUrl: TARGETS.api, fetchImpl: transport.fetch,
            getAccessToken: async () => (await sdk.auth.getSession()).data.session?.access_token ?? null,
            getDeviceId: async () => measurementDeviceId });
          for (const scenario of scenarios) {
            const firstAuth = authenticatedCalls.length;
            const value = await measureDependencyLoad({ mode, scenario, reader, supabase: sdk, api, transport, userId: session.user.id });
            value.report.authSdkCalls = Object.fromEntries(['getSession', 'getUser'].map(name => [name,
              authenticatedCalls.slice(firstAuth).filter(call => call === name).length]));
            receipt.samples.push({ sample: sample + 1, ...value.report });
            if ([401, 403].includes(value.report.prepared?.failure?.httpStatus)) {
              return { ...receipt, state: 'blocked', reason: 'qa_prepared_access_denied', httpAllActions: allHttp(), completedAt: new Date().toISOString() };
            }
            if (scenario === 'cold-client-memory') privateCold.set(mode, value);
          }
          for (const [name, blob] of Object.entries(reader.blobs)) {
            if (receipt.moduleBlobs[name] && receipt.moduleBlobs[name] !== blob) throw new MeasurementError('source_changed');
            receipt.moduleBlobs[name] = blob;
          }
        } finally { reader.close(); }
      }
      const serializeFacts = value => value ? JSON.stringify({ ...value, cardsByBinder: [...value.cardsByBinder] }) : null;
      const serial = privateCold.get('serial'), concurrent = privateCold.get('concurrent');
      receipt.samples.push({ sample: sample + 1, pairIntegrity: {
        bothFactsSucceeded: Boolean(serial.privateFacts && concurrent.privateFacts),
        exactFactsEqual: Boolean(serial.privateFacts && concurrent.privateFacts)
          && serializeFacts(serial.privateFacts) === serializeFacts(concurrent.privateFacts),
        samePreparedCollectionRevision: Boolean(serial.privatePrepared?.summary?.collectionRevision)
          && serial.privatePrepared.summary.collectionRevision === concurrent.privatePrepared?.summary?.collectionRevision,
      } });
    }
    assertFrozenSource(root, pin);
    receipt.state = 'measured'; receipt.httpAllActions = allHttp();
    receipt.completedAt = new Date().toISOString();
    return receipt;
  } catch (error) {
    return { ...receipt, state: 'failed', ...safeFailure(error), networkPerformed: transport.records.length > 0,
      httpAllActions: allHttp(), completedAt: new Date().toISOString() };
  } finally {
    // Session memory is discarded with this process. No remote logout/revocation.
    transportReader.close(); supabase.auth.stopAutoRefresh(); transport.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let receipt;
  // Vendor SDK diagnostics are not a receipt and may contain private errors.
  // The CLI emits only its structured allowlisted result after restoring logs.
  const vendorConsole = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = () => {};
  try { receipt = await run(); }
  catch (error) { receipt = { kind: 'authenticated_home_service_dependency_comparison', state: 'failed', networkPerformed: false, ...safeFailure(error) }; process.exitCode = 1; }
  finally { Object.assign(console, vendorConsole); }
  if (receipt.state === 'failed') process.exitCode = 1;
  const target = process.argv.find(argument => argument.startsWith('--output='))?.slice('--output='.length);
  try {
    const credentialTarget = process.argv.find(argument => argument.startsWith('--credentials-file='))?.slice('--credentials-file='.length);
    if (target && credentialTarget && resolve(target).toLowerCase() === resolve(credentialTarget).toLowerCase()) throw new MeasurementError('output_credentials_collision');
    if (target) writeFileSync(target, JSON.stringify(receipt, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' }); }
  catch { receipt = { ...receipt, outputFailed: true, outputFailure: 'output_exists_or_unwritable' }; process.exitCode = 1; }
  console.log(JSON.stringify(receipt, null, 2));
}
