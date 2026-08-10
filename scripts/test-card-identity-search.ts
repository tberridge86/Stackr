import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  createDeterministicSearchRecords,
  exactFlatCardIdentitySearch,
} from '../lib/cardIdentitySearchReference';

function runPythonReference(request: Record<string, unknown>) {
  const input = JSON.stringify(request);
  const attempts = [
    ['python', ['scripts/reference-card-identity-search.py']],
    ['python3', ['scripts/reference-card-identity-search.py']],
    ['py', ['-3', 'scripts/reference-card-identity-search.py']],
  ] as const;

  for (const [command, args] of attempts) {
    const result = spawnSync(command, args, {
      input,
      encoding: 'utf8',
      shell: false,
    });
    if (result.status === 0 && result.stdout.trim()) {
      return JSON.parse(result.stdout) as {
        status: 'success' | 'empty';
        searchedCount: number;
        candidateCount: number;
        candidates: Array<{ canonicalCardId: string; similarity: number; rank: number }>;
      };
    }
    if (result.error && 'code' in result.error && result.error.code === 'ENOENT') {
      continue;
    }
    const stderr = result.stderr.trim();
    if (
      stderr.includes('Python was not found') ||
      stderr.includes('Could not find files for the given pattern')
    ) {
      continue;
    }
    if (stderr) {
      throw new Error(stderr);
    }
  }

  return null;
}

const records = createDeterministicSearchRecords(512);
const queryIndex = 117;
const queryEmbedding = records[queryIndex].embedding;

const unfiltered = exactFlatCardIdentitySearch({
  queryEmbedding,
  records,
  topK: 5,
});
assert.equal(unfiltered.status, 'success');
assert.equal(unfiltered.candidates[0].canonicalCardId, records[queryIndex].canonicalCardId);
assert.equal(unfiltered.candidates[0].rank, 1);
assert.ok(unfiltered.candidates[0].similarity > 0.999);

const filtered = exactFlatCardIdentitySearch({
  queryEmbedding,
  records,
  topK: 3,
  filters: {
    language: records[queryIndex].language,
    setId: records[queryIndex].setId,
    collectorNumber: records[queryIndex].collectorNumber,
    era: records[queryIndex].era,
  },
});
assert.equal(filtered.status, 'success');
assert.equal(filtered.candidates[0].canonicalCardId, records[queryIndex].canonicalCardId);
assert.equal(
  filtered.candidates.every((candidate) => candidate.language === records[queryIndex].language),
  true
);

const noMatches = exactFlatCardIdentitySearch({
  queryEmbedding,
  records,
  topK: 3,
  filters: { language: 'missing-language' },
});
assert.equal(noMatches.status, 'empty');
assert.equal(noMatches.candidates.length, 0);
assert.equal(noMatches.searchedCount, 0);

const invalidQuery = exactFlatCardIdentitySearch({
  queryEmbedding: [1, 2, 3],
  records,
  topK: 3,
});
assert.equal(invalidQuery.status, 'failed');
assert.match(invalidQuery.message ?? '', /Expected 128 embedding dimensions/);

const pythonRequest = {
  count: 512,
  dimensions: 128,
  queryIndex,
  topK: 10,
  filters: {
    language: records[queryIndex].language,
    setId: records[queryIndex].setId,
  },
};
const jsResult = exactFlatCardIdentitySearch({
  queryEmbedding,
  records,
  topK: 10,
  filters: pythonRequest.filters,
});
const pythonResult = runPythonReference(pythonRequest);

if (pythonResult) {
  assert.equal(jsResult.status, pythonResult.status);
  assert.equal(jsResult.searchedCount, pythonResult.searchedCount);
  assert.deepEqual(
    jsResult.candidates.map((candidate) => candidate.canonicalCardId),
    pythonResult.candidates.map((candidate) => candidate.canonicalCardId)
  );
  for (let index = 0; index < jsResult.candidates.length; index += 1) {
    assert.ok(
      Math.abs(jsResult.candidates[index].similarity - pythonResult.candidates[index].similarity) < 1e-12,
      `candidate ${index} similarity differed from Python reference`
    );
  }
} else {
  console.warn('Python reference parity skipped: no usable Python interpreter is available in this environment.');
}

console.log('Card identity exact-search reference tests passed.');
