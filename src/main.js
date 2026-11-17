// Boot, the frame loop, camera, lighting, and the game flow that ties every system together.
import * as THREE from 'three';
import { G } from './state.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { fx } from './fx.js';
import { ui } from './ui.js';
import { world } from './world.js';
import { buildShrine } from './shrine.js';
import { Player } from './player.js';
import { updateCombat, clearCombat, dropMotes, after } from './combat.js';
import * as K from './kith.js';
import { newSave, loadSave, storeSave, wipeSave, loadOpts, importCode } from './save.js';
import { ART, loadArt } from './art.js';
import { BIOME, BOSS, BOONS, SHRINES, SHRINE_ORDER, WAYSTONES, TALK, KITH, EL, xpNext, MAX_LEVEL } from './data.js';
import { clamp, damp, lerp, smooth, angLerp, angDiff, rand, pick, weighted } from './util.js';

// ---------------------------------------------------------------- renderer + scene
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0xbfe2f2, 45, 235);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.3, 1200);
const hemi = new THREE.HemisphereLight(0xffffff, 0x8a7a6a, 1.2); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d0, 2.3); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera; sc.left = -44; sc.right = 44; sc.top = 44; sc.bottom = -44; sc.near = 1; sc.far = 190; sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.5;
scene.add(sun, sun.target);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { top: { value: new THREE.Color(0x3f8fe0) }, bot: { value: new THREE.Color(0xd4ecf7) } },
  vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying vec3 vP; void main(){ float h=normalize(vP).y; gl_FragColor=vec4(mix(bot,top,smoothstep(0.0,0.5,h)),1.0);\n#include <colorspace_fragment>\n}',
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 12), skyMat); sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);
const starPos = new Float32Array(600 * 3);
for (let i = 0; i < 600; i++) { const a = Math.random() * Math.PI * 2, y = 0.06 + Math.random() * 0.94, r = Math.sqrt(1 - y * y); starPos[i * 3] = Math.cos(a) * r * 860; starPos[i * 3 + 1] = y * 860; starPos[i * 3 + 2] = Math.sin(a) * r * 860; }
const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
const stars = new THREE.Points(starGeo, starMat); stars.frustumCulled = false; stars.renderOrder = -9; scene.add(stars);
G.renderer = renderer; G.scene = scene; G.camera = camera; G.canvas = canvas;

function applyQuality() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, G.opts.quality ? 2 : 1));
  renderer.setSize(innerWidth, innerHeight, false); sun.castShadow = !!G.opts.quality;
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
addEventListener('resize', applyQuality);

// ---------------------------------------------------------------- environment (sky, fog, sun, day and night)
const env = { fog: new THREE.Color(0xbfe2f2), top: new THREE.Color(0x3f8fe0), sun: new THREE.Color(0xfff1d0), amb: 1, day: 1, near: 45, far: 235 };
const tF = new THREE.Color(), tT = new THREE.Color(), tS = new THREE.Color(), tX = new THREE.Color(), NIGHT = new THREE.Color(0x1a2648), NTOP = new THREE.Color(0x0a1136), MOON = new THREE.Color(0x9fb4ff), DUSK = new THREE.Color(0xff9a5a), WHITE = new THREE.Color(0xffffff);
const sunDir = new THREE.Vector3(0.5, 1, 0.4).normalize(), ZERO = new THREE.Vector3();
function updateEnv(dt) {
  const pos = G.player && !G.atTitle ? G.player.pos : ZERO, e = G.area.env(pos); let amb, dayl = 1;
  if (e.flat) { tF.copy(e.fog); tT.copy(e.fog); tS.copy(e.sun); amb = e.amb; sunDir.set(0.35, 1, 0.3).normalize(); }
  else {
    tF.setHex(e.a.fog).lerp(tX.setHex(e.b.fog), e.w); tT.setHex(e.a.skyTop).lerp(tX.setHex(e.b.skyTop), e.w); tS.setHex(e.a.sun).lerp(tX.setHex(e.b.sun), e.w); amb = lerp(e.a.amb, e.b.amb, e.w);
    const dayT = ((G.save ? G.save.playtime : 0) / 840 + 0.07) % 1, s = Math.sin(dayT * Math.PI * 2); dayl = smooth(-0.55, -0.1, s);
    const dusk = smooth(0.4, 0, Math.abs(s + 0.05)) * 0.55;
    tF.lerp(NIGHT, (1 - dayl) * 0.86).lerp(DUSK, dusk * 0.4 * dayl); tT.lerp(NTOP, (1 - dayl) * 0.94); tS.lerp(DUSK, dusk).lerp(MOON, 1 - dayl);
    sunDir.set(Math.cos(dayT * Math.PI * 2) * 0.75, Math.max(0.32, Math.abs(s)) + 0.12, 0.45).normalize();
  }
  const k = 1 - Math.exp(-2.4 * dt);
  env.fog.lerp(tF, k); env.top.lerp(tT, k); env.sun.lerp(tS, k); env.amb += (amb - env.amb) * k; env.day += (dayl - env.day) * k; 
  // in the classic view the world fades out a short way past the top of the screen
  const shortFog = isClassic() && G.player && !G.atTitle, fogN = shortFog ? G.cam.cur + 10 : (e.fogNear || 45), fogF = shortFog ? G.cam.cur + 44 : (e.fogFar || 235);
  env.near += (fogN - env.near) * k; env.far += (fogF - env.far) * k; G.light = e.flat ? 0.92 : lerp(0.55, 1, env.day);
  scene.fog.color.copy(env.fog); scene.fog.near = env.near; scene.fog.far = env.far; renderer.setClearColor(env.fog);
  skyMat.uniforms.top.value.copy(env.top); skyMat.uniforms.bot.value.copy(env.fog);
  hemi.intensity = 1.3 * env.amb * lerp(0.5, 1, env.day);
  if (e.flat) { hemi.color.setHex(0xf2f0ff); hemi.groundColor.setHex(0x8a869c); } else { hemi.color.copy(env.top).lerp(WHITE, 0.65); hemi.groundColor.copy(env.fog).multiplyScalar(0.55); }
  sun.color.copy(env.sun); sun.intensity = 2.3 * lerp(0.32, 1, env.day) * (e.flat ? 0.7 : 1);
  starMat.opacity = e.flat ? 0 : (1 - env.day) * 0.9; stars.visible = starMat.opacity > 0.02; stars.position.copy(camera.position);
  sun.target.position.copy(pos); sun.position.copy(pos).addScaledVector(sunDir, 85);
  sky.position.copy(camera.position);
}

