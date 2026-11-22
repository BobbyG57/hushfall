// HUD, menus, dialogue, the map and the Bond Rite minigame. All plain DOM over the canvas.
import { G } from './state.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { fx } from './fx.js';
import { MEMORIES, LULLABY, EL, KITH, ARTS, SKILLS, RARITY, QUESTS, WAYSTONES, SHRINES, KTABLE, BIOME, VEIL_REQ, PASS, kithName, isEvolved, xpNext, kithXpNext, bladeCost, vitCost, flaskCost, MAX_BLADE, MAX_VIT, MAX_FLASK, STARTERS } from './data.js';
import { partyList, activeKith, partyMax, artCooldown, kithPower, summonActive } from './kith.js';
import { storeOpts, loadSave, storeSave, exportCode, importCode, transferLink } from './save.js';
import { clamp } from './util.js';

const $ = (id) => document.getElementById(id);
const set = (el, html) => { if (el._h !== html) { el._h = html; el.innerHTML = html; } };
const cls = (el, name, on) => { const k = '_c' + name; if (el[k] === undefined) el[k] = el.classList.contains(name); if (el[k] !== !!on) { el[k] = !!on; el.classList.toggle(name, !!on); } };
const pill = (el) => `<span class="pill" style="background:${EL[el].css}">${EL[el].glyph} ${EL[el].name}</span>`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtTime = (s) => `${Math.floor(s / 3600)}h ${String(Math.floor(s / 60) % 60).padStart(2, '0')}m`;

