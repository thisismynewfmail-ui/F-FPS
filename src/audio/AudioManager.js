/**
 * All game audio, synthesized with WebAudio — no sound files.
 *
 * Per-weapon gunshots, reload/empty clicks, surface-aware footsteps, pickup
 * chimes, zombie moans/growls (ambient intensity scales with how many are
 * nearby, positioned in stereo), wave horns, unlock rumbles, cosmic-horror
 * whispers and the victory fanfare.
 *
 * Everything is event-driven; systems never call into audio directly.
 */
export class AudioManager {
  constructor(events) {
    this.events = events;
    this.ctx = null;
    this.master = null;
    this._noiseBuf = null;
    this.moanIntensity = 0;
    this._moanTimer = 1;
    this._whisperTimer = 30;
    this.listener = { x: 0, z: 0, yaw: 0 };

    const on = events.on.bind(events);
    on('weapon:fire', ({ weapon, sound }) => this.gunshot(sound ?? weapon.config.sound));
    on('melee:swing', ({ hit }) => { this.whoosh(); if (hit) this.thud(); });
    on('weapon:reload:start', ({ weapon }) => this.reload(weapon.config.reloadTime, weapon.config.id));
    on('weapon:empty', () => this.emptyClick());
    on('weapon:switch', ({ weapon }) => this.equipSound(weapon.config.id));
    on('footstep', ({ surface, sprinting }) => this.footstep(surface, sprinting));
    on('pickup', ({ type }) => (type === 'health' ? this.healthChime() : type === 'key' ? this.keyChime() : this.ammoChime()));
    on('player:damage', () => this.hurt());
    on('player:heal', () => {});
    on('player:died', () => this.deathSting());
    on('zombie:death', ({ pos }) => this.gurgle(pos));
    on('zombie:aggro', ({ pos }) => this.growl(pos));
    on('wave:start', () => this.horn());
    on('zone:unlock', () => this.rumble());
    on('secret:found', () => this.secretChime());
    on('secret:bell', () => this.bell());
    on('whisper', ({ intensity }) => this.whisper(intensity ?? 0.6));
    on('victory', () => this.fanfare());
  }

  /** Must be called from a user gesture (start button). */
  unlock() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 1.5;
    this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this._noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  get t() { return this.ctx.currentTime; }

