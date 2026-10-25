# Pop!

Bubbles drift up from the bottom of the screen; tap them and they pop with a
"bloop" and a splash. For ages 2–6. There is no losing, no timer and no score
that goes down: a wrong bubble just wobbles and drifts on, and bubbles that
reach the top float away.

A static site with no build step: open `index.html` by double-clicking it, or
serve the folder from GitHub Pages. Add it to a tablet's home screen and it runs
full screen, without an address bar.

## Playing

Pick a size first, 🐣 / 🐥 / 🐔, and then a game. The size changes how fast the
bubbles rise, how many there are, how big they are, and how hard the prompts get.

| Tile | Game | Spoken prompt |
|---|---|---|
| three bubbles | Pop them all | "Pop the bubbles!" A party every 15 pops. |
| red, blue, yellow | Colors | "Pop the red ones!" 🐣 4 colors, 🐥 6, 🐔 7 |
| ★ ♥ ▲ | Shapes | "Pop the stars!" 🐣 3 shapes, 🐥 5, 🐔 7 |
| 3 and two bubbles | Counting | "Pop 3 bubbles!" It counts out loud as they pop. 🐣 1–3, 🐥 2–5, 🐔 3–8 |
| B B B | Letters | "Pop the letter B!" 🐔 mixes in lower case; B and b both count. |
| A B C, climbing | A to Z | "Pop the letters in order! Start with A." Says each one as it pops. |
| 1 2 3, climbing | 1 to 20 | "Let's count to 20! Start with 1." Says each number as it pops. |
| 🐱 C A | Spelling | "Let's spell cat! C, A, T." Pop the letters in order. 🐣 3 letters, 🐥 3–4, 🐔 4–5 |

In A to Z and 1 to 20, the prompt shows a short stretch of the run: the last
two popped, the next one to find (bouncing), and the two after it. The wrong
bubbles come from nearby in the run, so the choice is B or C, not B or X. There
is a little cheer every five, and a big one at Z or 20; then it starts over.

The prompt bubble at the top shows what to pop, for kids who can't read yet;
tap it to hear the prompt again. Three wrong taps in a row also repeat it.
"Pop the X" rounds are six right pops long; then there is confetti, and a new
target. Between rounds, while the celebration plays, every bubble pops.

Touch works with as many fingers as land on the screen, and dragging a finger
through the right bubbles pops them too. The hit circle is 1.3× the drawn
bubble, and when a right and a wrong bubble both sit under a finger, the right
one wins.

**⌂** goes back to the menu (Esc on a keyboard).

## Grown-ups

**Press and hold ⚙ for two seconds** (the ring fills up) to open the settings:
sounds on/off, spoken prompts on/off, and the device voice. The chosen size and
settings are kept in `localStorage`.

**The device voice** says anything that hasn't been recorded (see
**Recorded voice** below). The list holds the English voices this device has, and each
change plays a sample right away (▶ Try it plays another). Speed and pitch
sliders sit underneath. Every device has its own voices, so set it up on each
one. On an iPad, Settings → Accessibility → Spoken Content → Voices can
download "Enhanced" and "Premium" voices, which sound much more natural; they
show up in the list after that. On a Mac, the novelty voices (Bubbles, Good
News, Bells, …) are a hit with kids.

**No sound on an iPhone?** The game asks Safari to treat it as media playback
(`navigator.audioSession`, Safari 16.4 and later), so the silent switch leaves
it alone. On an older iPhone the switch mutes the pops and the recorded voice
(though not the device voice), so check it first.

## Recorded voice

Every line the game says can be a recording of a real person, in place of the
device voice. There are 152 clips in all, most a second or two long, and they
don't all have to be done at once: a sentence uses the recordings when every
clip in it is recorded, and the device voice says it otherwise. Mixing the two
mid-sentence would sound worse than either.

**Recording.** Open **`record.html`** on the published site (there's a *Record
clips* link in the grown-up settings). It walks through the checklist one
phrase at a time:

- **● Record**, say it, **■ Stop** (or press space). The take plays back
  straight away. Record again to replace it, or **Discard take**.
- **→ / Next not recorded** moves on. Each group of phrases has a tip at the
  top: whole prompts are said naturally; letters, numbers, words and the
  sentence starters ("Let's spell…", "Now find…") are said clearly and evenly,
  because the game joins them together.
- The checklist below shows ○ not yet, ● a take waiting to send, and ✓ on
  GitHub. Takes are kept on the device, so a session can stop and pick up later.

Each take is cleaned up on the spot: mixed to mono, the silence trimmed off
both ends, the speech leveled to the same loudness as every other clip, the
edges faded so nothing clicks, and saved as a 64 kbps mp3 (about 8 KB a
second). The whole set comes to around 1.5 MB.

