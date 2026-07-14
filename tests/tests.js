import { parseNote, noteName, pitchClass, isWhite, PC_NAMES } from '../js/theory.js';
import { parsePatterns } from '../js/patterns.js';
import { pcOf, positionOf, MAJOR_LABELS, MINOR_LABELS, SIGNATURES } from '../js/circle.js';

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

function eq(actual, expected, what = 'value') {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${what}: expected ${b}, got ${a}`);
}

function throws(fn, pattern) {
  let msg = null;
  try { fn(); } catch (e) { msg = e.message; }
  if (msg === null) throw new Error(`expected an error matching ${pattern}`);
  if (!pattern.test(msg)) throw new Error(`error "${msg}" does not match ${pattern}`);
}

// ---- theory ----

test('parseNote handles naturals, accidentals, and case', () => {
  eq(parseNote('C4'), 60);
  eq(parseNote('A0'), 21);
  eq(parseNote('C8'), 108);
  eq(parseNote('F#3'), 54);
  eq(parseNote('Bb2'), 46);
  eq(parseNote('c4'), 60);
  eq(parseNote(' G5 '), 79);
});

test('parseNote rejects garbage', () => {
  eq(parseNote('H2'), null);
  eq(parseNote('C'), null);
  eq(parseNote('4'), null);
  eq(parseNote(''), null);
  eq(parseNote('C#'), null);
});

test('noteName round-trips and prettifies', () => {
  eq(noteName(60), 'C4');
  eq(noteName(61), 'C#4');
  eq(noteName(61, true), 'C♯4');
  eq(noteName(21), 'A0');
  for (let m = 21; m <= 108; m++) eq(parseNote(noteName(m)), m, `round-trip ${m}`);
});

test('pitchClass and isWhite', () => {
  eq(pitchClass(60), 0);
  eq(pitchClass(59), 11);
  eq(isWhite(60), true);
  eq(isWhite(61), false);
  eq(isWhite(59), true);
  eq(PC_NAMES.length, 12);
});

// ---- pattern parsing ----

const MINI = `
# comment
[Scales]
major: Major scale = 1 2 3 4 5 6 7

[Chords]
dom7:  Dominant 7th = 1 3 5 b7
aug:   Augmented triad = 1 3 #5
maj9:  Major 9th = 1 3 5 7 9
`;

test('parses sections, ids, names, and degrees', () => {
  const p = parsePatterns(MINI);
  eq(p.groups.map(g => g.name), ['Scales', 'Chords']);
  eq(p.byId.major.semitones, [0, 2, 4, 5, 7, 9, 11]);
  eq(p.byId.dom7.semitones, [0, 4, 7, 10]);
  eq(p.byId.aug.semitones, [0, 4, 8]);
  eq(p.byId.maj9.semitones, [0, 4, 7, 11, 14], 'extended chord past the octave');
  eq(p.byId.dom7.name, 'Dominant 7th');
  eq(p.byId.dom7.group, 'Chords');
});

test('parsed data is frozen', () => {
  const p = parsePatterns(MINI);
  if (!Object.isFrozen(p.byId.major.semitones)) throw new Error('semitones not frozen');
  if (!Object.isFrozen(p.groups)) throw new Error('groups not frozen');
});

test('rejects malformed input with line numbers', () => {
  throws(() => parsePatterns('major: Major = 1 2 3'), /line 1: entry before any/);
  throws(() => parsePatterns('[Modes]'), /line 1: unknown section/);
  throws(() => parsePatterns('[Scales]\n[Scales]'), /line 2: duplicate section/);
  throws(() => parsePatterns('[Scales]\nnonsense here'), /line 2: expected/);
  throws(() => parsePatterns('[Scales]\n7th: Seventh = 1'), /line 2: bad id/);
  throws(() => parsePatterns('[Scales]\na: A = 1\na: B = 1'), /line 3: duplicate id/);
  throws(() => parsePatterns('[Scales]\na: A = 1 x 5'), /line 2: bad degree "x"/);
  throws(() => parsePatterns('[Scales]\na: A = 1 10 5'), /line 2: bad degree "10"/);
  throws(() => parsePatterns('[Scales]\na: A = b1 3 5'), /falls below the root/);
  throws(() => parsePatterns('[Scales]\na: A = 1 5 3'), /strictly ascending/);
  throws(() => parsePatterns('[Scales]\na: A = 1 3 3'), /strictly ascending/);
  throws(() => parsePatterns('[Scales]\na: A = 1 b3 #2'), /strictly ascending/);
  throws(() => parsePatterns('# nothing\n[Scales]'), /no pattern definitions/);
});

// The shipped data file must parse and match the intervals the app was built around.
test('data/patterns.txt parses with expected content', async () => {
  const res = await fetch('../data/patterns.txt');
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const p = parsePatterns(await res.text());
  eq(p.groups.map(g => g.name), ['Scales', 'Chords']);
  eq(p.groups[0].items.length, 10, 'scale count');
  eq(p.groups[1].items.length, 8, 'chord count');
  eq(p.byId.minor.semitones, [0, 2, 3, 5, 7, 8, 10]);
  eq(p.byId.harmonicMinor.semitones, [0, 2, 3, 5, 7, 8, 11]);
  eq(p.byId.blues.semitones, [0, 3, 5, 6, 7, 10]);
  eq(p.byId.chromatic.semitones, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  eq(p.byId.majPent.semitones, [0, 2, 4, 7, 9]);
  eq(p.byId.dim.semitones, [0, 3, 6]);
  eq(p.byId.sus4.semitones, [0, 5, 7]);
  eq(p.byId.min7.semitones, [0, 3, 7, 10]);
});

// ---- circle of fifths ----

test('circle position math round-trips', () => {
  for (let pc = 0; pc < 12; pc++) eq(pcOf(positionOf(pc)), pc, `pc ${pc}`);
  eq(positionOf(0), 0, 'C at twelve o\'clock');
  eq(positionOf(7), 1, 'G one step clockwise');
  eq(positionOf(5), 11, 'F one step counter-clockwise');
  eq(pcOf(6), 6, 'F♯ opposite C');
});

test('every major scale is a contiguous arc of seven wedges', () => {
  const major = [0, 2, 4, 5, 7, 9, 11];
  for (let root = 0; root < 12; root++) {
    const pos = major.map(s => positionOf((root + s) % 12)).sort((a, b) => a - b);
    const gaps = pos.map((p, i) => ((pos[(i + 1) % 7] - p) + 12) % 12).sort((a, b) => a - b);
    eq(gaps, [1, 1, 1, 1, 1, 1, 6], `root ${root}`);
  }
});

test('labels and key signatures line up', () => {
  eq(MAJOR_LABELS.length, 12);
  eq(MINOR_LABELS.length, 12);
  eq(SIGNATURES.length, 12);
  eq(MAJOR_LABELS[positionOf(2)], 'D');
  eq(SIGNATURES[positionOf(2)], '2♯', 'D major has two sharps');
  eq(SIGNATURES[positionOf(10)], '2♭', 'B♭ major has two flats');
  eq(SIGNATURES[0], '♮');
  eq(MINOR_LABELS[0], 'Am', 'relative minor of C');
  eq(MINOR_LABELS[positionOf(7)], 'Em', 'relative minor of G');
});

// ---- runner ----

const list = document.getElementById('results');
const summary = document.getElementById('summary');
let passed = 0;

for (const c of cases) {
  const li = document.createElement('li');
  try {
    await c.fn();
    li.className = 'pass';
    li.textContent = c.name;
    passed++;
  } catch (e) {
    li.className = 'fail';
    li.textContent = `${c.name} — ${e.message}`;
  }
  list.append(li);
}

summary.textContent = `${passed} / ${cases.length} passed`;
summary.className = passed === cases.length ? 'pass' : 'fail';
