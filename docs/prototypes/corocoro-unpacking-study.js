(() => {
  const cards = [...document.querySelectorAll('.peel-card')];
  const phase = document.getElementById('phase');
  const play = document.getElementById('play');
  const skip = document.getElementById('skip');
  const reset = document.getElementById('reset');
  const reduce = document.getElementById('reduce');
  const systemMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let currentAnimation = null;
  let currentCard = null;
  let epoch = 0;

  reduce.checked = systemMotion.matches;
  const remaining = () => cards.filter(card => card.dataset.released !== 'true');
  function controls() {
    play.disabled = Boolean(currentAnimation) || remaining().length === 0;
    play.textContent = remaining().length === 0 ? 'Both cards released' : 'Try the peel';
    skip.disabled = remaining().length === 0;
    cards.forEach(card => { card.disabled = Boolean(currentAnimation) || card.dataset.released === 'true'; });
  }
  function cancel() {
    epoch += 1;
    currentAnimation?.cancel();
    currentAnimation = null;
    currentCard = null;
  }
  function release(card) {
    card.dataset.released = 'true';
    card.setAttribute('aria-label', `${card.dataset.card} study card released`);
  }
  function settleAll() {
    cancel();
    cards.forEach(release);
    phase.textContent = 'Both study cards lifted. The backing stays behind.';
    controls();
  }
  function startOver() {
    cancel();
    cards.forEach(card => {
      delete card.dataset.released;
      card.setAttribute('aria-label', `Lift the ${card.dataset.card} study card`);
    });
    phase.textContent = 'Choose a card to lift.';
    controls();
  }
  async function peel(card) {
    if (!card || currentAnimation || card.dataset.released === 'true') return;
    if (reduce.checked || systemMotion.matches) {
      release(card);
      phase.textContent = `${card.dataset.card} lifted. ${remaining().length ? 'Try the other card.' : 'The backing stays behind.'}`;
      controls();
      return;
    }
    const run = ++epoch;
    currentCard = card;
    phase.textContent = `Lifting ${card.dataset.card} from the backing…`;
    const offset = getComputedStyle(document.querySelector('.mat')).getPropertyValue('--release-x').trim();
    const animation = card.animate([
      { transform: 'translate(0, 0) rotate(0deg)', boxShadow: '0 1px 2px #5a493320' },
      { transform: 'translate(5px, -6px) rotateY(-12deg) rotate(2deg)', boxShadow: '4px 8px 10px #4a316020', offset: .28 },
      { transform: `translate(${offset}, -16px) rotate(7deg)`, boxShadow: '0 12px 15px #4a31602d' },
    ], { duration: 1100, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'forwards' });
    currentAnimation = animation;
    controls();
    try { await animation.finished; } catch { return; }
    if (run !== epoch) return;
    release(card);
    animation.cancel();
    currentAnimation = null;
    currentCard = null;
    phase.textContent = `${card.dataset.card} lifted. ${remaining().length ? 'Try the other card.' : 'The backing stays behind.'}`;
    controls();
  }
  cards.forEach(card => card.addEventListener('click', () => { void peel(card); }));
  play.addEventListener('click', () => { void peel(remaining()[0]); });
  skip.addEventListener('click', settleAll);
  reset.addEventListener('click', startOver);
  function motionChanged() {
    if (!currentCard || !(reduce.checked || systemMotion.matches)) return;
    const card = currentCard;
    cancel();
    release(card);
    phase.textContent = `${card.dataset.card} lifted with reduced motion.`;
    controls();
  }
  reduce.addEventListener('change', motionChanged);
  systemMotion.addEventListener('change', motionChanged);
  document.addEventListener('visibilitychange', () => { if (document.hidden && currentAnimation) startOver(); });
  window.addEventListener('pagehide', () => { if (currentAnimation) startOver(); });
  controls();
})();
