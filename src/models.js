// Every built-in character is built from flat-shaded primitives and animated procedurally.
// Custom 2D sprites and 3D models from assets/art.json replace them (see the end of this file).
import * as THREE from 'three';
import { EL, KITH } from './data.js';
import { lerp, damp, angDiff } from './util.js';
import { G } from './state.js';
import { ART } from './art.js';

export const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 7),
  cone: new THREE.ConeGeometry(0.5, 1, 6),
  sph: new THREE.IcosahedronGeometry(0.5, 1),
  oct: new THREE.OctahedronGeometry(0.5, 0),
};

export class Model {
  constructor(kind) {
    this.kind = kind; this.root = new THREE.Group(); this.mats = []; this.cache = {}; this.p = {};
    this.flash = 0; this.flashCol = new THREE.Color(0xffffff); this._fl = false; this.height = 1.8; this.baseY = 0;
  }
  mat(color, em = 0) {
    const k = color + '_' + em; if (this.cache[k]) return this.cache[k];
    const m = new THREE.MeshLambertMaterial({ color, flatShading: true });
    m.userData.em = new THREE.Color(color).multiplyScalar(em); m.emissive.copy(m.userData.em);
    this.cache[k] = m; this.mats.push(m); return m;
  }
  add(geo, color, sx, sy, sz, x, y, z, parent, em = 0) {
    const m = new THREE.Mesh(GEO[geo], this.mat(color, em));
    m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.castShadow = true; (parent || this.root).add(m); return m;
  }
  piv(name, x, y, z, parent, order) {
    const g = new THREE.Group(); g.position.set(x, y, z); if (order) g.rotation.order = order;
    (parent || this.root).add(g); if (name) this.p[name] = g; return g;
  }
  tick(dt) {
    if (this.flash > 0 || this._fl) {
      this.flash = Math.max(0, this.flash - dt * 5);
      for (const m of this.mats) m.emissive.copy(m.userData.em).lerp(this.flashCol, this.flash * 0.85);
      this._fl = this.flash > 0;
    }
  }
  dispose() { for (const m of this.mats) m.dispose(); if (this.bladeMat) this.bladeMat.dispose(); }
}

// ---------------------------------------------------------------- humanoids
export function makeHumanoid(o = {}) {
  const M = new Model('humanoid'); const c = o.colors; M.o = o;
  const leg = o.leg ?? 0.82, tw = o.tw ?? 0.6, th = o.th ?? 0.72, td = o.td ?? 0.36, hs = o.hs ?? 0.42, al = o.al ?? 0.66, aw = o.aw ?? 0.2, lw = o.lw ?? 0.24;
  M.baseY = leg;
  const body = M.piv('body', 0, leg, 0);
  const torso = M.piv('torso', 0, 0, 0, body, 'YXZ');
  M.add('box', c.body, tw, th, td, 0, th / 2, 0, torso);
  if (o.belt) M.add('box', c.accent, tw + 0.05, 0.1, td + 0.05, 0, 0.1, 0, torso);
  if (o.mossy) { M.add('box', c.accent, tw * 0.7, 0.2, td + 0.1, 0.1, th * 0.75, 0, torso); M.add('box', c.accent, tw * 0.4, 0.3, td + 0.12, -0.2, th * 0.3, 0, torso); }
  const head = M.piv('head', 0, th, 0, torso);
  M.add('box', c.head, hs, hs, hs, 0, hs / 2 + 0.03, 0, head);
  if (o.eyes !== undefined) {
    const em = o.eyeEm ?? 1;
    M.add('box', o.eyes, hs * 0.2, hs * 0.14, 0.04, hs * 0.22, hs * 0.55, hs / 2 + 0.01, head, em);
    M.add('box', o.eyes, hs * 0.2, hs * 0.14, 0.04, -hs * 0.22, hs * 0.55, hs / 2 + 0.01, head, em);
  }
  if (o.hood) { M.add('box', c.hood, hs + 0.1, hs * 0.42, hs + 0.12, 0, hs * 0.9, -0.03, head); M.add('box', c.hood, hs + 0.1, hs * 0.8, 0.1, 0, hs * 0.5, -hs / 2 - 0.04, head); }
  if (o.helm) { M.add('box', c.accent, hs + 0.08, hs * 0.5, hs + 0.08, 0, hs * 0.85, 0, head, 0.25); M.add('cone', c.accent, 0.12, 0.3, 0.12, 0, hs + 0.25, 0, head, 0.25); }
  if (o.crown) for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; M.add('cone', o.crown, 0.09, 0.3, 0.09, Math.sin(a) * hs * 0.4, hs + 0.16, Math.cos(a) * hs * 0.4, head, 0.5); }
  if (o.horns) { for (const s of [1, -1]) { const h = M.add('cone', o.horns, 0.14, 0.5, 0.14, s * hs * 0.5, hs + 0.1, 0, head); h.rotation.z = -s * 0.6; } }
  const mkArm = (name, sx) => {
    const a = M.piv(name, sx * (tw / 2 + aw / 2 + 0.02), th - 0.1, 0, torso, 'YXZ');
    M.add('box', c.limb, aw, al, aw, 0, -al / 2, 0, a);
    M.add('box', c.hand || c.head, aw * 0.95, aw * 0.9, aw * 0.95, 0, -al - 0.04, 0, a, o.emHands ? 0.6 : 0);
    if (o.plates) M.add('box', o.plates, aw + 0.14, aw * 0.8, aw + 0.14, sx * 0.03, 0.02, 0, a, 0.3);
    if (o.weapon === 'claws') for (let i = -1; i <= 1; i++) { const k = M.add('cone', c.accent, 0.05, 0.24, 0.05, i * 0.06, -al - 0.2, 0.03, a, 0.7); k.rotation.x = Math.PI; }
    return a;
  };
  mkArm('armL', 1); const armR = mkArm('armR', -1);
  const mkLeg = (name, sx) => {
    const l = M.piv(name, sx * tw * 0.25, 0, 0, body);
    M.add('box', c.leg || c.limb, lw, leg - 0.12, lw, 0, -(leg - 0.12) / 2, 0, l);
    M.add('box', c.foot || c.accent, lw + 0.02, 0.14, lw + 0.14, 0, -leg + 0.07, 0.05, l);
  };
  mkLeg('legL', 1); mkLeg('legR', -1);
  if (o.scarf) { const s = M.piv('scarf', 0, th - 0.02, -td / 2, torso); M.add('box', o.scarf, tw * 0.7, 0.12, td + 0.1, 0, 0, td / 2, s); M.add('box', o.scarf, 0.2, 0.07, 0.7, 0.08, 0, -0.35, s); }
  if (o.cape) { const cp = M.piv('cape', 0, th - 0.04, -td / 2 - 0.04, torso); const h = th + leg * 0.7; M.add('box', o.cape, tw + 0.16, h, 0.06, 0, -h / 2, 0, cp); }
  const wp = M.piv('weapon', 0, -al - 0.04, 0, armR); wp.rotation.x = -1.0;
  const blade = (bl, bw, col, em) => {
    M.bladeMat = new THREE.MeshLambertMaterial({ color: col, flatShading: true, emissive: em, emissiveIntensity: 1 });
    const b = new THREE.Mesh(GEO.box, M.bladeMat); b.scale.set(0.05, bl, bw); b.position.set(0, -0.14 - bl / 2, 0); b.castShadow = true; wp.add(b);
    M.piv('bladeBase', 0, -0.16, 0, wp); M.piv('bladeTip', 0, -0.16 - bl, 0, wp);
  };
  if (o.weapon === 'sword') { M.add('box', 0x3a3340, 0.07, 0.24, 0.07, 0, 0.02, 0, wp); M.add('box', c.accent, 0.08, 0.06, 0.34, 0, -0.11, 0, wp); blade(o.blade ?? 1.15, 0.15, 0xeef4ff, 0x556070); }
  else if (o.weapon === 'great') { M.add('box', 0x2a2338, 0.09, 0.4, 0.09, 0, 0.06, 0, wp); M.add('box', c.accent, 0.1, 0.08, 0.6, 0, -0.12, 0, wp, 0.4); blade(1.9, 0.3, 0x3a2f58, 0x6a3ab0); }
  else if (o.weapon === 'club') { const k = M.add('cyl', 0x4a3426, 0.26, 1.2, 0.26, 0, -0.6, 0, wp); k.scale.set(0.3, 1.2, 0.3); M.add('sph', c.accent, 0.46, 0.46, 0.46, 0, -1.15, 0, wp, 0.25); }
  else if (o.weapon === 'spear') { M.add('cyl', 0x4a4458, 0.07, 2.2, 0.07, 0, -0.7, 0, wp); const t = M.add('cone', c.accent, 0.18, 0.5, 0.18, 0, -2.0, 0, wp, 0.7); t.rotation.x = Math.PI; }
  if (o.shield) { const sh = M.piv('shield', 0, -al * 0.75, 0.16, M.p.armL); M.add('box', 0x3a3546, 0.7, 0.95, 0.09, 0, 0, 0, sh); M.add('box', o.shield, 0.4, 0.6, 0.04, 0, 0, 0.06, sh, 0.5); }
  M.root.scale.setScalar(o.scale || 1); M.height = (leg + th + hs) * (o.scale || 1);
  return M;
}

