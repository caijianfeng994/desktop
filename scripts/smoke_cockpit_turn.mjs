/* 相机转向跟随实测：进试验场 → 切驾驶舱/跟随 → 键盘转向 → 采样 yaw 与相机朝向夹角。 */
import {chromium} from 'playwright';

// 用法：node scripts/smoke_cockpit_turn.mjs [cockpit|follow]
const MODE = process.argv[2] === 'follow' ? 'follow' : 'cockpit';

const browser = await chromium.launch({headless: true});
const page = await browser.newPage({viewport: {width: 1280, height: 800}});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto('http://127.0.0.1:8765/game', {waitUntil: 'networkidle', timeout: 30000});
await page.waitForTimeout(2500);
await page.evaluate(() => {
  document.querySelector('details.build-more')?.and_typo?.();
  document.querySelector('details.build-more') && (document.querySelector('details.build-more').open = true);
  document.querySelector('#build-apply-mecha')?.click();
});
await page.waitForTimeout(3000);
await page.evaluate(() => document.querySelector('#build-enter-yard')?.click());
await page.waitForTimeout(5000);

// 切驾驶舱
await page.evaluate(() => {
  const s = window.__yardScene;
  s?.setCameraMode?.(MODE);
});
await page.waitForTimeout(1200);

// 采样：键盘左转 1.4s 期间与松开后 1.2s，记录 yaw 与相机前向的夹角
const result = await page.evaluate(() => {
  const s = window.__yardScene;
  if (!s) return {error: 'no yardScene'};
  const yawOfCamera = () => {
    // camera.lookAt(this.look)：前向 = look - camera.position
    const dx = s.look.x - s.camera.position.x;
    const dz = s.look.z - s.camera.position.z;
    return Math.atan2(dx, dz);
  };
  const norm = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  s.setInput(0, 1); // 左转
  const out = [];
  const t0 = performance.now();
  return new Promise((resolve) => {
    const id = setInterval(() => {
      const t = (performance.now() - t0) / 1000;
      out.push({
        t: +t.toFixed(2),
        yaw: +s.drive.yaw.toFixed(2),
        camYaw: +yawOfCamera().toFixed(2),
        lagDeg: +(norm(s.drive.yaw - yawOfCamera()) * 180 / Math.PI).toFixed(1),
      });
      if (t > 1.4) {
        s.setInput(0, 0);
        const settle = [];
        const t1 = performance.now();
        const id2 = setInterval(() => {
          const t2 = (performance.now() - t1) / 1000;
          settle.push({
            t: +t2.toFixed(2),
            lagDeg: +(norm(s.drive.yaw - yawOfCamera()) * 180 / Math.PI).toFixed(1),
          });
          if (t2 > 1.2) {
            clearInterval(id2);
            resolve({turning: out.filter((_, i) => i % 8 === 0), settle: settle.filter((_, i) => i % 8 === 0)});
          }
        }, 50);
        clearInterval(id);
      }
    }, 50);
  });
});
console.log(JSON.stringify({result, errors}, null, 2));
await browser.close();
