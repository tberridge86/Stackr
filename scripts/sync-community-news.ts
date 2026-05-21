import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

type NewsCategory = 'Latest Stackr news' | 'Pokemon News' | 'New card set news';

type FeedSource = {
  url: string;
  category: NewsCategory;
  sourceName: string;
};

type NewsItem = {
  title: string;
  body: string;
  category: NewsCategory;
  source_name: string;
  source_type: 'discord' | 'rss';
  source_url: string;
  external_url: string;
  published_at: string;
};

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DEFAULT_RSS_SOURCES: FeedSource[] = [
  {
    url: 'https://www.pokebeach.com/forums/forum/front-page-news.18/index.rss',
    category: 'New card set news',
    sourceName: 'PokeBeach',
  },
  {
    url: 'https://news.google.com/rss/search?q=Pokemon%20cards%20biggest%20sale%20OR%20Pokemon%20game&hl=en-GB&gl=GB&ceid=GB:en',
    category: 'Pokemon News',
    sourceName: 'Google News',
  },
  {
    url: 'https://news.google.com/rss/search?q=Pokemon%20TCG%20new%20set%20release%20date&hl=en-GB&gl=GB&ceid=GB:en',
    category: 'New card set news',
    sourceName: 'Google News',
  },
];

const NEWS_SYNC_MODE = process.env.COMMUNITY_NEWS_SYNC_MODE ?? 'today';
const NEWS_MAX_PER_CATEGORY = Number(process.env.COMMUNITY_NEWS_MAX_PER_CATEGORY ?? 10);
const NEWS_MAX_TOTAL = Number(process.env.COMMUNITY_NEWS_MAX_TOTAL ?? 30);

function startOfTodayUtc() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function isWithinSyncWindow(item: NewsItem) {
  if (NEWS_SYNC_MODE === 'all') return true;
  if (NEWS_SYNC_MODE === 'latest') return true;
  return new Date(item.published_at).getTime() >= startOfTodayUtc();
}

function limitNewsItems(items: NewsItem[]) {
  const sorted = items
    .filter(isWithinSyncWindow)
    .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());
  const perCategory = new Map<NewsCategory, number>();
  const limited: NewsItem[] = [];

  for (const item of sorted) {
    const count = perCategory.get(item.category) ?? 0;
    if (count >= NEWS_MAX_PER_CATEGORY) continue;
    perCategory.set(item.category, count + 1);
    limited.push(item);
    if (limited.length >= NEWS_MAX_TOTAL) break;
  }

  return limited;
}

