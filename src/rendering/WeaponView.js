import * as THREE from '../../lib/three.module.js';
import { buildWeaponModel } from '../weapons/WeaponModels.js';
import { WEAPON_CONFIGS } from '../weapons/WeaponConfigs.js';

/**
 * First-person 3D weapon viewmodel.
 *
 * Owns a private overlay scene + camera (drawn on top of the world by the
 * Renderer with the depth buffer cleared, so the weapon never clips through
 * geometry and is untouched by fog). Builds a 3D rig for every weapon and
 * drives all of its animation procedurally:
 *
 *   - gait bob synced to the player's stride + look-sway lag + idle breathing
 *   - a three-phase fire recoil (windup → kickback → recovery) scaled by the
 *     weapon's weight, plus the rig's own part motion (slides, bolts, rotors)
 *   - full reload choreography (mag drops, break-open, bolt cycle)
 *   - equip raise / unequip lower with smooth interpolation on weapon switch
 *   - a 3D muzzle flash (additive sprite + cone + point light) at the barrel
 *   - hides entirely while the sniper scope is up or the game isn't playing
 *
 * Interface mirrors the old sprite ViewModel: update(dt, player, weaponMgr).
 */
export class WeaponView {
  constructor(events, renderer, texLib) {
    this.events = events;
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(52, renderer.camera.aspect, 0.01, 12);
    this.camera.position.set(0, 0, 0);

    this.root = new THREE.Group();     // toggled with game state / scope
    this.scene.add(this.root);

    this._lighting();
    this._environment();

    // Build every weapon rig once; show one at a time.
    this.rigs = {};
    for (const cfg of WEAPON_CONFIGS) {
      const rig = buildWeaponModel(cfg.id);
      rig.group.visible = false;
      this.root.add(rig.group);
      this.rigs[cfg.id] = rig;
    }
    this.currentId = null;

    this._buildFlash(texLib);

    // animation state
    this.t = 0;
    this.equip = 1;          // 1 = lowered/away, 0 = in position
    this.swapTo = null;
    this.fireT = -1;         // <0 = not firing
    this.fireDur = 0.2;
    this.isMelee = false;
    this.alt = false;
    this.swayX = 0; this.swayY = 0;
    this._lastYaw = 0; this._lastPitch = 0;
    this.scoped = false;
    this.reloadEnv = 0;

    renderer.setOverlay(this.scene, this.camera);
    this._wire();
  }

