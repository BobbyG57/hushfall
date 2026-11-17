// Shared combat plumbing: timers, area damage, projectiles, hazards, pickups, ground movement.
import * as THREE from 'three';
import { G } from './state.js';
import { fx } from './fx.js';
import { audio } from './audio.js';
import { EL } from './data.js';
import { rand, clamp } from './util.js';

export function after(t, fn) { G.timers.push({ t, fn }); }

// Move on the ground plane, sliding along colliders and refusing to walk up cliffs.
export function moveXZ(ent, vx, vz, dt) {
  const area = G.area, pos = ent.pos, ox = pos.x, oz = pos.z;
  pos.x += vx * dt; pos.z += vz * dt;
  area.resolve(pos, ent.radius, ent);
  if (area.slope) {
    const h0 = area.heightAt(ox, oz);
    const ok = (x, z) => { const h1 = area.heightAt(x, z), d = Math.hypot(x - ox, z - oz); return !(d > 1e-4 && (h1 - h0) / d > 1.2 && h1 > pos.y + 0.25); };
    if (!ok(pos.x, pos.z)) { if (ok(pos.x, oz)) pos.z = oz; else if (ok(ox, pos.z)) pos.x = ox; else { pos.x = ox; pos.z = oz; } }
  }
}

export function aoeEnemies(pos, r, dmg, o = {}) {
  let n = 0;
  for (const e of G.enemies) {
    if (e.dead || e.spawnT > 0) continue;
    if (o.once) { if (o.once.has(e)) continue; }
    const d = Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z);
    if (d < r + e.radius) {
      if (o.once) o.once.add(e);
      if (e.hurt(dmg, { ...o, from: o.from || pos })) n++;
      if (o.status && !e.dead) e.addStatus(o.status, o.statusT || 3, dmg * 0.22);
    }
  }
  return n;
}
export function aoePlayer(pos, r, dmg, o = {}) {
  const p = G.player; if (!p || p.dead) return false;
  const d = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z);
  if (d < r + 0.35 && p.pos.y - p.groundY < (o.low ? 0.9 : 3.5)) return p.takeHit(dmg, { unblockable: true, ...o, from: pos });
  return false;
}
export function nearestEnemy(pos, maxD = 16, filter) {
  let best = null, bd = maxD;
  for (const e of G.enemies) { if (e.dead || e.spawnT > 0 || (filter && !filter(e))) continue; const d = Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z); if (d < bd) { bd = d; best = e; } }
  return best;
}

// ---------------------------------------------------------------- projectiles
const projGeo = new THREE.IcosahedronGeometry(1, 0);
export function shoot(o) {
  const color = o.color ?? EL[o.el || 'none'].color;
  const mesh = new THREE.Mesh(projGeo, new THREE.MeshBasicMaterial({ color }));
  mesh.scale.setScalar(o.r || 0.32); mesh.position.copy(o.pos); G.scene.add(mesh);
  const p = {
    mesh, pos: mesh.position, vel: new THREE.Vector3(o.dir.x, o.dir.y || 0, o.dir.z).multiplyScalar(o.speed || 14), r: o.r || 0.32,
    dmg: o.dmg, el: o.el || 'none', team: o.team || 'enemy', life: o.life || 4, homing: o.homing || null, owner: o.owner || null, color, kith: !!o.kith,
  };
  G.projectiles.push(p); return p;
}
function killProj(p, i, burst = true) {
  if (burst) fx.burst(p.pos, p.color, 6, { speed: 4, life: 0.3, up: 1 });
  G.scene.remove(p.mesh); p.mesh.material.dispose(); G.projectiles.splice(i, 1);
}

// ---------------------------------------------------------------- hazards
const ringGeo = new THREE.RingGeometry(0.955, 1, 64).rotateX(-Math.PI / 2);
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const discGeo = new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2);
const hmat = (color, op = 0.85, add = true) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });

export function shockwave(pos, o = {}) {
  const color = o.color ?? 0xff5050, mesh = new THREE.Mesh(ringGeo, hmat(color));
  const y = G.area.heightAt(pos.x, pos.z) + 0.3; mesh.position.set(pos.x, y, pos.z); G.scene.add(mesh);
  const h = { type: 'ring', mesh, x: pos.x, y, z: pos.z, r: o.r0 || 1, speed: o.speed || 11, maxR: o.maxR || 30, dmg: o.dmg, el: o.el, color, hit: false };
  G.hazards.push(h); return h;
}
export function wallWave(pos, o) {
  const color = o.color ?? 0x4ab8ff, mesh = new THREE.Mesh(boxGeo, hmat(color, 0.6));
  mesh.scale.set(o.half * 2, 1.1, 0.7); mesh.rotation.y = Math.atan2(o.dx, o.dz); G.scene.add(mesh);
  const h = { type: 'wall', mesh, x: pos.x, z: pos.z, dx: o.dx, dz: o.dz, speed: o.speed || 13, half: o.half, dmg: o.dmg, el: o.el, color, life: o.life || 4, hit: false };
  G.hazards.push(h); return h;
}
export function beam(owner, o) {
  const color = o.color ?? EL[o.el || 'none'].color, mesh = new THREE.Mesh(boxGeo, hmat(color, 0.8));
  const L = o.len || 20; mesh.scale.set(0.5, 0.5, o.double ? L * 2 : L); G.scene.add(mesh);
  const h = { type: 'beam', mesh, owner, x: o.x ?? 0, z: o.z ?? 0, ang: o.ang ?? rand(6.28), rot: o.rot || 1, len: L, dmg: o.dmg, el: o.el, color, life: o.life ?? 4, double: !!o.double, cd: 0, t: 0, warm: o.warm ?? 0.5 };
  G.hazards.push(h); return h;
}
export function vent(pos, o) {
  const mesh = new THREE.Mesh(discGeo, hmat(o.color ?? 0xff7a3c, 0.2, false)); mesh.scale.setScalar(o.r); mesh.position.set(pos.x, 0.07, pos.z); G.scene.add(mesh);
  const h = { type: 'vent', mesh, x: pos.x, z: pos.z, r: o.r, period: o.period || 3, t: o.phase || 0, dmg: o.dmg, el: o.el, color: o.color ?? 0xff7a3c, cd: 0, life: Infinity };
  G.hazards.push(h); return h;
}
function removeHazard(h, i) { G.scene.remove(h.mesh); h.mesh.material.dispose(); G.hazards.splice(i, 1); }

// ---------------------------------------------------------------- pickups
const moteGeo = new THREE.OctahedronGeometry(0.18, 0);
export function dropMotes(pos, total, healChance = 0.1) {
  const n = clamp(Math.ceil(total / 14), 1, 6);
  for (let i = 0; i < n; i++) spawnPickup(pos, 'mote', Math.max(1, Math.round(total / n)));
  if (Math.random() < healChance) spawnPickup(pos, 'heal', 0.1);
}
function spawnPickup(pos, kind, v) {
  const mesh = new THREE.Mesh(moteGeo, new THREE.MeshBasicMaterial({ color: kind === 'mote' ? 0xffd98a : 0x6ff0c8 }));
  if (kind === 'heal') mesh.scale.setScalar(1.6);
  mesh.position.set(pos.x, pos.y + 1, pos.z); G.scene.add(mesh);
  G.pickups.push({ mesh, pos: mesh.position, vel: new THREE.Vector3(rand(-4, 4), rand(5, 9), rand(-4, 4)), kind, v, t: 0 });
}

export function clearCombat() {
  for (const p of G.projectiles) { G.scene.remove(p.mesh); p.mesh.material.dispose(); }
  for (const h of G.hazards) { G.scene.remove(h.mesh); h.mesh.material.dispose(); }
  for (const p of G.pickups) { if (p.kind === 'mote') G.game.addMotes(p.v, true); G.scene.remove(p.mesh); p.mesh.material.dispose(); }
  G.projectiles.length = 0; G.hazards.length = 0; G.pickups.length = 0; G.timers.length = 0; G.attackers = 0;
}

