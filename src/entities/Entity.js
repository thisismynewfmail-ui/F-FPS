import * as THREE from '../../lib/three.module.js';

let nextId = 1;

/**
 * Base class for everything that lives in the world (player, zombies, NPCs,
 * pickups). Provides identity, transform, capsule dimensions and lifecycle.
 */
export class Entity {
  constructor() {
    this.id = nextId++;
    this.position = new THREE.Vector3();
    this.yaw = 0;
    this.radius = 0.4;
    this.height = 1.7;
    this.alive = true;
  }

  distanceTo(other) {
    const dx = this.position.x - other.position.x;
    const dz = this.position.z - other.position.z;
    return Math.hypot(dx, dz);
  }

  update(_dt, _ctx) {}
  dispose() {}
}
