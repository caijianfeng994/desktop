/**
 * 零件视觉网格：精密机甲套件外形（银白缎面壳体 / 橙色赛车条纹 / 深炭关节）。
 * 尺寸单位米；调用方再乘 SCALE。
 * 风格基准：银白金属漆壳体 + 橙色条纹点缀 + 深炭色包胶关节与玻璃面罩 +
 * 外露金属件（弹簧/铆钉），蓝紫影棚光下靠 clearcoat 与 emissive 出效果。
 */
import * as THREE from 'three';
import {maybeAttachHeroModel} from './partAssets.mjs';

/* ------------------------------------------------------------------ */
/* 套件风强制配色（覆盖主题材质，保证机甲件不糊成同色）                     */
/* ------------------------------------------------------------------ */

const KIT = {
  body: {color: 0xd9dbdf, roughness: 0.32, metalness: 0.38, clearcoat: 0.65, clearcoatRoughness: 0.22},
  panel: {color: 0x90949c, roughness: 0.4, metalness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.3},
  vinyl: {color: 0x26282e, roughness: 0.5, metalness: 0.32, clearcoat: 0.3, clearcoatRoughness: 0.35},
  orange: {color: 0xe8722c, roughness: 0.36, metalness: 0.12, clearcoat: 0.55, clearcoatRoughness: 0.28},
  rust: {color: 0x6b6f78, roughness: 0.38, metalness: 0.72, clearcoat: 0.2, clearcoatRoughness: 0.4},
  glow: {color: 0x2a2e38, roughness: 0.3, metalness: 0.2, emissive: 0x9fd8ff, emissiveIntensity: 0.0},
};

/** 漆面/包胶材质：低金属度 + clearcoat；金属件保留 Standard。 */
function kitMat(info) {
  if ((info.metalness ?? 0) > 0.5) {
    return new THREE.MeshStandardMaterial({
      color: info.color,
      roughness: info.roughness,
      metalness: info.metalness,
      emissive: info.emissive || 0x000000,
      emissiveIntensity: info.emissiveIntensity || 0,
    });
  }
  return new THREE.MeshPhysicalMaterial({
    color: info.color,
    roughness: info.roughness,
    metalness: info.metalness ?? 0.05,
    clearcoat: info.clearcoat ?? 0.4,
    clearcoatRoughness: info.clearcoatRoughness ?? 0.4,
    emissive: info.emissive || 0x000000,
    emissiveIntensity: info.emissiveIntensity || 0,
  });
}

const bodyMat = () => kitMat(KIT.body);
const panelMat = () => kitMat(KIT.panel);
const vinylMat = () => kitMat(KIT.vinyl);
const orangeMat = () => kitMat(KIT.orange);
const rustMat = () => kitMat(KIT.rust);

/** 发光材质：供眼睛/指示灯/喷口，颜色亮、靠 bloom 出光晕。 */
function glowMat(color = 0xcfe8ff, intensity = 1.6) {
  return new THREE.MeshStandardMaterial({
    color: 0x0c0e14,
    roughness: 0.25,
    metalness: 0,
    emissive: color,
    emissiveIntensity: intensity,
  });
}

/* ------------------------------------------------------------------ */
/* 表情屏：Canvas 画发光眼睛，贴到深色玻璃屏                             */
/* ------------------------------------------------------------------ */

const faceTextureCache = new Map();

/**
 * 画一张表情贴图（深色底 + 发光眼睛）。
 * @param {'happy'|'focus'|'sleep'|'wow'} [expr]
 * @returns {THREE.CanvasTexture}
 */
