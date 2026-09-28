/* 玩具风冒烟 2：载入 /game → 应用工程机甲模板 → 截屏改装与试验场。 */
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

// 进改装
const buildNav = page.locator('.bottom-nav button:has-text("改装"), a:has-text("改装")').first();
await buildNav.click().catch(() => {});
await page.waitForTimeout(2500);

// 展开更多操作并应用工程机甲模板
await page.evaluate(() => {
  const details = document.querySelector('details.build-more');
  if (details) details.open = true;
  document.querySelector('#build-apply-mecha')?.click();
});
await page.waitForTimeout(4000);
await page.screenshot({path: '/tmp/toy-mecha-build.png'});

// 进试验场看整车
await page.evaluate(() => document.querySelector('#build-enter-yard')?.click());
await page.waitForTimeout(6000);
await page.screenshot({path: '/tmp/toy-yard.png'});

console.log(JSON.stringify({errors}, null, 2));
await browser.close();
