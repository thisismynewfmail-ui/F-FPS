/**
 * Weapon definitions — pure data.
 *
 * Each weapon carries a themed identity (`flavor`), primary stats, and an
 * `alt` block describing its right-mouse secondary fire. Damage, fire rate,
 * magazine, spread, sounds and the alt-fire behaviour are all read from the
 * config; the 3D model + animation rig lives in WeaponModels.js keyed by id.
 *
 * spread is in degrees (cone half-angle-ish), range in metres, noise is the
 * radius in which zombies hear the shot.
 *
 * alt.mode:
 *   'auto'   — hold RMB to fire rapidly (pistol hair-trigger), damageMul<1
 *   'double' — click RMB to fire multiple chambers at once (shotgun), shells>1
 *   'burst'  — click RMB for a fixed N-round burst (rifle)
 *   'charge' — click RMB for a heavy wind-up melee swing (bat)
 *  (the sniper has no alt block: its RMB is the telescopic scope, via `zoom`.)
 */
export const WEAPON_CONFIGS = [
  {
    id: 'pistol',
    name: 'PISTOL',
    flavor: 'REGENT AUTOLOADER',
    slot: 1,
    melee: false,
    damage: 12,
    pellets: 1,
    pierce: 1,
    magSize: 12,
    reserveStart: Infinity, // sidearm: unlimited reserve, limited magazine
    fireInterval: 0.26,
    auto: false,
    reloadTime: 1.1,
    spread: 1.1,
    bloomPerShot: 0.5,
    range: 70,
    noise: 38,
    kick: 1.0,
    zoom: null,
    sound: 'pistol',
    ammoType: 'ammo_pistol',
    altLabel: 'HAIR-TRIGGER',
    alt: { mode: 'auto', fireInterval: 0.10, damageMul: 0.6, spread: 2.6, sound: 'pistolAuto', noise: 34 },
  },
  {
    id: 'shotgun',
    name: 'SHOTGUN',
    flavor: 'COACH BREAKER',
    slot: 2,
    melee: false,
    damage: 8,
    pellets: 8,
    pierce: 1,
    magSize: 8,
    reserveStart: 32,
    fireInterval: 0.95,
    auto: false,
    reloadTime: 2.4,
    spread: 6.0,
    bloomPerShot: 0,
    range: 30,
    noise: 55,
    kick: 2.6,
    knockback: 4.5,
    zoom: null,
    sound: 'shotgun',
    ammoType: 'ammo_shotgun',
    altLabel: 'BOTH BARRELS',
    alt: { mode: 'double', shells: 2, pellets: 16, fireInterval: 1.15, spread: 8.5, kickMul: 1.7, knockbackMul: 1.6, sound: 'shotgunDouble', noise: 68 },
  },
  {
    id: 'rifle',
    name: 'ASSAULT RIFLE',
    flavor: 'AUTOMATON REPEATER',
    slot: 3,
    melee: false,
    damage: 10,
    pellets: 1,
    pierce: 1,
    magSize: 30,
    reserveStart: 120,
    fireInterval: 0.095,
    auto: true,
    reloadTime: 1.9,
    spread: 1.6,
    bloomPerShot: 0.35, // recoil bloom builds while holding the trigger
    bloomMax: 3.5,
    range: 85,
    noise: 48,
    kick: 0.8,
    zoom: null,
    sound: 'rifle',
    ammoType: 'ammo_rifle',
    altLabel: '3-RND BURST',
    alt: { mode: 'burst', count: 3, burstSpacing: 0.06, fireInterval: 0.5, spread: 0.7, damageMul: 1.15, sound: 'rifleBurst', noise: 50 },
  },
  {
    id: 'sniper',
    name: 'SNIPER RIFLE',
    flavor: 'RANGEFINDER',
    slot: 4,
    melee: false,
    damage: 90,
    pellets: 1,
    pierce: 3, // punches through a line of them
    magSize: 5,
    reserveStart: 15,
    fireInterval: 1.35,
    auto: false,
    reloadTime: 2.6,
    spread: 4.0,      // from the hip
    spreadScoped: 0.12,
    bloomPerShot: 0,
    range: 240,
    noise: 60,
    kick: 3.2,
    zoom: 3.6,        // right-click scope (this weapon's secondary action)
    sound: 'sniper',
    ammoType: 'ammo_sniper',
    altLabel: 'SCOPE',
  },
  {
    id: 'bat',
    name: 'BASEBALL BAT',
    flavor: 'PISTON BAT',
    slot: 5,
    melee: true,
    damage: 34,
    range: 2.4,
    arc: 70,          // degrees
    fireInterval: 0.55,
    auto: false,
    knockback: 6.5,
    noise: 0,         // silent
    kick: 0,
    zoom: null,
    sound: 'bat',
    altLabel: 'HEAVY SWING',
    alt: { mode: 'charge', damageMul: 2.1, knockbackMul: 1.7, arcMul: 1.25, fireInterval: 0.95, sound: 'batCharge' },
  },
];