  _noise(dur, filterType, freq, q, gain, when = 0, pan = 0, freqEnd = null) {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(freq, this.t + when);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, this.t + when + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, this.t + when);
    g.gain.exponentialRampToValueAtTime(0.001, this.t + when + dur);
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(f).connect(g).connect(p).connect(this.master);
    src.start(this.t + when);
    src.stop(this.t + when + dur + 0.05);
  }

  _tone(type, freq, dur, gain, when = 0, pan = 0, freqEnd = null) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, this.t + when);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), this.t + when + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, this.t + when);
    g.gain.exponentialRampToValueAtTime(0.001, this.t + when + dur);
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    o.connect(g).connect(p).connect(this.master);
    o.start(this.t + when);
    o.stop(this.t + when + dur + 0.05);
  }

  /** Stereo pan + attenuation for a world position. */
  _spatial(pos, maxDist = 60) {
    const dx = pos.x - this.listener.x, dz = pos.z - this.listener.z;
    const dist = Math.hypot(dx, dz);
    if (dist > maxDist) return null;
    const ang = Math.atan2(dx, dz) - this.listener.yaw;
    return { pan: Math.max(-1, Math.min(1, -Math.sin(ang) * 0.8)), vol: 1 - dist / maxDist };
  }

  /* ---------------- weapons ---------------- */

  // A "punch": a low body tone with a fast downward pitch sweep. This is what
  // gives every gunshot its weight and thump before the noise crack.
  _punch(freq, freqEnd, dur, gain, when = 0, pan = 0, type = 'sine') {
    this._tone(type, freq, dur, gain, when, pan, freqEnd);
  }
  // A brass-mechanism tick — the steampunk action cycling after a shot.
  _brassTick(when = 0, gain = 0.09, pan = 0) {
    this._noise(0.02, 'highpass', 3200, 1, gain, when, pan);
    this._tone('square', 2600, 0.02, gain * 0.5, when + 0.005, pan, 1800);
  }

  /**
   * Per-weapon gunshots. Each is layered (body punch + noise crack + brassy
   * action tick + tail) and level-matched so no weapon dominates the mix.
   */
  gunshot(kind) {
    if (!this.ctx) return;
    switch (kind) {
      case 'pistol': // sharp, snappy, brass-cased
        this._punch(300, 70, 0.09, 0.42, 0, 0, 'triangle');
        this._noise(0.07, 'lowpass', 2600, 1, 0.5);
        this._noise(0.05, 'highpass', 3600, 0.8, 0.16);
        this._brassTick(0.05, 0.08);
        break;
      case 'pistolAuto': // hair-trigger: lighter and higher so rapid fire stays clean
        this._punch(260, 90, 0.05, 0.3, 0, 0, 'triangle');
        this._noise(0.045, 'bandpass', 3000, 1.2, 0.34);
        this._brassTick(0.03, 0.05);
        break;
      case 'shotgun': // deep gritty boom with a low tail
        this._punch(150, 34, 0.22, 0.6, 0, 0, 'sine');
        this._punch(90, 30, 0.3, 0.4, 0, 0, 'sine');
        this._noise(0.26, 'lowpass', 950, 0.8, 0.62);
        this._noise(0.45, 'lowpass', 500, 0.5, 0.18, 0.08); // smoke tail
        this._brassTick(0.09, 0.07);
        break;
      case 'shotgunDouble': // both barrels: two stacked booms, biggest impact
        this._punch(150, 32, 0.26, 0.7, 0, 0, 'sine');
        this._punch(120, 28, 0.3, 0.55, 0.02, 0, 'sine');
        this._punch(70, 26, 0.36, 0.42, 0, 0, 'sine');
        this._noise(0.32, 'lowpass', 850, 0.8, 0.7);
        this._noise(0.6, 'lowpass', 420, 0.5, 0.22, 0.1);
        break;
      case 'rifle': // mechanical crack with a brassy metallic ring
        this._punch(220, 80, 0.05, 0.34, 0, 0, 'square');
        this._noise(0.05, 'bandpass', 2100, 1.4, 0.42);
        this._tone('square', 1500, 0.03, 0.1, 0.01, 0.1, 2600); // action ring
        this._brassTick(0.035, 0.06, -0.1);
        break;
      case 'rifleBurst': // burst rounds: tighter and a touch brighter
        this._punch(240, 90, 0.045, 0.36, 0, 0, 'square');
        this._noise(0.045, 'bandpass', 2400, 1.5, 0.44);
        this._brassTick(0.03, 0.06);
        break;
      case 'sniper': // heavy crack, deep body, long rolling echo
        this._punch(170, 40, 0.2, 0.62, 0, 0, 'sawtooth');
        this._punch(80, 30, 0.28, 0.4, 0, 0, 'sine');
        this._noise(0.13, 'lowpass', 3400, 1, 0.6);
        this._noise(0.6, 'lowpass', 700, 0.6, 0.2, 0.14);  // valley echo 1
        this._noise(0.7, 'lowpass', 480, 0.6, 0.12, 0.34); // valley echo 2
        this._brassTick(0.16, 0.07);
        break;
      case 'batCharge': // steam-piston wind-up + iron clank (melee alt)
        this._noise(0.35, 'highpass', 1800, 0.7, 0.22, 0, 0, 600); // steam hiss
        this._tone('sine', 70, 0.12, 0.34, 0.28, 0, 40);           // piston slam
        this._noise(0.08, 'lowpass', 400, 1, 0.4, 0.3);            // clank
        break;
      case 'bat': break; // primary swing carried by whoosh()/thud()
    }
  }

  whoosh() { this._noise(0.16, 'bandpass', 500, 1.6, 0.28, 0, 0, 1500); }
  thud() { this._noise(0.1, 'lowpass', 300, 1, 0.55); this._tone('sine', 90, 0.1, 0.4, 0, 0, 50); }
  click(freq = 1800, gain = 0.08) { this._noise(0.025, 'highpass', freq, 1, gain); }

  /** Dry hammer-on-empty-chamber click. */
  emptyClick() {
    this._noise(0.02, 'highpass', 2600, 1, 0.12);
    this._tone('square', 900, 0.02, 0.08, 0.01, 0, 500);
  }

  /** Holster the old weapon, draw and seat the new one (brass ratchet). */
  equipSound(id) {
    this._noise(0.03, 'bandpass', 1000, 2, 0.1, 0);         // leather/holster
    this._tone('square', 1600, 0.03, 0.07, 0.05, 0, 2400);  // draw
    this._brassTick(0.1, 0.09);
    if (id === 'shotgun' || id === 'sniper') this._tone('sine', 120, 0.05, 0.14, 0.12, 0, 70); // heavy seat
  }

  /**
   * Reload choreography: an immediate release/eject, mid-cycle mechanism,
   * and a seating "complete" thunk near the end. Shaped per weapon family.
   */
  reload(time, id) {
    if (!this.ctx) return;
    if (id === 'shotgun') {
      // break the action, thumb shells, snap shut
      this._tone('square', 700, 0.05, 0.12, 0, 0, 300);       // break open
      this._noise(0.03, 'bandpass', 1100, 2, 0.12, time * 0.35);
      this._noise(0.03, 'bandpass', 1100, 2, 0.12, time * 0.55);
      this._tone('sine', 130, 0.06, 0.2, time * 0.92, 0, 70); // snap shut
      this._brassTick(time * 0.95, 0.1);
    } else if (id === 'sniper') {
      this._tone('square', 800, 0.05, 0.12, 0, 0, 400);       // bolt back
      this._noise(0.05, 'bandpass', 900, 2, 0.14, time * 0.45); // clip press
      this._tone('square', 1200, 0.04, 0.12, time * 0.85, 0, 700); // bolt forward
      this._brassTick(time * 0.9, 0.09);
    } else {
      // magazine weapons: release, insert, chamber
      this.click(1300, 0.1);
      this._noise(0.03, 'bandpass', 900, 2, 0.12, time * 0.45);
      this._tone('square', 1100, 0.03, 0.14, time * 0.88, 0, 600);
      this._brassTick(time * 0.94, 0.08);
    }
  }

  /* ---------------- movement / pickups ---------------- */

  footstep(surface, sprinting) {
    if (!this.ctx) return;
    const g = sprinting ? 0.11 : 0.07;
    switch (surface) {
      case 'concrete': case 'road': this._noise(0.05, 'lowpass', 1500, 1, g); break;
      case 'wood': this._noise(0.06, 'lowpass', 800, 1.5, g * 1.2); this._tone('sine', 130, 0.05, g * 0.5); break;
      case 'water': this._noise(0.12, 'bandpass', 1100, 1, g * 1.3); break;
      case 'dirt': this._noise(0.06, 'lowpass', 700, 1, g); break;
      default: this._noise(0.07, 'lowpass', 520, 1, g * 0.9); // grass
    }
  }

  ammoChime() { this._tone('square', 660, 0.07, 0.12); this._tone('square', 990, 0.09, 0.12, 0.06); }
  healthChime() { this._tone('triangle', 440, 0.1, 0.16); this._tone('triangle', 554, 0.1, 0.16, 0.08); this._tone('triangle', 660, 0.16, 0.16, 0.16); }
  keyChime() { this._tone('square', 880, 0.06, 0.13); this._tone('square', 1174, 0.06, 0.13, 0.07); this._tone('square', 1568, 0.12, 0.13, 0.14); }
  secretChime() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => this._tone('triangle', n, 0.14, 0.14, i * 0.09));
  }

  /* ---------------- player / zombies ---------------- */

  hurt() { this._noise(0.14, 'lowpass', 600, 1, 0.4); this._tone('sawtooth', 160, 0.12, 0.2, 0, 0, 80); }
  deathSting() { this._tone('sawtooth', 220, 1.2, 0.3, 0, 0, 55); this._noise(1.0, 'lowpass', 400, 1, 0.25); }

  growl(pos) {
    const s = this._spatial(pos, 50);
    if (!s) return;
    this._tone('sawtooth', 90 + Math.random() * 40, 0.5, 0.16 * s.vol, 0, s.pan, 60);
    this._noise(0.4, 'bandpass', 300, 2, 0.12 * s.vol, 0, s.pan);
  }

  gurgle(pos) {
    const s = this._spatial(pos, 45);
    if (!s) return;
    this._noise(0.3, 'bandpass', 500, 3, 0.14 * s.vol, 0, s.pan, 150);
    this._tone('sawtooth', 120, 0.28, 0.1 * s.vol, 0.03, s.pan, 45);
  }

  moan(pan, vol) {
    const f = 65 + Math.random() * 55;
    this._tone('sawtooth', f, 1.4, 0.09 * vol, 0, pan, f * (0.8 + Math.random() * 0.5));
    this._noise(1.1, 'bandpass', 260 + Math.random() * 160, 3, 0.05 * vol, 0.1, pan);
  }

  whisper(intensity = 0.6) {
    if (!this.ctx) return;
    const pan = Math.random() * 2 - 1; // from a direction that makes no sense
    for (let i = 0; i < 4; i++) {
      this._noise(0.12 + Math.random() * 0.12, 'bandpass', 1400 + Math.random() * 1600, 6,
        0.05 * intensity, i * 0.16 + Math.random() * 0.05, pan);
    }
  }

  /* ---------------- world events ---------------- */

  horn() {
    this._tone('sawtooth', 70, 1.6, 0.24, 0, 0, 95);
    this._tone('sawtooth', 105, 1.6, 0.16, 0.1, 0, 140);
  }

  rumble() {
    this._noise(2.4, 'lowpass', 130, 0.7, 0.5);
    this._tone('sine', 45, 2.2, 0.32, 0, 0, 28);
  }

  bell() {
    for (const [f, g, w] of [[660, 0.3, 0], [1320, 0.12, 0], [660 * 0.99, 0.2, 0.8], [495, 0.1, 0]]) {
      this._tone('sine', f, 2.6, g, w);
    }
    this._noise(0.04, 'highpass', 2400, 1, 0.2);
  }

  fanfare() {
    if (!this.ctx) return;
    const seq = [523, 659, 784, 1046, 784, 1046, 1318, 1568];
    seq.forEach((n, i) => {
      this._tone('square', n, 0.22, 0.14, i * 0.16);
      this._tone('triangle', n / 2, 0.22, 0.1, i * 0.16);
    });
    this._tone('triangle', 2093, 1.2, 0.12, seq.length * 0.16);
  }

  /* ---------------- ambient loop ---------------- */

  /** Called each frame with the local horde pressure (0..~20). */
  update(dt, player, nearbyZombies) {
    if (!this.ctx) return;
    this.listener.x = player.position.x;
    this.listener.z = player.position.z;
    this.listener.yaw = player.yaw;

    this.moanIntensity = Math.min(1, nearbyZombies / 12);
    this._moanTimer -= dt;
    if (this._moanTimer <= 0) {
      this._moanTimer = 5.5 - this.moanIntensity * 4.4 + Math.random() * 2;
      if (nearbyZombies > 0) this.moan(Math.random() * 1.6 - 0.8, 0.35 + this.moanIntensity * 0.65);
    }

    // Rare ambient whispers keep the town wrong.
    this._whisperTimer -= dt;
    if (this._whisperTimer <= 0) {
      this._whisperTimer = 70 + Math.random() * 90;
      this.whisper(0.35);
    }
  }
}
