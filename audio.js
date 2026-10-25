/* --------------------------------------------------------------------------
 * Sound and speech for the kids' games. Everything is synthesized, so there
 * are no asset files and no licensing questions. Written to be copied into
 * the other games as-is.
 *
 *   Sound.unlock()        call from the first tap; iOS stays silent until then
 *   Sound.context()       the AudioContext, made if need be but not started
 *                         (enough for decoding clips before the first tap)
 *   Sound.output()        where recorded clips play: straight out, no limiter
 *   Sound.tone({...})     one oscillator note with an envelope
 *   Sound.pop(size)       bubble "bloop", size 0 (small, high) .. 1 (big, low)
 *   Sound.boop()          soft wrong-answer bump; never a buzzer
 *   Sound.cheer()         a little rising arpeggio
 *   Sound.say(text)       speechSynthesis, cancels whatever it was saying
 *   Sound.voices()        the English voices this device has
 *   Sound.setSpeech({ voiceName, rate, pitch })
 *   Sound.onVoices(fn)    the voice list loads late on some browsers
 *
 * The iPhone silent switch mutes Web Audio. Where Safari lets a page say it
 * plays media (navigator.audioSession, Safari 16.4+), this asks for that, so
 * the switch leaves the game alone the way it does a video. On an older
 * iPhone, if a game "has no sound", check the switch first.
 * ----------------------------------------------------------------------- */

const Sound = (() => {
  let ctx = null;
  let master = null;
  let soundOn = true;
  let voiceOn = true;
  let voiceName = '';   // '' is the device's default voice
  let rate = 0.9;
  let pitch = 1.15;
  let voiceOut = null;

  function context() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
      ctx = new AC();
      // a limiter, so ten fingers popping at once doesn't clip
      const limiter = ctx.createDynamicsCompressor();
      master = ctx.createGain();
      master.gain.value = 0.7;
      master.connect(limiter);
      limiter.connect(ctx.destination);
      // recorded voice is already leveled; a limiter would only squash it
      voiceOut = ctx.createGain();
      voiceOut.connect(ctx.destination);
    }
    return ctx;
  }

  function unlock() {
    const c = context();
    if (c && c.state === 'suspended') c.resume();
    return c;
  }

  function tone({ freq, to, type = 'sine', dur = 0.2, vol = 0.4, delay = 0, attack = 0.005 }) {
    if (!soundOn) return;
    const c = unlock();
    if (!c) return;
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const env = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(env);
    env.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  // C major pentatonic: any run of these sounds pleasant together
  const PENTATONIC = [261.63, 293.66, 329.63, 392.0, 440.0];
  function note(step) {
    const octave = Math.floor(step / 5);
    return PENTATONIC[((step % 5) + 5) % 5] * 2 ** octave;
  }

  function pop(size = 0.5) {
    // bigger bubbles sit lower on the scale, so a screenful plays a tune
    const f = note(12 - Math.round(size * 7));
    tone({ freq: f * 1.8, to: f * 0.6, dur: 0.14, vol: 0.45 });
    tone({ freq: f * 4, to: f * 2, dur: 0.05, vol: 0.08, type: 'triangle' });
  }

  function boop() {
    tone({ freq: 240, to: 190, type: 'triangle', dur: 0.16, vol: 0.18 });
  }

  function cheer() {
    [5, 7, 9, 10, 12].forEach((step, i) =>
      tone({ freq: note(step), type: 'triangle', dur: 0.3, vol: 0.3, delay: i * 0.09 }));
  }

  function say(text) {
    if (!voiceOn || !('speechSynthesis' in window) || !text) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const voice = voiceName && speechSynthesis.getVoices().find(v => v.name === voiceName);
      if (voice) u.voice = voice;
      u.lang = voice ? voice.lang : 'en-US';
      u.rate = rate;
      u.pitch = pitch;
      speechSynthesis.speak(u);
    } catch (e) { /* no voice on this device; the pictures still carry it */ }
  }

  // The English voices the device offers (the prompts are English text), or
  // every voice if it has no English ones.
  function voices() {
    if (!('speechSynthesis' in window)) return [];
    const all = speechSynthesis.getVoices();
    const english = all.filter(v => /^en([-_]|$)/i.test(v.lang));
    return (english.length ? english : all).sort((a, b) => a.name.localeCompare(b.name));
  }

  function onVoices(fn) {
    if ('speechSynthesis' in window) speechSynthesis.addEventListener?.('voiceschanged', fn);
  }

  function hush() {
    try { speechSynthesis.cancel(); } catch (e) {}
  }

  return {
    unlock, context, tone, note, pop, boop, cheer, say, hush, voices, onVoices,
    output: () => voiceOut,
    setSound(on) { soundOn = on; },
    setVoice(on) { voiceOn = on; if (!on) hush(); },
    setSpeech(opts) {
      if (opts.voiceName !== undefined) voiceName = opts.voiceName;
      if (opts.rate !== undefined) rate = opts.rate;
      if (opts.pitch !== undefined) pitch = opts.pitch;
    },
  };
})();
