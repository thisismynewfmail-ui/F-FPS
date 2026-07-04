import { WIN_KILLS } from '../systems/ScoreSystem.js';

/**
 * Retro survival-horror HUD, rendered as a DOM overlay (see styles.css for
 * the 1990s treatment: hard corners, scanlines, pixel sprites).
 *
 * Always visible: segmented health bar (bottom-left), ammo mag/reserve
 * (bottom-right), kill counter vs 250,000 with victory progress bar
 * (top-center), weapon bar with icons (bottom-center), wave + zone
 * (top-left), accuracy/points/secrets (top-right). Plus subtitles, pickup
 * feed, damage vignette, scope overlay, and the menu/death/victory screens.
 */
export class HUD {
  constructor(events, root, actions) {
    this.events = events;
    this.root = root;
    this.actions = actions;
    this._notes = [];
    this._subtitleTimer = 0;
    this._vignette = 0;
    this._heal = 0;
    this._banner = 0;
    this._menuTimer = 0;   // seconds of visibility remaining for the weapon menu
    this._menuShown = false;
    this._build();
    this._wire();
  }

  _el(tag, id, parent, className = '') {
    const e = document.createElement(tag);
    if (id) e.id = id;
    if (className) e.className = className;
    (parent || this.root).appendChild(e);
    return e;
  }

  _build() {
    this._el('div', 'scanlines');
    this._el('div', 'vignette');
    this._el('div', 'healflash');
    this._el('div', 'crosshair').innerHTML = '<span></span>';

    // top-left: wave + zone
    const tl = this._el('div', 'hud-tl', null, 'panel');
    this.waveEl = this._el('div', 'wave', tl);
    this.zoneEl = this._el('div', 'zone', tl);
    this.respiteEl = this._el('div', 'respite', tl);

    // top-center: kill counter + progress
    const tc = this._el('div', 'hud-tc');
    this.killsEl = this._el('div', 'kills', tc, 'panel');
    const prog = this._el('div', 'progress', tc, 'panel');
    this.progFill = this._el('div', 'progress-fill', prog);

    // (Run stats — accuracy / score / secrets — live on the pause screen only,
    // rendered as circular gauges. They are deliberately absent from the HUD.)

    // bottom-left: health
    const bl = this._el('div', 'hud-bl', null, 'panel');
    this._el('div', 'hp-label', bl).textContent = 'HEALTH';
    const bar = this._el('div', 'hp-bar', bl);
    this.hpFill = this._el('div', 'hp-fill', bar);
    this.hpNum = this._el('div', 'hp-num', bl);

    // bottom-right: ammo
    const br = this._el('div', 'hud-br', null, 'panel');
    this.ammoEl = this._el('div', 'ammo', br);
    this.reloadEl = this._el('div', 'reload-hint', br);

    // top-center: weapon menu (hidden by default; fades in on slot input,
    // auto-hides after inactivity). Sits just under the kill counter.
    this.weaponMenu = this._el('div', 'weapon-menu');
    this._el('div', null, this.weaponMenu, 'wm-title').textContent = 'ARMORY';
    this.menuSlots = this._el('div', null, this.weaponMenu, 'wm-slots');
    this.slotEls = [];
    // filled on first update

    this.subtitleEl = this._el('div', 'subtitle');
    this.promptEl = this._el('div', 'prompt');
    this.notesEl = this._el('div', 'notes');
    this.bannerEl = this._el('div', 'banner');

    // scope overlay
    this.scopeEl = this._el('div', 'scope');
    this.scopeEl.innerHTML = '<div class="scope-h"></div><div class="scope-v"></div>';
    this.scopeEl.style.display = 'none';

    // ---- screens
    this.menuEl = this._screen('menu', `
      <h1>F-FPS</h1>
      <h2>THE FOG TOOK THE TOWN. TAKE IT BACK.</h2>
      <p class="story">Kill <b>250,000</b> of them. That is the number. The survivor by the well
      did the arithmetic, and the town opens itself, street by street, to those who keep count.</p>
      <div class="controls">
        <span>WASD — MOVE</span><span>MOUSE — LOOK / FIRE</span><span>SHIFT — SPRINT</span>
        <span>CTRL — CROUCH</span><span>SPACE — JUMP</span><span>1-5 — WEAPONS</span>
        <span>R — RELOAD</span><span>RMB — SCOPE (SNIPER)</span><span>E — INTERACT</span><span>TAB — SATCHEL</span><span>ESC — PAUSE</span>
      </div>
      <button id="btn-start">ENTER THE FOG</button>`);
    this.pauseEl = this._screen('pause', `
      <h1>PAUSED</h1>
      <div id="pause-stats" class="statrings"></div>
      <button id="btn-resume">RESUME</button>`);
    this.deadEl = this._screen('dead', `
      <h1 class="blood">YOU DIED</h1>
      <p class="story">The fog closes in over you. But the count survives. It always survives.</p>
      <div id="dead-stats" class="statgrid"></div>
      <button id="btn-respawn">CRAWL BACK OUT</button>`);
    this.victoryEl = this._screen('victory', `
      <h1 class="gold">250,000</h1>
      <h2>THE TOWN IS SILENT. YOU COUNTED EVERY ONE.</h2>
      <div id="victory-stats" class="statgrid"></div>
      <p class="story">The fog lifts. The clock on the tower finally moves.</p>`);
  }