const ATTACK_POSES = { h1: 1, h2: 1, v: 1, spin: 1, thrust: 1 };
export function animHumanoid(M, a, dt) {
  const p = M.p, t = a.t, run = a.run || 0, cad = a.cad || 11, o = M.o;
  const sw = Math.sin(t * cad) * run;
  let bodyX = run * 0.14 + (o.hunch || 0), torsoY = 0, torsoX = 0, aLx = -sw * 0.9, aLy = 0, aLz = 0.1, aRx = sw * 0.9, aRy = 0, aRz = -0.1,
    wx = -1.0, lL = sw * 0.95, lR = -sw * 0.95, headX = 0, spin = 0, bodyZ = 0;
  let bob = Math.abs(Math.cos(t * cad)) * 0.06 * run + Math.sin(t * 2.2) * 0.012 * (1 - run);
  if (o.shield) { aLx = -1.1; aLz = -0.25; }
  if (a.air) { lL = 0.55; lR = -0.35; aLx = -0.7; aLz = 0.7; aRx = -0.4; aRz = -0.5; bob = 0; }
  const P = a.pose, k = Math.min(1, Math.max(0, a.ph || 0)), e = k * k * (3 - 2 * k);
  switch (P) {
    case 'h1': aRx = -1.45; aRy = lerp(-1.5, 1.15, e); torsoY = lerp(-0.55, 0.6, e); wx = -0.35; aLx = 0.35; bodyX += 0.12; break;
    case 'h2': aRx = -1.3; aRy = lerp(1.15, -1.5, e); torsoY = lerp(0.6, -0.55, e); wx = -0.35; aLx = 0.35; bodyX += 0.12; break;
    case 'v': aRx = lerp(-3.05, -0.45, e); aRy = 0.05; torsoX = lerp(-0.2, 0.42, e); wx = -0.5; aLx = lerp(-2.7, -0.3, e); break;
    case 'spin': aRx = -1.5; aRy = -0.7; wx = -0.15; spin = e * Math.PI * 2; aLx = -1.2; aLz = 1.2; break;
    case 'thrust': aRx = lerp(-0.5, -1.57, e); aRy = lerp(-0.5, 0, e); wx = lerp(-1.5, 0, e); torsoY = lerp(-0.7, 0.25, e); torsoX = 0.3 * e; aLx = 0.5; break;
    case 'charge': aRx = -0.5; aRy = -0.9; wx = -1.5; torsoY = -0.75; torsoX = 0.15; aLx = -0.9; break;
    case 'guard': aRx = -1.25; aRy = 0.95; wx = -1.95; aLx = -1.1; aLz = -0.5; torsoX = 0.1; break;
    case 'over': aRx = -3.0; aLx = -2.8; torsoX = -0.18; wx = -0.5; break;
    case 'cast': aLx = -2.6; aRx = -2.6; aLz = 0.45; aRz = -0.45; torsoX = -0.12; break;
    case 'hurt': torsoX = -0.5; aLx = -0.8; aRx = -0.8; aLz = 0.9; aRz = -0.9; headX = -0.4; break;
    case 'dodge': torsoX = 0.75; aLx = 1.1; aRx = 1.1; lL = 0.9; lR = -0.7; bob = -0.18; break;
    case 'dead': bodyX = -1.5; bob = -M.baseY * 0.75; lL = 0.2; lR = -0.2; break;
    case 'drink': aLx = -2.4; aLz = -0.4; headX = -0.4; break;
  }
  const s = 1 - Math.exp(-(ATTACK_POSES[P] ? 45 : 16) * dt);
  const ap = (obj, ax, v) => { obj.rotation[ax] += (v - obj.rotation[ax]) * s; };
  ap(p.body, 'x', bodyX); p.body.rotation.y = spin; p.body.position.y += (M.baseY + bob - p.body.position.y) * Math.min(1, s * 1.2);
  ap(p.torso, 'y', torsoY); ap(p.torso, 'x', torsoX);
  ap(p.armL, 'x', aLx); ap(p.armL, 'y', aLy); ap(p.armL, 'z', aLz);
  ap(p.armR, 'x', aRx); ap(p.armR, 'y', aRy); ap(p.armR, 'z', aRz);
  ap(p.weapon, 'x', wx); ap(p.legL, 'x', lL); ap(p.legR, 'x', lR); ap(p.head, 'x', headX);
  if (p.scarf) p.scarf.rotation.x = -0.3 - run * 0.9 + Math.sin(t * 7) * 0.12;
  if (p.cape) p.cape.rotation.x = 0.12 + run * 0.6 + Math.sin(t * 3) * 0.05;
  void bodyZ;
}

