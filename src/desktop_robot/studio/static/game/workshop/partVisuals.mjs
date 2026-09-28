/**
 * 零件视觉网格：机甲级程序化外形（面板/关节/炮管），尺寸单位米；调用方再乘 SCALE。
 */
import * as THREE from 'three';
import {materialForPart} from './materials.mjs';
import {maybeAttachHeroModel} from './partAssets.mjs';

function stdMat(info) {
  return new THREE.MeshStandardMaterial({
    color: info.color,
    roughness: info.roughness,
    metalness: info.metalness,
    emissive: info.emissive || 0x000000,
    emissiveIntensity: info.emissiveIntensity || 0,
  });
}

function accentMat(color = 0x62e9de) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.35,
    roughness: 0.35,
    metalness: 0.55,
  });
}

function darkMetal() {
  return new THREE.MeshStandardMaterial({color: 0x3a4248, roughness: 0.4, metalness: 0.85});
}

/**
 * 倒角长方体：用 ExtrudeGeometry + bevel 替代 BoxGeometry，
 * 但把基础形状缩小 2*bevelSize，使最终包围盒仍精确等于 (w,h,d)。
 * 这样视觉去掉了纯方块的锐利棱，却不会与碰撞盒、挂点、可达半径脱节
 * （这是 phase 2 的硬约束：视觉尺寸必须与物理尺寸一致）。
 * @param {number} w @param {number} h @param {number} d 米
 * @param {number} [r] 倒角半径，缺省按最短边 14% 自适应
 */
function rbox(w, h, d, r) {
  r = r ?? Math.min(w, h, d) * 0.14;
  r = Math.min(Math.max(r, 0.002), w / 2, h / 2, d / 2 - 0.001);
  const bw = w - 2 * r, bh = h - 2 * r;
  const s = new THREE.Shape();
  s.moveTo(-bw / 2, -bh / 2);
  s.lineTo(bw / 2, -bh / 2);
  s.lineTo(bw / 2, bh / 2);
  s.lineTo(-bw / 2, bh / 2);
  s.closePath();
  const bt = Math.min(0.012, d * 0.1);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(0.001, d - 2 * bt),
    bevelEnabled: true,
    bevelThickness: bt,
    bevelSize: r,
    bevelSegments: 3,
    steps: 1,
  });
  geo.translate(0, 0, -d / 2);
  return geo;
}

/** 描边：让叠在一起的面板能分出边界（一眼能看出「改过」） */
function withEdges(mesh, color = 0x9ef0e8) {
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry, 28),
    new THREE.LineBasicMaterial({color, transparent: true, opacity: 0.85}),
  );
  mesh.add(edges);
  return mesh;
}

function paintMecha(partId, themeId) {
  // 机甲结构件强制高对比配色，避免主题材质糊成同色方块堆
  const forced = {
    mecha_head: {color: 0x5ee8de, roughness: 0.35, metalness: 0.55, emissive: 0x1a5550, emissiveIntensity: 0.35},
    armor_torso: {color: 0x4a5560, roughness: 0.42, metalness: 0.75, emissive: 0x000000, emissiveIntensity: 0},
    armor_shoulder: {color: 0x6a7380, roughness: 0.4, metalness: 0.7, emissive: 0x102028, emissiveIntensity: 0.15},
    mecha_leg: {color: 0x3d4650, roughness: 0.48, metalness: 0.65, emissive: 0x000000, emissiveIntensity: 0},
    backpack_frame: {color: 0x2f3842, roughness: 0.45, metalness: 0.8, emissive: 0x000000, emissiveIntensity: 0},
    weapon_rifle: {color: 0xc4a35a, roughness: 0.4, metalness: 0.7, emissive: 0x332200, emissiveIntensity: 0.2},
  };
  if (forced[partId]) return forced[partId];
  return materialForPart(partId, themeId);
}

/**
 * @param {string} partId
 * @param {number[]} size [sx,sy,sz] meters
 * @param {{gripperOpen?: number, themeId?: string}} [opts]
 * @returns {THREE.Object3D}
 */
