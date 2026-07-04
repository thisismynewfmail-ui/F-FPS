import * as THREE from '../../lib/three.module.js';
import { WEAPON_CONFIGS } from './WeaponConfigs.js';
import { Weapon } from './Weapon.js';

/**
 * Owns the five weapons, switching (keys 1-5 / wheel), reload input, the
 * sniper scope, and all hit resolution:
 *
 *  - hitscan rays against zombies (cylinder tests, headshot bonus, pierce),
 *    world geometry (AABBs + terrain march) and shootable secrets
 *  - melee arc swings with knockback
 *
 * Accuracy counts one 'shot' per trigger pull; a pull that hits any zombie
 * counts as a hit (pellets don't inflate the numbers). Melee doesn't count.
 * Gunshots emit 'noise' events that draw the horde.
 */
export class WeaponManager {
  constructor(events, world, player, renderer) {
    this.events = events;
    this.world = world;
    this.player = player;
    this.renderer = renderer;
    this.weapons = WEAPON_CONFIGS.map((c) => new Weapon(c));
    this.index = 0;
    this.switchTimer = 0;
    this.scoped = false;
    this.zombies = null; // wired by Game

    events.on('pickup', ({ type, amount }) => {
      for (const w of this.weapons) {
        if (w.config.ammoType === type) {
          w.addReserve(amount);
          this.events.emit('ammo:changed', this.current);
        }
      }
    });
  }

  get current() { return this.weapons[this.index]; }

  switchTo(i) {
    if (i === this.index || i < 0 || i >= this.weapons.length) return;
    this.current.cancelReload();
    this.setScope(false);
    this.index = i;
    this.switchTimer = 0.3;
    this.events.emit('weapon:switch', { weapon: this.current });
  }

  setScope(on) {
    if (this.scoped === on) return;
    if (on && this.current.config.zoom === null) return;
    this.scoped = on;
    const zoom = on ? this.current.config.zoom : 1;
    this.player.zoomFactor = zoom;
    this.renderer.applyFov(zoom);
    this.events.emit('scope', { on });
  }

  update(dt, input) {
    for (const w of this.weapons) w.update(dt);
    if (this.switchTimer > 0) this.switchTimer -= dt;

    // switching
    for (let i = 0; i < 5; i++) {
      if (input.wasPressed('Digit' + (i + 1))) this.switchTo(i);
    }
    if (input.wheelDelta !== 0) {
      this.switchTo((this.index + (input.wheelDelta > 0 ? 1 : -1) + this.weapons.length) % this.weapons.length);
    }

    // reload
    if (input.wasPressed('KeyR') && this.current.startReload()) {
      this.events.emit('weapon:reload:start', { weapon: this.current });
    }

    // scope (hold right mouse)
    this.setScope(input.isMouseDown(2) && this.current.config.zoom !== null && this.switchTimer <= 0);

    // fire
    const wantFire = this.current.config.auto ? input.isMouseDown(0) : input.wasClicked(0);
    if (wantFire && this.switchTimer <= 0) this.tryFire();
  }

  tryFire() {
    const w = this.current;
    if (w.reloading || this.switchTimer > 0) return;
    if (w.cooldown > 0) return;
    if (!w.isMelee && w.mag <= 0) {
      this.events.emit('weapon:empty', { weapon: w });
      if (w.startReload()) this.events.emit('weapon:reload:start', { weapon: w });
      return;
    }
    const spread = w.fire(this.scoped);
    if (w.isMelee) this._swing(w);
    else this._shoot(w, spread);
    this.events.emit('weapon:fire', { weapon: w, scoped: this.scoped });
    if (w.config.noise > 0) {
      this.events.emit('noise', { pos: this.player.position.clone(), radius: w.config.noise });
    }
  }

  _shoot(w, spreadDeg) {
    const cfg = w.config;
    const origin = this.player.eyePosition();
    const baseDir = this.player.lookDirection();
    let anyHit = false;

    for (let p = 0; p < cfg.pellets; p++) {
      const dir = coneSpread(baseDir, spreadDeg);
      const hit = this._resolveRay(origin, dir, cfg);
      if (hit) anyHit = true;
    }
    this.events.emit('shot:fired', {});
    if (anyHit) this.events.emit('shot:hit', {});
    this.events.emit('ammo:changed', w);
  }

