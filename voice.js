/* --------------------------------------------------------------------------
 * Recorded voice clips, joined into sentences, with the device's own voice
 * filling in for anything not recorded yet. Needs audio.js and phrases.js.
 *
 *   Voice.load()                  fetch voice/index.json and every clip in it
 *   Voice.say(['now-find', 'letter-b'])   or Voice.say('pop-bubbles')
 *   Voice.stop()                  cut off whatever is being said
 *
 * A sentence is a list of clip ids from PHRASES, with ',' for a pause. If
 * every clip in it is recorded, the recordings play back to back on the
 * audio clock, so the joins are exact. If any one is missing, the device
 * voice says the whole sentence instead: half a sentence in Grandpa's voice
 * and half in a robot's is worse than either.
 *
 * voice/index.json maps each recorded id to a version, and clips are fetched
 * as voice/<id>.mp3?v=<version>, so a re-recorded clip gets past a
 * home-screen cache the same way the scripts do. The recording page keeps
 * that file up to date.
 * ----------------------------------------------------------------------- */

const Voice = (() => {
  const DIR = 'voice/';
  const GAP = 0.06;     // s between joined clips; the clips carry no silence of their own
  const PAUSE = 0.35;   // s for a ','

  const buffers = new Map();   // id -> AudioBuffer
  let playing = [];
  let on = true;

  const decode = (ctx, data) => new Promise((ok, fail) => ctx.decodeAudioData(data, ok, fail));

  async function load() {
    let index;
    try {
      const res = await fetch(`${DIR}index.json`, { cache: 'no-cache' });
      if (!res.ok) return;
      index = await res.json();
    } catch (e) {
      return;   // opened straight off disk: the device voice does it all
    }
    const ctx = Sound.context();
    if (!ctx) return;
    await Promise.all(Object.entries(index).map(async ([id, version]) => {
      try {
        const res = await fetch(`${DIR}${id}.mp3?v=${version}`);
        if (res.ok) buffers.set(id, await decode(ctx, await res.arrayBuffer()));
      } catch (e) { /* a bad clip just falls back to the device voice */ }
    }));
  }

  // The sentence as text, for the device voice.
  function textOf(parts) {
    let out = '';
    parts.forEach((id, i) => {
      if (id === ',') { out += ','; return; }
      const phrase = PHRASE_BY_ID[id];
      let text = phrase ? phrase.text : id;
      if (phrase && phrase.letter && i === 0) text = text.toLowerCase();
      out += (out ? ' ' : '') + text;
    });
    return out;
  }

  function say(parts) {
    if (!on || !parts) return;
    if (!Array.isArray(parts)) parts = [parts];
    stop();
    if (!parts.every(id => id === ',' || buffers.has(id))) {
      Sound.say(textOf(parts));
      return;
    }
    const ctx = Sound.unlock();
    let t = ctx.currentTime + 0.03;
    for (const id of parts) {
      if (id === ',') { t += PAUSE; continue; }
      const src = ctx.createBufferSource();
      src.buffer = buffers.get(id);
      src.connect(Sound.output());
      src.start(t);
      playing.push(src);
      t += src.buffer.duration + GAP;
    }
  }

  function stop() {
    for (const src of playing) {
      try { src.stop(); } catch (e) {}
    }
    playing = [];
    Sound.hush();
  }

  return {
    load, say, stop, textOf,
    has: id => buffers.has(id),
    setOn(value) { on = value; if (!on) stop(); },
  };
})();