// ---------------------------------------------------------------- camera
const camDir = new THREE.Vector3(), camLook = new THREE.Vector3(), tmp = new THREE.Vector3(); let titleT = 0;
// 'classic' is a fixed high-angle view looking north, like a handheld-era RPG; 'free' orbits behind the hero
const isClassic = () => G.opts.camera !== 'free';
const CLASSIC = { pitch: 0.9, fov: 36, zoom: 30, zoomMin: 22, zoomMax: 44 };
function setFov(f) { if (camera.fov !== f) { camera.fov = f; camera.updateProjectionMatrix(); } }
function updateCamera(dt) {
  const c = G.cam;
  if (G.atTitle || !G.player) { setFov(60); titleT += dt; const a = titleT * 0.05, y = world.heightAt(0, 0); camera.position.set(Math.sin(a) * 62, y + 24, Math.cos(a) * 62); camera.lookAt(0, y + 9, 0); return; }
  const p = G.player, L = G.lock && !G.lock.dead ? G.lock : null, classic = isClassic();
  setFov(classic ? CLASSIC.fov : 60);
  if (classic) {
    // the right stick (or the up / down arrow keys) zooms; the angle and heading stay fixed
    if (G.mode === 'play') c.zoom = clamp((c.zoom || CLASSIC.zoom) + input.camY * 16 * dt, CLASSIC.zoomMin, CLASSIC.zoomMax);
    c.yaw = 0; c.pitch = CLASSIC.pitch;
  } else if (G.mode === 'play') {
    const inv = G.opts.invertY ? -1 : 1;
    c.yaw -= input.camX * 2.7 * dt + input.mouseDX * 0.0028;
    c.pitch = clamp(c.pitch + (input.camY * 1.9 * dt + input.mouseDY * 0.0022) * inv, -0.3, 1.2);
    if (Math.abs(input.camX) > 0.1 || Math.abs(input.camY) > 0.1 || input.mouseDX || input.mouseDY) c.idle = 0; else c.idle += dt;
    if (L) { c.yaw = angLerp(c.yaw, Math.atan2(p.pos.x - L.pos.x, p.pos.z - L.pos.z), 1 - Math.exp(-4.5 * dt)); c.pitch = damp(c.pitch, 0.36, 2.5, dt); }
    else if (c.idle > 1.2 && p.hasMove && p.state === 'move' && input.usingPad) { const d = angDiff(c.yaw, p.yaw + Math.PI); if (Math.abs(d) < 2.3) c.yaw += d * Math.min(1, dt * 0.9); }
    if (input.pressed('camReset')) { c.yaw = p.yaw + Math.PI; c.pitch = 0.34; }
  }
  let tx = p.pos.x, ty = p.pos.y + 1.55, tz = p.pos.z, dist = c.dist;
  if (classic) { ty = p.pos.y + 1.0; tz -= 2.2; dist = (c.zoom || CLASSIC.zoom) + (G.boss && !G.boss.dead ? 6 : 0); }
  if (L) { const k = 0.28; tx = lerp(tx, L.pos.x, k); tz = lerp(tz, L.pos.z, k); ty = lerp(ty, L.pos.y + L.model.height * 0.5, k * 0.6); dist += Math.min(classic ? 9 : 6, Math.hypot(L.pos.x - p.pos.x, L.pos.z - p.pos.z) * 0.35); }
  if (c.snap) { camLook.set(tx, ty, tz); c.cur = dist; c.snap = false; }
  else { camLook.x = damp(camLook.x, tx, 14, dt); camLook.z = damp(camLook.z, tz, 14, dt); camLook.y = damp(camLook.y, ty, 9, dt); }
  const cp = Math.cos(c.pitch); camDir.set(Math.sin(c.yaw) * cp, Math.sin(c.pitch), Math.cos(c.yaw) * cp);
  let allowed = dist;
  for (let i = 1; i <= 12; i++) { tmp.copy(camLook).addScaledVector(camDir, dist * i / 12); if (G.area.camBlocked(tmp)) { allowed = Math.max(1.3, dist * (i - 1) / 12); break; } }
  c.cur = allowed < c.cur ? allowed : damp(c.cur, allowed, 4, dt);
  camera.position.copy(camLook).addScaledVector(camDir, c.cur);
  const gy = G.area.heightAt(camera.position.x, camera.position.z) + 0.45; if (camera.position.y < gy) camera.position.y = gy;
  if (c.shake > 0) { c.shake = Math.max(0, c.shake - dt * 2.4); const s = c.shake * c.shake * 1.3; camera.position.x += rand(-s, s); camera.position.y += rand(-s, s); camera.position.z += rand(-s, s); }
  camera.lookAt(camLook);
}

