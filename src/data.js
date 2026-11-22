// Static game data: elements, Kith species, enemies, skills, world layout, text.

export const EL = {
  none: { name: 'Neutral', color: 0xd8dee6, css: '#d8dee6', glyph: '◇' },
  verdant: { name: 'Verdant', color: 0x6fdc5a, css: '#6fdc5a', glyph: '❦' },
  ember: { name: 'Ember', color: 0xff7a3c, css: '#ff7a3c', glyph: '✹' },
  tide: { name: 'Tide', color: 0x4ab8ff, css: '#4ab8ff', glyph: '≋' },
  storm: { name: 'Storm', color: 0xffe14a, css: '#ffe14a', glyph: 'ϟ' },
  gloam: { name: 'Gloam', color: 0xb06cff, css: '#b06cff', glyph: '☾' },
};
// Ember burns Verdant, Verdant grounds Storm, Storm shocks Tide, Tide douses Ember. Gloam cuts and is cut by everything.
export const BEATS = { ember: 'verdant', verdant: 'storm', storm: 'tide', tide: 'ember' };
export function elMult(a, d, edge) {
  if (!a || !d || a === 'none' || d === 'none') return 1;
  if (a === 'gloam' || d === 'gloam') return a === d ? 1 : 1.2;
  if (BEATS[a] === d) return edge ? 1.8 : 1.5;
  if (BEATS[d] === a) return 0.7;
  return 1;
}

export const hpScale = (l) => 1 + 0.22 * (l - 1);
export const dmgScale = (l) => 1 + 0.11 * (l - 1);
export const xpNext = (l) => Math.floor(30 + 18 * Math.pow(l, 1.5));
export const kithXpNext = (l) => Math.floor(24 + 14 * Math.pow(l, 1.45));
export const bladeCost = (t) => Math.round(60 * Math.pow(t, 1.6) / 5) * 5;
export const vitCost = (t) => Math.round(50 * Math.pow(t, 1.5) / 5) * 5;
export const flaskCost = (t) => [150, 400, 800, 1400][t - 1];
export const MAX_BLADE = 8, MAX_VIT = 8, MAX_FLASK = 4, MAX_LEVEL = 40, MAX_KITH_LEVEL = 30;

export const ARTS = {
  vinesnare: { name: 'Vine Snare', cd: 14, desc: 'Roots nearby foes in place for 4 seconds.' },
  quake: { name: 'Thorn Quake', cd: 13, desc: 'Erupting thorns stagger and batter nearby foes.' },
  bloom: { name: 'Bloom', cd: 22, desc: 'Heals you for 35% of your health.' },
  firebreath: { name: 'Fire Breath', cd: 12, desc: 'A cone of flame that leaves foes burning.' },
  eruption: { name: 'Eruption', cd: 15, desc: 'Leaps to your target and detonates.' },
  meteor: { name: 'Cinder Rain', cd: 18, desc: 'Calls six falling embers onto foes.' },
  tidalwave: { name: 'Tidal Wave', cd: 13, desc: 'A rolling wave that shoves foes back.' },
  aegis: { name: 'Pearl Aegis', cd: 20, desc: 'Shields you from the next 3 hits.' },
  stillwater: { name: 'Stillwater', cd: 20, desc: 'Freezes nearby foes solid for 3.5 seconds.' },
  chainbolt: { name: 'Chain Bolt', cd: 11, desc: 'Lightning that arcs between up to six foes.' },
  galeforce: { name: 'Gale Force', cd: 16, desc: 'A vortex that drags foes together and shreds them.' },
  thunderfall: { name: 'Thunderfall', cd: 18, desc: 'Three colossal bolts strike the strongest foes.' },
  dread: { name: 'Dread', cd: 18, desc: 'Nearby foes take 40% more damage for 7 seconds.' },
  shadowstrike: { name: 'Shadow Strike', cd: 15, desc: 'Blinks through every nearby foe in turn.' },
};

