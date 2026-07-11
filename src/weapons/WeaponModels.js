import * as THREE from '../../lib/three.module.js';
import { WeaponMaterials as M } from '../rendering/WeaponMaterials.js';

/**
 * Procedural 3D first-person weapon models, generation two — every model
 * designed from scratch (not a reskin of the old set), each with its own
 * signature material family, silhouette and structural form factor:
 *
 *   pistol   — REGENT AUTOLOADER: slim nickel-plated target automatic,
 *              ventilated sight rib, ring hammer, ivory grips. Reads fast
 *              and precise.
 *   shotgun  — PARISH BLUNDERBUSS: single huge bell-mouthed hammered-iron
 *              bore over an under-lever action, verdigris bronze receiver,
 *              cherry furniture, a visible brass shell rack on the stock.
 *              Reads close and brutal.
 *   rifle    — FOUNDRY GUN: blackened-steel steam machine gun, perforated
 *              cooling jacket, side-mounted coil drum, copper boiler and
 *              feed pipe, canvas carry handle + swaying sling. Reads
 *              sustained industrial fire.
 *   sniper   — OBSERVATORY RIFLE: very long octagonal blued barrel, nickel
 *              telescope with sunshade and focus ring, transverse sliding
 *              harmonica breech, skeletonized ebony stock. Reads one
 *              perfect shot.
 *   bat      — IRONSHOD SLUGGER: oak club clad in riveted hammered-iron
 *              plates with proud studs, a compression spring collar that
 *              slams on impact, leather wrap and a swinging wrist strap.
 *              Reads weight.
 *
 * Each factory returns a rig: the THREE.Group, a muzzle anchor, the named
 * animatable parts, a rest transform, and idle / fire / reload animation
 * hooks. WeaponView drives whole-weapon motion (bob, sway, three-phase
 * recoil, equip/unequip); the hooks move internal parts. Idle loops cycle
 * in 2–4 s. reload(f, parts, tactical) receives the quick-tap flag for
 * weapons with a tactical reload.
 *
 * Alignment convention (the fix for the old sprite misalignment): every
 * rig is built with its grip at the local origin, muzzle down -Z, and its
 * `rest` transform placing the grip in the same lower-right anchor zone
 * (x 0.14..0.17, y -0.15..-0.11, z -0.48..-0.44), so switching weapons
 * never jumps the hand position.
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
/** Cylinder laid along the Z axis (barrels, tubes). rt = muzzle end. */
function barrel(rt, rb, len, mat, seg = 16, x = 0, y = 0, z = 0) {
  const m = cyl(rt, rb, len, mat, seg, x, y, z);
  m.rotation.x = -Math.PI / 2; // cylinder top (rt) faces -Z
  return m;
}
function tube(r, len, mat, seg = 16, x = 0, y = 0, z = 0) { return barrel(r, r, len, mat, seg, x, y, z); }
function ring(radius, tubeR, mat, seg = 8, tSeg = 18) {
  return new THREE.Mesh(new THREE.TorusGeometry(radius, tubeR, seg, tSeg), mat);
}
function sphere(r, mat, seg = 8) { return new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg), mat); }

/** Record a part's base transform so animation can offset from it. */
function anim(o) { o.userData.baseP = o.position.clone(); o.userData.baseR = o.rotation.clone(); return o; }

const nickel = () => M.get('nickel');
const blackSteel = () => M.get('blackSteel');
const bronze = () => M.get('bronzePatina');
const hammered = () => M.get('hammeredIron');
const ivory = () => M.get('ivory');
const ebony = () => M.get('ebony');
const cherry = () => M.get('cherry');
const brass = () => M.get('brass');
const blued = () => M.get('bluedSteel');
const copper = () => M.get('copper');
const steel = () => M.get('steelBright');
const oak = () => M.get('oak');
const leather = () => M.get('leather');
const canvasMat = () => M.get('canvas');

/* ================================================================== */
/* PISTOL — nickel target automatic, ivory grips                       */
/* ================================================================== */

