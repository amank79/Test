// Game data: types, moves, species, items. Creatures are original "Pokémon-style" monsters.
const TYPES = ['Normal', 'Fire', 'Water', 'Grass', 'Electric', 'Rock', 'Flying', 'Bug'];

const TYPE_COLORS = {
  Normal: '#a8a878', Fire: '#f08030', Water: '#6890f0', Grass: '#78c850',
  Electric: '#f8d030', Rock: '#b8a038', Flying: '#a890f0', Bug: '#a8b820'
};

// TYPE_CHART[attacker][defender] = multiplier (missing = 1)
const TYPE_CHART = {
  Normal: { Rock: 0.5 },
  Fire: { Grass: 2, Bug: 2, Fire: 0.5, Water: 0.5, Rock: 0.5 },
  Water: { Fire: 2, Rock: 2, Water: 0.5, Grass: 0.5 },
  Grass: { Water: 2, Rock: 2, Fire: 0.5, Grass: 0.5, Flying: 0.5, Bug: 0.5 },
  Electric: { Water: 2, Flying: 2, Grass: 0.5, Electric: 0.5, Rock: 0 },
  Rock: { Fire: 2, Flying: 2, Bug: 2 },
  Flying: { Grass: 2, Bug: 2, Rock: 0.5, Electric: 0.5 },
  Bug: { Grass: 2, Fire: 0.5, Flying: 0.5 }
};

function typeMultiplier(moveType, defTypes) {
  return defTypes.reduce((m, t) => m * ((TYPE_CHART[moveType] || {})[t] ?? 1), 1);
}

// kind: 'phys' | 'spec' | 'status'. effect for status moves.
const MOVES = {
  tackle:     { name: 'Tackle',      type: 'Normal',   power: 40, acc: 100, pp: 35, kind: 'phys' },
  scratch:    { name: 'Scratch',     type: 'Normal',   power: 40, acc: 100, pp: 35, kind: 'phys' },
  quickhit:   { name: 'Quick Hit',   type: 'Normal',   power: 40, acc: 100, pp: 30, kind: 'phys', priority: 1 },
  slam:       { name: 'Body Slam',   type: 'Normal',   power: 80, acc: 90,  pp: 15, kind: 'phys' },
  growl:      { name: 'Growl',       type: 'Normal',   power: 0,  acc: 100, pp: 40, kind: 'status', effect: { target: 'foe', stat: 'atk', stages: -1 } },
  harden:     { name: 'Harden',      type: 'Normal',   power: 0,  acc: 100, pp: 30, kind: 'status', effect: { target: 'self', stat: 'def', stages: 1 } },
  ember:      { name: 'Ember',       type: 'Fire',     power: 40, acc: 100, pp: 25, kind: 'spec' },
  flamewheel: { name: 'Flame Wheel', type: 'Fire',     power: 65, acc: 100, pp: 20, kind: 'phys' },
  inferno:    { name: 'Inferno',     type: 'Fire',     power: 95, acc: 90,  pp: 10, kind: 'spec' },
  bubble:     { name: 'Bubble',      type: 'Water',    power: 40, acc: 100, pp: 30, kind: 'spec' },
  aquajet:    { name: 'Aqua Jet',    type: 'Water',    power: 50, acc: 100, pp: 20, kind: 'phys', priority: 1 },
  tidalwave:  { name: 'Tidal Wave',  type: 'Water',    power: 95, acc: 90,  pp: 10, kind: 'spec' },
  vinelash:   { name: 'Vine Lash',   type: 'Grass',    power: 45, acc: 100, pp: 25, kind: 'phys' },
  leafstorm:  { name: 'Leaf Blade',  type: 'Grass',    power: 70, acc: 100, pp: 15, kind: 'phys' },
  solarbeam:  { name: 'Sun Beam',    type: 'Grass',    power: 95, acc: 90,  pp: 10, kind: 'spec' },
  spark:      { name: 'Spark',       type: 'Electric', power: 45, acc: 100, pp: 25, kind: 'spec' },
  voltbolt:   { name: 'Volt Bolt',   type: 'Electric', power: 90, acc: 95,  pp: 12, kind: 'spec' },
  rockthrow:  { name: 'Rock Throw',  type: 'Rock',     power: 50, acc: 90,  pp: 15, kind: 'phys' },
  rockslide:  { name: 'Rock Slide',  type: 'Rock',     power: 80, acc: 90,  pp: 10, kind: 'phys' },
  gust:       { name: 'Gust',        type: 'Flying',   power: 40, acc: 100, pp: 35, kind: 'spec' },
  wingslash:  { name: 'Wing Slash',  type: 'Flying',   power: 70, acc: 100, pp: 15, kind: 'phys' },
  bugbite:    { name: 'Bug Bite',    type: 'Bug',      power: 60, acc: 100, pp: 20, kind: 'phys' },
  stringshot: { name: 'Silk Shot',   type: 'Bug',      power: 0,  acc: 95,  pp: 40, kind: 'status', effect: { target: 'foe', stat: 'spd', stages: -1 } },
  focus:      { name: 'Focus',       type: 'Normal',   power: 0,  acc: 100, pp: 20, kind: 'status', effect: { target: 'self', stat: 'atk', stages: 1 } }
};

