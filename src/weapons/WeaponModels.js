import * as THREE from '../../lib/three.module.js';
import { WeaponMaterials as M } from '../rendering/WeaponMaterials.js';

/**
 * Procedural 3D first-person weapon models — built from primitives with the
 * PBR steampunk material set (see WeaponMaterials.js). No two share a
 * silhouette, palette or form factor:
 *
 *   pistol   — compact brass automatic, blued slide, walnut grips, brass
 *              pressure gauge on the frame
 *   shotgun  — heavy break-action side-by-side, cast-iron barrels, worn
 *              brass receiver, oak stock, twin external hammers
 *   rifle    — clockwork automaton repeater, gunmetal body, copper cooling
 *              fins, a spinning brass barrel rotor and a glowing exhaust vent
 *   sniper   — long rangefinder rifle, blued barrel, huge brass telescope,
 *              a drifting brass rangefinder dial, walnut stock + leather rest
 *   bat      — riveted piston bat, oak barrel banded in brass, a copper
 *              piston in the handle that pumps and slams on the charged swing
 *
 * Each factory returns a rig: the THREE.Group, a muzzle anchor, the named
 * animatable parts, a rest transform, and idle / fire / reload animation
 * hooks. WeaponView drives the whole-weapon motion (bob, sway, recoil,
 * equip); these hooks move the internal parts (slides, bolts, cylinders,
 * gears, needles).
 */

/* ---------------- build helpers ---------------- */

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}
function box(w, h, d, mat, x, y, z) { return mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z); }
function cyl(rt, rb, h, mat, seg = 14, x = 0, y = 0, z = 0) {
  return mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z);
}
/** Cylinder laid along the Z axis (barrels, tubes). */
function barrel(r, len, mat, seg = 16, x = 0, y = 0, z = 0) {
  const m = cyl(r, r, len, mat, seg, x, y, z);
  m.rotation.x = Math.PI / 2;
  return m;
}
function ring(radius, tube, mat, seg = 8, tSeg = 18) {
  return new THREE.Mesh(new THREE.TorusGeometry(radius, tube, seg, tSeg), mat);
}
function sphere(r, mat, seg = 8) { return new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg), mat); }

/** Record a part's base transform so animation can offset from it. */
function anim(o) { o.userData.baseP = o.position.clone(); o.userData.baseR = o.rotation.clone(); return o; }

/** Ring of rivets around a Z-barrel at z. */
function rivetRing(group, count, radius, z, mat, size = 0.006) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const s = sphere(size, mat, 6);
    s.position.set(Math.cos(a) * radius, Math.sin(a) * radius, z);
    group.add(s);
  }
}

const brass = () => M.get('brass');
const brassWorn = () => M.get('brassWorn');
const blued = () => M.get('bluedSteel');
const iron = () => M.get('castIron');
const gunmetal = () => M.get('gunmetal');
const copper = () => M.get('copper');
const steel = () => M.get('steelBright');
const walnut = () => M.get('walnut');
const oak = () => M.get('oak');
const leather = () => M.get('leather');
const canvasMat = () => M.get('canvas');

/* ================================================================== */
/* PISTOL — brass automatic                                            */
/* ================================================================== */