function buildPistol() {
  const g = new THREE.Group();

  // slim nickel frame
  g.add(box(0.062, 0.042, 0.27, nickel(), 0, 0, -0.02));
  // long nickel slide with rear ebony insert panel
  const slide = anim(box(0.068, 0.05, 0.34, nickel(), 0, 0.05, -0.05));
  g.add(slide);
  g.add(box(0.07, 0.02, 0.08, ebony(), 0, 0.056, 0.08));
  // slide serrations
  for (let i = 0; i < 6; i++) g.add(box(0.004, 0.046, 0.005, steel(), 0.036, 0.05, 0.05 + i * 0.011));
  // ventilated sight rib: raised rail on four posts over the slide
  const rib = box(0.018, 0.008, 0.3, blued(), 0, 0.085, -0.06);
  g.add(rib);
  for (let i = 0; i < 4; i++) g.add(box(0.01, 0.014, 0.012, blued(), 0, 0.075, 0.05 - i * 0.083));
  g.add(box(0.008, 0.014, 0.008, brass(), 0, 0.096, -0.2)); // brass bead front sight
  g.add(box(0.02, 0.012, 0.008, blued(), 0, 0.094, 0.075)); // notch rear sight
  // tilting match barrel with nickel bushing
  const bbl = anim(tube(0.017, 0.12, blued(), 14, 0, 0.05, -0.26));
  g.add(bbl);
  g.add(tube(0.023, 0.024, nickel(), 14, 0, 0.05, -0.305));
  // ring hammer (annular — the signature rear detail)
  const hammer = anim(ring(0.018, 0.006, steel(), 6, 14));
  hammer.position.set(0, 0.06, 0.125);
  g.add(hammer);
  // oval trigger guard + blade trigger
  const guard = ring(0.03, 0.005, nickel(), 6, 16);
  guard.rotation.x = Math.PI / 2; guard.position.set(0, -0.04, 0.015);
  guard.scale.set(1, 1.45, 1); g.add(guard);
  g.add(box(0.008, 0.028, 0.006, blued(), 0, -0.036, 0.015));
  // raked grip: nickel core with ivory panels + engraved cap
  const grip = new THREE.Group();
  grip.add(box(0.05, 0.17, 0.062, nickel(), 0, 0, 0));
  grip.add(box(0.058, 0.15, 0.05, ivory(), 0, 0, 0.002));
  grip.add(box(0.052, 0.018, 0.055, brass(), 0, -0.088, 0));
  grip.position.set(0, -0.1, 0.065); grip.rotation.x = -0.3;
  g.add(grip);
  // lanyard loop at the heel
  const loop = ring(0.012, 0.004, brass(), 6, 10);
  loop.position.set(0, -0.185, 0.11); g.add(loop);
  // magazine (drops on full reload)
  const mag = anim(box(0.042, 0.15, 0.045, blackSteel(), 0, -0.115, 0.062));
  mag.rotation.x = -0.3; g.add(mag);
  // chamber-pressure dial on the left flank
  const dial = new THREE.Group();
  dial.add(tube(0.022, 0.01, brass(), 14, 0, 0, 0));
  dial.add(mesh(new THREE.CircleGeometry(0.017, 14), M.glass(0x3a6a5a, 0x0d201a), 0, 0, -0.006));
  const needle = anim(box(0.003, 0.015, 0.002, steel(), 0, 0.006, -0.007));
  dial.add(needle);
  dial.position.set(-0.04, 0.0, 0.03); dial.rotation.y = Math.PI / 2;
  g.add(dial);

  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.05, -0.325); g.add(muzzle);

  return {
    group: g, muzzle, parts: { slide, hammer, mag, needle, bbl },
    rest: { position: [0.16, -0.13, -0.44], rotation: [0.05, 0.46, 0.02], scale: 0.95 },
    fireDuration: 0.16,
    // 3 s idle loop: the pressure needle breathes, the ring hammer eases
    idle(t, p) {
      const c = (t % 3) / 3 * Math.PI * 2;
      p.needle.rotation.z = Math.sin(c) * 0.3 + Math.sin(t * 6.3) * 0.03;
      p.hammer.rotation.x = Math.sin(c) * 0.02;
      p.slide.position.z = p.slide.userData.baseP.z;
      p.bbl.rotation.x = p.bbl.userData.baseR.x;
      p.mag.position.y = p.mag.userData.baseP.y;
    },
    fire(f, p) {
      // short-recoil: slide racks while the match barrel tips up
      const back = Math.sin(Math.min(1, f * 1.6) * Math.PI) * 0.06;
      p.slide.position.z = p.slide.userData.baseP.z + back;
      p.bbl.rotation.x = p.bbl.userData.baseR.x + back * 0.9;
      p.hammer.rotation.x = -Math.min(1, f * 3) * 0.6 + Math.max(0, f - 0.2) * 0.75;
    },
    reload(f, p, tactical) {
      // mag out, mag in; a full (empty) reload also drops the slide at the end
      const drop = f < 0.5 ? f / 0.5 : (1 - f) / 0.5;
      p.mag.position.y = p.mag.userData.baseP.y - drop * 0.17;
      p.mag.visible = !(f > 0.45 && f < 0.6);
      if (!tactical && f > 0.82) p.slide.position.z = p.slide.userData.baseP.z + (1 - (f - 0.82) / 0.18) * 0.06;
    },
  };
}

