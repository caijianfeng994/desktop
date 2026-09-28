/**
 * 结构对比用蓝图（短臂 / 长臂 + 窄轮距），由真实 reach / tip 度量驱动文案。
 */

function pose() {
  return {x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0};
}

function pt(id, x = 0, y = 0, z = 0, kinds = ['structure']) {
  return {id, pose: {...pose(), x, y, z}, kinds};
}

/** 离线单测与无服务场景用的最小零件定义（含连接点）。 */
export function contrastPartDefs() {
  return [
    {
      id: 'core',
      size_m: [0.08, 0.08, 0.08],
      mass_kg: 0.45,
      behaviors: [],
      connection_points: [
        pt('mount_front', 0, 0, 0.04),
        pt('mount_back', 0, 0, -0.04),
        pt('mount_left', -0.04, 0, 0),
        pt('mount_right', 0.04, 0, 0),
        pt('mount_bottom', 0, -0.04, 0),
      ],
    },
    {
      id: 'wheel',
      size_m: [0.02, 0.06, 0.06],
      mass_kg: 0.08,
      behaviors: ['roll'],
      connection_points: [pt('hub', 0, 0, 0, ['axle'])],
    },
    {
      id: 'revolute_joint',
      size_m: [0.04, 0.04, 0.04],
      mass_kg: 0.1,
      behaviors: ['pivot'],
      connection_points: [
        pt('in', 0, 0, -0.02, ['joint']),
        pt('out', 0, 0, 0.02, ['joint']),
      ],
    },
    {
      id: 'beam',
      size_m: [0.02, 0.02, 0.12],
      mass_kg: 0.05,
      behaviors: [],
      connection_points: [
        pt('end_a', 0, 0, 0.06, ['structure', 'joint']),
        pt('end_b', 0, 0, -0.06, ['structure', 'joint']),
      ],
    },
    {
      id: 'gripper',
      size_m: [0.04, 0.04, 0.06],
      mass_kg: 0.1,
      behaviors: ['grasp'],
      connection_points: [pt('mount', 0, 0, -0.03, ['tool'])],
    },
  ];
}

function chassisConnections() {
  return [
    {parent_instance_id: 'c', parent_point_id: 'mount_left', child_instance_id: 'wL', child_point_id: 'hub', joint: 'fixed'},
    {parent_instance_id: 'c', parent_point_id: 'mount_right', child_instance_id: 'wR', child_point_id: 'hub', joint: 'fixed'},
  ];
}

function chassisInstances() {
  return [
    {instance_id: 'c', part_id: 'core', local_pose: pose()},
    {instance_id: 'wL', part_id: 'wheel', local_pose: pose()},
    {instance_id: 'wR', part_id: 'wheel', local_pose: pose()},
  ];
}

export function shortArmBlueprint() {
  return {
    id: 'contrast-short',
    name: '短臂对照',
    root_instance_id: 'c',
    instances: [
      ...chassisInstances(),
      {instance_id: 'j', part_id: 'revolute_joint', local_pose: pose()},
      {instance_id: 'g', part_id: 'gripper', local_pose: pose()},
    ],
    connections: [
      ...chassisConnections(),
      {parent_instance_id: 'c', parent_point_id: 'mount_front', child_instance_id: 'j', child_point_id: 'in', joint: 'revolute'},
      {parent_instance_id: 'j', parent_point_id: 'out', child_instance_id: 'g', child_point_id: 'mount', joint: 'fixed'},
    ],
  };
}

export function longArmBlueprint() {
  return {
    id: 'contrast-long',
    name: '长臂对照',
    root_instance_id: 'c',
    instances: [
      ...chassisInstances(),
      {instance_id: 'j', part_id: 'revolute_joint', local_pose: pose()},
      {instance_id: 'b', part_id: 'beam', local_pose: pose()},
      {instance_id: 'g', part_id: 'gripper', local_pose: pose()},
    ],
    connections: [
      ...chassisConnections(),
      {parent_instance_id: 'c', parent_point_id: 'mount_front', child_instance_id: 'j', child_point_id: 'in', joint: 'revolute'},
      {parent_instance_id: 'j', parent_point_id: 'out', child_instance_id: 'b', child_point_id: 'end_b', joint: 'fixed'},
      {parent_instance_id: 'b', parent_point_id: 'end_a', child_instance_id: 'g', child_point_id: 'mount', joint: 'fixed'},
    ],
  };
}
