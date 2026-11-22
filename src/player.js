// The hero: movement, jumping, the combo system, dodge / parry, taking damage.
import * as THREE from 'three';
import { G } from './state.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { fx, Trail } from './fx.js';
import { clamp, damp, angDiff, angLerp, rand } from './util.js';
import { EL } from './data.js';
import { makePlayerModel, animate, addXray } from './models.js';
import { moveXZ } from './combat.js';

const ATK = {
  l1: { dur: 0.36, hit: [0.09, 0.19], dmg: 1, range: 2.7, arc: 130, pose: 'h1', move: 5.5, poise: 9, next: 'l2', gauge: 4 },
  l2: { dur: 0.36, hit: [0.09, 0.19], dmg: 1, range: 2.7, arc: 130, pose: 'h2', move: 5.5, poise: 9, next: 'l3', gauge: 4 },
  l3: { dur: 0.42, hit: [0.13, 0.23], dmg: 1.35, range: 2.9, arc: 90, pose: 'v', move: 6, poise: 14, next: 'l4', gauge: 5 },
  l4: { dur: 0.62, hit: [0.16, 0.34], dmg: 2.1, range: 3.3, arc: 360, pose: 'spin', move: 4, poise: 32, knock: 10, gauge: 8, heavy: true },
  heavy: { dur: 0.56, hit: [0.12, 0.26], dmg: 2.2, range: 3.9, arc: 70, pose: 'thrust', move: 15, poise: 45, knock: 8, guardBreak: true, gauge: 7, heavy: true },
  cleave: { dur: 0.58, hit: [0.14, 0.32], dmg: 1.9, range: 3.5, arc: 360, pose: 'spin', move: 3, poise: 34, knock: 7, guardBreak: true, gauge: 8, heavy: true },
  dash: { dur: 0.4, hit: [0.05, 0.22], dmg: 1.5, range: 3, arc: 130, pose: 'h1', move: 17, poise: 14, gauge: 5, next: 'l2' },
  air: { dur: 0.36, hit: [0.08, 0.2], dmg: 1.1, range: 2.9, arc: 160, pose: 'h2', move: 3, poise: 10, gauge: 4 },
  counter: { dur: 0.34, hit: [0.06, 0.18], dmg: 2.6, range: 3.4, arc: 170, pose: 'h1', move: 8, poise: 40, gauge: 10, crit: true, next: 'l2' },
  sky: { slam: true, dmg: 3.2, radius: 4.8, poise: 70, knock: 9, guardBreak: true, gauge: 10, heavy: true },
  plunge: { slam: true, dmg: 2.3, radius: 3.6, poise: 45, knock: 7, guardBreak: true, gauge: 7, heavy: true },
};
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();

