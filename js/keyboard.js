// 3D keyboard renderer. Rebuilds the board on configuration changes; press
// feedback is a per-key class toggle handled against the DOM built here.
// Material and press styling live in css/studio.css — this module only lays
// out geometry and assigns state classes.

import { isWhite, pitchClass, PC_NAMES } from './theory.js';

const WSLOT = 44;         // white key slot width
const WHITE_DEPTH = 250;
const MAX_WIDTH = 980;    // board is scaled down past this
const TILT = 42;          // camera tilt in the angled view

function chassisPieces(bw) {
  const w = bw + 28;
  return [
    // wooden base slab under the keys
    `left:-14px;top:-10px;width:${w}px;height:${WHITE_DEPTH + 58}px;transform:translateZ(-4px);` +
    'background:linear-gradient(180deg,#2a2118,#171009);border-radius:6px;' +
    'box-shadow:0 26px 60px rgba(0,0,0,.6), inset 0 0 40px rgba(0,0,0,.5);',
    // raised control strip along the back
    `left:-14px;top:-10px;width:${w}px;height:42px;transform:translateZ(46px);transform-origin:50% 0;` +
    'background:linear-gradient(180deg,#1d1d22,#101015);border-radius:6px 6px 0 0;' +
    'box-shadow:inset 0 1px 0 rgba(255,255,255,.08), inset 0 -10px 16px rgba(0,0,0,.6);',
    // vertical wall behind the keys
    `left:-14px;top:30px;width:${w}px;height:50px;transform:translateY(-50px) translateZ(46px) rotateX(90deg);` +
    'transform-origin:50% 100%;background:linear-gradient(180deg,#15151a,#0a0a0d);' +
    'box-shadow:inset 0 6px 14px rgba(0,0,0,.7);',
    // red felt strip at the back of the keybed
    `left:-2px;top:-2px;width:${bw + 4}px;height:9px;transform:translateZ(17px);` +
    'background:linear-gradient(180deg,#8e1f24,#5e1418);border-radius:2px;box-shadow:0 0 8px rgba(0,0,0,.4);',
  ];
}

export class Keyboard {
  constructor(rigEl, boardEl) {
    this.rig = rigEl;
    this.board = boardEl;
    this.keys = new Map();
  }

  // config: { startMidi, keyCount, rootPc, semitones (may be empty), labelMode, view }
  render({ startMidi, keyCount, rootPc, semitones, labelMode, view }) {
    const endMidi = startMidi + keyCount - 1;
    const highlighted = new Set(semitones.map(s => s % 12));

    // white keys sit in fixed slots; black keys centre between their neighbours
    const whiteX = new Map();
    const list = [];
    let whites = 0;
    for (let m = startMidi; m <= endMidi; m++) {
      const white = isWhite(m);
      if (white) whiteX.set(m, whites++ * WSLOT + WSLOT / 2);
      list.push({ midi: m, white });
    }
    const boardWidth = whites * WSLOT;
    for (const k of list) {
      const lo = whiteX.get(k.midi - 1);
      const hi = whiteX.get(k.midi + 1);
      k.x = k.white ? whiteX.get(k.midi)
        : lo != null && hi != null ? (lo + hi) / 2
        : lo != null ? lo + WSLOT / 2
        : hi != null ? hi - WSLOT / 2
        : WSLOT / 2;
    }

    const frag = document.createDocumentFragment();
    for (const style of chassisPieces(boardWidth)) {
      const piece = document.createElement('div');
      piece.className = 'chassis';
      piece.style.cssText = style;
      frag.append(piece);
    }

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
      key.style.left = `${k.x - (k.white ? 41 : 27) / 2}px`;

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
    this.board.style.width = `${boardWidth}px`;
    this.board.style.height = `${WHITE_DEPTH + 60}px`;
    this.board.replaceChildren(frag);

    // camera: cinematic tilt in angled view, near-plan in overhead (6° keeps a
    // whisper of key thickness so the board still reads as an object)
    const scale = Math.min(1, MAX_WIDTH / Math.max(boardWidth, 1));
    const tiltDeg = view === 'top' ? 6 : TILT;
    const shift = view === 'top' ? WHITE_DEPTH * scale * 0.02 : WHITE_DEPTH * scale * 0.24;
    this.rig.style.transform = `translateY(-${shift.toFixed(1)}px) scale(${scale.toFixed(4)}) rotateX(${tiltDeg}deg)`;
  }

  setPressed(midi, on) {
    const key = this.keys.get(midi);
    if (key) key.classList.toggle('down', !!on);
  }

  clearPressed() {
    for (const key of this.keys.values()) key.classList.remove('down');
  }
}