export function faceTexture(expr = 'happy') {
  const cached = faceTextureCache.get(expr);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0a0c12';
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = '#d8ecff';
  ctx.shadowColor = '#9fd8ff';
  ctx.shadowBlur = 18;
  const eye = (x, y, rw, rh) => {
    ctx.beginPath();
    ctx.ellipse(x, y, rw, rh, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  if (expr === 'sleep') {
    ctx.strokeStyle = '#d8ecff';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    for (const x of [86, 170]) {
      ctx.beginPath();
      ctx.arc(x, 58, 20, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    }
  } else if (expr === 'focus') {
    eye(86, 60, 14, 20);
    eye(170, 60, 14, 20);
  } else if (expr === 'wow') {
    eye(86, 56, 20, 24);
    eye(170, 56, 20, 24);
    ctx.beginPath();
    ctx.ellipse(128, 100, 12, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // happy：圆眼 + 微笑
    eye(86, 54, 18, 22);
    eye(170, 54, 18, 22);
    ctx.strokeStyle = '#d8ecff';
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(128, 84, 22, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  faceTextureCache.set(expr, tex);
  return tex;
}

/**
 * 表情屏网格：深色玻璃外框 + 发光脸。
 * @param {number} w 屏宽（米）
 * @param {number} h 屏高（米）
 * @param {'happy'|'focus'|'sleep'|'wow'} [expr]
 */
function faceScreen(w, h, expr = 'happy') {
  const g = new THREE.Group();
  const bezel = new THREE.Mesh(
    new THREE.ExtrudeGeometry(roundedRectShape(w, h, Math.min(w, h) * 0.3), {
      depth: Math.min(w, h) * 0.12,
      bevelEnabled: false,
    }),
    vinylMat(),
  );
  bezel.position.z = -Math.min(w, h) * 0.06;
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 0.94, h * 0.94),
    new THREE.MeshBasicMaterial({map: faceTexture(expr)}),
  );
  screen.position.z = 0.002;
  g.add(bezel, screen);
  return g;
}

/* ------------------------------------------------------------------ */
/* 几何工具                                                            */
/* ------------------------------------------------------------------ */

function roundedRectShape(w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/**
 * 圆胖长方体：倒角半径默认拉到最短边 30%（圆润壳体），
 * 基础形状缩小 2*bevelSize，使最终包围盒仍精确等于 (w,h,d)，
 * 不与碰撞盒、挂点、可达半径脱节。
 */
function rbox(w, h, d, r) {
  r = r ?? Math.min(w, h, d) * 0.3;
  r = Math.min(Math.max(r, 0.002), w / 2, h / 2, d / 2 - 0.001);
  const bw = w - 2 * r, bh = h - 2 * r;
  const s = roundedRectShape(Math.max(bw, 0.001), Math.max(bh, 0.001), Math.min(r, bw / 2, bh / 2));
  const bt = Math.min(0.014, d * 0.12);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(0.001, d - 2 * bt),
    bevelEnabled: true,
    bevelThickness: bt,
    bevelSize: r,
    bevelSegments: 5,
    steps: 1,
  });
  geo.translate(0, 0, -d / 2);
  return geo;
}

/** 竖直胶囊（四肢壳体主力）。 */
function capsule(r, len, radialSeg = 14) {
  return new THREE.CapsuleGeometry(r, Math.max(0.001, len), 5, radialSeg);
}

/** 螺旋弹簧（TubeGeometry 沿螺旋线），沿 Y 轴。 */
function spring(coilR, len, tubeR = 0.004, coils = 5) {
  const pts = [];
  const n = coils * 16;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = t * coils * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * coilR, (t - 0.5) * len, Math.sin(a) * coilR));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, n, tubeR, 6), rustMat());
}

/** 外露管线：沿点列的软管。 */
function cable(points, r = 0.005) {
  const curve = new THREE.CatmullRomCurve3(points);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 24, r, 6), vinylMat());
}

/** 圆头铆钉。 */
function rivet(r = 0.005) {
  return new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), rustMat());
}

/** 在面上摆一圈/几颗铆钉。 */
function addRivets(root, positions) {
  for (const [x, y, z] of positions) {
    const b = rivet();
    b.position.set(x, y, z);
    root.add(b);
  }
}

/**
 * 橙色赛车条纹：贴在壳体表面的细长条（套件风签名细节）。
 * @param {number} w 条宽
 * @param {number} l 条长
 * @returns {THREE.Mesh}
 */
function stripe(w, l) {
  return new THREE.Mesh(rbox(w, l, 0.006, Math.min(w, 0.006) * 0.45), orangeMat());
}

/* ------------------------------------------------------------------ */
/* 零件外形                                                            */
/* ------------------------------------------------------------------ */

