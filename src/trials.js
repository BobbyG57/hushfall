// Training with Brannoc and Oona (STORY.md, build step 4). A trial is a few short steps, each with
// an objective shown on the HUD, played out in Lanternrest. Walking away, falling, or leaving the
// overworld stops it; it can be started again from that villager's menu. Places and lines live in
// TRAINING and TRAIN_TALK in data.js.
import { G } from './state.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { fx } from './fx.js';
import { TRAINING, TRAIN_TALK, KITH } from './data.js';
import { spawnEnemy, spawnWild } from './enemies.js';
import { rand } from './util.js';

const g = (a) => input.glyph(a);
const owns = (sp) => G.save.kith.some((k) => k.species === sp);
const LESSON_KITH = ['mossling', 'voltkit', 'thornback', 'puddlefin', 'cinderpup'];   // Oona offers the first one you lack
const NPC_NAME = { smith: 'Brannoc', keeper: 'Keeper Oona' };

// the steps of each trial: enter() sets it up, text() is the objective, done() moves on
const STEPS = {
  yard: [
    { talk: 'yardStart', enter(c) { c.ents = [[-3, 0], [0, -2.5], [3, 0]].map(([dx, dz]) => dummy(c, 'dummy', dx, dz)); },
      text: (c) => `${g('lock')} Lock on, then break the straw dummies with ${g('light')}: ${c.ents.filter((e) => e.dead).length} / 3`,
      done: (c) => c.ents.every((e) => e.dead) },
    { talk: 'shield', enter(c) { c.ents = [dummy(c, 'shielddummy', 0, -1)]; },
      text: () => `Hold ${g('heavy')} for a heavy thrust to break the shielded dummy's guard.`,
      done: (c) => c.ents[0].dead },
    { talk: 'dodge', enter(c) { c.n = 0; c.ents = [sparring(c, (res, dodged) => { if (dodged) count(c, 'DODGED'); })]; },
      text: (c) => `Dodge through Brannoc's swings with ${g('dodge')}: ${c.n} / 3`,
      done: (c) => c.n >= 3, leave(c) { trials.showNpc(); } },
    { talk: 'husk', enter(c) { const e = spawnEnemy('husk', c.t.x - 8, c.t.z - 8, 1, 'none'); e.alert(); c.ents = [e]; },
      text: () => `A Husk is in the village! Let your Kith help: ${g('art')} unleashes its Bond Art.`,
      done: (c) => c.ents[0].dead },
  ],
  grove: [
    { talk: 'groveStart', enter(c) { lessonKith(c); },
      text: (c) => (c.ents[0] && c.ents[0].bindable ? `Press ${g('bind')} to begin the Bond Rite, then match the rings.` : `Weaken the ${c.name} below half its health. Gently!`),
      done: (c) => owns(c.sp), tick: (c) => groveTick(c) },
  ],
  forge: [
    { talk: 'forgeStart', enter(c) { c.n = 0; c.ents = [sparring(c, (res) => { if (res === 'parry') count(c, 'PARRIED'); }, () => rand(0.45, 0.85))]; },
      text: (c) => `Tap ${g('guard')} just as Brannoc's stave lands to parry it: ${c.n} / 3`,
      done: (c) => c.n >= 3, leave(c) { trials.showNpc(); } },
  ],
};
// what finishing each trial gives you
const REWARD = {
  yard: () => { G.save.motes += 60; G.ui.toast('+60 Motes', 'gold'); },
  grove: () => {},
  forge: () => { G.save.sigils++; G.ui.toast('+1 Skill Sigil', 'gold'); },
};

