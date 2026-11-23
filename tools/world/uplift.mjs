// Mountains from tectonic uplift and river erosion (the stream power law), solved with the implicit
// method of Braun and Willett (2013), as in FastScape and in Cordonnier et al. (2016), "Large Scale
// Terrain Generation from Tectonic Uplift and Fluvial Erosion".
//
// Every step, the ground rises by the uplift map U, and each cell is cut down by its river:
//   erosion = K * A^m * S          (A: the area draining through the cell, S: its downhill slope)
// so big rivers carve deep valleys and the ridges between them stay sharp. Over a few hundred steps
// the uplifted ranges grow into branching ridges, spurs and valleys, as real ones do.
//
// Called by make_world.py: node uplift.mjs <dir>. Reads params.json, U.bin, K.bin, H0.bin (float32)
// and fixed.bin (uint8: base level, where rivers leave the mountains). Writes H.bin and A.bin.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
const P = JSON.parse(readFileSync(join(dir, 'params.json'), 'utf8'));
const f32 = (f) => { const b = readFileSync(join(dir, f)); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); };
const NV = P.NV, n = NV * NV, cell = P.cell, area = cell * cell;
const U = f32('U.bin'), K = f32('K.bin'), h = Float32Array.from(f32('H0.bin')), fixed = readFileSync(join(dir, 'fixed.bin'));
const rcv = new Int32Array(n), dst = new Float32Array(n), A = new Float32Array(n), order = new Uint32Array(n), tmp = new Float32Array(n);
for (let i = 0; i < n; i++) order[i] = i;
const DI = [1, -1, 0, 0, 1, 1, -1, -1], DJ = [0, 0, 1, -1, 1, -1, 1, -1], DD = DI.map((di, k) => Math.hypot(di, DJ[k]) * cell);
const { steps, dt, m, diffusion, talus } = P;

for (let t = 0; t < steps; t++) {
  // where each cell drains: its steepest downhill neighbour (D8)
  for (let j = 0; j < NV; j++) for (let i = 0; i < NV; i++) {
    const c = j * NV + i; let best = c, bs = 0, bd = cell;
    if (!fixed[c]) for (let k = 0; k < 8; k++) {
      const ii = i + DI[k], jj = j + DJ[k]; if (ii < 0 || jj < 0 || ii >= NV || jj >= NV) continue;
      const o = jj * NV + ii, s = (h[c] - h[o]) / DD[k]; if (s > bs) { bs = s; best = o; bd = DD[k]; }
    }
    rcv[c] = best; dst[c] = bd;
  }
  // lowest first: every receiver comes before the cells that drain into it (nearly sorted already)
  order.sort((a, b) => h[a] - h[b]);
  // drainage area, gathered from the top down
  A.fill(area);
  for (let k = n - 1; k >= 0; k--) { const c = order[k], r = rcv[c]; if (r !== c) A[r] += A[c]; }
  // uplift, then the implicit river erosion from the bottom up
  for (let k = 0; k < n; k++) {
    const c = order[k]; if (fixed[c]) continue;
    h[c] += U[c] * dt; const r = rcv[c]; if (r === c) continue;
    const f = K[c] * dt * Math.pow(A[c], m) / dst[c];
    h[c] = (h[c] + f * h[r]) / (1 + f);
  }
  // soil creep rounds off the smallest bumps, and nothing stands steeper than the rock allows
  if (diffusion > 0) {
    tmp.set(h);
    for (let j = 1; j < NV - 1; j++) for (let i = 1; i < NV - 1; i++) {
      const c = j * NV + i; if (fixed[c]) continue;
      h[c] = tmp[c] + diffusion * dt * (tmp[c - 1] + tmp[c + 1] + tmp[c - NV] + tmp[c + NV] - 4 * tmp[c]) / area;
    }
  }
  if (talus > 0) {
    for (let k = 0; k < n; k++) {
      const c = order[k], r = rcv[c]; if (r === c || fixed[c]) continue;
      const lim = h[r] + talus * dst[c]; if (h[c] > lim) h[c] = lim;
    }
  }
}
writeFileSync(join(dir, 'H.bin'), Buffer.from(h.buffer));
writeFileSync(join(dir, 'A.bin'), Buffer.from(A.buffer));
