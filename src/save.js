// Save data lives in the browser's localStorage.
// add ?slot=name to the address for a separate save file
const slot = new URLSearchParams(location.search).get('slot');
const KEY = 'hushfall_save_v1' + (slot ? '_' + slot.replace(/\W/g, '') : ''), OPT = 'hushfall_opts_v1';

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
