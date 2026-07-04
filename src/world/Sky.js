import * as THREE from '../../lib/three.module.js';

/**
 * Day/night sky.
 *
 * Drives a slow cycle that colours the sky + fog, swings a sun and a moon
 * across the dome (the scene's single directional light follows whichever is
 * up, warm by day and cool by night), and drifts a handful of soft procedural
 * clouds overhead. Everything sky-side renders behind the world via a negative
 * renderOrder with depth-test off, so it always sits at infinity regardless of
 * the fog wall / camera far plane.
 *
 * Exposes `isDay` and `dayFactor` (0 night … 1 full day) for gameplay — the
 * cockroach uses them to decide whether to hide indoors or roam outside.
 */
const CYCLE = 300;         // seconds for a full day+night
const START_PHASE = 0.22;  // begin mid-morning: sun + clouds visible at once
const SKY_DIST = 150;      // how far sun/moon sit from the camera
const CLOUD_ALT = 96;      // cloud altitude
const CLOUD_COUNT = 9;     // "not too numerous"

const DAY_SKY = new THREE.Color(0x8fb6e0);
const NIGHT_SKY = new THREE.Color(0x0b1226);
const DUSK = new THREE.Color(0xd9884a);

export class Sky {
  constructor(renderer, texLib) {
    this.scene = renderer.scene;
    this.fog = renderer.scene.fog;
    this.bg = renderer.scene.background;
    this.hemi = renderer.hemiLight;
    this.sun = renderer.sunLight;
    this.amb = renderer.ambLight;
    this.phase = START_PHASE;
    this._el = 1;

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.sunSprite = this._disc(texLib, 0xfff2c8, 34, THREE.AdditiveBlending, -10);
    this.moonSprite = this._disc(texLib, 0xcdd6ff, 20, THREE.NormalBlending, -10);

    // Clouds: soft smoke puffs spread around the player, drifting east.
    this.clouds = [];
    const cloudTex = softTexture(0xffffff);
    for (let i = 0; i < CLOUD_COUNT; i++) {
      const mat = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.0, depthTest: false, depthWrite: false, fog: false });
      const s = new THREE.Sprite(mat);
      const scale = 46 + Math.random() * 40;
      s.scale.set(scale, scale * 0.55, 1);
      s.renderOrder = -9;
      s.userData = {
        ox: (Math.random() - 0.5) * 440,
        oz: (Math.random() - 0.5) * 440,
        y: CLOUD_ALT + (Math.random() - 0.5) * 24,
        speed: 2.4 + Math.random() * 2.6,
      };
      this.group.add(s);
      this.clouds.push(s);
    }
  }

  _disc(_texLib, color, size, blending, order) {
    const mat = new THREE.SpriteMaterial({ map: softTexture(color, true), transparent: true, depthTest: false, depthWrite: false, fog: false, blending });
    const s = new THREE.Sprite(mat);
    s.scale.set(size, size, 1);
    s.renderOrder = order;
    this.group.add(s);
    return s;
  }

  get isDay() { return this._el > 0; }
  get dayFactor() { return Math.max(0, Math.min(1, (this._el + 0.1) / 0.35)); }

  /** Jump straight to a time of day (0..1, 0 = sunrise, 0.25 = noon). */
  setPhase(p) { this.phase = ((p % 1) + 1) % 1; }

  update(dt, camPos) {
    this.phase = (this.phase + dt / CYCLE) % 1;
    const ang = this.phase * Math.PI * 2;          // 0 sunrise → noon → sunset → midnight
    const el = Math.sin(ang);                       // sun elevation, -1..1
    this._el = el;
    const day = this.dayFactor;

    // sun / moon directions (rise east, set west), sky follows the camera
    const cosEl = Math.cos(ang);
    const sunDir = new THREE.Vector3(cosEl, el, 0.35).normalize();
    const moonDir = sunDir.clone().negate();
    this.sunSprite.position.copy(camPos).addScaledVector(sunDir, SKY_DIST);
    this.moonSprite.position.copy(camPos).addScaledVector(moonDir, SKY_DIST);
    this.sunSprite.material.opacity = Math.max(0, el + 0.1);
    this.moonSprite.material.opacity = Math.max(0, -el + 0.15) * 0.9;

    // sky + fog colour: night → day, with a warm band while the sun is low
    const horizon = Math.max(0, 1 - Math.abs(el) / 0.28);
    const sky = NIGHT_SKY.clone().lerp(DAY_SKY, day);
    sky.lerp(DUSK, horizon * 0.4 * Math.max(day, 0.25));
    this.bg.copy(sky);
    this.fog.color.copy(sky);

    // the directional light is the sun by day, a dim cool moon by night
    if (el >= 0) {
      this.sun.position.copy(sunDir).multiplyScalar(100);
      this.sun.color.setRGB(0.95, 0.82 + horizon * 0.1, 0.62 - horizon * 0.15);
      this.sun.intensity = 0.35 + day * 1.0;
    } else {
      this.sun.position.copy(moonDir).multiplyScalar(100);
      this.sun.color.setRGB(0.6, 0.68, 0.9);
      this.sun.intensity = 0.28;
    }
    this.hemi.intensity = 0.4 + day * 0.85;
    this.amb.intensity = 0.32 + day * 0.55;

    // drift clouds; keep them centred on the player and fade at night
    const cloudOpacity = 0.12 + day * 0.5;
    for (const c of this.clouds) {
      const u = c.userData;
      u.ox += u.speed * dt;
      if (u.ox > 240) u.ox -= 480;
      c.position.set(camPos.x + u.ox, u.y, camPos.z + u.oz);
      c.material.opacity = cloudOpacity;
    }
  }
}

/**
 * A soft round sprite texture (radial alpha falloff). `hardCore` gives a
 * brighter solid centre for the sun/moon; clouds use a gentle blob.
 */
function softTexture(color = 0xffffff, hardCore = false) {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const col = new THREE.Color(color);
  const r = Math.round(col.r * 255), g = Math.round(col.g * 255), b = Math.round(col.b * 255);
  const grad = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  if (hardCore) {
    grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
    grad.addColorStop(0.45, `rgba(${r},${g},${b},0.95)`);
    grad.addColorStop(0.7, `rgba(${r},${g},${b},0.35)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  } else {
    grad.addColorStop(0, `rgba(${r},${g},${b},0.9)`);
    grad.addColorStop(0.5, `rgba(${r},${g},${b},0.5)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.Texture(c);
  tex.needsUpdate = true;
  return tex;
}