// rar: 1 common, 2 uncommon, 3 rare.  m: procedural model parameters.
export const KITH = {
  mossling: { name: 'Mossling', evoName: 'Mossgrowl', evo: 10, el: 'verdant', rar: 1, power: 5, style: 'melee', art: 'vinesnare', desc: 'A drowsy tuft of living moss that naps in sunbeams.', m: { body: 'blob', size: 0.8, c1: 0x6bbf4e, c2: 0xcfe8a0, c3: 0xff8fb0, ears: 'leaf', tail: 'leaf' } },
  thornback: { name: 'Thornback', evoName: 'Briarbull', evo: 14, el: 'verdant', rar: 2, power: 6.5, style: 'melee', art: 'quake', desc: 'Stubborn and prickly. Charges first, thinks never.', m: { body: 'quad', size: 1, c1: 0x4e8f3a, c2: 0x8a6a3a, c3: 0xd8f06a, spikes: 1, horns: 1, tail: 'stub' } },
  bloomstag: { name: 'Bloomstag', el: 'verdant', rar: 3, power: 7, style: 'ranged', art: 'bloom', desc: 'Flowers open wherever it steps. Rarely seen twice.', m: { body: 'quad', size: 1.15, tall: 1, c1: 0xe8e2c8, c2: 0x7fcf6a, c3: 0xff9fd0, horns: 2, tail: 'stub', ears: 'point' } },
  cinderpup: { name: 'Cinderpup', evoName: 'Blazehound', evo: 10, el: 'ember', rar: 1, power: 5.5, style: 'melee', art: 'firebreath', desc: 'Loyal, loud, and slightly on fire at all times.', m: { body: 'quad', size: 0.8, c1: 0xd9562e, c2: 0xf2c27a, c3: 0xffd24a, ears: 'point', tail: 'flame' } },
  magmole: { name: 'Magmole', evoName: 'Magmaul', evo: 14, el: 'ember', rar: 2, power: 6.5, style: 'melee', art: 'eruption', desc: 'Tunnels through cooling rock and surfaces angry.', m: { body: 'quad', size: 0.95, wide: 1, c1: 0x4a3230, c2: 0xff6a2a, c3: 0xffb03a, horns: 1, spikes: 1, tail: 'stub' } },
  pyrewing: { name: 'Pyrewing', el: 'ember', rar: 3, power: 7.5, style: 'ranged', art: 'meteor', desc: 'Its shadow leaves scorch marks on the ridge.', m: { body: 'bird', size: 1.1, c1: 0xff8a2a, c2: 0xffe08a, c3: 0xff3a2a, tail: 'flame', crest: 1 } },
  puddlefin: { name: 'Puddlefin', evoName: 'Torrentail', evo: 10, el: 'tide', rar: 1, power: 5, style: 'ranged', art: 'tidalwave', desc: 'Waddles on land, glides in water, spits at strangers.', m: { body: 'biped', size: 0.8, c1: 0x3aa0e8, c2: 0xd8f2ff, c3: 0xffc84a, ears: 'fin', tail: 'fin' } },
  shellgar: { name: 'Shellgar', evoName: 'Bastishell', evo: 14, el: 'tide', rar: 2, power: 6, style: 'melee', art: 'aegis', desc: 'Its pearl shell hums when danger is close.', m: { body: 'quad', size: 0.95, wide: 1, c1: 0x2f7f8a, c2: 0xb8e0c8, c3: 0x7af0e0, shell: 1, tail: 'stub' } },
  mistray: { name: 'Mistray', el: 'tide', rar: 3, power: 7, style: 'ranged', art: 'stillwater', desc: 'Drifts over the mere at dawn like a living cloud.', m: { body: 'bird', size: 1.15, ray: 1, c1: 0x7ad0f0, c2: 0xf0fbff, c3: 0xb0a0ff, tail: 'whip' } },
  voltkit: { name: 'Voltkit', evoName: 'Voltlynx', evo: 10, el: 'storm', rar: 1, power: 5.5, style: 'melee', art: 'chainbolt', desc: 'Too fast to pet. Do not try to pet it.', m: { body: 'quad', size: 0.75, c1: 0xf2d23a, c2: 0xfff6c8, c3: 0x3ad8ff, ears: 'long', tail: 'bolt' } },
  galehawk: { name: 'Galehawk', evoName: 'Tempestalon', evo: 14, el: 'storm', rar: 2, power: 6.5, style: 'ranged', art: 'galeforce', desc: 'Rides the updrafts above Stormreach for days.', m: { body: 'bird', size: 0.95, c1: 0x8fa8c8, c2: 0xf0f4ff, c3: 0xffe14a, tail: 'fan', crest: 1 } },
  thunderam: { name: 'Thunderam', el: 'storm', rar: 3, power: 8, style: 'melee', art: 'thunderfall', desc: 'When it lowers its horns, the sky answers.', m: { body: 'quad', size: 1.2, c1: 0x5a5f7a, c2: 0xe8e8f0, c3: 0xffe14a, horns: 3, mane: 1, tail: 'stub' } },
  duskmoth: { name: 'Duskmoth', evoName: 'Noctuwing', evo: 16, el: 'gloam', rar: 2, power: 6.5, style: 'ranged', art: 'dread', desc: 'Its wing dust carries half-remembered nightmares.', m: { body: 'bird', size: 0.9, moth: 1, c1: 0x5a3f8a, c2: 0xd0b0ff, c3: 0xff6ad0, tail: 'none' } },
  umbrafox: { name: 'Umbrafox', el: 'gloam', rar: 3, power: 8, style: 'melee', art: 'shadowstrike', desc: 'You only see it when it wants to be seen.', m: { body: 'quad', size: 1, c1: 0x2a2440, c2: 0x8a6ad8, c3: 0xc8a0ff, ears: 'point', tail: 'multi' } },
};
export const STARTERS = ['mossling', 'cinderpup', 'puddlefin'];
export const isEvolved = (k) => { const s = KITH[k.species]; return !!s.evo && k.level >= s.evo; };
export const kithName = (k) => { const s = KITH[k.species]; return isEvolved(k) ? s.evoName : s.name; };
export const RARITY = ['', 'Common', 'Uncommon', 'Rare'];

export const ENEMY = {
  husk: { name: 'Husk', hp: 34, dmg: 9, speed: 4.3, radius: 0.55, poise: 12, xp: 1, ai: 'melee', range: 2.3 },
  skitter: { name: 'Skitter', hp: 15, dmg: 6, speed: 7.2, radius: 0.45, poise: 0, xp: 0.6, ai: 'lunge', range: 3.6 },
  spitter: { name: 'Spitter', hp: 24, dmg: 8, speed: 2.8, radius: 0.6, poise: 8, xp: 1, ai: 'ranged', range: 12 },
  brute: { name: 'Brute', hp: 115, dmg: 15, speed: 3.1, radius: 1.05, poise: 60, xp: 3, ai: 'brute', range: 3.2 },
  warder: { name: 'Warder', hp: 70, dmg: 12, speed: 3.3, radius: 0.7, poise: 40, xp: 2.2, ai: 'shield', range: 3.0 },
  wraith: { name: 'Wraith', hp: 55, dmg: 13, speed: 5, radius: 0.6, poise: 22, xp: 2.5, ai: 'blink', range: 3 },
};

export const BOSS = {
  ghorn: { name: 'Ghorn, the Rootwarden', el: 'verdant', hp: 340, dmg: 13, speed: 3.3, radius: 1.5, poise: 180 },
  cindermaw: { name: 'Cindermaw', el: 'ember', hp: 380, dmg: 14, speed: 4.2, radius: 1.9, poise: 200 },
  brine: { name: 'Maressa, the Drowned Cantor', el: 'tide', hp: 350, dmg: 14, speed: 4, radius: 1.1, poise: 160 },
  skarn: { name: 'Skarn, Stormcaller', el: 'storm', hp: 380, dmg: 15, speed: 5.5, radius: 0.9, poise: 170 },
  king: { name: 'The Hollow King', el: 'gloam', hp: 520, dmg: 15, speed: 4.4, radius: 1.3, poise: 240 },
};

