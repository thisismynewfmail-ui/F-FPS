/**
 * Browser smoke test. Serves the repo, drives the real game in headless
 * Chromium and verifies:
 *   1. clean boot (no console errors / page errors)
 *   2. game reaches 'playing', player can move, zombies spawn from wave 1
 *   3. shooting pipeline works (fire event -> ammo decrements)
 *   4. THE win condition: victory fires at exactly 250,000 kills — driven
 *      through the same registerKill pipeline 'zombie:death' events use,
 *      asserting no victory at 249,999 and victory + stats screen at 250,000
 *   5. zone unlocks happened at their kill thresholds along the way
 *
 * Usage: node tests/smoke.mjs [--screens]
 * Requires playwright-core (any location via NODE_PATH) and the
 * pre-installed Chromium in PLAYWRIGHT_BROWSERS_PATH.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const takeScreens = process.argv.includes('--screens');
const SCREEN_DIR = process.env.SCREEN_DIR || '.';

const server = createServer(async (req, res) => {
  try {
    const path = req.url.split('?')[0];
    const file = join(ROOT, path === '/' ? 'index.html' : path);
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('nope');
  }
});
await new Promise((r) => server.listen(8137, r));

let failures = 0;
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures++;
};

const browser = await chromium.launch({
  // Use the environment's pre-installed Chromium regardless of the
  // playwright-core version's pinned browser build.
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto('http://localhost:8137/index.html?test=1');
await page.waitForFunction(() => window.__game !== undefined, null, { timeout: 30000 });

// 1. clean boot
check('boot without console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

// menu screenshot
if (takeScreens) await page.screenshot({ path: join(SCREEN_DIR, 'shot_menu.png') });

// 2. start playing
await page.click('#btn-start');
await page.waitForFunction(() => window.__game.state.state === 'playing');
check('state reaches playing', true);

// player movement
const before = await page.evaluate(() => ({ ...window.__game.player.position }));
await page.keyboard.down('w');
await page.waitForTimeout(700);
await page.keyboard.up('w');
const after = await page.evaluate(() => ({ ...window.__game.player.position }));
const moved = Math.hypot(after.x - before.x, after.z - before.z);
check('WASD moves the player', moved > 1, `moved ${moved.toFixed(2)}m`);

// zombies spawn once wave 1 starts (grace period is ~5s)
await page.waitForFunction(() => window.__game.spawner.zombies.length > 0, null, { timeout: 25000 });
const zc = await page.evaluate(() => window.__game.spawner.zombies.length);
check('wave 1 spawns zombies', zc > 0, `${zc} active`);

// 3. firing decrements ammo and counts shots
const fired = await page.evaluate(() => {
  const g = window.__game;
  const magBefore = g.weapons.current.mag;
  g.weapons.tryFire();
  return { magBefore, magAfter: g.weapons.current.mag, shots: g.score.shotsFired };
});
check('firing consumes ammo + counts the shot', fired.magAfter === fired.magBefore - 1 && fired.shots >= 1,
  `mag ${fired.magBefore}->${fired.magAfter}, shots ${fired.shots}`);

await page.waitForTimeout(1500);
if (takeScreens) await page.screenshot({ path: join(SCREEN_DIR, 'shot_gameplay.png') });

// end-to-end combat: place a walker in front of the muzzle and gun it down;
// the kill must arrive via the zombie:death -> ScoreSystem pipeline.
const combat = await page.evaluate(async () => {
  const g = window.__game;
  const p = g.player;
  const killsBefore = g.score.kills;
  const z = g.spawner.spawnOne('walker', p) ?? g.spawner.zombies[0];
  z.placeAt(p.position.x - Math.sin(p.yaw) * 5, p.position.z - Math.cos(p.yaw) * 5);
  p.pitch = 0;
  for (let i = 0; i < 12 && z.state !== 'dead'; i++) {
    g.weapons.current.cooldown = 0;
    g.weapons.current.mag = Math.max(1, g.weapons.current.mag);
    g.weapons.tryFire();
    await new Promise(requestAnimationFrame);
  }
  await new Promise(requestAnimationFrame);
  return { dead: z.state === 'dead', kills: g.score.kills, killsBefore, hits: g.score.shotsHit };
});
check('gunfire kills a zombie through the event pipeline',
  combat.dead && combat.kills === combat.killsBefore + 1 && combat.hits > 0,
  JSON.stringify(combat));

// 4 + 5. win condition, exact — via the same registerKill pipeline that
// 'zombie:death' events call, in batches to keep the page responsive.
const win = await page.evaluate(async () => {
  const g = window.__game;
  const target = 249999 - g.score.kills;
  for (let done = 0; done < target;) {
    const n = Math.min(5000, target - done);
    for (let i = 0; i < n; i++) g.score.registerKill('Walker', 1);
    done += n;
    await new Promise(requestAnimationFrame);
  }
  const at249999 = { kills: g.score.kills, victory: g.score.victory, state: g.state.state };
  g.score.registerKill('Walker', 1);
  await new Promise(requestAnimationFrame);
  const at250000 = { kills: g.score.kills, victory: g.score.victory, state: g.state.state };
  // over-count attempt must not double-fire or change the count
  g.score.registerKill('Walker', 1);
  const after = { kills: g.score.kills, victory: g.score.victory };
  const zones = [...g.world.zones.unlocked].sort((a, b) => a - b);
  return { at249999, at250000, after, zones };
});
check('no victory at 249,999 kills', win.at249999.kills === 249999 && !win.at249999.victory && win.at249999.state === 'playing',
  JSON.stringify(win.at249999));
check('victory at exactly 250,000 kills', win.at250000.kills === 250000 && win.at250000.victory && win.at250000.state === 'victory',
  JSON.stringify(win.at250000));
check('kill counter freezes after victory', win.after.kills === 250000, `kills=${win.after.kills}`);
check('all 6 zones unlocked by kill thresholds', win.zones.join(',') === '0,1,2,3,4,5', win.zones.join(','));

const victoryVisible = await page.evaluate(() => {
  const el = document.getElementById('screen-victory');
  return el && el.style.display !== 'none' && el.textContent.includes('250,000') === false
    ? 'missing-number' : el.style.display !== 'none';
});
check('victory screen displayed with stats', victoryVisible === true, String(victoryVisible));
if (takeScreens) await page.screenshot({ path: join(SCREEN_DIR, 'shot_victory.png') });

check('no console errors across the whole run', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
server.close();
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
