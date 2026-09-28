/* 装配舱特写冒烟：进自由装配 → 装工程机甲 → 拉近镜头 → 多角度截图验证机械手造型。 */
import {chromium} from 'playwright';

const errors = [];
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=metal', '--enable-webgl', '--ignore-gpu-block-list'],
});
const page = await browser.newPage({viewport: {width: 1280, height: 800}});
page.on('pageerror', (e) => errors.push(String(e?.message || e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });

await page.goto('http://127.0.0.1:8765/game', {waitUntil: 'networkidle'});
await page.evaluate(() => {
  const b = document.querySelector('.bottom-nav button[data-view="build"]');
  if (b) b.click();
});
await page.waitForTimeout(3000);
await page.evaluate(() => {
  const s = window.__editorScene;
  if (s?.applyBuildBlueprint) s.applyBuildBlueprint?.('mecha');
});
await page.waitForTimeout(4500);

// 拉近 + 侧旋，拍机械手特写
await page.evaluate(() => {
  const s = window.__editorScene;
  if (!s) return;
  s._targetRadius = 3.6;
  s._targetElevation = 1.5;
  s._targetAngle = 0.9;
});
await page.waitForTimeout(1800);
await page.screenshot({path: '/tmp/hangar-close-1.png'});

await page.evaluate(() => {
  const s = window.__editorScene;
  if (s) s._targetAngle = 2.4;
});
await page.waitForTimeout(1800);
await page.screenshot({path: '/tmp/hangar-close-2.png'});

const info = await page.evaluate(() => {
  const s = window.__editorScene;
  return {
    dressingVisible: s?.dressing?.group?.visible,
    armCount: s?.dressing?.group ? s.dressing.group.children.length : 0,
  };
});
console.log(JSON.stringify({info, errors: errors.slice(0, 6)}, null, 2));
await browser.close();
