/**
 * Quake-style developer console. Toggle with ` / ~ (Backquote).
 *
 * While open it owns the keyboard (game input is suppressed) and the game
 * keeps running behind it. Commands run against the live game object;
 * `noclip` grants free flight through all geometry.
 *
 * Deliberately absent: any command that touches the kill counter. The
 * 250,000 win condition has no shortcuts, console included.
 */
export class DevConsole {
  constructor(game, root) {
    this.game = game;
    this.open = false;
    this.history = [];
    this.histIdx = -1;

    this.el = document.createElement('div');
    this.el.id = 'console';
    this.el.style.display = 'none';
    this.logEl = document.createElement('div');
    this.logEl.id = 'console-log';
    const line = document.createElement('div');
    line.id = 'console-line';
    line.textContent = '>';
    this.inputEl = document.createElement('input');
    this.inputEl.id = 'console-input';
    this.inputEl.spellcheck = false;
    this.inputEl.autocomplete = 'off';
    line.appendChild(this.inputEl);
    this.el.appendChild(this.logEl);
    this.el.appendChild(line);
    root.appendChild(this.el);

    this.print('F-FPS developer console — type "help" for commands', 'dim');

    // Capture phase so the toggle wins over everything and the backquote
    // character never lands in the text field.
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Backquote') {
        e.preventDefault();
        this.toggle();
      } else if (this.open && e.code === 'Escape') {
        e.preventDefault();
        this.toggle(false);
      }
    }, true);

    this.inputEl.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const cmd = this.inputEl.value.trim();
        this.inputEl.value = '';
        if (cmd) {
          this.history.push(cmd);
          this.histIdx = this.history.length;
          this.print('> ' + cmd, 'echo');
          this.execute(cmd);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (this.histIdx > 0) this.inputEl.value = this.history[--this.histIdx] ?? '';
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (this.histIdx < this.history.length) this.inputEl.value = this.history[++this.histIdx] ?? '';
      }
    });
  }

  toggle(force = !this.open) {
    if (force === this.open) return;
    this.open = force;
    this.el.style.display = this.open ? 'flex' : 'none';
    this.game.input.setSuppressed(this.open);
    if (this.open) {
      this.inputEl.focus();
    } else {
      this.inputEl.blur();
    }
  }

  print(text, cls = '') {
    const div = document.createElement('div');
    div.className = 'console-msg ' + cls;
    div.textContent = text;
    this.logEl.appendChild(div);
    while (this.logEl.children.length > 200) this.logEl.firstChild.remove();
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  execute(line) {
    const [cmd, ...args] = line.split(/\s+/);
    const fn = COMMANDS[cmd.toLowerCase()];
    if (!fn) {
      this.print(`unknown command "${cmd}" — try "help"`, 'err');
      return;
    }
    try {
      fn(this, this.game, args);
    } catch (err) {
      this.print('error: ' + err.message, 'err');
    }
  }
}

const COMMANDS = {
  help(con) {
    con.print('noclip          fly + pass through everything (WASD, Space up, Ctrl down, Shift fast)');
    con.print('god             toggle invulnerability');
    con.print('heal [n]        restore n health (default: full)');
    con.print('give            fill every weapon\'s magazine and reserve');
    con.print('tp <x> <z>      teleport to map coordinates (spawn is 0 20)');
    con.print('speed <mult>    movement speed multiplier (0.1 – 10)');
    con.print('pos             print current position');
    con.print('clear           clear this log');
  },

  noclip(con, game) {
    const p = game.player;
    p.noclip = !p.noclip;
    if (!p.noclip) p.vy = 0; // fall back onto the world naturally
    con.print('noclip ' + (p.noclip ? 'ON — you are the fog now' : 'OFF'), p.noclip ? 'ok' : '');
  },

  god(con, game) {
    game.player.godMode = !game.player.godMode;
    con.print('god mode ' + (game.player.godMode ? 'ON' : 'OFF'), game.player.godMode ? 'ok' : '');
  },

  heal(con, game, args) {
    const p = game.player;
    const n = args[0] ? Number(args[0]) : p.maxHealth;
    if (!Number.isFinite(n) || n <= 0) throw new Error('usage: heal [amount]');
    p.health = Math.min(p.maxHealth, p.health + n);
    con.print('health: ' + p.health, 'ok');
  },

  give(con, game) {
    for (const w of game.weapons.weapons) {
      if (w.isMelee) continue;
      w.mag = w.config.magSize;
      if (w.reserve !== Infinity) w.reserve = 999;
    }
    con.print('all weapons loaded, reserves full', 'ok');
  },

  tp(con, game, args) {
    const x = Number(args[0]), z = Number(args[1]);
    if (!Number.isFinite(x) || !Number.isFinite(z)) throw new Error('usage: tp <x> <z>');
    const p = game.player;
    p.teleport(x, game.world.groundHeightFor(x, z, 1e9), z);
    con.print(`teleported to ${x.toFixed(0)}, ${z.toFixed(0)}`, 'ok');
  },

  speed(con, game, args) {
    const m = Number(args[0]);
    if (!Number.isFinite(m) || m < 0.1 || m > 10) throw new Error('usage: speed <0.1 – 10>');
    game.player.speedMult = m;
    con.print('speed multiplier: ' + m, 'ok');
  },

  pos(con, game) {
    const p = game.player.position;
    con.print(`x ${p.x.toFixed(1)}  y ${p.y.toFixed(1)}  z ${p.z.toFixed(1)}`);
  },

  clear(con) {
    con.logEl.innerHTML = '';
  },
};
