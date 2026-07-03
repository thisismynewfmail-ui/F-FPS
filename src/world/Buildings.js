import * as THREE from '../../lib/three.module.js';

/**
 * Parametric building construction.
 *
 * Buildings are described by small spec objects (position, footprint, wall
 * material, roof type, door side...) and built from textured boxes. Walls
 * with a doorway are split into real segments so interiors are navigable.
 * Rotations are restricted to 90° steps, which keeps every collider a clean
 * AABB. UVs are scaled to world size (2 m per texture tile) so one shared
 * material per texture tiles correctly on every segment.
 */
const WALL_T = 0.32;
const DOOR_W = 1.5;
const DOOR_H = 2.3;
const TEXEL = 0.5; // uv units per metre

export class BuildingKit {
  constructor(texLib, collision, nav) {
    this.texLib = texLib;
    this.collision = collision;
    this.nav = nav;
    this.materials = new Map();
  }

  mat(texName, opts = {}) {
    const key = texName + JSON.stringify(opts);
    if (!this.materials.has(key)) {
      this.materials.set(key, new THREE.MeshLambertMaterial({ map: this.texLib.get(texName), ...opts }));
    }
    return this.materials.get(key);
  }

  box(w, h, d, texName) {
    const geo = new THREE.BoxGeometry(w, h, d);
    scaleBoxUVs(geo, w, h, d);
    return new THREE.Mesh(geo, this.mat(texName));
  }

  /**
   * Build a building from a spec:
   * { x, z, y (pad height), w, d, h, rot (0|90|180|270), wall, roof:'gable'|'flat',
   *   roofTex, floor, door:'N'|'S'|'E'|'W'|null (local side, +Z = S = front),
   *   windows:true, derelict:0..1, solid:false }
   * `solid: true` makes a non-enterable filler building (single collider).
   * Returns { group, lootPoints[], spawnPoints[], doorWorld }.
   */
  build(spec) {
    const { x, z, y, w, d, h } = spec;
    const rot = ((spec.rot || 0) % 360 + 360) % 360;
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = -rot * Math.PI / 180;
    const wallTex = spec.wall || 'brickRed';
    const derelict = spec.derelict ?? 0.3;
    const rand = mulberry32(Math.floor(x * 31 + z * 17 + w * 7) & 0x7fffffff);

    const lootPoints = [];
    const spawnPoints = [];

    // ---- walls ------------------------------------------------------
    // Local sides: S = +Z (front), N = -Z, E = +X, W = -X.
    const sides = [
      { id: 'S', cx: 0, cz: d / 2 - WALL_T / 2, len: w, axis: 'x' },
      { id: 'N', cx: 0, cz: -d / 2 + WALL_T / 2, len: w, axis: 'x' },
      { id: 'E', cx: w / 2 - WALL_T / 2, cz: 0, len: d, axis: 'z' },
      { id: 'W', cx: -w / 2 + WALL_T / 2, cz: 0, len: d, axis: 'z' },
    ];

    if (spec.solid) {
      const body = this.box(w, h, d, wallTex);
      body.position.y = h / 2;
      group.add(body);
      this._collideLocalBox(spec, rot, 0, 0, w / 2, h, d / 2);
    } else {
      for (const side of sides) {
        const hasDoor = spec.door === side.id;
        if (!hasDoor) {
          this._wallSegment(group, spec, rot, side, -side.len / 2, side.len / 2, 0, h, wallTex);
        } else {
          const doorOff = (spec.doorOffset ?? 0) * side.len * 0.5;
          const a = doorOff - DOOR_W / 2, b = doorOff + DOOR_W / 2;
          this._wallSegment(group, spec, rot, side, -side.len / 2, a, 0, h, wallTex);
          this._wallSegment(group, spec, rot, side, b, side.len / 2, 0, h, wallTex);
          this._wallSegment(group, spec, rot, side, a, b, DOOR_H, h - DOOR_H, wallTex, DOOR_H);
          // Door leaf hanging open against the inside wall.
          const leaf = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W * 0.95, DOOR_H * 0.95), this.mat('doorWood', { side: THREE.DoubleSide }));
          const s = side.axis === 'x' ? [a + 0.1, DOOR_H / 2, side.cz - Math.sign(side.cz) * 0.5] : [side.cx - Math.sign(side.cx) * 0.5, DOOR_H / 2, a + 0.1];
          leaf.position.set(s[0], s[1], s[2]);
          leaf.rotation.y = side.axis === 'x' ? Math.PI / 2.3 : 0.2;
          group.add(leaf);
        }
        // window quads on the outer face
        if (spec.windows !== false) {
          this._windows(group, side, h, rand, derelict, hasDoor ? (spec.doorOffset ?? 0) * side.len * 0.5 : null);
        }
      }

      // floor
      const floor = this.box(w - WALL_T, 0.1, d - WALL_T, spec.floor || 'floorWood');
      floor.position.y = 0.06;
      group.add(floor);

