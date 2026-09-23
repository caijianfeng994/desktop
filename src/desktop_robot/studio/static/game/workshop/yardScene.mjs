/**
 * 试验场 Three.js 场景：地面、门柱、坡道、方块与蓝图盒体机器人。
 * requestAnimationFrame → stepDrive；暴露 reset / upright。
 */
import * as THREE from 'three';
import {buildSimFromBlueprint} from '../simulation/body.mjs';
import {stepDrive} from '../simulation/drive.mjs';
import {checkTip} from '../simulation/tip.mjs';
import {DRAWER_BLOCK_ID, createYardWorld} from '../simulation/world.mjs';
import {tryDrag, tryGrasp, tryPush} from '../simulation/grasp.mjs';
import {PART_SIZES, worldPosesFromBlueprint} from './editorScene.mjs';

const SCALE = 12;
const ARENA_M = 2.4;
const COLORS = {
  ground: 0xd4c4a8,
  wall: 0xb8a888,
  door: 0x6a8f88,
  ramp: 0xc4a574,
  block: 0xd9893a,
  drawer: 0x8a7460,
  receive: 0x5a9e8a,
  robot: 0xc9b896,
  core: 0x477e7c,
};

function indexPartDefs(partDefs) {
  if (partDefs instanceof Map) return partDefs;
  const map = new Map();
  for (const d of partDefs || []) {
    if (d?.id) map.set(d.id, d);
  }
  return map;
}

function sizeFor(partId, defs) {
  const d = defs.get(partId);
  if (d?.size_m?.length >= 3) return d.size_m;
  return PART_SIZES[partId] || [0.05, 0.05, 0.05];
}

function toolLink(sim) {
  const TOOL = new Set(['grasp', 'drag', 'push']);
  for (const link of sim?.links || []) {
    const behaviors = link.behaviors || [];
    if (behaviors.some((b) => TOOL.has(b))) return link;
  }
  return null;
}

/**
 * @param {HTMLElement} container
 * @param {{
 *   onTip?: (reason: string) => void,
 *   onGrasp?: (result: {success:boolean, reason:string}) => void,
 *   onChallengeReady?: (payload: {block_id:string, region:string, speed:number}) => void,
 *   getPartDefs?: () => object[],
 * }} [callbacks]
 */
export class YardScene {
  constructor(container, callbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.disposed = false;
    this.world = createYardWorld();
    this.blueprint = null;
    this.sim = null;
    this.partDefs = [];
    this.jointAngles = {};
    this.heldBlockId = null;
    this.input = {forward: 0, turn: 0};
    this.tipped = false;
    this._prevBlockPos = null;
    this._blockSpeed = 0;
    this._challengeReadySent = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xe8dac4);
    this.renderer = new THREE.WebGLRenderer({antialias: true});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.append(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.05, 200);
    this.orbitAngle = 0.55;
    this.orbitRadius = 4.2;
    this.look = new THREE.Vector3(0, 0.4, 0);

    this.scene.add(new THREE.HemisphereLight(0xfff7e5, 0x8c8977, 1.6));
    const sun = new THREE.DirectionalLight(0xffe2ab, 2.2);
    sun.position.set(-3, 6, 2);
    this.scene.add(sun);

    this.env = new THREE.Group();
    this.scene.add(this.env);
    this.robotRoot = new THREE.Group();
    this.scene.add(this.robotRoot);
    this.blockMeshes = new Map();
    this.partMeshes = new Map();

    this._buildEnvironment();
    this.drive = {
      x: this.world.spawn.x,
      z: this.world.spawn.z,
      yaw: this.world.spawn.yaw,
      speed: 0.7,
      turnSpeed: 2.4,
      width: 0.2,
      walls: this.world.walls,
    };