  _resolveRay(origin, dir, cfg) {
    // World geometry distance caps the ray.
    let worldDist = this.world.collision.raycast(origin, dir, cfg.range);
    const terrainDist = this._terrainRay(origin, dir, Math.min(cfg.range, worldDist));
    worldDist = Math.min(worldDist, terrainDist);

    // Secret targets.
    const shootable = this.world.raycastShootables(origin, dir, worldDist);

    // Zombie cylinder hits along the ray, nearest first. The closest
    // approach to a vertical cylinder axis happens in the XZ plane, so
    // project onto the ray's *normalized* XZ direction (a pitched ray has
    // |dirXZ| < 1 and the raw dot product lands short of the target).
    const hits = [];
    const dxz2 = dir.x * dir.x + dir.z * dir.z;
    if (dxz2 > 1e-8) {
      for (const z of this.zombies) {
        if (z.state === 'dead') continue;
        const hitR = 0.42 * z.config.scale + 0.08;
        const ox = z.position.x - origin.x, oz = z.position.z - origin.z;
        const t = (ox * dir.x + oz * dir.z) / dxz2; // 3D ray parameter = distance (dir is unit)
        if (t < 0 || t > worldDist) continue;
        const px = origin.x + dir.x * t - z.position.x;
        const pz = origin.z + dir.z * t - z.position.z;
        if (px * px + pz * pz > hitR * hitR) continue;
        const hitY = origin.y + dir.y * t;
        if (hitY < z.position.y - 0.1 || hitY > z.position.y + z.height + 0.1) continue;
        hits.push({ z, t, hitY });
      }
    }
    hits.sort((a, b) => a.t - b.t);

    if (shootable && (!hits.length || shootable.dist < hits[0].t)) {
      if (shootable.target.onHit()) shootable.target.active = false;
      this.events.emit('impact', { pos: rayPoint(origin, dir, shootable.dist) });
      return false;
    }

    let pierced = 0;
    for (const h of hits) {
      if (pierced >= cfg.pierce) break;
      const headshot = h.hitY > h.z.position.y + h.z.height * 0.72;
      const dmg = cfg.damage * (headshot ? 1.5 : 1) * (pierced > 0 ? 0.6 : 1);
      h.z.takeDamage(dmg, { x: dir.x, z: dir.z }, cfg.knockback ?? 0);
      pierced++;
    }
    if (!pierced && worldDist < cfg.range) {
      this.events.emit('impact', { pos: rayPoint(origin, dir, worldDist) });
    }
    return pierced > 0;
  }

  _terrainRay(origin, dir, maxDist) {
    if (dir.y >= -0.02) return Infinity; // flat/up shots rarely clip terrain within range
    for (let t = 2; t < maxDist; t += 2) {
      const x = origin.x + dir.x * t, y = origin.y + dir.y * t, z = origin.z + dir.z * t;
      if (y < this.world.terrain.heightAt(x, z)) {
        // refine one step back
        for (let f = t - 2; f <= t; f += 0.4) {
          const fy = origin.y + dir.y * f;
          if (fy < this.world.terrain.heightAt(origin.x + dir.x * f, origin.z + dir.z * f)) return f;
        }
        return t;
      }
    }
    return Infinity;
  }

  _swing(w) {
    const cfg = w.config;
    const origin = this.player.position;
    const dir = this.player.lookDirection();
    const yaw = Math.atan2(dir.x, dir.z);
    const arcRad = (cfg.arc * Math.PI / 180) / 2;
    let hitAny = false;
    for (const z of this.zombies) {
      if (z.state === 'dead') continue;
      const dx = z.position.x - origin.x, dz = z.position.z - origin.z;
      const d = Math.hypot(dx, dz);
      if (d > cfg.range + z.radius) continue;
      if (Math.abs(z.position.y - origin.y) > 2) continue;
      let da = Math.atan2(dx, dz) - yaw;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) > arcRad) continue;
      z.takeDamage(cfg.damage, { x: dx / (d || 1), z: dz / (d || 1) }, cfg.knockback);
      hitAny = true;
    }
    this.events.emit('melee:swing', { hit: hitAny });
  }

  /** HUD snapshot for the ammo counter + weapon bar. */
  hudState() {
    return this.weapons.map((w, i) => ({
      id: w.config.id,
      name: w.config.name,
      icon: w.config.icon,
      slot: w.config.slot,
      active: i === this.index,
      mag: w.mag,
      reserve: w.reserve,
      reloading: w.reloading,
      reloadFrac: w.reloading ? 1 - w.reloadLeft / w.config.reloadTime : 0,
    }));
  }
}

function coneSpread(dir, degrees) {
  if (degrees <= 0) return dir.clone();
  const rad = degrees * Math.PI / 180;
  const u = Math.random(), v = Math.random();
  const theta = rad * Math.sqrt(u);
  const phi = v * Math.PI * 2;
  // Build an orthonormal basis around dir.
  const w = dir.clone().normalize();
  const a = Math.abs(w.y) < 0.95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const right = new THREE.Vector3().crossVectors(w, a).normalize();
  const up = new THREE.Vector3().crossVectors(right, w);
  return w.multiplyScalar(Math.cos(theta))
    .addScaledVector(right, Math.sin(theta) * Math.cos(phi))
    .addScaledVector(up, Math.sin(theta) * Math.sin(phi))
    .normalize();
}

function rayPoint(origin, dir, t) {
  return new THREE.Vector3(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t);
}