// ---------------------------------------------------------------- creatures (Kith, skitters, beast bosses)
export function makeCreature(oIn) {
  const o = { ...oIn }; const M = new Model('creature'); M.o = o;
  if (o.evolved) { if (!o.horns && o.body !== 'bird') o.horns = 1; if (o.body === 'quad') { o.spikes = 1; o.mane = 1; } if (o.body === 'bird') o.crest = 1; }
  const c1 = o.c1, c2 = o.c2, c3 = o.c3, s = o.size || 1;
  const g = M.piv('body', 0, 0, 0);
  const eyes = (parent, y, z, dx, sz = 1) => {
    for (const sx of [1, -1]) {
      if (o.eyeGlow) M.add('box', c3, 0.1 * sz, 0.1 * sz, 0.04, sx * dx, y, z, parent, 1);
      else { M.add('box', 0x15121c, 0.09 * sz, 0.13 * sz, 0.03, sx * dx, y, z, parent); M.add('box', 0xffffff, 0.035 * sz, 0.04 * sz, 0.02, sx * dx + 0.02, y + 0.035 * sz, z + 0.012, parent, 0.6); }
    }
  };
  const ears = (parent, x, y, z) => {
    for (const sx of [1, -1]) {
      if (o.ears === 'point') { const e = M.add('cone', c1, 0.16, 0.3, 0.12, sx * x, y + 0.12, z, parent); e.rotation.z = -sx * 0.25; }
      else if (o.ears === 'long') { const e = M.add('box', c1, 0.1, 0.46, 0.07, sx * x, y + 0.2, z, parent); e.rotation.z = -sx * 0.3; const t = M.add('box', c3, 0.1, 0.12, 0.08, sx * (x + 0.07), y + 0.42, z, parent, 0.5); t.rotation.z = -sx * 0.3; }
      else if (o.ears === 'leaf') { const e = M.add('oct', c2, 0.14, 0.4, 0.26, sx * x, y + 0.16, z, parent); e.rotation.z = -sx * 0.5; }
      else if (o.ears === 'fin') { const e = M.add('box', c3, 0.04, 0.26, 0.24, sx * (x + 0.06), y + 0.04, z - 0.05, parent); e.rotation.z = -sx * 0.4; }
    }
  };
  const horns = (parent, y, z, w) => {
    if (o.horns === 1) { const h = M.add('cone', c3, 0.13, 0.36, 0.13, 0, y + 0.1, z + 0.14, parent, 0.3); h.rotation.x = 0.6; }
    else if (o.horns === 2) for (const sx of [1, -1]) { const a = M.add('box', c2, 0.06, 0.5, 0.06, sx * w, y + 0.26, z, parent); a.rotation.z = -sx * 0.4; const b = M.add('box', c2, 0.05, 0.26, 0.05, sx * (w + 0.16), y + 0.4, z, parent); b.rotation.z = -sx * 1.0; M.add('sph', c3, 0.1, 0.1, 0.1, sx * (w + 0.2), y + 0.55, z, parent, 0.6); }
    else if (o.horns === 3) for (const sx of [1, -1]) { const a = M.add('cone', c3, 0.2, 0.5, 0.2, sx * (w + 0.1), y + 0.1, z - 0.05, parent, 0.3); a.rotation.z = -sx * 1.3; const b = M.add('cone', c3, 0.14, 0.4, 0.14, sx * (w + 0.36), y - 0.06, z + 0.12, parent, 0.3); b.rotation.set(1.2, 0, -sx * 0.4); }
  };
  let tailAt;
  if (o.body === 'quad') {
    const bw = o.wide ? 0.86 : 0.6, bh = o.tall ? 0.56 : 0.5, bl = o.wide ? 0.95 : 1.0, lh = o.tall ? 0.66 : (o.wide ? 0.28 : 0.4);
    M.baseY = lh; g.position.y = lh;
    M.add('box', c1, bw, bh, bl, 0, bh / 2, 0, g); M.add('box', c2, bw * 0.84, bh * 0.3, bl * 0.84, 0, 0.02, 0, g);
    const head = M.piv('head', 0, bh * 0.72, bl / 2 - 0.05, g);
    M.add('box', c1, 0.5, 0.44, 0.46, 0, 0.1, 0.2, head); M.add('box', c2, 0.28, 0.18, 0.2, 0, 0, 0.47, head); M.add('box', 0x15121c, 0.1, 0.07, 0.04, 0, 0.06, 0.575, head);
    eyes(head, 0.18, 0.435, 0.15); ears(head, 0.17, 0.3, 0.12); horns(head, 0.3, 0.2, 0.16);
    if (o.mane) M.add('box', c2, 0.72, 0.62, 0.3, 0, 0.1, -0.06, head);
    let i = 0; for (const sz of [1, -1]) for (const sx of [1, -1]) { const l = M.piv('l' + i++, sx * (bw / 2 - 0.12), 0.02, sz * (bl / 2 - 0.16), g); M.add('box', c1, 0.17, lh, 0.17, 0, -lh / 2, 0, l); M.add('box', c2, 0.19, 0.08, 0.22, 0, -lh + 0.04, 0.03, l); }
    if (o.spikes) for (let k = 0; k < 4; k++) M.add('cone', c3, 0.16, 0.3, 0.16, 0, bh + 0.12, bl * 0.34 - k * bl * 0.23, g, 0.35);
    if (o.shell) M.add('sph', c3, bw * 1.1, 0.62, bl * 0.95, 0, bh + 0.05, -0.02, g, 0.2);
    tailAt = [0, bh * 0.75, -bl / 2];
  } else if (o.body === 'biped') {
    M.baseY = 0.3; g.position.y = 0.3;
    M.add('box', c1, 0.6, 0.7, 0.5, 0, 0.35, 0, g); M.add('box', c2, 0.44, 0.5, 0.06, 0, 0.3, 0.26, g);
    const head = M.piv('head', 0, 0.7, 0, g);
    M.add('box', c1, 0.56, 0.48, 0.5, 0, 0.24, 0.02, head); M.add('box', c3, 0.22, 0.1, 0.16, 0, 0.14, 0.32, head);
    eyes(head, 0.3, 0.275, 0.15); ears(head, 0.24, 0.36, 0); horns(head, 0.5, 0.05, 0.14);
    for (const sx of [1, -1]) { const a = M.piv(sx > 0 ? 'armL' : 'armR', sx * 0.36, 0.5, 0, g); M.add('box', c1, 0.14, 0.36, 0.2, 0, -0.18, 0, a); }
    let i = 0; for (const sx of [1, -1]) { const l = M.piv('l' + i++, sx * 0.16, 0, 0, g); M.add('box', c1, 0.18, 0.3, 0.2, 0, -0.15, 0, l); M.add('box', c3, 0.22, 0.07, 0.32, 0, -0.27, 0.07, l); }
    tailAt = [0, 0.15, -0.25];
  } else if (o.body === 'bird') {
    M.baseY = 1.25; g.position.y = 1.25; M.hover = true;
    M.add('box', c1, 0.46, 0.42, 0.7, 0, 0, 0, g); M.add('box', c2, 0.36, 0.2, 0.56, 0, -0.13, 0.02, g);
    const head = M.piv('head', 0, 0.18, 0.36, g);
    M.add('box', c1, 0.38, 0.36, 0.36, 0, 0.1, 0.1, head);
    if (!o.ray) { const b = M.add('cone', c3, 0.16, 0.26, 0.16, 0, 0.06, 0.4, head); b.rotation.x = Math.PI / 2; }
    eyes(head, 0.16, 0.285, 0.12);
    if (o.crest) { const cr = M.add('cone', c3, 0.14, 0.4, 0.1, 0, 0.42, 0, head, 0.4); cr.rotation.x = -0.5; }
    if (o.moth) for (const sx of [1, -1]) { const an = M.add('box', c2, 0.03, 0.4, 0.03, sx * 0.1, 0.44, 0.2, head); an.rotation.z = -sx * 0.4; }
    const ww = o.moth ? 0.95 : o.ray ? 1.05 : 0.8, wd = o.moth ? 0.8 : o.ray ? 0.8 : 0.46;
    for (const sx of [1, -1]) {
      const w = M.piv(sx > 0 ? 'wingL' : 'wingR', sx * 0.23, 0.08, 0, g);
      M.add('box', o.moth ? c2 : c1, ww, 0.05, wd, sx * (ww / 2 + 0.02), 0, 0, w);
      M.add('box', o.moth ? c3 : c2, ww * 0.45, 0.04, wd * 0.7, sx * (ww + 0.14), 0, -0.04, w, o.moth ? 0.5 : 0);
    }
    tailAt = [0, 0, -0.35];
  } else { // blob
    M.baseY = 0; M.add('sph', c1, 0.92, 0.76, 0.92, 0, 0.4, 0, g); M.add('sph', c2, 0.6, 0.4, 0.3, 0, 0.3, 0.34, g);
    const head = M.piv('head', 0, 0.42, 0.36, g);
    eyes(head, 0.1, 0.1, 0.16, 1.2);
    for (const sx of [1, -1]) M.add('sph', c3, 0.12, 0.08, 0.06, sx * 0.3, -0.03, 0.02, head);
    const top = M.piv('top', 0, 0.48, -0.36, g); ears(top, 0.2, 0.28, 0.3); horns(top, 0.3, 0.3, 0.14);
    let i = 0; for (const sx of [1, -1]) { const l = M.piv('l' + i++, sx * 0.24, 0.06, 0.12, g); M.add('box', c2, 0.22, 0.12, 0.3, 0, 0, 0.05, l); }
    tailAt = [0, 0.42, -0.42];
  }
  const tail = M.piv('tail', tailAt[0], tailAt[1], tailAt[2], g);
  switch (o.tail) {
    case 'stub': M.add('box', c1, 0.14, 0.14, 0.22, 0, 0, -0.1, tail); break;
    case 'flame': { M.add('box', c1, 0.1, 0.1, 0.3, 0, 0.02, -0.14, tail); const f = M.add('cone', c3, 0.3, 0.6, 0.3, 0, 0.26, -0.34, tail, 0.95); f.rotation.x = -0.4; const f2 = M.add('cone', 0xff5a1a, 0.4, 0.4, 0.4, 0, 0.1, -0.34, tail, 0.8); f2.rotation.x = -0.4; break; }
    case 'leaf': { const l = M.add('oct', c2, 0.34, 0.07, 0.56, 0, 0.06, -0.26, tail); l.rotation.x = 0.4; break; }
    case 'fin': M.add('box', c3, 0.05, 0.42, 0.42, 0, 0.08, -0.26, tail); break;
    case 'bolt': M.add('box', c3, 0.07, 0.1, 0.34, 0, 0.06, -0.16, tail, 0.6); M.add('box', c3, 0.07, 0.34, 0.1, 0, 0.2, -0.32, tail, 0.6); M.add('box', c3, 0.07, 0.12, 0.34, 0, 0.36, -0.46, tail, 0.6); break;
    case 'fan': for (let i = -1; i <= 1; i++) { const f = M.add('box', c2, 0.16, 0.03, 0.5, i * 0.14, 0, -0.26, tail); f.rotation.y = -i * 0.35; } break;
    case 'whip': M.add('box', c3, 0.05, 0.05, 1.1, 0, 0, -0.55, tail, 0.4); break;
    case 'multi': for (let i = -1; i <= 1; i++) { const f = M.add('cone', i ? c2 : c3, 0.2, 0.7, 0.2, i * 0.22, 0.22, -0.3, tail, i ? 0 : 0.5); f.rotation.set(-0.9, 0, -i * 0.4); } break;
  }
  M.root.scale.setScalar(s); M.height = (M.baseY + 0.9) * s;
  return M;
}