export const SKILLS = [
  { id: 'cleave', name: 'Cleave', cost: 1, desc: 'Light, Light, Heavy: a wide spinning cut that breaks guards.' },
  { id: 'dash', name: 'Dash Slash', cost: 1, desc: 'Press Light right after a dodge to strike while dashing.' },
  { id: 'plunge', name: 'Plunge', cost: 1, desc: 'Heavy in mid-air: crash down in a shockwave.' },
  { id: 'flash', name: 'Flash Step', cost: 2, desc: 'Dodge an attack at the last instant to slow time around you.' },
  { id: 'sky', name: 'Skybreaker', cost: 2, desc: 'Light, Light, Light, Heavy: leap up and smash the ground.' },
  { id: 'riposte', name: 'Riposte', cost: 2, desc: 'After a parry, your next hit is a devastating critical.' },
  { id: 'tempo', name: 'Kith Tempo', cost: 2, desc: 'Bond Arts recharge 25% faster.' },
  { id: 'edge', name: 'Elemental Edge', cost: 2, desc: 'Elemental advantage deals even more damage.' },
  { id: 'vamp', name: 'Soul Sip', cost: 3, desc: 'Defeating a foe restores 4% of your health.' },
  { id: 'wind', name: 'Second Wind', cost: 3, desc: 'Once per rest, survive a killing blow with a sliver of health.' },
  { id: 'fury', name: 'Bond Fury', cost: 3, desc: 'The Bond gauge fills 40% faster.' },
  { id: 'master', name: 'Blade Dancer', cost: 4, desc: 'Sword damage +15% and critical chance doubled.' },
];

export const BOONS = [
  { id: 'might', name: 'Might', desc: '+20% sword damage for this descent.' },
  { id: 'vigor', name: 'Vigor', desc: '+30 max health and heal 30.' },
  { id: 'leech', name: 'Leech', desc: 'Each sword hit heals 1.5% of your health.' },
  { id: 'haste', name: 'Haste', desc: '+12% movement speed.' },
  { id: 'tempo', name: 'Tempo', desc: 'Bond Arts recharge 25% faster.' },
  { id: 'keen', name: 'Keen Edge', desc: '+15% critical chance.' },
  { id: 'mend', name: 'Mend', desc: 'Heal 60% of your health now.' },
  { id: 'dew', name: 'Dewfall', desc: 'Refill every Dewdrop.' },
  { id: 'thorns', name: 'Thorns', desc: 'Foes that hit you take heavy damage back.' },
  { id: 'kindred', name: 'Kindred', desc: 'Your Kith deal 40% more damage.' },
];

// ---------- world layout ----------
export const BIOME = {
  meadow: { name: 'Lanternrest Meadow', sub: 'Where the songs still linger', el: 'verdant', g1: 0x58a843, g2: 0x86c85a, rock: 0x9aa398, fog: 0xbfe2f2, skyTop: 0x3f8fe0, skyBot: 0xd4ecf7, sun: 0xfff1d0, amb: 1.0, grass: 0x6fca4f, mood: 'meadow', lvl: [1, 4] },
  ember: { name: 'Emberridge', sub: 'The mountain that never cooled', el: 'ember', g1: 0x4a302c, g2: 0x7c4a34, rock: 0x2e2423, fog: 0xd99a78, skyTop: 0x6a3428, skyBot: 0xf2b074, sun: 0xffc890, amb: 0.9, grass: 0x8a5a34, mood: 'ember', lvl: [6, 9] },
  tide: { name: 'Mirrormere', sub: 'A sky fallen into the reeds', el: 'tide', g1: 0x5fa598, g2: 0xa8d0b4, rock: 0x9aa7a8, fog: 0xbfe0ea, skyTop: 0x4aa0d8, skyBot: 0xe0f4f8, sun: 0xffffff, amb: 1.05, grass: 0x58b8a0, mood: 'tide', lvl: [11, 14] },
  storm: { name: 'Stormreach', sub: 'Stone stairs to the thunder', el: 'storm', g1: 0x6f7c8c, g2: 0x98a6b4, rock: 0x565d6a, fog: 0x8d9bb0, skyTop: 0x35425a, skyBot: 0xa3b3c6, sun: 0xdfe8ff, amb: 0.85, grass: 0x8fa0a8, mood: 'storm', lvl: [16, 19] },
  gloam: { name: 'Gloamwood', sub: 'The Hush is loudest here', el: 'gloam', g1: 0x2c2748, g2: 0x453a70, rock: 0x25213a, fog: 0x32264e, skyTop: 0x140d28, skyBot: 0x503a78, sun: 0xb8a0ff, amb: 0.8, grass: 0x6a4ab0, mood: 'gloam', lvl: [21, 25] },
};
export const ORDER = ['meadow', 'ember', 'tide', 'storm', 'gloam'];
export const PASS = { ember: { x: 128, z: 0, ax: 'x' }, tide: { x: 0, z: 128, ax: 'z' }, storm: { x: 0, z: -128, ax: 'z' }, gloam: { x: -128, z: 0, ax: 'x' } };

export const WAYSTONES = [
  { id: 'village', name: 'Lanternrest', x: 9, z: -12 },
  { id: 'ember', name: 'Emberridge Gate', x: 160, z: 7 },
  { id: 'tide', name: 'Mirrormere Shore', x: -7, z: 160 },
  { id: 'storm', name: 'Stormreach Stair', x: 7, z: -160 },
  { id: 'gloam', name: 'Gloamwood Edge', x: -160, z: -7 },
];