      lootPoints.push(local2world(spec, rot, 0, d / 4));
      spawnPoints.push(local2world(spec, rot, 0, -d / 4));
    }

    // ---- roof -------------------------------------------------------
    const roofTex = spec.roofTex || 'roofShingle';
    if ((spec.roof || 'gable') === 'gable') {
      this._gableRoof(group, w, d, h, roofTex, wallTex);
    } else {
      const slab = this.box(w + 0.4, 0.25, d + 0.4, roofTex);
      slab.position.y = h + 0.13;
      group.add(slab);
      for (const [px, pz, pw, pd] of [
        [0, d / 2 + 0.1, w + 0.4, 0.2], [0, -d / 2 - 0.1, w + 0.4, 0.2],
        [w / 2 + 0.1, 0, 0.2, d + 0.4], [-w / 2 - 0.1, 0, 0.2, d + 0.4],
      ]) {
        const lip = this.box(pw, 0.5, pd, wallTex);
        lip.position.set(px, h + 0.4, pz);
        group.add(lip);
      }
    }

    const doorWorld = spec.door
      ? local2world(spec, rot, spec.door === 'E' ? w / 2 : spec.door === 'W' ? -w / 2 : (spec.doorOffset ?? 0) * w * 0.5,
                    spec.door === 'S' ? d / 2 : spec.door === 'N' ? -d / 2 : (spec.doorOffset ?? 0) * d * 0.5)
      : null;

    return { group, lootPoints, spawnPoints, doorWorld };
  }

  _wallSegment(group, spec, rot, side, from, to, yBase, height, tex, lift = 0) {
    const len = to - from;
    if (len <= 0.05 || height <= 0.05) return;
    const mid = (from + to) / 2;
    const seg = this.box(side.axis === 'x' ? len : WALL_T, height, side.axis === 'x' ? WALL_T : len, tex);
    const lx = side.axis === 'x' ? mid : side.cx;
    const lz = side.axis === 'x' ? side.cz : mid;
    seg.position.set(lx, lift + height / 2, lz);
    group.add(seg);
    if (lift === 0) {
      // Only ground-level segments collide (lintels are overhead).
      this._collideLocalBox(spec, rot, lx, lz,
        side.axis === 'x' ? len / 2 : WALL_T / 2, height,
        side.axis === 'x' ? WALL_T / 2 : len / 2);
    }
  }

  _windows(group, side, h, rand, derelict, doorOff) {
    const usable = side.len - 2.4;
    const count = Math.max(0, Math.floor(usable / 3.6));
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count - 0.5;
      const at = t * usable;
      if (doorOff !== null && Math.abs(at - doorOff) < DOOR_W * 0.5 + 0.9) continue;
      const tex = rand() < derelict ? 'windowBroken' : 'window';
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.3), this.mat(tex));
      const out = Math.sign(side.cx + side.cz) * (WALL_T / 2 + 0.03);
      if (side.axis === 'x') {
        quad.position.set(at, Math.min(h - 1.1, 1.9), side.cz + out);
        if (side.cz < 0) quad.rotation.y = Math.PI;
      } else {
        quad.position.set(side.cx + out, Math.min(h - 1.1, 1.9), at);
        quad.rotation.y = side.cx > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      group.add(quad);
    }
  }

  _gableRoof(group, w, d, h, roofTex, wallTex) {
    const rise = Math.min(2.6, w * 0.3);
    const panelW = Math.hypot(w / 2 + 0.3, rise);
    for (const s of [-1, 1]) {
      const panel = this.box(panelW, 0.18, d + 0.6, roofTex);
      panel.position.set(s * (w / 4 + 0.05), h + rise / 2, 0);
      panel.rotation.z = -s * Math.atan2(rise, w / 2 + 0.3);
      group.add(panel);
    }
    // Triangular gable ends.
    for (const s of [-1, 1]) {
      const tri = new THREE.BufferGeometry();
      tri.setAttribute('position', new THREE.Float32BufferAttribute([
        -w / 2, h, 0, w / 2, h, 0, 0, h + rise, 0,
      ], 3));
      tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, w * TEXEL, 0, w * TEXEL / 2, rise * TEXEL], 2));
      tri.computeVertexNormals();
      const cap = new THREE.Mesh(tri, this.mat(wallTex, { side: THREE.DoubleSide }));
      cap.position.z = s * (d / 2 - WALL_T / 2);
      group.add(cap);
    }
  }

  _collideLocalBox(spec, rot, lx, lz, hx, height, hz) {
    // Rotate local center + swap extents; rot is one of 0/90/180/270.
    let wx = lx, wz = lz, ex = hx, ez = hz;
    if (rot === 90) { [wx, wz] = [lz, -lx]; [ex, ez] = [hz, hx]; }
    else if (rot === 180) { wx = -lx; wz = -lz; }
    else if (rot === 270) { [wx, wz] = [-lz, lx]; [ex, ez] = [hz, hx]; }
    const cx = spec.x + wx, cz = spec.z + wz;
    this.collision.addBox(cx - ex, spec.y, cz - ez, cx + ex, spec.y + height, cz + ez, 'wall');
    this.nav.blockBox(cx - ex, cz - ez, cx + ex, cz + ez);
  }
}

export function local2world(spec, rot, lx, lz) {
  let wx = lx, wz = lz;
  if (rot === 90) { wx = lz; wz = -lx; }
  else if (rot === 180) { wx = -lx; wz = -lz; }
  else if (rot === 270) { wx = -lz; wz = lx; }
  return { x: spec.x + wx, y: spec.y, z: spec.z + wz };
}

/** Scale a BoxGeometry's per-face UVs to world metres (2 m per tile). */
export function scaleBoxUVs(geo, w, h, d) {
  const uv = geo.attributes.uv;
  // BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z (4 verts each).
  const scales = [
    [d * TEXEL, h * TEXEL], [d * TEXEL, h * TEXEL],
    [w * TEXEL, d * TEXEL], [w * TEXEL, d * TEXEL],
    [w * TEXEL, h * TEXEL], [w * TEXEL, h * TEXEL],
  ];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * scales[f][0], uv.getY(i) * scales[f][1]);
    }
  }
  uv.needsUpdate = true;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
