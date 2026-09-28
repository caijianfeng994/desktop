/**
 * 工业装配舱陈设（kit 主题专属，参考「环臂机械手装配舱」氛围图）：
 * - 四台环臂机械手围绕装配地台，带怠速动画
 * - 发光地台环 + 深色金属地板
 * - 背景竖向灯带与货架剪影（营造机库纵深）
 * - 地台边缘散落零件
 * 纯程序化几何，零外部资产；不参与拾取（编辑器射线只检测 markers+root）。
 */
import * as THREE from 'three';

const CYAN = 0x54d8ff;

/** 机械手单一单元：立柱 + 大臂 + 小臂 + 发光工具头，返回带 update 的句柄。 */
function buildArm(baseMat, jointMat, glowMat, {height = 2.1, reach = 2.3, flip = false} = {}) {
  const root = new THREE.Group();

  // 基座 + 立柱
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.16, 20), baseMat);
  base.position.y = 0.08;
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.095, height, 14), baseMat);
  column.position.y = height / 2 + 0.14;
  root.add(base, column);

  // 肩关节（球）+ 大臂俯仰枢轴
  const shoulderY = height + 0.14;
  const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), jointMat);
  shoulder.position.y = shoulderY;
  const upperPivot = new THREE.Group();
  upperPivot.position.y = shoulderY;
  const upperLen = 1.05;
  const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, upperLen - 0.12, 6, 12), baseMat);
  upper.rotation.x = Math.PI / 2;
  upper.position.z = upperLen / 2;
  upperPivot.add(upper);
  root.add(shoulder, upperPivot);

  // 肘关节 + 小臂枢轴
  const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.095, 14, 10), jointMat);
  elbow.position.z = upperLen;
  upperPivot.add(elbow);
  const forePivot = new THREE.Group();
  forePivot.position.z = upperLen;
  const foreLen = 0.95;
  const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, foreLen - 0.1, 6, 12), baseMat);
  fore.rotation.x = Math.PI / 2;
  fore.position.z = foreLen / 2;
  forePivot.add(fore);

  // 腕部：环 + 收敛锥 + 发光工具头
  const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.12, 12), jointMat);
  wrist.rotation.x = Math.PI / 2;
  wrist.position.z = foreLen + 0.04;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 12), jointMat);
  cone.rotation.x = Math.PI / 2;
  cone.position.z = foreLen + 0.17;
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), glowMat);
  tip.position.z = foreLen + 0.27;
  forePivot.add(wrist, cone, tip);
  upperPivot.add(forePivot);

  // 液压管（曲线管连立柱到大臂，细节感）
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.07, shoulderY - 0.5, 0.02),
    new THREE.Vector3(0.11, shoulderY - 0.15, 0.06),
    new THREE.Vector3(0.05, shoulderY + 0.05, 0.1),
  ]);
  const hose = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.014, 6), jointMat);
  root.add(hose);

  // 姿态：大臂向中心下压，小臂继续下探（+Z 朝中心）
  const upperBase = flip ? 0.34 : 0.42;
  const foreBase = flip ? 0.5 : 0.38;
  const speed = 0.5 + Math.random() * 0.3;
  const phase = Math.random() * Math.PI * 2;
  upperPivot.rotation.x = upperBase;
  forePivot.rotation.x = foreBase;

  return {
    root,
    upperPivot,
    forePivot,
    glow: tip,
    phase,
    speed,
    upperBase,
    foreBase,
    update(t) {
      // 怠速：缓慢呼吸式摆动 + 工具头微微明灭
      upperPivot.rotation.x = upperBase + Math.sin(t * speed + phase) * 0.035;
      forePivot.rotation.x = foreBase + Math.cos(t * speed * 0.8 + phase) * 0.05;
    },
  };
}

