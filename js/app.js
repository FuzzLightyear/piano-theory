// Application state and control wiring. The keyboard rebuilds on structural
// changes (range, pattern, root, labels, view); presses and releases go
// through per-key class toggles and the synth.

import { MIDI_MIN, MIDI_MAX, PC_NAMES, parseNote, noteName, pitchClass } from './theory.js';
import { parsePatterns } from './patterns.js';
import { Keyboard } from './keyboard.js';
import { Synth } from './audio.js';
import { CircleOfFifths, pcOf, positionOf, SIGNATURES } from './circle.js';

const MIN_KEYS = 12;
const MAX_KEYS = 88;
const MAX_START = MIDI_MAX - MIN_KEYS + 1; // latest start that still fits a minimum board
const STEP_MS = 300;

const $ = id => document.getElementById(id);

const state = {
  startMidi: parseNote('C2'),
  keyCount: 61,
  rootPc: 0,
  patternId: 'major',
  labelMode: 'pattern',
  view: 'angled',
  circle: true,
  sound: true,
  sustain: 1,
  reverb: 'room',
  playing: false, // false | 'scale' | 'fifths'
};

let patterns = null;
const keyboard = new Keyboard($('rig'), $('board'));
const synth = new Synth();
const circle = new CircleOfFifths($('circle-svg'), {
  onSelect: pc => {
    state.rootPc = pc;
    rebuild();
  },
});
const pressed = new Set();  // keys shown as down
const sounding = new Set(); // keys that already triggered audio while held
let pointerActive = false;
let timers = [];

// Musical typing: home row plays naturals, the row above plays sharps,
// mirroring the layout piano apps have converged on. Physical key codes so
// the mapping survives non-QWERTY layouts.
const TYPING_OFFSETS = new Map(Object.entries({
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6,
  KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13,
  KeyL: 14, KeyP: 15, Semicolon: 16, Quote: 17,
}));
let typingBase = 60; // C4
const heldCodes = new Map(); // physical key -> sounded midi, so octave shifts never strand a release

const clampKeys = (n, startMidi) =>
  Math.max(MIN_KEYS, Math.min(MAX_KEYS, MIDI_MAX - startMidi + 1, Math.round(n)));

const currentPattern = () => (patterns && patterns.byId[state.patternId]) || null;
const currentSemitones = () => currentPattern()?.semitones ?? [];

// ---- key press / release ----

function press(midi) {
  if (!sounding.has(midi)) {
    sounding.add(midi);
    if (state.sound) synth.note(midi, state.sustain);
  }
  if (!pressed.has(midi)) {
    pressed.add(midi);
    keyboard.setPressed(midi, true);
  }
}

function release(midi) {
  sounding.delete(midi);
  if (pressed.delete(midi)) keyboard.setPressed(midi, false);
}

function releaseAll() {
  timers.forEach(clearTimeout);
  timers = [];
  sounding.clear();
  for (const midi of pressed) keyboard.setPressed(midi, false);
  pressed.clear();
}

// ---- scale/chord playback ----

function sequence() {
  const semis = currentSemitones();
  if (!semis.length) return [];
  const end = state.startMidi + state.keyCount - 1;
  let root = null;
  for (let m = state.startMidi; m <= end; m++) {
    if (pitchClass(m) === state.rootPc) { root = m; break; }
  }
  if (root === null) return [];
  const up = semis.filter(s => root + s <= end).map(s => root + s);
  // classic scales run up to the octave; patterns that already reach past it
  // (9ths and beyond) just arpeggiate their own degrees
  if (root + 12 <= end && Math.max(...semis) < 12) up.push(root + 12);
  const down = up.slice(0, -1).reverse();
  return up.concat(down);
}

function stopPlayback() {
  releaseAll();
  circle.setActive(null);
  state.playing = false;
  syncControls();
}

function togglePlay() {
  if (state.playing) return stopPlayback();
  const seq = sequence();
  if (!seq.length) return;
  state.playing = 'scale';
  syncControls();
  let i = 0;
  const step = () => {
    if (i > 0) release(seq[i - 1]);
    if (i >= seq.length) {
      state.playing = false;
      syncControls();
      return;
    }
    press(seq[i]);
    i++;
    timers.push(setTimeout(step, STEP_MS));
  };
  step();
}