    this.dragging = false;
    this._onPointerDown = (e) => {
      this.dragging = true;
      this.startX = e.clientX;
      this.renderer.domElement.setPointerCapture(e.pointerId);
    };
    this._onPointerMove = (e) => {
      if (!this.dragging) return;
      this.orbitAngle += (e.clientX - this.startX) * 0.008;
      this.startX = e.clientX;
    };
    this._onPointerUp = () => {
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

  _buildEnvironment() {
    while (this.env.children.length) {
      const c = this.env.children[0];
      this.env.remove(c);
      c.traverse?.((o) => {
        o.geometry?.dispose();
        o.material?.dispose?.();
      });
    }
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(ARENA_M * 2 * SCALE, ARENA_M * 2 * SCALE),
      new THREE.MeshStandardMaterial({color: COLORS.ground, roughness: 0.92}),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.env.add(ground);

    for (const w of this.world.walls) {
      const sx = (w.maxX - w.minX) * SCALE;
      const sz = (w.maxZ - w.minZ) * SCALE;
      const isDoor =
        Math.abs((w.minZ + w.maxZ) / 2 - this.world.narrowDoor.z) < 0.05 &&
        (w.maxX - w.minX) > 0.2;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(sx, 0.05), 0.35 * SCALE, Math.max(sz, 0.05)),
        new THREE.MeshStandardMaterial({
          color: isDoor ? COLORS.door : COLORS.wall,
          roughness: 0.75,
        }),
      );
      mesh.position.set(
        ((w.minX + w.maxX) / 2) * SCALE,
        (0.35 * SCALE) / 2,
        ((w.minZ + w.maxZ) / 2) * SCALE,
      );
      this.env.add(mesh);
    }

    const r = this.world.ramp;
    const ramp = new THREE.Mesh(
      new THREE.BoxGeometry(
        (r.maxX - r.minX) * SCALE,
        (r.maxY - r.minY) * SCALE,
        (r.maxZ - r.minZ) * SCALE,
      ),
      new THREE.MeshStandardMaterial({color: COLORS.ramp, roughness: 0.8}),
    );
    ramp.position.set(
      ((r.minX + r.maxX) / 2) * SCALE,
      ((r.minY + r.maxY) / 2) * SCALE,
      ((r.minZ + r.maxZ) / 2) * SCALE,
    );
    this.env.add(ramp);

    const d = this.world.drawerSlot;
    const drawer = new THREE.Mesh(
      new THREE.BoxGeometry(
        (d.maxX - d.minX) * SCALE,
        Math.max(0.04, (d.maxY - d.minY) * SCALE),
        (d.maxZ - d.minZ) * SCALE,
      ),
      new THREE.MeshStandardMaterial({
        color: COLORS.drawer,
        roughness: 0.85,
        transparent: true,
        opacity: 0.55,
      }),
    );
    drawer.position.set(
      ((d.minX + d.maxX) / 2) * SCALE,
      ((d.minY + d.maxY) / 2) * SCALE,
      ((d.minZ + d.maxZ) / 2) * SCALE,
    );
    this.env.add(drawer);

    const rz = this.world.receiveZone;
    const receive = new THREE.Mesh(
      new THREE.BoxGeometry(
        (rz.maxX - rz.minX) * SCALE,
        0.02 * SCALE,
        (rz.maxZ - rz.minZ) * SCALE,
      ),
      new THREE.MeshStandardMaterial({
        color: COLORS.receive,
        roughness: 0.7,
        transparent: true,
        opacity: 0.45,
      }),
    );
    receive.position.set(
      ((rz.minX + rz.maxX) / 2) * SCALE,
      0.01 * SCALE,
      ((rz.minZ + rz.maxZ) / 2) * SCALE,
    );
    this.env.add(receive);

