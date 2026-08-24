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

assert.equal(
  getEnglishCardDisplayName({
    id: 'ja:unknown:001',
    language: 'ja',
    localName: '謎のカード',
    englishDisplayName: '謎のカード',
  }),
  null,
  'native Japanese text must not be accepted from an English display field',
);

assert.equal(
  getEnglishCardDisplayName({
    id: 'zh-cn:test:025',
    language: 'zh-cn',
    localName: '皮卡丘',
    englishDisplayName: 'Pikachu',
  }),
  'Pikachu',
);

assert.equal(
  getEnglishCardDisplayName({
    id: 'fr:test:004',
    language: 'fr',
    localName: 'Salamèche',
  }),
  null,
  'a Latin-script foreign name must not be assumed to be English',
);

assert.equal(
  getEnglishSetDisplayName({
    id: 'zh-cn:test',
    language: 'zh-cn',
    localName: '朱&紫',
    englishDisplayName: '朱&紫',
  }),
  null,
  'native Chinese set text must not be accepted from an English display field',
);

console.log('Japanese display-name helpers passed');
