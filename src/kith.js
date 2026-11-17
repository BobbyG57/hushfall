// Kith: the companion that fights beside you, its Bond Arts, party management and the Bond Rite.
import * as THREE from 'three';
import { G } from './state.js';
import { fx } from './fx.js';
import { audio } from './audio.js';
import { KITH, ARTS, EL, isEvolved, kithName, kithXpNext, MAX_KITH_LEVEL } from './data.js';
import { makeKithModel, animate } from './models.js';
import { rand, damp, angLerp, dist2, TAU } from './util.js';
import { after, shoot, aoeEnemies, nearestEnemy } from './combat.js';

export const partyMax = () => (G.save.relics.roots ? 3 : 2);
export const partyList = () => G.save.party.map((id) => G.save.kith.find((k) => k.id === id)).filter(Boolean);
export function activeKith() { const p = partyList(); if (!p.length) return null; if (G.save.active >= p.length) G.save.active = 0; return p[G.save.active]; }
export function addKith(species, level) {
  const k = { id: G.save.nextId++, species, level, xp: 0 };
  G.save.kith.push(k); G.save.dex[species] = 2;
  const joined = G.save.party.length < partyMax(); if (joined) G.save.party.push(k.id);
  return { k, joined };
}
export function kithPower(k) { return KITH[k.species].power * (1 + 0.1 * (k.level - 1)) * (isEvolved(k) ? 1.3 : 1); }

export function summonActive(quiet) {
  if (G.comp) { G.comp.dispose(); G.comp = null; }
  const k = activeKith(); if (!k) { G.player.setElement('none'); return; }
  const c = new Companion(k); G.comp = c;
  const p = G.player; c.pos.set(p.pos.x + Math.sin(p.yaw + 2.5) * 1.8, p.pos.y, p.pos.z + Math.cos(p.yaw + 2.5) * 1.8); c.yaw = p.yaw;
  p.setElement(c.sp.el);
  if (!quiet) { fx.burst({ x: c.pos.x, y: c.pos.y + 0.6, z: c.pos.z }, EL[c.sp.el].color, 18, { speed: 4 }); audio.sfx('pickup', 0.8); }
}
export function swapKith(dir) {
  const p = partyList(); if (p.length < 2 || G.player.swapCd > 0) return;
  G.save.active = (G.save.active + dir + p.length) % p.length; G.player.swapCd = 0.4; summonActive();
}
export function gainKithXp(n) {
  const list = partyList(), act = activeKith();
  for (const k of list) {
    if (k.level >= MAX_KITH_LEVEL) continue;
    k.xp += n * (k === act ? 1 : 0.6);
    while (k.level < MAX_KITH_LEVEL && k.xp >= kithXpNext(k.level)) {
      k.xp -= kithXpNext(k.level); const before = kithName(k); k.level++;
      const sp = KITH[k.species];
      if (sp.evo && k.level === sp.evo) {
        G.ui.toast(`${before} evolved into ${sp.evoName}!`, 'gold', 4); audio.sfx('bound');
        if (k === act) { summonActive(true); fx.column(G.comp.pos, EL[sp.el].color, 6, 50); }
      } else G.ui.toast(`${kithName(k)} grew to Lv ${k.level}`, '', 1.6);
    }
  }
}

