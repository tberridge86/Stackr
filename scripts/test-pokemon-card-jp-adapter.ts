import assert from 'node:assert/strict';
import { createSourceAdapter } from './catalogue-ingestion/adapters';
import {
  PokemonCardJpOfficialSourceAdapter,
  pokemonCardJpAdapterInternals,
} from './catalogue-ingestion/pokemonCardJpAdapter';
import { CatalogueIngestionRunner } from './catalogue-ingestion/pipeline';

const searchResponse = {
  result: 1,
  errMsg: '',
  thisPage: 1,
  maxPage: 1,
  hitCnt: 2,
  cardStart: 1,
  cardEnd: 2,
  searchCondition: ['スターターセットex ニャオハ＆マスカーニャex', 'レギュレーション：すべてのカード'],
  regulation: 'all',
  cardList: [
    {
      cardID: '50452',
      cardThumbFile: '/assets/images/card_images/large/MEM/050452_P_SHIEIMI.jpg',
      cardNameAltText: 'シェイミ',
      cardNameViewText: 'シェイミ',
    },
    {
      cardID: '50461',
      cardThumbFile: '/assets/images/card_images/small/MEM/050461_T_HAIPABORU_THUMB.jpg',
      cardNameAltText: '検索表示名',
      cardNameViewText: '検索表示名',
    },
  ],
};

const pokemonDetail = `
<section class="Section">
  <h1 class="Heading1 mt20">シェイミ</h1>
  <div class="Box">
    <div class="LeftBox">
      <img class="fit" src="/assets/images/card_images/large/MEM/050452_P_SHIEIMI.jpg" alt="シェイミ" />
      <div class="subtext Text-fjalla">
        <img src="/assets/images/card/regulation_logo_1/MEM.gif" class="img-regulation" alt="MEM" />
        &nbsp;001&nbsp;/&nbsp;017&nbsp;
      </div>
      <div class="author"><h4>イラストレーター</h4><a href="/card-search/index.php?illust=HYOGONOSUKE">HYOGONOSUKE</a></div>
    </div>
    <div class="RightBox"><div class="RightBox-inner">
      <span class="type">たね</span><span class="hp-num">80</span><h2 class="mt20">ワザ</h2>
    </div></div>
  </div>
</section>
<section class="SubSection"><div class="PopupSub"><ul><li><a href="/ex/me/#mem">スターターセットex ニャオハ＆マスカーニャex</a></li></ul></div></section>`;

const trainerDetail = `
<section class="Section">
  <h1 class="Heading1 mt20">ハイパーボール</h1>
  <div class="LeftBox">
    <img class="fit" src="/assets/images/card_images/large/MEM/050461_T_HAIPABORU.jpg" alt="ハイパーボール" />
    <div class="subtext Text-fjalla"><img src="/assets/images/card/regulation_logo_1/MEM.gif" class="img-regulation" alt="MEM" />&nbsp;010&nbsp;/&nbsp;017&nbsp;</div>
    <div class="author"><h4>イラストレーター</h4><a href="/card-search/index.php?illust=Ayaka%20Yoshida">Ayaka Yoshida</a></div>
  </div>
  <div class="RightBox"><div class="RightBox-inner"><h2 class="mt20">グッズ</h2></div></div>
</section>
<section class="SubSection"><div class="PopupSub"><ul><li><a href="/ex/me/#mem">スターターセットex ニャオハ＆マスカーニャex</a></li></ul></div></section>`;

const promoWithoutNumber = `
<section class="Section">
  <h1 class="Heading1 mt20">基本超エネルギー</h1>
  <img class="fit" src="/assets/images/card_images/large/XYP/031560_E_KIHONCHOUENERUGI.jpg" alt="基本超エネルギー" />
  <div class="subtext Text-fjalla"><img src="/assets/images/card/regulation_logo_1/XYP.gif" class="img-regulation" alt="XYP" />&nbsp;XY-P&nbsp;</div>
  <div class="RightBox-inner"><h2 class="mt20">基本エネルギー</h2></div>
</section>`;

