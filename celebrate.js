/* --------------------------------------------------------------------------
 * celebrate() -- confetti, a cheer and a kind word. Shared by the kids' games;
 * it brings its own styles, so copying this one file is all it takes.
 * Needs audio.js loaded first.
 *
 *   celebrate()                         a small one
 *   celebrate({ big: true })            more confetti and a bouncing star
 *   celebrate({ words: 'C A T, cat!' }) say this instead of a stock phrase
 *
 * To speak some other way (recorded clips, say), replace celebrate.say, and
 * celebrate.phrases with whatever it takes in place of text.
 * ----------------------------------------------------------------------- */

const celebrate = (() => {
  const COLORS = ['#ff4d4d', '#ffd23f', '#3cc85a', '#3a86ff', '#9b5de5', '#ff70a6', '#ff9f1c'];
  const STOCK_PHRASES = ['Great job!', 'Hooray!', 'You did it!', 'Wow!', 'Yay!', 'Super!', 'Amazing!'];
  const STARS = ['⭐', '🌟', '🎉', '🥳', '🦄', '🌈'];

  const style = document.createElement('style');
  style.textContent = `
    .cel-layer { position: fixed; inset: 0; pointer-events: none; overflow: hidden; z-index: 50; }
    .cel-bit {
      position: absolute; top: -20px; width: 12px; height: 18px; border-radius: 3px;
      animation: cel-fall var(--dur) cubic-bezier(.3,.6,.6,1) var(--delay) forwards;
    }
    @keyframes cel-fall {
      to { transform: translate(var(--dx), 110vh) rotate(var(--spin)); }
    }
    .cel-star {
      position: absolute; left: 50%; top: 45%; font-size: min(38vmin, 260px); line-height: 1;
      transform: translate(-50%, -50%) scale(0);
      animation: cel-bounce 1.6s ease-out forwards;
    }
    @keyframes cel-bounce {
      0%   { transform: translate(-50%, -50%) scale(0) rotate(-30deg); }
      30%  { transform: translate(-50%, -50%) scale(1.15) rotate(8deg); }
      45%  { transform: translate(-50%, -50%) scale(.95) rotate(-4deg); }
      60%  { transform: translate(-50%, -50%) scale(1.05) rotate(0); opacity: 1; }
      100% { transform: translate(-50%, -60%) scale(1); opacity: 0; }
    }`;
  document.head.appendChild(style);

  const pick = list => list[Math.floor(Math.random() * list.length)];

  function celebrate({ big = false, words } = {}) {
    Sound.cheer();
    celebrate.say(words || pick(celebrate.phrases));

    const layer = document.createElement('div');
    layer.className = 'cel-layer';
    const count = big ? 90 : 40;
    for (let i = 0; i < count; i++) {
      const bit = document.createElement('div');
      bit.className = 'cel-bit';
      bit.style.left = `${Math.random() * 100}%`;
      bit.style.background = pick(COLORS);
      bit.style.setProperty('--dx', `${(Math.random() - 0.5) * 200}px`);
      bit.style.setProperty('--spin', `${(Math.random() - 0.5) * 1440}deg`);
      bit.style.setProperty('--dur', `${1.6 + Math.random() * 1.4}s`);
      bit.style.setProperty('--delay', `${Math.random() * 0.4}s`);
      layer.appendChild(bit);
    }
    if (big) {
      const star = document.createElement('div');
      star.className = 'cel-star';
      star.textContent = pick(STARS);
      layer.appendChild(star);
    }
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 3500);
  }

  celebrate.phrases = STOCK_PHRASES;
  celebrate.say = text => Sound.say(text);
  return celebrate;
})();
