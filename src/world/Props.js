import * as THREE from '../../lib/three.module.js';
import { scaleBoxUVs } from './Buildings.js';

/**
 * Environmental props: wrecked cars, street furniture, debris, barriers.
 * Each factory returns a THREE.Group positioned by the caller via place();
 * solid props register AABB colliders + nav blocks.
 */
export class PropKit {
  constructor(texLib, collision, nav, terrain) {
    this.texLib = texLib;
    this.collision = collision;
    this.nav = nav;
    this.terrain = terrain;
    this.mats = new Map();
  }

  mat(tex, opts = {}) {
    const key = tex + JSON.stringify(opts);
    if (!this.mats.has(key)) {
      const m = new THREE.MeshLambertMaterial({ map: this.texLib.get(tex), ...opts });
      this.mats.set(key, m);
    }
    return this.mats.get(key);
  }

  colorMat(hex) {
    const key = 'c' + hex;
    if (!this.mats.has(key)) this.mats.set(key, new THREE.MeshLambertMaterial({ color: hex }));
    return this.mats.get(key);
  }

  box(w, h, d, tex) {
    const geo = new THREE.BoxGeometry(w, h, d);
    scaleBoxUVs(geo, w, h, d);
    return new THREE.Mesh(geo, typeof tex === 'string' ? this.mat(tex) : tex);
  }

  /** Drop a group on the terrain at (x, z); registers collider if solid.
   *  `nav: false` keeps the collider but leaves the nav grid open — used for
   *  interior furniture so room-scale pathing stays possible (steering
   *  handles the local avoidance). */
  place(group, x, z, { collide = null, yaw = 0, lift = 0, nav = true } = {}) {
    const y = this.terrain.heightAt(x, z) + lift;
    group.position.set(x, y, z);
    group.rotation.y = yaw;
    if (collide) {
      const [hx, hy, hz] = collide;
      this.collision.addBoxCentered(x, y + hy, z, hx, hy, hz, 'prop');
      if (nav) this.nav.blockBox(x - hx, z - hz, x + hx, z + hz);
    }
    return group;
  }