export function animCreature(M, a, dt) {
  const p = M.p, o = M.o, t = a.t, run = a.run || 0, cad = o.body === 'quad' ? 14 : 11;
  const sw = Math.sin(t * cad) * run;
  let by = M.baseY, bx = 0, hx = Math.sin(t * 1.7) * 0.06, bz = 0;
  if (o.body === 'blob') {
    const hop = Math.abs(Math.sin(t * (3.5 + run * 5))); by = hop * (0.08 + 0.3 * run);
    const sq = 1 - 0.16 * (1 - hop) * (0.5 + run); p.body.scale.set(1 + (1 - sq) * 0.6, sq, 1 + (1 - sq) * 0.6);
  } else if (o.body === 'bird') {
    by = M.baseY + Math.sin(t * 3) * 0.12; const fl = Math.sin(t * (o.ray ? 4 : 9 + run * 6)) * (o.ray ? 0.4 : 0.7);
    p.wingL.rotation.z = fl; p.wingR.rotation.z = -fl; bx = run * 0.2;
  } else if (o.body === 'quad') {
    by = M.baseY + Math.abs(Math.cos(t * cad)) * 0.05 * run;
    p.l0.rotation.x = sw * 0.9; p.l3.rotation.x = sw * 0.9; p.l1.rotation.x = -sw * 0.9; p.l2.rotation.x = -sw * 0.9;
  } else {
    by = M.baseY + Math.abs(Math.cos(t * cad)) * 0.05 * run;
    p.l0.rotation.x = sw; p.l1.rotation.x = -sw; p.armL.rotation.x = -sw * 0.8; p.armR.rotation.x = sw * 0.8;
  }
  if (p.tail) p.tail.rotation.y = Math.sin(t * (5 + run * 6)) * 0.5;
  if (a.pose === 'atk' || a.pose === 'h1' || a.pose === 'h2' || a.pose === 'v' || a.pose === 'thrust') { const k = Math.sin(Math.min(1, a.ph || 0) * Math.PI); bx += k * 0.45; bz = k * 0.45; hx -= k * 0.4; }
  else if (a.pose === 'charge' || a.pose === 'over') { bx -= 0.3; hx -= 0.3; bz = -0.2; }
  else if (a.pose === 'cast') { by += 0.2; hx -= 0.6; }
  else if (a.pose === 'hurt') { bx -= 0.4; }
  else if (a.pose === 'dead') { bx = 0; p.body.rotation.z = damp(p.body.rotation.z, 1.5, 8, dt); by = M.hover ? 0.3 : by; }
  p.body.position.y = damp(p.body.position.y, by, 20, dt); p.body.position.z = damp(p.body.position.z, bz, 20, dt);
  p.body.rotation.x = damp(p.body.rotation.x, bx, 14, dt); if (p.head) p.head.rotation.x = damp(p.head.rotation.x, hx, 10, dt);
}