/* ================================================================== */
/* SHOTGUN — under-lever blunderbuss                                   */
/* ================================================================== */

function buildShotgun() {
  const g = new THREE.Group();

  // one huge hammered-iron bore with a flared bell muzzle
  g.add(barrel(0.034, 0.04, 0.4, hammered(), 16, 0, 0.02, -0.26));
  const bell = mesh(new THREE.CylinderGeometry(0.075, 0.036, 0.09, 16), hammered(), 0, 0.02, -0.49);
  bell.rotation.x = -Math.PI / 2; g.add(bell);
  const bore = mesh(new THREE.CircleGeometry(0.062, 16), M.flat(0x08080a, 0.95), 0, 0.02, -0.5355);
  bore.rotation.y = Math.PI; g.add(bore); // the black void of the bore
  g.add(ring(0.074, 0.007, brass(), 6, 18).translateY(0.02).translateZ(-0.532)); // brass bell lip
  g.add(box(0.012, 0.014, 0.012, brass(), 0, 0.062, -0.44)); // bead on the flare
  // cherry forend under the barrel with a bronze band
  g.add(box(0.06, 0.05, 0.2, cherry(), 0, -0.025, -0.24));
  g.add(box(0.066, 0.056, 0.02, bronze(), 0, -0.023, -0.16));
  // verdigris bronze receiver
  g.add(box(0.085, 0.085, 0.16, bronze(), 0, -0.005, 0.05));
  g.add(box(0.09, 0.02, 0.17, hammered(), 0, 0.045, 0.05)); // iron top strap
  // side loading gate (brass oval, flips during reload)
  const gate = anim(box(0.008, 0.034, 0.05, brass(), 0.046, -0.005, 0.03));
  g.add(gate);
  // exposed hammer
  const hammer = anim(box(0.016, 0.05, 0.022, steel(), 0, 0.06, 0.12));
  g.add(hammer);
  // under-lever loop (cycles on every shot)
  const lever = anim(new THREE.Group());
  const loop = ring(0.045, 0.008, steel(), 8, 18);
  loop.rotation.y = Math.PI / 2; loop.position.set(0, -0.075, 0.1);
  lever.add(loop);
  lever.add(box(0.016, 0.05, 0.03, steel(), 0, -0.045, 0.14));
  lever.position.set(0, 0, 0.02); g.add(lever);
  // trigger
  g.add(box(0.008, 0.026, 0.006, brass(), 0, -0.035, 0.1));
  // cherry stock, raked, brass butt cap
  const stock = box(0.075, 0.115, 0.3, cherry(), 0, -0.045, 0.29);
  stock.rotation.x = 0.16; g.add(stock);
  g.add(box(0.08, 0.05, 0.035, brass(), 0, -0.09, 0.43));
  // brass shell rack on the right of the stock (shells feed out on reload)
  const shells = [];
  for (let i = 0; i < 4; i++) {
    const sh = anim(tube(0.011, 0.05, brass(), 8, 0.048, -0.02 - i * 0.004, 0.2 + i * 0.055));
    sh.rotation.x = -Math.PI / 2 + 0.16;
    g.add(sh); shells.push(sh);
  }
  g.add(box(0.012, 0.03, 0.24, leather(), 0.052, -0.05, 0.29).rotateX(0.16)); // rack sleeve

  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.02, -0.55); g.add(muzzle);

  return {
    group: g, muzzle, parts: { lever, hammer, gate, shells },
    rest: { position: [0.15, -0.11, -0.45], rotation: [0.05, 0.36, 0.0], scale: 0.8 },
    fireDuration: 0.5,
    // 2.8 s idle loop: the lever settles in its notch, hammer at half-cock
    idle(t, p) {
      const c = (t % 2.8) / 2.8 * Math.PI * 2;
      p.lever.rotation.x = Math.sin(c) * 0.015;
      p.hammer.rotation.x = -0.12 + Math.sin(c + 1) * 0.01;
      p.gate.rotation.z = 0;
      for (const sh of p.shells) sh.visible = true;
    },
    fire(f, p) {
      // hammer falls, then the lever throws forward and back to chamber
      p.hammer.rotation.x = f < 0.1 ? -0.12 + (f / 0.1) * 0.28 : 0.16 - Math.min(1, (f - 0.1) / 0.5) * 0.28;
      const throwF = f < 0.25 ? 0 : f < 0.55 ? (f - 0.25) / 0.3 : Math.max(0, 1 - (f - 0.55) / 0.35);
      const swing = Math.sin(throwF * Math.PI * 0.5) * (p._both ? 1.15 : 0.9);
      p.lever.rotation.x = swing;
    },
    reload(f, p) {
      // thumb shells through the gate: lever half-open, gate flaps, the rack
      // empties shell by shell
      p.lever.rotation.x = f < 0.12 ? (f / 0.12) * 0.35 : f > 0.88 ? (1 - f) / 0.12 * 0.35 : 0.35;
      const feed = Math.min(3.999, f * 4.6);
      p.gate.rotation.z = Math.sin(feed * Math.PI) * -0.5;
      p.shells.forEach((sh, i) => { sh.visible = feed < i + 0.5; });
    },
  };
}

