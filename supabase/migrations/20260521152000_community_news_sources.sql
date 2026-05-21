alter table public.community_news
  add column if not exists source_name text,
  add column if not exists source_type text,
  add column if not exists source_url text;

create unique index if not exists community_news_source_url_unique
  on public.community_news (source_url)
  where source_url is not null;
