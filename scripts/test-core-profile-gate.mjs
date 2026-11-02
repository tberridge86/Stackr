import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function loadActual(file, dependencies) {
  const module = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
  }).outputText;
  vm.runInNewContext(compiled, {
    module, exports: module.exports, console, Error,
    require(id) {
      assert.ok(Object.hasOwn(dependencies, id), 'Unexpected dependency: ' + id);
      return dependencies[id];
    },
  }, { filename: file });
  return module.exports;
}

async function fixture(initiallyEnabled = false) {
  let auth = { user: { id: 'A' }, loading: false };
  let current;
  let renderer;
  const reads = [];
  const writes = [];
  const state = loadActual('lib/profileLoadState.ts', {});
  const profile = loadActual('components/profile-context.tsx', {
    react: React,
    './auth-context': { useAuth: () => auth },
    '../lib/profileLoadState': state,
    // Transport completion is explicitly controlled; the timeout utility is
    // unrelated to the provider's enabled/account/request-generation guards.
    '../lib/startup': { withStartupTimeout: promise => promise },
    '../lib/supabase': {
      supabase: {
        from(table) {
          assert.equal(table, 'profiles');
          let account;
          return {
            select(columns) { assert.equal(columns, '*'); return this; },
            eq(column, value) { assert.equal(column, 'id'); account = value; return this; },
            maybeSingle() {
              let resolve;
              const promise = new Promise(done => { resolve = done; });
              reads.push({ account, resolve });
              return promise;
            },
            async upsert(value) { writes.push(value); return { error: null }; },
          };
        },
      },
    },
  });
  function Consumer() { current = profile.useProfile(); return null; }
  const element = enabled => React.createElement(profile.ProfileProvider, { enabled }, React.createElement(Consumer));
  await act(async () => { renderer = Renderer.create(element(initiallyEnabled)); });
  return {
    reads, writes,
    get current() { return current; },
    async render(enabled, account = auth.user.id, loading = false) {
      auth = { user: { id: account }, loading };
      await act(async () => { renderer.update(element(enabled)); });
    },
    async settle(index, data, error = null) {
      await act(async () => { reads[index].resolve({ data, error }); });
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

let scenarios = 0;
async function scenario(initiallyEnabled, run) {
  const f = await fixture(initiallyEnabled);
  try { await run(f); scenarios++; }
  finally { await f.close(); }
}

await scenario(false, async f => {
  assert.equal(f.reads.length, 0);
  assert.equal(f.current.profile, null);
  assert.equal(f.current.loading, false);
  assert.equal(f.current.error, null);
  await act(async () => { await f.current.refreshProfile(); });
  assert.ok((await f.current.updateProfile({ collector_name: 'Blocked' })).error);
  await f.current.setFavoriteCard('card-A', 'set-A');
  await f.current.setChaseCard('card-A', 'set-A');
  assert.equal(f.reads.length, 0, 'Disabled callbacks cannot start profile reads');
  assert.equal(f.writes.length, 0, 'Disabled editing/favorite/chase callbacks cannot write');
});

await scenario(false, async f => {
  await f.render(true);
  assert.equal(f.reads.length, 1);
  assert.equal(f.reads[0].account, 'A');
  assert.equal(f.current.loading, true);
  await f.settle(0, { id: 'A', collector_name: 'Current A' });
  assert.equal(f.current.profile.id, 'A');
  assert.equal(f.current.loading, false);
  const oldRefresh = f.current.refreshProfile;
  const oldUpdate = f.current.updateProfile;
  await f.render(false);
  await oldRefresh();
  assert.ok((await oldUpdate({ collector_name: 'Blocked stale callback' })).error);
  assert.equal(f.reads.length, 1, 'An enabled callback captured before disabling cannot refresh');
  assert.equal(f.writes.length, 0, 'An enabled callback captured before disabling cannot write');
  assert.equal(f.current.profile, null);
});

for (const failed of [false, true]) await scenario(true, async f => {
  assert.equal(f.reads.length, 1);
  await f.render(false);
  await f.settle(0, failed ? null : { id: 'A', collector_name: 'Late A' }, failed ? new Error('Unavailable') : null);
  assert.equal(f.current.profile, null);
  assert.equal(f.current.loading, false);
  assert.equal(f.current.error, null, 'A disabled request cannot publish success or failure');
});

await scenario(true, async f => {
  await f.render(true, 'B');
  assert.deepEqual(f.reads.map(read => read.account), ['A', 'B']);
  await f.settle(0, { id: 'A', collector_name: 'Old A' });
  assert.equal(f.current.profile, null, 'A response cannot populate the B account');
  await f.settle(1, { id: 'B', collector_name: 'Current B' });
  assert.equal(f.current.profile.id, 'B');
});

await scenario(true, async f => {
  await f.render(true, 'B');
  await f.render(true, 'A');
  assert.deepEqual(f.reads.map(read => read.account), ['A', 'B', 'A']);
  await f.settle(2, { id: 'A', collector_name: 'Newest A' });
  await f.settle(0, { id: 'A', collector_name: 'Stale initial A' });
  await f.settle(1, { id: 'B', collector_name: 'Stale B' });
  assert.equal(f.current.profile.collector_name, 'Newest A', 'A-to-B-to-A rejects the earlier same-account generation');
});

await scenario(true, async f => {
  await f.render(false);
  await f.render(true);
  assert.equal(f.reads.length, 2);
  await f.settle(1, { id: 'A', collector_name: 'Re-enabled A' });
  await f.settle(0, { id: 'A', collector_name: 'Before disabling' });
  assert.equal(f.current.profile.collector_name, 'Re-enabled A', 'Re-enabling cannot revive an older request');
});

console.log('PASS ' + scenarios + ' actual ProfileProvider/profileLoadState disabled-I/O, late-response and account-generation scenarios');
