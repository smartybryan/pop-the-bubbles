/* --------------------------------------------------------------------------
 * Everything the game shows and says, in one place: the colors, shapes,
 * letters and words, and PHRASES, the list of every clip the game can speak.
 *
 * Both the game and the recording page (record.html) load this file, so the
 * checklist of things to record can never drift from what the game asks for.
 * A clip's id is its file name: voice/<id>.mp3.
 * ----------------------------------------------------------------------- */

'use strict';

const range = (lo, hi) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);


/* ----------------------------------------------------------------- content */

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

// The most bubbles "Pop 3 bubbles!" ever asks for (the 🐔 level's top end).
const COUNT_MAX = 8;
// How far the in-order numbers game counts.
const SEQUENCE_MAX = 20;


/* ----------------------------------------------------------------- phrases
 *
 * Each phrase: { id, text, group, show?, letter? }
 *   text    what the device voice says when there is no recording
 *   show    what the recording page shows, when that differs from text
 *   letter  a letter name; the device voice says it in lower case when it
 *           comes first, or iOS says "capital A"
 *
 * The game joins clips into sentences: "Let's spell" + "cat" + "c" + "a" +
 * "t". The groups below tell whoever records which ones get joined.
 * ----------------------------------------------------------------------- */

const PHRASE_GROUPS = [
  { id: 'prompts', title: 'Prompts',
    tip: 'Whole sentences. Say them the way you would to the kids.' },
  { id: 'cheers', title: 'Cheers',
    tip: 'Big and happy!' },
  { id: 'joins', title: 'Sentence starters',
    tip: 'A word gets added after these, so say them like the sentence keeps going -- no drop at the end.' },
  { id: 'letters', title: 'Letter names',
    tip: 'Just the letter: "ay", "bee", "see". Clear and even; these are joined to other clips.' },
  { id: 'numbers', title: 'Numbers',
    tip: 'Just the number, clear and even. These are said as the kids count.' },
  { id: 'words', title: 'Spelling words',
    tip: 'Just the word, clear and even. It is said before and after it gets spelled.' },
];

const PHRASES = [];

function addPhrase(id, text, group, extra = {}) {
  PHRASES.push({ id, text, group, ...extra });
}

addPhrase('pop-bubbles', 'Pop the bubbles!', 'prompts');
for (const c of COLORS) addPhrase(`color-${c.name}`, `Pop the ${c.name} ones!`, 'prompts');
for (const s of SHAPES) addPhrase(`shape-${s.id}`, `Pop the ${s.plural}!`, 'prompts');
for (const l of LETTERS) addPhrase(`find-letter-${l.toLowerCase()}`, `Pop the letter ${l}!`, 'prompts');
for (const n of range(1, COUNT_MAX)) {
  addPhrase(`count-${n}`, n === 1 ? 'Pop 1 bubble!' : `Pop ${n} bubbles!`, 'prompts');
}
for (const n of range(1, COUNT_MAX)) addPhrase(`popped-${n}`, `You popped ${n}!`, 'prompts');
addPhrase('abc-start', 'Pop the letters in order! Start with A.', 'prompts');
addPhrase('abc-done', 'You know your A B Cs!', 'prompts');
addPhrase('count20-start', `Let's count to ${SEQUENCE_MAX}! Start with 1.`, 'prompts');
addPhrase('count20-done', `You counted to ${SEQUENCE_MAX}!`, 'prompts');

for (const t of ['Great job!', 'Hooray!', 'You did it!', 'Wow!', 'Yay!', 'Super!', 'Amazing!']) {
  addPhrase(`cheer-${t.toLowerCase().replace(/[^a-z]+/g, '-').replace(/-$/, '')}`, t, 'cheers');
}

addPhrase('spell-intro', "Let's spell", 'joins', { show: "Let's spell… (cat)" });
addPhrase('now-find', 'Now find', 'joins', { show: 'Now find… (B)' });

for (const l of LETTERS) addPhrase(`letter-${l.toLowerCase()}`, l, 'letters', { letter: true });
for (const n of range(1, SEQUENCE_MAX)) addPhrase(`number-${n}`, String(n), 'numbers');
for (const w of WORDS) {
  addPhrase(`word-${w.word.toLowerCase()}`, w.word.toLowerCase(), 'words', { show: `${w.word.toLowerCase()} ${w.pic}` });
}

const PHRASE_BY_ID = Object.fromEntries(PHRASES.map(p => [p.id, p]));
const CHEERS = PHRASES.filter(p => p.group === 'cheers').map(p => p.id);

const letterClip = l => `letter-${l.toLowerCase()}`;
const numberClip = n => `number-${n}`;
const wordClip = w => `word-${w.toLowerCase()}`;