function buildPistol() {
  const g = new THREE.Group();

  // frame (brass) + blued slide
  const frame = box(0.075, 0.05, 0.30, brass(), 0, 0, -0.02);
  g.add(frame);
  const slide = anim(box(0.082, 0.06, 0.31, blued(), 0, 0.055, -0.02));
  g.add(slide);
  // slide serrations (grip cuts at the rear)
  for (let i = 0; i < 5; i++) g.add(box(0.006, 0.05, 0.006, blued(), 0.043, 0.055, 0.06 + i * 0.014));
  // barrel + muzzle crown
  const bbl = barrel(0.02, 0.10, blued(), 14, 0, 0.055, -0.20);
  g.add(bbl);
  g.add(barrel(0.026, 0.02, brass(), 14, 0, 0.055, -0.245)); // brass crown
  // sights
  g.add(box(0.012, 0.012, 0.012, steel(), 0, 0.09, 0.12));
  g.add(box(0.012, 0.012, 0.012, steel(), 0, 0.09, -0.17));
  // trigger guard + trigger
  const guard = ring(0.028, 0.006, brass(), 6, 14);
  guard.rotation.x = Math.PI / 2; guard.position.set(0, -0.045, 0.03);
  guard.scale.set(1, 1.5, 1); g.add(guard);
  g.add(box(0.01, 0.03, 0.008, steel(), 0, -0.04, 0.03));
  // walnut grip, raked back
  const grip = box(0.07, 0.19, 0.075, walnut(), 0, -0.11, 0.075);
  grip.rotation.x = -0.32; g.add(grip);
  g.add(box(0.055, 0.02, 0.05, brass(), 0, -0.205, 0.135)); // brass grip cap
  // magazine (drops on reload)
  const mag = anim(box(0.05, 0.15, 0.05, gunmetal(), 0, -0.13, 0.07));
  mag.rotation.x = -0.32; g.add(mag);
  // external hammer (cocks on fire)
  const hammer = anim(box(0.012, 0.04, 0.02, steel(), 0, 0.055, 0.12));
  g.add(hammer);
  // brass pressure gauge on the left flank
  const gauge = new THREE.Group();
  gauge.add(barrel(0.03, 0.012, brass(), 16, 0, 0, 0));
  gauge.add(mesh(new THREE.CircleGeometry(0.024, 16), M.glass(0x3a6a5a, 0x0d201a), 0, 0, 0.007));
  const needle = anim(box(0.004, 0.02, 0.002, steel(), 0, 0.008, 0.008));
  gauge.add(needle);
  gauge.position.set(-0.05, 0.0, 0.02); gauge.rotation.y = -Math.PI / 2; g.add(gauge);
  rivetRing(g, 3, 0.02, 0.02, brass(), 0.004);

  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.055, -0.26); g.add(muzzle);

  return {
    group: g, muzzle, parts: { slide, hammer, mag, needle },
    rest: { position: [0.17, -0.14, -0.46], rotation: [0.06, 0.50, 0.03], scale: 0.92 },
    fireDuration: 0.16,
    idle(t, p) {
      p.needle.rotation.z = Math.sin(t * 2.1) * 0.25 + Math.sin(t * 7) * 0.04;
      p.hammer.rotation.x = 0;
    },
    fire(f, p) {
      const back = Math.sin(Math.min(1, f * 1.6) * Math.PI) * 0.055; // rack back and return
      p.slide.position.z = p.slide.userData.baseP.z + back;
      p.hammer.rotation.x = -Math.min(1, f * 3) * 0.5 + Math.max(0, f - 0.2) * 0.6;
    },
    reload(f, p) {
      // drop the mag out and slam a fresh one home
      const drop = f < 0.5 ? f / 0.5 : (1 - f) / 0.5;
      p.mag.position.y = p.mag.userData.baseP.y - drop * 0.18;
      p.mag.visible = !(f > 0.45 && f < 0.6);
      if (f > 0.85) p.slide.position.z = p.slide.userData.baseP.z + (1 - (f - 0.85) / 0.15) * 0.05;
    },
  };
}

/* ================================================================== */
/* SHOTGUN — break-action side-by-side                                 */
/* ================================================================== */

