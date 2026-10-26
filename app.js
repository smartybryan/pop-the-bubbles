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

// COLORS, SHAPES, LETTERS and WORDS live in phrases.js, next to what is said
// about them.

const shapeById = id => SHAPES.find(s => s.id === id);

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
const settings = {
  level: 'hatchling', sound: true, voice: true,
  voiceName: '', rate: 0.9, pitch: 1.15,   // '' is the device's default voice
};

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
  Sound.setSpeech(settings);
  Voice.setOn(settings.voice);
}


/* ------------------------------------------------------------------ modes
 *
 * Each mode decides what the next bubble looks like (spawn), which bubbles
 * count (wants), and what happens when one does (popped). round() starts a
 * new prompt. Between rounds, while the celebration plays, every bubble pops.
 *
 * Everything said is a sentence of clip ids from phrases.js (see voice.js):
 * ['now-find', 'letter-b'], with ',' for a pause.
 * ----------------------------------------------------------------------- */

// Say a new prompt, and remember it for a tap on the prompt (or a few misses).
function ask(sentence) {
  game.prompt = sentence;
  Voice.say(sentence);
}

// "c, a, t" -- a word's letters with a pause between each
const spelled = word => word.split('').flatMap((l, i) => (i ? [',', letterClip(l)] : [letterClip(l)]));

const ROUND_GOAL = 6;   // right pops per round in the "pop the X" modes

// "Pop the red ones!", "Pop the stars!", "Pop the letter B!" all work alike:
// pick a target, make some bubbles that match it, count right pops.
function targetMode({ choices, say, show, make }) {
  return {
    round() {
      const list = choices();
      game.target = game.target && list.length > 1 ? pickOther(list, game.target) : pick(list);
      game.got = 0;
      showPrompt(show(game.target), pips(ROUND_GOAL, 0));
      ask(say(game.target));
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

// A to Z, 1 to 20: pop them in order. The prompt shows a little window of the
// run -- the last two popped, the one to find next, and the two after it.
// Decoys come from nearby in the run, so the choice is B or C, not B or X.
function sequenceMode({ items, clip, intro, outro }) {
  const need = () => items[game.got];
  const strip = () => {
    let html = '';
    for (let i = game.got - 2; i <= game.got + 2; i++) {
      if (i < 0 || i >= items.length) continue;
      const cls = i < game.got ? ' on' : i === game.got ? ' next' : '';
      html += `<span class="slot${cls}">${items[i]}</span>`;
    }
    return html;
  };
  return {
    round() {
      game.got = 0;
      showPrompt('', strip());
      ask(intro);
    },
    spawn(wantTarget) {
      const near = items.slice(Math.max(0, game.got - 3), game.got + 4);
      return { color: pick(COLORS).hex, label: wantTarget ? need() : pickOther(near, need()) };
    },
    wants: data => data.label === need(),
    popped() {
      const popped = need();
      game.got++;
      setProgress(strip());
      if (game.got >= items.length) {
        finishRound([clip(popped), ',', outro], 300);
        return;
      }
      // what a tap on the prompt (or a few misses) says from here on
      game.prompt = ['now-find', clip(need())];
      Voice.say(clip(popped));
      if (game.got % 5 === 0) Sound.cheer();   // a little lift on the way
    },
  };
}

const MODES = {
  free: {
    tile: () => mini({ color: COLORS[2].hex }) + mini({ color: COLORS[6].hex }) + mini({ color: COLORS[3].hex }),
    label: 'Pop them all',
    round() {
      hidePrompt();
      ask('pop-bubbles');
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
    say: c => `color-${c.name}`,
    show: c => mini({ color: c.hex, solid: true }),
    make: c => ({ color: c.hex, key: c.name, solid: true }),
  }), {
    tile: () => mini({ color: COLORS[0].hex, solid: true }) + mini({ color: COLORS[2].hex, solid: true }) +
                mini({ color: COLORS[1].hex, solid: true }),
    label: 'Colors',
  }),

  shapes: Object.assign(targetMode({
    choices: () => SHAPES.slice(0, level().shapes),
    say: s => `shape-${s.id}`,
    show: s => mini({ color: '#ffd23f', shape: s.id }),
    make: s => ({ color: pick(COLORS).hex, shape: s.id, key: s.id }),
  }), {
    tile: () => mini({ color: COLORS[1].hex, shape: 'star' }) + mini({ color: COLORS[0].hex, shape: 'heart' }) +
                mini({ color: COLORS[3].hex, shape: 'triangle' }),
    label: 'Shapes',
  }),

  letters: Object.assign(targetMode({
    choices: () => LETTERS,
    say: l => `find-letter-${l.toLowerCase()}`,
    show: l => (level().mixedCase ? `${l} ${l.toLowerCase()}` : l),
    // big kids get both cases, and both count: B and b are the same letter
    make: l => ({
      color: pick(COLORS).hex,
      label: level().mixedCase && Math.random() < 0.5 ? l.toLowerCase() : l,
      key: l,
    }),
  }), {
    tile: () => mini({ color: COLORS[0].hex, label: 'B' }) + mini({ color: COLORS[2].hex, label: 'B' }) +
                mini({ color: COLORS[3].hex, label: 'B' }),
    label: 'Letters',
  }),

  abc: Object.assign(sequenceMode({
    items: LETTERS,
    clip: letterClip,
    intro: 'abc-start',
    outro: 'abc-done',
  }), {
    tile: () => mini({ color: COLORS[0].hex, label: 'A' }) + mini({ color: COLORS[2].hex, label: 'B' }) +
                mini({ color: COLORS[3].hex, label: 'C' }),
    label: 'A to Z',
    stairs: true,
  }),

  count20: Object.assign(sequenceMode({
    items: range(1, SEQUENCE_MAX).map(String),
    clip: numberClip,
    intro: 'count20-start',
    outro: 'count20-done',
  }), {
    tile: () => mini({ color: COLORS[4].hex, label: '1' }) + mini({ color: COLORS[5].hex, label: '2' }) +
                mini({ color: COLORS[6].hex, label: '3' }),
    label: '1 to 20',
    stairs: true,
  }),

  numbers: {
    tile: () => mini({ color: COLORS[4].hex, label: '3' }) + mini({ color: COLORS[5].hex }) +
                mini({ color: COLORS[1].hex }),
    label: 'Counting',
    round() {
      const [lo, hi] = level().count;
      game.goal = game.goal ? pickOther(range(lo, hi), game.goal) : randInt(lo, hi);
      game.got = 0;
      showPrompt(`${game.goal}`, pips(game.goal, 0), 'count');
      ask(`count-${game.goal}`);
    },
    spawn: () => ({ color: pick(COLORS).hex }),
    wants: () => true,
    popped() {
      game.got++;
      setProgress(pips(game.goal, game.got));
      Voice.say(numberClip(game.got));
      if (game.got >= game.goal) finishRound(`popped-${game.goal}`, 700);
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
      ask(['spell-intro', wordClip(word), ',', ...spelled(word)]);
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
        Voice.say(letterClip(word[game.got - 1]));
      } else {
        finishRound([letterClip(word[word.length - 1]), ',', wordClip(word)], 300);
      }
    },
  },
};

const MODE_ORDER = ['free', 'colors', 'shapes', 'numbers', 'letters', 'abc', 'count20', 'spell'];


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
  prompt: null,      // the sentence a tap on the prompt says again
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
  Voice.stop();
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
    Voice.say(game.prompt);
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
    btn.className = 'mode-tile' + (MODES[id].stairs ? ' stairs' : '');
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
  $('set-rate').value = settings.rate;
  $('set-pitch').value = settings.pitch;
  fillVoices();
  showVoiceOptions();
  $('settings').classList.remove('hidden');
}

