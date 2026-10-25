/* --------------------------------------------------------------------------
 * The recording page. Walks through every phrase in phrases.js, records a
 * take of each, cleans it up, and commits the lot to GitHub in one go.
 *
 *   record   MediaRecorder, in whatever format this browser makes
 *   clean    decode, mix to mono at 44.1 kHz, trim the silence off both ends,
 *            level the volume, fade the edges (see cleanTake)
 *   encode   mp3 with lamejs, so every browser can play every clip
 *   keep     in IndexedDB as a draft, so a session can stop and pick up later
 *   send     one commit through the GitHub API: the clips plus an updated
 *            voice/index.json (see sendToGitHub)
 * ----------------------------------------------------------------------- */

'use strict';

const $ = id => document.getElementById(id);

const RATE = 44100;
const KBPS = 64;          // mono speech: ~8 KB a second, and sounds fine
const MAX_TAKE_MS = 12000;
const DEFAULT_REPO = 'smartybryan/pop-the-bubbles';
const SETUP_KEY = 'popBubbles.recorder';

const state = {
  current: 0,               // index into PHRASES
  drafts: new Map(),        // id -> { id, blob, duration }
  published: {},            // id -> version, from voice/index.json
  recording: null,          // { recorder, chunks, timer } while recording
  stream: null,             // the microphone, kept open between takes
  playing: null,
  blobShas: new Map(),      // id -> sha of a blob already uploaded, for a retry
};

let audio = null;
const ctx = () => audio || (audio = Sound.unlock());


/* ------------------------------------------------------------------ drafts */

const db = (() => {
  let opened = null;
  const open = () => opened || (opened = new Promise((ok, fail) => {
    const req = indexedDB.open('popBubbles.recorder', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('drafts', { keyPath: 'id' });
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fail(req.error);
  }));
  const run = async (mode, fn) => {
    const d = await open();
    return new Promise((ok, fail) => {
      const tx = d.transaction('drafts', mode);
      const req = fn(tx.objectStore('drafts'));
      tx.oncomplete = () => ok(req && req.result);
      tx.onerror = () => fail(tx.error);
    });
  };
  return {
    all: () => run('readonly', s => s.getAll()),
    put: draft => run('readwrite', s => s.put(draft)),
    remove: id => run('readwrite', s => s.delete(id)),
  };
})();


/* -------------------------------------------------------------- recording */

async function microphone() {
  if (state.stream && state.stream.active) return state.stream;
  state.stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: false, noiseSuppression: true, autoGainControl: false },
  });
  // a level meter, so it's plain whether the mic is hearing anything
  const source = ctx().createMediaStreamSource(state.stream);
  const analyser = ctx().createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const data = new Float32Array(analyser.fftSize);
  const tick = () => {
    if (state.recording) {
      analyser.getFloatTimeDomainData(data);
      const peak = data.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
      $('meter-bar').style.width = `${Math.min(100, peak * 140)}%`;
    } else {
      $('meter-bar').style.width = '0';
    }
    requestAnimationFrame(tick);
  };
  tick();
  return state.stream;
}

async function startRecording() {
  stopPlaying();
  let stream;
  try {
    stream = await microphone();
  } catch (e) {
    setStudioState('The microphone is blocked. Allow it for this page and try again.', 'bad');
    return;
  }
  const recorder = new MediaRecorder(stream);
  const chunks = [];
  recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  recorder.onstop = () => finishTake(new Blob(chunks, { type: recorder.mimeType }));
  recorder.start();
  state.recording = { recorder, timer: setTimeout(stopRecording, MAX_TAKE_MS) };
  $('btn-record').classList.add('recording');
  $('record-label').textContent = 'Stop';
  setStudioState('Recording…');
}

function stopRecording() {
  const rec = state.recording;
  if (!rec) return;
  clearTimeout(rec.timer);
  state.recording = null;
  rec.recorder.stop();
  $('btn-record').classList.remove('recording');
  $('record-label').textContent = 'Record';
  setStudioState('Cleaning up…');
}