// ---------------------------------------------------------------- area + entity management
function clearEntities() {
  for (const e of G.enemies) if (!e.gone) e.remove();
  G.enemies.length = 0; clearCombat(); fx.clear(); G.lock = null; G.boss = null; G.combatT = 0; G.slowT = 0; G.hitstop = 0;
}
function disposeGroup(g) { g.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); if (o.material.dispose) o.material.dispose(); } }); }
function enterArea(area, x, z, yaw = 0) {
  if (G.area && G.area !== area) { scene.remove(G.area.group); if (G.area.kind === 'shrine') disposeGroup(G.area.group); }
  if (!area.group.parent) scene.add(area.group);
  G.area = area; G.interactables = area.interactables;
  const p = G.player; p.pos.set(x, 0, z); area.resolve(p.pos, p.radius, p); p.pos.y = area.heightAt(p.pos.x, p.pos.z); p.vel.set(0, 0, 0); p.yaw = yaw; p.grounded = true; if (!p.dead) p.setState('move');
  if (G.comp) G.comp.pos.set(p.pos.x + 1.4, p.pos.y, p.pos.z + 1.4);
  G.cam.yaw = yaw + Math.PI; G.cam.pitch = 0.34; G.cam.snap = true;
  if (area.onEnter) area.onEnter();
}
async function transition(fn) {
  if (G.mode === 'cut') return; G.mode = 'cut'; ui.setPrompt(null);
  await ui.fade(true);
  try { fn(); } catch (e) { showError(e); }
  G.cam.snap = true; await ui.fade(false);
  if (G.mode === 'cut') G.mode = 'play'; input.clear();
}
function placeAtWaystone(id) { const w = WAYSTONES.find((x) => x.id === id) || WAYSTONES[0]; enterArea(world, w.x + 2.8, w.z + 2.8, Math.atan2(-w.x - 2.8, -w.z - 2.8)); }

function genWave(budget, f) {
  const pool = [[['husk', 1], 3], [['skitter', 0.6], 2.5], [['spitter', 1], 2]];
  if (f >= 3) pool.push([['brute', 2.5], 1.2]); if (f >= 5) pool.push([['warder', 2], 1.5]); if (f >= 8) pool.push([['wraith', 2.2], 1.5]);
  const out = []; let b = budget;
  while (b > 0.5 && out.length < 7) {
    let [name, cost] = weighted(pool);
    if (Math.random() < Math.min(0.4, f * 0.025) && b >= cost * 2.2) { name = 'E:' + name; cost *= 2.2; }
    if (cost > b + 0.6 && out.length) break;
    out.push(name); b -= cost;
  }
  return out;
}
const genWaves = (f) => [genWave(3 + f * 0.7, f), genWave(3.5 + f * 0.75, f), ...(f > 6 ? [genWave(4 + f * 0.8, f)] : [])];

