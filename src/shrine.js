// Shrines, Hush Rifts and Abyss floors: a chain of walled rooms linked by gated corridors.
import * as THREE from 'three';
import { G } from './state.js';
import { EL, dmgScale } from './data.js';
import { clamp, rand } from './util.js';
import { fx } from './fx.js';
import { audio } from './audio.js';
import { spawnEnemy, spawnBoss } from './enemies.js';
import { beam, vent, after } from './combat.js';
import { ART } from './art.js';

const DIM = { start: [14, 14], combat: [30, 30], gauntlet: [12, 44], fount: [16, 16], boss: [46, 46] };
const CL = 9, WALL_H = 6;
let tileTex = null;
function tiles() {
  if (ART.floor) return ART.floor.tex;
  if (tileTex) return tileTex;
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#6f6c7e'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { x.fillStyle = (i + j) % 2 ? '#646173' : '#797688'; x.fillRect(i * 64 + 2, j * 64 + 2, 60, 60); }
  x.strokeStyle = '#4a4758'; x.lineWidth = 3; x.strokeRect(0, 0, 128, 128); x.strokeRect(0, 0, 64, 64); x.strokeRect(64, 64, 64, 64);
  tileTex = new THREE.CanvasTexture(c); tileTex.wrapS = tileTex.wrapT = THREE.RepeatWrapping; tileTex.colorSpace = THREE.SRGBColorSpace; return tileTex;
}
const boxGeo = new THREE.BoxGeometry(1, 1, 1), cylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);

