// Overworld map. Legend: T tree, # wall/boulder, W water, P path, . ground, F flowers, R rocky ground,
// , meadow grass  ; forest grass  : rocky grass (tall grass = wild encounters)
const MAP = [
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  'T##############################T',
  'T#RRRRRRRRRRRRRRRRRRRRRRRRRRRR#T',
  'T#############RRRR#############T',
  'T#R:::::RRRRRRRRRRRRRRRR:::::R#T',
  'T#R:::::RR#RRRRRRRRR#RR:::::RR#T',
  'T#RR:::RRRRRRRRPPRRRRRR:::RRRR#T',
  'T#RRRRR#RRRRRRRPPRRRRRR#RRRRRR#T',
  'T#RR::::RRRRRRRPPRRRR::::RRRRR#T',
  'TTTTTTTTTTTTTRRPPRRTTTTTTTTTTTTT',
  'TTTTTTTTTTTTTT.PP.TTTTTTTTTTTTTT',
  'TTTT;;;;TTTTT..PP..TTTT;;;;;TTTT',
  'TTT;;;;;;;TT...PP...TT;;;;;;;TTT',
  'TTT;;;;;;;;....PP....;;;;;;;;TTT',
  'TTT;;TT;;;;;...PP...;;;;;TT;;TTT',
  'TTTT;TT;;;;;..PPPP..;;;;;TT;TTTT',
  'TTTT;;;;;;;;..P..P..;;;;;;;;TTTT',
  'TTT;;;;;;TT...PPPP...TT;;;;;;TTT',
  'TTT;;;;;;TT....PP....TT;;;;;;TTT',
  'TTTT;;;;TTTT...PP...TTTT;;;;TTTT',
  'TTTTTTTTTTTTT..PP..TTTTTTTTTTTTT',
  'TT..........F..PP..F..........TT',
  'TT.,,,,,,,,....PP....,,,,,,,,.TT',
  'TT.,,,,,,,,,...PP...,,,,,,,,,.TT',
  'TT.,,,WWWW,,,..PP..,,,,,,,,,,.TT',
  'TT.,,WWWWWW,,..PP..,,,,F,,,,,.TT',
  'TT..,WWWWWW,...PP...,,,,,,,,,.TT',
  'TT...,WWWW,...FPPF...,,,,,,,..TT',
  'TT....,,,,.....PP.....,,,,,...TT',
  'TT..F.....,,,,.PP.,,,,....F...TT',
  'TT........,,,,.PP.,,,,........TT',
  'TTFFF..........PP..........FFFTT',
  'TT#############PP#############TT',
  'TT.............PP.............TT',
  'TT.............PP.............TT',
  'TT.............PP.............TT',
  'TT.............PP.............TT',
  'TT..F..PPPPPPPPPPPPPPPPPPP..F.TT',
  'TT.....P.......PP.........P...TT',
  'TT.....P.......PP.........P...TT',
  'TT.....P.......PP.........P...TT',
  'TT.....P.......PP.........P...TT',
  'TT..PPPPPPPPPPPPPPPPPPPPPPPPP.TT',
  'TT.......F.....PP.....F.......TT',
  'TT....WWWW.....PP.............TT',
  'TT....WWWW.....PP.............TT',
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
];

// Buildings: footprint x..x+w-1, z..z+d-1. Door is the bottom-center tile; stand below it and press Up / Action.
const BUILDINGS = [
  { id: 'center', x: 5,  z: 33, w: 5, d: 4, wall: 0xf4f0e8, roof: 0xe04848, label: 'HEAL' },
  { id: 'shop',   x: 22, z: 33, w: 5, d: 4, wall: 0xf4f0e8, roof: 0x3a70d0, label: 'SHOP' },
  { id: 'home',   x: 9,  z: 38, w: 4, d: 3, wall: 0xf0e0c0, roof: 0x8a5a3a },
  { id: 'lab',    x: 18, z: 38, w: 6, d: 3, wall: 0xe8eef0, roof: 0x607080, label: 'LAB' }
];

// NPCs. Trainers have a facing dir and sight range; they challenge you when you walk into view.
const NPCS = [
  { id: 'prof', x: 20, z: 42, color: 0xffffff, hair: 0x888888, dir: 'down',
    lines: ['PROF. OAKLEY: Wild monsters live in the tall grass up north.', 'Weaken them in battle, then throw a Capture Orb!', 'Beat Ace Rhea in the Rocky Heights to face the legendary VOLTAUR.'] },
  { id: 'kid', x: 12, z: 35, color: 0x40a0ff, hair: 0x302010, dir: 'right', wander: true,
    lines: ['Type matchups matter! Water beats Fire, Fire beats Grass, Grass beats Water.', 'Electric moves can\'t touch Rock types at all!'] },
  { id: 'mom', x: 13, z: 42, color: 0xff80a0, hair: 0x603020, dir: 'down',
    lines: ['MOM: Be careful out there! Visit the red-roofed HEAL center if your team gets hurt.'] },
  { id: 'ben', x: 13, z: 29, color: 0x40c040, hair: 0x201008, dir: 'right', trainer: true, sight: 4, reward: 300,
    name: 'Youngster Ben', team: [['wigglet', 4], ['skyfinch', 5]],
    intro: 'Hey! You look like a new trainer. Battle me!', defeat: 'Aww, I lost! You\'re strong!' },
  { id: 'mia', x: 18, z: 13, color: 0xa0c020, hair: 0xe0a040, dir: 'left', trainer: true, sight: 4, reward: 700,
    name: 'Ranger Mia', team: [['zapmouse', 8], ['wigglet', 9], ['sproutle', 9]],
    intro: 'The forest is my home. Show me your bond with your team!', defeat: 'Your team trusts you. Go on ahead.' },
  { id: 'rhea', x: 18, z: 4, color: 0x8030c0, hair: 0xf0f0f0, dir: 'left', trainer: true, sight: 4, reward: 2000,
    name: 'Ace Rhea', team: [['pebblit', 13], ['skyfinch', 14], ['blazehound', 16], ['tidalord', 17]],
    intro: 'Only the worthy may approach the Storm Bird. Prove yourself!', defeat: 'Magnificent... The legendary awaits you.' }
];

// Items lying on the ground (orb-shaped pickups)
const PICKUPS = [
  { id: 'p1', x: 3, z: 22, item: 'potion', qty: 2 },
  { id: 'p2', x: 27, z: 12, item: 'superpot', qty: 1 },
  { id: 'p3', x: 4, z: 13, item: 'greatball', qty: 3 },
  { id: 'p4', x: 3, z: 4, item: 'revive', qty: 1 },
  { id: 'p5', x: 28, z: 30, item: 'ball', qty: 3 }
];

const LEGENDARY = { id: 'voltaur', x: 15, z: 2, species: 'voltaur', level: 25 };
const START_POS = { x: 15, z: 44 };