  _screen(id, html) {
    const s = this._el('div', 'screen-' + id, null, 'screen');
    s.innerHTML = html;
    s.style.display = 'none';
    return s;
  }

  showScreen(which) {
    for (const s of [this.menuEl, this.pauseEl, this.deadEl, this.victoryEl]) s.style.display = 'none';
    if (which) {
      const el = { menu: this.menuEl, pause: this.pauseEl, dead: this.deadEl, victory: this.victoryEl }[which];
      el.style.display = 'flex';
    }
  }

  _wire() {
    document.getElementById('btn-start').addEventListener('click', () => this.actions.onStart());
    document.getElementById('btn-resume').addEventListener('click', () => this.actions.onResume());
    document.getElementById('btn-respawn').addEventListener('click', () => this.actions.onRespawn());

    const on = this.events.on.bind(this.events);
    on('subtitle', ({ text }) => this.subtitle(text));
    on('player:damage', ({ amount }) => { this._vignette = Math.min(1, this._vignette + amount / 40 + 0.25); });
    on('player:heal', () => { this._heal = 0.5; });
    on('pickup', ({ label, amount, type }) => {
      this.note(type === 'key' ? `${label.toUpperCase()}` : `+${amount} ${label.toUpperCase()}`);
    });
    on('secret:found', ({ label, count, total }) => {
      this.note(`SECRET FOUND (${count}/${total}) — ${label.toUpperCase()}`, 'gold');
    });
    on('zone:unlock', ({ zone }) => {
      this.subtitle(`The way into ${zone.name} is clear.`);
    });
    on('wave:start', ({ wave }) => this.banner('WAVE ' + wave));
    on('wave:end', () => this.note('WAVE CLEAR — SUPPLIES INBOUND', 'gold'));
    on('scope', ({ on: scoped }) => { this.scopeEl.style.display = scoped ? 'block' : 'none'; });
    on('victory', ({ stats }) => {
      this._fillStats(document.getElementById('victory-stats'), stats);
      this.showScreen('victory');
    });

    // weapon menu: number key / scroll reveals it; firing or reloading (a
    // state-changing action) dismisses it immediately.
    on('weapon:menu:poke', () => this.showWeaponMenu());
    on('weapon:switch', () => this.showWeaponMenu());
    on('weapon:fire', () => this.hideWeaponMenu());
    on('weapon:reload:start', () => this.hideWeaponMenu());
  }

  showWeaponMenu() {
    this._menuTimer = 2.5;
    if (!this._menuShown) {
      this._menuShown = true;
      this.weaponMenu.style.transition = 'opacity 0.15s ease-in-out, transform 0.15s ease-in-out';
      this.weaponMenu.classList.add('show');
    }
  }

  hideWeaponMenu() {
    this._menuTimer = 0;
    if (this._menuShown) {
      this._menuShown = false;
      this.weaponMenu.style.transition = 'opacity 0.2s ease-in-out, transform 0.2s ease-in-out';
      this.weaponMenu.classList.remove('show');
    }
  }

