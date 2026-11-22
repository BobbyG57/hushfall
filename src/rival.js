// Sable, the rival (STORY.md, build step 6). Three duels between chapters (RIVAL in data.js). Each
// starts when you come near its spot once the shrine before it is awake. Sable yields instead of
// dying, says a few lines and leaves. Falling, leaving the overworld or running off calls the duel
// off; Sable waits there for you to come back. The last duel guards the doors of the Hollow Court.
import { G } from './state.js';
import { audio } from './audio.js';
import { fx } from './fx.js';
import { RIVAL, BIOME, EL } from './data.js';
import { spawnBoss, spawnWild } from './enemies.js';
import { clearCombat } from './combat.js';
import { biomeAt } from './world.js';

const TITLE = ['', 'The rival', 'Kith-bonder of the dusk', 'Who would rather forget'];
const faceTo = (e, p) => { e.yaw = Math.atan2(p.x - e.pos.x, p.z - e.pos.z); };
const calmMusic = () => { const p = G.player.pos; G.game.setMood(BIOME[biomeAt(p.x, p.z)].mood); };

export const rival = {
  cur: null,
  // the next duel still to come, in story order
  due() { const s = G.save; return s ? RIVAL.find((d) => s.shrines[d.after] && !s.tips[d.id]) : null; },
  // is a duel standing in front of this shrine? (the Hollow Court cannot be entered before the last one)
  guarding(shrineId) { const d = this.due(); return d && d.guards === shrineId ? d : null; },
  start(d) {
    if (this.cur) return;
    this.cur = { d, ents: [], sable: null };
    G.ui.say(d.intro, () => this.fight());
  },
  fight() {
    const c = this.cur; if (!c) return;
    const d = c.d, p = G.player;
    const e = spawnBoss('sable', d.x, d.z, d.level); e.tier = d.tier; e.yieldAt = d.yieldAt; e.spawnT = 0.5;
    if (d.tier === 1) e.dmg *= 0.7;   // the first time, Sable holds back
    e.onYield = () => this.yielded(); faceTo(e, p.pos); c.sable = e; c.ents.push(e); G.boss = e;
    if (d.moth) { const m = spawnWild('duskmoth', d.x + 3, d.z + 2, Math.max(1, d.level - 2)); m.tame = true; m.minion = true; m.alert(); c.ents.push(m); }
    G.ui.banner('Sable', TITLE[d.tier], 3); G.game.setMood('boss'); audio.sfx('dark', 0.8);
  },
  yielded() {
    const c = this.cur; if (!c) return; const d = c.d, s = G.save, e = c.sable;
    for (const x of c.ents) if (x !== e && !x.dead && !x.gone) x.remove();
    clearCombat(); G.boss = null; if (G.lock === e) G.lock = null; calmMusic();
    G.ui.say(d.outro, () => {
      s.tips[d.id] = 1;
      const r = d.reward || {}, got = [];
      if (r.motes) { s.motes += r.motes; got.push(`+${r.motes} Motes`); }
      if (r.sigils) { s.sigils += r.sigils; got.push(`+${r.sigils} Skill Sigil`); }
      if (r.threads) { s.threads += r.threads; got.push(`+${r.threads} Bond Threads`); }
      if (got.length) G.ui.toast(got.join('  '), 'gold', 4);
      if (!e.gone) { fx.burst(e.top(), EL.gloam.color, 24, { speed: 5 }); audio.sfx('dark', 0.6); e.remove(); }
      audio.sfx('level'); this.cur = null; G.game.save();
    });
  },
  // call the duel off (Sable waits at the spot to try again)
  reset(msg) {
    const c = this.cur; if (!c) return; this.cur = null;
    for (const x of c.ents) if (!x.dead && !x.gone) x.remove();
    if (G.boss === c.sable) G.boss = null;
    if (G.area === G.world && G.player && !G.player.dead) calmMusic();
    if (msg) G.ui.toast(msg, '', 4);
  },
  update() {
    const p = G.player, c = this.cur;
    if (c) {
      if (G.area !== G.world || p.dead) { this.reset(); return; }
      if (c.sable && !c.sable.yielded && Math.hypot(p.pos.x - c.d.x, p.pos.z - c.d.z) > 46) this.reset('"Running already? Fine. I will be right here." Sable lets you go.');
      return;
    }
    if (G.area !== G.world || p.dead || (G.trials && G.trials.cur)) return;
    const d = this.due();
    if (d && Math.hypot(p.pos.x - d.x, p.pos.z - d.z) < 24) this.start(d);
  },
};
