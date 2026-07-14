// Circle of fifths. The wedge ring is built once as static SVG; highlighting
// is class-driven, same as the keyboard. Position i holds the pitch class
// (7·i) mod 12, and because 7 is its own inverse mod 12, a pitch class sits
// at position (7·pc) mod 12 — the payoff being that diatonic sets land as
// contiguous arcs (any major scale is seven consecutive wedges).

const NS = 'http://www.w3.org/2000/svg';

export const pcOf = position => (7 * position) % 12;
export const positionOf = pc => (7 * pc) % 12;

export const MAJOR_LABELS = Object.freeze([
  'C', 'G', 'D', 'A', 'E', 'B', 'F♯·G♭', 'D♭', 'A♭', 'E♭', 'B♭', 'F',
]);
export const MINOR_LABELS = Object.freeze([
  'Am', 'Em', 'Bm', 'F♯m', 'C♯m', 'G♯m', 'E♭m', 'B♭m', 'Fm', 'Cm', 'Gm', 'Dm',
]);
export const SIGNATURES = Object.freeze([
  '♮', '1♯', '2♯', '3♯', '4♯', '5♯', '6♯ · 6♭', '5♭', '4♭', '3♭', '2♭', '1♭',
]);

const C = 160;           // svg centre (320×320 viewBox)
const R_OUTER = 150;
const R_MID = 106;
const R_INNER = 70;

const point = (deg, r) => {
  const rad = (deg * Math.PI) / 180;
  return `${(C + r * Math.cos(rad)).toFixed(2)} ${(C + r * Math.sin(rad)).toFixed(2)}`;
};

// annular sector between radii r1 > r2, spanning [a0, a1] degrees
function sector(a0, a1, r1, r2) {
  return `M ${point(a0, r1)} A ${r1} ${r1} 0 0 1 ${point(a1, r1)} ` +
         `L ${point(a1, r2)} A ${r2} ${r2} 0 0 0 ${point(a0, r2)} Z`;
}

function svgEl(tag, attrs) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function label(deg, r, cls, text) {
  const el = svgEl('text', {
    x: point(deg, r).split(' ')[0],
    y: point(deg, r).split(' ')[1],
    class: cls,
    'text-anchor': 'middle',
    'dominant-baseline': 'central',
  });
  el.textContent = text;
  return el;
}

export class CircleOfFifths {
  constructor(svg, { onSelect }) {
    this.svg = svg;
    this.wedges = [];
    for (let i = 0; i < 12; i++) {
      const mid = i * 30 - 90;
      const g = svgEl('g', {
        class: 'wedge',
        role: 'button',
        tabindex: '0',
        'aria-label': `${MAJOR_LABELS[i]} major, relative minor ${MINOR_LABELS[i]}`,
      });
      g.append(
        svgEl('path', { d: sector(mid - 15, mid + 15, R_OUTER, R_MID) }),
        svgEl('path', { d: sector(mid - 15, mid + 15, R_MID, R_INNER) }),
        label(mid, (R_OUTER + R_MID) / 2, 'w-major', MAJOR_LABELS[i]),
        label(mid, (R_MID + R_INNER) / 2, 'w-minor', MINOR_LABELS[i]),
      );
      const select = () => onSelect(pcOf(i));
      g.addEventListener('click', select);
      g.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          select();
        }
      });
      this.wedges.push(g);
      svg.append(g);
    }
    this.caption = [
      svgEl('text', { x: C, y: 150, class: 'c-root', 'text-anchor': 'middle' }),
      svgEl('text', { x: C, y: 168, class: 'c-pattern', 'text-anchor': 'middle' }),
      svgEl('text', { x: C, y: 184, class: 'c-sig', 'text-anchor': 'middle' }),
    ];
    svg.append(...this.caption);
  }

  // rootPc: pitch class of the root; pcs: Set of all highlighted pitch classes;
  // lines: up to three caption strings for the centre
  update({ rootPc, pcs, lines }) {
    this.wedges.forEach((g, i) => {
      const pc = pcOf(i);
      g.classList.toggle('root', pc === rootPc);
      g.classList.toggle('member', pc !== rootPc && pcs.has(pc));
    });
    this.caption.forEach((el, i) => { el.textContent = lines[i] ?? ''; });
  }

  // transient marker for the fifths tour; null clears
  setActive(position) {
    this.wedges.forEach((g, i) => g.classList.toggle('tour', i === position));
  }
}
