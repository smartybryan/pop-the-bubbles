/* --------------------------------------------------------------------------
 * Pop the bubbles. Bubbles drift up; a tap pops them. Some modes ask for only
 * certain bubbles ("Pop the red ones!"). A wrong bubble just wobbles and drifts
 * on -- there is no losing, no timer and no score that goes down.
 * ----------------------------------------------------------------------- */

'use strict';

const $ = id => document.getElementById(id);
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const randInt = (lo, hi) => Math.floor(rand(lo, hi + 1));
const pick = list => list[Math.floor(Math.random() * list.length)];
const pickOther = (list, not) => pick(list.filter(x => x !== not));


/* ------------------------------------------------------------------ levels */

// Speeds and sizes are in px at a ~700px screen; app.js scales them to fit.
const LEVELS = {
  hatchling: {
    icon: '🐣', speed: [40, 60], spawnMs: 1150, max: 8, radius: [64, 82], targetChance: 0.5,
    colors: 4, shapes: 3, count: [1, 3], word: [3, 3], mixedCase: false,
  },
  chick: {
    icon: '🐥', speed: [60, 90], spawnMs: 850, max: 12, radius: [54, 72], targetChance: 0.4,
    colors: 6, shapes: 5, count: [2, 5], word: [3, 4], mixedCase: false,
  },
  hen: {
    icon: '🐔', speed: [85, 125], spawnMs: 650, max: 16, radius: [46, 62], targetChance: 0.34,
    colors: 7, shapes: 7, count: [3, 8], word: [4, 5], mixedCase: true,
  },
};


/* -------------------------------------------------------------------- art */

// The first four are the toddler set: the colors with the most distinct names.
const COLORS = [
  { name: 'red', hex: '#ff4d4d' },
  { name: 'yellow', hex: '#ffd23f' },
  { name: 'blue', hex: '#3a86ff' },
  { name: 'green', hex: '#3cc85a' },
  { name: 'orange', hex: '#ff9f1c' },
  { name: 'purple', hex: '#9b5de5' },
  { name: 'pink', hex: '#ff70a6' },
];

function starPoints(cx, cy, outer, inner) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer;
    const a = -Math.PI / 2 + i * Math.PI / 5;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

// Shapes in a 100×100 box. The first three are the toddler set.
const SHAPES = [
  { id: 'circle', plural: 'circles', svg: '<circle cx="50" cy="50" r="38"/>' },
  { id: 'star', plural: 'stars', svg: `<polygon points="${starPoints(50, 54, 46, 19)}"/>` },
  { id: 'heart', plural: 'hearts',
    svg: '<path d="M50 88C20 66 6 48 13 30 20 13 42 12 50 29 58 12 80 13 87 30 94 48 80 66 50 88Z"/>' },
  { id: 'square', plural: 'squares', svg: '<rect x="16" y="16" width="68" height="68" rx="6"/>' },
  { id: 'triangle', plural: 'triangles', svg: '<path d="M50 10 92 86H8Z"/>' },
  { id: 'diamond', plural: 'diamonds', svg: '<path d="M50 6 88 50 50 94 12 50Z"/>' },
  { id: 'moon', plural: 'moons', svg: '<path d="M64 8A43 43 0 1 0 92 70 34 34 0 1 1 64 8Z"/>' },
];
const shapeById = id => SHAPES.find(s => s.id === id);

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// Words to spell, with a picture so a pre-reader knows what the word is.
const WORDS = [
  ['CAT', '🐱'], ['DOG', '🐶'], ['SUN', '☀️'], ['BUS', '🚌'], ['PIG', '🐷'], ['BEE', '🐝'],
  ['COW', '🐮'], ['HAT', '🎩'], ['CAR', '🚗'], ['FOX', '🦊'], ['OWL', '🦉'], ['ANT', '🐜'],
  ['EGG', '🥚'], ['BED', '🛏️'],
  ['FISH', '🐟'], ['FROG', '🐸'], ['DUCK', '🦆'], ['BEAR', '🐻'], ['CAKE', '🎂'], ['STAR', '⭐'],
  ['MOON', '🌙'], ['BOAT', '⛵'], ['TREE', '🌳'], ['BIRD', '🐦'], ['BALL', '⚽'], ['LION', '🦁'],
  ['APPLE', '🍎'], ['HORSE', '🐴'], ['TRAIN', '🚆'], ['MOUSE', '🐭'], ['ZEBRA', '🦓'],
  ['TIGER', '🐯'], ['CLOUD', '☁️'], ['SNAKE', '🐍'], ['HOUSE', '🏠'], ['TRUCK', '🚚'],
].map(([word, pic]) => ({ word, pic }));

