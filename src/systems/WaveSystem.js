import { WIN_KILLS } from './ScoreSystem.js';

/**
 * Horde waves. Each wave carries a budget of zombies the spawn director
 * streams into the world; the wave ends when the budget is spent and the
 * field is clear. Between waves there is a short respite with supply drops
 * near the player.
 *
 * Difficulty escalates on two axes: wave number and overall progress toward
 * the 250,000-kill goal — later waves are bigger, spawn faster, and carry a
 * higher share of sprinters and tanks.
 */
const RESPITE_TIME = 12;
// Exploders stay out of the mix until the player has this many kills under
// their belt, then join the spawn table with a modest, slowly-growing share.
export const EXPLODER_KILL_GATE = 120;

export class WaveSystem {
  constructor(events, score) {
    this.events = events;
    this.score = score;
    this.wave = 0;
    this.state = 'respite';
    this.respiteLeft = 5; // short grace period at game start
    this.budget = 0;
    this.aliveFromWave = 0;
    this.suppliesDropped = true; // no drop before wave 1
  }

  get progress() { return Math.min(1, this.score.kills / WIN_KILLS); }

  waveSize(n) {
    const base = 18 + n * 7;
    return Math.min(600, Math.round(base * (1 + this.progress * 5)));
  }

  spawnInterval() {
    return Math.max(0.5, 2.2 - this.wave * 0.08 - this.progress * 0.8);
  }

  typeWeights() {
    const sprinter = Math.min(0.38, 0.04 + this.wave * 0.012 + this.progress * 0.34);
    const tank = Math.min(0.15, Math.max(0, (this.wave - 3) * 0.008 + this.progress * 0.12));
    // Only spawn exploders once past the kill gate; then ramp their share a
    // little with overall progress.
    const exploder = this.score.kills >= EXPLODER_KILL_GATE
      ? Math.min(0.2, 0.07 + this.progress * 0.13) : 0;
    return { walker: Math.max(0, 1 - sprinter - tank - exploder), sprinter, tank, exploder };
  }

  /** Called by the spawn director when it spawns/removes wave zombies. */
  noteSpawned(n = 1) { this.budget -= n; this.aliveFromWave += n; }
  noteRemoved(n = 1) { this.aliveFromWave = Math.max(0, this.aliveFromWave - n); }

  update(dt, playerAlive) {
    if (!playerAlive) return;
    if (this.state === 'respite') {
      this.respiteLeft -= dt;
      if (!this.suppliesDropped && this.respiteLeft < RESPITE_TIME - 1.5) {
        this.suppliesDropped = true;
        this.events.emit('supplies:drop', { wave: this.wave });
      }
      if (this.respiteLeft <= 0) {
        this.wave++;
        this.budget = this.waveSize(this.wave);
        this.state = 'active';
        this.events.emit('wave:start', { wave: this.wave, size: this.budget });
      }
    } else if (this.budget <= 0 && this.aliveFromWave === 0) {
      this.state = 'respite';
      this.respiteLeft = RESPITE_TIME;
      this.suppliesDropped = false;
      this.events.emit('wave:end', { wave: this.wave });
    }
  }
}