// ---------------------------------------------------------------- lock-on
let flickCd = 0;
function toggleLock() {
  if (G.lock) { G.lock = null; audio.sfx('uiBack'); return; }
  const p = G.player, fy = isClassic() ? p.yaw : G.cam.yaw + Math.PI; let best = null, bs = 1e9;
  for (const e of G.enemies) {
    if (e.dead || e.spawnT > 0 || e.hidden) continue;
    const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z, d = Math.hypot(dx, dz); if (d > 34) continue;
    const ad = Math.abs(angDiff(fy, Math.atan2(dx, dz))); if (ad > 1.3 && d > 6) continue;
    const s = d + ad * 14 + (e.aggro ? 0 : 6); if (s < bs) { bs = s; best = e; }
  }
  if (best) { G.lock = best; audio.sfx('ui'); }
}
function lockNext() {
  const p = G.player, old = G.lock; let best = null, bd = 18;
  for (const e of G.enemies) { if (e === old || e.dead || e.spawnT > 0 || !e.aggro) continue; const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z); if (d < bd) { bd = d; best = e; } }
  G.lock = best;
}
function updateLock(dt) {
  const L = G.lock, p = G.player; flickCd -= dt;
  if (!L) return;
  if (L.dead || L.gone || Math.hypot(L.pos.x - p.pos.x, L.pos.z - p.pos.z) > 44) { G.lock = null; if (L.dead) lockNext(); return; }
  if (Math.abs(input.camX) > 0.75 && flickCd <= 0) {
    flickCd = 0.35; const cy = G.cam.yaw, rx = Math.cos(cy), rz = -Math.sin(cy), dir = Math.sign(input.camX); let best = null, bs = 1e9;
    for (const e of G.enemies) { if (e === L || e.dead || e.spawnT > 0) continue; const side = ((e.pos.x - L.pos.x) * rx + (e.pos.z - L.pos.z) * rz) * dir; if (side <= 0.3) continue; const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z); if (d > 34) continue; const s = side + d * 0.3; if (s < bs) { bs = s; best = e; } }
    if (best) { G.lock = best; audio.sfx('ui'); }
  }
}