function shapeSVG(id) {
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><g class="shape">${shapeById(id).svg}</g></svg>`;
}

// What goes inside a bubble: a shape, a letter, or nothing.
function bubbleContent(data) {
  if (data.shape) return shapeSVG(data.shape);
  if (data.label) return data.label;
  return '';
}

// A small static bubble, for the menu tiles and the prompt.
function mini(data) {
  return `<span class="mini${data.solid ? ' solid' : ''}" style="--c:${data.color}">${bubbleContent(data)}</span>`;
}


/* -------------------------------------------------------------- settings */

const SETTINGS_KEY = 'popBubbles.settings';
const settings = { level: 'hatchling', sound: true, voice: true, name: '' };

function loadSettings() {
  try {
    Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {});
  } catch (e) { /* private mode, or nothing saved yet */ }
  if (!LEVELS[settings.level]) settings.level = 'hatchling';
  applySettings();
}

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {}
}

function applySettings() {
  Sound.setSound(settings.sound);
  Sound.setVoice(settings.voice);
  celebrate.childName = settings.name.trim();
}


/* ------------------------------------------------------------------ modes
 *
 * Each mode decides what the next bubble looks like (spawn), which bubbles
 * count (wants), and what happens when one does (popped). round() starts a
 * new prompt. Between rounds, while the celebration plays, every bubble pops.
 * ----------------------------------------------------------------------- */

const ROUND_GOAL = 6;   // right pops per round in the "pop the X" modes

// "Pop the red ones!", "Pop the stars!", "Pop the letter B!" all work alike:
// pick a target, make some bubbles that match it, count right pops.
function targetMode({ choices, prompt, show, make }) {
  return {
    round() {
      const list = choices();
      game.target = game.target && list.length > 1 ? pickOther(list, game.target) : pick(list);
      game.got = 0;
      showPrompt(show(game.target), pips(ROUND_GOAL, 0));
      game.promptText = prompt(game.target);
      Sound.say(game.promptText);
    },
    spawn(wantTarget) {
      return make(wantTarget ? game.target : pickOther(choices(), game.target));
    },
    wants: data => data.key === keyOf(game.target),
    popped() {
      game.got++;
      setProgress(pips(ROUND_GOAL, game.got));
      if (game.got >= ROUND_GOAL) finishRound();
    },
  };
}

const keyOf = target => target.name || target.id || target;

const MODES = {
  free: {
    tile: () => mini({ color: COLORS[2].hex }) + mini({ color: COLORS[6].hex }) + mini({ color: COLORS[3].hex }),
    label: 'Pop them all',
    round() {
      hidePrompt();
      game.promptText = 'Pop the bubbles!';
      Sound.say(game.promptText);
    },
    spawn: () => ({ color: pick(COLORS).hex }),
    wants: () => true,
    popped() {
      game.got++;
      // a party every 15 pops; free play never pauses for it
      if (game.got % 15 === 0) celebrate({ big: true });
    },
  },

  colors: Object.assign(targetMode({
    choices: () => COLORS.slice(0, level().colors),
    prompt: c => `Pop the ${c.name} ones!`,
    show: c => mini({ color: c.hex, solid: true }),
    make: c => ({ color: c.hex, key: c.name, solid: true }),
  }), {
    tile: () => mini({ color: COLORS[0].hex, solid: true }) + mini({ color: COLORS[2].hex, solid: true }) +
                mini({ color: COLORS[1].hex, solid: true }),
    label: 'Colors',
  }),

  shapes: Object.assign(targetMode({
    choices: () => SHAPES.slice(0, level().shapes),
    prompt: s => `Pop the ${s.plural}!`,
    show: s => mini({ color: '#ffd23f', shape: s.id }),
    make: s => ({ color: pick(COLORS).hex, shape: s.id, key: s.id }),
  }), {
    tile: () => mini({ color: COLORS[1].hex, shape: 'star' }) + mini({ color: COLORS[0].hex, shape: 'heart' }) +
                mini({ color: COLORS[3].hex, shape: 'triangle' }),
    label: 'Shapes',
  }),

  letters: Object.assign(targetMode({
    choices: () => LETTERS,
    prompt: l => `Pop the letter ${l}!`,
    show: l => (level().mixedCase ? `${l} ${l.toLowerCase()}` : l),
    // big kids get both cases, and both count: B and b are the same letter
    make: l => ({
      color: pick(COLORS).hex,
      label: level().mixedCase && Math.random() < 0.5 ? l.toLowerCase() : l,
      key: l,
    }),
  }), {
    tile: () => mini({ color: COLORS[0].hex, label: 'A' }) + mini({ color: COLORS[2].hex, label: 'B' }) +
                mini({ color: COLORS[3].hex, label: 'C' }),
    label: 'Letters',
  }),

  numbers: {
    tile: () => mini({ color: COLORS[4].hex, label: '1' }) + mini({ color: COLORS[5].hex, label: '2' }) +
                mini({ color: COLORS[6].hex, label: '3' }),
    label: 'Counting',
    round() {
      const [lo, hi] = level().count;
      game.goal = game.goal ? pickOther(range(lo, hi), game.goal) : randInt(lo, hi);
      game.got = 0;
      showPrompt(`${game.goal}`, pips(game.goal, 0), 'count');
      game.promptText = game.goal === 1 ? 'Pop 1 bubble!' : `Pop ${game.goal} bubbles!`;
      Sound.say(game.promptText);
    },
    spawn: () => ({ color: pick(COLORS).hex }),
    wants: () => true,
    popped() {
      game.got++;
      setProgress(pips(game.goal, game.got));
      Sound.say(String(game.got));
      if (game.got >= game.goal) finishRound(`You popped ${game.goal}!`, 700);
    },
  },

  spell: {
    tile: () => '<span class="mini" style="--c:#ff9f1c">🐱</span>' +
                mini({ color: COLORS[2].hex, label: 'C' }) + mini({ color: COLORS[3].hex, label: 'A' }),
    label: 'Spelling',
    round() {
      const [lo, hi] = level().word;
      const list = WORDS.filter(w => w.word.length >= lo && w.word.length <= hi);
      game.target = game.target ? pickOther(list, game.target) : pick(list);
      game.got = 0;
      showPrompt(game.target.pic, slots());
      const word = game.target.word;
      game.promptText = `Let's spell ${word.toLowerCase()}! ${word.split('').join(', ')}.`;
      Sound.say(game.promptText);
    },
    spawn(wantTarget) {
      const need = game.target.word[game.got];
      return { color: pick(COLORS).hex, label: wantTarget ? need : pickOther(LETTERS, need) };
    },
    wants: data => data.label === game.target.word[game.got],
    popped() {
      game.got++;
      setProgress(slots());
      const word = game.target.word;
      if (game.got < word.length) {
        Sound.say(word[game.got - 1]);
      } else {
        finishRound(`${word.split('').join(', ')}. ${word.toLowerCase()}!`, 300);
      }
    },
  },
};

