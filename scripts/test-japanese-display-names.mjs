import assert from 'node:assert/strict';
import {
  getEnglishCardDisplayName,
  getEnglishSetDisplayName,
  getPreferredSetDisplayName,
} from '../backend/lib/cardDisplayNames.js';

assert.equal(
  getEnglishSetDisplayName({
    id: 'ja:SV2a',
    sourceId: 'SV2a',
    setCode: 'SV2a',
    language: 'ja',
    region: 'japan',
    localName: 'provider-local-title',
  }),
  'Pokemon Card 151'
);

assert.equal(
  getPreferredSetDisplayName({
    id: 'ja:SV11B',
    sourceId: 'SV11B',
    setCode: 'SV11B',
    language: 'ja',
    region: 'japan',
    localName: 'provider-local-title',
  }),
  'Black Bolt'
);

assert.equal(
  getPreferredSetDisplayName({
    id: 'ja:S12a',
    sourceId: 'S12a',
    setCode: 'S12a',
    language: 'ja',
    region: 'japan',
    localName: 'VSTARユニバース',
  }),
  'VSTAR Universe'
);

assert.equal(
  getPreferredSetDisplayName({
    id: 'ja:MC',
    sourceId: 'MC',
    setCode: 'MC',
    language: 'ja',
    region: 'japan',
    localName: 'スタートデッキ100 バトルコレクション',
  }),
  'Starter Deck 100 Battle Collection'
);

assert.equal(
  getEnglishCardDisplayName({
    id: 'ja:SV2a-003',
    sourceId: 'SV2a-003',
    setId: 'ja:SV2a',
    collectorNumber: '003',
    language: 'ja',
    region: 'japan',
    localName: 'local ex',
    raw: { dexId: [3] },
  }),
  'Venusaur ex'
);

console.log('Japanese display-name helpers passed');