function dummy(c, type, dx, dz) {
  const e = spawnEnemy(type, c.t.x + dx, c.t.z + dz, 1, 'none');
  e.yaw = Math.atan2(G.player.pos.x - e.pos.x, G.player.pos.z - e.pos.z); return e;
}
function sparring(c, onSpar, wind) {
  trials.hideNpc('smith');
  const e = spawnEnemy('spar', c.t.x, c.t.z - 2, 1, 'none');
  e.invuln = true; e.onSpar = onSpar; if (wind) e.sparWind = wind; e.alert(); return e;
}
function count(c, word) {
  c.n++; const p = G.player.pos; audio.sfx('pickup');
  fx.dmgNum({ x: p.x, y: p.y + 2.4, z: p.z }, `${word} ${c.n} / 3`, 'crit');
}
function lessonKith(c) {
  c.sp = c.sp || LESSON_KITH.find((sp) => !owns(sp)); if (!c.sp) return;
  c.name = KITH[c.sp].name;
  const e = spawnWild(c.sp, c.t.x, c.t.z, 1); e.yaw = Math.atan2(G.player.pos.x - e.pos.x, G.player.pos.z - e.pos.z); c.ents = [e];
}
function groveTick(c) {
  const s = G.save, e = c.ents[0];
  if (!c.sp) return;
  if (s.threads < 1) { s.threads = 1; G.ui.toast('Oona presses a Bond Thread into your hand.', 'gold'); }
  if ((!e || e.dead || e.gone) && !owns(c.sp)) { G.ui.toast(`Too rough! The ${c.name} ran off. Oona coaxes out another.`); lessonKith(c); return; }
  if (e && e.bindable && !c.told) { c.told = true; G.ui.say(TRAIN_TALK.groveBind); }
}

export const trials = {
  cur: null, hidden: null,
  // can this trial be offered right now?
  available(id) { const s = G.save, t = TRAINING[id]; return !!s && !!t && s.quest >= t.from && !s.tips['trial' + id] && (id !== 'grove' || LESSON_KITH.some((sp) => !owns(sp))); },
  start(id) {
    if (this.cur) this.stop();
    this.cur = { id, t: TRAINING[id], i: -1, n: 0, ents: [] };
    this.next();
  },
  next() {
    const c = this.cur, steps = STEPS[c.id];
    if (c.i >= 0 && steps[c.i].leave) steps[c.i].leave(c);
    for (const e of c.ents) if (!e.dead && !e.gone) e.remove();
    c.ents = []; c.i++; c.told = false;
    if (c.i >= steps.length) { this.finish(); return; }
    const st = steps[c.i];
    const go = () => { if (this.cur === c) st.enter(c); };
    if (st.talk) G.ui.say(TRAIN_TALK[st.talk], go); else go();
  },
  finish() {
    const c = this.cur, s = G.save; this.cur = null; this.clear(c);
    s.tips['trial' + c.id] = 1;
    G.ui.say(TRAIN_TALK[c.id + 'Done'], () => { REWARD[c.id](); audio.sfx('level'); G.game.save(); });
  },
  // walking away, falling or leaving the overworld ends the trial early
  stop(msg) {
    const c = this.cur; if (!c) return; this.cur = null; this.clear(c);
    if (msg) G.ui.toast(msg, '', 4);
  },
  clear(c) { for (const e of c.ents) if (!e.dead && !e.gone) e.remove(); c.ents = []; this.showNpc(); },
  hideNpc(id) { this.hidden = id; const n = G.world.npcs.find((x) => x.id === id); if (n) n.m.root.visible = false; },
  showNpc() { if (!this.hidden) return; const n = G.world.npcs.find((x) => x.id === this.hidden); if (n) n.m.root.visible = true; this.hidden = null; },
  update() {
    const c = this.cur; if (!c || c.i < 0) return;
    const p = G.player, who = NPC_NAME[c.t.npc];
    if (G.area !== G.world || p.dead) { this.stop(`Training stopped. Talk to ${who} to try again.`); return; }
    if (Math.hypot(p.pos.x - c.t.x, p.pos.z - c.t.z) > 34) { this.stop(`You wandered off. Talk to ${who} to pick the training up again.`); return; }
    const st = STEPS[c.id][c.i]; if (!c.ents.length && st.enter) return;   // still in the step's opening lines
    if (st.tick) st.tick(c);
    if (this.cur === c && st.done(c)) this.next();
  },
  // the HUD objective while training
  objective() { const c = this.cur; if (!c || c.i < 0 || !c.ents.length) return null; const st = STEPS[c.id][c.i]; return st.text(c); },
};