async function finishTake(raw) {
  const phrase = PHRASES[state.current];
  try {
    const samples = await cleanTake(raw);
    if (!samples) {
      setStudioState("That one came out silent. Check the mic and try again.", 'bad');
      return;
    }
    const draft = { id: phrase.id, blob: encodeMp3(samples), duration: samples.length / RATE };
    state.drafts.set(draft.id, draft);
    state.blobShas.delete(draft.id);
    await db.put(draft);
    render();
    playDraft();
  } catch (e) {
    setStudioState(`Couldn't use that take: ${e.message}`, 'bad');
  }
}


/* --------------------------------------------------------------- clean-up */

const decode = data => new Promise((ok, fail) => ctx().decodeAudioData(data, ok, fail));

// Returns the cleaned-up take as mono samples at RATE, or null if it's silent.
async function cleanTake(blob) {
  const decoded = await decode(await blob.arrayBuffer());

  // mix down to mono at 44.1 kHz, whatever the mic gave us
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const offline = new Offline(1, Math.ceil(decoded.duration * RATE), RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const mono = (await offline.startRendering()).getChannelData(0);

  // loudness in 10 ms frames
  const FRAME = Math.round(RATE * 0.01);
  const frames = [];
  for (let i = 0; i < mono.length; i += FRAME) {
    let sum = 0;
    const end = Math.min(mono.length, i + FRAME);
    for (let j = i; j < end; j++) sum += mono[j] * mono[j];
    frames.push(Math.sqrt(sum / (end - i)));
  }
  const loudest = Math.max(...frames);
  if (loudest < 0.003) return null;

  // Trim: speech is wherever a frame gets above a fraction of the loudest.
  // Keep a little before (soft starts like "h") and more after (trailing "s").
  const threshold = Math.max(loudest * 0.06, 0.002);
  const first = frames.findIndex(f => f > threshold);
  let last = frames.length - 1;
  while (last > first && frames[last] <= threshold) last--;
  const start = Math.max(0, (first - 5) * FRAME);
  const end = Math.min(mono.length, (last + 12) * FRAME);
  const out = mono.slice(start, end);

  // Level: bring the speech (not the gaps) to the same loudness every time,
  // without letting the peaks clip.
  const voiced = frames.slice(first, last + 1).filter(f => f > threshold);
  const speechRms = Math.sqrt(voiced.reduce((s, f) => s + f * f, 0) / voiced.length);
  const peak = out.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  const gain = Math.min(0.12 / speechRms, 0.95 / peak);

  // fade the edges so a cut never clicks
  const fade = Math.round(RATE * 0.015);
  for (let i = 0; i < out.length; i++) {
    const edge = Math.min(1, i / fade, (out.length - 1 - i) / fade);
    out[i] *= gain * edge;
  }
  return out;
}

function encodeMp3(samples) {
  const encoder = new lamejs.Mp3Encoder(1, RATE, KBPS);
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    pcm[i] = Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767)));
  }
  const parts = [];
  for (let i = 0; i < pcm.length; i += 1152) {
    const chunk = encoder.encodeBuffer(pcm.subarray(i, i + 1152));
    if (chunk.length) parts.push(chunk);
  }
  const tail = encoder.flush();
  if (tail.length) parts.push(tail);
  return new Blob(parts, { type: 'audio/mpeg' });
}


/* ---------------------------------------------------------------- playback */

function stopPlaying() {
  if (state.playing) {
    try { state.playing.stop(); } catch (e) {}
    state.playing = null;
  }
}

async function playBlob(blob) {
  stopPlaying();
  const buffer = await decode(await blob.arrayBuffer());
  const src = ctx().createBufferSource();
  src.buffer = buffer;
  src.connect(ctx().destination);
  src.start();
  state.playing = src;
}

async function playDraft() {
  const phrase = PHRASES[state.current];
  const draft = state.drafts.get(phrase.id);
  if (draft) {
    await playBlob(draft.blob);
    setStudioState(`New take, ${draft.duration.toFixed(1)} s, waiting to send.`);
    return;
  }
  const version = state.published[phrase.id];
  if (version) {
    try {
      const res = await fetch(`voice/${phrase.id}.mp3?v=${version}`);
      if (!res.ok) throw new Error(res.status);
      await playBlob(await res.blob());
      setStudioState('This is the one on GitHub.');
    } catch (e) {
      // just sent: GitHub Pages takes a minute or two to publish it
      setStudioState("It's on GitHub, but the site hasn't published it yet. Try again in a minute.");
    }
  }
}


