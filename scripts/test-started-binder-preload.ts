import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ts from 'typescript';
import type { BinderRecord } from '../lib/binders';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function main() {
  const tasks: { run: () => void; cancelled: boolean }[] = [];
  const calls: { owner: string; rows: BinderRecord[]; isCurrent: () => boolean }[] = [];
  const module = { exports: {} as Record<string, any> };
  const source = ts.transpileModule(readFileSync('hooks/useStartedBinderPreload.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  runInNewContext(source, {
    module, exports: module.exports, Promise,
    require(name: string) {
      if (name === 'react') return React;
      if (name === 'react-native') return { InteractionManager: {
        runAfterInteractions(run: () => void) {
          const task = { run, cancelled: false }; tasks.push(task);
          return { cancel() { task.cancelled = true; } };
        },
      } };
      if (name === '../lib/binderReopenRuntime') return {
        preloadBinderReopenViews: async (rows: BinderRecord[], owner: string, isCurrent: () => boolean) => calls.push({ owner, rows, isCurrent }),
      };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  const records = (owner: string): BinderRecord[] => [{
    id: '11111111-1111-4111-8111-111111111111', user_id: owner, type: 'custom', name: 'Started binder',
    color: '#fff', source_set_id: null, is_public: false, created_at: '2026-10-16T00:00:00Z',
  }];
  const Probe = (props: { rows: BinderRecord[]; owner: string | null; enabled: boolean }) => {
    module.exports.useStartedBinderPreload(props.rows, props.owner, props.enabled);
    return React.createElement('ReadyLibrary');
  };
  const runTasks = async () => {
    await act(async () => { for (const task of tasks.splice(0)) if (!task.cancelled) task.run(); });
  };
  let root!: ReactTestRenderer;
  const rowsA = records('owner-a');
  await act(async () => { root = create(React.createElement(Probe, { rows: rowsA, owner: 'owner-a', enabled: true })); });
  assert.ok(root.root.findByType('ReadyLibrary' as any), 'the library renders before any background work');
  assert.equal(calls.length, 0, 'preparing contents never blocks the first library paint');
  await runTasks();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].owner, 'owner-a');
  assert.equal(calls[0].rows, rowsA, 'the exact started binder list reaches the existing private loader');
  assert.equal(calls[0].isCurrent(), true);
  const rowsB = records('owner-b');
  await act(async () => { root.update(React.createElement(Probe, { rows: rowsB, owner: 'owner-b', enabled: true })); });
  assert.equal(calls[0].isCurrent(), false, 'account switching revokes already-started work');
  await runTasks();
  assert.equal(calls[1].owner, 'owner-b');
  await act(async () => { root.update(React.createElement(Probe, { rows: rowsB, owner: 'owner-b', enabled: false })); });
  assert.equal(calls[1].isCurrent(), false, 'entering saved read-only mode cancels background network preparation');
  await runTasks();
  assert.equal(calls.length, 2, 'saved read-only mode starts no remote reads');
  await act(async () => { root.update(React.createElement(Probe, { rows: rowsB, owner: null, enabled: true })); });
  assert.equal(tasks.length, 0, 'signed-out views do not schedule work');
  await act(async () => { root.update(React.createElement(Probe, { rows: rowsA, owner: 'owner-a', enabled: true })); });
  const queued = tasks[0];
  await act(async () => { root.unmount(); });
  assert.equal(queued.cancelled, true, 'unmount cancels queued work');
  await runTasks();
  assert.equal(calls.length, 2);
  console.log('Started binder preload passed: immediate rendering, direct-library preparation, account switch, read-only mode, and unmount cancellation.');
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