  /** Small gold line-art glyph so each slot reads at a glance. */
  _drawGlyph(canvas, id) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#e0b840'; ctx.fillStyle = '#e0b840';
    ctx.lineWidth = 2; ctx.lineJoin = 'round';
    const p = (pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill(); };
    switch (id) {
      case 'pistol': p([[8, 8], [40, 8], [40, 15], [22, 15], [22, 30], [14, 30], [14, 15], [8, 15]]); break;
      case 'shotgun': ctx.fillRect(6, 10, 44, 4); ctx.fillRect(6, 15, 44, 4); ctx.fillRect(44, 9, 12, 14); break;
      case 'rifle': ctx.fillRect(8, 11, 40, 7); ctx.fillRect(44, 13, 12, 3); ctx.fillRect(20, 18, 8, 12); ctx.fillRect(10, 18, 6, 8); break;
      case 'sniper': ctx.fillRect(6, 13, 50, 4); ctx.fillRect(22, 7, 18, 4); ctx.fillRect(50, 12, 8, 6); break;
      case 'bat': ctx.beginPath(); ctx.moveTo(8, 20); ctx.lineTo(40, 12); ctx.lineTo(56, 12); ctx.lineTo(56, 20); ctx.lineTo(40, 20); ctx.closePath(); ctx.fill(); break;
      default: ctx.fillRect(10, 12, 40, 8);
    }
  }

  subtitle(text) {
    this.subtitleEl.textContent = text;
    this._subtitleTimer = 4.5;
  }

  note(text, cls = '') {
    const n = this._el('div', null, this.notesEl, 'note ' + cls);
    n.textContent = text;
    setTimeout(() => n.classList.add('fade'), 2600);
    setTimeout(() => n.remove(), 3400);
    while (this.notesEl.children.length > 6) this.notesEl.firstChild.remove();
  }

  banner(text) {
    this.bannerEl.textContent = text;
    this.bannerEl.classList.remove('show');
    void this.bannerEl.offsetWidth; // restart animation
    this.bannerEl.classList.add('show');
  }

  _fillStats(el, stats) {
    const t = stats.timePlayed;
    const hh = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60), ss = Math.floor(t % 60);
    const time = (hh ? hh + ':' : '') + String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
    el.innerHTML = `
      <span>TIME SURVIVED</span><b>${time}</b>
      <span>KILLS</span><b>${stats.kills.toLocaleString('en-US')}</b>
      <span>ACCURACY</span><b>${(stats.accuracy * 100).toFixed(1)}%</b>
      <span>SCORE</span><b>${stats.points.toLocaleString('en-US')}</b>
      <span>WALKERS</span><b>${(stats.byType.Walker || 0).toLocaleString('en-US')}</b>
      <span>SPRINTERS</span><b>${(stats.byType.Sprinter || 0).toLocaleString('en-US')}</b>
      <span>TANKS</span><b>${(stats.byType.Tank || 0).toLocaleString('en-US')}</b>`;
  }

  /** One circular gauge. ratio 0..1 fills the arc; centre shows num + sub. */
  _ring(label, ratio, num, sub, cls = '') {
    const C = 2 * Math.PI * 44;
    const off = C * (1 - Math.max(0, Math.min(1, ratio)));
    return `<div class="ring"><div class="ring-wrap">
        <svg viewBox="0 0 104 104">
          <circle class="track" cx="52" cy="52" r="44"></circle>
          <circle class="arc ${cls}" cx="52" cy="52" r="44"
            stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"></circle>
        </svg>
        <div class="ring-val"><div class="ring-num">${num}</div><div class="ring-sub">${sub}</div></div>
      </div><div class="ring-label">${label}</div></div>`;
  }

  /** Pause-screen stats as a row of circular gauges. */
  fillPauseStats(stats, secrets) {
    const el = document.getElementById('pause-stats');
    const t = stats.timePlayed;
    const hh = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60), ss = Math.floor(t % 60);
    const time = (hh ? hh + ':' : '') + String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
    const secRatio = secrets.total ? secrets.found / secrets.total : 0;
    el.innerHTML =
      this._ring('ACCURACY', stats.accuracy, `${(stats.accuracy * 100).toFixed(0)}%`, `${stats.shotsHit}/${stats.shotsFired}`, 'blue') +
      this._ring('PROGRESS', stats.kills / WIN_KILLS, stats.kills.toLocaleString('en-US'), `/ ${(WIN_KILLS / 1000) | 0}k`, 'green') +
      this._ring('SECRETS', secRatio, `${secrets.found}/${secrets.total}`, 'FOUND') +
      this._ring('SCORE', 1, stats.points.toLocaleString('en-US'), 'POINTS', 'green') +
      this._ring('SURVIVED', 1, time, 'TIME', 'blue');
  }

  fillDeadStats(stats) {
    this._fillStats(document.getElementById('dead-stats'), stats);
  }

  /** Per-frame refresh with a plain data snapshot. */
  update(dt, d) {
    // health
    const hpFrac = d.health / d.maxHealth;
    this.hpFill.style.width = (hpFrac * 100).toFixed(1) + '%';
    this.hpFill.className = hpFrac < 0.25 ? 'critical' : hpFrac < 0.5 ? 'low' : '';
    this.hpNum.textContent = Math.ceil(d.health);

    // ammo
    const cur = d.weapons.find((w) => w.active);
    if (cur.mag === Infinity) {
      this.ammoEl.innerHTML = '<b>—</b>';
    } else {
      this.ammoEl.innerHTML = `<b>${cur.mag}</b> / ${cur.reserve === Infinity ? '∞' : cur.reserve}`;
      this.ammoEl.classList.toggle('empty', cur.mag === 0 && !cur.reloading);
    }
    this.reloadEl.textContent = cur.reloading ? 'RELOADING…'
      : (cur.mag === 0 && cur.reserve === 0 && cur.id !== 'bat') ? 'NO AMMO' : '';

    // kills + progress
    this.killsEl.textContent = `KILLS: ${d.kills.toLocaleString('en-US')} / ${WIN_KILLS.toLocaleString('en-US')}`;
    this.progFill.style.width = (Math.min(1, d.kills / WIN_KILLS) * 100).toFixed(3) + '%';

    // wave / zone
    this.waveEl.textContent = d.wave.state === 'active' ? 'WAVE ' + d.wave.n : d.wave.n === 0 ? 'THEY ARE COMING' : 'RESPITE';
    this.respiteEl.textContent = d.wave.state === 'respite' ? 'next wave in ' + Math.ceil(d.wave.respiteLeft) + 's' : '';
    this.zoneEl.textContent = d.zoneName.toUpperCase();

    // (accuracy / score / secrets intentionally not shown on the HUD)

    // weapon menu (built once, then refreshed; visibility handled by timer)
    if (!this.slotEls.length) {
      for (const w of d.weapons) {
        const slot = this._el('div', null, this.menuSlots, 'wm-slot');
        const cv = document.createElement('canvas'); cv.width = 64; cv.height = 34;
        cv.className = 'wm-glyph'; this._drawGlyph(cv, w.id);
        const key = this._el('div', null, slot, 'wm-key'); key.textContent = w.slot;
        slot.appendChild(cv);
        this._el('div', null, slot, 'wm-name').textContent = w.flavor || w.name;
        this._el('div', null, slot, 'wm-ammo');
        this.slotEls.push(slot);
      }
    }
    d.weapons.forEach((w, i) => {
      const slot = this.slotEls[i];
      slot.classList.toggle('active', w.active);
      slot.classList.toggle('dry', w.mag === 0 && w.reserve === 0 && w.id !== 'bat');
      const ammo = slot.querySelector('.wm-ammo');
      ammo.textContent = w.mag === Infinity ? 'MELEE'
        : `${w.mag} / ${w.reserve === Infinity ? '∞' : w.reserve}`;
    });

    // auto-hide after inactivity
    if (this._menuTimer > 0) {
      this._menuTimer -= dt;
      if (this._menuTimer <= 0) this.hideWeaponMenu();
    }

    // prompt
    if (d.prompt) {
      this.promptEl.textContent = typeof d.prompt === 'function' ? d.prompt() : d.prompt;
      this.promptEl.style.display = 'block';
    } else {
      this.promptEl.style.display = 'none';
    }

    // subtitle fade
    if (this._subtitleTimer > 0) {
      this._subtitleTimer -= dt;
      this.subtitleEl.style.opacity = Math.min(1, this._subtitleTimer / 0.6);
    } else {
      this.subtitleEl.style.opacity = 0;
    }

    // damage vignette: recent hits + persistent low-health pulse
    this._vignette = Math.max(0, this._vignette - dt * 1.4);
    const lowHp = hpFrac < 0.3 ? (0.3 - hpFrac) * 1.6 * (0.7 + 0.3 * Math.sin(performance.now() / 220)) : 0;
    document.getElementById('vignette').style.opacity = Math.min(1, this._vignette + lowHp);
    this._heal = Math.max(0, this._heal - dt);
    document.getElementById('healflash').style.opacity = this._heal;
  }
}