export function buildShrine(def, opt = {}) {
  const col = EL[def.el].color, c3 = new THREE.Color(col);
  const dark = new THREE.Color(col).multiplyScalar(0.09).add(new THREE.Color(0x0b0a13));
  const group = new THREE.Group();
  const floorMat = new THREE.MeshLambertMaterial({ map: tiles(), color: new THREE.Color(0xffffff).lerp(c3, 0.1) });
  const wallMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(0x565470).lerp(c3, 0.07), flatShading: true });
  const glowMat = new THREE.MeshBasicMaterial({ color: col });
  const gateMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  const portalMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  const box = (mat, sx, sy, sz, x, y, z, shadow = true) => { const m = new THREE.Mesh(boxGeo, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; group.add(m); return m; };
  const floor = (x0, x1, z0, z1) => { const w = x1 - x0, d = z1 - z0, g = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), uv = g.attributes.uv; const ts = ART.floor ? ART.floor.size : 4; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / ts, uv.getY(i) * d / ts); const m = new THREE.Mesh(g, floorMat); m.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2); m.receiveShadow = true; group.add(m); };
  // with the fixed high-angle view the camera looks in over the near (south) walls, so those are kept low
  const low = G.opts.camera !== 'free', frontH = low ? 1.4 : WALL_H, pillarH = low ? 3.4 : WALL_H;
  const hWall = (xa, xb, z, h = WALL_H) => { if (xb - xa > 0.1) box(wallMat, xb - xa, h, 1, (xa + xb) / 2, h / 2, z); };

  const A = {
    kind: 'shrine', mode: opt.mode || 'shrine', def, el: def.el, level: def.level, group, rects: [], rooms: [], corrs: [], circles: [], interactables: [], hazardDefs: [], portals: [], checkpoint: null, opt, start: { x: 0, z: -5 },
    heightAt() { return 0; },
    env() { return { flat: true, fog: dark, fogNear: 22, fogFar: 95, sun: new THREE.Color(0xffffff).lerp(c3, 0.1), amb: 0.68 }; },
    inside(x, z, m = 0, all = false) { for (const R of this.rects) { if (!all && R.corr && R.locked) continue; if (x >= R.x0 + m && x <= R.x1 - m && z >= R.z0 + (R.corr ? 0 : m) && z <= R.z1 - (R.corr ? 0 : m)) return true; } return false; },
    blocked(x, z) { return !this.inside(x, z, 0, true); },
    camBlocked(p) { return p.y < 0.4 || (p.y < WALL_H + 0.6 && !this.inside(p.x, p.z, 0.4, false)); },
    resolve(pos, r) {
      if (!this.inside(pos.x, pos.z, r)) {
        let bx = pos.x, bz = pos.z, bd = 1e9;
        for (const R of this.rects) {
          if (R.corr && R.locked) continue;
          const mz = R.corr ? 0 : r; if (R.x1 - R.x0 < 2 * r) continue;
          const cx = clamp(pos.x, R.x0 + r, R.x1 - r), cz = clamp(pos.z, R.z0 + mz, R.z1 - mz), d = Math.hypot(cx - pos.x, cz - pos.z);
          if (d < bd) { bd = d; bx = cx; bz = cz; }
        }
        pos.x = bx; pos.z = bz;
      }
      for (const c of this.circles) { const dx = pos.x - c.x, dz = pos.z - c.z, d = Math.hypot(dx, dz), m = c.r + r; if (d < m && d > 1e-4) { pos.x = c.x + dx / d * m; pos.z = c.z + dz / d * m; } }
    },
    addPortal(x, z, label, use, color = col) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 4.6), portalMat.clone()); m.material.color.set(color); m.position.set(x, 2.4, z); group.add(m);
      const base = new THREE.Mesh(cylGeo, glowMat); base.scale.set(4, 0.12, 4); base.position.set(x, 0.06, z); group.add(base);
      this.portals.push({ m, x, z, color });
      this.interactables.push({ pos: new THREE.Vector3(x, 0, z), r: 3.2, label, use });
    },
    onEnter() {
      const dmg = 10 * dmgScale(this.level);
      for (const h of this.hazardDefs) { if (h.type === 'spin') beam(null, { x: h.x, z: h.z, len: h.len, rot: h.rot, dmg, life: Infinity, double: true, warm: 0, el: this.el, ang: h.ang }); else vent({ x: h.x, z: h.z }, { r: h.r, period: 3.2, phase: h.phase, dmg, el: this.el, color: col }); }
    },
    resetRooms() { for (const r of this.rooms) if (r.state === 'active') { r.state = 'idle'; r.wave = 0; r.alive = []; r.pending = false; r.bossEnt = null; } G.boss = null; },
    respawnPoint() { return this.checkpoint || this.start; },
    startRoom(room) {
      room.state = 'active'; room.wave = 0; audio.sfx('gate');
      if (room.t === 'boss') {
        const b = spawnBoss(def.boss, room.cx, room.cz - 9, this.level); b.yaw = 0; room.bossEnt = b; G.boss = b;
        G.ui.banner(b.name, EL[b.el].name + ' guardian'); audio.sfx('roar', 0.7); G.game.setMood('boss');
      } else { room.pending = true; after(0.5, () => { room.pending = false; this.spawnWave(room); }); }
    },
    spawnWave(room) {
      const list = room.def.waves[room.wave++], p = G.player.pos; audio.sfx('dark', 0.7);
      for (const t of list) {
        let x = 0, z = 0;
        for (let k = 0; k < 12; k++) { x = rand(room.x0 + 3.5, room.x1 - 3.5); z = rand(room.z0 + 3.5, room.z1 - 3.5); if (Math.hypot(x - p.x, z - p.z) > 8) break; }
        const e = spawnEnemy(t, x, z, this.level, this.el); e.alert(); room.alive.push(e);
      }
      if (room.def.waves.length > 1) G.ui.toast(`Wave ${room.wave} of ${room.def.waves.length}`, '', 1.4);
    },
    clearRoom(room) {
      room.state = 'cleared'; audio.sfx('chest');
      for (const e of G.enemies) if (e.minion && !e.dead) e.hurt(99999, { noStagger: true, quiet: true });
      if (this.opt.onClear) this.opt.onClear(room, this); else if (room.t !== 'boss') G.ui.toast('The way opens.', '', 1.6);
    },
    update(dt, t) {
      const p = G.player.pos;
      for (const room of this.rooms) {
        if (room.state === 'idle' && !G.player.dead && p.x > room.x0 + 2.2 && p.x < room.x1 - 2.2 && p.z > room.z0 + 2.2 && p.z < room.z1 - 2.2) this.startRoom(room);
        if (room.state === 'active') {
          room.alive = room.alive.filter((e) => !e.dead && !e.gone);
          if (room.t === 'boss') { if (room.bossEnt && room.bossEnt.dead) this.clearRoom(room); }
          else if (room.alive.length === 0 && !room.pending) {
            if (room.wave < room.def.waves.length) { room.pending = true; after(0.9, () => { room.pending = false; if (room.state === 'active') this.spawnWave(room); }); }
            else this.clearRoom(room);
          }
        }
      }
      for (const c of this.corrs) {
        const a = this.rooms[c.from], b = this.rooms[c.from + 1], locked = a.state === 'idle' || a.state === 'active' || b.state === 'active';
        if (locked !== c.locked) { c.locked = locked; c.gate.visible = locked; if (!locked) audio.sfx('gate', 0.7); }
      }
      gateMat.opacity = 0.45 + 0.2 * Math.sin(t * 4);
      for (const po of this.portals) { po.m.material.opacity = 0.45 + 0.25 * Math.sin(t * 3); po.m.rotation.y = t * 0.6; if (Math.random() < dt * 20) fx.spawn(po.x + rand(-1.4, 1.4), rand(4), po.z + rand(-1.4, 1.4), 0, rand(1, 3), 0, po.color, 0.4, 0.7, 0); }
    },
  };

  // ---- lay the rooms out along -Z
  let z = 0; const list = [{ t: 'start' }, ...def.rooms];
  list.forEach((rd, i) => {
    const [w, d] = DIM[rd.t], last = i === list.length - 1;
    const room = { i, t: rd.t, def: rd, x0: -w / 2, x1: w / 2, z0: z - d, z1: z, cx: 0, cz: z - d / 2, state: rd.t === 'combat' || rd.t === 'boss' ? 'idle' : 'open', wave: 0, alive: [], pending: false };
    A.rooms.push(room); A.rects.push(room);
    floor(room.x0, room.x1, room.z0, room.z1);
    box(wallMat, 1, WALL_H, d + 2, room.x0 - 0.5, WALL_H / 2, room.cz); box(wallMat, 1, WALL_H, d + 2, room.x1 + 0.5, WALL_H / 2, room.cz);
    box(glowMat, 0.3, 0.14, d, room.x0 - 0.1, WALL_H * 0.6, room.cz, false); box(glowMat, 0.3, 0.14, d, room.x1 + 0.1, WALL_H * 0.6, room.cz, false);
    if (i === 0) hWall(room.x0, room.x1, room.z1 + 0.5, frontH); else { hWall(room.x0, -3, room.z1 + 0.5, frontH); hWall(3, room.x1, room.z1 + 0.5, frontH); }
    if (last) hWall(room.x0, room.x1, room.z0 - 0.5); else { hWall(room.x0, -3, room.z0 - 0.5); hWall(3, room.x1, room.z0 - 0.5); }
    if (rd.t === 'combat') for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const px = sx * w / 4, pz = room.cz + sz * d / 4; const m = new THREE.Mesh(cylGeo, wallMat); m.scale.set(2.2, pillarH, 2.2); m.position.set(px, pillarH / 2, pz); m.castShadow = true; group.add(m); const ring = new THREE.Mesh(cylGeo, glowMat); ring.scale.set(2.4, 0.16, 2.4); ring.position.set(px, 2.2, pz); group.add(ring); A.circles.push({ x: px, z: pz, r: 1.15 }); }
    if (rd.t === 'boss') { const ring = new THREE.Mesh(new THREE.RingGeometry(17.4, 18, 64).rotateX(-Math.PI / 2), glowMat); ring.position.set(0, 0.04, room.cz); group.add(ring); const r2 = new THREE.Mesh(new THREE.RingGeometry(5.7, 6, 48).rotateX(-Math.PI / 2), glowMat); r2.position.set(0, 0.04, room.cz); group.add(r2); A.bossRoom = room; }
    if (rd.t === 'gauntlet') {
      [10, 22, 34].forEach((o, k) => A.hazardDefs.push({ type: 'spin', x: 0, z: room.z1 - o, len: 5.6, rot: (k % 2 ? -1 : 1) * (1.5 + def.level * 0.02), ang: k * 1.1 }));
      [[-3, 16, 0], [3, 16, 1.6], [-2.5, 28, 0.8], [2.5, 28, 2.4], [0, 40, 1.2]].forEach(([vx, o, phs]) => A.hazardDefs.push({ type: 'vent', x: vx, z: room.z1 - o, r: 2.1, phase: phs }));
      for (const o of [10, 22, 34]) { const hub = new THREE.Mesh(cylGeo, wallMat); hub.scale.set(1.4, 1.4, 1.4); hub.position.set(0, 0.7, room.z1 - o); group.add(hub); A.circles.push({ x: 0, z: room.z1 - o, r: 0.9 }); }
    }
    if (rd.t === 'fount') {
      const b = new THREE.Mesh(cylGeo, wallMat); b.scale.set(3.4, 1, 3.4); b.position.set(0, 0.5, room.cz); group.add(b);
      const wtr = new THREE.Mesh(cylGeo, new THREE.MeshBasicMaterial({ color: 0x6ff0c8 })); wtr.scale.set(2.8, 0.1, 2.8); wtr.position.set(0, 1.02, room.cz); group.add(wtr);
      A.circles.push({ x: 0, z: room.cz, r: 1.8 });
      A.interactables.push({ pos: new THREE.Vector3(0, 0, room.cz), r: 3.6, label: 'Drink from the fount', use: () => { A.checkpoint = { x: 0, z: room.cz + 4 }; G.game.fount(); } });
    }
    if (rd.t === 'start') A.addPortal(0, room.z1 - 2.2, opt.exitLabel || 'Leave the shrine', () => G.game.leaveArea(), 0xffffff);
    z -= d;
    if (!last) {
      const cor = { corr: true, x0: -3, x1: 3, z0: z - CL - 1.6, z1: z + 1.6, from: i, locked: false };
      A.rects.push(cor); A.corrs.push(cor); floor(-3, 3, z - CL, z);
      box(wallMat, 1, WALL_H, CL, -3.5, WALL_H / 2, z - CL / 2); box(wallMat, 1, WALL_H, CL, 3.5, WALL_H / 2, z - CL / 2);
      const gate = new THREE.Group(); for (const gz of [z - 0.2, z - CL + 0.2]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(6, WALL_H), gateMat); m.position.set(0, WALL_H / 2, gz); gate.add(m); }
      gate.visible = false; group.add(gate); cor.gate = gate; z -= CL;
    }
  });
  A.start = { x: 0, z: -6 };
  return A;
}