// shape: body archetype for procedural mesh. learnset: [level, moveId]
const SPECIES = {
  emberpup: { name: 'Emberpup', types: ['Fire'], base: { hp: 45, atk: 55, def: 40, spd: 60 }, shape: 'quad', color: 0xf07030, accent: 0xffd060,
    evolve: { level: 16, into: 'blazehound' }, catchRate: 45, xp: 62,
    learnset: [[1, 'scratch'], [1, 'growl'], [5, 'ember'], [12, 'quickhit'], [18, 'flamewheel'], [28, 'inferno']] },
  blazehound: { name: 'Blazehound', types: ['Fire'], base: { hp: 70, atk: 85, def: 60, spd: 85 }, shape: 'quad', color: 0xd04020, accent: 0xffb030, scale: 1.4,
    catchRate: 45, xp: 150, learnset: [[1, 'scratch'], [1, 'ember'], [18, 'flamewheel'], [28, 'inferno'], [34, 'slam']] },
  aquatot: { name: 'Aquatot', types: ['Water'], base: { hp: 50, atk: 45, def: 55, spd: 50 }, shape: 'blob', color: 0x4f90f0, accent: 0xbfe6ff,
    evolve: { level: 16, into: 'tidalord' }, catchRate: 45, xp: 63,
    learnset: [[1, 'tackle'], [1, 'harden'], [5, 'bubble'], [12, 'aquajet'], [26, 'tidalwave']] },
  tidalord: { name: 'Tidalord', types: ['Water'], base: { hp: 85, atk: 70, def: 85, spd: 60 }, shape: 'blob', color: 0x2860c8, accent: 0x9fe0ff, scale: 1.45,
    catchRate: 45, xp: 152, learnset: [[1, 'tackle'], [1, 'bubble'], [12, 'aquajet'], [26, 'tidalwave'], [32, 'slam']] },
  sproutle: { name: 'Sproutle', types: ['Grass'], base: { hp: 55, atk: 50, def: 50, spd: 45 }, shape: 'bulb', color: 0x5cb85c, accent: 0xff7fa0,
    evolve: { level: 16, into: 'thornback' }, catchRate: 45, xp: 64,
    learnset: [[1, 'tackle'], [1, 'growl'], [5, 'vinelash'], [14, 'focus'], [20, 'leafstorm'], [30, 'solarbeam']] },
  thornback: { name: 'Thornback', types: ['Grass', 'Rock'], base: { hp: 80, atk: 80, def: 85, spd: 50 }, shape: 'bulb', color: 0x3c8c3c, accent: 0xff5080, scale: 1.45,
    catchRate: 45, xp: 155, learnset: [[1, 'tackle'], [1, 'vinelash'], [20, 'leafstorm'], [24, 'rockthrow'], [30, 'solarbeam']] },
  zapmouse: { name: 'Zapmouse', types: ['Electric'], base: { hp: 38, atk: 50, def: 35, spd: 85 }, shape: 'quad', color: 0xf8d030, accent: 0x503010, scale: 0.8,
    catchRate: 120, xp: 55, learnset: [[1, 'quickhit'], [1, 'growl'], [6, 'spark'], [20, 'voltbolt']] },
  pebblit: { name: 'Pebblit', types: ['Rock'], base: { hp: 45, atk: 60, def: 80, spd: 20 }, shape: 'rock', color: 0x8a7f6a, accent: 0x5a5040,
    catchRate: 150, xp: 55, learnset: [[1, 'tackle'], [1, 'harden'], [7, 'rockthrow'], [22, 'rockslide']] },
  skyfinch: { name: 'Skyfinch', types: ['Normal', 'Flying'], base: { hp: 40, atk: 45, def: 38, spd: 70 }, shape: 'bird', color: 0xb08050, accent: 0xf0e0c0,
    catchRate: 200, xp: 50, learnset: [[1, 'tackle'], [1, 'gust'], [9, 'quickhit'], [18, 'wingslash']] },
  wigglet: { name: 'Wigglet', types: ['Bug'], base: { hp: 42, atk: 40, def: 40, spd: 45 }, shape: 'worm', color: 0x9cc030, accent: 0xff4040,
    catchRate: 230, xp: 40, learnset: [[1, 'tackle'], [1, 'stringshot'], [8, 'bugbite']] },
  fluffbun: { name: 'Fluffbun', types: ['Normal'], base: { hp: 60, atk: 45, def: 40, spd: 55 }, shape: 'blob', color: 0xf2e6dc, accent: 0xff9fb0, scale: 0.9,
    catchRate: 190, xp: 50, learnset: [[1, 'tackle'], [1, 'growl'], [10, 'quickhit'], [20, 'slam']] },
  voltaur: { name: 'Voltaur', types: ['Electric', 'Flying'], base: { hp: 90, atk: 90, def: 85, spd: 100 }, shape: 'bird', color: 0xfff050, accent: 0x303040, scale: 1.8,
    catchRate: 3, xp: 260, learnset: [[1, 'spark'], [1, 'gust'], [1, 'wingslash'], [1, 'voltbolt']] }
};