// ---------------------------------------------------------------- straw training dummy (Brannoc's practice yard)
function makeDummy(shield) {
  const M = new Model('dummy'), wood = 0x6b4a2b, straw = 0xd8b45a, sack = 0xb89a6a;
  const b = M.piv('body', 0, 0, 0);
  M.add('cyl', wood, 0.16, 1.0, 0.16, 0, 0.5, 0, b);
  M.add('cyl', straw, 0.62, 0.85, 0.62, 0, 1.38, 0, b); M.add('box', 0x8a5a34, 0.66, 0.1, 0.66, 0, 1.05, 0, b);
  M.add('box', wood, 1.5, 0.12, 0.12, 0, 1.6, 0, b);
  M.add('sph', sack, 0.52, 0.52, 0.52, 0, 2.03, 0, b);
  for (const sx of [1, -1]) M.add('box', 0x3a2a1a, 0.08, 0.08, 0.04, sx * 0.1, 2.08, 0.25, b);
  if (shield) { M.add('box', 0x6a4a2a, 0.95, 1.05, 0.12, 0, 1.4, 0.42, b); M.add('box', 0xbfc7d0, 0.5, 0.62, 0.06, 0, 1.4, 0.5, b, 0.2); }
  M.height = 2.3; return M;
}
function animDummy(M, a, dt) {
  const b = M.p.body, tx = a.pose === 'dead' ? -1.4 : 0, tz = a.pose === 'hurt' ? Math.sin(a.t * 30) * 0.22 : 0;
  b.rotation.x = damp(b.rotation.x, tx, 10, dt); b.rotation.z = damp(b.rotation.z, tz, 18, dt);
}

// ---------------------------------------------------------------- spitter (rooted turret plant)
export function makeSpitter(col, scale = 1) {
  const M = new Model('spitter'); const dk = 0x2a2634, dk2 = 0x1c1924;
  M.add('cyl', dk2, 0.8, 0.3, 0.8, 0, 0.15, 0);
  const st = M.piv('stalk', 0, 0.3, 0); M.add('cyl', dk, 0.22, 1.0, 0.22, 0, 0.5, 0, st);
  const head = M.piv('head', 0, 1.05, 0, st);
  M.add('sph', dk, 0.72, 0.66, 0.72, 0, 0.1, 0, head); M.add('sph', col, 0.4, 0.34, 0.3, 0, 0.08, 0.26, head, 0.8);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const pt = M.add('cone', col, 0.2, 0.5, 0.08, Math.cos(a) * 0.36, 0.1 + Math.sin(a) * 0.36, -0.1, head, 0.3); pt.rotation.z = a - Math.PI / 2; }
  M.root.scale.setScalar(scale); M.height = 1.7 * scale; return M;
}
function animSpitter(M, a, dt) {
  const p = M.p; let sx = Math.sin(a.t * 1.6) * 0.1, hx = 0;
  if (a.pose === 'charge') { sx = -0.4; hx = -0.3; } else if (a.pose === 'atk') { const k = Math.sin(Math.min(1, a.ph || 0) * Math.PI); sx = 0.45 * k; hx = 0.2 * k; }
  else if (a.pose === 'dead') { sx = 1.4; }
  p.stalk.rotation.x = damp(p.stalk.rotation.x, sx, 16, dt); p.head.rotation.x = damp(p.head.rotation.x, hx, 16, dt);
  p.stalk.rotation.z = Math.sin(a.t * 1.1) * 0.06;
}

// ---------------------------------------------------------------- wraith (floating robe)
export function makeWraith(col, o = {}) {
  const M = new Model('wraith'); const base = o.base ?? 0x1a1626; M.o = o; M.hover = true;
  const g = M.piv('body', 0, 1.0, 0); M.baseY = 1.0;
  M.add('cone', base, 1.0, 1.6, 1.0, 0, 0, 0, g);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const tt = M.add('cone', base, 0.3, 0.5, 0.3, Math.cos(a) * 0.36, -0.9, Math.sin(a) * 0.36, g); tt.rotation.x = Math.PI; }
  const head = M.piv('head', 0, 0.82, 0, g);
  M.add('sph', base, 0.56, 0.6, 0.56, 0, 0.1, 0, head); M.add('box', col, 0.3, 0.09, 0.05, 0, 0.12, 0.26, head, 1);
  if (o.crown) for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; M.add('cone', o.crown, 0.08, 0.34, 0.08, Math.cos(a) * 0.24, 0.5, Math.sin(a) * 0.24, head, 0.7); }
  for (const sx of [1, -1]) { const a = M.piv(sx > 0 ? 'armL' : 'armR', sx * 0.4, 0.5, 0, g, 'YXZ'); M.add('box', base, 0.12, 0.7, 0.12, 0, -0.35, 0, a); M.add('box', col, 0.1, 0.12, 0.1, 0, -0.74, 0, a, 0.8); }
  const wp = M.piv('weapon', 0, -0.74, 0, M.p.armR); wp.rotation.x = -0.6;
  if (o.staff) { M.add('cyl', 0xd8f6ff, 0.06, 2.0, 0.06, 0, -0.3, 0, wp); M.add('oct', col, 0.36, 0.5, 0.36, 0, -1.4, 0, wp, 1); }
  else M.add('box', col, 0.05, 1.1, 0.16, 0, -0.6, 0, wp, 0.7);
  M.root.scale.setScalar(o.scale || 1); M.height = 2.1 * (o.scale || 1); return M;
}
function animWraith(M, a, dt) {
  const p = M.p, t = a.t; let aRx = -0.5 + Math.sin(t * 2) * 0.1, aRy = 0, aLx = -0.5 + Math.cos(t * 2) * 0.1, bx = (a.run || 0) * 0.25, aLz = 0.2;
  const k = Math.min(1, a.ph || 0), e = k * k * (3 - 2 * k);
  switch (a.pose) {
    case 'h1': case 'thrust': aRx = -1.45; aRy = lerp(-1.5, 1.2, e); break;
    case 'h2': aRx = -1.4; aRy = lerp(1.2, -1.5, e); break;
    case 'v': aRx = lerp(-3, -0.4, e); break;
    case 'charge': aRx = -1.2; aRy = -1.3; break;
    case 'over': case 'cast': aRx = -2.8; aLx = -2.8; aLz = 0.5; break;
    case 'hurt': bx = -0.4; break;
    case 'dead': bx = 1.3; break;
  }
  const s = 1 - Math.exp(-30 * dt);
  p.armR.rotation.x += (aRx - p.armR.rotation.x) * s; p.armR.rotation.y += (aRy - p.armR.rotation.y) * s;
  p.armL.rotation.x += (aLx - p.armL.rotation.x) * s; p.armL.rotation.z += (aLz - p.armL.rotation.z) * s;
  p.body.rotation.x = damp(p.body.rotation.x, bx, 10, dt);
  p.body.position.y = damp(p.body.position.y, a.pose === 'dead' ? 0.3 : M.baseY + Math.sin(t * 2.4) * 0.14, 12, dt);
}