function buildShotgun() {
  const g = new THREE.Group();

  // barrels + receiver pivot: barrels break down about a hinge at z=+0.02
  const hinge = new THREE.Group(); hinge.position.set(0, 0, 0.02); anim(hinge);
  const bl = barrel(0.026, 0.52, iron(), 16, -0.03, 0.01, -0.28);
  const br = barrel(0.026, 0.52, iron(), 16, 0.03, 0.01, -0.28);
  hinge.add(bl, br);
  hinge.add(box(0.10, 0.03, 0.09, brassWorn(), 0, 0.01, -0.03)); // barrel lug
  // brass barrel bands
  for (const z of [-0.12, -0.32, -0.5]) {
    const band = box(0.10, 0.028, 0.02, brass(), 0, 0.01, z);
    hinge.add(band);
  }
  g.add(box(0.02, 0.012, 0.012, brass(), 0, 0.05, -0.53)); // bead sight
  g.add(hinge);

  // receiver (worn brass) + copper action plate
  g.add(box(0.115, 0.09, 0.14, brassWorn(), 0, -0.005, 0.06));
  g.add(box(0.12, 0.05, 0.02, copper(), 0, -0.005, 0.14));
  // top break lever
  const lever = anim(box(0.02, 0.02, 0.06, steel(), 0, 0.05, 0.06));
  g.add(lever);
  // twin external hammers
  const hammerL = anim(box(0.014, 0.045, 0.02, steel(), -0.03, 0.05, 0.11));
  const hammerR = anim(box(0.014, 0.045, 0.02, steel(), 0.03, 0.05, 0.11));
  g.add(hammerL, hammerR);
  // trigger guard + double triggers
  const guard = ring(0.03, 0.006, brass(), 6, 14);
  guard.rotation.x = Math.PI / 2; guard.position.set(0, -0.06, 0.12);
  guard.scale.set(1, 1.7, 1); g.add(guard);
  g.add(box(0.008, 0.028, 0.006, steel(), -0.008, -0.05, 0.11));
  g.add(box(0.008, 0.028, 0.006, steel(), 0.008, -0.05, 0.13));
  // oak stock, raked down
  const stock = box(0.085, 0.13, 0.34, oak(), 0, -0.05, 0.30);
  stock.rotation.x = 0.18; g.add(stock);
  g.add(box(0.09, 0.05, 0.04, iron(), 0, -0.10, 0.46)); // iron butt plate
  rivetRing(hinge, 4, 0.055, -0.03, brass(), 0.006);

  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.01, -0.55); hinge.add(muzzle);

  return {
    group: g, muzzle, parts: { hinge, hammerL, hammerR, lever },
    rest: { position: [0.16, -0.10, -0.44], rotation: [0.05, 0.34, 0.0], scale: 0.78 },
    fireDuration: 0.42,
    idle(t, p) {
      p.hinge.rotation.x = 0;
      p.hammerL.rotation.x = p.hammerR.rotation.x = 0;
      p.lever.rotation.z = Math.sin(t * 1.4) * 0.02;
    },
    fire(f, p) {
      // hammer snap on the impact phase (both on alt/double blast — driven by WeaponView flag)
      const snap = f < 0.15 ? f / 0.15 : Math.max(0, 1 - (f - 0.15) / 0.3);
      p.hammerR.rotation.x = -snap * 0.7;
      if (p._both) p.hammerL.rotation.x = -snap * 0.7;
    },
    reload(f, p) {
      // break the action fully open, then snap shut
      const open = f < 0.7 ? Math.sin(Math.min(1, f / 0.35) * Math.PI * 0.5) : (1 - (f - 0.7) / 0.3);
      p.hinge.rotation.x = open * 0.5;
      p.lever.rotation.z = open * 0.7;
      p.hammerL.rotation.x = p.hammerR.rotation.x = -open * 0.7;
    },
  };
}

/* ================================================================== */
/* RIFLE — clockwork automaton repeater                                */
/* ================================================================== */

