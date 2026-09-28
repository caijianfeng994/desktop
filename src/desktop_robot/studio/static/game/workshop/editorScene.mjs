/**
 * 蓝图三维建造场景：按实例生成盒体，高亮选中与连接点。
 */
import * as THREE from 'three';
import {classifyParentPoints} from '../editor/compatible.mjs';
import {pointsForInstance, sizeFromParams} from '../editor/params.mjs';
import {worldPosesFromBlueprint as posesFromSim} from '../simulation/pose.mjs';
import {checkAttachCollision, previewPoseAtPoint} from '../editor/attachPreview.mjs';
import {materialForPart} from './materials.mjs';
import {createSfx} from './sfx.mjs';
import {createPartVisual, placePartVisual} from './partVisuals.mjs';
import {damp, standardViewOrbit} from './cameraRig.mjs';
import {getTheme, normalizeThemeId, themeForQuality} from './visualTheme.mjs';
import {buildEnvironment, createBloomComposer} from '../renderFx.mjs';

/** 与 Python PART_DEFINITIONS 对齐的 fallback 尺寸（米） */
export const PART_SIZES = Object.freeze({
  core: [0.1, 0.12, 0.1],
  wheel: [0.03, 0.08, 0.08],
  drive_wheel: [0.03, 0.08, 0.08],
  track_module: [0.04, 0.05, 0.12],
  plate: [0.14, 0.02, 0.14],
  beam: [0.02, 0.02, 0.12],
  post: [0.03, 0.12, 0.03],
  revolute_joint: [0.04, 0.04, 0.04],
  prism_joint: [0.04, 0.04, 0.08],
  gripper: [0.04, 0.04, 0.06],
  pusher: [0.08, 0.04, 0.02],
  hook: [0.03, 0.06, 0.04],
  bucket: [0.1, 0.06, 0.08],
  battery: [0.05, 0.04, 0.08],
  camera: [0.04, 0.03, 0.04],
  display: [0.06, 0.04, 0.02],
  armor_torso: [0.16, 0.16, 0.14],
  armor_shoulder: [0.12, 0.08, 0.1],
  mecha_head: [0.1, 0.1, 0.12],
  mecha_leg: [0.07, 0.18, 0.09],
  backpack_frame: [0.12, 0.14, 0.1],
  weapon_rifle: [0.05, 0.05, 0.22],
  thruster_pack: [0.08, 0.1, 0.08],
  winch_module: [0.06, 0.06, 0.08],
  heavy_plate: [0.14, 0.04, 0.12],
});

const SCALE = 12;
const COLORS = {
  default: 0xc9b896,
  selected: 0xecb557,
  core: 0x477e7c,
  marker: 0x62e9de,
  markerOk: 0x4caf7a,
  markerBad: 0xb07060,
  ground: 0xe8dac4,
};

function zeroPose() {
  return {x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0};
}

function indexPartDefs(partDefs) {
  const map = new Map();
  for (const d of partDefs || []) {
    if (d?.id) map.set(d.id, d);
  }
  return map;
}

function sizeFor(inst, defs) {
  const d = defs.get(inst.part_id);
  const base = d?.size_m?.length >= 3 ? d.size_m : (PART_SIZES[inst.part_id] || [0.05, 0.05, 0.05]);
  return sizeFromParams(inst.part_id, base, inst.params);
}

/**
 * 平移优先世界位姿（对齐 simulation/pose，含 params 缩放）。
 */
export function worldPosesFromBlueprint(bp, partDefs = null) {
  return posesFromSim(bp, partDefs);
}

/**
 * @param {HTMLElement} container
 * @param {{
 *   onSelect?: (instanceId: string|null) => void,
 *   onPickPoint?: (instanceId: string, pointId: string, meta?: {compatible:boolean, reason?:string}) => void,
 *   getPartDefs?: () => object[],
 * }} [callbacks]
 */
export class BlueprintEditorScene {
  constructor(container, callbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.blueprint = null;
    this.selectedId = null;
    this.pendingPartId = null;
    this.disposed = false;
    this.meshes = new Map();
    this.markers = new THREE.Group();
    this.previewRoot = new THREE.Group();
    this.previewRoot.visible = false;
    this._flashUntil = 0;
    this._hoveredPoint = null;
    this.themeId = 'warm';
    this.quality = 'high';

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLORS.ground);
    this.renderer = new THREE.WebGLRenderer({antialias: true, alpha: false});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.append(this.renderer.domElement);

