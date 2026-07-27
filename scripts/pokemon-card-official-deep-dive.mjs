#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const BASE_URL = 'https://www.pokemon-card.com';
const SEARCH_URL = `${BASE_URL}/card-search/index.php?keyword=&se_ta=&regulation_sidebar_form=XY&pg=&illust=&sm_and_keyword=true`;
const RESULT_API_URL = `${BASE_URL}/card-search/resultAPI.php`;
const OUTPUT_DIR = path.join(ROOT, 'tmp', 'pokemon-card-official');
const LOCAL_MANIFEST = path.join(ROOT, 'assets', 'rev2', '11-japanese-set-logo', 'manifest.json');

const DEFAULT_HEADERS = {
  'User-Agent': 'Stackr research scraper (+local project metadata audit)',
  Referer: 'https://www.pokemon-card.com/card-search/index.php',
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'X-Requested-With': 'XMLHttpRequest',
};

function readArg(name, fallback = null) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeCode(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '');
}

function toAbsoluteUrl(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('/')) return `${BASE_URL}${url}`;
  return new URL(url, BASE_URL).toString();
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    headers: { ...DEFAULT_HEADERS, ...(options.headers || {}) },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
}

async function fetchJson(url, options = {}) {
  const text = await fetchText(url, options);
  return JSON.parse(text);
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function parseOfficialProducts(html) {
  const products = [];
  const seen = new Set();
  const pattern = /\{\s*name:\s*"pg",\s*value:\s*"([^"]*)",\s*group:\s*"group-item-name",\s*label:\s*"([^"]*)"\s*\}/g;
  for (const match of html.matchAll(pattern)) {
    const [, pg, label] = match;
    if (!pg || seen.has(pg)) continue;
    seen.add(pg);
    products.push({ pg, label });
  }
  return products;
}

function inferSetCode(cardThumbFile) {
  const match = String(cardThumbFile || '').match(/\/card_images\/large\/([^/]+)\//);
  return match ? match[1] : null;
}

async function queryResultApi(params) {
  const query = new URLSearchParams({
    keyword: '',
    se_ta: '',
    regulation_sidebar_form: 'all',
    pg: '',
    illust: '',
    sm_and_keyword: 'true',
    ...params,
  });
  return fetchJson(`${RESULT_API_URL}?${query.toString()}`);
}

function summarizeApiResult(pg, json) {
  const cards = Array.isArray(json.cardList) ? json.cardList : [];
  const setCodes = [...new Set(cards.map((card) => inferSetCode(card.cardThumbFile)).filter(Boolean))];
  return {
    pg,
    result: json.result,
    hitCnt: Number(json.hitCnt || 0),
    maxPage: Number(json.maxPage || 0),
    regulation: json.regulation || null,
    setCodes,
    firstCard: cards[0]
      ? {
          cardID: String(cards[0].cardID),
          cardName: cards[0].cardNameViewText || cards[0].cardNameAltText || null,
          cardThumbFile: cards[0].cardThumbFile,
          setCode: inferSetCode(cards[0].cardThumbFile),
          detailUrl: `${BASE_URL}/card-search/details.php/card/${cards[0].cardID}/regu/${json.regulation || 'all'}`,
        }
      : null,
  };
}

async function fetchCardDetail(cardID, regu = 'all') {
  const detailUrl = `${BASE_URL}/card-search/details.php/card/${cardID}/regu/${regu}`;
  const html = await fetchText(detailUrl, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  const badgeMatch = html.match(/<img[^>]+src="([^"]*\/assets\/images\/card\/regulation_logo_1\/[^"]+)"[^>]*alt="([^"]*)"/);
  const productMatch = html.match(/<a\s+href="([^"]+)"\s+class="Link Link-arrow">\s*([^<]+)\s*</);
  const cardImageMatch = html.match(/<img\s+class="fit"\s+src="([^"]+)"/);
  return {
    detailUrl,
    cardImageUrl: toAbsoluteUrl(cardImageMatch?.[1]),
    badgeUrl: toAbsoluteUrl(badgeMatch?.[1]),
    badgeAlt: badgeMatch?.[2] || null,
    productUrl: toAbsoluteUrl(productMatch?.[1]),
    productLabel: productMatch?.[2]?.trim() || null,
  };
}