**Sending.** **Send to GitHub** commits every waiting take to the repo in a
single commit (one Pages rebuild, not dozens), along with an updated
`voice/index.json`. The game picks them up once GitHub Pages republishes,
usually a minute or two later.

Sending needs a GitHub token, set up once per device under *GitHub* at the top
of the recording page. Make a **fine-grained personal access token** (GitHub →
Settings → Developer settings → Fine-grained tokens) with access to **only this
repo**, **Contents: Read and write** and nothing else, and an expiry date. The
token is kept in that browser only; anyone can open the recording page, but
without a token it can't change anything. If a device goes missing, revoke the
token on GitHub.

**Two things to know:**

- The repo is public, so the recordings are too.
- The recording page commits straight to `main`. **Run `git pull` before
  committing code changes**, or the push will be refused for being behind.

**How the game plays them** (`voice.js`): at start-up it reads
`voice/index.json` and decodes every clip listed there. A sentence is a list of
clip ids, such as `['spell-intro', 'word-cat', ',', 'letter-c', ...]`, with `,`
for a pause. The clips play back to back on the audio clock, 60 ms apart (350
ms at a comma), so the joins are even. Each clip's version in the index is the
start of its git blob hash, which changes whenever it's re-recorded, and the
clips are fetched as `voice/<id>.mp3?v=<version>`, so a new take gets past a
home-screen cache.

Opened straight off disk (double-clicked), the game can't read `voice/` and
uses the device voice for everything.

## Shipping a new version

This works the same way as Color Me. Asset URLs carry a version stamp
(`app.js?v=20261025-3`), so a changed file arrives under a name that no cache
has seen before. Bump every stamp, in both pages, whenever a `.js` or `.css`
file changes:

    sed -i '' 's|?v=[^"]*|?v=20261026|g' index.html record.html

Recordings don't need this; they carry their own versions (see **Recorded
voice**).

The **↻** button (top right of the menu) gets the newest version even from a
home-screen launch, where there's no reload: it navigates to `?fresh=<time>`,
then refetches the plain address with `cache: 'reload'` so the next launch is
fresh too.

## Files

    index.html       the menu, the play screen and the settings dialog
    styles.css       layout, the bubble look, pop/wobble/splash animations
    app.js           levels, modes, the bubble loop, tapping, menu, settings
    phrases.js       colors, shapes, letters, words, and every phrase said
    voice.js         recorded clips joined into sentences, device voice fallback
    audio.js         Sound: unlock, tone, pop, boop, cheer, say -- shared
    celebrate.js     celebrate(): confetti, cheer, kind words -- shared
    record.html      the recording page (+ record.js, record.css)
    voice/           the recordings, and index.json listing them
    vendor/          lame.min.js, the mp3 encoder for the recording page
    manifest.json    name, colors and icons for a home-screen launch
    icon.svg         full-bleed icon art; the PNGs are rendered from it
    favicon.svg      the same art in a rounded tile

`audio.js` and `celebrate.js` don't depend on anything in this game (except
that celebrate needs Sound), so they can be copied as-is into the next games.

The mp3 encoder is [lamejs](https://github.com/zhuker/lamejs), a JavaScript
port of [LAME](https://lame.sourceforge.io/), used unmodified as its own file
under the LGPL (`vendor/lame-LICENSE.txt`). Only the recording page loads it.

Rebuilding the icons after changing `icon.svg`:

    rsvg-convert -w 192 -h 192 icon.svg -o icon-192.png
    rsvg-convert -w 512 -h 512 icon.svg -o icon-512.png
    rsvg-convert -w 180 -h 180 icon.svg -o apple-touch-icon.png

## How it works

Bubbles are absolutely positioned DOM elements, moved by one
`requestAnimationFrame` loop. That's plenty fast up to about 30 on screen, and
the most there ever are is 16. Each bubble rises at a steady speed and sways on
a sine wave. The outer `.bubble` element carries the position transform; the
inner `.bubble-face` is free for the wobble and pop animations, so the two
never fight.

A mode is a small object: `round()` picks a new prompt, `spawn()` says what the
next bubble looks like, `wants()` says which bubbles count, and `popped()`
moves the round along. Spawning always makes a right bubble when none is on
screen, so there's never nothing to pop. Adding a mode means adding one entry
to `MODES` and to `MODE_ORDER`, plus its phrases in `phrases.js`; the
recording page's checklist picks them up from there.

The pop sound is a sine wave sweeping down in pitch. Its note is picked from a
pentatonic scale by bubble size, so a run of pops always sounds like a tune.

## Ideas for later

- Whack-a-mole variant: a 3×3 grid of holes, with the same modes.
- "Pop the one that says *dog*" with picture bubbles.
- A bubble wand you drag to blow new bubbles.
- An ocean theme with fish instead of bubbles.
