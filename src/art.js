// Optional custom art. If assets/art.json exists, the sprites, textures, colours and titles
// it lists replace the built-in look. Without it the game runs exactly as before.
// See CUSTOMIZE.md for the file format.
import * as THREE from 'three';
import { BIOME } from './data.js';

export const ART = { sprites: {}, ground: null, floor: null, title: null, subtitle: null, file: null };

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const hex = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && /^#?[0-9a-f]{6}$/i.test(v) ? parseInt(v.replace('#', ''), 16) : null);
const num = (v, lo, hi, def) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def; };
const safeFile = (f) => typeof f === 'string' && /^\w[\w .\-/]*\.(png|jpe?g|webp|gif)$/i.test(f) && !f.includes('..');

function loadTex(file, pixel, tiling) {
  return new Promise((res) => {
    new THREE.TextureLoader().load('assets/' + file, (t) => {
      t.colorSpace = THREE.SRGBColorSpace; if (pixel) t.magFilter = THREE.NearestFilter;
      if (tiling) t.wrapS = t.wrapT = THREE.RepeatWrapping; else { t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; }
      res(t);
    }, undefined, () => { console.warn('[art] could not load assets/' + file); res(null); });
  });
}

export async function loadArt() {
  // ?art=name loads assets/art.name.json instead, e.g. ?art=example to preview the bundled example
  const name = new URLSearchParams(location.search).get('art');
  const url = 'assets/art' + (name ? '.' + name.replace(/\W/g, '') : '') + '.json';
  let man;
  try { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) return; man = await r.json(); } catch (e) { return; }
  if (!man || typeof man !== 'object') return;
  ART.file = url;
  if (typeof man.title === 'string') ART.title = man.title.slice(0, 40);
  if (typeof man.subtitle === 'string') ART.subtitle = man.subtitle.slice(0, 80);
  const biomes = man.biomes && typeof man.biomes === 'object' ? man.biomes : {};
  for (const b of Object.keys(biomes)) {
    if (!own(BIOME, b) || !biomes[b]) continue;
    for (const k of ['g1', 'g2', 'rock', 'fog', 'skyTop', 'skyBot', 'sun', 'grass']) { const v = hex(biomes[b][k]); if (v !== null) BIOME[b][k] = v; }
  }
  const jobs = [], sprites = man.sprites && typeof man.sprites === 'object' ? man.sprites : {};
  for (const key of Object.keys(sprites)) {
    const d = sprites[key]; if (!d || !safeFile(d.file) || !/^[\w.]{1,40}$/.test(key)) continue;
    jobs.push(loadTex(d.file, d.smooth !== true, false).then((tex) => {
      if (!tex) return;
      const frames = Math.floor(num(d.frames, 1, 16, 1)), rows = Number(d.rows) === 4 ? 4 : 1;
      ART.sprites[key] = { tex, frames, rows, aspect: (tex.image.width / frames) / (tex.image.height / rows), height: num(d.height, 0.2, 20, 0), fps: num(d.fps, 1, 30, 8), faces: d.faces === 'right' ? 'right' : 'front', hover: num(d.hover, 0, 6, 0) };
    }));
  }
  for (const slot of ['ground', 'floor']) {
    const d = man[slot]; if (!d || !safeFile(d.file)) continue;
    jobs.push(loadTex(d.file, d.smooth !== true, true).then((tex) => { if (tex) ART[slot] = { tex, size: num(d.size, 0.5, 64, 4) }; }));
  }
  await Promise.all(jobs);
}
