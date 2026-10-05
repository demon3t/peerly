const { _electron: electron } = require('playwright');
const fs = require('fs'),
  os = require('os'),
  path = require('path');
// Launches the built app with an isolated profile, drives real IPC and saves screenshots.
// Run: npm run build && node scripts/ui-test.cjs [outDir]
const out = path.resolve(process.argv[2] || 'test-output');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-ui-'));
  const share = path.join(sandbox, 'Мои фото 2026');
  fs.mkdirSync(share);
  for (let i = 0; i < 5; i++)
    fs.writeFileSync(path.join(share, `IMG_${1000 + i}.jpg`), require('crypto').randomBytes(400000));
  // Keep everything (including downloads) inside the sandbox.
  fs.mkdirSync(path.join(sandbox, 'ud'), { recursive: true });
  fs.writeFileSync(
    path.join(sandbox, 'ud', 'settings.json'),
    JSON.stringify({ downloadPath: path.join(sandbox, 'downloads'), language: 'ru' }),
  );
  const env = { ...process.env, PEERLY_USER_DATA: path.join(sandbox, 'ud'), PEERLY_DEV_SERVER: '0' };
  delete env.ELECTRON_RUN_AS_NODE;
  const appProc = await electron.launch({ args: [path.resolve(__dirname, '..')], env });
  const page = await appProc.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForSelector('.app-shell');
  await page.screenshot({ path: `${out}/1-empty.png` });

  await page.evaluate((src) => window.torrentAPI.seed({ source: src }), share);
  await page.evaluate(() =>
    window.torrentAPI.add({
      source:
        'magnet:?xt=urn:btih:dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c&dn=Big+Buck+Bunny&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=wss%3A%2F%2Ftracker.openwebtorrent.com&ws=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2F',
    }),
  );
  await page.waitForTimeout(9000);
  await page.screenshot({ path: `${out}/2-dashboard.png` });

  await page.click('.torrent-table tbody tr:nth-child(1)');
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${out}/3-details.png` });
  await page.click('.details-tabs .tab:nth-child(2)');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/4-speed-tab.png` });
  await page.click('.details-tabs .tab:nth-child(3)');
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${out}/4b-peers.png` });
  // Clicking the dimmed area outside closes the panel.
  await page.mouse.click(400, 600);
  await page.waitForTimeout(300);
  if (await page.$('.details-panel')) throw new Error('panel did not close on backdrop click');

  await page.click('.sidebar-add');
  await page.click('.tab:nth-child(2)');
  await page.fill('textarea', 'magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/5-add-modal.png` });
  await page.keyboard.press('Escape');

  await page.click('.row-menu .row-icon');
  await page.screenshot({ path: `${out}/6-menu.png` });
  await page.keyboard.press('Escape');

  await page.click('text=Настройки');
  await page.click('.settings-row:has-text("Тёмная тема") .toggle');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/7-settings-dark.png` });
  await page.click('text=Все торренты');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/8-dashboard-dark.png` });
  await page.click('text=Статистика');
  await page.waitForTimeout(1500);
  const chart = await page.$('.chart-svg');
  const box = await chart.boundingBox();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/9-stats-dark.png` });

  // Language switch: pick English in settings, the whole UI re-renders.
  await page.click('text=Настройки');
  await page.click('.select-trigger');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/10a-language-select.png` });
  await page.keyboard.press('Escape');
  await page.click('.select-trigger');
  await page.click('.select-option:has-text("English")');
  await page.waitForSelector('h1:has-text("Settings")');
  await page.screenshot({ path: `${out}/10-settings-en.png` });
  await page.click('text=All torrents');
  await page.click('.torrent-table tbody tr:nth-child(1)');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/11-dashboard-en.png` });
  await page.keyboard.press('Escape');
  await page.click('text=Settings');
  await page.click('.select-trigger');
  const languages = await page.$$eval('.select-option', (o) => o.map((x) => x.textContent));
  console.log('languages in list:', languages.join(' | '));
  await page.keyboard.press('Escape');

  console.log('renderer errors:', errors.length ? errors : 'none');
  await appProc.evaluate(({ app }) => app.quit()).catch(() => {}); // app exits before replying
  await appProc.close().catch(() => {});
  fs.rmSync(sandbox, { recursive: true, force: true });
})().catch((e) => {
  console.error('UI TEST FAILED', e);
  process.exit(1);
});
