/**
 * 试验场 Three.js 场景：地面、门柱、坡道、方块与蓝图盒体机器人。
 * requestAnimationFrame → stepDrive；暴露 reset / upright。
 */
import * as THREE from 'three';
import {buildEnvironment, createBloomComposer} from '../renderFx.mjs';
import {buildSimFromBlueprint, toolLink} from '../simulation/body.mjs';
import {stepDrive} from '../simulation/drive.mjs';
import {checkTip} from '../simulation/tip.mjs';
import {
  BOOKSHELF_BLOCK_ID,
  DESK_GAP_BLOCK_ID,
  DRAWER_BLOCK_ID,
  createYardWorld,
} from '../simulation/world.mjs';
import {createCombatState, stepProjectiles, tryFire} from '../simulation/combat.mjs';
import {applyEnemyHit, createEnemy, stepEnemy} from '../simulation/enemies.mjs';
import {createWinchState, releaseWinch, stepWinch, tryCastWinch} from '../simulation/winch.mjs';
import {createThrustState, refillThrust, stepThrust} from '../simulation/thrust.mjs';
import {tryDrag, tryPush} from '../simulation/grasp.mjs';
import {heightAt, tipFactorAt, settleBlockY} from '../simulation/terrain.mjs';
import {worldPosesWithJoints} from '../simulation/pose.mjs';
import {applyBoundAxis, diagnoseControls} from '../editor/bindings.mjs';
import {PART_SIZES} from './editorScene.mjs';
import {createSfx} from './sfx.mjs';
import {createPartVisual, placePartVisual} from './partVisuals.mjs';
import {
  startGraspSequence,
  startReleaseSequence,
  stepGraspSequence,
} from '../simulation/graspSequence.mjs';
import {liveStructureHint} from '../simulation/structureContrast.mjs';
import {
  clipCameraAgainstWalls,
  damp,
  dampAngle,
  frameRadiusFromBounds,
  standardViewOrbit,
} from './cameraRig.mjs';
import {getTheme, normalizeThemeId, themeForQuality} from './visualTheme.mjs';

