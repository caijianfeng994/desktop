/**
 * 试验场静态世界：围墙、窄门、坡道、练习方块、抽屉缝与接收区。
 * 窄门净宽约 0.25m：窄底盘可通过，宽底盘由 stepDrive 的 width 半宽夹墙挡住。
 *
 * 注意：`ramp` 本轮仅为视觉占位盒体，不参与 tipFactor / 高度场；
 * 倾覆判定仍按平地支撑半宽，勿把坡道几何当成已接通的坡面物理。
 */

export const DRAWER_BLOCK_ID = 'drawer-cube';
export const DESK_GAP_BLOCK_ID = 'rescue-cube';

const DOOR_WIDTH = 0.25;
const DOOR_Z = 1.15;
const DOOR_THICK = 0.12;
const ARENA = 2.4;

/** 抽屉缝：方块起始于缝内，开口朝 +X（试验场负 X 侧矮柜） */
export const DRAWER_SLOT = {
  minX: -1.55,
  maxX: -1.05,
  minY: 0,
  maxY: 0.12,
  minZ: -0.55,
  maxZ: -0.15,
};

/** 接收区：靠近起点的工坊落点 */
export const RECEIVE_ZONE = {
  minX: -0.28,
  maxX: 0.28,
  minY: 0,
  maxY: 0.2,
  minZ: -1.55,
  maxZ: -1.15,
};

/** 跨桌缝：近桌 / 缝 / 远桌（远桌较高） */
export const NEAR_DESK = {minX: -0.7, maxX: 0.7, minZ: -1.7, maxZ: -0.55, y: 0};
export const FAR_DESK = {minX: -0.55, maxX: 0.55, minZ: 0.55, maxZ: 1.55, y: 0.12};
export const DESK_GAP = {minX: -0.8, maxX: 0.8, minZ: -0.5, maxZ: 0.5};

function cloneBlock(b) {
  return {
    id: b.id,
    x: b.x,
    y: b.y,
    z: b.z,
    size: Array.isArray(b.size) ? [...b.size] : b.size,
    mass: b.mass,
  };
}

function pointInAabb(x, y, z, box) {
  return (
    x >= box.minX &&
    x <= box.maxX &&
    y >= box.minY &&
    y <= box.maxY &&
    z >= box.minZ &&
    z <= box.maxZ
  );
}

/**
 * @returns {{
 *   walls: {minX:number,maxX:number,minZ:number,maxZ:number}[],
 *   ramp: {minX:number,maxX:number,minY:number,maxY:number,minZ:number,maxZ:number},
 *   narrowDoor: {minX:number,maxX:number,z:number,width:number},
 *   drawerSlot: typeof DRAWER_SLOT,
 *   receiveZone: typeof RECEIVE_ZONE,
 *   blocks: {id:string,x:number,y:number,z:number,size:number[],mass:number}[],
 *   spawn: {x:number,z:number,yaw:number},
 *   challengeMode: boolean,
 *   setChallengeMode: (on:boolean) => void,
 *   blockInReceive: (block:{x:number,y?:number,z:number}) => boolean,
 *   reset: () => void,
 * }}
 */