const MODE_ORDER = ['free', 'colors', 'shapes', 'letters', 'numbers', 'spell'];

function range(lo, hi) {
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}


/* ----------------------------------------------------------------- prompt */

function pips(total, filled) {
  return Array.from({ length: total }, (_, i) => `<span class="pip${i < filled ? ' on' : ''}"></span>`).join('');
}

function slots() {
  const word = game.target.word;
  return word.split('').map((ch, i) => {
    const cls = i < game.got ? ' on' : i === game.got ? ' next' : '';
    return `<span class="slot${cls}">${ch}</span>`;
  }).join('');
}

function showPrompt(target, progress, kind = '') {
  $('prompt-target').innerHTML = target;
  $('prompt-progress').className = `prompt-progress ${kind}`;
  setProgress(progress);
  $('prompt').classList.remove('hidden');
}

function setProgress(html) {
  $('prompt-progress').innerHTML = html;
}

function hidePrompt() {
  $('prompt').classList.add('hidden');
}


/* ------------------------------------------------------------------ game */

const game = {
  mode: null,
  running: false,
  session: 0,        // bumped on every start/stop so stale timers know to quit
  bubbles: [],
  busy: false,       // celebrating between rounds: everything pops, nothing counts
  target: null,
  goal: 0,
  got: 0,
  rounds: 0,
  promptText: '',
  wrongStreak: 0,
  t: 0,
  last: 0,
  nextSpawn: 0,
  w: 0,
  h: 0,
  scale: 1,
};

