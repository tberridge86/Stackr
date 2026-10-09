import sources from './generated/corocoroCoverSources.json';
import alternativeSources from './generated/corocoroAlternativeCoverSources.json';
import communitySources from './generated/corocoroCommunityCoverSources.json';
import { getCorocoroIssueGroup, groupCorocoroIssues } from './corocoroIssueArchive';
import { COROCORO_SUPPLIED_COVER_COUNT } from './corocoroSuppliedCovers';

export const COROCORO_COVER_ARCHIVES = [
  { label: 'PocketMonsters cover & scan archive', url: 'https://pocketmonsters.net/imageboard/55/catalog' },
  { label: 'Bulbagarden CoroCoro archive', url: 'https://archives.bulbagarden.net/wiki/Category:CoroCoro' },
] as const;

export type CorocoroCoverPreviewContext = {
  development: boolean;
  platform: string;
  hostname: string;
  sourceEnabled?: boolean;
};
export type CorocoroCoverPresentation = {
  image: { imageUrl: string; alt: string } | null;
  source: { url: string; label: string } | null;
  alternativeSources: { url: string; label: string }[];
  caption: string;
};

function safeSourcePage(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && (['corocoro-news.jp', 'digital-furoku.corocoro.jp'].includes(url.hostname)
        || (url.hostname === 'zoidsland.com' && url.pathname === '/1rebyu-/korob00-8b.html')) ? url.href : null;
  } catch { return null; }
}

function safeAlternativePage(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    const validPage = (['zoidsland.com', 'www.zoidsland.com'].includes(url.hostname)
      && /^\/1rebyu-\/koro[0-9-]+b?\.html$/.test(url.pathname))
      || (url.hostname === 'pocketmonsters.net' && /^\/imageboard\/thread\/\d+$/.test(url.pathname));
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.search && !url.hash
      && validPage ? url.href : null;
  } catch { return null; }
}

function getAlternativeSources(publication: string, issueMonth: string) {
  const independent = alternativeSources.records.filter((row) => row.publication === publication && row.issueMonth === issueMonth)
    .flatMap((row) => {
      const url = safeAlternativePage(row.pageUrl);
      return url ? [{ url, label: row.verificationLevel === 'page_title_and_cover_caption'
        ? 'View cover on independent issue page' : 'Independent issue link · from index' }] : [];
    });
  const community = communitySources.records.filter((row) => row.publication === publication && row.issueMonth === issueMonth)
    .flatMap((row) => {
      const url = safeAlternativePage(row.pageUrl);
      return url ? [{ url, label: `View cover source · ${row.provider}` }] : [];
    });
  return [...independent, ...community];
}

/** A discovered page/URL is evidence, not permission to render its images. */
export function getCorocoroIssueCoverPresentation(issueId: string, context: CorocoroCoverPreviewContext): CorocoroCoverPresentation {
  const empty: CorocoroCoverPresentation = { image: null, source: null, alternativeSources: [], caption: 'Cover not available' };
  const issue = getCorocoroIssueGroup(issueId);
  if (!issue || context.sourceEnabled === false) return empty;
  const record = sources.records.find((row) => row.publication === issue.publication && row.issueMonth === issue.issueMonth);
  const url = safeSourcePage(record?.sourcePageUrl);
  const source = url ? {
    url,
    label: record?.identityStatus === 'year_archive_only'
      ? `Publisher’s ${issue.issueMonth.slice(0, 4)} cover archive`
      : record?.identityStatus === 'exact_issue_and_cover_alt' ? 'View this cover at the publisher'
        : record?.identityStatus === 'exact_issue_independent_review' ? 'Independent issue & cover review' : 'View this issue at the publisher',
  } : null;
  const localPreview = context.development && context.platform === 'web'
    && ['localhost', '127.0.0.1', '[::1]'].includes(context.hostname);
  const alternatives = localPreview ? getAlternativeSources(issue.publication, issue.issueMonth) : [];
  // This is the user's existing attachment, not an imported publisher/seller image.
  if (localPreview && issue.id === 'monthly:1997-02') return {
    image: {
      imageUrl: 'http://127.0.0.1:4175/corocoro-reference.png',
      alt: 'Owner-supplied Monthly CoroCoro Comic February 1997 reference cover',
    }, source, alternativeSources: alternatives, caption: 'Your supplied reference cover',
  };
  return { image: null, source, alternativeSources: alternatives, caption: source || alternatives.length ? 'Cover source linked · image not imported' : 'Cover source not located yet' };
}

export function getCorocoroCoverCoverage() {
  const groups = groupCorocoroIssues();
  const linked = groups.flatMap((group) => {
    const record = sources.records.find((row) => row.publication === group.publication && row.issueMonth === group.issueMonth);
    const url = safeSourcePage(record?.sourcePageUrl);
    return url ? [url] : [];
  });
  const independent = linked.filter((url) => new URL(url).hostname === 'zoidsland.com').length;
  const alternatives = groups.flatMap((group) => getAlternativeSources(group.publication, group.issueMonth));
  return { issues: groups.length, totalSourceLinks: linked.length, publisherSourceLinks: linked.length - independent,
    independentSourceLinks: independent, alternativeSourceLinks: alternatives.length,
    suppliedPreviewCovers: COROCORO_SUPPLIED_COVER_COUNT, importedRemoteCovers: 0 };
}