// ---------------------------------------------------------------- game flow
let deathT = 0, lastBiome = null, saveT = 0, mood = 'title';
const game = {
  returnPos: null,
  applyQuality,
  save() { if (G.save) storeSave(G.save); },
  setMood(m) { mood = m; audio.setMood(m); },
  start(isNew) {
    audio.resume();
    if (isNew) { wipeSave(); G.save = newSave(); } else G.save = loadSave() || newSave();
    G.run = null; G.artCd = {}; ui.stack.length = 0; ui.el.tmenu.innerHTML = ''; ui.el.menu.classList.add('hidden'); ui.el.menu._chidden = true;
    if (!G.player) G.player = new Player(); else G.player.reset();
    const p = G.player; p.model.root.visible = true; p.fullRestore(); p.gauge = 0;
    clearEntities(); world.refresh(); world.respawnAll();
    placeAtWaystone(G.save.respawn); K.summonActive(true);
    document.getElementById('title').classList.add('hidden'); ui.showHud(true); G.atTitle = false; G.mode = 'play'; lastBiome = null; input.clear();
    if (G.save.quest === 0) ui.say(TALK.intro, () => game.tip('move'));
    if (!audio.running) setTimeout(() => { if (!audio.running) ui.toast('Click the game once to switch the sound on.', 'tip', 6); }, 2500);
  },
  quit() {
    game.save(); clearEntities(); G.run = null; if (G.comp) { G.comp.dispose(); G.comp = null; }
    if (G.area !== world) enterArea(world, 9, -9); world.resetZones();
    G.player.model.root.visible = false; ui.showHud(false); document.getElementById('title').classList.remove('hidden'); G.atTitle = true; G.mode = 'title'; game.setMood('title'); ui.titleMenu(true);
  },
  tip(id) {
    const s = G.save; if (!s || s.tips[id]) return; s.tips[id] = 1; const g = (a) => input.glyph(a), pad = input.usingPad;
    const T = {
      move: pad ? 'Move with the left stick. Look around with the right stick.' : 'Move with <span class="key">WASD</span>. Click the game to look around with the mouse.',
      fight: `${g('light')} chains into a four-hit combo. Hold ${g('heavy')} to charge a guard-breaking thrust.`,
      dodge: `${g('dodge')} to dodge through attacks. Tap ${g('guard')} just before a blow lands to parry it.`,
      lock: `${g('lock')} locks on to a foe. Your blade takes on your Kith's element.`,
      kith: 'Wild Kith nearby! Weaken one below half health to attempt a Bond Rite.',
      bind: `It is weakened. Press ${g('bind')} to begin the Bond Rite.`,
      art: `${g('art')} unleashes your Kith's Bond Art. ${g('kithPrev')} ${g('kithNext')} swap Kith.`,
      heal: `${g('potion')} drinks a Dewdrop. Waystones refill them.`,
    };
    ui.toast(T[id], 'tip', 7.5);
  },
  gainXp(n) {
    const s = G.save, p = G.player; s.xp += n;
    while (s.level < MAX_LEVEL && s.xp >= xpNext(s.level)) {
      s.xp -= xpNext(s.level); s.level++; s.sigils++; p.recalc(); p.hp = p.maxHp;
      ui.toast(`Level ${s.level}! +1 Skill Sigil`, 'gold', 3.5); audio.sfx('level'); fx.column(p.pos, 0xffd98a, 6, 50); fx.ring(p.pos, 0xffd98a, 0.5, 6, 0.6, true);
    }
    K.gainKithXp(n * 0.85);
  },
  addMotes(n) { G.save.motes += n; },
  onKill(e) {
    const s = G.save, p = G.player;
    if (e.wild) { ui.toast(`${e.name} fled into the wild.`); game.gainXp(Math.round(e.xp * 0.5)); return; }
    if (e.minion) return;
    game.gainXp(e.xp); dropMotes(e.pos, e.boss ? 60 + e.level * 12 : e.motes, e.boss ? 0 : 0.1); s.kills++;
    if (s.skills.vamp) p.heal(p.maxHp * 0.04, true);
    if (e.boss) { G.slowT = 1.5; fx.shake(0.9); audio.sfx('boom'); input.rumble(1, 1, 600); fx.column(e.pos, EL[e.el].color, 12, 80); }
    game.tip('lock');
  },
  onPlayerDeath() { deathT = 2.2; G.lock = null; ui.banner('You fell', 'The Kith carry you back', 2.4); },
  respawn() {
    const p = G.player, A = G.area; clearEntities();
    if (A.kind === 'shrine' && A.mode === 'shrine') { A.resetRooms(); const r = A.respawnPoint(); p.dead = false; enterArea(A, r.x, r.z, Math.PI); }
    else if (A.kind === 'shrine') {
      const f = G.run ? G.run.floor : 0, abyss = A.mode === 'abyss'; G.run = null; const r = game.returnPos || { x: 9, z: -9 }; p.dead = false; world.resetZones(); enterArea(world, r.x, r.z, 0);
      if (abyss) ui.toast(`The Abyss claimed you on floor ${f}. Record: floor ${G.save.abyssBest}.`, 'gold', 5);
    } else { world.resetZones(); p.dead = false; placeAtWaystone(G.save.respawn); }
    p.reset(); p.fullRestore(); p.gauge = 0; G.artCd = {}; K.summonActive(true); game.save();
  },
  toggleLock, lockNext,
  castArt: K.castArt, tryBind: K.tryBind, swapKith: K.swapKith,

  talk(id) {
    const s = G.save;
    if (id === 'elder') {
      if (s.quest === 0) ui.say(TALK.elder0, () => ui.starterMenu((sp) => { K.addKith(sp, 2); K.summonActive(); s.quest = 1; audio.sfx('bound'); ui.say([['', `${KITH[sp].name} bounds over and presses its head against your hand.`], ...TALK.elder1], () => game.save()); }));
      else ui.say(s.quest >= 6 ? TALK.elderEnd : TALK.elderMid);
    } else if (id === 'smith') { if (!s.tips.smith) { s.tips.smith = 1; ui.say(TALK.smith, () => ui.smithMenu()); } else ui.smithMenu(); }
    else if (id === 'merchant') { if (!s.tips.merchant) { s.tips.merchant = 1; ui.say(TALK.merchant, () => ui.merchantMenu()); } else ui.merchantMenu(); }
    else if (id === 'keeper') { if (!s.tips.keeper) { s.tips.keeper = 1; ui.say(TALK.keeper, () => ui.keeperMenu()); } else ui.keeperMenu(); }
  },
  useWaystone(id) {
    const s = G.save;
    if (!s.waystones[id]) { s.waystones[id] = true; world.refresh(); audio.sfx('chest'); ui.toast('Waystone awakened.', 'gold'); fx.column(G.player.pos, 0x6ff0ff, 7, 40); }
    ui.waystoneMenu(id);
  },
  rest(id) {
    const p = G.player; G.save.respawn = id; clearEntities(); world.respawnAll(); p.fullRestore(); G.artCd = {}; game.save();
    audio.sfx('heal'); fx.column(p.pos, 0x6ff0c8, 5, 40); ui.toast('Rested. Your journey is saved.', 'gold');
  },
  travel(id) { transition(() => { clearEntities(); world.resetZones(); G.save.respawn = id; placeAtWaystone(id); audio.sfx('portal'); game.save(); }); },
  fount() { const p = G.player; p.fullRestore(); audio.sfx('heal'); fx.column(p.pos, 0x6ff0c8, 5, 40); ui.toast('Restored. You will return here if you fall.', 'gold'); },
  openChest(ch) {
    const s = G.save, r = ch.reward; s.chests[ch.id] = 1; ch.opened = true; ch.lid.rotation.x = -1.9; audio.sfx('chest');
    const pos = ch.lid.parent.position; dropMotes(pos, r.motes, 0); fx.column(pos, 0xffd98a, 3, 30);
    let msg = `Found ${r.motes} motes`; if (r.threads) { s.threads += r.threads; msg += `, ${r.threads} Bond Threads`; } if (r.sigil) { s.sigils += r.sigil; msg += ', a Skill Sigil'; }
    ui.toast(msg + '.', 'gold', 3.5); game.save();
  },
  takeShard(sh) {
    const s = G.save; s.shards[sh.id] = 1; s.sigils++; audio.sfx('chest'); fx.column({ x: sh.x, y: sh.y, z: sh.z }, 0x9adfff, 8, 60);
    ui.toast(`Echo Shard ${Object.keys(s.shards).length} of 16. +1 Skill Sigil`, 'gold', 4); game.save();
  },

  enterShrine(id) {
    const def = SHRINES[id], p = G.player;
    transition(() => {
      game.returnPos = { x: p.pos.x, z: p.pos.z }; clearEntities(); world.resetZones();
      const A = buildShrine(def, { onClear: (room, area) => game.shrineClear(def, room, area) });
      enterArea(A, A.start.x, A.start.z, Math.PI); ui.banner(def.name, 'Recommended level ' + def.level); game.setMood('shrine'); audio.sfx('portal');
    });
  },
  shrineClear(def, room, A) {
    if (room.t !== 'boss') { ui.toast('The way opens.', '', 1.6); return; }
    const s = G.save, id = def.id, first = !s.shrines[id]; G.boss = null; game.setMood('shrine');
    after(1.8, () => {
      A.addPortal(0, room.cz, 'Return to the surface', () => game.leaveArea());
      if (!first) { ui.toast('The guardian falls again.', 'gold'); return; }
      s.shrines[id] = true; s.relics[id] = true; s.sigils += 2; s.quest = Math.max(s.quest, SHRINE_ORDER.indexOf(id) + 2); world.refresh(); G.player.recalc(); audio.sfx('bound');
      const lines = [['', `The ${def.name.replace(/^The /, '')} wakes, and its song pours back into Vael.`], ['', `You claim the ${def.relic}. ${def.relicDesc}`], ['', 'You also gain 2 Skill Sigils.']];
      if (id === 'hollow') lines.push(['', 'The Hollow King is silent at last. Thank you for playing Hushfall.'], ['', 'The Abyss, the Hush Rifts and the rarest Kith are still out there.']);
      else lines.push(['', 'Somewhere far off, a veil of Hush tears open.']);
      ui.say(lines, () => game.save());
    });
  },
  leaveArea() {
    transition(() => {
      clearEntities(); G.run = null; const r = game.returnPos || { x: 9, z: -9 };
      enterArea(world, r.x, r.z, Math.atan2(-r.x, -r.z)); G.player.recalc(); lastBiome = null; game.save();
    });
  },
  useWell() {
    const s = G.save; if (!s.relics.cinders) { ui.say(TALK.well0); return; }
    ui.confirm(`Descend into the Abyss? Record: ${s.abyssBest ? 'floor ' + s.abyssBest : 'none yet'}.`, () => { G.run = { floor: 0, boons: {} }; game.returnPos = { x: -12, z: 16 }; game.nextFloor(); }, 'Descend');
  },
  nextFloor() {
    const run = G.run; if (!run) return; run.floor++;
    const f = run.floor, bossF = f % 5 === 0, bid = ['ghorn', 'cindermaw', 'brine', 'skarn', 'king'][(Math.floor(f / 5) - 1 + 5) % 5];
    const def = { id: 'abyss', name: 'The Abyss', el: bossF ? BOSS[bid].el : pick(['verdant', 'ember', 'tide', 'storm', 'gloam']), level: Math.round(5 + f * 1.6), boss: bid, rooms: [bossF ? { t: 'boss' } : { t: 'combat', waves: genWaves(f) }] };
    transition(() => {
      clearEntities(); world.resetZones();
      const A = buildShrine(def, { mode: 'abyss', exitLabel: 'Abandon the descent', onClear: (room, area) => game.abyssClear(room, area) });
      enterArea(A, A.start.x, A.start.z, Math.PI); ui.banner('The Abyss', 'Floor ' + f); game.setMood('shrine'); audio.sfx('portal');
    });
  },
  abyssClear(room, A) {
    const run = G.run, s = G.save; if (!run) return; G.boss = null; game.setMood('shrine');
    const f = run.floor, reward = 30 + f * 14 + (room.t === 'boss' ? 150 : 0); game.addMotes(reward); if (f > s.abyssBest) s.abyssBest = f; game.save();
    ui.toast(`Floor ${f} cleared. +${reward} motes`, 'gold');
    after(1.2, () => {
      const pool = BOONS.slice(), opts = []; while (opts.length < 3) opts.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      ui.boonMenu(opts, (b) => {
        const p = G.player; run.boons[b.id] = (run.boons[b.id] || 0) + 1; p.recalc();
        if (b.id === 'mend') p.heal(p.maxHp * 0.6); if (b.id === 'dew') p.potions = p.maxPotions; if (b.id === 'vigor') p.heal(30);
        audio.sfx('level'); A.addPortal(0, room.cz, 'Descend deeper', () => game.nextFloor());
      });
    });
  },
  enterRift(id, idx) {
    const s = G.save, lvl = [5, 10, 15, 20, 26][idx], p = G.player, f = 2 + idx * 2.5;
    const def = { id, name: 'Hush Rift', el: 'gloam', level: lvl, rooms: [{ t: 'combat', waves: [genWave(3.5 + idx * 1.2, f), genWave(4.5 + idx * 1.3, f), genWave(5.5 + idx * 1.4, f)] }] };
    transition(() => {
      game.returnPos = { x: p.pos.x, z: p.pos.z }; clearEntities(); world.resetZones();
      const A = buildShrine(def, { mode: 'rift', exitLabel: 'Leave the rift', onClear: (room, area) => {
        const first = !s.rifts[id], m = (first ? 120 : 40) + lvl * (first ? 20 : 6); game.addMotes(m); if (first) { s.rifts[id] = true; s.sigils++; }
        ui.toast(first ? `Hush Rift sealed. +${m} motes, +1 Skill Sigil` : `Rift quelled. +${m} motes`, 'gold', 4); area.addPortal(0, room.cz, 'Leave the rift', () => game.leaveArea()); game.save();
      } });
      enterArea(A, A.start.x, A.start.z, Math.PI); ui.banner('Hush Rift', 'Three waves. Recommended level ' + lvl); game.setMood('shrine'); audio.sfx('portal');
    });
  },
};
G.game = game; G.ui = ui; G.world = world;