// ---------------------------------------------------------------- custom 2D sprites (see CUSTOMIZE.md)
// A character with an entry in assets/art.json is drawn as a camera-facing sprite instead of the
// built-in blocky model. Sheets are `frames` columns wide and 1 or 4 rows tall (down, left, right, up).
const shadowGeo = new THREE.CircleGeometry(0.5, 20).rotateX(-Math.PI / 2), _fc = new THREE.Color();
function makeSpriteModel(d, o = {}) {
  const M = new Model('sprite'); M.def = d;
  const h = d.height || o.height || 1.8, w = h * d.aspect, hover = d.hover || o.hover || 0;
  const tex = d.tex.clone(); tex.needsUpdate = true; tex.repeat.set(1 / d.frames, 1 / d.rows); tex.offset.set(0, 1 - 1 / d.rows);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.35 }); M.spriteMat = mat;
  M.tint = new THREE.Color(0xffffff); if (o.tint) M.tint.lerp(new THREE.Color(o.tint), 0.2); mat.color.copy(M.tint);
  const sp = new THREE.Sprite(mat); sp.center.set(0.5, 0); sp.scale.set(w, h, 1); sp.position.y = hover; M.root.add(sp); M.sprite = sp; M.hoverY = hover;
  M.shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false });
  const sh = new THREE.Mesh(shadowGeo, M.shadowMat); sh.scale.setScalar(Math.max(0.5, w * 0.75)); sh.position.y = 0.06; sh.renderOrder = 1; M.root.add(sh);
  M.height = h + hover; M.baseY = 0; M.hover = hover > 0;
  if (o.blade) addSwingBlade(M, h);
  M.tick = function (dt) {
    if (this.flash > 0 || this._fl) { this.flash = Math.max(0, this.flash - dt * 5); this._fl = this.flash > 0; }
    mat.color.copy(this.tint).multiplyScalar(G.light || 1); if (this._fl) mat.color.lerp(_fc.copy(this.flashCol).multiplyScalar(3), this.flash * 0.8);
  };
  M.dispose = function () { tex.dispose(); mat.dispose(); this.shadowMat.dispose(); if (this.bladeMat) this.bladeMat.dispose(); if (this.xray) this.xray.material.dispose(); };
  return M;
}
function animSprite(M, a, dt) {
  const d = M.def, tex = M.spriteMat.map, rel = angDiff(G.cam ? G.cam.yaw : 0, M.root.rotation.y);
  let row = 0, flip = 1;
  if (d.rows === 4) row = Math.abs(rel) < 0.79 ? 0 : Math.abs(rel) > 2.36 ? 3 : rel > 0 ? 2 : 1;
  else if (d.faces === 'right') flip = rel < 0 ? -1 : 1;
  const moving = (a.run || 0) > 0.15 || M.hover || a.air;
  const col = moving && a.pose !== 'dead' ? Math.floor(a.t * d.fps) % d.frames : 0;
  tex.repeat.x = flip / d.frames; tex.offset.set((flip > 0 ? col : col + 1) / d.frames, 1 - (row + 1) / d.rows);
  const rot = a.pose === 'dead' ? 1.45 : a.pose === 'hurt' ? Math.sin(a.t * 40) * 0.14 : a.pose === 'dodge' ? -0.5 * flip : 0;
  M.spriteMat.rotation = damp(M.spriteMat.rotation, rot, 14, dt);
  M.sprite.position.y = M.hoverY + (M.hover ? Math.sin(a.t * 2.6) * 0.12 : 0);
  if (M.xray) { M.xray.position.y = M.sprite.position.y; M.xray.material.rotation = M.spriteMat.rotation; }
  if (M.blade) animSwing(M, a);
}

// An invisible sword arm, so art without a sword of its own still shows a blade and a trail on swings.
const newBladeMat = () => new THREE.MeshLambertMaterial({ color: 0xeef4ff, flatShading: true, emissive: 0x556070 });
function addSwingBlade(M, h, hidden) {
  const arm = M.piv('swing', 0, h * 0.5, 0, M.root, 'YXZ');
  M.bladeMat ||= newBladeMat();
  const b = new THREE.Mesh(GEO.box, M.bladeMat); b.scale.set(0.07, 0.18, 1.25); b.position.set(0, 0, 1.05); b.visible = false; arm.add(b); M.blade = b; M.bladeHidden = !!hidden;
  M.piv('bladeBase', 0, 0, 0.45, arm); M.piv('bladeTip', 0, 0, 1.7, arm);
}
function animSwing(M, a) {
  const k = Math.min(1, Math.max(0, a.ph || 0)), e = k * k * (3 - 2 * k); let vis = true, ax = 0, ay = 0;
  switch (a.pose) {
    case 'h1': ay = lerp(-1.5, 1.15, e); break;
    case 'h2': ay = lerp(1.15, -1.5, e); break;
    case 'v': ax = lerp(-1.6, 0.5, e); break;
    case 'spin': ay = e * Math.PI * 2; break;
    case 'thrust': ax = 0; break;
    case 'over': ax = -1.6; break;
    case 'charge': ay = -1.4; break;
    case 'guard': ay = 0.9; ax = -0.9; break;
    default: vis = false;
  }
  M.blade.visible = vis && !M.bladeHidden; M.p.swing.rotation.set(ax, ay, 0);
}

