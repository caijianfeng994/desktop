/**
 * 试验场静态世界：围墙、窄门、坡道、练习方块与起点。
 * 窄门净宽约 0.25m：窄底盘可通过，宽底盘由 stepDrive 的 width 半宽夹墙挡住。
 */

const DOOR_WIDTH = 0.25;
const DOOR_Z = 1.15;
const DOOR_THICK = 0.12;
const ARENA = 2.4;

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

/**
 * @returns {{
 *   walls: {minX:number,maxX:number,minZ:number,maxZ:number}[],
 *   ramp: {minX:number,maxX:number,minY:number,maxY:number,minZ:number,maxZ:number},
 *   narrowDoor: {minX:number,maxX:number,z:number,width:number},
 *   blocks: {id:string,x:number,y:number,z:number,size:number[],mass:number}[],
 *   spawn: {x:number,z:number,yaw:number},
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

  const initialBlocks = [
    {
      id: 'practice-block',
      x: -0.35,
      y: 0.04,
      z: 0.35,
      size: [0.08, 0.08, 0.08],
      mass: 0.35,
    },
  ];

  const blocks = initialBlocks.map(cloneBlock);
  const spawn = {x: 0, z: -1.35, yaw: 0};

  function reset() {
    blocks.length = 0;
    for (const b of initialBlocks) blocks.push(cloneBlock(b));
  }

  return {walls, ramp, narrowDoor, blocks, spawn, reset};
}
