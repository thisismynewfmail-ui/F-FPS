import * as THREE from '../../lib/three.module.js';

/**
 * Progressive zone unlock system.
 *
 * The town is divided into six districts radiating from Old Town Square.
 * Each locked district is sealed behind debris walls and striped barricades
 * placed across streets. When the cumulative kill count reaches a district's
 * threshold, its barriers rumble and sink into the ground — the world tells
 * the story, no popup. Colliders and nav blocks are removed at the same time.
 */
export const ZONES = [
  { id: 0, name: 'Old Town Square', kills: 0, rect: { minX: -45, maxX: 45, minZ: -45, maxZ: 45 } },
  { id: 1, name: 'Eastgate Residential', kills: 50, rect: { minX: 45, maxX: 240, minZ: -110, maxZ: 110 } },
  { id: 2, name: 'Downtown', kills: 150, rect: { minX: -140, maxX: 240, minZ: -245, maxZ: -45 } },
  { id: 3, name: 'Hollow Park', kills: 2500, rect: { minX: -245, maxX: -45, minZ: -45, maxZ: 110 } },
  { id: 4, name: 'Southside Industrial', kills: 4500, rect: { minX: -140, maxX: 240, minZ: 45, maxZ: 245 } },
  { id: 5, name: 'Chapel Ridge', kills: 7000, rect: { minX: -245, maxX: -140, minZ: -245, maxZ: -140 } },
];

// Axis-aligned barrier segments. `zone` = zone whose unlock clears them.
// `gate: true` renders the striped barricade (the "door" the world opens);
// others are collapsed-rubble walls.
const SEGMENTS = [
  { zone: 1, x1: 45, z1: -45, x2: 45, z2: 45, gate: true },      // Main St East
  { zone: 2, x1: -45, z1: -45, x2: 45, z2: -45, gate: true },    // North Ave
  { zone: 3, x1: -45, z1: -45, x2: -45, z2: 45, gate: true },    // Park Rd West
  { zone: 4, x1: -45, z1: 45, x2: 45, z2: 45, gate: true },      // Foundry Rd South
  { zone: 2, x1: 45, z1: -110, x2: 240, z2: -110 },
  { zone: 4, x1: 45, z1: 110, x2: 240, z2: 110 },
  { zone: 3, x1: -140, z1: -140, x2: -140, z2: -45 },
  { zone: 5, x1: -140, z1: -245, x2: -140, z2: -140, gate: true }, // Ridge Rd
  { zone: 5, x1: -245, z1: -140, x2: -140, z2: -140 },
  { zone: 4, x1: -245, z1: 110, x2: -45, z2: 110 },
  { zone: 3, x1: -140, z1: -45, x2: -45, z2: -45 },
  { zone: 4, x1: -45, z1: 45, x2: -45, z2: 110 },
  { zone: 4, x1: 45, z1: 45, x2: 45, z2: 110 },
  { zone: 2, x1: 45, z1: -110, x2: 45, z2: -45 },
  { zone: 3, x1: -45, z1: -110, x2: -45, z2: -45 },
];

const SINK_DEPTH = 4.5;
const SINK_TIME = 3.0;

export class Zones {
  constructor(events, propKit, collision, nav, terrain, scene) {
    this.events = events;
    this.collision = collision;
    this.nav = nav;
    this.unlocked = new Set([0]);
    this.sinking = [];
    this.barriers = new Map(); // zoneId -> [{group, colliderIds, navRect}]

    for (const seg of SEGMENTS) {
      const len = Math.hypot(seg.x2 - seg.x1, seg.z2 - seg.z1);
      const mx = (seg.x1 + seg.x2) / 2, mz = (seg.z1 + seg.z2) / 2;
      const yaw = Math.atan2(-(seg.z2 - seg.z1), seg.x2 - seg.x1);
      const g = (seg.gate ? propKit.barricadeGate(len) : propKit.rubbleWall(len, 2.8 + (seg.zone % 3) * 0.4)).group;
      propKit.place(g, mx, mz, { yaw });
      scene.add(g);

      const alongX = Math.abs(seg.x2 - seg.x1) > Math.abs(seg.z2 - seg.z1);
      const hx = alongX ? len / 2 : 1.2;
      const hz = alongX ? 1.2 : len / 2;
      const y = terrain.heightAt(mx, mz);
      const colliderId = collision.addBox(mx - hx, y - 1, mz - hz, mx + hx, y + 3.4, mz + hz, 'barrier');
      nav.blockBox(mx - hx, mz - hz, mx + hx, mz + hz);
      if (!this.barriers.has(seg.zone)) this.barriers.set(seg.zone, []);
      this.barriers.get(seg.zone).push({ group: g, colliderId, navRect: [mx - hx, mz - hz, mx + hx, mz + hz] });
    }

    events.on('kill', ({ total }) => this.checkUnlocks(total));
  }

  checkUnlocks(totalKills) {
    for (const z of ZONES) {
      if (z.kills > 0 && !this.unlocked.has(z.id) && totalKills >= z.kills) {
        this.unlock(z.id);
      }
    }
  }

  unlock(zoneId) {
    this.unlocked.add(zoneId);
    for (const b of this.barriers.get(zoneId) ?? []) {
      this.collision.remove(b.colliderId);
      this.nav.unblockBox(...b.navRect);
      this.sinking.push({ group: b.group, t: 0, y0: b.group.position.y });
    }
    const zone = ZONES[zoneId];
    this.events.emit('zone:unlock', { zone });
  }

  update(dt) {
    for (let i = this.sinking.length - 1; i >= 0; i--) {
      const s = this.sinking[i];
      s.t += dt / SINK_TIME;
      const k = Math.min(1, s.t);
      s.group.position.y = s.y0 - SINK_DEPTH * k * k;
      s.group.rotation.z = Math.sin(s.t * 23) * 0.01 * (1 - k); // shudder
      if (k >= 1) {
        s.group.parent?.remove(s.group);
        this.sinking.splice(i, 1);
      }
    }
  }

  isUnlocked(id) { return this.unlocked.has(id); }

  zoneAt(x, z) {
    // Zones overlap at seams; the most specific (smallest) wins.
    let best = ZONES[0], bestArea = Infinity;
    for (const zone of ZONES) {
      const r = zone.rect;
      if (x < r.minX || x > r.maxX || z < r.minZ || z > r.maxZ) continue;
      const area = (r.maxX - r.minX) * (r.maxZ - r.minZ);
      if (area < bestArea) { best = zone; bestArea = area; }
    }
    return best;
  }

  nextLocked() {
    for (const z of ZONES) if (!this.unlocked.has(z.id)) return z;
    return null;
  }
}

export function pointInRect(x, z, r) {
  return x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
}
