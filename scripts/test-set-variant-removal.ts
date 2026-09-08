import assert from 'node:assert/strict';
import { isSetVariantQuantitySchemaUnavailable } from '../lib/setVariantRemoval';

assert.equal(isSetVariantQuantitySchemaUnavailable({ message: 'column quantity does not exist' }), true);
assert.equal(isSetVariantQuantitySchemaUnavailable({ message: 'Schema cache is missing the quantity field' }), true);
assert.equal(isSetVariantQuantitySchemaUnavailable({ message: 'Saved quantity changed in another session' }), false);
assert.equal(isSetVariantQuantitySchemaUnavailable({ message: 'Permission denied for user_card_variants' }), false);

console.log('Set variant quantity schema error mapping checks passed');