function buildRifle() {
  const g = new THREE.Group();

  // gunmetal body
  g.add(box(0.09, 0.09, 0.34, gunmetal(), 0, 0, 0.0));
  g.add(box(0.10, 0.03, 0.30, iron(), 0, 0.06, 0.0)); // top rail
  // cast-iron barrel shroud with copper cooling fins
  g.add(barrel(0.03, 0.34, iron(), 16, 0, 0.01, -0.30));
  for (let i = 0; i < 6; i++) {
    const fin = ring(0.042, 0.008, copper(), 6, 16);
    fin.position.set(0, 0.01, -0.20 - i * 0.035); g.add(fin);
  }
  // spinning brass barrel rotor at the muzzle (gatling read)
  const rotor = anim(new THREE.Group());
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    rotor.add(barrel(0.008, 0.12, brass(), 8, Math.cos(a) * 0.022, Math.sin(a) * 0.022, 0));
  }
  rotor.add(barrel(0.016, 0.10, gunmetal(), 10, 0, 0, 0.01)); // hub
  rotor.position.set(0, 0.01, -0.46); g.add(rotor);
  // brass drum magazine underneath
  const drum = anim(cyl(0.075, 0.075, 0.05, brassWorn(), 20, 0, -0.11, 0.03));
  drum.rotation.z = Math.PI / 2;
  g.add(drum);
  g.add(ring(0.05, 0.008, copper(), 6, 18).translateY(-0.11).translateZ(0.03));
  // reciprocating charging bolt on the right flank
  const bolt = anim(box(0.02, 0.02, 0.06, steel(), 0.06, 0.03, 0.06));
  g.add(bolt);
  // canvas-wrapped foregrip
  const fore = box(0.05, 0.09, 0.05, canvasMat(), 0, -0.09, -0.16);
  g.add(fore);
  // pistol grip + gunmetal stock
  const grip = box(0.05, 0.13, 0.05, gunmetal(), 0, -0.10, 0.14);
  grip.rotation.x = 0.28; g.add(grip);
  g.add(box(0.07, 0.10, 0.16, gunmetal(), 0, 0.0, 0.26));
  // glowing brass exhaust vent (pressure release) — pulses when firing
  const vent = anim(cyl(0.02, 0.02, 0.05, M.glow(0xff7a2a, 0.6), 10, 0.06, 0.07, 0.18));
  vent.rotation.z = Math.PI / 2;
  g.add(vent);
  g.add(box(0.03, 0.02, 0.02, brass(), 0.06, 0.07, 0.12));
  // sights
  g.add(box(0.01, 0.02, 0.01, steel(), 0, 0.085, -0.12));

  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.01, -0.53); g.add(muzzle);

  return {
    group: g, muzzle, parts: { rotor, drum, bolt, vent },
    rest: { position: [0.16, -0.15, -0.46], rotation: [0.05, 0.36, 0.0], scale: 0.83 },
    fireDuration: 0.095,
    _spin: 0,
    idle(t, p) {
      this._spin += 0.9 / 60;                       // slow idle turn
      p.rotor.rotation.z = this._spin;
      p.vent.material.emissiveIntensity = 0.5 + Math.sin(t * 2) * 0.15;
      p.bolt.position.z = p.bolt.userData.baseP.z;
    },
    fire(f, p) {
      this._spin += 0.55;                           // kick the rotor hard on each shot
      p.rotor.rotation.z = this._spin;
      const back = Math.sin(Math.min(1, f * 2) * Math.PI) * 0.03;
      p.bolt.position.z = p.bolt.userData.baseP.z + back;
      p.vent.material.emissiveIntensity = 1.6 * (1 - f) + 0.5;
    },
    reload(f, p) {
      const drop = f < 0.5 ? f / 0.5 : (1 - f) / 0.5;
      p.drum.position.y = p.drum.userData.baseP.y - drop * 0.12;
      p.drum.rotation.x = drop * 1.6;
      p.drum.visible = !(f > 0.45 && f < 0.58);
    },
  };
}

/* ================================================================== */
/* SNIPER — brass rangefinder long rifle                               */
/* ================================================================== */

