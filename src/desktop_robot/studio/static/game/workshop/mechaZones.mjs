/**
 * 机甲装配区域：由零件 ID / 连接点推断所属区域。
 */

export const MECHA_ZONES = Object.freeze([
  'core',
  'head',
  'torso',
  'shoulder_l',
  'shoulder_r',
  'arm',
  'chassis',
  'backpack',
  'weapon',
]);

export const PART_ZONE = Object.freeze({
  core: 'core',
  mecha_head: 'head',
  armor_torso: 'torso',
  armor_shoulder: 'shoulder_l',
  mecha_leg: 'chassis',
  backpack_frame: 'backpack',
  thruster_pack: 'backpack',
  winch_module: 'backpack',
  weapon_rifle: 'weapon',
  heavy_plate: 'torso',
  plate: 'chassis',
  wheel: 'chassis',
  revolute_joint: 'arm',
  prism_joint: 'arm',
  beam: 'arm',
  gripper: 'arm',
  pusher: 'arm',
  hook: 'arm',
  battery: 'backpack',
  camera: 'head',
  display: 'head',
});

const SLOT_ZONE = Object.freeze({
  slot_head: 'head',
  slot_shoulder_l: 'shoulder_l',
  slot_shoulder_r: 'shoulder_r',
  slot_backpack: 'backpack',
  slot_hip: 'chassis',
  mount_front: 'torso',
  mount_bottom: 'chassis',
  mount_left: 'chassis',
  mount_right: 'chassis',
  mount_back: 'backpack',
  mount_top: 'head',
});

/**
 * @param {string} partId
 * @param {string} [parentPointId]
 */
export function zoneForPart(partId, parentPointId) {
  if (parentPointId && SLOT_ZONE[parentPointId]) return SLOT_ZONE[parentPointId];
  return PART_ZONE[partId] || 'core';
}

/**
 * @param {object} bp
 * @returns {Record<string, string[]>} zone -> instance ids
 */
export function groupInstancesByZone(bp) {
  const byChild = new Map();
  for (const c of bp?.connections || []) {
    byChild.set(c.child_instance_id, c.parent_point_id);
  }
  const groups = Object.fromEntries(MECHA_ZONES.map((z) => [z, []]));
  for (const inst of bp?.instances || []) {
    const zone = zoneForPart(inst.part_id, byChild.get(inst.instance_id));
    if (!groups[zone]) groups[zone] = [];
    groups[zone].push(inst.instance_id);
  }
  return groups;
}

/**
 * 驾驶视野：从 core 前方看，粗检躯干甲是否可能挡视线。
 * @returns {{ok:boolean, reason:string}}
 */
export function cockpitViewHint(bp) {
  const ids = new Set((bp?.instances || []).map((i) => i.part_id));
  if (ids.has('heavy_plate') && ids.has('armor_torso')) {
    return {ok: false, reason: '重甲板+躯干甲叠装，驾驶视野可能被挡——编辑时请开视野预览确认'};
  }
  if (ids.has('mecha_head')) {
    return {ok: true, reason: '头罩已装，驾驶舱视野基线可用'};
  }
  return {ok: true, reason: '未装头罩：视野开阔但缺少传感轮廓'};
}
