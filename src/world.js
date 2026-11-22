// The overworld: one seamless heightfield with five biomes, props, a village, and points of interest.
import * as THREE from 'three';
import { G } from './state.js';
import { clamp, lerp, smooth, fbm, noise, rng, rand, weighted } from './util.js';
import { BIOME, PASS, WAYSTONES, SHRINES, CAMPS, KZONES, KTABLE, RIFTS, NPCS, EL, VEIL_REQ } from './data.js';
import { makeNpcModel, animate } from './models.js';
import { spawnEnemy, spawnWild } from './enemies.js';
import { fx } from './fx.js';
import { ART } from './art.js';

const SIZE = 640, HALF = 320, N = 256, CELL = SIZE / N, NV = N + 1;
const H = new Float32Array(NV * NV);
const grid = new Map();
const gk = (cx, cz) => ((cx + 64) << 8) | (cz + 64);
function addCircle(x, z, r) { const k = gk(Math.floor(x / 8), Math.floor(z / 8)); let a = grid.get(k); if (!a) { a = []; grid.set(k, a); } a.push({ x, z, r }); }

const outerBiome = (x, z) => (Math.abs(x) > Math.abs(z) ? (x > 0 ? 'ember' : 'gloam') : (z > 0 ? 'tide' : 'storm'));
export const biomeAt = (x, z) => (Math.hypot(x, z) < 124 ? 'meadow' : outerBiome(x, z));

function rawH(x, z) {
  const r = Math.hypot(x, z), ax = Math.abs(x), az = Math.abs(z);
  const n1 = fbm(x * 0.011 + 7.3, z * 0.011 + 2.1, 4), n2 = fbm(x * 0.045 + 1.7, z * 0.045 + 9.2, 3);
  const hm = Math.max(0.9, 2.4 + (n1 - 0.5) * 9 + (n2 - 0.5) * 1.6);
  const b = outerBiome(x, z); let ho;
  if (b === 'ember') ho = Math.max(1, 5 + (n1 - 0.5) * 22 + Math.abs(n2 - 0.5) * 9);
  else if (b === 'tide') ho = Math.max(-0.9, (n1 - 0.5) * 15 + (n2 - 0.5) * 2 + 0.2);
  else if (b === 'storm') ho = Math.max(1, 12 + (n1 - 0.5) * 20 + (n2 - 0.5) * 3);
  else ho = Math.max(1, 3.5 + (n1 - 0.5) * 14 + (n2 - 0.5) * 4);
  let h = lerp(hm, ho, smooth(112, 138, r));
  h = lerp(2.4, h, smooth(26, 60, r));
  const pass = ax > az ? smooth(11, 24, az) : smooth(11, 24, ax);
  const jag = 0.74 + 0.62 * noise(x * 0.035 + 11, z * 0.035 + 4);
  h += Math.exp(-(((r - 126) / 13) ** 2)) * 40 * pass * jag;
  const dd = Math.abs(ax - az) * 0.7071;
  h += Math.exp(-((dd / 11) ** 2)) * 36 * smooth(112, 134, r) * jag;
  h += smooth(286, 316, Math.max(ax, az)) * 55;
  return h;
}

const cA = new THREE.Color(), cB = new THREE.Color(), cO = new THREE.Color(), cT = new THREE.Color();
function groundColor(x, z, h, slope, out) {
  const r = Math.hypot(x, z), w = smooth(112, 138, r), b = outerBiome(x, z), n = noise(x * 0.09 + 3, z * 0.09 + 5), B = BIOME[b], M = BIOME.meadow;
  cA.setHex(M.g1).lerp(cB.setHex(M.g2), n); cO.setHex(B.g1).lerp(cB.setHex(B.g2), n);
  out.copy(cA).lerp(cO, w);
  if (b === 'tide' && w > 0.5) out.lerp(cT.setHex(0xe6dcae), smooth(0.9, 0.05, h) * 0.85);
  if (b === 'storm' && w > 0.5) out.lerp(cT.setHex(0xeef3f8), smooth(17, 24, h));
  if (b === 'ember' && w > 0.5) out.lerp(cT.setHex(0xff6a2a), smooth(0.62, 0.72, n) * smooth(4, 1.5, h) * 0.6);
  out.lerp(cT.setHex(w > 0.5 ? B.rock : M.rock), smooth(0.7, 1.15, slope));
  out.lerp(cT.setHex(w > 0.5 && b === 'ember' ? 0x6a4a40 : w > 0.5 && b === 'gloam' ? 0x7a68b0 : 0xf4f7fb), smooth(27, 40, h) * 0.92);
  out.lerp(cT.setHex(0xb89a6a), smooth(26, 10, r) * 0.75);
}

