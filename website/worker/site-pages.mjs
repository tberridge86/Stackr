// Shared by static output and the Worker so deep links have useful previews too.
export const siteOrigin = 'https://stackr-private-exchange-concept.berridge14.chatgpt.site';
export const pageDetails = {
  '/': {title: 'StackR — The Card Shop', description: 'Explore Pokémon sets, discover collector picks and browse sealed English, Japanese, Chinese and Korean products at StackR. Orders are not yet open.'},
  '/shop': {title: 'Shop Pokémon TCG products — StackR', description: 'Browse sealed Pokémon products, check availability and compare the contents of booster boxes, bundles and collections. Orders are not yet open.'},
  '/sets': {title: 'Explore Pokémon sets and chase cards — StackR', description: 'Explore Pokémon expansions by language and release date, discover collector picks and find products from your favourite set.'},
  '/about': {title: 'The story of StackR', description: 'Meet Jack and discover the family Pokémon collection that became StackR.'},
  '/history': {title: 'Pokémon through the years — StackR', description: 'Explore 100 Pokémon milestones from 1996 to 2026, with cards, games, films, events and original archive artwork.'},
};

export function renderSitePage(html, path = '/', origin = siteOrigin) {
  const route = path.replace(/\.html$/, '').replace(/\/$/, '') || '/';
  const details = pageDetails[route === '/index' ? '/' : route];
  if (!details) return html;
  const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const canonicalPath = route === '/index' ? '/' : route;
  const title = escape(details.title), description = escape(details.description);
  const canonical = escape(new URL(canonicalPath, origin).href);
  const image = escape(new URL('/assets/stackr-social.png', origin).href);
  const metadata = `<!-- StackR page metadata -->
<link rel="canonical" href="${canonical}">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png">
<link rel="icon" type="image/png" sizes="192x192" href="/assets/icon-192.png">
<link rel="apple-touch-icon" sizes="180x180" href="/assets/apple-touch-icon.png">
<link rel="manifest" href="/assets/site.webmanifest">
<meta property="og:type" content="website">
<meta property="og:site_name" content="StackR">
<meta property="og:locale" content="en_GB">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="StackR — The Card Shop">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${image}">
<meta name="twitter:image:alt" content="StackR — The Card Shop">
<!-- /StackR page metadata -->`;
  const initialScreen={'/':'home','/index':'home','/shop':'shop','/sets':'explore'}[route];
  return (initialScreen?html.replace(/<body\b([^>]*)>/,(_,attributes)=>'<body'+attributes.replace(/\sdata-phone-screen="[^"]*"/g,'')+' data-phone-screen="'+initialScreen+'">'):html)
    .replace(/<!-- StackR page metadata -->[\s\S]*?<!-- \/StackR page metadata -->\s*/g, '')
    .replace(/<link\b[^>]*\brel="icon"[^>]*>\s*/g, '')
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${description}">`)
    .replace('</head>', metadata + '\n</head>');
}
