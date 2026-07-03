import * as THREE from '../../lib/three.module.js';
import { Terrain, EDGE_LIMIT } from './Terrain.js';
import { CollisionWorld } from './Collision.js';
import { NavGrid } from './NavGrid.js';
import { BuildingKit, mulberry32 } from './Buildings.js';
import { PropKit } from './Props.js';
import { Vegetation } from './Vegetation.js';
import { Zones, ZONES } from './Zones.js';
import { Secrets } from './Secrets.js';

/**
 * Assembles the whole town: terrain, six districts of buildings, streets,
 * props, vegetation, zone barriers and secrets. Exposes the queries the rest
 * of the game needs: walkable ground height, surface type underfoot,
 * spawn/loot points and nearby interactables.
 *
 * District tour (kill-count unlock order):
 *   0 Old Town Square  — claustrophobic walled plaza, the starting hub
 *   1 Eastgate         — houses on a rolling knoll, picket fences
 *   2 Downtown         — dense graded city grid, the visual centerpiece
 *   3 Hollow Park      — ravine, pond and dense woods
 *   4 Southside        — flat industrial yards and warehouses
 *   5 Chapel Ridge     — a 16 m hill with a chapel and graveyard
 */
export class World {
  constructor(events, texLib, scene) {
    this.events = events;
    this.texLib = texLib;
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.terrain = new Terrain();
    this.collision = new CollisionWorld();
    this.nav = new NavGrid(this.terrain);
    this.kit = new BuildingKit(texLib, this.collision, this.nav);
    this.props = new PropKit(texLib, this.collision, this.nav, this.terrain);
    this.veg = new Vegetation(texLib, this.collision, this.nav, this.terrain);

    this.spawnPoints = [];   // {x, z, zone, indoor}
    this.lootPoints = [];    // {x, z, zone}
    this.surfaces = [];      // {minX,maxX,minZ,maxZ, surface}
    this.interactables = []; // {x, z, y, radius, prompt, onInteract, enabled}
    this.shootables = [];    // {x, y, z, r, onHit, active} — sphere bullet targets
    this.buildingSpecs = [];
    this.npcSpawn = { x: 3, z: 8 };
    this.playerSpawn = { x: 0, z: 20 };
  }

  build() {
    this._planBuildings();          // registers terrain pads
    this.group.add(this.terrain.buildMesh(this.texLib));
    this._roads();
    this._constructBuildings();
    this.zones = new Zones(this.events, this.props, this.collision, this.nav, this.terrain, this.group);
    this._oldTown();
    this._eastgate();
    this._downtown();
    this._park();
    this._industrial();
    this._ridge();
    this.nav.bake();
    this._spawnGrid();
    this.secrets = new Secrets(this);
    return this;
  }

  /* ---------------- queries ---------------- */

  groundHeightFor(x, z, y) { return this.terrain.groundHeightFor(x, z, y); }

  surfaceAt(x, z) {
    for (let i = this.surfaces.length - 1; i >= 0; i--) {
      const s = this.surfaces[i];
      if (x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ) return s.surface;
    }
    return 'grass';
  }

  addSurface(minX, minZ, maxX, maxZ, surface) {
    this.surfaces.push({ minX, maxX, minZ, maxZ, surface });
  }

  addShootable(s) {
    this.shootables.push({ active: true, ...s });
  }

  /**
   * Nearest active shootable target along a ray, or null.
   * Returns { target, dist }; caller invokes target.onHit() and deactivates
   * it when onHit returns true.
   */
  raycastShootables(origin, dir, maxDist) {
    let best = null, bestD = maxDist;
    for (const s of this.shootables) {
      if (!s.active) continue;
      const ox = s.x - origin.x, oy = s.y - origin.y, oz = s.z - origin.z;
      const t = ox * dir.x + oy * dir.y + oz * dir.z;
      if (t < 0 || t > bestD) continue;
      const px = origin.x + dir.x * t - s.x;
      const py = origin.y + dir.y * t - s.y;
      const pz = origin.z + dir.z * t - s.z;
      if (px * px + py * py + pz * pz <= s.r * s.r && t < bestD) {
        best = s; bestD = t;
      }
    }
    return best ? { target: best, dist: bestD } : null;
  }

  addInteractable(it) {
    this.interactables.push({ radius: 2.2, enabled: () => true, ...it });
    return it;
  }

  nearestInteractable(x, y, z) {
    let best = null, bestD = Infinity;
    for (const it of this.interactables) {
      if (!it.enabled()) continue;
      const d = Math.hypot(it.x - x, it.z - z) + Math.abs((it.y ?? y) - y) * 0.5;
      if (d < it.radius && d < bestD) { best = it; bestD = d; }
    }
    return best;
  }