async function downloadFile(url, destPath) {
  const response = await fetch(url, { headers: DEFAULT_HEADERS });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, Buffer.from(arrayBuffer));
}

async function readLocalManifest() {
  try {
    const json = JSON.parse(await fs.readFile(LOCAL_MANIFEST, 'utf8'));
    return Array.isArray(json.logos) ? json.logos : [];
  } catch {
    return [];
  }
}

function buildCodeIndex(productProbes, detailByCode, fullCardIndex) {
  const byCode = {};
  for (const probe of productProbes) {
    for (const code of probe.setCodes || []) {
      const key = normalizeCode(code);
      byCode[key] ||= {
        code,
        normalizedCode: key,
        officialProducts: [],
        directProducts: [],
        detail: detailByCode[key] || null,
        cardIndex: fullCardIndex?.codes?.[key] || null,
      };
      byCode[key].officialProducts.push({
        pg: probe.pg,
        label: probe.label,
        hitCnt: probe.hitCnt,
      });
    }
  }
  if (fullCardIndex?.codes) {
    for (const entry of Object.values(fullCardIndex.codes)) {
      byCode[entry.normalizedCode] ||= {
        code: entry.code,
        normalizedCode: entry.normalizedCode,
        officialProducts: [],
        directProducts: [],
        detail: detailByCode[entry.normalizedCode] || null,
        cardIndex: entry,
      };
      byCode[entry.normalizedCode].cardIndex = entry;
    }
  }
  return byCode;
}

function buildLocalCoverage(localLogos, codeIndex, localProbes, detailByCode) {
  const localProbeByCandidate = new Map(localProbes.map((probe) => [normalizeCode(probe.pg), probe]));
  return localLogos.map((logo) => {
    const candidates = [
      logo.code,
      logo.key,
      logo.normalizedKey,
      path.basename(logo.assetPath || '', path.extname(logo.assetPath || '')),
    ].filter(Boolean);
    const normalizedCandidates = [...new Set(candidates.map(normalizeCode).filter(Boolean))];
    const codeMatches = normalizedCandidates.map((candidate) => codeIndex[candidate]).filter(Boolean);
    const directProbe = normalizedCandidates.map((candidate) => localProbeByCandidate.get(candidate)).find((probe) => probe?.hitCnt > 0) || null;
    const directSetCode = directProbe?.setCodes?.[0] || null;
    const detail = directSetCode ? detailByCode[normalizeCode(directSetCode)] : codeMatches[0]?.detail || null;
    return {
      key: logo.key,
      code: logo.code,
      englishName: logo.listedName,
      assetPath: logo.assetPath,
      candidates,
      officialMatch: codeMatches.length > 0 || Boolean(directProbe),
      matchedOfficialCodes: [...new Set([
        ...codeMatches.map((match) => match.code),
        directSetCode,
      ].filter(Boolean))],
      directApiProbe: directProbe
        ? {
            pg: directProbe.pg,
            hitCnt: directProbe.hitCnt,
            setCodes: directProbe.setCodes,
            firstCard: directProbe.firstCard,
          }
        : null,
      officialProducts: codeMatches.flatMap((match) => match.officialProducts || []),
      badgeUrl: detail?.badgeUrl || null,
      productUrl: detail?.productUrl || null,
      productLabel: detail?.productLabel || null,
    };
  });
}