function decodeEntities(value = '') {
  return value
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function stripHtml(value = '') {
  return decodeEntities(value)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTag(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeEntities(match[1]).trim() : '';
}

function getAtomLink(block: string) {
  const href = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i)?.[1];
  return href ? decodeEntities(href).trim() : '';
}

function inferCategory(title: string, fallback: NewsCategory): NewsCategory {
  const text = title.toLowerCase();
  if (/(set|expansion|booster|elite trainer|etb|release date|prerelease|card list|tcg)/i.test(text)) {
    return 'New card set news';
  }
  return fallback;
}

function parseFeed(xml: string, source: FeedSource): NewsItem[] {
  const blocks = [
    ...xml.matchAll(/<item[\s\S]*?<\/item>/gi),
    ...xml.matchAll(/<entry[\s\S]*?<\/entry>/gi),
  ].map((match) => match[0]);

  return blocks.map((block) => {
    const title = stripHtml(getTag(block, 'title'));
    const link = stripHtml(getTag(block, 'link')) || getAtomLink(block);
    const description = stripHtml(
      getTag(block, 'description') ||
      getTag(block, 'summary') ||
      getTag(block, 'content:encoded')
    );
    const publishedRaw = getTag(block, 'pubDate') || getTag(block, 'published') || getTag(block, 'updated');
    const publishedAt = publishedRaw && !Number.isNaN(new Date(publishedRaw).getTime())
      ? new Date(publishedRaw).toISOString()
      : new Date().toISOString();
    const sourceName = stripHtml(getTag(block, 'source')) || source.sourceName;

    return {
      title,
      body: description.slice(0, 500),
      category: inferCategory(title, source.category),
      source_name: sourceName,
      source_type: 'rss' as const,
      source_url: link || `${source.url}#${encodeURIComponent(title)}`,
      external_url: link || source.url,
      published_at: publishedAt,
    };
  }).filter((item) => item.title && item.external_url);
}

function parseSources() {
  if (!process.env.COMMUNITY_NEWS_RSS_SOURCES) return DEFAULT_RSS_SOURCES;

  try {
    const parsed = JSON.parse(process.env.COMMUNITY_NEWS_RSS_SOURCES);
    return Array.isArray(parsed) && parsed.length ? parsed as FeedSource[] : DEFAULT_RSS_SOURCES;
  } catch {
    console.log('Invalid COMMUNITY_NEWS_RSS_SOURCES JSON; using defaults.');
    return DEFAULT_RSS_SOURCES;
  }
}

async function fetchRssNews() {
  const sources = parseSources();
  const items: NewsItem[] = [];

  for (const source of sources) {
    try {
      const response = await fetch(source.url, {
        headers: { 'User-Agent': 'Stackr/1.0 (+https://stackr.app)' },
      });
      if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
      const xml = await response.text();
      items.push(...parseFeed(xml, source).slice(0, 12));
    } catch (error) {
      console.log(`RSS sync failed for ${source.sourceName}:`, error);
    }
  }

  return items;
}

async function fetchDiscordNews() {
  const token = process.env.DISCORD_STACKR_NEWS_BOT_TOKEN;
  const channelId = process.env.DISCORD_STACKR_NEWS_CHANNEL_ID;
  const guildId = process.env.DISCORD_STACKR_NEWS_GUILD_ID;

  if (!token || !channelId) return [] as NewsItem[];

  const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages?limit=20`, {
    headers: {
      Authorization: `Bot ${token}`,
      'User-Agent': 'Stackr/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Discord news fetch failed: ${response.status} ${await response.text()}`);
  }

  const messages = await response.json() as any[];

  return messages
    .filter((message) => String(message.content ?? '').trim().length > 0)
    .map((message) => {
      const lines = String(message.content).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const title = lines[0].replace(/^#+\s*/, '').slice(0, 120);
      const body = (lines.slice(1).join(' ') || lines[0]).slice(0, 500);
      const url = guildId
        ? `https://discord.com/channels/${guildId}/${channelId}/${message.id}`
        : `https://discord.com/channels/@me/${channelId}/${message.id}`;

      return {
        title,
        body,
        category: 'Latest Stackr news' as const,
        source_name: 'Stackr Discord',
        source_type: 'discord' as const,
        source_url: url,
        external_url: url,
        published_at: new Date(message.timestamp ?? Date.now()).toISOString(),
      };
    });
}

async function saveNews(items: NewsItem[]) {
  if (!items.length) return { saved: 0 };

  const sourceUrls = [...new Set(items.map((item) => item.source_url).filter(Boolean))];
  const existingUrls = new Set<string>();

  for (let i = 0; i < sourceUrls.length; i += 100) {
    const chunk = sourceUrls.slice(i, i + 100);
    const { data, error } = await supabase
      .from('community_news')
      .select('source_url')
      .in('source_url', chunk);

    if (error) throw error;
    for (const row of data ?? []) existingUrls.add(row.source_url);
  }

  const newItems = [];
  const seenUrls = new Set<string>();

  for (const item of items) {
    if (existingUrls.has(item.source_url) || seenUrls.has(item.source_url)) continue;
    seenUrls.add(item.source_url);
    newItems.push(item);
  }

  const rows = newItems.map((item) => ({
    title: item.title,
    body: item.body || item.title,
    category: item.category,
    icon: item.category === 'Latest Stackr news'
      ? 'megaphone-outline'
      : item.category === 'New card set news'
        ? 'sparkles-outline'
        : 'newspaper-outline',
    external_url: item.external_url,
    source_name: item.source_name,
    source_type: item.source_type,
    source_url: item.source_url,
    is_published: true,
    published_at: item.published_at,
  }));

  if (!rows.length) return { saved: 0 };

  const { error } = await supabase
    .from('community_news')
    .insert(rows);

  if (error) throw error;

  return { saved: rows.length };
}

async function main() {
  const [rssNews, discordNews] = await Promise.all([
    fetchRssNews(),
    fetchDiscordNews().catch((error) => {
      console.log(error);
      return [] as NewsItem[];
    }),
  ]);

  const items = limitNewsItems([...discordNews, ...rssNews]);

  const result = await saveNews(items);
  console.log(JSON.stringify({
    ok: true,
    mode: NEWS_SYNC_MODE,
    discord: discordNews.length,
    rss: rssNews.length,
    considered: items.length,
    saved: result.saved,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