  // Untextured-by-design props use flat colors (geometry ready for future
  // texturing per the spec).
  wreckedCar(paint = 0x5a3b34) {
    const g = new THREE.Group();
    const body = this.box(4.2, 0.9, 1.9, this.colorMat(paint));
    body.position.y = 0.65;
    const cabin = this.box(2.2, 0.7, 1.7, this.colorMat(0x22262b));
    cabin.position.set(-0.2, 1.4, 0);
    g.add(body, cabin);
    for (const [wx, wz] of [[-1.4, 1], [1.4, 1], [-1.4, -1], [1.4, -1]]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.25, 8), this.colorMat(0x14161a));
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx, 0.3, wz * 0.95);
      g.add(wheel);
    }
    return { group: g, collide: [2.2, 1.0, 1.1] };
  }

  lamppost() {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 4.6, 6), this.colorMat(0x2c3036));
    pole.position.y = 2.3;
    const arm = this.box(1.1, 0.12, 0.12, this.colorMat(0x2c3036));
    arm.position.set(0.5, 4.5, 0);
    const head = this.box(0.5, 0.22, 0.3, new THREE.MeshBasicMaterial({ color: 0xffdf9a }));
    head.position.set(0.95, 4.4, 0);
    g.add(pole, arm, head);
    return { group: g, collide: [0.16, 2.3, 0.16] };
  }

  trafficLight() {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.6, 6), this.colorMat(0x23262b));
    pole.position.y = 1.8;
    const housing = this.box(0.34, 0.95, 0.3, this.colorMat(0x1a1d21));
    housing.position.y = 3.2;
    g.add(pole, housing);
    let i = 0;
    for (const c of [0x571f1f, 0x574a1f, 0x1f5724]) { // dead lights
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 8), this.colorMat(c));
      lamp.rotation.x = Math.PI / 2;
      lamp.position.set(0, 3.5 - i * 0.28, 0.16);
      g.add(lamp); i++;
    }
    return { group: g, collide: [0.14, 1.8, 0.14] };
  }

  hydrant() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.75, 8), this.colorMat(0x8c2a22));
    body.position.y = 0.38;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), this.colorMat(0x7a241e));
    cap.position.y = 0.8;
    g.add(body, cap);
    return { group: g, collide: [0.25, 0.5, 0.25] };
  }

  bench() {
    const g = new THREE.Group();
    const seat = this.box(1.8, 0.08, 0.5, 'wallWood');
    seat.position.y = 0.45;
    const back = this.box(1.8, 0.5, 0.08, 'wallWood');
    back.position.set(0, 0.75, -0.22);
    for (const s of [-0.75, 0.75]) {
      const leg = this.box(0.08, 0.45, 0.5, this.colorMat(0x2c3036));
      leg.position.set(s, 0.22, 0);
      g.add(leg);
    }
    g.add(seat, back);
    return { group: g, collide: [0.95, 0.5, 0.35] };
  }

  dumpster() {
    const g = new THREE.Group();
    const body = this.box(2.2, 1.25, 1.3, 'metalRust');
    body.position.y = 0.72;
    const lid = this.box(2.2, 0.1, 1.3, this.colorMat(0x2e4433));
    lid.position.set(0, 1.38, -0.15);
    lid.rotation.x = -0.25;
    g.add(body, lid);
    return { group: g, collide: [1.1, 0.9, 0.7] };
  }

  barrel() {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 1.0, 10), this.mat('metalRust'));
    b.position.y = 0.5;
    g.add(b);
    return { group: g, collide: [0.4, 0.6, 0.4] };
  }

  crateStack(n = 2) {
    const g = new THREE.Group();
    for (let i = 0; i < n; i++) {
      const c = this.box(1.1, 1.1, 1.1, 'crate');
      c.position.set((i % 2) * 0.3 - 0.15, 0.56 + i * 0.02 + (i > 0 ? 1.1 * Math.floor(i / 2) : 0), (i % 2) * -0.4);
      if (i % 2) c.rotation.y = 0.4;
      g.add(c);
    }
    return { group: g, collide: [0.9, 1.0, 0.9] };
  }

  /** Long low debris wall used for zone frontiers. len along X before yaw. */
  rubbleWall(len, height = 2.6) {
    const g = new THREE.Group();
    const core = this.box(len, height, 1.6, 'rubble');
    core.position.y = height / 2 - 0.2;
    g.add(core);
    const rng = seeded(len * 7 + height * 13);
    for (let i = 0; i < len / 2; i++) {
      const chunk = this.box(1 + rng() * 1.5, 0.5 + rng(), 1 + rng(), 'rubble');
      chunk.position.set((rng() - 0.5) * len, height - 0.4 + rng() * 0.4, (rng() - 0.5) * 1.4);
      chunk.rotation.y = rng() * 1.5;
      g.add(chunk);
    }
    return { group: g }; // caller registers collider (needs removal id)
  }

  /** Striped barricade gate segment for unlockable openings. */
  barricadeGate(len) {
    const g = new THREE.Group();
    const board = this.box(len, 1.1, 0.25, 'barricade');
    board.position.y = 1.0;
    const board2 = this.box(len, 1.1, 0.25, 'barricade');
    board2.position.y = 2.05;
    board2.rotation.z = 0.03;
    g.add(board, board2);
    for (let x = -len / 2 + 0.5; x <= len / 2 - 0.5; x += 2) {
      const post = this.box(0.22, 2.6, 0.22, 'wallWood');
      post.position.set(x, 1.3, 0);
      g.add(post);
    }
    return { group: g };
  }

  busStop() {
    const g = new THREE.Group();
    const roofM = this.mat('roofMetal');
    for (const s of [-1.4, 1.4]) {
      const post = this.box(0.12, 2.4, 0.12, this.colorMat(0x2c3036));
      post.position.set(s, 1.2, 0.5);
      g.add(post);
    }
    const back = this.box(3.2, 1.6, 0.08, this.colorMat(0x3a4148));
    back.position.set(0, 1.2, -0.55);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.1, 1.6), roofM);
    roof.position.set(0, 2.45, 0);
    const seat = this.box(2.8, 0.08, 0.45, 'wallWood');
    seat.position.set(0, 0.55, -0.3);
    // route information panel on the end post
    const panel = this.box(0.55, 0.75, 0.05, this.colorMat(0x2d4a66));
    panel.position.set(1.4, 1.75, 0.5);
    const routes = this.box(0.4, 0.5, 0.03, this.colorMat(0xd8d2c0));
    routes.position.set(1.4, 1.78, 0.54);
    g.add(back, roof, seat, panel, routes);
    return { group: g, collide: [1.7, 1.2, 0.4] };
  }

  signPost(color = 0x6b7280) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), this.colorMat(0x2c3036));
    pole.position.y = 1.3;
    const sign = this.box(0.7, 0.7, 0.04, this.colorMat(color));
    sign.position.y = 2.4;
    g.add(pole, sign);
    return { group: g };
  }

  utilityPole() {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 7.5, 6), this.mat('bark'));
    pole.position.y = 3.75;
    const cross = this.box(2.4, 0.15, 0.15, 'bark');
    cross.position.y = 6.9;
    g.add(pole, cross);
    return { group: g, collide: [0.2, 3.7, 0.2] };
  }

  mailbox() {
    const g = new THREE.Group();
    const post = this.box(0.08, 1.1, 0.08, 'wallWood');
    post.position.y = 0.55;
    const boxm = this.box(0.5, 0.3, 0.3, this.colorMat(0x39465e));
    boxm.position.y = 1.2;
    g.add(post, boxm);
    return { group: g };
  }

  well() {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.9, 10, 1, true), this.mat('brickGray', { side: THREE.DoubleSide }));
    ring.position.y = 0.45;
    const waterM = this.mat('water');
    const water = new THREE.Mesh(new THREE.CircleGeometry(1.05, 10), waterM);
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.5;
    for (const s of [-1, 1]) {
      const post = this.box(0.12, 1.7, 0.12, 'wallWood');
      post.position.set(s * 0.95, 1.2, 0);
      g.add(post);
    }
    const roofBox = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.8, 4), this.mat('roofShingle'));
    roofBox.position.y = 2.4;
    roofBox.rotation.y = Math.PI / 4;
    g.add(ring, water, roofBox);
    return { group: g, collide: [1.2, 0.8, 1.2] };
  }

  tent(color = 0x4a4f3a) {
    const g = new THREE.Group();
    const geo = new THREE.CylinderGeometry(0.02, 1.6, 1.7, 3, 1);
    const body = new THREE.Mesh(geo, this.colorMat(color));
    body.position.y = 0.85;
    body.rotation.y = Math.PI;
    g.add(body);
    return { group: g, collide: [1.2, 0.9, 1.2] };
  }

  campfire() {
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const log = this.box(0.9, 0.12, 0.12, 'bark');
      log.rotation.y = (i / 5) * Math.PI;
      log.position.y = 0.1 + (i % 2) * 0.08;
      g.add(log);
    }
    const stones = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.12, 5, 9), this.mat('rock'));
    stones.rotation.x = Math.PI / 2;
    stones.position.y = 0.08;
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.4, 8), new THREE.MeshBasicMaterial({ color: 0xff7830 }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.16;
    g.add(stones, glow);
    return { group: g };
  }

  /** Sagging utility wire strung between two world points (visual only). */
  wireRun(parent, x1, y1, z1, x2, y2, z2, sag = 0.9) {
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      pts.push(new THREE.Vector3(
        x1 + (x2 - x1) * t,
        y1 + (y2 - y1) * t - Math.sin(Math.PI * t) * sag,
        z1 + (z2 - z1) * t));
    }
    this._wireMat ??= new THREE.LineBasicMaterial({ color: 0x14161a });
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), this._wireMat);
    parent.add(line);
    return line;
  }

  /** Full gas-station forecourt: canopy on pillars + two dead pumps.
   *  Placed axis-aligned at (x, z); registers all colliders itself. */
  gasStation(x, z, parent) {
    const y = this.terrain.heightAt(x, z);
    const g = new THREE.Group();
    for (const [px, pz] of [[-5, -2.5], [5, -2.5], [-5, 2.5], [5, 2.5]]) {
      const pillar = this.box(0.4, 4.5, 0.4, 'wallConcrete');
      pillar.position.set(px, 2.25, pz);
      g.add(pillar);
      this.collision.addBoxCentered(x + px, y + 2.25, z + pz, 0.3, 2.25, 0.3, 'prop');
    }
    const slab = this.box(14, 0.4, 8, 'roofMetal');
    slab.position.y = 4.7;
    g.add(slab);
    this.place(g, x, z);
    parent.add(g);
    for (const px of [-3, 3]) {
      const pump = this.box(0.8, 1.6, 0.5, this.colorMat(0x7a2a24));
      const pg = new THREE.Group();
      pg.add(pump);
      pump.position.y = 0.8;
      this.place(pg, x + px, z - 1, { collide: [0.5, 0.9, 0.4] });
      parent.add(pg);
    }
    return g;
  }

  /** Rusting water tower on four legs — a navigation landmark. */
  waterTower() {
    const g = new THREE.Group();
    for (const [lx, lz] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) {
      const leg = this.box(0.25, 9, 0.25, 'metalRust');
      leg.position.set(lx, 4.5, lz);
      leg.rotation.y = Math.PI / 4;
      g.add(leg);
    }
    for (const [r, yy] of [[1.8, 3], [1.8, 6.5]]) { // cross braces
      for (const a of [0, Math.PI / 2]) {
        const brace = this.box(r * 2 + 0.4, 0.12, 0.12, 'metalRust');
        brace.position.y = yy;
        brace.rotation.y = a;
        g.add(brace);
      }
    }
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 4.5, 10), this.mat('wallMetal'));
    tank.position.y = 11.2;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(3.3, 1.4, 10), this.mat('roofMetal'));
    cap.position.y = 14.2;
    g.add(tank, cap);
    return { group: g, collide: [2.2, 7.2, 2.2] };
  }

  /** Horizontal fuel-storage tank on concrete saddles. */
  fuelTank() {
    const g = new THREE.Group();
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 6, 10), this.mat('metalRust'));
    tank.rotation.z = Math.PI / 2;
    tank.position.y = 1.9;
    g.add(tank);
    for (const s of [-1.9, 1.9]) {
      const saddle = this.box(0.6, 0.9, 2.4, 'wallConcrete');
      saddle.position.set(s, 0.45, 0);
      g.add(saddle);
    }
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.2, 6), this.mat('metalRust'));
    pipe.position.set(2.6, 1.1, 0.6);
    g.add(pipe);
    return { group: g, collide: [3.1, 1.7, 1.5] };
  }

  /** Brick factory smokestack — the tallest thing on the south skyline. */
  smokestack(h = 16) {
    const g = new THREE.Group();
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.5, h, 8), this.mat('brickGray'));
    stack.position.y = h / 2;
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.6, 8), this.mat('brickRed'));
    collar.position.y = h - 0.5;
    g.add(stack, collar);
    return { group: g, collide: [1.2, h / 2, 1.2] };
  }

  hayBale() {
    const g = new THREE.Group();
    const bale = this.box(1.6, 1.0, 1.0, this.colorMat(0xa08a44));
    bale.position.y = 0.5;
    g.add(bale);
    return { group: g, collide: [0.8, 0.6, 0.5] };
  }

  picnicTable() {
    const g = new THREE.Group();
    const top = this.box(1.8, 0.08, 0.8, 'wallWood');
    top.position.y = 0.72;
    g.add(top);
    for (const s of [-0.75, 0.75]) {
      const seat = this.box(1.8, 0.07, 0.3, 'wallWood');
      seat.position.set(0, 0.45, s);
      const leg = this.box(0.1, 0.72, 1.5, 'wallWood');
      leg.position.set(s, 0.36, 0);
      g.add(seat, leg);
    }
    return { group: g, collide: [0.95, 0.5, 0.85] };
  }

  /** Fence run between two points; registers thin collider. */
  fenceRun(x1, z1, x2, z2, parent) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const yaw = Math.atan2(-(z2 - z1), x2 - x1);
    const g = new THREE.Group();
    const rail = this.box(len, 0.1, 0.06, 'wallWood');
    rail.position.y = 1.0;
    const rail2 = this.box(len, 0.1, 0.06, 'wallWood');
    rail2.position.y = 0.55;
    g.add(rail, rail2);
    for (let t = 0; t <= len; t += 2.2) {
      const post = this.box(0.12, 1.2, 0.12, 'wallWood');
      post.position.set(-len / 2 + t, 0.6, 0);
      g.add(post);
    }
    const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
    this.place(g, mx, mz, { yaw });
    parent.add(g);
    // Fences are hop-proof visual boundaries only along their line.
    const pad = 0.3;
    this.collision.addBox(Math.min(x1, x2) - pad, this.terrain.heightAt(mx, mz) - 0.5, Math.min(z1, z2) - pad,
      Math.max(x1, x2) + pad, this.terrain.heightAt(mx, mz) + 1.1, Math.max(z1, z2) + pad, 'fence');
    return g;
  }
}

function seeded(seed) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