export function createYardWorld() {
  const half = DOOR_WIDTH / 2;
  const narrowDoor = {
    minX: -half,
    maxX: half,
    z: DOOR_Z,
    width: DOOR_WIDTH,
  };

  // 外圈 + 窄门两侧门柱（在 door Z 处留出 DOOR_WIDTH 开口）
  const walls = [
    {minX: -ARENA, maxX: ARENA, minZ: ARENA - 0.08, maxZ: ARENA},
    {minX: -ARENA, maxX: ARENA, minZ: -ARENA, maxZ: -ARENA + 0.08},
    {minX: -ARENA, maxX: -ARENA + 0.08, minZ: -ARENA, maxZ: ARENA},
    {minX: ARENA - 0.08, maxX: ARENA, minZ: -ARENA, maxZ: ARENA},
    // 左门柱
    {
      minX: -ARENA,
      maxX: narrowDoor.minX,
      minZ: DOOR_Z - DOOR_THICK / 2,
      maxZ: DOOR_Z + DOOR_THICK / 2,
    },
    // 右门柱
    {
      minX: narrowDoor.maxX,
      maxX: ARENA,
      minZ: DOOR_Z - DOOR_THICK / 2,
      maxZ: DOOR_Z + DOOR_THICK / 2,
    },
  ];

  const ramp = {
    minX: 0.55,
    maxX: 1.35,
    minY: 0,
    maxY: 0.18,
    minZ: -0.35,
    maxZ: 0.55,
  };

  const practiceBlocks = [
    {
      id: 'practice-block',
      x: -0.35,
      y: 0.04,
      z: 0.35,
      size: [0.08, 0.08, 0.08],
      mass: 0.35,
    },
  ];

  const challengeBlocks = [
    {
      id: DRAWER_BLOCK_ID,
      x: (DRAWER_SLOT.minX + DRAWER_SLOT.maxX) / 2,
      y: 0.04,
      z: (DRAWER_SLOT.minZ + DRAWER_SLOT.maxZ) / 2,
      size: [0.06, 0.06, 0.06],
      mass: 0.28,
    },
  ];

  const deskGapBlocks = [
    {
      id: DESK_GAP_BLOCK_ID,
      x: (FAR_DESK.minX + FAR_DESK.maxX) / 2,
      y: FAR_DESK.y + 0.04,
      z: (FAR_DESK.minZ + FAR_DESK.maxZ) / 2,
      size: [0.07, 0.07, 0.07],
      mass: 0.3,
    },
  ];

  let challengeMode = false;
  /** @type {'none'|'drawer-block'|'desk-gap-rescue'} */
  let challengeKind = 'none';
  const blocks = practiceBlocks.map(cloneBlock);
  const spawn = {x: 0, z: -1.35, yaw: 0};

  function reloadBlocks() {
    let source = practiceBlocks;
    if (challengeMode && challengeKind === 'desk-gap-rescue') source = deskGapBlocks;
    else if (challengeMode) source = challengeBlocks;
    blocks.length = 0;
    for (const b of source) blocks.push(cloneBlock(b));
  }

  function reset() {
    reloadBlocks();
  }

  function setChallengeMode(on, kind = 'drawer-block') {
    challengeMode = !!on;
    challengeKind = challengeMode ? (kind || 'drawer-block') : 'none';
    reloadBlocks();
  }

  function blockInReceive(block) {
    if (!block) return false;
    return pointInAabb(block.x ?? 0, block.y ?? 0.04, block.z ?? 0, RECEIVE_ZONE);
  }

  /** 机器人是否掉进桌缝（非桌面支撑） */
  function inDeskGap(x, z) {
    if (challengeKind !== 'desk-gap-rescue') return false;
    const inGap =
      x >= DESK_GAP.minX && x <= DESK_GAP.maxX && z >= DESK_GAP.minZ && z <= DESK_GAP.maxZ;
    if (!inGap) return false;
    const onNear =
      x >= NEAR_DESK.minX && x <= NEAR_DESK.maxX && z >= NEAR_DESK.minZ && z <= NEAR_DESK.maxZ;
    const onFar =
      x >= FAR_DESK.minX && x <= FAR_DESK.maxX && z >= FAR_DESK.minZ && z <= FAR_DESK.maxZ;
    return !onNear && !onFar;
  }

  return {
    walls,
    ramp,
    narrowDoor,
    drawerSlot: {...DRAWER_SLOT},
    receiveZone: {...RECEIVE_ZONE},
    nearDesk: {...NEAR_DESK},
    farDesk: {...FAR_DESK},
    deskGap: {...DESK_GAP},
    blocks,
    spawn,
    get challengeMode() {
      return challengeMode;
    },
    get challengeKind() {
      return challengeKind;
    },
    setChallengeMode,
    blockInReceive,
    inDeskGap,
    reset,
  };
}