function createProceduralPartVisual(partId, size, opts = {}) {
  const [sx = 0.05, sy = 0.05, sz = 0.05] = size || [];
  const themeId = opts.themeId || 'warm';
  const matInfo = paintMecha(partId, themeId);
  const mat = () => stdMat(matInfo);
  const panel = (geo, material = mat()) => withEdges(new THREE.Mesh(geo, material));

  const root = new THREE.Group();
  root.userData.partId = partId;
  root.userData.themeId = themeId;

  if (partId === 'wheel' || partId === 'drive_wheel') {
    const r = Math.max(sx, sy, sz) * 0.72;
    const t = Math.min(sx, sy, sz) * 1.05;
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, t, 22), mat());
    tire.rotation.z = Math.PI / 2;
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.35, r * 0.35, t * 1.15, 12),
      new THREE.MeshStandardMaterial({color: 0x9aa0a6, roughness: 0.35, metalness: 0.85}),
    );
    hub.rotation.z = Math.PI / 2;
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(r * 0.78, r * 0.08, 6, 20),
      darkMetal(),
    );
    rim.rotation.y = Math.PI / 2;
    root.add(tire, hub, rim);
    root.userData.isWheel = true;
    root.userData.visualHalfH = r;
    return root;
  }

  if (partId === 'mecha_head') {
    // 尖颔头罩 + 宽面罩：一眼是「头」不是方块
    const cranium = panel(rbox(sx * 0.85, sy * 0.7, sz * 0.75));
    cranium.position.y = sy * 0.05;
    const jaw = panel(rbox(sx * 0.7, sy * 0.28, sz * 0.55), darkMetal());
    jaw.position.set(0, -sy * 0.28, sz * 0.08);
    const visor = panel(rbox(sx * 0.78, sy * 0.22, 0.012), accentMat());
    visor.position.set(0, sy * 0.12, sz * 0.4);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, sy * 0.55, 6), darkMetal());
    antenna.position.set(sx * 0.28, sy * 0.45, -sz * 0.05);
    const crest = panel(rbox(sx * 0.1, sy * 0.65, sz * 0.65), darkMetal());
    crest.position.set(0, sy * 0.35, -sz * 0.05);
    const cheekL = panel(rbox(sx * 0.28, sy * 0.4, sz * 0.4));
    const cheekR = panel(rbox(sx * 0.28, sy * 0.4, sz * 0.4));
    cheekL.position.set(-sx * 0.48, 0, sz * 0.05);
    cheekR.position.set(sx * 0.48, 0, sz * 0.05);
    root.add(cranium, jaw, visor, antenna, crest, cheekL, cheekR);
    root.userData.visualHalfH = sy / 2;
    return root;
  }

  if (partId === 'armor_torso') {
    const chest = panel(rbox(sx * 1.05, sy * 0.9, sz * 0.85));
    const abs = panel(rbox(sx * 0.85, sy * 0.35, sz * 0.7), darkMetal());
    abs.position.y = -sy * 0.35;
    const plow = panel(rbox(sx * 1.0, sy * 0.28, sz * 0.45), darkMetal());
    plow.position.set(0, -sy * 0.2, sz * 0.42);
    plow.rotation.x = -0.45;
    const collar = panel(rbox(sx * 0.65, sy * 0.18, sz * 0.55));
    collar.position.y = sy * 0.48;
    const skirtL = panel(rbox(sx * 0.22, sy * 0.55, sz * 0.5));
    const skirtR = panel(rbox(sx * 0.22, sy * 0.55, sz * 0.5));
    skirtL.position.set(-sx * 0.55, -sy * 0.15, 0);
    skirtR.position.set(sx * 0.55, -sy * 0.15, 0);
    const coreGlow = panel(rbox(sx * 0.35, sy * 0.25, 0.012), accentMat());
    coreGlow.position.set(0, sy * 0.1, sz * 0.44);
    root.add(chest, abs, plow, collar, skirtL, skirtR, coreGlow);
    root.userData.visualHalfH = sy / 2;
    return root;
  }

  if (partId === 'armor_shoulder') {
    const pauldron = panel(rbox(sx * 1.15, sy * 0.65, sz * 1.05));
    pauldron.position.x = sx * 0.08;
    const spike = panel(rbox(sx * 0.4, sy * 0.85, sz * 0.4), darkMetal());
    spike.position.set(sx * 0.15, sy * 0.45, -sz * 0.1);
    const rail = panel(rbox(sx * 0.35, sy * 0.22, sz * 1.05), accentMat());
    rail.position.set(0, sy * 0.2, 0);
    const guard = panel(rbox(sx * 0.55, sy * 0.35, sz * 0.35), darkMetal());
    guard.position.set(sx * 0.25, -sy * 0.15, sz * 0.25);
    root.add(pauldron, spike, rail, guard);
    root.userData.visualHalfH = sy / 2;
    return root;
  }

  if (partId === 'mecha_leg') {
    const hip = panel(rbox(sx * 0.95, sy * 0.22, sz * 0.8), darkMetal());
    hip.position.y = sy * 0.38;
    const thigh = panel(rbox(sx * 0.9, sy * 0.42, sz * 0.75));
    thigh.position.y = sy * 0.12;
    const shin = panel(rbox(sx * 0.75, sy * 0.42, sz * 0.6), darkMetal());
    shin.position.y = -sy * 0.22;
    const foot = panel(rbox(sx * 1.05, sy * 0.14, sz * 1.15));
    foot.position.set(0, -sy * 0.48, sz * 0.18);
    const knee = withEdges(
      new THREE.Mesh(
        new THREE.CylinderGeometry(Math.min(sx, sz) * 0.32, Math.min(sx, sz) * 0.32, sx * 0.55, 12),
        accentMat(),
      ),
    );
    knee.rotation.z = Math.PI / 2;
    knee.position.y = -sy * 0.02;
    root.add(hip, thigh, shin, foot, knee);
    root.userData.visualHalfH = sy / 2;
    return root;
  }

  if (partId === 'backpack_frame') {
    const frame = panel(rbox(sx * 1.05, sy * 1.05, sz * 0.6));
    const tankL = withEdges(
      new THREE.Mesh(new THREE.CylinderGeometry(sx * 0.26, sx * 0.26, sy * 0.85, 12), darkMetal()),
    );
    const tankR = withEdges(
      new THREE.Mesh(new THREE.CylinderGeometry(sx * 0.26, sx * 0.26, sy * 0.85, 12), darkMetal()),
    );
    tankL.position.set(-sx * 0.38, 0, -sz * 0.2);
    tankR.position.set(sx * 0.38, 0, -sz * 0.2);
    const bar = panel(rbox(sx * 0.95, sy * 0.14, sz * 0.25), accentMat());
    bar.position.z = -sz * 0.32;
    const fin = panel(rbox(sx * 0.12, sy * 0.7, sz * 0.55), darkMetal());
    fin.position.set(0, sy * 0.15, -sz * 0.35);
    root.add(frame, tankL, tankR, bar, fin);
    root.userData.visualHalfH = sy / 2;
    return root;
  }

  if (partId === 'weapon_rifle') {
    const receiver = panel(rbox(sx * 0.85, sy * 0.65, sz * 0.4));
    const barrel = withEdges(
      new THREE.Mesh(
        new THREE.CylinderGeometry(Math.min(sx, sy) * 0.22, Math.min(sx, sy) * 0.16, sz * 0.95, 12),
        darkMetal(),
      ),
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = sz * 0.28;
    const shroud = panel(rbox(sx * 0.55, sy * 0.4, sz * 0.55), darkMetal());
    shroud.position.z = sz * 0.15;
    const stock = panel(rbox(sx * 0.55, sy * 0.45, sz * 0.28));
    stock.position.z = -sz * 0.38;
    const sight = panel(rbox(sx * 0.28, sy * 0.3, sz * 0.22), accentMat());
    sight.position.set(0, sy * 0.4, -sz * 0.05);
    const mag = panel(rbox(sx * 0.35, sy * 0.45, sz * 0.18), darkMetal());
    mag.position.set(0, -sy * 0.35, -sz * 0.05);
    root.add(receiver, barrel, shroud, stock, sight, mag);
    root.userData.visualHalfH = sy / 2;
    root.userData.isWeapon = true;
    return root;
  }

  if (partId === 'thruster_pack') {
    const body = new THREE.Mesh(rbox(sx * 0.85, sy * 0.7, sz * 0.55), mat());
    const nozzle = (x) => {
      const n = new THREE.Mesh(
        new THREE.CylinderGeometry(sx * 0.18, sx * 0.28, sz * 0.45, 12),
        darkMetal(),
      );
      n.rotation.x = Math.PI / 2;
      n.position.set(x, -sy * 0.15, -sz * 0.35);
      const glow = new THREE.Mesh(
        new THREE.CircleGeometry(sx * 0.16, 12),
        accentMat(0xff8844),
      );
      glow.position.set(x, -sy * 0.15, -sz * 0.55);
      return [n, glow];
    };
    root.add(body, ...nozzle(-sx * 0.25), ...nozzle(sx * 0.25));
    root.userData.visualHalfH = sy / 2;
    return root;
  }

  if (partId === 'winch_module') {
    const housing = new THREE.Mesh(rbox(sx, sy * 0.7, sz * 0.55), mat());
    const drum = new THREE.Mesh(
      new THREE.CylinderGeometry(Math.min(sx, sy) * 0.35, Math.min(sx, sy) * 0.35, sx * 0.7, 14),
      darkMetal(),
    );
    drum.rotation.z = Math.PI / 2;
    drum.position.z = sz * 0.1;
    const hook = new THREE.Mesh(
      new THREE.TorusGeometry(Math.min(sx, sz) * 0.2, Math.min(sx, sz) * 0.07, 6, 12, Math.PI),
      accentMat(),
    );
    hook.rotation.y = Math.PI / 2;
    hook.position.z = sz * 0.4;
    root.add(housing, drum, hook);
    root.userData.visualHalfH = sy / 2;
    return root;
  }

  if (partId === 'heavy_plate') {
    const plate = new THREE.Mesh(rbox(sx, sy, sz), mat());
    const ridge = new THREE.Mesh(rbox(sx * 0.9, sy * 1.2, sz * 0.15), darkMetal());
    ridge.position.z = sz * 0.35;
    const boltGeo = new THREE.CylinderGeometry(0.006, 0.006, sy * 1.6, 6);
    for (const [bx, bz] of [
      [-sx * 0.4, -sz * 0.35],
      [sx * 0.4, -sz * 0.35],
      [-sx * 0.4, sz * 0.35],
      [sx * 0.4, sz * 0.35],
    ]) {
      const b = new THREE.Mesh(boltGeo, accentMat(0x888888));
      b.position.set(bx, 0, bz);
      root.add(b);
    }
    root.add(plate, ridge);
    root.userData.visualHalfH = sy / 2;
    return root;
  }

  if (partId === 'gripper') {
    const open = Number.isFinite(opts.gripperOpen) ? opts.gripperOpen : 1;
    const spread = 0.012 + open * Math.max(0.01, sx * 0.45);
    const palm = new THREE.Mesh(rbox(sx * 0.55, sy * 0.7, sz * 0.35), mat());
    const jawGeo = rbox(sx * 0.22, sy * 0.55, sz * 0.75);
    const left = new THREE.Mesh(jawGeo, mat());
    const right = new THREE.Mesh(jawGeo, mat());
    left.position.set(-spread, 0, sz * 0.28);
    right.position.set(spread, 0, sz * 0.28);
    root.add(palm, left, right);
    root.userData.visualHalfH = sy / 2;
    return root;
  }

  if (partId === 'revolute_joint' || partId === 'prism_joint') {
    const body = new THREE.Mesh(rbox(sx, sy * 0.7, sz), mat());
    const axis = new THREE.Mesh(
      new THREE.CylinderGeometry(Math.min(sx, sz) * 0.22, Math.min(sx, sz) * 0.22, sy * 1.15, 12),
      darkMetal(),
    );
    if (partId === 'revolute_joint') axis.rotation.x = Math.PI / 2;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(Math.min(sx, sz) * 0.35, Math.min(sx, sz) * 0.06, 6, 14),
      accentMat(),
    );
    if (partId === 'revolute_joint') ring.rotation.y = Math.PI / 2;
    root.add(body, axis, ring);
    root.userData.visualHalfH = sy / 2;
    return root;
  }

  if (partId === 'beam' || partId === 'post') {
    const bar = new THREE.Mesh(rbox(sx, sy, sz), mat());
    const capR = Math.min(sx, sy, sz) * 0.45;
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(capR, capR, Math.min(sx, sy, sz) * 0.35, 10),
      darkMetal(),
    );
    if (partId === 'beam') {
      cap.rotation.z = Math.PI / 2;
      cap.position.x = sx * 0.42;
    } else {
      cap.position.y = sy * 0.42;
    }
    root.add(bar, cap);
    root.userData.visualHalfH = sy / 2;
    return root;
  }

  if (partId === 'plate') {
    const plate = new THREE.Mesh(rbox(sx, sy, sz), mat());
    const boltGeo = new THREE.CylinderGeometry(0.004, 0.004, sy * 1.4, 6);
    const boltMat = darkMetal();
    for (const [bx, bz] of [
      [-sx * 0.35, -sz * 0.35],
      [sx * 0.35, -sz * 0.35],
      [-sx * 0.35, sz * 0.35],
      [sx * 0.35, sz * 0.35],
    ]) {
      const b = new THREE.Mesh(boltGeo, boltMat);
      b.position.set(bx, 0, bz);
      root.add(b);
    }
    root.add(plate);
    root.userData.visualHalfH = sy / 2;
    return root;
  }

  if (partId === 'track_module') {
    const belt = new THREE.Mesh(rbox(sx, sy * 0.7, sz), mat());
    const roller = (z) => {
      const r = new THREE.Mesh(
        new THREE.CylinderGeometry(sy * 0.35, sy * 0.35, sx * 1.1, 10),
        darkMetal(),
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
    const body = new THREE.Mesh(rbox(sx * 0.9, sy * 0.9, sz * 0.9), mat());
    const frame = new THREE.Mesh(rbox(sx, sy * 0.2, sz), darkMetal());
    frame.position.y = sy * 0.35;
    const lens = new THREE.Mesh(rbox(sx * 0.45, sy * 0.18, 0.01), accentMat());
    lens.position.z = sz / 2 + 0.005;
    const portL = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.02, 8), accentMat());
    const portR = portL.clone();
    portL.rotation.x = Math.PI / 2;
    portR.rotation.x = Math.PI / 2;
    portL.position.set(-sx * 0.25, 0, sz / 2);
    portR.position.set(sx * 0.25, 0, sz / 2);
    root.add(body, frame, lens, portL, portR);
    root.userData.visualHalfH = sy / 2;
    return root;
  }

  if (partId === 'hook') {
    const box = new THREE.Mesh(rbox(sx, sy, sz), mat());
    const tip = new THREE.Mesh(
      new THREE.TorusGeometry(Math.min(sx, sz) * 0.35, Math.min(sx, sz) * 0.12, 8, 16, Math.PI),
      mat(),
    );
    tip.rotation.y = Math.PI / 2;
    tip.position.z = sz * 0.35;
    root.add(box, tip);
    root.userData.visualHalfH = sy / 2;
    return root;
  }

  const box = new THREE.Mesh(rbox(sx, sy, sz), mat());
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

/** 供测试：某 partId 期望的最少子 Mesh 数（机甲外形验收）。 */
export function expectedMeshCount(partId) {
  const map = {
    mecha_head: 7,
    armor_torso: 7,
    armor_shoulder: 4,
    mecha_leg: 5,
    backpack_frame: 5,
    weapon_rifle: 6,
    thruster_pack: 5,
    winch_module: 3,
    heavy_plate: 6,
    core: 5,
  };
  return map[partId] || 1;
}