const C = (x, z, lvl, list) => ({ x, z, lvl, list });
export const CAMPS = [
  C(55, 48, 1, ['husk', 'husk', 'skitter']), C(-45, 78, 2, ['husk', 'skitter', 'skitter', 'spitter']),
  C(82, -42, 3, ['husk', 'husk', 'spitter', 'skitter', 'skitter']), C(-92, -14, 3, ['husk', 'husk', 'spitter', 'spitter']),
  C(195, 58, 6, ['husk', 'husk', 'husk', 'spitter']), C(228, -12, 7, ['brute', 'skitter', 'skitter', 'skitter']),
  C(268, 88, 8, ['husk', 'husk', 'spitter', 'spitter', 'brute']), C(215, -110, 8, ['E:husk', 'skitter', 'skitter', 'skitter', 'skitter']),
  C(-58, 198, 11, ['husk', 'husk', 'warder', 'spitter']), C(12, 232, 12, ['warder', 'warder', 'spitter', 'spitter']),
  C(-92, 268, 13, ['brute', 'warder', 'husk', 'husk']), C(110, 215, 13, ['E:spitter', 'skitter', 'skitter', 'skitter', 'skitter']),
  C(58, -198, 16, ['wraith', 'skitter', 'skitter', 'skitter']), C(-12, -232, 17, ['warder', 'warder', 'wraith']),
  C(92, -268, 18, ['brute', 'brute', 'spitter', 'spitter']), C(-110, -215, 18, ['E:wraith', 'husk', 'husk', 'husk']),
  C(-198, -58, 21, ['wraith', 'wraith', 'husk', 'husk']), C(-232, 12, 22, ['brute', 'warder', 'warder', 'spitter']),
  C(-268, -92, 23, ['E:brute', 'wraith', 'wraith']), C(-215, 110, 24, ['E:warder', 'wraith', 'skitter', 'skitter', 'skitter', 'skitter']),
];
export const KZONES = [
  { x: 40, z: -70 }, { x: 10, z: 95 }, { x: -95, z: 34 },
  { x: 188, z: -58 }, { x: 252, z: 38 }, { x: 62, z: 192 }, { x: -38, z: 248 },
  { x: -62, z: -192 }, { x: 38, z: -248 }, { x: -188, z: 62 }, { x: -252, z: -38 },
];
export const KTABLE = {
  meadow: [['mossling', 50], ['voltkit', 22], ['thornback', 20], ['bloomstag', 8]],
  ember: [['cinderpup', 48], ['magmole', 34], ['thornback', 8], ['pyrewing', 10]],
  tide: [['puddlefin', 48], ['shellgar', 34], ['mossling', 8], ['mistray', 10]],
  storm: [['voltkit', 40], ['galehawk', 42], ['thunderam', 10], ['cinderpup', 8]],
  gloam: [['duskmoth', 53], ['umbrafox', 12], ['shellgar', 10], ['magmole', 10], ['galehawk', 15]],
};
export const RIFTS = [
  { id: 'r0', x: 98, z: 38 }, { id: 'r1', x: 272, z: -130 }, { id: 'r2', x: -130, z: 272 }, { id: 'r3', x: 130, z: -272 }, { id: 'r4', x: -272, z: 130 },
];

const W = (...a) => a;
export const SHRINES = {
  roots: { id: 'roots', name: 'Shrine of Roots', biome: 'meadow', el: 'verdant', level: 3, x: -62, z: -66, boss: 'ghorn', relic: 'Heart of Root', relicDesc: 'A third Kith may now walk beside you.',
    rooms: [{ t: 'combat', waves: [W('husk', 'husk', 'skitter'), W('husk', 'spitter', 'skitter', 'skitter')] }, { t: 'gauntlet' }, { t: 'combat', waves: [W('spitter', 'spitter', 'husk', 'husk'), W('brute')] }, { t: 'fount' }, { t: 'boss' }] },
  cinders: { id: 'cinders', name: 'Shrine of Cinders', biome: 'ember', el: 'ember', level: 8, x: 258, z: -58, boss: 'cindermaw', relic: 'Ember Sigil', relicDesc: 'Unison Burst: when the Bond gauge is full, unleash it.',
    rooms: [{ t: 'combat', waves: [W('husk', 'husk', 'husk', 'spitter'), W('brute', 'skitter', 'skitter', 'skitter')] }, { t: 'gauntlet' }, { t: 'combat', waves: [W('spitter', 'spitter', 'skitter', 'skitter', 'skitter'), W('brute', 'husk', 'husk'), W('E:husk', 'spitter')] }, { t: 'fount' }, { t: 'boss' }] },
  tides: { id: 'tides', name: 'Shrine of Tides', biome: 'tide', el: 'tide', level: 13, x: 58, z: 258, boss: 'brine', relic: 'Tidewalker Pearl', relicDesc: 'Leap a second time in mid-air.',
    rooms: [{ t: 'combat', waves: [W('warder', 'husk', 'husk'), W('warder', 'spitter', 'spitter', 'skitter', 'skitter')] }, { t: 'gauntlet' }, { t: 'combat', waves: [W('brute', 'spitter', 'spitter'), W('warder', 'warder', 'husk', 'husk'), W('E:brute')] }, { t: 'gauntlet' }, { t: 'fount' }, { t: 'boss' }] },
  gales: { id: 'gales', name: 'Shrine of Gales', biome: 'storm', el: 'storm', level: 18, x: -58, z: -258, boss: 'skarn', relic: 'Stormstride Feather', relicDesc: 'Your dodge becomes a bolt of lightning that wounds foes you pass through.',
    rooms: [{ t: 'combat', waves: [W('wraith', 'skitter', 'skitter', 'skitter'), W('warder', 'wraith', 'spitter')] }, { t: 'gauntlet' }, { t: 'combat', waves: [W('brute', 'wraith'), W('warder', 'warder', 'spitter', 'spitter'), W('E:wraith', 'skitter', 'skitter', 'skitter')] }, { t: 'gauntlet' }, { t: 'fount' }, { t: 'boss' }] },
  hollow: { id: 'hollow', name: 'The Hollow Court', biome: 'gloam', el: 'gloam', level: 23, x: -258, z: 58, boss: 'king', relic: 'The Hollow Crown', relicDesc: 'The Hush is broken. Song returns to Vael.',
    rooms: [{ t: 'combat', waves: [W('wraith', 'wraith', 'husk', 'husk'), W('brute', 'warder', 'spitter')] }, { t: 'gauntlet' }, { t: 'combat', waves: [W('E:warder', 'wraith'), W('brute', 'brute', 'spitter', 'spitter')] }, { t: 'gauntlet' }, { t: 'combat', waves: [W('wraith', 'wraith', 'wraith'), W('E:brute', 'warder', 'warder'), W('E:wraith', 'E:husk')] }, { t: 'fount' }, { t: 'boss' }] },
};
export const SHRINE_ORDER = ['roots', 'cinders', 'tides', 'gales', 'hollow'];
// which shrine must be restored for each pass to open
export const VEIL_REQ = { ember: 'roots', tide: 'cinders', storm: 'tides', gloam: 'gales' };

