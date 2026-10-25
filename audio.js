/* --------------------------------------------------------------------------
 * Sound and speech for the kids' games. Everything is synthesized, so there
 * are no asset files and no licensing questions. Written to be copied into
 * the other games as-is.
 *
 *   Sound.unlock()        call from the first tap; iOS stays silent until then
 *   Sound.tone({...})     one oscillator note with an envelope
 *   Sound.pop(size)       bubble "bloop", size 0 (small, high) .. 1 (big, low)
 *   Sound.boop()          soft wrong-answer bump; never a buzzer
 *   Sound.cheer()         a little rising arpeggio
 *   Sound.say(text)       speechSynthesis, cancels whatever it was saying
 *
 * If a game "has no sound" on an iPhone, check the silent switch first: it
 * mutes Web Audio (but not speech).
 * ----------------------------------------------------------------------- */

const Sound = (() => {
  let ctx = null;
  let master = null;
  let soundOn = true;
  let voiceOn = true;

  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      // a limiter, so ten fingers popping at once doesn't clip
      const limiter = ctx.createDynamicsCompressor();
      master = ctx.createGain();
      master.gain.value = 0.7;
      master.connect(limiter);
      limiter.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
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
      u.lang = 'en-US';
      u.rate = 0.9;
      u.pitch = 1.15;
      speechSynthesis.speak(u);
    } catch (e) { /* no voice on this device; the pictures still carry it */ }
  }

  function hush() {
    try { speechSynthesis.cancel(); } catch (e) {}
  }

  return {
    unlock, tone, note, pop, boop, cheer, say, hush,
    setSound(on) { soundOn = on; },
    setVoice(on) { voiceOn = on; if (!on) hush(); },
  };
})();