function buildSniper() {
  const g = new THREE.Group();

  // long blued barrel + cast-iron muzzle brake
  g.add(barrel(0.022, 0.72, blued(), 16, 0, 0.02, -0.36));
  const brake = barrel(0.032, 0.08, iron(), 12, 0, 0.02, -0.71);
  g.add(brake);
  for (const z of [-0.68, -0.72]) g.add(ring(0.034, 0.006, iron(), 6, 12).translateY(0.02).translateZ(z));
  rivetRing(g, 4, 0.03, -0.2, brass(), 0.006);
  // gunmetal receiver
  g.add(box(0.075, 0.07, 0.24, gunmetal(), 0, 0.0, 0.02));
  // big brass telescope scope on twin ring mounts
  const scope = barrel(0.035, 0.34, brass(), 18, 0, 0.10, -0.06);
  g.add(scope);
  g.add(mesh(new THREE.CircleGeometry(0.032, 18), M.glass(0x264a5a, 0x0a1820), 0, 0.10, -0.231));
  g.add(barrel(0.026, 0.05, blued(), 16, 0, 0.10, 0.11)); // eyepiece
  for (const z of [-0.14, 0.02]) {
    const mount = box(0.02, 0.06, 0.02, brass(), 0, 0.06, z); g.add(mount);
  }
  // brass windage/elevation turrets
  g.add(cyl(0.018, 0.018, 0.03, brass(), 10, 0, 0.135, -0.02));
  g.add(cyl(0.018, 0.018, 0.03, brass(), 10, 0.05, 0.10, -0.02).rotateZ(Math.PI / 2));
  // rangefinder dial on the left flank, needle drifts in idle
  const dial = new THREE.Group();
  dial.add(barrel(0.034, 0.014, brass(), 18, 0, 0, 0));
  dial.add(mesh(new THREE.CircleGeometry(0.028, 18), M.glass(0x3a6a4a, 0x0d1e14), 0, 0, 0.008));
  const needle = anim(box(0.004, 0.024, 0.002, copper(), 0, 0.01, 0.009));
  dial.add(needle);
  dial.position.set(-0.055, 0.0, 0.04); dial.rotation.y = -Math.PI / 2; g.add(dial);
  // bolt handle (right) with a brass ball
  const bolt = anim(box(0.02, 0.02, 0.05, steel(), 0.055, 0.02, 0.08));
  bolt.add(sphere(0.016, brass(), 8).translateX(0.035));
  g.add(bolt);
  // walnut stock + leather cheek riser
  const stock = box(0.07, 0.12, 0.34, walnut(), 0, -0.04, 0.24);
  stock.rotation.x = 0.12; g.add(stock);
  g.add(box(0.05, 0.03, 0.14, leather(), 0, 0.035, 0.16)); // cheek pad
  g.add(box(0.075, 0.05, 0.04, iron(), 0, -0.09, 0.40));   // butt plate
  // folded bipod under the barrel
  for (const s of [-1, 1]) {
    const leg = box(0.008, 0.14, 0.01, steel(), s * 0.02, -0.06, -0.34);
    leg.rotation.x = 0.5; g.add(leg);
  }

  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.02, -0.75); g.add(muzzle);

  return {
    group: g, muzzle, parts: { needle, bolt, scope },
    rest: { position: [0.13, -0.10, -0.44], rotation: [0.03, 0.42, 0.02], scale: 0.70 },
    fireDuration: 1.1,
    idle(t, p) {
      p.needle.rotation.z = Math.sin(t * 0.8) * 0.4 + Math.sin(t * 3.3) * 0.03;
      p.bolt.position.z = p.bolt.userData.baseP.z;
      p.bolt.rotation.z = 0;
    },
    fire(f, p) {
      // work the bolt over the long cycle: lift, draw back, return, close
      if (f < 0.2) p.bolt.rotation.z = (f / 0.2) * -0.8;
      else if (f < 0.5) { p.bolt.rotation.z = -0.8; p.bolt.position.z = p.bolt.userData.baseP.z + (f - 0.2) / 0.3 * 0.06; }
      else if (f < 0.8) { p.bolt.rotation.z = -0.8; p.bolt.position.z = p.bolt.userData.baseP.z + (1 - (f - 0.5) / 0.3) * 0.06; }
      else p.bolt.rotation.z = -0.8 * (1 - (f - 0.8) / 0.2);
    },
    reload(f, p) {
      p.bolt.rotation.z = Math.sin(f * Math.PI) * -0.8;
      p.bolt.position.z = p.bolt.userData.baseP.z + Math.sin(f * Math.PI) * 0.06;
    },
  };
}