export const NPCS = [
  { id: 'elder', name: 'Elder Maren', x: 4.5, z: 6.5, look: { body: 0x6a4a8a, head: 0xe8c8a8, limb: 0x5a3f78, accent: 0xffd98a, hood: 0x4a3368 } },
  { id: 'smith', name: 'Brannoc the Smith', x: -15, z: -5, look: { body: 0x7a4a2a, head: 0xc89a78, limb: 0x8a5a3a, accent: 0x3a3340 } },
  { id: 'merchant', name: 'Pip', x: 13, z: 9, look: { body: 0x3a8a7a, head: 0xf0d0b0, limb: 0x2f6f62, accent: 0xffd24a, hood: 0xd0562e } },
  { id: 'keeper', name: 'Keeper Oona', x: -6, z: 15, look: { body: 0x5a9a4a, head: 0xd8b090, limb: 0x4a7a3a, accent: 0xffffff } },
];

// The story is planned in STORY.md. G.save.quest is the chapter: 0 before choosing a Kith,
// 1 Shrine of Roots, 2 Cinders, 3 Tides, 4 Gales, 5 the Hollow Court, 6 after the ending.
export const QUESTS = [
  { text: 'The last lantern on the Lantern Tree is fading. Find Elder Maren beneath it.', at: [4.5, 6.5] },
  { text: 'Wake Ghorn, the Rootwarden, in the Shrine of Roots to the northwest.', at: [-62, -66] },
  { text: 'Take the east pass to Emberridge. Free the beast in the Shrine of Cinders.', at: [258, -58] },
  { text: 'Take the south pass to Mirrormere. Wake the drowned Cantor in the Shrine of Tides.', at: [58, 258] },
  { text: 'Climb the north pass to Stormreach. Face Skarn in the Shrine of Gales.', at: [-58, -258] },
  { text: 'Cross Gloamwood by the west pass. End the Hush at the Hollow Court.', at: [-258, 58] },
  { text: 'Vael sings again. Bond with every Kith, and see how deep the old well goes.', at: [-16, 12] },
];

export const TALK = {
  intro: [
    ['', 'Once, every stone and stream in Vael had a song, and every song remembered something.'],
    ['', 'Then the Hollow King put on a crown that makes the world forget, and the Hush fell.'],
    ['', 'Sixteen years have passed. Only the Kith still remember the old songs.'],
    ['', 'Tonight, the last lantern on the Lantern Tree is growing dim.'],
  ],
  elder0: [
    ['Elder Maren', 'Wren. You felt it too, then. The last lantern is going out.'],
    ['Elder Maren', 'Five shrines once kept the songs of Vael. When the Hush came, their keepers forgot themselves. Now they guard the silence instead.'],
    ['Elder Maren', 'I am too old to wake them. But look: three young Kith came to the Tree tonight. No Kith has come here in sixteen years.'],
    ['Elder Maren', 'They came for you, I think. Choose the one whose song answers yours.'],
  ],
  elder1: [
    ['Elder Maren', 'There. You hear nothing, I know. But it does. Kith hear the song that you cannot.'],
    ['Elder Maren', 'Your blade takes on the element of the Kith beside you. Ember burns Verdant, Verdant grounds Storm, Storm shocks Tide, and Tide douses Ember.'],
    ['Elder Maren', 'Wild Kith roam the meadow. Weaken one, then offer it a Bond Thread, and it may choose to join you. Pip sells the threads.'],
    ['Elder Maren', 'The Shrine of Roots lies northwest, past the old stones. Its keeper is Ghorn. He tended this very Tree, once. Be gentle with him, if you can.'],
    ['Elder Maren', 'Rest at Waystones when you are weary. Go well, Wren.'],
  ],
  well0: [['', 'A dry well. Cold air breathes up from somewhere far below. It is sealed with a rune of flame.']],
  well1: [
    ['', 'The flame rune on the well has cracked open. Silence breathes up from below, colder than any night.'],
    ['', 'This is the Undersong, the silence beneath Vael, where the Hush was born. They say it has no bottom.'],
  ],
};

// Carved over each shrine door, read the first time you enter. Each one hints at the element to bring.
export const DOORS = {
  roots: 'Words are carved into the living wood above the door: "Ember wakes what roots forget."',
  cinders: 'Words are cut into the cooled lava above the door: "The tide cools what the fire holds too long."',
  tides: 'Words shimmer on the wet stone above the door: "Thunder wakes the stillest water."',
  gales: 'Words are scored deep into the stone above the door: "Roots hold where the wind would scatter."',
  hollow: 'Every word above this door has been scratched away but one line: "Bring the ones you love."',
};

