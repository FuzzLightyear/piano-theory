// Piano synthesis on the Web Audio API. Each note is a bank of sine partials
// with stretched (inharmonic) tuning, per-partial decay, and a band-passed
// noise burst for the hammer strike, run through a shared compressor bus and
// a synthesized convolver reverb. Releasing a key damps its voices over a
// short, sustain-derived release — held and tapped notes feel different, the
// way a damper makes them on a real piano.

const REVERB_WET = { dry: 0, room: 0.20, hall: 0.55 };

export const REVERB_LEVELS = Object.freeze(Object.keys(REVERB_WET));

// release time in seconds for a given sustain setting
export const releaseTime = sustain => 0.06 + Math.max(0, sustain - 0.2) * 0.55;

export class Synth {
  #createContext;
  #ctx = null;
  #wetLevel = REVERB_WET.room;
  #voices = new Map(); // midi -> [{ gain }] of currently ringing strikes
  #master;
  #reverb;
  #wet;
  #noise;

  // the context factory exists so tests can render through OfflineAudioContext
  constructor(createContext = () => new AudioContext()) {
    this.#createContext = createContext;
  }

  // Lazily create the context and bus. Must be called from a user gesture the
  // first time or the context starts suspended; we also resume defensively.
  #ensure() {
    if (!this.#ctx) {
      const ctx = this.#ctx = this.#createContext();

      // master bus: gentle compression keeps chords from clipping
      this.#master = ctx.createGain();
      this.#master.gain.value = 0.5;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 24;
      comp.ratio.value = 3;
      comp.attack.value = 0.003;
      comp.release.value = 0.25;
      this.#master.connect(comp);
      comp.connect(ctx.destination);

      // room reverb: an exponentially decaying noise impulse into a convolver
      this.#reverb = ctx.createConvolver();
      const len = Math.floor(ctx.sampleRate * 1.7);
      const impulse = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = impulse.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.8;
      }
      this.#reverb.buffer = impulse;
      this.#wet = ctx.createGain();
      this.#wet.gain.value = this.#wetLevel;
      this.#reverb.connect(this.#wet);
      this.#wet.connect(comp);

      // one shared hammer-noise buffer: buffer sources are one-shot, buffers
      // are not — regenerating this per strike was pure allocation churn
      const dur = 0.05;
      this.#noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
      const d = this.#noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
    }
    if (this.#ctx.state === 'suspended') this.#ctx.resume().catch(() => {});
    return this.#ctx;
  }

  setReverb(level) {
    this.#wetLevel = REVERB_WET[level] ?? REVERB_WET.room;
    // ramp the wet mix so switching never clicks
    if (this.#wet) this.#wet.gain.setTargetAtTime(this.#wetLevel, this.#ctx.currentTime, 0.04);
  }

  note(midi, sustain = 1) {
    const ctx = this.#ensure();
    const t = ctx.currentTime;
    const f0 = 440 * 2 ** ((midi - 69) / 12);
    // register runs 0 (lowest key) to 1 (highest) and drives everything
    // register-dependent below: ring time, brightness, inharmonicity
    const reg = Math.min(1, Math.max(0, (midi - 21) / (108 - 21)));
    // Stiff strings stretch overtones sharp (partial n -> n*sqrt(1 + B*n^2)),
    // more so in the bass. This is the biggest "real piano" cue there is
    // versus plain integer harmonics.
    const B = 0.00020 + 0.0011 * (1 - reg);
    const decay = (8.0 - 5.6 * reg) * sustain;
    const partials = Math.round(15 - 8 * reg);
    const vel = 0.88 + Math.random() * 0.12;

    const note = ctx.createGain();
    note.connect(this.#master);
    const send = ctx.createGain();
    send.gain.value = 0.9;
    note.connect(send);
    send.connect(this.#reverb);

    // register the strike so release() can damp it; unregister itself when
    // the longest partial ends naturally
    const voice = { gain: note };
    const list = this.#voices.get(midi) ?? [];
    list.push(voice);
    this.#voices.set(midi, list);
    let longest = null;

    for (let n = 1; n <= partials; n++) {
      const pf = f0 * n * Math.sqrt(1 + B * n * n);
      if (pf > ctx.sampleRate * 0.45) break; // aliasing guard in the treble
      const amp = vel * n ** -1.35 * Math.exp(-n * 0.10 * (0.5 + reg));
      const pdecay = decay * n ** -0.55; // high partials die first
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(amp, t + 0.004);        // hammer attack
      g.gain.exponentialRampToValueAtTime(amp * 0.45, t + 0.09);  // quick early drop
      g.gain.exponentialRampToValueAtTime(0.00014, t + pdecay);   // long tail
      const osc = ctx.createOscillator();
      osc.frequency.value = pf;
      osc.detune.value = (Math.random() * 2 - 1) * 1.6; // multi-string beating
      osc.connect(g);
      g.connect(note);
      osc.start(t);
      osc.stop(t + pdecay + 0.05);
      longest = longest ?? osc; // partial 1 decays slowest
    }
    if (longest) {
      longest.onended = () => {
        const active = this.#voices.get(midi);
        const i = active ? active.indexOf(voice) : -1;
        if (i >= 0) {
          active.splice(i, 1);
          if (!active.length) this.#voices.delete(midi);
        }
      };
    }

    // hammer thump: a short band-passed noise burst, woodier in the bass
    const noise = ctx.createBufferSource();
    noise.buffer = this.#noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = Math.min(f0 * 4, 3800);
    bp.Q.value = 0.7;
    const ng = ctx.createGain();
    ng.gain.value = 0.05 * (0.6 + 0.7 * (1 - reg));
    noise.connect(bp);
    bp.connect(ng);
    ng.connect(note);
    noise.start(t);
  }

  // Damp every ringing strike of this note over the sustain-derived release.
  // Oscillators keep their original scheduled stops — silent past the ramp,
  // and stopping them twice would throw.
  release(midi, sustain = 1) {
    const list = this.#voices.get(midi);
    if (!list || !this.#ctx) return;
    this.#voices.delete(midi);
    const t = this.#ctx.currentTime;
    const rel = releaseTime(sustain);
    for (const voice of list) {
      const gain = voice.gain.gain;
      gain.cancelScheduledValues(t);
      gain.setValueAtTime(1, t);
      gain.exponentialRampToValueAtTime(0.0001, t + rel);
    }
  }
}
