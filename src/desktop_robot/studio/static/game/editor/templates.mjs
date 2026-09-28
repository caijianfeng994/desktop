/**
 * 预制装配蓝图模板（四轮机架、工程机甲）。
 * 与 Python `templates.py` 对齐，可 Blueprint.model_validate。
 */

const ZERO = Object.freeze({x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0});

function inst(instanceId, partId, localPose = ZERO, params = {}) {
  return {
    instance_id: instanceId,
    part_id: partId,
    local_pose: {...localPose},
    params: {...params},
  };
}

function conn(parentInstanceId, parentPointId, childInstanceId, childPointId, joint = 'fixed') {
  return {
    parent_instance_id: parentInstanceId,
    parent_point_id: parentPointId,
    child_instance_id: childInstanceId,
    child_point_id: childPointId,
    joint,
  };
}

export function buildEmptyCoreTemplate({
  id = 'empty-core',
  name = '空机架',
} = {}) {
  return {
    id,
    name,
    root_instance_id: 'core-1',
    instances: [inst('core-1', 'core')],
    connections: [],
    bindings: {},
  };
}

/**
 * @returns {{
 *   id: string,
 *   name: string,
 *   root_instance_id: string,
 *   instances: object[],
 *   connections: object[],
 *   bindings: Record<string, string[]>
 * }}
 */
export function buildQuadChassisArmTemplate({
  id = 'quad-chassis-arm',
  name = '四轮机架与两关节臂',
} = {}) {
  return {
    id,
    name,
    root_instance_id: 'core-1',
    instances: [
      inst('core-1', 'core'),
      inst('plate-1', 'plate'),
      inst('wheel-left', 'wheel'),
      inst('wheel-right', 'wheel'),
      inst('wheel-front', 'wheel'),
      inst('wheel-back', 'wheel'),
      inst('joint-1', 'revolute_joint'),
      inst('beam-1', 'beam'),
      inst('joint-2', 'revolute_joint'),
      inst('gripper-1', 'gripper'),
    ],
    connections: [
      conn('core-1', 'mount_bottom', 'plate-1', 'face_a', 'fixed'),
      conn('core-1', 'mount_left', 'wheel-left', 'hub', 'fixed'),
      conn('core-1', 'mount_right', 'wheel-right', 'hub', 'fixed'),
      conn('plate-1', 'face_c', 'wheel-front', 'hub', 'fixed'),
      conn('plate-1', 'face_d', 'wheel-back', 'hub', 'fixed'),
      conn('core-1', 'mount_front', 'joint-1', 'in', 'revolute'),
      conn('joint-1', 'out', 'beam-1', 'end_b', 'fixed'),
      conn('beam-1', 'end_a', 'joint-2', 'in', 'revolute'),
      conn('joint-2', 'out', 'gripper-1', 'mount', 'fixed'),
    ],
    bindings: {
      drive: [],
      turn: [],
      lift: ['joint-1', 'joint-2'],
      extend: [],
      grasp: ['gripper-1'],
    },
  };
}

/**
 * 工程机甲：头罩+躯干甲+双肩+背包+腿架四轮+臂+夹爪+肩枪。
 * 与 Python `engineer_mecha_blueprint()` 对齐。
 */
export function buildEngineerMechaTemplate({
  id = 'engineer-mecha',
  name = '工程机甲',
} = {}) {
  return {
    id,
    name,
    root_instance_id: 'core-1',
    instances: [
      inst('core-1', 'core'),
      inst('head-1', 'mecha_head'),
      inst('torso-1', 'armor_torso'),
      inst('shoulder-l', 'armor_shoulder'),
      inst('shoulder-r', 'armor_shoulder'),
      inst('rifle-1', 'weapon_rifle'),
      inst('pack-1', 'backpack_frame'),
      inst('plate-1', 'plate'),
      inst('leg-l', 'mecha_leg'),
      inst('leg-r', 'mecha_leg'),
      inst('wheel-left', 'wheel'),
      inst('wheel-right', 'wheel'),
      inst('wheel-front', 'wheel'),
      inst('wheel-back', 'wheel'),
      inst('joint-1', 'revolute_joint'),
      inst('beam-1', 'beam'),
      inst('joint-2', 'revolute_joint'),
      inst('gripper-1', 'gripper'),
    ],
    connections: [
      conn('core-1', 'slot_head', 'head-1', 'mount', 'fixed'),
      conn('core-1', 'mount_front', 'torso-1', 'mount', 'fixed'),
      conn('core-1', 'slot_shoulder_l', 'shoulder-l', 'mount', 'fixed'),
      conn('core-1', 'slot_shoulder_r', 'shoulder-r', 'mount', 'fixed'),
      conn('shoulder-r', 'hardpoint', 'rifle-1', 'mount', 'fixed'),
      conn('core-1', 'slot_backpack', 'pack-1', 'mount', 'fixed'),
      conn('core-1', 'mount_bottom', 'plate-1', 'face_a', 'fixed'),
      conn('core-1', 'mount_left', 'leg-l', 'mount', 'fixed'),
      conn('core-1', 'mount_right', 'leg-r', 'mount', 'fixed'),
      conn('leg-l', 'hub', 'wheel-left', 'hub', 'fixed'),
      conn('leg-r', 'hub', 'wheel-right', 'hub', 'fixed'),
      conn('plate-1', 'face_c', 'wheel-front', 'hub', 'fixed'),
      conn('plate-1', 'face_d', 'wheel-back', 'hub', 'fixed'),
      conn('torso-1', 'face_front', 'joint-1', 'in', 'revolute'),
      conn('joint-1', 'out', 'beam-1', 'end_b', 'fixed'),
      conn('beam-1', 'end_a', 'joint-2', 'in', 'revolute'),
      conn('joint-2', 'out', 'gripper-1', 'mount', 'fixed'),
    ],
    bindings: {
      drive: [],
      turn: [],
      lift: ['joint-1', 'joint-2'],
      extend: [],
      grasp: ['gripper-1'],
      fire: ['rifle-1'],
    },
  };
}