// Shown under the guardian's name when the boss fight starts.
export const BOSS_INTRO = {
  ghorn: '"Hush now, little one. Sleep, like all the others."',
  cindermaw: 'It looks past you, toward Lanternrest. It is still waiting for someone.',
  brine: 'She sings, and there is no sound at all.',
  skarn: '"Show me you are worth hurting him for."',
  king: '"Why would anyone want to remember?"',
};

// Said when a shrine's guardian is freed for the first time, before the relic.
export const FREED = {
  roots: [
    ['', 'The great roots go still. The giant blinks, slowly, like someone waking from a very long sleep.'],
    ['Ghorn', 'The roots... I remember the roots. And the Tree. And her.'],
    ['Ghorn', 'Tell Maren the Tree remembers her. Tell her it was never her fault.'],
  ],
  cinders: [
    ['', 'The fire drains out of the beast. It shrinks and cools until a small forge-Kith stands blinking in the ash.'],
    ['', 'Kiln, the keeper of Cinders, turns toward Lanternrest, toward Brannoc, and lets out a long, low hum.'],
  ],
  tides: [
    ['Maressa', 'You found me. And you found my voice, down here in the dark where I hid it.'],
    ['Maressa', 'Here. Let me give it back to Vael.'],
    ['', 'She sings a single verse. And for the first time in your life, you hear it: the song.'],
  ],
  gales: [
    ['Skarn', 'Good. You are worth it.'],
    ['Skarn', 'He was not always like this, child. He was the kindest of us. When you reach him, remind him.'],
    ['', 'Skarn lowers his spear and steps aside. The north wind falls quiet.'],
  ],
  hollow: [
    ['', 'The Hollow Crown cracks.'],
    ['', 'From the shadows at the edge of the court, a black fox steps into the light.'],
    ['The Hollow King', 'Lumen?'],
    ['', 'The fox presses its head against his hand, the way your Kith did on the night you met.'],
    ['Aurel', 'I wanted to stop missing you. So I made the whole world forget, and I forgot myself with it.'],
    ['Aurel', 'Tell Maren... no. I will tell her myself, in the song.'],
    ['', 'He sets the crown down. He and Lumen fade into the light together.'],
    ['', 'And then you hear it. All of it. Every stone and stream in Vael, singing.'],
    ['', 'It sounds like something you have always known. As if you had been part of it all along.'],
  ],
};

// After the relic: what opens next.
export const OPENS = {
  roots: 'To the east, the veil of Hush over the mountain pass tears open. In Lanternrest, lanterns kindle on the Tree.',
  cinders: 'To the south, the veil over the Mirrormere pass tears open. In Lanternrest, the flame rune on the old well cracks.',
  tides: 'To the north, the veil over the Stormreach stair tears open. More lanterns kindle on the Tree.',
  gales: 'To the west, the veil over Gloamwood tears open. Only one lantern on the Tree is still dark.',
};