/* ----------------------------------------------------------------- GitHub */

function loadSetup() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(SETUP_KEY)) || {}; } catch (e) {}
  // on GitHub Pages the address says which repo this is: owner.github.io/repo/
  const m = location.hostname.match(/^([^.]+)\.github\.io$/);
  const fromSite = m && location.pathname.split('/')[1] ? `${m[1]}/${location.pathname.split('/')[1]}` : '';
  return { repo: saved.repo || fromSite || DEFAULT_REPO, branch: saved.branch || 'main', token: saved.token || '' };
}

let setup = loadSetup();

function saveSetup() {
  try { localStorage.setItem(SETUP_KEY, JSON.stringify(setup)); } catch (e) {}
}

async function gh(path, { method = 'GET', body } = {}) {
  const res = await fetch(`https://api.github.com/repos/${setup.repo}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${setup.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const info = await res.json().catch(() => ({}));
    const err = new Error(info.message || res.statusText);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function explain(e) {
  if (e.status === 401) return 'GitHub turned the token down. It may have expired; make a new one.';
  if (e.status === 403) return "The token can't write to this repo. It needs Contents: Read and write.";
  if (e.status === 404) return "GitHub can't find that repo (or the token can't see it). Check the name.";
  return `GitHub said: ${e.message}`;
}

const base64 = blob => new Promise((ok, fail) => {
  const reader = new FileReader();
  reader.onload = () => ok(reader.result.split(',')[1]);
  reader.onerror = () => fail(reader.error);
  reader.readAsDataURL(blob);
});

// The index as it is in the repo right now -- the published site can lag
// behind a commit by a minute or two.
async function repoIndex() {
  try {
    const file = await gh(`/contents/voice/index.json?ref=${encodeURIComponent(setup.branch)}`);
    return JSON.parse(atob(file.content.replace(/\s/g, '')));
  } catch (e) {
    if (e.status === 404) return {};
    throw e;
  }
}

/* One commit for everything, through the Git Data API: upload each clip as a
 * blob, make a tree of them on top of the branch's tree, commit it, and move
 * the branch to the new commit. One commit means one Pages rebuild.
 *
 * Each clip's version in voice/index.json is the start of its blob sha, which
 * is a hash of its contents: a new take gets a new version, so the game
 * fetches it fresh instead of out of a cache. */
async function sendToGitHub() {
  const drafts = [...state.drafts.values()];
  if (!drafts.length || !setup.token) return;
  setSending(true, `Sending ${drafts.length}…`);

  try {
    for (let attempt = 1; ; attempt++) {
      const ref = await gh(`/git/ref/heads/${encodeURIComponent(setup.branch)}`);
      const head = ref.object.sha;
      const commit = await gh(`/git/commits/${head}`);
      const index = await repoIndex();

      const tree = [];
      let done = 0;
      for (const draft of drafts) {
        let sha = state.blobShas.get(draft.id);
        if (!sha) {
          sha = (await gh('/git/blobs', {
            method: 'POST', body: { content: await base64(draft.blob), encoding: 'base64' },
          })).sha;
          state.blobShas.set(draft.id, sha);
        }
        tree.push({ path: `voice/${draft.id}.mp3`, mode: '100644', type: 'blob', sha });
        index[draft.id] = sha.slice(0, 10);
        setSending(true, `Uploading ${++done} of ${drafts.length}…`);
      }
      const sorted = Object.fromEntries(Object.entries(index).sort(([a], [b]) => a.localeCompare(b)));
      tree.push({ path: 'voice/index.json', mode: '100644', type: 'blob', content: `${JSON.stringify(sorted, null, 1)}\n` });

      const newTree = await gh('/git/trees', { method: 'POST', body: { base_tree: commit.tree.sha, tree } });
      const message = drafts.length === 1
        ? `Record voice clip: ${drafts[0].id}`
        : `Record ${drafts.length} voice clips\n\n${drafts.map(d => d.id).join('\n')}`;
      const newCommit = await gh('/git/commits', {
        method: 'POST', body: { message, tree: newTree.sha, parents: [head] },
      });
      try {
        await gh(`/git/refs/heads/${encodeURIComponent(setup.branch)}`, {
          method: 'PATCH', body: { sha: newCommit.sha },
        });
      } catch (e) {
        // someone pushed in the meantime: build on top of theirs instead
        if (e.status === 422 && attempt < 3) continue;
        throw e;
      }

      state.published = sorted;
      for (const draft of drafts) {
        state.drafts.delete(draft.id);
        state.blobShas.delete(draft.id);
        await db.remove(draft.id);
      }
      render();
      setSending(false, `Sent ${drafts.length}. The game picks them up once GitHub Pages republishes, in a minute or two.`, 'good');
      return;
    }
  } catch (e) {
    setSending(false, explain(e), 'bad');
  }
}

function setSending(busy, text, kind = '') {
  $('send').disabled = busy || !state.drafts.size || !setup.token;
  $('send').textContent = busy ? 'Sending…' : 'Send to GitHub';
  showMessage('send-message', text, kind);
}

async function checkSetup() {
  setup = {
    repo: $('gh-repo').value.trim() || DEFAULT_REPO,
    branch: $('gh-branch').value.trim() || 'main',
    token: $('gh-token').value.trim(),
  };
  saveSetup();
  renderSetup();
  if (!setup.token) {
    showMessage('gh-message', 'Saved. Add a token to be able to send.');
    return;
  }
  showMessage('gh-message', 'Checking…');
  try {
    const repo = await gh('');
    if (!repo.permissions || !repo.permissions.push) throw Object.assign(new Error('no push'), { status: 403 });
  } catch (e) {
    showMessage('gh-message', explain(e), 'bad');
    return;
  }
  try {
    await gh(`/git/ref/heads/${encodeURIComponent(setup.branch)}`);
    state.published = await repoIndex();
  } catch (e) {
    showMessage('gh-message', e.status === 404 ? `Can't find a branch called ${setup.branch}.` : explain(e), 'bad');
    return;
  }
  render();
  showMessage('gh-message', `All set: this page can send to ${setup.repo} (${setup.branch}).`, 'good');
}

