// All sound is synthesized with WebAudio: no audio files.
import { G } from './state.js';

let ctx = null, master, sfxBus, musBus, noiseBuf, delay;
const now = () => ctx.currentTime;

function tone(f, dur, type = 'sine', vol = 0.3, slide = 0, at = 0, bus = sfxBus) {
  const t = now() + at, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus); o.start(t); o.stop(t + dur + 0.03);
}
function hiss(dur, vol, f, slide = 0, type = 'bandpass', q = 1, at = 0, bus = sfxBus) {
  const t = now() + at, s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; s.loop = true; fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f, t);
  if (slide) fl.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl).connect(g).connect(bus); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.03);
}
const r = (a, b) => a + Math.random() * (b - a);

const SFX = {
  swing: (v) => hiss(0.13, 0.22 * v, r(1500, 2100), 500, 'bandpass', 1.4),
  swingHeavy: (v) => { hiss(0.24, 0.3 * v, 1000, 250, 'bandpass', 1.2); tone(140, 0.18, 'sine', 0.15 * v, 70); },
  hit: (v) => { hiss(0.07, 0.45 * v, 1400, 600, 'lowpass'); tone(r(150, 190), 0.1, 'triangle', 0.4 * v, 60); },
  hitHeavy: (v) => { hiss(0.14, 0.6 * v, 900, 200, 'lowpass'); tone(110, 0.22, 'triangle', 0.6 * v, 40); tone(60, 0.25, 'sine', 0.5 * v, 30); },
  crit: (v) => { tone(1500, 0.09, 'square', 0.12 * v, 2400); tone(2200, 0.16, 'sine', 0.12 * v, 0, 0.03); },
  clang: (v) => { tone(520, 0.12, 'square', 0.14 * v, 480); hiss(0.08, 0.2 * v, 3000, 0, 'highpass'); },
  guard: (v) => { tone(260, 0.08, 'square', 0.16 * v, 180); hiss(0.07, 0.25 * v, 900, 0, 'lowpass'); },
  parry: (v) => { tone(1750, 0.3, 'triangle', 0.32 * v, 2350); tone(2640, 0.36, 'sine', 0.18 * v); hiss(0.06, 0.25 * v, 5000, 0, 'highpass'); },
  dodge: (v) => hiss(0.2, 0.2 * v, 500, 2600, 'bandpass', 0.9),
  jump: (v) => tone(300, 0.11, 'sine', 0.13 * v, 540),
  land: (v) => hiss(0.08, 0.22 * v, 320, 120, 'lowpass'),
  step: (v) => hiss(0.04, 0.05 * v, r(500, 800), 200, 'lowpass'),
  hurt: (v) => { tone(230, 0.22, 'sawtooth', 0.26 * v, 100); hiss(0.1, 0.3 * v, 700, 200, 'lowpass'); },
  die: (v) => { hiss(0.32, 0.26 * v, 900, 90, 'bandpass'); tone(210, 0.32, 'sawtooth', 0.16 * v, 45); },
  tele: (v) => tone(880, 0.13, 'square', 0.07 * v, 660),
  mote: (v) => tone(r(1100, 1500), 0.07, 'sine', 0.09 * v, 1900),
  pickup: (v) => { tone(880, 0.08, 'triangle', 0.18 * v); tone(1320, 0.14, 'triangle', 0.18 * v, 0, 0.07); },
  chest: (v) => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.2 * v, 0, i * 0.09)),
  level: (v) => [392, 523, 659, 784, 1047].forEach((f, i) => { tone(f, 0.3, 'triangle', 0.22 * v, 0, i * 0.08); tone(f * 2, 0.3, 'sine', 0.08 * v, 0, i * 0.08); }),
  ui: (v) => tone(660, 0.04, 'square', 0.05 * v),
  uiSel: (v) => { tone(880, 0.06, 'square', 0.07 * v); tone(1320, 0.08, 'square', 0.05 * v, 0, 0.05); },
  uiBack: (v) => tone(440, 0.07, 'square', 0.06 * v, 330),
  deny: (v) => tone(150, 0.14, 'sawtooth', 0.12 * v, 110),
  boom: (v) => { hiss(0.5, 0.6 * v, 260, 40, 'lowpass'); tone(85, 0.5, 'sine', 0.6 * v, 28); },
  zap: (v) => { tone(1300, 0.16, 'sawtooth', 0.16 * v, 180); hiss(0.14, 0.25 * v, 4200, 1500, 'highpass'); },
  fire: (v) => hiss(0.45, 0.3 * v, 700, 250, 'lowpass', 0.6),
  water: (v) => hiss(0.4, 0.3 * v, 380, 1500, 'bandpass', 0.8),
  wind: (v) => hiss(0.7, 0.25 * v, 300, 1300, 'bandpass', 2),
  dark: (v) => { tone(90, 0.5, 'sawtooth', 0.2 * v, 50); tone(1200, 0.4, 'sine', 0.08 * v, 300); },
  heal: (v) => [523, 659, 784].forEach((f, i) => tone(f, 0.35, 'sine', 0.18 * v, f * 1.5, i * 0.07)),
  art: (v) => { tone(440, 0.4, 'triangle', 0.16 * v, 880); tone(660, 0.4, 'sine', 0.12 * v, 1320, 0.05); },
  flash: (v) => { tone(2400, 0.6, 'sine', 0.2 * v, 400); hiss(0.5, 0.18 * v, 6000, 500, 'bandpass', 2); },
  unison: (v) => { [262, 392, 523, 784].forEach((f, i) => tone(f, 0.9, 'sawtooth', 0.1 * v, f * 2, i * 0.04)); hiss(0.8, 0.4 * v, 200, 4000, 'bandpass'); },
  gate: (v) => { tone(70, 0.4, 'sine', 0.5 * v, 40); hiss(0.25, 0.3 * v, 400, 100, 'lowpass'); },
  beat: (v) => tone(520, 0.09, 'sine', 0.22 * v),
  bindGood: (v) => { tone(1047, 0.14, 'triangle', 0.24 * v); tone(1568, 0.2, 'sine', 0.14 * v, 0, 0.05); },
  bindBad: (v) => tone(170, 0.25, 'sawtooth', 0.2 * v, 100),
  bound: (v) => [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.4, 'triangle', 0.18 * v, 0, i * 0.07)),
  roar: (v) => { tone(120, 0.9, 'sawtooth', 0.35 * v, 55); hiss(0.9, 0.4 * v, 500, 150, 'lowpass', 2); },
  portal: (v) => { tone(200, 0.8, 'sine', 0.2 * v, 800); hiss(0.8, 0.2 * v, 400, 3000, 'bandpass', 3); },
};