export class Companion {
  constructor(k) {
    this.k = k; this.sp = KITH[k.species]; this.model = makeKithModel(k.species, isEvolved(k)); G.scene.add(this.model.root);
    this.pos = new THREE.Vector3(); this.yaw = 0; this.cd = 1; this.animT = 0; this.run = 0; this.poseName = null; this.poseT = 9; this.radius = 0.4; this.busy = 0;
  }
  get power() { return kithPower(this.k); }
  dispose() { G.scene.remove(this.model.root); this.model.dispose(); }
  update(dt) {
    const p = G.player; this.animT += dt; this.cd -= dt; this.poseT += dt; if (this.busy > 0) this.busy -= dt;
    let tgt = null;
    if (G.combatT > 0 && !p.dead) {
      if (G.lock && !G.lock.dead && G.lock.aggro) tgt = G.lock;
      else { let bd = 18; for (const e of G.enemies) { if (e.dead || e.spawnT > 0 || !e.aggro) continue; const d = dist2(e.pos, p.pos); if (d < bd) { bd = d; tgt = e; } } }
      if (tgt && tgt.wild && tgt.hp / tgt.maxHp < 0.3) tgt = null; // hold back so you can bind it
    }
    let gx, gz, stop;
    if (tgt) { gx = tgt.pos.x; gz = tgt.pos.z; stop = this.sp.style === 'melee' ? tgt.radius + 1.3 : 8; }
    else { const a = p.yaw + 2.5; gx = p.pos.x + Math.sin(a) * 2.1; gz = p.pos.z + Math.cos(a) * 2.1; stop = 0.5; }
    const dx = gx - this.pos.x, dz = gz - this.pos.z, d = Math.hypot(dx, dz); let sp = 0;
    if (dist2(this.pos, p.pos) > 34) { this.pos.set(p.pos.x - Math.sin(p.yaw) * 2, p.pos.y, p.pos.z - Math.cos(p.yaw) * 2); }
    else if (d > stop && this.busy <= 0) { sp = Math.min(tgt ? 10 : 13, (d - stop) * 5 + 2); this.pos.x += dx / d * sp * dt; this.pos.z += dz / d * sp * dt; this.yaw = angLerp(this.yaw, Math.atan2(dx, dz), 1 - Math.exp(-12 * dt)); }
    else if (tgt) { this.yaw = angLerp(this.yaw, Math.atan2(dx, dz), 1 - Math.exp(-12 * dt)); if (this.cd <= 0 && this.busy <= 0) this.attack(tgt); }
    else this.yaw = angLerp(this.yaw, p.yaw, 1 - Math.exp(-3 * dt));
    G.area.resolve(this.pos, this.radius, this); this.pos.y = G.area.heightAt(this.pos.x, this.pos.z);
    this.run = damp(this.run, sp > 0.5 ? Math.min(1, sp / 7) : 0, 10, dt);
    animate(this.model, { t: this.animT, run: this.run, pose: this.poseT < 0.4 ? this.poseName : null, ph: this.poseT / 0.4 }, dt);
    this.model.root.position.copy(this.pos); this.model.root.rotation.y = this.yaw;
  }
  attack(tgt) {
    const el = this.sp.el, pw = this.power; this.poseName = 'atk'; this.poseT = 0;
    if (this.sp.style === 'melee') { this.cd = 1.2; after(0.15, () => { if (!tgt.dead && !tgt.gone) tgt.hurt(pw, { el, from: this.pos, poise: 6, knock: 1.5, kith: true, quiet: true }); }); }
    else {
      this.cd = 1.55; const from = this.pos.clone(); from.y += this.model.height * 0.7;
      const dx = tgt.pos.x - from.x, dz = tgt.pos.z - from.z, d = Math.hypot(dx, dz) || 1;
      shoot({ pos: from, dir: { x: dx / d, y: 0, z: dz / d }, speed: 20, dmg: pw, el, team: 'player', homing: tgt, r: 0.26, life: 2.5, kith: true });
    }
  }
}

