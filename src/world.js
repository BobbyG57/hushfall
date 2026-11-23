// The overworld: five regions (the meadow and the four beyond its passes), each loaded as its own
// area. They share one coordinate system and one heightfield (terrain.js, made by
// tools/world/make_world.py); walking far enough into a pass loads the region on the other side.
import * as THREE from 'three';
import { G } from './state.js';
import { clamp, lerp, smooth, noise, rng, rand, weighted } from './util.js';
import { BIOME, PASS, WAYSTONES, SHRINES, CAMPS, KZONES, KTABLE, RIFTS, NPCS, EL, VEIL_REQ, EXTRA_ZONES, SPRINGS, VOLCANO } from './data.js';
import { makeNpcModel, animate } from './models.js';
import { spawnEnemy, spawnWild } from './enemies.js';
import { fx } from './fx.js';
import { audio } from './audio.js';
import { ART } from './art.js';
import { T, NV, CELL, HALF, REGION_NAMES, heightAt, regionAt, roadAt, reachAt, inPass } from './terrain.js';


// The Hush greys each region until its shrine wakes (STORY.md, section 8). The meadow only greys toward
// its edges, so Lanternrest keeps its colour. When a shrine wakes, the colour floods back over a few seconds.
const HUSH_SHRINE = { meadow: 'roots', ember: 'cinders', tide: 'tides', storm: 'gales', gloam: 'hollow' };
const HUSH_MAX = { meadow: 0.45, ember: 0.55, tide: 0.55, storm: 0.55, gloam: 0.5 };
const meadowEdge = (r) => smooth(30, 105, r);
function greyed(arr, i, base, k) {   // move one rgb triple from its base colour toward a cool grey
  const r = base[i], g = base[i + 1], b = base[i + 2];
  if (k <= 0.001) { arr[i] = r; arr[i + 1] = g; arr[i + 2] = b; return; }
  const l = (r * 0.3 + g * 0.59 + b * 0.11) * 0.95;
  arr[i] = r + (l - r) * k; arr[i + 1] = g + (l - g) * k; arr[i + 2] = b + (l * 1.04 - b) * k;
}

// the region on the far side of whichever pass a point is in (by the old straight lines)
const outerOf = (x, z) => (Math.abs(x) > Math.abs(z) ? (x > 0 ? 'ember' : 'gloam') : (z > 0 ? 'tide' : 'storm'));
export const biomeAt = regionAt;
// how much a spot belongs to the region beyond the meadow (blended only inside the passes)
function regionBlend(x, z) {
  const reg = regionAt(x, z);
  if (inPass(x, z)) return { b: outerOf(x, z), w: smooth(112, 138, Math.hypot(x, z)) };
  return reg === 'meadow' ? { b: outerOf(x, z), w: 0 } : { b: reg, w: 1 };
}