  _lighting() {
    this.scene.add(new THREE.HemisphereLight(0xe0e8f5, 0x3a3428, 1.6));
    const key = new THREE.DirectionalLight(0xfff2e0, 3.0);
    key.position.set(-0.5, 0.9, 0.7); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xa0b6d8, 1.5);
    rim.position.set(0.8, 0.3, -0.6); this.scene.add(rim);
    // warm fill from below-right catches the brass; ambient lifts the shadows
    const fill = new THREE.PointLight(0xffd8a0, 9, 5, 2);
    fill.position.set(0.5, -0.3, 0.6); this.scene.add(fill);
    this.scene.add(new THREE.AmbientLight(0x606a7a, 0.7));
  }

  /** Procedural environment so the metals get real reflections. */
  _environment() {
    try {
      const c = document.createElement('canvas'); c.width = 128; c.height = 64;
      const ctx = c.getContext('2d');
      const grd = ctx.createLinearGradient(0, 0, 0, 64);
      grd.addColorStop(0, '#d2dbea'); grd.addColorStop(0.45, '#8f9cb0');
      grd.addColorStop(0.5, '#5a626e'); grd.addColorStop(1, '#22262e');
      ctx.fillStyle = grd; ctx.fillRect(0, 0, 128, 64);
      ctx.fillStyle = 'rgba(255,244,220,0.95)'; ctx.beginPath();
      ctx.ellipse(40, 18, 20, 11, 0, 0, Math.PI * 2); ctx.fill(); // warm sky lamp
      const eq = new THREE.CanvasTexture(c);
      eq.mapping = THREE.EquirectangularReflectionMapping;
      eq.colorSpace = THREE.SRGBColorSpace;
      const pmrem = new THREE.PMREMGenerator(this.renderer.renderer);
      this.scene.environment = pmrem.fromEquirectangular(eq).texture;
      this.scene.environmentIntensity = 1.35;
      pmrem.dispose(); eq.dispose();
    } catch (e) {
      // software / restricted WebGL: fall back to lights alone
    }
  }

  _buildFlash(texLib) {
    this.flash = new THREE.Group();
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.28, 0.28),
      new THREE.MeshBasicMaterial({
        map: texLib?.get('muzzleFlash'), color: 0xffd27a,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    this.flashSprite = plane;
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.05, 0.16, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    cone.rotation.x = -Math.PI / 2; cone.position.z = -0.08;
    this.flashCone = cone;
    this.flash.add(plane, cone);
    this.flashLight = new THREE.PointLight(0xffc860, 0, 3, 2);
    this.flash.add(this.flashLight);
    this.flash.visible = false;
    this.flashT = 0;
    this.root.add(this.flash);
  }

  _wire() {
    this.events.on('state:change', ({ next }) => {
      this.root.visible = next === 'playing' && !this.scoped;
    });
    this.events.on('weapon:switch', ({ weapon }) => { this.swapTo = weapon.config.id; });
    this.events.on('weapon:fire', ({ weapon, alt }) => this._onFire(weapon, alt));
    this.events.on('scope', ({ on }) => {
      this.scoped = on;
      this.root.visible = !on;
    });
  }

  _onFire(weapon, alt) {
    this.fireT = 0;
    this.alt = !!alt;
    const rig = this.rigs[weapon.config.id];
    this.fireDur = rig ? rig.fireDuration : 0.2;
    this.isMelee = weapon.isMelee;
    if (rig) rig._both = !!alt; // shotgun double-blast fires both hammers
    if (!weapon.isMelee) {
      // muzzle flash
      const heavy = weapon.config.kick;
      this.flashT = 0.055;
      this._flashScale = (0.7 + heavy * 0.18) * (alt && weapon.config.id === 'shotgun' ? 1.5 : 1);
      this.flashLight.intensity = 4 + heavy * 1.5;
    }
  }

  _setVisible(id) {
    if (this.currentId === id) return;
    if (this.currentId && this.rigs[this.currentId]) this.rigs[this.currentId].group.visible = false;
    this.currentId = id;
    if (this.rigs[id]) this.rigs[id].group.visible = true;
  }

  update(dt, player, weaponManager) {
    this.t += dt;

    // keep viewmodel aspect matched to the world camera
    if (this.camera.aspect !== this.renderer.camera.aspect) {
      this.camera.aspect = this.renderer.camera.aspect;
      this.camera.updateProjectionMatrix();
    }

    const weapon = weaponManager.current;
    const id = weapon.config.id;

    // --- equip / unequip on switch ---
    if (this.currentId === null) { this._setVisible(id); this.equip = 1; }
    if (this.swapTo && this.swapTo !== this.currentId) {
      // lower the old weapon away, swap at the bottom, raise the new one
      this.equip = Math.min(1, this.equip + dt * 9);
      if (this.equip >= 0.999) this._setVisible(this.swapTo);
      if (this.currentId === this.swapTo) this.swapTo = null;
    } else {
      this._setVisible(id);
      this.equip = Math.max(0, this.equip - dt * 6);
    }

    const rig = this.rigs[this.currentId];
    if (!rig) return;
    const grp = rig.group;
    const rest = rig.rest;

    // --- accumulate offsets from rest ---
    let px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0;

    // idle breathing
    py += Math.sin(this.t * 1.6) * 0.004;
    rz += Math.sin(this.t * 1.1) * 0.012;
    px += Math.cos(this.t * 0.9) * 0.003;

    // gait bob
    const bx = Math.cos(player.bobPhase) * player.bobAmp * 0.6;
    const by = Math.abs(Math.sin(player.bobPhase)) * player.bobAmp * 0.8;
    px += bx; py -= by;

    // look-sway lag
    let dYaw = player.yaw - this._lastYaw;
    let dPitch = player.pitch - this._lastPitch;
    this._lastYaw = player.yaw; this._lastPitch = player.pitch;
    // unwrap
    if (dYaw > Math.PI) dYaw -= Math.PI * 2; else if (dYaw < -Math.PI) dYaw += Math.PI * 2;
    this.swayX += (THREE.MathUtils.clamp(dYaw * 3, -0.12, 0.12) - this.swayX) * Math.min(1, dt * 12);
    this.swayY += (THREE.MathUtils.clamp(dPitch * 3, -0.12, 0.12) - this.swayY) * Math.min(1, dt * 12);
    px += this.swayX; py += this.swayY;
    ry += this.swayX * 0.6; rx += -this.swayY * 0.6;

    // --- part-level idle ---
    rig.idle(this.t, rig.parts);

    // --- fire recoil / swing ---
    if (this.fireT >= 0) {
      this.fireT += dt;
      const f = Math.min(1, this.fireT / this.fireDur);
      if (this.isMelee) this._applySwing(f, this.alt, (o) => { px += o.px; py += o.py; pz += o.pz; rx += o.rx; ry += o.ry; rz += o.rz; });
      else this._applyRecoil(f, weapon.config.kick, (o) => { px += o.px; py += o.py; pz += o.pz; rx += o.rx; rz += o.rz; });
      rig.fire(f, rig.parts);
      if (f >= 1) this.fireT = -1;
    }

    // --- reload ---
    if (weapon.reloading) {
      const f = 1 - weapon.reloadLeft / weapon.reloadDuration;
      const env = f < 0.15 ? f / 0.15 : f > 0.8 ? (1 - f) / 0.2 : 1;
      py -= env * 0.07; rx -= env * 0.18; rz += env * 0.14; pz += env * 0.05;
      rig.reload(f, rig.parts, weapon.tactical);
    } else if (rig.parts.mag) {
      rig.parts.mag.visible = true; // ensure restored
    }

    // --- equip transform ---
    const e = this.equip * this.equip;
    py -= e * 0.4; rx += e * 0.7; rz += e * 0.35; pz += e * 0.1;

    // --- compose ---
    grp.position.set(rest.position[0] + px, rest.position[1] + py, rest.position[2] + pz);
    grp.rotation.set(rest.rotation[0] + rx, rest.rotation[1] + ry, rest.rotation[2] + rz);
    grp.scale.setScalar(rest.scale ?? 1);

    // --- muzzle flash ---
    this._updateFlash(dt, rig);
  }

  /** Three-phase recoil: windup, kickback, recovery. */
  _applyRecoil(f, kick, add) {
    const ks = 0.4 + kick * 0.32;
    // windup anticipation (short forward dip)
    const w = f < 0.12 ? Math.sin((f / 0.12) * Math.PI) : 0;
    // kick envelope: ramp to a peak, then ease back
    let e;
    if (f < 0.12) e = 0;
    else if (f < 0.3) e = (f - 0.12) / 0.18;
    else e = Math.max(0, 1 - (f - 0.3) / 0.7);
    e = e * e * (3 - 2 * e); // smootherstep
    add({
      px: 0,
      py: e * 0.05 * ks - w * 0.01,
      pz: e * 0.11 * ks - w * 0.025,   // +Z = back toward the player
      rx: e * 0.22 * ks - w * 0.04,    // muzzle climb (windup dips it first)
      rz: e * 0.05 * ks,
    });
  }

  /** Melee arc swing across the view. Charged (alt) swings wider and slower. */
  _applySwing(f, charged, add) {
    const s = Math.sin(f * Math.PI);
    const wind = charged ? Math.sin(Math.min(1, f * 1.2) * Math.PI * 0.5) : 0;
    const m = charged ? 1.5 : 1;
    add({
      px: -s * 0.28 * m + wind * 0.06,
      py: s * 0.08 - wind * 0.05,
      pz: s * 0.12,
      rx: -s * 0.5 * m - wind * 0.2,
      ry: s * 0.3,
      rz: -s * 1.3 * m - wind * 0.3,
    });
  }

  _updateFlash(dt, rig) {
    if (this.flashT > 0) {
      this.flashT -= dt;
      rig.muzzle.getWorldPosition(this.flash.position);
      rig.muzzle.getWorldQuaternion(this.flash.quaternion);
      const sc = this._flashScale * (0.7 + Math.random() * 0.5);
      this.flashSprite.scale.setScalar(sc);
      this.flashSprite.rotation.z = Math.random() * Math.PI;
      this.flashCone.scale.setScalar(sc);
      this.flash.visible = this.root.visible;
      this.flashLight.intensity *= 0.6;
    } else {
      this.flash.visible = false;
      this.flashLight.intensity = 0;
    }
  }
}
