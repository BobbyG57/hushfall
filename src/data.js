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
  { id: 'elder', name: 'Elder Maren', x: 3, z: -6, look: { body: 0x6a4a8a, head: 0xe8c8a8, limb: 0x5a3f78, accent: 0xffd98a, hood: 0x4a3368 } },
  { id: 'smith', name: 'Brannoc the Smith', x: -15, z: -5, look: { body: 0x7a4a2a, head: 0xc89a78, limb: 0x8a5a3a, accent: 0x3a3340 } },
  { id: 'merchant', name: 'Pip', x: 13, z: 9, look: { body: 0x3a8a7a, head: 0xf0d0b0, limb: 0x2f6f62, accent: 0xffd24a, hood: 0xd0562e } },
  { id: 'keeper', name: 'Keeper Oona', x: -6, z: 15, look: { body: 0x5a9a4a, head: 0xd8b090, limb: 0x4a7a3a, accent: 0xffffff } },
];

export const QUESTS = [
  { text: 'Speak with Elder Maren beneath the Lantern Tree.', at: [3, -6] },
  { text: 'Restore the Shrine of Roots, northwest across the meadow.', at: [-62, -66] },
  { text: 'Take the east pass to Emberridge and restore the Shrine of Cinders.', at: [258, -58] },
  { text: 'Take the south pass to Mirrormere and restore the Shrine of Tides.', at: [58, 258] },
  { text: 'Climb the north pass to Stormreach and restore the Shrine of Gales.', at: [-58, -258] },
  { text: 'Enter Gloamwood through the west pass. End the Hush at the Hollow Court.', at: [-258, 58] },
  { text: 'Vael sings again. Descend the Abyss beneath the village well, and bond with every Kith.', at: [-16, 12] },
];

export const TALK = {
  intro: [
    ['', 'Once, every stone and stream in Vael had a song.'],
    ['', 'Then the Hollow King took the crown of silence, and the Hush fell over the land.'],
    ['', 'Only the Kith still remember the old songs. And only a Blade of the Kith can carry them back.'],
  ],
  elder0: [
    ['Elder Maren', 'You are awake, Wren. Good. The Hush crept closer while you slept.'],
    ['Elder Maren', 'Five shrines once held the songs of Vael. Each now sits silent, guarded by something that was once its keeper.'],
    ['Elder Maren', 'You cannot walk that road alone. Three young Kith have come to the Lantern Tree. Choose the one whose song answers yours.'],
  ],
  elder1: [
    ['Elder Maren', 'A fine bond. Your blade will take on your Kith\'s element, so choose who walks beside you with care.'],
    ['Elder Maren', 'The Shrine of Roots lies northwest, past the old stones. Wild Kith roam the meadow: weaken one, then offer it a Bond Thread.'],
    ['Elder Maren', 'Rest at Waystones when you are weary. Go well, Blade of the Kith.'],
  ],
  elderMid: [['Elder Maren', 'I can hear it, faintly. A song returning. Keep going, child. The passes will open as the shrines wake.']],
  elderEnd: [['Elder Maren', 'Listen. The whole valley is singing. If you still hunger for a fight, the old well leads somewhere very deep.']],
  smith: [['Brannoc', 'Blade looks thirsty. Bring me Motes and I will put an edge on it you can hear.']],
  merchant: [['Pip', 'Threads for binding, friend! Spun fresh this morning. Mostly fresh.']],
  keeper: [['Keeper Oona', 'Your Kith are welcome in my grove. Tell me who should walk with you.']],
  well0: [['', 'A dry well. Cold air breathes up from somewhere far below. It is sealed with a rune of flame.']],
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
