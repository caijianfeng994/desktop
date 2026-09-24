/**
 * 预制装配蓝图模板（四轮机架 + 两关节臂）。
 * 形状与 Python `quad_chassis_arm_blueprint()` 对齐，可 Blueprint.model_validate。
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
    bindings: {},
  };
}