function interact() {
  const p = G.player; if (p.dead) { ui.setPrompt(null); return; }
  let best = null, bd = 1e9;
  if (G.combatT <= 0 || G.area.kind === 'shrine') for (const it of G.interactables) { if (it.cond && !it.cond()) continue; const d = Math.hypot(it.pos.x - p.pos.x, it.pos.z - p.pos.z); if (d < it.r && d < bd) { bd = d; best = it; } }
  if (best && p.grounded) {
    ui.setPrompt(`${input.glyph('jump')} ${typeof best.label === 'function' ? best.label() : best.label}`);
    if (input.pressed('jump')) { input.consume('jump'); audio.sfx('uiSel'); best.use(); }
    return;
  }
  const w = G.enemies.find((e) => e.bindable && Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < 11);
  if (w) { ui.setPrompt(`${input.glyph('bind')} Begin Bond Rite &nbsp;<span style="opacity:.7">Threads ${G.save.threads}</span>`); game.tip('bind'); } else ui.setPrompt(null);
}

function showError(e) { console.error(e); ui.error(String(e && e.stack ? e.stack : e).slice(0, 600)); }

// ---------------------------------------------------------------- frame loop
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const raw = Math.min(0.05, Math.max(0.001, (now - last) / 1000)); last = now; G.rawDt = raw;
  try {
    input.update(raw); input.wantLock = G.mode === 'play' && !isClassic();
    if (input.anyPress) audio.resume();
    if (G.mode !== 'play' && document.pointerLockElement) document.exitPointerLock();
    let dt = 0;
    if (G.mode === 'play') {
      const p = G.player, s = G.save;
      if (input.pressed('pause')) { ui.pauseMenu(0); }
      else if (input.pressed('map')) { ui.pauseMenu(4); }
      else {
        let pdt = raw;
        if (G.hitstop > 0) { G.hitstop -= raw; pdt = 0; } else if (G.slowT > 0) { G.slowT -= raw; dt = raw * 0.28; pdt = raw * 0.9; } else dt = raw;
        G.time += dt; s.playtime += raw;
        interact();
        if (G.mode === 'play') {
          p.update(pdt); if (G.comp) G.comp.update(pdt);
          for (const e of G.enemies) e.update(dt);
          for (let i = G.enemies.length - 1; i >= 0; i--) if (G.enemies[i].gone) G.enemies.splice(i, 1);
          updateCombat(dt); G.area.update(dt, G.time); updateLock(raw);
          for (const id in G.artCd) if (G.artCd[id] > 0) G.artCd[id] -= pdt;
          if (G.combatT > 0) { G.combatT -= raw; game.tip('fight'); if (G.comp && s.tips.fight && s.playtime > 30) game.tip('art'); }
          if (G.lastHitT > 0) { G.lastHitT -= raw; if (G.lastHitT <= 0) G.lastHit = null; }
          if (p.hp < p.maxHp * 0.99 && !p.dead) game.tip('dodge'); if (p.hp < p.maxHp * 0.5 && !p.dead) game.tip('heal');
          if (p.dead && deathT > 0) { deathT -= raw; if (deathT <= 0) transition(() => game.respawn()); }
          // biome banner + music
          if (G.area.kind === 'overworld') {
            const e = world.env(p.pos), b = e.w > 0.6 ? Object.keys(BIOME).find((k) => BIOME[k] === e.b) : e.w < 0.4 ? 'meadow' : lastBiome;
            if (b && b !== lastBiome) { lastBiome = b; ui.banner(BIOME[b].name, BIOME[b].sub); game.setMood(BIOME[b].mood); }
            saveT += raw; if (saveT > 45 && G.combatT <= 0) { saveT = 0; game.save(); }
          } else if (G.boss && !G.boss.dead && mood !== 'boss') game.setMood('boss');
        }
      }
    }
    updateCamera(raw); updateEnv(raw); fx.update(dt, raw); ui.update(raw); audio.update(raw, G.combatT > 0 && G.mode === 'play');
    renderer.render(scene, camera);
  } catch (e) { showError(e); }
}