/* ================================================================== */
/* RIFLE — blackened-steel steam machine gun                           */
/* ================================================================== */

function buildRifle() {
  const g = new THREE.Group();

  // long blackened receiver
  g.add(box(0.08, 0.085, 0.36, blackSteel(), 0, 0, 0.02));
  // perforated cooling jacket (lighter gunmetal so the vents read) over a
  // blued inner barrel
  g.add(tube(0.02, 0.4, blued(), 12, 0, 0.015, -0.3));
  const jacket = tube(0.036, 0.34, M.get('gunmetal'), 16, 0, 0.015, -0.28);
  g.add(jacket);
  for (let row = 0; row < 3; row++) { // vent hole rows spiral down the jacket
    for (let i = 0; i < 5; i++) {
      const a = row * (Math.PI * 2 / 3) + i * 0.5;
      const hole = mesh(new THREE.CircleGeometry(0.008, 8), M.flat(0x0a0a0c, 0.9), 0, 0, 0);
      hole.position.set(Math.cos(a) * 0.0365, 0.015 + Math.sin(a) * 0.0365, -0.16 - i * 0.055);
      hole.lookAt(hole.position.x * 2, 0.015 + (hole.position.y - 0.015) * 2, hole.position.z);
      g.add(hole);
    }
  }
  g.add(ring(0.037, 0.006, steel(), 6, 16).translateY(0.015).translateZ(-0.45)); // jacket end cap
  g.add(box(0.008, 0.02, 0.008, steel(), 0, 0.06, -0.43)); // front post
  // carry handle: canvas-wrapped bar between two posts (signature silhouette)
  for (const z of [-0.04, 0.1]) g.add(box(0.014, 0.05, 0.014, blackSteel(), 0, 0.085, z));
  g.add(box(0.022, 0.022, 0.16, canvasMat(), 0, 0.105, 0.03));
  // side-mounted coil drum on the left (steps around as the belt feeds) —
  // copper against the black receiver so its rotation is unmissable
  const coil = anim(new THREE.Group());
  const drumBody = cyl(0.07, 0.07, 0.035, copper(), 18);
  drumBody.rotation.z = Math.PI / 2;
  coil.add(drumBody);
  for (let i = 0; i < 6; i++) { // radial ribs so rotation reads
    const a = (i / 6) * Math.PI * 2;
    const rib = box(0.014, 0.012, 0.05, brass(), 0, Math.sin(a) * 0.048, Math.cos(a) * 0.048);
    coil.add(rib);
  }
  coil.add(sphere(0.014, steel(), 8));
  coil.position.set(-0.065, 0.01, 0.06); g.add(coil);
  // copper boiler under the stock with a feed pipe running forward
  const boiler = tube(0.026, 0.12, copper(), 12, 0.0, -0.075, 0.22);
  g.add(boiler);
  g.add(ring(0.027, 0.005, brass(), 6, 12).translateY(-0.075).translateZ(0.17));
  const pipe = tube(0.007, 0.3, copper(), 8, 0.038, -0.03, 0.03);
  pipe.rotation.z = 0.06; g.add(pipe);
  // safety valve with a working glow (pressure tells you it's alive)
  const valve = anim(cyl(0.011, 0.011, 0.03, M.glow(0xff8a30, 0.5), 8, 0.0, -0.03, 0.285));
  valve.rotation.x = Math.PI / 2;
  g.add(valve);
  // reciprocating bolt handle on the right
  const bolt = anim(box(0.018, 0.018, 0.05, steel(), 0.052, 0.03, 0.08));
  g.add(bolt);
  // pistol grip + trigger
  const grip = box(0.045, 0.12, 0.05, ebony(), 0, -0.1, 0.13);
  grip.rotation.x = 0.26; g.add(grip);
  g.add(box(0.008, 0.026, 0.006, steel(), 0, -0.045, 0.09));
  // canvas sling strap hanging from the front post (idle pendulum)
  const strap = anim(new THREE.Group());
  strap.add(box(0.016, 0.11, 0.006, canvasMat(), 0, -0.055, 0));
  strap.add(box(0.02, 0.012, 0.01, brass(), 0, -0.115, 0));
  strap.position.set(0, -0.045, -0.34); g.add(strap);

  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.015, -0.52); g.add(muzzle);

  return {
    group: g, muzzle, parts: { coil, bolt, strap, valve },
    rest: { position: [0.16, -0.14, -0.46], rotation: [0.05, 0.36, 0.0], scale: 0.85 },
    fireDuration: 0.095,
    _step: 0,
    // 2.5 s idle loop: the sling sways, the boiler valve breathes
    idle(t, p) {
      const c = (t % 2.5) / 2.5 * Math.PI * 2;
      p.strap.rotation.z = Math.sin(c) * 0.14;
      p.strap.rotation.x = Math.cos(c * 0.5) * 0.05;
      p.valve.material.emissiveIntensity = 0.4 + Math.sin(c) * 0.12;
      p.bolt.position.z = p.bolt.userData.baseP.z;
      p.coil.position.x = p.coil.userData.baseP.x;
      p.coil.visible = true;
    },
    fire(f, p) {
      if (f === 0 || this._lastF > f) this._step += Math.PI / 3; // one rib per round
      this._lastF = f;
      p.coil.rotation.x = this._step + Math.sin(Math.min(1, f * 2) * Math.PI) * 0.12;
      const back = Math.sin(Math.min(1, f * 2) * Math.PI) * 0.035;
      p.bolt.position.z = p.bolt.userData.baseP.z + back;
      p.valve.material.emissiveIntensity = 1.8 * (1 - f) + 0.4;
      p.strap.rotation.z += 0.06 * (1 - f); // fire rate visibly rattles the sling
    },
    reload(f, p) {
      // swap the coil drum: out along the left, gone, fresh one back in
      const out = f < 0.45 ? f / 0.45 : f > 0.6 ? 1 - (f - 0.6) / 0.4 : 1;
      p.coil.position.x = p.coil.userData.baseP.x - out * 0.14;
      p.coil.visible = !(f > 0.42 && f < 0.62);
      p.coil.rotation.x = this._step + out * 2.4;
    },
  };
}