function renderReport({ products, productProbes, localCoverage, fullCardIndex, outputDir }) {
  const currentHits = productProbes.filter((probe) => probe.hitCnt > 0);
  const localMatched = localCoverage.filter((entry) => entry.officialMatch);
  const localBadge = localCoverage.filter((entry) => entry.badgeUrl);
  const noMatch = localCoverage.filter((entry) => !entry.officialMatch);
  const sampleNoMatch = noMatch.slice(0, 24).map((entry) => `- ${entry.key} / ${entry.code} / ${entry.englishName}`).join('\n');
  const sampleMatched = localCoverage
    .filter((entry) => entry.officialMatch)
    .slice(0, 24)
    .map((entry) => `- ${entry.key}: ${entry.matchedOfficialCodes.join(', ') || 'matched'}${entry.productLabel ? ` | ${entry.productLabel}` : ''}`)
    .join('\n');

  return `# Pokemon-card.com Deep Dive

Source page: ${SEARCH_URL}

## What The Official Site Exposes

- Search UI page with embedded product list.
- JSON card API: \`${RESULT_API_URL}\`.
- Card detail pages: \`/card-search/details.php/card/{cardID}/regu/{regulation}\`.
- Small official set-code badge images, usually \`/assets/images/card/regulation_logo_1/{CODE}.gif\`.
- Product page links from card details, often useful for richer product artwork.

## This Run

- Official product entries in current search UI: ${products.length}
- Product entries with API hits: ${currentHits.length}
- Local Japanese logo manifest entries checked: ${localCoverage.length}
- Local entries matched by current product/code probes: ${localMatched.length}
- Local entries with an official badge URL discovered: ${localBadge.length}
${fullCardIndex ? `- Full-card page scan pages fetched: ${fullCardIndex.pagesFetched} / ${fullCardIndex.maxPage || 'unknown'}\n- Set-code directories discovered from card images: ${Object.keys(fullCardIndex.codes || {}).length}` : '- Full-card page scan was not run.'}

## Matched Samples

${sampleMatched || 'None in this run.'}

## Unmatched Samples

${sampleNoMatch || 'None in this run.'}

## Output Files

- \`${path.relative(ROOT, path.join(outputDir, 'official-products.json'))}\`
- \`${path.relative(ROOT, path.join(outputDir, 'product-probes.json'))}\`
- \`${path.relative(ROOT, path.join(outputDir, 'official-code-index.json'))}\`
- \`${path.relative(ROOT, path.join(outputDir, 'local-logo-official-coverage.json'))}\`
${fullCardIndex ? `- \`${path.relative(ROOT, path.join(outputDir, 'full-card-index.json'))}\`` : ''}

## Image Plan

For the app logo treatment, keep the cleaned uploaded set logos as the main Japanese-writing source, then compose/crop:

1. Japanese set writing from the cleaned local PNG.
2. English set name exactly once from local metadata.
3. Official code badge where available, e.g. \`SV12a\`, \`M1L\`, \`SV-P\`.

The official page is excellent for validation and badges. It does not consistently expose one full transparent set-logo asset for older products, so full-logo replacement should stay selective.
`;
}

async function crawlFullCardIndex({ pages, delayMs }) {
  if (pages <= 0) return null;
  const first = await queryResultApi({ regulation_sidebar_form: 'all', page: '1' });
  const maxPage = Number(first.maxPage || 0);
  const totalPages = pages === Infinity ? maxPage : Math.min(pages, maxPage || pages);
  const codes = {};
  const processPage = (json, page) => {
    for (const card of json.cardList || []) {
      const code = inferSetCode(card.cardThumbFile);
      if (!code) continue;
      const normalizedCode = normalizeCode(code);
      codes[normalizedCode] ||= {
        code,
        normalizedCode,
        count: 0,
        firstCardID: String(card.cardID),
        firstCardName: card.cardNameViewText || card.cardNameAltText || null,
        firstThumbFile: card.cardThumbFile,
        firstSeenPage: page,
      };
      codes[normalizedCode].count += 1;
    }
  };
  processPage(first, 1);
  for (let page = 2; page <= totalPages; page += 1) {
    await sleep(delayMs);
    const json = await queryResultApi({ regulation_sidebar_form: 'all', page: String(page) });
    processPage(json, page);
    if (page % 25 === 0 || page === totalPages) {
      console.log(`Indexed card result page ${page}/${totalPages}`);
    }
  }
  return {
    hitCnt: Number(first.hitCnt || 0),
    maxPage,
    pagesFetched: totalPages,
    codes,
  };
}

