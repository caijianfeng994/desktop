/**
 * 蓝图三维建造场景：按实例生成盒体，高亮选中与连接点。
 */
import * as THREE from 'three';
import {classifyParentPoints} from '../editor/compatible.mjs';
import {pointsForInstance, sizeFromParams} from '../editor/params.mjs';
import {worldPosesFromBlueprint as posesFromSim} from '../simulation/pose.mjs';

/** 与 Python PART_DEFINITIONS 对齐的 fallback 尺寸（米） */
export const PART_SIZES = Object.freeze({
  core: [0.08, 0.08, 0.08],
  wheel: [0.02, 0.06, 0.06],
  plate: [0.12, 0.02, 0.12],
  beam: [0.02, 0.02, 0.12],
  post: [0.03, 0.12, 0.03],
  revolute_joint: [0.04, 0.04, 0.04],
  gripper: [0.04, 0.04, 0.06],
  pusher: [0.08, 0.04, 0.02],
  hook: [0.03, 0.06, 0.04],
  battery: [0.05, 0.04, 0.08],
  camera: [0.04, 0.03, 0.04],
  display: [0.06, 0.04, 0.02],
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

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLORS.ground);
    this.renderer = new THREE.WebGLRenderer({antialias: true, alpha: false});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.append(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
    this.camera.position.set(1.6, 1.4, 2.2);
    this.look = new THREE.Vector3(0, 0.2, 0);

    this.scene.add(new THREE.HemisphereLight(0xfff7e5, 0x8c8977, 1.8));
    const sun = new THREE.DirectionalLight(0xffe2ab, 2.4);
    sun.position.set(-2, 4, 3);
    this.scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(2.4, 48),
      new THREE.MeshStandardMaterial({color: 0xd9cbb2, roughness: 0.9}),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.scene.add(this.markers);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.dragging = false;
    this.angle = 0.4;
    this.orbitRadius = 2.6;

    this._onPointerDown = (e) => {
      this.dragging = true;
      this.startX = e.clientX;
      this.moved = false;
      this.renderer.domElement.setPointerCapture(e.pointerId);
    };
    this._onPointerMove = (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.startX;
      if (Math.abs(dx) > 2) this.moved = true;
      this.angle += dx * 0.008;
      this.startX = e.clientX;
    };
    this._onPointerUp = (e) => {
      if (!this.moved) this._pick(e);
      this.dragging = false;
    };
    this._onResize = () => this.resize();

    this.renderer.domElement.addEventListener('pointerdown', this._onPointerDown);
    this.renderer.domElement.addEventListener('pointermove', this._onPointerMove);
    this.renderer.domElement.addEventListener('pointerup', this._onPointerUp);
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
  }

  setPendingPart(partId) {
    this.pendingPartId = partId || null;
    this._rebuildMarkers();
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
    if (!this.blueprint) {
      this._rebuildMarkers();
      return;
    }
    const defs = this._partDefs();
    const poses = worldPosesFromBlueprint(this.blueprint, defs);
    for (const inst of this.blueprint.instances || []) {
      const size = sizeFor(inst, defs);
      const pose = poses[inst.instance_id] || zeroPose();
      const color = inst.part_id === 'core' ? COLORS.core : COLORS.default;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(size[0] * SCALE, size[1] * SCALE, size[2] * SCALE),
        new THREE.MeshStandardMaterial({color, roughness: 0.55}),
      );
      mesh.position.set(pose.x * SCALE, pose.y * SCALE + (size[1] * SCALE) / 2, pose.z * SCALE);
      mesh.rotation.y = pose.ry || 0;
      mesh.castShadow = true;
      mesh.userData.instanceId = inst.instance_id;
      mesh.userData.partId = inst.part_id;
      this.root.add(mesh);
      this.meshes.set(inst.instance_id, mesh);
    }
    this._applySelection();
    this._rebuildMarkers();
  }

  _applySelection() {
    for (const [id, mesh] of this.meshes) {
      const base = mesh.userData.partId === 'core' ? COLORS.core : COLORS.default;
      mesh.material.color.set(id === this.selectedId ? COLORS.selected : base);
      mesh.material.emissive?.set?.(id === this.selectedId ? 0x664400 : 0x000000);
      if (mesh.material.emissiveIntensity != null) {
        mesh.material.emissiveIntensity = id === this.selectedId ? 0.25 : 0;
      }
    }
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
        new THREE.SphereGeometry(compatibleIds && compatible ? 0.032 : 0.022, 12, 10),
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
    const hits = this.raycaster.intersectObjects([...this.markers.children, ...this.root.children], false);
    if (!hits.length) {
      this.callbacks.onSelect?.(null);
      return;
    }
    const hit = hits[0].object;
    if (hit.userData.isPoint) {
      this.callbacks.onPickPoint?.(hit.userData.instanceId, hit.userData.pointId, {
        compatible: hit.userData.compatible !== false,
        reason: hit.userData.reason || '',
      });
      return;
    }
    if (hit.userData.instanceId) {
      this.callbacks.onSelect?.(hit.userData.instanceId);
    }
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth || this.container.offsetWidth || 1);
    const h = Math.max(1, this.container.clientHeight || this.container.offsetHeight || 1);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  frame(now) {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    if (document.hidden) return;
    this.camera.position.set(
      Math.sin(this.angle) * this.orbitRadius,
      1.2,
      Math.cos(this.angle) * this.orbitRadius,
    );
    this.camera.lookAt(this.look);
    this.renderer.render(this.scene, this.camera);
    this.last = now;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.renderer.domElement.removeEventListener('pointerdown', this._onPointerDown);
    this.renderer.domElement.removeEventListener('pointermove', this._onPointerMove);
    this.renderer.domElement.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('resize', this._onResize);
    this._clearRoot();
    while (this.markers.children.length) {
      const m = this.markers.children[0];
      this.markers.remove(m);
      m.geometry?.dispose();
      m.material?.dispose();
    }
    this.renderer.dispose();
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
