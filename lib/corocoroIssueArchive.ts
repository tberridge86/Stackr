// Small checked projection: Metro intentionally excludes the large catalogue tree.
import evidence from './generated/corocoroIssueEvidence.json';
import { getCuratedPokemonCardsForSet } from './curatedPokemonCatalogue';

export type CorocoroIssueRecord = typeof evidence.issues[number];
export type CorocoroArchiveFilter = 'all' | 'inserts' | 'jumbo' | 'offers';
export const corocoroIssueEvidence = evidence;

export const COROCORO_PUBLICATIONS = [
  {
    id: 'monthly', name: 'Monthly CoroCoro Comic', nativeName: '月刊コロコロコミック',
    description: 'The main monthly magazine. Its cover month is separate from its on-sale date.',
  },
  {
    id: 'bessatsu', name: 'Bessatsu CoroCoro Comic Special', nativeName: '別冊コロコロコミックSpecial',
    description: 'A separate sister publication, not another edition of the monthly magazine.',
  },
  {
    id: 'ichiban', name: 'CoroCoro Ichiban!', nativeName: 'コロコロイチバン！',
    description: 'A separate magazine with its own issues and promotional-card releases.',
  },
] as const;
export type CorocoroPublication = typeof COROCORO_PUBLICATIONS[number];
export type CorocoroPublicationId = CorocoroPublication['id'];
export type CorocoroIssueGroup = {
  id: string;
  publicationId: CorocoroPublicationId;
  publication: string;
  issueMonth: string;
  onSaleDate: string | null;
  records: CorocoroIssueRecord[];
  cardReferenceCount: number;
};

/** Publication + cover month identifies an issue; distributions do not create extra copies. */
export function groupCorocoroIssues(records: readonly CorocoroIssueRecord[] = evidence.issues): CorocoroIssueGroup[] {
  const groups = new Map<string, CorocoroIssueGroup>();
  for (const record of records) {
    const publication = COROCORO_PUBLICATIONS.find((item) => item.name === record.publication);
    if (!publication || !/^\d{4}-(0[1-9]|1[0-2])$/.test(record.issueMonth)) continue;
    const id = `${publication.id}:${record.issueMonth}`;
    const group = groups.get(id) ?? {
      id, publicationId: publication.id, publication: publication.name,
      issueMonth: record.issueMonth, onSaleDate: null, records: [], cardReferenceCount: 0,
    };
    group.records.push(record);
    group.cardReferenceCount += record.cards.length;
    const dates = [...new Set(group.records.map((row) => row.onSaleDate).filter((value): value is string => !!value))];
    group.onSaleDate = dates.length === 1 ? dates[0] : null;
    groups.set(id, group);
  }
  return [...groups.values()].sort((left, right) => right.issueMonth.localeCompare(left.issueMonth)
    || left.publicationId.localeCompare(right.publicationId));
}

export function getCorocoroPublicationSummaries() {
  const groups = groupCorocoroIssues();
  return COROCORO_PUBLICATIONS.map((publication) => {
    const issues = groups.filter((group) => group.publicationId === publication.id);
    return {
      ...publication, issueCount: issues.length,
      cardReferenceCount: issues.reduce((total, issue) => total + issue.cardReferenceCount, 0),
      distributionCount: issues.reduce((total, issue) => total + issue.records.length, 0),
    };
  });
}

export function getCorocoroIssuesForPublication(publicationId: CorocoroPublicationId, query = ''): CorocoroIssueGroup[] {
  const terms = query.normalize('NFKC').toLowerCase().trim().split(/\s+/).filter(Boolean);
  const publication = COROCORO_PUBLICATIONS.find((item) => item.id === publicationId);
  if (!publication) return [];
  return groupCorocoroIssues().filter((group) => {
    if (group.publicationId !== publicationId) return false;
    const text = [publication.name, publication.nativeName, group.issueMonth,
      ...group.records.flatMap((record) => [record.onSaleDate, record.notes,
        ...record.cards.flatMap((card) => [card.name, card.nativeName, card.printedNumber])])]
      .filter(Boolean).join(' ').normalize('NFKC').toLowerCase();
    return terms.every((term) => text.includes(term));
  });
}

export function getCorocoroIssueGroup(id: string): CorocoroIssueGroup | null {
  return groupCorocoroIssues().find((group) => group.id === id) ?? null;
}

/** Exact card mappings only; a species name never identifies a magazine printing. */
export function getCorocoroIssuesForCard(cardId: string): CorocoroIssueGroup[] {
  return groupCorocoroIssues().filter((group) => group.records.some((record) =>
    record.confidence !== 'conflicting' && record.cards.some((card) => card.mappedStackrCardId === cardId)));
}

export function getCorocoroIssuesForSet(setId: string): CorocoroIssueGroup[] {
  const cards = getCuratedPokemonCardsForSet(setId, 'ja');
  const ids = new Set(cards.flatMap(card => getCorocoroIssuesForCard(card.id).map(issue => issue.id)));
  return groupCorocoroIssues().filter(issue => ids.has(issue.id));
}

export function formatCorocoroIssueMonth(month: string): string {
  return new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

export function filterCorocoroIssues(query: string, category: CorocoroArchiveFilter = 'all'): CorocoroIssueRecord[] {
  const terms = query.normalize('NFKC').toLowerCase().trim().split(/\s+/).filter(Boolean);
  return evidence.issues.filter((issue) => {
    if (category === 'inserts' && issue.distributionType !== 'insert') return false;
    if (category === 'jumbo' && !issue.cards.some((card) => card.format === 'jumbo')) return false;
    if (category === 'offers' && issue.distributionType === 'insert') return false;
    const text = [issue.publication, issue.issueMonth, issue.onSaleDate, issue.notes,
      ...issue.cards.flatMap((card) => [card.name, card.nativeName, card.printedNumber])].filter(Boolean).join(' ').normalize('NFKC').toLowerCase();
    return terms.every((term) => text.includes(term));
  });
}

export function getCorocoroArchiveCounts(issues: readonly CorocoroIssueRecord[] = evidence.issues) {
  return {
    distributions: issues.length,
    issues: new Set(issues.map((issue) => `${issue.publication}:${issue.issueMonth}`)).size,
    cardReferences: issues.reduce((total, issue) => total + issue.cards.length, 0),
  };
}
