# Monster Quest 3D

A complete Pokémon-style monster-catching RPG built with **Three.js**. It's plain HTML and JavaScript, with no build step.

## Play

Serve the folder with any static server and open `index.html`:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

(Three.js loads from the cdnjs CDN.)

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | Arrows / WASD | D-pad |
| Run | Shift | – |
| Talk / Confirm | Space / Enter / Z | A |
| Back / Menu | Esc / X | B |
| Menu | M | ☰ |

## Features

- **3D overworld** with a town, the Breezy Meadow route, Whisperwood Forest and the Rocky Heights. Movement is grid-based, with shadows, animated water and a follow camera.
- **12 original monsters** in 8 types, built procedurally from Three.js primitives. There are 3 starters, each with an evolution at Lv16.
- **Turn-based battles** in a separate 3D arena, with a type chart, STAB, critical hits, accuracy, priority moves, stat stages, PP, and attack, projectile, faint and capture animations.
- **Catching** uses HP-based catch rates and 3 orb shakes. You keep a party of up to 6 and extra monsters go to storage.
- **Leveling**: EXP is shared among participants, and monsters learn new moves and evolve.
- **Trainers** spot you from a distance, walk up to you and challenge you, and they pay prize money when you win.
- **The legendary Voltaur** is guarded by Ace Rhea at the top of the Rocky Heights.
- **Town services**: the HEAL center, a shop, the professor's lab (MonDex progress) and Mom's house.
- **Items**: Potion, Super Potion, Capture Orb, Great Orb, Revive, plus hidden pickups in the world.
- **Menus**: MonDex, team summary and reordering, and the bag. The game auto-saves to localStorage.
- **Chiptune music and sound effects** use WebAudio. There's a mute button in the top-right corner.

## Files

- `js/data.js`: types, moves, species, encounters, items
- `js/map.js`: the tile map, buildings, NPCs and pickups
- `js/creature.js`: stats, damage, EXP and procedural monster models
- `js/world.js`: overworld rendering and movement
- `js/battle.js`: the battle system and battle scene
- `js/ui.js`: dialog boxes, menus and the HUD
- `js/sound.js`: the WebAudio synth
- `js/main.js`: the game loop, input, menus and save/load
