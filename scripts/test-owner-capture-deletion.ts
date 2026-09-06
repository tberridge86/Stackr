import assert from 'node:assert/strict';
import { deleteOwnerCaptureWithEnvironment, type OwnerCaptureDeletionEnvironment } from '../lib/ownerCaptureDeletion';
import { ownerCaptureDirectory } from '../lib/ownerRecognitionCore';

const owner = '309453d1-52a2-4f40-81e4-27ae69b520fa';
const other = '409453d1-52a2-4f40-81e4-27ae69b520fa';
const directory = ownerCaptureDirectory('file:///documents/', owner);

async function main() {
  for (const nextOwner of [other, null]) {
    let currentOwner: string | null = owner;
    const deleted: string[] = [];
    let finishGetUser!: (value: string) => void;
    const delayedGetUser = new Promise<string>((resolve) => { finishGetUser = resolve; });
    const environment: OwnerCaptureDeletionEnvironment = {
      verifiedLocalDirectory: async (expected) => {
        assert.equal(expected, owner);
        // The server request began as owner A and returns A after the switch.
        const returnedOwner = await delayedGetUser;
        assert.equal(returnedOwner, owner);
        return directory;
      },
      assertCurrentOwner: async (expected) => {
        if (currentOwner !== expected) throw new Error('OWNER_SIGN_IN_REQUIRED');
      },
      deleteDirectory: async (path) => { deleted.push(path); },
    };
    const pending = deleteOwnerCaptureWithEnvironment(owner, 'capture-1', environment);
    const rejected = assert.rejects(pending, /OWNER_SIGN_IN_REQUIRED/);
    currentOwner = nextOwner;
    finishGetUser(owner);
    await rejected;
    assert.deepEqual(deleted, [], 'Account switch/sign-out must prevent filesystem deletion');
  }

  const calls: string[] = [];
  const happy: OwnerCaptureDeletionEnvironment = {
    verifiedLocalDirectory: async (expected) => { assert.equal(expected, owner); calls.push('getUser'); return directory; },
    assertCurrentOwner: async (expected) => { assert.equal(expected, owner); calls.push('getSession'); },
    deleteDirectory: async (path) => { calls.push(path); },
  };
  await deleteOwnerCaptureWithEnvironment(owner, 'capture-1', happy);
  assert.deepEqual(calls, ['getUser', 'getSession', `${directory}capture-1/`]);
  for (const id of ['', '..', '../capture-1', 'capture/1', 'CAPTURE', 'capture%2f1', 'capture\\1']) {
    calls.length = 0;
    await assert.rejects(deleteOwnerCaptureWithEnvironment(owner, id, happy), /Invalid capture identifier/);
    assert.deepEqual(calls, [], 'Invalid IDs must fail before auth or filesystem operations');
  }
  calls.length = 0;
  await assert.rejects(deleteOwnerCaptureWithEnvironment(owner, 'capture-1', {
    ...happy, verifiedLocalDirectory: async () => { throw new Error('Server identity rejected'); },
  }), /Server identity rejected/);
  assert.deepEqual(calls, [], 'Current-session check must not replace server verification');
  console.log('Owner capture deletion: delayed auth account switch/sign-out, exact path, invalid IDs and server rejection passed.');
}
void main();
