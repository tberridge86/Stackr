(() => {
  const get = id => document.getElementById(id);
  const svgNS = 'http://www.w3.org/2000/svg';
  const systemMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const local = ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(location.hostname);
  let references = null;
  let activeCase = null;
  let cards = [];
  let animation = null;
  let moving = null;
  let epoch = 0;
  let loadEpoch = 0;
  let ready = false;
  get('reduce').checked = systemMotion.matches;

  function element(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  }
  function localImage(file) {
    if (!local || !/^[a-z0-9-]+\.(?:jpeg|jpg|png)$/.test(file)) throw Error('Local reference unavailable');
    return '/private-unpacking-references/' + file;
  }
  function cropValid(crop, width, height) {
    return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 && width <= 8000 && height <= 8000
      && Array.isArray(crop) && crop.length === 4 && crop.every(Number.isFinite)
      && crop[0] >= 0 && crop[1] >= 0 && crop[2] > 0 && crop[3] > 0
      && crop[0] + crop[2] <= width && crop[1] + crop[3] <= height;
  }
  function photoSprite(asset, view, sheet = false) {
    if (!cropValid(asset.crop, asset.width, asset.height)) throw Error('Reference crop invalid');
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', view.join(' '));
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    const group = document.createElementNS(svgNS, 'g');
    if (sheet) group.setAttribute('transform', `translate(0 ${asset.crop[2]}) rotate(-90) translate(${-asset.crop[0]} ${-asset.crop[1]})`);
    const image = document.createElementNS(svgNS, 'image');
    image.setAttribute('href', localImage(asset.file));
    image.setAttribute('width', String(asset.width));
    image.setAttribute('height', String(asset.height));
    group.append(image);
    svg.append(group);
    return svg;
  }
  function cancel() {
    epoch += 1;
    animation?.cancel();
    animation = null;
    moving = null;
  }
  function chooseNext() {
    return cards.find(card => card.phase === 'loose') ?? cards.find(card => card.phase === 'attached');
  }
  function controls() {
    const next = chooseNext();
    get('play').disabled = !ready || Boolean(animation) || !next;
    get('play').textContent = !ready ? 'References unavailable' : !next ? 'Cards revealed'
      : next.phase === 'loose' ? 'Flip ' + next.name : activeCase.kind === 'packet' ? 'Slide out the card' : 'Peel ' + next.name;
    get('skip').disabled = !ready || !next;
    get('case').disabled = !references;
    for (const card of cards) {
      card.button.disabled = !ready || Boolean(animation) || card.phase === 'revealed';
      card.button.dataset.phase = card.phase;
      card.button.setAttribute('aria-label', card.phase === 'revealed' ? card.name + ' revealed'
        : card.phase === 'loose' ? 'Flip ' + card.name + ' over'
          : activeCase.kind === 'packet' ? 'Slide out ' + card.name : 'Release the backing behind ' + card.name);
    }
  }
  function settle(card, action) {
    if (action === 'peel') {
      card.phase = 'loose';
      card.vacancy.dataset.open = 'true';
      card.curl.style.opacity = '0';
      card.curl.style.transform = '';
      get('phase').textContent = card.name + ' is free, back facing up. Flip it to see the front.';
    } else {
      card.phase = 'revealed';
      if (card.sleeve) card.sleeve.dataset.open = 'true';
      get('phase').textContent = card.name + ' revealed. ' + (cards.some(c => c.phase !== 'revealed') ? 'Try the other card.' : 'Ready to inspect.');
    }
    controls();
  }
  function reset() {
    cancel();
    cards.forEach(card => {
      card.phase = 'attached';
      card.button.dataset.phase = 'attached';
      if (card.vacancy) delete card.vacancy.dataset.open;
      if (card.curl) { card.curl.style.opacity = ''; card.curl.style.transform = ''; }
      if (card.sleeve) delete card.sleeve.dataset.open;
    });
    get('phase').textContent = ready ? activeCase.kind === 'sheet' ? 'Both backs match the sheet. Choose a card.' : 'The side is already open. Slide the card out.' : 'Reference images are unavailable. Reload to try again.';
    controls();
  }
  async function perform(card) {
    if (!ready || !card || animation || card.phase === 'revealed') return;
    const action = activeCase.kind === 'packet' ? 'slide' : card.phase === 'loose' ? 'flip' : 'peel';
    if (get('reduce').checked || systemMotion.matches) { settle(card, action); return; }
    const run = ++epoch;
    moving = { card, action };
    let target;
    let frames;
    let duration;
    if (action === 'peel') {
      target = card.curl;
      target.style.opacity = '1';
      get('phase').textContent = 'Keep the card supported. Peel the paper away…';
      frames = [{ transform: 'translateX(0) rotateY(0deg)', opacity: .1 },
        { transform: 'translateX(-12px) rotateY(-62deg)', opacity: 1, offset: .58 },
        { transform: 'translateX(-32px) rotateY(-112deg)', opacity: 0 }];
      duration = 1300;
    } else if (action === 'flip') {
      target = card.turn;
      get('phase').textContent = 'Turning ' + card.name + ' over…';
      frames = [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(180deg)' }];
      duration = 800;
    } else {
      target = card.button;
      get('phase').textContent = 'Sliding Pikachu VMAX out, front facing up…';
      const offset = card.button.offsetWidth * 46 / 36;
      frames = [{ transform: 'translateX(0)' }, { transform: `translateX(${offset}px)` }];
      duration = 1100;
    }
    const current = target.animate(frames, { duration, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'forwards' });
    animation = current;
    controls();
    try { await current.finished; } catch { return; }
    if (run !== epoch) return;
    animation = null;
    moving = null;
    settle(card, action);
    current.cancel();
  }
  function skip() {
    cancel();
    for (const card of cards) {
      if (card.vacancy) card.vacancy.dataset.open = 'true';
      if (card.curl) { card.curl.style.opacity = '0'; card.curl.style.transform = ''; }
      if (card.sleeve) card.sleeve.dataset.open = 'true';
      card.phase = 'revealed';
    }
    get('phase').textContent = 'Cards revealed. Your collection has not changed.';
    controls();
  }
  function reduceCurrent() {
    if (!moving || !(get('reduce').checked || systemMotion.matches)) return;
    const current = moving;
    cancel();
    settle(current.card, current.action);
  }
  function sourceLink(label, url) {
    const a = element('a', '', label);
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }
  function slotStyle(node, slot) {
    const values = [slot[0] / 1079, slot[1] / 917, slot[2] / 1079, slot[3] / 917];
    ['--slot-x', '--slot-y', '--slot-w', '--slot-h'].forEach((key, i) => node.style.setProperty(key, (values[i] * 100) + '%'));
  }
  function renderSheet() {
    const config = references.sheet1996;
    const matches = (asset, file, hash, width, height, crop) => asset?.file === file && asset.sha256 === hash
      && asset.width === width && asset.height === height && JSON.stringify(asset.crop) === JSON.stringify(crop);
    if (!config || !Array.isArray(config.cards) || config.cards.length !== 2
      || !matches(config.paper, '1996-carrier-original.jpeg', '2af573589fd754f41cb908992d53634e4361cd8a6268b864e79dc4086d216450', 1920, 1117, [21, 15, 917, 1079])
      || config.cards[0].name !== 'Ivy Pikachu' || config.cards[0].nativeName !== 'ピカチュウ'
      || JSON.stringify(config.cards[0].slot) !== JSON.stringify([58, 216, 445, 637])
      || !matches(config.cards[0].front, '1996-pikachu-owner-detail.jpeg', 'dd2de97c37b7d76289b98117249be6defda60cd5dcda577593dfc27f1c83bd24', 1920, 1349, [42, 38, 906, 1277])
      || config.cards[0].front.printedCredit !== 'Ken Sugimori' || config.cards[0].front.creditVisuallyChecked !== true
      || config.cards[1].name !== 'Jigglypuff' || config.cards[1].nativeName !== 'プリン'
      || JSON.stringify(config.cards[1].slot) !== JSON.stringify([572, 216, 445, 637])
      || !matches(config.cards[1].front, '1996-jigglypuff-reference.jpg', '6faf012936653c4f2300c067404269f222ec29b3388ee85403f34c4aeb33c4c7', 214, 300, [0, 0, 214, 300])
      || config.cards[1].front.copyCannotExcludeIndistinguishable1998Reprint !== true
      || config.cards[1].front.detailStatus !== 'small_reference_not_HD_original') throw Error('Exact sheet references missing');
    const mount = element('div', 'mount');
    const sheet = element('div', 'sheet-photo');
    sheet.append(photoSprite(config.paper, [0, 0, 1079, 917], true));
    mount.append(sheet);
    cards = config.cards.map(info => {
      if (!cropValid(info.slot, 1079, 917)) throw Error('Card position invalid');
      const vacancy = element('div', 'vacancy');
      const curl = element('div', 'paper-curl');
      const button = element('button', 'study-card');
      button.type = 'button';
      [vacancy, curl, button].forEach(node => slotStyle(node, info.slot));
      const turn = element('div', 'turn');
      const back = element('div', 'face back');
      back.append(photoSprite(config.paper, info.slot, true));
      const front = element('div', 'face front');
      front.append(photoSprite(info.front, info.front.crop));
      turn.append(back, front);
      button.append(turn);
      const card = { name: info.name, phase: 'attached', button, turn, vacancy, curl };
      button.addEventListener('click', () => { void perform(card); });
      mount.append(vacancy, curl, button);
      return card;
    });
    get('stage').replaceChildren(mount);
  }
  function renderPacket() {
    const config = references.packet2022;
    if (!config || config.cardId !== 'e79457e0-3de0-46a5-af20-bad8b3cfd479' || config.setId !== 'd45d21f2-6240-5584-9b01-4acf3e2297d9'
      || config.language !== 'ja' || config.collectorNumber !== '265' || config.setCode !== 'S-P' || config.nativeName !== 'ピカチュウVMAX'
      || config.assetPermission !== 'approved' || config.nativeImageStatus !== 'available'
      || config.assetCardId !== config.cardId || config.assetSetId !== config.setId
      || config.imageUrl !== 'https://www.pokemon-card.com/assets/images/card_images/large/S-P/041152_P_PIKACHIXYUUVMAX.jpg') throw Error('Exact printing reference unavailable');
    if (config.wrapperFile && (config.wrapperFile !== '2022-pikachu-vmax-wrapper.jpg'
      || config.wrapperReference?.sha256 !== '03b2bfd409dfcaac109e55e2f23062f5f92ab1dfe04e68dbe4661626f8e15dd4'
      || config.wrapperReference.width !== 750 || config.wrapperReference.height !== 1080
      || config.wrapperReference.sourcePage !== 'https://magi.camp/items/678745409'
      || config.wrapperReference.sourceImage !== 'https://storage.googleapis.com/magi-production-public/iy6sjg5o7elkteu39hahks5pm41o')) throw Error('Regular sleeve reference unavailable');
    const mount = element('div', 'packet-mount');
    const button = element('button', 'packet-card');
    button.type = 'button';
    const image = element('img');
    image.src = config.imageUrl;
    image.alt = 'Japanese Pikachu VMAX 265/S-P';
    button.append(image);
    const sleeve = element('div', 'packet-sleeve');
    if (config.wrapperFile) { const paper = element('img'); paper.src = localImage(config.wrapperFile); paper.alt = 'February 2022 regular-magazine sleeve reference'; sleeve.append(paper); }
    else sleeve.append(element('div', 'packet-label', 'Paper sleeve reference pending. Right-side extraction starts after the opening has been made.'));
    const card = { name: 'Pikachu VMAX', phase: 'attached', button, sleeve };
    button.addEventListener('click', () => { void perform(card); });
    mount.append(button, sleeve);
    get('stage').replaceChildren(mount);
    cards = [card];
  }
  async function waitImages(run) {
    const assets = [...get('stage').querySelectorAll('image, img')];
    const urls = [...new Set(assets.map(image => image.localName === 'image' ? image.getAttribute('href') : image.src))];
    const checks = await Promise.all(urls.map(url => new Promise(resolve => {
      const image = new Image();
      const timer = setTimeout(() => resolve(false), 8000);
      image.onload = () => { clearTimeout(timer); resolve(image.naturalWidth > 0); };
      image.onerror = () => { clearTimeout(timer); resolve(false); };
      image.src = url;
    })));
    if (run !== loadEpoch) return;
    ready = checks.every(Boolean);
    reset();
  }
  async function render() {
    cancel();
    const loadRun = ++loadEpoch;
    ready = false;
    cards = [];
    const sheet = get('case').value === '1996-sheet';
    activeCase = { kind: sheet ? 'sheet' : 'packet' };
    get('title').textContent = sheet ? 'Peel the paper. Then turn the card.' : 'One sleeve. A different opening.';
    get('intro').textContent = sheet ? 'The old Pocket Monsters backs stay facing up. Release the backing first, then flip each card to reveal its front.' : 'This regular-magazine insert slides out through the right side, with Pikachu VMAX already facing up.';
    get('hint').textContent = sheet ? 'Backs facing up · peel the paper · flip' : 'Right-side extraction · front facing up';
    get('issue-label').textContent = sheet ? 'Monthly CoroCoro Comic · November 1996' : 'Monthly CoroCoro Comic · February 2022';
    get('card-label').textContent = sheet ? 'Ivy Pikachu & Jigglypuff' : 'Pikachu VMAX · 265/S-P';
    get('reference-note').textContent = sheet ? 'Ivy Pikachu shows the original Ken Sugimori credit. Jigglypuff uses a small reference image; its pictured copy cannot distinguish the 1996 original from the identical 1998 reprint.' : 'The pictured sleeve is the regular physical-magazine insert. The card image matches Japanese 265/S-P; physical finish remains unverified.';
    get('cover').hidden = !sheet;
    get('sources').replaceChildren(...(sheet ? [
      sourceLink('Watch the original sheet opening · 22:13 ↗', 'https://www.youtube.com/watch?v=8A5KDZAzDMs&t=1333s'),
      sourceLink('Watch Jigglypuff being flipped · 23:05 ↗', 'https://www.youtube.com/watch?v=8A5KDZAzDMs&t=1385s'),
    ] : [sourceLink('Watch the regular sleeve extraction · 0:58 ↗', 'https://www.youtube.com/watch?v=sHQVGH-CZbg&t=58s')]));
    get('evidence').replaceChildren(element('p', '', sheet ? 'The original scan has two landscape backs stacked relative to its instruction panel. The whole sheet is turned here to show those same backs side by side. The watched film supports a supported card, peeling backing and a later front reveal. Exact curl, speed and flip axis remain design choices.' : 'The filmed wrapper matches the regular physical magazine. The visible action is a right-side slide with the card front facing the camera. The first seal-opening step is off-camera, so the preview begins from the already-opened side. The digital insert set uses different packaging.'), element('p', '', 'This preview does not change your collection. The original 2001 Mew reveal remains the benchmark.'));
    get('phase').textContent = 'Loading the local reference images…';
    try {
      if (sheet) renderSheet(); else renderPacket();
      controls();
      await waitImages(loadRun);
    } catch {
      cards = [];
      get('stage').replaceChildren(element('p', 'loading-note', 'Exact reference images are unavailable. The opening footage links remain available below.'));
      get('phase').textContent = 'Reference images unavailable.';
      controls();
    }
  }
  get('play').addEventListener('click', () => { void perform(chooseNext()); });
  get('skip').addEventListener('click', skip);
  get('reset').addEventListener('click', reset);
  get('reduce').addEventListener('change', reduceCurrent);
  get('case').addEventListener('change', () => { void render(); });
  systemMotion.addEventListener('change', reduceCurrent);
  document.addEventListener('visibilitychange', () => { if (document.hidden && animation) reset(); });
  window.addEventListener('pagehide', () => { if (animation) reset(); });
  if (!local) {
    get('phase').textContent = 'These held reference images are available in the local preview only.';
    get('stage').replaceChildren(element('p', 'loading-note', 'Use the opening-footage links to inspect the source.'));
    get('case').disabled = true;
    get('play').textContent = 'Local preview only';
    return;
  }
  fetch('/unpacking-reference-assets.json').then(response => {
    if (!response.ok) throw Error('Reference receipt missing');
    return response.json();
  }).then(data => {
    if (data.schemaVersion !== 1 || data.referenceOnly !== true || data.publicDisplayApproved !== false) throw Error('Reference scope invalid');
    references = data;
    void render();
  }).catch(() => {
    get('phase').textContent = 'Local reference files unavailable. Opening footage is linked below.';
    get('stage').replaceChildren(element('p', 'loading-note', 'Reference assets are held outside the app bundle.'));
    get('play').textContent = 'References unavailable';
    get('case').disabled = true;
  });
})();