// The painted ground (ART.groundTex, from art.js): each region's texture is blended in by how much a
// spot belongs to that region, and steep slopes take the cliff rock, mapped from three sides so it
// does not stretch. Textures add their painted detail on top of the vertex colours (which carry the
// region palette, rock, snow, sand, roads and the Hush grey), so dividing by each texture's average
// colour keeps the overall colours where they were.
function groundShader(geo, mat, reg) {
  const T2 = ART.groundTex;
  geo.setAttribute('aRegion', new THREE.BufferAttribute(reg, 4));
  const names = ['meadow', 'ember', 'tide', 'storm', 'gloam', 'cliff'];
  mat.customProgramCacheKey = () => 'hushfall-ground';
  mat.onBeforeCompile = (sh) => {
    for (const k of names) { sh.uniforms['t_' + k] = { value: T2[k].tex }; sh.uniforms['m_' + k] = { value: T2[k].mean }; sh.uniforms['s_' + k] = { value: 1 / T2[k].size }; }
    sh.uniforms.uGround = { value: ART.groundStrength };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aRegion; varying vec4 vRegion; varying vec3 vGPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRegion = aRegion; vGPos = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec4 vRegion; varying vec3 vGPos; uniform float uGround;
${names.map((k) => `uniform sampler2D t_${k}; uniform vec3 m_${k}; uniform float s_${k};`).join('\n')}
vec3 gtex(sampler2D t, vec3 m, float s, vec2 p) { return (texture2D(t, p * s).rgb * 0.68 + texture2D(t, p * s * 0.37 + 0.31).rgb * 0.32) / m; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 p = vGPos.xz; float wo = vRegion.x + vRegion.y + vRegion.z + vRegion.w;
  vec3 g = gtex(t_meadow, m_meadow, s_meadow, p) * (1.0 - wo) + gtex(t_ember, m_ember, s_ember, p) * vRegion.x
    + gtex(t_tide, m_tide, s_tide, p) * vRegion.y + gtex(t_storm, m_storm, s_storm, p) * vRegion.z + gtex(t_gloam, m_gloam, s_gloam, p) * vRegion.w;
  vec3 nrm = normalize(cross(dFdx(vGPos), dFdy(vGPos))), b = abs(nrm); b /= b.x + b.y + b.z;
  vec3 c = (texture2D(t_cliff, vGPos.zy * s_cliff).rgb * b.x + texture2D(t_cliff, vGPos.xz * s_cliff).rgb * b.y + texture2D(t_cliff, vGPos.xy * s_cliff).rgb * b.z) / m_cliff;
  g = mix(g, c, 1.0 - smoothstep(0.62, 0.84, abs(nrm.y)));
  diffuseColor.rgb *= mix(vec3(1.0), clamp(g, 0.0, 2.5), uGround);
}`);
  };
}

// conditions for story spots in EXTRA_ZONES
const ZONE_COND = {
  stray: (s) => s.quest >= 1 && !s.kith.some((k) => k.species === 'cinderpup'),   // only if you have no Cinderpup
};

// collision circles (trees, rocks, huts), in one grid shared by every region
const grid = new Map();
const gk = (cx, cz) => ((cx + 64) << 8) | (cz + 64);
function addCircle(x, z, r) { const k = gk(Math.floor(x / 8), Math.floor(z / 8)); let a = grid.get(k); if (!a) { a = []; grid.set(k, a); } a.push({ x, z, r }); }

const ROAD_COL = { meadow: 0xb89a6a, ember: 0x5c4038, tide: 0xd8cfae, storm: 0x9298a2, gloam: 0x4d4266 };
const cA = new THREE.Color(), cB = new THREE.Color(), cO = new THREE.Color(), cT = new THREE.Color();
function groundColor(x, z, h, slope, out) {
  const r = Math.hypot(x, z), { b, w } = regionBlend(x, z), n = noise(x * 0.09 + 3, z * 0.09 + 5), B = BIOME[b], M = BIOME.meadow;
  cA.setHex(M.g1).lerp(cB.setHex(M.g2), n); cO.setHex(B.g1).lerp(cB.setHex(B.g2), n);
  out.copy(cA).lerp(cO, w);
  if (b === 'tide' && w > 0.5) out.lerp(cT.setHex(0xe6dcae), smooth(0.9, 0.05, h) * 0.85);
  if (b === 'storm' && w > 0.5) out.lerp(cT.setHex(0xeef3f8), smooth(30, 40, h));
  if (b === 'ember' && w > 0.5) out.lerp(cT.setHex(0xff6a2a), smooth(0.62, 0.72, n) * smooth(6, 3.5, h) * 0.6);
  out.lerp(cT.setHex(w > 0.5 ? B.rock : M.rock), smooth(0.7, 1.15, slope));
  out.lerp(cT.setHex(w > 0.5 && b === 'ember' ? 0x6a4a40 : w > 0.5 && b === 'gloam' ? 0x7a68b0 : 0xf4f7fb), smooth(46, 62, h) * 0.92);
  const rd = roadAt(x, z); if (rd > 0.03) out.lerp(cT.setHex(ROAD_COL[w > 0.5 ? b : 'meadow']), rd * 0.72);
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

// Echo Shards: ids are fixed per region (meadow s0 to s3, then three for each region in this order),
// so a save's found shards stay found whichever region they are in
const SHARD_PLAN = [['meadow', 4], ['ember', 3], ['tide', 3], ['storm', 3], ['gloam', 3]];
const SHARD_REGION = SHARD_PLAN.flatMap(([b, n]) => Array(n).fill(b));
// how many Echo Shard memories have been found in each region (they unlock in story order)
export function memoriesFound() { const s = G.save, n = {}; if (s) for (const id in s.shards) { const b = SHARD_REGION[+id.slice(1)]; if (b) n[b] = (n[b] || 0) + 1; } return n; }

// walking this far into a pass loads the other side (the gap between the two lines stops flickering)
const EXITS = {
  meadow: [{ to: 'ember', at: (x, z) => x > 150 && Math.abs(z) < 30 }, { to: 'gloam', at: (x, z) => x < -150 && Math.abs(z) < 30 },
    { to: 'tide', at: (x, z) => z > 150 && Math.abs(x) < 30 }, { to: 'storm', at: (x, z) => z < -150 && Math.abs(x) < 30 }],
  ember: [{ to: 'meadow', at: (x, z) => x < 134 && Math.abs(z) < 30 }], gloam: [{ to: 'meadow', at: (x, z) => x > -134 && Math.abs(z) < 30 }],
  tide: [{ to: 'meadow', at: (x, z) => z < 134 && Math.abs(x) < 30 }], storm: [{ to: 'meadow', at: (x, z) => z > -134 && Math.abs(x) < 30 }],
};

// ---------------------------------------------------------------- the whole-valley map (pause menu, minimap)
export const MAP = { canvas: null, pois: [] };
export function buildMap() {
  const mc = document.createElement('canvas'); mc.width = mc.height = NV; const mctx = mc.getContext('2d'), img = mctx.createImageData(NV, NV), H = T.H, c = new THREE.Color();
  for (let j = 0; j < NV; j++) for (let i = 0; i < NV; i++) {
    const o = j * NV + i, x = -HALF + i * CELL, z = -HALF + j * CELL, h = H[o];
    const hx = (H[j * NV + Math.min(NV - 1, i + 1)] - H[j * NV + Math.max(0, i - 1)]) / (2 * CELL), hz = (H[Math.min(NV - 1, j + 1) * NV + i] - H[Math.max(0, j - 1) * NV + i]) / (2 * CELL);
    groundColor(x, z, h, Math.hypot(hx, hz), c); if (h < 0) c.setHex(0x3a9ad8);
    const sh = clamp(1 - (hx + hz) * 0.35, 0.55, 1.35), hex = c.getHex();
    img.data[o * 4] = Math.min(255, ((hex >> 16) & 255) * sh); img.data[o * 4 + 1] = Math.min(255, ((hex >> 8) & 255) * sh); img.data[o * 4 + 2] = Math.min(255, (hex & 255) * sh); img.data[o * 4 + 3] = 255;
  }
  mctx.putImageData(img, 0, 0); MAP.canvas = mc;
  MAP.pois = [{ type: 'village', x: 0, z: 0, name: 'Lanternrest' }, ...WAYSTONES.map((w) => ({ type: 'way', id: w.id, x: w.x, z: w.z, name: w.name })),
    ...Object.values(SHRINES).map((s) => ({ type: 'shrine', id: s.id, x: s.x, z: s.z, name: s.name, el: s.el })), ...KZONES.map((k) => ({ type: 'grove', x: k.x, z: k.z, name: 'Kith grove' })),
    { type: 'grove', x: SPRINGS.x, z: SPRINGS.z, name: 'Hot springs' }, ...RIFTS.map((r) => ({ type: 'rift', id: r.id, x: r.x, z: r.z, name: 'Hush Rift' }))];
}

// ---------------------------------------------------------------- pieces set out in Blender
// tools/world/blender.py writes assets/world/placed.json (where each piece stands) and the pieces
// themselves as assets/models/kit/<name>.glb. Without that file, nothing is placed.
const PLACED = { kit: {}, items: [] };
export async function loadPlaced() {
  let j = null;
  try { const r = await fetch('assets/world/placed.json'); if (r.ok) j = await r.json(); } catch (e) { /* none yet */ }
  if (!j || !j.placed || !j.placed.length) return;
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js'), loader = new GLTFLoader();
  await Promise.all([...new Set(j.placed.map((p) => p.kit))].map(async (k) => {
    const info = j.kit && j.kit[k]; if (!info) return;
    try {
      const scene = (await loader.loadAsync('assets/' + info.file)).scene;
      scene.traverse((o) => {   // drawn in the game's own matte style; glowing parts stay lit at night
        if (!o.isMesh) return; const m = o.material, glows = m.emissive && m.emissive.getHex() !== 0;
        o.material = glows ? new THREE.MeshBasicMaterial({ color: m.color, map: m.map }) : new THREE.MeshLambertMaterial({ color: m.color, map: m.map, flatShading: true });
        o.castShadow = true; o.receiveShadow = true;
      });
      PLACED.kit[k] = { scene, solid: info.solid !== 0, radius: info.radius || 0, box: new THREE.Box3().setFromObject(scene) };
    } catch (e) { console.warn('Could not load the kit piece ' + k, e); }
  }));
  for (const p of j.placed) {
    const k = PLACED.kit[p.kit]; if (!k) continue; const s = p.s || [1, 1, 1];
    p.r = Math.hypot(k.box.max.x - k.box.min.x, k.box.max.z - k.box.min.z) / 2 * Math.max(s[0], s[2]); PLACED.items.push(p);
  }
}

// ---------------------------------------------------------------- regions
const built = {};
export function getRegion(id) { if (!built[id]) { built[id] = new Region(id); built[id].build(); } return built[id]; }

class Region {
  constructor(id) {
    Object.assign(this, { id, kind: 'overworld', slope: true, group: new THREE.Group(), interactables: [], zones: [], veils: [], spinners: [], npcs: [], shards: [], propMeshes: [], canopy: [], way: {}, chests: [], spots: [], zoneT: 0, veilMsgT: 0, exitT: 0 });
  }
  heightAt(x, z) { return heightAt(x, z); }
  gradAt(x, z) { return { x: (heightAt(x + 0.6, z) - heightAt(x - 0.6, z)) / 1.2, z: (heightAt(x, z + 0.6) - heightAt(x, z - 0.6)) / 1.2 }; }
  biomeAt(x, z) { return regionAt(x, z); }
  env(pos) { const { b, w } = regionBlend(pos.x, pos.z); return { a: BIOME.meadow, b: BIOME[b], w, fogNear: 45, fogFar: 235, hush: this.hushAt(pos.x, pos.z) }; }
  camBlocked(p) { return p.y < heightAt(p.x, p.z) + 0.5; }
  resolve(pos, r, ent) {
    pos.x = clamp(pos.x, -282, 282); pos.z = clamp(pos.z, -282, 282);
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
  }
  mine(x, z) { return regionAt(x, z) === this.id; }
  // where you can stand while this region is loaded: its own ground and its passes. Its edges run
  // along the mountain crests, so you can climb a range to the top but not down the far side.
  allowed(x, z) { return regionAt(x, z) === this.id || (inPass(x, z) && (this.id === 'meadow' || outerOf(x, z) === this.id)); }

  build() {
    const id = this.id, g = this.group, R = rng(20261115 + REGION_NAMES.indexOf(id) * 7919), idx = REGION_NAMES.indexOf(id), H = T.H;
    // which cells to draw: this region, its passes, and a band beyond (the far side of its ranges)
    const own = new Uint8Array(NV * NV);
    for (let j = 0; j < NV; j++) for (let i = 0; i < NV; i++) {
      const o = j * NV + i, x = -HALF + i * CELL, z = -HALF + j * CELL;
      own[o] = T.regions[o] === idx || (inPass(x, z) && (id === 'meadow' || outerOf(x, z) === id)) ? 1 : 0;
    }
    const draw = new Uint8Array(NV * NV), tmp = new Uint8Array(NV * NV), K = Math.round(48 / CELL);   // grow by 48 units (a square): the far flank of every range
    for (let j = 0; j < NV; j++) { let last = -1e9; for (let i = 0; i < NV; i++) { if (own[j * NV + i]) last = i; tmp[j * NV + i] = i - last <= K ? 1 : 0; } last = 1e9; for (let i = NV - 1; i >= 0; i--) { if (own[j * NV + i]) last = i; if (last - i <= K) tmp[j * NV + i] = 1; } }
    for (let i = 0; i < NV; i++) { let last = -1e9; for (let j = 0; j < NV; j++) { if (tmp[j * NV + i]) last = j; draw[j * NV + i] = j - last <= K ? 1 : 0; } last = 1e9; for (let j = NV - 1; j >= 0; j--) { if (tmp[j * NV + i]) last = j; if (last - j <= K) draw[j * NV + i] = 1; } }
    let i0 = NV, i1 = 0, j0 = NV, j1 = 0;
    for (let j = 0; j < NV; j++) for (let i = 0; i < NV; i++) if (draw[j * NV + i]) { if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j; }
    const W = i1 - i0 + 1, D = j1 - j0 + 1; this.box = { x0: -HALF + i0 * CELL, x1: -HALF + i1 * CELL, z0: -HALF + j0 * CELL, z1: -HALF + j1 * CELL };
    // ---- terrain mesh for the box, drawing only the chosen cells
    const pos = new Float32Array(W * D * 3), col = new Float32Array(W * D * 3), reg = new Float32Array(W * D * 4), c = new THREE.Color(), slot = { ember: 0, tide: 1, storm: 2, gloam: 3 };
    this.vEdge = new Float32Array(W * D); this.vLab = new Uint8Array(W * D);
    for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) {
      const gi = i0 + i, gj = j0 + j, go = gj * NV + gi, o = j * W + i, x = -HALF + gi * CELL, z = -HALF + gj * CELL, h = H[go];
      const hx = (H[gj * NV + Math.min(NV - 1, gi + 1)] - H[gj * NV + Math.max(0, gi - 1)]) / (2 * CELL), hz = (H[Math.min(NV - 1, gj + 1) * NV + gi] - H[Math.max(0, gj - 1) * NV + gi]) / (2 * CELL);
      groundColor(x, z, h, Math.hypot(hx, hz), c);
      pos[o * 3] = x; pos[o * 3 + 1] = h; pos[o * 3 + 2] = z; col[o * 3] = c.r; col[o * 3 + 1] = c.g; col[o * 3 + 2] = c.b;
      const rb = regionBlend(x, z); reg[o * 4 + slot[rb.b]] = rb.w;
      this.vLab[o] = T.regions[go]; this.vEdge[o] = T.regions[go] === 0 ? meadowEdge(Math.hypot(x, z)) : 1;
    }
    const tris = []; for (let j = 0; j < D - 1; j++) for (let i = 0; i < W - 1; i++) {
      if (!draw[(j0 + j) * NV + i0 + i]) continue; const a = j * W + i, b = a + W, d = a + 1, cc = b + 1; tris.push(a, b, d, b, cc, d);
    }
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); tg.setAttribute('color', new THREE.BufferAttribute(col, 3)); tg.setIndex(tris); tg.computeBoundingSphere();
    const tmat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    if (ART.ground) { // custom ground texture, tinted by the biome colours
      const uv = new Float32Array(W * D * 2), sz = ART.ground.size; for (let o = 0; o < W * D; o++) { uv[o * 2] = pos[o * 3] / sz; uv[o * 2 + 1] = pos[o * 3 + 2] / sz; }
      tg.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); tmat.map = ART.ground.tex;
    } else if (ART.groundTex) groundShader(tg, tmat, reg);
    const terrain = new THREE.Mesh(tg, tmat); terrain.receiveShadow = true; g.add(terrain);
    const bw = this.box.x1 - this.box.x0, bd = this.box.z1 - this.box.z0;
    const water = new THREE.Mesh(new THREE.PlaneGeometry(bw, bd).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3aa8e0, transparent: true, opacity: 0.7, emissive: 0x0a3a5a }));
    water.position.set((this.box.x0 + this.box.x1) / 2, 0, (this.box.z0 + this.box.z1) / 2); g.add(water);
    this.draw = draw; this.i0 = i0; this.j0 = j0;
    this.collectSpots();
    this.buildProps(g, R);
    this.buildPlaced(g);
    if (id === 'meadow') this.buildVillage(g);
    this.buildPois(g, R);
    if (id === 'ember') this.buildVolcano(g);
    this.setupHush(tg.attributes.color);
  }

  // places in this region that plants and shards keep clear of
  collectSpots() {
    const add = (x, z, r) => { if (this.mine(x, z) || inPass(x, z)) this.spots.push({ x, z, r }); };
    for (const w of WAYSTONES) add(w.x, w.z, 7); for (const id in SHRINES) add(SHRINES[id].x, SHRINES[id].z, 11);
    for (const c of CAMPS) add(c.x, c.z, 13); for (const k of KZONES) add(k.x, k.z, 12); for (const r of RIFTS) add(r.x, r.z, 9);
    for (const e of EXTRA_ZONES) add(e.x, e.z, 6); add(SPRINGS.x, SPRINGS.z, 10); if (this.id === 'meadow') add(0, 0, 34);
    for (const p of PLACED.items) add(p.x, p.z, p.r + 1);
  }
  free(x, z, pad) { for (const f of this.spots) if (Math.hypot(x - f.x, z - f.z) < f.r + pad) return false; return true; }
  okSpot(x, z, water) {
    if (!this.mine(x, z) || inPass(x, z) || Math.max(Math.abs(x), Math.abs(z)) > 278 || roadAt(x, z) > 0.2) return false;
    const h = heightAt(x, z); if (!water && h < 0.45) return false; if (water && (h > 0.8 || h < -0.6)) return false;
    if (this.id === 'ember' && Math.hypot(x - VOLCANO.x, z - VOLCANO.z) < VOLCANO.rim + 3) return false;
    const gr = this.gradAt(x, z); return Math.hypot(gr.x, gr.z) < 0.7;
  }
  buildProps(g, R) {
    const id = this.id, dummy = new THREE.Object3D(), tmpC = new THREE.Color(), b = this.box;
    const rx = () => lerp(b.x0, b.x1, R()), rz = () => lerp(b.z0, b.z1, R());
    for (const def of PROPS[id]) {
      const pts = [];
      for (let t = 0; t < def.n * 16 && pts.length < def.n; t++) {
        const x = rx(), z = rz();
        if (!this.okSpot(x, z, def.water) || !this.free(x, z, def.r > 0 ? 2.5 : 0)) continue;
        const s = lerp(def.s[0], def.s[1], R()); pts.push({ x, z, h: heightAt(x, z), s, rot: R() * 6.28, v: R() });
        if (def.r > 0) addCircle(x, z, def.r * s);
      }
      for (const part of def.parts) {
        const [geo, color, sc, yo, gl] = part;
        const im = new THREE.InstancedMesh(PG[geo], gl ? new THREE.MeshBasicMaterial({ color: 0xffffff }) : new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), Math.max(1, pts.length));
        im.count = pts.length;
        pts.forEach((p, i) => {
          dummy.position.set(p.x, p.h + yo * p.s - 0.08, p.z); dummy.rotation.set(0, p.rot, 0); dummy.scale.set(sc[0] * p.s, sc[1] * p.s, sc[2] * p.s); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix);
          tmpC.setHex(def.flower ? FLOWERS[Math.floor(p.v * FLOWERS.length)] : color).multiplyScalar(0.85 + p.v * 0.3); im.setColorAt(i, tmpC);
        });
        im.castShadow = !gl && def.r > 0; im.receiveShadow = false; im.frustumCulled = false; g.add(im); this.propMeshes.push({ im, biome: id });
      }
    }
    const grassMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, side: THREE.DoubleSide });
    const grass = new THREE.InstancedMesh(PG.blade, grassMat, GRASS[id]); let gi = 0;
    for (let t = 0; t < GRASS[id] * 12 && gi < GRASS[id]; t++) {
      const x = rx(), z = rz(); if (!this.okSpot(x, z, false)) continue;
      const s = 0.7 + R() * 0.9; dummy.position.set(x, heightAt(x, z) - 0.05, z); dummy.rotation.set((R() - 0.5) * 0.4, R() * 6.28, (R() - 0.5) * 0.4); dummy.scale.set(s, s * (0.8 + R() * 0.8), s); dummy.updateMatrix();
      grass.setMatrixAt(gi, dummy.matrix); tmpC.setHex(BIOME[id].grass).multiplyScalar(0.75 + R() * 0.45); grass.setColorAt(gi, tmpC); gi++;
    }
    grass.count = gi; grass.frustumCulled = false; g.add(grass); this.propMeshes.push({ im: grass, biome: id });
  }

  buildPlaced(g) {
    const v = new THREE.Vector3();
    for (const p of PLACED.items) {
      const di = Math.round((p.x + HALF) / CELL), dj = Math.round((p.z + HALF) / CELL);
      if (di < 0 || dj < 0 || di >= NV || dj >= NV || !this.draw[dj * NV + di]) continue;
      const k = PLACED.kit[p.kit], o = k.scene.clone(), s = p.s || [1, 1, 1];
      o.position.set(p.x, heightAt(p.x, p.z) + (p.lift || 0), p.z); if (p.q) o.quaternion.fromArray(p.q); o.scale.fromArray(s);
      g.add(o); o.updateMatrixWorld(true);
      if (!k.solid || !this.allowed(p.x, p.z)) continue;
      if (k.radius) { addCircle(p.x, p.z, k.radius * Math.max(s[0], s[2])); continue; }   // a trunk: just round its origin
      // its footprint, as a row of circles along its longer side
      const b = k.box, w = (b.max.x - b.min.x) * s[0], d = (b.max.z - b.min.z) * s[2], along = w >= d, len = Math.max(w, d), r = Math.max(0.3, Math.min(w, d) / 2);
      const n = Math.max(1, Math.ceil((len - 2 * r) / (r * 1.2)) + 1), cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : (i / (n - 1) - 0.5) * (len - 2 * r);
        v.set(along ? cx + t / s[0] : cx, 0, along ? cz : cz + t / s[2]).applyMatrix4(o.matrixWorld); addCircle(v.x, v.z, r);
      }
    }
  }

  // remember every colour as built, and how much each terrain vertex and meadow plant sits toward the
  // meadow's edge, so the Hush can be laid over and lifted cheaply
  setupHush(colAttr) {
    this.terrainCol = colAttr; this.baseCol = colAttr.array.slice();
    const m = new THREE.Matrix4(), v = new THREE.Vector3();
    for (const pm of this.propMeshes) {
      if (!pm.im.instanceColor) continue;
      pm.base = pm.im.instanceColor.array.slice();
      if (pm.biome === 'meadow') { pm.edge = new Float32Array(pm.im.count); for (let i = 0; i < pm.im.count; i++) { pm.im.getMatrixAt(i, m); v.setFromMatrixPosition(m); pm.edge[i] = meadowEdge(Math.hypot(v.x, v.z)); } }
    }
  }
  applyHush() {
    const h = this.hush, hb = REGION_NAMES.map((b) => h[b]), out = this.terrainCol.array, base = this.baseCol;
    for (let o = 0, n = this.vLab.length; o < n; o++) greyed(out, o * 3, base, hb[this.vLab[o]] * this.vEdge[o]);
    this.terrainCol.needsUpdate = true;
    for (const pm of this.propMeshes) {
      if (!pm.base) continue; const arr = pm.im.instanceColor.array, kb = h[pm.biome] || 0;
      for (let i = 0; i < pm.im.count; i++) greyed(arr, i * 3, pm.base, pm.edge ? kb * pm.edge[i] : kb);
      pm.im.instanceColor.needsUpdate = true;
    }
  }
  // how grey the Hush has left this spot (used for the sky, fog and light)
  hushAt(x, z) { if (!this.hush) return 0; const reg = regionAt(x, z); return reg === 'meadow' ? this.hush.meadow * meadowEdge(Math.hypot(x, z)) : this.hush[reg]; }

  buildVillage(g) {
    const y0 = heightAt(0, 0);
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
      const a = deg * Math.PI / 180, r = 23 + (i % 2) * 3, x = Math.cos(a) * r, z = Math.sin(a) * r, h = heightAt(x, z), hut = new THREE.Group(); hut.position.set(x, h - 0.1, z); hut.rotation.y = Math.atan2(-x, -z); g.add(hut);
      mesh(PG.cyl, lit(0xe0d0a8), 6.6, 3, 6.6, 0, 0, 0, hut); mesh(PG.cone, lit(roofs[i]), 8.4, 3, 8.4, 0, 2.9, 0, hut); mesh(PG.box, lit(0x5a3f28), 1.1, 1.9, 0.3, 0, 0, 2.75, hut, false); mesh(PG.box, glow(0xffe0a0), 0.7, 0.7, 0.2, 1.7, 1.3, 2.4, hut, false);
      addCircle(x, z, 3.3);
    });
    // forge, stall, grove pens, well
    const at = (x, z) => { const grp = new THREE.Group(); grp.position.set(x, heightAt(x, z), z); g.add(grp); return grp; };
    const forge = at(-18, -7); mesh(PG.box, lit(0x4a4458), 2.2, 1.1, 1.6, 0, 0, 0, forge); mesh(PG.box, glow(0xff7a3c), 1.4, 0.2, 1, 0, 1.1, 0, forge, false); mesh(PG.cyl, lit(0x3a3340), 0.7, 3, 0.7, -0.7, 1.1, 0, forge); addCircle(-18, -7, 1.4);
    const stall = at(16, 11); for (const [x, z] of [[-1.3, -1], [1.3, -1], [-1.3, 1], [1.3, 1]]) mesh(PG.cyl, lit(0x6b4a2b), 0.18, 2.4, 0.18, x, 0, z, stall); mesh(PG.box, lit(0xd0562e), 3.2, 0.2, 2.6, 0, 2.4, 0, stall); mesh(PG.box, lit(0x8a6a3a), 2.8, 1, 0.8, 0, 0, -0.8, stall); addCircle(16, 11, 1.6);
    const pen = at(-9, 19); for (let i = 0; i < 10; i++) { const a = i / 10 * 6.28; mesh(PG.box, lit(0x8a6a3a), 0.16, 0.9, 0.16, Math.cos(a) * 3, 0, Math.sin(a) * 3, pen); const b = mesh(PG.box, lit(0x8a6a3a), 1.9, 0.12, 0.1, Math.cos(a + 0.314) * 2.9, 0.6, Math.sin(a + 0.314) * 2.9, pen, false); b.rotation.y = -(a + 0.314) + Math.PI / 2; }
    const well = at(-16, 12); mesh(PG.cyl, lit(0x8b9088), 2.6, 1, 2.6, 0, 0, 0, well); mesh(PG.cyl, new THREE.MeshBasicMaterial({ color: 0x08060f }), 1.9, 0.1, 1.9, 0, 0.98, 0, well, false);
    for (const sx of [-1, 1]) mesh(PG.cyl, lit(0x6b4a2b), 0.2, 2.6, 0.2, sx * 1.1, 0.9, 0, well); mesh(PG.cone, lit(0x5a3f78), 3.2, 1.2, 3.2, 0, 3.4, 0, well); addCircle(-16, 12, 1.5);
    this.interactables.push({ pos: new THREE.Vector3(-16, well.position.y, 12), r: 3.4, label: () => (G.save.relics.cinders ? 'Descend into the Abyss' : 'Examine the well'), use: () => G.game.useWell() });
    // NPCs
    for (const n of NPCS) {
      const m = makeNpcModel(n.look, n.id); const y = heightAt(n.x, n.z); m.root.position.set(n.x, y, n.z); m.root.rotation.y = Math.atan2(-n.x * 0.35, 1); g.add(m.root);
      this.npcs.push({ id: n.id, m, t: rand(10) }); addCircle(n.x, n.z, 0.6);
      this.interactables.push({ pos: new THREE.Vector3(n.x, y, n.z), r: 2.9, label: 'Talk to ' + n.name, cond: () => !(G.trials && G.trials.hidden === n.id), use: () => G.game.talk(n.id) });
    }
    // veils across the passes (the meadow side of each)
    for (const b in PASS) {
      const p = PASS[b], y = heightAt(p.x, p.z), isX = p.ax === 'x';
      const mat = new THREE.MeshBasicMaterial({ color: 0x1a0f30, transparent: true, opacity: 0.82, side: THREE.DoubleSide, depthWrite: false });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(58, 46), mat); m.position.set(p.x, y + 16, p.z); m.rotation.y = isX ? Math.PI / 2 : 0; g.add(m);
      this.veils.push({ biome: b, ax: p.ax, cx: p.x, cz: p.z, x0: isX ? p.x - 1.5 : p.x - 28, x1: isX ? p.x + 1.5 : p.x + 28, z0: isX ? p.z - 28 : p.z - 1.5, z1: isX ? p.z + 28 : p.z + 1.5, mesh: m, mat, open: false, y });
    }
  }

  buildPois(g, R) {
    for (const w of WAYSTONES) {
      if (!this.mine(w.x, w.z)) continue;
      const y = heightAt(w.x, w.z), grp = new THREE.Group(); grp.position.set(w.x, y, w.z); g.add(grp);
      mesh(PG.cyl, lit(0x7b8090), 3, 0.4, 3, 0, -0.05, 0, grp); mesh(PG.box, lit(0x8b90a0), 0.9, 3.4, 0.9, 0, 0.3, 0, grp);
      const cm = glow(0x556070), crystal = mesh(PG.oct, cm, 0.8, 1.2, 0.8, 0, 4.1, 0, grp, false); mesh(PG.box, cm, 0.94, 0.5, 0.94, 0, 2.2, 0, grp, false);
      addCircle(w.x, w.z, 0.9); this.way[w.id] = { cm, crystal, grp };
      this.interactables.push({ pos: new THREE.Vector3(w.x, y, w.z), r: 3.3, label: () => (G.save.waystones[w.id] ? 'Rest at Waystone' : 'Awaken Waystone'), use: () => G.game.useWaystone(w.id) });
    }
    for (const id in SHRINES) {
      const s = SHRINES[id]; if (!this.mine(s.x, s.z)) continue;
      const y = heightAt(s.x, s.z), grp = new THREE.Group(), col = EL[s.el].color; grp.position.set(s.x, y, s.z); grp.rotation.y = Math.atan2(-s.x, -s.z); g.add(grp);
      for (const sx of [-1, 1]) { mesh(PG.box, lit(0x6f7484), 1.3, 7, 1.3, sx * 3, 0, 0, grp); mesh(PG.oct, glow(col), 0.8, 1.2, 0.8, sx * 3, 7.1, 0, grp, false); }
      mesh(PG.box, lit(0x6f7484), 8.6, 1.1, 1.6, 0, 6.2, 0, grp); mesh(PG.cyl, lit(0x7b8090), 9, 0.3, 9, 0, -0.1, 0, grp);
      const pm = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.6, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
      const portal = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 5.8), pm); portal.position.set(0, 3.1, 0); grp.add(portal);
      const a = grp.rotation.y; for (const sx of [-1, 1]) addCircle(s.x + Math.cos(a) * sx * 3, s.z - Math.sin(a) * sx * 3, 0.9);
      this.spinners.push({ kind: 'portal', pm, x: s.x, y: y + 3, z: s.z, col });
      this.interactables.push({ pos: new THREE.Vector3(s.x, y, s.z), r: 4.2, label: 'Enter the ' + s.name.replace(/^The /, ''), use: () => G.game.enterShrine(id) });
    }
    // enemy camps (with a totem and a chest) and Kith groves
    CAMPS.forEach((c, i) => {
      if (!this.mine(c.x, c.z)) return;
      const biome = this.id, col = EL[BIOME[biome].el].color, y = heightAt(c.x, c.z), grp = new THREE.Group(); grp.position.set(c.x, y, c.z); g.add(grp);
      mesh(PG.cone, lit(0x231f2e), 1.6, 5, 1.6, 0, 0, 0, grp); mesh(PG.oct, glow(col), 0.7, 1, 0.7, 0, 5, 0, grp, false);
      for (let k = 0; k < 5; k++) { const a = k / 5 * 6.28 + 0.4; const sp = mesh(PG.cone, lit(0x231f2e), 0.7, 2 + (k % 2), 0.7, Math.cos(a) * 10, 0, Math.sin(a) * 10, grp); sp.rotation.z = Math.cos(a) * 0.25; sp.rotation.x = -Math.sin(a) * 0.25; }
      addCircle(c.x, c.z, 0.9);
      this.zones.push({ kind: 'camp', x: c.x, z: c.z, r: 8, lvl: c.lvl, list: c.list, biome, spawned: false, alive: [], respawnAt: 0 });
      const id = 'c' + i, cx = c.x + 6.5, cz = c.z + 4.5, cy = heightAt(cx, cz), ch = new THREE.Group(); ch.position.set(cx, cy, cz); ch.rotation.y = R() * 6.28; g.add(ch);
      mesh(PG.box, lit(0x7a4a2a), 1.3, 0.7, 0.9, 0, 0, 0, ch); mesh(PG.box, lit(0xffd24a), 1.36, 0.12, 0.96, 0, 0.3, 0, ch, false);
      const lid = new THREE.Group(); lid.position.set(0, 0.7, -0.45); ch.add(lid); mesh(PG.box, lit(0x8a5a34), 1.3, 0.3, 0.9, 0, 0, 0.45, lid);
      addCircle(cx, cz, 0.8);
      const chest = { id, lid, opened: false, reward: { motes: 40 + c.lvl * 12, threads: i % 3 === 0 ? 3 : 0, sigil: i % 5 === 2 ? 1 : 0 } };
      this.chests.push(chest);
      this.interactables.push({ pos: new THREE.Vector3(cx, cy, cz), r: 2.6, label: 'Open chest', cond: () => !G.save.chests[id], use: () => { G.game.openChest(chest); } });
    });
    for (const kz of KZONES) {
      if (!this.mine(kz.x, kz.z)) continue;
      const y = heightAt(kz.x, kz.z), grp = new THREE.Group(); grp.position.set(kz.x, y, kz.z); g.add(grp);
      for (let k = 0; k < 7; k++) { const a = k / 7 * 6.28; mesh(PG.rock, lit(0xcfd6d8), 0.9, 1.4 + (k % 3) * 0.5, 0.9, Math.cos(a) * 11, 0, Math.sin(a) * 11, grp); }
      this.zones.push({ kind: 'kith', x: kz.x, z: kz.z, r: 9, biome: this.id, spawned: false, alive: [], respawnAt: 0 });
    }
    for (const ez of EXTRA_ZONES) if (this.mine(ez.x, ez.z)) this.zones.push({ ...ez, biome: this.id, spawned: false, alive: [], respawnAt: 0 });
    if (this.mine(SPRINGS.x, SPRINGS.z)) { // the Emberridge hot springs: three steaming pools in a ring of pale rocks
      const y = heightAt(SPRINGS.x, SPRINGS.z), grp = new THREE.Group(); grp.position.set(SPRINGS.x, y, SPRINGS.z); g.add(grp);
      const pool = new THREE.CylinderGeometry(1, 1, 0.2, 18), water = new THREE.MeshLambertMaterial({ color: 0x5fd0d8, emissive: 0x1f6a70, transparent: true, opacity: 0.88 }), rim = lit(0x8a7a6a);
      const pools = [[0, 0, 3.2], [4.8, 2.6, 1.8], [-3.8, 3.6, 1.5]];
      for (const [px, pz, pr] of pools) { const w = new THREE.Mesh(pool, water); w.scale.set(pr, 1, pr); w.position.set(px, 0.12, pz); grp.add(w); const e = new THREE.Mesh(pool, rim); e.scale.set(pr + 0.35, 1, pr + 0.35); e.position.set(px, 0.04, pz); grp.add(e); }
      for (let k = 0; k < 7; k++) { const a = k / 7 * 6.28 + 0.3; mesh(PG.rock, lit(0xd8cfc0), 0.9, 1.1 + (k % 3) * 0.4, 0.9, Math.cos(a) * 9, 0, Math.sin(a) * 9, grp); }
      this.steam = pools.map(([px, pz, pr]) => ({ x: SPRINGS.x + px, y: y + 0.3, z: SPRINGS.z + pz, r: pr }));
    }
    RIFTS.forEach((r, i) => {
      if (!this.mine(r.x, r.z)) return;
      const y = heightAt(r.x, r.z), m = mesh(PG.oct, glow(0x7a3ad8, 0.85), 1.5, 4.4, 1.5, r.x, y + 0.8, r.z, g, false);
      mesh(PG.cyl, lit(0x231f2e), 5, 0.3, 5, r.x, y - 0.1, r.z, g);
      this.spinners.push({ kind: 'rift', mesh: m, x: r.x, y: y + 3, z: r.z });
      this.interactables.push({ pos: new THREE.Vector3(r.x, y, r.z), r: 4, label: () => (G.save.rifts[r.id] ? 'Re-enter Hush Rift' : 'Enter Hush Rift'), use: () => G.game.enterRift(r.id, i) });
    });
    // Echo Shards: this region's share, on ground you can reach (the last one may need a jump)
    const beamGeo = new THREE.CylinderGeometry(0.1, 0.1, 30, 5).translate(0, 15, 0), b = this.box;
    let start = 0; for (const [rb, n] of SHARD_PLAN) { if (rb === this.id) break; start += n; }
    const count = SHARD_PLAN.find(([rb]) => rb === this.id)[1];
    for (let k = 0; k < count; k++) {
      const wantJump = k === count - 1;
      for (let t = 0; t < 6000; t++) {
        const x = lerp(b.x0, b.x1, R()), z = lerp(b.z0, b.z1, R());
        if (!this.mine(x, z) || inPass(x, z) || Math.max(Math.abs(x), Math.abs(z)) > 270 || roadAt(x, z) > 0.5) continue;
        if (this.id === 'meadow' && Math.hypot(x, z) < 45) continue;
        const reach = reachAt(x, z); if (reach === 0 || (wantJump && t < 3000 ? reach < 2 : reach !== 1 && !wantJump)) continue;
        const h = heightAt(x, z), gr = this.gradAt(x, z); if (h < 0.6 || Math.hypot(gr.x, gr.z) > 0.6) continue;
        if (this.shards.some((s) => Math.hypot(s.x - x, s.z - z) < 45) || !this.free(x, z, 14)) continue;
        const grp = new THREE.Group(); grp.position.set(x, h, z); g.add(grp);
        const gem = mesh(PG.oct, glow(0xd8f6ff), 0.7, 1.1, 0.7, 0, 0.9, 0, grp, false);
        grp.add(new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0x9adfff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false })));
        this.shards.push({ id: 's' + (start + k), biome: this.id, x, z, y: h, grp, gem, taken: false }); break;
      }
    }
  }

  // Emberridge's crater: a glowing lava lake round the shrine's island (touching it burns, and throws
  // you back to the last safe ground)
  buildVolcano(g) {
    const V = VOLCANO, mat = new THREE.MeshBasicMaterial({ color: 0xff6a1a });
    const lava = new THREE.Mesh(new THREE.CircleGeometry(V.rim + 1, 48).rotateX(-Math.PI / 2), mat); lava.position.set(V.x, V.lava, V.z); g.add(lava);
    const light = new THREE.PointLight(0xff7a2a, 90, 70, 1.4); light.position.set(V.x, V.lava + 10, V.z); g.add(light);
    // until you have stood somewhere safe, the lava throws you to the top of the causeway on the rim
    let rim = null; for (let a = 0; a < 6.28 && !rim; a += 0.02) { const x = V.x + Math.cos(a) * (V.rim + 3), z = V.z + Math.sin(a) * (V.rim + 3); if (roadAt(x, z) > 0.6) rim = new THREE.Vector3(x, heightAt(x, z), z); }
    this.lava = { mat, light, rim: rim || new THREE.Vector3(V.x, V.islandH, V.z), safe: null, cd: 0 };
  }
  updateVolcano(dt, t) {
    const L = this.lava, V = VOLCANO, p = G.player; if (!L) return;
    L.mat.color.setRGB(1, 0.38 + 0.08 * Math.sin(t * 1.7), 0.08); L.light.intensity = 80 + 20 * Math.sin(t * 2.3);
    if (Math.random() < dt * 18) { const a = rand(6.28), r = rand(V.island + 1, V.rim); fx.spawn(V.x + Math.cos(a) * r, V.lava + 0.2, V.z + Math.sin(a) * r, 0, rand(1, 3), 0, rand() < 0.5 ? 0xffb03a : 0xff5a1a, 0.5, 1.2, 0); }
    L.cd -= dt;
    const inCrater = Math.hypot(p.pos.x - V.x, p.pos.z - V.z) < V.rim + 1;
    if (inCrater && p.pos.y < V.lava + 0.25 && !p.dead) {
      if (L.cd <= 0) { L.cd = 1; p.takeHit(p.maxHp * 0.2, { unblockable: true, el: 'ember', noStagger: true }); G.ui.toast('The lava throws you back!'); audio.sfx('fire'); }
      if (!p.dead) { p.pos.copy(L.safe || L.rim); p.vel.set(0, 0, 0); }
    } else if (p.grounded && !p.dead) { (L.safe ||= p.pos.clone()).copy(p.pos); }
  }

  // sync this region with the save (called on entering it and after progress)
  refresh() {
    const s = G.save; if (!s) return;
    for (const v of this.veils) { v.open = !!s.shrines[VEIL_REQ[v.biome]]; v.mesh.visible = !v.open; }
    for (const id in this.way) this.way[id].cm.color.set(s.waystones[id] ? 0x6ff0ff : 0x556070);
    for (const sh of this.shards) { sh.taken = !!s.shards[sh.id]; sh.grp.visible = !sh.taken; }
    for (const c of this.chests) { c.opened = !!s.chests[c.id]; c.lid.rotation.x = c.opened ? -1.9 : 0; }
    if (this.lanterns) { // the Lantern Tree relights as the story goes: one lantern left at the start, all nine at the end
      const lit = [1, 3, 5, 6, 8, 9][Math.min(5, Object.keys(s.shrines).length)], order = [0, 5, 3, 7, 1, 6, 4, 8, 2];
      this.lanterns.forEach((m, i) => { m.material = order[i] < lit ? this.lanternOn : this.lanternOff; });
      this.treeLight.intensity = 15 + 45 * lit / 9;
    }
    // the Hush lifts from woken regions (snapped when entering, animated after that), and the music grows
    const target = {}; for (const b of REGION_NAMES) target[b] = s.shrines[HUSH_SHRINE[b]] ? 0 : HUSH_MAX[b];
    if (!this.hush || this.hushSave !== s) { this.hush = target; this.hushSave = s; this.hushTarget = null; this.applyHush(); } else this.hushTarget = target;
    audio.setSong(Object.keys(s.shrines).length);
  }
  resetZones() { for (const z of this.zones) { z.spawned = false; z.alive = []; } }
  respawnAll() { for (const z of this.zones) { for (const e of z.alive) if (!e.dead) e.remove(); z.alive = []; z.spawned = false; z.respawnAt = 0; } }

  spawnZone(z) {
    z.spawned = true; z.alive = []; const B = BIOME[z.biome];
    if (z.kind === 'camp') {
      for (const t of z.list) { const a = rand(6.28), d = rand(Math.min(2.5, z.r * 0.5), z.r); z.alive.push(spawnEnemy(t, z.x + Math.cos(a) * d, z.z + Math.sin(a) * d, z.lvl, B.el)); }
    } else {
      const n = z.n || 2 + (Math.random() < 0.45 ? 1 : 0);
      for (let i = 0; i < n; i++) { const a = rand(6.28), d = rand(Math.min(1, z.r), z.r), sp = weighted(z.table || KTABLE[z.biome]); const lvl = z.lvl || B.lvl[0] + Math.floor(Math.random() * (B.lvl[1] - B.lvl[0] + 1)); z.alive.push(spawnWild(sp, z.x + Math.cos(a) * d, z.z + Math.sin(a) * d, lvl)); }
    }
  }

  update(dt, t) {
    const p = G.player.pos, s = G.save;
    this.zoneT -= dt;
    if (this.zoneT <= 0) {
      this.zoneT = 0.4;
      for (const z of this.zones) {
        const d = Math.hypot(p.x - z.x, p.z - z.z);
        if (!z.spawned) { if (d < 72 && s.playtime >= z.respawnAt && (!z.cond || ZONE_COND[z.cond](s))) this.spawnZone(z); }
        else {
          z.alive = z.alive.filter((e) => !e.dead && !e.gone);
          if (z.alive.length === 0) { z.spawned = false; z.respawnAt = s.playtime + (z.kind === 'camp' ? 420 : 100); }
          else if (d > 128) { for (const e of z.alive) e.remove(); z.alive = []; z.spawned = false; }
          else if (z.kind === 'kith' && d < 26) for (const e of z.alive) if (!s.dex[e.species]) { s.dex[e.species] = 1; G.game.tip('kith'); }
        }
      }
    }
    if (this.hushTarget) {   // colour flooding back into a woken region
      let moving = false, moved = 0;
      for (const b of REGION_NAMES) { const d = this.hushTarget[b] - this.hush[b]; if (Math.abs(d) > 0.0005) { const st = Math.sign(d) * Math.min(Math.abs(d), dt * 0.2); this.hush[b] += st; moved += Math.abs(st); moving = true; } }
      this.hushMoved = (this.hushMoved || 0) + moved;
      if (!moving || this.hushMoved > 0.02) { this.applyHush(); this.hushMoved = 0; }
      if (!moving) this.hushTarget = null;
    }
    if (this.steam && Math.hypot(p.x - SPRINGS.x, p.z - SPRINGS.z) < 90 && Math.random() < dt * 14) {
      const v = this.steam[Math.floor(Math.random() * this.steam.length)], a = rand(6.28), d = rand(0, v.r * 0.8);
      fx.spawn(v.x + Math.cos(a) * d, v.y, v.z + Math.sin(a) * d, rand(-0.2, 0.2), rand(0.9, 1.6), rand(-0.2, 0.2), 0xf2f6f8, 0.9, 1.8, 0);
    }
    if (this.lava) this.updateVolcano(dt, t);
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
    if (this.canopy.length) { // let the Lantern Tree's canopy go see-through when the hero walks behind it in the fixed view
      const behind = G.opts.camera !== 'free' && p.z < 2 && p.z > -17 && Math.abs(p.x) < 9.5;
      for (const cm of this.canopy) cm.opacity += ((behind ? 0.22 : 1) - cm.opacity) * Math.min(1, dt * 6);
    }
    for (const n of this.npcs) { n.t += dt; if (Math.hypot(p.x - n.m.root.position.x, p.z - n.m.root.position.z) < 50) animate(n.m, { t: n.t, run: 0 }, dt); }
    // walking far enough into a pass loads the region beyond
    this.exitT -= dt;
    if (this.exitT <= 0 && !G.player.dead) for (const e of EXITS[this.id]) if (e.at(p.x, p.z)) { this.exitT = 2; G.game.changeRegion(e.to); break; }
  }
}
