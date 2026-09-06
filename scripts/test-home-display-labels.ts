import assert from 'node:assert/strict';
import {
  getHomeActivityDisplayTitle,
  getHomeCardDisplayName,
  getHomeCardLanguageLabel,
  getHomeCardSetDisplayName,
} from '../lib/homeDisplayLabels';

assert.equal(getHomeCardDisplayName({ name: 'ナゾノクサ', englishName: 'Oddish', language: 'ja' }), 'Oddish');
assert.equal(getHomeCardDisplayName({ name: '皮卡丘', englishName: 'Pikachu', language: 'zh-tw' }), 'Pikachu');
assert.equal(getHomeCardDisplayName({ name: '이상해씨', englishName: 'Bulbasaur', language: 'ko' }), 'Bulbasaur');
assert.equal(getHomeCardDisplayName({ name: 'Oddish', language: 'ja' }), 'Japanese card', 'A foreign-language record needs explicit English metadata, not a script guess');
assert.equal(getHomeCardDisplayName({ name: 'Dracaufeu', language: 'fr' }), 'French card');
assert.equal(getHomeCardDisplayName({ name: 'Glurak', language: 'de' }), 'German card');
assert.equal(getHomeCardDisplayName({ name: 'Dracaufeu', englishName: 'Charizard', language: 'fr' }), 'Charizard');
assert.equal(getHomeCardDisplayName({ name: 'Oddish' }), 'Oddish');
assert.equal(getHomeCardDisplayName({ name: 'ナゾノクサ', language: 'ja' }), 'Japanese card');
assert.equal(getHomeCardDisplayName({ name: '皮卡丘', language: 'zh-tw' }), 'Traditional Chinese card');
assert.equal(getHomeCardDisplayName({ name: '妙蛙种子', language: 'zh-cn' }), 'Simplified Chinese card');
assert.equal(getHomeCardDisplayName({ name: 'Пикачу', language: 'ru' }), 'Russian card');
assert.equal(getHomeCardDisplayName({ name: 'ナゾノクサ', englishName: 'Oddish ナゾノクサ', language: 'ja' }), 'Japanese card');
assert.equal(getHomeCardDisplayName({ name: null, englishName: null }), 'English name unavailable');
assert.equal(getHomeCardDisplayName({ name: '001' }), 'English name unavailable', 'A number is not an English card name');
for (const name of ['Pikachu', 'Flabébé', 'Farfetch’d', 'Nidoran♀', 'Mr. Mime', 'Charizard ex', 'Ho-Oh', 'Type: Null']) {
  assert.equal(getHomeCardDisplayName({ name, language: 'en' }), name);
}
assert.equal(getHomeCardDisplayName({ name: 'Oddish\u202e', language: 'en' }), 'English name unavailable');

assert.equal(getHomeCardLanguageLabel('en-GB'), null);
assert.equal(getHomeCardLanguageLabel(null), null);
assert.equal(getHomeCardLanguageLabel('unknown'), null);
assert.equal(getHomeCardLanguageLabel('ja-JP'), 'Japanese');
assert.equal(getHomeCardLanguageLabel('zh_Hant_TW'), 'Traditional Chinese');
assert.equal(getHomeCardLanguageLabel('zh-Hans'), 'Simplified Chinese');
assert.equal(getHomeCardLanguageLabel('zh'), 'Chinese', 'Do not guess a Chinese script for an unspecified language');

assert.equal(getHomeCardSetDisplayName({ setName: 'バトルリージョン', language: 'ja', englishSetSupplement: {
  value: 'Battle Region', label: 'English set:', authoritative: false,
} }), 'Battle Region');
assert.equal(getHomeCardSetDisplayName({ setName: 'バトルリージョン', language: 'ja', englishSetSupplement: {
  value: 'Battle Region', label: 'English translation:', authoritative: false,
} }), 'Battle Region (translation draft)');
assert.equal(getHomeCardSetDisplayName({ setName: 'バトルリージョン', language: 'ja', englishSetSupplement: {
  value: 'Battle Region', label: 'English set:', status: 'model_translation_draft', authoritative: false,
} }), 'Battle Region (translation draft)', 'Draft status must not be presented as an official English set name');
assert.equal(getHomeCardSetDisplayName({ setName: '151', language: 'en' }), '151');
assert.equal(getHomeCardSetDisplayName({ setName: '151', language: 'ja' }), '151', 'Numeric set labels do not need translation');
assert.equal(getHomeCardSetDisplayName({ setName: 'Battle Region', language: 'ja' }), 'Japanese set');
assert.equal(getHomeCardSetDisplayName({ setName: 'Écarlate et Violet', language: 'fr' }), 'French set');
assert.equal(getHomeCardSetDisplayName({ setName: 'バトルリージョン', language: 'ja' }), 'Japanese set');
assert.equal(getHomeCardSetDisplayName({ setName: null }), 'English set name unavailable');

assert.equal(getHomeActivityDisplayTitle({ title: 'Added ナゾノクサ to your chase list', cardName: 'ナゾノクサ', englishName: 'Oddish', language: 'ja' }), 'Added Oddish to your chase list');
assert.equal(getHomeActivityDisplayTitle({ title: 'Added ナゾノクサ to your chase list', cardName: 'ナゾノクサ', language: 'ja' }), 'Collection activity');
assert.equal(getHomeActivityDisplayTitle({ title: 'Added ナゾノクサ to バインダー', cardName: 'ナゾノクサ', englishName: 'Oddish' }), 'Collection activity', 'Do not leave other native-script words in a mixed title');
assert.equal(getHomeActivityDisplayTitle({ title: 'Added ナゾノクサ', cardName: 'クサイハナ', englishName: 'Gloom' }), 'Collection activity', 'Only an exact recorded name fragment may be replaced');
assert.equal(getHomeActivityDisplayTitle({ title: 'Added Pikachu to your binder', cardName: 'Pikachu', language: 'en' }), 'Added Pikachu to your binder');
assert.equal(getHomeActivityDisplayTitle({ title: 'Added Dracaufeu to your binder', cardName: 'Dracaufeu', language: 'fr' }), 'Collection activity');
assert.equal(getHomeActivityDisplayTitle({ title: 'Added Dracaufeu to your binder', cardName: 'Dracaufeu', englishName: 'Charizard', language: 'fr' }), 'Added Charizard to your binder');
assert.equal(getHomeActivityDisplayTitle({ title: 'Added カード[ex]', cardName: 'カード[ex]', englishName: 'Mew ex' }), 'Added Mew ex');
assert.equal(getHomeActivityDisplayTitle({ title: 'Reviewed spare copies' }), 'Reviewed spare copies');
assert.equal(getHomeActivityDisplayTitle({ title: '' }), 'Collection activity');

const raw = Object.freeze({
  name: 'ナゾノクサ', englishName: 'Oddish', language: 'ja', setName: 'バトルリージョン',
  title: 'Added ナゾノクサ to your chase list', cardName: 'ナゾノクサ',
  imageUrl: 'unchanged-printed-artwork-reference',
});
const before = JSON.stringify(raw);
getHomeCardDisplayName(raw); getHomeCardSetDisplayName(raw); getHomeActivityDisplayTitle(raw);
assert.equal(JSON.stringify(raw), before, 'Display labels must not mutate canonical names, language or artwork');
console.log('Home English labels: supplied metadata, Unicode/missing fallbacks, draft qualifiers, language labels, exact activity replacement and immutable raw fields passed.');