// ---------------------------------------------------------------- custom 3D models (see CUSTOMIZE.md)
// A character with an entry under "models" in assets/art.json is drawn with that .glb / .gltf file,
// scaled to its height with its feet on the ground. Animations are picked by name for each game pose;
// anything the file has no animation for falls back to a simple lean, bob or tip-over.
const POSE_CLIPS = {
  idle: ['idle', 'stand', 'breathe'], run: ['run', 'walk', 'move'], air: ['jump', 'fall', 'air'],
  h1: ['slash', 'attack'], h2: ['slash2', 'backslash', 'slash', 'attack'], v: ['overhead', 'chop', 'attack'],
  spin: ['spin', 'attack'], thrust: ['thrust', 'stab', 'attack'], atk: ['attack', 'bite', 'slash'],
  over: ['overhead', 'charge', 'attack'], charge: ['charge', 'windup'], cast: ['cast', 'roar', 'attack'],
  guard: ['guard', 'block'], dodge: ['dodge', 'roll', 'dash'], hurt: ['hurt', 'hit'], dead: ['die', 'death', 'dead'], drink: ['drink', 'use'],
};
const SCRUB = { h1: 1, h2: 1, v: 1, spin: 1, thrust: 1, atk: 1 };   // played in step with the swing itself
const clipKey = (n) => n.split('|').pop().toLowerCase().replace(/[^a-z0-9]/g, '');
const _tc = new THREE.Color();
function makeGlbModel(d, o = {}) {
  const M = new Model('glb'); M.def = d;
  const h = d.height || o.height || 1.8, hover = d.hover || o.hover || 0;
  const body = M.piv('body', 0, 0, 0), fit = new THREE.Group(), obj = ART.cloneModel(d.scene), s = h / Math.max(0.01, d.size.y);
  fit.scale.setScalar(s); fit.rotation.y = d.turn; fit.position.y = hover - d.min.y * s; fit.add(obj); body.add(fit);
  M.height = h + hover; M.baseY = hover; M.hover = hover > 0;
  if (o.blade) M.bladeMat = newBladeMat();
  // Materials become the game's matte style (keeping colours and textures) so models sit in the world
  // and flash when hit. A material whose name starts with "Blade" glows with the hero's element.
  const conv = new Map(), tint = d.tint && o.tint !== undefined ? _tc.set(o.tint) : null;
  const one = (m) => {
    if (conv.has(m)) return conv.get(m);
    let r;
    if (o.blade && /^blade/i.test(m.name || '')) r = M.bladeMat;
    else {
      r = new THREE.MeshLambertMaterial({ name: m.name, map: m.map || null, emissiveMap: m.emissiveMap || null, alphaMap: m.alphaMap || null, normalMap: m.normalMap || null, aoMap: m.aoMap || null,
        vertexColors: !!m.vertexColors, transparent: !!m.transparent, opacity: m.opacity ?? 1, alphaTest: m.alphaTest || 0, side: m.side ?? THREE.FrontSide, flatShading: !!m.flatShading });
      if (m.color) r.color.copy(m.color); if (m.emissive) r.emissive.copy(m.emissive); r.emissiveIntensity = m.emissiveIntensity ?? 1;
      if (m.normalMap && m.normalScale) r.normalScale.copy(m.normalScale);
      if (tint) r.color.lerp(tint, 0.15);
      r.userData.em = r.emissive.clone(); M.mats.push(r);
    }
    conv.set(m, r); return r;
  };
  obj.traverse((n) => {
    if (!n.isMesh) return;
    n.castShadow = true; if (n.isSkinnedMesh) n.frustumCulled = false;
    n.material = Array.isArray(n.material) ? n.material.map(one) : one(n.material);
  });
  // Sword trail: empties named BladeBase and BladeTip (parented to the hand) mark the model's own
  // sword. Without them the hero gets the same swinging blade that sprites use.
  if (o.blade) {
    const base = obj.getObjectByName('BladeBase'), tip = obj.getObjectByName('BladeTip');
    if (base && tip) { M.p.bladeBase = base; M.p.bladeTip = tip; } else addSwingBlade(M, h, !d.blade);
  }
  if (d.anims.length) {
    const mixer = M.mixer = new THREE.AnimationMixer(obj), byKey = {}, acts = new Map();
    for (const c of d.anims) byKey[clipKey(c.name)] ??= c;
    const find = (pose) => {
      const want = d.clips[pose]; if (want) { const c = d.anims.find((x) => x.name === want) || byKey[clipKey(want)]; if (c) return c; }
      for (const n of POSE_CLIPS[pose]) if (byKey[n]) return byKey[n];
      return null;
    };
    M.clipFor = {}; M.w = new Map();
    for (const pose of Object.keys(POSE_CLIPS)) {
      const c = find(pose); if (!c) continue;
      let act = acts.get(c);
      if (!act) {
        act = mixer.clipAction(c); acts.set(c, act);
        if (pose === 'idle' || pose === 'run') act.play(); else { act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = true; }
        act.setEffectiveWeight(0);
      }
      M.clipFor[pose] = act;
    }
    M.acts = [...acts.values()];
  }
  M.dispose = function () { if (this.mixer) { this.mixer.stopAllAction(); this.mixer.uncacheRoot(obj); } for (const m of this.mats) m.dispose(); if (this.bladeMat) this.bladeMat.dispose(); };
  return M;
}
function animGlb(M, a, dt) {
  const d = M.def, pose = a.pose || null, run = a.run || 0, t = a.t, k = Math.min(1, Math.max(0, a.ph || 0));
  M.runS = damp(M.runS || 0, run, 10, dt);
  let act = null;
  if (M.mixer) {
    const C = M.clipFor; act = (pose && C[pose]) || (!pose && a.air && C.air) || null;
    if (act) {
      const hold = SCRUB[pose] ? k : pose === 'over' && act === C.v ? 0 : -1;   // 'over' holds the raised sword
      if (hold >= 0) { if (!act.isScheduled()) act.play(); act.paused = true; act.enabled = true; act.time = hold * act.getClip().duration; }
      else if (act !== M.cur || M.curPose !== pose) { act.reset(); act.timeScale = d.speed; act.play(); }
    }
    M.cur = act; M.curPose = pose;
    // blend weights: the pose's own clip, or idle and run mixed by speed; each fades toward its target
    const r = C.run ? M.runS : 0, rate = act && SCRUB[pose] ? 30 : 12; let sum = 0;
    for (const x of M.acts) {
      let target = 0;
      if (act) target = x === act ? 1 : 0;
      else { if (x === C.idle) target += 1 - r; if (x === C.run) target += r; }
      const w = damp(M.w.get(x) || 0, target, rate, dt); M.w.set(x, w); sum += w;
    }
    for (const x of M.acts) { const w = (M.w.get(x) || 0) / Math.max(1, sum); x.enabled = w > 0.002 || x === act; x.setEffectiveWeight(w); }
    if (C.idle) C.idle.timeScale = d.speed;
    if (C.run) C.run.timeScale = d.speed * (0.45 + 0.65 * M.runS);
    M.mixer.update(dt);
  }
  // simple motion for whatever the file has no animation for
  const own = !!act || (!pose && M.mixer && (M.runS > 0.15 ? M.clipFor.run : M.clipFor.idle));
  let lean = 0, y = 0, spin = 0;
  if (!own) {
    const e = k * k * (3 - 2 * k);
    switch (pose) {
      case 'dead': lean = -1.45; y = -M.baseY * 0.8; break;
      case 'hurt': lean = -0.35; break;
      case 'dodge': lean = 0.5; y = -0.1; break;
      case 'spin': spin = e * Math.PI * 2; lean = 0.15; break;
      case 'h1': case 'h2': case 'v': case 'thrust': case 'atk': lean = Math.sin(k * Math.PI) * 0.35; break;
      case 'charge': case 'over': lean = -0.25; break;
      case 'cast': lean = -0.3; y = 0.2; break;
      case 'guard': lean = 0.12; break;
      default: lean = 0.12 * M.runS; y = Math.abs(Math.sin(t * 11)) * 0.1 * M.runS + Math.sin(t * 2.2) * 0.015 * (1 - M.runS);
    }
  }
  if (M.hover && pose !== 'dead') y += Math.sin(t * 2.6) * 0.12;
  const p = M.p.body; p.rotation.x = damp(p.rotation.x, lean, 14, dt); p.rotation.y = spin; p.position.y = damp(p.position.y, y, 14, dt);
  if (M.blade) animSwing(M, a);
}
const SPRITE_H = { husk: 1.9, skitter: 0.8, spitter: 1.7, brute: 3.1, warder: 2.2, wraith: 2.1, ghorn: 5, cindermaw: 4, brine: 4, skarn: 3, king: 4.4, sable: 2 };
// A model listed in art.json wins over a sprite, which wins over the built-in blocky model.
function spriteFor(key, o) { const g = ART.models[key]; if (g) return makeGlbModel(g, o); const d = ART.sprites[key]; return d ? makeSpriteModel(d, o) : null; }

// A flat silhouette that shows wherever the hero is hidden behind a tree, wall or creature.
export function addXray(M) {
  if (M.kind === 'sprite') {
    const sm = new THREE.SpriteMaterial({ map: M.spriteMat.map, color: 0x8fd8ff, transparent: true, opacity: 0.55, alphaTest: 0.35, depthFunc: THREE.GreaterDepth, depthWrite: false });
    const s = new THREE.Sprite(sm); s.center.copy(M.sprite.center); s.scale.copy(M.sprite.scale); s.renderOrder = 1; M.sprite.renderOrder = 2; M.root.add(s); M.xray = s; return;
  }
  const mat = new THREE.MeshBasicMaterial({ color: 0x8fd8ff, depthFunc: THREE.GreaterDepth, depthWrite: false, fog: false });
  const list = []; M.root.traverse((o) => { if (o.isMesh) list.push(o); });
  for (const o of list) {
    o.renderOrder = 2;
    const x = o.isSkinnedMesh ? new THREE.SkinnedMesh(o.geometry, mat) : new THREE.Mesh(o.geometry, mat);
    if (o.isSkinnedMesh) { x.bind(o.skeleton, o.bindMatrix); x.frustumCulled = false; }
    x.renderOrder = 1; o.add(x);
  }
}

