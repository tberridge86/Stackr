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
    if (!local || !/^[a-z0-9-]+\.(?:jpeg|jpg|png|webp)$/.test(file)) throw Error('Local reference unavailable');
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
  function smooth(value) {
    const bounded = Math.min(1, Math.max(0, value));
    return bounded * bounded * (3 - 2 * bounded);
  }
  function paintPeel(card, progress) {
    const release = smooth((progress - .7) / .3);
    const lift = Math.sin(Math.PI * progress);
    const stage = progress < .18 ? 'edge' : progress < .7 ? 'backing' : 'lifting';
    if (card.button.classList.contains('is-peeling') && card.button.dataset.peelStage !== stage) {
      card.button.dataset.peelStage = stage;
      get('phase').textContent = stage === 'edge' ? 'Carefully loosening the edge…'
        : stage === 'backing' ? 'Slowly separating the backing…' : 'Lifting the loose card, back facing up…';
    }
    for (const node of [card.button, card.vacancy, card.paper, card.shadow]) {
      node.style.setProperty('--peel-progress', String(progress));
      node.style.setProperty('--release-progress', String(release));
      node.style.setProperty('--lift', String(lift));
    }
    card.button.style.setProperty('--card-x', (card.side * card.freePose[0] * release) + '%');
    card.button.style.setProperty('--card-y', (card.freePose[1] * release) + '%');
    card.button.style.setProperty('--card-angle', (card.side * card.freePose[2] * release) + 'deg');
    card.button.style.setProperty('--card-lift', (3 * lift) + 'deg');
    const front = 100 - 96 * progress;
    const bottom = 100 + 18 * lift;
    const lip = bottom - (3 + 4 * lift);
    const n = value => value.toFixed(2);
    if (card.peelDirection === 'bottom-left') {
      const left = 100 - 96 * Math.min(1, progress * 1.35);
      const right = 100 - 96 * Math.max(0, (progress - .2) / .8);
      const leftBottom = 100 + 17 * lift;
      const rightBottom = 100 + 5 * lift;
      card.vacancy.style.clipPath = `polygon(0 ${n(left)}%,100% ${n(right)}%,100% 100%,0 100%)`;
      card.underside.setAttribute('d', `M 0 ${n(left)} Q 42 ${n((left + right) / 2 - 6 * lift)} 100 ${n(right)} L 100 ${n(rightBottom)} Q 40 ${n(leftBottom + 2 * lift)} 0 ${n(leftBottom)} Z`);
      card.fold.setAttribute('d', `M 0 ${n(leftBottom - 8 * lift - 2)} Q 45 ${n(leftBottom - 5 * lift)} 100 ${n(rightBottom - 2)} L 100 ${n(rightBottom)} Q 40 ${n(leftBottom + 2 * lift)} 0 ${n(leftBottom)} Z`);
      card.edge.setAttribute('d', `M 0 ${n(leftBottom)} Q 40 ${n(leftBottom + 2 * lift)} 100 ${n(rightBottom)}`);
    } else {
      card.underside.setAttribute('d', `M 0 ${n(front)} C 25 ${n(front - 5 * lift)} 75 ${n(front + 5 * lift)} 100 ${n(front)} L 100 ${n(bottom)} C 76 ${n(bottom + 2 * lift)} 24 ${n(bottom + 2 * lift)} 0 ${n(bottom)} Z`);
      card.fold.setAttribute('d', `M 0 ${n(lip)} C 25 ${n(lip - 2 * lift)} 75 ${n(lip + 2 * lift)} 100 ${n(lip)} L 100 ${n(bottom)} C 76 ${n(bottom + 2 * lift)} 24 ${n(bottom + 2 * lift)} 0 ${n(bottom)} Z`);
      card.edge.setAttribute('d', `M 0 ${n(bottom)} C 24 ${n(bottom + 2 * lift)} 76 ${n(bottom + 2 * lift)} 100 ${n(bottom)}`);
    }
    card.paper.style.opacity = String(Math.min(1, progress * 8) * (1 - smooth((progress - .88) / .12)));
    card.shadow.style.opacity = String(lift * .55);
  }
  function clearPeel(card) {
    if (!card.paper) return;
    card.button.classList.remove('is-peeling');
    card.paper.classList.remove('is-peeling');
    delete card.button.dataset.peelStage;
    card.paper.style.opacity = '0';
    card.shadow.style.opacity = '0';
  }
  function peelMotion(card) {
    let frame = 0;
    let stopped = false;
    let rejectFinished;
    const finished = new Promise((resolve, reject) => {
      rejectFinished = reject;
      let started;
      const tick = now => {
        if (stopped) return;
        if (started === undefined) started = now;
        const progress = Math.min(1, (now - started) / card.peelDuration);
        paintPeel(card, smooth(progress));
        if (progress < 1) frame = requestAnimationFrame(tick);
        else resolve();
      };
      frame = requestAnimationFrame(tick);
    });
    card.button.classList.add('is-peeling');
    card.paper.classList.add('is-peeling');
    paintPeel(card, 0);
    return {
      finished,
      cancel() {
        if (stopped) return;
        stopped = true;
        cancelAnimationFrame(frame);
        rejectFinished(Error('Peel cancelled'));
      },
    };
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
      paintPeel(card, 1);
      card.vacancy.style.removeProperty('clip-path');
      card.vacancy.dataset.open = 'true';
      clearPeel(card);
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
      if (card.paper) { paintPeel(card, 0); clearPeel(card); }
      if (card.sleeve) delete card.sleeve.dataset.open;
    });
    get('phase').textContent = ready ? activeCase.start : 'Reference images are unavailable. Reload to try again.';
    controls();
  }
  async function perform(card) {
    if (!ready || !card || animation || card.phase === 'revealed') return;
    const action = activeCase.kind === 'packet' ? 'slide' : card.phase === 'loose' ? 'flip' : 'peel';
    if (get('reduce').checked || systemMotion.matches) { settle(card, action); return; }
    const run = ++epoch;
    moving = { card, action };
    let current;
    if (action === 'peel') {
      get('phase').textContent = 'Keep the card supported. Slowly peel the backing away…';
      current = peelMotion(card);
    } else if (action === 'flip') {
      get('phase').textContent = 'Turning ' + card.name + ' over…';
      current = card.turn.animate([{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(180deg)' }],
        { duration: 1100, easing: 'cubic-bezier(.45,0,.2,1)', fill: 'forwards' });
    } else {
      get('phase').textContent = 'Sliding ' + card.name + ' out, front facing up…';
      const offset = card.button.offsetWidth * card.slideRatio;
      current = card.button.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${offset}px)` }],
        { duration: 1100, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'forwards' });
    }
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
      if (card.paper) { paintPeel(card, 1); clearPeel(card); }
      if (card.vacancy) card.vacancy.style.removeProperty('clip-path');
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
  function slotStyle(node, slot, canvas) {
    const values = [slot[0] / canvas[0], slot[1] / canvas[1], slot[2] / canvas[0], slot[3] / canvas[1]];
    ['--slot-x', '--slot-y', '--slot-w', '--slot-h'].forEach((key, i) => node.style.setProperty(key, (values[i] * 100) + '%'));
  }
  function renderSheet(id) {
    const original = id === '1996-sheet';
    const config = original ? references.sheet1996 : references[id === '2000-cleffa' ? 'sheetCleffa2000' : 'sheetWooper2000'];
    const matches = (asset, file, hash, width, height, crop) => asset?.file === file && asset.sha256 === hash
      && asset.width === width && asset.height === height && JSON.stringify(asset.crop) === JSON.stringify(crop);
    if (original && (!config || !Array.isArray(config.cards) || config.cards.length !== 2
      || !matches(config.paper, '1996-carrier-original.jpeg', '2af573589fd754f41cb908992d53634e4361cd8a6268b864e79dc4086d216450', 1920, 1117, [21, 15, 917, 1079])
      || config.cards[0].name !== 'Ivy Pikachu' || config.cards[0].nativeName !== 'ピカチュウ'
      || JSON.stringify(config.cards[0].slot) !== JSON.stringify([58, 216, 445, 637])
      || !matches(config.cards[0].front, '1996-pikachu-owner-detail.jpeg', 'dd2de97c37b7d76289b98117249be6defda60cd5dcda577593dfc27f1c83bd24', 1920, 1349, [42, 38, 906, 1277])
      || config.cards[0].front.printedCredit !== 'Ken Sugimori' || config.cards[0].front.creditVisuallyChecked !== true
      || config.cards[1].name !== 'Jigglypuff' || config.cards[1].nativeName !== 'プリン'
      || JSON.stringify(config.cards[1].slot) !== JSON.stringify([572, 216, 445, 637])
      || !matches(config.cards[1].front, '1996-jigglypuff-reference.jpg', '6faf012936653c4f2300c067404269f222ec29b3388ee85403f34c4aeb33c4c7', 214, 300, [0, 0, 214, 300])
      || config.cards[1].front.copyCannotExcludeIndistinguishable1998Reprint !== true
      || config.cards[1].front.detailStatus !== 'small_reference_not_HD_original')) throw Error('Exact sheet references missing');
    if (!original) {
      const cleffa = id === '2000-cleffa';
      const expected = cleffa ? {
        name: 'Cleffa', native: 'ピィ', paper: ['2000-cleffa-carrier-original.webp', '37a97ef8f92d6c902bf0600c6d86d5109d96a95d977bdaa02f186e435527fc13', 1600, 1787, [0,0,1600,1787]],
        slot: [122,118,1084,1524], front: ['2000-cleffa-front-original.jpg', '4aee0eb2a6282a29a8f63a89383309dc2f30a19d67a5470d1e1d98f254dd75e4',1354,1900,[0,0,1354,1900]],
      } : {
        name: 'Wooper', native: 'ウパー', paper: ['2000-wooper-carrier-reference.webp','12041e731ea9105ffd58a9a89ed2640938eb38fa0711a77654bde5be2a6de49e',1600,1600,[145,66,1305,1480]],
        slot: [109,108,884,1226], front: ['2000-wooper-front-reference.jpg','333c4ebd1b211837074884e0043da15c1a80b929b8891afc46e92a660d8bea7c',300,419,[0,0,300,419]],
      };
      if (!config || config.referenceOnly !== true || config.publicDisplayApproved !== false || config.ownershipBindingAllowed !== false
        || !Array.isArray(config.cards) || config.cards.length !== 1 || !matches(config.paper, ...expected.paper)
        || config.cards[0].name !== expected.name || config.cards[0].nativeName !== expected.native
        || JSON.stringify(config.cards[0].slot) !== JSON.stringify(expected.slot) || !matches(config.cards[0].front, ...expected.front)) throw Error('Exact portrait sheet reference missing');
    }
    const canvas = original ? [1079,917] : config.paper.crop.slice(2);
    const mount = element('div', original ? 'mount' : 'mount single-sheet');
    mount.style.aspectRatio = canvas.join(' / ');
    const sheet = element('div', 'sheet-photo');
    const view = slot => original ? slot : [slot[0] + config.paper.crop[0], slot[1] + config.paper.crop[1], slot[2], slot[3]];
    sheet.append(photoSprite(config.paper, original ? [0,0,...canvas] : config.paper.crop, original));
    mount.append(sheet);
    cards = config.cards.map((info, index) => {
      if (!cropValid(info.slot, ...canvas)) throw Error('Card position invalid');
      const vacancy = element('div', 'vacancy');
      const paper = element('div', 'peel-paper');
      const shadow = element('div', 'peel-shadow');
      const curl = document.createElementNS(svgNS, 'svg');
      curl.setAttribute('viewBox', '0 0 100 170');
      curl.setAttribute('preserveAspectRatio', 'none');
      curl.setAttribute('aria-hidden', 'true');
      const defs = document.createElementNS(svgNS, 'defs');
      const gradient = document.createElementNS(svgNS, 'linearGradient');
      const gradientId = 'peel-fold-' + index;
      gradient.setAttribute('id', gradientId);
      gradient.setAttribute('x1', '0%');
      gradient.setAttribute('y1', '0%');
      gradient.setAttribute('x2', '0%');
      gradient.setAttribute('y2', '100%');
      [['0%', '#fffaf0'], ['30%', '#e2d1b6'], ['65%', '#c4af8d'], ['100%', '#faf4e7']].forEach(([offset, color]) => {
        const stop = document.createElementNS(svgNS, 'stop');
        stop.setAttribute('offset', offset);
        stop.setAttribute('stop-color', color);
        gradient.append(stop);
      });
      defs.append(gradient);
      curl.append(defs);
      paper.style.setProperty('--peel-fold-fill', `url(#${gradientId})`);
      const [underside, fold, edge] = ['peel-underside', 'peel-fold', 'peel-edge'].map(cls => {
        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('class', cls);
        curl.append(path);
        return path;
      });
      paper.append(curl);
      const button = element('button', 'study-card');
      button.type = 'button';
      button.dataset.side = index === 0 ? 'left' : 'right';
      [vacancy, paper, shadow, button].forEach(node => slotStyle(node, info.slot, canvas));
      const turn = element('div', 'turn');
      const back = element('div', 'face back');
      back.append(photoSprite(config.paper, view(info.slot), original));
      const front = element('div', 'face front');
      front.append(photoSprite(info.front, info.front.crop));
      turn.append(back, front);
      button.append(turn);
      const card = { name: info.name, phase: 'attached', side: index === 0 ? -1 : 1,
        freePose: original ? [8,-28,4] : [5,-18,2], peelDuration: original ? 4200 : 4800,
        peelDirection: original ? 'bottom' : 'bottom-left', button, turn, vacancy, paper, shadow, underside, fold, edge };
      paintPeel(card, 0);
      clearPeel(card);
      button.addEventListener('click', () => { void perform(card); });
      mount.append(vacancy, shadow, paper, button);
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
    const card = { name: 'Pikachu VMAX', phase: 'attached', button, sleeve, slideRatio: 46 / 36 };
    button.addEventListener('click', () => { void perform(card); });
    mount.append(button, sleeve);
    get('stage').replaceChildren(mount);
    cards = [card];
  }
  function renderCetitan() {
    const config = references.packetCetitan2023;
    if (!config || config.referenceOnly !== true || config.publicDisplayApproved !== false || config.ownershipBindingAllowed !== false
      || config.cardId !== 'e7ae34f3-28e6-41e8-b2ad-fc9feaaf2e4d' || config.setId !== 'c20234cb-c629-4383-b107-c49b38b682ae'
      || config.language !== 'ja' || config.collectorNumber !== '058' || config.setCode !== 'SV-P' || config.nativeName !== 'ハルクジラ'
      || config.nativeImageStatus !== 'scan_acquisition_required'
      || config.pouch.file !== '2023-cetitan-pouch-reverse-original.jpg' || config.pouch.sha256 !== 'f452eaf52eb7867098a6c7daf35d6711f37db76156eaa62c33f58ae4cd72adda'
      || config.pouch.width !== 1080 || config.pouch.height !== 1080 || JSON.stringify(config.pouch.crop) !== '[137,36,820,980]'
      || config.front.file !== '2023-cetitan-front-official-reference.jpg' || config.front.sha256 !== 'c2d7acf5d5522fd153bab787d631631149c5cb4eecf54ab3065813d4cc07d063'
      || config.front.width !== 868 || config.front.height !== 1212 || JSON.stringify(config.front.crop) !== '[0,0,868,1212]') throw Error('Exact private Cetitan references unavailable');
    const mount = element('div', 'packet-mount packet-cetitan');
    const button = element('button', 'packet-card');
    button.type = 'button';
    button.append(photoSprite(config.front, config.front.crop));
    const sleeve = element('div', 'packet-sleeve');
    sleeve.append(photoSprite(config.pouch, config.pouch.crop));
    const card = { name: 'Cetitan', phase: 'attached', button, sleeve, slideRatio: 30 / 34 };
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
    const id = get('case').value;
    const scenes = {
      '1996-sheet': {
        kind: 'sheet', title: 'Peel the paper. Then turn the card.',
        intro: 'The old Pocket Monsters backs stay facing up. Release the backing first, then flip each card to reveal its front.',
        hint: 'Backs facing up · peel the paper · flip', issue: 'Monthly CoroCoro Comic · November 1996', label: 'Ivy Pikachu & Jigglypuff',
        note: 'Ivy Pikachu shows the original Ken Sugimori credit. Jigglypuff uses a small reference image; its pictured copy cannot distinguish the 1996 original from the identical 1998 reprint.',
        start: 'Both backs match the sheet. Choose a card.',
        sources: [['Watch the original sheet opening · 22:13 ↗','https://www.youtube.com/watch?v=8A5KDZAzDMs&t=1333s'],['Watch Jigglypuff being flipped · 23:05 ↗','https://www.youtube.com/watch?v=8A5KDZAzDMs&t=1385s']],
        evidence: 'The original scan has two landscape backs stacked relative to its instruction panel. The whole sheet is turned here to show those same backs side by side. The watched film supports a supported card, peeling backing and a later front reveal. Exact curl, speed and flip axis remain design choices.',
      },
      '2000-cleffa': {
        kind: 'sheet', title: 'Start at the little arrow.',
        intro: 'Support Cleffa while the backing curls away from the lower-left corner. Once it is free, turn it over.',
        hint: 'Lower-left corner · careful peel · flip', issue: 'Monthly CoroCoro Comic · February 2000', label: 'Cleffa · ピィ',
        note: 'Cleffa uses its own pink carrier, right-hand instruction strip and original Japanese February front. The printed No.173 is its species number.',
        start: 'Back facing up. Begin at the lower-left arrow.',
        sources: [['Watch Cleffa’s supported peel and front reveal ↗','https://www.youtube.com/watch?v=iXaufqXi2Zg'],['Inspect the original carrier and February front ↗','https://torecacamp-pokemon.com/products/rc_itmbsbj7rezy_pdci']],
        evidence: 'The carrier says “Carefully peel from here” at the bottom-left. The watched film shows support behind the old back, paper folding away and the Cleffa front. The source front directly identifies the February issue; 2000 is corroborated by the listing and PokeBoon. Curl, timing and the separate flip presentation are design choices; removal from the magazine binding is not established.',
      },
      '2000-wooper': {
        kind: 'sheet', title: 'Let the backing curl away.',
        intro: 'Start at Wooper’s lower-left arrow, keep the card supported and gently release the paper before turning it over.',
        hint: 'Lower-left corner · supported peel · flip', issue: 'Monthly CoroCoro Comic · January 2000', label: 'Wooper · ウパー · additional issue',
        note: 'Wooper has its own blue-wave carrier and red instruction strip. Its front is a small 300 × 419 reference. This issue is additional to the current magazine list.',
        start: 'Back facing up. Begin at the lower-left arrow.',
        sources: [['Watch Wooper’s lower-left peel · 0:16 ↗','https://www.youtube.com/watch?v=JEnnOd7vZfM&t=16s'],['Inspect Wooper’s carrier photograph ↗','https://www.ebay.com/itm/385103202494'],['Inspect the Japanese January front ↗','https://pokeboon.com/corocoro_wooper_promo/']],
        evidence: 'The collector identifies the bottom-left starting corner and the footage shows the carrier curling away. The segment is sped up, so it does not establish real hand speed. This preview keeps a slow peel and a separate turn for inspection; its curl and flip axis are design choices. The carrier is a slightly skewed photograph, and the front remains a small reference.',
      },
      '2022-packet': {
        kind: 'packet', title: 'One sleeve. A different opening.',
        intro: 'This regular-magazine insert slides out through the right side, with Pikachu VMAX already facing up.',
        hint: 'Right-side extraction · front facing up', issue: 'Monthly CoroCoro Comic · February 2022', label: 'Pikachu VMAX · 265/S-P',
        note: 'The pictured sleeve is the regular physical-magazine insert. The card image matches Japanese 265/S-P; physical finish remains unverified.',
        start: 'The side is already open. Slide the card out.',
        sources: [['Watch the regular sleeve extraction · 0:58 ↗','https://www.youtube.com/watch?v=sHQVGH-CZbg&t=58s']],
        evidence: 'The filmed wrapper matches the regular physical magazine. The visible action is a right-side slide with the card front facing the camera. The first seal-opening step is off-camera, so the preview begins from the already-opened side. The digital insert set uses different packaging.',
      },
      '2023-cetitan': {
        kind: 'packet', title: 'Continue from the filmed opening.',
        intro: 'Cetitan is already partly out when the film resumes. Draw it farther to the right, with its front facing up.',
        hint: 'Already partly out · draw right · front up', issue: 'CoroCoro Ichiban · June 2023', label: 'Cetitan · 058/SV-P',
        note: 'This is Cetitan’s own two-sided printed pouch. The Japanese 058/SV-P front is a private reference; its app scan remains pending.',
        start: 'After the film edit: the card is partly out, front facing up.',
        sources: [['Watch the post-edit extraction · 1:12 ↗','https://www.youtube.com/watch?v=bHNdXPlKO2U&t=72s'],['Inspect both June pouch faces ↗','https://jp.mercari.com/item/m88749424307'],['Inspect the exact Japanese printing ↗','https://www.pokemon-card.com/card-search/details.php/card/43690']],
        evidence: 'The pouch is drawn from the magazine at 1:05–1:09, but its fastening is obscured. An edit at about 1:12 skips the seal opening and switches pouch faces. The resumed shot shows the illustrated characters face and an already protruding card sliding right, front up. The printed perforation guide does not prove how the collector opened the seal. This preview begins after that edit; pouch perspective and the original photo remain intact.',
      },
    };
    activeCase = scenes[id];
    if (!activeCase) throw Error('Unknown opening case');
    for (const [node, key] of [['title','title'],['intro','intro'],['hint','hint'],['issue-label','issue'],['card-label','label'],['reference-note','note']]) get(node).textContent = activeCase[key];
    get('cover').hidden = id !== '1996-sheet';
    get('sources').replaceChildren(...activeCase.sources.map(([label,url]) => sourceLink(label,url)));
    get('evidence').replaceChildren(element('p', '', activeCase.evidence), element('p', '', 'This preview does not change your collection. The original 2001 Mew reveal remains the benchmark.'));
    get('phase').textContent = 'Loading the local reference images…';
    try {
      if (activeCase.kind === 'sheet') renderSheet(id); else if (id === '2023-cetitan') renderCetitan(); else renderPacket();
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