const STARTERS = ['emberpup', 'aquatot', 'sproutle'];

// Wild encounters per zone: [speciesId, minLv, maxLv, weight]
const ENCOUNTERS = {
  meadow: [['wigglet', 2, 4, 35], ['skyfinch', 2, 5, 30], ['fluffbun', 3, 5, 25], ['zapmouse', 3, 5, 10]],
  forest: [['wigglet', 5, 8, 25], ['zapmouse', 6, 9, 25], ['skyfinch', 6, 9, 20], ['sproutle', 6, 8, 10], ['emberpup', 6, 8, 10], ['aquatot', 6, 8, 10]],
  rocky:  [['pebblit', 9, 13, 45], ['zapmouse', 10, 13, 20], ['skyfinch', 10, 14, 25], ['fluffbun', 10, 13, 10]]
};

const ITEMS = {
  potion:   { name: 'Potion',     desc: 'Restores 20 HP.',  price: 200, heal: 20 },
  superpot: { name: 'Super Potion', desc: 'Restores 60 HP.', price: 600, heal: 60 },
  ball:     { name: 'Capture Orb', desc: 'Catches wild monsters.', price: 200, ball: 1 },
  greatball:{ name: 'Great Orb',   desc: 'Better catch rate.', price: 600, ball: 1.5 },
  revive:   { name: 'Revive',     desc: 'Revives a fainted monster to half HP.', price: 1500, revive: true }
};
