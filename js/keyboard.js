// 3D keyboard renderer. Rebuilds the board on configuration changes; press
// feedback is a per-key class toggle handled against the DOM built here.
// Material and press styling live in css/studio.css — this module lays out
// geometry (published as CSS custom properties on the board) and assigns
// state classes. Keys are sized to the measured stage rather than built at a
// design size and scaled down, so faces and labels rasterize at native
// resolution instead of blurring under a shrinking transform.

import { isWhite, pitchClass, PC_NAMES } from './theory.js';

const TILT = 40;      // camera tilt in the angled view
const TOP_TILT = 13;  // overhead keeps a slight tilt so key depth stays legible

// Derive all key dimensions from the space a single white-key slot gets.
// Exported for tests.
export function boardGeometry(stageWidth, stageHeight, whiteCount) {
  const avail = Math.min(stageWidth * 0.94, 1500);
  const slot = Math.max(21, Math.min(47, avail / Math.max(whiteCount, 1)));
  const wd = Math.max(150, Math.min(272, Math.min(slot * 5.7, stageHeight * 0.62)));
  const wh = Math.max(18, slot * 0.72);
  const bh = wh * 1.44;
  return Object.freeze({
    slot,
    ww: slot - Math.max(2, slot * 0.065),
    wd,
    wh,
    bw: slot * 0.61,
    bd: wd * 0.625,
    bh,
    wz: wh / 2,
    bz: wh + Math.max(9, slot * 0.26) - bh / 2, // black top sits above the white tops
  });
}

function chassisPieces(g, bw) {
  const { wd, wh } = g;
  return [
    // wooden base slab under the keys
    `left:-16px;top:-12px;width:${bw + 32}px;height:${wd + 60}px;transform:translateZ(-4px);` +
    'background:var(--slab);border-radius:7px;' +
    'box-shadow:0 30px 70px rgba(0,0,0,.65), inset 0 1px 0 rgba(255,255,255,.07), inset 0 0 50px rgba(0,0,0,.5);',
    // front rail below the keys
    `left:-16px;top:${wd + 8}px;width:${bw + 32}px;height:40px;transform:translateZ(5px);` +
    'background:var(--rail);border-radius:0 0 7px 7px;' +
    'box-shadow:inset 0 1px 0 rgba(255,255,255,.09), 0 10px 24px rgba(0,0,0,.5);',
    // shadow seam where the keys meet the rail
    `left:-4px;top:${wd - 2}px;width:${bw + 8}px;height:11px;transform:translateZ(2px);` +
    'background:linear-gradient(180deg, rgba(0,0,0,.55), rgba(0,0,0,0));pointer-events:none;',
    // side cheeks
    `left:-16px;top:-12px;width:15px;height:${wd + 22}px;transform:translateZ(${(wh * 0.45).toFixed(1)}px);` +
    'background:var(--cheek);border-radius:6px 2px 2px 6px;' +
    'box-shadow:inset 0 1px 0 rgba(255,255,255,.08), inset -3px 0 6px rgba(0,0,0,.45);',
    `left:${bw + 1}px;top:-12px;width:15px;height:${wd + 22}px;transform:translateZ(${(wh * 0.45).toFixed(1)}px);` +
    'background:var(--cheek);border-radius:2px 6px 6px 2px;' +
    'box-shadow:inset 0 1px 0 rgba(255,255,255,.08), inset 3px 0 6px rgba(0,0,0,.45);',
    // raised control strip along the back
    `left:-16px;top:-12px;width:${bw + 32}px;height:44px;transform:translateZ(${(wh + 14).toFixed(1)}px);transform-origin:50% 0;` +
    'background:var(--back-rail);border-radius:7px 7px 0 0;' +
    'box-shadow:inset 0 1px 0 rgba(255,255,255,.08), inset 0 -10px 16px rgba(0,0,0,.6);',
    // vertical wall behind the keys
    `left:-16px;top:30px;width:${bw + 32}px;height:${(wh + 18).toFixed(1)}px;` +
    `transform:translateY(-${(wh + 18).toFixed(1)}px) translateZ(${(wh + 14).toFixed(1)}px) rotateX(90deg);transform-origin:50% 100%;` +
    'background:linear-gradient(180deg,#15151a,#0a0a0d);box-shadow:inset 0 6px 14px rgba(0,0,0,.7);',
  ];
}

export class Keyboard {
  constructor(rigEl, boardEl) {
    this.rig = rigEl;
    this.board = boardEl;
    this.keys = new Map();
    this.geo = null;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  }

