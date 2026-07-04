import { Entity } from './Entity.js';
import { SpriteBillboard } from '../rendering/Billboard.js';

/**
 * Zombie AI: a small state machine over
 *   idle -> wandering -> alerted -> chasing -> attacking -> dead
 *
 * - Gunshots emit 'noise' events; nearby idle/wandering zombies investigate.
 * - Line-of-sight (buildings + terrain) triggers a chase.
 * - Chasing uses direct steering when the player is visible, A* on the nav
 *   grid otherwise (repaths on a timer, throttled by a global budget).
 * - Beyond the activity range zombies idle invisibly and cost nothing.
 */
const ACTIVE_RANGE = 115;
const DEATH_TIME = 1.6;

export class Zombie extends Entity {
  constructor(config, baseMaterial, world, events) {
    super();
    this.config = config;
    this.world = world;
    this.events = events;
    this.hp = config.hp;
    this.height = config.height * config.scale;
    this.radius = 0.42 * config.scale;
    this.state = 'idle';
    this.stateTime = Math.random() * 3;
    this.wanderTarget = null;
    this.alertPos = null;
    this.path = null;
    this.pathIndex = 0;
    this.repathTimer = 0;
    this.attackTimer = 0;
    this.windup = -1;
    this.deathTimer = 0;
    this.toRemove = false;
    this.lastSeenPlayer = 0;
    this.knockVX = 0;
    this.knockVZ = 0;
    this._losTimer = Math.random() * 0.3;
    this._hasLos = false;

    this.billboard = new SpriteBillboard(baseMaterial, this.height, 0.62);
    this.mesh = this.billboard.mesh;
  }

  placeAt(x, z) {
    const y = this.world.groundHeightFor(x, z, 1e9);
    this.position.set(x, y, z);
    this.yaw = Math.random() * Math.PI * 2;
    this.mesh.position.copy(this.position);
  }

  onNoise(pos, radius) {
    if (this.state === 'dead' || this.state === 'chasing' || this.state === 'attacking') return;
    const d = Math.hypot(pos.x - this.position.x, pos.z - this.position.z);
    if (d > radius) return;
    this.alertPos = { x: pos.x + (Math.random() - 0.5) * 6, z: pos.z + (Math.random() - 0.5) * 6 };
    this._setState('alerted');
  }

  takeDamage(amount, dir = null, knockback = 0) {
    if (this.state === 'dead') return false;
    this.hp -= amount;
    if (knockback > 0 && dir) {
      const k = knockback * (1 - this.config.knockbackResist);
      this.knockVX += dir.x * k;
      this.knockVZ += dir.z * k;
    }
    this.events.emit('zombie:hit', { pos: this.position.clone(), zombie: this });
    if (this.hp <= 0) {
      this._die();
      return true;
    }
    // Getting shot tells you where the shooter is.
    if (this.state === 'idle' || this.state === 'wandering' || this.state === 'alerted') {
      this._setState('chasing');
    }
    return false;
  }

  _die() {
    this.state = 'dead';
    this.deathTimer = 0;
    this.events.emit('zombie:death', {
      type: this.config,
      pos: this.position.clone(),
      points: this.config.points,
    });
  }