/* ================================================================== */
/* BAT — riveted piston bat                                            */
/* ================================================================== */

function buildBat() {
  const g = new THREE.Group();

  // oak barrel: fat top, thin handle, oriented along Y
  const barrelMesh = cyl(0.055, 0.028, 0.62, oak(), 18, 0, 0.12, 0);
  g.add(barrelMesh);
  g.add(cyl(0.055, 0.05, 0.04, oak(), 18, 0, 0.42, 0)); // rounded cap
  // brass reinforcing bands + rivets
  for (const y of [0.32, 0.18, 0.04]) {
    const band = ring(0.05 - (0.42 - y) * 0.04, 0.01, brass(), 6, 18);
    band.rotation.x = Math.PI / 2; band.position.y = y; g.add(band);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2, r = 0.05 - (0.42 - y) * 0.04;
      g.add(sphere(0.006, brass(), 6).translateX(Math.cos(a) * r).translateY(y).translateZ(Math.sin(a) * r));
    }
  }
  // cast-iron knob at the handle base
  g.add(cyl(0.04, 0.032, 0.05, iron(), 14, 0, -0.20, 0));
  // copper piston housing on the handle, with a rod that pumps
  const housing = cyl(0.022, 0.022, 0.14, copper(), 12, 0.05, -0.05, 0);
  housing.rotation.z = 0.15; g.add(housing);
  const piston = anim(cyl(0.012, 0.012, 0.10, steel(), 10, 0.05, 0.03, 0));
  piston.rotation.z = 0.15; g.add(piston);
  g.add(sphere(0.016, brass(), 8).translateX(0.05).translateY(0.09)); // rod head
  // little brass pressure dial with a glow pip
  const dial = barrel(0.026, 0.014, brass(), 16, -0.05, -0.06, 0);
  dial.rotation.y = Math.PI / 2; g.add(dial);
  g.add(sphere(0.006, M.glow(0x66ffcc, 1.6), 6).translateX(-0.062).translateY(-0.06));

  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.4, 0); g.add(muzzle);

  return {
    group: g, muzzle, parts: { piston },
    rest: { position: [0.17, -0.21, -0.48], rotation: [-0.4, 0.66, -0.6], scale: 0.78 },
    fireDuration: 0.55,
    idle(t, p) {
      p.piston.position.y = p.piston.userData.baseP.y + Math.sin(t * 1.6) * 0.012;
    },
    fire(f, p) {
      // piston slams out on the impact, then draws back
      const slam = f < 0.35 ? f / 0.35 : Math.max(0, 1 - (f - 0.35) / 0.5);
      p.piston.position.y = p.piston.userData.baseP.y + slam * 0.05;
    },
    reload() {},
  };
}

/* ---------------- registry ---------------- */

const BUILDERS = {
  pistol: buildPistol,
  shotgun: buildShotgun,
  rifle: buildRifle,
  sniper: buildSniper,
  bat: buildBat,
};

/** Build the rig for a weapon id (pistol/shotgun/rifle/sniper/bat). */
export function buildWeaponModel(id) {
  const fn = BUILDERS[id];
  if (!fn) throw new Error(`No 3D model for weapon "${id}"`);
  return fn();
}
