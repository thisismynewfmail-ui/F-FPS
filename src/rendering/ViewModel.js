import { TEXTURES, TEXTURE_DIR } from './TextureConfig.js';

/**
 * First-person weapon display: a DOM layer over the canvas showing the
 * current weapon's pixel-art sprite (nearest-neighbour scaled), animated
 * with CSS transforms — bob synced to the player's gait, recoil kick,
 * reload dip, switch raise and melee swings. The muzzle flash sprite
 * appears at the barrel for a few frames when firing.
 */
export class ViewModel {
  constructor(events, root) {
    this.root = root;
    this.el = document.createElement('div');
    this.el.id = 'viewmodel';
    this.img = document.createElement('img');
    this.img.draggable = false;
    this.flash = document.createElement('img');
    this.flash.id = 'muzzleflash';
    this.flash.src = TEXTURE_DIR + TEXTURES.muzzleFlash;
    this.flash.style.display = 'none';
    this.el.appendChild(this.img);
    this.el.appendChild(this.flash);
    root.appendChild(this.el);

    this.kick = 0;
    this.switchAnim = 0;
    this.reloadWeapon = null;
    this.swing = 0;
    this.flashTime = 0;
    this.currentIcon = null;
    this.isBat = false;

    events.on('weapon:switch', ({ weapon }) => {
      this.switchAnim = 1;
      this.setSprite(weapon.config);
    });
    events.on('weapon:fire', ({ weapon }) => {
      if (weapon.isMelee) {
        this.swing = 1;
      } else {
        this.kick = Math.min(1.6, this.kick + weapon.config.kick * 0.55);
        this.flashTime = 0.055;
      }
    });
    events.on('scope', ({ on }) => {
      this.el.style.visibility = on ? 'hidden' : 'visible';
    });
  }

  setSprite(config) {
    if (this.currentIcon === config.icon) return;
    this.currentIcon = config.icon;
    this.img.src = TEXTURE_DIR + TEXTURES[config.icon];
    this.isBat = config.melee;
    this.img.className = config.melee ? 'vm-bat' : 'vm-gun';
  }

  update(dt, player, weaponManager) {
    if (!this.currentIcon) this.setSprite(weaponManager.current.config);

    this.kick = Math.max(0, this.kick - dt * 9);
    this.switchAnim = Math.max(0, this.switchAnim - dt * 3.5);
    this.swing = Math.max(0, this.swing - dt * 3.2);
    if (this.flashTime > 0) this.flashTime -= dt;
    this.flash.style.display = this.flashTime > 0 && !this.isBat ? 'block' : 'none';

    const w = weaponManager.current;
    // gait bob
    const bobX = Math.cos(player.bobPhase) * player.bobAmp * 260;
    const bobY = Math.abs(Math.sin(player.bobPhase)) * player.bobAmp * 340;
    // recoil: back and up
    const kx = this.kick * 26, kRot = this.kick * -7;
    // reload: dip below the frame and tilt, easing in and out
    let dip = 0, tilt = 0;
    if (w.reloading) {
      const f = 1 - w.reloadLeft / w.config.reloadTime;
      const env = f < 0.2 ? f / 0.2 : f > 0.8 ? (1 - f) / 0.2 : 1;
      dip = env * 90;
      tilt = env * 18;
    }
    // switch: raise from below
    const raise = this.switchAnim * 140;
    // melee swing: arc across the screen
    let swingX = 0, swingRot = 0;
    if (this.isBat) {
      const s = this.swing;
      swingX = -Math.sin(s * Math.PI) * 130;
      swingRot = -Math.sin(s * Math.PI) * 55;
    }

    this.el.style.transform =
      `translate(${(bobX + kx + swingX).toFixed(1)}px, ${(bobY + dip + raise).toFixed(1)}px) ` +
      `rotate(${(kRot + tilt + swingRot + (this.isBat ? -55 : 0)).toFixed(1)}deg)`;
  }
}
