// The Hollow King's last phase (STORY.md, build step 7). At a third of his health the crown silences
// everything: the music stops, the court drains of colour, your Kith vanishes and Bond Arts fail, and
// the King cannot be finished off. You fight alone for a while; then your Kith sing anyway. The music
// comes back as the full song, the Bond gauge fills, and Lumen, the King's lost Umbrafox, appears
// beside you. A Unison Burst breaks the crown, and the ending (FREED.hollow in data.js) follows.
// Only in the Hollow Court itself; the King's echoes in the Abyss fight as before.
import { G } from './state.js';
import { audio } from './audio.js';
import { fx } from './fx.js';
import { input } from './input.js';
import { EL } from './data.js';
import { makeKithModel, animate } from './models.js';
import { rand, damp, angLerp } from './util.js';

const SILENCE_FOR = 10;   // seconds alone before the Kith sing (sooner if you are badly hurt)
const GLOAM = EL.gloam.color;

export const finale = {
  state: null, t: 0, king: null, lumen: null, hintT: 0, grey: 0,
  canRun() { const A = G.area; return !this.state && !!A && A.kind === 'shrine' && A.mode === 'shrine' && !!A.def && A.def.id === 'hollow'; },
  silenced() { return this.state === 'silence'; },
  // the crown's silence
  begin(king) {
    this.state = 'silence'; this.t = 0; this.king = king;
    king.hpFloor = Math.ceil(king.maxHp * 0.05); king.dmg *= 1.25;
    audio.silence(true);
    const c = G.comp; if (c) { fx.burst({ x: c.pos.x, y: c.pos.y + 0.6, z: c.pos.z }, 0x8a8a9a, 16, { speed: 3 }); c.silenced = true; c.model.root.visible = false; }
    G.ui.banner('The Hollow Crown', '"Be quiet. All of you."', 4.5);
    G.ui.toast('The crown\'s silence falls. Your Kith cannot hear you.', '', 5);
  },
  // the Kith sing anyway
  sing() {
    const p = G.player; this.state = 'song'; this.t = 0; this.hintT = 1.5;
    audio.silence(false); G.game.setMood('finale'); audio.sfx('bound');
    const c = G.comp; if (c) { c.silenced = false; c.model.root.visible = true; c.pos.copy(p.pos); fx.column(c.pos, EL[c.sp.el].color, 6, 40); }
    p.gauge = 100; fx.ring(p.pos, 0xffd98a, 0.5, 9, 0.8, true);
    const M = makeKithModel('umbrafox', false, 1.1), a = p.yaw + Math.PI * 0.6;
    G.scene.add(M.root); this.lumen = { M, t: 0, pos: p.pos.clone().set(p.pos.x + Math.sin(a) * 2.2, p.pos.y, p.pos.z + Math.cos(a) * 2.2), yaw: p.yaw };
    fx.burst({ x: this.lumen.pos.x, y: this.lumen.pos.y + 0.8, z: this.lumen.pos.z }, GLOAM, 30, { speed: 5 });
    G.ui.banner('Your Kith are singing', 'A black fox steps out of the dark to sing beside you', 5);
  },
  // a Unison Burst while they sing breaks the crown
  onUnison() { if (this.state === 'song' && this.king) { this.state = 'break'; this.t = 0; } },
  objective() {
    if (this.state === 'silence') return 'Your Kith cannot hear you. Hold on.';
    if (this.state === 'song') return `Your Kith are singing! Press ${input.glyph('bind')} for a Unison Burst.`;
    return null;
  },
  // end it all; fade: Lumen goes into the light (after the ending), rather than just going
  reset(fade) {
    if (!this.state) return;
    this.state = null; this.king = null; audio.silence(false);
    if (G.comp) { G.comp.silenced = false; G.comp.model.root.visible = true; }
    const L = this.lumen;
    if (L) { if (fade) { fx.column(L.pos, 0xffd98a, 9, 60); fx.burst({ x: L.pos.x, y: L.pos.y + 0.8, z: L.pos.z }, GLOAM, 30, { speed: 4 }); audio.sfx('heal'); } G.scene.remove(L.M.root); L.M.dispose(); this.lumen = null; }
  },
  update(dt) {
    this.grey = damp(this.grey, this.state === 'silence' ? 1 : 0, 2.2, dt); G.silenceGrey = this.grey;
    if (!this.state) return;
    const p = G.player, k = this.king, A = G.area;
    if (!A || A.kind !== 'shrine' || p.dead || !k || (k.gone && this.state !== 'done')) { this.reset(); return; }
    this.t += dt;
    if (this.state === 'silence') { if (this.t > SILENCE_FOR || (this.t > 3 && p.hp < p.maxHp * 0.35)) this.sing(); }   // always a moment alone first
    else if (this.state === 'song') {
      p.gauge = 100;   // the song holds the gauge full until it is used
      this.hintT -= dt; if (this.hintT <= 0) { this.hintT = 5; G.ui.toast(`${input.glyph('bind')} Unison Burst: your Kith are ready.`, 'gold', 3); }
    } else if (this.state === 'break' && this.t > 0.6) {
      this.state = 'done';
      fx.shake(1); audio.sfx('boom'); audio.sfx('parry'); fx.column(k.pos, 0xffd98a, 12, 90); fx.ring(k.pos, 0xffffff, 1, 16, 0.9, true);
      k.hpFloor = 0; k.invuln = false; k.hurt(k.hp + 1, { el: 'none', from: p.pos, player: true, noStagger: true, quiet: true });
    }
    this.updateLumen(dt);
  },
  // Lumen sings beside Wren, then runs to the King once the crown breaks
  updateLumen(dt) {
    const L = this.lumen; if (!L) return;
    const p = G.player, k = this.king, done = this.state === 'break' || this.state === 'done';
    L.t += dt;
    let tx, tz;
    if (done && k) { const a = Math.atan2(p.pos.x - k.pos.x, p.pos.z - k.pos.z); tx = k.pos.x + Math.sin(a) * 2.2; tz = k.pos.z + Math.cos(a) * 2.2; }
    else { const a = p.yaw + Math.PI * 0.6; tx = p.pos.x + Math.sin(a) * 2.2; tz = p.pos.z + Math.cos(a) * 2.2; }
    const dx = tx - L.pos.x, dz = tz - L.pos.z, d = Math.hypot(dx, dz), sp = done ? 9 : 12;
    if (d > 0.3) { const st = Math.min(d, sp * dt); L.pos.x += dx / d * st; L.pos.z += dz / d * st; L.yaw = angLerp(L.yaw, Math.atan2(dx, dz), 1 - Math.exp(-10 * dt)); }
    else if (k) L.yaw = angLerp(L.yaw, Math.atan2(k.pos.x - L.pos.x, k.pos.z - L.pos.z), 1 - Math.exp(-6 * dt));
    L.pos.y = G.area.heightAt(L.pos.x, L.pos.z);
    L.M.root.position.copy(L.pos); L.M.root.rotation.y = L.yaw;
    animate(L.M, { t: L.t, run: d > 0.3 ? 1 : 0, pose: null }, dt);
    if (Math.random() < dt * 10) fx.spawn(L.pos.x + rand(-0.4, 0.4), L.pos.y + rand(0.3, 1.2), L.pos.z + rand(-0.4, 0.4), 0, rand(0.5, 1.5), 0, GLOAM, 0.35, 0.6, 0);
  },
};
