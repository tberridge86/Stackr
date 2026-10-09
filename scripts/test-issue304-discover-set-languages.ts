import assert from 'node:assert/strict';
import fs from 'node:fs';

const search = fs.readFileSync('app/(tabs)/search.tsx','utf8');
for (const expected of [
  "key: 'all', label: 'All', flag: '🌐'", "key: 'en', label: 'English', flag: '🇬🇧'",
  "key: 'ja', label: 'Japanese', flag: '🇯🇵'", "key: 'zh-cn', label: 'Simplified Chinese', flag: '🇨🇳'",
  "key: 'zh-tw', label: 'Traditional Chinese', flag: '🇹🇼'", "key: 'ko', label: 'Korean', flag: '🇰🇷'",
]) assert.ok(search.includes(expected), expected);
assert.match(search,/category === 'sets' \? \(/);
assert.match(search,/accessibilityState=\{\{ selected: active \}\}/);
assert.match(search,/searchSetsQuick\(primary, normalisedTerms, selectedLanguage\)/);
assert.match(search,/fetchAllSets\(\{ language, includeAssets: false \}\)/);
assert.match(search,/trimmed\.length < 2 && category === 'sets'/);
assert.match(search,/requestId !== requestRef\.current/);
assert.match(search,/requestRef\.current \+= 1; setFocusedResultLimit\(searchResultWindow\.initialCount\); setSelectedLanguage/);
assert.match(search,/hasMoreFocusedResults = category === 'sets' && visibleResults\.sets\.length > focusedResultLimit/);
assert.match(search,/visibleResults\.sets\.slice\(0, category === 'sets' \? focusedResultLimit/);
assert.match(search,/params: \{ id: set\.id, language: set\.language \?\? selectedLanguage \}/);
assert.match(search,/setErrors\(\{ sets: 'Set results could not be loaded\.' \}\)/);

const detail = fs.readFileSync('app/set/[id].tsx','utf8');
assert.match(detail,/routeLanguageParam/);
assert.match(detail,/const language = requestedLanguage \|\| getRouteSetLanguage\(setId\)/);
assert.match(detail,/fetchCardsForSet\(currentSet\.id, \{ language: currentSet\.language \?\? language \}\)/);
console.log('Issue #304 Discover Sets language filters passed.');
