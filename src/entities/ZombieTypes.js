/**
 * Zombie type definitions.
 *
 * Adding a new type = adding a config object here (stats + sprite tint).
 * No core system changes needed: the spawn director picks types by weight
 * and the Zombie class reads everything from its config.
 */
export const ZOMBIE_TYPES = {
  walker: {
    name: 'Walker',
    hp: 30,
    points: 1,
    damage: 8,
    reach: 1.7,
    wanderSpeed: 0.8,
    chaseSpeed: 2.1,
    sightRange: 50,
    height: 1.75,
    scale: 1.0,
    tint: null,          // uses the sheet as-is
    walkFps: 5,
    attackWindup: 0.5,
    attackCooldown: 1.2,
    knockbackResist: 0,
  },
  sprinter: {
    name: 'Sprinter',
    hp: 15,
    points: 2,
    damage: 6,
    reach: 1.6,
    wanderSpeed: 1.6,
    chaseSpeed: 5.4,
    sightRange: 60,
    height: 1.68,
    scale: 0.95,
    tint: 'sprinter',    // feverish red
    walkFps: 11,
    attackWindup: 0.3,
    attackCooldown: 0.9,
    knockbackResist: 0,
  },
  tank: {
    name: 'Tank',
    hp: 220,
    points: 5,
    damage: 26,
    reach: 2.2,
    wanderSpeed: 0.7,
    chaseSpeed: 1.4,
    sightRange: 55,
    height: 2.35,
    scale: 1.45,
    tint: 'tank',        // sickly green bulk
    walkFps: 4,
    attackWindup: 0.7,
    attackCooldown: 1.6,
    knockbackResist: 0.85,
  },
};