// Echo Shards are memories from before the Hush (STORY.md, section 9). Each region's shards tell
// one keeper's side, in order, whichever shard the player happens to find first. Finding all 16
// adds LULLABY. The first line of each memory is narration.
const mem = (title, ...lines) => ({ title, lines });
export const MEMORIES = {
  meadow: [
    mem('The Lesson',
      ['', 'Sunlight, and a song you have never heard. Under the Lantern Tree, a young woman with a stern face is teaching a boy to hold a wooden sword.'],
      ['Maren', 'Again, Aurel. Lower. You swing like you are apologising to the air.'],
      ['', 'A small black fox pounces on the practice sword and runs off with it. The boy laughs until he cannot breathe.'],
      ['Aurel', 'Lumen! Maren, it is not my fault. He is a Kith of very strong opinions.']),
    mem('The Last Festival',
      ['', 'Lanterns on every branch. All five keepers of the Choir are here, and the whole valley is singing along.'],
      ['Brannoc', 'Kiln, put the drum down. Kiln. That is not a drum, that is the mayor.'],
      ['', 'Maressa sings the last verse alone. Skarn, who never cries, insists there is something in his eye.'],
      ['Maren', 'Remember this, all of you. Whatever comes.']),
    mem('The Long Note',
      ['', 'Night. The ground shakes, and from deep below comes a sound like a held breath that will not end.'],
      ['Aurel', 'Something is wrong down there. The Undersong is waking. Lumen, stay with me. Lumen!'],
      ['', 'The black fox looks back at him once. Then it runs into the dark, toward the sound, and the sound goes quiet.']),
    mem('Among the Roots',
      ['', 'The same night. For the first time in its history, the valley is completely silent.'],
      ['', 'Maren kneels among the roots of the Lantern Tree. A baby lies there, wrapped in nothing but light, humming one soft note.'],
      ['Maren', 'Hello, little one. Where did you come from? No. Never mind. You are safe now.']),
  ],
  ember: [
    mem('The Forge',
      ['', 'Heat and hammer-song. A young Brannoc works the bellows while a round, glowing Kith breathes on the coals to keep them bright.'],
      ['Brannoc', 'Hotter, Kiln. There. Hear that ring? That is a blade that will never break.'],
      ['', 'Kiln hums with pride, and the whole mountain hums with it.']),
    mem('The Night Brannoc Ran',
      ['', 'The Hush rolls up the mountain like fog. Wherever it touches, the songs go out like candles.'],
      ['Brannoc', 'Kiln, come on! Leave the forge, there is no time!'],
      ['', 'Kiln will not leave the fire. It has kept it lit for a hundred years. Brannoc runs, and tells himself he will come back.']),
    mem('Kiln Waits',
      ['', 'Days. Weeks. Years. The forge never goes out.'],
      ['', 'Every evening, Kiln looks down the mountain path toward Lanternrest. The Hush grows thicker, and Kiln grows bigger, hotter, angrier.'],
      ['', 'It forgets its own name. It never forgets to wait.']),
  ],
  tide: [
    mem('The Cantor',
      ['', 'A summer evening on the mere. A woman stands on the water itself, singing, and every reed and ripple sings back to her.'],
      ['Maressa', 'Every song is a memory, Aurel. Someone, somewhere, kept it so it would not be lost. That is all singing is.']),
    mem('Stop Singing',
      ['', 'After the Long Note. Aurel stands at the edge of the mere, thin and grey, holding something dark in his hands.'],
      ['Aurel', 'Please stop, Maressa. Every song in this valley sings his name. I cannot bear it.'],
      ['Maressa', 'Then let it hurt. That is what it means to have loved him.']),
    mem('Into the Water',
      ['', 'The crown is on his head now. The Hush pours across the mere, and the reeds fall silent one by one.'],
      ['', 'Maressa gathers up her voice, the last song left, and walks down into the water so the crown cannot take it.'],
      ['Maressa', 'Someone will come looking for it. I will keep it safe until then.']),
  ],
  storm: [
    mem('Two Boys on the Stair',
      ['', 'Two boys race up the thousand steps of Stormreach in the rain. One of them has a black fox riding on his shoulders.'],
      ['Skarn', 'I won!'],
      ['Aurel', 'Lumen was carrying me. That does not count.'],
      ['Skarn', 'Fine. Then I swear it: wherever you go, I go first. Shield of the Blade, forever.']),
    mem('The Oath',
      ['', 'Years later. Skarn kneels before the Choir with a spear across his knees and lightning in his hair.'],
      ['Skarn', 'I am the Stormcaller, keeper of Gales, and the Blade\'s shield. I will stand beside Aurel until the sky falls.'],
      ['', 'Aurel, mortified, tries to make him stand up. Skarn refuses for nearly an hour.']),
    mem('Take It Off',
      ['', 'The Hollow Court, the night the Hush fell. Aurel sits on a throne of black wood and does not look up.'],
      ['Skarn', 'Take it off, Aurel. Please. This is not what Lumen would want.'],
      ['Aurel', 'You swore to stand beside me, Skarn. So stand.'],
      ['', 'And Skarn, who has never broken a promise in his life, stands.']),
  ],
  gloam: [
    mem('Into the Dark',
      ['', 'A darkness that sings backwards. A small black fox runs through it, toward a sound that is swallowing the world.'],
      ['', 'Lumen cannot stop the Long Note. So Lumen becomes the part of it that holds still, so the rest of the world can go on singing.'],
      ['', 'Far above, a boy is calling its name. It cannot answer. Not yet.']),
    mem('The Bottom of the World',
      ['', 'Aurel walks the Undersong, where the silence lives, looking for Lumen. He does not find him.'],
      ['', 'What he finds instead is a crown, black and light as ash, resting on nothing.'],
      ['Aurel', 'If I cannot have him back, then let me stop hearing him.']),
    mem('The Crown',
      ['', 'He puts it on.'],
      ['', 'The song of Vael stops, all at once, from the mountains to the mere. In the silence, Aurel finally sleeps.'],
      ['', 'At the edge of the Gloam, a black fox opens its eyes and starts walking home.']),
  ],
};
export const LULLABY = mem('Lullaby',
  ['', 'Lanternrest, a few days after the Hush. No birdsong, no wind in the leaves. Nothing.'],
  ['', 'Maren sits under the Lantern Tree with the baby in her arms and sings, very quietly, the only song she has left.'],
  ['Maren', 'You will not remember this, little one. But someone should hear it. Someone should keep it.'],
  ['', 'The baby hums the last note back to her, perfectly. Maren laughs for the first time in days. Above them, one lantern flickers into light.']);
// a memory as dialogue: its title rides on the first line
export const memoryLines = (m) => m.lines.map((l, i) => (i === 0 ? ['Memory: ' + m.title, l[1]] : l));

