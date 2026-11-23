// Shared mutable game state. Every module imports this one object.
export const G = {
  renderer: null, scene: null, camera: null, canvas: null,
  mode: 'title',            // title | play | menu | dialog | bind | dead | cut
  time: 0, rawDt: 0, timeScale: 1, hitstop: 0, slowT: 0,
  area: null, world: null, ui: null, game: null,
  player: null, comp: null,
  enemies: [], projectiles: [], hazards: [], pickups: [], interactables: [], timers: [],
  save: null,
  cam: { yaw: Math.PI, pitch: 0.34, dist: 7.6, cur: 7.6, shake: 0, idle: 0 },
  lock: null, boss: null, combatT: 0, attackers: 0, lastHit: null, lastHitT: 0,
  run: null,                // abyss run state { floor, boons }
  artCd: {},                // kith id -> seconds remaining
  opts: { invertY: false, volume: 0.8, quality: 1, camera: 'classic', look: 'classic' },   // camera: 'classic' (fixed high angle) or 'free'
};