export class Player {
  constructor() {
    this.model = makePlayerModel(); addXray(this.model); G.scene.add(this.model.root);
    this.trail = new Trail(G.scene);
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.yaw = 0; this.radius = 0.45;
    this.hp = 100; this.gauge = 0; this.potions = 3; this.elColor = 0xffffff;
    this.reset(); this.hp = this.maxHp; this.potions = this.maxPotions;
  }
  reset() {
    this.state = 'move'; this.t = 0; this.atk = null; this.atkId = ''; this.comboNext = null; this.comboT = 0; this.hitSet = new Set(); this.queued = null;
    this.invuln = 0; this.guardT = 0; this.grounded = true; this.groundY = 0; this.jumps = 0; this.coyote = 0; this.dodgeCd = 0; this.dashT = 0;
    this.riposteT = 0; this.unisonT = 0; this.aegis = 0; this.regen = 0; this.dead = false; this.charge = 0; this.chargeMult = 1; this.curMult = 1;
    this.run = 0; this.animT = 0; this.windUsed = false; this.perfect = false; this.swapCd = 0; this.stepT = 0; this.sliding = false;
    this.hasMove = false; this.moveYaw = 0; this.aimDist = 99; this.didHit = false; this.swung = false; this.slamDone = false; this.dodgeYaw = 0; this.dodgeHit = new Set();
    this.vel.set(0, 0, 0); this.recalc();
  }
  recalc() {
    const s = G.save, b = G.run ? G.run.boons : {};
    this.maxHp = 100 + 6 * (s.level - 1) + 15 * s.vit + 30 * (b.vigor || 0);
    this.atkPow = 10 * (1 + 0.06 * (s.level - 1)) * (1 + 0.15 * s.blade) * (s.skills.master ? 1.15 : 1) * (1 + 0.2 * (b.might || 0));
    this.maxPotions = 3 + s.flask;
    this.critCh = (s.skills.master ? 0.16 : 0.08) + 0.15 * (b.keen || 0);
    this.speedMul = 1 + 0.12 * (b.haste || 0);
    if (this.hp > this.maxHp) this.hp = this.maxHp;
  }
  has(id) { return !!G.save.skills[id]; }
  get element() { return G.comp ? G.comp.sp.el : 'none'; }
  setElement(el) {
    this.elColor = EL[el].color;
    this.model.bladeMat.emissive.set(this.elColor).multiplyScalar(0.75);
    this.model.bladeMat.color.set(this.elColor).lerp(new THREE.Color(0xffffff), 0.6);
  }
  setState(s) { this.state = s; this.t = 0; }
  heal(n, quiet) { if (this.dead) return; const before = this.hp; this.hp = Math.min(this.maxHp, this.hp + n); if (!quiet && this.hp > before) { fx.dmgNum({ x: this.pos.x, y: this.pos.y + 2.1, z: this.pos.z }, '+' + Math.round(this.hp - before), 'heal'); fx.column(this.pos, 0x6ff0c8, 2.2, 14); } }
  addGauge(n) { if (!G.save.relics.cinders) return; this.gauge = Math.min(100, this.gauge + n * (this.has('fury') ? 1.4 : 1)); }
  fullRestore() { this.recalc(); this.hp = this.maxHp; this.potions = this.maxPotions; this.windUsed = false; }