// unit geometries with their origin at the base
const PG = {
  cyl: new THREE.CylinderGeometry(0.4, 0.5, 1, 6).translate(0, 0.5, 0),
  cone: new THREE.ConeGeometry(0.5, 1, 6).translate(0, 0.5, 0),
  sph: new THREE.IcosahedronGeometry(0.5, 0).translate(0, 0.5, 0),
  rock: new THREE.DodecahedronGeometry(0.5, 0).translate(0, 0.3, 0),
  box: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
  cap: new THREE.SphereGeometry(0.5, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2),
  oct: new THREE.OctahedronGeometry(0.5, 0).translate(0, 0.5, 0),
  blade: new THREE.ConeGeometry(0.13, 0.75, 3, 1, true).translate(0, 0.37, 0),
};
// [geo, color, [sx,sy,sz], yOffset, glow]
const PROPS = {
  meadow: [
    { n: 230, r: 0.55, s: [0.8, 1.5], parts: [['cyl', 0x6b4a2b, [0.55, 2.6, 0.55], 0], ['sph', 0x3f9a3c, [3.2, 2.8, 3.2], 2.0], ['sph', 0x58b84a, [2.2, 2, 2.2], 3.6]] },
    { n: 90, r: 0.5, s: [0.9, 1.6], parts: [['cyl', 0x5a3f28, [0.45, 1.6, 0.45], 0], ['cone', 0x2f7f3a, [2.6, 2.6, 2.6], 1.2], ['cone', 0x3c9446, [1.9, 2.2, 1.9], 2.8]] },
    { n: 170, r: 0, s: [0.7, 1.3], parts: [['sph', 0x4aa641, [1.6, 1, 1.6], 0]] },
    { n: 120, r: 0.8, s: [0.7, 2.2], parts: [['rock', 0x8b9088, [1.8, 1.5, 1.8], 0]] },
    { n: 520, r: 0, s: [0.7, 1.3], flower: 1, parts: [['oct', 0xffffff, [0.3, 0.34, 0.3], 0.35]] },
  ],
  ember: [
    { n: 150, r: 0.45, s: [0.8, 1.6], parts: [['cyl', 0x2a1d1a, [0.4, 3.2, 0.4], 0], ['cone', 0x2a1d1a, [0.2, 1.6, 0.2], 1.8]] },
    { n: 170, r: 0.9, s: [0.8, 2.4], parts: [['cone', 0x3a2623, [2, 4.2, 2], 0]] },
    { n: 110, r: 0.5, s: [0.6, 1.5], parts: [['oct', 0xff8a2a, [0.8, 1.9, 0.8], 0, 1], ['oct', 0xffd24a, [0.45, 1.1, 0.45], 0.1, 1]] },
    { n: 160, r: 0.8, s: [0.7, 2.2], parts: [['rock', 0x33282a, [1.8, 1.4, 1.8], 0]] },
  ],
  tide: [
    { n: 430, r: 0, s: [0.7, 1.5], water: 1, parts: [['cyl', 0x7fae4a, [0.1, 2.2, 0.1], 0], ['oct', 0x6a4a2a, [0.2, 0.6, 0.2], 1.9]] },
    { n: 130, r: 0.5, s: [0.9, 1.5], parts: [['cyl', 0xcfc6a8, [0.45, 3.4, 0.45], 0], ['sph', 0x3fb09a, [3.6, 1.6, 3.6], 3.0], ['sph', 0x6fd0b0, [2.2, 1.2, 2.2], 4.0]] },
    { n: 160, r: 0.85, s: [0.8, 2.4], parts: [['rock', 0xb9c4c2, [1.9, 1.3, 1.9], 0]] },
    { n: 150, r: 0.35, s: [0.6, 1.4], water: 1, parts: [['cone', 0xff8fa8, [0.7, 1.5, 0.7], 0], ['cone', 0xffb86a, [0.4, 1.0, 0.4], 0]] },
  ],
  storm: [
    { n: 190, r: 0.9, s: [0.8, 2.2], parts: [['box', 0x5f6876, [1.5, 5.5, 1.5], 0], ['box', 0x778292, [1.1, 1.2, 1.1], 5.4]] },
    { n: 130, r: 0.5, s: [0.9, 1.7], parts: [['cyl', 0x3a3028, [0.4, 1.4, 0.4], 0], ['cone', 0x2f5a5a, [2.4, 3, 2.4], 1.0], ['cone', 0x3f7272, [1.7, 2.4, 1.7], 2.8]] },
    { n: 80, r: 0.35, s: [0.7, 1.4], parts: [['oct', 0xffe14a, [0.5, 2.6, 0.5], 0, 1]] },
    { n: 170, r: 0.8, s: [0.7, 2.4], parts: [['rock', 0x69727f, [1.9, 1.4, 1.9], 0]] },
  ],
  gloam: [
    { n: 210, r: 0.45, s: [0.7, 2.2], parts: [['cyl', 0xcfc8e0, [0.45, 2.2, 0.45], 0], ['cap', 0xb06cff, [3, 1.6, 3], 2.1, 1]] },
    { n: 190, r: 0.55, s: [0.9, 1.6], parts: [['cyl', 0x1c1828, [0.55, 3.4, 0.55], 0], ['sph', 0x3a2a68, [3.6, 2.8, 3.6], 2.6], ['sph', 0x5a3f9a, [2.2, 1.8, 2.2], 4.4]] },
    { n: 260, r: 0, s: [0.6, 1.4], parts: [['sph', 0x6af0e0, [0.3, 0.3, 0.3], 0.1, 1]] },
    { n: 110, r: 0.8, s: [0.7, 2.2], parts: [['rock', 0x2a2440, [1.8, 1.4, 1.8], 0]] },
    { n: 120, r: 0.4, s: [0.6, 1.3], parts: [['cyl', 0xcfc8e0, [0.3, 1.2, 0.3], 0], ['cap', 0x4ad8ff, [1.6, 0.9, 1.6], 1.1, 1]] },
  ],
};
const GRASS = { meadow: 9000, tide: 3200, gloam: 3600, storm: 2400, ember: 1500 };
const FLOWERS = [0xffffff, 0xffd24a, 0xff8fb0, 0xb08cff, 0xff6a4a];

