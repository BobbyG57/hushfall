// Prints the places from src/data.js that the world generator must respect (as JSON), so
// make_world.py always uses the same positions as the game.
import * as D from '../../src/data.js';
const pick = (o, ...k) => Object.fromEntries(k.map((x) => [x, o[x]]));
console.log(JSON.stringify({
  waystones: D.WAYSTONES, shrines: Object.values(D.SHRINES).map((s) => pick(s, 'id', 'name', 'x', 'z', 'biome')),
  camps: D.CAMPS.map((c) => pick(c, 'x', 'z')), kzones: D.KZONES, rifts: D.RIFTS,
  extra: D.EXTRA_ZONES.map((z) => pick(z, 'x', 'z', 'kind')), springs: D.SPRINGS, pass: D.PASS,
  rival: D.RIVAL.map((r) => pick(r, 'id', 'x', 'z')), npcs: D.NPCS.map((n) => pick(n, 'id', 'x', 'z')),
  volcano: D.VOLCANO || null,
}));