async function main() {
  const outputDir = path.resolve(readArg('out', OUTPUT_DIR));
  const delayMs = Number(readArg('delay', '175'));
  const maxProducts = Number(readArg('max-products', '9999'));
  const maxLocalProbes = Number(readArg('max-local-probes', '9999'));
  const fullCardPagesArg = readArg('full-card-pages', '0');
  const fullCardPages = hasFlag('full-card-index') ? Infinity : Number(fullCardPagesArg);
  const downloadBadges = hasFlag('download-badges');

  await fs.mkdir(outputDir, { recursive: true });

  console.log('Fetching search page and embedded product list...');
  const html = await fetchText(SEARCH_URL, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  const products = parseOfficialProducts(html);
  await writeJson(path.join(outputDir, 'official-products.json'), products);

  const localLogos = await readLocalManifest();
  await writeJson(path.join(outputDir, 'local-logo-manifest-snapshot.json'), localLogos);

  console.log(`Probing ${Math.min(products.length, maxProducts)} official product entries...`);
  const productProbes = [];
  for (const product of products.slice(0, maxProducts)) {
    await sleep(delayMs);
    const json = await queryResultApi({ pg: product.pg });
    productProbes.push({ ...product, ...summarizeApiResult(product.pg, json) });
  }
  await writeJson(path.join(outputDir, 'product-probes.json'), productProbes);

  console.log(`Probing up to ${Math.min(localLogos.length, maxLocalProbes)} local logo codes...`);
  const localProbeCandidates = [];
  for (const logo of localLogos.slice(0, maxLocalProbes)) {
    const candidates = [logo.code].filter(Boolean);
    for (const candidate of candidates) {
      const normalized = normalizeCode(candidate);
      if (!normalized || localProbeCandidates.some((item) => item.normalized === normalized)) continue;
      localProbeCandidates.push({ pg: candidate, normalized });
    }
  }

  const localProbes = [];
  for (const candidate of localProbeCandidates) {
    await sleep(delayMs);
    const json = await queryResultApi({ pg: candidate.pg });
    localProbes.push(summarizeApiResult(candidate.pg, json));
  }
  await writeJson(path.join(outputDir, 'local-code-probes.json'), localProbes);

  let fullCardIndex = null;
  if (fullCardPages > 0 || fullCardPages === Infinity) {
    console.log('Running card result page index...');
    fullCardIndex = await crawlFullCardIndex({ pages: fullCardPages, delayMs });
    await writeJson(path.join(outputDir, 'full-card-index.json'), fullCardIndex);
  }

  const detailTargets = new Map();
  for (const probe of [...productProbes, ...localProbes]) {
    if (!probe.firstCard?.cardID || !probe.firstCard?.setCode) continue;
    const key = normalizeCode(probe.firstCard.setCode);
    if (!detailTargets.has(key)) {
      detailTargets.set(key, {
        code: probe.firstCard.setCode,
        cardID: probe.firstCard.cardID,
        regu: probe.regulation || 'all',
      });
    }
  }
  for (const entry of Object.values(fullCardIndex?.codes || {})) {
    if (!entry.firstCardID) continue;
    const key = normalizeCode(entry.code);
    if (!detailTargets.has(key)) {
      detailTargets.set(key, {
        code: entry.code,
        cardID: entry.firstCardID,
        regu: 'all',
      });
    }
  }

  console.log(`Fetching ${detailTargets.size} representative card detail pages...`);
  const detailByCode = {};
  for (const [key, target] of detailTargets) {
    await sleep(delayMs);
    try {
      const detail = await fetchCardDetail(target.cardID, target.regu);
      detailByCode[key] = { code: target.code, ...detail };
      if (downloadBadges && detail.badgeUrl) {
        const ext = path.extname(new URL(detail.badgeUrl).pathname) || '.gif';
        await downloadFile(detail.badgeUrl, path.join(outputDir, 'official-set-badges', `${target.code}${ext}`));
      }
    } catch (error) {
      detailByCode[key] = { code: target.code, error: error.message };
    }
  }
  await writeJson(path.join(outputDir, 'card-details-by-code.json'), detailByCode);

  const codeIndex = buildCodeIndex(productProbes, detailByCode, fullCardIndex);
  await writeJson(path.join(outputDir, 'official-code-index.json'), codeIndex);

  const localCoverage = buildLocalCoverage(localLogos, codeIndex, localProbes, detailByCode);
  await writeJson(path.join(outputDir, 'local-logo-official-coverage.json'), localCoverage);

  const report = renderReport({
    products,
    productProbes,
    localCoverage,
    fullCardIndex,
    outputDir,
  });
  await fs.writeFile(path.join(outputDir, 'deep-dive-report.md'), report, 'utf8');

  console.log(JSON.stringify({
    ok: true,
    outputDir,
    officialProducts: products.length,
    productProbes: productProbes.length,
    localLogos: localLogos.length,
    localProbes: localProbes.length,
    matchedLocalLogos: localCoverage.filter((entry) => entry.officialMatch).length,
    localLogosWithBadge: localCoverage.filter((entry) => entry.badgeUrl).length,
    fullCardPagesFetched: fullCardIndex?.pagesFetched || 0,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