// Each device has its own voices, so the choice is saved per device. A saved
// voice this device doesn't have shows as the default, and is kept as-is.
function fillVoices() {
  const select = $('set-voice-name');
  const voices = Sound.voices();
  // the list can arrive while the dialog is open; keep a pick not yet saved
  const wanted = select.options.length && !$('settings').classList.contains('hidden')
    ? select.value : settings.voiceName;
  select.innerHTML = '';
  select.add(new Option('Device default', ''));
  for (const v of voices) {
    const region = v.lang.replace(/^[a-z]+[-_]?/i, '');
    select.add(new Option(region ? `${v.name} (${region})` : v.name, v.name));
  }
  select.value = voices.some(v => v.name === wanted) ? wanted : '';
  const none = voices.length === 0;
  $('voice-none').classList.toggle('hidden', !none);
  select.closest('.setting').classList.toggle('hidden', none);
}

function showVoiceOptions() {
  $('voice-options').classList.toggle('hidden', !$('set-voice').checked);
}

function readVoiceForm() {
  settings.voiceName = $('set-voice-name').value;
  settings.rate = Number($('set-rate').value);
  settings.pitch = Number($('set-pitch').value);
  Sound.setSpeech(settings);
}

const SAMPLES = ['Pop the red ones!', 'Great job!', 'Pop the letter B!', "Let's count to 20!", 'Hooray!'];
let sample = 0;

function trySpeech() {
  readVoiceForm();
  Sound.setVoice(true);
  Sound.say(SAMPLES[sample++ % SAMPLES.length]);
}

function closeSettings() {
  settings.sound = $('set-sound').checked;
  settings.voice = $('set-voice').checked;
  readVoiceForm();
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
$('prompt').addEventListener('click', () => Voice.say(game.prompt));
$('btn-refresh').addEventListener('click', refreshApp);
$('settings-done').addEventListener('click', closeSettings);
$('set-voice').addEventListener('change', showVoiceOptions);
$('voice-try').addEventListener('click', trySpeech);
// hear each change as soon as it's made (a slider when it's let go)
for (const id of ['set-voice-name', 'set-rate', 'set-pitch']) $(id).addEventListener('change', trySpeech);
Sound.onVoices(() => { if (!$('settings').classList.contains('hidden')) fillVoices(); });
holdToOpen($('btn-gear'), 2000, openSettings);

window.addEventListener('resize', () => {
  if (!game.running) return;
  measure();
  for (const b of game.bubbles) b.baseX = Math.max(b.r, Math.min(game.w - b.r, b.baseX));
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && game.running) stopGame();
});

// cheers come from the recorded clips too, when there are some
celebrate.say = Voice.say;
celebrate.phrases = CHEERS;

settleAfterRefresh();
loadSettings();
buildMenu();
Voice.load();
