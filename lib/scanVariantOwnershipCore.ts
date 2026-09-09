export type ScannedVariantIdentity = Readonly<{
  userId: string; cardId: string; setId: string; variant: string;
  condition: string; gradeCompany: string; grade: string;
}>;
export type ScannedVariantInput = ScannedVariantIdentity & Readonly<{ requestKey: string }>;
export type VariantJournal = ScannedVariantInput & Readonly<{
  version: 1;
  baselineQuantity: number | null;
  expectedQuantity: number;
  state: 'pending' | 'committed' | 'blocked';
}>;
export type ScannedVariantJournalDecision = 'replay' | 'resume' | 'block';
export class ScannedVariantConflictError extends Error {}

export type ScannedVariantStore = {
  readJournal: (key: string) => Promise<string | null>;
  writeJournal: (key: string, value: string) => Promise<void>;
  readQuantity: (identity: ScannedVariantIdentity) => Promise<number | null>;
  writeExpected: (journal: VariantJournal) => Promise<void>;
  verifyUser: (userId: string) => Promise<void>;
};

function validQuantity(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function decideScannedVariantJournal(input: {
  baselineQuantity: number | null; expectedQuantity: number; currentQuantity: number | null;
  state?: VariantJournal['state'];
}): ScannedVariantJournalDecision {
  if ((input.baselineQuantity !== null && !validQuantity(input.baselineQuantity))
    || !validQuantity(input.expectedQuantity)
    || input.expectedQuantity !== (input.baselineQuantity ?? 0) + 1
    || (input.currentQuantity !== null && !validQuantity(input.currentQuantity))) return 'block';
  if (input.state === 'blocked') return 'block';
  // A completed operation stays completed after later edits or removal by the user.
  if (input.state === 'committed') return 'replay';
  if (input.currentQuantity === input.expectedQuantity) return 'replay';
  if (input.currentQuantity === input.baselineQuantity) return 'resume';
  return 'block';
}

function normalizeInput(input: ScannedVariantInput): ScannedVariantInput {
  const result = { ...input };
  for (const field of ['requestKey', 'userId', 'cardId', 'setId', 'variant', 'condition'] as const) {
    if (typeof input[field] !== 'string' || !input[field].trim()) throw new Error('The scan ownership identity is incomplete.');
    result[field] = input[field].trim();
  }
  if (typeof input.gradeCompany !== 'string' || typeof input.grade !== 'string') {
    throw new Error('The scan ownership identity is incomplete.');
  }
  // Raw cards deliberately use empty grade fields, while condition is always part of ownership identity.
  result.gradeCompany = String(input.gradeCompany ?? '').trim();
  result.grade = String(input.grade ?? '').trim();
  return result;
}

export function parseScannedVariantJournal(raw: string | null, input: ScannedVariantInput): VariantJournal | null {
  if (raw === null) return null;
  let journal: VariantJournal;
  try { journal = JSON.parse(raw); }
  catch { throw new Error('Saved variant recovery data could not be verified.'); }
  if (!journal || journal.version !== 1 || !['pending', 'committed', 'blocked'].includes(journal.state)
    || (journal.baselineQuantity !== null && !validQuantity(journal.baselineQuantity))
    || !validQuantity(journal.expectedQuantity)
    || journal.expectedQuantity !== (journal.baselineQuantity ?? 0) + 1
    || (['requestKey', 'userId', 'cardId', 'setId', 'variant', 'condition', 'gradeCompany', 'grade'] as const).some(field=>journal[field] !== input[field])) {
    throw new Error('Saved variant recovery data does not match this scan. Reopen the review before trying again.');
  }
  return journal;
}

export function createScannedVariantSaver(store: ScannedVariantStore) {
  const operations = new Map<string, Promise<unknown>>();
  const persist = async (key: string, journal: VariantJournal) => {
    const serialized = JSON.stringify(journal);
    await store.writeJournal(key, serialized);
    if (await store.readJournal(key) !== serialized) throw new Error('Variant ownership recovery data could not be saved.');
  };
  const save = async (input: ScannedVariantInput): Promise<{ replayed: boolean; quantity: number }> => {
    await store.verifyUser(input.userId);
    const journalKey = input.userId + ':' + input.requestKey;
    let journal = parseScannedVariantJournal(await store.readJournal(journalKey), input);
    const current = await store.readQuantity(input);
    if (current !== null && !validQuantity(current)) throw new Error('The saved variant quantity could not be verified.');
    const decision = journal ? decideScannedVariantJournal({ ...journal, currentQuantity: current }) : null;
    if (journal && decision === 'replay') {
      if (journal.state !== 'committed') await persist(journalKey, { ...journal, state: 'committed' });
      return { replayed: true, quantity: current ?? 0 };
    }
    if (journal && decision === 'block') throw new ScannedVariantConflictError('Variant quantity changed while this scan was pending. Check the collection before trying again.');
    if (!journal) {
      journal = { version: 1, ...input, baselineQuantity: current, expectedQuantity: (current ?? 0) + 1, state: 'pending' };
      await persist(journalKey, journal);
    }
    await store.verifyUser(input.userId);
    try {
      await store.writeExpected(journal);
    } catch (error) {
      if (error instanceof ScannedVariantConflictError) {
        await persist(journalKey, { ...journal, state: 'blocked' });
        throw error;
      }
      // Recover a lost response only when the persisted expected quantity is visible.
      // A definitive compare-and-set conflict above never takes this recovery path.
      await store.verifyUser(input.userId);
      if (await store.readQuantity(input) !== journal.expectedQuantity) throw error;
    }
    await persist(journalKey, { ...journal, state: 'committed' });
    return { replayed: false, quantity: journal.expectedQuantity };
  };
  return (rawInput: ScannedVariantInput) => {
    const input = normalizeInput(rawInput);
    const identityKey = JSON.stringify([input.userId, input.cardId, input.setId, input.variant, input.condition, input.gradeCompany, input.grade]);
    const operation = (operations.get(identityKey) ?? Promise.resolve()).catch(()=>undefined).then(()=>save(input));
    operations.set(identityKey, operation);
    const clear = () => { if (operations.get(identityKey) === operation) operations.delete(identityKey); };
    void operation.then(clear, clear);
    return operation;
  };
}