export function animate(M, a, dt) {
  switch (M.kind) {
    case 'sprite': animSprite(M, a, dt); break;
    case 'glb': animGlb(M, a, dt); break;
    case 'humanoid': animHumanoid(M, a, dt); break;
    case 'creature': animCreature(M, a, dt); break;
    case 'spitter': animSpitter(M, a, dt); break;
    case 'wraith': animWraith(M, a, dt); break;
    case 'dummy': animDummy(M, a, dt); break;
  }
  M.tick(dt);
}

// ---------------------------------------------------------------- factories
export function makePlayerModel() {
  return spriteFor('player', { height: 1.9, blade: true }) || makeHumanoid({
    colors: { body: 0x2f3f6a, head: 0xf0cfa8, limb: 0x26335a, accent: 0xffd98a, hood: 0x1f2a4a, leg: 0x1c2440, foot: 0x4a3426, hand: 0xf0cfa8 },
    eyes: 0x1a1a22, eyeEm: 0, hood: 1, scarf: 0xd0412f, belt: 1, weapon: 'sword',
  });
}
export function makeNpcModel(look, id) {
  const M = spriteFor('npc.' + id, { height: 1.9 }) || makeHumanoid({ colors: { ...look, hand: look.head }, eyes: 0x1a1a22, eyeEm: 0, hood: look.hood ? 1 : 0, belt: 1 });
  return M;
}
export function makeKithModel(species, evolved, scaleMul = 1) {
  const s = KITH[species], h = s.m.size * 1.15 * scaleMul, hover = s.m.body === 'bird' ? 0.9 : 0;
  const sp = (evolved && spriteFor('kith.' + species + '.evo', { height: h * 1.3, hover })) || spriteFor('kith.' + species, { height: h * (evolved ? 1.3 : 1), hover });
  if (sp) return sp;
  return makeCreature({ ...s.m, size: s.m.size * (evolved ? 1.32 : 1) * scaleMul, evolved });
}
export function makeEnemyModel(type, el, elite) {
  const c = EL[el].color, dk = 0x2a2634, dk2 = 0x1c1924, mid = 0x3a3546;
  const sp = spriteFor('enemy.' + type, { height: (SPRITE_H[type] || 1.9) * (elite ? 1.3 : 1), tint: c, hover: type === 'wraith' ? 0.5 : 0 }); if (sp) return sp;
  switch (type) {
    case 'husk': return makeHumanoid({ scale: elite ? 1.3 : 1, colors: { body: dk, head: dk2, limb: mid, accent: c, hand: c }, eyes: c, weapon: 'claws', tw: 0.5, aw: 0.16, al: 0.82, hunch: 0.25, emHands: 1 });
    case 'brute': return makeHumanoid({ scale: elite ? 2.05 : 1.7, colors: { body: dk, head: dk2, limb: mid, accent: c }, eyes: c, weapon: 'club', tw: 0.98, th: 0.82, td: 0.6, aw: 0.34, al: 0.86, lw: 0.32, leg: 0.66, hs: 0.38, plates: c });
    case 'warder': return makeHumanoid({ scale: elite ? 1.4 : 1.15, colors: { body: mid, head: dk2, limb: dk, accent: c }, eyes: c, weapon: 'spear', shield: c, helm: 1 });
    case 'skitter': return makeCreature({ body: 'quad', size: elite ? 0.85 : 0.62, wide: 1, c1: dk, c2: dk2, c3: c, spikes: 1, tail: 'stub', eyeGlow: 1 });
    case 'spitter': return makeSpitter(c, elite ? 1.35 : 1);
    case 'wraith': return makeWraith(c, { scale: elite ? 1.35 : 1 });
    case 'dummy': return makeDummy(false);
    case 'shielddummy': return makeDummy(true);
    case 'spar': return spriteFor('npc.smith', { height: 1.9 }) || makeHumanoid({ colors: { body: 0x7a4a2a, head: 0xc89a78, limb: 0x8a5a3a, accent: 0x3a3340, hand: 0xc89a78 }, eyes: 0x1a1a22, eyeEm: 0, belt: 1, weapon: 'club' });
  }
  return makeHumanoid({ colors: { body: dk, head: dk2, limb: mid, accent: c }, eyes: c });
}
export function makeBossModel(id) {
  const sp = spriteFor('boss.' + id, { height: SPRITE_H[id] || 4, hover: id === 'brine' ? 0.6 : 0 }); if (sp) return sp;
  switch (id) {
    case 'ghorn': return makeHumanoid({ scale: 2.5, colors: { body: 0x5a4030, head: 0x4a3426, limb: 0x6a4a34, accent: 0x4e9a3a, hand: 0x4a3426 }, eyes: 0x9fff6a, weapon: 'club', tw: 1.0, th: 0.9, td: 0.62, aw: 0.34, al: 0.9, lw: 0.34, leg: 0.7, hs: 0.42, plates: 0x4e9a3a, horns: 0x8a6a3a, mossy: 1 });
    case 'cindermaw': return makeCreature({ body: 'quad', size: 3.1, c1: 0x3a2422, c2: 0xff5a1a, c3: 0xffc23a, horns: 3, spikes: 1, mane: 1, tail: 'flame', eyeGlow: 1, ears: 'point' });
    case 'brine': return makeWraith(0x6ad8ff, { scale: 1.9, base: 0x1f4a6a, crown: 0xd8f6ff, staff: 1 });
    case 'sable': { // the rival: a dark, hooded mirror of the hero, with a dusk-purple blade
      const M = makeHumanoid({ scale: 1.05, colors: { body: 0x2a2438, head: 0xe8c8a8, limb: 0x3a3048, accent: 0xb06cff, hood: 0x1f1a2c, leg: 0x1c1826, foot: 0x3a2a2a, hand: 0xe8c8a8 }, eyes: 0x1a1a22, eyeEm: 0, hood: 1, scarf: 0x6a4a9a, belt: 1, weapon: 'sword', blade: 1.25 });
      M.bladeMat.color.set(0x4a3a70); M.bladeMat.emissive.set(0x7a4ad0); return M;
    }
    case 'skarn': return makeHumanoid({ scale: 1.5, colors: { body: 0x4a5068, head: 0x2a2e40, limb: 0x5a6078, accent: 0xffe14a }, eyes: 0xffe14a, weapon: 'spear', cape: 0x2f3550, crown: 0xffe14a, belt: 1 });
    default: return makeHumanoid({ scale: 2.15, colors: { body: 0x1a1528, head: 0x0e0b18, limb: 0x241d38, accent: 0xb06cff }, eyes: 0xd0a0ff, weapon: 'great', cape: 0x3a1f6a, crown: 0xd8c070, belt: 1, plates: 0x4a2f8a });
  }
}
