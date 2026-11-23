// The shape of Vael, made ahead of time by tools/world/make_world.py and loaded at startup: the
// heights of the whole valley, where its roads run, how each spot can be reached (on foot, with a
// jump, with the double jump), and which region each spot belongs to. Regions are loaded one at a
// time (world.js), but they all share these maps and one coordinate system.
export const T = { N: 320, NV: 321, SIZE: 640, HALF: 320, CELL: 2, H: null, roads: null, reach: null, regions: null };
export const REGION_NAMES = ['meadow', 'ember', 'gloam', 'tide', 'storm'];
// the grid: N cells across the SIZE-wide valley (meta.json says how fine the generator made it)
export let N = 320, NV = 321, CELL = 2;
export const HALF = 320;

export async function loadTerrain() {
  const get = async (f) => { const r = await fetch('assets/world/' + f); if (!r.ok) throw new Error('missing assets/world/' + f); return r.arrayBuffer(); };
  const meta = await fetch('assets/world/meta.json').then((r) => (r.ok ? r.json() : { N: 320 }), () => ({ N: 320 }));
  N = meta.N; NV = N + 1; CELL = 2 * HALF / N; Object.assign(T, { N, NV, CELL });
  const [h, ro, re, rg] = await Promise.all(['height.bin', 'roads.bin', 'reach.bin', 'regions.bin'].map(get));
  T.H = new Float32Array(h); T.roads = new Uint8Array(ro); T.reach = new Uint8Array(re); T.regions = new Uint8Array(rg);
}

const cellIndex = (x, z) => { let i = Math.round((x + HALF) / CELL), j = Math.round((z + HALF) / CELL); i = i < 0 ? 0 : i > N ? N : i; j = j < 0 ? 0 : j > N ? N : j; return j * NV + i; };

// ground height, interpolated across the triangle the point is in (matching the terrain mesh)
export function heightAt(x, z) {
  const H = T.H, fx = (x + HALF) / CELL, fz = (z + HALF) / CELL;
  let i = Math.floor(fx), j = Math.floor(fz); i = i < 0 ? 0 : i > N - 1 ? N - 1 : i; j = j < 0 ? 0 : j > N - 1 ? N - 1 : j;
  let u = fx - i, v = fz - j; u = u < 0 ? 0 : u > 1 ? 1 : u; v = v < 0 ? 0 : v > 1 ? 1 : v;
  const o = j * NV + i, h00 = H[o], h10 = H[o + 1], h01 = H[o + NV], h11 = H[o + NV + 1];
  return u + v <= 1 ? h00 + (h10 - h00) * u + (h01 - h00) * v : h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
}
export const regionAt = (x, z) => REGION_NAMES[T.regions[cellIndex(x, z)]];
export const roadAt = (x, z) => T.roads[cellIndex(x, z)] / 255;
export const reachAt = (x, z) => T.reach[cellIndex(x, z)];
// the pass corridors, where the meadow opens into a region without a wall between them
export const inPass = (x, z) => Math.min(Math.abs(x), Math.abs(z)) < 30 && Math.hypot(x, z) > 96 && Math.hypot(x, z) < 168;