export const ui = {
  stack: [], returnMode: 'play', dlg: null, bind: null, bannerT: 0, toasts: [], ebars: [], frame: 0, prompt: null, chipSig: '', tipSig: '',

  init() {
    this.el = {}; for (const id of ['hud', 'lvl', 'hpbar', 'bondbar', 'xpbar', 'flask', 'mini', 'motes', 'quest', 'party', 'boss', 'bname', 'prompt', 'reticle', 'tips', 'ebars', 'banner', 'btitle', 'bsub', 'toasts', 'dialog', 'dwho', 'dtext', 'dnext', 'menu', 'bindui', 'bindc', 'bindtxt', 'title', 'tmenu', 'fade', 'vignette', 'err']) this.el[id] = $(id);
    this.mctx = this.el.mini.getContext('2d'); this.bctx = this.el.bindc.getContext('2d');
    this.hpFill = this.el.hpbar.querySelector('i'); this.hpText = this.el.hpbar.querySelector('span'); this.bondFill = this.el.bondbar.querySelector('i'); this.xpFill = this.el.xpbar.querySelector('i'); this.bossFill = this.el.boss.querySelector('.bar i');
    for (let i = 0; i < 14; i++) { const b = document.createElement('div'); b.className = 'eb'; b.innerHTML = '<i></i>'; b.style.display = 'none'; const n = document.createElement('div'); n.className = 'en'; n.style.display = 'none'; this.el.ebars.append(b, n); this.ebars.push({ b, f: b.firstChild, n }); }
    const click = (e) => {
      const top = this.stack[this.stack.length - 1]; if (!top) return;
      const mi = e.target.closest('.mi'), tab = e.target.closest('.mtab');
      if (tab) { top.tab = +tab.dataset.i; top.idx = 0; audio.sfx('ui'); this.renderMenu(); }
      else if (mi) { top.idx = +mi.dataset.i; this.activate(); }
    };
    this.el.menu.addEventListener('click', click); this.el.tmenu.addEventListener('click', click);
    this.el.menu.addEventListener('input', (e) => { if (e.target.id === 'xfer-in') this.xferText = e.target.value; });
  },

  // ---------------------------------------------------------------- small helpers
  showHud(v) { cls(this.el.hud, 'hidden', !v); },
  toast(text, c = '', dur = 2.8) {
    if (this.toasts.length && this.toasts[this.toasts.length - 1].text === text) { this.toasts[this.toasts.length - 1].t = dur; return; }
    const el = document.createElement('div'); el.className = 'toast ' + c; el.innerHTML = text; this.el.toasts.appendChild(el);
    this.toasts.push({ el, t: dur, text }); while (this.toasts.length > 5) this.toasts.shift().el.remove();
  },
  banner(title, sub = '', dur = 3.4) { this.el.btitle.textContent = title; this.el.bsub.textContent = sub; this.el.banner.classList.add('on'); this.bannerT = dur; },
  hurtFlash() { this.el.vignette.style.opacity = 0.75; this.vigT = 0.25; },
  fade(on, ms = 450) { this.el.fade.style.transitionDuration = ms + 'ms'; this.el.fade.style.opacity = on ? 1 : 0; return new Promise((r) => setTimeout(r, ms + 30)); },
  error(msg) { this.el.err.textContent = msg; },

  // ---------------------------------------------------------------- dialogue
  say(lines, cb, style) { this.dlg = { lines, i: 0, n: 0, cb, back: G.atTitle ? 'title' : 'play' }; G.mode = 'dialog'; cls(this.el.dialog, 'hidden', false); cls(this.el.dialog, 'memory', style === 'memory'); input.clear(); this.dlgLine(); },
  dlgLine() { const d = this.dlg, l = d.lines[d.i]; d.n = 0; this.el.dwho.textContent = l[0]; this.el.dwho.style.display = l[0] ? '' : 'none'; this.el.dtext.textContent = ''; set(this.el.dnext, input.glyph('confirm')); },
  updateDialog(dt) {
    const d = this.dlg, text = d.lines[d.i][1];
    if (d.n < text.length) { const before = Math.floor(d.n); d.n = Math.min(text.length, d.n + dt * 70); if (Math.floor(d.n) !== before) { this.el.dtext.textContent = text.slice(0, Math.floor(d.n)); if (Math.floor(d.n) % 3 === 0) audio.sfx('ui', 0.4); } }
    if (input.pressed('confirm') || input.pressed('light')) {
      if (d.n < text.length) { d.n = text.length; this.el.dtext.textContent = text; }
      else if (++d.i < d.lines.length) { audio.sfx('ui'); this.dlgLine(); }
      else { cls(this.el.dialog, 'hidden', true); this.dlg = null; G.mode = d.back; input.clear(); if (d.cb) d.cb(); }
    }
  },

  // ---------------------------------------------------------------- generic menus
  openMenu(def) { if (!this.stack.length) this.returnMode = G.atTitle ? 'title' : 'play'; this.stack.push({ def, idx: 0, tab: def.tab || 0 }); G.mode = 'menu'; input.clear(); this.renderMenu(); },
  closeMenu(all) {
    const top = this.stack.pop(); if (all) this.stack.length = 0;
    if (!this.stack.length) { cls(this.el.menu, 'hidden', true); if (top && top.def.container) this.el.tmenu.innerHTML = ''; G.mode = this.returnMode; input.clear(); }
    else this.renderMenu();
    if (top && top.def.onClose) top.def.onClose();
  },
  renderMenu() {
    const top = this.stack[this.stack.length - 1]; if (!top) return; const def = top.def, cur = def.tabs ? def.tabs[top.tab] : def;
    const items = cur.items ? cur.items() : []; top.items = items; top.idx = clamp(top.idx, 0, Math.max(0, items.length - 1));
    const list = items.map((it, i) => `<div class="mi${i === top.idx ? ' sel' : ''}${it.disabled ? ' dis' : ''}" data-i="${i}"><span>${it.label}</span><span class="r">${it.right || ''}</span></div>`).join('');
    if (def.container) { cls(this.el.menu, 'hidden', true); this.el.tmenu.innerHTML = list; return; }
    const it = items[top.idx]; const side = cur.side ? cur.side(it) : (it && it.desc ? `<p>${it.desc}</p>` : '');
    const tabs = def.tabs ? `<div class="mtabs">${input.glyph('tabL')}${def.tabs.map((t, i) => `<div class="mtab${i === top.tab ? ' on' : ''}" data-i="${i}">${t.name}</div>`).join('')}${input.glyph('tabR')}</div>` : '';
    this.el.menu.innerHTML = `<div class="mwin">${tabs}<div class="mtitle">${cur.title || def.title || ''}</div><div class="mbody">${items.length ? `<div class="mlist">${list}</div>` : ''}<div class="mside">${side}</div></div><div class="mfoot"><span>${input.glyph('confirm')} Select ${def.noCancel ? '' : `&nbsp; ${input.glyph('cancel')} Back`}</span><span>${def.foot ? def.foot() : ''}</span></div></div>`;
    cls(this.el.menu, 'hidden', false);
    const sel = this.el.menu.querySelector('.mi.sel'); if (sel) sel.scrollIntoView({ block: 'nearest' });
    if (cur.after) cur.after();
  },
  activate() {
    const top = this.stack[this.stack.length - 1]; if (!top) return; const it = top.items[top.idx]; if (!it) return;
    if (it.disabled || !it.act) { audio.sfx('deny'); return; }
    audio.sfx('uiSel'); it.act();
    if (this.stack.length && G.mode === 'menu') this.renderMenu();
  },
  updateMenu() {
    const top = this.stack[this.stack.length - 1]; if (!top) return; const def = top.def;
    if (input.navY && top.items.length) { top.idx = (top.idx + input.navY + top.items.length) % top.items.length; audio.sfx('ui'); this.renderMenu(); }
    if (def.tabs) { const d = (input.pressed('tabR') ? 1 : 0) - (input.pressed('tabL') ? 1 : 0); if (d) { top.tab = (top.tab + d + def.tabs.length) % def.tabs.length; top.idx = 0; audio.sfx('ui'); this.renderMenu(); } }
    if (input.pressed('confirm')) this.activate();
    else if ((input.pressed('cancel') || (def.pause && input.pressed('pause'))) && !def.noCancel) { audio.sfx('uiBack'); this.closeMenu(def.pause && input.pressed('pause')); }
  },
  confirm(text, yes, yesLabel = 'Yes') { this.openMenu({ title: text, items: () => [{ label: yesLabel, act: () => { this.closeMenu(); yes(); } }, { label: 'Not now', act: () => this.closeMenu() }] }); },

  // ---------------------------------------------------------------- specific menus
  titleMenu(hasSave) {
    this.stack.length = 0; this.returnMode = 'title';
    this.openMenu({ container: 'tmenu', noCancel: true, items: () => [
      ...(hasSave ? [{ label: 'Continue', act: () => { this.closeMenu(true); G.game.start(false); } }] : []),
      { label: 'New Game', act: () => { if (hasSave) this.confirm('Start over? Your saved journey will be erased.', () => { this.closeMenu(true); G.game.start(true); }, 'Erase and begin'); else { this.closeMenu(true); G.game.start(true); } } },
      { label: 'Transfer save', act: () => { this.transferMenu(true); } },
      { label: 'Controls', act: () => this.openMenu({ title: 'Controls', items: () => [], side: () => this.controlsHtml() }) },
    ] });
  },
  // ---------------------------------------------------------------- moving a save between devices
  saveSummary(s) { return `Level ${s.level}, ${s.kith.length} Kith, ${fmtTime(s.playtime)} played`; },
  async transferMenu(atTitle) {
    const cur = atTitle ? loadSave() : G.save; let link = '';
    if (cur) { try { link = transferLink(await exportCode(cur)); } catch (e) { link = ''; } }
    this.xferText = '';
    const select = () => setTimeout(() => { const t = $('xfer-out'); if (t) { t.focus(); t.select(); } }, 40);
    const copy = () => {
      const manual = () => { select(); this.toast('Press Cmd+C (or Ctrl+C) to copy the selected link.', '', 4.5); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(() => this.toast('Transfer link copied. Send it to your other device.', 'gold', 4.5), manual); else manual();
    };
    const load = () => { importCode(this.xferText).then((s) => this.offerImport(s), (e) => { audio.sfx('deny'); this.toast(esc(e && e.message ? e.message : 'That save could not be read.'), '', 4.5); }); };
    this.openMenu({ title: 'Move your save between devices', items: () => [
      { label: 'Copy transfer link', disabled: !link, act: copy },
      ...(atTitle ? [{ label: 'Load pasted save', act: load }] : []),
      { label: 'Back', act: () => this.closeMenu() },
    ], side: () => (link
      ? `<p><b>From this device.</b> ${this.saveSummary(cur)}. Copy this link and send it to yourself (Messages, email, a note). Opening it on another device offers to load this save there.</p><textarea id="xfer-out" class="xfer" rows="4" readonly>${esc(link)}</textarea>`
      : '<p>There is no save on this device yet.</p>')
      + (atTitle
        ? `<p style="margin-top:12px"><b>To this device.</b> Open a transfer link in this browser, or paste a link or code here and choose Load pasted save. It replaces the save on this device.</p><textarea id="xfer-in" class="xfer" rows="3" placeholder="Paste a transfer link or code">${esc(this.xferText || '')}</textarea>`
        : '<p style="margin-top:12px;color:var(--dim)">To load a save onto this device, use Transfer save on the title screen.</p>') });
  },
  offerImport(s) {
    const cur = loadSave();
    this.confirm(`Load this save? ${this.saveSummary(s)}.` + (cur ? ` It replaces the one on this device (${this.saveSummary(cur)}).` : ''), () => {
      storeSave(s); audio.sfx('bound'); this.toast('Save loaded. Choose Continue to play.', 'gold', 4.5); this.titleMenu(true);
    }, 'Load it');
  },
  controlsHtml() {
    const rows = [['Move', 'Left stick', 'WASD'], ['Zoom (Classic view)', 'Right stick up / down', 'Up / Down arrows'], ['Look around (Free camera view)', 'Right stick', 'Mouse or Arrows'], ['Jump, interact', 'A', 'Space'], ['Dodge', 'B', 'Shift'], ['Light attack', 'X', 'J or Left click'], ['Heavy attack (hold to charge)', 'Y', 'K or Right click'], ['Guard, tap to parry', 'LB', 'Q'], ['Kith Bond Art', 'RB', 'E'], ['Lock on', 'LT', 'Tab or C'], ['Bond Rite / Unison Burst', 'RT', 'R'], ['Drink Dewdrop', 'D-pad Up', 'F'], ['Swap Kith', 'D-pad Left / Right', 'Z / X'], ['Menu', 'Menu button', 'Esc or P'], ['Map', 'View button', 'M']];
    return `<table><tr><td></td><td><b>Xbox controller</b></td><td><b>Keyboard</b></td></tr>${rows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</table><p style="margin-top:10px">Combos: Light x4. Light, Light, Heavy for Cleave. Light x3, Heavy for Skybreaker. Dodge then Light for Dash Slash. Heavy in the air to Plunge. Unlock these under Skills.</p>`;
  },
  kithSide(k) {
    if (!k) return '<p>No Kith yet.</p>'; const sp = KITH[k.species], A = ARTS[sp.art], need = kithXpNext(k.level);
    return `<h3>${kithName(k)}</h3><p>${pill(sp.el)} &nbsp;${RARITY[sp.rar]} &nbsp;Lv ${k.level}</p><p>${sp.desc}</p><table><tr><td>Power</td><td>${kithPower(k).toFixed(1)}</td></tr><tr><td>Style</td><td>${sp.style === 'melee' ? 'Fights up close' : 'Strikes from range'}</td></tr><tr><td>Next level</td><td>${Math.floor(k.xp)} / ${need}</td></tr>${sp.evo ? `<tr><td>Evolves</td><td>${isEvolved(k) ? 'Evolved' : `at Lv ${sp.evo} into ${sp.evoName}`}</td></tr>` : ''}<tr><td>Bond Art</td><td><b>${A.name}</b> (${artCooldown(k).toFixed(0)}s)<br>${A.desc}</td></tr></table>`;
  },
  kithItems() {
    const s = G.save, party = partyList(), act = activeKith(), rest = s.kith.filter((k) => !s.party.includes(k.id));
    const row = (k, inParty) => ({ k, label: `${k === act ? '★ ' : inParty ? '• ' : ''}${kithName(k)}`, right: `${EL[KITH[k.species].el].glyph} Lv ${k.level}${inParty ? '' : ' · grove'}`, act: () => this.kithActions(k, inParty) });
    return [...party.map((k) => row(k, true)), ...rest.map((k) => row(k, false))];
  },
  kithActions(k, inParty) {
    const s = G.save, busy = G.combatT > 0;
    this.openMenu({ title: kithName(k), side: () => this.kithSide(k), items: () => [
      { label: 'Walk beside me', disabled: !inParty || k === activeKith() || busy, act: () => { s.active = s.party.indexOf(k.id); summonActive(); this.closeMenu(); } },
      inParty ? { label: 'Rest in the grove', disabled: s.party.length < 2 || busy, act: () => { s.party = s.party.filter((id) => id !== k.id); s.active = 0; summonActive(); this.closeMenu(); } }
        : { label: 'Join the party', disabled: s.party.length >= partyMax() || busy, desc: `Party size ${s.party.length} / ${partyMax()}`, act: () => { s.party.push(k.id); if (!G.comp) summonActive(); this.closeMenu(); } },
    ] });
  },
  // Echo Shard memories found so far, to read again (see MEMORIES in data.js)
  memoryTab() {
    const regions = ['meadow', 'ember', 'tide', 'storm', 'gloam'];
    return { name: 'Memories', title: 'Echo Shard memories', items: () => {
      const found = G.world.memoriesFound(), total = Object.keys(G.save.shards).length, list = [];
      for (const b of regions) MEMORIES[b].forEach((m, i) => { const has = i < (found[b] || 0); list.push({ m: has ? m : null, label: has ? m.title : '? ? ?', right: BIOME[b].name }); });
      list.push({ m: total >= 16 ? LULLABY : null, label: total >= 16 ? LULLABY.title : '? ? ?', right: 'All 16 shards' });
      return list;
    },
    side: (it) => (it && it.m
      ? `<h3>${it.m.title}</h3>` + it.m.lines.map(([who, t]) => `<p>${who ? `<b>${who}:</b> ` : '<i>'}${t}${who ? '' : '</i>'}</p>`).join('')
      : `<p>Not found yet.</p><p style="color:var(--dim)">Each region's Echo Shards hold its own story, and the memories come back in order. You have found ${Object.keys(G.save.shards).length} of 16 shards.</p>`) };
  },
  dexTab() {
    const where = (id) => Object.keys(KTABLE).filter((b) => KTABLE[b].some((e) => e[0] === id)).map((b) => BIOME[b].name).join(', ');
    return { name: 'Kithdex', title: 'Kithdex', items: () => Object.keys(KITH).map((id) => { const st = G.save.dex[id] || 0, sp = KITH[id]; return { id, st, label: st ? sp.name : '? ? ?', right: st === 2 ? 'Bonded' : st === 1 ? 'Seen' : '' }; }),
      side: (it) => { if (!it || !it.st) return '<p>You have not met this Kith yet.</p>'; const sp = KITH[it.id], A = ARTS[sp.art]; return `<h3>${sp.name}</h3><p>${pill(sp.el)} &nbsp;${RARITY[sp.rar]}</p><p>${sp.desc}</p><table><tr><td>Found in</td><td>${where(it.id)}</td></tr><tr><td>Bond Art</td><td><b>${A.name}</b><br>${A.desc}</td></tr>${sp.evo ? `<tr><td>Evolves</td><td>Lv ${sp.evo}: ${sp.evoName}</td></tr>` : ''}</table>`; },
      foot: () => '' };
  },
  pauseMenu(tab = 0) {
    const s = G.save, p = G.player;
    this.openMenu({ pause: true, tab, foot: () => `Motes ${s.motes} &nbsp; Skill Sigils ${s.sigils}`, tabs: [
      { name: 'Status', title: 'Wren, Blade of the Kith', items: () => [
        { label: 'Resume', act: () => this.closeMenu(true) },
        { label: 'Save game', act: () => { G.game.save(); this.toast('Game saved.'); } },
        { label: 'Transfer save', act: () => { G.game.save(); this.transferMenu(false); } },
        { label: 'View: ' + (G.opts.camera === 'free' ? 'Free camera (behind the hero)' : 'Classic (fixed overhead)'), act: () => { G.opts.camera = G.opts.camera === 'free' ? 'classic' : 'free'; G.cam.pitch = 0.34; G.cam.yaw = G.player.yaw + Math.PI; storeOpts(G.opts); } },
        { label: 'Free camera Y: ' + (G.opts.invertY ? 'Inverted' : 'Normal'), act: () => { G.opts.invertY = !G.opts.invertY; storeOpts(G.opts); } },
        { label: 'Volume: ' + Math.round(G.opts.volume * 100) + '%', act: () => { let v = G.opts.volume + 0.2; if (v > 1.01) v = 0; audio.setVolume(Math.round(v * 10) / 10); storeOpts(G.opts); } },
        { label: 'Graphics: ' + (G.opts.quality ? 'High' : 'Fast'), act: () => { G.opts.quality = G.opts.quality ? 0 : 1; storeOpts(G.opts); G.game.applyQuality(); } },
        { label: 'Toggle fullscreen', act: () => { if (document.fullscreenElement) document.exitFullscreen(); else { const r = document.documentElement.requestFullscreen(); if (r && r.catch) r.catch(() => this.toast('Click this option with the mouse, or press Ctrl+Cmd+F, to go fullscreen.')); } } },
        { label: 'Quit to title', act: () => this.confirm('Save and return to the title screen?', () => { this.closeMenu(true); G.game.quit(); }) },
      ], side: () => `<h3>Level ${s.level}</h3><table><tr><td>Health</td><td>${Math.ceil(p.hp)} / ${p.maxHp}</td></tr><tr><td>Sword power</td><td>${p.atkPow.toFixed(1)} (blade +${s.blade})</td></tr><tr><td>Experience</td><td>${Math.floor(s.xp)} / ${xpNext(s.level)}</td></tr><tr><td>Bond Threads</td><td>${s.threads}</td></tr><tr><td>Shrines restored</td><td>${Object.keys(s.shrines).length} / 5</td></tr><tr><td>Kith bonded</td><td>${Object.values(s.dex).filter((v) => v === 2).length} / ${Object.keys(KITH).length}</td></tr><tr><td>Echo Shards</td><td>${Object.keys(s.shards).length} / 16</td></tr><tr><td>Hush Rifts sealed</td><td>${Object.keys(s.rifts).length} / 5</td></tr><tr><td>Abyss record</td><td>${s.abyssBest ? 'Floor ' + s.abyssBest : 'None'}</td></tr><tr><td>Time played</td><td>${fmtTime(s.playtime)}</td></tr></table><p style="margin-top:10px"><b>Objective:</b> ${QUESTS[s.quest].text}</p>` },
      { name: 'Skills', title: 'Blade Skills', items: () => SKILLS.map((k) => ({ label: k.name, right: s.skills[k.id] ? 'Learned' : `${k.cost} sigil${k.cost > 1 ? 's' : ''}`, disabled: !!s.skills[k.id] || s.sigils < k.cost, desc: k.desc, act: () => { s.sigils -= k.cost; s.skills[k.id] = 1; p.recalc(); audio.sfx('level'); this.toast(`Learned ${k.name}`, 'gold'); } })),
        side: (it) => `<h3>${it ? it.label : ''}</h3><p>${it ? it.desc : ''}</p><p>Skill Sigils: <b>${s.sigils}</b></p><p style="color:var(--dim)">Earn sigils by levelling up, finding Echo Shards, and sealing Hush Rifts.</p>` },
      { name: 'Kith', title: `Your Kith (party ${s.party.length} / ${partyMax()})`, items: () => this.kithItems(), side: (it) => this.kithSide(it && it.k) },
      this.dexTab(),
      { name: 'Map', title: 'Vael', items: () => [], side: () => '<div style="display:flex;gap:16px"><canvas id="mapc" width="460" height="460"></canvas><div style="font-size:13px;line-height:1.9"><span style="color:#6ff0ff">◆</span> Waystone<br><span style="color:#fff">▲</span> Shrine<br><span style="color:#b06cff">✦</span> Hush Rift<br><span style="color:#8af0a0">●</span> Kith grove<br><span style="color:#ffd98a">◎</span> Objective<br><span style="color:#ff5a6a">▼</span> You</div></div>', after: () => this.drawMap() },
      this.memoryTab(),
      { name: 'Controls', title: 'Controls', items: () => [], side: () => this.controlsHtml() },
    ] });
  },
  waystoneMenu(id) {
    const s = G.save, here = WAYSTONES.find((w) => w.id === id);
    this.openMenu({ title: here.name + ' Waystone', items: () => [
      { label: 'Rest', desc: 'Restore health and Dewdrops, and save your journey. Foes across Vael return.', act: () => { this.closeMenu(true); G.game.rest(id); } },
      { label: 'Travel', desc: 'Step between awakened Waystones.', disabled: Object.keys(s.waystones).length < 2, act: () => this.openMenu({ title: 'Travel to...', items: () => WAYSTONES.filter((w) => w.id !== id && s.waystones[w.id]).map((w) => ({ label: w.name, act: () => { this.closeMenu(true); G.game.travel(w.id); } })) }) },
      { label: 'Kith', desc: 'Choose who walks beside you.', act: () => this.pauseMenu(2) },
      { label: 'Leave', act: () => this.closeMenu(true) },
    ] });
  },
  smithMenu() {
    const s = G.save, p = G.player; const buy = (cost, fn) => () => { s.motes -= cost; fn(); p.recalc(); audio.sfx('chest'); G.game.save(); };
    this.openMenu({ title: 'Brannoc the Smith', foot: () => `Motes ${s.motes}`, items: () => {
      const bc = bladeCost(s.blade + 1), vc = vitCost(s.vit + 1), fc = flaskCost(s.flask + 1);
      return [
        { label: `Hone blade to +${s.blade + 1}`, right: s.blade >= MAX_BLADE ? 'Max' : bc + ' motes', disabled: s.blade >= MAX_BLADE || s.motes < bc, desc: `Sword damage +15% per tier. Currently +${s.blade} (power ${p.atkPow.toFixed(1)}).`, act: buy(bc, () => s.blade++) },
        { label: `Vitality charm ${s.vit + 1}`, right: s.vit >= MAX_VIT ? 'Max' : vc + ' motes', disabled: s.vit >= MAX_VIT || s.motes < vc, desc: `+15 maximum health per charm. Currently ${p.maxHp}.`, act: buy(vc, () => { s.vit++; p.hp += 15; }) },
        { label: 'Larger Dewflask', right: s.flask >= MAX_FLASK ? 'Max' : fc + ' motes', disabled: s.flask >= MAX_FLASK || s.motes < fc, desc: `Carry one more Dewdrop. Currently ${p.maxPotions}.`, act: buy(fc, () => { s.flask++; p.potions++; }) },
      ];
    } });
  },
  merchantMenu() {
    const s = G.save; const buy = (cost, fn) => () => { s.motes -= cost; fn(); audio.sfx('pickup'); G.game.save(); };
    this.openMenu({ title: 'Pip\'s Wares', foot: () => `Motes ${s.motes} &nbsp; Threads ${s.threads}`, items: () => {
      const sc = 600 + 400 * (s.sigilBuys || 0);
      return [
        { label: 'Bond Thread', right: '25 motes', disabled: s.motes < 25, desc: 'Needed to begin a Bond Rite with a weakened wild Kith.', act: buy(25, () => s.threads++) },
        { label: 'Bundle of 5 Threads', right: '110 motes', disabled: s.motes < 110, desc: 'Five threads at a friendly price.', act: buy(110, () => { s.threads += 5; }) },
        { label: 'Skill Sigil', right: sc + ' motes', disabled: s.motes < sc, desc: 'A sigil for learning Blade Skills. The price climbs each time.', act: buy(sc, () => { s.sigils++; s.sigilBuys = (s.sigilBuys || 0) + 1; }) },
      ];
    } });
  },
  keeperMenu() { this.openMenu({ tabs: [{ name: 'Kith', title: `Keeper Oona's Grove (party ${G.save.party.length} / ${partyMax()})`, items: () => this.kithItems(), side: (it) => this.kithSide(it && it.k) }, this.dexTab()] }); },
  starterMenu(cb) {
    this.openMenu({ title: 'Choose your first Kith', noCancel: true, items: () => STARTERS.map((id) => ({ id, label: KITH[id].name, right: EL[KITH[id].el].glyph + ' ' + EL[KITH[id].el].name, act: () => { this.closeMenu(true); cb(id); } })),
      side: (it) => { const sp = KITH[it.id], A = ARTS[sp.art]; return `<h3>${sp.name}</h3><p>${pill(sp.el)}</p><p>${sp.desc}</p><p><b>${A.name}:</b> ${A.desc}</p><p style="color:var(--dim)">Ember burns Verdant. Verdant grounds Storm. Storm shocks Tide. Tide douses Ember. You can bond with the others in the wild later.</p>`; } });
  },
  boonMenu(boons, cb) { this.openMenu({ title: `Floor ${G.run.floor} cleared. Choose a boon`, noCancel: true, items: () => boons.map((b) => ({ label: b.name, desc: b.desc, act: () => { this.closeMenu(true); cb(b); } })) }); },

  // ---------------------------------------------------------------- Bond Rite
  bindRite(info, cb) {
    const need = info.rar >= 3 ? 3 : 2;
    this.bind = { info, cb, need, pulse: 0, hits: 0, miss: 0, t: 0, wait: 0.7, dur: 1.3 - 0.14 * info.rar, tol: (15 + 30 * (1 - info.hpk / 0.5)) * (info.rar === 3 ? 0.8 : 1), res: [], done: 0 };
    G.mode = 'bind'; cls(this.el.bindui, 'hidden', false); input.clear();
    set(this.el.bindtxt, `Bond Rite: ${info.name}<br><span style="font:500 15px var(--ui)">Press ${input.glyph('confirm')} as the rings meet. Land ${need} of 3.</span>`);
  },
  updateBind(dt) {
    const b = this.bind, c = this.bctx, W = 460, T = 70, cx = W / 2; let r = 205;
    if (b.done) { b.done -= dt; if (b.done <= 0) { cls(this.el.bindui, 'hidden', true); this.bind = null; G.mode = 'play'; input.clear(); b.cb(b.hits >= b.need); return; } }
    else if (b.wait > 0) { b.wait -= dt; if (b.wait <= 0) { b.t = 0; audio.sfx('beat'); } }
    else {
      b.t += dt; r = 205 - (205 - T * 0.2) * (b.t / b.dur);
      const press = input.pressed('confirm') || input.pressed('light'), passed = r < T - b.tol - 4;
      if (press || passed) {
        const ok = press && Math.abs(r - T) <= b.tol; b.res.push(ok); if (ok) { b.hits++; audio.sfx('bindGood'); input.rumble(0.4, 0.8, 90); } else { b.miss++; audio.sfx('bindBad'); }
        b.pulse++; b.flash = ok ? 1 : -1; b.wait = 0.5;
        if (b.hits >= b.need || b.miss > 3 - b.need || b.pulse >= 3) b.done = 0.7;
      }
    }
    c.clearRect(0, 0, W, W);
    c.lineWidth = b.tol * 2; c.strokeStyle = b.info.color; c.globalAlpha = 0.35 + (b.flash > 0 ? 0.4 : 0); c.beginPath(); c.arc(cx, cx, T, 0, 6.3); c.stroke();
    c.globalAlpha = 1; c.lineWidth = 2; c.strokeStyle = b.info.color; c.beginPath(); c.arc(cx, cx, T, 0, 6.3); c.stroke();
    if (!b.done && b.wait <= 0) { c.lineWidth = 5; c.strokeStyle = '#fff'; c.beginPath(); c.arc(cx, cx, Math.max(2, r), 0, 6.3); c.stroke(); }
    for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(cx - 34 + i * 34, 28, 10, 0, 6.3); c.fillStyle = b.res[i] === undefined ? 'rgba(255,255,255,.2)' : b.res[i] ? '#ffd98a' : '#ff5a6a'; c.fill(); }
    if (b.flash) b.flash *= 0.9;
  },

  // ---------------------------------------------------------------- map
  icons(c, toX, toZ, big) {
    const s = G.save, q = QUESTS[s.quest].at;
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `${big ? 16 : 13}px sans-serif`;
    for (const p of G.world.pois) {
      const x = toX(p.x), y = toZ(p.z); if (x < -10 || y < -10 || x > c.canvas.width + 10 || y > c.canvas.height + 10) continue;
      if (p.type === 'way') { c.fillStyle = s.waystones[p.id] ? '#6ff0ff' : '#7b8090'; c.fillText('◆', x, y); }
      else if (p.type === 'shrine') { c.fillStyle = s.shrines[p.id] ? EL[p.el].css : '#ffffff'; c.fillText('▲', x, y); }
      else if (p.type === 'rift') { c.fillStyle = s.rifts[p.id] ? '#6a5a8a' : '#b06cff'; c.fillText('✦', x, y); }
      else if (p.type === 'grove' && big) { c.fillStyle = '#8af0a0'; c.fillText('●', x, y); }
      else if (p.type === 'village') { c.fillStyle = '#ffd98a'; c.fillText('⌂', x, y); }
      if (big && p.name && p.type !== 'grove' && p.type !== 'rift') { c.font = '11px sans-serif'; c.fillStyle = '#fff'; c.fillText(p.name, x, y + 14); c.font = '16px sans-serif'; }
    }
    return q;
  },
  drawMap() {
    const cv = $('mapc'); if (!cv) return; const c = cv.getContext('2d'), W = cv.width, k = W / 640, toX = (x) => (x + 320) * k, toZ = (z) => (z + 320) * k;
    c.drawImage(G.world.mapCanvas, 0, 0, W, W);
    for (const b in PASS) if (!G.save.shrines[VEIL_REQ[b]]) { const p = PASS[b]; c.fillStyle = 'rgba(20,10,40,.85)'; c.beginPath(); c.arc(toX(p.x), toZ(p.z), 9, 0, 6.3); c.fill(); c.fillStyle = '#b06cff'; c.font = '11px sans-serif'; c.textAlign = 'center'; c.fillText('sealed', toX(p.x), toZ(p.z) + 20); }
    const q = this.icons(c, toX, toZ, true);
    c.strokeStyle = '#ffd98a'; c.lineWidth = 2; c.beginPath(); c.arc(toX(q[0]), toZ(q[1]), 11, 0, 6.3); c.stroke();
    const pp = G.area.kind === 'overworld' ? G.player.pos : (G.game.returnPos || G.player.pos);
    c.save(); c.translate(toX(pp.x), toZ(pp.z)); c.rotate(Math.PI - G.player.yaw); c.fillStyle = '#ff5a6a'; c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, -9); c.lineTo(6, 7); c.lineTo(0, 3); c.lineTo(-6, 7); c.closePath(); c.fill(); c.stroke(); c.restore();
  },
  drawMini() {
    const c = this.mctx, W = 170, p = G.player.pos, A = G.area;
    c.save(); c.clearRect(0, 0, W, W);
    if (A.kind !== 'overworld') {
      const sc = 1.7, toX = (x) => W / 2 + (x - p.x) * sc, toZ = (z) => W / 2 + (z - p.z) * sc;
      c.fillStyle = '#0c0a16'; c.fillRect(0, 0, W, W);
      for (const R of A.rects) { c.fillStyle = R.corr ? (R.locked ? '#4a2f6a' : '#3a3850') : (R.state === 'cleared' || R.state === 'open' ? '#3a3850' : '#5a3a4a'); c.fillRect(toX(R.x0), toZ(R.z0), (R.x1 - R.x0) * sc, (R.z1 - R.z0) * sc); }
      for (const e of G.enemies) if (!e.dead) { c.fillStyle = '#ff5a6a'; c.fillRect(toX(e.pos.x) - 2, toZ(e.pos.z) - 2, 4, 4); }
    } else {
      const span = 150, k = 257 / 640, toX = (x) => W / 2 + (x - p.x) * W / span, toZ = (z) => W / 2 + (z - p.z) * W / span;
      c.fillStyle = '#1a1626'; c.fillRect(0, 0, W, W);
      c.drawImage(G.world.mapCanvas, (p.x + 320 - span / 2) * k, (p.z + 320 - span / 2) * k, span * k, span * k, 0, 0, W, W);
      const q = this.icons(c, toX, toZ, false);
      for (const e of G.enemies) if (!e.dead && (e.aggro || e.wild)) { c.fillStyle = e.wild ? '#8af0a0' : '#ff5a6a'; c.fillRect(toX(e.pos.x) - 2, toZ(e.pos.z) - 2, 4, 4); }
      let qx = toX(q[0]) - W / 2, qy = toZ(q[1]) - W / 2; const d = Math.hypot(qx, qy), lim = W / 2 - 12; if (d > lim) { qx *= lim / d; qy *= lim / d; }
      c.strokeStyle = '#ffd98a'; c.lineWidth = 2.5; c.beginPath(); c.arc(W / 2 + qx, W / 2 + qy, 6 + Math.sin(performance.now() / 250) * 1.5, 0, 6.3); c.stroke();
    }
    c.translate(W / 2, W / 2); c.rotate(Math.PI - G.player.yaw); c.fillStyle = '#fff'; c.strokeStyle = '#14101f'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, -8); c.lineTo(5.5, 6); c.lineTo(0, 2.5); c.lineTo(-5.5, 6); c.closePath(); c.fill(); c.stroke();
    c.restore();
  },

  // ---------------------------------------------------------------- per-frame
  setPrompt(html) { this.prompt = html; },
  updateHud() {
    const s = G.save, p = G.player, e = this.el;
    set(e.lvl, 'Lv ' + s.level);
    this.hpFill.style.width = clamp(p.hp / p.maxHp * 100, 0, 100) + '%'; set(this.hpText, Math.ceil(p.hp) + ' / ' + p.maxHp);
    cls(e.bondbar, 'hidden', !s.relics.cinders); this.bondFill.style.width = p.gauge + '%'; cls(e.bondbar, 'full', p.gauge >= 100);
    this.xpFill.style.width = clamp(s.xp / xpNext(s.level) * 100, 0, 100) + '%';
    let fl = ''; for (let i = 0; i < p.maxPotions; i++) fl += `<b${i < p.potions ? '' : ' class="e"'}></b>`; set(e.flask, fl);
    set(e.motes, `◆ ${s.motes} &nbsp; ⌇ ${s.threads}${s.sigils ? ` &nbsp; ✦ ${s.sigils}` : ''}`);
    set(e.quest, G.run ? `<small>The Abyss</small>Floor ${G.run.floor}. Record: ${s.abyssBest || 'none'}` : `<small>Objective</small>${QUESTS[s.quest].text}`);
    // party chips
    const party = partyList(), act = activeKith(), sig = party.map((k) => k.id + ':' + k.level + (k === act ? '*' : '')).join(',') + input.usingPad;
    if (sig !== this.chipSig) {
      this.chipSig = sig;
      e.party.innerHTML = party.map((k) => { const sp = KITH[k.species]; return `<div class="kchip${k === act ? ' on' : ''}"><div class="kdot" style="background:${EL[sp.el].css}">${EL[sp.el].glyph}</div><div class="kinfo">${kithName(k)} <small>Lv ${k.level} · ${ARTS[sp.art].name}${k === act ? ' ' + input.glyph('art') : ''}</small><div class="kcd"><i></i></div></div></div>`; }).join('');
      this.chipCd = [...e.party.querySelectorAll('.kcd')];
    }
    party.forEach((k, i) => { const el = this.chipCd[i]; if (!el) return; const cd = G.artCd[k.id] || 0, max = artCooldown(k); el.firstChild.style.width = (100 - clamp(cd / max, 0, 1) * 100) + '%'; cls(el, 'ready', cd <= 0); });
    // boss bar, reticle, prompt
    const b = G.boss && !G.boss.dead && !G.boss.gone ? G.boss : null; cls(e.boss, 'hidden', !b);
    if (b) { set(e.bname, b.name); this.bossFill.style.width = clamp(b.hp / b.maxHp * 100, 0, 100) + '%'; }
    const L = G.lock; let show = false;
    if (L && !L.dead) { const q = fx.project(L.pos.x, L.pos.y + L.model.height * 0.55, L.pos.z); if (q.vis) { show = true; e.reticle.style.left = q.x + 'px'; e.reticle.style.top = q.y + 'px'; } }
    cls(e.reticle, 'hidden', !show);
    const showP = this.prompt && G.mode === 'play'; cls(e.prompt, 'hidden', !showP); if (showP) set(e.prompt, this.prompt);
    // enemy health bars
    const pp = p.pos; let n = 0;
    const list = G.enemies.filter((en) => !en.dead && !en.boss && en.spawnT <= 0 && (en.hp < en.maxHp || en === L || en.wild) && Math.hypot(en.pos.x - pp.x, en.pos.z - pp.z) < 34);
    for (const en of list) {
      if (n >= this.ebars.length) break; const q = fx.project(en.pos.x, en.pos.y + en.model.height + 0.5, en.pos.z); if (!q.vis) continue;
      const bar = this.ebars[n++]; bar.b.style.display = 'block'; bar.b.style.left = q.x + 'px'; bar.b.style.top = q.y + 'px'; bar.f.style.width = clamp(en.hp / en.maxHp * 100, 0, 100) + '%';
      cls(bar.b, 'wild', !!en.wild); cls(bar.b, 'bindable', en.bindable);
      const label = en.wild || en === L || en === G.lastHit || en.elite;
      bar.n.style.display = label ? 'block' : 'none';
      if (label) { bar.n.style.left = q.x + 'px'; bar.n.style.top = (q.y - 3) + 'px'; set(bar.n, `<span style="color:${EL[en.el].css}">${EL[en.el].glyph}</span> ${en.name} <span style="opacity:.7">Lv ${en.level}</span>${en.bindable ? ' ' + input.glyph('bind') : ''}`); }
    }
    for (; n < this.ebars.length; n++) { this.ebars[n].b.style.display = 'none'; this.ebars[n].n.style.display = 'none'; }
    // control hints for the first stretch of the journey
    const tipSig = (s.playtime < 900 && !G.run) + '' + input.usingPad + !!s.relics.cinders;
    if (tipSig !== this.tipSig) { this.tipSig = tipSig; const g = (a) => input.glyph(a); e.tips.innerHTML = s.playtime < 900 && !G.run ? `${g('light')} Light &nbsp;${g('heavy')} Heavy &nbsp;${g('dodge')} Dodge &nbsp;${g('jump')} Jump<br>${g('guard')} Guard / Parry &nbsp;${g('art')} Bond Art &nbsp;${g('lock')} Lock on<br>${g('bind')} Bond Rite &nbsp;${g('potion')} Dewdrop &nbsp;${g('pause')} Menu` : ''; }
    if (++this.frame % 2 === 0) this.drawMini();
  },
  update(dt) {
    for (let i = this.toasts.length - 1; i >= 0; i--) { const t = this.toasts[i]; t.t -= dt; if (t.t < 0.5) t.el.style.opacity = Math.max(0, t.t / 0.5); if (t.t <= 0) { t.el.remove(); this.toasts.splice(i, 1); } }
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.el.banner.classList.remove('on'); }
    if (this.vigT > 0) { this.vigT -= dt; if (this.vigT <= 0) this.el.vignette.style.opacity = G.player && G.player.hp / G.player.maxHp < 0.25 && !G.player.dead ? 0.35 : 0; }
    if (G.mode === 'menu') this.updateMenu();
    else if (G.mode === 'dialog' && this.dlg) this.updateDialog(dt);
    else if (G.mode === 'bind' && this.bind) this.updateBind(dt);
    if (G.player && !G.atTitle) this.updateHud();
  },
};