    // 环境反射（PMREM 渐变贴图）：让金属/装甲件有可信反射，零外部资产
    this._envMap = buildEnvironment(this.renderer);
    if (this._envMap) this.scene.environment = this._envMap;

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
    this.camera.position.set(1.6, 1.4, 2.2);
    this.look = new THREE.Vector3(0, 0.2, 0);

    this.hemi = new THREE.HemisphereLight(0xfff7e5, 0x8c8977, 1.9);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xffe2ab, 2.6);
    sun.position.set(-2.2, 4.2, 3.2);
    this.scene.add(sun);
    this.sun = sun;
    this.fill = new THREE.DirectionalLight(0xc8d8e0, 0.65);
    this.fill.position.set(3.2, 2.2, -2.2);
    this.scene.add(this.fill);
    this.rim = new THREE.DirectionalLight(0x88c8d8, 0.55);
    this.rim.position.set(0.5, 1.5, -3.5);
    this.scene.add(this.rim);
    // 编辑器不用远雾，避免小机体被“吞掉”
    this.scene.fog = null;

    // 展示台略大于机体即可，过大只会把零件衬成豆粒
    const padR = 0.2 * SCALE;
    const ground = new THREE.Mesh(
      new THREE.CylinderGeometry(padR, padR * 1.04, 0.04 * SCALE, 48),
      new THREE.MeshStandardMaterial({color: 0xd9cbb2, roughness: 0.88, metalness: 0.08}),
    );
    ground.position.y = -0.02 * SCALE;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.ground = ground;
    this.groundRing = null;

    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.scene.add(this.markers);
    this.scene.add(this.previewRoot);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.dragging = false;
    this.angle = 0.4;
    this.orbitRadius = 2.6;
    this.elevation = 1.2;
    this.reduceMotion = false;
    this._targetAngle = this.angle;
    this._targetRadius = this.orbitRadius;
    this._targetElevation = this.elevation;
    this._targetLook = this.look.clone();
    this.sfx = createSfx({muted: false});

    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);

    // Bloom 合成器：高画质开、低画质关（直接渲染），异常自动回退
    this._bloom = createBloomComposer(this.renderer, this.scene, this.camera, {
      strength: 0.5,
      radius: 0.6,
      threshold: 0.8,
    });

    this._onPointerDown = (e) => {
      this.dragging = true;
      this.startX = e.clientX;
      this.startY = e.clientY;
      this.moved = false;
      this.renderer.domElement.setPointerCapture(e.pointerId);
    };
    this._onPointerMove = (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.startX;
      const dy = e.clientY - this.startY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) this.moved = true;
      this._targetAngle += dx * 0.008;
      this._targetElevation = Math.min(0.85 * SCALE, Math.max(0.12 * SCALE, this._targetElevation + dy * 0.01));
      this.startX = e.clientX;
      this.startY = e.clientY;
    };
    this._onPointerUp = (e) => {
      if (!this.moved) this._pick(e);
      this.dragging = false;
    };
    this._onWheel = (e) => {
      e.preventDefault();
      this._targetRadius = Math.min(1.6 * SCALE, Math.max(0.35 * SCALE, this._targetRadius + e.deltaY * 0.003));
    };
    this._onResize = () => this.resize();

    this.renderer.domElement.addEventListener('pointerdown', this._onPointerDown);
    this.renderer.domElement.addEventListener('pointermove', this._onPointerMove);
    this.renderer.domElement.addEventListener('pointerup', this._onPointerUp);
    this.renderer.domElement.addEventListener('wheel', this._onWheel, {passive: false});
    window.addEventListener('resize', this._onResize);

    this.resize();
    this.last = performance.now();
    this.frame = this.frame.bind(this);
    this.raf = requestAnimationFrame(this.frame);
  }

  _partDefs() {
    if (typeof this.callbacks.getPartDefs === 'function') {
      return indexPartDefs(this.callbacks.getPartDefs());
    }
    if (typeof window !== 'undefined' && window.__gamePartDefs) {
      return indexPartDefs(window.__gamePartDefs);
    }
    return indexPartDefs([]);
  }

  setBlueprint(bp) {
    this.blueprint = bp ? structuredClone(bp) : null;
    this._rebuild();
  }

  setSelected(id) {
    this.selectedId = id || null;
    this._applySelection();
    this._rebuildMarkers();
    if (this.selectedId) this.focusSelection();
  }

  setPendingPart(partId) {
    this.pendingPartId = partId || null;
    this._rebuildMarkers();
  }

  setReduceMotion(on) {
    this.reduceMotion = !!on;
  }

  setMuted(muted) {
    this.sfx?.setMuted?.(!!muted);
  }

  setTheme(themeId) {
    this.themeId = normalizeThemeId(themeId);
    this._applyThemeVisuals();
    this._rebuild();
  }

  setQuality(level) {
    this.quality = level === 'low' ? 'low' : 'high';
    this.renderer.shadowMap.enabled = this.quality === 'high';
    if (this.sun) this.sun.castShadow = this.quality === 'high';
    this._applyThemeVisuals();
    this._rebuild();
  }

  _applyThemeVisuals() {
    const theme = themeForQuality(getTheme(this.themeId), this.quality);
    this.scene.background = new THREE.Color(theme.scene.background);
    // 装配预览始终关闭雾，保证机体可读
    this.scene.fog = null;
    if (this.hemi) {
      this.hemi.color.set(theme.lights.hemiSky);
      this.hemi.groundColor.set(theme.lights.hemiGround);
      this.hemi.intensity = Math.max(1.35, theme.lights.hemiIntensity);
    }
    if (this.sun) {
      this.sun.color.set(theme.lights.sunColor);
      this.sun.intensity = Math.max(2.0, theme.lights.sunIntensity);
    }
    if (this.fill) {
      this.fill.color.set(theme.lights.fillColor ?? 0xc8d8e0);
      this.fill.intensity = theme.lights.fillIntensity ?? 0.45;
    }
    if (this.ground?.material) {
      const g = theme.env.editorGround;
      this.ground.material.color.set(g.color);
      this.ground.material.roughness = g.roughness;
      this.ground.material.metalness = g.metalness ?? 0.15;
    }
    COLORS.marker = theme.markers.default;
    COLORS.markerOk = theme.markers.ok;
    COLORS.markerBad = theme.markers.bad;
  }

  playInstall() {
    this.sfx?.play?.('install');
  }

  focusSelection() {
    const mesh = this.selectedId ? this.meshes.get(this.selectedId) : null;
    if (!mesh) return;
    this._targetLook.copy(mesh.position);
    this._targetRadius = Math.min(0.9 * SCALE, Math.max(0.35 * SCALE, this._targetRadius * 0.85));
  }

  frameAll({snap = true} = {}) {
    if (!this.blueprint?.instances?.length) {
      this._targetLook.set(0, 0.4 * SCALE, 0);
      this._targetRadius = 0.55 * SCALE;
      this._targetElevation = 0.32 * SCALE;
      this._targetAngle = 0.85;
      if (snap) this._snapCameraToTargets();
      return;
    }
    this.root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    for (const mesh of this.meshes.values()) {
      box.expandByObject(mesh);
    }
    if (box.isEmpty()) {
      this._targetLook.set(0, 0.4 * SCALE, 0);
      this._targetRadius = 0.55 * SCALE;
      if (snap) this._snapCameraToTargets();
      return;
    }
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    // 长臂会把包围盒中心拽到夹爪附近 —— 看向核心/躯干，轮与肩才进画
    const rootId = this.blueprint.root_instance_id;
    const core = rootId ? this.meshes.get(rootId) : null;
    const isMecha = (this.blueprint.instances || []).some((i) =>
      ['mecha_head', 'armor_torso', 'mecha_leg'].includes(i.part_id),
    );
    const look = new THREE.Vector3();
    if (core) {
      look.set(
        core.position.x * 0.75 + center.x * 0.25,
        Math.max(core.position.y + (isMecha ? 0.08 * SCALE : 0), size.y * (isMecha ? 0.38 : 0.28)),
        core.position.z * 0.75 + center.z * 0.25,
      );
    } else {
      look.set(center.x, Math.max(0.2 * SCALE, size.y * 0.35), center.z * 0.4);
    }
    this._targetLook.copy(look);
    const corners = [
      new THREE.Vector3(box.min.x, box.min.y, box.min.z),
      new THREE.Vector3(box.min.x, box.min.y, box.max.z),
      new THREE.Vector3(box.min.x, box.max.y, box.min.z),
      new THREE.Vector3(box.min.x, box.max.y, box.max.z),
      new THREE.Vector3(box.max.x, box.min.y, box.min.z),
      new THREE.Vector3(box.max.x, box.min.y, box.max.z),
      new THREE.Vector3(box.max.x, box.max.y, box.min.z),
      new THREE.Vector3(box.max.x, box.max.y, box.max.z),
    ];
    let maxDist = 0;
    for (const c of corners) maxDist = Math.max(maxDist, c.distanceTo(look));
    // 机甲整机远景：必须看清头/肩/腿，禁止贴脸只剩一团方块
    if (isMecha) {
      this._targetRadius = Math.min(1.15 * SCALE, Math.max(0.55 * SCALE, maxDist * 1.55 + 0.15 * SCALE));
      this._targetElevation = Math.max(0.28 * SCALE, Math.min(0.55 * SCALE, size.y * 0.55 + 0.16 * SCALE));
      this._targetAngle = 0.85;
    } else {
      this._targetRadius = Math.min(0.95 * SCALE, Math.max(0.36 * SCALE, maxDist * 1.35 + 0.1 * SCALE));
      this._targetElevation = Math.max(
        0.22 * SCALE,
        Math.min(0.55 * SCALE, size.y * 0.55 + 0.14 * SCALE),
      );
      this._targetAngle = 0.95;
    }
    if (this.ground) {
      const padNeed = Math.max(
        isMecha ? 0.18 * SCALE : 0.14 * SCALE,
        Math.max(size.x, size.z) * (isMecha ? 0.48 : 0.55) + 0.08 * SCALE,
      );
      this.ground.scale.set(padNeed / (0.2 * SCALE), 1, padNeed / (0.2 * SCALE));
    }
    if (snap) this._snapCameraToTargets();
  }

  _snapCameraToTargets() {
    this.angle = this._targetAngle;
    this.orbitRadius = this._targetRadius;
    this.elevation = this._targetElevation;
    this.look.copy(this._targetLook);
  }

  setStandardView(name) {
    const v = standardViewOrbit(name);
    this._targetAngle = v.angle;
    this._targetElevation = Math.max(0.2 * SCALE, v.elevation * (SCALE / 4));
    this._targetRadius = Math.max(this._targetRadius, 0.55 * SCALE) * v.radiusScale;
    if (name === 'top') this._targetLook.y = Math.max(this._targetLook.y, 0.08 * SCALE);
  }

  viewBottom() {
    this._targetElevation = 0.18 * SCALE;
    this._targetAngle += 0.01;
    this._targetLook.y = Math.max(0.06 * SCALE, this._targetLook.y * 0.5);
  }

  _clearRoot() {
    while (this.root.children.length) {
      const child = this.root.children[0];
      this.root.remove(child);
      child.traverse?.((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
    }
    this.meshes.clear();
  }

  _rebuild() {
    this._clearRoot();
    this.clearPreview();
    if (!this.blueprint) {
      this._rebuildMarkers();
      return;
    }
    const defs = this._partDefs();
    const poses = worldPosesFromBlueprint(this.blueprint, defs);
    for (const inst of this.blueprint.instances || []) {
      const size = sizeFor(inst, defs);
      const pose = poses[inst.instance_id] || zeroPose();
      const visual = createPartVisual(inst.part_id, size, {themeId: this.themeId});
      placePartVisual(visual, pose, SCALE, size[1]);
      visual.userData.instanceId = inst.instance_id;
      visual.userData.partId = inst.part_id;
      visual.userData.size = size;
      // 可点击代理：整组射线检测
      visual.traverse((o) => {
        if (o.isMesh) {
          o.userData.instanceId = inst.instance_id;
          o.userData.partId = inst.part_id;
        }
      });
      this.root.add(visual);
      this.meshes.set(inst.instance_id, visual);
    }
    this._applySelection();
    this._rebuildMarkers();
    this.frameAll();
  }

  _applySelection() {
    for (const [id, mesh] of this.meshes) {
      const selected = id === this.selectedId;
      const partId = mesh.userData.partId;
      const base = materialForPart(partId, this.themeId);
      mesh.traverse((o) => {
        if (!o.isMesh || !o.material?.color) return;
        if (selected && o.material.emissive) {
          o.material.emissive.set(0x664400);
          o.material.emissiveIntensity = 0.28;
        } else if (o.material.emissive) {
          o.material.emissive.set(base.emissive || 0x000000);
          o.material.emissiveIntensity = base.emissiveIntensity || 0;
        }
      });
    }
  }

  clearPreview() {
    while (this.previewRoot.children.length) {
      const c = this.previewRoot.children[0];
      this.previewRoot.remove(c);
      c.traverse?.((o) => {
        o.geometry?.dispose?.();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
      });
    }
    this.previewRoot.visible = false;
    this._hoveredPoint = null;
  }

  /**
   * 在连接点显示半透明预览；碰撞时标红。
   * @returns {{ok:boolean, reason:string}}
   */
  showAttachPreview(parentInstanceId, pointId, childPartId) {
    this.clearPreview();
    if (!this.blueprint || !childPartId) return {ok: false, reason: '无预览'};
    const defs = this._partDefs();
    const poses = worldPosesFromBlueprint(this.blueprint, defs);
    const parentPose = poses[parentInstanceId] || zeroPose();
    const parentInst = this.blueprint.instances.find((i) => i.instance_id === parentInstanceId);
    const parentDef = defs.get(parentInst?.part_id);
    const points = pointsForInstance(
      parentInst?.part_id,
      parentDef?.connection_points,
      parentInst?.params,
      parentDef?.size_m || PART_SIZES[parentInst?.part_id],
    );
    const point = points.find((p) => p.id === pointId);
    if (!point) return {ok: false, reason: '连接点不存在'};
    const childDef = defs.get(childPartId);
    const childSize = childDef?.size_m || PART_SIZES[childPartId] || [0.05, 0.05, 0.05];
    const preview = previewPoseAtPoint(parentPose, point.pose, childSize);
    const sizeById = new Map();
    for (const inst of this.blueprint.instances) {
      sizeById.set(inst.instance_id, sizeFor(inst, defs));
    }
    const collision = checkAttachCollision(
      this.blueprint,
      poses,
      sizeById,
      {x: preview.x, y: preview.y, z: preview.z},
      childSize,
    );
    const visual = createPartVisual(childPartId, childSize, {themeId: this.themeId});
    placePartVisual(visual, preview, SCALE, childSize[1]);
    visual.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      o.material = o.material.clone();
      o.material.transparent = true;
      o.material.opacity = 0.45;
      o.material.depthWrite = false;
      if (!collision.ok) o.material.color.set(0xb07060);
      else o.material.color.set(0x4caf7a);
    });
    this.previewRoot.add(visual);
    this.previewRoot.visible = true;
    this._hoveredPoint = {parentInstanceId, pointId, childPartId, collision};
    return collision;
  }

  flashInstall(instanceId) {
    const mesh = this.meshes.get(instanceId);
    if (!mesh) return;
    this._flashUntil = performance.now() + 420;
    mesh.traverse((o) => {
      if (o.isMesh && o.material?.emissive) {
        o.material.emissive.set(0x88ffaa);
        o.material.emissiveIntensity = 0.55;
      }
    });
  }

  /**
   * 供外部在确认连接前做碰撞检查。
   */
  validateAttach(parentInstanceId, pointId, childPartId) {
    return this.showAttachPreview(parentInstanceId, pointId, childPartId);
  }

  _rebuildMarkers() {
    while (this.markers.children.length) {
      const m = this.markers.children[0];
      this.markers.remove(m);
      m.geometry?.dispose();
      m.material?.dispose();
    }
    if (!this.blueprint || !this.selectedId) return;
    const defs = this._partDefs();
    const inst = (this.blueprint.instances || []).find((i) => i.instance_id === this.selectedId);
    const mesh = this.meshes.get(this.selectedId);
    if (!inst || !mesh) return;
    const def = defs.get(inst.part_id);
    const points = pointsForInstance(
      inst.part_id,
      def?.connection_points,
      inst.params,
      def?.size_m || PART_SIZES[inst.part_id],
    );

    let compatibleIds = null;
    const reasonById = new Map();
    if (this.pendingPartId) {
      const {compatible, incompatible} = classifyParentPoints(
        this.blueprint,
        this.selectedId,
        this.pendingPartId,
        defs,
      );
      compatibleIds = new Set(compatible.map((c) => c.pointId));
      for (const row of incompatible) reasonById.set(row.pointId, row.reason);
    }

    for (const point of points) {
      let color = COLORS.marker;
      let compatible = true;
      let reason = '';
      if (compatibleIds) {
        compatible = compatibleIds.has(point.id);
        color = compatible ? COLORS.markerOk : COLORS.markerBad;
        reason = reasonById.get(point.id) || '';
        if (!compatible) {
          // 仍显示，半透明，便于解释失败
        }
      }
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(compatibleIds && compatible ? 0.032 * SCALE : 0.022 * SCALE, 12, 10),
        new THREE.MeshBasicMaterial({
          color,
          transparent: !compatible && !!compatibleIds,
          opacity: !compatible && !!compatibleIds ? 0.45 : 1,
        }),
      );
      const pose = {...zeroPose(), ...point.pose};
      marker.position.set(
        mesh.position.x + pose.x * SCALE,
        mesh.position.y + pose.y * SCALE,
        mesh.position.z + pose.z * SCALE,
      );
      marker.userData.instanceId = this.selectedId;
      marker.userData.pointId = point.id;
      marker.userData.isPoint = true;
      marker.userData.compatible = compatible;
      marker.userData.reason = reason;
      this.markers.add(marker);
    }
  }

  _pick(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(
      [...this.markers.children, ...this.root.children],
      true,
    );
    if (!hits.length) {
      this.clearPreview();
      this.callbacks.onSelect?.(null);
      return;
    }
    let hit = hits[0].object;
    while (hit && !hit.userData?.isPoint && !hit.userData?.instanceId) hit = hit.parent;
    if (!hit) return;
    if (hit.userData.isPoint) {
      if (this.pendingPartId) {
        const collision = this.showAttachPreview(
          hit.userData.instanceId,
          hit.userData.pointId,
          this.pendingPartId,
        );
        this.callbacks.onPickPoint?.(hit.userData.instanceId, hit.userData.pointId, {
          compatible: hit.userData.compatible !== false && collision.ok,
          reason: !collision.ok ? collision.reason : hit.userData.reason || '',
          collisionOk: collision.ok,
        });
      } else {
        this.callbacks.onPickPoint?.(hit.userData.instanceId, hit.userData.pointId, {
          compatible: hit.userData.compatible !== false,
          reason: hit.userData.reason || '',
        });
      }
      return;
    }
    if (hit.userData.instanceId) {
      this.clearPreview();
      this.callbacks.onSelect?.(hit.userData.instanceId);
    }
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth || this.container.offsetWidth || 1);
    const h = Math.max(1, this.container.clientHeight || this.container.offsetHeight || 1);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this._bloom?.composer?.setSize(w, h);
  }

  frame(now) {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    if (document.hidden) return;
    const dt = Math.min(0.05, ((now - this.last) || 16) / 1000);
    const lambda = this.reduceMotion ? 3 : 12;
    this.angle = damp(this.angle, this._targetAngle, lambda, dt);
    this.orbitRadius = damp(this.orbitRadius, this._targetRadius, lambda, dt);
    this.elevation = damp(this.elevation, this._targetElevation, lambda, dt);
    this.look.x = damp(this.look.x, this._targetLook.x, lambda, dt);
    this.look.y = damp(this.look.y, this._targetLook.y, lambda, dt);
    this.look.z = damp(this.look.z, this._targetLook.z, lambda, dt);
    this.camera.position.set(
      this.look.x + Math.sin(this.angle) * this.orbitRadius,
      this.look.y + this.elevation,
      this.look.z + Math.cos(this.angle) * this.orbitRadius,
    );
    this.camera.lookAt(this.look);
    if (this._flashUntil && now > this._flashUntil) {
      this._flashUntil = 0;
      this._applySelection();
    }
    if (this.quality === 'high' && this._bloom?.composer) {
      this._bloom.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    this.last = now;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.renderer.domElement.removeEventListener('pointerdown', this._onPointerDown);
    this.renderer.domElement.removeEventListener('pointermove', this._onPointerMove);
    this.renderer.domElement.removeEventListener('pointerup', this._onPointerUp);
    this.renderer.domElement.removeEventListener('wheel', this._onWheel);
    window.removeEventListener('resize', this._onResize);
    this._clearRoot();
    while (this.markers.children.length) {
      const m = this.markers.children[0];
      this.markers.remove(m);
      m.geometry?.dispose();
      m.material?.dispose();
    }
    this.renderer.dispose();
    this._envMap?.dispose?.();
    this._bloom?.composer?.dispose?.();
    this.renderer.domElement.remove();
  }
}

/**
 * @param {HTMLElement} container
 * @param {object} [callbacks]
 */
export function createBlueprintEditorScene(container, callbacks) {
  return new BlueprintEditorScene(container, callbacks);
}
