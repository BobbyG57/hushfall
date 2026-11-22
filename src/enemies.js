// Enemies, wild Kith and bosses. Attacks are written as generator scripts that yield wait times.
import * as THREE from 'three';
import { G } from './state.js';
import { fx } from './fx.js';
import { audio } from './audio.js';
import { ENEMY, BOSS, EL, KITH, elMult, hpScale, dmgScale } from './data.js';
import { makeEnemyModel, makeBossModel, makeKithModel, animate } from './models.js';
import { rand, clamp, angDiff, angLerp, damp, weighted, TAU } from './util.js';
import { after, shoot, aoePlayer, shockwave, wallWave, beam, moveXZ } from './combat.js';

export class Enemy {
  constructor(type, level, el, o = {}) {
    this.type = type; this.level = level; this.el = el; this.elite = !!o.elite; this.wild = null; this.boss = null; this.bossId = null;
    let d, model;
    if (o.wild) {
      const sp = KITH[o.wild]; this.wild = sp; this.species = o.wild; this.el = sp.el;
      d = { name: sp.name, hp: 46 + sp.rar * 16, dmg: 6 + sp.rar * 1.5, speed: 5.2, radius: 0.5 * sp.m.size, poise: 16, xp: 1 + sp.rar * 0.6, ai: sp.style === 'melee' ? 'melee' : 'ranged', range: 2.2 };
      model = makeKithModel(o.wild, false); this.passive = true;
    } else if (o.boss) {
      d = { ...BOSS[o.boss], xp: 14, ai: 'boss', range: 4 }; this.boss = d; this.bossId = o.boss; this.el = d.el; model = makeBossModel(o.boss);
    } else { d = ENEMY[type]; model = makeEnemyModel(type, el, this.elite); }
    this.def = d; this.model = model; this.scale = model.root.scale.x; this.K = this.elite ? 1.25 : 1;
    this.name = (this.elite ? 'Elite ' : '') + d.name;
    this.maxHp = Math.round(d.hp * hpScale(level) * (this.elite ? 2.3 : 1)); this.hp = this.maxHp;
    this.dmg = d.dmg * dmgScale(level) * (this.elite ? 1.2 : 1); this.speed = d.speed; this.radius = d.radius * this.K;
    this.poiseMax = d.poise * (this.elite ? 1.6 : 1); this.poise = this.poiseMax; this.mass = Math.max(1, this.radius * this.radius * 2.6);
    this.xp = Math.round((6 + 4 * level) * d.xp * (this.elite ? 2.2 : 1)); this.motes = Math.round((4 + level * 1.5) * d.xp * (this.elite ? 2.5 : 1) * rand(0.8, 1.25));
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.yaw = rand(TAU); this.home = null; this.sight = this.boss ? 60 : 15;
    this.aggro = false; this.cd = rand(0.4, 1.4); this.script = null; this.wait = 0; this.stag = 0; this.status = {}; this.spawnT = 0.6;
    this.dead = false; this.gone = false; this.deathT = 0; this.poseName = null; this.poseDur = 0; this.poseT = 0; this.animT = rand(10);
    this.strafe = Math.random() < 0.5 ? 1 : -1; this.token = false; this.tracking = false; this.trackRate = 8; this.invuln = false; this.fric = 7;
    this.walkX = 0; this.walkZ = 0; this.wanderT = 0; this.wanderYaw = this.yaw; this.dashV = 0; this.dashHit = false; this.pulling = 0;
    this.phase = 1; this.lastPat = ''; this.summoned = false; this.run = 0;
    G.scene.add(model.root); model.root.scale.setScalar(0.001);
  }
  place(x, z) { this.pos.set(x, 0, z); G.area.resolve(this.pos, this.radius, this); this.pos.y = G.area.heightAt(this.pos.x, this.pos.z); this.home = { x: this.pos.x, z: this.pos.z }; this.model.root.position.copy(this.pos); }
  get bindable() { return !!this.wild && !this.tame && !this.dead && this.hp / this.maxHp <= 0.5; }   // tame: Sable's own Kith
  remove() { this.gone = true; this.releaseToken(); G.scene.remove(this.model.root); this.model.dispose(); if (G.lock === this) G.lock = null; if (G.boss === this) G.boss = null; }
  alert() { if (!this.aggro) { this.aggro = true; this.passive = false; G.combatT = Math.max(G.combatT, 3); if (!this.wild && !this.boss && !this.minion) G.game.tip(this.type); } }