function response(body: unknown, headers: Record<string, string> = {}) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': typeof body === 'string' ? 'text/html; charset=UTF-8' : 'application/json; charset=UTF-8',
      etag: '"fixture-v1"',
      'last-modified': 'Mon, 24 Aug 2026 08:00:00 GMT',
      ...headers,
    },
  });
}

async function main() {
  const requests: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    requests.push(url);
    if (url.includes('/card-search/resultAPI.php')) return response(searchResponse);
    if (url.includes('/card/50452/')) return response(pokemonDetail);
    if (url.includes('/card/50461/')) return response(trainerDetail);
    throw new Error(`Unexpected fixture request: ${url}`);
  };

  const adapter = new PokemonCardJpOfficialSourceAdapter({
    fetchImpl,
    licenceStatus: 'approved',
    assetLicenceStatus: 'approved',
  });
  assert.equal(adapter.identifySource().code, 'pokemon_card_jp_official');
  assert.equal(adapter.identifySource().automatedRefreshAllowed, true);
  assert.deepEqual(adapter.identifySource().capabilities, ['sets', 'cards', 'assets', 'conditional_requests']);
  assert.throws(
    () => new PokemonCardJpOfficialSourceAdapter({ language: 'zh-cn' }),
    /supports only language ja/,
  );

  const health = await adapter.healthCheck();
  assert.equal(health.status, 'ok');
  assert.equal(health.httpMetadata?.hitCount, 2);

  const cards = await adapter.fetchCards({ language: 'ja', setId: '958', limit: 1, cursor: { offset: 1 } });
  assert.equal(cards.length, 1);
  assert.equal(cards[0].providerRecordId, '50461');
  assert.equal(cards[0].payload.name, 'ハイパーボール');
  assert.equal(cards[0].payload.supertype, 'trainer');
  assert.equal(cards[0].payload.artist, 'Ayaka Yoshida');
  assert.equal(cards[0].payload.detailParserVersion, 'pokemon-card-jp-html-v1');
  assert.equal(typeof (cards[0].httpMetadata as Record<string, unknown>).detail, 'object');

  const normalisedCard = adapter.normaliseRecord(cards[0]);
  assert.equal(normalisedCard.languageCode, 'ja');
  assert.equal(normalisedCard.setCode, 'MEM');
  assert.equal(normalisedCard.providerSetId, 'MEM');
  assert.equal(normalisedCard.collectorNumber, '010');
  assert.equal(normalisedCard.printedTotal, 17);
  assert.equal(normalisedCard.nativeName, 'ハイパーボール');
  assert.equal(normalisedCard.englishDisplayName, null, 'Japanese text must not be copied into the English display field');
  assert.equal(normalisedCard.imageLanguageCode, 'ja');
  assert.equal(adapter.validateRecord(cards[0]).ok, true);

  const sets = await adapter.fetchSets({ language: 'ja', setId: '958', limit: 1, cursor: { offset: 1 } });
  assert.equal(sets.length, 1);
  assert.equal(sets[0].providerRecordId, 'MEM');
  assert.equal(sets[0].payload.name, 'スターターセットex ニャオハ＆マスカーニャex');
  assert.equal(sets[0].payload.printedTotal, 17);
  assert.equal(sets[0].payload.total, 2);

  const assets = await adapter.fetchAssets({ language: 'ja', setId: '958', limit: 1, cursor: { offset: 1 } });
  assert.equal(assets.length, 1);
  assert.equal(assets[0].recordType, 'asset');
  assert.equal(assets[0].licenceStatus, 'approved');
  assert.equal(assets[0].payload.cardID, '50461');
  assert.equal(assets[0].payload.setCode, 'MEM');
  assert.equal(assets[0].payload.localId, '010');
  assert.equal(assets[0].payload.name, 'ハイパーボール');
  assert.equal(
    assets[0].payload.image_url,
    'https://www.pokemon-card.com/assets/images/card_images/large/MEM/050461_T_HAIPABORU.jpg',
    'asset ingestion must use the verbatim detail-page image rather than the search thumbnail',
  );
  assert.equal(assets[0].payload.official_image_url, assets[0].payload.image_url);
  const normalisedAsset = adapter.normaliseRecord(assets[0]);
  assert.equal(normalisedAsset.setCode, 'MEM');
  assert.equal(normalisedAsset.collectorNumber, '010');
  assert.equal(normalisedAsset.nativeName, 'ハイパーボール');
  assert.equal(adapter.validateRecord(assets[0]).ok, true);
  const incompleteAsset = {
    ...assets[0],
    payload: {
      ...assets[0].payload,
      set: {},
      setCode: null,
      localId: null,
      number: null,
      name: null,
      nativeName: null,
    },
  };
  const incompleteAssetValidation = adapter.validateRecord(incompleteAsset);
  assert.equal(incompleteAssetValidation.ok, false);
  assert.deepEqual(
    incompleteAssetValidation.issues
      .filter((issue) => issue.severity === 'error')
      .map((issue) => issue.code)
      .filter((code) => ['set_code_missing', 'collector_number_missing', 'native_name_missing'].includes(code))
      .sort(),
    ['collector_number_missing', 'native_name_missing', 'set_code_missing'],
  );
  assert.equal(
    requests.filter((url) => url.includes('/card/50461/')).length,
    1,
    'card, set and asset retrieval must reuse one detail response for the same bounded scope',
  );

  const setRun = await new CatalogueIngestionRunner({
    schema(schema: string) {
      throw new Error(`Dry-run unexpectedly accessed Supabase schema ${schema}.`);
    },
  }, adapter).run({
    command: 'run_set',
    language: 'ja',
    setId: '958',
    limit: 1,
    cursor: { offset: 0 },
    dryRun: true,
  });
  assert.equal(setRun.ok, true);
  assert.ok(setRun.stats);
  assert.equal(setRun.stats.recordsRetrieved, 2, 'set runs must include the official set record before its card');

  const parsedPokemon = pokemonCardJpAdapterInternals.parseOfficialCardDetail(pokemonDetail);
  assert.deepEqual({
    name: parsedPokemon.name,
    setCode: parsedPokemon.setCode,
    collectorNumber: parsedPokemon.collectorNumber,
    printedTotal: parsedPokemon.printedTotal,
    artist: parsedPokemon.artist,
    supertype: parsedPokemon.supertype,
    stage: parsedPokemon.stage,
    hp: parsedPokemon.hp,
  }, {
    name: 'シェイミ',
    setCode: 'MEM',
    collectorNumber: '001',
    printedTotal: 17,
    artist: 'HYOGONOSUKE',
    supertype: 'pokemon',
    stage: 'たね',
    hp: 80,
  });

  const parsedPromo = pokemonCardJpAdapterInternals.parseOfficialCardDetail(promoWithoutNumber);
  assert.equal(parsedPromo.setCode, 'XY-P');
  assert.equal(parsedPromo.collectorNumber, null);
  const invalidPromo = {
    ...cards[0],
    providerRecordId: '31560',
    payload: {
      ...cards[0].payload,
      cardID: '31560',
      id: '31560',
      name: parsedPromo.name,
      localId: parsedPromo.collectorNumber,
      number: parsedPromo.collectorNumber,
      setCode: parsedPromo.setCode,
      set: { id: parsedPromo.setCode, code: parsedPromo.setCode, name: 'XYプロモ' },
      image: parsedPromo.imageUrl,
      imageUrl: parsedPromo.imageUrl,
    },
  };
  const promoValidation = adapter.validateRecord(invalidPromo);
  assert.equal(promoValidation.ok, false);
  assert.equal(promoValidation.issues.some((issue) => issue.code === 'collector_number_missing'), true);

  const registryAdapter = createSourceAdapter({
    source: 'pokemon-card-jp-official',
    language: 'ja',
  });
  assert.equal(registryAdapter.identifySource().code, 'pokemon_card_jp_official');
  assert.equal(registryAdapter.identifySource().licenceStatus, 'under_review');

  assert.throws(
    () => pokemonCardJpAdapterInternals.boundedLimit({ limit: 501 }),
    /limited to 500 cards/,
  );
  console.log('Official Japanese catalogue adapter tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