// Walk the whole circle from the current root: twelve fifths land back home.
// Tonics sound within one octave band, so each step is the classic
// up-a-fifth / down-a-fourth motion.
function toggleFifths() {
  if (state.playing) return stopPlayback();
  const startPos = positionOf(state.rootPc);
  state.playing = 'fifths';
  syncControls();
  let step = 0;
  let prevMidi = null;
  const tick = () => {
    if (prevMidi !== null) release(prevMidi);
    if (step > 12) {
      circle.setActive(null);
      state.playing = false;
      syncControls();
      return;
    }
    const pos = (startPos + step) % 12;
    circle.setActive(pos);
    prevMidi = 48 + pcOf(pos);
    press(prevMidi);
    step++;
    timers.push(setTimeout(tick, 360));
  };
  tick();
}

// ---- rendering ----

function rebuild() {
  if (state.playing) stopPlayback(); else releaseAll();
  const semitones = currentSemitones();
  keyboard.render({
    startMidi: state.startMidi,
    keyCount: state.keyCount,
    rootPc: state.rootPc,
    semitones,
    labelMode: state.labelMode,
    view: state.view,
    maxWidth: state.circle ? 640 : undefined,
  });
  const pat = currentPattern();
  let sig = null;
  if (state.patternId === 'major') sig = SIGNATURES[positionOf(state.rootPc)];
  else if (state.patternId === 'minor') sig = SIGNATURES[positionOf((state.rootPc + 3) % 12)];
  circle.update({
    rootPc: state.rootPc,
    pcs: new Set(semitones.map(s => (state.rootPc + s) % 12)),
    lines: [PC_NAMES[state.rootPc], pat ? pat.name : '', sig ?? ''],
  });
  syncControls();
}

function syncCirclePanel() {
  $('circle-panel').hidden = !state.circle;
  document.querySelector('.app').classList.toggle('with-circle', state.circle);
}

function syncControls() {
  const endMidi = state.startMidi + state.keyCount - 1;
  $('start-note').value = noteName(state.startMidi);
  $('end-note').value = noteName(endMidi);
  $('key-count').value = state.keyCount;
  $('key-count-label').textContent = `${state.keyCount} keys`;
  $('root').value = String(state.rootPc);
  $('pattern').value = state.patternId;
  $('sustain-label').textContent = `${(5.2 * state.sustain).toFixed(1)}s`;
  $('sound').textContent = state.sound ? '🔊 On' : '🔇 Off';
  $('sound').classList.toggle('active', state.sound);
  $('sound').setAttribute('aria-pressed', state.sound);

  const mark = (b, active) => {
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', active);
  };
  for (const b of $('presets').children) {
    mark(b, parseNote(b.dataset.start) === state.startMidi && Number(b.dataset.count) === state.keyCount);
  }
  for (const b of $('label-modes').children) mark(b, b.dataset.mode === state.labelMode);
  for (const b of $('views').children) { if (b.dataset.view) mark(b, b.dataset.view === state.view); }
  for (const b of $('reverbs').children) mark(b, b.dataset.reverb === state.reverb);
  mark($('circle-toggle'), state.circle);

  const play = $('play');
  play.disabled = sequence().length === 0;
  play.textContent = state.playing === 'scale' ? '■ Stop' : '▶ Play';
  play.classList.toggle('on', state.playing === 'scale');
  $('play-fifths').textContent = state.playing === 'fifths' ? '■ Stop' : '▶ Fifths';
  $('play-fifths').classList.toggle('active', state.playing === 'fifths');

  const base = 'Click keys or type A–L to play · Z/X shifts octave · drag for glissando';
  const pat = currentPattern();
  $('status').textContent = pat ? `${base} · ${PC_NAMES[state.rootPc]} ${pat.name}` : base;
}

// ---- control setup ----

function fillSelects() {
  const start = $('start-note');
  const end = $('end-note');
  for (let m = MIDI_MIN; m <= MIDI_MAX; m++) {
    if (m <= MAX_START) start.add(new Option(noteName(m, true), noteName(m)));
    end.add(new Option(noteName(m, true), noteName(m)));
  }
  const root = $('root');
  PC_NAMES.forEach((name, pc) => root.add(new Option(name, String(pc))));

  const pattern = $('pattern');
  pattern.add(new Option('— none —', ''));
  for (const group of patterns?.groups ?? []) {
    const og = document.createElement('optgroup');
    og.label = group.name;
    for (const item of group.items) og.append(new Option(item.name, item.id));
    pattern.append(og);
  }
}

