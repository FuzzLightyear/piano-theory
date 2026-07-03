// Note math. Middle C is C4 (MIDI 60); the playable range is A0-C8 (21-108).

export const MIDI_MIN = 21;
export const MIDI_MAX = 108;

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const DISPLAY = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const LETTER_PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const WHITE_PC = new Set([0, 2, 4, 5, 7, 9, 11]);

export const PC_NAMES = Object.freeze([...DISPLAY]);

export const pitchClass = midi => ((midi % 12) + 12) % 12;

export const isWhite = midi => WHITE_PC.has(pitchClass(midi));

// "C4", "F#3", "Bb2" -> MIDI number, or null if unparseable.
export function parseNote(text) {
  const m = /^([A-Ga-g])([#b]?)(-?\d{1,2})$/.exec(String(text).trim());
  if (!m) return null;
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return (Number(m[3]) + 1) * 12 + LETTER_PC[m[1].toLowerCase()] + acc;
}

// MIDI number -> "C4" (ASCII) or "C♯4" (pretty, for display).
export function noteName(midi, pretty = false) {
  const oct = Math.floor(midi / 12) - 1;
  return (pretty ? DISPLAY : NAMES)[pitchClass(midi)] + oct;
}
