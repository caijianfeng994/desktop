/* 装配台风冒烟：进自由装配视图 → 应用模板 → 截画布（含引线标注）→ 关标注再截一张。 */
import {chromium} from 'playwright';

const browser = await chromium.launch({headless: true});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto('http://127.0.0.1:8765/game', {waitUntil: 'networkidle', timeout: 30000});
await page.waitForTimeout(3000);

// 应用工程机甲模板（改装视图里）
await page.evaluate(() => {
  const details = document.querySelector('details.build-more');
  if (details) details.open = true;
  document.querySelector('#build-apply-mecha')?.click();
});
await page.waitForTimeout(3500);

// 切到自由装配
await page.evaluate(() => document.querySelector('.bottom-nav button[data-view="build"]')?.click());
await page.waitForTimeout(5000);
const calloutsOn = await page.evaluate(() => document.querySelectorAll('.kit-callout').length);
await page.screenshot({path: '/tmp/kit-build-callouts.png'});

// 关闭标注再截一张对比
await page.evaluate(() => document.querySelector('#build-toggle-callouts')?.click());
await page.waitForTimeout(800);
const calloutsOff = await page.evaluate(() => document.querySelectorAll('.kit-callout').length);
await page.screenshot({path: '/tmp/kit-build-nocallout.png'});

const counts = {calloutsOn, calloutsOff};
console.log(JSON.stringify({counts, errors}, null, 2));
await browser.close();