/* ================================================================== */
/* SNIPER — octagonal observatory rifle                                */
/* ================================================================== */

function buildSniper() {
  const g = new THREE.Group();

  // very long octagonal blued barrel (8-sided prism silhouette)
  const oct = tube(0.02, 0.74, blued(), 8, 0, 0.02, -0.37);
  oct.rotation.z = Math.PI / 8;
  g.add(oct);
  g.add(barrel(0.024, 0.02, 0.05, nickel(), 8, 0, 0.02, -0.72)); // nickel crown
  g.add(box(0.008, 0.018, 0.006, nickel(), 0, 0.052, -0.7));     // globe front sight
  // ebony fore rib under the barrel
  g.add(box(0.036, 0.03, 0.5, ebony(), 0, -0.012, -0.3));
  // nickel telescope: objective bell + sunshade + focus ring + eyepiece
  const scopeG = new THREE.Group();
  scopeG.add(tube(0.03, 0.36, nickel(), 16, 0, 0, -0.02));
  scopeG.add(barrel(0.038, 0.031, 0.07, nickel(), 16, 0, 0, -0.22)); // objective bell
  const shade = anim(tube(0.033, 0.07, blued(), 16, 0, 0, -0.28));   // sunshade tube
  scopeG.add(shade);
  scopeG.add(mesh(new THREE.CircleGeometry(0.028, 16), M.glass(0x264a5a, 0x0a1820), 0, 0, -0.312));
  const focus = anim(ring(0.034, 0.007, brass(), 6, 18));            // knurled focus ring
  focus.position.set(0, 0, 0.06);
  scopeG.add(focus);
  scopeG.add(barrel(0.024, 0.028, 0.05, blued(), 14, 0, 0, 0.14));   // eyepiece
  scopeG.position.set(0, 0.095, -0.02);
  g.add(scopeG);
  for (const z of [-0.12, 0.06]) g.add(box(0.016, 0.05, 0.018, nickel(), 0, 0.055, z)); // ring mounts
  // transverse harmonica breech block (slides sideways to eject/load)
  const breech = anim(box(0.09, 0.045, 0.05, nickel(), 0, 0.02, 0.05));
  g.add(breech);
  g.add(box(0.07, 0.06, 0.2, blackSteel(), 0, 0.0, 0.1)); // receiver housing
  // double set triggers in a long nickel guard
  const guard = ring(0.032, 0.005, nickel(), 6, 16);
  guard.rotation.x = Math.PI / 2; guard.position.set(0, -0.05, 0.13);
  guard.scale.set(1, 1.9, 1); g.add(guard);
  g.add(box(0.007, 0.026, 0.005, steel(), 0, -0.044, 0.11));
  g.add(box(0.007, 0.02, 0.005, brass(), 0, -0.042, 0.15));
  // skeletonized ebony stock: comb + belly frame with a thumbhole void
  const comb = box(0.05, 0.045, 0.3, ebony(), 0, 0.035, 0.3);
  g.add(comb);
  const belly = box(0.05, 0.04, 0.26, ebony(), 0, -0.085, 0.33);
  belly.rotation.x = 0.1; g.add(belly);
  g.add(box(0.05, 0.09, 0.045, ebony(), 0, -0.025, 0.44)); // rear post
  g.add(box(0.05, 0.075, 0.04, ebony(), 0, -0.03, 0.19));  // front post (thumbhole between)
  g.add(box(0.055, 0.11, 0.02, nickel(), 0, -0.028, 0.47)); // nickel butt plate
  g.add(box(0.04, 0.022, 0.1, leather(), 0, 0.068, 0.31));  // leather cheek pad
  // sling loops
  for (const [y, z] of [[-0.035, -0.42], [-0.11, 0.36]]) {
    const l = ring(0.01, 0.003, steel(), 6, 10);
    l.position.set(0, y, z); g.add(l);
  }

  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.02, -0.75); g.add(muzzle);

  return {
    group: g, muzzle, parts: { breech, focus, shade },
    rest: { position: [0.14, -0.11, -0.45], rotation: [0.03, 0.42, 0.02], scale: 0.72 },
    fireDuration: 1.1,
    // 3.6 s idle loop: the focus ring hunts, the sunshade breathes
    idle(t, p) {
      const c = (t % 3.6) / 3.6 * Math.PI * 2;
      p.focus.rotation.z = Math.sin(c) * 0.35;
      p.shade.position.z = p.shade.userData.baseP.z + Math.sin(c * 0.5) * 0.004;
      p.breech.position.x = p.breech.userData.baseP.x;
    },
    fire(f, p) {
      // harmonica cycle: block slides out right, dwells, slides home
      if (f < 0.25) p.breech.position.x = p.breech.userData.baseP.x + (f / 0.25) * 0.05;
      else if (f < 0.7) p.breech.position.x = p.breech.userData.baseP.x + 0.05;
      else p.breech.position.x = p.breech.userData.baseP.x + 0.05 * (1 - (f - 0.7) / 0.3);
      p.shade.position.z = p.shade.userData.baseP.z - Math.sin(Math.min(1, f * 3) * Math.PI) * 0.012;
    },
    reload(f, p) {
      // block out, five distinct seat ticks as the strip loads, block home
      p.breech.position.x = p.breech.userData.baseP.x +
        (f < 0.15 ? f / 0.15 : f > 0.85 ? (1 - f) / 0.15 : 1) * 0.055;
      p.breech.position.y = p.breech.userData.baseP.y + Math.abs(Math.sin(f * Math.PI * 5)) * 0.004;
    },
  };
}