function forgetToken() {
  setup.token = '';
  saveSetup();
  $('gh-token').value = '';
  renderSetup();
  showMessage('gh-message', 'Token removed from this browser.');
}


/* ---------------------------------------------------------------- render */

function showMessage(id, text, kind = '') {
  const el = $(id);
  el.textContent = text || '';
  el.className = `rec-message ${kind}`;
}

function setStudioState(text, kind = '') {
  $('studio-state').textContent = text;
  $('studio-state').className = `studio-state ${kind === 'bad' ? 'rec-message bad' : ''}`;
}

function renderSetup() {
  $('gh-repo').value = setup.repo;
  $('gh-branch').value = setup.branch;
  $('gh-token').value = setup.token;
  $('setup-status').textContent = setup.token
    ? `GitHub: sending to ${setup.repo} (${setup.branch})`
    : 'GitHub: not set up yet -- tap here';
}

function render() {
  const phrase = PHRASES[state.current];
  const group = PHRASE_GROUPS.find(g => g.id === phrase.group);
  $('studio-group').textContent = `${group.title} · ${state.current + 1} of ${PHRASES.length}`;
  $('studio-text').textContent = phrase.show || phrase.text;
  $('studio-tip').textContent = group.tip;
  $('btn-prev').disabled = state.current === 0;
  $('btn-next').disabled = state.current === PHRASES.length - 1;

  const hasDraft = state.drafts.has(phrase.id);
  const hasPublished = !!state.published[phrase.id];
  $('btn-play').disabled = !hasDraft && !hasPublished;
  $('btn-discard').disabled = !hasDraft;
  if (!state.recording) {
    setStudioState(hasDraft ? 'New take, waiting to send.' : hasPublished ? 'On GitHub. Record again to replace it.' : 'Not recorded yet.');
  }

  const done = PHRASES.filter(p => state.drafts.has(p.id) || state.published[p.id]).length;
  $('summary-text').innerHTML =
    `<b>${done}</b> of ${PHRASES.length} recorded` +
    (state.drafts.size ? ` · <b>${state.drafts.size}</b> waiting to send` : '');
  $('send').disabled = !state.drafts.size || !setup.token;
  if (state.drafts.size && !setup.token) {
    showMessage('send-message', 'Set up GitHub (top of the page) to send these.');
  }

  for (const el of document.querySelectorAll('.check-item')) {
    const id = el.dataset.id;
    el.classList.toggle('current', id === phrase.id);
    el.classList.toggle('draft', state.drafts.has(id));
    el.classList.toggle('published', !!state.published[id]);
  }
}

