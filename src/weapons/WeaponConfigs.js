/**
 * Weapon definitions — pure data.
 *
 * Adding a weapon = adding a config object here (and a sprite in
 * TextureConfig). Damage, fire rate, magazine, spread, sounds and view
 * sprite are all read from the config; no core system changes needed.
 *
 * spread is in degrees (cone half-angle-ish), range in metres, noise is the
 * radius in which zombies hear the shot.
 */
export const WEAPON_CONFIGS = [
  {
    id: 'pistol',
    name: 'PISTOL',
    slot: 1,
    icon: 'weaponPistol',
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
  },
  {
    id: 'shotgun',
    name: 'SHOTGUN',
    slot: 2,
    icon: 'weaponShotgun',
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
  },
  {
    id: 'rifle',
    name: 'ASSAULT RIFLE',
    slot: 3,
    icon: 'weaponRifle',
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
  },
  {
    id: 'sniper',
    name: 'SNIPER RIFLE',
    slot: 4,
    icon: 'weaponSniper',
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
    zoom: 3.6,        // right-click scope
    sound: 'sniper',
    ammoType: 'ammo_sniper',
  },
  {
    id: 'bat',
    name: 'BASEBALL BAT',
    slot: 5,
    icon: 'weaponBat',
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
  },
];
