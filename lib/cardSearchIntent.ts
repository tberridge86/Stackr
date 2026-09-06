export type CardSearchGradingModifier = {
  grader: 'PSA' | 'BGS' | 'CGC' | 'TAG' | 'ACE';
  grade: string;
};

/** Keeps slab grading out of catalogue-card identity without changing the original market query. */
export function parseCardSearchIntent(input: string) {
  const originalQuery = String(input ?? '').trim();
  const grading: CardSearchGradingModifier[] = [];
  const gradingPattern = /\b(?:graded\s+)?(PSA|BGS|Beckett|CGC|TAG|ACE)[\s:-]*(?:(?:grade[ds]?|gem\s+(?:mint|mt)|pristine|mint)[\s:-]*)?(10(?:\.0)?|[1-9](?:\.[05])?|0\.5)(?:\s*\/\s*10(?!\d))?(?![\p{L}\p{N}./])/giu;
  const catalogueQuery = originalQuery.normalize('NFKC').replace(gradingPattern, (_, company: string, grade: string) => {
    grading.push({ grader: (company.toLowerCase() === 'beckett' ? 'BGS' : company.toUpperCase()) as CardSearchGradingModifier['grader'], grade: String(Number(grade)) });
    return ' ';
  }).replace(/\s+/g, ' ').trim();
  return { originalQuery, catalogueQuery: grading.length ? catalogueQuery : originalQuery, grading };
}