function buildChecklist() {
  const list = $('checklist');
  for (const group of PHRASE_GROUPS) {
    const section = document.createElement('div');
    section.className = 'check-group';
    section.innerHTML = `<h2>${group.title}</h2><p>${group.tip}</p>`;
    const items = document.createElement('div');
    items.className = 'check-items';
    PHRASES.forEach((phrase, i) => {
      if (phrase.group !== group.id) return;
      const btn = document.createElement('button');
      btn.className = 'check-item';
      btn.dataset.id = phrase.id;
      btn.textContent = phrase.show || phrase.text;
      btn.addEventListener('click', () => select(i));
      items.appendChild(btn);
    });
    section.appendChild(items);
    list.appendChild(section);
  }
}

function select(i) {
  if (state.recording) return;
  stopPlaying();
  state.current = Math.max(0, Math.min(PHRASES.length - 1, i));
  render();
}

function nextMissing() {
  for (let step = 1; step <= PHRASES.length; step++) {
    const i = (state.current + step) % PHRASES.length;
    const id = PHRASES[i].id;
    if (!state.drafts.has(id) && !state.published[id]) { select(i); return; }
  }
  setStudioState('Everything is recorded!');
}

async function discard() {
  const id = PHRASES[state.current].id;
  stopPlaying();
  state.drafts.delete(id);
  state.blobShas.delete(id);
  await db.remove(id);
  render();
}


/* ---------------------------------------------------------------- wire up */

$('btn-record').addEventListener('click', () => (state.recording ? stopRecording() : startRecording()));
$('btn-play').addEventListener('click', playDraft);
$('btn-prev').addEventListener('click', () => select(state.current - 1));
$('btn-next').addEventListener('click', () => select(state.current + 1));
$('btn-next-missing').addEventListener('click', nextMissing);
$('btn-discard').addEventListener('click', discard);
$('send').addEventListener('click', sendToGitHub);
$('gh-save').addEventListener('click', checkSetup);
$('gh-forget').addEventListener('click', forgetToken);

document.addEventListener('keydown', e => {
  if (e.target.closest('input, textarea, select, summary')) return;
  if (e.key === ' ') {
    e.preventDefault();
    if (state.recording) stopRecording(); else startRecording();
  } else if (e.key === 'ArrowRight') select(state.current + 1);
  else if (e.key === 'ArrowLeft') select(state.current - 1);
  else if (e.key === 'p' || e.key === 'P') playDraft();
});

async function start() {
  buildChecklist();
  renderSetup();
  if (!window.MediaRecorder || !navigator.mediaDevices) {
    setStudioState('This browser can’t record. Try Safari or Chrome, opened from the published site.', 'bad');
    $('btn-record').disabled = true;
  }
  try {
    for (const draft of await db.all()) state.drafts.set(draft.id, draft);
  } catch (e) { /* private mode: takes just won't survive a reload */ }
  try {
    state.published = setup.token
      ? await repoIndex()
      : await (await fetch('voice/index.json', { cache: 'no-cache' })).json();
  } catch (e) { /* nothing published yet, or opened off disk */ }
  render();
  if (state.drafts.size || Object.keys(state.published).length) nextMissingFromStart();
}

// Pick up where the last session stopped: the first phrase not yet recorded.
function nextMissingFromStart() {
  const i = PHRASES.findIndex(p => !state.drafts.has(p.id) && !state.published[p.id]);
  if (i >= 0) select(i);
}

start();