// ---------------------------------------------------------------- Bond Arts
export function artCooldown(k) { const b = G.run ? G.run.boons : {}; return ARTS[KITH[k.species].art].cd * (G.save.skills.tempo ? 0.75 : 1) * Math.pow(0.75, b.tempo || 0); }
export function castArt() {
  const c = G.comp, p = G.player; if (!c || p.dead) return;
  if ((G.artCd[c.k.id] || 0) > 0) { audio.sfx('deny'); return; }
  const art = c.sp.art, A = ARTS[art], el = c.sp.el, col = EL[el].color, pw = c.power * (isEvolved(c.k) ? 1.15 : 1);
  G.artCd[c.k.id] = artCooldown(c.k);
  c.poseName = 'cast'; c.poseT = 0; c.busy = 0.6; audio.sfx('art'); fx.ring(c.pos, col, 0.3, 2.6, 0.35, true);
  fx.dmgNum({ x: c.pos.x, y: c.pos.y + c.model.height + 0.6, z: c.pos.z }, A.name, 'info');
  const tgt = G.lock && !G.lock.dead ? G.lock : nearestEnemy(p.pos, 18, (e) => e.aggro);
  const o = { el, kith: true };
  const hot = (e) => !e.dead && !e.gone;
  switch (art) {
    case 'vinesnare': aoeEnemies(p.pos, 9, pw * 2.2, { ...o, status: 'root', statusT: 4, poise: 20 }); fx.disc(p.pos, 9, col, 60); fx.ring(p.pos, col, 1, 9, 0.5); audio.sfx('wind'); break;
    case 'quake': aoeEnemies(p.pos, 7.5, pw * 4.2, { ...o, poise: 70, knock: 9 }); fx.disc(p.pos, 7.5, col, 50); fx.ring(p.pos, col, 1, 7.5, 0.4, true); fx.shake(0.5); audio.sfx('boom'); break;
    case 'bloom': p.heal(p.maxHp * 0.35); p.regen = 4; fx.column(p.pos, 0xff9fd0, 4, 40); audio.sfx('heal'); break;
    case 'firebreath': {
      const yaw = tgt ? Math.atan2(tgt.pos.x - p.pos.x, tgt.pos.z - p.pos.z) : p.yaw;
      for (let i = 0; i < 5; i++) after(i * 0.16, () => {
        audio.sfx('fire', 0.6);
        for (let k = 0; k < 14; k++) { const a = yaw + rand(-0.55, 0.55), s = rand(8, 22); fx.spawn(c.pos.x, c.pos.y + 0.8, c.pos.z, Math.sin(a) * s, rand(0, 2), Math.cos(a) * s, k % 3 ? 0xff7a3c : 0xffd24a, rand(0.5, 1), 0.4, 0); }
        for (const e of G.enemies) { if (!hot(e) || e.spawnT > 0) continue; const dx = e.pos.x - c.pos.x, dz = e.pos.z - c.pos.z, d = Math.hypot(dx, dz); if (d < 10 + e.radius && (d < 2 || Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - yaw), Math.cos(Math.atan2(dx, dz) - yaw))) < 0.6)) { e.hurt(pw * 1.1, { ...o, from: c.pos, poise: 6 }); if (hot(e)) e.addStatus('burn', 3.5, pw * 0.5); } }
      });
      break;
    }
    case 'eruption': {
      const t = (tgt ? tgt.pos : p.pos).clone(); fx.telegraph(t, 5.5, 0.4, col); c.pos.set(t.x + 1, t.y, t.z + 1);
      after(0.4, () => { aoeEnemies(t, 5.5, pw * 5.2, { ...o, status: 'burn', statusT: 4, poise: 60, knock: 8 }); fx.column(t, col, 9, 50); fx.disc(t, 5.5, 0xffd24a, 40); fx.ring(t, col, 1, 5.5, 0.4, true); fx.shake(0.6); audio.sfx('boom'); });
      break;
    }
    case 'meteor': case 'thunderfall': {
      const thunder = art === 'thunderfall', n = thunder ? 3 : 6;
      const list = G.enemies.filter((e) => hot(e) && e.spawnT <= 0 && dist2(e.pos, p.pos) < 22).sort((a, b) => b.hp - a.hp);
      for (let i = 0; i < n; i++) {
        const e = list.length ? list[i % list.length] : null;
        after(i * (thunder ? 0.3 : 0.17), () => {
          const t = e && hot(e) ? e.pos.clone() : new THREE.Vector3(p.pos.x + rand(-7, 7), p.pos.y, p.pos.z + rand(-7, 7));
          if (!thunder) { t.x += rand(-1, 1); t.z += rand(-1, 1); fx.telegraph(t, 2.8, 0.45, col); }
          after(thunder ? 0 : 0.45, () => {
            aoeEnemies(t, thunder ? 3.4 : 2.9, pw * (thunder ? 5.6 : 2.4), { ...o, status: thunder ? null : 'burn', poise: thunder ? 90 : 25, knock: 4 });
            fx.column(t, col, thunder ? 16 : 7, thunder ? 60 : 24); fx.ring(t, col, 0.5, thunder ? 3.4 : 2.9, 0.3, true); fx.shake(thunder ? 0.5 : 0.25); audio.sfx(thunder ? 'zap' : 'boom', 0.8); if (thunder) audio.sfx('boom', 0.6);
          });
        });
      }
      break;
    }
    case 'tidalwave': {
      const yaw = tgt ? Math.atan2(tgt.pos.x - p.pos.x, tgt.pos.z - p.pos.z) : p.yaw, once = new Set(), ox = p.pos.x, oz = p.pos.z, oy = p.pos.y; audio.sfx('water');
      for (let i = 1; i <= 7; i++) after(i * 0.07, () => {
        const pt = { x: ox + Math.sin(yaw) * i * 2.4, y: oy, z: oz + Math.cos(yaw) * i * 2.4 };
        aoeEnemies(pt, 3.4, pw * 3, { ...o, once, knock: 14, poise: 40, from: { x: ox, z: oz } }); fx.disc(pt, 3.2, col, 16, 0.2); fx.ring(pt, 0xd8f2ff, 1, 3.2, 0.25);
      });
      break;
    }
    case 'aegis': p.aegis = 3; fx.ring(p.pos, col, 0.5, 2.4, 0.5, true); fx.column(p.pos, col, 2.4, 30); audio.sfx('water'); G.ui.toast('Pearl Aegis: the next 3 hits are absorbed', '', 2); break;
    case 'stillwater': aoeEnemies(p.pos, 9.5, pw * 1.6, { ...o, status: 'freeze', statusT: 3.5 }); fx.disc(p.pos, 9.5, 0xd8f6ff, 70); fx.ring(p.pos, 0xd8f6ff, 1, 9.5, 0.5, true); audio.sfx('parry', 0.6); break;
    case 'chainbolt': {
      const hit = new Set(); let cur = tgt || nearestEnemy(p.pos, 16); let from = c.pos.clone(); from.y += 0.8; audio.sfx('zap');
      for (let i = 0; i < 6 && cur; i++) {
        hit.add(cur); const e = cur, f = from.clone(), dmg = pw * 2.6 * Math.pow(0.9, i);
        after(i * 0.07, () => { if (!hot(e)) return; const to = e.pos.clone(); to.y += e.model.height * 0.5; fx.bolt(f, to, col); e.hurt(dmg, { ...o, from: f, poise: 18 }); });
        from = e.pos.clone(); from.y += e.model.height * 0.5;
        cur = nearestEnemy(e.pos, 9.5, (x) => !hit.has(x));
      }
      break;
    }
    case 'galeforce': {
      const t = (tgt ? tgt.pos : p.pos).clone(); audio.sfx('wind');
      for (let i = 0; i < 9; i++) after(i * 0.28, () => {
        for (let k = 0; k < 16; k++) { const a = rand(TAU), r = rand(1, 8); fx.spawn(t.x + Math.cos(a) * r, t.y + rand(3), t.z + Math.sin(a) * r, -Math.sin(a) * 9, rand(1, 4), Math.cos(a) * 9, k % 2 ? col : 0xffffff, 0.4, 0.4, 0); }
        for (const e of G.enemies) { if (!hot(e) || e.spawnT > 0 || e.boss) continue; const dx = t.x - e.pos.x, dz = t.z - e.pos.z, d = Math.hypot(dx, dz); if (d < 10 && d > 0.8) { e.vel.x += dx / d * 7 / e.mass; e.vel.z += dz / d * 7 / e.mass; } }
        aoeEnemies(t, 5, pw * 0.85, { ...o, poise: 8 });
      });
      break;
    }
    case 'dread': aoeEnemies(p.pos, 11, pw, { ...o, status: 'weak', statusT: 7 }); fx.disc(p.pos, 11, col, 70); fx.ring(p.pos, col, 11, 1, 0.5, true); audio.sfx('dark'); break;
    case 'shadowstrike': {
      const list = G.enemies.filter((e) => hot(e) && e.spawnT <= 0 && e.aggro && dist2(e.pos, p.pos) < 13).sort((a, b) => dist2(a.pos, p.pos) - dist2(b.pos, p.pos)).slice(0, 7);
      c.busy = list.length * 0.12 + 0.3; audio.sfx('dark');
      list.forEach((e, i) => after(i * 0.12, () => { if (!hot(e)) return; fx.burst({ x: c.pos.x, y: c.pos.y + 0.6, z: c.pos.z }, col, 8, { speed: 3 }); c.pos.set(e.pos.x + rand(-1, 1), e.pos.y, e.pos.z + rand(-1, 1)); e.hurt(pw * 3.4, { ...o, from: c.pos, poise: 35, crit: Math.random() < 0.4 }); audio.sfx('swing'); }));
      break;
    }
  }
}