function bindEvents() {
  const board = $('board');
  board.addEventListener('pointerdown', e => {
    const key = e.target.closest('.key');
    if (!key) return;
    e.preventDefault();
    pointerActive = true;
    // touch implicitly captures the pointer; release it so the pointer can
    // roam across keys for glissando
    if (key.hasPointerCapture?.(e.pointerId)) key.releasePointerCapture(e.pointerId);
    press(Number(key.dataset.midi));
  });
  board.addEventListener('pointerover', e => {
    if (!pointerActive) return;
    const key = e.target.closest('.key');
    if (key) press(Number(key.dataset.midi));
  });
  board.addEventListener('pointerout', e => {
    if (!pointerActive) return;
    const key = e.target.closest('.key');
    if (!key) return;
    // moving between faces of the same key fires over/out too — only release
    // when the pointer actually left the key
    if (e.relatedTarget instanceof Element && e.relatedTarget.closest('.key') === key) return;
    release(Number(key.dataset.midi));
  });
  window.addEventListener('pointerup', e => {
    pointerActive = false;
    if (e.target instanceof Element) {
      const key = e.target.closest('.key');
      if (key) release(Number(key.dataset.midi));
    }
  });
  window.addEventListener('pointercancel', () => {
    pointerActive = false;
    if (!state.playing) releaseAll();
  });

  window.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const focus = document.activeElement;
    if (focus && /^(SELECT|INPUT|TEXTAREA)$/.test(focus.tagName)) return;
    if (e.key === 'Escape') {
      if (state.playing) stopPlayback();
      return;
    }
    if (e.repeat) return;
    if (e.code === 'KeyZ' || e.code === 'KeyX') {
      typingBase = Math.min(96, Math.max(24, typingBase + (e.code === 'KeyZ' ? -12 : 12)));
      return;
    }
    const offset = TYPING_OFFSETS.get(e.code);
    if (offset === undefined) return;
    e.preventDefault();
    const midi = typingBase + offset;
    if (midi > MIDI_MAX) return;
    heldCodes.set(e.code, midi);
    press(midi);
  });
  window.addEventListener('keyup', e => {
    const midi = heldCodes.get(e.code);
    if (midi !== undefined) {
      heldCodes.delete(e.code);
      release(midi);
    }
  });
  window.addEventListener('blur', () => {
    for (const midi of heldCodes.values()) release(midi);
    heldCodes.clear();
  });

  $('presets').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    state.startMidi = parseNote(b.dataset.start);
    state.keyCount = clampKeys(Number(b.dataset.count), state.startMidi);
    rebuild();
  });
  $('start-note').addEventListener('change', e => {
    state.startMidi = parseNote(e.target.value);
    state.keyCount = clampKeys(state.keyCount, state.startMidi);
    rebuild();
  });
  $('end-note').addEventListener('change', e => {
    const end = parseNote(e.target.value);
    if (end > state.startMidi) {
      state.keyCount = clampKeys(end - state.startMidi + 1, state.startMidi);
      rebuild();
    } else {
      syncControls(); // snap the select back to the real end
    }
  });
  $('key-count').addEventListener('input', e => {
    state.keyCount = clampKeys(Number(e.target.value), state.startMidi);
    rebuild();
  });
  $('root').addEventListener('change', e => {
    state.rootPc = Number(e.target.value);
    rebuild();
  });
  $('pattern').addEventListener('change', e => {
    state.patternId = e.target.value;
    rebuild();
  });
  $('label-modes').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    state.labelMode = b.dataset.mode;
    rebuild();
  });
  $('views').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !b.dataset.view) return;
    state.view = b.dataset.view;
    rebuild();
  });
  $('circle-toggle').addEventListener('click', () => {
    state.circle = !state.circle;
    syncCirclePanel();
    rebuild();
  });
  $('play-fifths').addEventListener('click', toggleFifths);
  $('play').addEventListener('click', togglePlay);
  $('sound').addEventListener('click', () => {
    state.sound = !state.sound;
    syncControls();
  });
  $('sustain').addEventListener('input', e => {
    state.sustain = Number(e.target.value);
    syncControls();
  });
  $('reverbs').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    state.reverb = b.dataset.reverb;
    synth.setReverb(state.reverb);
    syncControls();
  });
}

// ---- boot ----

async function init() {
  try {
    const res = await fetch('data/patterns.txt');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    patterns = parsePatterns(await res.text());
  } catch (err) {
    patterns = null;
    state.patternId = '';
    console.error('pattern definitions failed to load:', err);
  }
  fillSelects();
  bindEvents();
  syncCirclePanel();
  rebuild();
  if (!patterns) $('status').textContent = 'Pattern definitions failed to load — showing a plain keyboard.';
}

init();
