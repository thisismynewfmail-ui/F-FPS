import * as THREE from '../../lib/three.module.js';

/**
 * Visual feedback: pooled particle systems (blood, dust), muzzle light and
 * screen shake. Particles are two THREE.Points clouds with preallocated
 * buffers — spawning recycles the oldest slot, so there is no allocation
 * (and no GC hitching) during combat.
 */
class ParticlePool {
  constructor(scene, texture, count, { size, color, gravity, drag }) {
    this.count = count;
    this.gravity = gravity;
    this.drag = drag;
    this.positions = new Float32Array(count * 3).fill(-9999);
    this.velocities = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6); // skip culling math
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      map: texture, size, color, transparent: true, alphaTest: 0.15,
      depthWrite: false, sizeAttenuation: true,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  spawn(pos, n, speed, upBias, lifeSec) {
    for (let i = 0; i < n; i++) {
      const idx = this.cursor;
      this.cursor = (this.cursor + 1) % this.count;
      const o = idx * 3;
      this.positions[o] = pos.x + (Math.random() - 0.5) * 0.2;
      this.positions[o + 1] = pos.y + (Math.random() - 0.5) * 0.2;
      this.positions[o + 2] = pos.z + (Math.random() - 0.5) * 0.2;
      this.velocities[o] = (Math.random() - 0.5) * speed;
      this.velocities[o + 1] = Math.random() * speed * upBias;
      this.velocities[o + 2] = (Math.random() - 0.5) * speed;
      this.life[idx] = lifeSec * (0.6 + Math.random() * 0.4);
    }
  }

  update(dt) {
    let dirty = false;
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      dirty = true;
      this.life[i] -= dt;
      const o = i * 3;
      if (this.life[i] <= 0) {
        this.positions[o + 1] = -9999;
        continue;
      }
      this.velocities[o + 1] -= this.gravity * dt;
      const drag = Math.pow(this.drag, dt);
      this.velocities[o] *= drag;
      this.velocities[o + 2] *= drag;
      this.positions[o] += this.velocities[o] * dt;
      this.positions[o + 1] += this.velocities[o + 1] * dt;
      this.positions[o + 2] += this.velocities[o + 2] * dt;
    }
    if (dirty) this.points.geometry.attributes.position.needsUpdate = true;
  }
}

export class Effects {
  constructor(events, scene, texLib, player) {
    this.events = events;
    this.player = player;
    this.blood = new ParticlePool(scene, texLib.get('blood'), 360,
      { size: 0.22, color: 0xffffff, gravity: 12, drag: 0.2 });
    this.dust = new ParticlePool(scene, texLib.get('smoke'), 96,
      { size: 0.5, color: 0xbbb6a8, gravity: -0.4, drag: 0.12 });

    this.shake = 0;
    this.muzzleLight = new THREE.PointLight(0xffc860, 0, 14);
    scene.add(this.muzzleLight);

    events.on('zombie:hit', ({ pos }) => {
      this.blood.spawn({ x: pos.x, y: pos.y + 1.1, z: pos.z }, 7, 3.2, 0.9, 0.7);
    });
    events.on('zombie:death', ({ pos }) => {
      this.blood.spawn({ x: pos.x, y: pos.y + 0.9, z: pos.z }, 14, 4.2, 1.1, 0.9);
    });
    events.on('impact', ({ pos }) => this.dust.spawn(pos, 4, 1.4, 1.4, 0.5));
    events.on('secret:rubble', (pos) => this.dust.spawn(pos, 30, 3, 1.2, 1.2));
    events.on('weapon:fire', ({ weapon }) => {
      this.addShake(weapon.config.kick * 0.012);
      if (!weapon.isMelee) this.flashMuzzle();
    });
    events.on('player:damage', ({ amount }) => this.addShake(Math.min(0.09, amount * 0.004)));
    events.on('zone:unlock', () => this.addShake(0.08));
    events.on('secret:bell', () => this.addShake(0.03));
  }

  addShake(amount) {
    this.shake = Math.min(0.14, this.shake + amount);
  }

  flashMuzzle() {
    const eye = this.player.eyePosition();
    const dir = this.player.lookDirection();
    this.muzzleLight.position.set(eye.x + dir.x * 1.2, eye.y + dir.y * 1.2 - 0.2, eye.z + dir.z * 1.2);
    this.muzzleLight.intensity = 18;
  }

  /** Camera-space jitter consumed by Player.applyCamera. */
  shakeOffset() {
    if (this.shake <= 0.0005) return null;
    const s = this.shake;
    return {
      x: (Math.random() - 0.5) * s * 1.6,
      y: (Math.random() - 0.5) * s * 1.6,
      z: 0,
      yaw: (Math.random() - 0.5) * s * 0.35,
      roll: (Math.random() - 0.5) * s * 0.3,
    };
  }

  update(dt) {
    this.blood.update(dt);
    this.dust.update(dt);
    this.shake = Math.max(0, this.shake - dt * 0.35);
    this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 220);
  }
}
