import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectTcgdexReferencePersistenceImage } from '../lib/tcgdexReferencePersistence';

const controlled = 'https://assets.tcgdex.net/ja/cards/sv2a/157/low.webp';
const existing = 'https://catalogue.stackr.test/cards/157.webp';
assert.equal(selectTcgdexReferencePersistenceImage(controlled), null, 'a newly issued display reference must not persist');
assert.equal(selectTcgdexReferencePersistenceImage(controlled, existing), existing, 'an update must retain its existing stored value');
assert.equal(selectTcgdexReferencePersistenceImage('https://catalogue.stackr.test/cards/new.webp', existing), 'https://catalogue.stackr.test/cards/new.webp');
const scanResultSource = readFileSync('app/scan/result.tsx', 'utf8');
const collectionBatchSource = readFileSync('lib/collectionBatch.ts', 'utf8');
const compositeSaveSource = readFileSync('lib/scanCollectionVariantSave.ts', 'utf8');
assert.match(scanResultSource, /await saveScanCollectionVariant\(/, 'scan binder saves must enter the owner-bound composite save path');
assert.match(compositeSaveSource, /persistVerifiedCollectionBatchRecoveryIntent/,
  'composite saves must share the sanitized batch recovery intent');
assert.match(compositeSaveSource, /addOwnedCardBatchToBinder/);
assert.match(compositeSaveSource, /repairOwnedCardBatchActivity/);
assert.match(compositeSaveSource, /!intent\.historyOnly && intent\.variant/,
  'history-only repair must skip finish quantity writes');
assert.match(collectionBatchSource, /stripTcgdexReferenceBeforePersistence\(card\.imageUrl\)/, 'batch input must exclude a new controlled display reference');
assert.match(collectionBatchSource, /preserveExistingImageUrlBeforePersistence\([\s\S]{0,180}entry\.imageUrl,[\s\S]{0,180}existing\?\.image_url/, 'batch updates must retain the stored image baseline');
const listingSource = readFileSync('features/listing/CreateListingScreen.tsx', 'utf8');
assert.match(listingSource, /function listingCardForPersistence[\s\S]*?existing\?\.id === card\.id[\s\S]*?selectTcgdexReferencePersistenceImage\(card\.image_small, existingCard\?\.image_small\)/, 'listing drafts must exclude new display-only references while preserving the same card\'s stored image');
assert.match(listingSource, /selectedCard: listingCardForPersistence\(selectedCard, persistedDraftSelectedCardRef\.current\)/, 'listing draft serialization must use the preservation-aware projection');
assert.match(listingSource, /persistedDraftSelectedCardRef\.current = draftState\.selectedCard/, 'listing autosave must retain its last persisted image baseline');
assert.match(listingSource, /const stockImageUrl = selectTcgdexReferencePersistenceImage/, 'listing publication must exclude a controlled stock image');
const inventorySource = readFileSync('lib/inventory.ts', 'utf8');
assert.match(inventorySource, /function inventorySnapshotForPersistence[\s\S]*?selectTcgdexReferencePersistenceImage/, 'inventory snapshots must exclude controlled references');
assert.match(inventorySource, /function inventoryMovementForPersistence[\s\S]*?selectTcgdexReferencePersistenceImage/, 'inventory movements must exclude controlled references');
assert.match(inventorySource, /function inventorySaleForPersistence[\s\S]*?selectTcgdexReferencePersistenceImage/, 'inventory sales must exclude controlled references');
console.log('Binder image persistence preserves stored values and excludes display-only TCGdex references.');