/**
 * @param {string} partId
 * @param {number[]} size [sx,sy,sz] meters
 * @param {{gripperOpen?: number, themeId?: string, face?: 'happy'|'focus'|'sleep'|'wow'}} [opts]
 * @returns {THREE.Object3D}
 */
function createProceduralPartVisual(partId, size, opts = {}) {
  const [sx = 0.05, sy = 0.05, sz = 0.05] = size || [];
  const themeId = opts.themeId || 'toy';
  const root = new THREE.Group();
  root.userData.partId = partId;
  root.userData.themeId = themeId;

  if (partId === 'wheel' || partId === 'drive_wheel') {
    // 胖轮胎 + 圆润轮毂盖
    const r = Math.max(sx, sy, sz) * 0.72;
    const t = Math.min(sx, sy, sz) * 1.05;
    const tire = new THREE.Mesh(new THREE.CapsuleGeometry(r, t * 0.5, 6, 18), vinylMat());
    tire.rotation.z = Math.PI / 2;
    tire.scale.set(1, 1, 0.62);
    const hub = new THREE.Mesh(new THREE.SphereGeometry(r * 0.45, 14, 10), bodyMat());
    hub.rotation.z = Math.PI / 2;
    hub.scale.set(0.6, 1, 1);
    hub.position.x = t * 0.28;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.16, r * 0.16, t * 0.35, 10), orangeMat());
    cap.rotation.z = Math.PI / 2;
    cap.position.x = t * 0.42;
    root.add(tire, hub, cap);
    root.userData.isWheel = true;
    root.userData.visualHalfH = r;
    return root;
  }

  if (partId === 'mecha_head') {
    // 银白壳体头 + 深色玻璃面罩（发光表情）+ 顶部橙条纹 + 侧耳盘
    const headR = sy * 0.5;
    const head = new THREE.Mesh(capsule(headR, Math.max(0.001, sx * 0.9 - headR)), bodyMat());
    const face = faceScreen(sx * 0.62, sy * 0.5, opts.face || 'happy');
    face.position.set(0, -sy * 0.02, sz * 0.44);
    const earGeo = new THREE.CylinderGeometry(sy * 0.22, sy * 0.22, sx * 0.12, 12);
    const earL = new THREE.Mesh(earGeo, panelMat());
    const earR = new THREE.Mesh(earGeo, panelMat());
    earL.rotation.z = Math.PI / 2;
    earR.rotation.z = Math.PI / 2;
    earL.position.set(-sx * 0.48, 0, 0);
    earR.position.set(sx * 0.48, 0, 0);
    const earCapGeo = new THREE.CylinderGeometry(sy * 0.1, sy * 0.1, sx * 0.02, 10);
    const earCapL = new THREE.Mesh(earCapGeo, orangeMat());
    const earCapR = new THREE.Mesh(earCapGeo, orangeMat());
    earCapL.rotation.z = Math.PI / 2;
    earCapR.rotation.z = Math.PI / 2;
    earCapL.position.set(-sx * 0.55, 0, 0);
    earCapR.position.set(sx * 0.55, 0, 0);
    const springAnt = spring(sy * 0.06, sy * 0.34, 0.0035, 4);
    springAnt.position.set(sx * 0.22, sy * 0.62, 0);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(sy * 0.09, 10, 8), glowMat(0xffb060, 1.4));
    tip.position.set(sx * 0.22, sy * 0.82, 0);
    const brow = new THREE.Mesh(rbox(sx * 0.5, sy * 0.1, sz * 0.3), orangeMat());
    brow.position.set(0, sy * 0.3, sz * 0.32);
    root.add(head, face, earL, earR, earCapL, earCapR, springAnt, tip, brow);
    root.userData.visualHalfH = sy / 2;
    return root;
  }

  if (partId === 'armor_torso') {
    // 蛋圆肚 + 围兜面板 + 发光肚脐 + 背带管线
    const belly = new THREE.Mesh(capsule(sy * 0.42, Math.max(0.001, sy * 0.5)), bodyMat());
    belly.scale.set(sx / sy, 1, sz / sy);
    const bib = new THREE.Mesh(rbox(sx * 0.62, sy * 0.3, sz * 0.24), panelMat());
    bib.position.set(0, sy * 0.3, sz * 0.34);
    const bellyBtn = new THREE.Mesh(new THREE.SphereGeometry(sy * 0.1, 12, 10), glowMat(0xffc890, 1.5));
    bellyBtn.position.set(0, -sy * 0.05, sz * 0.4);
    const collar = new THREE.Mesh(capsule(sx * 0.3, sy * 0.08), vinylMat());
    collar.position.y = sy * 0.5;
    const strapL = cable([
      new THREE.Vector3(-sx * 0.3, sy * 0.42, sz * 0.3),
      new THREE.Vector3(-sx * 0.42, sy * 0.1, sz * 0.36),
      new THREE.Vector3(-sx * 0.3, -sy * 0.2, sz * 0.3),
    ], 0.006);
    const strapR = cable([
      new THREE.Vector3(sx * 0.3, sy * 0.42, sz * 0.3),
      new THREE.Vector3(sx * 0.42, sy * 0.1, sz * 0.36),
      new THREE.Vector3(sx * 0.3, -sy * 0.2, sz * 0.3),
    ], 0.006);
    const belt = new THREE.Mesh(new THREE.TorusGeometry(sy * 0.4, sy * 0.05, 8, 20), orangeMat());
    belt.rotation.x = Math.PI / 2;
    belt.scale.set(sx / sy, sz / sy, 1);
    belt.position.y = -sy * 0.18;
    addRivets(root, [
      [-sx * 0.28, sy * 0.3, sz * 0.47],
      [sx * 0.28, sy * 0.3, sz * 0.47],
    ]);
    // 胸口双赛车条纹
    const stripeL = stripe(sx * 0.07, sy * 0.42);
    const stripeR = stripe(sx * 0.07, sy * 0.42);
    stripeL.position.set(-sx * 0.16, sy * 0.06, sz * 0.44);
    stripeR.position.set(sx * 0.16, sy * 0.06, sz * 0.44);
    root.add(belly, bib, bellyBtn, collar, strapL, strapR, belt, stripeL, stripeR);
    root.userData.visualHalfH = sy / 2;
    return root;
  }

  if (partId === 'armor_shoulder') {
    // 球肩 + 橙色环带 + 短钝角缆线（去掉尖刺）
    const ball = new THREE.Mesh(new THREE.SphereGeometry(sy * 0.55, 16, 12), bodyMat());
    ball.scale.set(sx / sy, 1, sz / sy);
    const band = new THREE.Mesh(new THREE.TorusGeometry(sy * 0.55, sy * 0.07, 8, 20), orangeMat());
    band.rotation.y = Math.PI / 2;
    band.position.x = sx * 0.1;
    const stub = new THREE.Mesh(new THREE.CylinderGeometry(sx * 0.16, sx * 0.2, sy * 0.3, 10), vinylMat());
    stub.position.set(sx * 0.2, -sy * 0.3, 0);
    const wire = cable([
      new THREE.Vector3(-sx * 0.2, sy * 0.4, sz * 0.2),
      new THREE.Vector3(-sx * 0.45, sy * 0.15, sz * 0.42),
      new THREE.Vector3(-sx * 0.3, -sy * 0.3, sz * 0.3),
    ], 0.005);
    root.add(ball, band, stub, wire);
    root.userData.visualHalfH = sy / 2;
    return root;
  }

  if (partId === 'mecha_leg') {
    // 胖胶囊大腿 + 球膝 + 膝后弹簧 + 圆头大脚
    const hip = new THREE.Mesh(new THREE.SphereGeometry(sx * 0.42, 14, 10), vinylMat());
    hip.position.y = sy * 0.36;
    const thigh = new THREE.Mesh(capsule(sx * 0.34, sy * 0.3), bodyMat());
    thigh.position.y = sy * 0.14;
    const knee = new THREE.Mesh(new THREE.SphereGeometry(sx * 0.3, 14, 10), orangeMat());
    knee.position.y = -sy * 0.08;
    const shin = new THREE.Mesh(capsule(sx * 0.26, sy * 0.28), bodyMat());
    shin.position.y = -sy * 0.26;
    const foot = new THREE.Mesh(new THREE.SphereGeometry(sx * 0.42, 14, 10), vinylMat());
    foot.scale.set(1.15, 0.5, 1.5);
    foot.position.set(0, -sy * 0.44, sz * 0.12);
    const kneeSpring = spring(sx * 0.14, sy * 0.2, 0.004, 4);
    kneeSpring.position.set(0, -sy * 0.06, -sz * 0.26);
    // 大腿外侧橙色条纹
    const legStripe = stripe(sx * 0.1, sy * 0.34);
    legStripe.position.set(0, sy * 0.16, sz * 0.32);
    root.add(hip, thigh, knee, shin, foot, kneeSpring, legStripe);
    root.userData.visualHalfH = sy / 2;
    return root;
  }

  if (partId === 'backpack_frame') {
    // 圆背包 + 双胶囊罐 + 外露软管
    const pack = new THREE.Mesh(rbox(sx * 0.95, sy * 0.8, sz * 0.6), bodyMat());
    const tankGeo = capsule(sx * 0.22, sy * 0.4);
    const tankL = new THREE.Mesh(tankGeo, orangeMat());
    const tankR = new THREE.Mesh(tankGeo, orangeMat());
    tankL.position.set(-sx * 0.34, 0, -sz * 0.2);
    tankR.position.set(sx * 0.34, 0, -sz * 0.2);
    const hoseL = cable([
      new THREE.Vector3(-sx * 0.34, sy * 0.25, -sz * 0.2),
      new THREE.Vector3(-sx * 0.5, sy * 0.45, sz * 0.2),
      new THREE.Vector3(-sx * 0.3, sy * 0.4, sz * 0.4),
    ], 0.005);
    const hoseR = cable([
      new THREE.Vector3(sx * 0.34, sy * 0.25, -sz * 0.2),
      new THREE.Vector3(sx * 0.5, sy * 0.45, sz * 0.2),
      new THREE.Vector3(sx * 0.3, sy * 0.4, sz * 0.4),
    ], 0.005);
    const light = new THREE.Mesh(new THREE.SphereGeometry(sx * 0.08, 8, 6), glowMat(0xff6050, 1.3));
    light.position.set(0, sy * 0.3, -sz * 0.32);
    root.add(pack, tankL, tankR, hoseL, hoseR, light);
    root.userData.visualHalfH = sy / 2;
    return root;
  }

  if (partId === 'weapon_rifle') {
    // 圆胖枪身 + 橙色枪口环 + 圆握把
    const receiver = new THREE.Mesh(capsule(sy * 0.3, sz * 0.55), bodyMat());
    receiver.rotation.x = Math.PI / 2;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(sy * 0.14, sy * 0.18, sz * 0.5, 12), vinylMat());
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = sz * 0.42;
    const muzzle = new THREE.Mesh(new THREE.TorusGeometry(sy * 0.17, sy * 0.05, 8, 14), orangeMat());
    muzzle.position.z = sz * 0.62;
    const grip = new THREE.Mesh(capsule(sx * 0.16, sy * 0.3), vinylMat());
    grip.position.set(0, -sy * 0.42, -sz * 0.12);
    grip.rotation.x = 0.25;
    const tank = new THREE.Mesh(new THREE.SphereGeometry(sy * 0.2, 12, 10), orangeMat());
    tank.position.set(0, sy * 0.3, -sz * 0.05);
    const sight = new THREE.Mesh(new THREE.SphereGeometry(sx * 0.09, 8, 6), glowMat(0xffb060, 1.2));
    sight.position.set(0, sy * 0.42, -sz * 0.18);
    root.add(receiver, barrel, muzzle, grip, tank, sight);
    root.userData.visualHalfH = sy / 2;
    root.userData.isWeapon = true;
    return root;
  }

  if (partId === 'thruster_pack') {
    const body = new THREE.Mesh(rbox(sx * 0.85, sy * 0.7, sz * 0.55), bodyMat());
    const nozzle = (x) => {
      const n = new THREE.Mesh(
        new THREE.CylinderGeometry(sx * 0.16, sx * 0.26, sz * 0.45, 12),
        vinylMat(),
      );
      n.rotation.x = Math.PI / 2;
      n.position.set(x, -sy * 0.15, -sz * 0.35);
      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(sx * 0.14, 10, 8),
        glowMat(0xffa050, 2.0),
      );
      glow.position.set(x, -sy * 0.15, -sz * 0.52);
      return [n, glow];
    };
    root.add(body, ...nozzle(-sx * 0.25), ...nozzle(sx * 0.25));
    root.userData.visualHalfH = sy / 2;
    return root;
  }

  if (partId === 'winch_module') {
    const housing = new THREE.Mesh(rbox(sx, sy * 0.7, sz * 0.55), bodyMat());
    const drum = new THREE.Mesh(
      new THREE.CylinderGeometry(Math.min(sx, sy) * 0.35, Math.min(sx, sy) * 0.35, sx * 0.7, 14),
      orangeMat(),
    );
    drum.rotation.z = Math.PI / 2;
    drum.position.z = sz * 0.1;
    const hook = new THREE.Mesh(
      new THREE.TorusGeometry(Math.min(sx, sz) * 0.2, Math.min(sx, sz) * 0.07, 6, 12, Math.PI),
      vinylMat(),
    );
    hook.rotation.y = Math.PI / 2;
    hook.position.z = sz * 0.4;
    root.add(housing, drum, hook);
    root.userData.visualHalfH = sy / 2;
    return root;
  }

  if (partId === 'heavy_plate') {
    const plate = new THREE.Mesh(rbox(sx, sy, sz), panelMat());
    const ridge = new THREE.Mesh(rbox(sx * 0.85, sy * 1.1, sz * 0.18), orangeMat());
    ridge.position.z = sz * 0.38;
    addRivets(root, [
      [-sx * 0.38, 0, -sz * 0.38],
      [sx * 0.38, 0, -sz * 0.38],
      [-sx * 0.38, 0, sz * 0.42],
      [sx * 0.38, 0, sz * 0.42],
    ]);
    root.add(plate, ridge);
    root.userData.visualHalfH = sy / 2;
    return root;
  }

  if (partId === 'gripper') {
    const open = Number.isFinite(opts.gripperOpen) ? opts.gripperOpen : 1;
    const spread = 0.012 + open * Math.max(0.01, sx * 0.45);
    const palm = new THREE.Mesh(rbox(sx * 0.55, sy * 0.7, sz * 0.35), bodyMat());
    const fingerGeo = capsule(sx * 0.1, sy * 0.34);
    const left = new THREE.Mesh(fingerGeo, vinylMat());
    const right = new THREE.Mesh(fingerGeo, vinylMat());
    left.position.set(-spread, 0, sz * 0.26);
    right.position.set(spread, 0, sz * 0.26);
    const wrist = new THREE.Mesh(new THREE.SphereGeometry(sx * 0.18, 12, 10), orangeMat());
    wrist.position.y = sy * 0.34;
    root.add(palm, left, right, wrist);
    root.userData.visualHalfH = sy / 2;
    return root;
  }

  if (partId === 'revolute_joint' || partId === 'prism_joint') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(Math.min(sx, sy, sz) * 0.48, 14, 10), bodyMat());
    const axis = new THREE.Mesh(
      new THREE.CylinderGeometry(Math.min(sx, sz) * 0.2, Math.min(sx, sz) * 0.2, sy * 1.05, 12),
      vinylMat(),
    );
    if (partId === 'revolute_joint') axis.rotation.x = Math.PI / 2;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(Math.min(sx, sz) * 0.34, Math.min(sx, sz) * 0.06, 6, 16),
      orangeMat(),
    );
    if (partId === 'revolute_joint') ring.rotation.y = Math.PI / 2;
    root.add(body, axis, ring);
    root.userData.visualHalfH = sy / 2;
    return root;
  }

  if (partId === 'beam' || partId === 'post') {
    const bar = new THREE.Mesh(capsule(Math.min(sx, sz) * 0.48, sy * 0.85), bodyMat());
    const capR = Math.min(sx, sy, sz) * 0.45;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(capR, 12, 8), orangeMat());
    cap.position.y = sy * 0.46;
    root.add(bar, cap);
    root.userData.visualHalfH = sy / 2;
    return root;
  }

  if (partId === 'plate') {
    const plate = new THREE.Mesh(rbox(sx, sy, sz), panelMat());
    addRivets(root, [
      [-sx * 0.34, 0, -sz * 0.34],
      [sx * 0.34, 0, -sz * 0.34],
      [-sx * 0.34, 0, sz * 0.34],
      [sx * 0.34, 0, sz * 0.34],
    ]);
    root.add(plate);
    root.userData.visualHalfH = sy / 2;
    return root;
  }

  if (partId === 'track_module') {
    const belt = new THREE.Mesh(rbox(sx, sy * 0.7, sz, Math.min(sx, sz) * 0.2), vinylMat());
    const roller = (z) => {
      const r = new THREE.Mesh(
        new THREE.CylinderGeometry(sy * 0.34, sy * 0.34, sx * 1.08, 12),
        bodyMat(),
      );
      r.rotation.z = Math.PI / 2;
      r.position.z = z;
      return r;
    };
    root.add(belt, roller(sz * 0.3), roller(-sz * 0.3));
    root.userData.visualHalfH = sy / 2;
    return root;
  }

  if (partId === 'core') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(sy * 0.46, 16, 12), bodyMat());
    body.scale.set(sx / sy, 1, sz / sy);
    const lens = new THREE.Mesh(new THREE.SphereGeometry(sy * 0.16, 12, 10), glowMat(0x9fe8ff, 1.8));
    lens.position.z = sz * 0.38;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(sy * 0.3, sy * 0.045, 8, 18), orangeMat());
    ring.position.z = sz * 0.18;
    const portL = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.02, 8), vinylMat());
    const portR = portL.clone();
    portL.rotation.x = Math.PI / 2;
    portR.rotation.x = Math.PI / 2;
    portL.position.set(-sx * 0.25, 0, sz / 2);
    portR.position.set(sx * 0.25, 0, sz / 2);
    root.add(body, lens, ring, portL, portR);
    root.userData.visualHalfH = sy / 2;
    return root;
  }

  if (partId === 'hook') {
    const box = new THREE.Mesh(rbox(sx, sy, sz), bodyMat());
    const tip = new THREE.Mesh(
      new THREE.TorusGeometry(Math.min(sx, sz) * 0.35, Math.min(sx, sz) * 0.12, 8, 16, Math.PI),
      orangeMat(),
    );
    tip.rotation.y = Math.PI / 2;
    tip.position.z = sz * 0.35;
    root.add(box, tip);
    root.userData.visualHalfH = sy / 2;
    return root;
  }

  const box = new THREE.Mesh(rbox(sx, sy, sz), bodyMat());
  root.add(box);
  root.userData.visualHalfH = sy / 2;
  return root;
}