// ---------------------------------------------------------------- boot
loadOpts(G.opts); applyQuality();
fx.init(scene); input.init(canvas); ui.init();
G.save = loadSave(); const hadSave = !!G.save; if (!G.save) G.save = newSave();
await loadArt();   // optional custom art from assets/art.json (see CUSTOMIZE.md)
if (ART.title) { document.getElementById('tlogo').textContent = ART.title; document.title = ART.title; }
if (ART.subtitle) document.getElementById('tsub').textContent = ART.subtitle;
world.build(); scene.add(world.group); G.area = world;
G.atTitle = true; ui.titleMenu(hadSave); audio.setMood('title');
// a transfer link (...#save=CODE) offers to load that save on this device
function checkTransferLink() {
  const m = location.hash.match(/^#save=([A-Za-z0-9._-]+)$/); if (!m) return;
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
  if (!G.atTitle) { ui.toast('Quit to the title screen, then open the transfer link again to load that save.', '', 6); return; }
  importCode(m[1]).then((s) => ui.offerImport(s), () => ui.toast('That transfer link could not be read. Copy the whole link and try again.', '', 6));
}
checkTransferLink(); addEventListener('hashchange', checkTransferLink);
// handy console helpers
window.G = G; window.step = frame;
window.dbg = {
  tp: (x, z) => enterArea(G.area, x, z), give: (n = 5000) => { G.save.motes += n; G.save.sigils += 20; G.save.threads += 20; },
  lvl: (n) => { G.save.level = n; G.player.recalc(); G.player.hp = G.player.maxHp; }, shrine: (id) => game.enterShrine(id),
  open: () => { for (const id of SHRINE_ORDER) { G.save.shrines[id] = true; G.save.relics[id] = true; } G.save.quest = 6; world.refresh(); G.player.recalc(); },
  kith: (sp, l = 5) => { K.addKith(sp, l); if (!G.comp) K.summonActive(); },
};
requestAnimationFrame(frame);