export function updateCombat(dt) {
  // timers
  for (let i = G.timers.length - 1; i >= 0; i--) { const t = G.timers[i]; t.t -= dt; if (t.t <= 0) { G.timers.splice(i, 1); t.fn(); } }
  const pl = G.player, area = G.area;
  const ph = pl.pos.y - pl.groundY;

  // projectiles
  for (let i = G.projectiles.length - 1; i >= 0; i--) {
    const p = G.projectiles[i]; p.life -= dt;
    if (p.homing) {
      if (p.homing.dead) p.homing = null;
      else { const t = p.homing, sp = p.vel.length(); const dx = t.pos.x - p.pos.x, dy = t.pos.y + t.model.height * 0.5 - p.pos.y, dz = t.pos.z - p.pos.z, d = Math.hypot(dx, dy, dz) || 1; p.vel.x += (dx / d * sp - p.vel.x) * Math.min(1, dt * 9); p.vel.y += (dy / d * sp - p.vel.y) * Math.min(1, dt * 9); p.vel.z += (dz / d * sp - p.vel.z) * Math.min(1, dt * 9); }
    }
    p.pos.addScaledVector(p.vel, dt);
    if (Math.random() < dt * 40) fx.spawn(p.pos.x, p.pos.y, p.pos.z, rand(-0.5, 0.5), rand(-0.5, 0.5), rand(-0.5, 0.5), p.color, p.r * 1.6, 0.25, 0);
    let dead = p.life <= 0 || p.pos.y < area.heightAt(p.pos.x, p.pos.z) - 0.1 || (area.blocked && area.blocked(p.pos.x, p.pos.z));
    if (!dead && p.team === 'enemy' && !pl.dead) {
      const d = Math.hypot(pl.pos.x - p.pos.x, pl.pos.z - p.pos.z);
      if (d < p.r + 0.55 && Math.abs(p.pos.y - (pl.pos.y + 1)) < 1.3) {
        const res = pl.takeHit(p.dmg, { from: p.pos, el: p.el, knock: 4 });
        if (res === 'parry') {
          p.team = 'player'; p.dmg = pl.atkPow * 3.2; p.life = 3; p.color = 0xffffff; p.mesh.material.color.set(0xffffff); p.el = pl.element;
          if (p.owner && !p.owner.dead) { p.homing = p.owner; p.vel.set(p.owner.pos.x - p.pos.x, 0.5, p.owner.pos.z - p.pos.z).normalize().multiplyScalar(26); } else p.vel.multiplyScalar(-1.6);
        } else if (res) dead = true;
      }
    } else if (!dead && p.team === 'player') {
      for (const e of G.enemies) {
        if (e.dead || e.spawnT > 0) continue;
        const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
        if (d < p.r + e.radius + 0.2 && p.pos.y > e.pos.y - 0.3 && p.pos.y < e.pos.y + e.model.height + 0.6) { e.hurt(p.dmg, { el: p.el, from: p.pos, poise: p.kith ? 5 : 30, knock: 2, kith: p.kith }); dead = true; break; }
      }
    }
    if (dead) killProj(p, i);
  }

  // hazards
  for (let i = G.hazards.length - 1; i >= 0; i--) {
    const h = G.hazards[i]; let done = false;
    const dx = pl.pos.x - h.x, dz = pl.pos.z - h.z, d = Math.hypot(dx, dz);
    if (h.type === 'ring') {
      h.r += h.speed * dt; h.mesh.scale.setScalar(h.r); h.mesh.material.opacity = 0.85 * Math.min(1, (h.maxR - h.r) / 5);
      for (let k = 0; k < 3; k++) { const a = rand(6.28); fx.spawn(h.x + Math.cos(a) * h.r, h.y + rand(0.5), h.z + Math.sin(a) * h.r, 0, rand(1, 3), 0, h.color, 0.4, 0.3, 0); }
      if (!h.hit && !pl.dead && Math.abs(d - h.r) < 0.75 && ph < 0.9) { if (pl.takeHit(h.dmg, { unblockable: true, from: h, el: h.el, knock: 8 })) h.hit = true; }
      if (h.r >= h.maxR) done = true;
    } else if (h.type === 'wall') {
      h.x += h.dx * h.speed * dt; h.z += h.dz * h.speed * dt; h.life -= dt;
      h.mesh.position.set(h.x, area.heightAt(h.x, h.z) + 0.55, h.z);
      if (Math.random() < dt * 60) { const s = rand(-h.half, h.half); fx.spawn(h.x - h.dz * s, 1.2, h.z + h.dx * s, 0, rand(1, 4), 0, h.color, 0.5, 0.35, 4); }
      const along = dx * h.dx + dz * h.dz, side = Math.abs(-dx * h.dz + dz * h.dx);
      if (!h.hit && !pl.dead && Math.abs(along) < 0.9 && side < h.half && ph < 1.0) { if (pl.takeHit(h.dmg, { unblockable: true, from: { x: h.x - h.dx * 2, z: h.z - h.dz * 2 }, el: h.el, knock: 10 })) h.hit = true; }
      if (h.life <= 0) done = true;
    } else if (h.type === 'beam') {
      h.t += dt; h.life -= dt; h.cd -= dt;
      if (h.owner) { if (h.owner.dead) done = true; h.x = h.owner.pos.x; h.z = h.owner.pos.z; }
      h.ang += h.rot * dt;
      const bx = Math.sin(h.ang), bz = Math.cos(h.ang), base = area.heightAt(h.x, h.z) + 0.55, off = h.double ? 0 : h.len / 2;
      h.mesh.position.set(h.x + bx * off, base, h.z + bz * off); h.mesh.rotation.y = h.ang;
      const warm = h.t < h.warm; h.mesh.material.opacity = warm ? 0.25 : 0.85; h.mesh.scale.x = h.mesh.scale.y = warm ? 0.15 : 0.5;
      if (!warm && Math.random() < dt * 50) { const s = rand(h.double ? -h.len : 0, h.len); fx.spawn(h.x + bx * s, base, h.z + bz * s, rand(-1, 1), rand(0, 2), rand(-1, 1), h.color, 0.45, 0.25, 0); }
      const pdx = pl.pos.x - h.x, pdz = pl.pos.z - h.z, along = pdx * bx + pdz * bz, perp = Math.abs(pdx * bz - pdz * bx);
      if (!warm && h.cd <= 0 && !pl.dead && (along > 0.6 || (h.double && along < -0.6)) && Math.abs(along) < h.len && perp < 0.75 && ph < 1.0) { if (pl.takeHit(h.dmg, { unblockable: true, from: { x: h.x, z: h.z }, el: h.el, knock: 9 })) h.cd = 0.7; }
      if (h.life <= 0) done = true;
    } else if (h.type === 'vent') {
      h.t += dt; h.cd -= dt; const c = h.t % h.period, active = c > h.period - 0.7, warn = c > h.period - 1.6 && !active;
      h.mesh.material.opacity = active ? 0.75 : warn ? 0.3 + 0.25 * Math.sin(h.t * 25) : 0.12;
      if (active) { for (let k = 0; k < 2; k++) { const a = rand(6.28), rr = Math.sqrt(Math.random()) * h.r; fx.spawn(h.x + Math.cos(a) * rr, 0.2, h.z + Math.sin(a) * rr, 0, rand(6, 12), 0, h.color, 0.6, 0.4, 0); }
        if (h.cd <= 0 && !pl.dead && d < h.r && ph < 2.2) { if (pl.takeHit(h.dmg, { unblockable: true, from: h, el: h.el, knock: 6 })) h.cd = 0.8; } }
    }
    if (done) removeHazard(h, i);
  }

  // pickups
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const p = G.pickups[i]; p.t += dt; p.mesh.rotation.y += dt * 6;
    const tx = pl.pos.x, ty = pl.pos.y + 1, tz = pl.pos.z;
    if (p.t < 0.5) { p.vel.y -= 22 * dt; p.pos.addScaledVector(p.vel, dt); const gy = area.heightAt(p.pos.x, p.pos.z) + 0.3; if (p.pos.y < gy) { p.pos.y = gy; p.vel.y *= -0.4; p.vel.x *= 0.6; p.vel.z *= 0.6; } }
    else { const dx = tx - p.pos.x, dy = ty - p.pos.y, dz = tz - p.pos.z, d = Math.hypot(dx, dy, dz) || 1, sp = 10 + p.t * 22; p.pos.x += dx / d * sp * dt; p.pos.y += dy / d * sp * dt; p.pos.z += dz / d * sp * dt;
      if (d < 0.8) { if (p.kind === 'mote') { G.game.addMotes(p.v); audio.sfx('mote'); } else { pl.heal(pl.maxHp * p.v); audio.sfx('pickup'); } G.scene.remove(p.mesh); p.mesh.material.dispose(); G.pickups.splice(i, 1); } }
  }
}