const area = $('area');
const level = () => LEVELS[settings.level];
const mode = () => MODES[game.mode];

function measure() {
  const r = area.getBoundingClientRect();
  game.w = r.width;
  game.h = r.height;
  game.scale = Math.min(1.25, Math.max(0.75, Math.min(r.width, r.height) / 700));
}

function startGame(modeId) {
  Sound.unlock();
  game.mode = modeId;
  game.session++;
  game.target = null;
  game.goal = 0;
  game.got = 0;
  game.rounds = 0;
  game.busy = false;
  game.wrongStreak = 0;
  $('menu-screen').classList.add('hidden');
  $('play-screen').classList.remove('hidden');
  measure();
  clearBubbles();

  // start with a few bubbles already on their way up, so the screen isn't empty
  mode().round();
  for (let i = 0; i < Math.min(4, level().max); i++) {
    spawn(rand(game.h * 0.35, game.h * 0.95));
  }

  game.running = true;
  game.last = performance.now();
  game.nextSpawn = game.last + level().spawnMs;
  requestAnimationFrame(frame);
}

function stopGame() {
  game.running = false;
  game.session++;
  Sound.hush();
  clearBubbles();
  $('play-screen').classList.add('hidden');
  $('menu-screen').classList.remove('hidden');
}

function finishRound(words, delay = 0) {
  game.busy = true;
  const session = game.session;
  game.rounds++;
  setTimeout(() => {
    if (session !== game.session) return;
    celebrate({ big: game.rounds % 3 === 0, words });
  }, delay);
  setTimeout(() => {
    if (session !== game.session) return;
    game.busy = false;
    game.wrongStreak = 0;
    mode().round();
  }, delay + 2300);
}


/* --------------------------------------------------------------- bubbles */

function spawn(y) {
  const lv = level();
  const live = game.bubbles.filter(b => !b.popping);
  // make sure there is always something right to pop
  const hasTarget = live.some(b => mode().wants(b.data));
  const data = mode().spawn(!hasTarget || Math.random() < lv.targetChance);

  const r = rand(...lv.radius) * game.scale;
  const amp = rand(8, 22) * game.scale;
  const margin = r + amp;
  if (game.w < margin * 2) return;

  // try a few spots, keeping clear of bubbles still near the bottom
  let baseX = rand(margin, game.w - margin);
  for (let i = 0; i < 6; i++) {
    const crowded = live.some(b => Math.abs(b.baseX - baseX) < (b.r + r) && Math.abs(b.y - (y ?? game.h)) < (b.r + r) * 1.6);
    if (!crowded) break;
    baseX = rand(margin, game.w - margin);
  }

  const el = document.createElement('div');
  el.className = 'bubble';
  el.style.width = el.style.height = `${2 * r}px`;
  const face = document.createElement('div');
  face.className = 'bubble-face' + (data.solid ? ' solid' : '');
  face.style.setProperty('--c', data.color);
  face.style.fontSize = `${r * 1.1}px`;
  face.innerHTML = bubbleContent(data);
  el.appendChild(face);
  area.appendChild(el);

  const b = {
    el, face, data, r, amp, baseX,
    x: baseX,
    y: y ?? game.h + r,
    vy: rand(...lv.speed) * game.scale,
    freq: rand(0.8, 1.6),
    phase: rand(0, Math.PI * 2),
    popping: false,
  };
  game.bubbles.push(b);
  place(b);
}