// ---------------------------------------------------------------- Bond Rite
export function tryBind() {
  const p = G.player; let best = null, bd = 11, near = null;
  for (const e of G.enemies) { if (!e.wild || e.dead) continue; const d = dist2(e.pos, p.pos); if (d < 11) near = near || e; if (d < bd && e.bindable) { bd = d; best = e; } }
  if (G.lock && G.lock.bindable && dist2(G.lock.pos, p.pos) < 13) best = G.lock;
  if (!best) { if (near) { G.ui.toast('Weaken it below half health first.'); audio.sfx('deny'); return true; } return false; }
  if (G.save.kith.some((k) => k.species === best.species)) { G.ui.toast(`You already share a bond with a ${best.wild.name}.`); audio.sfx('deny'); return true; }
  if (G.save.threads <= 0) { G.ui.toast('No Bond Threads left. Pip sells them in Lanternrest.'); audio.sfx('deny'); return true; }
  G.save.threads--;
  const sp = best.wild, hpk = best.hp / best.maxHp;
  G.ui.bindRite({ name: sp.name, rar: sp.rar, hpk, color: EL[sp.el].css }, (ok) => {
    if (best.dead || best.gone) return;
    if (ok) {
      const { joined } = addKith(best.species, Math.max(1, best.level));
      fx.column(best.pos, EL[sp.el].color, 6, 60); fx.ring(best.pos, EL[sp.el].color, 0.5, 5, 0.6, true); audio.sfx('bound');
      best.dead = true; best.remove();
      G.ui.toast(`${sp.name} is now your Kith!`, 'gold', 3.5);
      if (!joined) G.ui.toast(`Your party is full. ${sp.name} waits with Keeper Oona.`, '', 4);
      else if (!G.comp) summonActive();
      G.game.save();
    } else {
      best.hp = Math.min(best.maxHp, best.hp + best.maxHp * 0.15); best.cd = 0; best.stag = 0;
      G.ui.toast(`${sp.name} slipped the thread!`); audio.sfx('bindBad');
    }
  });
  return true;
}
