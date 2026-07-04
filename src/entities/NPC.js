import { Entity } from './Entity.js';
import { SpriteBillboard, makeSpriteMaterial } from '../rendering/Billboard.js';

/**
 * The peaceful survivor by the well in Old Town Square.
 * Wanders a small loop near her spawn, always turns her sprite to the
 * viewer, and murmurs a line when the player comes close. Zombies leave
 * her alone — whatever is wrong with this town wants her exactly here.
 */
const LINES = [
  'They come out of the fog. They never stop coming.',
  'The clock has said 3:33 since the night it started.',
  "Don't trust the shadows here. They point the wrong way.",
  'I counted the bells. There was one chime too many.',
  'If you reach the ridge... tell the chapel I kept my promise.',
  'A quarter of a million of them. I did the arithmetic. Kill them all.',
];

export class NPC extends Entity {
  constructor(events, world, texture) {
    super();
    this.events = events;
    this.world = world;
    this.height = 1.65;
    this.billboard = new SpriteBillboard(makeSpriteMaterial(texture), this.height, 0.62);
    this.mesh = this.billboard.mesh;
    const s = world.npcSpawn;
    this.home = { x: s.x, z: s.z };
    this.position.set(s.x, world.groundHeightFor(s.x, s.z, 1e9), s.z);
    this.target = null;
    this.pause = 2;
    this.lineCooldown = 0;
    this.lineIndex = 0;
  }

  update(dt, ctx) {
    const { player, camPos } = ctx;
    let moving = false;

    if (this.pause > 0) {
      this.pause -= dt;
    } else if (!this.target) {
      const a = Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * 5;
      this.target = { x: this.home.x + Math.cos(a) * r, z: this.home.z + Math.sin(a) * r };
    } else {
      const dx = this.target.x - this.position.x, dz = this.target.z - this.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.4) {
        this.target = null;
        this.pause = 3 + Math.random() * 5;
      } else {
        this.position.x += (dx / d) * 1.1 * dt;
        this.position.z += (dz / d) * 1.1 * dt;
        this.yaw = Math.atan2(dx, dz);
        moving = true;
      }
    }
    this.world.collision.resolveCapsule(this.position, this.radius, this.height);
    this.position.y = this.world.groundHeightFor(this.position.x, this.position.z, this.position.y + 0.5);
    this.mesh.position.copy(this.position);
    this.billboard.update(dt, camPos, this.yaw, moving, 4);

    // Face the player and speak when approached.
    this.lineCooldown -= dt;
    const pd = this.distanceTo(player);
    if (pd < 3.5 && this.lineCooldown <= 0) {
      this.lineCooldown = 14;
      this.pause = Math.max(this.pause, 4);
      this.yaw = Math.atan2(player.position.x - this.position.x, player.position.z - this.position.z);
      this.events.emit('subtitle', { text: '"' + LINES[this.lineIndex % LINES.length] + '"' });
      this.lineIndex++;
    }
  }
}