function place(b) {
  b.el.style.transform = `translate3d(${b.x - b.r}px, ${b.y - b.r}px, 0)`;
}

function removeBubble(b) {
  b.el.remove();
  const i = game.bubbles.indexOf(b);
  if (i >= 0) game.bubbles.splice(i, 1);
}

function clearBubbles() {
  for (const b of game.bubbles) b.el.remove();
  game.bubbles = [];
  area.querySelectorAll('.drop').forEach(d => d.remove());
}

function frame(now) {
  if (!game.running) return;
  const dt = Math.min(0.05, (now - game.last) / 1000);   // a backgrounded tab resumes gently
  game.last = now;
  game.t += dt;

  const lv = level();
  if (now >= game.nextSpawn) {
    if (game.bubbles.filter(b => !b.popping).length < lv.max) spawn();
    game.nextSpawn = now + lv.spawnMs * rand(0.7, 1.3);
  }

  for (const b of [...game.bubbles]) {
    if (b.popping) continue;
    b.y -= b.vy * dt;
    b.x = b.baseX + Math.sin(game.t * b.freq + b.phase) * b.amp;
    // bubbles that reach the top just float away
    if (b.y < -b.r) removeBubble(b);
    else place(b);
  }
  requestAnimationFrame(frame);
}


/* ------------------------------------------------------------ tapping */

// Hit areas are bigger than the drawn bubble: little fingers miss.
const HIT_SCALE = 1.3;

function bubbleAt(x, y, scale) {
  let best = null;
  let bestScore = Infinity;
  for (const b of game.bubbles) {
    if (b.popping) continue;
    const d = Math.hypot(b.x - x, b.y - y) / b.r;
    if (d > scale) continue;
    // when a right and a wrong bubble overlap the tap, give them the right one
    const score = d - (game.busy || mode().wants(b.data) ? 10 : 0);
    if (score < bestScore) { best = b; bestScore = score; }
  }
  return best;
}

function tap(b) {
  if (game.busy) { pop(b); return; }
  if (mode().wants(b.data)) {
    game.wrongStreak = 0;
    pop(b);
    mode().popped(b);
  } else {
    wobble(b);
  }
}

function pop(b) {
  b.popping = true;
  const lv = level();
  const size = (b.r / game.scale - lv.radius[0]) / (lv.radius[1] - lv.radius[0]);
  Sound.pop(Math.max(0, Math.min(1, size)));
  b.face.classList.add('popping');
  splash(b);
  setTimeout(() => removeBubble(b), 240);
}

function splash(b) {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + rand(-0.3, 0.3);
    const dist = b.r * rand(0.7, 1.2);
    const drop = document.createElement('div');
    drop.className = 'drop';
    drop.style.background = b.data.color;
    drop.style.setProperty('--x', `${b.x + Math.cos(a) * b.r * 0.8}px`);
    drop.style.setProperty('--y', `${b.y + Math.sin(a) * b.r * 0.8}px`);
    drop.style.setProperty('--dx', `${Math.cos(a) * dist}px`);
    drop.style.setProperty('--dy', `${Math.sin(a) * dist}px`);
    drop.addEventListener('animationend', () => drop.remove());
    area.appendChild(drop);
  }
}

function wobble(b) {
  if (b.face.classList.contains('wobble')) return;
  b.face.classList.add('wobble');
  b.face.addEventListener('animationend', () => b.face.classList.remove('wobble'), { once: true });
  b.baseX = Math.max(b.r, Math.min(game.w - b.r, b.baseX + (Math.random() < 0.5 ? -1 : 1) * b.r * 0.3));
  Sound.boop();
  // a few misses in a row: say what we're looking for again
  if (++game.wrongStreak >= 3) {
    game.wrongStreak = 0;
    Sound.say(game.promptText);
  }
}

