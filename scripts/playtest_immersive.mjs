/**
 * 浏览器自测：模板 → 保存 → 试验场 → 驾驶/抓取冒烟
 * 用法: node scripts/playtest_immersive.mjs
 */
import {chromium} from 'playwright';
import {mkdirSync, writeFileSync} from 'fs';
import {dirname, join} from 'path';
import {fileURLToPath} from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'output', 'playtest-immersive');
const BASE = process.env.PLAYTEST_URL || 'http://127.0.0.1:8878/game';
const log = [];
const note = (msg) => {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${msg}`;
  log.push(line);
  console.log(line);
};

mkdirSync(OUT, {recursive: true});

async function waitReady(page) {
  await page.goto(BASE, {waitUntil: 'networkidle', timeout: 30000});
  await page.waitForFunction(() => {
    const loading = document.getElementById('loading');
    return !loading || loading.hidden || getComputedStyle(loading).display === 'none' || loading.style.display === 'none';
  }, {timeout: 30000}).catch(() => {});
  // loading 可能靠 class 隐藏
  await page.waitForTimeout(800);
  const still = await page.evaluate(() => {
    const el = document.getElementById('loading');
    if (!el) return false;
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && el.offsetParent !== null;
  });
  if (still) {
    // 强制点重试或等 API
    await page.waitForTimeout(2000);
  }
}

async function shot(page, name) {
  const path = join(OUT, `${name}.png`);
  await page.screenshot({path, fullPage: false});
  note(`screenshot ${name}.png`);
  return path;
}

async function toastText(page) {
  return page.evaluate(() => document.getElementById('toast')?.textContent?.trim() || '');
}

async function main() {
  const browser = await chromium.launch({headless: true});
  const page = await browser.newPage({viewport: {width: 1280, height: 820}});
  page.on('pageerror', (e) => note(`PAGEERROR ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') note(`CONSOLE ${msg.text()}`);
  });

  const result = {
    ok: false,
    steps: [],
    status: {},
    toasts: [],
    errors: [],
  };

  try {
    note(`open ${BASE}`);
    await waitReady(page);
    await shot(page, '01-home');

    // 进入自由装配（底栏可见；assembly 内同属性按钮可能 hidden）
    await page.locator('.bottom-nav button[data-view="build"]').click();
    await page.waitForFunction(() => document.body.dataset.view === 'build', {timeout: 15000});
    await page.waitForTimeout(1500);
    const view = await page.evaluate(() => document.body.dataset.view);
    note(`view=${view}`);
    result.steps.push({step: 'navigate-build', view});
    await shot(page, '02-build');

    // 等编辑画布就绪；模板按钮折叠在「更多」面板内，先展开再等可见
    await page.waitForSelector('#build-world canvas', {timeout: 20000}).catch(() => note('build canvas missing'));
    await page.evaluate(() => {
      const more = document.querySelector('details.build-more');
      if (more) more.open = true;
    });
    await page.waitForTimeout(300);
    await page.waitForSelector('#build-apply-quad', {state: 'visible'});

    // 应用教学模板
    await page.locator('#build-apply-quad').click();
    await page.waitForTimeout(800);
    let t = await toastText(page);
    result.toasts.push(t);
    note(`toast after template: ${t}`);
    const status1 = await page.locator('#build-status').textContent();
    note(`build-status: ${status1}`);
    result.status.afterTemplate = status1;
    await shot(page, '03-template');

    // 保存
    await page.locator('#build-save').click();
    await page.waitForFunction(() => {
      const s = document.getElementById('build-status')?.textContent || '';
      return s.includes('已保存') || s.includes('失败');
    }, {timeout: 15000}).catch(() => {});
    await page.waitForTimeout(500);
    t = await toastText(page);
    result.toasts.push(t);
    note(`toast after save: ${t}`);
    const status2 = await page.locator('#build-status').textContent();
    note(`build-status: ${status2}`);
    result.status.afterSave = status2;
    await shot(page, '04-saved');

    // 进试验场
    await page.locator('#build-enter-yard').click();
    await page.waitForFunction(() => document.body.dataset.view === 'yard', {timeout: 20000}).catch(() => {});
    await page.waitForTimeout(1500);
    const view2 = await page.evaluate(() => document.body.dataset.view);
    note(`view after enter-yard: ${view2}`);
    result.steps.push({step: 'enter-yard', view: view2});
    await page.waitForSelector('#yard-world canvas', {timeout: 15000}).catch(() => note('yard canvas missing'));
    const yardStatus = await page.locator('#yard-status').textContent().catch(() => '');
    const yardDiag = await page.locator('#yard-diagnostics').textContent().catch(() => '');
    note(`yard-status: ${yardStatus}`);
    note(`yard-diag: ${yardDiag}`);
    result.status.yard = yardStatus;
    result.status.diag = yardDiag;
    t = await toastText(page);
    if (t) {
      result.toasts.push(t);
      note(`toast after yard: ${t}`);
    }
    await shot(page, '05-yard');

    if (view2 !== 'yard') {
      throw new Error(`未能进入试验场，当前 view=${view2} toast=${t}`);
    }

    // 驾驶前进一段
    await page.locator('#yard-world canvas').click({position: {x: 200, y: 200}});
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(1800);
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(400);
    await shot(page, '06-drive');

    // 尝试上坡方向： ramp 在 +X 侧，转向再前进
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(700);
    await page.keyboard.up('KeyD');
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(2500);
    await page.keyboard.up('KeyW');
    const diag2 = await page.locator('#yard-diagnostics').textContent();
    note(`diag after drive: ${diag2}`);
    result.status.diagAfterDrive = diag2;
    await shot(page, '07-after-drive');

    // 结构对比（短臂/长臂 metrics）
    await page.locator('#yard-contrast').click();
    await page.waitForTimeout(600);
    t = await toastText(page);
    result.toasts.push(t);
    note(`toast after contrast: ${t}`);
    const contrastHint = await page.locator('#yard-structure-hint').textContent().catch(() => '');
    note(`structure-hint: ${contrastHint}`);
    result.status.contrast = contrastHint || t;
    await shot(page, '08-contrast');

    // 调试叠加 + 低画质
    await page.locator('#yard-debug').check();
    await page.locator('#yard-quality-low').check();
    await page.waitForTimeout(400);
    const debugHud = await page.locator('.yard-debug-hud').textContent().catch(() => '');
    note(`debug-hud: ${debugHud.slice(0, 120)}`);
    result.status.debugHud = debugHud;

    // 抓取全过程（Space 启动序列）
    await page.keyboard.press('Space');
    await page.waitForTimeout(1600);
    t = await toastText(page);
    result.toasts.push(t);
    note(`toast after grasp seq: ${t}`);
    await shot(page, '09-grasp');

    // 从页面内部读状态
    const probe = await page.evaluate(() => {
      return {
        hasCanvas: !!document.querySelector('#yard-world canvas'),
        yardStatus: document.getElementById('yard-status')?.textContent || '',
        diag: document.getElementById('yard-diagnostics')?.textContent || '',
        bodyView: document.body.dataset.view,
        partCountMatch: /10 零件/.test(document.getElementById('yard-status')?.textContent || ''),
        noMissingTool: !(document.getElementById('toast')?.textContent || '').includes('没有夹爪'),
        hasContrastBtn: !!document.getElementById('yard-contrast'),
        hasDebugHud: !!document.querySelector('.yard-debug-hud') && !document.querySelector('.yard-debug-hud')?.hidden,
        contrastText: document.getElementById('yard-structure-hint')?.textContent || '',
      };
    });
    note(`probe ${JSON.stringify(probe)}`);
    result.probe = probe;

    // API 核对 active blueprint
    const api = await page.evaluate(async () => {
      const r = await fetch('/api/game');
      const j = await r.json();
      const st = j.state || j;
      const bp = (st.blueprints || []).find((b) => b.id === st.active_blueprint_id);
      return {
        active_id: st.active_blueprint_id,
        instances: bp?.instances?.length,
        hasGripper: bp?.instances?.some((i) => i.part_id === 'gripper' || i.instance_id === 'gripper-1'),
        wheels: bp?.instances?.filter((i) => i.part_id === 'wheel').length,
        name: bp?.name,
      };
    });
    note(`api blueprint ${JSON.stringify(api)}`);
    result.api = api;

    const contrastOk = /短臂|加长|可达|倾覆|前倾/.test(
      String(result.status.contrast || '') + String(probe.contrastText || ''),
    );
    result.ok =
      view2 === 'yard' &&
      api.hasGripper === true &&
      api.wheels === 4 &&
      api.instances === 10 &&
      probe.hasCanvas === true &&
      probe.hasContrastBtn === true &&
      contrastOk &&
      !String(result.toasts.join('|')).includes('没有夹爪');

    result.steps.push({step: 'done', ok: result.ok});
  } catch (err) {
    note(`FAIL ${err.message}`);
    result.errors.push(err.message);
    await shot(page, '99-fail').catch(() => {});
  } finally {
    writeFileSync(join(OUT, 'report.json'), JSON.stringify(result, null, 2));
    writeFileSync(join(OUT, 'log.txt'), log.join('\n'));
    await browser.close();
  }

  console.log('\n=== RESULT ===');
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main();