    this._syncBlocks();
  }

  _syncBlocks() {
    for (const [id, mesh] of this.blockMeshes) {
      if (!this.world.blocks.some((b) => b.id === id)) {
        this.env.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
        this.blockMeshes.delete(id);
      }
    }
    for (const b of this.world.blocks) {
      let mesh = this.blockMeshes.get(b.id);
      const [sx, sy, sz] = b.size || [0.08, 0.08, 0.08];
      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(sx * SCALE, sy * SCALE, sz * SCALE),
          new THREE.MeshStandardMaterial({color: COLORS.block, roughness: 0.55}),
        );
        this.env.add(mesh);
        this.blockMeshes.set(b.id, mesh);
      }
      mesh.position.set(b.x * SCALE, (b.y + sy / 2) * SCALE, b.z * SCALE);
      mesh.visible = this.heldBlockId !== b.id;
    }
  }

  setBlueprint(bp, partDefs) {
    this.blueprint = bp ? structuredClone(bp) : null;
    this.partDefs = partDefs || this.callbacks.getPartDefs?.() || [];
    const defs = indexPartDefs(this.partDefs);
    this.sim = this.blueprint ? buildSimFromBlueprint(this.blueprint, defs) : null;
    this.drive.width = Math.max(0.08, this.sim?.width || 0.2);
    this.jointAngles = {};
    this.heldBlockId = null;
    this._rebuildRobot();
  }

  setInput(forward, turn) {
    this.input.forward = forward;
    this.input.turn = turn;
  }

  setJointDelta(delta) {
    const links = (this.sim?.links || []).filter((l) => l.joint?.type === 'revolute');
    if (!links.length) return;
    const id = links[0].id;
    const lim = links[0].joint.limits || {min: -Math.PI / 2, max: Math.PI / 2};
    const cur = this.jointAngles[id] || 0;
    this.jointAngles[id] = Math.min(lim.max, Math.max(lim.min, cur + delta));
    this._rebuildRobot();
  }

  _toolWorld() {
    if (!this.sim || !this.blueprint) return null;
    const defs = indexPartDefs(this.partDefs);
    const poses = worldPosesFromBlueprint(this.blueprint, defs);
    const tool = toolLink(this.sim);
    if (!tool) return null;
    const local = poses[tool.id] || {x: 0, y: 0, z: 0};
    const yaw = this.drive.yaw;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const lx = local.x;
    const lz = local.z;
    return {
      x: this.drive.x + lx * cos + lz * sin,
      y: local.y,
      z: this.drive.z - lx * sin + lz * cos,
      yaw,
    };
  }

  _targetBlock() {
    if (this.world.challengeMode) {
      return this.world.blocks.find((b) => b.id === DRAWER_BLOCK_ID) || this.world.blocks[0];
    }
    return this.world.blocks[0];
  }

  tryInteract() {
    const block = this._targetBlock();
    if (!block) return {success: false, reason: '场上没有方块'};
    if (this.heldBlockId) {
      const held = this.world.blocks.find((b) => b.id === this.heldBlockId) || block;
      const tool = this._toolWorld() || {x: this.drive.x, y: 0.1, z: this.drive.z, yaw: this.drive.yaw};
      held.x = tool.x;
      held.y = 0.04;
      held.z = tool.z;
      this.heldBlockId = null;
      this._syncBlocks();
      return {success: true, reason: '已放下方块'};
    }
    const tool = this._toolWorld();
    if (!tool) return {success: false, reason: '蓝图上没有夹爪/推板/钩子'};
    const toolBehaviors = new Set(toolLink(this.sim)?.behaviors || []);
    let result;
    if (toolBehaviors.has('grasp')) {
      result = tryGrasp(this.sim, this.drive, tool, block);
    } else if (toolBehaviors.has('push')) {
      result = tryPush(this.sim, this.drive, tool, block);
      if (result.success) {
        block.x += result.dx || 0;
        block.z += result.dz || 0;
        this._syncBlocks();
      }
      this.callbacks.onGrasp?.(result);
      return result;
    } else if (toolBehaviors.has('drag')) {
      result = tryDrag(this.sim, this.drive, tool, block);
    } else {
      result = tryGrasp(this.sim, this.drive, tool, block);
    }
    if (result.success && (toolBehaviors.has('grasp') || toolBehaviors.has('drag') || !toolBehaviors.size)) {
      this.heldBlockId = block.id;
      this._syncBlocks();
    }
    this.callbacks.onGrasp?.(result);
    return result;
  }

  setChallengeMode(on) {
    this.world.setChallengeMode(!!on);
    this.heldBlockId = null;
    this._prevBlockPos = null;
    this._blockSpeed = 0;
    this._challengeReadySent = false;
    this._syncBlocks();
  }

  /** 当前目标方块速度与是否在接收区（供提交按钮使用） */
  challengeStatus() {
    const block = this.world.blocks.find((b) => b.id === DRAWER_BLOCK_ID);
    if (!block) return null;
    return {
      block_id: block.id,
      region: this.world.blockInReceive(block) ? 'receive' : 'other',
      speed: this._blockSpeed,
    };
  }

  reset() {
    this.world.reset();
    this.drive.x = this.world.spawn.x;
    this.drive.z = this.world.spawn.z;
    this.drive.yaw = this.world.spawn.yaw;
    this.heldBlockId = null;
    this.tipped = false;
    this.jointAngles = {};
    this._prevBlockPos = null;
    this._blockSpeed = 0;
    this._challengeReadySent = false;
    this._syncBlocks();
    this._rebuildRobot();
  }

  upright() {
    this.tipped = false;
    this.drive.yaw = this.world.spawn.yaw;
    this.robotRoot.rotation.z = 0;
    this.robotRoot.rotation.x = 0;
  }

  _clearRobot() {
    while (this.robotRoot.children.length) {
      const c = this.robotRoot.children[0];
      this.robotRoot.remove(c);
      c.traverse?.((o) => {
        o.geometry?.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
      });
    }
    this.partMeshes.clear();
  }

  _rebuildRobot() {
    this._clearRobot();
    if (!this.blueprint) return;
    const defs = indexPartDefs(this.partDefs);
    const poses = worldPosesFromBlueprint(this.blueprint, defs);
    for (const inst of this.blueprint.instances || []) {
      const size = sizeFor(inst.part_id, defs);
      const pose = poses[inst.instance_id] || {x: 0, y: 0, z: 0};
      let ry = pose.ry || 0;
      if (this.jointAngles[inst.instance_id] != null) {
        ry += this.jointAngles[inst.instance_id];
      }
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(size[0] * SCALE, size[1] * SCALE, size[2] * SCALE),
        new THREE.MeshStandardMaterial({
          color: inst.part_id === 'core' ? COLORS.core : COLORS.robot,
          roughness: 0.55,
        }),
      );
      mesh.position.set(pose.x * SCALE, pose.y * SCALE + (size[1] * SCALE) / 2, pose.z * SCALE);
      mesh.rotation.y = ry;
      this.robotRoot.add(mesh);
      this.partMeshes.set(inst.instance_id, mesh);
    }
  }

  _updateHeld() {
    if (!this.heldBlockId) return;
    const block = this.world.blocks.find((b) => b.id === this.heldBlockId);
    if (!block) return;
    const tool = this._toolWorld() || {x: this.drive.x, y: 0.12, z: this.drive.z};
    block.x = tool.x;
    block.y = Math.max(0.04, tool.y);
    block.z = tool.z;
  }

  _trackChallenge(dt) {
    if (!this.world.challengeMode) return;
    const block = this.world.blocks.find((b) => b.id === DRAWER_BLOCK_ID);
    if (!block) return;
    if (this._prevBlockPos) {
      const dx = block.x - this._prevBlockPos.x;
      const dy = block.y - this._prevBlockPos.y;
      const dz = block.z - this._prevBlockPos.z;
      const dist = Math.hypot(dx, dy, dz);
      this._blockSpeed = dt > 1e-6 ? dist / dt : 0;
    } else {
      this._blockSpeed = 0;
    }
    this._prevBlockPos = {x: block.x, y: block.y, z: block.z};
    if (this.heldBlockId === block.id) return;
    if (
      !this._challengeReadySent &&
      this.world.blockInReceive(block) &&
      this._blockSpeed <= 0.05
    ) {
      this._challengeReadySent = true;
      this.callbacks.onChallengeReady?.({
        block_id: block.id,
        region: 'receive',
        speed: this._blockSpeed,
      });
    }
  }

  _checkTip() {
    if (!this.sim || this.tipped) return;
    const held = this.heldBlockId
      ? this.world.blocks.find((b) => b.id === this.heldBlockId)
      : null;
    const tip = checkTip({
      com: this.sim.com,
      mass: this.sim.mass,
      width: this.sim.width,
      heldMass: held?.mass || 0,
      heldOffset: held ? {x: held.x - this.drive.x, z: held.z - this.drive.z} : {x: 0, z: 0},
    });
    if (tip.tipped) {
      this.tipped = true;
      this.robotRoot.rotation.z = 0.55;
      this.callbacks.onTip?.(tip.reason);
    }
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth || 1);
    const h = Math.max(1, this.container.clientHeight || 1);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  frame(now) {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    if (document.hidden) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.tipped) {
      stepDrive(this.drive, this.input, dt);
      this._updateHeld();
      this._trackChallenge(dt);
      this._checkTip();
    }
    this.robotRoot.position.set(this.drive.x * SCALE, 0, this.drive.z * SCALE);
    this.robotRoot.rotation.y = this.drive.yaw;
    this.look.set(this.drive.x * SCALE, 0.35 * SCALE, this.drive.z * SCALE);
    this.camera.position.set(
      this.look.x + Math.sin(this.orbitAngle) * this.orbitRadius * SCALE * 0.35,
      1.6 * SCALE * 0.45,
      this.look.z + Math.cos(this.orbitAngle) * this.orbitRadius * SCALE * 0.35,
    );
    this.camera.lookAt(this.look);
    this._syncBlocks();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.renderer.domElement.removeEventListener('pointerdown', this._onPointerDown);
    this.renderer.domElement.removeEventListener('pointermove', this._onPointerMove);
    this.renderer.domElement.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('resize', this._onResize);
    this._clearRobot();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

/**
 * @param {HTMLElement} container
 * @param {object} [callbacks]
 */
export function createYardScene(container, callbacks) {
  return new YardScene(container, callbacks);
}