/* ================================================================== */
/* BAT — ironshod oak slugger                                          */
/* ================================================================== */

function buildBat() {
  const g = new THREE.Group();

  // tapered oak body
  g.add(cyl(0.05, 0.026, 0.6, oak(), 16, 0, 0.11, 0));
  g.add(cyl(0.05, 0.046, 0.05, oak(), 16, 0, 0.42, 0)); // crown
  // hammered-iron cladding plates riveted around the head, proud studs
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const plate = box(0.045, 0.2, 0.012, hammered(), 0, 0.3, 0);
    plate.position.x = Math.cos(a) * 0.045;
    plate.position.z = Math.sin(a) * 0.045;
    plate.rotation.y = -a + Math.PI / 2;
    g.add(plate);
    for (const dy of [-0.06, 0, 0.06]) { // stud rows
      const stud = sphere(0.009, steel(), 6);
      stud.position.set(Math.cos(a) * 0.055, 0.3 + dy, Math.sin(a) * 0.055);
      g.add(stud);
    }
  }
  for (const y of [0.21, 0.39]) { // iron retaining bands
    const band = ring(0.049, 0.007, hammered(), 6, 16);
    band.rotation.x = Math.PI / 2; band.position.y = y;
    g.add(band);
  }
  // compression spring collar at the neck (slams on impact)
  const springG = anim(new THREE.Group());
  for (let i = 0; i < 5; i++) {
    const coilRing = ring(0.036, 0.006, steel(), 6, 14);
    coilRing.rotation.x = Math.PI / 2;
    coilRing.position.y = i * 0.018;
    springG.add(coilRing);
  }
  springG.position.set(0, 0.08, 0);
  g.add(springG);
  g.add(cyl(0.042, 0.042, 0.014, hammered(), 12, 0, 0.175, 0)); // spring stop washer
  // leather-wrapped grip + iron pommel
  g.add(cyl(0.03, 0.03, 0.2, leather(), 12, 0, -0.08, 0));
  g.add(cyl(0.038, 0.032, 0.035, hammered(), 12, 0, -0.2, 0));
  // wrist strap hanging from the pommel (idle pendulum)
  const strap = anim(new THREE.Group());
  strap.add(box(0.012, 0.09, 0.005, leather(), 0, -0.045, 0));
  const strapRing = ring(0.014, 0.004, brass(), 6, 10);
  strapRing.position.y = -0.095;
  strap.add(strapRing);
  strap.position.set(0.02, -0.21, 0);
  g.add(strap);

  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.4, 0); g.add(muzzle);

  return {
    group: g, muzzle, parts: { spring: springG, strap },
    rest: { position: [0.17, -0.2, -0.47], rotation: [-0.4, 0.66, -0.6], scale: 0.8 },
    fireDuration: 0.55,
    // 3.2 s idle loop: the wrist strap swings, the spring settles
    idle(t, p) {
      const c = (t % 3.2) / 3.2 * Math.PI * 2;
      p.strap.rotation.z = Math.sin(c) * 0.22;
      p.strap.rotation.x = Math.cos(c * 0.7) * 0.1;
      p.spring.scale.y = 1 + Math.sin(c * 2) * 0.015;
    },
    fire(f, p) {
      // spring compresses through the swing and slams back on impact
      const heavy = p._both ? 1.5 : 1;
      const squash = f < 0.35 ? (f / 0.35) : Math.max(0, 1 - (f - 0.35) / 0.4);
      p.spring.scale.y = 1 - squash * 0.45 * heavy;
      p.spring.position.y = p.spring.userData.baseP.y + squash * 0.02;
      p.strap.rotation.z = Math.sin(f * Math.PI) * -0.9 * heavy;
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
