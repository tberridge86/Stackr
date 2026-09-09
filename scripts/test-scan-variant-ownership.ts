import assert from 'node:assert/strict';
import { createScannedVariantSaver, parseScannedVariantJournal, ScannedVariantConflictError, type ScannedVariantInput, type ScannedVariantStore } from '../lib/scanVariantOwnershipCore';

const input: ScannedVariantInput = {requestKey:'scan-1',userId:'owner-a',cardId:'card-a',setId:'set-a',variant:'holo',condition:'Near Mint',gradeCompany:'',grade:''};
function fixture(start: number | null = 2) {
  const journals = new Map<string,string>();
  const state = { quantity:start, writes:0, userId:input.userId, loseResponse:false, conflict:false, failJournal:false, failCommit:false };
  const store: ScannedVariantStore = {
    readJournal: async key=>journals.get(key)??null,
    writeJournal: async (key,value)=>{
      if(state.failJournal || (state.failCommit && JSON.parse(value).state==='committed')) throw new Error('storage unavailable');
      journals.set(key,value);
    },
    verifyUser: async userId=>{if(state.userId!==userId) throw new Error('account changed');},
    readQuantity: async()=>state.quantity,
    writeExpected: async journal=>{
      if(state.conflict){state.quantity=journal.expectedQuantity;throw new ScannedVariantConflictError('concurrent writer');}
      if(state.quantity!==journal.baselineQuantity) throw new ScannedVariantConflictError('compare failed');
      state.quantity=journal.expectedQuantity;state.writes++;
      if(state.loseResponse) throw new Error('response lost');
    },
  };
  return {state,journals,store,save:createScannedVariantSaver(store)};
}

async function run() {
  const normal=fixture();
  await normal.save(input);
  assert.equal(normal.state.quantity,3);
  await createScannedVariantSaver(normal.store)(input);
  assert.equal(normal.state.writes,1,'Restarting and retrying the same scan must not add a second copy.');
  normal.state.quantity=2;
  await createScannedVariantSaver(normal.store)(input);
  assert.equal(normal.state.quantity,2,'Retry must not undo a later deliberate quantity reduction.');
  normal.state.quantity=null;
  await normal.save(input);
  assert.equal(normal.state.quantity,null,'A committed scan must not recreate a subsequently removed variant.');

  const absent=fixture(null);
  await absent.save(input);
  assert.equal(absent.state.quantity,1,'The first copy creates a variant.');
  const zero=fixture(0);
  await zero.save(input);
  assert.equal(zero.state.quantity,1,'An existing zero row is updated, not mistaken for a missing row.');

  const ambiguous=fixture();ambiguous.state.loseResponse=true;
  await ambiguous.save(input);
  await createScannedVariantSaver(ambiguous.store)(input);
  assert.equal(ambiguous.state.writes,1,'A lost response reconciles without incrementing again.');

  const checkpoint=fixture();checkpoint.state.failCommit=true;
  await assert.rejects(checkpoint.save(input),/storage unavailable/);
  checkpoint.state.failCommit=false;
  await createScannedVariantSaver(checkpoint.store)(input);
  assert.equal(checkpoint.state.writes,1,'Failure to checkpoint an acknowledged write remains recoverable after restart.');

  const conflict=fixture();conflict.state.conflict=true;
  await assert.rejects(conflict.save(input),/concurrent writer/);
  conflict.state.conflict=false;
  await assert.rejects(createScannedVariantSaver(conflict.store)(input),/changed while this scan was pending/);
  assert.equal(conflict.state.writes,0,'A definitive conflicting write cannot be mistaken for this scan.');

  const storage=fixture();storage.state.failJournal=true;
  await assert.rejects(storage.save(input),/storage unavailable/);
  assert.equal(storage.state.writes,0,'A verified recovery journal is required before writing ownership.');
  const account=fixture();account.state.userId='owner-b';
  await assert.rejects(account.save(input),/account changed/);
  assert.equal(account.state.writes,0);

  const concurrent=fixture();
  await Promise.all([concurrent.save(input),concurrent.save({...input,requestKey:'scan-2'})]);
  assert.equal(concurrent.state.quantity,4,'Two separate physical copies within one app serialize and both count.');

  const conditionKey = (identity: Pick<ScannedVariantInput, 'condition' | 'gradeCompany' | 'grade'>) => `${identity.condition}:${identity.gradeCompany}:${identity.grade}`;
  const conditionRows = new Map<string, number>([['Near Mint::', 2], ['Played::', 5], ['Near Mint:PSA:10', 1]]);
  const conditionJournals = new Map<string, string>();
  const conditionStore: ScannedVariantStore = {
    readJournal: async key => conditionJournals.get(key) ?? null,
    writeJournal: async (key, value) => { conditionJournals.set(key, value); },
    verifyUser: async () => undefined,
    readQuantity: async identity => conditionRows.get(conditionKey(identity)) ?? null,
    writeExpected: async journal => { conditionRows.set(conditionKey(journal), journal.expectedQuantity); },
  };
  const saveCondition = createScannedVariantSaver(conditionStore);
  await saveCondition({ ...input, requestKey: 'near-mint-copy' });
  await saveCondition({ ...input, requestKey: 'played-copy', condition: 'Played' });
  assert.equal(conditionRows.get('Near Mint::'), 3, 'Only the selected raw condition row increments.');
  assert.equal(conditionRows.get('Played::'), 6, 'A separate condition keeps its own quantity.');
  const graded = { ...input, requestKey: 'graded-copy', gradeCompany: 'PSA', grade: '10' };
  await saveCondition(graded);
  assert.equal(conditionRows.get('Near Mint::'), 3, 'A graded identity is not merged into the raw row.');
  assert.equal(conditionRows.get('Near Mint:PSA:10'), 2, 'Only the intended graded row increments.');

  const journal={version:1,...input,baselineQuantity:2,expectedQuantity:3,state:'pending'};
  assert.throws(()=>parseScannedVariantJournal(JSON.stringify({...journal,expectedQuantity:undefined}),input),/does not match/);
  assert.throws(()=>parseScannedVariantJournal(JSON.stringify({...journal,baselineQuantity:1.5}),input),/does not match/);
  assert.throws(()=>parseScannedVariantJournal(JSON.stringify({...journal,requestKey:'different'}),input),/does not match/);
  assert.throws(()=>parseScannedVariantJournal(JSON.stringify({...journal,userId:'owner-b'}),input),/does not match/);
  assert.throws(()=>parseScannedVariantJournal(JSON.stringify({...journal,condition:'Played'}),input),/does not match/);
  console.log('Scan variant persistence: restart, later removal, missing/zero rows, response loss, checkpoint failure, concurrency, identity and corruption checks passed.');
}
void run().catch(error=>{console.error(error);process.exitCode=1;});