  // config: { startMidi, keyCount, rootPc, semitones (may be empty), labelMode,
  // view, stageWidth, stageHeight }
  render({ startMidi, keyCount, rootPc, semitones, labelMode, view, stageWidth, stageHeight }) {
    const endMidi = startMidi + keyCount - 1;
    const highlighted = new Set(semitones.map(s => s % 12));

    let whites = 0;
    for (let m = startMidi; m <= endMidi; m++) if (isWhite(m)) whites++;
    const g = this.geo = boardGeometry(stageWidth, stageHeight, whites);

    // white keys sit in fixed slots; black keys centre between their neighbours
    const whiteX = new Map();
    const list = [];
    let wi = 0;
    for (let m = startMidi; m <= endMidi; m++) {
      const white = isWhite(m);
      if (white) whiteX.set(m, wi++ * g.slot + g.slot / 2);
      list.push({ midi: m, white });
    }
    const boardWidth = whites * g.slot;
    for (const k of list) {
      const lo = whiteX.get(k.midi - 1);
      const hi = whiteX.get(k.midi + 1);
      k.x = k.white ? whiteX.get(k.midi)
        : lo != null && hi != null ? (lo + hi) / 2
        : lo != null ? lo + g.slot / 2
        : hi != null ? hi - g.slot / 2
        : g.slot / 2;
    }

    const frag = document.createDocumentFragment();
    for (const style of chassisPieces(g, boardWidth)) {
      const piece = document.createElement('div');
      piece.className = 'chassis';
      piece.style.cssText = style;
      frag.append(piece);
    }
    // felt / LED / brass strip at the back of the keybed, finished per theme
    const strip = document.createElement('div');
    strip.className = 'chassis strip';
    strip.style.cssText = `left:-2px;top:-2px;width:${boardWidth + 4}px;transform:translateZ(${(g.wh / 2 + 1).toFixed(1)}px);`;
    frag.append(strip);

    this.keys.clear();
    for (const k of list) {
      const pc = pitchClass(k.midi);
      const rel = (pc - rootPc + 12) % 12;
      const hl = highlighted.has(rel);
      const isRoot = hl && rel === 0;
      const top = view === 'top';
      // Overhead view is for reading notes, so every key gets labelled there:
      // pattern notes keep their gems, the rest get plain names.
      const showGem = hl && (labelMode !== 'off' || top);
      const showLabel = top ? !hl : !hl && (labelMode === 'all' || (labelMode === 'c' && pc === 0));
      const label = pc === 0 ? `C${Math.floor(k.midi / 12) - 1}` : PC_NAMES[pc];

      const key = document.createElement('div');
      key.className = 'key ' + (k.white ? 'white' : 'black') + (isRoot ? ' hl-root' : hl ? ' hl' : '');
      key.dataset.midi = k.midi;
      key.dataset.x = k.x.toFixed(1);
      key.style.left = `${(k.x - (k.white ? g.ww : g.bw) / 2).toFixed(2)}px`;

      const box = document.createElement('div');
      box.className = 'kbox';
      for (const face of ['f-top', 'f-front', 'f-left', 'f-right']) {
        const el = document.createElement('div');
        el.className = `face ${face}`;
        box.append(el);
      }
      if (showGem) {
        const gem = document.createElement('div');
        gem.className = 'face f-gem ' + (isRoot ? 'root' : 'member');
        gem.textContent = label;
        box.append(gem);
      } else if (showLabel) {
        const lbl = document.createElement('div');
        lbl.className = 'face f-lbl';
        lbl.textContent = label;
        box.append(lbl);
      }
      key.append(box);
      frag.append(key);
      this.keys.set(k.midi, key);
    }

    this.board.className = `board view-${view}`;
    const dims = this.board.style;
    dims.width = `${boardWidth}px`;
    dims.height = `${g.wd + 60}px`;
    for (const [name, value] of [
      ['--ww', g.ww], ['--wd', g.wd], ['--wh', g.wh], ['--wz', g.wz],
      ['--bw', g.bw], ['--bd', g.bd], ['--bh', g.bh], ['--bz', g.bz],
    ]) dims.setProperty(name, `${value.toFixed(2)}px`);
    this.board.replaceChildren(frag);

    // camera: no scale() — the board is already built at presentation size
    const tiltDeg = view === 'top' ? TOP_TILT : TILT;
    const shift = view === 'top' ? g.wd * 0.05 : -g.wd * 0.26;
    this.rig.style.transform = `translateY(${shift.toFixed(1)}px) rotateX(${tiltDeg}deg)`;
  }

  setPressed(midi, on) {
    const key = this.keys.get(midi);
    if (key) key.classList.toggle('down', !!on);
  }

  clearPressed() {
    for (const key of this.keys.values()) key.classList.remove('down');
  }

  // expanding ring at the struck key's front edge, coloured like its role
  ripple(midi) {
    const key = this.keys.get(midi);
    if (!key || !this.geo || this.reducedMotion.matches) return;
    const g = this.geo;
    const white = key.classList.contains('white');
    const kind = key.classList.contains('hl-root') ? 'root' : key.classList.contains('hl') ? 'member' : 'plain';
    const size = white ? g.slot * 1.9 : g.slot * 1.4;
    const y = white ? g.wd - 30 : g.bd - 22;
    const z = white ? g.wh + 2 : g.bz + g.bh / 2 + 2;

    const wrap = document.createElement('div');
    wrap.className = 'ripple';
    wrap.style.cssText = `left:${key.dataset.x}px;top:${y.toFixed(1)}px;transform:translateZ(${z.toFixed(1)}px);`;
    const ring = document.createElement('div');
    ring.className = `ripple-ring ${kind}`;
    ring.style.cssText = `left:${(-size / 2).toFixed(1)}px;top:${(-size / 2).toFixed(1)}px;width:${size.toFixed(0)}px;height:${size.toFixed(0)}px;`;
    // timer fallback: if the animation never runs (throttled tab, user styles),
    // the ring must still not accumulate in the DOM
    const expire = setTimeout(() => wrap.remove(), 1000);
    ring.addEventListener('animationend', () => {
      clearTimeout(expire);
      wrap.remove();
    }, { once: true });
    wrap.append(ring);
    this.board.append(wrap);
  }
}