/**
 * 同步返回程序化外观；若该零件登记了英雄 GLB，则异步加载就绪后原位替换
 * （失败/低画质/未登记一律保持程序化，见 partAssets.mjs 的三条回落路径）。
 */
export function createPartVisual(partId, size, opts = {}) {
  const visual = createProceduralPartVisual(partId, size, opts);
  maybeAttachHeroModel(visual, partId, {size, quality: opts.quality});
  return visual;
}

/**
 * 将视觉根节点放到世界位姿。
 * 几何按米建模；这里统一 `scale`（与编辑器/试验场 SCALE 一致）。
 */
export function placePartVisual(visual, pose, scale, sizeY) {
  const s = Number(scale) > 0 ? Number(scale) : 1;
  const half = visual.userData.visualHalfH ?? sizeY / 2;
  visual.scale.setScalar(s);
  visual.position.set(pose.x * s, pose.y * s + half * s, pose.z * s);
  visual.rotation.set(pose.rx || 0, pose.ry || 0, pose.rz || 0);
  visual.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
}

/** 供测试：某 partId 期望的最少子 Mesh 数（套件外形验收）。 */
export function expectedMeshCount(partId) {
  const map = {
    mecha_head: 7,
    armor_torso: 7,
    armor_shoulder: 4,
    mecha_leg: 6,
    backpack_frame: 6,
    weapon_rifle: 6,
    thruster_pack: 5,
    winch_module: 3,
    heavy_plate: 6,
    core: 5,
  };
  return map[partId] || 1;
}
