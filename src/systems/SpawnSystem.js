import { Zombie } from '../entities/Zombie.js';
import { Exploder } from '../entities/Exploder.js';
import { ZOMBIE_TYPES } from '../entities/ZombieTypes.js';
import { makeSpriteMaterial } from '../rendering/Billboard.js';

/**
 * Spawn director. Streams the current wave's budget into the world while
 * keeping the active-zombie count under a performance cap. Spawns happen in
 * unlocked zones only, in a ring around the player, preferring points the
 * player can't see. Also handles corpse cleanup, loot drops and the
 * zombie-zombie separation pass.
 */
const ACTIVE_CAP = 55;
const TANK_SLOTS = 2;

export class SpawnSystem {
  constructor(events, world, texLib, scene, waveSystem) {
    this.events = events;
    this.world = world;
    this.scene = scene;
    this.waves = waveSystem;
    this.zombies = [];
    this.spawnTimer = 1;
    // Opt-in "cull a zombie that can't see the player for N seconds" flag.
    // 0 = off (default). Stamped onto every zombie at spawn; see Game.load
    // for where it is actively switched on, and the `cull` console command.
    this.cullBlindSeconds = 0;

    // One shared material per type; billboards clone it per zombie but the
    // GPU texture is shared (tinted variants are separate small uploads).
    this.materials = {
      walker: makeSpriteMaterial(texLib.get('zombieBasic')),
      sprinter: makeSpriteMaterial(texLib.tinted('zombieBasic', 'sprinter')),
      tank: makeSpriteMaterial(texLib.tinted('zombieBasic', 'tank')),
      exploder: makeSpriteMaterial(texLib.get('npcExploder')),
    };

    events.on('noise', ({ pos, radius }) => {
      for (const z of this.zombies) z.onNoise(pos, radius);
    });
    events.on('zombie:death', ({ pos, loot }) => this._maybeDrop(pos, loot));
  }

  activeSlots() {
    let n = 0;
    for (const z of this.zombies) n += z.config === ZOMBIE_TYPES.tank ? TANK_SLOTS : 1;
    return n;
  }

  pickType() {
    const w = this.waves.typeWeights();
    const r = Math.random();
    let acc = w.tank;
    if (r < acc) return 'tank';
    acc += w.sprinter; if (r < acc) return 'sprinter';
    acc += w.exploder || 0; if (r < acc) return 'exploder';
    return 'walker';
  }

  pickSpawnPoint(player) {
    const pts = this.world.spawnPoints;
    let fallback = null;
    for (let tries = 0; tries < 24; tries++) {
      const p = pts[(Math.random() * pts.length) | 0];
      if (!this.world.zones.isUnlocked(p.zone)) continue;
      const d = Math.hypot(p.x - player.position.x, p.z - player.position.z);
      if (d < 18 || d > 95) continue;
      fallback = p;
      if (d > 26 && d < 70) {
        const y = this.world.groundHeightFor(p.x, p.z, 1e9);
        const visible = this.world.hasLineOfSight(
          player.position.x, player.position.y + 1.5, player.position.z,
          p.x, y + 1.2, p.z,
        );
        if (!visible) return p;
      }
    }
    return fallback;
  }

  spawnOne(typeName, player) {
    const p = this.pickSpawnPoint(player);
    if (!p) return null;
    const Ctor = typeName === 'exploder' ? Exploder : Zombie;
    const z = new Ctor(ZOMBIE_TYPES[typeName], this.materials[typeName], this.world, this.events);
    z.placeAt(p.x + (Math.random() - 0.5) * 2, p.z + (Math.random() - 0.5) * 2);
    if (this.cullBlindSeconds > 0) z.flags.cullBlindSeconds = this.cullBlindSeconds;
    this.zombies.push(z);
    this.scene.add(z.mesh);
    return z;
  }

  /** Toggle the blind-cull flag and (re)stamp it onto every live zombie. */
  setCull(seconds) {
    this.cullBlindSeconds = Math.max(0, Number(seconds) || 0);
    for (const z of this.zombies) {
      if (this.cullBlindSeconds > 0) z.flags.cullBlindSeconds = this.cullBlindSeconds;
      else delete z.flags.cullBlindSeconds;
    }
    return this.cullBlindSeconds;
  }

  update(dt, player) {
    // stream the wave in
    if (this.waves.state === 'active' && this.waves.budget > 0 && player.alive) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.activeSlots() < ACTIVE_CAP) {
        this.spawnTimer = this.waves.spawnInterval();
        const batch = Math.min(this.waves.budget, 2 + ((Math.random() * 4) | 0));
        for (let i = 0; i < batch; i++) {
          if (this.activeSlots() >= ACTIVE_CAP) break;
          if (this.spawnOne(this.pickType(), player)) this.waves.noteSpawned(1);
        }
      }
    }

    // corpse cleanup
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];
      if (z.toRemove) {
        this.scene.remove(z.mesh);
        z.dispose();
        this.zombies.splice(i, 1);
        this.waves.noteRemoved(1);
      }
    }

    // separation: keep the horde from stacking into one sprite
    const zs = this.zombies;
    for (let i = 0; i < zs.length; i++) {
      const a = zs[i];
      if (a.state === 'dead') continue;
      for (let j = i + 1; j < zs.length; j++) {
        const b = zs[j];
        if (b.state === 'dead') continue;
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const d2 = dx * dx + dz * dz;
        const minD = a.radius + b.radius;
        if (d2 > minD * minD || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const push = (minD - d) * 0.5;
        const nx = dx / d, nz = dz / d;
        a.position.x -= nx * push; a.position.z -= nz * push;
        b.position.x += nx * push; b.position.z += nz * push;
      }
    }
  }

  _maybeDrop(pos, loot) {
    // Exploders carry an explicit loot decision on their death event: sniper
    // ammo when the player killed them, an explicit `null` (no drop) when they
    // self-detonated or died to another blast. Everything else (loot undefined)
    // rolls the usual random drop.
    if (loot !== undefined) {
      if (loot) this.events.emit('loot:spawn', { x: pos.x, z: pos.z, type: loot, amount: 5 });
      return;
    }
    const r = Math.random();
    if (r < 0.030) {
      const kinds = ['ammo_rifle', 'ammo_shotgun', 'ammo_rifle', 'ammo_sniper'];
      const type = kinds[(Math.random() * kinds.length) | 0];
      const amount = type === 'ammo_sniper' ? 4 : type === 'ammo_shotgun' ? 6 : 20;
      this.events.emit('loot:spawn', { x: pos.x, z: pos.z, type, amount });
    } else if (r < 0.048) {
      this.events.emit('loot:spawn', { x: pos.x, z: pos.z, type: 'health', amount: 25 });
    }
  }

  /** Ambient zombie pressure near the player (drives moan intensity). */
  nearbyCount(player, range = 40) {
    let n = 0;
    for (const z of this.zombies) {
      if (z.state === 'dead') continue;
      if (z.distanceTo(player) < range) n++;
    }
    return n;
  }
}