  _setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.stateTime = 0;
    if (s === 'chasing') this.events.emit('zombie:aggro', { pos: this.position.clone() });
  }

  update(dt, ctx) {
    const { player, camPos, pathBudget } = ctx;
    this.stateTime += dt;

    if (this.state === 'dead') {
      this.deathTimer += dt;
      this.billboard.deathPose(Math.min(1, this.deathTimer / DEATH_TIME));
      if (this.deathTimer >= DEATH_TIME) this.toRemove = true;
      return;
    }

    const dx = player.position.x - this.position.x;
    const dz = player.position.z - this.position.z;
    const dist = Math.hypot(dx, dz);

    // Dormant when far away: no AI, no rendering.
    if (dist > ACTIVE_RANGE) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;

    // Staggered line-of-sight checks.
    this._losTimer -= dt;
    if (this._losTimer <= 0) {
      this._losTimer = 0.25 + Math.random() * 0.15;
      this._hasLos = player.alive && dist < this.config.sightRange && this.world.hasLineOfSight(
        this.position.x, this.position.y + this.height * 0.8, this.position.z,
        player.position.x, player.position.y + 1.4, player.position.z,
      );
      if (this._hasLos) this.lastSeenPlayer = 0;
    }
    this.lastSeenPlayer += dt;
    // Close-range awareness regardless of walls' shadows.
    if (player.alive && dist < 4) this._hasLos = true;

    let moveX = 0, moveZ = 0, speed = 0, moving = false;

    switch (this.state) {
      case 'idle': {
        if (this._hasLos) { this._setState('chasing'); break; }
        if (this.stateTime > 2 + Math.random() * 3) {
          const a = Math.random() * Math.PI * 2;
          const r = 5 + Math.random() * 12;
          this.wanderTarget = { x: this.position.x + Math.cos(a) * r, z: this.position.z + Math.sin(a) * r };
          this._setState('wandering');
        }
        break;
      }
      case 'wandering': {
        if (this._hasLos) { this._setState('chasing'); break; }
        const t = this.wanderTarget;
        const wd = Math.hypot(t.x - this.position.x, t.z - this.position.z);
        if (wd < 1 || this.stateTime > 12) { this._setState('idle'); break; }
        moveX = (t.x - this.position.x) / wd;
        moveZ = (t.z - this.position.z) / wd;
        speed = this.config.wanderSpeed;
        moving = true;
        break;
      }
      case 'alerted': {
        if (this._hasLos) { this._setState('chasing'); break; }
        const t = this.alertPos;
        const ad = Math.hypot(t.x - this.position.x, t.z - this.position.z);
        if (ad < 2.5 || this.stateTime > 16) { this._setState('wandering'); this.wanderTarget = { x: this.position.x + 4, z: this.position.z + 4 }; break; }
        moveX = (t.x - this.position.x) / ad;
        moveZ = (t.z - this.position.z) / ad;
        speed = Math.min(this.config.chaseSpeed, this.config.wanderSpeed * 2.2);
        moving = true;
        break;
      }
      case 'chasing': {
        if (!player.alive) { this._setState('wandering'); break; }
        if (this.lastSeenPlayer > 9) {
          this.alertPos = { x: player.position.x, z: player.position.z };
          this._setState('alerted');
          break;
        }
        if (dist < this.config.reach && this._hasLos && Math.abs(player.position.y - this.position.y) < 1.6) {
          this._setState('attacking');
          this.windup = this.config.attackWindup;
          break;
        }
        speed = this.config.chaseSpeed;
        moving = true;
        if (this._hasLos || dist < 10) {
          moveX = dx / dist; moveZ = dz / dist;
          this.path = null;
        } else {
          this.repathTimer -= dt;
          if ((!this.path || this.repathTimer <= 0) && pathBudget.n > 0) {
            pathBudget.n--;
            this.repathTimer = 1.4 + Math.random() * 0.6;
            this.path = this.world.nav.findPath(this.position.x, this.position.z, player.position.x, player.position.z);
            this.pathIndex = 0;
          }
          if (this.path && this.pathIndex < this.path.length) {
            const [wx, wz] = this.path[this.pathIndex];
            const pd = Math.hypot(wx - this.position.x, wz - this.position.z);
            if (pd < 1.2) { this.pathIndex++; }
            else { moveX = (wx - this.position.x) / pd; moveZ = (wz - this.position.z) / pd; }
          } else {
            moveX = dx / dist; moveZ = dz / dist; // shamble hopefully
            speed *= 0.6;
          }
        }
        break;
      }
      case 'attacking': {
        this.yaw = Math.atan2(dx, dz);
        if (this.windup > 0) {
          this.windup -= dt;
          if (this.windup <= 0) {
            if (player.alive && dist < this.config.reach + 0.4 && Math.abs(player.position.y - this.position.y) < 1.8) {
              player.takeDamage(this.config.damage, this.position);
            }
            this.attackTimer = this.config.attackCooldown;
          }
        } else {
          this.attackTimer -= dt;
          if (this.attackTimer <= 0) {
            if (dist < this.config.reach && this._hasLos) this.windup = this.config.attackWindup;
            else this._setState('chasing');
          }
        }
        break;
      }
    }

    // --- integrate movement
    if (moving && speed > 0) {
      const slope = this.world.terrain.slopeAlong(this.position.x, this.position.z, moveX, moveZ);
      let s = speed;
      if (slope > 0.35) s /= 1 + (slope - 0.35) * 2;
      this.position.x += moveX * s * dt;
      this.position.z += moveZ * s * dt;
      this.yaw = Math.atan2(moveX, moveZ);
    }
    // knockback decay
    if (Math.abs(this.knockVX) + Math.abs(this.knockVZ) > 0.01) {
      this.position.x += this.knockVX * dt;
      this.position.z += this.knockVZ * dt;
      this.knockVX *= Math.pow(0.005, dt);
      this.knockVZ *= Math.pow(0.005, dt);
    }
    this.world.collision.resolveCapsule(this.position, this.radius, this.height);
    this.position.y = this.world.groundHeightFor(this.position.x, this.position.z, this.position.y + 0.5);

    // --- present
    this.mesh.position.copy(this.position);
    const anim = this.state === 'attacking'
      ? (this.windup > 0 ? true : false)
      : moving;
    this.billboard.update(dt, camPos, this.yaw, anim, this.config.walkFps * (this.state === 'chasing' ? 1.4 : 1));
  }

  dispose() {
    this.billboard.dispose();
  }
}