export function createHangarDressing() {
  const root = new THREE.Group();
  const disposables = [];
  const track = (m) => (disposables.push(m), m);

  const baseMat = track(new THREE.MeshStandardMaterial({color: 0x363c44, roughness: 0.42, metalness: 0.78}));
  const jointMat = track(new THREE.MeshStandardMaterial({color: 0x22262c, roughness: 0.55, metalness: 0.6}));
  const shelfMat = track(new THREE.MeshStandardMaterial({color: 0x1a1f26, roughness: 0.75, metalness: 0.35}));
  const partMat = track(new THREE.MeshStandardMaterial({color: 0x2e343c, roughness: 0.5, metalness: 0.7}));
  const accentMat = track(new THREE.MeshStandardMaterial({color: 0xb25a1e, roughness: 0.45, metalness: 0.3}));
  const glowMat = track(new THREE.MeshStandardMaterial({
    color: 0x08202c, emissive: CYAN, emissiveIntensity: 2.4, roughness: 0.3, metalness: 0.1,
  }));
  const stripMat = track(new THREE.MeshStandardMaterial({
    color: 0x0a1a24, emissive: CYAN, emissiveIntensity: 1.7, roughness: 0.4, metalness: 0.1,
  }));

  /* ---- 深色金属地板 + 发光地台环（机器人站姿中心已被编辑器 ground 占用） ---- */
  const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 40), track(new THREE.MeshStandardMaterial({
    color: 0x10151c, roughness: 0.55, metalness: 0.55,
  })));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.47;
  root.add(floor);

  // 环绕编辑器地台（半径 2.4）的两圈青色辉光环
  const ringGeo = track(new THREE.TorusGeometry(2.52, 0.02, 8, 80));
  const ring = new THREE.Mesh(ringGeo, glowMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.2;
  const ring2 = new THREE.Mesh(track(new THREE.TorusGeometry(2.9, 0.012, 8, 80)), stripMat);
  ring2.rotation.x = Math.PI / 2;
  ring2.position.y = -0.32;
  root.add(ring, ring2);

  /* ---- 四台环臂机械手 ---- */
  const arms = [];
  const armDefs = [
    {angle: 0.55 * Math.PI, height: 2.15, flip: false},
    {angle: 0.95 * Math.PI, height: 1.95, flip: true},
    {angle: 1.45 * Math.PI, height: 2.05, flip: false},
    {angle: 0.08 * Math.PI, height: 2.3, flip: true},
  ];
  for (const def of armDefs) {
    const arm = buildArm(baseMat, jointMat, glowMat, def);
    const r = 2.55 + Math.random() * 0.25;
    arm.root.position.set(Math.cos(def.angle) * r, -0.4, Math.sin(def.angle) * r);
    // +Z 指向中心
    arm.root.rotation.y = -def.angle - Math.PI / 2;
    arm.root.scale.setScalar(1.35);
    arms.push(arm);
    root.add(arm.root);
  }

  /* ---- 背景：竖向灯带 + 货架剪影（后半圆） ---- */
  for (let i = 0; i < 14; i++) {
    const a = Math.PI * (0.55 + 0.9 * (i / 13)); // 后半圆 99°~261°
    const r = 5.4 + (i % 3) * 0.9;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    // 货架暗体
    const h = 2.4 + ((i * 7) % 5) * 0.5;
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.1, h, 0.5), shelfMat);
    shelf.position.set(x, h / 2 - 0.45, z);
    shelf.rotation.y = -a + Math.PI / 2;
    root.add(shelf);
    // 竖向青色灯带（贴在货架前）
    const stripH = 0.8 + ((i * 5) % 4) * 0.45;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.05, stripH, 0.05), i % 3 === 0 ? glowMat : stripMat);
    strip.position.set(x * 0.94, stripH / 2 + 0.1, z * 0.94);
    root.add(strip);
  }

  /* ---- 地台边缘散落零件（螺栓/板件/管件剪影） ---- */
  const scatter = new THREE.Group();
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 3.1 + Math.random() * 1.3;
    const kind = i % 3;
    let m;
    if (kind === 0) {
      m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 10), partMat); // 垫圈
    } else if (kind === 1) {
      m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.1), i % 4 ? partMat : accentMat); // 板件
    } else {
      m = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.18, 8), partMat); // 管件
      m.rotation.z = Math.PI / 2;
    }
    m.position.set(Math.cos(a) * r, -0.42, Math.sin(a) * r);
    m.rotation.y = Math.random() * Math.PI;
    scatter.add(m);
  }
  root.add(scatter);

  /* ---- 顶光束（体积光假象：半透明长锥从上打下） ---- */
  const beamMat = track(new THREE.MeshBasicMaterial({
    color: 0x9fd8ff, transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide,
  }));
  for (const [bx, bz] of [[-1.2, -1.2], [1.3, -0.9]]) {
    const beam = new THREE.Mesh(new THREE.ConeGeometry(0.85, 5.6, 16, 1, true), beamMat);
    beam.position.set(bx, 2.6, bz);
    root.add(beam);
  }

  let visible = true;
  return {
    group: root,
    setVisible(v) {
      visible = !!v;
      root.visible = visible;
    },
    /** 帧驱动：机械手怠速 + 地环呼吸辉光 */
    update(t) {
      if (!visible) return;
      for (const arm of arms) arm.update(t);
      const pulse = 2.1 + Math.sin(t * 1.6) * 0.6;
      glowMat.emissiveIntensity = pulse;
    },
    dispose() {
      for (const m of disposables) m.dispose();
      root.traverse((o) => {
        o.geometry?.dispose?.();
      });
    },
  };
}