// ---------- generative music ----------
const SCALES = { maj: [0, 2, 4, 7, 9], min: [0, 3, 5, 7, 10], dor: [0, 2, 3, 7, 9], phr: [0, 1, 5, 7, 8], lyd: [0, 4, 6, 7, 11] };
const MOODS = {
  title: { root: 50, scale: 'dor', bpm: 66, chords: [0, 3, 1, 4], melody: 0.35, bright: 900 },
  meadow: { root: 55, scale: 'maj', bpm: 84, chords: [0, 3, 4, 2], melody: 0.5, bright: 1500 },
  ember: { root: 50, scale: 'phr', bpm: 92, chords: [0, 1, 0, 3], melody: 0.4, bright: 1100 },
  tide: { root: 53, scale: 'lyd', bpm: 72, chords: [0, 2, 4, 1], melody: 0.45, bright: 1700 },
  storm: { root: 52, scale: 'min', bpm: 100, chords: [0, 4, 3, 1], melody: 0.45, bright: 1300 },
  gloam: { root: 46, scale: 'min', bpm: 62, chords: [0, 1, 3, 0], melody: 0.3, bright: 700 },
  shrine: { root: 48, scale: 'dor', bpm: 78, chords: [0, 2, 1, 3], melody: 0.3, bright: 800 },
  boss: { root: 45, scale: 'phr', bpm: 132, chords: [0, 1, 3, 1], melody: 0.6, bright: 1800, drive: 1 },
};
let mood = 'title', moodDef = MOODS.title, step = 0, nextT = 0, melIdx = 2, intensity = 0;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const deg = (d) => { const sc = SCALES[moodDef.scale]; const o = Math.floor(d / sc.length); return moodDef.root + sc[((d % sc.length) + sc.length) % sc.length] + 12 * o; };