const lit = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });
const glow = (color, op = 1) => new THREE.MeshBasicMaterial({ color, transparent: op < 1, opacity: op });
function mesh(geo, mat, sx, sy, sz, x, y, z, parent, shadow = true) { const m = new THREE.Mesh(geo, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.castShadow = shadow; parent.add(m); return m; }

export const world = {
  kind: 'overworld', slope: true, group: new THREE.Group(), interactables: [], zones: [], veils: [], pois: [], flats: [], spinners: [], npcs: [], shards: [], propMeshes: [], canopy: [], way: {}, mapCanvas: null, zoneT: 0, veilMsgT: 0,

  heightAt(x, z) {
    const fx_ = (x + HALF) / CELL, fz = (z + HALF) / CELL;
    let i = Math.floor(fx_), j = Math.floor(fz); i = i < 0 ? 0 : i > N - 1 ? N - 1 : i; j = j < 0 ? 0 : j > N - 1 ? N - 1 : j;
    const u = clamp(fx_ - i, 0, 1), v = clamp(fz - j, 0, 1), o = j * NV + i;
    const h00 = H[o], h10 = H[o + 1], h01 = H[o + NV], h11 = H[o + NV + 1];
    return u + v <= 1 ? h00 + (h10 - h00) * u + (h01 - h00) * v : h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
  },
  gradAt(x, z) { return { x: (this.heightAt(x + 0.6, z) - this.heightAt(x - 0.6, z)) / 1.2, z: (this.heightAt(x, z + 0.6) - this.heightAt(x, z - 0.6)) / 1.2 }; },
  biomeAt,
  env(pos) {
    const r = Math.hypot(pos.x, pos.z), w = smooth(112, 138, r); return { a: BIOME.meadow, b: BIOME[outerBiome(pos.x, pos.z)], w, fogNear: 45, fogFar: 235 };
  },
  camBlocked(p) { return p.y < this.heightAt(p.x, p.z) + 0.5; },
  resolve(pos, r, ent) {
    pos.x = clamp(pos.x, -311, 311); pos.z = clamp(pos.z, -311, 311);
    const cx = Math.floor(pos.x / 8), cz = Math.floor(pos.z / 8);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const a = grid.get(gk(cx + i, cz + j)); if (!a) continue;
      for (const c of a) { const dx = pos.x - c.x, dz = pos.z - c.z, d = Math.hypot(dx, dz), m = c.r + r; if (d < m && d > 1e-4) { pos.x = c.x + dx / d * m; pos.z = c.z + dz / d * m; } }
    }
    for (const v of this.veils) {
      if (v.open) continue;
      if (pos.x > v.x0 - r && pos.x < v.x1 + r && pos.z > v.z0 - r && pos.z < v.z1 + r) {
        if (v.ax === 'x') pos.x = pos.x < v.cx ? v.x0 - r : v.x1 + r; else pos.z = pos.z < v.cz ? v.z0 - r : v.z1 + r;
        if (ent === G.player) this.veilTouch = v;
      }
    }
  },

  build() {
    const g = this.group, R = rng(20261115);
    // ---- flatten spots for points of interest
    const flat = (x, z, r) => { let h = rawH(x, z); if (outerBiome(x, z) === 'tide' && Math.hypot(x, z) > 124) h = Math.max(h, 0.9); this.flats.push({ x, z, r, h }); };
    for (const w of WAYSTONES) if (w.id !== 'village') flat(w.x, w.z, 7);
    for (const id in SHRINES) flat(SHRINES[id].x, SHRINES[id].z, 11);
    for (const c of CAMPS) flat(c.x, c.z, 13);
    for (const k of KZONES) flat(k.x, k.z, 12);
    for (const r of RIFTS) flat(r.x, r.z, 9);
    for (let j = 0; j < NV; j++) for (let i = 0; i < NV; i++) {
      const x = -HALF + i * CELL, z = -HALF + j * CELL; let h = rawH(x, z);
      for (const f of this.flats) { const d = Math.hypot(x - f.x, z - f.z); if (d < f.r * 2.2) h = lerp(f.h, h, smooth(f.r, f.r * 2.2, d)); }
      H[j * NV + i] = h;
    }
    // ---- terrain mesh + map image
    const pos = new Float32Array(NV * NV * 3), col = new Float32Array(NV * NV * 3), idx = new Uint32Array(N * N * 6), c = new THREE.Color();
    const mc = document.createElement('canvas'); mc.width = mc.height = NV; const mctx = mc.getContext('2d'), img = mctx.createImageData(NV, NV);
    for (let j = 0; j < NV; j++) for (let i = 0; i < NV; i++) {
      const o = j * NV + i, x = -HALF + i * CELL, z = -HALF + j * CELL, h = H[o];
      const hx = (H[j * NV + Math.min(N, i + 1)] - H[j * NV + Math.max(0, i - 1)]) / (2 * CELL), hz = (H[Math.min(N, j + 1) * NV + i] - H[Math.max(0, j - 1) * NV + i]) / (2 * CELL);
      groundColor(x, z, h, Math.hypot(hx, hz), c);
      pos[o * 3] = x; pos[o * 3 + 1] = h; pos[o * 3 + 2] = z; col[o * 3] = c.r; col[o * 3 + 1] = c.g; col[o * 3 + 2] = c.b;
      if (h < 0) c.setHex(0x3a9ad8);
      const sh = clamp(1 - (hx + hz) * 0.35, 0.55, 1.35), hex = c.getHex();
      img.data[o * 4] = Math.min(255, ((hex >> 16) & 255) * sh); img.data[o * 4 + 1] = Math.min(255, ((hex >> 8) & 255) * sh); img.data[o * 4 + 2] = Math.min(255, (hex & 255) * sh); img.data[o * 4 + 3] = 255;
    }
    mctx.putImageData(img, 0, 0); this.mapCanvas = mc;
    let k = 0; for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * NV + i, b = a + NV, d = a + 1, cc = b + 1; idx[k++] = a; idx[k++] = b; idx[k++] = d; idx[k++] = b; idx[k++] = cc; idx[k++] = d; }
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); tg.setAttribute('color', new THREE.BufferAttribute(col, 3)); tg.setIndex(new THREE.BufferAttribute(idx, 1)); tg.computeBoundingSphere();
    const tmat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    if (ART.ground) { // custom ground texture, tinted by the biome colours
      const uv = new Float32Array(NV * NV * 2), sz = ART.ground.size; for (let o = 0; o < NV * NV; o++) { uv[o * 2] = pos[o * 3] / sz; uv[o * 2 + 1] = pos[o * 3 + 2] / sz; }
      tg.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); tmat.map = ART.ground.tex;
    }
    const terrain = new THREE.Mesh(tg, tmat); terrain.receiveShadow = true; g.add(terrain);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3aa8e0, transparent: true, opacity: 0.7, emissive: 0x0a3a5a })); water.position.y = 0; g.add(water);

    // ---- props
    const dummy = new THREE.Object3D(), tmpC = new THREE.Color();
    const free = (x, z, pad) => { for (const f of this.flats) if (Math.hypot(x - f.x, z - f.z) < f.r + pad) return false; return true; };
    const okSpot = (x, z, biome, water) => {
      const r = Math.hypot(x, z);
      if (biome === 'meadow') { if (r > 108 || r < 34) return false; }
      else { if (r < 142 || Math.max(Math.abs(x), Math.abs(z)) > 290 || outerBiome(x, z) !== biome || Math.abs(Math.abs(x) - Math.abs(z)) * 0.7071 < 17) return false; }
      const h = this.heightAt(x, z); if (!water && h < 0.45) return false; if (water && (h > 0.8 || h < -0.6)) return false;
      const gr = this.gradAt(x, z); return Math.hypot(gr.x, gr.z) < 0.7;
    };
    for (const biome in PROPS) for (const def of PROPS[biome]) {
      const pts = [];
      for (let t = 0; t < def.n * 14 && pts.length < def.n; t++) {
        const x = (R() - 0.5) * 600, z = (R() - 0.5) * 600;
        if (!okSpot(x, z, biome, def.water) || !free(x, z, def.r > 0 ? 2.5 : 0)) continue;
        const s = lerp(def.s[0], def.s[1], R()); pts.push({ x, z, h: this.heightAt(x, z), s, rot: R() * 6.28, v: R() });
        if (def.r > 0) addCircle(x, z, def.r * s);
      }
      for (const part of def.parts) {
        const [geo, color, sc, yo, gl] = part;
        const im = new THREE.InstancedMesh(PG[geo], gl ? new THREE.MeshBasicMaterial({ color: 0xffffff }) : new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), pts.length);
        pts.forEach((p, i) => {
          dummy.position.set(p.x, p.h + yo * p.s - 0.08, p.z); dummy.rotation.set(0, p.rot, 0); dummy.scale.set(sc[0] * p.s, sc[1] * p.s, sc[2] * p.s); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix);
          tmpC.setHex(def.flower ? FLOWERS[Math.floor(p.v * FLOWERS.length)] : color).multiplyScalar(0.85 + p.v * 0.3); im.setColorAt(i, tmpC);
        });
        im.castShadow = !gl && def.r > 0; im.receiveShadow = false; im.frustumCulled = false; g.add(im); this.propMeshes.push({ im, biome });
      }
    }
    // grass
    const grassMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, side: THREE.DoubleSide });
    for (const biome in GRASS) {
      const grass = new THREE.InstancedMesh(PG.blade, grassMat, GRASS[biome]); let gi = 0;
      let placed = 0;
      for (let t = 0; t < GRASS[biome] * 12 && placed < GRASS[biome]; t++) {
        const x = (R() - 0.5) * 600, z = (R() - 0.5) * 600; if (!okSpot(x, z, biome, false)) continue;
        const s = 0.7 + R() * 0.9; dummy.position.set(x, this.heightAt(x, z) - 0.05, z); dummy.rotation.set((R() - 0.5) * 0.4, R() * 6.28, (R() - 0.5) * 0.4); dummy.scale.set(s, s * (0.8 + R() * 0.8), s); dummy.updateMatrix();
        grass.setMatrixAt(gi, dummy.matrix); tmpC.setHex(BIOME[biome].grass).multiplyScalar(0.75 + R() * 0.45); grass.setColorAt(gi, tmpC); gi++; placed++;
      }
      grass.count = gi; grass.frustumCulled = false; g.add(grass); this.propMeshes.push({ im: grass, biome });
    }

    this.buildVillage(g); this.buildPois(g, R);
    this.refresh();
  },

  buildVillage(g) {
    const y0 = this.heightAt(0, 0);
    // Lantern Tree
    const tree = new THREE.Group(); tree.position.set(0, y0, 0); g.add(tree);
    mesh(PG.cyl, lit(0x6b4a2b), 3.2, 10, 3.2, 0, 0, 0, tree);
    for (const [x, y, z, s, cl] of [[0, 9, 0, 11, 0x3f9a3c], [3.5, 11.5, 1, 7, 0x58b84a], [-3, 11, -2, 7.5, 0x4aa641], [0.5, 13, -1, 6, 0x7fd060]]) { const cm = lit(cl); cm.transparent = true; this.canopy.push(cm); mesh(PG.sph, cm, s, s * 0.8, s, x, y, z, tree); }
    const lm = glow(0xffd98a); this.lanternOn = lm; this.lanternOff = glow(0x4a4234); this.lanterns = [];
    for (let i = 0; i < 9; i++) { const a = i / 9 * 6.28, r = 3.5 + (i % 3); this.lanterns.push(mesh(PG.sph, lm, 0.45, 0.6, 0.45, Math.cos(a) * r, 6.2 + (i % 2) * 1.2, Math.sin(a) * r, tree, false)); }
    const pl = new THREE.PointLight(0xffd98a, 60, 38, 1.6); pl.position.set(0, 6, 0); tree.add(pl); this.treeLight = pl;
    addCircle(0, 0, 1.9);
    // huts
    const roofs = [0xc0503a, 0x3a8a8a, 0xd0a03a, 0x8a5ab0, 0xc0503a, 0x3a8a8a];
    [20, 78, 150, 208, 262, 322].forEach((deg, i) => {
      const a = deg * Math.PI / 180, r = 23 + (i % 2) * 3, x = Math.cos(a) * r, z = Math.sin(a) * r, h = this.heightAt(x, z), hut = new THREE.Group(); hut.position.set(x, h - 0.1, z); hut.rotation.y = Math.atan2(-x, -z); g.add(hut);
      mesh(PG.cyl, lit(0xe0d0a8), 6.6, 3, 6.6, 0, 0, 0, hut); mesh(PG.cone, lit(roofs[i]), 8.4, 3, 8.4, 0, 2.9, 0, hut); mesh(PG.box, lit(0x5a3f28), 1.1, 1.9, 0.3, 0, 0, 2.75, hut, false); mesh(PG.box, glow(0xffe0a0), 0.7, 0.7, 0.2, 1.7, 1.3, 2.4, hut, false);
      addCircle(x, z, 3.3);
    });
    // forge, stall, grove pens, well
    const at = (x, z) => { const grp = new THREE.Group(); grp.position.set(x, this.heightAt(x, z), z); g.add(grp); return grp; };
    const forge = at(-18, -7); mesh(PG.box, lit(0x4a4458), 2.2, 1.1, 1.6, 0, 0, 0, forge); mesh(PG.box, glow(0xff7a3c), 1.4, 0.2, 1, 0, 1.1, 0, forge, false); mesh(PG.cyl, lit(0x3a3340), 0.7, 3, 0.7, -0.7, 1.1, 0, forge); addCircle(-18, -7, 1.4);
    const stall = at(16, 11); for (const [x, z] of [[-1.3, -1], [1.3, -1], [-1.3, 1], [1.3, 1]]) mesh(PG.cyl, lit(0x6b4a2b), 0.18, 2.4, 0.18, x, 0, z, stall); mesh(PG.box, lit(0xd0562e), 3.2, 0.2, 2.6, 0, 2.4, 0, stall); mesh(PG.box, lit(0x8a6a3a), 2.8, 1, 0.8, 0, 0, -0.8, stall); addCircle(16, 11, 1.6);
    const pen = at(-9, 19); for (let i = 0; i < 10; i++) { const a = i / 10 * 6.28; mesh(PG.box, lit(0x8a6a3a), 0.16, 0.9, 0.16, Math.cos(a) * 3, 0, Math.sin(a) * 3, pen); const b = mesh(PG.box, lit(0x8a6a3a), 1.9, 0.12, 0.1, Math.cos(a + 0.314) * 2.9, 0.6, Math.sin(a + 0.314) * 2.9, pen, false); b.rotation.y = -(a + 0.314) + Math.PI / 2; }
    const well = at(-16, 12); mesh(PG.cyl, lit(0x8b9088), 2.6, 1, 2.6, 0, 0, 0, well); mesh(PG.cyl, new THREE.MeshBasicMaterial({ color: 0x08060f }), 1.9, 0.1, 1.9, 0, 0.98, 0, well, false);
    for (const sx of [-1, 1]) mesh(PG.cyl, lit(0x6b4a2b), 0.2, 2.6, 0.2, sx * 1.1, 0.9, 0, well); mesh(PG.cone, lit(0x5a3f78), 3.2, 1.2, 3.2, 0, 3.4, 0, well); addCircle(-16, 12, 1.5);
    this.interactables.push({ pos: new THREE.Vector3(-16, well.position.y, 12), r: 3.4, label: () => (G.save.relics.cinders ? 'Descend into the Abyss' : 'Examine the well'), use: () => G.game.useWell() });
    // NPCs
    for (const n of NPCS) {
      const m = makeNpcModel(n.look, n.id); const y = this.heightAt(n.x, n.z); m.root.position.set(n.x, y, n.z); m.root.rotation.y = Math.atan2(-n.x * 0.35, 1); g.add(m.root);
      this.npcs.push({ m, t: rand(10) }); addCircle(n.x, n.z, 0.6);
      this.interactables.push({ pos: new THREE.Vector3(n.x, y, n.z), r: 2.9, label: 'Talk to ' + n.name, use: () => G.game.talk(n.id) });
    }
    this.pois.push({ type: 'village', x: 0, z: 0, name: 'Lanternrest' });
  },

  buildPois(g, R) {
    // waystones
    for (const w of WAYSTONES) {
      const y = this.heightAt(w.x, w.z), grp = new THREE.Group(); grp.position.set(w.x, y, w.z); g.add(grp);
      mesh(PG.cyl, lit(0x7b8090), 3, 0.4, 3, 0, -0.05, 0, grp); mesh(PG.box, lit(0x8b90a0), 0.9, 3.4, 0.9, 0, 0.3, 0, grp);
      const cm = glow(0x556070), crystal = mesh(PG.oct, cm, 0.8, 1.2, 0.8, 0, 4.1, 0, grp, false), rune = mesh(PG.box, cm, 0.94, 0.5, 0.94, 0, 2.2, 0, grp, false);
      addCircle(w.x, w.z, 0.9); this.way[w.id] = { cm, crystal, grp }; void rune;
      this.interactables.push({ pos: new THREE.Vector3(w.x, y, w.z), r: 3.3, label: () => (G.save.waystones[w.id] ? 'Rest at Waystone' : 'Awaken Waystone'), use: () => G.game.useWaystone(w.id) });
      this.pois.push({ type: 'way', id: w.id, x: w.x, z: w.z, name: w.name });
    }
    // shrine gates
    for (const id in SHRINES) {
      const s = SHRINES[id], y = this.heightAt(s.x, s.z), grp = new THREE.Group(), col = EL[s.el].color; grp.position.set(s.x, y, s.z); grp.rotation.y = Math.atan2(-s.x, -s.z); g.add(grp);
      for (const sx of [-1, 1]) { mesh(PG.box, lit(0x6f7484), 1.3, 7, 1.3, sx * 3, 0, 0, grp); mesh(PG.oct, glow(col), 0.8, 1.2, 0.8, sx * 3, 7.1, 0, grp, false); }
      mesh(PG.box, lit(0x6f7484), 8.6, 1.1, 1.6, 0, 6.2, 0, grp); mesh(PG.cyl, lit(0x7b8090), 9, 0.3, 9, 0, -0.1, 0, grp);
      const pm = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.6, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
      const portal = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 5.8), pm); portal.position.set(0, 3.1, 0); grp.add(portal);
      const a = grp.rotation.y; for (const sx of [-1, 1]) addCircle(s.x + Math.cos(a) * sx * 3, s.z - Math.sin(a) * sx * 3, 0.9);
      this.spinners.push({ kind: 'portal', pm, x: s.x, y: y + 3, z: s.z, col });
      this.interactables.push({ pos: new THREE.Vector3(s.x, y, s.z), r: 4.2, label: 'Enter the ' + s.name.replace(/^The /, ''), use: () => G.game.enterShrine(id) });
      this.pois.push({ type: 'shrine', id, x: s.x, z: s.z, name: s.name, el: s.el });
    }
    // veils across the passes
    for (const b in PASS) {
      const p = PASS[b], y = this.heightAt(p.x, p.z), isX = p.ax === 'x';
      const mat = new THREE.MeshBasicMaterial({ color: 0x1a0f30, transparent: true, opacity: 0.82, side: THREE.DoubleSide, depthWrite: false });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(58, 46), mat); m.position.set(p.x, y + 16, p.z); m.rotation.y = isX ? Math.PI / 2 : 0; g.add(m);
      this.veils.push({ biome: b, ax: p.ax, cx: p.x, cz: p.z, x0: isX ? p.x - 1.5 : p.x - 28, x1: isX ? p.x + 1.5 : p.x + 28, z0: isX ? p.z - 28 : p.z - 1.5, z1: isX ? p.z + 28 : p.z + 1.5, mesh: m, mat, open: false, y });
    }
    // enemy camps (with a totem and a chest) and Kith groves
    CAMPS.forEach((c, i) => {
      const biome = biomeAt(c.x, c.z), col = EL[BIOME[biome].el].color, y = this.heightAt(c.x, c.z), grp = new THREE.Group(); grp.position.set(c.x, y, c.z); g.add(grp);
      mesh(PG.cone, lit(0x231f2e), 1.6, 5, 1.6, 0, 0, 0, grp); mesh(PG.oct, glow(col), 0.7, 1, 0.7, 0, 5, 0, grp, false);
      for (let k = 0; k < 5; k++) { const a = k / 5 * 6.28 + 0.4; const sp = mesh(PG.cone, lit(0x231f2e), 0.7, 2 + (k % 2), 0.7, Math.cos(a) * 10, 0, Math.sin(a) * 10, grp); sp.rotation.z = Math.cos(a) * 0.25; sp.rotation.x = -Math.sin(a) * 0.25; }
      addCircle(c.x, c.z, 0.9);
      this.zones.push({ kind: 'camp', x: c.x, z: c.z, r: 8, lvl: c.lvl, list: c.list, biome, spawned: false, alive: [], respawnAt: 0 });
      const id = 'c' + i, cx = c.x + 6.5, cz = c.z + 4.5, cy = this.heightAt(cx, cz), ch = new THREE.Group(); ch.position.set(cx, cy, cz); ch.rotation.y = R() * 6.28; g.add(ch);
      mesh(PG.box, lit(0x7a4a2a), 1.3, 0.7, 0.9, 0, 0, 0, ch); mesh(PG.box, lit(0xffd24a), 1.36, 0.12, 0.96, 0, 0.3, 0, ch, false);
      const lid = new THREE.Group(); lid.position.set(0, 0.7, -0.45); ch.add(lid); mesh(PG.box, lit(0x8a5a34), 1.3, 0.3, 0.9, 0, 0, 0.45, lid);
      addCircle(cx, cz, 0.8);
      const chest = { id, lid, opened: false, reward: { motes: 40 + c.lvl * 12, threads: i % 3 === 0 ? 3 : 0, sigil: i % 5 === 2 ? 1 : 0 } };
      this.chests = this.chests || []; this.chests.push(chest);
      this.interactables.push({ pos: new THREE.Vector3(cx, cy, cz), r: 2.6, label: 'Open chest', cond: () => !G.save.chests[id], use: () => { G.game.openChest(chest); } });
    });
    for (const kz of KZONES) {
      const biome = biomeAt(kz.x, kz.z), y = this.heightAt(kz.x, kz.z), grp = new THREE.Group(); grp.position.set(kz.x, y, kz.z); g.add(grp);
      for (let k = 0; k < 7; k++) { const a = k / 7 * 6.28; mesh(PG.rock, lit(0xcfd6d8), 0.9, 1.4 + (k % 3) * 0.5, 0.9, Math.cos(a) * 11, 0, Math.sin(a) * 11, grp); }
      this.zones.push({ kind: 'kith', x: kz.x, z: kz.z, r: 9, biome, spawned: false, alive: [], respawnAt: 0 });
      this.pois.push({ type: 'grove', x: kz.x, z: kz.z, name: 'Kith grove' });
    }
    // Hush rifts
    RIFTS.forEach((r, i) => {
      const y = this.heightAt(r.x, r.z), m = mesh(PG.oct, glow(0x7a3ad8, 0.85), 1.5, 4.4, 1.5, r.x, y + 0.8, r.z, g, false);
      mesh(PG.cyl, lit(0x231f2e), 5, 0.3, 5, r.x, y - 0.1, r.z, g);
      this.spinners.push({ kind: 'rift', mesh: m, x: r.x, y: y + 3, z: r.z });
      this.interactables.push({ pos: new THREE.Vector3(r.x, y, r.z), r: 4, label: () => (G.save.rifts[r.id] ? 'Re-enter Hush Rift' : 'Enter Hush Rift'), use: () => G.game.enterRift(r.id, i) });
      this.pois.push({ type: 'rift', id: r.id, x: r.x, z: r.z, name: 'Hush Rift' });
    });
    // Echo shards: four in the meadow, three in each outer biome
    const beamGeo = new THREE.CylinderGeometry(0.1, 0.1, 30, 5).translate(0, 15, 0); let n = 0;
    for (const [biome, count] of [['meadow', 4], ['ember', 3], ['tide', 3], ['storm', 3], ['gloam', 3]]) {
      let placed = 0;
      for (let t = 0; t < 4000 && placed < count; t++) {
        const x = (R() - 0.5) * 590, z = (R() - 0.5) * 590, r = Math.hypot(x, z);
        if (biome === 'meadow' ? (r > 104 || r < 45) : (r < 150 || outerBiome(x, z) !== biome || Math.max(Math.abs(x), Math.abs(z)) > 284 || Math.abs(Math.abs(x) - Math.abs(z)) * 0.7071 < 20)) continue;
        const h = this.heightAt(x, z), gr = this.gradAt(x, z); if (h < 0.6 || Math.hypot(gr.x, gr.z) > 0.6) continue;
        let far = true; for (const s of this.shards) if (Math.hypot(s.x - x, s.z - z) < 60) far = false; for (const f of this.flats) if (Math.hypot(f.x - x, f.z - z) < f.r + 14) far = false; if (!far) continue;
        const id = 's' + n++, grp = new THREE.Group(); grp.position.set(x, h, z); g.add(grp);
        const gem = mesh(PG.oct, glow(0xd8f6ff), 0.7, 1.1, 0.7, 0, 0.9, 0, grp, false);
        const bm = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0x9adfff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false })); grp.add(bm);
        this.shards.push({ id, biome, x, z, y: h, grp, gem, taken: false }); placed++;
      }
    }
  },

  // how many Echo Shard memories have been found in each region (they unlock in story order)
  memoriesFound() { const s = G.save, n = {}; for (const sh of this.shards) if (s && s.shards[sh.id]) n[sh.biome] = (n[sh.biome] || 0) + 1; return n; },

  // sync world objects with the save (called on load and after progress)
  refresh() {
    const s = G.save; if (!s) return;
    for (const v of this.veils) { v.open = !!s.shrines[VEIL_REQ[v.biome]]; v.mesh.visible = !v.open; }
    for (const id in this.way) this.way[id].cm.color.set(s.waystones[id] ? 0x6ff0ff : 0x556070);
    for (const sh of this.shards) { sh.taken = !!s.shards[sh.id]; sh.grp.visible = !sh.taken; }
    for (const c of this.chests) { c.opened = !!s.chests[c.id]; c.lid.rotation.x = c.opened ? -1.9 : 0; }
    // the Lantern Tree relights as the story goes: one lantern left at the start, all nine at the end
    const lit = [1, 3, 5, 6, 8, 9][Math.min(5, Object.keys(s.shrines).length)], order = [0, 5, 3, 7, 1, 6, 4, 8, 2];
    this.lanterns.forEach((m, i) => { m.material = order[i] < lit ? this.lanternOn : this.lanternOff; });
    this.treeLight.intensity = 15 + 45 * lit / 9;
  },
  resetZones() { for (const z of this.zones) { z.spawned = false; z.alive = []; } },
  respawnAll() { for (const z of this.zones) { for (const e of z.alive) if (!e.dead) e.remove(); z.alive = []; z.spawned = false; z.respawnAt = 0; } },

  spawnZone(z) {
    z.spawned = true; z.alive = []; const B = BIOME[z.biome];
    if (z.kind === 'camp') {
      for (const t of z.list) { const a = rand(6.28), d = rand(2.5, z.r); z.alive.push(spawnEnemy(t, z.x + Math.cos(a) * d, z.z + Math.sin(a) * d, z.lvl, B.el)); }
    } else {
      const n = 2 + (Math.random() < 0.45 ? 1 : 0);
      for (let i = 0; i < n; i++) { const a = rand(6.28), d = rand(1, z.r), sp = weighted(KTABLE[z.biome]); const lvl = B.lvl[0] + Math.floor(Math.random() * (B.lvl[1] - B.lvl[0] + 1)); z.alive.push(spawnWild(sp, z.x + Math.cos(a) * d, z.z + Math.sin(a) * d, lvl)); }
    }
  },

  update(dt, t) {
    const p = G.player.pos, s = G.save;
    this.zoneT -= dt;
    if (this.zoneT <= 0) {
      this.zoneT = 0.4;
      const pr = Math.hypot(p.x, p.z), pb = outerBiome(p.x, p.z);
      for (const pm of this.propMeshes) { const ps = PASS[pm.biome]; pm.im.visible = pm.biome === 'meadow' ? pr < 235 : ((pr > 110 && pb === pm.biome) || Math.hypot(p.x - ps.x, p.z - ps.z) < 125); }
      for (const z of this.zones) {
        const d = Math.hypot(p.x - z.x, p.z - z.z);
        if (!z.spawned) { if (d < 72 && s.playtime >= z.respawnAt) this.spawnZone(z); }
        else {
          z.alive = z.alive.filter((e) => !e.dead && !e.gone);
          if (z.alive.length === 0) { z.spawned = false; z.respawnAt = s.playtime + (z.kind === 'camp' ? 420 : 100); }
          else if (d > 128) { for (const e of z.alive) e.remove(); z.alive = []; z.spawned = false; }
          else if (z.kind === 'kith' && d < 26) for (const e of z.alive) if (!s.dex[e.species]) { s.dex[e.species] = 1; G.game.tip('kith'); }
        }
      }
    }
    for (const sp of this.spinners) {
      if (sp.kind === 'portal') { sp.pm.opacity = 0.45 + 0.25 * Math.sin(t * 2.5); if (Math.hypot(p.x - sp.x, p.z - sp.z) < 60 && Math.random() < dt * 14) fx.spawn(sp.x + rand(-2, 2), sp.y + rand(-2.5, 2.5), sp.z + rand(-2, 2), 0, rand(0.5, 2), 0, sp.col, 0.4, 0.8, 0); }
      else { sp.mesh.rotation.y = t * 0.8; sp.mesh.scale.y = 4.4 + Math.sin(t * 2) * 0.4; if (Math.hypot(p.x - sp.x, p.z - sp.z) < 60 && Math.random() < dt * 14) fx.spawn(sp.x + rand(-2, 2), sp.y + rand(-2, 3), sp.z + rand(-2, 2), rand(-1, 1), rand(-1, 1), rand(-1, 1), 0xb06cff, 0.45, 0.8, 0); }
    }
    for (const id in this.way) { const w = this.way[id]; w.crystal.position.y = 4.1 + Math.sin(t * 2 + w.grp.position.x) * 0.2; w.crystal.rotation.y = t; }
    for (const v of this.veils) if (!v.open) { v.mat.opacity = 0.74 + 0.1 * Math.sin(t * 1.7 + v.cx); if (Math.hypot(p.x - v.cx, p.z - v.cz) < 70 && Math.random() < dt * 30) { const o = rand(-26, 26); fx.spawn(v.cx + (v.ax === 'x' ? 0 : o), v.y + rand(14), v.cz + (v.ax === 'x' ? o : 0), 0, rand(1, 3), 0, 0x7a3ad8, 0.7, 1, 0); } }
    this.veilMsgT -= dt;
    if (this.veilTouch) { if (this.veilMsgT <= 0) { this.veilMsgT = 4; G.ui.toast(`The Hush seals this pass. Restore the ${SHRINES[VEIL_REQ[this.veilTouch.biome]].name} first.`); } this.veilTouch = null; }
    for (const sh of this.shards) {
      if (sh.taken) continue; sh.gem.rotation.y = t * 2; sh.gem.position.y = 0.9 + Math.sin(t * 2.4 + sh.x) * 0.2;
      if (Math.hypot(p.x - sh.x, p.z - sh.z) < 1.9 && Math.abs(p.y - sh.y) < 3) { sh.taken = true; sh.grp.visible = false; G.game.takeShard(sh); }
    }
    // let the Lantern Tree's canopy go see-through when the hero walks behind it in the fixed view
    const behind = G.opts.camera !== 'free' && p.z < 2 && p.z > -17 && Math.abs(p.x) < 9.5;
    for (const cm of this.canopy) cm.opacity += ((behind ? 0.22 : 1) - cm.opacity) * Math.min(1, dt * 6);
    for (const n of this.npcs) { n.t += dt; if (Math.hypot(p.x - n.m.root.position.x, p.z - n.m.root.position.z) < 50) animate(n.m, { t: n.t, run: 0 }, dt); }
  },
};
