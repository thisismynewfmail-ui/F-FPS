# F-FPS — 250,000

A complete first-person zombie survival game in the browser, inspired by
Left 4 Dead's invasion mode with a 2003 Half-Life / early-PS1 retro
aesthetic. There is exactly one way to win: **kill 250,000 zombies.**

Built on a vendored Three.js (no build step, no network dependencies): all
surface textures are generated pixel art, all audio is synthesized with
WebAudio, and all entities are billboarded sprites over standard textured
polygon geometry.

## Running

Any static file server from the repo root works:

```
python3 -m http.server 8000
# then open http://localhost:8000/
```

(ES modules require http://, so opening index.html from disk won't work.)

## Controls

| Input | Action |
| --- | --- |
| WASD | Move |
| Mouse | Look / primary fire (LMB) |
| RMB | Secondary fire (per weapon — see Arsenal) |
| Shift | Sprint |
| Ctrl / C | Crouch |
| Space | Jump |
| 1–5 | Pistol / Shotgun / Assault Rifle / Sniper / Bat |
| Mouse wheel | Cycle weapons (also reveals the weapon menu) |
| R | Reload |
| E | Interact |
| Esc | Pause (releases pointer lock) |
| ` / ~ | Dev console |

The weapon menu is hidden during play; a number key or a mouse-wheel scroll
fades it in at the top of the screen, and it fades back out after a couple of
seconds (or the instant you fire).

## Arsenal

Every weapon is a fully 3D, PBR-textured model with a steampunk / Bioshock
finish — brass, blued gunsteel, cast iron, copper, oiled walnut and cracked
leather — animated with an idle sway, a three-phase fire recoil, a full
reload, and equip/unequip transitions. Each has its own synthesised firing
sound and a distinct right-mouse secondary action:

| Slot | Weapon | Secondary (RMB) |
| --- | --- | --- |
| 1 | Regent Autoloader (pistol) | **Hair-trigger** — rapid auto fire, less damage per round |
| 2 | Coach Breaker (shotgun) | **Both barrels** — twin blast, two shells, big knockback |
| 3 | Automaton Repeater (rifle) | **3-round burst** — tight grouping |
| 4 | Rangefinder (sniper) | **Scope** — telescopic zoom |
| 5 | Piston Bat (melee) | **Heavy swing** — charged, wider arc, more knockback |

## Dev console

Press `` ` `` (backtick / tilde) to drop the developer console. It owns the
keyboard while open and the game keeps running behind it. Commands:

| Command | Effect |
| --- | --- |
| `noclip` | Fly through all geometry — WASD to move, Space up, Ctrl down, Shift for fast |
| `god` | Toggle invulnerability |
| `heal [n]` | Restore health (default: full) |
| `give` | Fill every weapon's magazine and reserve |
| `tp <x> <z>` | Teleport to map coordinates (spawn is `0 20`) |
| `speed <mult>` | Movement speed multiplier (0.1–10) |
| `pos` | Print current position |
| `help` / `clear` | List commands / clear the log |

There is deliberately no command that touches the kill counter — the
250,000 win condition has no shortcuts, console included.

## The game

- **Win condition:** exactly 250,000 total kills, tracked by
  `src/systems/ScoreSystem.js`. Kills enter only through the real damage
  pipeline; the victory screen (time survived, accuracy, kills by type)
  fires the moment the counter reaches 250,000 — verified by an automated
  test at 249,999 vs 250,000.
- **Zombies:** Walkers (30 HP, 1 pt), Sprinters (15 HP, fast, 2 pts), Tanks
  (220 HP, 5 pts). State machine: idle → wandering → alerted → chasing →
  attacking → dead, with line-of-sight detection, A* pathfinding on a nav
  grid, and gunshot-noise attraction (the bat is silent).
- **Waves:** escalating hordes with respite periods and supply drops;
  sprinter/tank share rises with wave number and progress toward 250,000.
- **Progression:** six districts unlock at kill milestones — Old Town
  (start), Eastgate Residential (500), Downtown (1,200), Hollow Park
  (2,500), Southside Industrial (4,500), Chapel Ridge (7,000). Barricades
  rumble and sink into the ground when a district opens; the world tells
  you, not a popup.
- **Terrain:** a real heightfield — the chapel hill climbs 16 m, the park
  drops into a ravine with a pond, steep slopes slow you down.
- **Secrets:** ten of them, found by shooting, interacting, standing,
  looking, or killing exactly the right number. The mannequin is watching.

## Repository layout

```
assets/textures/    generated retro textures + sprites (power-of-two, tileable)
assets/sprites/     provided NPC/zombie sprite sheets (3x4 walk cycles)
lib/three.module.js vendored Three.js r169
scripts/            generate_textures.mjs — regenerates assets/textures/
src/engine/         game loop, input, event bus
src/entities/       player, zombies, NPC, pickups
src/weapons/        weapon configs + firing/ammo/hit resolution
src/rendering/      renderer, texture pipeline, billboards, HUD, 3D weapon
                    view + PBR weapon materials, effects
src/audio/          WebAudio synthesis (all sounds)
src/world/          terrain, buildings, props, vegetation, zones, nav, secrets
src/systems/        score/win condition, waves, spawning, game state
tests/              Playwright smoke test (boot, combat, exact win condition)
```

## Extensibility

- **New weapon:** add a config object (stats + `alt` secondary fire) to
  `src/weapons/WeaponConfigs.js` and a 3D model rig to
  `src/weapons/WeaponModels.js` (built from primitives + the shared PBR
  materials in `WeaponMaterials.js`). WeaponView, the HUD menu and audio pick
  it up from the config.
- **New zombie type:** add a config to `src/entities/ZombieTypes.js`
  (stats + tint); the spawn director and HUD pick it up.
- **Reskin:** every texture path lives in
  `src/rendering/TextureConfig.js`; replace a PNG on disk (e.g. the brick
  wall) and every wall in the game changes. New white-background sprite
  sheets dropped into `assets/sprites/` are keyed automatically (edge flood
  fill preserves interior whites).
- **Regenerate textures:** `node scripts/generate_textures.mjs`.

## Performance

Pooled particles (no GC spikes), shared materials with per-mesh UV frames,
distance-dormant AI, camera far plane at the fog wall for culling, merged
grass-tuft geometry, and a windowed A* with a per-frame path budget.
Renders at 0.75 internal scale with nearest-neighbour upscaling — chunky
and fast.

## Tests

```
npm install playwright-core   # anywhere; NODE_PATH it if needed
node tests/smoke.mjs [--screens]
```

Drives the real game headless: boot without errors, movement, wave
spawning, ammo consumption, an end-to-end gunfire kill, zone unlocks, and
the exact-250,000 victory (no win at 249,999; stats screen at 250,000).
