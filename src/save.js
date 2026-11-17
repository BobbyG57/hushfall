// Save data lives in the browser's localStorage. It can also be packed into a transfer
// link or code to carry a save from one device to another.
import { KITH, SKILLS, SHRINES, WAYSTONES, MAX_LEVEL, MAX_KITH_LEVEL, MAX_BLADE, MAX_VIT, MAX_FLASK } from './data.js';

// add ?slot=name to the address for a separate save file
const slot = new URLSearchParams(location.search).get('slot');
const KEY = 'hushfall_save_v1' + (slot ? '_' + slot.replace(/\W/g, '') : ''), OPT = 'hushfall_opts_v1';
// where transfer links point when they are made from a copy running on this computer
export const PUBLIC_URL = 'https://bobbyg57.github.io/hushfall/';

export function newSave() {
  return {
    v: 1, level: 1, xp: 0, motes: 0, sigils: 0, blade: 0, vit: 0, flask: 0, threads: 5,
    skills: {}, relics: {}, kith: [], party: [], active: 0, nextId: 1, dex: {},
    shrines: {}, waystones: { village: true }, chests: {}, shards: {}, rifts: {}, tips: {}, quest: 0,
    abyssBest: 0, playtime: 0, kills: 0, respawn: 'village',
  };
}
export function loadSave() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 1) return { ...newSave(), ...s }; } catch (e) { /* no save */ }
  return null;
}
export function storeSave(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch (e) { return false; } }
export function wipeSave() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
export function loadOpts(o) { try { Object.assign(o, JSON.parse(localStorage.getItem(OPT)) || {}); } catch (e) { /* ignore */ } }
export function storeOpts(o) { try { localStorage.setItem(OPT, JSON.stringify(o)); } catch (e) { /* ignore */ } }

// ---------------------------------------------------------------- moving a save between devices
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const toB64 = (bytes) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const fromB64 = (str) => { const s = atob(str.replace(/-/g, '+').replace(/_/g, '/')); const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; };
const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

// "H1." + compressed save, or "H0." + plain save where the browser cannot compress
export async function exportCode(save) {
  const json = new TextEncoder().encode(JSON.stringify(save));
  if (typeof CompressionStream !== 'undefined') { try { return 'H1.' + toB64(await pipe(json, new CompressionStream('deflate-raw'))); } catch (e) { /* fall through */ } }
  return 'H0.' + toB64(json);
}
export function transferLink(code) {
  const local = location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  return (local ? PUBLIC_URL : location.origin + location.pathname) + '#save=' + code;
}
// Accepts a bare code or a whole transfer link. The result is rebuilt field by field, so a
// hand-edited or damaged code can at worst produce an odd save, never run anything.
export async function importCode(text) {
  let code = String(text || '').trim(); const m = code.match(/[#?&]save=([A-Za-z0-9._-]+)/); if (m) code = m[1];
  const mm = code.match(/^H([01])\.([A-Za-z0-9_-]{8,40000})$/);
  if (!mm) throw new Error('That does not look like a Hushfall transfer link or code.');
  let obj;
  try {
    let bytes = fromB64(mm[2]); if (mm[1] === '1') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    obj = JSON.parse(new TextDecoder().decode(bytes));
  } catch (e) { throw new Error('That save could not be read. Copy the whole link and try again.'); }
  return sanitize(obj);
}
function sanitize(o) {
  if (!o || typeof o !== 'object' || o.v !== 1) throw new Error('That save is from a different version of the game.');
  const n = (v, lo, hi, def) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def; };
  const i = (v, lo, hi, def) => Math.floor(n(v, lo, hi, def));
  const pick = (src, ok, val = () => true) => { const out = {}; if (src && typeof src === 'object') for (const k of Object.keys(src)) if (ok(k) && src[k]) out[k] = val(src[k]); return out; };
  const s = newSave();
  s.level = i(o.level, 1, MAX_LEVEL, 1); s.xp = n(o.xp, 0, 1e7, 0); s.motes = i(o.motes, 0, 1e8, 0); s.sigils = i(o.sigils, 0, 999, 0);
  s.blade = i(o.blade, 0, MAX_BLADE, 0); s.vit = i(o.vit, 0, MAX_VIT, 0); s.flask = i(o.flask, 0, MAX_FLASK, 0); s.threads = i(o.threads, 0, 999, 0);
  s.quest = i(o.quest, 0, 6, 0); s.abyssBest = i(o.abyssBest, 0, 9999, 0); s.playtime = n(o.playtime, 0, 1e9, 0); s.kills = i(o.kills, 0, 1e9, 0); s.sigilBuys = i(o.sigilBuys, 0, 999, 0);
  const skillIds = new Set(SKILLS.map((k) => k.id)), wayIds = new Set(WAYSTONES.map((w) => w.id));
  s.skills = pick(o.skills, (k) => skillIds.has(k), () => 1);
  s.relics = pick(o.relics, (k) => own(SHRINES, k)); s.shrines = pick(o.shrines, (k) => own(SHRINES, k));
  s.waystones = pick(o.waystones, (k) => wayIds.has(k)); s.waystones.village = true;
  s.chests = pick(o.chests, (k) => /^c\d{1,3}$/.test(k), () => 1); s.shards = pick(o.shards, (k) => /^s\d{1,3}$/.test(k), () => 1); s.rifts = pick(o.rifts, (k) => /^r\d$/.test(k));
  s.tips = pick(o.tips, (k) => /^[a-z]{1,16}$/.test(k), () => 1);
  s.dex = pick(o.dex, (k) => own(KITH, k), (v) => (v === 2 ? 2 : 1));
  const seen = new Set(), ids = new Set();
  for (const k of Array.isArray(o.kith) ? o.kith.slice(0, 60) : []) {
    if (!k || typeof k.species !== 'string' || !own(KITH, k.species) || seen.has(k.species)) continue;
    const id = i(k.id, 1, 1e6, 0); if (!id || ids.has(id)) continue;
    seen.add(k.species); ids.add(id); s.kith.push({ id, species: k.species, level: i(k.level, 1, MAX_KITH_LEVEL, 1), xp: n(k.xp, 0, 1e7, 0) }); s.dex[k.species] = 2;
  }
  const max = s.relics.roots ? 3 : 2;
  for (const id of Array.isArray(o.party) ? o.party : []) if (ids.has(id) && !s.party.includes(id) && s.party.length < max) s.party.push(id);
  if (!s.party.length && s.kith.length) s.party.push(s.kith[0].id);
  s.active = i(o.active, 0, Math.max(0, s.party.length - 1), 0); s.nextId = Math.max(0, ...ids) + 1;
  s.respawn = typeof o.respawn === 'string' && s.waystones[o.respawn] === true && wayIds.has(o.respawn) ? o.respawn : 'village';
  return s;
}