  jump(second) {
    this.vel.y = second ? 10 : 11; this.grounded = false; this.coyote = 0; this.jumps = second ? 2 : 1; audio.sfx('jump');
    if (second) { fx.ring(this.pos, 0x4ab8ff, 0.3, 1.8, 0.3); fx.burst(this.pos, 0x4ab8ff, 8, { speed: 3 }); }
    if (this.state !== 'move') this.setState('move');
  }
  startDodge() {
    const yaw = this.hasMove ? this.moveYaw : this.yaw + Math.PI;
    this.setState('dodge'); this.dodgeYaw = yaw; if (this.hasMove) this.yaw = yaw; this.perfect = false; this.dodgeHit.clear(); this.comboNext = null;
    audio.sfx(G.save.relics.gales ? 'zap' : 'dodge', G.save.relics.gales ? 0.5 : 1);
    fx.burst({ x: this.pos.x, y: this.pos.y + 0.9, z: this.pos.z }, G.save.relics.gales ? 0xffe14a : 0xcfd8ff, 8, { speed: 3, life: 0.3, up: 0, grav: 0 });
  }
  aim() {
    const desired = this.hasMove ? this.moveYaw : this.yaw; let best = null, bs = 1e9;
    if (G.lock && !G.lock.dead) best = G.lock;
    else for (const e of G.enemies) {
      if (e.dead || e.spawnT > 0) continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z, d = Math.hypot(dx, dz) - e.radius; if (d > 7) continue;
      const ad = Math.abs(angDiff(desired, Math.atan2(dx, dz))); if (ad > 1.25 && d > 1.5) continue;
      if (e.wild && !e.aggro && d > 3.5) continue;
      const sc = d + ad * 3; if (sc < bs) { bs = sc; best = e; }
    }
    if (best) { const dx = best.pos.x - this.pos.x, dz = best.pos.z - this.pos.z; return { yaw: Math.atan2(dx, dz), dist: Math.hypot(dx, dz) - best.radius, target: best }; }
    return { yaw: desired, dist: 99, target: null };
  }
  startAttack(id) {
    const a = ATK[id]; this.atk = a; this.atkId = id; this.setState('attack'); this.hitSet.clear(); this.queued = null; this.didHit = false; this.swung = false; this.slamDone = false;
    const ay = this.aim(); this.yaw = ay.yaw; this.aimDist = ay.dist; this.comboNext = a.next || null;
    this.curMult = id === 'heavy' ? this.chargeMult : 1;
    if (id === 'sky') { this.vel.y = 10.5; this.grounded = false; this.jumps = Math.max(1, this.jumps); audio.sfx('jump'); }
    if (id === 'counter' && ay.target && ay.dist > 2) {
      const t = ay.target, dx = this.pos.x - t.pos.x, dz = this.pos.z - t.pos.z, d = Math.hypot(dx, dz) || 1;
      fx.burst({ x: this.pos.x, y: this.pos.y + 1, z: this.pos.z }, 0xffffff, 12, { speed: 3 });
      this.pos.x = t.pos.x + dx / d * (t.radius + 1.7); this.pos.z = t.pos.z + dz / d * (t.radius + 1.7); G.area.resolve(this.pos, this.radius); this.aimDist = 1.7;
    }
  }
  lightAttack() {
    if (!this.grounded) return this.startAttack('air');
    if (G.slowT > 0 && this.has('flash')) return this.startAttack('counter');
    if (this.dashT > 0 && this.has('dash')) { this.dashT = 0; return this.startAttack('dash'); }
    this.startAttack(this.comboT > 0 && this.comboNext ? this.comboNext : 'l1');
  }
  heavyAttack() {
    if (!this.grounded) return this.startAttack(this.has('plunge') && this.pos.y - this.groundY > 0.8 ? 'plunge' : 'air');
    if (this.comboT > 0) {
      if (this.comboNext === 'l3' && this.has('cleave')) return this.startAttack('cleave');
      if (this.comboNext === 'l4' && this.has('sky')) return this.startAttack('sky');
    }
    this.setState('charge'); this.charge = 0; this.chargeFx = false;
  }
  endAttack() { this.setState('move'); this.comboT = 0.45; this.atk = null; }
  actions() {
    if (input.buffered('dodge') && this.dodgeCd <= 0) { this.startDodge(); return true; }
    if (input.buffered('jump')) {
      if ((this.grounded || this.coyote > 0) && !this.sliding) { this.jump(false); return true; }
      if (G.save.relics.tides && this.jumps < 2 && !this.grounded) { this.jump(true); return true; }
    }
    if (input.buffered('light')) { this.lightAttack(); return true; }
    if (input.buffered('heavy')) { this.heavyAttack(); return true; }
    return false;
  }
  strike(e, a, mult) {
    let crit = !!a.crit || G.slowT > 0 || Math.random() < this.critCh;
    if (this.riposteT > 0 && this.has('riposte')) { crit = true; mult *= 1.6; this.riposteT = 0; }
    const dmg = this.atkPow * mult * (this.unisonT > 0 ? 1.4 : 1);
    const ok = e.hurt(dmg, { el: this.element, from: this.pos, knock: a.knock ?? 3.5, poise: a.poise ?? 10, crit, guardBreak: a.guardBreak, player: true });
    if (ok) {
      this.addGauge(a.gauge || 4); const b = G.run && G.run.boons;
      if (b && b.leech) this.heal(this.maxHp * 0.015 * b.leech, true);
      if (this.unisonT > 0) this.heal(this.maxHp * 0.012, true);
    }
    return ok;
  }
  feel(heavy) { G.hitstop = Math.max(G.hitstop, heavy ? 0.09 : 0.05); fx.shake(heavy ? 0.35 : 0.14); input.rumble(heavy ? 0.7 : 0.3, heavy ? 0.5 : 0.3, heavy ? 140 : 70); }
  doHits(a) {
    let any = false;
    for (const e of G.enemies) {
      if (e.dead || e.spawnT > 0 || this.hitSet.has(e)) continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z, d = Math.hypot(dx, dz) - e.radius;
      if (d > a.range || Math.abs(e.pos.y - this.pos.y) > 3.4) continue;
      if (a.arc < 360 && d > 0.9 && Math.abs(angDiff(this.yaw, Math.atan2(dx, dz))) > a.arc * Math.PI / 360) continue;
      this.hitSet.add(e); if (this.strike(e, a, a.dmg * this.curMult)) any = true;
    }
    if (any && !this.didHit) { this.didHit = true; this.feel(a.heavy); }
  }
  slam(a) {
    let any = false;
    for (const e of G.enemies) { if (e.dead || e.spawnT > 0) continue; if (Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z) - e.radius < a.radius) { if (this.strike(e, a, a.dmg)) any = true; } }
    fx.ring(this.pos, this.elColor, 0.5, a.radius, 0.35, true); fx.disc(this.pos, a.radius, this.elColor, 30); fx.shake(0.5); audio.sfx('boom', 0.8); input.rumble(0.9, 0.6, 200);
    if (any) G.hitstop = 0.08;
  }
  tryUnison() {
    if (!G.save.relics.cinders) return;
    if (this.gauge < 100) { audio.sfx('deny'); return; }
    this.gauge = 0; this.unisonT = 10; this.invuln = 1.2; G.slowT = 0.6; audio.sfx('unison'); fx.shake(0.7); input.rumble(1, 1, 400);
    fx.ring(this.pos, this.elColor, 0.5, 11, 0.6, true); fx.disc(this.pos, 10, this.elColor, 80); fx.column(this.pos, this.elColor, 9, 50);
    G.ui.toast('Unison Burst', 'gold', 1.4);
    for (const e of G.enemies) { if (e.dead || e.spawnT > 0) continue; if (Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z) < 11 + e.radius) e.hurt(this.atkPow * 5.5, { el: this.element, from: this.pos, knock: 14, poise: 120, player: true, guardBreak: true }); }
    if (G.finale) G.finale.onUnison();   // in the Hollow Court, this is what breaks the crown
  }
  drink() {
    if (this.potions <= 0 || this.hp >= this.maxHp) { audio.sfx('deny'); return; }
    this.potions--; this.heal(this.maxHp * 0.45); audio.sfx('heal');
  }

  takeHit(dmg, o = {}) {
    if (this.dead || G.mode !== 'play') return false;
    if (this.state === 'dodge' && this.t < 0.3) {
      if (!this.perfect && this.t < 0.27) {
        this.perfect = true; this.addGauge(8);
        if (this.has('flash')) { G.slowT = 1.7; audio.sfx('flash'); fx.ring(this.pos, 0xffffff, 0.5, 5, 0.4); G.ui.toast('Flash Step', 'gold', 0.9); }
      }
      return false;
    }
    if (this.invuln > 0) return false;
    const chest = { x: this.pos.x, y: this.pos.y + 1.2, z: this.pos.z }, head = { x: this.pos.x, y: this.pos.y + 2.2, z: this.pos.z };
    if (this.aegis > 0) { this.aegis--; this.invuln = 0.4; audio.sfx('clang'); fx.burst(chest, 0x7af0e0, 14, { speed: 6 }); fx.dmgNum(head, 'AEGIS', 'info'); return 'block'; }
    if (this.state === 'guard' && !o.unblockable) {
      if (this.guardT < 0.2) {
        audio.sfx('parry'); fx.burst(chest, 0xffffff, 18, { speed: 8, life: 0.35 }); fx.ring(chest, 0xffffff, 0.3, 2.6, 0.25);
        G.hitstop = 0.12; fx.shake(0.3); input.rumble(0.5, 1, 130); this.addGauge(12); this.riposteT = 1.8; this.invuln = 0.3; fx.dmgNum(head, 'PARRY', 'crit');
        return 'parry';
      }
      const chip = Math.max(1, Math.round(dmg * 0.2)); this.hp = Math.max(1, this.hp - chip); this.invuln = 0.15; audio.sfx('guard'); fx.burst(chest, 0xcfd8ff, 6, { speed: 5 }); fx.dmgNum(head, chip, 'weak'); input.rumble(0.3, 0.3, 80);
      if (o.from) { const dx = this.pos.x - o.from.x, dz = this.pos.z - o.from.z, d = Math.hypot(dx, dz) || 1; this.vel.x += dx / d * 4; this.vel.z += dz / d * 4; }
      return 'block';
    }
    dmg = Math.max(1, Math.round(dmg)); this.hp -= dmg; this.invuln = 0.8;
    fx.dmgNum(head, dmg, 'pl'); audio.sfx('hurt'); fx.shake(0.45); input.rumble(0.9, 0.9, 220); G.ui.hurtFlash(); fx.burst(chest, 0xff4455, 10, { speed: 5 });
    const b = G.run && G.run.boons; if (b && b.thorns && o.attacker && !o.attacker.dead) o.attacker.hurt(this.atkPow * 2 * b.thorns, { el: 'none', from: this.pos });
    if (this.hp <= 0) {
      if (this.has('wind') && !this.windUsed) { this.windUsed = true; this.hp = Math.round(this.maxHp * 0.3); this.invuln = 2; G.slowT = 1; G.ui.toast('Second Wind', 'gold'); fx.column(this.pos, 0xffd98a, 5, 30); }
      else { this.hp = 0; this.dead = true; this.setState('dead'); audio.sfx('die'); G.game.onPlayerDeath(); return 'hit'; }
    }
    const slamming = this.state === 'attack' && this.atk && this.atk.slam;
    if (!o.noStagger && this.unisonT <= 0 && !slamming) {
      this.setState('hurt');
      if (o.from) { const dx = this.pos.x - o.from.x, dz = this.pos.z - o.from.z, d = Math.hypot(dx, dz) || 1, k = o.knock ?? 7; this.vel.x = dx / d * k; this.vel.z = dz / d * k; }
    }
    return 'hit';
  }

  update(dt) {
    this.t += dt; this.animT += dt;
    this.invuln = Math.max(0, this.invuln - dt); this.dodgeCd -= dt; this.dashT -= dt; this.comboT -= dt; this.riposteT -= dt; this.swapCd -= dt;
    if (this.unisonT > 0) { this.unisonT -= dt; if (Math.random() < dt * 40) fx.spawn(this.pos.x + rand(-0.5, 0.5), this.pos.y + rand(0.2, 1.8), this.pos.z + rand(-0.5, 0.5), 0, rand(1, 3), 0, this.elColor, 0.4, 0.4, 0); }
    if (this.regen > 0) { this.regen -= dt; this.heal(this.maxHp * 0.02 * dt, true); }
    const S = this.state;
    let pose = null, ph = 0, tvx = 0, tvz = 0, accel = 14;

    if (this.dead) { pose = 'dead'; accel = 5; }
    else {
      const mx = input.moveX, my = input.moveY, mag = Math.min(1, Math.hypot(mx, my)), cy = G.cam.yaw;
      const wx = Math.sin(cy) * my + Math.cos(cy) * mx, wz = Math.cos(cy) * my - Math.sin(cy) * mx;
      this.hasMove = mag > 0.15; if (this.hasMove) this.moveYaw = Math.atan2(wx, wz);
      const faceLock = () => { const l = G.lock; if (l && !l.dead) { this.yaw = angLerp(this.yaw, Math.atan2(l.pos.x - this.pos.x, l.pos.z - this.pos.z), 1 - Math.exp(-14 * dt)); return true; } return false; };

      if (S !== 'hurt') {
        if (input.pressed('art')) G.game.castArt();
        if (input.pressed('bind')) { if (!G.game.tryBind()) this.tryUnison(); }
        if (input.pressed('potion')) this.drink();
        if (input.pressed('kithNext')) G.game.swapKith(1);
        if (input.pressed('kithPrev')) G.game.swapKith(-1);
      }
      if (input.pressed('lock')) G.game.toggleLock();

      if (S === 'move') {
        const sp = 8.4 * this.speedMul * (this.unisonT > 0 ? 1.1 : 1);
        tvx = wx * sp; tvz = wz * sp; if (!this.grounded) accel = 5;
        if (!(this.grounded && faceLock()) && this.hasMove) this.yaw = angLerp(this.yaw, this.moveYaw, 1 - Math.exp(-16 * dt));
        if (!this.actions() && input.held('guard') && this.grounded) { this.setState('guard'); this.guardT = 0; }
      } else if (S === 'attack') {
        const a = this.atk, t = this.t;
        if (a.slam) {
          if (!this.slamDone) {
            pose = 'over';
            if (this.atkId === 'sky') { tvx = Math.sin(this.yaw) * 7; tvz = Math.cos(this.yaw) * 7; accel = 30; if (this.vel.y < 0) this.vel.y -= 45 * dt; }
            else { this.vel.y = Math.min(this.vel.y, -8) - 70 * dt; accel = 30; }
            if (this.grounded && t > 0.12) { this.slamDone = true; this.t = 0; this.slam(a); }
          } else { pose = 'v'; ph = 1; accel = 20; if (this.t > 0.16 && this.actions()) { /* cancelled */ } else if (this.t > 0.4) this.endAttack(); }
        } else {
          const h0 = a.hit[0], h1 = a.hit[1];
          pose = a.pose; ph = clamp((t - h0 + 0.05) / (h1 - h0 + 0.05), 0, 1);
          if (t < h1) { const mv = this.aimDist < 1.4 ? 0 : a.move; tvx = Math.sin(this.yaw) * mv; tvz = Math.cos(this.yaw) * mv; accel = 30; } else accel = 12;
          if (t >= h0 && !this.swung) { this.swung = true; audio.sfx(a.heavy ? 'swingHeavy' : 'swing'); }
          if (t >= h0 && t <= h1) this.doHits(a);
          if (input.pressed('light')) this.queued = 'light'; if (input.pressed('heavy')) this.queued = 'heavy';
          if (t > 0.05 && input.buffered('dodge')) { this.comboNext = null; this.startDodge(); }
          else if (t >= h1) {
            if (this.queued === 'light' || input.buffered('light')) { this.comboT = 1; this.lightAttack(); }
            else if (this.queued === 'heavy' || input.buffered('heavy')) { this.comboT = 1; this.heavyAttack(); }
            else if (this.grounded && input.buffered('jump')) { this.comboT = 0.3; this.jump(false); }
            else if (t >= a.dur) this.endAttack();
          }
        }
      } else if (S === 'charge') {
        this.charge += dt; pose = 'charge'; tvx = wx * 2.6; tvz = wz * 2.6;
        if (!faceLock() && this.hasMove) this.yaw = angLerp(this.yaw, this.moveYaw, 1 - Math.exp(-10 * dt));
        if (this.charge > 0.75 && !this.chargeFx) { this.chargeFx = true; audio.sfx('pickup', 0.7); fx.burst({ x: this.pos.x, y: this.pos.y + 1, z: this.pos.z }, this.elColor, 14, { speed: 4, up: 1 }); }
        if (input.buffered('dodge')) this.startDodge();
        else if (!input.held('heavy') || this.charge > 1.7) { this.chargeMult = 1 + clamp(this.charge / 0.75, 0, 1) * 1.3; this.startAttack('heavy'); }
      } else if (S === 'dodge') {
        const gale = !!G.save.relics.gales, k = this.t / 0.4, sp = (gale ? 20 : 16.5) * (1 - k * 0.75);
        tvx = Math.sin(this.dodgeYaw) * sp; tvz = Math.cos(this.dodgeYaw) * sp; accel = 60; pose = 'dodge';
        if (gale) {
          fx.spawn(this.pos.x, this.pos.y + rand(0.3, 1.5), this.pos.z, 0, 0, 0, 0xffe14a, 0.5, 0.25, 0);
          for (const e of G.enemies) { if (e.dead || e.spawnT > 0 || this.dodgeHit.has(e)) continue; if (Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z) < e.radius + 1.5) { this.dodgeHit.add(e); e.hurt(this.atkPow * 1.2, { el: 'storm', from: this.pos, poise: 12, player: true }); } }
        }
        if (this.t >= 0.4) { this.setState('move'); this.dodgeCd = 0.08; this.dashT = 0.35; }
        else if (this.t > 0.26 && this.grounded && input.buffered('jump')) this.jump(false);
      } else if (S === 'guard') {
        this.guardT += dt; pose = 'guard'; tvx = wx * 3; tvz = wz * 3; faceLock();
        if (input.buffered('dodge')) this.startDodge();
        else if (input.buffered('light')) this.lightAttack();
        else if (input.buffered('jump') && this.grounded) this.jump(false);
        else if (!input.held('guard') && this.guardT > 0.14) this.setState('move');
      } else if (S === 'hurt') { pose = 'hurt'; accel = 5; if (this.t > 0.34) this.setState('move'); }
    }

    // ---- physics
    const k = 1 - Math.exp(-accel * dt);
    this.vel.x += (tvx - this.vel.x) * k; this.vel.z += (tvz - this.vel.z) * k;
    moveXZ(this, this.vel.x, this.vel.z, dt);
    this.vel.y -= 30 * dt; this.pos.y += this.vel.y * dt;
    const area = G.area, gy = area.heightAt(this.pos.x, this.pos.z); this.groundY = gy;
    if (this.pos.y <= gy) {
      if (!this.grounded && this.vel.y < -7) { audio.sfx('land'); fx.burst(this.pos, 0xbfb8a8, 6, { speed: 2.5, life: 0.3, up: 0.5, size: 0.3 }); }
      this.pos.y = gy; this.vel.y = 0; this.grounded = true; this.jumps = 0; this.coyote = 0.1;
    } else if (this.grounded) {
      if (this.pos.y - gy < 0.6 && this.vel.y <= 0) { this.pos.y = gy; this.vel.y = 0; } else this.grounded = false;
    }
    if (!this.grounded) this.coyote -= dt;
    this.sliding = false;
    if (this.grounded && area.slope) {
      const g = area.gradAt(this.pos.x, this.pos.z), m = Math.hypot(g.x, g.z);
      if (m > 1.3) { this.sliding = true; this.pos.x -= g.x / m * 8 * dt; this.pos.z -= g.z / m * 8 * dt; }
    }

    // ---- animation
    const moving = (this.state === 'move' || this.state === 'guard' || this.state === 'charge') && this.grounded;
    this.run = damp(this.run, moving ? clamp(Math.hypot(this.vel.x, this.vel.z) / 8, 0, 1) : 0, 12, dt);
    if (this.run > 0.5 && this.grounded) { this.stepT -= dt; if (this.stepT <= 0) { this.stepT = 0.29; audio.sfx('step'); } }
    animate(this.model, { t: this.animT, run: this.run, air: !this.grounded && this.state === 'move', pose, ph }, dt);
    this.model.root.position.copy(this.pos); this.model.root.rotation.y = this.yaw;
    this.model.root.visible = !(this.invuln > 0 && !this.dead && this.state !== 'dodge' && Math.floor(this.animT * 22) % 2 === 0 && this.unisonT <= 0);

    const a = this.atk;
    if (this.state === 'attack' && a && (a.slam ? !this.slamDone : (this.t > a.hit[0] - 0.05 && this.t < a.hit[1] + 0.05))) {
      this.model.root.updateMatrixWorld(true);
      this.model.p.bladeBase.getWorldPosition(v1); this.model.p.bladeTip.getWorldPosition(v2); this.trail.push(v1, v2);
    }
    this.trail.update(dt, this.elColor);
  }
}