function pad(d, dur) {
  for (const off of [0, 2, 4]) {
    const f = mtof(deg(d + off));
    for (const det of [-5, 6]) {
      const t = now(), o = ctx.createOscillator(), g = ctx.createGain(), fl = ctx.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      fl.type = 'lowpass'; fl.frequency.value = moodDef.bright * 0.5;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.03, t + dur * 0.4); g.gain.linearRampToValueAtTime(0.0001, t + dur * 1.15);
      o.connect(fl).connect(g).connect(musBus); o.start(t); o.stop(t + dur * 1.2);
    }
  }
}
function schedule() {
  if (!ctx || ctx.state !== 'running') return;
  const sixteenth = 60 / moodDef.bpm / 4;
  if (nextT < now()) nextT = now() + 0.05;
  while (nextT < now() + 0.12) {
    const bar = Math.floor(step / 16), s = step % 16, chord = moodDef.chords[bar % moodDef.chords.length];
    const at = nextT - now();
    const drive = moodDef.drive || intensity;
    if (s === 0) pad(chord, sixteenth * 16);
    if (s % 4 === 0) tone(mtof(deg(chord) - 12), sixteenth * 3.5, 'sine', 0.1 + 0.08 * drive, 0, at, musBus);
    if (s % 2 === 0 && Math.random() < moodDef.melody * (s % 4 === 0 ? 1.2 : 0.7)) {
      melIdx += Math.floor(Math.random() * 5) - 2; if (melIdx < 0) melIdx = 1; if (melIdx > 9) melIdx = 8;
      const f = mtof(deg(chord + melIdx) + 12);
      tone(f, sixteenth * 3, 'triangle', 0.07, 0, at, musBus); tone(f * 2, sixteenth * 2, 'sine', 0.02, 0, at, musBus);
    }
    if (drive > 0.3) {
      if (s % 8 === 0) { tone(110, 0.16, 'sine', 0.28 * drive, 38, at, musBus); }
      if (s % 8 === 4) hiss(0.1, 0.12 * drive, 1800, 0, 'bandpass', 0.8, at, musBus);
      if (s % 2 === 1) hiss(0.03, 0.04 * drive, 7000, 0, 'highpass', 1, at, musBus);
      if (s % 4 === 2) tone(mtof(deg(chord)), sixteenth * 1.5, 'sawtooth', 0.035 * drive, 0, at, musBus);
    }
    step++; nextT += sixteenth;
  }
}

export const audio = {
  init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = G.opts.volume; master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
    musBus = ctx.createGain(); musBus.gain.value = 0.55;
    delay = ctx.createDelay(1); delay.delayTime.value = 0.33; const fb = ctx.createGain(); fb.gain.value = 0.32;
    musBus.connect(master); musBus.connect(delay); delay.connect(fb).connect(delay); delay.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  },
  resume() { this.init(); if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); },
  get running() { return !!ctx && ctx.state === 'running'; },
  sfx(name, vol = 1) { if (!ctx || ctx.state !== 'running') return; const f = SFX[name]; if (f) { try { f(vol); } catch (e) { /* ignore */ } } },
  setMood(m) { if (m !== mood && MOODS[m]) { mood = m; moodDef = MOODS[m]; } },
  setVolume(v) { G.opts.volume = v; if (master) master.gain.value = v; },
  update(dt, inCombat) { intensity += ((inCombat ? 1 : 0) - intensity) * Math.min(1, dt * 1.5); schedule(); },
};