  // ---- script helpers
  start(gen) { this.script = gen; this.wait = 0; }
  endScript() { this.script = null; this.tracking = false; this.trackRate = 8; this.poseName = null; this.dashV = 0; this.pulling = 0; this.releaseToken(); if (this.hidden) this.hide(false); }
  takeToken() { if (this.token) return true; if (G.attackers >= 2) return false; G.attackers++; this.token = true; return true; }
  releaseToken() { if (this.token) { this.token = false; G.attackers = Math.max(0, G.attackers - 1); } }
  pose(name, dur = 0) { this.poseName = name; this.poseDur = dur; this.poseT = 0; }
  tele() { this.model.flash = 0.9; this.model.flashCol.set(0xff2a2a); audio.sfx('tele', 0.8); }
  push(sp) { this.vel.x = Math.sin(this.yaw) * sp; this.vel.z = Math.cos(this.yaw) * sp; }
  front(d) { return { x: this.pos.x + Math.sin(this.yaw) * d, y: this.pos.y, z: this.pos.z + Math.cos(this.yaw) * d }; }
  mouth() { return new THREE.Vector3(this.pos.x, this.pos.y + this.model.height * 0.62, this.pos.z); }
  faceP(dt, rate) { const p = G.player.pos; this.yaw = angLerp(this.yaw, Math.atan2(p.x - this.pos.x, p.z - this.pos.z), 1 - Math.exp(-rate * dt)); }
  walk(nx, nz, sp) { this.walkX = nx * sp; this.walkZ = nz * sp; }
  hide(v) { this.hidden = v; this.model.root.visible = !v; this.invuln = v; }
  stagger(t) { this.stag = Math.max(this.stag, t); if (this.script) this.endScript(); this.cd = Math.max(this.cd, 0.5); }
  hitArc(range, arcDeg, dmg, o = {}) {
    const p = G.player; if (p.dead) return false;
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz);
    if (d - p.radius > range || Math.abs(p.pos.y - this.pos.y) > 2.2 + this.radius) return false;
    if (d > 1 && Math.abs(angDiff(this.yaw, Math.atan2(dx, dz))) > arcDeg * Math.PI / 360) return false;
    const res = p.takeHit(dmg, { from: this.pos, attacker: this, el: this.el, ...o });
    if (res === 'parry') { if (this.boss) { this.poise -= this.poiseMax * 0.34; if (this.poise <= 0) { this.poise = this.poiseMax; this.stagger(2.4); fx.dmgNum(this.top(), 'STAGGERED', 'crit'); } else this.stagger(0.8); } else this.stagger(1.6); }
    return res;
  }
  boom(pos, R, dmg) {
    const col = EL[this.el].color;
    aoePlayer(pos, R, dmg, { attacker: this, el: this.el, knock: 12 });
    fx.ring(pos, col, R * 0.3, R, 0.35, true); fx.disc(pos, R, col, 26); fx.shake(0.45); audio.sfx('boom', 0.8);
  }
  top() { return { x: this.pos.x, y: this.pos.y + this.model.height * 0.85, z: this.pos.z }; }
  addStatus(name, t, burnDmg) {
    if (this.boss && (name === 'root' || name === 'freeze')) t *= 0.35;
    const st = this.status; st[name] = Math.max(st[name] || 0, t);
    if (name === 'burn') { st.burnDmg = Math.max(st.burnDmg || 0, burnDmg || 1); st.burnTick = 0.5; }
    if (name === 'freeze' && this.script && !this.boss) this.endScript();
  }

  hurt(dmg, o = {}) {
    if (this.dead || this.spawnT > 0 || this.invuln || this.yielded) return false;
    let mult = elMult(o.el, this.el, o.player && G.save.skills.edge);
    if (this.status.weak > 0) mult *= 1.4;
    if (o.kith && G.run && G.run.boons.kindred) mult *= 1 + 0.4 * G.run.boons.kindred;
    let blocked = false;
    if ((this.def.ai === 'shield' || this.def.shield) && this.stag <= 0 && !(this.status.freeze > 0) && o.from) {
      const a = Math.atan2(o.from.x - this.pos.x, o.from.z - this.pos.z);
      if (Math.abs(angDiff(this.yaw, a)) < 1.15) { if (o.guardBreak) { this.stagger(1.5); fx.dmgNum(this.top(), 'GUARD BREAK', 'crit'); } else { blocked = true; mult *= 0.15; } }
    }
    if (o.crit) mult *= 1.7;
    const n = Math.max(1, Math.round(dmg * mult * rand(0.93, 1.07)));
    this.hp -= n; this.alert();
    fx.dmgNum(this.top(), n, blocked ? 'weak' : o.crit ? 'crit' : mult >= 1.3 ? 'strong' : mult < 0.8 ? 'weak' : '');
    this.model.flash = 1; this.model.flashCol.set(0xffffff);
    if (blocked) audio.sfx('clang'); else if (!o.quiet) { audio.sfx((o.poise || 0) > 25 ? 'hitHeavy' : 'hit'); if (o.crit) audio.sfx('crit'); }
    fx.burst({ x: this.pos.x, y: this.pos.y + this.model.height * 0.55, z: this.pos.z }, EL[o.el || 'none'].color, blocked || o.quiet ? 3 : 9, { speed: 6, life: 0.35 });
    G.lastHit = this; G.lastHitT = 4;
    if (!o.noStagger && !blocked) {
      this.poise -= (o.poise ?? 10);
      if (o.from && o.knock) { const dx = this.pos.x - o.from.x, dz = this.pos.z - o.from.z, d = Math.hypot(dx, dz) || 1, k = o.knock / this.mass; this.vel.x += dx / d * k; this.vel.z += dz / d * k; }
      if (this.poise <= 0) {
        this.poise = this.poiseMax;
        if (this.boss) { this.stagger(2.2); fx.dmgNum(this.top(), 'STAGGERED', 'crit'); audio.sfx('hitHeavy'); }
        else this.stagger(this.poiseMax > 30 ? 0.9 : 0.45);
      }
    }
    // Sable (the rival) never dies: at yieldAt health the fight stops and rival.js takes over
    if (this.yieldAt && this.hp <= this.maxHp * this.yieldAt) { this.hp = Math.ceil(this.maxHp * this.yieldAt); this.yielded = true; this.endScript(); this.pose(null); if (this.onYield) this.onYield(); return true; }
    if (this.hp <= 0) this.die();
    return true;
  }
  die() {
    this.dead = true; this.deathT = 0; this.hp = 0; this.endScript(); audio.sfx('die');
    fx.burst({ x: this.pos.x, y: this.pos.y + this.model.height * 0.5, z: this.pos.z }, EL[this.el].color, this.boss ? 70 : 22, { speed: this.boss ? 12 : 7, life: 0.7, size: 0.5 });
    if (G.lock === this) G.game.lockNext();
    G.game.onKill(this);
  }

  // ---------------------------------------------------------------- per-frame
  update(dt) {
    const m = this.model, pos = this.pos, p = G.player; this.animT += dt;
    if (this.dead) {
      this.deathT += dt; const k = 1 - clamp((this.deathT - 0.45) / 0.5, 0, 1);
      m.root.scale.setScalar(this.scale * k + 0.001); animate(m, { t: this.animT, run: 0, pose: 'dead', ph: 1 }, dt);
      if (this.deathT > 1) this.remove(); return;
    }
    if (this.spawnT > 0) {
      this.spawnT -= dt; m.root.scale.setScalar(this.scale * (1 - clamp(this.spawnT / 0.6, 0, 1)) + 0.001); m.root.position.copy(pos); m.root.rotation.y = this.yaw;
      if (Math.random() < 0.6) fx.spawn(pos.x + rand(-0.6, 0.6), pos.y + rand(1.6), pos.z + rand(-0.6, 0.6), 0, rand(1, 4), 0, EL[this.el].color, 0.4, 0.35, 0);
      return;
    }
    const st = this.status; let frozen = false, rooted = false;
    if (st.burn > 0) { st.burn -= dt; st.burnTick -= dt; if (Math.random() < dt * 14) fx.spawn(pos.x + rand(-0.4, 0.4), pos.y + rand(1.4), pos.z + rand(-0.4, 0.4), 0, rand(2, 4), 0, 0xff7a3c, 0.4, 0.3, 0); if (st.burnTick <= 0) { st.burnTick = 0.5; this.hurt(st.burnDmg, { el: 'ember', noStagger: true, quiet: true }); if (this.dead) return; } }
    if (st.freeze > 0) { st.freeze -= dt; frozen = true; m.flash = 0.55; m.flashCol.set(0x9adfff); }
    if (st.root > 0) { st.root -= dt; rooted = true; if (Math.random() < dt * 10) fx.spawn(pos.x + rand(-0.5, 0.5), pos.y + 0.1, pos.z + rand(-0.5, 0.5), 0, rand(1, 2), 0, 0x6fdc5a, 0.35, 0.4, 0); }
    if (st.weak > 0) { st.weak -= dt; if (Math.random() < dt * 8) fx.spawn(pos.x + rand(-0.4, 0.4), pos.y + m.height, pos.z + rand(-0.4, 0.4), 0, rand(-1, 0), 0, 0xb06cff, 0.4, 0.5, 0); }
    this.walkX = 0; this.walkZ = 0;
    if (this.stag > 0) { this.stag -= dt; this.poseName = 'hurt'; if (this.stag <= 0) this.poseName = null; }
    else if (frozen) { /* held */ }
    else if (this.script) {
      if (this.tracking) this.faceP(dt, this.trackRate);
      this.poseT += dt; this.wait -= dt; let guard = 0;
      while (this.wait <= 0 && this.script && guard++ < 24) { const r = this.script.next(); if (r.done) { this.endScript(); break; } this.wait += r.value || 0; }
    } else {
      this.poise = Math.min(this.poiseMax, this.poise + this.poiseMax * 0.12 * dt);
      if (this.boss) this.bossThink(dt); else this.think(dt);
    }
    if (this.dashV && !frozen) {
      this.walkX = Math.sin(this.yaw) * this.dashV; this.walkZ = Math.cos(this.yaw) * this.dashV;
      if (!this.dashHit) { const r = this.hitArc(this.radius + 1.5, 220, this.dmg * 1.3, { knock: 15 }); if (r) this.dashHit = true; }
      if (Math.random() < 0.7) fx.spawn(pos.x + rand(-1, 1), pos.y + rand(1.5), pos.z + rand(-1, 1), 0, rand(1, 3), 0, EL[this.el].color, 0.6, 0.4, 0);
    }
    if (this.pulling > 0 && !p.dead) {
      const dx = pos.x - p.pos.x, dz = pos.z - p.pos.z, d = Math.hypot(dx, dz);
      if (d > 2.5 && d < 26 && p.state !== 'dodge') { p.pos.x += dx / d * 5.5 * dt; p.pos.z += dz / d * 5.5 * dt; }
      const a = rand(TAU), rr = rand(3, 9); fx.spawn(pos.x + Math.cos(a) * rr, pos.y + 0.4, pos.z + Math.sin(a) * rr, -Math.cos(a) * 6, 1, -Math.sin(a) * 6, 0x4ab8ff, 0.5, 0.4, 0);
    }
    const mv = rooted || frozen ? 0 : 1;
    this.vel.x = damp(this.vel.x, 0, this.fric, dt); this.vel.z = damp(this.vel.z, 0, this.fric, dt);
    moveXZ(this, this.vel.x * (frozen ? 0 : 1) + this.walkX * mv, this.vel.z * (frozen ? 0 : 1) + this.walkZ * mv, dt);
    // keep bodies from stacking
    for (const o of G.enemies) {
      if (o === this || o.dead || o.spawnT > 0) continue;
      const dx = pos.x - o.pos.x, dz = pos.z - o.pos.z, d = Math.hypot(dx, dz), min = this.radius + o.radius;
      if (d < min && d > 0.001) { const k = (min - d) * 0.5 * (o.mass / (o.mass + this.mass)); pos.x += dx / d * k; pos.z += dz / d * k; }
    }
    if (!p.dead && !this.dashV) { const dx = pos.x - p.pos.x, dz = pos.z - p.pos.z, d = Math.hypot(dx, dz), min = this.radius + p.radius; if (d < min && d > 0.001 && p.pos.y - pos.y < m.height) { pos.x += dx / d * (min - d); pos.z += dz / d * (min - d); } }
    pos.y = G.area.heightAt(pos.x, pos.z);
    const sp = Math.hypot(this.walkX, this.walkZ) * mv;
    this.run = damp(this.run, clamp(sp / Math.max(1, this.speed), 0, 1), 10, dt);
    animate(m, { t: frozen ? 0 : this.animT, run: this.run, pose: this.poseName, ph: this.poseDur ? this.poseT / this.poseDur : 0, cad: this.boss ? 7 : 11 }, dt);
    m.root.position.copy(pos); m.root.rotation.y = this.yaw; m.root.scale.setScalar(this.scale);
  }

  think(dt) {
    const p = G.player, d0 = this.def, dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz);
    if (d0.ai === 'dummy') { if (d0.shield) this.faceP(dt, 1.4); return; }   // training dummies just stand there
    if (!this.aggro) {
      if (!p.dead && !this.passive && d < this.sight && Math.abs(p.pos.y - this.pos.y) < 7) this.alert();
      else { this.wander(dt); return; }
    }
    if (p.dead) return;
    if (this.home && G.area.kind === 'overworld' && (d > 48 || Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z) > 60)) { this.aggro = false; this.hp = this.maxHp; this.passive = !!this.wild; return; }
    G.combatT = Math.max(G.combatT, 3);
    this.cd -= dt; this.faceP(dt, 7);
    const nx = dx / (d || 1), nz = dz / (d || 1), reach = d - p.radius - this.radius;
    const ai = d0.ai;
    if (ai === 'spar') {   // Brannoc sparring: close in, then swing on a steady beat
      const want = d0.range;
      if (reach > want) this.walk(nx, nz, this.speed); else if (reach < want * 0.4) this.walk(-nx, -nz, this.speed * 0.5);
      if (reach <= want + 0.8 && this.cd <= 0) this.start(this.spar());
      return;
    }
    if (ai === 'ranged') {
      if (this.speed > 0) { if (reach < 6) this.walk(-nx, -nz, this.speed); else if (reach > 13) this.walk(nx, nz, this.speed); else this.walk(-nz * this.strafe, nx * this.strafe, this.speed * 0.5); if (Math.random() < dt * 0.25) this.strafe *= -1; }
      if (this.cd <= 0 && reach < 22) this.start(this.spit());
    } else if (ai === 'blink') {
      if (reach > 8) this.walk(nx, nz, this.speed); else this.walk(-nz * this.strafe, nx * this.strafe, this.speed * 0.7);
      if (this.cd <= 0 && reach < 16 && this.takeToken()) this.start(this.blink());
    } else {
      const want = d0.range * this.K;
      if (reach > want * 0.85) {
        let sx = nx, sz = nz, sp = this.speed;
        if (G.attackers >= 2 && !this.token && reach < 6) { const inw = reach > 4 ? 0.3 : -0.3; sx = -nz * this.strafe + nx * inw; sz = nx * this.strafe + nz * inw; sp *= 0.6; if (Math.random() < dt * 0.3) this.strafe *= -1; }
        this.walk(sx, sz, sp);
      } else if (ai !== 'lunge' && reach < want * 0.35) this.walk(-nx, -nz, this.speed * 0.5);
      if (reach <= want && this.cd <= 0 && this.takeToken()) {
        if (ai === 'lunge') this.start(this.pounce());
        else if (ai === 'brute') this.start(Math.random() < 0.55 ? this.slam() : this.swipe(true));
        else if (ai === 'shield') this.start(this.jab());
        else this.start(this.swipe(this.elite));
      }
    }
  }
  wander(dt) {
    this.wanderT -= dt;
    if (this.wanderT <= 0) { this.wanderT = rand(1.5, 4); this.wanderYaw = Math.random() < 0.45 ? null : rand(TAU); if (this.home && Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z) > 9) this.wanderYaw = Math.atan2(this.home.x - this.pos.x, this.home.z - this.pos.z); }
    if (this.wanderYaw !== null && this.speed > 0) { this.yaw = angLerp(this.yaw, this.wanderYaw, 1 - Math.exp(-4 * dt)); this.walk(Math.sin(this.yaw), Math.cos(this.yaw), this.speed * 0.3); }
  }

  // ---------------------------------------------------------------- basic attack scripts
  *swipe(two) {
    const R = (this.def.ai === 'brute' ? 4.2 : 2.8) * this.K;
    this.pose('charge'); this.tele(); this.tracking = true; yield 0.5; this.tracking = false;
    this.pose('h1', 0.22); this.push(7.5); audio.sfx('swing', 0.6); yield 0.12; this.hitArc(R, 130, this.dmg); yield 0.4;
    if (two) { this.tracking = true; this.pose('charge'); yield 0.32; this.tracking = false; this.pose('h2', 0.22); this.push(7); audio.sfx('swing', 0.6); yield 0.12; this.hitArc(R, 130, this.dmg); yield 0.4; }
    this.pose(null); yield 0.3; this.cd = rand(1.0, 2.2);
  }
  // Brannoc's sparring swing (training). Reports each swing that could have landed to this.onSpar.
  *spar() {
    this.pose('charge'); this.tele(); this.tracking = true; yield this.sparWind ? this.sparWind() : 0.65; this.tracking = false;
    const p = G.player, R = 2.9, reach = this.inArc(R + 1.6, 170);   // in reach as the swing starts (a dodge may carry you out)
    this.pose('h1', 0.22); this.push(6); audio.sfx('swing', 0.6); yield 0.12;
    const dodging = p.state === 'dodge' && p.t < 0.3, res = this.hitArc(R, 140, this.dmg, { knock: 4 });
    if (this.onSpar && reach) this.onSpar(res, res === false && dodging);
    yield 0.5; this.pose(null); yield 0.35; this.cd = rand(0.7, 1.3);
  }
  inArc(range, arcDeg) {
    const p = G.player, dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz);
    if (p.dead || d - p.radius > range || Math.abs(p.pos.y - this.pos.y) > 2.2 + this.radius) return false;
    return d <= 1 || Math.abs(angDiff(this.yaw, Math.atan2(dx, dz))) <= arcDeg * Math.PI / 360;
  }
  *pounce() {
    this.pose('charge'); this.tele(); this.tracking = true; yield 0.4; this.tracking = false;
    this.pose('atk', 0.3); this.push(17); yield 0.12; let r = this.hitArc(1.9, 150, this.dmg); yield 0.1; if (!r) this.hitArc(1.9, 150, this.dmg);
    yield 0.5; this.cd = rand(1.2, 2.4);
  }
  *slam() {
    const R = 3.6 * this.K;
    this.pose('over'); this.tele(); this.tracking = true; this.trackRate = 3; yield 0.35; this.tracking = false;
    const f = this.front(2.6 * this.K); fx.telegraph(f, R, 0.55); yield 0.55;
    this.pose('v', 0.14); yield 0.1; this.boom(f, R, this.dmg * 1.4); yield 0.9; this.cd = rand(1.4, 2.4);
  }
  *jab() {
    this.pose('charge'); this.tele(); this.tracking = true; yield 0.55; this.tracking = false;
    this.pose('thrust', 0.2); this.push(10); audio.sfx('swing', 0.6); yield 0.12; this.hitArc(3.7 * this.K, 55, this.dmg); yield 0.7; this.cd = rand(1.3, 2.3);
  }
  *spit() {
    this.pose('charge'); this.tele(); this.tracking = true; yield 0.6; this.tracking = false; this.pose('atk', 0.3);
    const from = this.mouth(), p = G.player.pos, dx = p.x - from.x, dy = p.y + 1 - from.y, dz = p.z - from.z, d = Math.hypot(dx, dy, dz) || 1, base = Math.atan2(dx, dz);
    for (const off of this.elite ? [-0.25, 0, 0.25] : [0]) shoot({ pos: from, dir: { x: Math.sin(base + off) * Math.hypot(dx, dz) / d, y: dy / d, z: Math.cos(base + off) * Math.hypot(dx, dz) / d }, speed: 15, dmg: this.dmg, el: this.el, owner: this });
    audio.sfx('water', 0.5); yield 0.5; this.pose(null); this.cd = rand(2, 3.2);
  }
  *blink() {
    const col = EL[this.el].color, p = G.player;
    fx.burst(this.top(), col, 14, { speed: 4 }); audio.sfx('dark', 0.6); this.hide(true); yield 0.25;
    const a = p.yaw + Math.PI + rand(-0.7, 0.7); this.pos.set(p.pos.x + Math.sin(a) * 2.9, 0, p.pos.z + Math.cos(a) * 2.9); G.area.resolve(this.pos, this.radius, this);
    this.hide(false); fx.burst(this.top(), col, 14, { speed: 4 }); this.faceP(1, 99);
    this.pose('charge'); this.tele(); this.tracking = true; yield 0.42; this.tracking = false;
    this.pose('h1', 0.2); this.push(5); audio.sfx('swing', 0.7); yield 0.1; this.hitArc(3.1 * this.K, 160, this.dmg); yield 0.7; this.pose(null); this.cd = rand(2.2, 3.6);
  }

  // ---------------------------------------------------------------- boss brain + patterns
  bossThink(dt) {
    const p = G.player; if (p.dead || this.yielded) return;
    if (!this.aggro) { this.alert(); }
    G.combatT = 3; this.cd -= dt; this.faceP(dt, 5);
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz), nx = dx / (d || 1), nz = dz / (d || 1), reach = d - this.radius - p.radius;
    const hk = this.hp / this.maxHp, ph = this.bossId === 'king' ? (hk < 0.33 ? 3 : hk < 0.66 ? 2 : 1) : (hk < 0.5 ? 2 : 1);
    if (ph > this.phase) { this.phase = ph; this.start(this.enrage()); return; }
    if (this.cd > 0) {
      if (this.bossId === 'brine') { if (reach < 8) this.walk(-nx, -nz, this.speed); else this.walk(-nz * this.strafe, nx * this.strafe, this.speed * 0.6); }
      else if (reach > 3) this.walk(nx, nz, this.speed); else this.walk(-nz * this.strafe, nx * this.strafe, this.speed * 0.4);
      if (Math.random() < dt * 0.2) this.strafe *= -1;
      return;
    }
    this.start(this.runPattern(reach));
  }
  *runPattern(reach) {
    const P = this.phase, id = this.bossId, K = this.scale; let o = [];
    if (id === 'ghorn') { o = [['sweep', reach < 6 ? 3 : 0.5], ['slam', 2], ['rain', reach > 7 ? 3 : 1]]; if (P > 1) { o.push(['shock', 2]); if (!this.summoned) o = [['summonS', 1]]; } }
    else if (id === 'cindermaw') { o = [['charge', reach > 8 ? 4 : 1.5], ['fan', reach < 13 ? 3 : 1], ['meteor', 2], ['sweep', reach < 5 ? 2.5 : 0]]; if (P > 1) o.push(['slamwave', 2.5], ['charge3', 2]); }
    else if (id === 'brine') { o = [['ring', 3], ['volley', 3], ['wall', 2.5], ['pull', reach < 14 ? 2.5 : 1], ['escape', reach < 4 ? 6 : 0]]; if (P > 1) o.push(['ring3', 3], ['wall2', 3], ['rain', 2]); }
    else if (id === 'sable') {   // the rival fights like a swordsman, and harder each duel (tier 1 to 3)
      const T = this.tier || 1; o = [['sCombo', reach < 6 ? 3 : 0.6], ['sBlink', T > 1 ? 2.2 : 1], ['sDash', reach > 5 ? 2.2 : 0.6]];
      if (T > 1) o.push(['sBolts', 1.6]); if (T > 2 || P > 1) o.push(['sRain', 1.3]);
    }
    else if (id === 'skarn') { o = [['blink', 3.5], ['charge', reach > 5 ? 2 : 0.5], ['rain', 2], ['sweep', reach < 5 ? 2.5 : 0]]; if (P > 1) o.push(['beam', 3], ['blink5', 3], ['shock', 1.5]); }
    else { o = [['sweep3', reach < 7 ? 3.5 : 1], ['slamwave', 2.5], ['ring', 2], ['blink', 2]]; if (P > 1) { o.push(['rain', 2.5], ['volley', 2]); if (!this.summoned) o.push(['summonW', 2]); } if (P > 2) o.push(['beam', 3], ['shock3', 3], ['blink5', 2.5]); }
    o = o.filter((e) => e[1] > 0); if (o.length > 1) o = o.filter((e) => e[0] !== this.lastPat);
    const name = weighted(o); this.lastPat = name;
    const big = id === 'ghorn' || id === 'king' ? 5.6 : id === 'cindermaw' ? 6 : 4.4;
    switch (name) {
      case 'sweep': yield* this.pSweep(P > 1 ? 2 : 1, big); break;
      case 'sweep3': yield* this.pSweep(3, big + 0.6); break;
      case 'slam': yield* this.pSlam(6, P > 1); break;
      case 'slamwave': yield* this.pSlam(6.5, true); break;
      case 'rain': yield* this.pRain(P > 1 ? 6 : 4, 3.2, 0.3); break;
      case 'meteor': yield* this.pRain(P > 1 ? 8 : 5, 3.4, 0.22); break;
      case 'charge': yield* this.pCharge(1); break;
      case 'charge3': yield* this.pCharge(3); break;
      case 'fan': yield* this.pFan(P > 1 ? 4 : 3); break;
      case 'ring': yield* this.pRing(12, 9, P > 1 ? 2 : 1); break;
      case 'ring3': yield* this.pRing(16, 10, 3); break;
      case 'volley': yield* this.pVolley(P > 1 ? 7 : 5); break;
      case 'wall': yield* this.pWall(1); break;
      case 'wall2': yield* this.pWall(2); break;
      case 'pull': yield* this.pPull(); break;
      case 'escape': yield* this.pEscape(); break;
      case 'blink': yield* this.pBlink(3); break;
      case 'blink5': yield* this.pBlink(5); break;
      case 'beam': yield* this.pBeam(4.5, 1.0); break;
      case 'shock': yield* this.pShock(2); break;
      case 'shock3': yield* this.pShock(3); break;
      case 'summonS': this.summoned = true; yield* this.pSummon('skitter', 3); break;
      case 'summonW': this.summoned = true; yield* this.pSummon('wraith', 2); break;
      case 'sCombo': yield* this.pSweep(Math.min(3, (this.tier || 1) + 1), 3.8); break;
      case 'sBlink': yield* this.pBlink(this.tier || 1); break;
      case 'sDash': yield* this.pCharge((this.tier || 1) > 2 ? 2 : 1); break;
      case 'sBolts': yield* this.pVolley(2 + (this.tier || 1)); break;
      case 'sRain': yield* this.pRain(3 + (this.tier || 1), 3, 0.3); break;
    }
    void K; this.pose(null); this.cd = P > 2 ? 0.45 : P > 1 ? 0.75 : 1.25;
  }
  *enrage() {
    const col = EL[this.el].color; this.invuln = true; this.pose('cast'); audio.sfx('roar'); fx.shake(0.7); fx.ring(this.pos, col, 1, 14, 0.7, true); fx.column(this.pos, col, 8, 50);
    yield 0.5; shockwave(this.pos, { dmg: this.dmg * 0.8, el: this.el, color: col, r0: 2, maxR: 36, speed: 13 }); yield 0.8; this.invuln = false; this.pose(null); this.cd = 0.3;
  }
  *pSweep(n, range) {
    for (let i = 0; i < n; i++) {
      this.pose('charge'); this.tele(); this.tracking = true; this.trackRate = 6; yield i ? 0.36 : 0.62; this.tracking = false;
      this.pose(i % 2 ? 'h2' : 'h1', 0.22); this.push(9); audio.sfx('swingHeavy'); yield 0.13; this.hitArc(range, 170, this.dmg, { knock: 10 }); yield 0.28;
    }
    this.pose(null); yield 0.55;
  }
  *pSlam(R, wave) {
    this.pose('over'); this.tele(); this.tracking = true; this.trackRate = 3; yield 0.3; this.tracking = false;
    const f = this.front(this.radius + 1.6); fx.telegraph(f, R, 0.7); yield 0.7; this.pose('v', 0.12); yield 0.1; this.boom(f, R, this.dmg * 1.5);
    if (wave) shockwave(f, { dmg: this.dmg, el: this.el, color: EL[this.el].color, r0: R * 0.7, maxR: 36, speed: 12 });
    yield 0.95;
  }
  *pRain(n, R, gap) {
    this.pose('cast'); this.tele();
    for (let i = 0; i < n; i++) {
      const p = G.player, t = { x: p.pos.x + rand(-1.5, 1.5) + p.vel.x * 0.5, y: p.pos.y, z: p.pos.z + rand(-1.5, 1.5) + p.vel.z * 0.5 };
      fx.telegraph(t, R, 0.85); after(0.85, () => { if (!this.dead && !this.yielded) { this.boom(t, R, this.dmg * 1.1); fx.column(t, EL[this.el].color, 9, 20); } }); yield gap;
    }
    yield 0.7;
  }
  *pCharge(n) {
    for (let i = 0; i < n; i++) {
      this.pose('charge'); this.tele(); this.tracking = true; this.trackRate = 10; yield i ? 0.5 : 0.8; this.tracking = false;
      this.pose('atk', 0.7); this.dashHit = false; this.dashV = 27; audio.sfx('swingHeavy'); yield 0.65; this.dashV = 0; this.pose(null); yield 0.45;
    }
    yield 0.4;
  }
  *pFan(count) {
    this.pose('charge'); this.tele(); this.tracking = true; yield 0.6; this.tracking = false; this.pose('atk', count * 0.25);
    for (let i = 0; i < count; i++) {
      const from = this.mouth(); from.y = this.pos.y + 1.1;
      for (let k = -2; k <= 2; k++) { const a = this.yaw + k * 0.22 + rand(-0.05, 0.05); shoot({ pos: from, dir: { x: Math.sin(a), z: Math.cos(a) }, speed: 14, dmg: this.dmg * 0.8, el: this.el, owner: this, life: 1.3, r: 0.4 }); }
      audio.sfx('fire'); this.faceP(1, 2); yield 0.26;
    }
    yield 0.6;
  }
  *pRing(n, sp, waves) {
    this.pose('cast'); this.tele(); yield 0.5;
    for (let w = 0; w < waves; w++) {
      const from = this.mouth(); from.y = this.pos.y + 1.1;
      for (let k = 0; k < n; k++) { const a = (k / n) * TAU + w * Math.PI / n; shoot({ pos: from, dir: { x: Math.sin(a), z: Math.cos(a) }, speed: sp, dmg: this.dmg * 0.8, el: this.el, owner: this, life: 3.5, r: 0.38 }); }
      audio.sfx('water'); yield 0.6;
    }
    yield 0.5;
  }
  *pVolley(n) {
    this.pose('cast'); this.tele(); this.tracking = true; yield 0.4;
    for (let i = 0; i < n; i++) {
      const from = this.mouth(), p = G.player.pos, dx = p.x - from.x, dy = p.y + 1 - from.y, dz = p.z - from.z, d = Math.hypot(dx, dy, dz) || 1;
      shoot({ pos: from, dir: { x: dx / d, y: dy / d, z: dz / d }, speed: 17, dmg: this.dmg * 0.85, el: this.el, owner: this, r: 0.36 }); audio.sfx('zap', 0.4); yield 0.24;
    }
    this.tracking = false; yield 0.6;
  }
  *pShock(n) {
    for (let i = 0; i < n; i++) {
      this.pose('over'); this.tele(); yield 0.55; this.pose('v', 0.1); yield 0.1;
      shockwave(this.pos, { dmg: this.dmg, el: this.el, color: EL[this.el].color, r0: this.radius, maxR: 36, speed: 12 }); audio.sfx('boom', 0.7); fx.shake(0.3); yield 0.8;
    }
    yield 0.3;
  }
  *pSummon(type, n) {
    this.pose('cast'); this.tele(); audio.sfx('roar', 0.6); yield 0.8;
    for (let i = 0; i < n; i++) { const a = rand(TAU); const e = spawnEnemy(type, this.pos.x + Math.cos(a) * 5, this.pos.z + Math.sin(a) * 5, Math.max(1, this.level - 2), this.el); e.minion = true; e.alert(); yield 0.4; }
    yield 0.5;
  }
  *pBlink(n) {
    const col = EL[this.el].color, p = G.player;
    for (let i = 0; i < n; i++) {
      fx.burst(this.top(), col, 16, { speed: 5 }); audio.sfx('zap', 0.5); this.hide(true); yield 0.22;
      const a = p.yaw + Math.PI + rand(-1.4, 1.4); this.pos.set(p.pos.x + Math.sin(a) * 3.8, 0, p.pos.z + Math.cos(a) * 3.8); G.area.resolve(this.pos, this.radius, this);
      this.hide(false); fx.burst(this.top(), col, 16, { speed: 5 }); this.faceP(1, 99);
      this.pose('charge'); this.tele(); this.tracking = true; yield 0.38; this.tracking = false;
      this.pose(i % 2 ? 'h2' : 'h1', 0.18); this.push(6); audio.sfx('swingHeavy', 0.7); yield 0.1;
      this.hitArc(4.4, 160, this.dmg); yield 0.24;
    }
    this.pose(null); yield 1.0;
  }
  *pBeam(dur, rot) {
    this.pose('cast'); this.tele(); audio.sfx('zap'); yield 0.3;
    beam(this, { len: 30, rot: (Math.random() < 0.5 ? 1 : -1) * rot, dmg: this.dmg, life: dur, el: this.el, double: true, ang: this.yaw + Math.PI / 2, warm: 0.8 }); yield dur + 0.4;
  }
  *pWall(n) {
    this.pose('cast'); this.tele(); yield 0.6;
    for (let i = 0; i < n; i++) {
      const p = G.player.pos, a = Math.atan2(p.x - this.pos.x, p.z - this.pos.z) + i * Math.PI / 2, dx = Math.sin(a), dz = Math.cos(a);
      wallWave({ x: p.x - dx * 16, z: p.z - dz * 16 }, { dx, dz, speed: 12, half: 40, dmg: this.dmg * 1.1, el: this.el, life: 4 }); audio.sfx('water'); yield 1.1;
    }
    yield 0.4;
  }
  *pPull() {
    this.pose('cast'); this.tele(); fx.telegraph(this.pos, 8, 1.9, 0x4ab8ff); audio.sfx('wind'); this.pulling = 1; yield 1.9; this.pulling = 0;
    this.pose('v', 0.1); this.boom(this.pos, 8, this.dmg * 1.6); yield 1.0;
  }
  *pEscape() {
    const col = EL[this.el].color, p = G.player.pos; fx.burst(this.top(), col, 16, { speed: 5 }); audio.sfx('water'); this.hide(true); yield 0.3;
    const a = Math.atan2(this.pos.x - p.x, this.pos.z - p.z) + rand(-0.8, 0.8); this.pos.set(p.x + Math.sin(a) * 17, 0, p.z + Math.cos(a) * 17); G.area.resolve(this.pos, this.radius, this);
    this.hide(false); fx.burst(this.top(), col, 16, { speed: 5 }); yield 0.2;
  }
}

export function spawnEnemy(type, x, z, level, el, o = {}) {
  let elite = !!o.elite; if (type.startsWith('E:')) { elite = true; type = type.slice(2); }
  const e = new Enemy(type, level, el, { ...o, elite }); e.place(x, z); G.enemies.push(e); return e;
}
export function spawnWild(species, x, z, level) { const e = new Enemy('wild', level, KITH[species].el, { wild: species }); e.place(x, z); G.enemies.push(e); return e; }
export function spawnBoss(id, x, z, level) { const e = new Enemy('boss', level, BOSS[id].el, { boss: id }); e.place(x, z); e.spawnT = 1.2; G.enemies.push(e); return e; }