  /** Line of sight between two points: buildings/props AND terrain. */
  hasLineOfSight(ax, ay, az, bx, by, bz) {
    if (this.collision.segmentBlocked(ax, ay, az, bx, by, bz)) return false;
    const dist = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(2, Math.floor(dist / 7));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const h = this.terrain.heightAt(ax + (bx - ax) * t, az + (bz - az) * t);
      if (h > ay + (by - ay) * t + 0.25) return false;
    }
    return true;
  }

  clampToWorld(pos) {
    pos.x = Math.max(-EDGE_LIMIT, Math.min(EDGE_LIMIT, pos.x));
    pos.z = Math.max(-EDGE_LIMIT, Math.min(EDGE_LIMIT, pos.z));
    return pos;
  }

  update(dt, time, cameraPos) {
    this.zones.update(dt);
    this.veg.update(time, cameraPos);
    this.secrets.update(dt);
  }

  /* ---------------- construction ---------------- */

  _spec(spec) {
    spec.y = this.terrain.padAtGrade(spec.x, spec.z, spec.w / 2 + 1, spec.d / 2 + 1);
    this.buildingSpecs.push(spec);
    return spec;
  }

  _planBuildings() {
    const S = (o) => this._spec(o);
    // --- Old Town (zone 0)
    S({ x: -18, z: -14, w: 12, d: 9, h: 4.6, wall: 'brickRed', roof: 'gable', door: 'S', name: 'tavern', zone: 0 });
    S({ x: 15, z: -17, w: 10, d: 8, h: 4.2, wall: 'wallWood', roof: 'flat', roofTex: 'roofMetal', door: 'S', name: 'store', zone: 0 });
    S({ x: -17, z: 13, w: 8, d: 7, h: 3.8, wall: 'wallPlaster', roof: 'gable', door: 'E', name: 'npcHouse', zone: 0 });
    S({ x: 14, z: 15, w: 5, d: 5, h: 14, wall: 'brickGray', roof: 'flat', solid: true, name: 'clocktower', zone: 0 });

    // --- Eastgate Residential (zone 1)
    const houseStyles = [
      ['brickRed', 'roofShingle'], ['wallWood', 'roofShingle'], ['wallPlaster', 'roofShingle'], ['brickGray', 'roofMetal'],
    ];
    const houses = [
      [70, -14, 'S', 0], [92, -16, 'S', 1], [116, -15, 'S', 2], [142, -18, 'S', 3],
      [70, 16, 'N', 2], [95, 18, 'N', 3], [120, 60, 'W', 1, true], [145, 16, 'N', 0],
      [92, -48, 'E', 1], [92, -74, 'E', 0], [128, -78, 'S', 2], [162, -48, 'W', 3],
      [110, 42, 'S', 0], [140, 68, 'N', 1], [172, 40, 'W', 2], [190, -20, 'S', 3, true],
    ];
    let hi = 0;
    for (const [hx, hz, door, style, solid] of houses) {
      const [wall, roofTex] = houseStyles[style];
      S({ x: hx, z: hz, w: 9 + (hi % 3), d: 7 + ((hi + 1) % 2) * 2, h: 3.8 + (hi % 2) * 0.5, wall, roofTex, roof: 'gable', door, solid: !!solid, name: 'house' + hi, zone: 1 });
      hi++;
    }
    S({ x: 150, z: -70, w: 10, d: 16, h: 6, wall: 'wallPlaster', roof: 'gable', door: 'S', name: 'church', zone: 1 });
    S({ x: 105, z: 30, w: 9, d: 7, h: 4, wall: 'brickRed', roof: 'flat', door: 'N', name: 'cornerShop', zone: 1 });

    // --- Downtown (zone 2): blocks between streets x=-100,-50,0 / z=-70,-120,-170,-220
    const blocks = [
      [-75, -95, 16, 12, 8, 'brickGray', 'S', 'library'],
      [-25, -92, 14, 11, 7, 'wallConcrete', 'S', 'office'],
      [-122, -95, 12, 10, 9, 'brickGray', 'E', 'apartmentA', true],
      [-75, -145, 13, 10, 8, 'wallPlaster', 'N', 'diner'],
      [-25, -145, 12, 10, 9, 'brickRed', 'W', 'apartmentB'],
      [-122, -145, 14, 11, 8, 'wallConcrete', 'E', 'theater', true],
      [-75, -195, 15, 12, 9, 'brickGray', 'S', 'department', true],
      [-25, -195, 12, 10, 7, 'wallPlaster', 'S', 'pawnShop'],
      [-122, -195, 12, 10, 8, 'brickRed', 'E', 'hotel', true],
      [22, -95, 12, 10, 7, 'brickGray', 'W', 'mannequinShop'],
      [22, -145, 13, 10, 8, 'wallConcrete', 'W', 'bank', true],
      [22, -195, 12, 10, 7, 'brickRed', 'W', 'arcade'],
    ];
    for (const [bx, bz, w, d, h, wall, door, name, solid] of blocks) {
      S({ x: bx, z: bz, w, d, h, wall, roof: 'flat', floor: 'floorTile', door, solid: !!solid, derelict: 0.45, name, zone: 2 });
    }
    // Downtown infill: extra buildings inside the blocks (clear of streets
    // at x=-100/-50/0 and z=-70/-120/-170/-220) so the grid reads dense.
    const infill = [
      [-88, -108, 9, 8, 8, 'brickRed'], [-12, -108, 8, 8, 7, 'wallPlaster'],
      [-60, -158, 8, 8, 9, 'wallConcrete'], [-38, -130, 8, 8, 8, 'brickGray'],
      [-134, -110, 8, 8, 7, 'wallPlaster'], [34, -128, 8, 8, 9, 'brickGray'],
      [-136, -178, 8, 8, 8, 'brickRed'], [-10, -180, 8, 8, 10, 'wallConcrete'],
    ];
    let fi = 0;
    for (const [bx, bz, w, d, h, wall] of infill) {
      S({ x: bx, z: bz, w, d, h, wall, roof: 'flat', solid: true, derelict: 0.5, name: 'infill' + fi++, zone: 2 });
    }

    // Northern outskirt farms (east of downtown grid)
    S({ x: 120, z: -160, w: 11, d: 8, h: 4, wall: 'wallWood', roof: 'gable', door: 'S', name: 'farmhouseA', zone: 2 });
    S({ x: 170, z: -190, w: 14, d: 10, h: 6, wall: 'wallWood', roof: 'gable', door: 'S', name: 'barn', zone: 2 });
    S({ x: 80, z: -200, w: 9, d: 7, h: 3.8, wall: 'wallPlaster', roof: 'gable', door: 'E', name: 'farmhouseB', zone: 2, solid: true });

    // --- Hollow Park (zone 3)
    S({ x: -135, z: 70, w: 8, d: 6, h: 3.6, wall: 'wallWood', roof: 'gable', roofTex: 'roofMetal', door: 'E', name: 'boathouse', zone: 3 });
    S({ x: -210, z: 20, w: 9, d: 7, h: 4, wall: 'brickGray', roof: 'gable', door: 'E', name: 'lodge', zone: 3 });

    // --- Southside Industrial (zone 4)
    S({ x: -60, z: 190, w: 24, d: 16, h: 8, wall: 'wallMetal', roof: 'flat', roofTex: 'roofMetal', floor: 'concrete', door: 'N', name: 'warehouseA', zone: 4 });
    S({ x: 0, z: 200, w: 26, d: 18, h: 9, wall: 'wallConcrete', roof: 'flat', roofTex: 'roofMetal', floor: 'concrete', door: 'N', name: 'warehouseB', zone: 4 });
    S({ x: 62, z: 185, w: 22, d: 15, h: 8, wall: 'wallMetal', roof: 'gable', roofTex: 'roofMetal', floor: 'concrete', door: 'N', name: 'warehouseC', zone: 4 });
    S({ x: 124, z: 195, w: 20, d: 14, h: 7, wall: 'wallConcrete', roof: 'flat', roofTex: 'roofMetal', floor: 'concrete', door: 'W', name: 'depot', zone: 4, solid: true });
    S({ x: 34, z: 122, w: 8, d: 6, h: 3.6, wall: 'wallConcrete', roof: 'flat', floor: 'floorTile', door: 'W', name: 'gasShop', zone: 4 });
    S({ x: -100, z: 150, w: 10, d: 8, h: 4.5, wall: 'brickRed', roof: 'flat', door: 'E', name: 'machineShop', zone: 4 });

    // --- Chapel Ridge (zone 5)
    S({ x: -195, z: -198, w: 12, d: 18, h: 7, wall: 'wallPlaster', roof: 'gable', door: 'S', name: 'chapel', zone: 5 });
    S({ x: -168, z: -170, w: 8, d: 6, h: 3.6, wall: 'brickGray', roof: 'gable', door: 'W', name: 'caretaker', zone: 5, solid: true });
  }

  _constructBuildings() {
    this.built = new Map();
    for (const spec of this.buildingSpecs) {
      const b = this.kit.build(spec);
      this.group.add(b.group);
      this.built.set(spec.name, { spec, ...b });
      for (const p of b.lootPoints) this.lootPoints.push({ x: p.x, z: p.z, zone: spec.zone });
      for (const p of b.spawnPoints) this.spawnPoints.push({ x: p.x, z: p.z, zone: spec.zone, indoor: true });
      // interior clutter for enterable buildings
      if (!spec.solid && spec.w >= 9) {
        const c = this.props.crateStack(2);
        const p = { x: spec.x + spec.w / 4, z: spec.z - spec.d / 4 };
        this.props.place(c.group, p.x, p.z, { collide: c.collide });
        this.group.add(c.group);
      }
    }
  }

  _road(points, tex, width, surface = 'road') {
    const mat = new THREE.MeshLambertMaterial({ map: this.texLib.tiled(tex, 1, 1) });
    const mesh = this.terrain.makeRibbon(points, width, mat);
    this.group.add(mesh);
    for (let i = 1; i < points.length; i++) {
      const [x1, z1] = points[i - 1], [x2, z2] = points[i];
      this.addSurface(Math.min(x1, x2) - width / 2, Math.min(z1, z2) - width / 2,
        Math.max(x1, x2) + width / 2, Math.max(z1, z2) + width / 2, surface);
    }
    return mesh;
  }

  _patch(x, z, hx, hz, tex, surface, repeat = 8) {
    const mat = new THREE.MeshLambertMaterial({ map: this.texLib.tiled(tex, repeat, repeat) });
    this.group.add(this.terrain.makePatch(x, z, hx, hz, mat));
    if (surface) this.addSurface(x - hx, z - hz, x + hx, z + hz, surface);
  }

  _roads() {
    // Old town cross
    this._road([[-45, 0], [-20, 0], [20, 0], [45, 0]], 'roadLine', 7);
    this._road([[0, -45], [0, -20], [0, 20], [0, 45]], 'roadLine', 7);
    // Main St East: curves over the knoll
    this._road([[45, 0], [90, 3], [140, 7], [190, 2], [232, -5]], 'roadLine', 7);
    // Eastgate loops
    this._road([[100, 0], [100, -30], [100, -60], [135, -62], [168, -60], [168, -30], [168, 0]], 'road', 5.5);
    this._road([[90, 5], [90, 45], [90, 80], [135, 82], [180, 80], [180, 40], [180, 8]], 'road', 5.5);
    // North Ave into downtown
    this._road([[0, -45], [0, -80], [-2, -120], [-2, -180], [0, -232]], 'roadLine', 8);
    // Downtown grid
    for (const sx of [-100, -50]) this._road([[sx, -60], [sx, -120], [sx, -180], [sx, -228]], 'road', 6.5);
    for (const sz of [-70, -120, -170, -220]) this._road([[-138, sz], [-90, sz], [-40, sz], [10, sz], [40, sz]], 'road', 6.5);
    // Downtown sidewalks
    for (const sx of [-100, -50, 0]) {
      for (const off of [-5.6, 5.6]) {
        this._road([[sx + off, -60], [sx + off, -140], [sx + off, -225]], 'sidewalk', 2.4, 'concrete');
      }
    }
    // Road to farms
    this._road([[10, -170], [60, -168], [120, -164], [168, -184]], 'road', 5);
    // Park Rd + trails
    this._road([[-45, 0], [-80, 6], [-118, 16]], 'road', 6);
    this._road([[-118, 16], [-140, 40], [-148, 70], [-150, 92]], 'gravel', 3.5, 'dirt');
    this._road([[-118, 16], [-160, 4], [-205, 18]], 'gravel', 3.5, 'dirt');
    // Foundry Rd South + service loop
    this._road([[0, 45], [0, 90], [0, 130], [0, 160]], 'roadLine', 7);
    this._road([[-120, 160], [-60, 160], [0, 160], [60, 160], [130, 160], [200, 162]], 'road', 6.5);
    // Ridge switchback
    this._road([[-140, -175], [-158, -182], [-172, -192], [-186, -200], [-196, -206], [-202, -198], [-198, -192]], 'gravel', 4.5, 'dirt');
    // Plazas
    this._patch(0, 0, 16, 16, 'sidewalk', 'concrete', 12);
    this._patch(-50, -145, 10, 8, 'sidewalk', 'concrete', 8);
    this._patch(30, 190, 90, 45, 'gravel', 'dirt', 40);        // industrial yard
    this._patch(30, 122, 12, 9, 'concrete', 'concrete', 8);   // gas station apron
  }

  _decal(tex, x, z, size, yaw = 0, tint = null) {
    const mat = new THREE.MeshLambertMaterial({
      map: this.texLib.get(tex), transparent: true, depthWrite: false,
      ...(tint ? { color: tint } : {}),
    });
    const q = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    q.rotation.set(-Math.PI / 2, 0, yaw);
    q.position.set(x, this.terrain.heightAt(x, z) + 0.1, z);
    q.renderOrder = 2;
    this.group.add(q);
    return q;
  }

  _prop(maker, x, z, opts = {}) {
    const p = maker;
    this.props.place(p.group, x, z, { collide: p.collide, ...opts });
    this.group.add(p.group);
    return p.group;
  }

  _oldTown() {
    const P = this.props;
    this._prop(P.well(), 0, 6);
    for (const [x, z] of [[-14, -6], [14, -6], [-14, 14], [14, 10]]) this._prop(P.lamppost(), x, z);
    // The lamp at the alley mouth casts a shadow the wrong way (secret #9
    // registers the trigger; this is the visual).
    this.wrongShadowLamp = this._prop(P.lamppost(), 22, -4);
    this._decal('shadowDecal', 23.5, -2.2, 3.2, 0.8); // sun comes from the west; this points west too
    for (const [x, z, yaw] of [[-6, 12, 0.3], [8, -10, -1.2]]) this._prop(P.bench(), x, z, { yaw });
    this._prop(P.wreckedCar(0x4a4238), -10, 26, { yaw: 0.4 });
    this._prop(P.crateStack(3), -24, -20);
    this._prop(P.mailbox(), -12, 10);
    // clock stuck at 3:33 on the tower
    const clock = new THREE.Mesh(new THREE.CircleGeometry(1.4, 16), new THREE.MeshBasicMaterial({ color: 0xd8d2c0 }));
    const t = this.built.get('clocktower');
    clock.position.set(t.spec.x, t.spec.y + 11.5, t.spec.z - 2.55);
    clock.rotation.y = Math.PI;
    this.group.add(clock);
    for (const [len, ang] of [[0.9, Math.PI * 0.85], [0.6, -Math.PI * 0.4]]) {
      const hand = new THREE.Mesh(new THREE.PlaneGeometry(0.12, len), new THREE.MeshBasicMaterial({ color: 0x1c1c22 }));
      hand.position.set(t.spec.x + Math.sin(ang) * len * 0.4, t.spec.y + 11.5 + Math.cos(ang) * len * 0.4, t.spec.z - 2.57);
      hand.rotation.set(0, Math.PI, ang);
      this.group.add(hand);
    }
    for (const [x, z] of [[-30, 30], [30, -32], [-34, -30], [32, 30], [26, 18], [-28, 4]]) this.veg.tree(this.group, x, z, 0.9);
    for (const [x, z] of [[-22, 24], [24, 24], [-26, -6]]) this.veg.bush(this.group, x, z);
    this._sprinkleTufts(0, 0, 40, 26, 42);
    this._zoneSpawns(0, 10, 26, 40);
  }

  _eastgate() {
    const P = this.props;
    const rng = mulberry32(11);
    // Fenced yards between neighbouring houses on the main row
    for (const [x1, z1, x2, z2] of [[64, -8, 64, -22], [104, -8, 104, -24], [130, -8, 130, -24], [82, 10, 82, 26], [132, 10, 132, 26]]) {
      this.props.fenceRun(x1, z1, x2, z2, this.group);
    }
    for (const [x, z, yaw] of [[80, -4, 0.1], [125, 4, -0.15], [160, -6, 0.5], [96, 60, 1.2]]) {
      this._prop(P.wreckedCar([0x5a3b34, 0x39465e, 0x4c5548][Math.floor(rng() * 3)]), x, z, { yaw });
    }
    for (const [x, z] of [[60, -8], [110, -8], [160, 8], [92, 34], [150, 60]]) this._prop(P.utilityPole(), x, z);
    for (const [x, z] of [[75, -10], [98, 12], [138, -12], [118, 52]]) this._prop(P.mailbox(), x, z);
    this._prop(P.busStop(), 55, 6, { yaw: Math.PI });
    // Church graveyard
    for (let i = 0; i < 8; i++) {
      const gx = 138 + (i % 4) * 3.2, gz = -84 - Math.floor(i / 4) * 3;
      const stone = P.box(0.7, 1.0, 0.18, 'brickGray');
      const g = new THREE.Group(); g.add(stone); stone.position.y = 0.5;
      this._prop({ group: g }, gx, gz);
    }
    // Trees + bushes over the knoll
    for (let i = 0; i < 38; i++) {
      const x = 55 + rng() * 175, z = -100 + rng() * 200;
      if (this._nearBuilding(x, z, 6) || this.surfaceAt(x, z) !== 'grass') continue;
      if (rng() < 0.65) this.veg.tree(this.group, x, z, 0.8 + rng() * 0.5);
      else this.veg.bush(this.group, x, z, 0.8 + rng() * 0.5);
    }
    this._sprinkleTufts(140, 0, 95, 100, 70);
    this._zoneSpawns(1, 16, 60, 190, 0, 0);
  }

  _downtown() {
    const P = this.props;
    const rng = mulberry32(22);
    // Intersections: traffic lights, crosswalks, hydrants, manholes
    for (const ix of [-100, -50, 0]) {
      for (const iz of [-70, -120, -170, -220]) {
        if (rng() < 0.7) this._prop(P.trafficLight(), ix + 4.5, iz + 4.5, { yaw: rng() * 6 });
        this._decal('crosswalk', ix, iz - 5.5, 6, 0);
        this._decal('crosswalk', ix - 5.5, iz, 6, Math.PI / 2);
        if (rng() < 0.5) this._prop(P.hydrant(), ix - 4.5, iz + 5);
        if (rng() < 0.8) this._decal('manhole', ix + 2 + rng() * 3, iz + 2, 1.1);
        // trees force through the cracked pavement
        if (rng() < 0.55) this.veg.tree(this.group, ix - 4 - rng() * 3, iz - 4 - rng() * 3, 0.7 + rng() * 0.3);
      }
    }
    // The odd manhole (secret #7) sits mid-block, greener than the rest.
    this.oddManhole = this._decal('manhole', -20, -95, 1.15, 0.3, 0x9fdf9f);
    for (const [x, z, yaw] of [[-70, -75, 0.2], [-30, -122, 1.7], [-104, -168, 0.1], [-55, -218, -0.3], [8, -100, 1.6], [-96, -122, 0.4]]) {
      this._prop(P.wreckedCar([0x6b3232, 0x39465e, 0x555c46, 0x694f28][Math.floor(rng() * 4)]), x, z, { yaw });
    }
    for (const [x, z] of [[-88, -95, 0], [-38, -145, 0], [-88, -195, 0], [10, -170, 0]]) this._prop(P.busStop(), x, z);
    for (const [x, z] of [[-63, -108], [-37, -132], [-110, -132], [-63, -182], [-12, -108], [-110, -182]]) this._prop(P.dumpster(), x, z, { yaw: rng() });
    for (const [x, z] of [[-95, -75], [-45, -75], [-95, -165], [-45, -165], [5, -125], [5, -215]]) this._prop(P.lamppost(), x, z);
    for (let i = 0; i < 8; i++) this._prop(P.signPost([0x6b7280, 0x7a3b30, 0x39586b][i % 3]), -115 + i * 17, -76 - (i % 3) * 47);
    // Fountain plaza
    this._prop(P.well(), -50, -145);
    for (const [x, z, yaw] of [[-56, -140, 0.6], [-44, -150, -2.2], [-57, -150, 2.4]]) this._prop(P.bench(), x, z, { yaw });
    // Vines climb the north faces (away from the dying sun)
    for (const name of ['library', 'diner', 'apartmentB', 'hotel', 'department']) {
      const b = this.built.get(name);
      if (!b) continue;
      const s = b.spec;
      for (let i = 0; i < 2; i++) {
        this.veg.vine(this.group, s.x - s.w / 4 + i * (s.w / 2), s.y + 0.4, s.z - s.d / 2 - 0.06, Math.PI, Math.min(4, s.h - 1));
      }
    }
    // Theater marquee
    const th = this.built.get('theater');
    const marquee = P.box(8, 1.4, 2.2, P.colorMat(0x5e2430));
    marquee.position.set(th.spec.x + th.spec.w / 2 + 1.1, th.spec.y + 4.6, th.spec.z);
    this.group.add(marquee);
    // Farms NE
    this._prop(P.wreckedCar(0x694f28), 130, -168, { yaw: 0.2 });
    for (const [x1, z1, x2, z2] of [[105, -150, 105, -175], [105, -175, 140, -178]]) this.props.fenceRun(x1, z1, x2, z2, this.group);
    const rng2 = mulberry32(33);
    for (let i = 0; i < 26; i++) {
      const x = 60 + rng2() * 170, z = -235 + rng2() * 100;
      if (this._nearBuilding(x, z, 6) || this.surfaceAt(x, z) !== 'grass') continue;
      this.veg.tree(this.group, x, z, 0.9 + rng2() * 0.6);
    }
    this._sprinkleTufts(-60, -145, 80, 90, 60);
    this._sprinkleTufts(140, -180, 90, 60, 40);
    this._zoneSpawns(2, 20, -60, -140, 0, 0);
  }

  _park() {
    const P = this.props;
    const rng = mulberry32(44);
    // Pond in the ravine
    const pond = new THREE.Mesh(
      new THREE.CircleGeometry(16, 24),
      new THREE.MeshLambertMaterial({ map: this.texLib.tiled('water', 6, 6), transparent: true, opacity: 0.92 })
    );
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(-150, this.terrain.heightAt(-150, 85) + 0.45, 85);
    this.group.add(pond);
    this.addSurface(-166, 69, -134, 101, 'water');
    // Bandstand
    const band = new THREE.Group();
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.2, 0.5, 10), this.kit.mat('floorWood'));
    deck.position.y = 0.25;
    band.add(deck);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const post = P.box(0.16, 2.6, 0.16, 'wallWood');
      post.position.set(Math.cos(a) * 3.4, 1.55, Math.sin(a) * 3.4);
      band.add(post);
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.6, 1.6, 10), this.kit.mat('roofShingle'));
    roof.position.y = 3.4;
    band.add(roof);
    this.props.place(band, -120, 20);
    this.group.add(band);
    this.terrain.addPlatform(-124, -116, 16, 24, this.terrain.heightAt(-120, 20) + 0.5);
    for (const [x, z, yaw] of [[-112, 26, 0.9], [-126, 12, -0.8], [-95, 8, 0.2], [-140, 45, 1.9]]) this._prop(P.bench(), x, z, { yaw });
    this._prop(P.wreckedCar(0x555c46), -70, 10, { yaw: -0.3 });
    // Rocks along the ravine lip
    for (const [x, z, s] of [[-172, 62, 1.6], [-128, 70, 1.3], [-166, 105, 1.8], [-134, 104, 1.2]]) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), this.kit.mat('rock'));
      const g = new THREE.Group(); g.add(rock); rock.position.y = s * 0.5;
      this._prop({ group: g, collide: [s * 0.8, s * 0.7, s * 0.8] }, x, z, { yaw: rng() * 3 });
    }
    // Dense woods — including the ring that hides the campsite (secret #8)
    for (let i = 0; i < 60; i++) {
      const x = -240 + rng() * 190, z = -130 + rng() * 230;
      if (this._nearBuilding(x, z, 6) || this.surfaceAt(x, z) !== 'grass') continue;
      if (Math.hypot(x + 200, z + 40) < 9) continue; // campsite clearing
      this.veg.tree(this.group, x, z, 0.9 + rng() * 0.7);
      if (rng() < 0.4) this.veg.bush(this.group, x + 2, z + 1, 0.7 + rng() * 0.5);
    }
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 5.5) {
      this.veg.tree(this.group, -200 + Math.cos(a) * 11, -40 + Math.sin(a) * 11, 1.2);
    }
    this._prop(P.tent(), -202, -42, { yaw: 0.6 });
    this._prop(P.campfire(), -197, -38);
    this._prop(P.crateStack(2), -204, -36);
    this._sprinkleTufts(-140, 20, 100, 120, 110);
    this._zoneSpawns(3, 18, -150, 0, 0, 0);
  }

  _industrial() {
    const P = this.props;
    const rng = mulberry32(55);
    // Gas station canopy
    const canopy = new THREE.Group();
    for (const [px, pz] of [[-5, -2.5], [5, -2.5], [-5, 2.5], [5, 2.5]]) {
      const pillar = P.box(0.4, 4.5, 0.4, 'wallConcrete');
      pillar.position.set(px, 2.25, pz);
      canopy.add(pillar);
      this.collision.addBoxCentered(24 + px, this.terrain.heightAt(24, 122) + 2.25, 122 + pz, 0.3, 2.25, 0.3, 'prop');
    }
    const slab = P.box(14, 0.4, 8, 'roofMetal');
    slab.position.y = 4.7;
    canopy.add(slab);
    this.props.place(canopy, 24, 122);
    this.group.add(canopy);
    for (const [x, z] of [[21, 121], [27, 121]]) { // dead pumps
      const pump = P.box(0.8, 1.6, 0.5, P.colorMat(0x7a2a24));
      const g = new THREE.Group(); g.add(pump); pump.position.y = 0.8;
      this._prop({ group: g, collide: [0.5, 0.9, 0.4] }, x, z);
    }
    this._prop(P.dumpster(), 40, 118, { yaw: 0.2 }); // the key hides behind this one
    // Yard clutter
    for (const [x, z] of [[-30, 175], [-20, 210], [30, 170], [90, 205], [45, 215], [100, 170], [-80, 205]]) {
      this._prop(P.crateStack(2 + Math.floor(rng() * 3)), x, z, { yaw: rng() });
    }
    for (const [x, z] of [[-40, 165], [20, 178], [70, 168], [110, 210], [-70, 172]]) this._prop(P.barrel(), x, z);
    for (const [x, z, yaw] of [[-15, 155, 0.1], [55, 158, 1.8], [140, 165, -0.2]]) this._prop(P.wreckedCar(0x4c5548), x, z, { yaw });
    for (let i = 0; i < 7; i++) this._prop(P.utilityPole(), -110 + i * 42, 152);
    for (const [x1, z1, x2, z2] of [[-120, 232, 40, 236], [70, 234, 180, 232]]) this.props.fenceRun(x1, z1, x2, z2, this.group);
    // scraggly weeds through the yard cracks
    this._sprinkleTufts(30, 190, 85, 40, 60);
    for (let i = 0; i < 8; i++) {
      const x = -130 + rng() * 80, z = 120 + rng() * 100;
      if (this._nearBuilding(x, z, 7) || this.surfaceAt(x, z) !== 'grass') continue;
      this.veg.tree(this.group, x, z, 0.7 + rng() * 0.4);
    }
    this._zoneSpawns(4, 18, 20, 180, 0, 0);
  }

  _ridge() {
    const P = this.props;
    const rng = mulberry32(66);
    const chapel = this.built.get('chapel');
    // Bell tower attached to the chapel front
    const s = chapel.spec;
    const towerX = s.x, towerZ = s.z + s.d / 2 + 2.5;
    const towerY = s.y;
    const tower = P.box(4, 11, 4, 'wallPlaster');
    const tg = new THREE.Group();
    tower.position.y = 5.5;
    tg.add(tower);
    for (const [px, pz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
      const post = P.box(0.3, 2.2, 0.3, 'wallWood');
      post.position.set(px, 12.1, pz);
      tg.add(post);
    }
    const spire = new THREE.Mesh(new THREE.ConeGeometry(3, 2.6, 4), this.kit.mat('roofShingle'));
    spire.position.y = 14.5;
    spire.rotation.y = Math.PI / 4;
    tg.add(spire);
    // The bell (shootable secret #3)
    this.bell = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.75, 1.0, 8), this.kit.mat('metalRust'));
    this.bell.position.y = 11.9;
    tg.add(this.bell);
    tg.position.set(towerX, towerY, towerZ);
    this.group.add(tg);
    this.bellWorld = { x: towerX, y: towerY + 11.9, z: towerZ, r: 1.0 };
    this.collision.addBoxCentered(towerX, towerY + 5.5, towerZ, 2, 5.5, 2, 'wall');
    this.nav.blockBox(towerX - 2, towerZ - 2, towerX + 2, towerZ + 2);
    // Graveyard
    for (let i = 0; i < 14; i++) {
      const gx = -215 + (i % 5) * 4, gz = -178 + Math.floor(i / 5) * 4.5;
      const stone = P.box(0.7, 1.1, 0.2, 'brickGray');
      const g = new THREE.Group(); g.add(stone); stone.position.y = 0.55;
      this._prop({ group: g }, gx, gz, { yaw: (rng() - 0.5) * 0.4 });
    }
    this.props.fenceRun(-220, -172, -220, -196, this.group);
    this.props.fenceRun(-220, -196, -204, -196, this.group);
    // Bare dead trees
    for (let i = 0; i < 12; i++) {
      const x = -240 + rng() * 95, z = -240 + rng() * 95;
      if (this._nearBuilding(x, z, 7)) continue;
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.22, 3.4, 5), this.veg.barkMat);
      trunk.position.y = 1.7;
      g.add(trunk);
      for (let b = 0; b < 3; b++) {
        const br = P.box(1.4, 0.09, 0.09, 'bark');
        br.position.set(0.4 - rng() * 0.8, 2 + rng() * 1.2, 0);
        br.rotation.z = 0.4 + rng() * 0.6;
        br.rotation.y = rng() * 3;
        g.add(br);
      }
      this._prop({ group: g, collide: [0.25, 1.7, 0.25] }, x, z);
    }
    this._sprinkleTufts(-195, -195, 45, 45, 30);
    this._zoneSpawns(5, 10, -195, -195, 0, 0);
  }

  _nearBuilding(x, z, margin) {
    for (const s of this.buildingSpecs) {
      if (Math.abs(x - s.x) < s.w / 2 + margin && Math.abs(z - s.z) < s.d / 2 + margin) return true;
    }
    return false;
  }

  _sprinkleTufts(cx, cz, hx, hz, count) {
    const rng = mulberry32(Math.floor(cx * 3 + cz * 7));
    const pts = [];
    for (let i = 0; i < count; i++) {
      const x = cx + (rng() - 0.5) * 2 * hx, z = cz + (rng() - 0.5) * 2 * hz;
      if (this._nearBuilding(x, z, 1)) continue;
      pts.push([x, z]);
    }
    if (pts.length) this.veg.tuftField(this.group, pts);
  }

  /** Outdoor spawn points scattered through a zone (off nav-blocked cells). */
  _zoneSpawns(zone, count, cx, cz) {
    const r = ZONES[zone].rect;
    const rng = mulberry32(zone * 97 + 13);
    let placed = 0, tries = 0;
    while (placed < count && tries++ < count * 20) {
      const x = r.minX + 6 + rng() * (r.maxX - r.minX - 12);
      const z = r.minZ + 6 + rng() * (r.maxZ - r.minZ - 12);
      if (this._nearBuilding(x, z, 2)) continue;
      this.spawnPoints.push({ x, z, zone, indoor: false });
      placed++;
    }
  }

  _spawnGrid() {
    // Drop spawn points that ended up on blocked nav cells.
    this.spawnPoints = this.spawnPoints.filter((p) => {
      const cx = this.nav.toCell(p.x), cz = this.nav.toCell(p.z);
      return p.indoor || !this.nav.isBlocked(cx, cz);
    });
  }
}