// What the villagers say, chapter by chapter (indexed like G.save.quest). `first` is said once per
// chapter; Brannoc, Pip and Oona then open their menus, and Maren repeats her `again` line.
const ch = (first, again) => ({ first, again });
const maren = (t) => ['Elder Maren', t], bran = (t) => ['Brannoc', t], pip = (t) => ['Pip', t], oona = (t) => ['Keeper Oona', t];
export const CHAT = {
  elder: [
    null,
    ch(null, [maren('Northwest, past the old stones, to the Shrine of Roots. Ghorn\'s roots fear fire, if any of your Kith can burn.'), maren('When you grow stronger, open the menu and spend your Skill Sigils. A blade can learn new songs too.')]),
    ch([maren('Lanterns have lit themselves on the Tree. Ghorn is free, then.'), maren('He said the Tree remembers me? That old root. I would rather it forgot a few things.'), maren('The east pass is open. Beyond it lie Emberridge and the Shrine of Cinders. Brannoc knows that mountain better than anyone, though he will not say so.')],
      [maren('East, to Emberridge. Ask Brannoc about the mountain, and be patient if he will not answer.')]),
    ch([maren('More of the lanterns are burning now. And Brannoc is singing at his forge. Badly, but singing.'), maren('The south pass leads to Mirrormere. Maressa sleeps beneath the mere: the Cantor. Hers was the loveliest voice in Vael.'), maren('Still water fears the storm. Something that crackles would serve you well there.')],
      [maren('South, to Mirrormere. Bring something that crackles.')]),
    ch([maren('Maressa sang for you? Then you have heard it at last, a little.'), maren('There is something I should have told you at the start. The Hollow King has a name. Aurel. He was my student.'), maren('He was the Blade of the Kith before you. A kind boy, with an Umbrafox called Lumen who never left his side. When Lumen was lost, Aurel could not bear the songs that remembered him.'), maren('Skarn guards the Shrine of Gales, up the north stair. He was Aurel\'s oldest friend. Wind scatters, but roots hold: bring your meadow Kith.')],
      [maren('North, to Stormreach. Skarn will not go easy on you. Roots hold where the wind would scatter.')]),
    ch([maren('Only one lantern left dark.'), maren('The west pass is open, and the Hollow Court lies beyond Gloamwood. Nothing there is weak to anything, child. Bring the Kith you trust most.'), maren('If you see Aurel, tell him I am sorry. Tell him Lumen would never have wanted this.')],
      [maren('West, through Gloamwood, to the Hollow Court. Bring the Kith you trust most.')]),
    ch([maren('Listen. The whole valley is singing. You can hear it now, can\'t you?'), maren('I found you among the roots of this Tree the night the Hush fell, wrapped in nothing but light. I think the song hid its last note in you, where the crown could not reach.'), maren('If you still hunger for a fight, the old well goes deeper than anyone knows. And there are Kith out there you have never met.')],
      [maren('The well goes very deep. And there are Kith out there you have never met.')]),
  ],
  smith: [
    null,
    ch([bran('Maren\'s foundling. Wren, is it? That blade of yours is thirsty.'), bran('Light strikes chain together. Hold a heavy strike to drive the point home: it breaks a guard. And dodge through a blow, never back away from it.'), bran('Bring me Motes and I will put an edge on that blade you can hear.')]),
    ch([bran('Emberridge. Of course it is Emberridge next.'), bran('I was keeper of the Shrine of Cinders, once. Kiln was my Kith. Best forge partner a smith ever had.'), bran('When the Hush came, I ran. Kiln stayed, and waited at the forge for me. I hear it is something else now.'), bran('The beasts up there hit too hard to trade blows with. Tap your guard just as a blow lands and you will turn it aside. Then make them pay.'), bran('And tide douses ember. If you have a water Kith, bring it.')]),
    ch([bran('You brought Kiln home. It remembered me, at the end. It remembered.'), bran('I will not forget that. Not ever.'), bran('Mirrormere next. The shield-bearers there block anything from the front. Hit them hard enough to break the guard, or get behind them.')]),
    ch([bran('Skarn. I sparred with him when we were young. He fights the way the wind changes: you only see it after.'), bran('If you have the Sigils, learn Flash Step. Dodge at the very last instant and the world slows down for you.'), bran('Some fighters parry and punish. Some dance. Some let their Kith carry the fight. Find out which one you are.')]),
    ch([bran('Gloamwood. I will make your blade as sharp as I can. That is all I can give you now.')]),
    ch([bran('Hear that? Kiln is humming at the forge again. Bring me Motes and I will make that blade sing back.')]),
  ],
  merchant: [
    null,
    ch([pip('Threads for binding, friend! Spun fresh this morning. Mostly fresh.'), pip('A Bond Thread is how you ask a Kith to stay. Tire it out first, mind. Nobody listens to an offer while they are winning.')]),
    ch([pip('Emberridge, is it? Hot, rocky, everything on fire. Terrible for business. Take extra Threads.'), pip('Word is the big brutes up there swing slow and hit like falling houses. Old Brannoc could tell you more, if he felt like talking. He never does.')]),
    ch([pip('Mirrormere! I used to sell there. Turns out nobody buys from a merchant with no reflection.'), pip('Storm Kith crackle across water like nobody\'s business. Voltkits run all over the meadow, if you can catch one.')]),
    ch([pip('Stormreach. Hold on to your hat. Hold on to my Threads, too: no refunds.'), pip('The wind spirits up there blink right past you. Keep your eyes on them or lose them. Meadow folk swear by roots against wind.')]),
    ch([pip('Gloamwood? Nobody comes back from Gloamwood with Threads left. Which is to say: buy lots.'), pip('Some say there is a black fox in there that is not a Kith at all, but a memory. Some say a lot of things. I say: buy Threads.')]),
    ch([pip('Business is booming! Everyone wants Threads now the Kith are singing. The rarest ones live deepest, mind.')]),
  ],
  keeper: [
    null,
    ch([oona('Your Kith are welcome in my grove. Any you bond with but cannot carry will wait here, safe.'), oona('A wild Kith will only hear a Bond Rite once it is tired, below half its strength. The weaker it is, the easier the song is to match. Mind your timing on the ring.'), oona('And Ghorn\'s roots fear fire, little one. If none of your Kith can burn, keep moving and stay out of his reach.')]),
    ch([oona('Three may walk with you now. Choose them like a song: one to hit hard, one to keep you standing, and one for whatever lies ahead.'), oona('Kith grow into new shapes when they are ready. Mosslings, Cinderpups, Puddlefins and Voltkits around level ten. Others take longer.')]),
    ch([oona('Water is patient, but lightning is not. A storm Kith will serve you at the mere.')]),
    ch([oona('Your meadow friends will have grown by now. Roots hold fast against the wind, and Skarn\'s storms will break on them.')]),
    ch([oona('In Gloamwood nothing has a weakness, and nothing is safe. Take the three you trust most. That is all a bond really is.')]),
    ch([oona('The Kith are singing in every corner of Vael. Even the shy ones. Even the one in Gloamwood that only shows itself when it wants to.')]),
  ],
};

export const TIPS = {
  move: 'Move with the left stick. Turn the camera with the right stick.',
  fight: 'Light attack chains into a four-hit combo. Hold Heavy to charge a thrust.',
  dodge: 'Dodge through attacks. Guard just before a blow lands to parry it.',
  lock: 'Lock on to a foe to circle it. Your blade shares your Kith\'s element.',
  kith: 'Wild Kith! Weaken it below half health, then begin a Bond Rite.',
  art: 'Your Kith\'s Bond Art is ready. Unleash it in battle.',
  way: 'Waystones heal you, refill Dewdrops, and let you travel between them.',
};
