// Parser for data/patterns.txt. Strict by design: a typo in the data file
// must fail loudly with a line number, never silently misrender a chord.

const DEGREE_SEMITONES = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11, 8: 12, 9: 14, 11: 17, 13: 21 };
const SECTION_NAMES = ['Scales', 'Chords'];
const ID_RE = /^[A-Za-z][A-Za-z0-9]*$/;
const ENTRY_RE = /^([^:=]+):([^=]+)=(.+)$/;
const TOKEN_RE = /^([b#]?)(\d{1,2})$/;

function fail(line, msg) {
  throw new Error(`patterns.txt line ${line}: ${msg}`);
}

function parseDegrees(field, line) {
  const semitones = field.trim().split(/\s+/).map(tok => {
    const m = TOKEN_RE.exec(tok);
    const base = m && DEGREE_SEMITONES[Number(m[2])];
    if (!m || base === undefined) fail(line, `bad degree "${tok}"`);
    const s = base + (m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0);
    if (s < 0) fail(line, `degree "${tok}" falls below the root`);
    return s;
  });
  semitones.forEach((s, i) => {
    if (i > 0 && s <= semitones[i - 1]) fail(line, 'degrees must be strictly ascending');
  });
  return Object.freeze(semitones);
}

// Returns { groups: [{ name, items }], byId: { id -> item } }, deep-frozen.
// Each item is { id, name, semitones, group }.
export function parsePatterns(text) {
  const groups = [];
  const byId = {};
  let current = null;

  String(text).split(/\r?\n/).forEach((raw, i) => {
    const n = i + 1;
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;

    const section = /^\[(.+)\]$/.exec(line);
    if (section) {
      const name = section[1].trim();
      if (!SECTION_NAMES.includes(name)) fail(n, `unknown section [${name}]`);
      if (groups.some(g => g.name === name)) fail(n, `duplicate section [${name}]`);
      current = { name, items: [] };
      groups.push(current);
      return;
    }

    if (!current) fail(n, 'entry before any [Scales] or [Chords] section');
    const entry = ENTRY_RE.exec(line);
    if (!entry) fail(n, 'expected "id: Display Name = degrees"');

    const id = entry[1].trim();
    const name = entry[2].trim();
    if (!ID_RE.test(id)) fail(n, `bad id "${id}" (letters and digits, starting with a letter)`);
    if (id in byId) fail(n, `duplicate id "${id}"`);
    if (!name || name.length > 40) fail(n, 'display name must be 1-40 characters');

    const item = Object.freeze({ id, name, semitones: parseDegrees(entry[3], n), group: current.name });
    byId[id] = item;
    current.items.push(item);
  });

  if (groups.every(g => g.items.length === 0)) throw new Error('patterns.txt: no pattern definitions found');
  groups.forEach(g => { Object.freeze(g.items); Object.freeze(g); });
  return Object.freeze({ groups: Object.freeze(groups), byId: Object.freeze(byId) });
}