const SCALE = 12;
const ARENA_M = 2.4;

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
    this.jointSlides = {};
    this.gripperOpen = 1;
    this.heldBlockId = null;
    this.input = {forward: 0, turn: 0};
    this.tipped = false;
    this._prevBlockPos = null;
    this._blockSpeed = 0;
    this._challengeReadySent = false;
    this._fallCooldown = 0;
    this.cameraMode = 'follow'; // follow | cockpit | orbit | tool
    this.aimPitch = 0;
    this.reduceMotion = false;
    this._wheelSpin = 0;
    this.sfx = createSfx({muted: false});
    this._camAngle = 0.55;
    this._camRadius = 4.2;
    this._camHeight = 1.6 * SCALE * 0.45;
    this.graspSeq = {phase: 'idle', t: 0, autoAssist: true};
    this._liftOffset = 0;
    this.debugOverlay = false;
    this._wallBoxes = [];
    this._raycaster = new THREE.Raycaster();
    this._camClip = new THREE.Vector3();
    this.fps = 0;
    this._fpsAcc = 0;
    this._fpsFrames = 0;
    this.themeId = 'kit';
    this.quality = 'high';
    this.combat = null;
    this.winch = null;
    this.thrust = null;
    this.enemies = [];
    this.enemyMeshes = new Map();
    this.projectileMeshes = new Map();
    this.playerHp = 100;
    this.maxPlayerHp = 100;
    this._nowSec = 0;
    this._enemyShots = [];
    this.inputExtras = {fire: 0, thrust: 0, winch: 0};

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xe8dac4);
    this.renderer = new THREE.WebGLRenderer({antialias: true});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.append(this.renderer.domElement);

    this._envMap = buildEnvironment(this.renderer);
    if (this._envMap) this.scene.environment = this._envMap;

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.05, 200);
    this.orbitAngle = 0.55;
    this.orbitRadius = 4.2;
    this.look = new THREE.Vector3(0, 0.4, 0);

    this._bloom = createBloomComposer(this.renderer, this.scene, this.camera, {
      strength: 0.42,
      radius: 0.55,
      threshold: 0.82,
    });

    this.hemi = new THREE.HemisphereLight(0xfff7e5, 0x8c8977, 1.35);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xffe2ab, 2.0);
    sun.position.set(-4, 8, 3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 40;
    sun.shadow.camera.left = -18;
    sun.shadow.camera.right = 18;
    sun.shadow.camera.top = 18;
    sun.shadow.camera.bottom = -18;
    this.scene.add(sun);
    this.sun = sun;

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
      forwardSpeed: 0,
      baseMass: 1,
      heldMass: 0,
      wheelRadius: 0.03,
    };

    this.dragging = false;
    this._onPointerDown = (e) => {
      this.dragging = true;
      this.startX = e.clientX;
      this.startY = e.clientY;
      if (this.cameraMode === 'cockpit') {
        if (e.button === 0) this.tryPlayerFire();
      } else this.cameraMode = 'orbit';
      this.renderer.domElement.setPointerCapture(e.pointerId);
    };
    this._onPointerMove = (e) => {
      if (!this.dragging) return;
      if (this.cameraMode === 'cockpit') {
        this.drive.yaw -= (e.clientX - this.startX) * 0.004;
        this.aimPitch = THREE.MathUtils.clamp(this.aimPitch - (e.clientY - this.startY) * 0.004, -1.1, 1.1);
        this.startX = e.clientX;
        this.startY = e.clientY;
        return;
      }
      this.orbitAngle += (e.clientX - this.startX) * 0.008;
      this.startX = e.clientX;
    };
    this._onPointerUp = () => {
      this.dragging = false;
    };
    this._onWheel = (e) => {
      e.preventDefault();
      const next = this.orbitRadius + e.deltaY * 0.004;
      this.orbitRadius = Math.min(8, Math.max(1.8, next));
    };
    this._onResize = () => this.resize();
    this.renderer.domElement.addEventListener('pointerdown', this._onPointerDown);
    this.renderer.domElement.addEventListener('pointermove', this._onPointerMove);
    this.renderer.domElement.addEventListener('pointerup', this._onPointerUp);
    this.renderer.domElement.addEventListener('wheel', this._onWheel, {passive: false});
    window.addEventListener('resize', this._onResize);

    this.resize();
    this._syncCockpitHud();
    this.last = performance.now();
    this.frame = this.frame.bind(this);
    this.raf = requestAnimationFrame(this.frame);
  }

  _buildEnvironment() {
    this._wallBoxes = [];
    while (this.env.children.length) {
      const c = this.env.children[0];
      this.env.remove(c);
      c.traverse?.((o) => {
        o.geometry?.dispose();
        o.material?.dispose?.();
      });
    }
    this.blockMeshes.clear();
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(ARENA_M * 2 * SCALE, ARENA_M * 2 * SCALE),
      this._envMat('ground'),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.userData.envRole = 'ground';
    this.env.add(ground);

    // 尺度参照：书本与螺丝（仅视觉）
    const book = new THREE.Mesh(
      new THREE.BoxGeometry(0.18 * SCALE, 0.025 * SCALE, 0.24 * SCALE),
      new THREE.MeshStandardMaterial({color: 0x8b5a3c, roughness: 0.75, metalness: 0.05}),
    );
    book.position.set(-1.7 * SCALE, 0.012 * SCALE, -1.6 * SCALE);
    book.castShadow = true;
    book.receiveShadow = true;
    this.env.add(book);
    const screw = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006 * SCALE, 0.006 * SCALE, 0.02 * SCALE, 8),
      new THREE.MeshStandardMaterial({color: 0x9aa0a6, roughness: 0.35, metalness: 0.8}),
    );
    screw.rotation.z = Math.PI / 2;
    screw.position.set(-1.55 * SCALE, 0.01 * SCALE, -1.45 * SCALE);
    this.env.add(screw);

    for (const w of this.world.walls) {
      const sx = (w.maxX - w.minX) * SCALE;
      const sz = (w.maxZ - w.minZ) * SCALE;
      const isDoor =
        Math.abs((w.minZ + w.maxZ) / 2 - this.world.narrowDoor.z) < 0.05 &&
        (w.maxX - w.minX) > 0.2;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(sx, 0.05), 0.35 * SCALE, Math.max(sz, 0.05)),
        this._envMat(isDoor ? 'door' : 'wall'),
      );
      mesh.userData.envRole = isDoor ? 'door' : 'wall';
      mesh.position.set(
        ((w.minX + w.maxX) / 2) * SCALE,
        (0.35 * SCALE) / 2,
        ((w.minZ + w.maxZ) / 2) * SCALE,
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.env.add(mesh);
      this._wallBoxes.push(mesh);
    }

    const r = this.world.ramp;
    const rise = r.maxY - r.minY;
    const run = Math.max(1e-6, r.maxZ - r.minZ);
    const rampLen = Math.hypot(rise, run);
    const rampMat = this._envMat('ramp');
    rampMat.side = THREE.DoubleSide;
    const ramp = new THREE.Mesh(
      new THREE.PlaneGeometry((r.maxX - r.minX) * SCALE, rampLen * SCALE),
      rampMat,
    );
    ramp.userData.envRole = 'ramp';
    const pitch = Math.atan2(rise, run);
    ramp.rotation.x = -Math.PI / 2 - pitch;
    ramp.position.set(
      ((r.minX + r.maxX) / 2) * SCALE,
      (rise / 2) * SCALE,
      ((r.minZ + r.maxZ) / 2) * SCALE,
    );
    ramp.receiveShadow = true;
    ramp.castShadow = true;
    this.env.add(ramp);

    const d = this.world.drawerSlot;
    const drawer = new THREE.Mesh(
      new THREE.BoxGeometry(
        (d.maxX - d.minX) * SCALE,
        Math.max(0.04, (d.maxY - d.minY) * SCALE),
        (d.maxZ - d.minZ) * SCALE,
      ),
      (() => {
        const m = this._envMat('drawer');
        m.transparent = true;
        m.opacity = 0.55;
        return m;
      })(),
    );
    drawer.userData.envRole = 'drawer';
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
      (() => {
        const m = this._envMat('receive');
        m.transparent = true;
        m.opacity = 0.45;
        return m;
      })(),
    );
    receive.userData.envRole = 'receive';
    receive.position.set(
      ((rz.minX + rz.maxX) / 2) * SCALE,
      0.01 * SCALE,
      ((rz.minZ + rz.maxZ) / 2) * SCALE,
    );
    this.env.add(receive);

    const shelf = this.world.bookshelf;
    if (shelf) {
      const shelfMesh = new THREE.Mesh(
        new THREE.BoxGeometry(
          (shelf.maxX - shelf.minX) * SCALE,
          0.06 * SCALE,
          (shelf.maxZ - shelf.minZ) * SCALE,
        ),
        new THREE.MeshStandardMaterial({color: 0x6a5040, roughness: 0.85, metalness: 0.1}),
      );
      shelfMesh.userData.envRole = 'bookshelf';
      shelfMesh.position.set(
        ((shelf.minX + shelf.maxX) / 2) * SCALE,
        shelf.shelfY * SCALE,
        ((shelf.minZ + shelf.maxZ) / 2) * SCALE,
      );
      shelfMesh.rotation.x = -(shelf.tilt || 0);
      this.env.add(shelfMesh);
      const upright = new THREE.Mesh(
        new THREE.BoxGeometry(0.08 * SCALE, shelf.shelfY * SCALE, (shelf.maxZ - shelf.minZ) * 0.9 * SCALE),
        new THREE.MeshStandardMaterial({color: 0x5a4030, roughness: 0.9}),
      );
      upright.position.set(shelf.minX * SCALE, (shelf.shelfY / 2) * SCALE, ((shelf.minZ + shelf.maxZ) / 2) * SCALE);
      this.env.add(upright);
    }
    const cover = this.world.bookshelfCover;
    if (cover) {
      const coverMesh = new THREE.Mesh(
        new THREE.BoxGeometry(
          (cover.maxX - cover.minX) * SCALE,
          cover.h * SCALE,
          (cover.maxZ - cover.minZ) * SCALE,
        ),
        new THREE.MeshStandardMaterial({color: 0x4a5560, metalness: 0.35, roughness: 0.6}),
      );
      coverMesh.position.set(
        ((cover.minX + cover.maxX) / 2) * SCALE,
        (cover.h / 2) * SCALE,
        ((cover.minZ + cover.maxZ) / 2) * SCALE,
      );
      this.env.add(coverMesh);
    }

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
      if (this.heldBlockId !== b.id) {
        b.y = settleBlockY(this.world, b);
      }
      let mesh = this.blockMeshes.get(b.id);
      const [sx, sy, sz] = b.size || [0.08, 0.08, 0.08];
      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(sx * SCALE, sy * SCALE, sz * SCALE),
          this._envMat('block'),
        );
        mesh.userData.envRole = 'block';
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.env.add(mesh);
        this.blockMeshes.set(b.id, mesh);
      }
      mesh.position.set(b.x * SCALE, b.y * SCALE, b.z * SCALE);
      mesh.visible = this.heldBlockId !== b.id;
    }
  }

  setBlueprint(bp, partDefs) {
    this.blueprint = bp ? structuredClone(bp) : null;
    this.partDefs = partDefs || this.callbacks.getPartDefs?.() || [];
    const defs = indexPartDefs(this.partDefs);
    this.sim = this.blueprint ? buildSimFromBlueprint(this.blueprint, defs) : null;
    this.drive.width = Math.max(0.08, this.sim?.width || 0.2);
    this.drive.baseMass = Math.max(0.2, this.sim?.mass || 1);
    this.drive.heldMass = 0;
    this.jointAngles = {};
    this.jointSlides = {};
    this.gripperOpen = 1;
    this.heldBlockId = null;
    this._syncMechaLoadout();
    this._rebuildRobot();
    this.frameCameraToBounds();
  }

  setCameraMode(mode) {
    if (mode === 'cockpit' || mode === 'follow' || mode === 'orbit' || mode === 'tool') {
      this.cameraMode = mode;
    }
    this._syncCockpitHud();
  }

  _syncCockpitHud() {
    const on = this.cameraMode === 'cockpit';
    const reticle = this.container.querySelector('#cockpit-reticle');
    const hud = this.container.querySelector('#cockpit-hud');
    if (reticle) {
      reticle.hidden = !on;
      reticle.setAttribute('aria-hidden', on ? 'false' : 'true');
    }
    // 战斗 HUD 常显；准星仅驾驶舱
    if (hud) hud.hidden = false;
    if (this.robotRoot) this.robotRoot.visible = !on;
  }

  setQuality(level) {
    const high = level !== 'low';
    this.quality = high ? 'high' : 'low';
    this.renderer.shadowMap.enabled = high;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, high ? 2 : 1));
    if (this.sun) {
      this.sun.castShadow = high;
      if (high) this.sun.shadow.mapSize.set(1024, 1024);
      else this.sun.shadow.mapSize.set(512, 512);
    }
    this._applyThemeVisuals();
  }

  setTheme(themeId) {
    this.themeId = normalizeThemeId(themeId);
    this._applyThemeVisuals();
    this._buildEnvironment();
    this._rebuildRobot();
  }

  _theme() {
    return themeForQuality(getTheme(this.themeId), this.quality);
  }

  _applyThemeVisuals() {
    const theme = this._theme();
    this.scene.background = new THREE.Color(theme.scene.background);
    if (theme.scene.fog) {
      this.scene.fog = new THREE.Fog(theme.scene.fog.color, theme.scene.fog.near, theme.scene.fog.far);
    } else {
      this.scene.fog = null;
    }
    if (this.hemi) {
      this.hemi.color.set(theme.lights.hemiSky);
      this.hemi.groundColor.set(theme.lights.hemiGround);
      this.hemi.intensity = theme.lights.hemiIntensity;
    }
    if (this.sun) {
      this.sun.color.set(theme.lights.sunColor);
      this.sun.intensity = theme.lights.sunIntensity;
    }
  }

  _envMat(role) {
    const e = this._theme().env[role] || this._theme().env.ground;
    return new THREE.MeshStandardMaterial({
      color: e.color,
      roughness: e.roughness,
      metalness: e.metalness,
    });
  }

  setMuted(muted) {
    this.sfx?.setMuted?.(!!muted);
  }

  setReduceMotion(on) {
    this.reduceMotion = !!on;
  }

  setStandardView(name) {
    const v = standardViewOrbit(name);
    this.orbitAngle = v.angle;
    this._camHeight = v.elevation * SCALE * 0.35;
    this.cameraMode = 'orbit';
    this._syncCockpitHud();
  }

  focusTool() {
    this.cameraMode = 'tool';
    this._syncCockpitHud();
  }

  resumeFollow() {
    this.cameraMode = 'follow';
    this._syncCockpitHud();
  }

  enterCockpit() {
    this.cameraMode = 'cockpit';
    this._syncCockpitHud();
  }

  setInput(forward, turn) {
    this.input.forward = forward;
    this.input.turn = turn;
  }

  setJointDelta(delta) {
    this._applyAction('lift', delta);
  }

  setExtendDelta(delta) {
    this._applyAction('extend', delta);
  }

  setGraspDelta(delta) {
    this._applyAction('grasp', delta);
  }

  _applyAction(action, delta) {
    if (!this.blueprint) return;
    const result = applyBoundAxis(this.blueprint, action, delta, {
      jointAngles: this.jointAngles,
      jointSlides: this.jointSlides,
      gripperOpen: this.gripperOpen,
      sim: this.sim,
    });
    this.jointAngles = result.jointAngles;
    this.jointSlides = result.jointSlides;
    this.gripperOpen = result.gripperOpen;
    if (result.messages?.length) {
      this.sfx.play('limit');
      this.callbacks.onGrasp?.({success: false, reason: result.messages[0]});
    }
    this._refreshPoseSim();
    this._rebuildRobot();
  }

  _refreshPoseSim() {
    if (!this.blueprint) return;
    const defs = indexPartDefs(this.partDefs);
    this.sim = buildSimFromBlueprint(this.blueprint, defs, {
      jointAngles: this.jointAngles,
      jointSlides: this.jointSlides,
    });
    if (this.sim) this.sim.gripperOpen = this.gripperOpen;
    this.drive.width = Math.max(0.08, this.sim?.width || 0.2);
  }

  diagnostics() {
    this._refreshPoseSim();
    const ctrl = diagnoseControls(this.blueprint, this.sim);
    const held = this.heldBlockId
      ? this.world.blocks.find((b) => b.id === this.heldBlockId)
      : null;
    const heldMass = held?.mass || this.drive.heldMass || 0;
    const tip = checkTip({
      com: this.sim?.com,
      mass: this.sim?.mass || 0,
      width: this.sim?.width || 0,
      supportPolygon: this.sim?.supportPolygon,
      heldMass,
      heldOffset: {x: (this.sim?.reach || 0) * 0.5, z: 0},
      tipFactor: tipFactorAt(this.world, this.drive.x, this.drive.z),
    });
    const tipRisk = tip.margin != null && tip.margin < 0.02;
    const block = this._targetBlock();
    const tool = this._toolWorld();
    let toolDist = null;
    if (block && tool) {
      toolDist = Math.hypot(block.x - tool.x, (block.z || 0) - (tool.z || 0));
    } else if (block) {
      toolDist = Math.hypot(block.x - this.drive.x, block.z - this.drive.z);
    }
    const structureHint = liveStructureHint({
      reach: this.sim?.reach || 0,
      toolDist,
      tipRisk,
      heldMass,
    });
    return {
      mass: this.sim?.mass || 0,
      width: this.sim?.width || 0,
      reach: this.sim?.reach || 0,
      com: this.sim?.com || {x: 0, y: 0, z: 0},
      gripperOpen: this.gripperOpen,
      tipMargin: tip.margin,
      tipRisk,
      groundY: heightAt(this.world, this.drive.x, this.drive.z),
      forwardSpeed: this.drive.forwardSpeed || 0,
      graspPhase: this.graspSeq?.phase || 'idle',
      fps: this.fps,
      quality: this.quality || 'high',
      toolDist,
      heldMass,
      structureHint,
      controls: ctrl,
    };
  }

  _toolWorld() {
    if (!this.sim || !this.blueprint) return null;
    const defs = indexPartDefs(this.partDefs);
    const poses = worldPosesWithJoints(this.blueprint, defs, this.jointAngles, this.jointSlides);
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
      const id = this._challengeBlockId();
      return this.world.blocks.find((b) => b.id === id) || this.world.blocks[0];
    }
    return this.world.blocks[0];
  }

  tryInteract() {
    const block = this._targetBlock();
    if (!block) return {success: false, reason: '场上没有方块'};
    if (this.heldBlockId || this.graspSeq.phase === 'holding') {
      this.graspSeq = startReleaseSequence();
      return {success: false, reason: '正在释放…'};
    }
    if (this.graspSeq.phase !== 'idle') {
      return {success: false, reason: '抓取动作进行中…'};
    }
    const tool = this._toolWorld();
    if (!tool) return {success: false, reason: '蓝图上没有夹爪/推板/钩子'};
    this._refreshPoseSim();
    const toolBehaviors = new Set(toolLink(this.sim)?.behaviors || []);
    if (toolBehaviors.has('push')) {
      const result = tryPush(this.sim, this.drive, tool, block);
      if (result.success) {
        block.x += result.dx || 0;
        block.z += result.dz || 0;
        block.y = settleBlockY(this.world, block);
        this._syncBlocks();
        this.sfx.play('collision');
      }
      this.callbacks.onGrasp?.(result);
      return result;
    }
    if (toolBehaviors.has('drag')) {
      const result = tryDrag(this.sim, this.drive, tool, block);
      if (result.success) {
        this.heldBlockId = block.id;
        this.drive.heldMass = Number(block.mass) || 0.3;
        this.cameraMode = 'tool';
        this._syncBlocks();
        this.sfx.play('grasp');
      }
      this.callbacks.onGrasp?.(result);
      return result;
    }
    // grasp：启动全过程序列
    this.graspSeq = startGraspSequence();
    this.callbacks.onGrasp?.({success: false, reason: '开始抓取：接近 → 对准 → 闭合 → 抬升'});
    return {success: false, reason: '开始抓取…'};
  }

  _stepGrasp(dt) {
    if (!this.graspSeq || this.graspSeq.phase === 'idle') return;
    const block = this._targetBlock();
    const tool = this._toolWorld();
    const result = stepGraspSequence(
      {
        sim: this.sim,
        toolWorld: tool,
        block,
        gripperOpen: this.gripperOpen,
        holding: !!this.heldBlockId,
      },
      dt,
      this.graspSeq,
    );
    this.graspSeq = {phase: result.phase, t: result.t, autoAssist: true};
    if (result.gripperOpen != null) this.gripperOpen = result.gripperOpen;
    if (result.liftOffset != null) this._liftOffset = result.liftOffset;
    if (result.attach && block) {
      this.heldBlockId = block.id;
      this.drive.heldMass = Number(block.mass) || 0.3;
      this.cameraMode = 'tool';
      this._syncBlocks();
      this.sfx.play('grasp');
      this.callbacks.onGrasp?.({success: true, reason: result.reason});
      this._rebuildRobot();
    }
    if (result.detach) {
      const held = this.world.blocks.find((b) => b.id === this.heldBlockId) || block;
      if (held && tool) {
        held.x = tool.x;
        held.z = tool.z;
        held.y = settleBlockY(this.world, {...held, x: tool.x, z: tool.z});
      }
      this.heldBlockId = null;
      this.drive.heldMass = 0;
      this._liftOffset = 0;
      this._syncBlocks();
      this.sfx.play('release');
      this.callbacks.onGrasp?.({success: true, reason: result.reason || '已放下方块'});
      this._rebuildRobot();
    } else if (result.reason && result.phase === 'idle' && !result.success) {
      this.callbacks.onGrasp?.({success: false, reason: result.reason});
    } else if (result.forceClose || result.gripperOpen != null) {
      this._rebuildRobot();
    }
  }

  _challengeBlockId() {
    const kind = this.world.challengeKind;
    if (kind === 'desk-gap-rescue') return DESK_GAP_BLOCK_ID;
    if (kind === 'bookshelf-rescue') return BOOKSHELF_BLOCK_ID;
    return DRAWER_BLOCK_ID;
  }

  _blueprintHasBehavior(behavior) {
    const ids = new Set((this.blueprint?.instances || []).map((i) => i.part_id));
    if (behavior === 'weapon') return ids.has('weapon_rifle');
    if (behavior === 'thrust') return ids.has('thruster_pack');
    if (behavior === 'winch') return ids.has('winch_module');
    return false;
  }

  _syncMechaLoadout() {
    this.combat = this._blueprintHasBehavior('weapon')
      ? createCombatState({maxAmmo: 36, damage: 28})
      : null;
    this.winch = this._blueprintHasBehavior('winch') ? createWinchState() : null;
    this.thrust = this._blueprintHasBehavior('thrust') ? createThrustState() : null;
    this.playerHp = this.maxPlayerHp;
  }

  _clearEnemies() {
    for (const mesh of this.enemyMeshes.values()) {
      this.scene.remove(mesh);
      mesh.traverse?.((o) => {
        o.geometry?.dispose?.();
        o.material?.dispose?.();
      });
    }
    this.enemyMeshes.clear();
    this.enemies = [];
    for (const mesh of this.projectileMeshes.values()) {
      this.scene.remove(mesh);
      mesh.geometry?.dispose?.();
      mesh.material?.dispose?.();
    }
    this.projectileMeshes.clear();
    this._enemyShots = [];
  }

  _spawnBookshelfEncounter() {
    this._clearEnemies();
    const path = this.world.enemyPath || [];
    const start = path[0] || {x: -1, z: 0.5};
    const enemy = createEnemy({
      id: 'patrol-scout',
      x: start.x,
      z: start.z,
      path,
      hp: 90,
      alertRange: 3.4,
      fireRange: 2.6,
    });
    this.enemies.push(enemy);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.35 * SCALE, 0.4 * SCALE, 0.35 * SCALE),
      new THREE.MeshStandardMaterial({color: 0x8a3030, metalness: 0.4, roughness: 0.55}),
    );
    mesh.position.set(enemy.x * SCALE, 0.2 * SCALE, enemy.z * SCALE);
    this.scene.add(mesh);
    this.enemyMeshes.set(enemy.id, mesh);
  }

  setChallengeMode(on, kind = 'drawer-block') {
    this.world.setChallengeMode(!!on, kind);
    this.heldBlockId = null;
    this._prevBlockPos = null;
    this._blockSpeed = 0;
    this._challengeReadySent = false;
    this._syncBlocks();
    this._syncMechaLoadout();
    if (on && kind === 'bookshelf-rescue') this._spawnBookshelfEncounter();
    else this._clearEnemies();
  }

  /** 当前目标方块速度与是否在接收区（供提交按钮使用） */
  challengeStatus() {
    const id = this._challengeBlockId();
    const block = this.world.blocks.find((b) => b.id === id);
    if (!block) return null;
    return {
      block_id: block.id,
      region: this.world.blockInReceive(block) ? 'receive' : 'other',
      speed: this._blockSpeed,
      challenge_id: this.world.challengeKind,
      player_hp: this.playerHp,
      combat: this.combat
        ? {ammo: this.combat.ammo, heat: this.combat.heat, maxHeat: this.combat.maxHeat}
        : null,
    };
  }

  reset() {
    this.world.reset();
    this.drive.x = this.world.spawn.x;
    this.drive.z = this.world.spawn.z;
    this.drive.yaw = this.world.spawn.yaw;
    this.drive.forwardSpeed = 0;
    this.drive.heldMass = 0;
    this.heldBlockId = null;
    this.graspSeq = {phase: 'idle', t: 0, autoAssist: true};
    this._liftOffset = 0;
    this.tipped = false;
    this.jointAngles = {};
    this.jointSlides = {};
    this.gripperOpen = 1;
    this._prevBlockPos = null;
    this._blockSpeed = 0;
    this._challengeReadySent = false;
    this._fallCooldown = 0;
    this._wheelSpin = 0;
    this.cameraMode = 'follow';
    this.playerHp = this.maxPlayerHp;
    if (this.combat) {
      this.combat.ammo = this.combat.maxAmmo;
      this.combat.heat = 0;
      this.combat.projectiles = [];
      this.combat.overheated = false;
    }
    if (this.thrust) refillThrust(this.thrust);
    if (this.winch) releaseWinch(this.winch);
    if (this.world.challengeKind === 'bookshelf-rescue') this._spawnBookshelfEncounter();
    this._syncCockpitHud();
    this._syncBlocks();
    this._refreshPoseSim();
    this._rebuildRobot();
    this.frameCameraToBounds();
  }

  setExtrasInput({fire = 0, thrust = 0, winch = 0} = {}) {
    this.inputExtras.fire = fire;
    this.inputExtras.thrust = thrust;
    this.inputExtras.winch = winch;
  }

  tryPlayerFire() {
    if (!this.combat || this.tipped) return {ok: false, reason: '无法射击'};
    const yaw = this.drive.yaw;
    const origin = {
      x: this.drive.x + Math.sin(yaw) * 0.18,
      y: heightAt(this.world, this.drive.x, this.drive.z) + 0.22,
      z: this.drive.z + Math.cos(yaw) * 0.18,
    };
    const dir = {x: Math.sin(yaw), y: 0.02, z: Math.cos(yaw)};
    if (this.cameraMode === 'cockpit') {
      const sight = this.camera.getWorldDirection(new THREE.Vector3());
      const target = this.camera.position.clone().addScaledVector(sight, 8 * SCALE).divideScalar(SCALE);
      dir.x = target.x - origin.x;
      dir.y = target.y - origin.y;
      dir.z = target.z - origin.z;
    }
    const r = tryFire(this.combat, origin, dir, this._nowSec);
    if (r.ok) this.sfx.play('motor', {force: true});
    return r;
  }

  tryPlayerWinch() {
    if (!this.winch || this.tipped) return {ok: false, reason: '无绞盘'};
    if (this.winch.attached || this.winch.flying) {
      releaseWinch(this.winch);
      return {ok: true, reason: '松开绞盘'};
    }
    const yaw = this.drive.yaw;
    return tryCastWinch(
      this.winch,
      {x: this.drive.x, y: 0.25, z: this.drive.z},
      {x: Math.sin(yaw), y: 0.15, z: Math.cos(yaw)},
      this.world.anchors || [],
      this.world.blocks,
    );
  }

  hudState() {
    return {
      hp: this.playerHp,
      maxHp: this.maxPlayerHp,
      ammo: this.combat?.ammo ?? null,
      heat: this.combat?.heat ?? 0,
      maxHeat: this.combat?.maxHeat ?? 100,
      fuel: this.thrust?.fuel ?? null,
      winch: !!(this.winch?.attached || this.winch?.flying),
      hasWeapon: !!this.combat,
      hasThrust: !!this.thrust,
      hasWinch: !!this.winch,
    };
  }

  _stepMechaSystems(dt) {
    this._nowSec += dt;
    if (this.inputExtras.fire) {
      this.tryPlayerFire();
      this.inputExtras.fire = 0;
    }
    if (this.inputExtras.winch) {
      this.tryPlayerWinch();
      this.inputExtras.winch = 0;
    }
    if (this.thrust) {
      const t = stepThrust(this.thrust, !!this.inputExtras.thrust, dt, {
        yaw: this.drive.yaw,
        onGround: true,
      });
      this.drive.x += t.dx;
      this.drive.z += t.dz;
      if (this.combat && t.heat) {
        this.combat.heat = Math.min(this.combat.maxHeat, this.combat.heat + t.heat);
      }
      this._liftOffset = Math.max(0, (this._liftOffset || 0) * 0.9 + (t.vy > 0 ? t.vy * 0.02 : 0));
    }
    if (this.winch) {
      const w = stepWinch(this.winch, dt, {x: this.drive.x, z: this.drive.z});
      if (w.pull) {
        this.drive.x += w.pull.dx;
        this.drive.z += w.pull.dz;
      }
      if (w.blockPull) {
        const b = this.world.blocks.find((x) => x.id === w.blockPull.id);
        if (b) {
          b.x += w.blockPull.dx;
          b.z += w.blockPull.dz;
        }
      }
    }
    const targets = this.enemies
      .filter((e) => e.hp > 0)
      .map((e) => ({id: e.id, x: e.x, y: e.y, z: e.z, radius: e.radius, hp: e.hp}));
    if (this.combat) {
      const {hits} = stepProjectiles(this.combat, dt, targets);
      for (const h of hits) {
        const enemy = this.enemies.find((e) => e.id === h.targetId);
        if (!enemy) continue;
        const res = applyEnemyHit(enemy, h.damage);
        const mesh = this.enemyMeshes.get(enemy.id);
        if (mesh?.material?.emissive) {
          mesh.material.emissive.setHex(0xffaa66);
          mesh.material.emissiveIntensity = 0.6;
        }
        if (res.destroyed) {
          mesh.visible = false;
          this.callbacks.onGrasp?.({success: true, reason: '敌机已击毁'});
        }
      }
      this._syncProjectileMeshes();
    }
    const player = {x: this.drive.x, z: this.drive.z};
    for (const enemy of this.enemies) {
      if (enemy.hp <= 0) continue;
      const {shots} = stepEnemy(enemy, dt, player);
      const mesh = this.enemyMeshes.get(enemy.id);
      if (mesh) {
        mesh.position.set(enemy.x * SCALE, 0.2 * SCALE, enemy.z * SCALE);
        mesh.rotation.y = enemy.yaw;
        if (mesh.material?.emissive && enemy.state === 'warn') {
          mesh.material.emissive.setHex(0xff4400);
          mesh.material.emissiveIntensity = 0.35;
        }
      }
      for (const s of shots) this._enemyShots.push({...s});
    }
    const remain = [];
    for (const s of this._enemyShots) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      s.life -= dt;
      if (Math.hypot(s.x - this.drive.x, s.z - this.drive.z) < 0.22) {
        this.playerHp = Math.max(0, this.playerHp - (s.damage || 10));
        this.sfx.play('collision', {force: true});
        if (this.playerHp <= 0) {
          this.callbacks.onTip?.('机体失去行动力，已回起点重试（作品未丢失）');
          this.reset();
        }
        continue;
      }
      if (s.life > 0) remain.push(s);
    }
    this._enemyShots = remain;
  }

  _syncProjectileMeshes() {
    const live = new Set((this.combat?.projectiles || []).map((p) => p.id));
    for (const [id, mesh] of this.projectileMeshes) {
      if (!live.has(id)) {
        this.scene.remove(mesh);
        mesh.geometry?.dispose?.();
        mesh.material?.dispose?.();
        this.projectileMeshes.delete(id);
      }
    }
    for (const p of this.combat?.projectiles || []) {
      let mesh = this.projectileMeshes.get(p.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.04 * SCALE, 8, 8),
          new THREE.MeshStandardMaterial({color: 0xffcc66, emissive: 0xff8800, emissiveIntensity: 0.8}),
        );
        this.scene.add(mesh);
        this.projectileMeshes.set(p.id, mesh);
      }
      mesh.position.set(p.x * SCALE, p.y * SCALE, p.z * SCALE);
    }
  }

  /** 按机器人包围盒自动取景，避免试验场里机器过小。 */
  frameCameraToBounds() {
    const links = this.sim?.links || [];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const link of links) {
      const a = link.aabb;
      if (!a) continue;
      minX = Math.min(minX, a.min.x);
      maxX = Math.max(maxX, a.max.x);
      minY = Math.min(minY, a.min.y);
      maxY = Math.max(maxY, a.max.y);
      minZ = Math.min(minZ, a.min.z);
      maxZ = Math.max(maxZ, a.max.z);
    }
    if (!Number.isFinite(minX)) {
      this.orbitRadius = 3.2;
      return;
    }
    const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 0.2);
    this.orbitRadius = frameRadiusFromBounds({span, min: 2.4, max: 6.5});
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
    const poses = worldPosesWithJoints(this.blueprint, defs, this.jointAngles, this.jointSlides);
    for (const inst of this.blueprint.instances || []) {
      let size = sizeFor(inst.part_id, defs);
      const pose = poses[inst.instance_id] || {x: 0, y: 0, z: 0};
      const visual = createPartVisual(inst.part_id, size, {
        gripperOpen: this.gripperOpen,
        themeId: this.themeId,
        quality: this.quality,
      });
      placePartVisual(visual, pose, SCALE, size[1]);
      visual.userData.partId = inst.part_id;
      visual.userData.isWheel = inst.part_id === 'wheel';
      this.robotRoot.add(visual);
      this.partMeshes.set(inst.instance_id, visual);
    }
  }

  _updateHeld() {
    if (!this.heldBlockId) return;
    const block = this.world.blocks.find((b) => b.id === this.heldBlockId);
    if (!block) return;
    const tool = this._toolWorld() || {x: this.drive.x, y: 0.12, z: this.drive.z};
    block.x = tool.x;
    block.y = Math.max(0.04, tool.y + (this._liftOffset || 0));
    block.z = tool.z;
  }

  setDebug(on) {
    this.debugOverlay = !!on;
    if (!this.debugOverlay && this._debugEl) this._debugEl.hidden = true;
  }

  _ensureDebugHud() {
    if (this._debugEl) return;
    const el = document.createElement('pre');
    el.className = 'yard-debug-hud';
    el.hidden = true;
    this.container.append(el);
    this._debugEl = el;
  }

  _updateDebugHud() {
    if (!this.debugOverlay) {
      if (this._debugEl) this._debugEl.hidden = true;
      return;
    }
    this._ensureDebugHud();
    const d = this.diagnostics();
    this._debugEl.hidden = false;
    this._debugEl.textContent = [
      `FPS ${Math.round(d.fps || 0)} · ${d.quality}`,
      `grasp ${d.graspPhase} · grip ${d.gripperOpen.toFixed(2)}`,
      `v ${d.forwardSpeed.toFixed(2)} m/s · y ${d.groundY.toFixed(2)}m`,
      `reach ${d.reach.toFixed(2)} · tip ${Number(d.tipMargin ?? 0).toFixed(3)}`,
      d.structureHint || '',
    ].filter(Boolean).join('\n');
  }

  _clipCamera() {
    const walls = (this.world.walls || []).map((w) => ({
      minX: w.minX * SCALE,
      maxX: w.maxX * SCALE,
      minY: 0,
      maxY: 0.4 * SCALE,
      minZ: w.minZ * SCALE,
      maxZ: w.maxZ * SCALE,
    }));
    const clipped = clipCameraAgainstWalls(
      {x: this.look.x, y: this.look.y, z: this.look.z},
      {
        x: this.camera.position.x,
        y: this.camera.position.y,
        z: this.camera.position.z,
      },
      walls,
      {pad: 0.2 * SCALE, minDist: 0.4 * SCALE},
    );
    if (clipped.clipped) {
      this.camera.position.set(clipped.x, clipped.y, clipped.z);
    }
  }

  _trackChallenge(dt) {
    if (!this.world.challengeMode) return;
    const id = this._challengeBlockId();
    const block = this.world.blocks.find((b) => b.id === id);
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
        challenge_id: this.world.challengeKind,
      });
    }
  }

  _checkTip() {
    if (!this.sim || this.tipped) return;
    this._refreshPoseSim();
    const held = this.heldBlockId
      ? this.world.blocks.find((b) => b.id === this.heldBlockId)
      : null;
    let heldOffset = {x: 0, z: 0};
    if (held) {
      const dx = held.x - this.drive.x;
      const dz = held.z - this.drive.z;
      const c = Math.cos(-this.drive.yaw);
      const s = Math.sin(-this.drive.yaw);
      heldOffset = {x: dx * c - dz * s, z: dx * s + dz * c};
    }
    const tip = checkTip({
      com: this.sim.com,
      mass: this.sim.mass,
      width: this.sim.width,
      supportPolygon: this.sim.supportPolygon,
      heldMass: held?.mass || 0,
      heldOffset,
      tipFactor: tipFactorAt(this.world, this.drive.x, this.drive.z),
    });
    if (tip.tipped) {
      this.tipped = true;
      this.robotRoot.rotation.z = 0.55;
      this.sfx.play('collision', {force: true});
      this.callbacks.onTip?.(tip.reason);
    }
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth || 1);
    const h = Math.max(1, this.container.clientHeight || 1);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this._bloom?.composer?.setSize(w, h);
  }

  frame(now) {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    if (document.hidden) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this._fpsAcc += dt;
    this._fpsFrames += 1;
    if (this._fpsAcc >= 0.5) {
      this.fps = this._fpsFrames / this._fpsAcc;
      this._fpsAcc = 0;
      this._fpsFrames = 0;
    }
    if (!this.tipped) {
      const held = this.heldBlockId
        ? this.world.blocks.find((b) => b.id === this.heldBlockId)
        : null;
      this.drive.heldMass = held?.mass || 0;
      this.drive.baseMass = Math.max(0.2, this.sim?.mass || 1);
      stepDrive(this.drive, this.input, dt);
      if (this.drive.collided) this.sfx.play('collision');
      const speed = Math.abs(this.drive.forwardSpeed || 0);
      if (speed > 0.05) {
        this.sfx.play('roll');
        if (Math.abs(this.input.forward) > 0.2) this.sfx.play('motor');
      }
      this._wheelSpin += (this.drive.wheelOmega || 0) * dt;
      this._stepGrasp(dt);
      if (this.world.inDeskGap?.(this.drive.x, this.drive.z)) {
        this._fallCooldown += dt;
        if (this._fallCooldown > 0.35) {
          this._fallCooldown = 0;
          this.callbacks.onGrasp?.({success: false, reason: '掉进桌缝了，已回到起点——试试加长手臂或绕行'});
          this.reset();
        }
      } else {
        this._fallCooldown = 0;
      }
      this._updateHeld();
      this._stepMechaSystems(dt);
      this._trackChallenge(dt);
      this._checkTip();
    }
    const groundY = heightAt(this.world, this.drive.x, this.drive.z);
    this.robotRoot.position.set(this.drive.x * SCALE, groundY * SCALE, this.drive.z * SCALE);
    this.robotRoot.rotation.y = this.drive.yaw;
    for (const mesh of this.partMeshes.values()) {
      if (mesh.userData.isWheel) mesh.rotation.x = this._wheelSpin;
    }

    const turning = Math.abs(this.input.turn || 0) > 0.1;
    if (this.cameraMode === 'cockpit') {
      const eyeH = (groundY + 0.13) * SCALE;
      const yaw = this.drive.yaw;
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      const px = this.drive.x * SCALE;
      const pz = this.drive.z * SCALE;
      const eyeX = px + fx * 0.08 * SCALE;
      const eyeZ = pz + fz * 0.08 * SCALE;
      const lookX = px + fx * 2.2 * SCALE;
      const lookZ = pz + fz * 2.2 * SCALE;
      const lambda = this.reduceMotion ? 6 : turning ? 24 : 14;
      this.camera.position.x = damp(this.camera.position.x, eyeX, lambda, dt);
      this.camera.position.y = damp(this.camera.position.y, eyeH, lambda, dt);
      this.camera.position.z = damp(this.camera.position.z, eyeZ, lambda, dt);
      this.look.x = damp(this.look.x, lookX, lambda, dt);
      this.look.y = damp(this.look.y, eyeH + Math.tan(this.aimPitch) * 2.12 * SCALE, lambda, dt);
      this.look.z = damp(this.look.z, lookZ, lambda, dt);
      this.camera.lookAt(this.look);
      this.robotRoot.visible = false;
    } else {
      this.robotRoot.visible = true;
      let lookY = (groundY + 0.12) * SCALE;
      let lookX = this.drive.x * SCALE;
      let lookZ = this.drive.z * SCALE;
      if (this.cameraMode === 'tool') {
        const tool = this._toolWorld();
        if (tool) {
          lookX = tool.x * SCALE;
          lookY = (tool.y + 0.05) * SCALE;
          lookZ = tool.z * SCALE;
        }
      }
      const targetLook = new THREE.Vector3(lookX, lookY, lookZ);
      const lambda = this.reduceMotion ? 3 : 10;
      this.look.x = damp(this.look.x, targetLook.x, lambda, dt);
      this.look.y = damp(this.look.y, targetLook.y, lambda, dt);
      this.look.z = damp(this.look.z, targetLook.z, lambda, dt);

      let targetAngle = this.orbitAngle;
      let targetRadius = this.orbitRadius;
      let targetHeight = this._camHeight;
      if (this.cameraMode === 'follow') {
        targetAngle = this.drive.yaw + Math.PI;
        targetRadius = this.orbitRadius;
        targetHeight = (1.1 + groundY) * SCALE * 0.42;
      } else if (this.cameraMode === 'tool') {
        targetRadius = Math.max(1.8, this.orbitRadius * 0.55);
        targetHeight = (0.7 + groundY) * SCALE * 0.4;
      }
      // 转弯时相机主动收紧跟随，避免机体转过去了视角还拖在后面
      const camYawLambda = this.reduceMotion
        ? 2
        : turning && (this.cameraMode === 'follow' || this.cameraMode === 'tool')
          ? 14
          : 6;
      this._camAngle = dampAngle(this._camAngle, targetAngle, camYawLambda, dt);
      this._camRadius = damp(this._camRadius, targetRadius, lambda, dt);
      this._camHeight = damp(this._camHeight, targetHeight, lambda, dt);

      const ang = this.cameraMode === 'orbit' ? this.orbitAngle : this._camAngle;
      this.camera.position.set(
        this.look.x + Math.sin(ang) * this._camRadius * SCALE * 0.35,
        this.look.y + this._camHeight * 0.55,
        this.look.z + Math.cos(ang) * this._camRadius * SCALE * 0.35,
      );
      this.camera.position.y = Math.max(this.camera.position.y, (groundY + 0.15) * SCALE);
      this._clipCamera();
      this.camera.lookAt(this.look);
    }
    this._syncBlocks();
    this._updateDebugHud();
    if (this.quality === 'high' && this._bloom?.composer) {
      this._bloom.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.renderer.domElement.removeEventListener('pointerdown', this._onPointerDown);
    this.renderer.domElement.removeEventListener('pointermove', this._onPointerMove);
    this.renderer.domElement.removeEventListener('pointerup', this._onPointerUp);
    this.renderer.domElement.removeEventListener('wheel', this._onWheel);
    window.removeEventListener('resize', this._onResize);
    this._clearRobot();
    this._envMap?.dispose?.();
    this._bloom?.composer?.dispose?.();
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
