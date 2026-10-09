import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  corocoroIssueEvidence, filterCorocoroIssues, getCorocoroArchiveCounts,
  COROCORO_PUBLICATIONS, getCorocoroPublicationSummaries, getCorocoroIssueGroup,
  getCorocoroIssuesForPublication, groupCorocoroIssues,
  getCorocoroIssuesForCard, formatCorocoroIssueMonth,
} from '../lib/corocoroIssueArchive';

assert.deepEqual(getCorocoroArchiveCounts(), { distributions: 36, issues: 34, cardReferences: 54 });
assert.deepEqual(corocoroIssueEvidence, JSON.parse(readFileSync('catalogue/corocoro-issue-card-evidence.2026-09-06.json', 'utf8')));
assert.equal(new Set(corocoroIssueEvidence.issues.map((issue) => issue.id)).size, 36);
for (const issue of corocoroIssueEvidence.issues) {
  assert.match(issue.issueMonth, /^\d{4}-(0[1-9]|1[0-2])$/);
  assert.ok(issue.cards.length && issue.sourceUrls.length);
  issue.sourceUrls.forEach((url) => assert.equal(new URL(url).protocol, 'https:'));
  for (const card of issue.cards) {
    if (card.numbering === 'unnumbered') assert.equal(card.printedNumber, null);
    if (card.mappedStackrCardId) assert.ok(['ja:corocoro-mew-1997', 'ja:corocoro-shining-mew-2001'].includes(card.mappedStackrCardId));
  }
}
const glossy = filterCorocoroIssues('1997-02 mew')[0];
assert.equal(glossy.onSaleDate, '1997-01-15');
assert.equal(glossy.cards[0].mappedStackrCardId, 'ja:corocoro-mew-1997');
assert.equal(filterCorocoroIssues('shining mew')[0].issueMonth, '2001-05');
assert.ok(filterCorocoroIssues('', 'offers').every((issue) => issue.distributionType !== 'insert'));
assert.ok(filterCorocoroIssues('', 'jumbo').every((issue) => issue.cards.some((card) => card.format === 'jumbo')));
assert.equal(filterCorocoroIssues('030/XY-P')[0].issueMonth, '2014-03');
assert.equal(filterCorocoroIssues('not-an-existing-issue').length, 0);
assert.deepEqual(COROCORO_PUBLICATIONS.map((publication) => publication.id), ['monthly', 'bessatsu', 'ichiban']);
assert.deepEqual(getCorocoroPublicationSummaries().map((publication) => publication.issueCount), [32, 1, 1]);
assert.equal(getCorocoroPublicationSummaries().reduce((sum, publication) => sum + publication.cardReferenceCount, 0), 54);
assert.equal(groupCorocoroIssues().length, 34);
const feb2022 = getCorocoroIssueGroup('monthly:2022-02')!;
assert.equal(feb2022.records.length, 2, 'Insert and applicant order belong to one magazine issue');
assert.deepEqual(feb2022.records.map((record) => record.distributionType).sort(), ['insert', 'paid_applicant_order']);
assert.equal(feb2022.cardReferenceCount, 3);
assert.equal(getCorocoroIssueGroup('monthly:2003-02')?.records.length, 2);
assert.equal(getCorocoroIssueGroup('bessatsu:2000-08')?.publicationId, 'bessatsu');
assert.equal(getCorocoroIssueGroup('monthly:2000-08'), null, 'A sister-publication cover must not cross publications');
assert.equal(getCorocoroIssueGroup('ichiban:2021-03')?.publication, 'CoroCoro Ichiban!');
assert.equal(getCorocoroIssueGroup('ichiban:2021-03')?.onSaleDate, '2021-01-21');
assert.equal(getCorocoroIssueGroup('monthly:2003-06')?.records[0].confidence, 'conflicting');
assert.equal(getCorocoroIssueGroup('monthly:2021-03'), null);
assert.equal(getCorocoroIssuesForPublication('monthly', 'shining mew')[0]?.id, 'monthly:2001-05');
assert.equal(getCorocoroIssuesForPublication('bessatsu', 'shining mew').length, 0);
assert.equal(getCorocoroIssuesForPublication('ichiban', 'コロコロイチバン').length, 1);
assert.equal(getCorocoroIssueGroup('1997-02'), null);
assert.deepEqual(getCorocoroIssuesForCard('ja:corocoro-shining-mew-2001').map((issue) => issue.id), ['monthly:2001-05']);
assert.deepEqual(getCorocoroIssuesForCard('ja:corocoro-mew-1997').map((issue) => issue.id), ['monthly:1997-02']);
assert.deepEqual(getCorocoroIssuesForCard('SM3p-041'), [], 'A later Shining Mew must not inherit the 2001 issue');
assert.deepEqual(getCorocoroIssuesForCard('Mew'), [], 'Names alone cannot establish an edition');
assert.equal(formatCorocoroIssueMonth('2001-05'), 'May 2001');
const otherPublication = { ...glossy, publication: 'Unverified publication' };
assert.equal(groupCorocoroIssues([otherPublication]).length, 0, 'Unknown publication is not silently called Monthly');
console.log('CoroCoro archive: counts, exact Mew links, dates, sources and distribution filters passed.');