function localPoint(e) {
  const r = area.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

// Every finger counts on its own: little kids slap with the whole hand.
const pressed = new Set();

area.addEventListener('pointerdown', e => {
  e.preventDefault();
  Sound.unlock();
  pressed.add(e.pointerId);
  const p = localPoint(e);
  const b = bubbleAt(p.x, p.y, HIT_SCALE);
  if (b) tap(b);
});

// Dragging a finger through bubbles pops them too -- but only the right ones,
// so sweeping across the screen doesn't set off a chorus of wobbles.
area.addEventListener('pointermove', e => {
  if (!pressed.has(e.pointerId)) return;
  const p = localPoint(e);
  const b = bubbleAt(p.x, p.y, 1);
  if (b && (game.busy || mode().wants(b.data))) tap(b);
});

for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
  area.addEventListener(type, e => pressed.delete(e.pointerId));
}

area.addEventListener('contextmenu', e => e.preventDefault());


/* --------------------------------------------------------------- menu */

function buildMenu() {
  const levels = $('levels');
  levels.innerHTML = '';
  for (const [id, lv] of Object.entries(LEVELS)) {
    const btn = document.createElement('button');
    btn.className = 'level-btn';
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-label', id);
    btn.setAttribute('aria-checked', String(settings.level === id));
    btn.textContent = lv.icon;
    btn.addEventListener('click', () => {
      settings.level = id;
      saveSettings();
      for (const b of levels.children) b.setAttribute('aria-checked', String(b === btn));
      Sound.unlock();
      Sound.pop(0.5);
    });
    levels.appendChild(btn);
  }

  const modes = $('modes');
  modes.innerHTML = '';
  for (const id of MODE_ORDER) {
    const btn = document.createElement('button');
    btn.className = 'mode-tile';
    btn.setAttribute('aria-label', MODES[id].label);
    btn.innerHTML = MODES[id].tile();
    btn.addEventListener('click', () => startGame(id));
    modes.appendChild(btn);
  }
}


/* ------------------------------------------------------- grown-up gate */

// Press and hold for two seconds. A small child pokes, a grown-up holds.
function holdToOpen(btn, ms, open) {
  let timer = null;
  const cancel = () => {
    clearTimeout(timer);
    timer = null;
    btn.classList.remove('holding');
  };
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    btn.classList.add('holding');
    timer = setTimeout(() => { cancel(); open(); }, ms);
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) btn.addEventListener(type, cancel);
  btn.addEventListener('contextmenu', e => e.preventDefault());
}

function openSettings() {
  $('set-sound').checked = settings.sound;
  $('set-voice').checked = settings.voice;
  $('set-name').value = settings.name;
  $('settings').classList.remove('hidden');
}

function closeSettings() {
  settings.sound = $('set-sound').checked;
  settings.voice = $('set-voice').checked;
  settings.name = $('set-name').value.trim();
  saveSettings();
  applySettings();
  $('settings').classList.add('hidden');
}


/* -------------------------------------------------------------- refresh
 *
 * Same trick as Color Me. From a home screen there is no reload, and
 * location.reload() is answered out of the cache holding the old copy. So go
 * to an address nothing has fetched before; on the way back up, refetch the
 * plain address with cache: 'reload' so the next launch starts new too.
 * ----------------------------------------------------------------------- */

const FRESH_KEY = 'fresh';

function refreshApp() {
  const here = location.href.split('#')[0].split('?')[0];
  location.replace(`${here}?${FRESH_KEY}=${Date.now()}`);
}

function settleAfterRefresh() {
  if (!new URLSearchParams(location.search).has(FRESH_KEY)) return;
  try {
    fetch(location.pathname, { cache: 'reload' }).catch(() => {});
    history.replaceState(null, '', location.pathname);
  } catch (e) {
    /* opened straight off disk -- this visit is already the fresh one */
  }
}


/* -------------------------------------------------------------- wire up */

$('btn-home').addEventListener('click', stopGame);
$('prompt').addEventListener('click', () => Sound.say(game.promptText));
$('btn-refresh').addEventListener('click', refreshApp);
$('settings-done').addEventListener('click', closeSettings);
holdToOpen($('btn-gear'), 2000, openSettings);

window.addEventListener('resize', () => {
  if (!game.running) return;
  measure();
  for (const b of game.bubbles) b.baseX = Math.max(b.r, Math.min(game.w - b.r, b.baseX));
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && game.running) stopGame();
});

settleAfterRefresh();
loadSettings();
buildMenu();
